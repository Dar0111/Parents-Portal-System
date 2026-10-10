import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { buttonClass, cardClass } from '../../components/buttonClass';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormField, { filterFieldClass, filterSelectClass } from '../../components/FormField';
import { PersonCell } from '../../components/Avatar';
import PasswordField from '../../components/PasswordField';
import PasswordChecklist from '../../components/PasswordChecklist';
import { passwordIsValid, passwordRuleHint } from '../../format/passwordRule';
import { contactError, contactRuleHint } from '../../format/contactRule';
import Modal from '../../components/Modal';
import SectionHeader from '../../components/SectionHeader';
import StatusBadge from '../../components/StatusBadge';
import Reveal from '../../motion/Reveal';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Admin user management. Teacher creates parents (POST /users/parents);
// this page never calls that endpoint — authorize('teacher') would 403
// "Access denied." before a handler ran. No parent-create control.
//
// TWO LISTS, because they are different payloads:
//   GET /users/parents/pending  -> unwrap 'parents' (student name, class,
//     created_by_name). Approve/reject live only here.
//   GET /users                 -> unwrap 'users' (SELECT *, sanitizeUser).
// GET /users/:id is not called: the list row is already SELECT *. No :id
// route — login_id is a credential (§5c); if a detail route is ever added
// it keys on users.id, never the login id / LRN.
//
// §5e: leaving pending is one-way (approve/reject answer 400 once status
// is not pending; there is no return-to-pending). Confirm, name the
// decision. Reject requires reason. PATCH /:id/status is reversible
// (active <-> inactive) — no confirm. Create teacher has no DELETE; the
// undo is deactivate, so compose has no confirm either.
//
// §5b: StatusBadge and the pending queue render from the last successful
// load. Deactivate/approve never patch the row locally; load() is the
// only writer of `users` and `pending`.
//
// Self-deactivate: hide the control (server 400 anyway). Last-active-admin:
// do NOT predict from the filtered directory — a filter that hides the
// other admin would show a dead-end button. Handle the 400.
//
// Seeded parent 1234567 (Jea) is pending on purpose (test:auth). Do not
// treat that row as a write target in verification.
//
// GET /users ?search= matches users.name and users.login_id only — not
// the child's name. Searching "Marwin" against Ashley Geguiera's parent
// row is a genuine empty, not a broken filter. Placeholder says so.
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): two sections, the queue
// first because it is the one thing waiting on the admin, then the
// directory with the page's ONE filled action, Create teacher. The five
// Modals sit BESIDE the entrance wrapper, never inside it: Modal renders
// inline, and a wrapper mid-tween carries a transform (motion/motion.js).

const EMPTY_TEACHER = {
  login_id: '',
  password: '',
  name: '',
  email: '',
  contact_number: '',
};

const EMPTY_EDIT = { name: '', email: '', contact_number: '' };

// THE PENDING ROW'S "Review", AMBER — the one button on this page that is
// not a `buttonClass` variant, on purpose. Amber is this system's "there is
// something to do", the queue is the one place here where something is
// waiting on the admin, and the page's single filled action is Create
// teacher. There is no amber variant, and a variant's own colours cannot be
// overridden by appending classes (two colour utilities on one element are
// settled by stylesheet order, not by which was written last — FormField
// says how that was found). So: the row action's geometry and focus outline
// (`sm` in buttonClass.js — 44px under a finger, 36px from `sm` up), with
// the warning tone's checked text/background pair.
const REVIEW_BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-warning-edge bg-warning-soft px-3 py-1.5 text-sm font-semibold text-warning-strong transition hover:bg-warning-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent sm:min-h-9';

// THE DECISION IN THE REVIEW DIALOG IS A CHOICE, NOT AN ACTION, so the
// chosen one is not the filled accent — that is Continue, in the footer.
// It is told apart by more than colour: the brand tint, a ring, a check
// mark, and `aria-pressed`. The unchosen one is the plain secondary button;
// this is the same geometry (`md`) with the chosen state's colours.
const DECISION_CHOSEN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand bg-brand-soft px-4 py-2 text-sm font-semibold text-brand ring-1 ring-brand transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent';

// A notice inside a dialog: the write it stands beside cannot be taken back
// (§5e). The icon is decoration and takes the notice's own colour.
const NOTICE_WARNING =
  'flex items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3 text-sm text-warning-strong';

// One fact in the review dialog's list: the label in the eyebrow style.
const FACT_LABEL = 'text-xs font-semibold uppercase tracking-wider text-fg-muted';

const ROLE_FILTERS = ['', 'parent', 'teacher', 'admin'];
const STATUS_FILTERS = ['', 'pending', 'active', 'rejected', 'inactive'];

// A PRESET FROM THE ADDRESS (build 2 fix round F3, 2026-10-08). The admin
// dashboard's Teachers and Parents counts link here as `?role=teacher` and
// `?role=parent&status=active` — the WHERE each number counts — and the page
// opens on that filter, APPLIED: the first request is already filtered, the
// controls show the preset, and nothing reads "Changes not applied". Only a
// known role and a known status are read; anything else is ignored, and
// nothing else ever comes from the address — never a login id or an LRN
// (§5c). Read once, when the page mounts; Apply and Reset take the preset
// back out of the address (a replace), so a reload never brings back a
// filter the admin has since changed.
function presetFromSearch(searchParams) {
  const role = searchParams.get('role');
  const status = searchParams.get('status');
  const preset = {
    role: role && ROLE_FILTERS.includes(role) ? role : '',
    status: status && STATUS_FILTERS.includes(status) ? status : '',
    search: '',
  };
  return preset.role || preset.status ? preset : null;
}

