import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { fetchAll } from '../../api/axios';
import extractError from '../../api/extractError';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import ReloadButton from '../../components/ReloadButton';
import StatusBadge from '../../components/StatusBadge';
import { cardClass } from '../../components/buttonClass';
import Reveal from '../../motion/Reveal';
import AttendanceCalendar from './AttendanceCalendar';
import {
  addMonths,
  longDate,
  monthBounds,
  monthName,
  todayLocalDateString,
  weekdayName,
} from '../../format/date';
import { clampMonthToSchoolYear } from '../../format/schoolCalendar';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Parent attendance — READ ONLY history, as a month calendar (DV2,
// 2026-09-20). Teacher encode is a different page; there is no write here.
//
// ---------------------------------------------------------------------------
// THE PERCENTAGE IS GONE, DELIBERATELY
// ---------------------------------------------------------------------------
// This page used to show "Present on recorded days" as a percentage with the
// fraction beside it. The percentage is removed and only the FRACTION
// remains ("21 of 23"), which also closes a copy defect the dashboards check
// found: the intro paragraph explained how "the percentage" was calculated
// even on an account with zero recorded days, where no percentage was on
// screen at all (§5i — copy describing something that is not there).
//
// `presentOnRecordedDays` was deleted with it rather than exported: it had no
// other consumer, and DV1's dashboard card had already decided to show the
// fraction instead of duplicating its half-up rounding.
//
// The RULE the fraction encodes is unchanged and is still the school's, not
// DepEd's: LATE COUNTS AS PRESENT, EXCUSED COUNTS AS ABSENT (the principal,
// in conversation, 2026-09-13). DO 015 s. 2026 prescribes no attendance rate,
// so never attribute this to DepEd anywhere a parent reads it.
//
// ---------------------------------------------------------------------------
// WHAT IS FETCHED, AND WHY THE MONTH IS NOT A SERVER FILTER PROBLEM
// ---------------------------------------------------------------------------
//   GET /attendance/summary/:studentId?from&to   the month's counts
//   GET /attendance/student/:studentId?from&to   the month's rows (fetchAll)
//   GET /attendance/student/:studentId           EVERY row, for the school
//                                                year table's range
//   GET /excuse-letters/mine                     matched to absent days
//
// The BUILD ORDER item "attendance list `date` drops from/to" is about
// GET /api/attendance — the TEACHER/ADMIN list. These two handlers are
// different and take `from`/`to` only; there is no `date` param to collide
// with, so DV2 never depended on that fix.
//
// fetchAll, not the first page: a month can exceed one page once several
// years of data exist, and a calendar that silently omitted days would be
// worse than one that was slow. /excuse-letters/mine takes no date range at
// all, so its whole set is fetched and matched client-side.
//
// SKIPS EVERY REQUEST when user.student_id is null (the Grades pattern).
// parseId(null) is 400 "Invalid student id." — a developer string a parent
// must never see.
//
// §5c: no LRN anywhere, and the route has no :id.
//
// ---------------------------------------------------------------------------
// RELOAD (feat/ui-refresh) — ONE CONTROL, THE SAME FOUR REQUESTS
// ---------------------------------------------------------------------------
// The Reload button in the learner's header card asks again for everything
// on this page that is attendance: the month (`load`, with the month that is
// on screen — the view and the selected day are not touched), and the two
// once-only reads, the whole history and the letters, through `refreshKey` in
// their dependency lists. Those two effects are otherwise exactly as they
// were: same request, same cancel flag, same silent failure. The adviser's
// name is reference data and is not re-read.
//
// One control and not one per card, because the cards are one answer: a
// reloaded month beside a school-year table that still shows the old totals
// would be two versions of the same record on one screen.

const EMPTY_SUMMARY = { Present: 0, Absent: 0, Late: 0, Excused: 0, total: 0 };
const COUNTS = ['Present', 'Late', 'Absent', 'Excused'];

// A column label in the school-year table: the eyebrow style on the quiet
// surface, as on every table. Each cell adds its own colour, alignment and
// horizontal padding (the two edge cells line up with the card's padding).
const YEAR_TH = 'whitespace-nowrap bg-surface-subtle py-2.5 text-xs font-semibold uppercase tracking-wider';

function countOf(summary, key) {
  const n = Number(summary?.[key] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// (Present + Late) of total — the fraction only. No percentage: see the
// header note.
function recordedDays(summary) {
  const total = countOf(summary, 'total');
  if (total <= 0) return null;
  return { present: countOf(summary, 'Present') + countOf(summary, 'Late'), total };
}

// The months that actually hold records, earliest to latest.
//
// DERIVED FROM DATA, NOT FROM A CALENDAR CONVENTION (Darryl, DV2 Q6). The
// months a parent can page through are the ones that hold records — the
// earliest and latest recorded month is honest by construction, and is
// exactly what "recorded days" means. The school calendar
// (format/schoolCalendar.js, since pre-Stage-5 #7) decides only which month
// the page OPENS on; it never adds an empty month to this list.
function monthsCovered(allRows) {
  const keys = new Set();
  for (const row of allRows) keys.add(String(row.date).slice(0, 7));
  if (!keys.size) return [];
  const sorted = [...keys].sort();
  const [firstY, firstM] = sorted[0].split('-').map(Number);
  const [lastY, lastM] = sorted[sorted.length - 1].split('-').map(Number);

  const out = [];
  let cursor = { year: firstY, month: firstM };
  // Bounded by construction: the loop advances one month and stops at the
  // last recorded one.
  while (cursor.year < lastY || (cursor.year === lastY && cursor.month <= lastM)) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

export default function ParentAttendancePage() {
  usePageTitle('Attendance');
  const { user } = useAuth();
  const studentId = user?.student_id ?? null;
  const today = todayLocalDateString();

  // Opens on today's month, kept inside the school year (pre-Stage-5 #7): a
  // parent opening this in May sees June, the first month of classes, and in
  // the summer after sees April, the last — not an empty month with nothing
  // to page to. Within the year, today's month as before.
  const [view, setView] = useState(() => {
    const { year, month } = monthBounds(today);
    return clampMonthToSchoolYear({ year, month });
  });

  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [letters, setLetters] = useState([]);
  const [adviser, setAdviser] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Bumped by Reload only (see the header note). It re-runs the two
  // once-only reads below and nothing else.
  const [refreshKey, setRefreshKey] = useState(0);

  const monthLabel = `${monthName(view.month)} ${view.year}`;

  const load = useCallback(async () => {
    if (studentId == null) {
      setSummary(EMPTY_SUMMARY);
      setRows([]);
      setAllRows([]);
      setLetters([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { from, to } = monthBounds(`${view.year}-${String(view.month).padStart(2, '0')}-01`);
      const [nextSummary, monthRows] = await Promise.all([
        api.get(`/attendance/summary/${studentId}`, { unwrap: 'summary', params: { from, to } }),
        fetchAll(`/attendance/student/${studentId}`, { unwrap: 'attendance', params: { from, to } }),
      ]);
      setSummary(nextSummary);
      setRows(monthRows);
    } catch (err) {
      setError(extractError(err));
      setSummary(EMPTY_SUMMARY);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [studentId, view]);

  useEffect(() => {
    load();
  }, [load]);

  // The whole history, once — it drives the school-year table's range and
  // nothing else, so it does not reload when the month changes. (And again
  // on Reload: `refreshKey`.)
  useEffect(() => {
    if (studentId == null) return undefined;
    let cancelled = false;
    fetchAll(`/attendance/student/${studentId}`, { unwrap: 'attendance' })
      .then((all) => {
        if (!cancelled) setAllRows(all);
      })
      .catch(() => {
        // The table below simply does not render; the month above is the
        // page's job and has its own error state.
        if (!cancelled) setAllRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, refreshKey]);

  // Letters, once. /excuse-letters/mine has no date range, so the set is
  // fetched whole and matched by absence_date string. (And again on Reload.)
  useEffect(() => {
    if (studentId == null) return undefined;
    let cancelled = false;
    fetchAll('/excuse-letters/mine', { unwrap: 'excuse_letters' })
      .then((all) => {
        if (!cancelled) setLetters(all);
      })
      .catch(() => {
        if (!cancelled) setLetters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, refreshKey]);

  // The adviser's name for the "How this is counted" line. GET /sections is
  // unscoped reference data for every role — the same read the parent
  // dashboard makes. 20 of 23 sections have no adviser (KNOWN ISSUES), so
  // this is frequently null and the copy below must not promise a name.
  useEffect(() => {
    if (user?.grade_level == null || !user?.section) return undefined;
    let cancelled = false;
    api
      .get(`/sections?grade_level=${user.grade_level}`, { unwrap: 'sections' })
      .then((sections) => {
        const match = sections.find((s) => s.name === user.section);
        if (!cancelled) setAdviser(match?.adviser_name || null);
      })
      .catch(() => {
        if (!cancelled) setAdviser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.grade_level, user?.section]);

  function goMonth(delta) {
    setSelected(null);
    setView((current) => addMonths(current, delta));
  }

  // Reload: the month's own request, plus the two once-only reads. The month
  // on screen and the selected day stay as they are.
  function reloadAll() {
    load();
    setRefreshKey((key) => key + 1);
  }

  const fraction = recordedDays(summary);
  const linked = studentId != null;

  const yearRows = useMemo(() => {
    const months = monthsCovered(allRows);
    const byMonth = new Map();
    for (const row of allRows) {
      const key = String(row.date).slice(0, 7);
      const bucket = byMonth.get(key) || { recorded: 0, present: 0, absent: 0 };
      bucket.recorded += 1;
      if (row.status === 'Present' || row.status === 'Late') bucket.present += 1;
      else bucket.absent += 1;
      byMonth.set(key, bucket);
    }
    return months.map(({ year, month }) => {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      return { year, month, key, ...(byMonth.get(key) || null) };
    });
  }, [allRows]);

  const totals = useMemo(
    () =>
      yearRows.reduce(
        (acc, r) => ({
          recorded: acc.recorded + (r.recorded || 0),
          present: acc.present + (r.present || 0),
          absent: acc.absent + (r.absent || 0),
        }),
        { recorded: 0, present: 0, absent: 0 }
      ),
    [yearRows]
  );

  const selectedRecord = selected ? rows.find((r) => r.date === selected) : null;
  const selectedLetter = selected ? letters.find((l) => l.absence_date === selected) : null;

  // The learner this page is about: the header card's title, and one line of
  // context under it. The same three facts the single line above the grid
  // used to carry, in the same order; any of them may be missing. A learner
  // has no photo, so the circle is always initials.
  const childName = `${user?.student_first_name || ''} ${user?.student_last_name || ''}`.trim();
  const childMeta = [
    user?.grade_level != null ? `Grade ${user.grade_level} - ${user.section || ''}`.replace(/ - $/, '') : '',
    adviser ? `Adviser: ${adviser}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!linked) {
    return (
      <Reveal className={`${cardClass} flex items-start gap-3 p-5 sm:p-6`}>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-fg-muted"
        >
          <i className="fa-solid fa-link-slash" />
        </span>
        <p className="min-w-0 max-w-prose pt-1.5 text-sm text-fg-muted">
          This account is not linked to a learner yet, so there is no attendance to show. Ask the
          school office.
        </p>
      </Reveal>
    );
  }

  return (
    <Reveal className="space-y-6">
      {/* WHO THIS IS ABOUT, and the page's one Reload. The name is in the
          title face; "Name not recorded" is the wording the dashboard's hero
          already uses for a linked learner with no name on the row. */}
      <div className={`${cardClass} flex items-center gap-3 p-4 sm:p-5`}>
        <Avatar name={childName} />
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-serif text-xl font-bold text-fg">{childName || 'Name not recorded'}</h2>
          {childMeta ? <p className="mt-0.5 text-sm text-fg-muted">{childMeta}</p> : null}
        </div>
        {/* `min-w-11`: below `sm` the button is its icon alone, and the icon
            plus its padding is narrower than a finger's 44px. */}
        <ReloadButton onReload={reloadAll} loading={loading} label="Reload attendance" className="min-w-11" />
      </div>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      {/* THE SUMMARY COMES FIRST IN THE DOM and is placed to the RIGHT from
          `lg` up (browser review, 2026-09-20). It is the number a parent
          opens this page for, so on a phone — and for a screen reader, which
          follows DOM order — it must not sit below a 22-cell grid. From `lg`
          the grid has room beside it and the panel moves to the second
          column; below that they simply stack, summary on top. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="lg:col-start-2 lg:row-start-1 lg:self-start">
          <section className={`${cardClass} p-4 sm:p-5`}>
            <h2 className="font-serif text-base font-bold text-fg">{monthLabel}</h2>
            {fraction ? (
              <>
                {/* THE FRACTION, and only the fraction (see the header note).
                    One sentence for a screen reader — "21 of 23" — set as a
                    figure and its denominator. */}
                {/* `text-2xl` is the emphasised figure's size everywhere (the
                    dashboard's `Stat large`); one step up read too big on a
                    laptop and was taken back down on 2026-09-30. */}
                <p className="mt-3">
                  <span className="text-2xl font-bold tabular-nums text-fg">{fraction.present}</span>{' '}
                  <span className="text-base font-semibold tabular-nums text-fg-muted">of {fraction.total}</span>
                </p>
                <p className="text-sm text-fg-muted">Present on recorded days</p>

                {/* The four counts as tiles: the status is a StatusBadge —
                    colour AND word — and the count beside it is the server's
                    own number for the month. Two across at EVERY width: four
                    across fitted a phone held sideways but not a tablet with
                    the sidebar open, where a tile is about 76px inside and a
                    badge plus a two-digit count needs about 95. */}
                <ul className="mt-4 grid grid-cols-2 gap-2">
                  {COUNTS.map((key) => (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-xl border border-edge-soft bg-surface-subtle px-3 py-2.5"
                    >
                      <StatusBadge status={key} />
                      <span className="text-base font-bold tabular-nums text-fg">{countOf(summary, key)}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-4 text-xs text-fg-muted">
                  Late counts as present · Excused counts as absent
                </p>
              </>
            ) : (
              // No pills when there is nothing to count: four zeros next to
              // "Nothing recorded" said the same thing four more times, and
              // a 0 beside "Absent" reads as a fact about the learner rather
              // than about the record (browser review, 2026-09-20).
              <p className="mt-2 text-sm text-fg-muted">Nothing recorded this month.</p>
            )}
          </section>
        </div>

        <section className={`${cardClass} p-4 sm:p-5 lg:col-start-1 lg:row-start-1`}>
          {/* Month navigation: two 44px icon buttons, each named by its
              aria-label, with the month between them announced politely when
              it changes. */}
          <div className="mb-4 flex items-center justify-between gap-2">
            <Button size="icon" onClick={() => goMonth(-1)} aria-label="Previous month">
              <i aria-hidden="true" className="fa-solid fa-chevron-left" />
            </Button>
            <h2 className="min-w-0 text-center font-serif text-base font-bold text-fg" aria-live="polite">
              {monthLabel}
            </h2>
            <Button size="icon" onClick={() => goMonth(1)} aria-label="Next month">
              <i aria-hidden="true" className="fa-solid fa-chevron-right" />
            </Button>
          </div>

          {loading ? (
            <LoadingSpinner className="py-12" />
          ) : (
            <AttendanceCalendar
              year={view.year}
              month={view.month}
              monthLabel={monthLabel}
              records={rows}
              letters={letters}
              today={today}
              selected={selected}
              onSelect={(date) => setSelected((current) => (current === date ? null : date))}
            />
          )}

          {/* The day detail, below the grid — the target of each day button's
              aria-controls. Below sm it is the only way to read a day; from sm
              up the cell already shows everything, so this repeats rather than
              reveals, which is harmless. */}
          <div id="attendance-day-detail" className="mt-4">
            {selected ? (
              <div className="rounded-xl border border-edge bg-surface-subtle px-4 py-3">
                <p className="text-sm font-semibold tabular-nums text-fg">
                  {weekdayName(selected)} {longDate(selected)}
                </p>
                <p className="mt-2">
                  {selectedRecord ? (
                    <StatusBadge status={selectedRecord.status} />
                  ) : (
                    <span className="text-sm text-fg-muted">Not recorded</span>
                  )}
                </p>
                {selectedLetter ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-fg-muted">
                    <span aria-hidden="true" className="flex items-center justify-center text-xs">
                      <i className="fa-solid fa-envelope" />
                    </span>
                    Excuse letter · {selectedLetter.status}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className={`${cardClass} flex items-start gap-3 p-4 sm:p-5`}>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"
        >
          <i className="fa-solid fa-circle-info" />
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-base font-bold text-fg">How this is counted</h2>
          <p className="mt-1 max-w-prose text-sm text-fg-body">
            Late counts as present. Excused counts as absent. Only the days{' '}
            {/* Never "recorded by —": when no adviser is assigned to the
                section, the sentence has to work without a name (20 of 23
                sections are in that state — KNOWN ISSUES). */}
            {adviser ? `${adviser} recorded` : "your child's adviser recorded"} are counted — a school
            day with no record is left out, not marked absent.
          </p>
        </div>
      </section>

      {yearRows.length ? (
        // The frame is the card; the table runs edge to edge inside it and is
        // its own horizontal scroller, so ten months on a phone scroll in the
        // card and never widen the page.
        <section className={cardClass}>
          <div className="px-4 pt-4 sm:px-5 sm:pt-5">
            <h2 className="font-serif text-base font-bold text-fg">School year record</h2>
            <p className="mt-1 max-w-prose text-xs text-fg-muted">
              Only months with recorded days are shown. A dash means nothing was recorded that month.
            </p>
          </div>
          <div className="mt-4 overflow-x-auto rounded-b-2xl">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-edge">
                  <th scope="col" className={`${YEAR_TH} pl-4 pr-3 text-left text-fg-muted sm:pl-5`}>
                    &nbsp;
                  </th>
                  {yearRows.map((r) => (
                    <th key={r.key} scope="col" className={`${YEAR_TH} px-3 text-right text-fg-muted`}>
                      {monthName(r.month).slice(0, 3)}
                    </th>
                  ))}
                  <th scope="col" className={`${YEAR_TH} pl-3 pr-4 text-right text-fg sm:pr-5`}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Recorded days', 'recorded'],
                  ['Present', 'present'],
                  ['Absent', 'absent'],
                ].map(([label, key]) => (
                  <tr key={key} className="border-b border-edge-soft last:border-0">
                    <th scope="row" className="whitespace-nowrap py-3 pl-4 pr-3 text-left font-semibold text-fg sm:pl-5">
                      {label}
                    </th>
                    {yearRows.map((r) => (
                      <td key={r.key} className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-fg-secondary">
                        {r.recorded === undefined ? '—' : r[key]}
                      </td>
                    ))}
                    <td className="whitespace-nowrap py-3 pl-3 pr-4 text-right font-semibold tabular-nums text-fg sm:pr-5">
                      {totals[key]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </Reveal>
  );
}
