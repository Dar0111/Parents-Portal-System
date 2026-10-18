const { Server } = require('socket.io');
const pool = require('./config/db');
const { verifyToken } = require('./utils/jwt');
const { corsOriginsFromEnv } = require('./utils/corsOrigins');
const policy = require('./utils/policy');
const gates = require('./utils/accountGates');
const { DB_UNAVAILABLE_BODY } = require('./utils/dbUnavailable');

// A refused handshake reaches the client as `connect_error`, with `data` beside
// the message (Socket.io's own field for it).
function refusal(message, code) {
  const error = new Error(message);
  error.data = { code };
  return error;
}

// THE HANDSHAKE ASKS WHAT middleware/auth.js ASKS (fix/socket-handshake,
// 2026-10-11): the restore cutoff and the token's version, in its order and
// with its sentences, so a token the REST API answers 401 cannot open a live
// channel either. Exported for test:socket-auth, which runs it on a stubbed
// pool beside the HTTP middleware.
//
// TWO TRIES, for the same reason as there (fix/auth-503): a token that fails
// to verify is the caller's, and a throw while reading the database is the
// server's. One try around both reported a database error as "Invalid or
// expired token."; it now says "Database unreachable." (the health body's
// words) with its own code. Neither app branches on the text — both only
// show the LiveStatus strip — so no client changes with it.
//
// A missing users row keeps "Account is not active." here (the HTTP API says
// "User not found."): the handshake's sentences stay what they were.
async function authenticateHandshake(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required.'));
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return next(new Error('Invalid or expired token.'));
  }

  try {
    // The restore cutoff (CLAUDE.md → RESTORE): NULL until the first
    // restore, so a no-op until then.
    const [stateRows] = await pool.query('SELECT token_valid_after FROM auth_security_state WHERE id = 1 LIMIT 1');
    const tokenValidAfter = stateRows[0]?.token_valid_after;
    if (tokenValidAfter && decoded.iat * 1000 < new Date(tokenValidAfter).getTime()) {
      return next(new Error('Session invalidated by a database restore. Please log in again.'));
    }

    const accepted = policy.acceptedCountSql('users.id');
    const [rows] = await pool.query(
      `SELECT id, role, status, token_version, must_change_password, email, email_verified_at,
              contact_number, contact_verified_at, ${accepted.sql} AS policy_accepted
       FROM users WHERE id = ? LIMIT 1`,
      [...accepted.params, decoded.id]
    );
    const user = rows[0];

    if (!user || user.status !== 'active') {
      return next(new Error('Account is not active.'));
    }

    // Per-user revocation (API_REFERENCE §5b): a password change, a reset or
    // a temporary password bumps the version, and a missing `v` reads as 0.
    if ((decoded.v || 0) !== Number(user.token_version || 0)) {
      return next(new Error('Your password was changed. Please log in again.'));
    }

    // THE SAME THREE GATES AS middleware/auth.js, from the same module and in
    // the same order (feat/first-signin, 2026-10-18): consent, then a
    // confirmed Gmail or mobile number, then the forced password change. An
    // account with any of them pending gets no live channel — the socket would
    // carry notification counts and message events the HTTP API refuses it.
    // No path is allowed through here: the handshake is not one of the
    // gates' paths. The sentence and the code are the HTTP 403's, of the
    // FIRST pending gate. Neither app connects before all three are done
    // (FRONTEND §29, MOBILE M26), and a refused handshake is not retried: the
    // client connects afresh once /auth/me says all three are clear.
    const gate = gates.pendingGate(user, decoded.iat);
    if (gate) {
      const { message, code } = gates.refusal(gate);
      return next(refusal(message, code));
    }

    socket.userId = user.id;
    return next();
  } catch (error) {
    // Everything in this block is database work on fixed SQL, so a throw
    // here is the connection, never the caller.
    console.error('Socket handshake: database unreachable:', error && error.message ? error.message : error);
    return next(refusal(DB_UNAVAILABLE_BODY.message, 'DB_UNAVAILABLE'));
  }
}

// Authenticates the socket connection itself, once, at connect time — not
// per event. A rejected or later-deactivated user never gets a live socket
// in the first place; there is no per-event re-check because there is no
// per-event auth to re-check (matches "reject at connection time, not per
// event").
//
// `origins` is the SAME list the HTTP API uses (server.js reads it once from
// CORS_ORIGIN via utils/corsOrigins.js — a comma-separated list, never a
// wildcard). Read here too when a caller passes none, so the two cannot
// disagree.
function initSocket(httpServer, origins = corsOriginsFromEnv()) {
  const io = new Server(httpServer, {
    cors: {
      origin: origins,
      credentials: true,
    },
  });

  io.use(authenticateHandshake);

  io.on('connection', (socket) => {
    // One room per user. Sending a message emits to this room only — see
    // routes/messages.js. Never io.emit() — that would broadcast to every
    // connected socket regardless of who the message is for.
    socket.join(`user:${socket.userId}`);
  });

  return io;
}

module.exports = { initSocket, authenticateHandshake };
