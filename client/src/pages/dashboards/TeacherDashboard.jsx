import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../auth/AuthContext';
import { useUnread } from '../../realtime/UnreadProvider';
import { todayLocalDateString } from '../../format/date';
import Card, { CardEmpty, Stat, useCard } from './Card';

// Teacher dashboard (DB2, 2026-09-19). Same structure as the parent's: one
// request per card, one failure per card, no Promise.all rejecting as a unit.
//
// THE BANNER IS ONE ROW PER ADVISORY SECTION, not one banner. A teacher may
// advise more than one section — the endpoints table says so plainly, and the
// seed having one adviser per section is an accident of the seed, not a
// constraint. One section recorded while another is not has to be visible.
//
// DATES COME FROM todayLocalDateString(), NEVER toISOString(). At UTC+8 the
// UTC date is still yesterday for the first eight hours of every day, which
// this project has shipped twice: a DATE column round-tripping a day
// backwards, and own-day attendance rejected as "in the future". A banner
// that says "not recorded" about yesterday is the same bug wearing a hat.
//
// HIDDEN ON SATURDAY AND SUNDAY, and not rendered at all for a teacher with
// no advisory section. A permanent "you have no advisory section" banner is
// noise for a subject teacher for whom it will never change — My classes
// carries that explanation instead.

// Amber is not a verdict (§4): partial means "still doing it", not "late" or
// "bad". Green requires FULL coverage (Darryl, Q4) — the encode screen omits
// unset rows rather than defaulting them, so "some rows exist" is genuinely
// different from "the register is done".
function bannerFor(section, rows, rosterCount) {
  const recorded = rows.length;
  if (recorded === 0) {
    return { tone: 'warning', label: 'Not recorded', detail: 'No attendance recorded today.' };
  }
  const present = rows.filter((r) => r.status === 'Present' || r.status === 'Late').length;
  const absent = rows.filter((r) => r.status === 'Absent').length;
  if (rosterCount > 0 && recorded < rosterCount) {
    return {
      tone: 'warning',
      label: `${recorded} of ${rosterCount} recorded`,
      detail: `${present} present, ${absent} absent so far.`,
    };
  }
  return {
    tone: 'success',
    label: 'Recorded',
    detail: `${present} present, ${absent} absent.`,
  };
}

function AttendanceBanner({ section, today }) {
  const day = useCard(
    () =>
      api.get(
        `/attendance?grade_level=${section.grade_level}&section=${encodeURIComponent(section.name)}&date=${today}&limit=200`,
        { unwrap: 'attendance' }
      ),
    [section.id, today]
  );

  const className = `Grade ${section.grade_level} - ${section.name}`;

  if (day.loading) {
    return (
      <div className="rounded-xl border border-edge bg-surface px-5 py-4 text-sm text-fg-muted">
        Checking today&rsquo;s attendance for {className}…
      </div>
    );
  }
  if (day.error) {
    return (
      <div className="rounded-xl border border-edge bg-surface px-5 py-4">
        <p className="text-sm text-fg">{className}</p>
        <p className="mt-1 text-sm text-fg-muted">{day.error}</p>
        <button
          type="button"
          onClick={day.reload}
          className="mt-2 text-sm font-medium text-brand underline-offset-2 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const state = bannerFor(section, day.data || [], Number(section.student_count || 0));
  const frame =
    state.tone === 'success'
      ? 'border-success-edge bg-success-soft'
      : 'border-warning-edge bg-warning-soft';
  const text = state.tone === 'success' ? 'text-success-strong' : 'text-warning-strong';

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border ${frame} px-5 py-4`}>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${text}`}>
          {className} — {state.label}
        </p>
        <p className="mt-0.5 text-sm text-fg-body">{state.detail}</p>
      </div>
      <Link
        to="/teacher/attendance"
        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
      >
        {state.tone === 'success' ? 'Open attendance' : 'Record attendance'}
      </Link>
    </div>
  );
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const { unread } = useUnread();
  const today = todayLocalDateString();
  // 0 = Sunday, 6 = Saturday. Read from the same local clock the date string
  // comes from, so the two cannot disagree across midnight.
  const weekend = [0, 6].includes(new Date().getDay());

  const summary = useCard(() => api.get('/dashboard', { unwrap: 'dashboard' }), []);

  // Unscoped reference data for every role; the adviser rows are picked out
  // here rather than asked for, because there is no ?adviser_id= filter and
  // inventing one would widen an endpoint for a dashboard.
  const sections = useCard(
    () =>
      api
        .get('/sections?limit=200', { unwrap: 'sections' })
        .then((rows) => rows.filter((r) => r.adviser_id === user.id)),
    [user?.id]
  );

  const pending = useCard(
    () => api.get('/excuse-letters?status=Pending&limit=1', { unwrap: ['excuse_letters', 'page'] }),
    []
  );

  const events = useCard(() => api.get(`/events?from=${today}&limit=3`, { unwrap: 'events' }), [today]);

  const d = summary.data;
  const advisory = sections.data || [];

  return (
    <div className="space-y-4">
      {!weekend && advisory.length
        ? advisory.map((section) => <AttendanceBanner key={section.id} section={section} today={today} />)
        : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          title="Excuse letters to review"
          icon="fa-envelope-open-text"
          to="/teacher/excuse-letters"
          loading={pending.loading}
          error={pending.error}
          onRetry={pending.reload}
          tone={pending.data?.page?.total > 0 ? 'warning' : 'default'}
        >
          {pending.data?.page?.total > 0 ? (
            <Stat
              value={pending.data.page.total}
              caption={pending.data.page.total === 1 ? 'letter waiting' : 'letters waiting'}
            />
          ) : (
            <CardEmpty>Nothing waiting.</CardEmpty>
          )}
        </Card>

        <Card
          title="Term grades"
          icon="fa-chart-simple"
          to="/teacher/grades"
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? (
            d.classes_total === 0 ? (
              <CardEmpty>You have no subject assignments.</CardEmpty>
            ) : (
              <Stat
                value={`${d.classes_complete} of ${d.classes_total}`}
                caption={`classes fully recorded, Term ${d.term}`}
              />
            )
          ) : null}
        </Card>

        <Card title="Messages" icon="fa-comments" to="/teacher/messages">
          {unread > 0 ? (
            <Stat value={unread} caption={unread === 1 ? 'unread message' : 'unread messages'} />
          ) : (
            <CardEmpty>No unread messages.</CardEmpty>
          )}
        </Card>

        <Card
          title="My classes"
          icon="fa-users-rectangle"
          to="/teacher/grades"
          linkLabel="Open grades"
          className="sm:col-span-2"
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d?.classes?.length ? (
            <ul className="divide-y divide-edge">
              {d.classes.map((c) => (
                <li key={c.assignment_id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="text-sm text-fg">
                    Grade {c.grade_level} - {c.section}
                    <span className="ml-2 text-fg-muted">{c.subject_name}</span>
                  </span>
                  <span className="text-sm text-fg-muted">
                    {c.students} {c.students === 1 ? 'student' : 'students'} &middot; grades recorded{' '}
                    {c.recorded} of {c.students}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            // TCH-002 is exactly this account: adviser of a section, no
            // subject assignments at all. Naming the state beats an empty box.
            <CardEmpty>
              You have no subject assignments. An admin assigns subjects to teachers
              {advisory.length ? ', but you can still record attendance for your advisory section.' : '.'}
            </CardEmpty>
          )}
        </Card>

        <Card
          title="Upcoming events"
          icon="fa-calendar-days"
          to="/teacher/events"
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
    </div>
  );
}
