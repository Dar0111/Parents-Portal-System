import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import PasswordField from '../../components/PasswordField';
import StatusBadge from '../../components/StatusBadge';
import { usePageTitle } from '../../layout/usePageTitle';

// One student record. Still no Edit — PUT /api/students/:id is
// teacher_assignments-only and answers 403 to a teacher who can view but
// not write. An Edit button shown to an adviser-only teacher would be a
// dead end this UI invented. Create parent is always shown: the API has
// no assignment check on POST /users/parents, and hiding the button
// behind assignments would invent a narrower UI than the API. TCH-002
// still sees it on Jea and gets 409 (already linked). "Already has a
// parent" is that 409 — do not probe, do not invent a flag on GET.
//
// A separate route rather than a modal on the list: a student record is a
// destination — deep-linkable, back-buttonable, and reachable later from the
// attendance and grades pages. It therefore fetches GET /:id itself instead of
// reusing a row handed over by the list, so a direct URL load works with no
// list in memory.
//
// WHEN EDITING IS BUILT: the button's visibility must key on the
// assigned-vs-adviser distinction, not merely on "is a teacher". That is the
// same 403-vs-404 split from routes/students.js surfacing in the UI for the
// first time — the API tells you which one you are only by refusing.

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

const EMPTY_PARENT = {
  name: '',
  password: '',
  confirmPassword: '',
  email: '',
  contact_number: '',
};

export default function StudentDetailPage() {
  const { id } = useParams();

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notInScope, setNotInScope] = useState(false);

  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [parent, setParent] = useState(EMPTY_PARENT);
  const [revealed, setRevealed] = useState({ password: false, confirm: false });

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

  function openCreate() {
    setParent(EMPTY_PARENT);
    setConfirming(false);
    setFormError(null);
    setRevealed({ password: false, confirm: false });
    setSaveError(null);
    setSaveMessage(null);
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
    if (parent.password.length < 6) {
      setFormError('New password must be at least 6 characters.');
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
    setSaveError(null);
    setSaveMessage(null);
    try {
      const body = {
        lrn: student.lrn,
        password: parent.password,
        name: parent.name.trim(),
      };
      if (parent.email.trim()) body.email = parent.email.trim();
      if (parent.contact_number.trim()) body.contact_number = parent.contact_number.trim();

      const { message } = await api.post('/users/parents', body, { unwrap: ['user', 'message'] });
      setSaveMessage(message);
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

      {saveError ? (
        <ErrorAlert message={saveError} />
      ) : saveMessage ? (
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
              hint="At least 6 characters."
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
