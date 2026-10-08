import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../auth/AuthContext';
import { useSocket } from '../../realtime/SocketProvider';
import {
  calendarDaysAgo,
  calendarDaysAgoLabel,
  longDate,
  todayLocalDateString,
  weekdayName,
} from '../../format/date';
import { buttonClass } from '../../components/buttonClass';
import CountUp from '../../motion/CountUp';
import Reveal from '../../motion/Reveal';
import Card, { Stat } from './Card';
import HazardSlot from './HazardSlot';
import ProfileHero from './ProfileHero';
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
//
// THE PROFILE HERO (feat/ui-refresh, 2026-10-02) leads the page: the signed-in
// admin, today's date, and the school year and term — the last two from the
// SAME /dashboard read the cards use, so they appear when it has answered and
// not before. No request was added for it.
//
// THE LAYOUT (build 2, feat/dashboards-look, 2026-10-07 — the owner's Part C):
// two LEAD cards, each two columns wide — "Waiting for approval" (amber while
// something waits) and the "Users" card holding the three counts (titled
// "People" until the fix round, F2) — then System across the page. The Users
// card is THE ONE EXCEPTION to "the whole card is its link" (§12, the owner's
// decision 3, FRONTEND §15e): Students, Teachers and Parents each open a
// different list, so the card itself links nowhere and each count is its own
// link. Teachers and Parents open Admin → Users already filtered to what they
// count (F3, see COUNTS).

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

// The System card's four facts share one label and one value style: the label
// in the eyebrow style, the value directly under it.
const FACT_LABEL = 'text-xs font-semibold uppercase tracking-wider text-fg-muted';
const FACT_VALUE = 'mt-0.5 text-sm font-semibold tabular-nums';

// THE USERS CARD'S THREE LINKS (Part C, decision 3). Each count repeats the
// WHERE of the list it opens (see the note at the top of this file), and
// since the build 2 fix round (F3, 2026-10-08) the link CARRIES that WHERE:
// Admin → Users reads `role` / `status` from the address and opens on that
// filter, applied. `server/routes/dashboard.js` counts teachers as every
// teacher account, any status — so Teachers presets the role alone — and
// parents as role parent + status active — so Parents presets both. Students
// opens Admin → Students, whose default is already the count's WHERE.
const COUNTS = [
  { key: 'students', label: 'Students', to: '/admin/students', caption: 'on the roll', value: (t) => t.students },
  { key: 'teachers', label: 'Teachers', to: '/admin/users?role=teacher', caption: 'teacher accounts', value: (t) => t.teachers },
  {
    key: 'parents',
    label: 'Parents',
    to: '/admin/users?role=parent&status=active',
    caption: 'active parent accounts',
    value: (t) => t.active_parents,
  },
];

