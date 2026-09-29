import { contactError } from '../../../format/contactRule';
import { passwordIsValid, passwordRuleHint } from '../../../format/passwordRule';

// THE PURE HALF OF THE WEB'S admin/UsersPage.jsx (Stage 5 branch 4), lifted so
// scripts/proof-admin-users.mjs can drive it. Each function is the web's rule;
// only the file moved.

// A PARENT'S login_id IS THEIR CHILD'S LRN (§5c): the directory shows the
// last four digits and nothing more; a short id is hidden outright rather
// than partially. Staff ids are ordinary identifiers and stay whole.
export function maskLoginId(user) {
  const value = user?.login_id;
  if (typeof value !== 'string' || !value) return '—';
  if (user.role !== 'parent') return value;
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

// The create-teacher success line names the login id the admin must hand
// over (feat/ui-polish, 2026-09-30) — the SERVER's stored value, from the
// user the POST returned, never the typed field. A teacher id is not an LRN,
// so it is shown whole. The web's admin/UsersPage.jsx says the same sentence.
export function teacherCreatedNotice(user) {
  const id = typeof user?.login_id === 'string' && user.login_id ? user.login_id : null;
  return id ? `Teacher account created and activated. Login ID: ${id}.` : 'Teacher account created and activated.';
}

// Display casing only (§5d): `users.role` and `users.status` are stored
// lowercase and stay so everywhere else.
export function displayRole(role) {
  if (typeof role !== 'string' || !role) return '';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export const ROLE_FILTERS = [
  { key: '', label: 'All roles' },
  { key: 'parent', label: 'Parent' },
  { key: 'teacher', label: 'Teacher' },
  { key: 'admin', label: 'Admin' },
];

export const STATUS_FILTERS = [
  { key: '', label: 'All statuses' },
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'inactive', label: 'Inactive' },
];

export const EMPTY_FILTERS = Object.freeze({ role: '', status: '', search: '' });

// The GET /users params for the APPLIED filters: an empty value is not sent.
export function userListParams(applied) {
  const params = {};
  if (applied?.role) params.role = applied.role;
  if (applied?.status) params.status = applied.status;
  if (applied?.search) params.search = applied.search;
  return params;
}

export function canResetUsers(applied) {
  return Boolean(applied?.role || applied?.status || applied?.search);
}

// Two empty branches from the applied values (§5f).
export function directoryEmpty(applied) {
  if (canResetUsers(applied)) {
    return { title: 'No users match these filters', message: 'Try a different role, status, or search, or reset to see everyone.', showReset: true };
  }
  return { title: 'No users yet', message: 'Teacher and parent accounts created in this system will appear here.', showReset: false };
}

// THE ROW'S ACTIONS, from the web's column. Edit always. Reset password on
// every account but your own (the endpoint refuses your own id, and an
// admin's way back in is another admin, §11). Deactivate / Activate only
// between active and inactive — pending and rejected are the review's —
// and never your own ACTIVE account, where a note says why instead (the
// server answers 400 anyway). The last-active-admin refusal is NOT predicted:
// a filter can hide the other admin, so the server's 400 is shown instead.
export function rowActions(row, meId) {
  const isSelf = row?.id === meId;
  const canToggle = row?.status === 'active' || row?.status === 'inactive';
  const selfActive = isSelf && row?.status === 'active';
  return {
    edit: true,
    reset: !isSelf,
    toggle: canToggle && !selfActive ? (row.status === 'active' ? 'inactive' : 'active') : null,
    selfNote: canToggle && selfActive ? 'You cannot deactivate yourself' : null,
  };
}

// The web's words after a status write.
export function statusMessage(nextStatus) {
  return nextStatus === 'inactive' ? 'Account deactivated.' : 'Account activated.';
}

// CREATE TEACHER — the web's order of checks, one refusal at a time, each
// with the field it belongs to (§7c). The server enforces the same and its
// 400 names the field; `null` means send it.
export function createTeacherProblem(form) {
  if (!form.login_id.trim() || !form.password || !form.name.trim()) {
    return { field: null, message: 'login_id, password, and name are required.' };
  }
  if (!passwordIsValid(form.password)) return { field: 'password', message: passwordRuleHint() };
  const contact = contactError(form.contact_number);
  if (contact) return { field: 'contact_number', message: contact };
  return null;
}

// The POST body: optional fields are left out when blank, never sent empty.
export function createTeacherBody(form) {
  return {
    login_id: form.login_id.trim(),
    password: form.password,
    name: form.name.trim(),
    email: form.email.trim() || undefined,
    contact_number: form.contact_number.trim() || undefined,
  };
}

// REVIEW A PENDING PARENT. Leaving pending is one-way (§5e), so the review
// confirms and names the decision; a rejection needs a reason — the web's
// message, shown when Continue is tapped without one.
export function reviewProblem(decision, reason) {
  if (!decision) return 'Choose Approve or Reject.';
  if (decision === 'reject' && !String(reason || '').trim()) return 'Rejection reason is required.';
  return null;
}

export function reviewConfirmText(decision) {
  return decision === 'approve' ? 'Approve this parent account?' : 'Reject this parent account?';
}

export function reviewDoneText(decision) {
  return decision === 'approve' ? 'Parent account approved and activated.' : 'Parent account rejected.';
}
