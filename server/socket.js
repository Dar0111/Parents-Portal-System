const { Server } = require('socket.io');
const pool = require('./config/db');
const { verifyToken } = require('./utils/jwt');

// Authenticates the socket connection itself, once, at connect time — not
// per event. A rejected or later-deactivated user never gets a live socket
// in the first place; there is no per-event re-check because there is no
// per-event auth to re-check (matches "reject at connection time, not per
// event").
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
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
