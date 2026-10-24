// Is the SMS gateway reachable RIGHT NOW? (feat/sms-transport, 2026-09-29).
// Run before every check that could send a text — in the local-mode fallback
// the phone's IP can change with each hotspot session (the demo runs SMSGate
// in cloud mode since 2026-10-24).
//
//   npm run sms:probe
//
// READ-ONLY AND SENDS NOTHING: one GET /health through the same transport the
// server uses, with the same env (server/.env). It prints plain facts only —
// reachable yes/no, a FIXED failure reason, the gateway's own status and
// version, and whatever checks its /health reports (in local mode: battery,
// charging, cellular). NEVER the URL, the credentials or a number.
//
// A changed SMS_GATEWAY_URL needs the API restarted too: the server reads it
// once at startup, and `node --watch` does not watch .env.
//
// EXIT BY process.exitCode, NEVER process.exit() (B7, 2026-10-24): on Windows
// the probe printed its answer and then "Assertion failed:
// !(handle->flags & UV_HANDLE_CLOSING)" (src\win\async.c, line 76).
//
// THE CAUSE, MEASURED (feat/sms-e2e-code-purge, 2026-10-25 — B7's note named
// the wrong handle): Node bug nodejs/node#56645. On Windows, Node 24 before
// 24.20.0 (this machine runs 24.14.1) lets a V8 worker thread post a DELAYED
// task after the platform has closed the handle that delivers it. fetch
// (undici) parses HTTP with llhttp compiled to WebAssembly, and V8's wasm code
// caching posts exactly such a task. process.exit() does not wait for those
// compile jobs; a natural exit does (V8::Dispose runs before the platform
// shuts down), so exiting by process.exitCode already closes the route. Fixed
// upstream in Node 24.20.0 (nodejs/node#61999). On a local stub, with V8 flags
// that force the race, the old process.exit() shape crashed in 150 runs of
// 150 and this file in 0 of 150.
//
// A SECOND GUARD, just below: V8's wasm caching timeout is set to 0 before
// anything can fetch, so a finished compile caches at once instead of posting
// a delayed task — with it, even the old process.exit() shape crashed in 0 of
// 150. An assertion printed AFTER the answer never changes the answer above it.
require('v8').setFlagsFromString('--wasm-caching-timeout-ms=0');

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sms = require('../utils/smsTransport');

(async () => {
  console.log(`SMS_TRANSPORT: ${sms.SMS_MODE}`);
  const h = await sms.health();
  if (!h.reachable) {
    console.log(`reachable: no (${h.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('reachable: yes');
  console.log(`http: ${h.httpStatus}`);
  console.log(`gateway status: ${h.status ?? 'not reported'}`);
  console.log(`app version: ${h.version ?? 'not reported'}`);
  // feat/sms-e2e-code-purge: whether SMS_ENCRYPTION_PASSPHRASE is SET — on or
  // off, never the value. /health answers either way; a send does not without it.
  console.log(`  encryption: ${h.encryption ? 'on' : 'off (SMS_ENCRYPTION_PASSPHRASE is missing, so no text will be sent)'}`);
  const keys = Object.keys(h.checks);
  if (!keys.length) console.log('checks: none reported');
  for (const key of keys) {
    const c = h.checks[key];
    console.log(`  ${key}: ${c.status ?? '?'}${c.observed !== undefined ? ` (${c.observed})` : ''}`);
  }
  process.exitCode = h.httpStatus >= 200 && h.httpStatus < 300 ? 0 : 1;
})().catch((err) => {
  console.log(`reachable: no (${err.reason || 'unreachable'})`);
  process.exitCode = 1;
});
