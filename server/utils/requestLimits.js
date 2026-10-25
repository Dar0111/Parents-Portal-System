// LIMITS MYSQL ENFORCED BY ITSELF, NOW REFUSED AT THE REQUEST BOUNDARY
// (P3-C-R2 fix round, the owner's answers of 2026-10-25). Each one used to
// reach the database and come back as a 500 on PostgreSQL; now it is the
// route's own 400, `{ success: false, message }`, before any query runs.
//
// NUL (U+0000). PostgreSQL's text types cannot hold it — binding one is
// 22021, a 500 — where MySQL stored it or searched with it. `refuseNul` is
// mounted first on every router (`router.use(refuseNul)`), so it runs before
// `authenticate` and before any handler: a NUL anywhere in the body (a key or
// a value, at any depth), the query string or the address is refused, whether
// or not the handler would have used that field. The message names the field
// only when its path is a plain name; it never echoes what was sent.
// (routes/auth.js's `cannotBeALoginId` stays behind it as defence in depth.)

const NUL = '\u0000';
const PLAIN_SEGMENT = /^[A-Za-z0-9_]{1,64}$/;

// The first place a NUL appears in `value` — '' for the value itself, a dotted
// path ('settings.school_name', 'entries[2].status') below it — or null.
// Iterative, so a deeply nested body cannot exhaust the stack.
function findNul(value) {
  const stack = [{ value, path: '' }];
  while (stack.length) {
    const { value: v, path } = stack.pop();
    if (typeof v === 'string') {
      if (v.includes(NUL)) return path;
    } else if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i -= 1) stack.push({ value: v[i], path: `${path}[${i}]` });
    } else if (v && typeof v === 'object') {
      for (const key of Object.keys(v)) {
        const keyPath = path ? `${path}.${key}` : key;
        if (key.includes(NUL)) return { badKey: true };
        stack.push({ value: v[key], path: keyPath });
      }
    }
  }
  return null;
}

function describe(found) {
  if (found === null) return null;
  if (typeof found === 'object' && found.badKey) return 'A field name';
  const segments = String(found).split(/[.[\]]+/).filter(Boolean);
  const plain = /^[A-Za-z_]/.test(found) && segments.every((s) => PLAIN_SEGMENT.test(s));
  return plain ? found : 'The request';
}

function refuseNul(req, res, next) {
  const address = String(req.originalUrl || req.url || '').split('?')[0];
  if (/%00/i.test(address) || address.includes(NUL)) {
    return res.status(400).json({ success: false, message: 'The request address must not contain a NUL character.' });
  }
  for (const part of [req.query, req.body]) {
    const where = describe(findNul(part));
    if (where !== null) {
      return res.status(400).json({ success: false, message: `${where} must not contain a NUL character.` });
    }
  }
  return next();
}

module.exports = { refuseNul, findNul };
