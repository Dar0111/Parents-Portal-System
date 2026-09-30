// THE ALLOWED BROWSER ORIGINS (feat/lan-web, 2026-10-01) — one reading of
// CORS_ORIGIN for BOTH the HTTP API (server.js) and Socket.io (socket.js),
// so the two can never disagree about who may call.
//
// CORS_ORIGIN is a COMMA-SEPARATED LIST, e.g.
//   CORS_ORIGIN=http://localhost:3000,http://192.168.137.1:3000
// so the laptop's browser (localhost) and a phone's Chrome on the LAN
// (the laptop's IP) are allowed at the same time. Unset or empty keeps the
// old single default, http://localhost:3000.
//
// NEVER A WILDCARD. `*` — or anything containing one — is dropped even when
// configured, because a wildcard origin would let any page anyone opens call
// this API with a user's token. Each entry must be a bare origin
// (scheme://host[:port], http or https, no path, no trailing slash) exactly
// as a browser sends it in the Origin header; anything else is dropped, and
// every dropped entry is reported once at startup so a typo is visible
// instead of silently locking the phone out.
const DEFAULT_ORIGINS = ['http://localhost:3000'];

function parseCorsOrigins(raw) {
  const accepted = [];
  const rejected = [];
  const entries = typeof raw === 'string' ? raw.split(',') : [];
  for (const entry of entries) {
    const value = entry.trim();
    if (!value) continue;
    if (value.includes('*')) {
      rejected.push({ value, reason: 'a wildcard is never allowed' });
      continue;
    }
    let url;
    try {
      url = new URL(value);
    } catch {
      rejected.push({ value, reason: 'not a URL' });
      continue;
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== value) {
      rejected.push({ value, reason: 'not a bare origin (scheme://host[:port], no path or trailing slash)' });
      continue;
    }
    if (!accepted.includes(value)) accepted.push(value);
  }
  return { origins: accepted.length ? accepted : [...DEFAULT_ORIGINS], rejected };
}

// Read once at startup, never from a request. Rejections are printed with the
// offending value (an origin is not a secret) and the reason.
function corsOriginsFromEnv(env = process.env, log = console) {
  const { origins, rejected } = parseCorsOrigins(env.CORS_ORIGIN);
  for (const r of rejected) log.warn(`CORS_ORIGIN: ignored "${r.value}" — ${r.reason}.`);
  return origins;
}

module.exports = { DEFAULT_ORIGINS, parseCorsOrigins, corsOriginsFromEnv };
