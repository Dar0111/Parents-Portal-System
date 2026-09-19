import { useCallback, useEffect, useState } from 'react';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField, { filterSelectClass } from '../../components/FormField';
import PasswordField from '../../components/PasswordField';
import PasswordChecklist from '../../components/PasswordChecklist';
import { passwordIsValid, passwordRuleHint } from '../../format/passwordRule';
import { contactError, contactRuleHint } from '../../format/contactRule';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
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

const EMPTY_TEACHER = {
  login_id: '',
  password: '',
  name: '',
  email: '',
  contact_number: '',
};

const EMPTY_EDIT = { name: '', email: '', contact_number: '' };

const ROLE_FILTERS = ['', 'parent', 'teacher', 'admin'];
const STATUS_FILTERS = ['', 'pending', 'active', 'rejected', 'inactive'];

function displayRole(role) {
  if (typeof role !== 'string' || !role) return '';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function UsersPage() {
  usePageTitle('Users');
  const { user: me, refresh: refreshMe } = useAuth();

  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({ role: '', status: '', search: '' });

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
    setApplied({ role, status, search: search.trim() });
  }

  function resetFilters() {
    setRole('');
    setStatus('');
    setSearch('');
    setLoading(true);
    setOffset(0);
    setApplied({ role: '', status: '', search: '' });
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
      await api.post(
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
      setFormStatus({ directory: ok('Teacher account created and activated.') });
      await load();
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'password') {
        setPasswordError(extractError(err));
      } else if (field === 'contact_number') {
        setCreateContactError(extractError(err));
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
        render: (row) => <span className="font-medium text-fg">{row.name}</span>,
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
        render: (row) => `Grade ${row.grade_level} - ${row.section}`,
      },
      {
        key: 'login_id',
        header: 'Login ID',
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
        render: (row) => (
          <button
            type="button"
            onClick={() => openReview(row)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
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
        render: (row) => (
          <div>
            <div className="font-medium text-fg">{row.name}</div>
            {row.id === me?.id ? <div className="text-xs text-fg-muted">You</div> : null}
          </div>
        ),
      },
      { key: 'login_id', header: 'Login ID', sortable: true },
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
        render: (row) => {
          const busy = statusSavingId === row.id;
          const canToggle = row.status === 'active' || row.status === 'inactive';
          const isSelf = row.id === me?.id;
          return (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => openEdit(row)}
                className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
              >
                Edit
              </button>
              {/* Hidden on your own row: the handler answers 400 "Use Change
                  password for your own account.", same shape as the
                  self-deactivate guard beside it. */}
              {isSelf ? null : (
                <button
                  type="button"
                  onClick={() => openReset(row)}
                  className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
                >
                  Reset password
                </button>
              )}
              {canToggle && isSelf && row.status === 'active' ? (
                <span className="text-xs text-fg-muted">You cannot deactivate yourself</span>
              ) : null}
              {canToggle && !(isSelf && row.status === 'active') ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setUserStatus(row, row.status === 'active' ? 'inactive' : 'active')}
                  className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
                >
                  {busy ? (
                    <i className="fa-solid fa-circle-notch fa-spin" />
                  ) : row.status === 'active' ? (
                    'Deactivate'
                  ) : (
                    'Activate'
                  )}
                </button>
              ) : null}
            </div>
          );
        },
      },
    ];

  const studentLabel = reviewing
    ? `${reviewing.student_first_name} ${reviewing.student_last_name}`
    : '';

  return (
    <div className="space-y-6">
      {error ? <ErrorAlert message={error} onRetry={load} /> : null}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-fg">Waiting for approval</h2>
        <p className="text-sm text-fg-muted">
          A parent account stays pending until it is approved or rejected. That decision cannot be
          returned to pending afterward.
        </p>
        <FormStatus status={formStatus.pending} />

        <DataTable
          columns={pendingColumns}
          rows={pending}
          loading={loading}
          page={pendingPage}
          onPageChange={setPendingOffset}
          sort={pendingSort}
          onSortChange={changePendingSort}
          emptyIcon="fa-envelope-open-text"
          emptyTitle="No parent accounts waiting for approval"
          emptyMessage="A teacher creates the account. It appears here until you approve or reject it."
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">All accounts</h2>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
          >
            Create teacher
          </button>
        </div>

        <form
          onSubmit={applyFilters}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-surface p-4"
        >
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
          >
            Apply
          </button>
          {canReset ? (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-edge-strong px-4 py-2 text-sm text-fg-body transition hover:bg-surface-muted"
            >
              Reset
            </button>
          ) : null}
        </form>

        <FormStatus status={formStatus.directory} />

        <DataTable
          columns={userColumns}
          rows={users}
          loading={loading}
          page={page}
          onPageChange={setOffset}
          sort={sort}
          onSortChange={changeSort}
          emptyIcon={directoryEmpty.icon}
          emptyTitle={directoryEmpty.title}
          emptyMessage={directoryEmpty.message}
          emptyAction={
            directoryEmpty.showReset ? (
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
              >
                Reset filters
              </button>
            ) : null
          }
        />
      </section>

      <Modal
        open={creating}
        onClose={closeCreate}
        title="Create teacher"
        closeOnBackdrop={!createSaving}
        footer={
          <>
            <button
              type="button"
              onClick={closeCreate}
              disabled={createSaving}
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-teacher-form"
              disabled={createSaving || !passwordIsValid(teacherForm.password)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:opacity-60"
            >
              {createSaving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              Create
            </button>
          </>
        }
      >
        <form id="create-teacher-form" onSubmit={submitCreate} className="space-y-3">
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
            onChange={(e) => setTeacherForm((f) => ({ ...f, email: e.target.value }))}
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
            <button
              type="button"
              onClick={closeEdit}
              disabled={editSaving}
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-user-form"
              disabled={editSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:opacity-60"
            >
              {editSaving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              Save
            </button>
          </>
        }
      >
        {editing ? (
          <form id="edit-user-form" onSubmit={submitEdit} className="space-y-3">
            {editError ? <ErrorAlert message={editError} /> : null}
            <p className="text-sm text-fg-muted">
              Login ID <span className="font-medium text-fg-secondary">{editing.login_id}</span> and
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
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
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
            <button
              type="button"
              onClick={closeReset}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
            >
              Done — I have given it to them
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={closeReset}
                disabled={resetSaving}
                className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReset}
                disabled={resetSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:opacity-60"
              >
                {resetSaving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
                Yes, set a temporary password
              </button>
            </>
          )
        }
      >
        {resetting ? (
          <div className="space-y-3">
            {resetError ? <ErrorAlert message={resetError} /> : null}
            {tempPassword ? (
              <>
                <p className="text-sm text-fg-body">
                  Give this to <span className="font-medium text-fg">{resetting.name}</span>. They
                  will be asked to choose their own password the next time they sign in.
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-edge bg-surface-subtle px-3 py-2">
                  <code className="flex-1 break-all font-mono text-sm text-fg">{tempPassword}</code>
                  <button
                    type="button"
                    onClick={copyTempPassword}
                    className="shrink-0 rounded-lg border border-edge-strong px-2 py-1 text-xs text-fg-body transition hover:bg-surface-muted"
                  >
                    {tempCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-strong">
                  This is shown once. It is not stored anywhere in readable form and cannot be
                  looked up again — if you close this without passing it on, set another one.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-fg-body">
                  Set a temporary password for{' '}
                  <span className="font-medium text-fg">{resetting.name}</span>?
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
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={reviewSaving}
                className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={submitReview}
                disabled={reviewSaving}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-solid-fg transition disabled:opacity-60 ${
                  decision === 'approve'
                    ? 'bg-success-solid hover:bg-success-solid-hover'
                    : 'bg-danger-solid hover:bg-danger-solid-hover'
                }`}
              >
                {reviewSaving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
                Yes, {decision === 'approve' ? 'approve' : 'reject'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={closeReview}
                className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!decision}
                onClick={tryConfirm}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary-disabled"
              >
                Continue
              </button>
            </>
          )
        }
      >
        {reviewing ? (
          <div className="space-y-4">
            {reviewError ? <ErrorAlert message={reviewError} /> : null}
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Student</dt>
                <dd className="mt-0.5 text-sm text-fg">{studentLabel}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Class</dt>
                <dd className="mt-0.5 text-sm text-fg">
                  Grade {reviewing.grade_level} - {reviewing.section}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Login ID</dt>
                <dd className="mt-0.5 text-sm text-fg">{reviewing.login_id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Created by</dt>
                <dd className="mt-0.5 text-sm text-fg">{reviewing.created_by_name || '—'}</dd>
              </div>
            </dl>

            {confirming ? (
              <p className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2 text-sm text-warning-strong">
                <strong>
                  {decision === 'approve'
                    ? 'Approve this parent account?'
                    : 'Reject this parent account?'}
                </strong>{' '}
                This cannot be returned to pending afterward.
              </p>
            ) : (
              <>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-fg-secondary">Decision</p>
                  <div className="flex gap-2">
                    {[
                      { value: 'approve', label: 'Approve' },
                      { value: 'reject', label: 'Reject' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDecision(option.value)}
                        className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                          decision === option.value
                            ? 'border-primary bg-primary font-medium text-primary-fg'
                            : 'border-edge-strong text-fg-body hover:bg-surface-muted'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
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
    </div>
  );
}
