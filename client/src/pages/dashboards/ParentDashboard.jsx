import api from '../../api/axios';
import { useAuth } from '../../auth/AuthContext';
import { useUnread } from '../../realtime/UnreadProvider';
import { todayLocalDateString, isWeekend, lastNDays, monthName, weekdayName } from '../../format/date';
import StatusBadge from '../../components/StatusBadge';
import GradeValue from '../../format/grade';
import TermValue from '../../format/TermValue';
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

// ---------------------------------------------------------------------------
// THE LAST-WEEK STRIP — THREE STATES, AND THE THIRD IS THE POINT (DV4)
// ---------------------------------------------------------------------------
// `attendance` holds only days someone MARKED. A date with no row is a
// weekend, a holiday, a suspension, or an adviser who has not marked it yet,
// and nothing in the schema can tell those apart — there is no school
// calendar (the pre-Stage-5 CAL item). Only "weekend" is derivable, from the
// date itself.
//
// So a day is one of three things, and "not recorded" must NEVER render as
// absent: a parent seeing a blank where Friday should be must not read it as
// their child missing school. Colour never carries this alone — every cell
// has a letter and an accessible name, the same rule DV2's calendar follows.
//
// A REAL WEEKEND RECORD WINS over the derived weekend: POST /attendance/bulk
// has no weekday validation, two fixtures have recorded a Saturday, and
// whether the school holds weekend classes is an open question. Deriving
// "weekend" from the date and then hiding a row the database holds would make
// this strip disagree with the totals beside it.
const STATUS_INITIAL = { Present: 'P', Absent: 'A', Late: 'L', Excused: 'E' };

function weekStrip(rows, end) {
  const byDate = new Map();
  for (const row of rows || []) byDate.set(String(row.date).slice(0, 10), row.status);
  return lastNDays(7, end).map((date) => {
    const status = byDate.get(date) || null;
    if (status) return { date, kind: 'recorded', status };
    if (isWeekend(date)) return { date, kind: 'weekend', status: null };
    return { date, kind: 'unrecorded', status: null };
  });
}

