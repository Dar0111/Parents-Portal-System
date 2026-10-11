import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { fetchAll } from '../../api/axios';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonClass';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField, { filterFieldClass, filterSelectClass } from '../../components/FormField';
import Modal from '../../components/Modal';
import {
  AttendanceRegisterSkeleton,
  RosterCardsSkeleton,
  RosterNoteSkeleton,
  RosterSaveBarSkeleton,
  RosterSummarySkeleton,
} from '../../components/SkeletonShapes';
import useSkeleton, { useQueryRows } from '../../hooks/useSkeleton';
import SectionHeader from '../../components/SectionHeader';
import { longDate, todayLocalDateString } from '../../format/date';
import { INITIAL_GUARD, transition as guardTransition } from './classRecord/backGuard';
import { setLeaveGuard } from '../../layout/leaveGuard';
import { rosterColumns } from './attendance/columns';
import {
  STATUS_ORDER,
  ROW_STATE_LABEL,
  rowState,
  pickStatus,
  markRestPresent,
  rosterCounts,
  unsavedCount,
} from './attendance/roster';
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
// ---------------------------------------------------------------------------
// THE ENCODE ROW IS A BESPOKE CARD LIST, NOT `renderCard` (DV1b-b)
// ---------------------------------------------------------------------------
// `renderCard` returns DATA and allows EXACTLY ONE interactive element, a real
// <Link> or <button> (§5a-iii). This row's control is four buttons and a row
// state — it cannot be expressed in that contract, and the contract is right
// to refuse it rather than grow a `control` slot for one caller (§7b's
// reasoning about `lg` being the ceiling).
//
// So this page leaves `DataTable` below `sm`, the same declared exemption the
// report card and the class summary take (§5a-v): the table renders from `sm`
// up, the card list below it, and each owns its own markup.
//
// THE FOUR BUTTONS REPLACE THE <select> ON DESKTOP TOO. A dropdown is one tap
// to open and one to choose, on every row of a forty-learner roster; four
// buttons are one. That is the actual cost the 390px complaint was measuring,
// and it does not disappear at desktop width.

// Tone per status, from the semantic tokens only (§8) — the mockup's hexes are
// illustrative. Selected carries a fill, a 2px border AND bold text, so the
// state never rests on colour alone (§4's reasoning, and DV4's strip).
//
// This one stays on the page because it IS markup. The logic lives in
// `attendance/roster.js`, which the proof imports.
//
// The same four tones colour the count chips in the toolbar (feat/ui-refresh),
// so a chip and the button it counts cannot drift apart.
const STATUS_TONE = {
  Present: 'border-success-edge bg-success-soft text-success-fg',
  Late: 'border-warning-edge bg-warning-soft text-warning-fg',
  Absent: 'border-danger-edge bg-danger-soft text-danger-fg',
  Excused: 'border-info-edge bg-info-soft text-info-fg',
};

