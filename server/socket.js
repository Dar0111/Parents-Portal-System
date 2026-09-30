const { Server } = require('socket.io');
const pool = require('./config/db');
const { verifyToken } = require('./utils/jwt');
const { corsOriginsFromEnv } = require('./utils/corsOrigins');

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
      const [rows] = await pool.query('SELECT id, status FROM users WHERE id = ? LIMIT 1', [decoded.id]);
      const user = rows[0];

      if (!user || user.status !== 'active') {
        return next(new Error('Account is not active.'));
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
