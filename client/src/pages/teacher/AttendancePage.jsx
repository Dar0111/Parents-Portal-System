import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { fetchAll } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField, { controlClass, filterSelectClass } from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatusBadge from '../../components/StatusBadge';
import { todayLocalDateString } from '../../format/date';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher attendance ENCODE screen. Recording only — the history/past-records
// view is a separate page, deliberately not here.
//
// Attendance is the ADVISER's job, not the subject teacher's (Stage B1): the
// adviser records it once daily during Homeroom Guidance. So the section list
// comes from sections.adviser_id, not teacher_assignments.

// The attendance.status ENUM, verbatim from database/schema.sql. These four and
// nothing else — the API validates against the same list and 400s on anything
// other than these.
const STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

export default function AttendancePage() {
  usePageTitle('Attendance');
  const { user } = useAuth();

  const [sections, setSections] = useState(null);
  const [sectionsError, setSectionsError] = useState(null);
  const [sectionId, setSectionId] = useState(null);

  const [date, setDate] = useState(todayLocalDateString);

  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState(null);

  // student_id -> status. What the teacher has SELECTED and will submit.
  // Keyed by id, not row index, so sorting the table cannot scramble
  // half-entered work.
  const [marks, setMarks] = useState({});

  // student_id -> status, as it exists IN THE DATABASE for this date.
  //
  // These two are deliberately separate state, and the Recorded column must
  // never read from `marks`. It did once, and the bug was invisible on the
  // happy path: the badge tracked the dropdown, so the two columns were
  // structurally incapable of disagreeing — which is the only reason the
  // Recorded column exists. The damage showed up on FAILURE: when a POST was
  // rejected (403, server down, network), the page displayed the unsaved value
  // as recorded while the database still held the old one, so the teacher had
  // no way to see what was actually stored or what they were about to
  // overwrite, at exactly the moment that mattered most.
  //
  // loadRoster() is the ONLY writer. It runs on mount, on section/date change,
  // and after a SUCCESSFUL post — never from an input handler.
  const [recorded, setRecorded] = useState(new Map());

  const [saving, setSaving] = useState(false);
  // Keyed status, one key: the only write is the bulk submit, and it reports
  // directly under its own button at the bottom of the roster — not above the
  // table, where a long roster pushed it off-screen.
  //
  // This page rendered the error and the success as two SEPARATE blocks, so
  // both could show at once — the defect fixed on Teacher → Grades on
  // 2026-09-07 was still latent here. One value makes it unrepresentable.
  const [status, setStatus] = useState({});

  // --- advisory sections -------------------------------------------------
  // GET /api/sections is unscoped reference data (all 23 rows, every role), and
  // has no ?adviser_id filter, so the narrowing happens here. 23 rows makes
  // that free.
  useEffect(() => {
    let cancelled = false;

    api
      .get('/sections', { unwrap: 'sections' })
      .then((all) => {
        if (cancelled) return;
        const mine = all.filter((s) => s.adviser_id === user?.id);
        setSections(mine);
        if (mine.length) setSectionId(mine[0].id);
      })
      .catch((err) => {
        if (!cancelled) setSectionsError(extractError(err));
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const section = useMemo(
    () => (sections || []).find((s) => s.id === sectionId) || null,
    [sections, sectionId]
  );

  // --- roster + existing records for the chosen section/date -------------
  const loadRoster = useCallback(async () => {
    if (!section) return;

    setRosterLoading(true);
    setRosterError(null);
    setStatus({});

    try {
      // status=active deliberately: POST /bulk rejects an inactive student with
      // a 400, so filtering at fetch time makes that error unreachable rather
      // than something to handle after the teacher has already marked the row.
      // (Note the endpoint only matches 'inactive' and 'all' explicitly —
      // anything else, including this, falls to its active-only default. Passed
      // explicitly anyway to state intent at the call site.)
      // C2: a roster and the day's existing rows are COMPLETE sets — every
      // student of the class, every record for the date — so both page
      // through (fetchAll), never the first page.
      const [students, existing] = await Promise.all([
        fetchAll('/students', {
          unwrap: 'students',
          params: { grade_level: section.grade_level, section: section.name, status: 'active' },
        }),
        fetchAll('/attendance', {
          unwrap: 'attendance',
          params: { grade_level: section.grade_level, section: section.name, date },
        }),
      ]);

      const existingByStudent = new Map(existing.map((row) => [row.student_id, row.status]));

      setRoster(students);
      // marks starts as a copy of what is stored, then diverges as the teacher
      // edits. existingByStudent is the database's own view and is handed to
      // `recorded` directly — same data, two independent pieces of state.
      setMarks(Object.fromEntries(students.map((s) => [s.id, existingByStudent.get(s.id) || ''])));
      setRecorded(existingByStudent);
    } catch (err) {
      setRosterError(extractError(err));
      setRoster([]);
      setMarks({});
      setRecorded(new Map());
    } finally {
      setRosterLoading(false);
    }
  }, [section, date]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  // --- submit ------------------------------------------------------------
  const entries = useMemo(
    () =>
      roster
        .filter((s) => marks[s.id])
        .map((s) => ({ student_id: s.id, status: marks[s.id] })),
    [roster, marks]
  );

  const unsetCount = roster.length - entries.length;
  const isUpdate = recorded.size > 0;

  async function handleSubmit() {
    setSaving(true);
    setStatus({});

    try {
      await api.post(
        '/attendance/bulk',
        { section_id: section.id, date, entries },
        { unwrap: 'attendance' }
      );
      setStatus({
        roster: ok(
          `Attendance saved for ${entries.length} student${entries.length === 1 ? '' : 's'}.`
        ),
      });
      // Re-read rather than trusting local state: the response is the source of
      // truth for what is now recorded, and this is also what flips the button
      // to "Update attendance" without a special case.
      await loadRoster();
    } catch (err) {
      setStatus({ roster: fail(extractError(err)) });
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Student',
      sortable: true,
      sortValue: (row) => `${row.last_name}, ${row.first_name}`,
      render: (row) => (
        <span className="font-medium text-fg">
          {row.last_name}, {row.first_name}
        </span>
      ),
    },
    { key: 'lrn', header: 'LRN' },
    {
      key: 'recorded',
      header: 'Recorded',
      // THE DATABASE, never the dropdown. Reads `recorded`, which only
      // loadRoster() writes. If you find yourself reaching for `marks` here,
      // that is the bug this comment exists to prevent — the two columns have
      // to be able to disagree, otherwise this one is decoration.
      render: (row) =>
        recorded.has(row.id) ? (
          <StatusBadge status={recorded.get(row.id)} />
        ) : (
          <span className="text-sm text-fg-faint">Not recorded</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '11rem',
      render: (row) => (
        <select
          aria-label={`Attendance status for ${row.first_name} ${row.last_name}`}
          className={controlClass}
          value={marks[row.id] || ''}
          onChange={(e) => setMarks((m) => ({ ...m, [row.id]: e.target.value }))}
        >
          <option value="">—</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ),
    },
  ];

  // --- render ------------------------------------------------------------
  if (sectionsError) {
    return <ErrorAlert message={sectionsError} onRetry={() => window.location.reload()} />;
  }

  if (sections === null) {
    return <LoadingSpinner className="py-16" label="Loading your sections…" />;
  }

  if (!sections.length) {
    return (
      <EmptyState
        icon="fa-clipboard-user"
        title="You are not the adviser of any section"
        message="Attendance is recorded by the section adviser. An admin can assign you to a section from the Sections page."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-edge bg-surface p-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg-secondary">Section</p>
          {sections.length === 1 ? (
            // One advisory section is not a choice — a dropdown with a single
            // option would be a decision the teacher does not actually have.
            <p className="py-2 text-sm font-semibold text-fg">
              Grade {section?.grade_level} - {section?.name}
            </p>
          ) : (
            <FormField
              label={null}
              as="select"
              className={filterSelectClass}
              value={sectionId ?? ''}
              onChange={(e) => setSectionId(Number(e.target.value))}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Grade {s.grade_level} - {s.name}
                </option>
              ))}
            </FormField>
          )}
        </div>

        <FormField
          label="Date"
          type="date"
          value={date}
          // The input's value is ALREADY a local YYYY-MM-DD string and is sent
          // to the API verbatim — never parsed into a Date. max prevents a
          // future date in the UI; the API rejects one too.
          max={todayLocalDateString()}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        rows={roster}
        loading={rosterLoading}
        error={rosterError}
        onRetry={loadRoster}
        emptyIcon="fa-user-graduate"
        emptyTitle="No students in this section"
        emptyMessage="Students appear here once they are enrolled in this section."
      />

      {roster.length ? (
        <div className="flex flex-wrap items-center justify-end gap-4">
          {unsetCount > 0 ? (
            // Unset rows are omitted from the request, never defaulted to
            // Present — defaulting would invent attendance nobody entered.
            <p className="text-sm text-fg-muted">
              {unsetCount} of {roster.length} student{roster.length === 1 ? '' : 's'}{' '}
              {unsetCount === 1 ? 'has' : 'have'} no status and will not be submitted.
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || entries.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary-disabled"
          >
            {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
            {isUpdate ? 'Update attendance' : 'Save attendance'}
          </button>

          <FormStatus status={status.roster} />
        </div>
      ) : null}
    </div>
  );
}
