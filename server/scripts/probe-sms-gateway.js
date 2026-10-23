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

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sms = require('../utils/smsTransport');

(async () => {
  console.log(`SMS_TRANSPORT: ${sms.SMS_MODE}`);
  const h = await sms.health();
  if (!h.reachable) {
    console.log(`reachable: no (${h.reason})`);
    process.exit(1);
  }
  console.log('reachable: yes');
  console.log(`http: ${h.httpStatus}`);
  console.log(`gateway status: ${h.status ?? 'not reported'}`);
  console.log(`app version: ${h.version ?? 'not reported'}`);
  const keys = Object.keys(h.checks);
  if (!keys.length) console.log('checks: none reported');
  for (const key of keys) {
    const c = h.checks[key];
    console.log(`  ${key}: ${c.status ?? '?'}${c.observed !== undefined ? ` (${c.observed})` : ''}`);
  }
  process.exit(h.httpStatus >= 200 && h.httpStatus < 300 ? 0 : 1);
})().catch((err) => {
  console.log(`reachable: no (${err.reason || 'unreachable'})`);
  process.exit(1);
});
