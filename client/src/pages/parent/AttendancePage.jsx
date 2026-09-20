import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { fetchAll } from '../../api/axios';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatusBadge from '../../components/StatusBadge';
import AttendanceCalendar from './AttendanceCalendar';
import {
  addMonths,
  longDate,
  monthBounds,
  monthName,
  todayLocalDateString,
  weekdayName,
} from '../../format/date';
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

const EMPTY_SUMMARY = { Present: 0, Absent: 0, Late: 0, Excused: 0, total: 0 };
const COUNTS = ['Present', 'Late', 'Absent', 'Excused'];

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
// DERIVED FROM DATA, NOT FROM A CALENDAR CONVENTION (Darryl, DV2 Q6). There
// is no term-start or year-start date anywhere in the schema —
// `system_settings.academic_year` is the string "2026-2027" and nothing more
// — so a hardcoded June–April range would be an invented fact on a
// parent-facing page (§5i). The earliest and latest recorded month is honest
// by construction, and is exactly what "recorded days" means.
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

  const [view, setView] = useState(() => {
    const { year, month } = monthBounds(today);
    return { year, month };
  });

  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [letters, setLetters] = useState([]);
  const [adviser, setAdviser] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  // nothing else, so it does not reload when the month changes.
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
  }, [studentId]);

  // Letters, once. /excuse-letters/mine has no date range, so the set is
  // fetched whole and matched by absence_date string.
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
  }, [studentId]);

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

  const childLine = [
    `${user?.student_first_name || ''} ${user?.student_last_name || ''}`.trim(),
    user?.grade_level != null ? `Grade ${user.grade_level} - ${user.section || ''}`.replace(/ - $/, '') : '',
    adviser ? `Adviser: ${adviser}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!linked) {
    return (
      <div className="rounded-xl border border-edge bg-surface p-6">
        <p className="text-sm text-fg-muted">
          This account is not linked to a learner yet, so there is no attendance to show. Ask the
          school office.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {childLine ? <p className="text-sm text-fg-muted">{childLine}</p> : null}

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      <div className="rounded-xl border border-edge bg-surface p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => goMonth(-1)}
            aria-label="Previous month"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-edge-strong text-fg-body transition hover:bg-surface-muted"
          >
            <i aria-hidden="true" className="fa-solid fa-chevron-left" />
          </button>
          <h2 className="text-sm font-semibold text-fg" aria-live="polite">
            {monthLabel}
          </h2>
          <button
            type="button"
            onClick={() => goMonth(1)}
            aria-label="Next month"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-edge-strong text-fg-body transition hover:bg-surface-muted"
          >
            <i aria-hidden="true" className="fa-solid fa-chevron-right" />
          </button>
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
            <div className="rounded-lg border border-edge bg-surface-subtle px-4 py-3">
              <p className="text-sm font-medium text-fg">
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
                <p className="mt-2 text-sm text-fg-muted">
                  Excuse letter · {selectedLetter.status}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-surface p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-fg">{monthLabel}</h2>
        {fraction ? (
          <>
            <p className="mt-2 text-2xl font-semibold text-fg">
              {fraction.present} of {fraction.total}
            </p>
            <p className="text-sm text-fg-muted">Present on recorded days</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-fg-muted">Nothing recorded this month.</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {COUNTS.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <StatusBadge status={key} />
              <span className="text-sm text-fg-body">{countOf(summary, key)}</span>
            </span>
          ))}
        </div>

        <p className="mt-3 text-xs text-fg-muted">Late counts as present · Excused counts as absent</p>
      </div>

      <div className="rounded-xl border border-edge bg-surface p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-fg">How this is counted</h2>
        <p className="mt-2 text-sm text-fg-muted">
          Late counts as present. Excused counts as absent. Only the days{' '}
          {/* Never "recorded by —": when no adviser is assigned to the section,
              the sentence has to work without a name (20 of 23 sections are in
              that state — KNOWN ISSUES). */}
          {adviser ? `${adviser} recorded` : "your child's adviser recorded"} are counted — a school
          day with no record is left out, not marked absent.
        </p>
      </div>

      {yearRows.length ? (
        <div className="rounded-xl border border-edge bg-surface p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-fg">School year record</h2>
          <p className="mt-1 text-xs text-fg-muted">
            Months are the ones with records, earliest to latest. A month with no records shows a
            dash, not a zero — nothing was recorded, which is not the same as nothing attended.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-edge">
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    &nbsp;
                  </th>
                  {yearRows.map((r) => (
                    <th
                      key={r.key}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-fg-muted"
                    >
                      {monthName(r.month).slice(0, 3)}
                    </th>
                  ))}
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-fg">
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
                    <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-fg">
                      {label}
                    </th>
                    {yearRows.map((r) => (
                      <td key={r.key} className="whitespace-nowrap px-3 py-2 text-right text-fg-secondary">
                        {r.recorded === undefined ? '—' : r[key]}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-fg">
                      {totals[key]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
