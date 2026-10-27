require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const pool = require('./config/db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const studentRoutes = require('./routes/students');
const sectionsRoutes = require('./routes/sections');
const { assignmentsRouter, subjectsRouter } = require('./routes/assignments');
const gradesRoutes = require('./routes/grades');
const gradingModesRoutes = require('./routes/gradingModes');
const attendanceRoutes = require('./routes/attendance');
const { announcementsRouter, memosRouter, eventsRouter } = require('./routes/content');
const settingsRoutes = require('./routes/settings');
const backupsRoutes = require('./routes/backups');
const messagesRoutes = require('./routes/messages');
const excusesRoutes = require('./routes/excuses');
const notificationsRoutes = require('./routes/notifications');
const dashboardRoutes = require('./routes/dashboard');
const policyRoutes = require('./routes/policy');
const activityLogsRoutes = require('./routes/activityLogs');
const { initSocket } = require('./socket');
const { ensureAvatarDir } = require('./utils/profilePhoto');
const { corsOriginsFromEnv } = require('./utils/corsOrigins');

const app = express();
const PORT = process.env.PORT || 5000;

// BEHIND NGINX ON THE SAME HOST, so req.ip is the real client and not the
// proxy. It keys the sign-in throttle and the one-time-code limits
// (utils/loginThrottle.js, utils/authCodes.js, routes/auth.js) and it is
// stored in login_attempts.ip; without this every hosted request would count
// as 127.0.0.1 and the per-IP limits — 100 failed sign-ins and 10 codes an
// hour — would be shared by everyone at once.
//
// 'loopback', not a hop count: only 127.0.0.1 and ::1 are trusted to have
// written X-Forwarded-For, so a header forged by a client reaching the API
// any other way is ignored. With no proxy in front (the laptop) this changes
// nothing — req.ip is already the direct peer.
app.set('trust proxy', 'loopback');

// CORS_ORIGIN is a comma-separated list (utils/corsOrigins.js) — the laptop's
// localhost and the LAN address a phone's Chrome uses, never a wildcard. The
// SAME list goes to Socket.io (socket.js), read once here at startup.
const allowedOrigins = corsOriginsFromEnv();
// `Content-Disposition` is EXPOSED (feat/activity-log, the owner's Q9.4) so
// the web reads a download's file name from the server, its one source —
// cross-origin, a browser hides every header not named here.
app.use(cors({ origin: allowedOrigins, credentials: true, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// THE UPLOADS MOUNT (hardened, feat/profile-photos, 2026-09-30). Unauthenticated
// on purpose: an <img> cannot send the bearer token. What is under it is
// profile photos only — `uploads/avatars/<32 random hex>.jpg`, re-encoded by
// sharp, named by utils/profilePhoto.js — so a name is the access key and
// never contains a login id. No index file is served, a dotfile is refused
// rather than ignored, nothing is sniffed as another type, and a browser may
// cache a photo privately: a replaced or removed photo gets a new name or
// none, so a cached copy is never shown for a different picture.
ensureAvatarDir();
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    index: false,
    dotfiles: 'deny',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=86400');
    },
  })
);

// A HEALTH CHECK THAT CHECKS SOMETHING (pre-Stage-5 #2, o5). This returned a
// static 200 with the database down, which is the one condition a health
// probe exists to report. `SELECT 1` through the shared pool (config/db.js —
// PostgreSQL since Phase 3; the pool is never swapped: the PostgreSQL restore
// does not drop the database, migration/docs/04).
//
// The 200 body KEEPS `success: true` and the same message: sixteen HTTP
// suites preflight on `data.success`, and the smoke's `waitFor` polls this
// URL for `res.ok`. The 503 path cannot be exercised by a suite without
// stopping MySQL, and is stated as untested rather than faked.
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ success: true, message: 'Parents Portal API is running.', db: 'ok' });
  } catch (error) {
    console.error('Health check: database unreachable:', error.message);
    return res.status(503).json({ success: false, message: 'Database unreachable.' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/sections', sectionsRoutes);
app.use('/api/subjects', subjectsRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/grades', gradesRoutes);
app.use('/api/grading-modes', gradingModesRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/announcements', announcementsRouter);
app.use('/api/memos', memosRouter);
app.use('/api/events', eventsRouter);
app.use('/api/excuse-letters', excusesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/activity-logs', activityLogsRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// Express's app.listen() is sugar for http.createServer(app).listen() — done
// explicitly here so Socket.io can attach to the same underlying HTTP server
// instead of standing up a second one.
const httpServer = http.createServer(app);
const io = initSocket(httpServer, allowedOrigins);
app.set('io', io);

httpServer.listen(PORT, () => {
  console.log(`Parents Portal API listening on http://localhost:${PORT}`);
});

module.exports = app;
