import api from '../../api/axios';
import { useAuth } from '../../auth/AuthContext';
import { useUnread } from '../../realtime/UnreadProvider';
import { todayLocalDateString } from '../../format/date';
import StatusBadge from '../../components/StatusBadge';
import Card, { CardEmpty, Stat } from './Card';
import { useCard } from './useCard';

// Parent dashboard (DB2, 2026-09-19). Seven cards, seven independent
// requests, seven independent failures.
//
// EVERY CARD OWNS ITS OWN loading / error / empty STATE. There is no
// Promise.all anywhere in this file: it rejects as a unit, so one timed-out
// request would blank six cards that worked. Each `useCard` below is its own
// effect with its own retry.
//
// PHONE ORDER IS THE DOM ORDER. Child, Grades and Attendance come first
// because below `sm` the grid is one column and a phone reads top to bottom —
// this is the order a parent actually wants, not a desktop layout reflowed.
//
// NO VERDICTS ANYWHERE (§4). An average is a number; there is no "passing",
// no colour on a grade, no threshold. The attendance line is a FRACTION and
// the words "Present on recorded days" — never "attendance rate", because
// unmarked school days are not in the table (§5i).
//
// THE GRADES NUMBERS ARE NOT COMPUTED HERE. Amendment A1: the latest term,
// "N of M subjects recorded" and the average come from GET /api/dashboard,
// computed server-side with the same roundTo2 the report card uses. A client
// mean would be a second implementation of a number parents compare against
// their child's card.

function classLabel(user) {
  if (user?.grade_level == null && !user?.section) return null;
  return `Grade ${user.grade_level} - ${user.section || ''}`.replace(/ - $/, '');
}

function childName(user) {
  const name = `${user?.student_first_name || ''} ${user?.student_last_name || ''}`.trim();
  return name || null;
}

// (Present + Late) as the numerator: the school's rule, confirmed by the
// principal on 2026-09-13 — Late counts as present, Excused counts as
// absent.
//
// A FRACTION ONLY, DELIBERATELY. Parent -> Attendance owns the PERCENTAGE
// and its rounding (`presentOnRecordedDays` there, half-up to one decimal);
// copying that here would be a second implementation of a number the two
// screens must agree on. The card shows "X of Y" and links to the page that
// shows the percentage.
function recordedDays(summary) {
  const n = (key) => {
    const value = Number(summary?.[key] ?? 0);
    return Number.isFinite(value) ? value : 0;
  };
  const total = n('total');
  if (total <= 0) return null;
  return { present: n('Present') + n('Late'), absent: n('Absent'), late: n('Late'), total };
}

function firstOfMonth() {
  const today = todayLocalDateString();
  return `${today.slice(0, 7)}-01`;
}

