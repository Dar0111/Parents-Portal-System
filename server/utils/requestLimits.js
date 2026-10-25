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
//
// THE 64 KB TEXT CAP. MySQL's TEXT columns held at most 65,535 BYTES (UTF-8
// octets, not characters) and refused a longer value (a 500); PostgreSQL's
// `text` has no such limit, so the nine request-writable former TEXT fields
// keep MySQL's cap here, on the value as it would be stored (after the
// route's own trim): announcements.content, memos.content,
// events.description, messages.body, excuse_letters.reason / details /
// teacher_remarks, users.rejection_reason (the reject's `reason`) and every
// system_settings value. `textTooLong` returns the route's message, or null.
//
// IMPOSSIBLE DATES IN A FILTER. A `date` / `from` / `to` filter that passes
// the YYYY-MM-DD shape check but names no calendar day (2026-02-30, month 13,
// day 00, year 0000) was 22008 on PostgreSQL — a 500 — where MySQL compared
// it as a string and matched nothing (an empty 200). `isCalendarDate` checks
// the Gregorian calendar for years 0001-9999 (PostgreSQL has no year 0; the
// leap rule is the same on both sides), and the eleven filter sites
// (attendance ×7, excuse letters ×2, events ×2) refuse with
// `<name> must be a real date in YYYY-MM-DD format.` — the wording
// routes/activityLogs.js already uses. The write paths' dates are not
// filters and are unchanged (an impossible one was a 500 on MySQL too).

const NUL = '\u0000';
const TEXT_MAX_BYTES = 65535;
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

function textTooLong(field, value) {
  if (value === undefined || value === null) return null;
  const bytes = Buffer.byteLength(typeof value === 'string' ? value : String(value), 'utf8');
  return bytes > TEXT_MAX_BYTES ? `${field} must be 65,535 bytes or fewer.` : null;
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  // setUTCFullYear, not Date.UTC: Date.UTC maps years 0-99 to 1900-1999.
  const at = new Date(Date.UTC(2000, 0, 1));
  at.setUTCFullYear(y, m - 1, d);
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

module.exports = { refuseNul, findNul, textTooLong, TEXT_MAX_BYTES, isCalendarDate };
