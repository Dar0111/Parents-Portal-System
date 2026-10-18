const policy = require('./policy');

// THE THREE ACCOUNT GATES (feat/first-signin, 2026-10-18; the owner's order):
//
//   1. consent   the CURRENT Data Privacy Notice and Terms of Use (§29)
//   2. contact   a confirmed Gmail or mobile number — any account with
//                neither, and an account in the forced-change state that has
//                not confirmed one SINCE THIS SIGN-IN
//   3. password  the forced change (an admin temporary password, a new
//                account's password someone else typed)
//
// ONE PURE MODULE, THREE CALLERS: middleware/auth.js (HTTP), socket.js (the
// handshake) and routes/auth.js (/me and the login reply say which step is
// next). Only the FIRST pending gate applies, so an account on step 1 is
// refused with step 1's code even if steps 2 and 3 are pending too.
//
// PATHS ARE MATCHED IN FULL — `req.baseUrl + req.path`, with the method. The
// forced-change gate used to compare the router-relative path, so any router's
// `/me` or `/change-password` passed it (docs/MIGRATION_INVENTORY.md C13).
// PUT /api/auth/change-password is allowed by NO gate: a temporary password is
// replaced through PUT /api/auth/first-password, after a code.
//
// "SINCE THIS SIGN-IN" IS THE TOKEN'S `iat` (whole seconds) against the
// confirmation timestamps (whole seconds, the database's NOW()). Both confirm
// endpoints re-stamp the time on every good code, so a confirm in this session
// is one whose stamp is at or after the sign-in. No auth_codes row is read:
// those are burned by every new code and never in a dump. Both clocks are this
// machine's today; a server whose database runs elsewhere must keep them in
// step (the migration inventory's addendum says so).

const GATES = {
  consent: {
    code: 'POLICY_ACCEPTANCE_REQUIRED',
    message: 'Please accept the Data Privacy Notice and the Terms of Use before continuing.',
  },
  contact: {
    code: 'CONTACT_VERIFICATION_REQUIRED',
    message: 'Confirm your Gmail or mobile number before continuing.',
  },
  password: {
    code: 'MUST_CHANGE_PASSWORD',
    message: 'You must change your password before continuing.',
  },
};

// Every gate lets the account read itself and reach the policy endpoints.
const ALWAYS = [['GET', '/api/auth/me']];
const POLICY_MOUNT = '/api/policy';

const ALLOWED = {
  consent: [],
  contact: [
    ['PUT', '/api/auth/email'],
    ['PUT', '/api/auth/contact'],
    ['POST', '/api/auth/verify-email/request'],
    ['POST', '/api/auth/verify-email/confirm'],
    ['POST', '/api/auth/verify-contact/request'],
    ['POST', '/api/auth/verify-contact/confirm'],
  ],
  password: [['PUT', '/api/auth/first-password']],
};

// A TIMESTAMP column arrives as a Date (config/db.js leaves DATETIME and
// TIMESTAMP alone); a stub may hand a string. Whole seconds either way.
function toSeconds(value) {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

// A confirmation counts only while the value it confirmed is still there.
function hasConfirmedContact(user) {
  return Boolean((user.email && user.email_verified_at) || (user.contact_number && user.contact_verified_at));
}

function confirmedSince(user, iat) {
  if (!Number.isFinite(Number(iat))) return false;
  const email = user.email ? toSeconds(user.email_verified_at) : null;
  const contact = user.contact_number ? toSeconds(user.contact_verified_at) : null;
  return (email !== null && email >= Number(iat)) || (contact !== null && contact >= Number(iat));
}

// { pending, step } — step is 'add' (nothing confirmed yet) or 'reconfirm' (a
// forced-change account that has a confirmed contact but has not used it this
// session); null when nothing is pending.
function contactState(user, iat) {
  const confirmed = hasConfirmedContact(user);
  const pending = user.must_change_password ? !confirmedSince(user, iat) : !confirmed;
  if (!pending) return { pending: false, step: null };
  return { pending: true, step: user.must_change_password && confirmed ? 'reconfirm' : 'add' };
}

// `user` carries the users row plus `policy_accepted` (the count the
// middleware's subquery reads). Returns 'consent' | 'contact' | 'password' | null.
function pendingGate(user, iat) {
  if (policy.isPending(user.role, user.policy_accepted)) return 'consent';
  if (contactState(user, iat).pending) return 'contact';
  if (user.must_change_password) return 'password';
  return null;
}

function gateAllows(gate, method, fullPath) {
  const path = String(fullPath || '');
  if (path === POLICY_MOUNT || path.startsWith(`${POLICY_MOUNT}/`)) return true;
  const verb = String(method || '').toUpperCase();
  return [...ALWAYS, ...(ALLOWED[gate] || [])].some(([m, p]) => m === verb && p === path);
}

// The 403 body's two fields (the HTTP refusal) and the handshake's.
function refusal(gate) {
  return { message: GATES[gate].message, code: GATES[gate].code };
}

module.exports = {
  GATES,
  ALLOWED,
  hasConfirmedContact,
  confirmedSince,
  contactState,
  pendingGate,
  gateAllows,
  refusal,
};
