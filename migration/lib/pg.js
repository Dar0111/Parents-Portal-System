// node-postgres with the type parsers the application contract needs.
//
//   DATE (oid 1082)        -> the 'YYYY-MM-DD' string, untouched. Without this
//                             pg builds a JS Date at LOCAL midnight and
//                             res.json() would print a day early west of
//                             Greenwich — the exact defect config/db.js's
//                             dateStrings: ['DATE'] prevents on mysql2.
//   int8 (oid 20)          -> a JS number when it fits in 2^53, else a throw.
//                             COUNT(*) and SUM(int) are bigint in PostgreSQL;
//                             mysql2 hands those back as numbers, and
//                             `page.total` must stay a JSON integer.
//   numeric (oid 1700)     -> left as a STRING (pg's default) — the same shape
//                             mysql2 gives DECIMAL(5,2), which the web and
//                             phone depend on ('88.05').
//   timestamptz (1184)     -> pg's default JS Date; JSON prints the instant as
//                             an ISO UTC string, the same as mysql2's Date.
//   timestamp (1114)       -> deliberately NOT used by the schema.
//
// These are set on the pg `types` registry once per process, so a Pool and
// every Client created after require() share them. The application port will
// carry the same block in server/config/db.js.
const { dep } = require('./deps');

const pg = dep('pg');

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || Math.abs(n) > MAX_SAFE) {
    throw new Error(`bigint value out of the JavaScript safe range: ${v.length} digits`);
  }
  return n;
});

function pool(config) {
  return new pg.Pool({ ...config, max: 4, allowExitOnIdle: true });
}

async function client(config) {
  const c = new pg.Client(config);
  await c.connect();
  return c;
}

// Run `fn(client)` inside one transaction on ONE leased client (the rule the
// application port follows too): BEGIN, fn, COMMIT, ROLLBACK on throw, release.
async function withTransaction(p, fn) {
  const c = await p.connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await c.query('ROLLBACK');
    } catch {
      // the connection is released regardless
    }
    throw error;
  } finally {
    c.release();
  }
}

module.exports = { pg, pool, client, withTransaction };
