import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import FormField from '../../components/FormField';
import StatusBadge from '../../components/StatusBadge';
import { todayLocalDateString } from '../../format/date';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Parent attendance — READ ONLY history. Teacher encode is a different page.
//
// THE RATE (2026-09-13). "Present on recorded days" = (Present + Late) / total,
// one decimal, half-up. The principal answered on 2026-09-13, in conversation:
// Late counts as present, Excused counts as absent. That is the SCHOOL's rule —
// DO 015 s. 2026 prescribes no attendance rate — so never attribute it to
// DepEd anywhere a parent reads it. GET /summary returns { Present, Absent,
// Late, Excused, total } and nothing else; the rate is computed here from
// those, with no extra request. total is every recorded status row, so an
// excused day lowers the percentage. Late and Excused keep their own cards.
// total is recorded days, not SF9 Class Days — unmarked school days are not in
// the table, so labelling it Class Days would be a lie, and so would calling
// this number the "attendance rate" a parent knows from the SF9. That is why
// the label is the clumsier "Present on recorded days" (§5i). Not rendered
// when total is 0: 0% would say the learner attended nothing, when it means
// nobody recorded anything, and the empty state already names that cause.
//
// TWO REQUESTS, SAME from/to: GET /attendance/summary/:studentId (unwrap
// summary) and GET /attendance/student/:studentId (unwrap attendance, array).
// Do not call GET / — authorize('teacher','admin'), 403 "Access denied."
//
// SKIPS BOTH when user.student_id is null (Grades pattern).
// parseId(null) is 400 "Invalid student id." — a developer string. loading is
// cleared in the same turn as the skip.
//
// MONTH vs ALL, Events pattern. Default this calendar month, local YYYY-MM-DD
// from todayLocalDateString() — never toISOString(). All omits both params.
// No status filter in this dispatch.
//
// NO WRITES. POST / POST /bulk PUT /:id are teacher/admin. No encode control.
// §5c: no LRN, route has no :id. §5h: no text field; opening the page is the
// proof, not a typing pass.

const STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

const EMPTY_SUMMARY = { Present: 0, Absent: 0, Late: 0, Excused: 0, total: 0 };

// First and last day of the calendar month that contains `today`, as local
// YYYY-MM-DD strings. Date(year, month, 0) with month 1–12 is the last day of
// that month in local time; getDate() is the day number. Never toISOString().
function monthBounds(today = todayLocalDateString()) {
  const [yearStr, monthStr] = today.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const from = `${yearStr}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function countOf(summary, key) {
  const n = Number(summary?.[key] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// (Present + Late) / total as a one-decimal string, rounded half-up — the
// grades module's rule, so a parent can check it by hand next to the exact
// fraction. Integer arithmetic before the round keeps .5 cases from drifting.
// Half-up at one decimal only reaches 100.0 at 1,999 of 2,000 days, which no
// school year does, so a record with a missed day cannot show as 100%.
// null when nothing is recorded.
function presentOnRecordedDays(summary) {
  const total = countOf(summary, 'total');
  if (total <= 0) return null;
  const present = countOf(summary, 'Present') + countOf(summary, 'Late');
  return { present, total, percent: (Math.round((present * 1000) / total) / 10).toFixed(1) };
}

export default function ParentAttendancePage() {
  usePageTitle('Attendance');
  const { user } = useAuth();
  const studentId = user?.student_id ?? null;

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The select IS the applied value — no draft, no Apply.
  const [range, setRange] = useState('month');

  const load = useCallback(async () => {
    if (studentId == null) {
      setRows([]);
      setSummary(EMPTY_SUMMARY);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (range === 'month') {
        const { from, to } = monthBounds();
        params.from = from;
        params.to = to;
      }
      const [nextSummary, nextRows] = await Promise.all([
        api.get(`/attendance/summary/${studentId}`, { unwrap: 'summary', params }),
        api.get(`/attendance/student/${studentId}`, { unwrap: 'attendance', params }),
      ]);
      setSummary(nextSummary ?? EMPTY_SUMMARY);
      setRows(Array.isArray(nextRows) ? nextRows : []);
    } catch (err) {
      setError(extractError(err));
      setSummary(EMPTY_SUMMARY);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [studentId, range]);

  useEffect(() => {
    load();
  }, [load]);

  // Convention 5f — one branch per cause, keyed on the applied range, never
  // on a boolean meaning "something is set". Reset only where resetting
  // would change the result.
  const empty = useMemo(() => {
    if (studentId == null) {
      return {
        icon: 'fa-link-slash',
        title: "Your account isn't linked to a student record yet",
        message:
          "Ask the school office to link your account so you can see your child's attendance.",
        showReset: false,
      };
    }
    if (range === 'month') {
      return {
        icon: 'fa-calendar-day',
        title: 'No attendance recorded this month',
        message: 'Recorded days for this month appear here. Try showing all recorded days.',
        showReset: true,
      };
    }
    return {
      icon: 'fa-clipboard-user',
      title: 'No attendance recorded yet',
      message: "When the adviser records a day, it appears here as Present, Absent, Late, or Excused.",
      showReset: false,
    };
  }, [studentId, range]);

  const columns = useMemo(
    () => [
      { key: 'date', header: 'Date', sortable: true },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        render: (row) => <StatusBadge status={row.status} />,
      },
    ],
    []
  );

  const showCounts = studentId != null && !error;
  const rate = showCounts ? presentOnRecordedDays(summary) : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        The percentage counts Late as present and Excused as absent. It is out of the days the
        adviser recorded, not the Class Days on the SF9 — school days that were not marked are not
        counted at all.
      </p>

      {studentId != null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <FormField
            label="Show"
            as="select"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="max-w-xs"
          >
            <option value="month">This month</option>
            <option value="all">All recorded days</option>
          </FormField>
        </div>
      ) : null}

      {rate ? (
        // §4 — a NUMBER, not a verdict. Deliberately no colour, no badge, no
        // threshold, no "good attendance" wording, and no comparison to DO 015
        // para 71's ~12-absence intervention point. The system counts and
        // displays; the teacher concludes. Do not add one without the school
        // having said otherwise — the absence is a decision, not an oversight.
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Present on recorded days
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{rate.percent}%</div>
          <div className="mt-1 text-sm text-slate-500">
            {range === 'month'
              ? `${rate.present} of ${rate.total} recorded days this month`
              : `${rate.present} of all ${rate.total} recorded days`}
          </div>
        </div>
      ) : null}

      {showCounts ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {STATUSES.map((status) => (
            <div key={status} className="rounded-xl border border-slate-200 bg-white p-3">
              <StatusBadge status={status} />
              <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
                {countOf(summary, status)}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Recorded days
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
              {countOf(summary, 'total')}
            </div>
          </div>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        keyField="id"
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon={empty.icon}
        emptyTitle={empty.title}
        emptyMessage={empty.message}
        emptyAction={
          empty.showReset ? (
            <button
              type="button"
              onClick={() => setRange('all')}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Show all recorded days
            </button>
          ) : null
        }
      />
    </div>
  );
}
