/**
 * SMS transport + the contact-number rule — unit tests, no server, no
 * database, and NO REAL TEXT (feat/sms-transport, 2026-09-29).
 *
 * The gateway branch has no seam in a running server (the suites run the
 * server with SMS_TRANSPORT=file), so it is driven here through
 * createTransport() with an injected fake fetch — and once with the REAL
 * fetch against a port that refuses, for amendment A1: a refused connection
 * must leave no IP and no port in anything a caller could print.
 *
 * Usage: npm run test:sms-transport
 */
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const util = require('util');

// The module reads SMS_TRANSPORT at load. Force it OFF for this process so the
// default instance can never send; every test below builds its own.
delete process.env.SMS_TRANSPORT;
const sms = require('../utils/smsTransport');
const { CONTACT_RULE_MESSAGE, normalizeContact, validateContact, toE164 } = require('../utils/contactRule');

const crypto = require('crypto');
const smsEncryption = require('../utils/smsEncryption');

let passed = 0;
let failed = 0;
function assert(c, label, detail = '') {
  if (c) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// Everything printed to the console while `fn` runs.
async function captureConsole(fn) {
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.map(String).join(' '));
  try { return { value: await fn(), lines }; }
  catch (err) { return { error: err, lines }; }
  finally { Object.assign(console, orig); }
}

async function refusedPort() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  await new Promise((r) => server.close(r));
  return port;
}

const GATEWAY = { mode: 'gateway', url: 'http://gw.example.test:8080/', user: 'sms', pass: 'secret-pass' };

// The end-to-end passphrase (feat/sms-e2e-code-purge): gateway mode refuses to
// send without one, so every gateway case below carries this test-only value.
GATEWAY.passphrase = 'test-only passphrase, never a real one, 24+ chars';

