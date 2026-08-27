const pool = require('../config/db');

async function logActivity(userId, action, description) {
  await pool.query(
    'INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)',
    [userId || null, action, description || null]
  );
}

module.exports = { logActivity };
