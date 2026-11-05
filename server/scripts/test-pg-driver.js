/**
 * test:pg-driver — the PostgreSQL driver foundation (Phase 3, P3-C-R2 Phase D).
 *
 * Runs against the DISPOSABLE local cluster only (the PG_* keys of the run;
 * a non-loopback host is refused before anything connects). It writes no row
 * of the application: every write is a TEMP table of the test's own
 * connection.
 *
 *   1. toPg: ? inside quotes, identifiers, E'' strings, dollar quotes and
 *      comments is left alone; a hand-written $n, an uncast array, a nested
 *      array and a count mismatch are refused
 *   2. nulls, typed and empty arrays; result and row-count contracts; the type
 *      parsers (DATE string, COUNT number, numeric string, timestamptz Date,
 *      an int8 beyond 2^53 refused)
 *   3. transactions: a throw rolls back and releases; a client released with a
 *      transaction open is discarded, never reused
 *   4. connections that DIE: an idle pooled connection terminated by the server
 *      and an ACTIVE one terminated mid-query — the process survives, the
 *      active query rejects as a connection error, the pool serves the next
 *      statement (review finding driver-1: a checked-out client had no
 *      'error' listener, so the second one crashed the API)
 *   5. connections that never come: a refused port is a connection error at
 *      once; a server that accepts and never answers is a connection error
 *      within the pool's connect timeout (review finding driver-2: with no
 *      timeout the request waited forever)
 *   6. the API process itself with its database unreachable: /api/health and
 *      an authenticated /api/auth/me answer 503 'Database unreachable.', never
 *      401
 */
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { Client } = require('pg');
const db = require('../config/db');
const { isConnectionError } = require('../utils/dbErrors');
const { signToken } = require('../utils/jwt');

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const throwsWith = (fn, re) => {
  try {
    fn();
    return false;
  } catch (e) {
    return re.test(String(e && e.message));
  }
};

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

