const { Server } = require('socket.io');
const pool = require('./config/db');
const { verifyToken } = require('./utils/jwt');
const { corsOriginsFromEnv } = require('./utils/corsOrigins');
const policy = require('./utils/policy');

// A refused handshake reaches the client as `connect_error`, with `data` beside
// the message (Socket.io's own field for it).
function refusal(message, code) {
  const error = new Error(message);
  error.data = { code };
  return error;
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

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Authentication required.'));
      }

      const decoded = verifyToken(token);
      const accepted = policy.acceptedCountSql('users.id');
      const [rows] = await pool.query(
        `SELECT id, role, status, must_change_password, ${accepted.sql} AS policy_accepted
         FROM users WHERE id = ? LIMIT 1`,
        [...accepted.params, decoded.id]
      );
      const user = rows[0];

      if (!user || user.status !== 'active') {
        return next(new Error('Account is not active.'));
      }

      // THE SAME TWO GATES AS middleware/auth.js, in the same order (fix round
      // PF2, 2026-10-10): an account that must change its password, then a
      // parent with the CURRENT notice and terms not accepted, gets no live
      // channel — the socket would carry notification counts and message
      // events the HTTP API refuses it. The sentence and the code are the
      // HTTP 403's. Neither app connects before both are done (FRONTEND §29,
      // MOBILE M26), and a refused handshake is not retried: the client
      // connects afresh once /auth/me says both are clear.
      if (user.must_change_password) {
        return next(refusal('You must change your password before continuing.', 'MUST_CHANGE_PASSWORD'));
      }
      if (policy.isPending(user.role, user.policy_accepted)) {
        return next(
          refusal(
            'Please accept the Data Privacy Notice and the Terms of Use before continuing.',
            'POLICY_ACCEPTANCE_REQUIRED'
          )
        );
      }

      socket.userId = user.id;
      next();
    } catch (error) {
      next(new Error('Invalid or expired token.'));
    }
  });

  io.on('connection', (socket) => {
    // One room per user. Sending a message emits to this room only — see
    // routes/messages.js. Never io.emit() — that would broadcast to every
    // connected socket regardless of who the message is for.
    socket.join(`user:${socket.userId}`);
  });

  return io;
}

module.exports = { initSocket };