// Each count is a real <Link>: the label, the number and its caption are its
// name ("Students 12 on the roll"), the control radius (§27f), a hover tint
// and the shared focus outline drawn inside it. Exported so the proof can
// render it (§17b).
export function CountLinks({ totals }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {COUNTS.map((count) => (
        <li key={count.key} className="min-w-0">
          <Link
            to={count.to}
            className="flex min-h-11 items-start justify-between gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-accent"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-fg">{count.label}</span>
              <Stat value={<CountUp value={count.value(totals)} />} caption={count.caption} />
            </span>
            <i aria-hidden="true" className="fa-solid fa-chevron-right mt-1 shrink-0 text-xs text-fg-faint" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { connected } = useSocket();
  const today = todayLocalDateString();

  const summary = useCard(() => api.get('/dashboard', { unwrap: 'dashboard' }), []);
  const backups = useCard(
    () => api.get('/backups?limit=1', { unwrap: 'backups' }).then((rows) => rows[0] || null),
    []
  );

  const d = summary.data;
  const pending = d?.pending_parents ?? 0;
  const age = backupAge(backups.data?.created_at);
  const backupWarn = Boolean(backups.error) || age.tone !== 'success';

  // The hero's facts. The date is the device's own day; the other two are
  // `d`, so they are simply absent until /dashboard has answered. Each is
  // keyed on ITS OWN VALUE, not on `d`: a payload with no school year (the
  // setting unset) must leave the fact out, never print the word "undefined".
  const facts = [
    { key: 'today', label: `${weekdayName(today)}, ${longDate(today)}` },
    d?.school_year ? { key: 'year', label: `School year ${d.school_year}` } : null,
    d?.term ? { key: 'term', label: `Term ${d.term}` } : null,
  ];

  return (
    <div className="space-y-6">
      <Reveal>
        <ProfileHero user={user} facts={facts} />
      </Reveal>

      {/* The lockout hazard (HazardSlot.jsx): compact, not dismissible, and
          its space held from the first frame while the dashboard loads, so
          it never pushes the cards down (fix round F1, 2026-10-08). */}
      <HazardSlot
        hazard={Boolean(d?.hazard?.single_unverified_admin)}
        loading={summary.loading}
        emailConfirmed={Boolean(user?.email_verified_at)}
      />

      {/* TWO LEAD CARDS, THEN SYSTEM ACROSS THE PAGE (Part C, 2026-10-07).
          At `lg` the grid is four columns and each lead card takes two, so
          they share the first row; from `sm` each takes the whole two-column
          row. The approval queue comes first — amber while something waits,
          the bigger number — and the three counts share the second card,
          each its own link. Each row stretches to its tallest card.

          The cards arrive one after another (Reveal); they all exist from
          the first render — each owns its skeleton — so the stagger has its
          three children at mount. */}
      <Reveal stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Waiting for approval"
          icon="fa-user-clock"
          to="/admin/users"
          className="sm:col-span-2"
          skeleton="lead"
          // Amber ONLY when there is something in the queue. A permanently
          // amber card is wallpaper, and the next real one is not noticed.
          tone={pending > 0 ? 'warning' : 'default'}
          loading={summary.loading}
          refreshing={summary.refreshing}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? (
            <Stat
              large
              value={<CountUp value={pending} />}
              caption={pending === 1 ? 'parent account waiting' : 'parent accounts waiting'}
            />
          ) : null}
        </Card>

        {/* NO `to`: the one card that is not its own link (decision 3) —
            its three counts are. */}
        <Card
          title="Users"
          icon="fa-users"
          className="sm:col-span-2"
          skeleton="counts"
          loading={summary.loading}
          refreshing={summary.refreshing}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? <CountLinks totals={d.totals} /> : null}
        </Card>

        <Card
          title="System"
          icon="fa-server"
          to="/admin/settings"
          className="sm:col-span-2 lg:col-span-4"
          skeleton="facts"
          loading={summary.loading}
          refreshing={summary.refreshing || backups.refreshing}
          error={summary.error}
          onRetry={summary.reload}
        >
          {/* The last backup leads: of everything here it is the one that
              goes stale on its own. Coloured by the same never-red rule as
              before. The SAME SIZE as the row's values ("2026-2027"), bold,
              and no divider under it (A1, Darryl, 2026-09-30) — a large
              heading over a row of small facts read as a second title.

              THE GLYPH SAYS WHAT THE COLOUR SAYS (feat/ui-refresh): a check
              at a week or less, the warning triangle beyond it, never or
              unreadable — so the state does not rest on green against amber
              alone. Decoration to a screen reader; the words carry the age. */}
          <p
            className={`flex items-center gap-2 text-sm font-bold ${
              backups.loading ? 'text-fg-muted' : backupWarn ? 'text-warning-strong' : 'text-success-strong'
            }`}
          >
            {backups.loading ? null : (
              <span aria-hidden="true" className="flex items-center justify-center">
                <i className={`fa-solid ${backupWarn ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} />
              </span>
            )}
            <span className="min-w-0">
              {backups.loading ? '…' : backups.error ? 'Could not read backups' : age.label}
            </span>
          </p>
          {d ? (
            // FOUR LABEL-ABOVE-VALUE FACTS, one per column (owner finding,
            // 2026-09-30). Each pair was `flex justify-between`, pushing its
            // value to the far right of the column — next to the NEXT label,
            // so "2026-2027" read as the Current term's. Now each value sits
            // directly under its own label, left-aligned, as the parent
            // hero's facts do: four columns from lg, 2 × 2 from sm, one
            // column below. The label is the eyebrow style since
            // feat/ui-refresh; the value's colour is unchanged.
            <dl className="mt-3 grid gap-x-6 gap-y-4 pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0">
                <dt className={FACT_LABEL}>School year</dt>
                <dd className={`${FACT_VALUE} text-fg`}>{d.school_year}</dd>
              </div>
              <div className="min-w-0">
                <dt className={FACT_LABEL}>Current term</dt>
                <dd className={`${FACT_VALUE} text-fg`}>Term {d.term}</dd>
              </div>
              <div className="min-w-0">
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
                <dt className={FACT_LABEL}>
                  Grade records locked <span className="whitespace-nowrap">(Term {d.term})</span>
                </dt>
                {/* A COUNT, not a state (Q3, option b). There is no global
                    lock: is_locked is per grade row, so this is how many of
                    this term's rows are finalized. */}
                <dd className={`${FACT_VALUE} text-fg`}>
                  {d.grade_locks.locked} of {d.grade_locks.total}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className={FACT_LABEL}>Live connection</dt>
                <dd className={`${FACT_VALUE} ${connected ? 'text-success-strong' : 'text-warning-strong'}`}>
                  {connected ? 'Connected' : 'Paused'}
                </dd>
              </div>
            </dl>
          ) : null}
          {/* `relative z-10` lifts this link above the card's stretched one
              (Card.jsx), so it opens Backup & restore, not School settings.
              Drawn as the small neutral button: a 44px target on a phone,
              which the bare text link was not. */}
          <p className="mt-4">
            <Link
              to="/admin/backups"
              className={buttonClass({ variant: 'secondary', size: 'sm', className: 'relative z-10' })}
            >
              Backup &amp; restore
            </Link>
          </p>
        </Card>
      </Reveal>
    </div>
  );
}
