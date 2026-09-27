import { addMonths, longDate, monthGrid, weekdayName } from '../../../format/date';

// THE PURE HALF OF THE WEB'S AttendancePage.jsx + AttendanceCalendar.jsx,
// lifted so scripts/proof-attendance.mjs can drive it (§17b). Identity is a
// YYYY-MM-DD STRING compared with ===; a Date is used for placement only,
// inside format/date.js (§5a-iv). Late counts as present, Excused as absent
// — the school's decision (2026-09-13), never DepEd's.

export const EMPTY_SUMMARY = { Present: 0, Absent: 0, Late: 0, Excused: 0, total: 0 };
export const COUNTS = ['Present', 'Late', 'Absent', 'Excused'];
export const LETTER = { Present: 'P', Late: 'L', Absent: 'A', Excused: 'E' };

export function countOf(summary, key) {
  const n = Number(summary?.[key] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function recordedDays(summary) {
  const total = countOf(summary, 'total');
  if (total <= 0) return null;
  return { present: countOf(summary, 'Present') + countOf(summary, 'Late'), total };
}

// Every month from the first recorded one to the last, INCLUDING months
// with nothing recorded in between (they show a dash).
export function monthsCovered(allRows) {
  const keys = new Set();
  for (const row of allRows) keys.add(String(row.date).slice(0, 7));
  if (!keys.size) return [];
  const sorted = [...keys].sort();
  const [firstY, firstM] = sorted[0].split('-').map(Number);
  const [lastY, lastM] = sorted[sorted.length - 1].split('-').map(Number);
  const out = [];
  let cursor = { year: firstY, month: firstM };
  while (cursor.year < lastY || (cursor.year === lastY && cursor.month <= lastM)) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

export function yearRows(allRows) {
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
}

export function yearTotals(rows) {
  return rows.reduce(
    (acc, r) => ({
      recorded: acc.recorded + (r.recorded || 0),
      present: acc.present + (r.present || 0),
      absent: acc.absent + (r.absent || 0),
    }),
    { recorded: 0, present: 0, absent: 0 }
  );
}

// The latest letter per absence date wins (by created_at), as on the web.
export function letterByDate(letters) {
  const map = new Map();
  for (const row of letters || []) {
    const existing = map.get(row.absence_date);
    if (!existing || String(row.created_at) > String(existing.created_at)) map.set(row.absence_date, row);
  }
  return map;
}

// Records in this month that fall OUTSIDE the Mon–Fri grid (a weekend row):
// real, counted in the totals, shown in the "Also recorded" strip.
export function alsoRecorded(records, year, month) {
  const weeks = monthGrid(year, month);
  const inGrid = new Set(weeks.flat().filter((c) => c.inMonth).map((c) => c.date));
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return (records || [])
    .filter((row) => String(row.date).startsWith(prefix) && !inGrid.has(row.date))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function dayLabel(cell, record, letter) {
  const when = `${weekdayName(cell.date)} ${longDate(cell.date)}`;
  if (!record) return `${when}: not recorded`;
  const base = `${when}: ${record.status}`;
  return letter ? `${base}, excuse letter ${letter.status.toLowerCase()}` : base;
}
