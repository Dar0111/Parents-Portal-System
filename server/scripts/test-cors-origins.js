/**
 * CORS_ORIGIN as a list (feat/lan-web, 2026-10-01) — a UNIT test: no
 * database, no running API. Drives utils/corsOrigins.js directly, then the
 * REAL `cors` middleware and the REAL socket.js `initSocket` on a throwaway
 * HTTP server on an ephemeral 127.0.0.1 port, sending Origin headers the way
 * a browser does.
 *
 * Proves: the default is kept when CORS_ORIGIN is unset or empty; a list is
 * trimmed, empties ignored, duplicates dropped; `*` and anything with a `*`
 * is NEVER accepted, even when configured; a non-origin (a path, a trailing
 * slash, no scheme, another scheme) is dropped and reported; an allowed
 * origin is echoed by the HTTP API AND the Socket.io handshake, a stray one
 * gets no Access-Control-Allow-Origin from either, and the header is never
 * `*`. Negative control: a naive split-on-comma parser is caught by the same
 * wildcard check.
 *
 * Usage: npm run test:cors-origins
 */
const http = require('http');
const express = require('express');
const cors = require('cors');
const { DEFAULT_ORIGINS, parseCorsOrigins, corsOriginsFromEnv } = require('../utils/corsOrigins');

let passed = 0;
let failed = 0;
function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const LOCAL = 'http://localhost:3000';
const LAN = 'http://192.168.137.1:3000';
const STRAY = 'http://evil.example:3000';

// The one check a parser must pass: nothing it accepts carries a wildcard.
const acceptsWildcard = (parse, raw) => parse(raw).some((o) => o.includes('*'));

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

async function run() {
  console.log('\nParents Portal — CORS_ORIGIN list (unit)\n');

  console.log('The default');
  assert(same(DEFAULT_ORIGINS, [LOCAL]), 'the default is http://localhost:3000');
  for (const raw of [undefined, '', '   ', ',', ' , , ']) {
    assert(same(parseCorsOrigins(raw).origins, [LOCAL]), `CORS_ORIGIN ${JSON.stringify(raw)} → the default`);
  }
  assert(same(parseCorsOrigins(LOCAL).origins, [LOCAL]), 'the old single value still works as before');

  console.log('\nA list');
  const list = parseCorsOrigins(` ${LOCAL} ,${LAN}, ,${LOCAL}`);
  assert(same(list.origins, [LOCAL, LAN]), 'trimmed, empties ignored, the duplicate dropped, order kept');
  assert(list.rejected.length === 0, 'nothing rejected');
  assert(same(parseCorsOrigins('https://portal.example').origins, ['https://portal.example']), 'https is fine');

  console.log('\nNever a wildcard');
  for (const raw of ['*', ` * `, `${LOCAL},*`, 'http://*.example.com', 'https://*', `*,${LAN}`]) {
    const r = parseCorsOrigins(raw);
    assert(!r.origins.some((o) => o.includes('*')), `${JSON.stringify(raw)} → no wildcard accepted (${r.origins.join(' ')})`);
    assert(r.rejected.some((x) => x.value.includes('*') && /wildcard/.test(x.reason)), `${JSON.stringify(raw)} → the wildcard is reported`);
  }
  assert(same(parseCorsOrigins('*').origins, [LOCAL]), '"*" alone falls back to the default, never to "allow all"');
  assert(same(parseCorsOrigins(`${LOCAL},*`).origins, [LOCAL]), 'a wildcard beside a real origin: only the real one');
  const naive = (raw) => raw.split(',').map((s) => s.trim()).filter(Boolean);
  assert(acceptsWildcard(naive, `${LOCAL},*`), 'NEGATIVE CONTROL: a naive split-on-comma parser accepts "*" — the check catches it');
  assert(!acceptsWildcard((raw) => parseCorsOrigins(raw).origins, `${LOCAL},*`), 'the real parser passes the same check');

  console.log('\nOnly bare origins');
  for (const [raw, why] of [
    [`${LOCAL}/`, 'a trailing slash'],
    [`${LOCAL}/app`, 'a path'],
    ['localhost:3000', 'no scheme'],
    ['ftp://192.168.137.1', 'another scheme'],
    ['not a url', 'not a URL'],
    ['http://user@localhost:3000', 'credentials in the URL'],
  ]) {
    const r = parseCorsOrigins(`${raw},${LAN}`);
    assert(same(r.origins, [LAN]) && r.rejected.length === 1, `${why} is dropped, the good entry kept`);
  }

  console.log('\nReported once at startup');
  const warnings = [];
  const fromEnv = corsOriginsFromEnv({ CORS_ORIGIN: `${LOCAL},*,${LOCAL}/x` }, { warn: (m) => warnings.push(m) });
  assert(same(fromEnv, [LOCAL]), 'corsOriginsFromEnv returns the accepted list');
  assert(warnings.length === 2 && warnings.every((w) => w.startsWith('CORS_ORIGIN: ignored')), 'one warning per ignored entry');

  console.log('\nThe real cors middleware (HTTP API)');
  const app = express();
  app.use(cors({ origin: parseCorsOrigins(`${LOCAL},${LAN},*`).origins, credentials: true }));
  app.get('/probe', (_req, res) => res.json({ ok: true }));
  const apiServer = http.createServer(app);
  const apiPort = await listen(apiServer);
  const call = async (origin, method = 'GET') => {
    const headers = { Origin: origin };
    if (method === 'OPTIONS') headers['Access-Control-Request-Method'] = 'GET';
    const res = await fetch(`http://127.0.0.1:${apiPort}/probe`, { method, headers });
    return { acao: res.headers.get('access-control-allow-origin'), creds: res.headers.get('access-control-allow-credentials') };
  };
  for (const origin of [LOCAL, LAN]) {
    const r = await call(origin);
    assert(r.acao === origin && r.creds === 'true', `GET from ${origin} → echoed, with credentials`);
    const p = await call(origin, 'OPTIONS');
    assert(p.acao === origin, `preflight from ${origin} → echoed`);
  }
  const stray = await call(STRAY);
  assert(stray.acao === null, 'GET from a stray origin → no Access-Control-Allow-Origin', `got ${stray.acao}`);
  const strayPre = await call(STRAY, 'OPTIONS');
  assert(strayPre.acao === null, 'preflight from a stray origin → none');
  assert(![stray.acao, strayPre.acao].includes('*'), 'the header is never "*"');
  await new Promise((resolve) => apiServer.close(resolve));

  console.log('\nThe real socket.js (Socket.io handshake)');
  const { initSocket } = require('../socket');
  const ioServer = http.createServer();
  const io = initSocket(ioServer, parseCorsOrigins(`${LOCAL},${LAN},*`).origins);
  const ioPort = await listen(ioServer);
  const handshake = async (origin) => {
    const res = await fetch(`http://127.0.0.1:${ioPort}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: origin } });
    return res.headers.get('access-control-allow-origin');
  };
  assert((await handshake(LAN)) === LAN, 'the LAN origin is allowed to open the socket');
  assert((await handshake(LOCAL)) === LOCAL, 'localhost is still allowed');
  const strayIo = await handshake(STRAY);
  assert(strayIo === null || strayIo === undefined, 'a stray origin gets no Access-Control-Allow-Origin on the handshake', `got ${strayIo}`);
  await new Promise((resolve) => io.close(() => resolve()));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
