/**
 * proof-backup-loop — the red-capable loop for the backup first-call reset
 * (fix/server-reliability, 2026-09-30). NOT a suite: it creates real backups
 * and must be run by hand, one arm at a time.
 *
 * What it does. It starts ITS OWN API on PORT (5001 by default — never the
 * 5000 dev server) either under `node --watch server.js` or plain
 * `node server.js`, and repeats health → admin login → POST /api/backups the
 * way the cleanup scripts did. Every run is classified as `complete`
 * (201 + row + size + "-- Dump completed on" footer), `reset` (the
 * connection died) or `http_<status>`.
 *
 * What it records, IN MEMORY (amendment A1 — name the trigger, do not
 * infer it):
 *   - every file-change event under server/ (recursive fs.watch, path + time),
 *   - the API child's stdout/stderr with timestamps (a `--watch` restart
 *     prints "Restarting 'server.js'"),
 *   - the listener pid on PORT before and after each backup, and on 5000
 *     at the start and the end (A3: did the dev API restart?).
 * For a reset it prints the file events and the server lines inside the
 * window around the request.
 *
 * Two modes (A2):
 *   --mode cold  start a fresh server for EACH run, then back up at once
 *   --mode idle  one server; wait --gap seconds before each run
 *
 * Cleanup of its OWN artifacts only (decision Q1, 2026-09-30): a complete
 * backup it created is deleted through DELETE /api/backups/:id; an orphan
 * .sql it created (a file that appeared during its run with no row) is
 * deleted by that exact name AFTER its size and footer are printed. Nothing
 * that existed before the run is touched.
 *
 * Usage (from server/):
 *   node scripts/proof-backup-loop.js --arm watch --mode cold --runs 10
 *   node scripts/proof-backup-loop.js --arm plain --mode idle --runs 20 --gap 30
 *   node scripts/proof-backup-loop.js --target-existing --arm watch --mode idle --runs 10 --gap 30
 *     (measures the ALREADY RUNNING API on 5000; stops at the first reset)
 */
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const SERVER_DIR = path.join(__dirname, '..');
require(path.join(SERVER_DIR, 'node_modules', 'dotenv')).config({ path: path.join(SERVER_DIR, '.env') });
const pool = require(path.join(SERVER_DIR, 'config', 'db'));

const BACKUP_DIR = path.join(SERVER_DIR, 'backups');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const ARM = arg('arm', 'watch');
const MODE = arg('mode', 'cold');
const RUNS = Number(arg('runs', 10));
const GAP = Number(arg('gap', 0));
// --target-existing (Darryl, 2026-09-30): measure an API that is ALREADY
// running — the 5000 dev server, where every real reset happened — instead
// of starting one. Nothing is spawned or killed, the server's own output is
// not visible (Darryl watches its terminal), mode is idle, and the loop
// STOPS at the first reset so the terminal can be captured at once.
const TARGET_EXISTING = process.argv.includes('--target-existing');
const PORT = Number(arg('port', TARGET_EXISTING ? 5000 : 5001));
const BASE = `http://127.0.0.1:${PORT}`;
if (!['watch', 'dev', 'plain'].includes(ARM) || !['cold', 'idle'].includes(MODE) || !(RUNS > 0)) {
  console.error('usage: --arm watch|dev|plain --mode cold|idle --runs N [--gap S] [--port P] [--touch <path>] [--target-existing]');
  process.exit(2);
}

// --touch <path, relative to server/> (Darryl, 2026-09-30): make the NAMED
// trigger happen on demand instead of waiting for NTFS to age an access
// time. Right before each backup, the file's ATIME is set to now with
// fs.utimesSync and its MTIME is put back to the original — the content is
// never opened. A hash taken at the start and the end proves it unchanged.
const TOUCH = arg('touch', null);
const TOUCH_PATH = TOUCH ? path.join(SERVER_DIR, TOUCH) : null;
const TOUCH_MTIME = TOUCH_PATH ? fs.statSync(TOUCH_PATH).mtime : null;
const hashOf = (file) => require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const TOUCH_HASH = TOUCH_PATH ? hashOf(TOUCH_PATH) : null;
if (TARGET_EXISTING && MODE !== 'idle') {
  console.error('--target-existing runs in idle mode only — it cannot start or stop the server');
  process.exit(2);
}
if (PORT === 5000 && !TARGET_EXISTING) {
  console.error('refusing to start a server on 5000 — use --target-existing to measure the running dev API');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const events = [];
const serverLog = [];

function listenerPid(port) {
  const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
    if (m && Number(m[1]) === port) return Number(m[2]);
  }
  return null;
}

