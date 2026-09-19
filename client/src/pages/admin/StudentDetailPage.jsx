import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import { usePageTitle } from '../../layout/usePageTitle';
import { contactError, contactRuleHint } from '../../format/contactRule';

// One student record, admin view. Same shape as Teacher → Students detail,
// minus everything that exists because a teacher is scoped:
//   - No GET /assignments and no canEdit. PUT /api/students/:id is
//     admin-unscoped, so Edit always shows.
//   - No "not in your classes" branch. For admin, GET /:id 404s only for a
//     student that does not exist.
//   - No "Create parent account". POST /users/parents is authorize('teacher')
//     and answers an admin 403. The pending queue is Admin → Users.
//   - No status control. Deactivate/Activate lives on the list (it matches
//     Admin → Users, and a filter decides whether the row stays visible).
//
// §5b: `student` renders from load() or from the PUT response. Never from
// the draft.

// DISPLAY CASING ONLY — convention 5d. Applied at the value (gender is
// stored lowercase), not inside Field. Third copy of this helper after
// StatusBadge.jsx and teacher/StudentDetailPage.jsx: the recorded trigger to
// move all three to client/src/format/text.js. Not done here — that is a
// three-file refactor outside this dispatch's whitelist.
function titleCase(value) {
  return typeof value === 'string' && value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function Field({ label, value, empty = 'Not recorded' }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-1 text-sm text-fg">
        {value || <span className="text-fg-muted">{empty}</span>}
      </dd>
    </div>
  );
}

const EMPTY_EDIT = {
  first_name: '',
  last_name: '',
  birthday: '',
  gender: '',
  address: '',
  contact_number: '',
};

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

export default function StudentDetailPage() {
  const { id } = useParams();

  const [student, setStudent] = useState(null);
  // { id, status } or null, from GET /students/:id (2026-09-18); load() is
  // the only writer (§5b). Admin has no create button — it says which it is.
  const [parentAccount, setParentAccount] = useState(null);
  // Field-level refusals in the edit modal — the client contact rule's or the
  // server's 400 with a `field` key — render under their input (§7c).
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);


  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // Keyed status. `edit` renders INSIDE the modal, under its action row —
  // that is where the Save button is. `record` is the success that OUTLIVES
  // the modal ("Student updated."), so it belongs to the record it describes
  // and renders above the card. See FormStatus.
  const [status, setStatus] = useState({});
  const [draft, setDraft] = useState(EMPTY_EDIT);

  usePageTitle(student ? `${student.first_name} ${student.last_name}` : 'Student');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const row = await api.get(`/students/${id}`, { unwrap: ['student', 'parent_account'] });
      setStudent(row.student);
      setParentAccount(row.parent_account);
    } catch (err) {
      if (err?.response?.status === 404) {
        setNotFound(true);
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

  function openEdit() {
    if (!student) return;
    setDraft(draftFrom(student));
    setStatus({});
    setFieldErrors({});
    setEditOpen(true);
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditOpen(false);
    setStatus({});
    setFieldErrors({});
    setDraft(EMPTY_EDIT);
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!student) return;
    setStatus({});
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setStatus({ edit: fail('First name and last name are required.') });
      return;
    }
    const contactProblem = contactError(draft.contact_number);
    if (contactProblem) {
      setFieldErrors({ contact_number: contactProblem });
      return;
    }
    setSavingEdit(true);
    try {
      // Six fields only. grade_level and section are omitted (a differing
      // pair is a 400; omitting cannot trip it). lrn, status and section_id
      // are ignored by the server — not sent.
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
      setStudent(updated);
      setStatus({ record: ok(message) });
      setEditOpen(false);
      setDraft(EMPTY_EDIT);
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field) setFieldErrors({ [field]: extractError(err) });
      else setStatus({ edit: fail(extractError(err)) });
    } finally {
      setSavingEdit(false);
    }
  }

  const backLink = (
    <Link
      to="/admin/students"
      className="inline-flex items-center gap-2 text-sm text-fg-muted transition hover:text-fg"
    >
      <i className="fa-solid fa-arrow-left" />
      All students
    </Link>
  );

  if (loading) return <LoadingSpinner className="py-16" label="Loading student…" />;

  if (notFound) {
    return (
      <div className="space-y-4">
        {backLink}
        <EmptyState
          icon="fa-user-slash"
          title="Student not found"
          message="No student record exists with this id."
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

      <div className="rounded-xl border border-edge bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-edge pb-4">
          <div>
            <h2 className="text-lg font-semibold text-fg">
              {student.last_name}, {student.first_name}
            </h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              Grade {student.grade_level} - {student.section}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={student.status} />
            <button
              type="button"
              onClick={openEdit}
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm font-medium text-fg-secondary transition hover:bg-surface-muted"
            >
              Edit
            </button>
          </div>
        </div>

        {/* Same fields as the teacher view. Omitted: section_id (internal FK),
            created_by (a raw user id), timestamps (bookkeeping). */}
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="LRN" value={student.lrn} />
          <Field label="Birthday" value={student.birthday} />
          <Field label="Gender" value={titleCase(student.gender)} />
          <Field label="Contact number" value={student.contact_number} />
          {/* Which it is, not a button: POST /users/parents is teacher-only.
              users.status of the linked account; "None" = no account yet. */}
          <Field
            label="Parent account"
            value={parentAccount ? titleCase(parentAccount.status) : null}
            empty="None"
          />
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
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="admin-student-edit-form"
              disabled={savingEdit}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:opacity-60"
            >
              {savingEdit ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              Save
            </button>
          </>
        }
      >
        <div className="max-h-[70vh] overflow-y-auto">
          <FormStatus status={status.edit} className="mb-3" />

          <form id="admin-student-edit-form" onSubmit={submitEdit} className="space-y-3">
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
            {/* §5i: word for word the Teacher → Students copy. Two pages
                disagreeing about whether a class can change is worse than
                either wording. The school question behind a move is open. */}
            <p className="text-sm text-fg-muted">
              A student's class cannot be changed here. The system does not support moving a
              student between classes.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Birthday"
                type="date"
                value={draft.birthday}
                onChange={(e) => {
                  setFieldErrors((prev) => ({ ...prev, birthday: null }));
                  setDraft((prev) => ({ ...prev, birthday: e.target.value }));
                }}
                error={fieldErrors.birthday}
              />
              <FormField
                label="Gender"
                as="select"
                value={draft.gender}
                onChange={(e) => {
                  setFieldErrors((prev) => ({ ...prev, gender: null }));
                  setDraft((prev) => ({ ...prev, gender: e.target.value }));
                }}
                error={fieldErrors.gender}
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
              onChange={(e) => {
                setFieldErrors((prev) => ({ ...prev, contact_number: null }));
                setDraft((prev) => ({ ...prev, contact_number: e.target.value }));
              }}
              maxLength={20}
              inputMode="tel"
              hint={contactRuleHint()}
              error={fieldErrors.contact_number}
            />
          </form>
        </div>
      </Modal>
    </div>
  );
}
