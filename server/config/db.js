require('dotenv').config();

const fs = require('fs');
const { Pool, types } = require('pg');
const { isConnectionError } = require('../utils/dbErrors');

// THE DATABASE LAYER ON POSTGRESQL (Phase 3, commit F — migration/docs/03 §1,
// the owner's answers of 2026-10-25). One pool, one query adapter, one
// transaction helper, and the type contract of migration/docs/02 §B.
//
// CALL SITES KEEP `?` (the owner's Q1 (a)). toPg() below numbers them `$1, $2,
// …` at the driver, skipping quoted strings, quoted identifiers, dollar
// quotes and comments, so a shared SQL fragment (utils/teacherScope.js, the
// notifications visibility clause) and a list built at request time
// (routes/activityLogs.js) need no renumbering. The SQL DIALECT is still
// ported by hand at every site: this converts placeholders, nothing else.
//
// RESULTS ARE pg's: `const { rows } = await pool.query(…)`, a write's count
// is `result.rowCount` (matched rows — the meaning mysql2's default flags gave
// affectedRows, measured), and an inserted id comes from `RETURNING id`. There
// is no insertId and no tuple: a site still written for mysql2 fails loudly.

// ---------------------------------------------------------------------------
// TYPES — the JSON contracts, through the real driver
// ---------------------------------------------------------------------------
// DATE (1082): the 'YYYY-MM-DD' string, untouched — mysql2's
//   dateStrings: ['DATE'] job. Without it pg builds a JS Date at LOCAL
//   midnight and res.json() prints the day before at UTC+8.
// int8 (20): COUNT(*) and SUM(int) are bigint here; the API's counts and
//   page.total are JSON integers. A number when it fits 2^53, a throw when it
//   does not — never a silently rounded value.
// numeric (1700): left as pg's string, the shape mysql2 gave DECIMAL ('88.05').
// timestamptz (1184): pg's JS Date, so JSON prints the instant in ISO UTC as
//   mysql2's Date did. The schema has no plain `timestamp` column.
// Booleans: a SELECT expression such as `(a IS NOT NULL) AS has_value` is a
//   true/false here where MySQL gave 1/0. The one such column the routes read
//   (the grades lock read's has_value) is read through Number(); the stored
//   flags are smallint 0/1 and stay numbers (migration/docs/02, D-4).
types.setTypeParser(1082, (value) => value);
types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`bigint outside the JavaScript safe range (${String(value).length} digits)`);
  }
  return n;
});

// ---------------------------------------------------------------------------
// SETTINGS — the PG_* keys, from the process environment (or server/.env)
// ---------------------------------------------------------------------------
//   PG_HOST, PG_PORT, PG_DATABASE           where (default 127.0.0.1:5432/postgres)
//   PG_USER, PG_PASSWORD                    the runtime role, portal_app (through
//                                           Supabase's Session pooler the user
//                                           name is portal_app.<project ref>)
//   PG_MIGRATE_USER, PG_MIGRATE_PASSWORD    the restore's own credential,
//                                           portal_migrate, the schema's owner —
//                                           read by the restore's one-off
//                                           connection (routes/backups.js,
//                                           migration/docs/04) and by db:setup;
//                                           never by the pool
//   PG_SSL                                  disable | require | verify-full;
//                                           default disable on a loopback host,
//                                           verify-full anywhere else
//   PG_CA_FILE                              the project's CA for verify-full
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

function sslOption(host) {
  const mode = String(process.env.PG_SSL || (LOOPBACK.has(host) ? 'disable' : 'verify-full')).toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  if (mode === 'verify-full') {
    const file = process.env.PG_CA_FILE;
    if (!file || !fs.existsSync(file)) {
      throw new Error('PG_SSL=verify-full needs PG_CA_FILE: the project CA certificate (Database Settings → SSL Configuration).');
    }
    return { rejectUnauthorized: true, ca: fs.readFileSync(file, 'utf8'), servername: host };
  }
  throw new Error(`PG_SSL must be disable, require or verify-full (got ${mode}).`);
}

