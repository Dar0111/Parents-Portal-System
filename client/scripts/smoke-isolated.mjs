// THE SMOKE SWEEP AGAINST AN API THAT IS NOT UNDER `--watch` (pre-Stage-5
// #3b, 2026-09-25).
//
// The dev API is `node --watch server.js`, and the one smoke failure that ever
// reproduced (SMOKE-1, UI-C1b) was the FIRST request of a fresh browser
// process refused at `/auth/me` while both servers were demonstrably bound.
// Four sweeps against an API started WITHOUT --watch passed 4/4 (2026-09-25),
// so the working cause is the watcher, and this is the procedural fix: a
// sweep that owns its own two servers, on ports nobody else uses.
//
// WHAT IT NEVER TOUCHES: 5000 and 3000. docs/TESTING.md says the smoke does
// not start servers, because a harness that starts the API will one day kill
// one somebody was using — the process on 5000 owns the dev database, a
// socket server and whatever MAIL_TRANSPORT it was launched with. That reason
// does not apply to ports THIS script opened, so it starts an API on 5001 and
// a Vite on 3001, kills exactly those two trees afterwards, and proves it by
// LISTING the ports — a kill's exit code is not the proof (CLAUDE.md →
// working agreement).
//
// WHY A SCRIPT AND NOT A RUN-BOOK: neither package has cross-env, so
// `PORT=5001 node server.js` differs between cmd, PowerShell and bash. A Node
// launcher is shell-agnostic, and the env it passes is the env that counts:
// dotenv does not override a variable that is already set, so the server's
// `.env` PORT=5000 loses to the 5001 set here.
//
// Credentials: none here. playwright.config.js loads client/e2e/.env.e2e
// itself; this script only sets the two ORIGIN variables, and values are
// never printed (the same rule as e2e/auth.js).
//
// Run:  npm run smoke:isolated
//       npm run smoke:isolated -- --headed   (forwarded to playwright)

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_DIR = path.resolve(CLIENT_DIR, '..', 'server');

const API_PORT = 5001;
const APP_PORT = 3001;
// The API is polled and addressed on 127.0.0.1 (Node on Windows resolves
// `localhost` to ::1 first — the ECONNRESET lesson in e2e/auth.js) while the
// app is addressed on `localhost`, because Vite binds ::1 only and the
// browser's origin must equal the one CORS allows. Same split as e2e/auth.js.
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
const APP_ORIGIN = `http://localhost:${APP_PORT}`;

const children = [];

function start(name, cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  child.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  child.on('exit', (code) => console.log(`[${name}] exited (${code})`));
  children.push({ name, child });
  return child;
}

async function waitFor(name, url, attempts = 40, gapMs = 500) {
  let last = 'no attempt made';
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err.message;
    }
    await new Promise((r) => setTimeout(r, gapMs));
  }
  throw new Error(`${name} did not answer at ${url} after ${attempts} tries (last: ${last})`);
}

// Kill the whole tree, not the top process: `vite` forks esbuild, and a
// `child.kill()` on Windows leaves the child holding the port.
function killTree({ name, child }) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
  console.log(`[launcher] stopped ${name} (pid ${child.pid})`);
}

// The proof that the kill worked: what is LISTENING on the two ports now.
function listPorts() {
  const out =
    process.platform === 'win32'
      ? spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout
      : spawnSync('sh', ['-c', `lsof -nP -iTCP:${API_PORT} -iTCP:${APP_PORT} -sTCP:LISTEN || true`], { encoding: 'utf8' }).stdout;
  const lines = (out || '')
    .split(/\r?\n/)
    .filter((l) => /LISTEN/i.test(l) && (l.includes(`:${API_PORT} `) || l.includes(`:${APP_PORT} `)));
  console.log(`[launcher] listeners on ${API_PORT}/${APP_PORT} after shutdown: ${lines.length === 0 ? 'none' : ''}`);
  for (const l of lines) console.log(`  ${l.trim()}`);
  return lines.length;
}

async function main() {
  // Refuse to start on a port already in use rather than pointing the sweep
  // at whatever is there.
  for (const [name, url] of [
    ['an API', `${API_ORIGIN}/api/health`],
    ['a Vite', APP_ORIGIN],
  ]) {
    try {
      await fetch(url);
      throw new Error(`${name} is already answering at ${url}; this script only sweeps servers it started.`);
    } catch (err) {
      if (!/ECONNREFUSED|fetch failed/.test(err.message)) throw err;
    }
  }

  const node = process.execPath;
  start('api', node, ['server.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(API_PORT), CORS_ORIGIN: APP_ORIGIN },
  });
  start('vite', node, [path.join('node_modules', 'vite', 'bin', 'vite.js'), '--port', String(APP_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    env: { ...process.env, VITE_API_BASE_URL: `http://localhost:${API_PORT}/api` },
  });

  let exitCode = 1;
  try {
    await waitFor('The isolated API', `${API_ORIGIN}/api/health`);
    await waitFor('The isolated Vite', APP_ORIGIN);
    console.log(`[launcher] both up — API ${API_ORIGIN} (no --watch), app ${APP_ORIGIN}; running the sweep`);

    const extra = process.argv.slice(2);
    const pw = spawn(node, [path.join('node_modules', '@playwright', 'test', 'cli.js'), 'test', ...extra], {
      cwd: CLIENT_DIR,
      stdio: 'inherit',
      env: { ...process.env, E2E_APP_ORIGIN: APP_ORIGIN, E2E_API_ORIGIN: API_ORIGIN },
    });
    exitCode = await new Promise((resolve) => pw.on('exit', (code) => resolve(code ?? 1)));
  } finally {
    for (const entry of children) killTree(entry);
    await new Promise((r) => setTimeout(r, 1000));
    const left = listPorts();
    if (left > 0 && exitCode === 0) exitCode = 2;
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`[launcher] ${err.message}`);
  for (const entry of children) killTree(entry);
  listPorts();
  process.exit(1);
});
