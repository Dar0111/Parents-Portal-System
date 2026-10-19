// Read-only MySQL source connections.
//
// EVERY connection this package opens to the application database is put in
// READ ONLY mode at the session level and reads in the UTC session time zone:
//   - SET SESSION TRANSACTION READ ONLY  — a stray INSERT/UPDATE is refused by
//     the server itself (ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION)
//   - SET time_zone = '+00:00'           — TIMESTAMP columns render as UTC
//     wall-clock, so the transfer appends '+00:00' and the instant is exact.
//     The source server's own zone is SYSTEM (UTC+8, no DST); mysqldump's
//     default --tz-utc does the same conversion for the snapshot file.
//   - dateStrings: true                  — DATE, DATETIME and TIMESTAMP all
//     arrive as strings; no JS Date is ever constructed on the way out.
//   - DECIMAL stays a string, BIGINT aggregates come back as numbers.
//
// The one exception is scratch(): a connection to an ISOLATED database this
// package created itself (the snapshot restore check, the MySQL side of the
// semantics matrix). It refuses to open against the application database.
const { dep } = require('./deps');
const { sourceConfig } = require('./env');

const mysql = dep('mysql2/promise');

async function readOnly(overrides = {}) {
  const cfg = sourceConfig();
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: overrides.database || cfg.database,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    timezone: 'Z',
  });
  await conn.query("SET time_zone = '+00:00'");
  await conn.query('SET SESSION TRANSACTION READ ONLY');
  return conn;
}

async function scratch(database) {
  const cfg = sourceConfig();
  if (!database || database === cfg.database) {
    throw new Error('scratch() needs the name of an isolated database, never the application database.');
  }
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database,
    dateStrings: true,
    supportBigNumbers: true,
    multipleStatements: false,
    timezone: 'Z',
  });
  await conn.query("SET time_zone = '+00:00'");
  return conn;
}

// A connection with NO database selected, for CREATE DATABASE / DROP DATABASE
// of an isolated scratch database. The caller must still never name the
// application database; dropScratch() enforces it.
async function admin() {
  const cfg = sourceConfig();
  return mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
}

async function dropScratch(conn, database) {
  const cfg = sourceConfig();
  if (!/^parents_portal_mig/.test(database) || database === cfg.database) {
    throw new Error(`Refusing to drop ${database}: not a scratch database of this package.`);
  }
  await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
}

module.exports = { readOnly, scratch, admin, dropScratch, sourceConfig };