function settings(which = 'runtime') {
  const host = process.env.PG_HOST || '127.0.0.1';
  const migrate = which === 'migrate';
  return {
    host,
    port: Number(process.env.PG_PORT) || 5432,
    database: process.env.PG_DATABASE || 'postgres',
    user: (migrate ? process.env.PG_MIGRATE_USER : process.env.PG_USER) || (migrate ? 'portal_migrate' : 'portal_app'),
    password: migrate ? process.env.PG_MIGRATE_PASSWORD : process.env.PG_PASSWORD,
    ssl: sslOption(host),
    application_name: migrate ? 'parents-portal-restore' : 'parents-portal-api',
    // A CONNECT TIMEOUT, as mysql2's 10 s connectTimeout gave (P3-C-R2, review
    // finding driver-2): node-postgres has none by default, so a host that
    // accepts and never answers held a request — and a pool slot — forever;
    // now it fails as "timeout exceeded when trying to connect", a connection
    // error (503, utils/dbErrors.js). In the POOL the same limit also caps the
    // wait for a free connection (mysql2's pool waited without one) — ten
    // busy connections for ten seconds answer 503 rather than queue on.
    connectionTimeoutMillis: 10000,
  };
}

// A CHECKED-OUT OR ONE-OFF CLIENT NEEDS ITS OWN 'error' LISTENER (P3-C-R2,
// review finding driver-1, measured by test:pg-driver): pg-pool removes its
// idle listener while a client is lent out, and node-postgres EMITS 'error'
// when the socket dies under an active query (a reset, a network drop — no
// FATAL message first). With no listener that is an uncaught exception and the
// API process exits; mysql2's connections always carried one. The query itself
// still rejects with the connection error, so the request answers 503 and the
// client is discarded on release.
const guarded = new WeakSet();
function guardClient(client, label = 'in use') {
  if (!guarded.has(client)) {
    guarded.add(client);
    client.on('error', (error) => {
      console.error(`PostgreSQL: a connection failed while ${label} and is discarded:`, error.code || error.message);
    });
  }
  return client;
}

// ---------------------------------------------------------------------------
// THE ADAPTER — `?` to `$n`, with the array guard
// ---------------------------------------------------------------------------
// An ARRAY may only be bound where the SQL casts it to an array type
// (`= ANY(?::int[])`, `?::text[]`, `?::portal.notification_type[]`): mysql2
// expanded `IN (?)` into a list, PostgreSQL does not, and a missed conversion
// must fail here rather than return wrong rows. A NESTED array (mysql2's
// `VALUES ?` bulk form) is refused the same way. The placeholder count must
// equal the parameter count — mysql2 tolerated a mismatch; this does not.
const ARRAY_CAST = /^\s*::\s*(?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?\s*\[\s*\]/;
const DOLLAR_TAG = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;

function scanQuoted(sql, start, quote, backslashEscapes) {
  let j = start + 1;
  while (j < sql.length) {
    if (backslashEscapes && sql[j] === '\\') {
      j += 2;
      continue;
    }
    if (sql[j] === quote) {
      if (sql[j + 1] === quote) {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j += 1;
  }
  throw new Error(`Unterminated ${quote === "'" ? 'string constant' : 'quoted identifier'} in SQL.`);
}

function toPg(sql, params = []) {
  if (typeof sql !== 'string') throw new TypeError('SQL text must be a string.');
  if (!Array.isArray(params)) throw new TypeError('Query parameters must be an array.');

  let text = '';
  let count = 0;
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "'") {
      // E'…' takes backslash escapes; a plain '…' does not (standard_conforming_strings).
      const escapes = i > 0 && (sql[i - 1] === 'E' || sql[i - 1] === 'e') && !(i > 1 && /[\w$]/.test(sql[i - 2]));
      const end = scanQuoted(sql, i, "'", escapes);
      text += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '"') {
      const end = scanQuoted(sql, i, '"', false);
      text += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '-' && next === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? n : nl;
      text += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '/' && next === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') {
          depth += 1;
          j += 2;
        } else if (sql[j] === '*' && sql[j + 1] === '/') {
          depth -= 1;
          j += 2;
        } else j += 1;
      }
      if (depth > 0) throw new Error('Unterminated comment in SQL.');
      text += sql.slice(i, j);
      i = j;
      continue;
    }
    if (ch === '$' && !(i > 0 && /[\w$]/.test(sql[i - 1]))) {
      const rest = sql.slice(i, i + 64);
      const tag = DOLLAR_TAG.exec(rest);
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length);
        if (close === -1) throw new Error('Unterminated dollar-quoted string in SQL.');
        text += sql.slice(i, close + tag[0].length);
        i = close + tag[0].length;
        continue;
      }
      if (/^\$\d/.test(rest)) {
        throw new Error('Write ? placeholders: config/db.js numbers them; a hand-written $n is refused.');
      }
    }
    if (ch === '?') {
      count += 1;
      const value = params[count - 1];
      if (Array.isArray(value)) {
        if (!ARRAY_CAST.test(sql.slice(i + 1, i + 120))) {
          throw new Error(
            `Parameter ${count} is an array: write = ANY(?::int[]) (or ::text[], ::portal.<enum>[]). mysql2's IN (?) expansion does not exist on PostgreSQL.`
          );
        }
        if (value.some((v) => Array.isArray(v))) {
          throw new Error(`Parameter ${count} is a nested array: write the VALUES rows out. mysql2's VALUES ? expansion does not exist on PostgreSQL.`);
        }
      }
      text += `$${count}`;
      i += 1;
      continue;
    }
    text += ch;
    i += 1;
  }

  if (count !== params.length) {
    throw new Error(`The SQL has ${count} placeholder(s) but ${params.length} parameter(s) were bound.`);
  }
  return { text, values: params };
}

