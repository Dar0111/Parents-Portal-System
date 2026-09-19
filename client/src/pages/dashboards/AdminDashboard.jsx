import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useSocket } from '../../realtime/SocketProvider';
import Card, { CardEmpty, Stat, useCard } from './Card';

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
// NO VERDICTS (§4). Amber means "there is something to do", never "this is
// bad". Nothing here is ever red except the lockout hazard, which is a real
// dead end rather than a judgement.

// Green at or under a week, amber beyond it or never — and NEVER red
// (spec). A stale backup is a prompt, not a failure: the data is still
// there, and colouring it red would put a permanent alarm on a dashboard
// somebody has to look at every day.
function backupAge(createdAt) {
  if (!createdAt) return { tone: 'warning', label: 'No backup yet' };
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return { tone: days <= 7 ? 'success' : 'warning', label: `Last backup ${when}` };
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
        <div className="rounded-xl border border-danger-edge bg-danger-soft px-5 py-4">
          <p className="text-sm font-semibold text-danger-strong">
            This is the only admin account, and its email is not confirmed
          </p>
          <p className="mt-1 text-sm text-fg-body">
            If this password is lost there is no way back in through the app: resetting your own
            password needs a confirmed email, and a temporary password can only be issued by a
            different admin. Fix either one.
          </p>
          <p className="mt-3 flex flex-wrap gap-4">
            <Link
              to="/admin/settings/account"
              className="text-sm font-medium text-brand underline-offset-2 hover:underline"
            >
              Confirm your email →
            </Link>
            <Link to="/admin/users" className="text-sm font-medium text-brand underline-offset-2 hover:underline">
              Create a second admin →
            </Link>
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          title="Students"
          icon="fa-user-graduate"
          to="/admin/students"
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
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? <Stat value={d.totals.active_parents} caption="active parent accounts" /> : null}
        </Card>

        <Card
          title="Waiting for approval"
          icon="fa-user-clock"
          to="/admin/users"
          linkLabel="Review"
          // Amber ONLY when there is something in the queue. A permanently
          // amber card is wallpaper, and the next real one is not noticed.
          tone={pending > 0 ? 'warning' : 'default'}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? (
            pending > 0 ? (
              <Stat value={pending} caption={pending === 1 ? 'parent account' : 'parent accounts'} />
            ) : (
              <CardEmpty>Nothing waiting.</CardEmpty>
            )
          ) : null}
        </Card>

        <Card
          title="System"
          icon="fa-server"
          to="/admin/settings"
          linkLabel="School settings"
          className="sm:col-span-2"
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? (
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div className="flex justify-between gap-3">
                <dt className="text-sm text-fg-muted">School year</dt>
                <dd className="text-sm font-medium text-fg">{d.school_year}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sm text-fg-muted">Current term</dt>
                <dd className="text-sm font-medium text-fg">Term {d.term}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sm text-fg-muted">Grade records locked</dt>
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
              <div className="flex justify-between gap-3 sm:col-span-2">
                <dt className="text-sm text-fg-muted">Backup</dt>
                <dd
                  className={`text-sm font-medium ${
                    backups.loading
                      ? 'text-fg-muted'
                      : age.tone === 'success'
                        ? 'text-success-strong'
                        : 'text-warning-strong'
                  }`}
                >
                  {backups.loading ? '…' : backups.error ? 'Could not read backups' : age.label}
                </dd>
              </div>
            </dl>
          ) : null}
          <p className="mt-3">
            <Link to="/admin/backups" className="text-sm font-medium text-brand underline-offset-2 hover:underline">
              Backup &amp; restore →
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
