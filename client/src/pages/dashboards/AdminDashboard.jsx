import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useSocket } from '../../realtime/SocketProvider';
import { calendarDaysAgo, calendarDaysAgoLabel } from '../../format/date';
import Card, { Stat } from './Card';
import { useCard } from './useCard';

// Admin dashboard (DB2, 2026-09-19). Four cards, and one of them only
// appears when something is wrong.
//
// THE COUNTS COME FROM GET /api/dashboard, and each one repeats the WHERE of
// the page its card links to — students is `status=all` because Admin ->
// Students defaults to that, teachers has no status filter because that list
// has none. A card reading 42 that opens a list of 37 is a bug report, and
// the cause would be invisible.
//
// RECENT ACTIVITY IS NOT HERE, and its absence is a decision (Darryl, Q2):
// there is no read endpoint for `activity_logs` — every reference in
// server/routes/ is a write — and building one needs a redaction rule for
// free text produced by twenty-odd call sites. It moves to the Admin
// Activity Log page with its own endpoint. Do not add a card that fakes it
// from something else.
//
// NO VERDICTS (§4), AND NOTHING ON THIS PAGE IS RED. Amber means "there is
// something to do"; red would mean something has already failed, and nothing
// here has. The lockout hazard was built red and corrected on review — it
// warns about a state that COULD strand you, which is precisely a warning
// and not an error. Red is reserved for a request that actually failed,
// which is ErrorAlert's job inside a card.

// Green at or under a week, amber beyond it or never — and NEVER red
// (spec). A stale backup is a prompt, not a failure: the data is still
// there, and colouring it red would put a permanent alarm on a dashboard
// somebody has to look at every day.
// CALENDAR DAYS, NOT ELAPSED HOURS (UI-C1b).
//
// This divided the millisecond difference by 86400000 and called 0 "today",
// which is a duration, not a date: a backup taken at 23:00 and read at 01:00
// the next morning is two hours old, scored 0, and reported **"Last backup
// today"** when it had been yesterday. `calendarDaysAgo` reduces both
// instants to their Manila calendar day first, so the answer depends on the
// date and not the hour.
//
// The 7-day tone boundary keeps the same meaning and now uses the same
// counting as the words beside it.
function backupAge(createdAt) {
  if (!createdAt) return { tone: 'warning', label: 'No backup yet' };
  const days = calendarDaysAgo(createdAt);
  if (days === null) return { tone: 'warning', label: 'No backup yet' };
  return { tone: days <= 7 ? 'success' : 'warning', label: `Last backup ${calendarDaysAgoLabel(createdAt)}` };
}

