import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatusBadge from '../../components/StatusBadge';
import { usePageTitle } from '../../layout/usePageTitle';

// One student record, read only.
//
// A separate route rather than a modal on the list: a student record is a
// destination — deep-linkable, back-buttonable, and reachable later from the
// attendance and grades pages. It therefore fetches GET /:id itself instead of
// reusing a row handed over by the list, so a direct URL load works with no
// list in memory.
//
// NO EDIT AFFORDANCE, deliberately. Read scope here is assigned OR adviser,
// but PUT /api/students/:id is teacher_assignments-only and answers 403 to a
// teacher who can view but not write. An Edit button shown to an adviser-only
// teacher would be a dead end this UI invented.
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

export default function StudentDetailPage() {
  const { id } = useParams();

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notInScope, setNotInScope] = useState(false);

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
          <StatusBadge status={student.status} />
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
    </div>
  );
}