async function main() {
  const settings = db.settings('runtime');
  if (!LOOPBACK.has(settings.host)) {
    console.log('test:pg-driver runs on a loopback cluster only.');
    process.exit(2);
  }
  console.log('\nParents Portal — PostgreSQL driver foundation\n');

  // 1 -----------------------------------------------------------------------
  console.log('toPg:');
  {
    const r = db.toPg("SELECT '?' AS a, \"q?\" AS b, E'\\'?' AS c, $$?$$ AS d, $t$?$t$ AS e, ? AS f -- ?\n /* ? /* ? */ */", [1]);
    check('? in a string, an identifier, an E-string, two dollar quotes and two comment forms is left alone; the one real ? is $1', r.text.split('$1').length === 2 && !/\$2/.test(r.text) && r.values.length === 1);
    check('a hand-written $1 is refused', throwsWith(() => db.toPg('SELECT $1', [1]), /hand-written \$n is refused/));
    check('an array without a ::type[] cast is refused', throwsWith(() => db.toPg('SELECT 1 WHERE id IN (?)', [[1, 2]]), /is an array/));
    check('an array WITH = ANY(?::int[]) passes', db.toPg('SELECT 1 WHERE id = ANY(?::int[])', [[1, 2]]).text.includes('$1::int[]'));
    check('a nested array is refused', throwsWith(() => db.toPg('SELECT 1 WHERE x = ANY(?::int[])', [[[1]]]), /nested array/));
    check('a placeholder count that differs from the parameters is refused', throwsWith(() => db.toPg('SELECT ?, ?', [1]), /2 placeholder\(s\) but 1 parameter/));
    check('an unterminated string is refused, not sent', throwsWith(() => db.toPg("SELECT 'x", []), /Unterminated/));
  }

  // 2 -----------------------------------------------------------------------
  console.log('\nparameters, results, types:');
  {
    const n = (await db.query('SELECT ?::int IS NULL AS n', [null])).rows[0].n;
    check('a null parameter with a cast', n === true);
    const empty = (await db.query('SELECT count(*) AS c FROM unnest(?::int[]) x', [[]])).rows[0].c;
    check('an EMPTY array is no rows, no error (mysql2 refused IN ())', empty === 0);
    const texts = (await db.query("SELECT 'b' = ANY(?::text[]) AS hit", [['a', 'b']])).rows[0].hit;
    check('a text array', texts === true);
    let nul = null;
    try {
      await db.query('SELECT ?::text AS t', ['a\u0000b']);
    } catch (e) {
      nul = e;
    }
    check('a NUL in a text parameter is refused by PostgreSQL (22021) — why routes/auth.js answers "no such account" for a login id holding one (review finding auth-1)', nul !== null && nul.code === '22021', nul ? nul.code : 'no error');
    const t = (await db.query("SELECT DATE '2026-12-31' AS d, count(*) AS c, 12.50::numeric(5,2) AS num, now() AS ts FROM (VALUES (1), (2)) v(x)")).rows[0];
    check('DATE is the YYYY-MM-DD string', t.d === '2026-12-31');
    check('COUNT is a JSON number', t.c === 2);
    check('numeric is the string mysql2 gave DECIMAL', t.num === '12.50');
    check('timestamptz is a JS Date', t.ts instanceof Date);
    let big = null;
    try {
      await db.query('SELECT 9007199254740993::int8 AS b');
    } catch (e) {
      big = e;
    }
    check('an int8 beyond 2^53 is refused, never rounded', big instanceof RangeError, big ? big.constructor.name : 'no error');
    const c = await db.connect();
    try {
      await c.query('CREATE TEMP TABLE zz_drv (id serial PRIMARY KEY, v int NOT NULL)');
      const ins = await c.query('INSERT INTO zz_drv (v) VALUES (?), (?) RETURNING id', [1, 2]);
      check('INSERT … RETURNING id: the ids, as numbers, and rowCount', ins.rowCount === 2 && ins.rows.every((r) => Number.isInteger(r.id)));
      check('there is no insertId (a mysql2 site fails loudly instead)', ins.insertId === undefined);
      const up = await c.query('UPDATE zz_drv SET v = v WHERE v = ?', [1]);
      check('UPDATE rowCount is the MATCHED rows, as mysql2 affectedRows was', up.rowCount === 1);
    } finally {
      c.release();
    }
  }

  // 3 -----------------------------------------------------------------------
  console.log('\ntransactions and release:');
  const killer = new Client(settings);
  await killer.connect();
  const openTx = async () => (await killer.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = 'parents-portal-api' AND state LIKE 'idle in transaction%'")).rows[0].n;
  {
    let thrown = null;
    try {
      await db.withTransaction(async (tx) => {
        await tx.query('CREATE TEMP TABLE zz_tx (v int) ON COMMIT DROP');
        await tx.query('INSERT INTO zz_tx VALUES (?)', [1]);
        throw new Error('on purpose');
      });
    } catch (e) {
      thrown = e;
    }
    check('withTransaction: the throw reaches the caller', thrown && thrown.message === 'on purpose');
    check('withTransaction: no transaction is left open on any pooled connection', (await openTx()) === 0);
    const c = await db.connect();
    await c.beginTransaction();
    const pid = (await c.query('SELECT pg_backend_pid() AS p')).rows[0].p;
    c.release();
    c.release();
    await sleep(300);
    const alive = (await killer.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = $1', [pid])).rows[0].n;
    check('release() twice is safe, and a client released with a transaction open is DISCARDED (its backend is gone)', alive === 0);
  }

  // 4 -----------------------------------------------------------------------
  console.log('\nconnections that die:');
  {
    await db.query('SELECT 1');
    const idle = (await killer.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = 'parents-portal-api' AND state = 'idle'")).rows[0].n;
    await killer.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'parents-portal-api' AND state = 'idle'");
    await sleep(500);
    check(`an IDLE pooled connection killed by the server (${idle}) is discarded and the pool serves the next statement`, (await db.query('SELECT 1 AS one')).rows[0].one === 1);

    const c = await db.connect();
    const pid = (await c.query('SELECT pg_backend_pid() AS p')).rows[0].p;
    const sleeping = c.query('SELECT pg_sleep(5)');
    sleeping.catch(() => {}); // handled from creation; the await below still gets the rejection (D-185)
    await sleep(400);
    await killer.query('SELECT pg_terminate_backend($1)', [pid]);
    let err = null;
    try {
      await sleeping;
    } catch (e) {
      err = e;
    }
    c.release();
    await sleep(300);
    check('an ACTIVE query whose connection is killed rejects as a connection error (503, not 500)', err !== null && isConnectionError(err), err ? `${err.code || ''} ${err.message}` : 'no error');
    check('the process survived the dead active connection, and the pool serves the next statement', (await db.query('SELECT 1 AS one')).rows[0].one === 1);

    // A SOCKET that dies under an active query — a network drop, no FATAL
    // message first (the server-side kill above sends one, and pg rejects the
    // query on it). A relay in this process forwards a child's connections to
    // the cluster and RESETS them mid-query; the child is the API's own
    // config/db.js, so a crash ends the child, not this test.
    const pairs = [];
    const relay = net.createServer((sock) => {
      const up = net.connect(settings.port, settings.host);
      sock.on('error', () => {});
      up.on('error', () => {});
      sock.pipe(up);
      up.pipe(sock);
      pairs.push({ sock, up });
    });
    await new Promise((resolve) => relay.listen(0, '127.0.0.1', resolve));
    const child = spawn(process.execPath, ['-e', `
      const db = require(${JSON.stringify(path.join(__dirname, '..', 'config', 'db'))});
      const { isConnectionError } = require(${JSON.stringify(path.join(__dirname, '..', 'utils', 'dbErrors'))});
      (async () => {
        const c = await db.connect();
        const q = c.query('SELECT pg_sleep(5)');
        console.log('ACTIVE');
        let out = {};
        try { await q; out.rejected = false; } catch (e) { out.rejected = true; out.connection = isConnectionError(e); }
        c.release();
        try { out.next = (await db.query('SELECT 1 AS one')).rows[0].one === 1; } catch (e) { out.next = false; out.next_connection_error = isConnectionError(e); }
        console.log('RESULT ' + JSON.stringify(out));
        await db.end();
      })();
    `], { env: { ...process.env, PG_HOST: '127.0.0.1', PG_PORT: String(relay.address().port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let cout = '';
    let cerr = '';
    child.stdout.on('data', (d) => {
      cout += d;
      if (/ACTIVE/.test(cout) && !child.resetDone) {
        child.resetDone = true;
        setTimeout(() => { for (const p of pairs) { p.sock.resetAndDestroy(); p.up.destroy(); } }, 400);
      }
    });
    child.stderr.on('data', (d) => { cerr += d; });
    const code = await new Promise((resolve) => {
      const guard = setTimeout(() => { child.kill(); resolve('hung'); }, 20000);
      child.on('close', (c) => { clearTimeout(guard); resolve(c); });
    });
    relay.close();
    const m = /RESULT (\{.*\})/.exec(cout);
    const res = m ? JSON.parse(m[1]) : null;
    check('a RESET socket under an active query does not crash the process (driver-1)', code === 0 && res !== null, `exit ${code}${/Unhandled 'error' event|uncaught/i.test(cerr) ? ', an unhandled error event' : ''}`);
    check('… the query rejects as a connection error (503, not 500)', res !== null && res.rejected === true && res.connection === true, JSON.stringify(res));
    check('… and the pool serves the next statement', res !== null && res.next === true, JSON.stringify(res));
  }
  await killer.end();

  // 5 -----------------------------------------------------------------------
  console.log('\nconnections that never come:');
  {
    // a separate process: config/db.js reads its PG_* keys once, at load
    const probe = (port) => new Promise((resolve) => {
      const child = spawn(process.execPath, ['-e', `
        const db = require(${JSON.stringify(path.join(__dirname, '..', 'config', 'db'))});
        const { isConnectionError } = require(${JSON.stringify(path.join(__dirname, '..', 'utils', 'dbErrors'))});
        const t0 = Date.now();
        db.query('SELECT 1').then(() => { console.log(JSON.stringify({ ok: true })); process.exit(0); },
          (e) => { console.log(JSON.stringify({ ok: false, connection: isConnectionError(e), ms: Date.now() - t0 })); process.exit(0); });
      `], { env: { ...process.env, PG_HOST: '127.0.0.1', PG_PORT: String(port) }, stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      const guard = setTimeout(() => { child.kill(); resolve({ hung: true }); }, 25000);
      child.on('close', () => { clearTimeout(guard); try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve({ unreadable: true }); } });
    });
    const refused = await new Promise((resolve) => {
      const s = net.createServer();
      s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    });
    const r1 = await probe(refused);
    check('a refused port is a connection error, at once', r1.ok === false && r1.connection === true && r1.ms < 5000, JSON.stringify(r1));
    const sockets = [];
    const silent = net.createServer((sock) => { sockets.push(sock); });
    await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const r2 = await probe(silent.address().port);
    for (const s of sockets) s.destroy();
    silent.close();
    check('a server that accepts and never answers is a connection error within the connect timeout (no request waits forever)', r2.ok === false && r2.connection === true && r2.ms < 15000, JSON.stringify(r2));
  }

  // 6 -----------------------------------------------------------------------
  console.log('\nthe API with its database unreachable:');
  {
    const refused = await new Promise((resolve) => {
      const s = net.createServer();
      s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    });
    const port = 5010;
    const api = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PG_HOST: '127.0.0.1', PG_PORT: String(refused), PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let started = false;
    api.stdout.on('data', (d) => { if (/listening/.test(String(d))) started = true; });
    api.stderr.on('data', () => {});
    for (let i = 0; i < 50 && !started; i += 1) await sleep(200);
    check('the API starts with its database unreachable', started);
    if (started) {
      const health = await fetch(`http://127.0.0.1:${port}/api/health`);
      const hb = await health.json().catch(() => ({}));
      check('GET /api/health is 503 "Database unreachable."', health.status === 503 && hb.message === 'Database unreachable.', `${health.status}`);
      const token = signToken({ id: 1, v: 0 });
      const me = await fetch(`http://127.0.0.1:${port}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      const mb = await me.json().catch(() => ({}));
      check('an authenticated GET /api/auth/me is 503 "Database unreachable." — never 401, the session is kept', me.status === 503 && mb.message === 'Database unreachable.', `${me.status}`);
    }
    api.kill();
  }

  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error('test:pg-driver failed:', e && e.message ? e.message : e);
  process.exit(1);
});