// NOT `<Button>`, ON PURPOSE (feat/ui-refresh): the proof reads this markup —
// `aria-pressed`, the full word as the button's last child, `border-2` and
// `font-bold` on the selected one, `h-11` — so it keeps its own classes. What
// the refresh gave it is the shared 12px corner, the shared keyboard outline,
// and 8px between the four targets (it was 6). The colour `transition` is the
// only one here and it is hover feedback: this page has NO motion.
export function StatusButtons({ student, marks, onPick, size = 'phone' }) {
  const current = marks[student.id] || '';
  return (
    <div
      role="group"
      aria-label={`Attendance status for ${student.first_name} ${student.last_name}`}
      className={size === 'phone' ? 'grid grid-cols-4 gap-2' : 'flex gap-2'}
    >
      {STATUS_ORDER.map((s) => {
        const on = current === s;
        return (
          <button
            key={s}
            type="button"
            // aria-pressed, not a radio group: a row may legitimately have NO
            // mark, and an unset radio group cannot express that.
            aria-pressed={on}
            onClick={() => onPick(student.id, s)}
            className={`h-11 rounded-lg border px-1 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent ${
              size === 'web' ? 'w-[5.5rem]' : ''
            } ${
              on
                ? `border-2 font-bold ${STATUS_TONE[s]}`
                : 'border-edge-strong bg-surface font-medium text-fg-body hover:bg-surface-muted'
            }`}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

// The phone list. Its own markup, not a DataTable card — see the note above.
// Each learner is one card (`cardClass`); the row state sits beside the name
// so a teacher scanning the list reads "who" and "saved or not" on one line.
export function RosterCards({ roster, marks, recorded, onPick }) {
  return (
    <ul className="space-y-3 sm:hidden">
      {roster.map((s) => {
        const state = rowState(s.id, marks, recorded);
        return (
          <li key={s.id} className={`${cardClass} p-4`}>
            {/* NO LRN ON THE PHONE CARD. It is half a credential (§5c), it is
                not what a teacher identifies a learner by while marking a
                register, and it costs a line on the narrowest screen. The
                desktop table keeps its column. */}
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-semibold text-fg">
                {s.last_name}, {s.first_name}
              </p>
              {/* The words carry the state; the colour and weight only repeat
                  it. The name wraps, this label never does. */}
              <p
                className={`shrink-0 whitespace-nowrap pt-0.5 text-xs ${
                  state === 'changed' ? 'font-semibold text-warning-fg' : 'text-fg-muted'
                }`}
              >
                {ROW_STATE_LABEL[state]}
              </p>
            </div>
            <div className="mt-3">
              <StatusButtons student={s} marks={marks} onPick={onPick} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

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
  // These two are deliberately separate state, and the "Saved as" column must
  // never read from `marks`. It did once, and the bug was invisible on the
  // happy path: the badge tracked the dropdown, so the two columns were
  // structurally incapable of disagreeing — which is the only reason the
  // "Saved as" column exists. The damage showed up on FAILURE: when a POST was
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
  const counts = useMemo(() => rosterCounts(roster, marks), [roster, marks]);
  const unsaved = useMemo(() => unsavedCount(roster, marks, recorded), [roster, marks, recorded]);

  const pick = useCallback(
    (id, status) => setMarks((m) => pickStatus(m, recorded, id, status)),
    [recorded]
  );

  // ---- the leave-without-saving prompt (fix/server-reliability, 2026-09-30) ----
  // The phone's prompt, on the web: the same title, the same sentence, the
  // same two buttons (mobile/src/screens/teacher/AttendanceScreen.jsx). This
  // page is one bulk submit, so unsaved marks are lost by FIVE paths, and each
  // needs its own guard — the pattern Teacher → Grades already proved
  // (ClassRecordPage.jsx, §13d), not a new one:
  //   1. a date or section change reloads the roster and resets the marks;
  //   2. an in-app link (sidebar, header, bell) — a capture-phase click
  //      interceptor, because this app mounts <BrowserRouter>, not a data
  //      router, so `useBlocker` throws;
  //   3. the browser Back button — the pure classRecord/backGuard.js machine,
  //      reused unchanged (its proof is ssr-back-guard.jsx);
  //   4. a reload or a closed tab — `beforeunload`, and ONLY while there is
  //      something unsaved: a blanket one is what §5e says not to build.
  //   5. a BUTTON exit — Log out, a notification row (fix/leave-guard,
  //      2026-10-01): they call requestLeave() in layout/leaveGuard.js, which
  //      opens this modal while dirty, holding the exit as `run`.
  // `pendingLeave` is one of { kind: 'change', field, value } · { kind:
  // 'link', href } · { kind: 'back' } · { kind: 'exit', run } · null.
  const dirty = unsaved > 0;
  const navigate = useNavigate();
  const [pendingLeave, setPendingLeave] = useState(null);

  function requestChange(field, value) {
    if (!dirty) {
      if (field === 'section') setSectionId(value);
      else setDate(value);
      return;
    }
    setPendingLeave({ kind: 'change', field, value });
  }

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank') return;
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      event.preventDefault();
      setPendingLeave({ kind: 'link', href: url.pathname + url.search });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  const guardRef = useRef(INITIAL_GUARD);
  const applyGuardHistory = (action) => {
    if (action === 'push') window.history.pushState({ ppSentinel: true }, '', window.location.href);
    else if (action === 'back') window.history.back();
  };

  useEffect(() => {
    const next = guardTransition(guardRef.current, dirty ? 'dirty' : 'clean');
    guardRef.current = next.state;
    applyGuardHistory(next.action);
  }, [dirty]);

  useEffect(() => {
    const onPop = () => {
      const next = guardTransition(guardRef.current, 'pop');
      guardRef.current = next.state;
      if (next.action === 'ask') setPendingLeave({ kind: 'back' });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    return setLeaveGuard((run) => setPendingLeave({ kind: 'exit', run }));
  }, [dirty]);

  function dismissLeave() {
    if (pendingLeave?.kind === 'back') {
      const next = guardTransition(guardRef.current, 'stay');
      guardRef.current = next.state;
      applyGuardHistory(next.action);
    }
    setPendingLeave(null);
  }

  function confirmLeave() {
    const pending = pendingLeave;
    setPendingLeave(null);
    if (!pending) return;
    if (pending.kind === 'back') {
      const next = guardTransition(guardRef.current, 'leave');
      guardRef.current = next.state;
      applyGuardHistory(next.action);
    } else if (pending.kind === 'link') {
      navigate(pending.href);
    } else if (pending.kind === 'exit') {
      pending.run();
    } else if (pending.field === 'section') {
      setSectionId(pending.value);
    } else {
      setDate(pending.value);
    }
  }

  const classLabel = section ? `Grade ${section.grade_level} - ${section.name}` : '';
  const leaveVerb = pendingLeave?.kind === 'change' ? 'Changing the date or section' : 'Leaving now';

  async function handleSubmit() {
    setSaving(true);
    setStatus({});

    try {
      await api.post(
        '/attendance/bulk',
        { section_id: section.id, date, entries },
        { unwrap: 'attendance' }
      );
      // Re-read rather than trusting local state: the response is the source of
      // truth for what is now recorded, and this is also what flips the button
      // to "Update attendance" without a special case.
      //
      // THE RE-READ COMES FIRST, THE MESSAGE SECOND (fix/smoke-gate). loadRoster
      // opens with setStatus({}) so that a section or date change clears a stale
      // message — and when the success was set BEFORE it, React batched the two
      // and the message never painted: measured at 0 appearances across a real
      // save in the 2026-09-26 smoke gate. loadRoster never throws (it keeps its
      // own error in rosterError), so a failed re-read cannot turn a saved
      // roster into a "failed" message here.
      await loadRoster();
      setStatus({
        roster: ok(
          `Attendance saved for ${entries.length} student${entries.length === 1 ? '' : 's'}.`
        ),
      });
    } catch (err) {
      setStatus({ roster: fail(extractError(err)) });
    } finally {
      setSaving(false);
    }
  }

  const columns = rosterColumns({ recorded, marks, onPick: pick });

  // THE SKELETONS (feat/skeleton-tier2-web), above every return. The sections:
  // the whole page waits on them, in the register's own shape — cards below
  // `sm`, the table above (fix round, T1). The roster follows the DataTable's
  // rule beside it (`queryKey`, §5): a new section or date shows the skeleton;
  // the same register re-read after a save keeps the cards — busy and inert
  // while it reads, so a tap cannot be lost to the re-read.
  //
  // WAITING IS "THE ROWS ON SCREEN ARE NOT THIS REGISTER'S" (fix round, T2),
  // not only "loading": a date or section change renders once with the new key
  // before the load's effect starts, and that render must not show the old
  // register's counts either. While it waits, everything that is computed from
  // the old roster — the summary card's counts and chips, both buttons, the
  // note, the phone's Save bar — is skeleton in place.
  const sectionsPhase = useSkeleton(sections === null);
  const rosterCurrent = useQueryRows(roster, rosterLoading, [section, date]);
  const rosterWaiting = !rosterCurrent || (rosterLoading && roster.length === 0);
  const rosterPhase = useSkeleton(rosterWaiting);

  // --- render ------------------------------------------------------------
  if (sectionsError) {
    return <ErrorAlert message={sectionsError} onRetry={() => window.location.reload()} />;
  }

  if (sections === null) {
    return <AttendanceRegisterSkeleton phase={sectionsPhase} />;
  }

  if (!sections.length) {
    return (
      <div className={cardClass}>
        <EmptyState
          icon="fa-clipboard-user"
          title="You are not the adviser of any section"
          message="Attendance is recorded by the section adviser. An admin can assign you to a section from the Sections page."
        />
      </div>
    );
  }

  // NO ENTRANCE AND NO TWEEN ON THIS PAGE (feat/ui-refresh, motion/motion.js):
  // the root is a plain <div>, never <Reveal>. A teacher marks a register here
  // forty taps in a row, the roster re-renders after every save, and the
  // "Leave without saving?" dialog renders inline — nothing on this screen may
  // move, and no ancestor may carry a transform.
  return (
    <div className="space-y-6">
      {/* WHICH REGISTER: the class and the day. The header card of the page —
          everything below it is that one register. */}
      <div className={`${cardClass} flex flex-wrap items-end gap-x-4 gap-y-3 p-4 sm:p-5`}>
        <span
          aria-hidden="true"
          className="mb-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand sm:flex"
        >
          <i className="fa-solid fa-clipboard-user" />
        </span>

        {sections.length === 1 ? (
          // One advisory section is not a choice — a dropdown with a single
          // option would be a decision the teacher does not actually have.
          // As tall as the date control beside it (44px), so the two sit on
          // one baseline.
          <div className="w-full sm:w-auto">
            <p className="mb-1.5 text-sm font-semibold text-fg-secondary">Section</p>
            <p className="flex min-h-11 items-center text-sm font-semibold text-fg">
              Grade {section?.grade_level} - {section?.name}
            </p>
          </div>
        ) : (
          // A real <label> since feat/ui-refresh: the word "Section" used to be
          // a bare paragraph above an unlabelled <select>, so the control had
          // no accessible name.
          <FormField
            label="Section"
            as="select"
            className={filterSelectClass}
            value={sectionId ?? ''}
            onChange={(e) => requestChange('section', Number(e.target.value))}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                Grade {s.grade_level} - {s.name}
              </option>
            ))}
          </FormField>
        )}

        <FormField
          label="Date"
          type="date"
          className={filterFieldClass}
          value={date}
          // The input's value is ALREADY a local YYYY-MM-DD string and is sent
          // to the API verbatim — never parsed into a Date. max prevents a
          // future date in the UI; the API rejects one too.
          max={todayLocalDateString()}
          onChange={(e) => requestChange('date', e.target.value)}
        />
      </div>

      <section className="space-y-3">
        {/* The description names the register: the class, then the day. A
            date input can be cleared, and `longDate` hands an empty value
            straight back — so with no date the class stands alone rather
            than trailing a separator with nothing after it. */}
        <SectionHeader
          title="Roster"
          description={date ? `${classLabel} · ${longDate(date)}` : classLabel}
        />

        {rosterWaiting ? (
          <RosterSummarySkeleton phase={rosterPhase} />
        ) : roster.length ? (
          <div className={`${cardClass} flex flex-wrap items-center gap-x-4 gap-y-3 p-4`}>
            <div className="min-w-0">
              <p className="text-sm font-semibold tabular-nums text-fg">
                {counts.marked} of {counts.total} marked
              </p>
              {/* COUNTS ONLY — never a rate. A percentage here would be a second
                  implementation of Parent → Attendance's figure, and this page
                  is an encode screen, not a report.

                  One chip per status, in the status's own tone (the same map
                  the buttons use) — and each chip carries its WORD, so the
                  tone only repeats what the text already says. */}
              <ul className="mt-2 flex flex-wrap gap-2">
                {STATUS_ORDER.map((s) => (
                  <li
                    key={s}
                    className={`rounded-lg border px-2 py-0.5 text-xs font-semibold tabular-nums ${STATUS_TONE[s]}`}
                  >
                    {s} {counts[s]}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grow" />

            <Button
              variant="secondary"
              onClick={() => setMarks((m) => markRestPresent(roster, m))}
              disabled={counts.marked === counts.total}
            >
              {/* The label names what it will actually do. "Mark all Present"
                  once any row is marked would be a claim about behaviour the
                  handler does not have (§5i) — it never overwrites. */}
              {counts.marked === 0 ? 'Mark all Present' : 'Mark the rest Present'}
            </Button>

            {/* Desktop keeps Save in the toolbar; the phone has its own pinned
                bar below, because a roster is longer than a screen and a Save
                that scrolls away is a Save a teacher has to go looking for.
                The wrapper hides it below `sm` — the button's own class sets
                a display, and two display utilities on one element is a
                stylesheet-order coin toss. */}
            <div className="hidden sm:block">
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={saving}
                disabled={saving || entries.length === 0}
              >
                {isUpdate ? 'Update attendance' : 'Save attendance'}
              </Button>
            </div>
          </div>
        ) : null}

        {/* THE TABLE IS DESKTOP-ONLY and the cards are phone-only — the declared
            exemption. `DataTable` is still the table: it keeps the sorting, the
            loading, error and empty states, and the LRN column. */}
        <div className="hidden sm:block">
          <DataTable
            columns={columns}
            rows={roster}
            loading={rosterLoading}
            queryKey={[section, date]}
            error={rosterError}
            onRetry={loadRoster}
            emptyIcon="fa-user-graduate"
            emptyTitle="No students in this section"
            emptyMessage="Students appear here once they are enrolled in this section."
          />
        </div>

        {rosterWaiting ? (
          <div className={`${cardClass} sm:hidden`}>
            <RosterCardsSkeleton phase={rosterPhase} />
          </div>
        ) : rosterError ? (
          <div className="sm:hidden">
            <ErrorAlert message={rosterError} onRetry={loadRoster} />
          </div>
        ) : roster.length === 0 ? (
          <div className={`${cardClass} sm:hidden`}>
            <EmptyState
              icon="fa-user-graduate"
              title="No students in this section"
              message="Students appear here once they are enrolled in this section."
            />
          </div>
        ) : (
          <div className="sm:hidden" aria-busy={rosterLoading || undefined} inert={rosterLoading || undefined}>
            <RosterCards roster={roster} marks={marks} recorded={recorded} onPick={pick} />
          </div>
        )}

        {rosterWaiting ? (
          <>
            <RosterNoteSkeleton phase={rosterPhase} />
            <RosterSaveBarSkeleton phase={rosterPhase} />
          </>
        ) : roster.length ? (
          <>
            {unsetCount > 0 ? (
              // Unset rows are omitted from the request, never defaulted to
              // Present — defaulting would invent attendance nobody entered.
              <p className="flex items-start gap-3 rounded-xl border border-edge bg-surface-subtle px-4 py-3 text-sm text-fg-body">
                <i aria-hidden="true" className="fa-solid fa-circle-info mt-0.5 text-fg-faint" />
                <span className="min-w-0 flex-1">
                  {unsetCount} of {roster.length} student{roster.length === 1 ? '' : 's'}{' '}
                  {unsetCount === 1 ? 'has' : 'have'} no status and will not be submitted.
                </span>
              </p>
            ) : null}

            <FormStatus status={status.roster} />

            {/* PHONE SAVE BAR, pinned. `sticky bottom-0` and not `fixed`: §9
                makes the document the only scroller, and a fixed bar would sit
                outside it. It carries the unsaved count so Save is never a
                guess about whether anything changed. `-mx-4` reaches the
                screen's edges through <main>'s 16px phone padding. */}
            <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-edge bg-surface px-4 py-3 sm:hidden">
              <span
                className={`min-w-0 grow text-sm ${unsaved ? 'font-semibold text-warning-fg' : 'text-fg-muted'}`}
              >
                {unsaved === 0
                  ? 'No unsaved changes'
                  : `${unsaved} unsaved change${unsaved === 1 ? '' : 's'}`}
              </span>
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={saving}
                disabled={saving || entries.length === 0}
                className="shrink-0"
              >
                {isUpdate ? 'Update attendance' : 'Save attendance'}
              </Button>
            </div>
          </>
        ) : null}
      </section>

      {/* The phone's words, word for word, and since fix/leave-guard the one
          title every bulk-entry screen uses. Escape or the backdrop counts as
          Stay — only the red button discards. STAY IS THE FILLED BUTTON, as
          it always was: the safe answer is the prominent one, and the
          discarding one is outlined in red beside it. The two sit in the
          dialog's footer, so the sentence above them can scroll and they
          cannot. */}
      <Modal
        open={pendingLeave !== null}
        onClose={dismissLeave}
        title="Leave without saving?"
        size="sm"
        footer={
          <>
            <Button variant="primary" onClick={dismissLeave}>
              Stay on this page
            </Button>
            <Button variant="danger-outline" onClick={confirmLeave}>
              Leave and discard
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-body">
          You have {unsaved} unsaved mark{unsaved === 1 ? '' : 's'} for {classLabel} on {longDate(date)}.{' '}
          {leaveVerb} discards {unsaved === 1 ? 'it' : 'them'} — nothing has been sent to the server yet.
        </p>
      </Modal>
    </div>
  );
}