// ---------------------------------------------------------------------------
// THE POOL
// ---------------------------------------------------------------------------
// Ten connections, as mysql2's connectionLimit was. A connection that dies
// while IDLE is reported and discarded — without an 'error' listener
// node-postgres would crash the process, which mysql2 never did.
//
// THE SEARCH PATH, ONCE PER CONNECTION, AWAITED. Every connection's first use
// sets it to the application schema (a role setting does the same on
// Supabase; this keeps a local or fresh role honest too). It is awaited at
// checkout rather than fired from the pool's 'connect' event: that event
// would queue a second query on a client already running one, which pg 8.23
// deprecates (measured by the commit F proof), and it works the same through
// any pooler because it is an ordinary statement.
const pool = new Pool({ ...settings('runtime'), max: 10 });

pool.on('error', (error) => {
  console.error('PostgreSQL pool: an idle connection failed and was discarded:', error.code || error.message);
});

const prepared = new WeakSet();

async function checkout() {
  const client = guardClient(await pool.connect());
  if (!prepared.has(client)) {
    try {
      await client.query('SET search_path TO portal, pg_catalog');
      prepared.add(client);
    } catch (error) {
      client.release(error);
      throw error;
    }
  }
  return client;
}

// ---------------------------------------------------------------------------
// ONE CHECKED-OUT CLIENT PER TRANSACTION
// ---------------------------------------------------------------------------
// connect() hands out one client wrapped with the same adapter, and the
// transaction verbs the routes already use (beginTransaction, commit,
// rollback, release). release() is safe to call twice and DISCARDS the
// connection instead of returning it to the pool when it failed at the
// connection level, or when it is released with a transaction still open —
// the server rolls that transaction back as the connection closes, and the
// next caller can never inherit an aborted transaction.
const TX_OPEN = /^\s*(BEGIN|START\s+TRANSACTION)\b/i;
const TX_CLOSE = /^\s*(COMMIT|ROLLBACK|END|ABORT)\s*;?\s*$/i;

class DbClient {
  constructor(client) {
    this.client = client;
    this.broken = null;
    this.inTransaction = false;
    this.released = false;
  }

  async query(sql, params) {
    const statement = toPg(sql, params);
    const opens = TX_OPEN.test(statement.text);
    const closes = TX_CLOSE.test(statement.text);
    try {
      const result = await this.client.query(statement);
      if (opens) this.inTransaction = true;
      if (closes) this.inTransaction = false;
      return result;
    } catch (error) {
      if (isConnectionError(error)) this.broken = error;
      // A failed COMMIT ends the transaction on PostgreSQL, as a ROLLBACK does.
      if (closes) this.inTransaction = false;
      throw error;
    }
  }

  beginTransaction() {
    return this.query('BEGIN');
  }

  commit() {
    return this.query('COMMIT');
  }

  rollback() {
    return this.query('ROLLBACK');
  }

