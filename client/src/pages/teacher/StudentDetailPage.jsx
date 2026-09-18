import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok } from '../../components/FormStatus';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import PasswordField from '../../components/PasswordField';
import { passwordIsValid, passwordRuleHint } from '../../format/passwordRule';
import StatusBadge from '../../components/StatusBadge';
import { usePageTitle } from '../../layout/usePageTitle';

// One student record. Edit is shown only when this student's class
// (grade_level + section, never section_id) appears in GET /assignments
// — the same write-scope signal StudentsPage uses for Enroll. Do not
// reuse useTeacherTargets (assigned-OR-adviser is the READ scope). Do
// not probe PUT. An adviser-only teacher gets muted copy, not a button
// that 403s. Create parent stays always shown: the API has no assignment
// check on POST /users/parents, and hiding it would invent a narrower UI
// than the API. TCH-002 still sees it on Jea and gets 409 (already
// linked). "Already has a parent" is that 409 — do not probe, do not
// invent a flag on GET.
//
// A separate route rather than a modal on the list: a student record is a
// destination — deep-linkable, back-buttonable, and reachable later from the
// attendance and grades pages. It therefore fetches GET /:id itself instead of
// reusing a row handed over by the list, so a direct URL load works with no
// list in memory.
//
// Two Modals, not one with a mode. Create parent is two-phase and
// irreversible. Edit is one-phase and reversible. Sharing open /
// confirming / formError is how a page grows a mode enum nobody can read.

// DISPLAY CASING ONLY — see CLAUDE.md convention 5d. Applied at the value, not
// inside Field: capitalising an address or an LRN would be wrong, so only the
// fields whose stored form is lowercase by schema get it.
// TWIN: client/src/components/StatusBadge.jsx has an identical helper.
// Duplicated at two on purpose (dateFormat.js was extracted at the third
// occurrence); a third occurrence moves both to client/src/format/text.js.
function titleCase(value) {
  return typeof value === 'string' && value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">
        {value || <span className="text-slate-400">Not recorded</span>}
      </dd>
    </div>
  );
}

function assignmentMatchesStudent(row, student) {
  return (
    Number(row.grade_level) === Number(student.grade_level) && String(row.section) === String(student.section)
  );
}

function draftFrom(row) {
  return {
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    birthday: row.birthday || '',
    gender: row.gender || '',
    address: row.address || '',
    contact_number: row.contact_number || '',
  };
}

const EMPTY_PARENT = {
  name: '',
  password: '',
  confirmPassword: '',
  email: '',
  contact_number: '',
};

const EMPTY_EDIT = {
  first_name: '',
  last_name: '',
  birthday: '',
  gender: '',
  address: '',
  contact_number: '',
};

