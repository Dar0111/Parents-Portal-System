import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass, linkClass } from '../../components/buttonClass';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import { longDate, shortDate } from '../../format/date';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormField, { filterFieldClass, filterSelectClass } from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import SectionHeader from '../../components/SectionHeader';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';
import Reveal from '../../motion/Reveal';

// The picker value for "Everything I recorded" — a string, so it can never
// collide with a section id and `Number()` is never called on it.
const MINE = 'mine';

// Teacher attendance RECORDS — read-only past rows. Encoding is the other
// page (/teacher/attendance). This is a sibling, not a tab or a mode.
//
// Attendance is the ADVISER's job (Stage B1). Section list is the same
// source as the encode page: GET /sections filtered on adviser_id, not
// teacher_assignments, not useTeacherTargets, not GET /assignments.
//
// "EVERYTHING I RECORDED" (pre-Stage-5 #6, 2026-09-26). The server's teacher
// scope is now "rows I recorded OR learners currently in a section I
// advise", so a former adviser keeps the days they wrote for a learner who
// has since moved. Those rows carry the learner's CURRENT class, so a
// section filter can never surface them — this option sends NO grade_level
// or section, the API returns the whole per-row union, and the class
// column names each row's class. It is also the only view a teacher who
// advises nothing today can have of what they recorded before. Print CSS
// (UI-D-1) applies unchanged.
//
// GET /attendance (unwrap 'attendance') with grade_level + section.name
// and optional from/to. Never send `date` — that param swallows the
// range. One row per student per date, as the SELECT returns.
//
// READ ONLY. PUT /api/attendance/:id exists and is not called. A teacher
// who needs to fix a past day opens Attendance and re-submits; POST /bulk
// is ON DUPLICATE KEY UPDATE (§5e).
//
// §5b: `rows` come from the last successful GET only. There is no marks
// object. §5c: LRN is not in this payload and is not invented. recorded_by
// is a user id and is not rendered (GET /users/:id is admin-only).
//
// §5i sentence is always on the page, not gated on a loaded section — since
// feat/ui-refresh it is the section header's description, so it sits under
// the title in all three states (error, loading, the list).
//
// RELOAD (feat/ui-refresh) is `load` itself: the same GET with the APPLIED
// section and dates, the current page and the current sort. It never commits
// a staged filter — the drafts are separate state and `load` does not read
// them — and it still never sends `date`. The table's own frame shows the
// loading and error states, as on the first load.