  release() {
    if (this.released) return;
    this.released = true;
    const reason = this.broken || (this.inTransaction ? new Error('released with a transaction still open') : undefined);
    this.client.release(reason);
  }
}

async function connect() {
  return new DbClient(await checkout());
}

// BEGIN, fn(client), COMMIT — or ROLLBACK on any throw — and the client is
// released on every path. The callback's return value is the result.
async function withTransaction(fn) {
  const client = await connect();
  try {
    await client.beginTransaction();
    const result = await fn(client);
    await client.commit();
    return result;
  } catch (error) {
    if (client.inTransaction) {
      try {
        await client.rollback();
      } catch {
        // the connection is discarded by release() below
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

// One statement on a pooled connection. A connection-level failure discards
// the connection; a failed QUERY (a duplicate key, a CHECK) returns it.
async function query(sql, params) {
  const statement = toPg(sql, params);
  const client = await checkout();
  let failure;
  try {
    return await client.query(statement);
  } catch (error) {
    if (isConnectionError(error)) failure = error;
    throw error;
  } finally {
    client.release(failure);
  }
}

function end() {
  return pool.end();
}

// ---------------------------------------------------------------------------
// THE ONE SEARCH HELPER — case and accent folding without an extension
// ---------------------------------------------------------------------------
// The owner's Q5 (b), 2026-10-25. MySQL's utf8mb4_unicode_ci gave every
// `LIKE '%term%'` case AND accent folding for free, so "nino" found "Niño";
// PostgreSQL's ILIKE folds case only, and LIKE on a portal.ci column is
// 0A000 on PG 17 (migration/docs/02 §D). Both sides are folded the same way:
// NFC first (a decomposed "n + ~" becomes "ñ"), then lower() under the ICU
// root collation (full Unicode case mapping whatever the database's own
// collation is, and a deterministic collation so LIKE is allowed), then one
// translate() of the accented Latin letters to their bases. The term goes
// through the same three steps in JavaScript. `%` and `_` in the typed text
// stay wildcards, as they were on MySQL (02 §D, measured). The value is
// trimmed at the request boundary, by the caller.
//
// Use it for NAME search only. A login id is searched with
// `login_id COLLATE "und-x-icu" ILIKE ?` (the owner's Q5) — ids are ASCII.
const FOLD_PAIRS = [
  ['a', 'àáâãäåāăą'],
  ['c', 'çćĉċč'],
  ['d', 'ďđ'],
  ['e', 'èéêëēĕėęě'],
  ['g', 'ĝğġģ'],
  ['h', 'ĥħ'],
  ['i', 'ìíîïĩīĭįı'],
  ['j', 'ĵ'],
  ['k', 'ķ'],
  ['l', 'ĺļľŀł'],
  ['n', 'ñńņň'],
  ['o', 'òóôõöøōŏő'],
  ['r', 'ŕŗř'],
  ['s', 'śŝşšș'],
  ['t', 'ţťŧț'],
  ['u', 'ùúûüũūŭůűų'],
  ['w', 'ŵ'],
  ['y', 'ýÿŷ'],
  ['z', 'źżž'],
];
const FOLD_FROM = FOLD_PAIRS.map(([, from]) => from).join('');
const FOLD_TO = FOLD_PAIRS.map(([to, from]) => to.repeat([...from].length)).join('');
const FOLD_MAP = new Map(FOLD_PAIRS.flatMap(([to, from]) => [...from].map((ch) => [ch, to])));

// The SQL side: wrap a column or expression, e.g.
//   `${foldedSql("concat(s.first_name, ' ', s.last_name)")} LIKE ?`
function foldedSql(expression) {
  return `translate(lower(normalize(${expression}, NFC) COLLATE "und-x-icu"), '${FOLD_FROM}', '${FOLD_TO}')`;
}

// The JavaScript side of the same fold.
function foldText(value) {
  let out = '';
  for (const ch of String(value).normalize('NFC').toLowerCase()) out += FOLD_MAP.get(ch) ?? ch;
  return out;
}

// The bound value for a `foldedSql(…) LIKE ?` containment test.
function foldedContains(term) {
  return `%${foldText(term)}%`;
}

module.exports = { query, connect, withTransaction, end, toPg, settings, guardClient, foldedSql, foldText, foldedContains };