export default function StudentDetailPage() {
  const { id } = useParams();

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notInScope, setNotInScope] = useState(false);
  const [assignments, setAssignments] = useState([]);

  // Keyed status, one key. Both modals report their own failures inside
  // themselves (formError on create-parent, editError on edit) — already the
  // right place. What survives a modal closing is the success, and it
  // describes the record, so it renders above the card.
  //
  // `saveError` was dead state here too: only ever set to null. Removed.
  const [status, setStatus] = useState({});

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [parent, setParent] = useState(EMPTY_PARENT);
  const [revealed, setRevealed] = useState({ password: false, confirm: false });

  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);
  const [draft, setDraft] = useState(EMPTY_EDIT);

  // Falls back to a neutral title until the record loads, so the header never
  // flashes an id or an empty string.
  usePageTitle(student ? `${student.first_name} ${student.last_name}` : 'Student');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotInScope(false);

    try {
      const row = await api.get(`/students/${id}`, { unwrap: 'student' });
      setStudent(row);
    } catch (err) {
      // 404 here is deliberate API design, not a missing record: routes/students.js
      // collapses "does not exist" and "outside your scope" into the same
      // response so a teacher cannot enumerate student ids by probing. The copy
      // must not undo that — it says neither "access denied" (which would
      // confirm the record exists) nor "not found" (which would deny it).
      if (err?.response?.status === 404) {
        setNotInScope(true);
      } else {
        setError(extractError(err));
      }
      setStudent(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Same fetch shape as StudentsPage Enroll: own effect, unwrap assignments,
  // no teacher_id, catch → []. A failed call looks like adviser-only.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/assignments', { unwrap: 'assignments' })
      .then((rows) => {
        if (!cancelled) setAssignments(rows);
      })
      .catch(() => {
        if (!cancelled) setAssignments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canEdit = useMemo(
    () => (student ? assignments.some((row) => assignmentMatchesStudent(row, student)) : false),
    [assignments, student]
  );

  function openCreate() {
    setParent(EMPTY_PARENT);
    setConfirming(false);
    setFormError(null);
    setRevealed({ password: false, confirm: false });
    setStatus({});
    setOpen(true);
  }

  function closeCreate() {
    if (saving) return;
    setOpen(false);
    setConfirming(false);
    setFormError(null);
    setParent(EMPTY_PARENT);
    setRevealed({ password: false, confirm: false });
  }

  function requestCreate(event) {
    event.preventDefault();
    setFormError(null);
    if (!parent.name.trim() || !parent.password) {
      setFormError('Guardian name and password are required.');
      return;
    }
    // One rule, one module (format/passwordRule.js); the server enforces it
    // on POST /users/parents and answers 400 with field "password".
    if (!passwordIsValid(parent.password)) {
      setFormError(`Password: ${passwordRuleHint()}`);
      return;
    }
    if (parent.password !== parent.confirmPassword) {
      setFormError('New password and confirmation do not match.');
      return;
    }
    setConfirming(true);
  }

  async function submitCreate() {
    if (!student?.lrn) return;
    setSaving(true);
    setFormError(null);
    setStatus({});
    try {
      const body = {
        lrn: student.lrn,
        password: parent.password,
        name: parent.name.trim(),
      };
      if (parent.email.trim()) body.email = parent.email.trim();
      if (parent.contact_number.trim()) body.contact_number = parent.contact_number.trim();

      const { message } = await api.post('/users/parents', body, { unwrap: ['user', 'message'] });
      setStatus({ record: ok(message) });
      setOpen(false);
      setConfirming(false);
      setParent(EMPTY_PARENT);
    } catch (err) {
      setFormError(extractError(err));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  function openEdit() {
    if (!student) return;
    setDraft(draftFrom(student));
    setEditError(null);
    setStatus({});
    setEditOpen(true);
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditOpen(false);
    setEditError(null);
    setDraft(EMPTY_EDIT);
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!student) return;
    setEditError(null);
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setEditError('First name and last name are required.');
      return;
    }
    setSavingEdit(true);
    setStatus({});
    try {
      // Omit grade_level, section, lrn, status. A matching class pair works
      // today and is one more way to trip the 400 later. Omitting cannot.
      const { student: updated, message } = await api.put(
        `/students/${student.id}`,
        {
          first_name: draft.first_name.trim(),
          last_name: draft.last_name.trim(),
          birthday: draft.birthday.trim(),
          gender: draft.gender,
          address: draft.address.trim(),
          contact_number: draft.contact_number.trim(),
        },
        { unwrap: ['student', 'message'] }
      );
      // §5b: the card reads `student`. Writers are load() and this success
      // path. Never copy draft onto the record.
      setStudent(updated);
      setStatus({ record: ok(message) });
      setEditOpen(false);
      setDraft(EMPTY_EDIT);
    } catch (err) {
      setEditError(extractError(err));
    } finally {
      setSavingEdit(false);
    }
  }

  const backLink = (
    <Link
      to="/teacher/students"
      className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900"
    >
      <i className="fa-solid fa-arrow-left" />
      All students
    </Link>
  );

  if (loading) return <LoadingSpinner className="py-16" label="Loading student…" />;

  if (notInScope) {
    return (
      <div className="space-y-4">
        {backLink}
        <EmptyState
          icon="fa-user-slash"
          title="This student is not in your classes"
          message="You can only open students in the sections you teach or advise."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {backLink}
        <ErrorAlert message={error} onRetry={load} />
      </div>
    );
  }

  if (!student) return null;

  return (
    <div className="space-y-4">
      {backLink}

      <FormStatus status={status.record} />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {student.last_name}, {student.first_name}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Grade {student.grade_level} - {student.section}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={student.status} />
            {canEdit ? (
              <button
                type="button"
                onClick={openEdit}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Edit
              </button>
            ) : (
              <p className="max-w-sm text-sm text-slate-500">
                Editing a student is limited to classes you are assigned to teach. Advising a
                section is not enough.
              </p>
            )}
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Create parent account
            </button>
          </div>
        </div>

        {/* Shown: what a teacher needs to identify a learner and contact their
            guardian about an absence — the module's actual purpose.
            Deliberately omitted: section_id (an internal FK), created_by (a raw
            user id, and provenance rather than student information), and
            created_at/updated_at (record bookkeeping, not the student). */}
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="LRN" value={student.lrn} />
          <Field label="Birthday" value={student.birthday} />
          {/* Status is NOT repeated here — the badge in the header above
              already carries it, is scannable, and matches how status reads on
              the list. Repeating it in the definition list read as duplication
              rather than as two facts. */}
          <Field label="Gender" value={titleCase(student.gender)} />
          <Field label="Contact number" value={student.contact_number} />
          <div className="sm:col-span-2">
            <Field label="Address" value={student.address} />
          </div>
        </dl>
      </div>

      <Modal
        open={editOpen}
        onClose={closeEdit}
        closeOnBackdrop={!savingEdit}
        title="Edit student"
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={closeEdit}
              disabled={savingEdit}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="detail-edit-form"
              disabled={savingEdit}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {savingEdit ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              Save
            </button>
          </>
        }
      >
        <div className="max-h-[70vh] overflow-y-auto">
          {editError ? <ErrorAlert message={editError} /> : null}

          <form id="detail-edit-form" onSubmit={submitEdit} className="space-y-3">
            <FormField label="LRN" value={student.lrn} disabled />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="First name"
                value={draft.first_name}
                onChange={(e) => setDraft((prev) => ({ ...prev, first_name: e.target.value }))}
                required
              />
              <FormField
                label="Last name"
                value={draft.last_name}
                onChange={(e) => setDraft((prev) => ({ ...prev, last_name: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Grade level" value={`Grade ${student.grade_level}`} disabled />
              <FormField label="Section" value={student.section} disabled />
            </div>
            {/* §5i: the fact plus the reason. Do not name a transfer route,
                imply one is coming, or tell them to ask someone. The school
                question behind a move is unanswered. */}
            <p className="text-sm text-slate-500">
              A student's class cannot be changed here. The system does not support moving a
              student between classes.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Birthday"
                type="date"
                value={draft.birthday}
                onChange={(e) => setDraft((prev) => ({ ...prev, birthday: e.target.value }))}
              />
              <FormField
                label="Gender"
                as="select"
                value={draft.gender}
                onChange={(e) => setDraft((prev) => ({ ...prev, gender: e.target.value }))}
              >
                <option value="">Not recorded</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </FormField>
            </div>
            <FormField
              label="Address"
              as="textarea"
              rows={2}
              value={draft.address}
              onChange={(e) => setDraft((prev) => ({ ...prev, address: e.target.value }))}
            />
            <FormField
              label="Contact number"
              value={draft.contact_number}
              onChange={(e) => setDraft((prev) => ({ ...prev, contact_number: e.target.value }))}
              maxLength={20}
              hint="Up to 20 characters."
            />
          </form>
        </div>
      </Modal>

      <Modal
        open={open}
        onClose={closeCreate}
        closeOnBackdrop={!saving}
        title={confirming ? 'Create this parent account?' : 'Create parent account'}
        size="md"
        footer={
          confirming ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (saving) return;
                  setConfirming(false);
                }}
                disabled={saving}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
                Yes, create parent account
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={closeCreate}
                disabled={saving}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="detail-parent-form"
                disabled={saving || !parent.confirmPassword.trim()}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                Continue
              </button>
            </>
          )
        }
      >
        {formError ? <ErrorAlert message={formError} /> : null}

        {confirming ? (
          <p className="text-sm text-slate-600">
            Create a pending parent account for {parent.name.trim()} (login ID {student.lrn})?
            An admin must approve it before they can log in. You cannot un-create it.
          </p>
        ) : (
          <form id="detail-parent-form" onSubmit={requestCreate} className="space-y-3">
            <FormField label="Login ID (child's LRN)" value={student.lrn} disabled />
            <FormField
              label="Guardian name"
              value={parent.name}
              onChange={(e) => setParent((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <PasswordField
              label="Password"
              value={parent.password}
              onChange={(e) => setParent((prev) => ({ ...prev, password: e.target.value }))}
              autoComplete="new-password"
              hint={passwordRuleHint()}
              revealed={revealed.password}
              onToggleReveal={() => setRevealed((prev) => ({ ...prev, password: !prev.password }))}
            />
            <PasswordField
              label="Confirm password"
              value={parent.confirmPassword}
              onChange={(e) => setParent((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              autoComplete="new-password"
              revealed={revealed.confirm}
              onToggleReveal={() => setRevealed((prev) => ({ ...prev, confirm: !prev.confirm }))}
            />
            <FormField
              label="Email"
              type="email"
              value={parent.email}
              onChange={(e) => setParent((prev) => ({ ...prev, email: e.target.value }))}
            />
            <FormField
              label="Contact number"
              value={parent.contact_number}
              onChange={(e) => setParent((prev) => ({ ...prev, contact_number: e.target.value }))}
              maxLength={20}
              hint="Up to 20 characters."
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