async function main() {
  console.log('\nSMS transport + contact rule (unit)\n');

  // -------------------------------------------------------------------------
  console.log('Contact rule — accepted forms, one stored form');
  // -------------------------------------------------------------------------
  for (const input of ['09171234567', '0917 123 4567', '0917-123-4567', '+639171234567', '+63 917 123 4567', '639171234567', '63-917-123-4567']) {
    const r = validateContact(input);
    assert(r.error === null && r.value === '09171234567', `"${input}" is stored as 09171234567`, JSON.stringify(r));
  }
  for (const input of ['9171234567', '+6391712345678', '08171234567', '+1 917 123 4567', 'Test', '63917123456', '+63 817 123 4567', '009171234567']) {
    const r = validateContact(input);
    assert(r.value === null && r.error === CONTACT_RULE_MESSAGE, `"${input}" is refused with the rule message`, JSON.stringify(r));
  }
  assert(validateContact('').value === null && validateContact('').error === null, 'empty stays optional (null, no error)');
  assert(normalizeContact('+63 917 123 4567') === normalizeContact('0917-123-4567'), 'two forms of one number normalise equal — a re-type is not a change');
  assert(/09XXXXXXXXX, \+639XXXXXXXXX or 639XXXXXXXXX/.test(CONTACT_RULE_MESSAGE), 'the message names all three accepted forms');
  assert(toE164('09171234567') === '+639171234567', 'toE164: 09171234567 → +639171234567');
  assert(toE164('+639171234567') === '+639171234567', 'toE164 accepts an already-international value');
  assert(toE164('Test') === null && toE164('') === null, 'toE164 refuses anything the rule refuses (null)');

  // -------------------------------------------------------------------------
  console.log('\nThe two texts — one GSM-7 part, no identifiers');
  // -------------------------------------------------------------------------
  for (const [name, text] of [
    ['reset', sms.resetCodeText({ code: '123456', minutes: 10 })],
    ['confirm', sms.verifyCodeText({ code: '123456', minutes: 10 })],
  ]) {
    assert(text.length <= 160, `${name} text fits one part (${text.length} ≤ 160)`);
    assert(/^[\x20-\x7E]+$/.test(text), `${name} text is plain ASCII (GSM-7 safe)`);
    assert(text.includes('123456'), `${name} text carries the code`);
    assert(!/\d{12}/.test(text), `${name} text carries no 12-digit LRN`);
  }

  // -------------------------------------------------------------------------
  console.log('\nThe password alert texts — one GSM-7 part, no code, no link, no identifiers (feat/password-alert)');
  // -------------------------------------------------------------------------
  for (const [name, text] of [
    ['password changed', sms.passwordChangedText()],
    ['temporary password', sms.temporaryPasswordText()],
  ]) {
    assert(text.length <= 160, `${name}: one part — ${text.length} characters`);
    assert(/^[\x20-\x7E]+$/.test(text), `${name}: ASCII only (GSM-7)`);
    assert(/^Parent's Portal: /.test(text) && /school office/.test(text), `${name}: the school's words, naming the office`);
    assert(!/\d{6}/.test(text), `${name}: no run of six digits — nothing that reads as a code`);
    assert(!/https?:|www\./i.test(text), `${name}: no link to copy`);
    assert(!/\d{12}/.test(text), `${name}: no LRN-shaped number`);
  }
  assert(sms.temporaryPasswordText() !== sms.passwordChangedText() && /temporary password/.test(sms.temporaryPasswordText()),
    'the office text is its own, and says "temporary password"');

  // -------------------------------------------------------------------------
  console.log('\nGateway request shape (fake fetch)');
  // -------------------------------------------------------------------------
  const calls = [];
  const okFetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 202, json: async () => ({ id: 'x', state: 'Pending' }) }; };
  const t = sms.createTransport({ ...GATEWAY, fetchImpl: okFetch });
  assert(t.isEnabled(), 'gateway mode is enabled');
  const sent = await t.send({ to: '0917 123 4567', text: 'hello', ttlSeconds: 600 });
  assert(sent.transport === 'gateway' && sent.status === 202, 'a 2xx is accepted', JSON.stringify(sent));
  const call = calls[0];
  assert(call.url === 'http://gw.example.test:8080/message', 'POST to <url>/message, trailing slash folded', call.url);
  assert(call.init.method === 'POST', 'method POST');
  assert(call.init.headers.Authorization === `Basic ${Buffer.from('sms:secret-pass').toString('base64')}`, 'Basic auth from USER / PASS');
  const body = JSON.parse(call.init.body);
  assert(await smsEncryption.decryptValue(body.textMessage?.text, GATEWAY.passphrase) ==='hello' && !('message' in body), 'body uses textMessage.text, not the deprecated message field');
  assert(Array.isArray(body.phoneNumbers) && body.phoneNumbers.length === 1 && await smsEncryption.decryptValue(body.phoneNumbers[0], GATEWAY.passphrase) ==='+639171234567', 'phoneNumbers is [E.164] — the only place E.164 exists');
  assert(body.ttl === 600, 'ttl matches the code life');
  assert(call.init.signal instanceof AbortSignal, 'the request carries a timeout signal');

  // -------------------------------------------------------------------------
  console.log('\nFailures are a FIXED reason (A1)');
  // -------------------------------------------------------------------------
  async function reasonOf(transport, args = { to: '09171234567', text: 'x' }) {
    try { await transport.send(args); return 'resolved'; }
    catch (err) { return { reason: err.reason, message: err.message, hasCause: 'cause' in err }; }
  }
  const http401 = await reasonOf(sms.createTransport({ ...GATEWAY, fetchImpl: async () => ({ ok: false, status: 401 }) }));
  assert(http401.reason === 'http_401' && http401.message === 'http_401', 'a 401 is http_401', JSON.stringify(http401));
  const http500 = await reasonOf(sms.createTransport({ ...GATEWAY, fetchImpl: async () => ({ ok: false, status: 500 }) }));
  assert(http500.reason === 'http_500', 'a 500 is http_500');
  const refusedFake = await reasonOf(sms.createTransport({
    ...GATEWAY,
    fetchImpl: async () => { const e = new TypeError('fetch failed'); e.cause = new Error('connect ECONNREFUSED 10.36.162.1:8080'); throw e; },
  }));
  assert(refusedFake.reason === 'unreachable' && refusedFake.message === 'unreachable' && !refusedFake.hasCause,
    'a thrown fetch is unreachable, message is the reason, no cause attached', JSON.stringify(refusedFake));
  const timedOut = await reasonOf(sms.createTransport({
    ...GATEWAY,
    fetchImpl: async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; },
  }));
  assert(timedOut.reason === 'timeout', 'a TimeoutError is timeout');
  const noPass = await reasonOf(sms.createTransport({ mode: 'gateway', url: GATEWAY.url, user: 'sms', pass: '', fetchImpl: okFetch }));
  assert(noPass.reason === 'bad_config', 'a missing password is bad_config — nothing is fetched');
  const badUrl = await reasonOf(sms.createTransport({ ...GATEWAY, url: 'ftp://gw', fetchImpl: okFetch }));
  assert(badUrl.reason === 'bad_config', 'a non-http URL is bad_config');
  const badNumber = await reasonOf(sms.createTransport({ ...GATEWAY, fetchImpl: okFetch }), { to: 'Test', text: 'x' });
  assert(badNumber.reason === 'bad_config', 'an invalid number is never sent (bad_config)');
  const off = sms.createTransport({ mode: 'off' });
  assert(!off.isEnabled(), 'mode off is not enabled');
  assert((await reasonOf(off)).reason === 'bad_config', 'sending while off is bad_config');
  const off2 = sms.createTransport({});
  assert(!off2.isEnabled(), 'no mode at all is off');
  assert(!sms.isEnabled() && sms.SMS_MODE === 'off', 'the default instance is off when SMS_TRANSPORT is unset');

  // A1 — a REAL refused connection, through the real fetch.
  const port = await refusedPort();
  const real = sms.createTransport({ mode: 'gateway', url: `http://127.0.0.1:${port}`, user: 'sms', pass: 'secret-pass', timeoutMs: 3000, passphrase: GATEWAY.passphrase });
  const run = await captureConsole(() => real.send({ to: '09171234567', text: 'x' }));
  const err = run.error;
  assert(err && err.reason === 'unreachable', 'a real refused connection is unreachable', err ? err.reason : 'resolved');
  // util.inspect prints the whole cause chain — where Node's fetch keeps
  // "connect ECONNREFUSED <ip>:<port>" — so this catches an attached cause.
  const printable = [err?.message, String(err), JSON.stringify(err), err?.stack, util.inspect(err, { depth: 10 }), ...run.lines].join('\n');
  assert(!printable.includes('127.0.0.1'), 'A1: no IP in the error, its stack or anything printed');
  assert(!printable.includes(String(port)), `A1: no port (${port}) in the error, its stack or anything printed`);
  assert(!printable.includes('secret-pass') && !printable.includes('09171234567') && !printable.includes('+639171234567'),
    'A1: no credential and no number either');
  const probeRefused = await captureConsole(() => real.health());
  assert(probeRefused.value && probeRefused.value.reachable === false && probeRefused.value.reason === 'unreachable', 'health() on a refused port: reachable false, unreachable');
  assert(!JSON.stringify(probeRefused.value).includes('127.0.0.1') && !JSON.stringify(probeRefused.value).includes(String(port)), 'health() result carries no IP or port');

  // -------------------------------------------------------------------------
  console.log('\nhealth() (fake fetch)');
  // -------------------------------------------------------------------------
  const healthCalls = [];
  const h = await sms.createTransport({
    ...GATEWAY,
    fetchImpl: async (url, init) => {
      healthCalls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ status: 'pass', version: '1.75.1', checks: { 'battery:level': { status: 'pass', observedValue: 88 } } }) };
    },
  }).health();
  assert(healthCalls[0].url === 'http://gw.example.test:8080/health' && !healthCalls[0].init.method, 'health() is a GET to /health — it sends nothing');
  assert(h.reachable && h.status === 'pass' && h.version === '1.75.1' && h.checks['battery:level'].observed === 88, 'health() reports status, version and checks', JSON.stringify(h));
  assert(!JSON.stringify(h).includes('gw.example.test'), 'health() result never carries the URL');

  // -------------------------------------------------------------------------
  console.log('\nFile transport');
  // -------------------------------------------------------------------------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-unit-'));
  try {
    const f = sms.createTransport({ mode: 'file', dir });
    const r = await f.send({ to: '0917 123 4567', text: 'code 654321', ttlSeconds: 600 });
    const written = JSON.parse(fs.readFileSync(r.file, 'utf8'));
    assert(r.transport === 'file' && written.to === '+639171234567' && written.text === 'code 654321', 'file mode writes {to: E.164, text}', JSON.stringify(written));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ---------------------------------------------------------------------------
  console.log('\nEnd-to-end encryption, the passphrase scheme (D-119)');
  // ---------------------------------------------------------------------------
  // SMSGate's docs publish no test vectors, so each step is held to its
  // standard's own (the owner's Q3d): RFC 6070 for PBKDF2-HMAC-SHA1, the key;
  // NIST SP 800-38A F.2.5 for AES-256-CBC, the cipher. The device check is the
  // end-to-end proof.
  const rfc6070 = [
    ['password', 'salt', 1, 20, '0c60c80f961f0e71f3a9b524af6012062fe037a6'],
    ['password', 'salt', 2, 20, 'ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957'],
    ['password', 'salt', 4096, 20, '4b007901b765489abead49d926f721d065a429c1'],
    ['passwordPASSWORDpassword', 'saltSALTsaltSALTsaltSALTsaltSALTsalt', 4096, 25, '3d2eec4fe41c849b80c8d83662c0e44a8b291a964cf2f07038'],
    ['pass\0word', 'sa\0lt', 4096, 16, '56fa6aa75548099dcc37d7f03425e0c3'],
  ];
  for (const [p, s, c, len, hex] of rfc6070) {
    const dk = await smsEncryption.deriveKey(p, s, c, len);
    assert(dk.toString('hex') === hex, `RFC 6070: PBKDF2-HMAC-SHA1, c=${c}, dkLen=${len}`);
  }
  // Our step pads (PKCS#7), so its first four blocks are NIST's ciphertext and
  // a fifth block of padding follows.
  const nistKey = Buffer.from('603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4', 'hex');
  const nistIv = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
  const nistPlain = Buffer.from(
    '6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710',
    'hex'
  );
  const nistCipher =
    'f58c4c04d6e5f1ba779eabfb5f7bfbd69cfc4e967edb808d679f777bc6702c7d39f23369a9d9bacfa530e26304231461b2eb05e2c39be9fcda6c19078c6a9d1b';
  const nistOut = smsEncryption.encryptWithKey(nistKey, nistIv, nistPlain);
  assert(nistOut.length === 80 && nistOut.subarray(0, 64).toString('hex') === nistCipher,
    'NIST SP 800-38A F.2.5: AES-256-CBC, four blocks, then one PKCS#7 padding block');

  // The value, as SMSGate's own example writes it.
  const PP = GATEWAY.passphrase;
  const fixedSalt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const fixed = await smsEncryption.encryptValue('E2E check', PP, { iterations: 1000, salt: fixedSalt });
  const parsed = smsEncryption.VALUE.exec(fixed);
  assert(Boolean(parsed) && fixed.startsWith('$aes-256-cbc/pbkdf2-sha1$i=1000$') && parsed[2] === fixedSalt.toString('base64'),
    'the value is $aes-256-cbc/pbkdf2-sha1$i=<iterations>$<base64 salt>$<base64 ciphertext>');
  assert(await smsEncryption.decryptValue(fixed, PP) === 'E2E check', 'round trip: the phone side decrypts what the server encrypted');
  const [, , iterPart, saltPart, dataPart] = fixed.split('$');
  const exSalt = Buffer.from(saltPart, 'base64');
  const exKey = crypto.pbkdf2Sync(PP, exSalt, Number(iterPart.slice(2)), 32, 'sha1');
  const exDecipher = crypto.createDecipheriv('aes-256-cbc', exKey, exSalt);
  const exPlain = Buffer.concat([exDecipher.update(Buffer.from(dataPart, 'base64')), exDecipher.final()]).toString('utf8');
  assert(exPlain === 'E2E check', "decrypted on its own, the way SMSGate's example encrypts: PBKDF2-SHA1, AES-256-CBC, the IV equal to the salt");
  const d1 = await smsEncryption.encryptValue('same text', PP);
  const d2 = await smsEncryption.encryptValue('same text', PP);
  assert(d1.includes('$i=75000$') && Buffer.from(smsEncryption.VALUE.exec(d1)[2], 'base64').length === 16,
    "by default 75,000 iterations (the app's own) and a 16-byte salt");
  assert(d1 !== d2, 'a fresh salt per value: the same text never encrypts the same twice');

  // The gateway request from the first send above (GATEWAY carries a passphrase).
  assert(body.isEncrypted === true && body.ttl === 600, 'the request sets isEncrypted: true; ttl stays plain');
  assert(smsEncryption.VALUE.test(body.textMessage?.text || '') && smsEncryption.VALUE.test(body.phoneNumbers?.[0] || ''),
    'the message and the phone number both travel as passphrase values');
  const plainText = await smsEncryption.decryptValue(body.textMessage.text, PP);
  const plainNumber = await smsEncryption.decryptValue(body.phoneNumbers[0], PP);
  assert(!call.init.body.includes(plainText) && !call.init.body.includes(plainNumber),
    'neither the text nor the number appears in the request in the clear');

  // FAIL CLOSED (the owner's Q2 (a)).
  const closedCalls = [];
  const closed = sms.createTransport({
    ...GATEWAY,
    passphrase: undefined,
    fetchImpl: async (url) => { closedCalls.push(url); return { ok: true, status: 200, json: async () => ({ status: 'pass' }) }; },
  });
  const closedRun = await reasonOf(closed, { to: plainNumber, text: 'E2E check' });
  assert(closedRun.reason === 'bad_config' && closedCalls.length === 0, 'no passphrase in gateway mode: bad_config, and nothing is sent',
    JSON.stringify(closedRun));
  const closedHealth = await closed.health();
  assert(closedHealth.reachable === true && closedHealth.encryption === false && h.encryption === true,
    '/health still answers without a passphrase; the probe reads encryption off, and on with one');

  const fdir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-e2e-'));
  try {
    const fileT = sms.createTransport({ mode: 'file', dir: fdir, passphrase: PP });
    const fr = await fileT.send({ to: plainNumber, text: 'E2E check', ttlSeconds: 600 });
    const fw = JSON.parse(fs.readFileSync(fr.file, 'utf8'));
    assert(fw.to === plainNumber && fw.text === 'E2E check' && !('isEncrypted' in fw), 'file mode stays plain for the suites, passphrase or not');
  } finally {
    fs.rmSync(fdir, { recursive: true, force: true });
  }

  const transportSrc = fs.readFileSync(path.join(__dirname, '..', 'utils', 'smsTransport.js'), 'utf8');
  assert(/'SMS_ENCRYPTION_PASSPHRASE'\]\.filter/.test(transportSrc) && /passphrase: process\.env\.SMS_ENCRYPTION_PASSPHRASE/.test(transportSrc),
    'the startup check names SMS_ENCRYPTION_PASSPHRASE when it is missing, and the transport reads it from the environment once');
  assert(!/console\.(log|error|warn)\([^)]*passphrase\b/.test(transportSrc), 'no console line prints the passphrase');

  // -------------------------------------------------------------------------
  console.log('\nThe switch cannot be turned on by a request');
  // -------------------------------------------------------------------------
  const src = fs.readFileSync(path.join(__dirname, '..', 'utils', 'smsTransport.js'), 'utf8');
  assert(!/\breq\b/.test(src), 'utils/smsTransport.js never reads a request object');
  assert(/const MODE = process\.env\.SMS_TRANSPORT === 'gateway'/.test(src), 'the mode is chosen once, at module load, into a const');
  assert(!/console\.(log|error|warn)\([^)]*(err\.message|error\.message|base|url|user|pass)\b/.test(src), 'no console line prints an error message, the URL or a credential');

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('UNEXPECTED ERROR:', err.reason || err.name);
  process.exit(1);
});