export default function ParentDashboard() {
  const { user } = useAuth();
  const { unread } = useUnread();
  const studentId = user?.student_id ?? null;
  const linked = Boolean(studentId);
  const today = todayLocalDateString();

  const summary = useCard(
    () => api.get('/dashboard', { unwrap: 'dashboard' }),
    [studentId]
  );

  // The adviser's name is not on /auth/me. GET /api/sections is unscoped
  // reference data for every role, so this is a read a parent is already
  // allowed to make — it is not a roster and exposes no other family.
  const section = useCard(
    () =>
      api
        .get(`/sections?grade_level=${user.grade_level}`, { unwrap: 'sections' })
        .then((rows) => rows.find((r) => r.name === user.section) || null),
    [user?.grade_level, user?.section],
    { skip: user?.grade_level == null || !user?.section }
  );

  const month = useCard(
    () =>
      api.get(`/attendance/summary/${studentId}?from=${firstOfMonth()}&to=${today}`, {
        unwrap: 'summary',
      }),
    [studentId, today],
    { skip: !linked }
  );

  // No from/to: the unfiltered summary starts at the EARLIEST RECORDED DAY by
  // construction, which is exactly what "school year so far" was defined as
  // (Darryl, Q6) — so there is no date convention to invent and no June-1
  // guess to get wrong. Still recorded days, never SF9 Class Days.
  const allTime = useCard(
    () => api.get(`/attendance/summary/${studentId}`, { unwrap: 'summary' }),
    [studentId],
    { skip: !linked }
  );

  const letter = useCard(
    () => api.get('/excuse-letters/mine?limit=1', { unwrap: 'excuse_letters' }).then((rows) => rows[0] || null),
    [studentId],
    { skip: !linked }
  );

  const posts = useCard(
    () =>
      Promise.allSettled([
        api.get('/announcements?limit=3', { unwrap: 'announcements' }),
        api.get('/memos?limit=3', { unwrap: 'memos' }),
      ]).then(([a, m]) => {
        // allSettled, not all: memos failing must not hide announcements.
        // Both failing is the only error, and it is reported as one.
        if (a.status === 'rejected' && m.status === 'rejected') throw a.reason;
        return {
          announcements: a.status === 'fulfilled' ? a.value : [],
          memos: m.status === 'fulfilled' ? m.value : [],
        };
      }),
    []
  );

  // `sort=event_date&order=asc` is NOT a display preference, and leaving it
  // off was a real defect (browser check, 2026-09-19). GET /api/events
  // defaults to `event_date DESC`, which is right for the Events page's
  // full list and exactly wrong here: combined with `limit=3` it returns the
  // three FURTHEST-AWAY events and puts them in reverse order, so a parent
  // with ten things coming up would never see the one that is tomorrow.
  // Ascending + limit is what makes these the next three.
  const events = useCard(
    () => api.get(`/events?from=${today}&sort=event_date&order=asc&limit=3`, { unwrap: 'events' }),
    [today]
  );

  const grades = summary.data?.grades ?? null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card title="Your child" icon="fa-user-graduate" to="/parent/settings" linkLabel="Account information">
        {!linked ? (
          <CardEmpty>
            This account is not linked to a learner yet. Ask the school office.
          </CardEmpty>
        ) : (
          <div className="space-y-1">
            <p className="text-lg font-semibold text-fg">{childName(user) || 'Name not recorded'}</p>
            <p className="text-sm text-fg-muted">{classLabel(user) || 'Class not recorded'}</p>
            <p className="text-sm text-fg-muted">
              Adviser:{' '}
              {section.loading ? (
                '…'
              ) : section.data?.adviser_name ? (
                section.data.adviser_name
              ) : (
                // 20 of 23 sections have no adviser and no screen can assign
                // one (KNOWN ISSUES). Say so rather than leaving a blank.
                <span className="text-fg-muted">not yet assigned</span>
              )}
            </p>
            {summary.data?.school_year ? (
              <p className="text-sm text-fg-muted">School year {summary.data.school_year}</p>
            ) : null}
          </div>
        )}
      </Card>

      <Card
        title="Grades"
        icon="fa-chart-simple"
        to="/parent/grades"
        linkLabel="Open report card"
        loading={summary.loading}
        error={summary.error}
        onRetry={summary.reload}
      >
        {!linked ? (
          <CardEmpty>No learner is linked to this account.</CardEmpty>
        ) : grades?.unavailable ? (
          <CardEmpty>
            Grading is not set up for this grade level yet. Ask the school office.
          </CardEmpty>
        ) : grades?.descriptive ? (
          // Grade 1. No number, no count, no progress: a descriptive subject
          // is null at every computed level because it is INAPPLICABLE, not
          // incomplete (§3). The school has not said how the letter is
          // produced, so the card says nothing about that either.
          <div>
            <p className="text-lg font-semibold text-fg">Descriptive grading (A&ndash;E)</p>
            <p className="mt-1 text-sm text-fg-muted">
              Your child&rsquo;s progress is reported as a letter for each subject.
            </p>
          </div>
        ) : grades?.complete ? (
          <Stat
            value={grades.general_average}
            caption={`General average, Term ${grades.term}`}
          />
        ) : grades?.term ? (
          <Stat
            value="Pending"
            muted
            caption={`Term ${grades.term} — ${grades.subjects_recorded} of ${grades.subjects_total} subjects recorded`}
          />
        ) : (
          <CardEmpty>No grades recorded yet.</CardEmpty>
        )}
      </Card>

      <Card
        title="Attendance"
        icon="fa-clipboard-user"
        to="/parent/attendance"
        loading={month.loading || allTime.loading}
        error={month.error || allTime.error}
        onRetry={() => {
          month.reload();
          allTime.reload();
        }}
      >
        {!linked ? (
          <CardEmpty>No learner is linked to this account.</CardEmpty>
        ) : (
          (() => {
            const m = recordedDays(month.data);
            const a = recordedDays(allTime.data);
            if (!m) {
              return (
                <div>
                  <CardEmpty>Nothing recorded this month.</CardEmpty>
                  {a ? (
                    <p className="mt-2 text-sm text-fg-muted">
                      School year so far: {a.present} of {a.total} recorded days
                    </p>
                  ) : null}
                </div>
              );
            }
            return (
              <div>
                <Stat value={`${m.present} of ${m.total}`} caption="Present on recorded days, this month" />
                <p className="mt-2 text-sm text-fg-muted">
                  {m.absent} absent &middot; {m.late} late
                </p>
                {a ? (
                  <p className="mt-1 text-sm text-fg-muted">
                    School year so far: {a.present} of {a.total} recorded days
                  </p>
                ) : null}
              </div>
            );
          })()
        )}
      </Card>

      <Card title="Messages" icon="fa-comments" to="/parent/messages">
        {unread > 0 ? (
          <Stat value={unread} caption={unread === 1 ? 'unread message' : 'unread messages'} />
        ) : (
          <CardEmpty>No unread messages.</CardEmpty>
        )}
      </Card>

      <Card
        title="Excuse letters"
        icon="fa-envelope-open-text"
        to="/parent/excuse-letters"
        loading={letter.loading}
        error={letter.error}
        onRetry={letter.reload}
      >
        {!linked ? (
          <CardEmpty>No learner is linked to this account.</CardEmpty>
        ) : letter.data ? (
          // The card never disappears (spec): a parent who has never sent one
          // still needs to know where they live.
          <div className="space-y-2">
            <StatusBadge status={letter.data.status} />
            <p className="text-sm text-fg-muted">Absence on {letter.data.absence_date}</p>
          </div>
        ) : (
          <CardEmpty>No excuse letters.</CardEmpty>
        )}
      </Card>

      <Card
        title="Announcements &amp; memos"
        icon="fa-bullhorn"
        to="/parent/announcements"
        loading={posts.loading}
        error={posts.error}
        onRetry={posts.reload}
      >
        {posts.data && (posts.data.announcements.length || posts.data.memos.length) ? (
          <ul className="space-y-2">
            {posts.data.announcements.map((row) => (
              <li key={`a-${row.id}`} className="text-sm text-fg">
                {row.title}
                <span className="ml-2 text-xs text-fg-muted">Announcement</span>
              </li>
            ))}
            {posts.data.memos.map((row) => (
              <li key={`m-${row.id}`} className="text-sm text-fg">
                {row.title}
                <span className="ml-2 text-xs text-fg-muted">Memo</span>
              </li>
            ))}
          </ul>
        ) : (
          <CardEmpty>Nothing posted yet.</CardEmpty>
        )}
      </Card>

      <Card
        title="Upcoming events"
        icon="fa-calendar-days"
        to="/parent/events"
        loading={events.loading}
        error={events.error}
        onRetry={events.reload}
      >
        {events.data?.length ? (
          <ul className="space-y-2">
            {events.data.map((row) => (
              <li key={row.id} className="text-sm text-fg">
                {row.title}
                <span className="ml-2 text-xs text-fg-muted">{row.event_date}</span>
              </li>
            ))}
          </ul>
        ) : (
          <CardEmpty>No upcoming events.</CardEmpty>
        )}
      </Card>
    </div>
  );
}
