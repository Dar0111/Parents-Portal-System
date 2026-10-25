/**
 * The suites' database connection on PostgreSQL (Phase 3, commit F).
 *
 * A suite's fixture or cleanup opens ONE connection, runs a few statements and
 * ends it — the shape mysql2's createConnection gave the HTTP suites. This
 * keeps that shape, a [first, fields] tuple, so a suite's assertions and its
 * cleanup bookkeeping stay as written, while every statement is real
 * PostgreSQL, ported by hand:
 *
 *   - `?` placeholders, numbered by config/db.js's toPg() with the same array
 *     guard as the API (`= ANY(?::int[])`, never `IN (?)`);
 *   - a statement that is not a write answers [rows, fields];
 *   - an INSERT, UPDATE or DELETE answers [{ affectedRows, insertId, rows },
 *     fields]. affectedRows is pg's rowCount — matched rows, the meaning
 *     mysql2's default flags gave it (measured, migration/docs/02 C.7).
 *     insertId is the id of the first row RETURNING gave; reading it from a
 *     statement without `RETURNING id` THROWS instead of answering undefined.
 *     changedRows has no PostgreSQL counterpart and throws: compare the
 *     values in the WHERE clause (IS DISTINCT FROM) and read affectedRows.
 *
 * The connection is the API's own role (portal_app, the same PG_* keys as
 * config/db.js), with the search path set to the application schema, and it
 * REFUSES any host but a loopback one: a suite writes fixtures, and no suite
 * may ever reach the hosted project — with ONE exception, at config() below. It also refuses settings passed in — the
 * MySQL-shaped config objects the suites used to build — so a suite that still
 * hands one over fails at once instead of half-working.
 */
const { Client } = require('pg');
const db = require('../../config/db');

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const WRITES = new Set(['INSERT', 'UPDATE', 'DELETE', 'MERGE']);

// THE ONE EXCEPTION (P3-C-R2 Phase L, the owner's approval of 2026-10-26, with
// its three conditions): the browser smoke against the STAGING project, whose
// fixture (client/e2e/auth.js) must stamp and put back its rows there. Allowed
// only when ALL hold: PORTAL_FIXTURE_HOSTED is exactly 'staging-smoke' — set
// by migration/scripts/staging-api.js --smoke in the smoke's own process and
// never written to a .env or any config file; the host is Supabase's session
// pooler; and TLS is verify-full (the chain checked against a CA). Anything
// else is refused as before — scripts/test-fixture-guard.js proves it.
const HOSTED_FLAG = 'PORTAL_FIXTURE_HOSTED';
const HOSTED_VALUE = 'staging-smoke';
const POOLER_HOST = /^[a-z0-9-]+\.pooler\.supabase\.com$/i;

function hostedSmokeAllowed(settings) {
  return (
    process.env[HOSTED_FLAG] === HOSTED_VALUE &&
    POOLER_HOST.test(String(settings.host || '')) &&
    Boolean(settings.ssl) &&
    settings.ssl.rejectUnauthorized === true &&
    Boolean(settings.ssl.ca)
  );
}

function config() {
  const settings = db.settings('runtime');
  if (!LOOPBACK.has(settings.host) && !hostedSmokeAllowed(settings)) {
    throw new Error('The suites connect only to a loopback PostgreSQL (PG_HOST); this one is not.');
  }
  return settings;
}

function writeHeader(result) {
  const rows = result.rows || [];
  return {
    affectedRows: result.rowCount,
    rows,
    get insertId() {
      if (!rows.length || rows[0].id === undefined) {
        throw new Error('insertId needs RETURNING id on the statement (PostgreSQL has no LAST_INSERT_ID).');
      }
      return rows[0].id;
    },
    get changedRows() {
      throw new Error('changedRows has no PostgreSQL counterpart: compare the values in the WHERE clause and read affectedRows.');
    },
  };
}

async function createConnection(settings) {
  if (settings !== undefined) {
    throw new Error('createConnection() takes no settings on PostgreSQL: the PG_* keys decide (test-helpers/db.js).');
  }
  const client = db.guardClient(new Client(config()), 'a suite fixture used it');
  await client.connect();
  await client.query('SET search_path TO portal, pg_catalog');
  return {
    async query(sql, params = []) {
      const result = await client.query(db.toPg(sql, params));
      return [WRITES.has(result.command) ? writeHeader(result) : result.rows, result.fields];
    },
    end() {
      return client.end();
    },
  };
}

// The suites' usual shape: open, run fn(conn), always end.
async function withDb(fn) {
  const conn = await createConnection();
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

module.exports = { createConnection, withDb, config, HOSTED_FLAG, HOSTED_VALUE };
