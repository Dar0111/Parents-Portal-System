import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import { usePageTitle } from '../../layout/usePageTitle';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [saveMessage, setSaveMessage] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);
  const [draft, setDraft] = useState(EMPTY_EDIT);

  usePageTitle(student ? `${student.first_name} ${student.last_name}` : 'Student');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const row = await api.get(`/students/${id}`, { unwrap: 'student' });
      setStudent(row);
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
    setEditError(null);
    setSaveMessage(null);
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
    setSaveMessage(null);
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
      setSaveMessage(message);
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
      to="/admin/students"
      className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900"
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

      {saveMessage ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <i className="fa-solid fa-circle-check text-emerald-600" />
          <p className="text-sm text-emerald-800">{saveMessage}</p>
        </div>
      ) : null}

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
            <button
              type="button"
              onClick={openEdit}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
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
              form="admin-student-edit-form"
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
    </div>
  );
}