export default function AdminDashboard() {
  const { connected } = useSocket();

  const summary = useCard(() => api.get('/dashboard', { unwrap: 'dashboard' }), []);
  const backups = useCard(
    () => api.get('/backups?limit=1', { unwrap: 'backups' }).then((rows) => rows[0] || null),
    []
  );

  const d = summary.data;
  const pending = d?.pending_parents ?? 0;
  const age = backupAge(backups.data?.created_at);

  return (
    <div className="space-y-4">
      {/* The hazard card, and it is deliberately not dismissible: a warning
          about being locked out of your own system is exactly the warning
          someone dismisses and then needs. It clears itself the moment
          either condition stops being true, and it names no account —
          there is only one it could be about, and a login id must never
          appear on screen (§5c). */}
      {d?.hazard?.single_unverified_admin ? (
        <div className="rounded-xl border border-warning-edge bg-warning-soft px-5 py-4">
          <p className="text-sm font-semibold text-warning-strong">
            This is the only admin account, and its email is not confirmed
          </p>
          {/* ONE LINK, NOT TWO. This card shipped with a "Create a second
              admin →" link to Admin → Users, and that page cannot do it:
              POST /api/users/teachers hardcodes role 'teacher' and
              /parents hardcodes 'parent'. NO endpoint in the API creates an
              admin — 'admin' appears only as a filter value on GET /users —
              so the only admin is the seeded one. A link offering an action
              the code does not have is the §5i failure exactly, and it was
              worse than a dead end here: it would have sent someone hunting
              for a control on the one screen where being wrong costs them
              their way back in. Removed on review, 2026-09-19. Do not
              re-add it until an endpoint exists. */}
          <p className="mt-1 text-sm text-fg-body">
            If this password is lost there is no way back in through the app: resetting your own
            password needs a confirmed email, and a temporary password can only be issued by a
            different admin — and a second admin account cannot be created from inside the app.
            Confirming your email is the fix available here.
          </p>
          <p className="mt-3">
            <Link
              to="/admin/settings/account"
              className="text-sm font-medium text-brand underline-offset-2 hover:underline"
            >
              Confirm your email
            </Link>
          </p>
        </div>
      ) : null}

      {/* FOUR COMPACT NUMBER TILES IN ONE ROW, SYSTEM FULL WIDTH BELOW
          (UI-3, Darryl's Q2). The approval queue is the EMPHASISED tile —
          first, amber while something waits, the bigger number — but the
          same width as the other three. `items-start`: a card takes its own
          height, never its row's tallest. Two columns below lg, so the
          tiles pair up and System still spans. */}
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Waiting for approval"
          icon="fa-user-clock"
          to="/admin/users"
          compact
          // Amber ONLY when there is something in the queue. A permanently
          // amber card is wallpaper, and the next real one is not noticed.
          tone={pending > 0 ? 'warning' : 'default'}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? (
            <Stat
              large
              value={pending}
              caption={pending === 1 ? 'parent account waiting' : 'parent accounts waiting'}
            />
          ) : null}
        </Card>

        <Card
          title="Students"
          icon="fa-user-graduate"
          to="/admin/students"
          compact
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? <Stat value={d.totals.students} caption="on the roll" /> : null}
        </Card>

        <Card
          title="Teachers"
          icon="fa-chalkboard-user"
          to="/admin/users"
          compact
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? <Stat value={d.totals.teachers} caption="teacher accounts" /> : null}
        </Card>

        <Card
          title="Parents"
          icon="fa-users"
          to="/admin/users"
          compact
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? <Stat value={d.totals.active_parents} caption="active parent accounts" /> : null}
        </Card>

        <Card
          title="System"
          icon="fa-server"
          to="/admin/settings"
          className="sm:col-span-2 lg:col-span-4"
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
        >
          {/* The last backup leads: of everything here it is the one that
              goes stale on its own. Coloured by the same never-red rule as
              before. The SAME SIZE as the row's values ("2026-2027"), bold,
              and no divider under it (A1, Darryl, 2026-09-30) — a large
              heading over a row of small facts read as a second title. */}
          <p
            className={`text-sm font-bold ${
              backups.loading
                ? 'text-fg-muted'
                : backups.error || age.tone !== 'success'
                  ? 'text-warning-strong'
                  : 'text-success-strong'
            }`}
          >
            {backups.loading ? '…' : backups.error ? 'Could not read backups' : age.label}
          </p>
          {d ? (
            <dl className="mt-3 grid gap-x-6 gap-y-2 pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex justify-between gap-3">
                <dt className="text-sm text-fg-muted">School year</dt>
                <dd className="text-sm font-medium text-fg">{d.school_year}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sm text-fg-muted">Current term</dt>
                <dd className="text-sm font-medium text-fg">Term {d.term}</dd>
              </div>
              <div className="flex justify-between gap-3">
                {/* The term is NAMED because the denominator is scoped to it
                    and the bare label did not say so: the count is every
                    grade row for the current school year AND current term,
                    across all students and both grading modes — which read
                    as "all grade rows" and matched neither that nor any one
                    student's (browser check, 2026-09-19). It renders
                    `d.term`, the same value the Current term row above uses
                    and the same one the server filtered on, so the label
                    cannot drift from the number beside it. */}
                {/* `nowrap` on the PARENTHETICAL only, not on the whole
                    label: the term is the scope of the number beside it, and
                    broken onto its own line "Grade records locked" and
                    "(Term 1)" read as two statements (browser check,
                    2026-09-23). The label itself may still wrap. */}
                <dt className="text-sm text-fg-muted">
                  Grade records locked <span className="whitespace-nowrap">(Term {d.term})</span>
                </dt>
                {/* A COUNT, not a state (Q3, option b). There is no global
                    lock: is_locked is per grade row, so this is how many of
                    this term's rows are finalized. */}
                <dd className="text-sm font-medium text-fg">
                  {d.grade_locks.locked} of {d.grade_locks.total}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sm text-fg-muted">Live connection</dt>
                <dd
                  className={`text-sm font-medium ${connected ? 'text-success-strong' : 'text-warning-strong'}`}
                >
                  {connected ? 'Connected' : 'Paused'}
                </dd>
              </div>
            </dl>
          ) : null}
          {/* `relative z-10` lifts this link above the card's stretched one
              (Card.jsx), so it opens Backup & restore, not School settings. */}
          <p className="mt-3">
            <Link to="/admin/backups" className="relative z-10 text-sm font-medium text-brand underline-offset-2 hover:underline">
              Backup &amp; restore
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