function DayCell({ day }) {
  const label =
    day.kind === 'recorded'
      ? `${weekdayName(day.date)} ${day.date} — ${day.status}`
      : day.kind === 'weekend'
        ? `${weekdayName(day.date)} ${day.date} — weekend, no class recorded`
        : `${weekdayName(day.date)} ${day.date} — not recorded`;

  const tone =
    day.kind !== 'recorded'
      ? 'border-edge bg-surface-subtle text-fg-muted'
      : day.status === 'Present'
        ? 'border-success-edge bg-success-soft text-success-fg'
        : day.status === 'Absent'
          ? 'border-danger-edge bg-danger-soft text-danger-fg'
          : day.status === 'Late'
            ? 'border-warning-edge bg-warning-soft text-warning-fg'
            : 'border-info-edge bg-info-soft text-info-fg';

  return (
    <div className="flex min-w-0 flex-col items-center gap-1" title={label}>
      <span className="text-[10px] uppercase tracking-wide text-fg-muted">{weekdayName(day.date).slice(0, 2)}</span>
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold ${tone}`}
        aria-label={label}
      >
        {/* A LETTER, NEVER COLOUR ALONE. "·" is a weekend and "–" is a day
            nobody marked — deliberately different glyphs, because they are
            different facts, and neither is an absence. */}
        {day.kind === 'recorded' ? STATUS_INITIAL[day.status] || '?' : day.kind === 'weekend' ? '·' : '–'}
      </span>
    </div>
  );
}

// The last seven days, with its own loading and failure handling — the month
// figure above it comes from a different request and must survive this one
// failing (§12).
function WeekStrip({ week, today }) {
  if (week.loading) return <p className="mt-3 text-xs text-fg-muted">Loading the last week…</p>;
  if (week.error || !Array.isArray(week.data)) return null;
  const days = weekStrip(week.data, today);
  return (
    <div className="mt-3 border-t border-edge pt-3">
      <p className="mb-2 text-xs uppercase tracking-wide text-fg-muted">Last 7 days</p>
      <div className="flex justify-between gap-1">
        {days.map((day) => (
          <DayCell key={day.date} day={day} />
        ))}
      </div>
      {/* The legend is not optional. Three states that look like squares need
          words, and "–" in particular must be readable as "nobody marked this
          day" rather than as an absence. */}
      <p className="mt-2 text-[11px] leading-snug text-fg-muted">
        P present &middot; L late &middot; A absent &middot; E excused &middot; &middot; weekend &middot; &ndash; not
        recorded
      </p>
    </div>
  );
}

// The subject list under the Grades card's figure — the mockup's "what is
// behind that average".
//
// IT COMPUTES NOTHING. Every value here is a term grade or a letter exactly as
// GET /grades/student/:studentId returned it, rendered through the same
// TermValue every other term cell in the system uses — so a whole Term Grade
// stays whole and a Grade 1 letter renders as a letter rather than "— N/A".
//
// It is capped at four rows plus a count. A card is a doorway, not the report
// card; a parent who wants all eight opens it.
function SubjectList({ card, mode, term }) {
  if (card.loading) return <p className="mt-3 text-xs text-fg-muted">Loading subjects…</p>;
  // A FAILED SUBJECT READ MUST NOT TAKE THE CARD DOWN. The figure above it
  // comes from a different request that may well have succeeded, and §12 is
  // explicit that one failure may not blank what worked. Silence here, with
  // the card's own link still offering the full document.
  if (card.error || !Array.isArray(card.data?.subjects)) return null;

  const rows = card.data.subjects
    .map((s) => ({
      name: s.subject_name,
      entry: mode === 'descriptive' ? latestLetterEntry(s) : s.terms?.[term] ?? null,
    }))
    .filter((r) => (mode === 'descriptive' ? r.entry : r.entry?.term_grade != null));

  if (!rows.length) return null;
  const shown = rows.slice(0, 4);

  return (
    <ul className="mt-3 space-y-1 border-t border-edge pt-2">
      {shown.map((r) => (
        <li key={r.name} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-fg-muted">{r.name}</span>
          <span className="shrink-0 font-medium text-fg">
            <TermValue entry={r.entry} mode={mode} />
          </span>
        </li>
      ))}
      {rows.length > shown.length ? (
        <li className="text-xs text-fg-muted">+{rows.length - shown.length} more</li>
      ) : null}
    </ul>
  );
}

// The most recent term that carries a letter for one subject. Same rule as the
// hero: the latest term that HAS letters, never a term the school has not
// reached.
function latestLetterEntry(subject) {
  for (const term of [3, 2, 1]) {
    const entry = subject.terms?.[term];
    if (entry?.descriptive_grade) return entry;
  }
  return null;
}

// The next event's date, as a tile. `event_date` is a YYYY-MM-DD STRING and is
// split, never parsed (§5a-iv) — nothing here builds a Date, so nothing can
// shift a day across a timezone.
function DateTile({ dateStr }) {
  const [, m, d] = String(dateStr).split('-');
  return (
    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-edge bg-surface-subtle">
      <span className="text-[10px] uppercase leading-none text-fg-muted">{monthName(Number(m)).slice(0, 3)}</span>
      <span className="text-base font-semibold leading-tight text-fg">{Number(d)}</span>
    </div>
  );
}

// THE HERO, EXPORTED so the SSR proof can reach every state by passing
// props (§14e). A component that fetches its own data renders only its
// spinner under renderToStaticMarkup, and the states that matter here — a
// Key Stage 1 card with letters and NO number, a pending average that must
// never read 0 — are exactly the ones worth proving.
export function ChildHero({ linked, user, section, grades, letterTerm, monthDays, letter }) {
  return (
    <section className="rounded-xl bg-primary p-5 text-primary-fg">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-primary-fg">Your child</h2>
      {!linked ? (
        <p className="mt-2 text-sm text-primary-fg">
          This account is not linked to a learner yet. Ask the school office.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xl font-semibold">{childName(user) || 'Name not recorded'}</p>
          <p className="text-sm text-primary-fg">
            {classLabel(user) || 'Class not recorded'}
            {' · Adviser: '}
            {section.loading ? '…' : section.data?.adviser_name || 'not yet assigned'}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-primary-fg">
                {grades?.descriptive ? 'Latest letters' : 'General average'}
              </p>
              {grades?.descriptive ? (
                // KEY STAGE 1 HAS NO GENERAL AVERAGE (GRADING_SPEC §6a), so
                // the hero shows the grades themselves. Darryl, 2026-09-23.
                letterTerm ? (
                  <div className="mt-1">
                    <p className="text-xs text-primary-fg">Term {letterTerm.term}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {letterTerm.pills.map((p) => (
                        <span
                          key={p.name}
                          title={p.name}
                          className="rounded-md border border-primary-fg px-2 py-0.5 text-sm font-semibold"
                        >
                          {p.letter}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-primary-fg">No letters recorded yet.</p>
                )
              ) : grades?.complete ? (
                <p className="mt-1 text-2xl font-semibold">
                  {/* TWO DECIMALS, through the one renderer the whole system
                      uses — GRADING_SPEC §4a. This card printed "87.5"
                      against the report card's "87.50" until DV4. */}
                  <GradeValue value={grades.general_average} mode="numerical" />
                </p>
              ) : (
                <p className="mt-1 text-sm text-primary-fg">
                  {grades?.term
                    ? `Term ${grades.term} — ${grades.subjects_recorded} of ${grades.subjects_total} recorded`
                    : 'No grades recorded yet.'}
                </p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-primary-fg">Present this month</p>
              {monthDays ? (
                <p className="mt-1 text-2xl font-semibold">
                  {monthDays.present} <span className="text-base font-normal">of {monthDays.total}</span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-primary-fg">Nothing recorded this month.</p>
              )}
              <p className="text-xs text-primary-fg">recorded days</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-primary-fg">Latest excuse letter</p>
              {letter.data ? (
                <div className="mt-1 space-y-1">
                  <StatusBadge status={letter.data.status} />
                  <p className="text-xs text-primary-fg">Absence on {letter.data.absence_date}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-primary-fg">None sent.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
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

  // ONE request, feeding TWO things (Darryl, 2026-09-23): the subject list in
  // the Grades card and the Grade 1 letter pills in the hero. It is the
  // parent's own report card — the same endpoint Parent → Grades uses, the
  // same seven-key unwrap, already parent-scoped. No dashboard field was
  // added for it: §12's rule is that GET /api/dashboard carries only what
  // cannot come from an endpoint that already exists, and this can.
  //
  // EVERY KEY THE PAGE READS IS NAMED. An unnamed key is silently undefined
  // and renders as a plausible empty value rather than an error (§1).
  const card = useCard(
    () =>
      api.get(`/grades/student/${studentId}`, {
        unwrap: [
          'student',
          'school_year',
          'grading_mode',
          'subjects',
          'term_averages',
          'general_average',
          'general_average_descriptor',
        ],
      }),
    [studentId],
    { skip: !linked }
  );

  const week = useCard(
    () =>
      api.get(`/attendance/student/${studentId}?from=${lastNDays(7, today)[0]}&to=${today}`, {
        unwrap: 'attendance',
      }),
    [studentId, today],
    { skip: !linked }
  );

  // The newest conversation, for a preview. `unread` still comes from
  // UnreadProvider — a COUNT is the server's answer and is never derived from
  // a list (§10), so this read supplies the sender and the snippet only.
  const latestMessage = useCard(
    () =>
      api
        .get('/messages/conversations?limit=1&sort=last_message_at&order=desc', { unwrap: 'conversations' })
        .then((rows) => rows[0] || null),
    []
  );

  const grades = summary.data?.grades ?? null;

  // The latest term that carries letters, for the Key Stage 1 hero. COUNTED
  // FROM THE REPORT CARD, not computed: a letter IS the grade, so showing it
  // is showing what the server sent. §12 refuses a COUNT or a progress bar
  // for Key Stage 1 — "N of M" for something with no defined progress — and
  // this is neither.
  const letterTerm = (() => {
    const subjects = card.data?.subjects;
    if (!Array.isArray(subjects)) return null;
    for (const term of [3, 2, 1]) {
      const pills = subjects
        .map((s) => ({ name: s.subject_name, letter: s.terms?.[term]?.descriptive_grade ?? null }))
        .filter((p) => p.letter);
      if (pills.length) return { term, pills };
    }
    return null;
  })();

  const monthDays = recordedDays(month.data);

  return (
    <div className="space-y-4">
      {/* The greeting is the only line on this page addressed to the PARENT
          rather than about the learner. `user.name` is the guardian's name —
          not the child's, and not an identifier. */}
      <p className="text-sm text-fg-muted">
        {user?.name ? `Good day, ${user.name}.` : 'Good day.'} Here is how {childName(user) || 'your child'} is doing.
      </p>

      {/* ---------------------------------------------------------------
          THE HERO. Navy, full width, three figures — the three questions a
          parent opens this page to answer. It is NOT a Card: Card owns a
          surface, a footer link and a tone map, and a navy panel with three
          figures and three destinations is a different object. Reusing Card
          with a `brand` tone would have meant teaching every card about a
          colour only this one uses.

          NO VERDICTS (§4): an average is a number, attendance is a fraction,
          a letter is a status — none of them is graded, coloured by
          threshold, or compared to anything.
          --------------------------------------------------------------- */}
      <ChildHero
        linked={linked}
        user={user}
        section={section}
        grades={grades}
        letterTerm={letterTerm}
        monthDays={monthDays}
        letter={letter}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

      <Card
        title="Grades"
        icon="fa-chart-simple"
        to="/parent/grades"
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
            <p className="text-sm text-fg-muted">
              Reported as a letter for each subject.
            </p>
            <SubjectList card={card} mode="descriptive" />
          </div>
        ) : grades?.complete ? (
          <div>
            <Stat
              // THROUGH GradeValue, not raw (DV4). This printed "87.5" against
              // the report card's "87.50" — one number, two spellings, two
              // screens. Two decimals is the rule for a General Average
              // (GRADING_SPEC §4a), and the split is at the call site because
              // Stat also renders counts and fractions.
              value={<GradeValue value={grades.general_average} mode="numerical" />}
              caption={`General average, Term ${grades.term}`}
            />
            <SubjectList card={card} mode="numerical" term={grades.term} />
          </div>
        ) : grades?.term ? (
          <div>
            <Stat
              value="Pending"
              muted
              caption={`Term ${grades.term} — ${grades.subjects_recorded} of ${grades.subjects_total} subjects recorded`}
            />
            <SubjectList card={card} mode="numerical" term={grades.term} />
          </div>
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
                <WeekStrip week={week} today={today} />
                {a ? (
                  <p className="mt-2 text-sm text-fg-muted">
                    School year so far: {a.present} of {a.total} recorded days
                  </p>
                ) : null}
              </div>
            );
          })()
        )}
      </Card>

      <Card
        title="Messages"
        icon="fa-comments"
        to="/parent/messages"
        loading={latestMessage.loading}
        error={latestMessage.error}
        onRetry={latestMessage.reload}
      >
        {/* THE COUNT IS STILL THE SERVER'S ANSWER (§10) — `unread` comes from
            UnreadProvider, never from the length of this list. The preview
            below supplies only the sender and the snippet. */}
        {unread > 0 ? (
          <Stat value={unread} caption={unread === 1 ? 'unread message' : 'unread messages'} />
        ) : null}
        {latestMessage.data ? (
          <div className={unread > 0 ? 'mt-3 border-t border-edge pt-2' : ''}>
            <p className="text-sm font-medium text-fg">{latestMessage.data.other_user_name}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{latestMessage.data.last_message_body}</p>
          </div>
        ) : unread > 0 ? null : (
          <CardEmpty>No messages yet.</CardEmpty>
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
          <ul className="space-y-2.5">
            {events.data.map((row) => (
              <li key={row.id} className="flex items-center gap-3">
                <DateTile dateStr={row.event_date} />
                <span className="min-w-0 text-sm text-fg">{row.title}</span>
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