let server = null;
// watch = the OLD dev command (`node --watch server.js`), dev = whatever
// package.json's "dev" script says NOW, plain = `npm start`.
function serverArgs() {
  if (ARM === 'watch') return ['--watch', 'server.js'];
  if (ARM === 'plain') return ['server.js'];
  const dev = require(path.join(SERVER_DIR, 'package.json')).scripts.dev;
  return dev.trim().split(/\s+/).slice(1);
}

function startServer() {
  const args = serverArgs();
  server = spawn(process.execPath, args, {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(PORT) },
    windowsHide: true,
  });
  const keep = (d) => {
    for (const line of String(d).split(/\r?\n/)) if (line.trim()) serverLog.push({ t: Date.now(), line: line.trim() });
  };
  server.stdout.on('data', keep);
  server.stderr.on('data', keep);
}

async function stopServer() {
  if (!server) return;
  try {
    execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    // already gone
  }
  server = null;
  for (let i = 0; i < 50 && listenerPid(PORT); i += 1) await sleep(100);
}

async function waitHealthy(timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (r.status === 200) return true;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  return false;
}

async function json(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function footerOf(file) {
  const size = fs.statSync(file).size;
  if (!size) return { size, footer: false };
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(Math.min(200, size));
  fs.readSync(fd, buf, 0, buf.length, size - buf.length);
  fs.closeSync(fd);
  return { size, footer: /-- Dump completed on/.test(buf.toString('utf8')) };
}

async function runOnce(i) {
  // The script shape the resets were seen in: health, login, backup.
  const health = await json(`${BASE}/api/health`).catch((e) => ({ status: `fail:${e.cause?.code || e.name}` }));
  const login = await json(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_id: 'ADMIN001', password: 'Admin@2026' }),
  }).catch((e) => ({ status: `fail:${e.cause?.code || e.name}`, body: {} }));
  const token = login.body?.token;

  const before = new Set(fs.readdirSync(BACKUP_DIR));
  const pidBefore = listenerPid(PORT);
  if (TOUCH_PATH) fs.utimesSync(TOUCH_PATH, new Date(), TOUCH_MTIME);
  const t0 = Date.now();
  let outcome;
  let detail = '';
  let created = null;
  try {
    const r = await json(`${BASE}/api/backups`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 201) {
      created = r.body.backup;
      const f = footerOf(path.join(BACKUP_DIR, created.filename));
      const [[row]] = await pool.query('SELECT id FROM backups WHERE id = ?', [created.id]);
      outcome = row && f.size > 100000 && f.footer ? 'complete' : 'incomplete_201';
      detail = `${created.filename} ${f.size}B footer=${f.footer}`;
    } else {
      outcome = `http_${r.status}`;
      detail = r.body.message || '';
    }
  } catch (err) {
    outcome = 'reset';
    detail = err.cause?.code || err.name;
  }
  const t1 = Date.now();

  // Let a restarting server come back, then read the pid again.
  await waitHealthy(15000);
  const pidAfter = listenerPid(PORT);

  // Own complete backup → through the API.
  if (created && token) {
    await json(`${BASE}/api/backups/${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
  // Own orphans → recorded, then deleted by exact name.
  const orphans = [];
  for (const f of fs.readdirSync(BACKUP_DIR).filter((x) => !before.has(x))) {
    if (created && f === created.filename) continue;
    const full = path.join(BACKUP_DIR, f);
    if (!fs.existsSync(full)) continue;
    const [[row]] = await pool.query('SELECT id FROM backups WHERE filename = ?', [f]);
    if (row) continue;
    const info = footerOf(full);
    orphans.push(`${f} ${info.size}B footer=${info.footer}`);
    fs.unlinkSync(full);
  }

  const win = (e) => e.t >= t0 - 3000 && e.t <= t1 + 3000;
  const fileHits = events.filter(win);
  const restarts = serverLog.filter((l) => win(l) && /restart/i.test(l.line));
  console.log(
    `run ${i}: ${outcome}${detail ? ` (${detail})` : ''} in ${t1 - t0}ms; health ${health.status}, login ${login.status}; ` +
      `pid ${pidBefore} -> ${pidAfter}${pidBefore !== pidAfter ? ' CHANGED' : ''}; file events in window ${fileHits.length}; restart lines ${restarts.length}` +
      (orphans.length ? `; own orphan(s) recorded then deleted: ${orphans.join(', ')}` : '')
  );
  // Every run's file events, not only a failed one's (Darryl, 2026-09-30),
  // so a reset's window can be compared with a clean run's.
  const seen = new Map();
  for (const e of fileHits) {
    const key = `${e.type} ${e.name}`;
    if (!seen.has(key)) seen.set(key, e.t - t0);
  }
  for (const [key, dt] of seen) console.log(`    file event @${dt >= 0 ? '+' : ''}${dt}ms: ${key}`);
  if (outcome !== 'complete') {
    for (const l of serverLog.filter(win)) console.log(`    server @${l.t - t0 >= 0 ? '+' : ''}${l.t - t0}ms: ${l.line.slice(0, 200)}`);
  }
  return { outcome, fileEvents: fileHits.length, pidChanged: pidBefore !== pidAfter };
}

(async () => {
  if (TARGET_EXISTING) {
    if (!listenerPid(PORT)) throw new Error(`nothing listens on ${PORT} — --target-existing needs the running API`);
  } else if (listenerPid(PORT)) {
    throw new Error(`something already listens on ${PORT}`);
  }
  const dev0 = listenerPid(5000);
  const watcher = fs.watch(SERVER_DIR, { recursive: true }, (type, name) => {
    events.push({ t: Date.now(), type, name: String(name) });
  });
  console.log(`proof-backup-loop: arm=${ARM} (node ${serverArgs().join(' ')}) mode=${MODE} runs=${RUNS} gap=${GAP}s port=${PORT}${TOUCH ? ` touch=${TOUCH}` : ''}; dev API on 5000 pid ${dev0}`);

  const results = [];
  try {
    if (MODE === 'idle' && !TARGET_EXISTING) {
      startServer();
      if (!(await waitHealthy())) throw new Error('the loop server never became healthy');
    }
    for (let i = 1; i <= RUNS; i += 1) {
      if (MODE === 'cold') {
        startServer();
        if (!(await waitHealthy())) throw new Error(`run ${i}: the loop server never became healthy`);
      } else if (GAP > 0) {
        await sleep(GAP * 1000);
      }
      const result = await runOnce(i);
      results.push(result);
      if (MODE === 'cold') await stopServer();
      if (TARGET_EXISTING && result.outcome === 'reset') {
        console.log(`STOPPED at run ${i}: a reset against the running API on ${PORT} — capture its terminal now.`);
        break;
      }
    }
  } finally {
    await stopServer();
    watcher.close();
  }
  const dev1 = listenerPid(5000);
  if (TOUCH_PATH) {
    const same = hashOf(TOUCH_PATH) === TOUCH_HASH && fs.statSync(TOUCH_PATH).mtime.getTime() === TOUCH_MTIME.getTime();
    console.log(`touched file ${TOUCH}: content and mtime ${same ? 'UNCHANGED' : 'CHANGED'}`);
  }
  const resets = results.filter((r) => r.outcome === 'reset').length;
  const other = results.filter((r) => r.outcome !== 'reset' && r.outcome !== 'complete').length;
  console.log(
    `TOTAL arm=${ARM} mode=${MODE} gap=${GAP}s: ${resets} resets / ${results.length} runs` +
      `${other ? `, ${other} other failures` : ''}; loop-server pid changes ${results.filter((r) => r.pidChanged).length}; ` +
      `dev API 5000 pid ${dev0} -> ${dev1}${dev0 !== dev1 ? ' (RESTARTED)' : ' (unchanged)'}`
  );
  process.exit(0);
})().catch(async (err) => {
  console.error('ABORTED:', err.message);
  await stopServer();
  process.exit(1);
});
