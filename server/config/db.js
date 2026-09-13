require('dotenv').config();

const mysql = require('mysql2/promise');

function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parents_portal',
    waitForConnections: true,
    connectionLimit: 10,
    // DATE columns only — not DATETIME/TIMESTAMP (created_at/updated_at keep
    // returning as JS Date objects, unchanged). Without this, mysql2 builds a
    // Date at local midnight for a DATE value, and res.json()'s JSON.stringify
    // calls Date#toJSON() -> toISOString(), which converts to UTC: a DATE of
    // 2026-08-29 read back at UTC+8 becomes "2026-08-28T16:00:00.000Z" — a
    // full calendar day off, wrong every single time in this timezone, not an
    // edge case. dateStrings: ['DATE'] makes mysql2 return the raw
    // 'YYYY-MM-DD' string straight from MySQL instead, so no Date object (and
    // therefore no timezone conversion) is ever constructed for these columns
    // — the value round-trips as the exact string it was written as. Affects
    // attendance.date, events.event_date,
    // students.birthday (and excuse_letters.absence_date once that module is
    // built) via every query on the shared pool with no per-query changes.
    dateStrings: ['DATE'],
  });
}

let currentPool = createPool();

// Exported as a stable object whose methods proxy to whatever the current
// underlying pool is, rather than the pool object itself. Every existing
// `const pool = require('../config/db')` across the codebase only ever
// calls .query() or .getConnection() (confirmed by grepping every call
// site before this restructure) — both keep working unchanged.
//
// resetPool() exists for exactly one caller: POST /api/backups/:id/restore.
// A DROP DATABASE + CREATE DATABASE mid-restore leaves any pooled
// connections' "current database" context pointing at a database that
// briefly didn't exist — the next query on one of those connections can
// fail unpredictably. Reassigning module.exports here wouldn't help:
// every file that already did `const pool = require(...)` holds a direct
// reference to the old object, not a live binding, so a later
// `module.exports = newPool` would never reach them. Swapping the
// internal `currentPool` the proxy methods close over does.
module.exports = {
  query: (...args) => currentPool.query(...args),
  getConnection: (...args) => currentPool.getConnection(...args),
  async resetPool() {
    const old = currentPool;
    currentPool = createPool();
    await old.end().catch(() => {
      // Best-effort — the new pool is already live regardless of whether
      // the old one's idle connections closed cleanly.
    });
  },
};
