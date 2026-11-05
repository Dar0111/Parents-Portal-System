const jwt = require('jsonwebtoken');

// FAIL CLOSED IN PRODUCTION (Module 10, 2026-10-30; the owner's Q1–Q3).
//
// The development fallback is in the repo, so an API that signed with it
// would accept a token anyone could forge, for any account. With NODE_ENV
// production — trimmed, in any case — a JWT_SECRET that is missing, blank or
// that default THROWS here, once, at load: server.js requires this file
// (through routes/auth.js) before it listens, so the API never opens its
// port. Outside production nothing changes — the unit suites load no .env
// and rely on the fallback. No message ever carries a value.
//
// TWO MORE REFUSALS IN PRODUCTION (M18, D-137, 2026-11-05; the owner's
// answer 1). A value that starts with the old server/.env.example's
// placeholder prefix — the template carried it until M16, so a .env copied
// from it unedited would sign tokens anyone with the repo could forge — and
// a value shorter than 32 characters after trimming (HS256 wants a key at
// least as long as its 256-bit hash). The PREFIX only: the placeholder's full
// value is never written here, in a test or in a doc (KNOWN_ISSUES).
const DEV_DEFAULT_SECRET = 'dev-secret-change-me';
const TEMPLATE_PLACEHOLDER_PREFIX = 'change-this-';
const MIN_SECRET_LENGTH = 32;

function isProduction(env) {
  return String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function resolveJwtSecret(env = process.env) {
  const secret = env.JWT_SECRET;
  if (!isProduction(env)) return secret || DEV_DEFAULT_SECRET;
  if (typeof secret !== 'string' || secret.trim() === '') {
    throw new Error('JWT_SECRET is missing in server/.env and NODE_ENV is production. The API will not start.');
  }
  if (secret.trim() === DEV_DEFAULT_SECRET) {
    throw new Error('JWT_SECRET in server/.env is the public development default and NODE_ENV is production. The API will not start.');
  }
  if (secret.trim().toLowerCase().startsWith(TEMPLATE_PLACEHOLDER_PREFIX)) {
    throw new Error('JWT_SECRET in server/.env is the old template placeholder and NODE_ENV is production. The API will not start.');
  }
  if (secret.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET in server/.env is shorter than ${MIN_SECRET_LENGTH} characters and NODE_ENV is production. The API will not start.`);
  }
  return secret;
}

const JWT_SECRET = resolveJwtSecret(process.env);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken, resolveJwtSecret, DEV_DEFAULT_SECRET };