const NO_FILTERS = { role: '', status: '', search: '' };

function displayRole(role) {
  if (typeof role !== 'string' || !role) return '';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// A PARENT'S login_id IS THEIR CHILD'S LRN (§5c), so the directory shows the
// last four digits and nothing more (DV1, 2026-09-20). Teacher and admin ids
// are ordinary staff identifiers and stay whole.
//
// THIS IS NOT THE HELPER IN Settings, AND THE DIFFERENCE IS DELIBERATE — the
// dispatch asked to "reuse the mask parent Settings already uses", and that
// one is a different thing: `MaskedLoginId` in settings/AccountInfoSection.jsx
// is a stateful COMPONENT that hides the value completely and offers a
// Show/Hide toggle. That is right for one field on your own account page and
// wrong in a table, where it would mean fifty reveal buttons, and wrong on a
// card, where a button inside a link is the nested-interactive fault this
// dispatch exists to avoid. So: two rules, on purpose.
//
// Second occurrence of "mask a login id". A THIRD is the trigger to extract
// both into client/src/format/loginId.js and reconcile the rules — the same
// rule-of-three this codebase already applied to dateFormat and TermValue.
// Not done now: it would mean editing a file outside this branch's whitelist
// to serve one caller.
function maskLoginId(user) {
  const value = user?.login_id;
  if (typeof value !== 'string' || !value) return '—';
  if (user.role !== 'parent') return value;
  // Short ids would leak most of themselves to a "last four", so they are
  // hidden outright rather than partially.
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

export default function UsersPage() {
  usePageTitle('Users');
  const { user: me, refresh: refreshMe } = useAuth();

  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The preset (above) seeds the draft AND the applied filters, so they start
  // equal — applied, not pending.
  const [searchParams, setSearchParams] = useSearchParams();
  const [preset] = useState(() => presetFromSearch(searchParams) || NO_FILTERS);
  const [role, setRole] = useState(preset.role);
  const [status, setStatus] = useState(preset.status);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState(preset);
  // Assembled once, trimmed as the commit trims it (item 5). `status` here is
  // the FILTER, not the FormStatus strip — the naming collision this file's
  // header already warns about.
  const draftFilters = { role, status, search: search.trim() };
  const dirty = isDirty(draftFilters, applied);

  // The XOR this used to implement by hand (a successful create then a failed
  // deactivate must not leave both strips visible — Teacher → Grades,
  // 2026-09-07) is now structural: a status is one value, not two slots.
  //
  // Named formStatus, not status: `status` above is this page's role/status
  // FILTER, a string. Two different things, one obvious name.
  //
  // Keyed status, and TWO keys because this page has two tables: `pending`
  // describes the approval queue, `directory` describes the directory below
  // it. Each renders above the table it is about — one shared slot at the top
  // put "User updated." nowhere near the row that changed.
  //
  // The three modal errors (createError / editError / reviewError) are NOT
  // folded in: each already renders inside its own modal, next to the button
  // that produced it, which is exactly where FormStatus would put it. They
  // are single-purpose error slots, so converting them would be churn.
  const [formStatus, setFormStatus] = useState({});

  const [creating, setCreating] = useState(false);
  const [teacherForm, setTeacherForm] = useState(EMPTY_TEACHER);
  const [createError, setCreateError] = useState(null);
  // The password rule's message renders under the Password field, not in the
  // form-level strip — from the client check or from the server's 400 with
  // field "password". Cleared when the field changes and when the form closes.
  const [passwordError, setPasswordError] = useState(null);
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  // Contact-number refusals — the client rule's or the server's 400 with
  // field "contact_number" — under the field in each form (§7c).
  const [createContactError, setCreateContactError] = useState(null);
  const [editContactError, setEditContactError] = useState(null);
  // field: 'email' from utils/emailRule.js (pre-Stage-5 #4) lands on the
  // email input, like the contact rule's, not in the form's generic slot.
  const [createEmailError, setCreateEmailError] = useState(null);
  const [editEmailError, setEditEmailError] = useState(null);
  const [createSaving, setCreateSaving] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [editError, setEditError] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  const [reviewing, setReviewing] = useState(null);
  const [decision, setDecision] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  const [statusSavingId, setStatusSavingId] = useState(null);

  // Reset password (R2, 2026-09-19) — POST /users/:id/temp-password, the
  // office fallback for an account that cannot use /forgot-password: no
  // email on file, an unconfirmed one, or an inbox the parent cannot reach.
  //
  // TWO PHASES IN ONE MODAL, and the second one is the reason this is not a
  // plain confirm. Phase one confirms by ACCOUNT NAME (§5e: irreversible —
  // the old password is gone the instant this returns, and there is no
  // undo). Phase two shows the generated password, ONCE: the server hashes
  // it and returns it in that one response, nothing stores it in plain form
  // and no endpoint can produce it again. Closing the dialog is what throws
  // it away, so the footer button says so.
  //
  // `tempPassword` is what separates the phases, and it is cleared on close
  // — not on open — so a mis-click on a second row cannot show the previous
  // row's password.
  const [resetting, setResetting] = useState(null);
  const [resetError, setResetError] = useState(null);
  const [resetSaving, setResetSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const [tempCopied, setTempCopied] = useState(false);

  // Remove a profile photo (feat/profile-photos, 2026-09-30) —
  // DELETE /users/:id/photo, admin REMOVE-ONLY (moderation; there is no
  // upload for someone else). The file is deleted with no undo, so it is a
  // confirmation naming the person (§5e). Shown only on a row that HAS one.
  const [photoRemoving, setPhotoRemoving] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const [photoSaving, setPhotoSaving] = useState(false);

  // Two paged tables, two pager states (2026-09-19). Each is one page of a
  // server-sorted list (C1); a filter or sort change resets its offset (C6);
  // a page emptied by an approval steps back on its own (C7, in DataTable).
  const [pendingOffset, setPendingOffset] = useState(0);
  const [pendingSort, setPendingSort] = useState(null);
  const [pendingPage, setPendingPage] = useState(null);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { ...listParams({ offset, sort }) };
      if (applied.role) params.role = applied.role;
      if (applied.status) params.status = applied.status;
      if (applied.search) params.search = applied.search;

      const [pendingResult, userResult] = await Promise.all([
        api.get('/users/parents/pending', {
          unwrap: ['parents', 'page'],
          params: listParams({ offset: pendingOffset, sort: pendingSort }),
        }),
        api.get('/users', { unwrap: ['users', 'page'], params }),
      ]);
      setPending(pendingResult.parents);
      setPendingPage(pendingResult.page);
      setUsers(userResult.users);
      setPage(userResult.page);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [applied, offset, sort, pendingOffset, pendingSort]);

  function changePendingSort(next) {
    setPendingSort(next);
    setPendingOffset(0);
  }

  function changeSort(next) {
    setSort(next);
    setOffset(0);
  }

  useEffect(() => {
    load();
  }, [load]);

  function applyFilters(event) {
    event.preventDefault();
    // Loading before applied, or the one frame after reset (applied
    // empty, users still []) renders "No users yet" — 5f naming the
    // wrong cause. DataTable already prefers loading over empty.
    setLoading(true);
    setOffset(0);
    setApplied(draftFilters);
    clearPreset();
  }

  function resetFilters() {
    setRole('');
    setStatus('');
    setSearch('');
    setLoading(true);
    setOffset(0);
    setApplied(NO_FILTERS);
    clearPreset();
  }

  // The preset leaves the address once the admin applies or resets filters
  // of their own (see presetFromSearch). A replace, and a change of the query
  // only — the page does not move (Shell's scroll rule, F5).
  function clearPreset() {
    if (searchParams.has('role') || searchParams.has('status')) setSearchParams({}, { replace: true });
  }

  const canReset = Boolean(applied.role || applied.status || applied.search);

  const directoryEmpty = (() => {
    if (canReset) {
      return {
        icon: 'fa-users-gear',
        title: 'No users match these filters',
        message: 'Try a different role, status, or search, or reset to see everyone.',
        showReset: true,
      };
    }
    return {
      icon: 'fa-users-gear',
      title: 'No users yet',
      message: 'Teacher and parent accounts created in this system will appear here.',
      showReset: false,
    };
  })();

  function openCreate() {
    setTeacherForm(EMPTY_TEACHER);
    setCreateError(null);
    setCreateEmailError(null);
    setCreating(true);
  }

  function closeCreate() {
    if (createSaving) return;
    setCreating(false);
    setCreateError(null);
    setPasswordError(null);
    setCreateContactError(null);
  }

  async function submitCreate(event) {
    event.preventDefault();
    setCreateError(null);
    setPasswordError(null);
    if (!teacherForm.login_id.trim() || !teacherForm.password || !teacherForm.name.trim()) {
      setCreateError('login_id, password, and name are required.');
      return;
    }
    // One rule, one module (format/passwordRule.js). The server enforces the
    // same rule on POST /users/teachers and answers 400 with field
    // "password"; either way the message renders under the Password field,
    // not in the form-level strip.
    if (!passwordIsValid(teacherForm.password)) {
      setPasswordError(passwordRuleHint());
      return;
    }
    const contactProblem = contactError(teacherForm.contact_number);
    if (contactProblem) {
      setCreateContactError(contactProblem);
      return;
    }
    setCreateSaving(true);
    try {
      const created = await api.post(
        '/users/teachers',
        {
          login_id: teacherForm.login_id.trim(),
          password: teacherForm.password,
          name: teacherForm.name.trim(),
          email: teacherForm.email.trim() || undefined,
          contact_number: teacherForm.contact_number.trim() || undefined,
        },
        { unwrap: 'user' }
      );
      setCreating(false);
      setTeacherForm(EMPTY_TEACHER);
      // The login id the admin must hand over, from the SERVER's row — a
      // teacher id is not an LRN, so it is shown whole (feat/ui-polish; the
      // phone's admin/users/logic.js teacherCreatedNotice says the same).
      setFormStatus({
        directory: ok(
          created?.login_id
            ? `Teacher account created and activated. Login ID: ${created.login_id}.`
            : 'Teacher account created and activated.'
        ),
      });
      await load();
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'password') {
        setPasswordError(extractError(err));
      } else if (field === 'contact_number') {
        setCreateContactError(extractError(err));
      } else if (field === 'email') {
        setCreateEmailError(extractError(err));
      } else {
        setCreateError(extractError(err));
      }
    } finally {
      setCreateSaving(false);
    }
  }

  function openEdit(row) {
    setEditing(row);
    setEditForm({
      name: row.name || '',
      email: row.email || '',
      contact_number: row.contact_number || '',
    });
    setEditError(null);
    setEditContactError(null);
    setEditEmailError(null);
  }

  function closeEdit() {
    if (editSaving) return;
    setEditing(null);
    setEditError(null);
    setEditContactError(null);
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!editing) return;
    setEditError(null);
    if (!editForm.name.trim()) {
      setEditError('name must not be empty.');
      return;
    }
    const contactProblem = contactError(editForm.contact_number);
    if (contactProblem) {
      setEditContactError(contactProblem);
      return;
    }
    setEditSaving(true);
    try {
      await api.put(
        `/users/${editing.id}`,
        {
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          contact_number: editForm.contact_number.trim(),
        },
        { unwrap: 'user' }
      );
      // Editing YOUR OWN row changes the user AuthContext is holding — the
      // header name, and everything Settings → Account information renders.
      // Without this the admin who just changed their own email sees the old
      // one on that page until a manual reload (browser check, 2026-09-19).
      // Best effort: the directory write succeeded, so a failed re-read must
      // not turn it into an error.
      if (editing.id === me?.id) await refreshMe().catch(() => {});
      setEditing(null);
      setFormStatus({ directory: ok('User updated.') });
      await load();
    } catch (err) {
      if (err?.response?.data?.field === 'contact_number') {
        setEditContactError(extractError(err));
      } else if (err?.response?.data?.field === 'email') {
        setEditEmailError(extractError(err));
      } else {
        setEditError(extractError(err));
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function setUserStatus(row, nextStatus) {
    setFormStatus({});
    setStatusSavingId(row.id);
    try {
      await api.patch(`/users/${row.id}/status`, { status: nextStatus }, { unwrap: 'user' });
      setFormStatus({
        directory: ok(nextStatus === 'inactive' ? 'Account deactivated.' : 'Account activated.'),
      });
      await load();
    } catch (err) {
      setFormStatus({ directory: fail(extractError(err)) });
    } finally {
      setStatusSavingId(null);
    }
  }

  function openReset(row) {
    setResetting(row);
    setResetError(null);
    setTempPassword(null);
    setTempCopied(false);
  }

  function closeReset() {
    if (resetSaving) return;
    setResetting(null);
    setResetError(null);
    setTempPassword(null);
    setTempCopied(false);
  }

  async function submitReset() {
    if (!resetting) return;
    setResetError(null);
    setResetSaving(true);
    try {
      const temporary = await api.post(
        `/users/${resetting.id}/temp-password`,
        {},
        { unwrap: 'temporary_password' }
      );
      setTempPassword(temporary);
      setFormStatus({ directory: ok(`Temporary password set for ${resetting.name}.`) });
      // No load(): nothing this write changes is a column on this table.
      // The row's status, name and role are untouched.
    } catch (err) {
      setResetError(extractError(err));
    } finally {
      setResetSaving(false);
    }
  }

  function openPhotoRemove(row) {
    setPhotoRemoving(row);
    setPhotoError(null);
  }

  function closePhotoRemove() {
    if (photoSaving) return;
    setPhotoRemoving(null);
    setPhotoError(null);
  }

  async function submitPhotoRemove() {
    if (!photoRemoving) return;
    setPhotoError(null);
    setPhotoSaving(true);
    try {
      await api.delete(`/users/${photoRemoving.id}/photo`, { unwrap: 'message' });
      setFormStatus({ directory: ok(`Profile photo removed for ${photoRemoving.name}.`) });
      // Your own row: the sidebar card reads the auth user, so re-read it too.
      if (photoRemoving.id === me?.id) await refreshMe().catch(() => {});
      setPhotoRemoving(null);
      // The avatar is a column on this table, so re-read it (§5b).
      await load();
    } catch (err) {
      setPhotoError(extractError(err));
    } finally {
      setPhotoSaving(false);
    }
  }

  async function copyTempPassword() {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setTempCopied(true);
    } catch {
      // Clipboard access can be refused (permissions, an insecure origin).
      // The password is on screen and selectable, so this is a convenience
      // failing, not the task failing — say nothing and let them select it.
      setTempCopied(false);
    }
  }

  function openReview(row) {
    setReviewing(row);
    setDecision(null);
    setRejectReason('');
    setConfirming(false);
    setReviewError(null);
  }

  function closeReview() {
    if (reviewSaving) return;
    setReviewing(null);
    setDecision(null);
    setRejectReason('');
    setConfirming(false);
    setReviewError(null);
  }

  function tryConfirm() {
    setReviewError(null);
    if (!decision) return;
    if (decision === 'reject' && !rejectReason.trim()) {
      setReviewError('Rejection reason is required.');
      return;
    }
    setConfirming(true);
  }

  async function submitReview() {
    if (!reviewing || !decision) return;
    setReviewError(null);
    setReviewSaving(true);
    try {
      if (decision === 'approve') {
        await api.put(`/users/parents/${reviewing.id}/approve`, {}, { unwrap: 'user' });
        setFormStatus({ pending: ok('Parent account approved and activated.') });
      } else {
        await api.put(
          `/users/parents/${reviewing.id}/reject`,
          { reason: rejectReason.trim() },
          { unwrap: 'message' }
        );
        setFormStatus({ pending: ok('Parent account rejected.') });
      }
      setReviewing(null);
      setDecision(null);
      setRejectReason('');
      setConfirming(false);
      await load();
    } catch (err) {
      setReviewError(extractError(err));
    } finally {
      setReviewSaving(false);
    }
  }

  const pendingColumns = [
      {
        key: 'name',
        header: 'Guardian',
        sortable: true,
        render: (row) => <PersonCell name={row.name} secondary={row.email || null} photo={row.profile_pic} />,
      },
      {
        key: 'student',
        header: 'Student',
        sortable: true,
        sortValue: (row) => `${row.student_last_name}, ${row.student_first_name}`,
        render: (row) => `${row.student_last_name}, ${row.student_first_name}`,
      },
      {
        key: 'class',
        header: 'Class',
        sortable: true,
        sortValue: (row) => `${row.grade_level}-${row.section}`,
        // A class reads as one value; it does not break at its spaces.
        nowrap: true,
        render: (row) => `Grade ${row.grade_level} - ${row.section}`,
      },
      {
        key: 'login_id',
        header: 'Login ID',
        nowrap: true,
        // Every row here is a parent, so every one of these is an LRN.
        render: (row) => <span className="font-mono">{maskLoginId({ ...row, role: 'parent' })}</span>,
      },
      {
        key: 'created_by_name',
        header: 'Created by',
        render: (row) => row.created_by_name || '—',
      },
      {
        key: 'action',
        header: '',
        align: 'right',
        nowrap: true,
        render: (row) => (
          // The pending row's ONE action, amber rather than primary: it is
          // the only thing to do here, and the queue is the one place on
          // this page where something is waiting on the admin (REVIEW_BTN).
          <button
            type="button"
            onClick={() => openReview(row)}
            aria-label={`Review ${row.name}`}
            className={REVIEW_BTN}
          >
            Review
          </button>
        ),
      },
    ];

  const userColumns = [
      {
        key: 'name',
        header: 'Name',
        sortable: true,
        // `'You'` STAYS; the email fallback goes (UI-B item 2). This table
        // has its own Email column, so the address was on screen twice — but
        // "You" is not a duplicate of anything, it is the one fact no column
        // carries, and it is what stops an admin deactivating themselves by
        // misreading a row. A blanket delete would have taken it with the
        // email, which is why this is a conditional and not a removal.
        //
        // The PARENTS table above is deliberately untouched: its columns are
        // Guardian / Student / Class / Login ID / Created by, with no Email,
        // so the address there earns its line.
        render: (row) => (
          <PersonCell name={row.name} secondary={row.id === me?.id ? 'You' : null} photo={row.profile_pic} />
        ),
      },
      {
        key: 'login_id',
        header: 'Login ID',
        sortable: true,
        nowrap: true,
        render: (row) => <span className="font-mono">{maskLoginId(row)}</span>,
      },
      {
        key: 'role',
        header: 'Role',
        sortable: true,
        render: (row) => displayRole(row.role),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: 'email',
        header: 'Email',
        render: (row) => row.email || '—',
      },
      {
        key: 'action',
        header: '',
        align: 'right',
        // nowrap so the three icon buttons keep ONE row and this column
        // claims its own width. Without it they wrap under each other and
        // the email beside them runs into the cluster (browser review).
        nowrap: true,
        render: (row) => {
          const busy = statusSavingId === row.id;
          const canToggle = row.status === 'active' || row.status === 'inactive';
          const isSelf = row.id === me?.id;
          return (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Icon buttons, each NAMING ITS ROW in the aria-label. A
                  column of buttons all announced as "Edit" is unusable with
                  a screen reader, and the visible label was the only thing
                  disambiguating them before. `title` carries the same text
                  so a sighted mouse user keeps the wording too.

                  ONE SIZE FOR ALL FOUR (`icon-sm` in buttonClass.js: 44px
                  square under a finger on the card, 36px from `sm` up in the
                  table, rem so "Large text" scales it) — three buttons that
                  drift apart is how a row of actions stops looking like a
                  row of actions. `Button` draws the glyph, aria-hidden. */}
              <Button
                size="icon-sm"
                icon="fa-pen"
                onClick={() => openEdit(row)}
                aria-label={`Edit ${row.name}`}
                title={`Edit ${row.name}`}
              />
              {/* Hidden on your own row: the handler answers 400 "Use Change
                  password for your own account.", same shape as the
                  self-deactivate guard beside it. */}
              {isSelf ? null : (
                <Button
                  size="icon-sm"
                  icon="fa-key"
                  onClick={() => openReset(row)}
                  aria-label={`Reset password for ${row.name}`}
                  title={`Reset password for ${row.name}`}
                />
              )}
              {/* Only on a row that has a photo — a control that could only
                  answer "no photo" is not offered (§5i). The one action in
                  this row that deletes something, so it is the one drawn in
                  the destructive outline; its dialog still asks first. */}
              {row.profile_pic ? (
                <Button
                  variant="danger-outline"
                  size="icon-sm"
                  icon="fa-image"
                  onClick={() => openPhotoRemove(row)}
                  aria-label={`Remove the profile photo of ${row.name}`}
                  title={`Remove the profile photo of ${row.name}`}
                />
              ) : null}
              {canToggle && isSelf && row.status === 'active' ? (
                <span className="text-xs text-fg-muted">You cannot deactivate yourself</span>
              ) : null}
              {/* `loading` is the old `disabled={busy}` plus its spinner in
                  place of the glyph, in one prop. */}
              {canToggle && !(isSelf && row.status === 'active') ? (
                <Button
                  size="icon-sm"
                  icon={row.status === 'active' ? 'fa-user-slash' : 'fa-user-check'}
                  loading={busy}
                  onClick={() => setUserStatus(row, row.status === 'active' ? 'inactive' : 'active')}
                  aria-label={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.name}`}
                  title={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.name}`}
                />
              ) : null}
            </div>
          );
        },
      },
    ];

  const studentLabel = reviewing
    ? `${reviewing.student_first_name} ${reviewing.student_last_name}`
    : '';

  // How many are waiting, beside the queue's title — the SERVER's total for
  // the pending list (the same figure its pager prints as "of N"), never a
  // count of the rows on screen, and only from a settled, successful read:
  // nothing while loading, nothing beside a failed request, nothing at zero.
  const waitingCount = !loading && !error && pendingPage?.total > 0 ? pendingPage.total : null;

  return (
    <div>
      <Reveal className="space-y-6">
        {error ? <ErrorAlert message={error} onRetry={load} /> : null}
        <section className="space-y-3">
          <SectionHeader
            title={
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                Waiting for approval
                {waitingCount !== null ? (
                  <span className="inline-flex items-center rounded-md border border-warning-edge bg-warning-soft px-2.5 py-0.5 font-sans text-xs font-semibold tabular-nums text-warning-strong">
                    {waitingCount}
                    <span className="sr-only"> waiting</span>
                  </span>
                ) : null}
              </span>
            }
            description={
              <span className="block max-w-prose">
                A parent account stays pending until it is approved or rejected. That decision
                cannot be returned to pending afterward.
              </span>
            }
          />
          <FormStatus status={formStatus.pending} />

          <DataTable
            columns={pendingColumns}
            rows={pending}
            loading={loading}
            // ONE load reads both tables; each table's key is the part of it
            // that decides its own rows, so paging the directory keeps this
            // queue (option 1).
            queryKey={[pendingOffset, pendingSort]}
            skeletonAvatar
            page={pendingPage}
            onPageChange={setPendingOffset}
            sort={pendingSort}
            onSortChange={changePendingSort}
            emptyIcon="fa-envelope-open-text"
            emptyTitle="No parent accounts waiting for approval"
            emptyMessage="A teacher creates the account. It appears here until you approve or reject it."
            renderCard={(row) => ({
              onSelect: () => openReview(row),
              avatar: row.name,
              avatarPhoto: row.profile_pic,
              title: row.name,
              subtitle: `Parent of ${row.student_first_name} ${row.student_last_name}`,
              meta: `Grade ${row.grade_level} - ${row.section}`,
              status: 'pending',
            })}
          />
        </section>

        <section className="space-y-3">
          {/* The page title lives in Shell's header, so the sentence that
              says WHO CREATES WHAT goes here, beside the one control it is
              about. It is the one thing about this screen that is not
              obvious from it: an admin can create a teacher but not a
              parent, and not another admin. Create teacher is the page's one
              filled action.

              The sentence is its own paragraph UNDER the header row, not the
              header's `description`: on a phone the button beside the title
              would leave the sentence a narrow column. */}
          <SectionHeader
            title="All accounts"
            actions={
              <Button variant="primary" icon="fa-user-plus" onClick={openCreate}>
                Create teacher
              </Button>
            }
          />
          <p className="max-w-prose text-sm text-fg-muted">
            Teacher accounts are created here. Parent accounts are created by teachers and approved
            here.
          </p>

          {/* The filter bar is its own card, and only the filters live in it. */}
          <form onSubmit={applyFilters} className={`${cardClass} flex flex-wrap items-start gap-3 p-4`}>
            <FormField
              label="Role"
              as="select"
              className={filterSelectClass}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLE_FILTERS.map((value) => (
                <option key={value || 'all'} value={value}>
                  {value ? displayRole(value) : 'All roles'}
                </option>
              ))}
            </FormField>
            <FormField
              label="Status"
              as="select"
              className={filterSelectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_FILTERS.map((value) => (
                <option key={value || 'all'} value={value}>
                  {value ? displayRole(value) : 'All statuses'}
                </option>
              ))}
            </FormField>
            <FormField
              label="Search"
              placeholder="Name or login ID"
              className={filterFieldClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {/* This Apply commits TWO requests, not one — `load()` refetches
                the pending queue and the directory together in a
                `Promise.all` — so the cue is guarding a more expensive
                commit here than anywhere else (item 5). */}
            <FilterActions dirty={dirty} canReset={canReset} onReset={resetFilters} />
          </form>

          <FormStatus status={formStatus.directory} />

          <DataTable
            columns={userColumns}
            rows={users}
            loading={loading}
            queryKey={[applied, offset, sort]}
            skeletonAvatar
            page={page}
            onPageChange={setOffset}
            sort={sort}
            onSortChange={changeSort}
            emptyIcon={directoryEmpty.icon}
            emptyTitle={directoryEmpty.title}
            emptyMessage={directoryEmpty.message}
            // NO `to` AND NO `onSelect`: Edit, Reset password and Deactivate
            // are three peers, so there is no primary action to tap and the
            // card renders static with its actions underneath. Inventing a
            // primary here — "tap to edit" — would make the other two feel
            // secondary when they are not.
            renderCard={(row) => ({
              avatar: row.name,
              avatarPhoto: row.profile_pic,
              title: row.name,
              subtitle: row.email || null,
              meta: `${displayRole(row.role)} · ${maskLoginId(row)}`,
              status: row.status,
              actions: userColumns[userColumns.length - 1].render(row),
            })}
            emptyAction={
              directoryEmpty.showReset ? (
                <Button size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : null
            }
          />
        </section>
      </Reveal>

      {/* A dialog's footer is the neutral way out, then the one filled step
          forward. `loading` is the old `disabled={saving}` plus its spinner,
          in one prop. */}
      <Modal
        open={creating}
        onClose={closeCreate}
        title="Create teacher"
        closeOnBackdrop={!createSaving}
        footer={
          <>
            <Button onClick={closeCreate} disabled={createSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="create-teacher-form"
              disabled={!passwordIsValid(teacherForm.password)}
              loading={createSaving}
            >
              Create
            </Button>
          </>
        }
      >
        <form id="create-teacher-form" onSubmit={submitCreate} className="space-y-4">
          {createError ? <ErrorAlert message={createError} /> : null}
          <FormField
            label="Login ID"
            required
            value={teacherForm.login_id}
            onChange={(e) => setTeacherForm((f) => ({ ...f, login_id: e.target.value }))}
            hint="Assigned teacher ID, not an LRN. At most 20 characters."
          />
          {/* PasswordField (eye toggle) like the other password-setting forms;
              the live checklist under it reads the shared rule, and Create
              stays disabled until every rule passes. A refusal — the client
              check's or the server's field "password" — renders here with a
              red border, not in the form-level strip. */}
          <PasswordField
            label="Password"
            required
            value={teacherForm.password}
            onChange={(e) => {
              setPasswordError(null);
              setTeacherForm((f) => ({ ...f, password: e.target.value }));
            }}
            autoComplete="new-password"
            revealed={passwordRevealed}
            onToggleReveal={() => setPasswordRevealed((r) => !r)}
            error={passwordError}
            disabled={createSaving}
            below={<PasswordChecklist value={teacherForm.password} />}
          />
          <FormField
            label="Name"
            required
            value={teacherForm.name}
            onChange={(e) => setTeacherForm((f) => ({ ...f, name: e.target.value }))}
          />
          <FormField
            label="Email"
            type="email"
            value={teacherForm.email}
            onChange={(e) => {
              setCreateEmailError(null);
              setTeacherForm((f) => ({ ...f, email: e.target.value }));
            }}
            error={createEmailError}
          />
          <FormField
            label="Contact number"
            value={teacherForm.contact_number}
            onChange={(e) => {
              setCreateContactError(null);
              setTeacherForm((f) => ({ ...f, contact_number: e.target.value }));
            }}
            maxLength={20}
            inputMode="tel"
            hint={contactRuleHint()}
            error={createContactError}
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={closeEdit}
        title={editing ? `Edit ${editing.name}` : ''}
        closeOnBackdrop={!editSaving}
        footer={
          <>
            <Button onClick={closeEdit} disabled={editSaving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="edit-user-form" loading={editSaving}>
              Save
            </Button>
          </>
        }
      >
        {editing ? (
          <form id="edit-user-form" onSubmit={submitEdit} className="space-y-4">
            {editError ? <ErrorAlert message={editError} /> : null}
            <p className="text-sm text-fg-muted">
              Login ID <span className="font-semibold text-fg-secondary">{editing.login_id}</span> and
              role cannot be changed here.
            </p>
            <FormField
              label="Name"
              required
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            />
            <FormField
              label="Email"
              type="email"
              value={editForm.email}
              onChange={(e) => {
                setEditEmailError(null);
                setEditForm((f) => ({ ...f, email: e.target.value }));
              }}
              error={editEmailError}
            />
            <FormField
              label="Contact number"
              value={editForm.contact_number}
              onChange={(e) => {
                setEditContactError(null);
                setEditForm((f) => ({ ...f, contact_number: e.target.value }));
              }}
              maxLength={20}
              inputMode="tel"
              hint={contactRuleHint()}
              error={editContactError}
            />
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(resetting)}
        onClose={closeReset}
        title={resetting ? `Reset password — ${resetting.name}` : ''}
        size="sm"
        closeOnBackdrop={!resetSaving && !tempPassword}
        footer={
          tempPassword ? (
            <Button variant="primary" onClick={closeReset}>
              Done — I have given it to them
            </Button>
          ) : (
            <>
              <Button onClick={closeReset} disabled={resetSaving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submitReset} loading={resetSaving}>
                Yes, set a temporary password
              </Button>
            </>
          )
        }
      >
        {resetting ? (
          <div className="space-y-4">
            {resetError ? <ErrorAlert message={resetError} /> : null}
            {tempPassword ? (
              <>
                <p className="text-sm text-fg-body">
                  Give this to <span className="font-semibold text-fg">{resetting.name}</span>. They
                  will be asked to choose their own password the next time they sign in.
                </p>
                {/* The password, selectable, in the fixed-width face it has
                    always been shown in. `break-all`: a long one wraps
                    inside the box instead of widening the dialog. */}
                <div className="flex items-center gap-2 rounded-xl border border-edge bg-surface-subtle py-2 pl-4 pr-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-base font-semibold text-fg">
                    {tempPassword}
                  </code>
                  <Button size="sm" icon={tempCopied ? 'fa-check' : 'fa-copy'} onClick={copyTempPassword} className="shrink-0">
                    {tempCopied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div role="alert" className={NOTICE_WARNING}>
                  <i aria-hidden="true" className="fa-solid fa-triangle-exclamation mt-0.5" />
                  <p className="min-w-0 flex-1">
                    This is shown once. It is not stored anywhere in readable form and cannot be
                    looked up again — if you close this without passing it on, set another one.
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-fg-body">
                  Set a temporary password for{' '}
                  <span className="font-semibold text-fg">{resetting.name}</span>?
                </p>
                <p className="text-sm text-fg-muted">
                  Their current password stops working immediately and they are signed out
                  everywhere. The new one is shown once, on the next screen, and they must choose
                  their own before they can use the portal again. This cannot be undone.
                </p>
              </>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(reviewing)}
        onClose={closeReview}
        title={reviewing ? `Review parent — ${reviewing.name}` : ''}
        closeOnBackdrop={!reviewSaving}
        footer={
          confirming ? (
            <>
              <Button onClick={() => setConfirming(false)} disabled={reviewSaving}>
                Go back
              </Button>
              {/* The confirm takes the decision's own tone — an approving
                  fill or the destructive one — never the accent. */}
              <Button
                variant={decision === 'approve' ? 'success' : 'danger'}
                onClick={submitReview}
                loading={reviewSaving}
              >
                Yes, {decision === 'approve' ? 'approve' : 'reject'}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={closeReview}>Cancel</Button>
              <Button variant="primary" disabled={!decision} onClick={tryConfirm}>
                Continue
              </Button>
            </>
          )
        }
      >
        {reviewing ? (
          <div className="space-y-4">
            {reviewError ? <ErrorAlert message={reviewError} /> : null}
            {/* Who is being decided on, as one quiet panel above the
                decision. The Login ID is whole in this dialog, as it always
                was — an admin acting on this one account (§5c) — and in the
                fixed-width face its table column uses. */}
            <dl className="grid gap-4 rounded-xl border border-edge-soft bg-surface-subtle p-4 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className={FACT_LABEL}>Student</dt>
                <dd className="mt-1 break-words text-sm text-fg">{studentLabel}</dd>
              </div>
              <div className="min-w-0">
                <dt className={FACT_LABEL}>Class</dt>
                <dd className="mt-1 break-words text-sm text-fg">
                  Grade {reviewing.grade_level} - {reviewing.section}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className={FACT_LABEL}>Login ID</dt>
                <dd className="mt-1 break-words font-mono text-sm text-fg">{reviewing.login_id}</dd>
              </div>
              <div className="min-w-0">
                <dt className={FACT_LABEL}>Created by</dt>
                <dd className="mt-1 break-words text-sm text-fg">{reviewing.created_by_name || '—'}</dd>
              </div>
            </dl>

            {confirming ? (
              <div className={NOTICE_WARNING}>
                <i aria-hidden="true" className="fa-solid fa-triangle-exclamation mt-0.5" />
                <p className="min-w-0 flex-1">
                  <strong>
                    {decision === 'approve'
                      ? 'Approve this parent account?'
                      : 'Reject this parent account?'}
                  </strong>{' '}
                  This cannot be returned to pending afterward.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-fg-secondary">Decision</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'approve', label: 'Approve' },
                      { value: 'reject', label: 'Reject' },
                    ].map((option) => {
                      // A choice, not an action (DECISION_CHOSEN): the check
                      // mark and `aria-pressed` say which, not colour alone.
                      const chosen = decision === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={chosen}
                          onClick={() => setDecision(option.value)}
                          className={chosen ? DECISION_CHOSEN : buttonClass()}
                        >
                          {chosen ? (
                            <span aria-hidden="true" className="flex items-center justify-center">
                              <i className="fa-solid fa-check" />
                            </span>
                          ) : null}
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {decision === 'reject' ? (
                  <FormField
                    label="Reason"
                    as="textarea"
                    rows={3}
                    required
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(photoRemoving)}
        onClose={closePhotoRemove}
        title={photoRemoving ? `Remove photo — ${photoRemoving.name}` : ''}
        size="sm"
        closeOnBackdrop={!photoSaving}
        footer={
          <>
            <Button onClick={closePhotoRemove} disabled={photoSaving}>
              Cancel
            </Button>
            {/* The destructive fill: the file is deleted, with no undo. */}
            <Button variant="danger" onClick={submitPhotoRemove} loading={photoSaving}>
              Yes, remove the photo
            </Button>
          </>
        }
      >
        {photoRemoving ? (
          <div className="space-y-4">
            {photoError ? <ErrorAlert message={photoError} /> : null}
            <p className="text-sm text-fg-body">
              Remove the profile photo of <span className="font-semibold text-fg">{photoRemoving.name}</span>?
            </p>
            <p className="text-sm text-fg-muted">
              The photo is deleted and cannot be brought back; their initials show instead. They can
              upload a new one from their own Settings.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