export default function AttendanceRecordsPage() {
  usePageTitle('Attendance records');
  const { user } = useAuth();

  const [sections, setSections] = useState(null);
  const [sectionsError, setSectionsError] = useState(null);
  const [sectionId, setSectionId] = useState(null);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // SECTION IS IN HERE NOW (item 5, 2026-09-25), and it fixes a real defect
  // rather than only tidying the shape. It used to write `sectionId` straight
  // through: it bypassed `applied` while still being a `load` dependency, AND
  // it never called `setOffset(0)` — so switching section on page 3 refetched
  // the NEW section at offset 100, against this page's own note that "a filter
  // or sort change resets to the first page (C6)".
  //
  // The visible trade: the Section select now waits for Apply like the dates
  // beside it, where before it applied instantly. That is the consistency the
  // cue depends on — a bar where one control commits and two stage cannot
  // honestly say "Changes not applied".
  const [appliedSectionId, setAppliedSectionId] = useState(null);
  const [applied, setApplied] = useState({ from: '', to: '' });

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/sections', { unwrap: 'sections' })
      .then((all) => {
        if (cancelled) return;
        const mine = all.filter((s) => s.adviser_id === user?.id);
        setSections(mine);
        // The first advisory section is both the draft AND the applied value
        // on arrival: the page fetches immediately, so there is nothing
        // staged and the cue must not appear before the reader has touched
        // anything. A teacher who advises nothing lands on "Everything I
        // recorded" — the one view they can have (#6).
        const initial = mine.length ? mine[0].id : MINE;
        setSectionId(initial);
        setAppliedSectionId(initial);
      })
      .catch((err) => {
        if (!cancelled) setSectionsError(extractError(err));
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // THE FETCH READS THE APPLIED SECTION, never the draft — that is the whole
  // point of moving it. The select's own value is still `sectionId`.
  const section = useMemo(
    () => (sections || []).find((s) => s.id === appliedSectionId) || null,
    [sections, appliedSectionId]
  );
  const showingMine = appliedSectionId === MINE;

  // Paged table (2026-09-19): one page of a server-sorted list (C1); a
  // filter or sort change resets to the first page (C6).
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  const load = useCallback(async () => {
    if (!section && !showingMine) return;

    setLoading(true);
    setError(null);
    try {
      // "Everything I recorded" sends no class at all — the server's per-row
      // scope is the whole filter (#6).
      const params = {
        ...(section ? { grade_level: section.grade_level, section: section.name } : {}),
        ...listParams({ offset, sort }),
      };
      // Never send `date`. That branch ignores from/to.
      if (applied.from) params.from = applied.from;
      if (applied.to) params.to = applied.to;

      const result = await api.get('/attendance', { unwrap: ['attendance', 'page'], params });
      setRows(result.attendance);
      setPage(result.page);
    } catch (err) {
      setError(extractError(err));
      setRows([]);
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [section, showingMine, applied, offset, sort]);

  useEffect(() => {
    load();
  }, [load]);

  function changeSort(next) {
    setSort(next);
    setOffset(0);
  }

  function resetFilters() {
    setFrom('');
    setTo('');
    setOffset(0);
    setApplied({ from: '', to: '' });
    // Reset clears the DATES and puts the Section DRAFT back to what is
    // applied — it does not change the applied section, because there is no
    // "no section" state (the page always shows one advisory class).
    //
    // The second half is item 5b, after the code review: item 5 reset the
    // dates only, so a staged section change survived Reset — the cue and the
    // filled Apply persisted right after the user asked to reset. Every other
    // page's reset leaves draft === applied; this one now does too.
    setSectionId(appliedSectionId);
  }

  // ASSEMBLED ONCE, read by BOTH `isDirty` and the submit handler. Building
  // it twice is how the cue and the commit drift apart, which is §5b in
  // miniature: two derivations of one truth.
  const draftFilters = { sectionId, from, to };
  const appliedFilters = { sectionId: appliedSectionId, from: applied.from, to: applied.to };
  const dirty = isDirty(draftFilters, appliedFilters);

  const hasDateRange = Boolean(applied.from || applied.to);
  const canReset = hasDateRange;

  const emptyState = hasDateRange
    ? {
        icon: 'fa-filter',
        title: 'No records match these dates',
        message: 'Try a different date range, or reset to see every recorded day.',
        showReset: true,
      }
    : showingMine
      ? {
          icon: 'fa-clipboard-user',
          title: 'You have not recorded any attendance yet',
          message: 'Every day you save on Attendance appears here, even for learners who later move to another section.',
          showReset: false,
        }
      : {
          icon: 'fa-clipboard-user',
          title: 'No attendance recorded for this section yet',
          message: 'Records appear here after the adviser saves a day on Attendance.',
          showReset: false,
        };

  const columns = useMemo(
    () => [
      // A DATE column: the literal "2026-09-25" arrives as a string and
      // `shortDate` rewrites it as one (§5a-iv). DataTable sorts the raw row
      // value, so the column still sorts chronologically.
      // nowrap + tabular-nums: a date reads as one value and lines up down
      // the column (§5a-ii).
      {
        key: 'date',
        header: 'Date',
        sortable: true,
        nowrap: true,
        render: (row) => <span className="tabular-nums">{shortDate(row.date)}</span>,
      },
      {
        key: 'student',
        header: 'Student',
        sortable: true,
        sortValue: (row) => `${row.last_name}, ${row.first_name}`,
        render: (row) => (
          <span className="font-semibold text-fg">
            {row.last_name}, {row.first_name}
          </span>
        ),
      },
      // The class column is shown only for "Everything I recorded": a single
      // section's list would repeat one value forty times, while the union
      // needs it — a row's class is the learner's CURRENT one, which is what
      // a former adviser is reading across (#6). The value stays sortable as
      // the API's `class` key (grade, then section).
      ...(showingMine
        ? [
            {
              key: 'class',
              header: 'Class',
              sortable: true,
              nowrap: true,
              sortValue: (row) => `${row.grade_level}|${row.section}`,
              render: (row) => `Grade ${row.grade_level} - ${row.section}`,
            },
          ]
        : []),
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        render: (row) => <StatusBadge status={row.status} />,
      },
    ],
    [showingMine]
  );

  // The page's standing sentence, as the section header's description. The
  // link is the shared text link (`linkClass`): brand colour, underlined on
  // hover, the shared keyboard outline.
  const hint = (
    <>
      To change a mark, open{' '}
      <Link to="/teacher/attendance" className={linkClass}>
        Attendance
      </Link>{' '}
      and pick that date.
    </>
  );

  // ONE <Reveal> AT THE ROOT OF ALL THREE RETURNS (feat/ui-refresh): the same
  // component in the same position, so React keeps the one instance and the
  // entrance plays once — when the page arrives — not again when the sections
  // finish loading. The header carries Reload only in the third return, where
  // there is a list to reload.
  if (sectionsError) {
    return (
      <Reveal className="space-y-6">
        <section className="space-y-3">
          <SectionHeader title="Records" description={hint} />
          <ErrorAlert message={sectionsError} onRetry={() => window.location.reload()} />
        </section>
      </Reveal>
    );
  }

  if (sections === null) {
    return (
      <Reveal className="space-y-6">
        <section className="space-y-3">
          <SectionHeader title="Records" description={hint} />
          <div className={cardClass}>
            <LoadingSpinner className="py-16" label="Loading your sections…" />
          </div>
        </section>
      </Reveal>
    );
  }

  // A teacher with no advisory section is NOT sent away any more (#6): the
  // picker holds "Everything I recorded" alone, and the empty state below
  // says what would appear there. The page's own §5i sentence still holds.

  return (
    <Reveal className="space-y-6">
      <section className="space-y-3">
        <SectionHeader
          title="Records"
          description={hint}
          onReload={load}
          reloading={loading}
          reloadLabel="Reload attendance records"
        />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setOffset(0);
            setAppliedSectionId(sectionId);
            setApplied({ from, to });
          }}
          className={`${cardClass} flex flex-wrap items-end gap-3 p-4`}
        >
          {/* Always a select since #6 — even one advisory section is two
              choices with "Everything I recorded" beside it. The option's
              value is the MINE sentinel, never a section id.

              A real <label> since feat/ui-refresh: "Section" used to be a
              bare paragraph above an unlabelled <select>, so the control had
              no accessible name. */}
          <FormField
            label="Section"
            as="select"
            className={filterSelectClass}
            value={sectionId ?? ''}
            onChange={(e) => setSectionId(e.target.value === MINE ? MINE : Number(e.target.value))}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                Grade {s.grade_level} - {s.name}
              </option>
            ))}
            <option value={MINE}>Everything I recorded</option>
          </FormField>

          <FormField
            label="From"
            type="date"
            className={filterFieldClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <FormField
            label="To"
            type="date"
            className={filterFieldClass}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <FilterActions dirty={dirty} canReset={canReset} onReset={resetFilters} />
        </form>

        <DataTable
          // RECORD CARD (DV1b-a). Read-only by design: this is the sibling
          // route to the encode screen, and the correction path is that screen,
          // not this one — so no `to`, no `onSelect`, no chevron.
          //
          // The learner leads and the date is meta, not the other way round: a
          // teacher scanning this list is looking for a person. There is no
          // subtitle, because the only other fact is the status and that is the
          // badge.
          renderCard={(row) => ({
            avatar: `${row.first_name} ${row.last_name}`,
            title: `${row.last_name}, ${row.first_name}`,
            meta: longDate(row.date),
            status: row.status,
          })}
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={load}
          page={page}
          onPageChange={setOffset}
          sort={sort}
          onSortChange={changeSort}
          emptyIcon={emptyState.icon}
          emptyTitle={emptyState.title}
          emptyMessage={emptyState.message}
          emptyAction={
            emptyState.showReset ? (
              <Button variant="secondary" onClick={resetFilters}>
                Reset
              </Button>
            ) : null
          }
        />
      </section>
    </Reveal>
  );
}
