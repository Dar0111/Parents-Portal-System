require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const studentRoutes = require('./routes/students');
const sectionsRoutes = require('./routes/sections');
const { assignmentsRouter, subjectsRouter } = require('./routes/assignments');
const gradesRoutes = require('./routes/grades');
const gradingModesRoutes = require('./routes/gradingModes');
const attendanceRoutes = require('./routes/attendance');
const { announcementsRouter, memosRouter, eventsRouter } = require('./routes/content');
const contributionsRoutes = require('./routes/contributions');
const settingsRoutes = require('./routes/settings');
const backupsRoutes = require('./routes/backups');
const messagesRoutes = require('./routes/messages');
const excusesRoutes = require('./routes/excuses');
const { initSocket } = require('./socket');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Parents Portal API is running.' });
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
app.use('/api/contributions', contributionsRoutes);
app.use('/api/excuse-letters', excusesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/messages', messagesRoutes);

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
const io = initSocket(httpServer);
app.set('io', io);

httpServer.listen(PORT, () => {
  console.log(`Parents Portal API listening on http://localhost:${PORT}`);
});

module.exports = app;
