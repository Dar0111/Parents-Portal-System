const crypto = require('crypto');

// SMSGate's PASSPHRASE end-to-end encryption (feat/sms-e2e-code-purge,
// 2026-10-24; D-119, the owner's Q3a and Q3b). docs.sms-gate.app/privacy/
// encryption, the passphrase scheme, written as SMSGate's own TypeScript
// example writes it:
//
//   key    PBKDF2-HMAC-SHA1(passphrase, salt, iterations, 32 bytes)
//   value  AES-256-CBC, PKCS#7 padding, the IV EQUAL TO THE SALT
//   salt   16 random bytes, fresh for every value
//   out    $aes-256-cbc/pbkdf2-sha1$i=<iterations>$<base64 salt>$<base64 ciphertext>
//
// The phone holds the same passphrase in its SMSGate app, decrypts each value
// and sends the text from its own SIM, so the relay in between — SMSGate's
// cloud server, or the hotspot LAN in local mode — sees neither the number nor
// the message. The iteration count travels inside each value.
//
// THE DEVICE-PAIRED SCHEME (RSA-OAEP + AES-256-GCM, the phone's own key) is
// SMSGate's newer recommendation and is NOT built: the owner noted it for the
// hosting step.
//
// Never logged, never returned, never in an error: the passphrase, the key,
// the plaintext.

const ITERATIONS = 75000; // the app's own default (the owner's Q3b)
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const VALUE = /^\$aes-256-cbc\/pbkdf2-sha1\$i=(\d+)\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;

// PBKDF2-HMAC-SHA1, asynchronous so a send never blocks the event loop.
// `length` is a parameter only so the unit test can hold it to RFC 6070's
// vectors (20 and 25 bytes); the transport always takes KEY_BYTES.
function deriveKey(passphrase, salt, iterations, length = KEY_BYTES) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(passphrase, salt, iterations, length, 'sha1', (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// AES-256-CBC with PKCS#7 padding — the one cipher step, separate so the unit
// test can hold it to NIST SP 800-38A's vectors.
function encryptWithKey(key, iv, plaintext) {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

// `salt` and `iterations` are options only for the unit test; every caller
// leaves them alone and gets a fresh random salt and the app's default.
async function encryptValue(plaintext, passphrase, { iterations = ITERATIONS, salt = crypto.randomBytes(SALT_BYTES) } = {}) {
  const key = await deriveKey(passphrase, salt, iterations);
  const data = encryptWithKey(key, salt, Buffer.from(String(plaintext), 'utf8'));
  return `$aes-256-cbc/pbkdf2-sha1$i=${iterations}$${salt.toString('base64')}$${data.toString('base64')}`;
}

// The phone's half, for the unit test's round trip. The server never decrypts.
async function decryptValue(value, passphrase) {
  const m = VALUE.exec(String(value));
  if (!m) throw new Error('not an SMSGate passphrase value');
  const salt = Buffer.from(m[2], 'base64');
  const key = await deriveKey(passphrase, salt, Number(m[1]));
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, salt);
  return Buffer.concat([decipher.update(Buffer.from(m[3], 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { ITERATIONS, SALT_BYTES, VALUE, deriveKey, encryptWithKey, encryptValue, decryptValue };
