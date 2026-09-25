import api from '../../api/axios';
import { useAuth } from '../../auth/AuthContext';
import { useUnread } from '../../realtime/UnreadProvider';
import {
  todayLocalDateString,
  isWeekend,
  lastNDays,
  longDate,
  monthName,
  weekdayName,
} from '../../format/date';
import { currentTerm as calendarTerm } from '../../format/schoolCalendar';
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

// The avatar's letters (UI-D-3). INITIALS BECAUSE THERE IS NO PHOTO: the
// schema has no column for one and no route uploads one, so this is what the
// data supports rather than a placeholder for something coming later.
//
// It is `aria-hidden` at the call site, so it never has to be readable as
// text — the child's full name sits beside it. A learner with only one
// recorded name gets one letter rather than a padded pair, and a learner with
// neither gets nothing at all rather than a stray character.
function childInitials(user) {
  const first = (user?.student_first_name || '').trim().charAt(0);
  const last = (user?.student_last_name || '').trim().charAt(0);
  return `${first}${last}`.toUpperCase();
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

// ONE renderer for a fact this page states TWICE — in the hero and in the
// Excuse letters card below it. It printed the raw `2026-09-21` in both until
// UI-A (2026-09-23), and two spots carrying the same defect is the argument
// for a component rather than a repeated line: the fix applies once and can
// be proved once. Exported so the proof can render it (§17b); only the
// surrounding type scale and colour differ, which is what `className` is for.
export function AbsenceLine({ date, className = '' }) {
  return <p className={className}>Absence on {longDate(date)}</p>;
}

function DayCell({ day }) {
  // `longDate`, not the raw string: an accessible name is READ ALOUD, and a
  // screen reader says a YYYY-MM-DD as a run of digits and dashes. The
  // visible tile shows only the weekday initial, so this label is the only
  // place the date is stated at all.
  const spoken = `${weekdayName(day.date)} ${longDate(day.date)}`;
  const label =
    day.kind === 'recorded'
      ? `${spoken} — ${day.status}`
      : day.kind === 'weekend'
        ? `${spoken} — weekend, no class recorded`
        : `${spoken} — not recorded`;

  // THREE STATES THAT MUST BE TELLABLE APART AT A GLANCE (F3). The first
  // build gave weekend and not-recorded the same muted fill and differed only
  // by glyph — "·" against "–" at 12px, which in the browser were
  // near-identical. They are different facts and one of them is the whole
  // reason this strip is careful, so they now differ in BORDER STYLE as well
  // as glyph:
  //
  //   weekend       plain muted tile, solid edge   — there was no class
  //   not recorded  DASHED edge, empty centre      — nobody marked this day
  //
  // The dashed edge is doing the work colour cannot: it must also not be
  // mistakable for Absent, which is a solid red-bordered tile carrying "A".
  // Shape, glyph and the accessible name all separate them, so none of the
  // three depends on colour alone.
  const tone =
    day.kind === 'unrecorded'
      ? 'border-dashed border-edge-strong bg-transparent text-fg-muted'
      : day.kind === 'weekend'
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
        {/* A GLYPH, NEVER COLOUR ALONE. "·" is a weekend; a not-recorded day
            is deliberately EMPTY inside its dashed outline, because any mark
            there reads as a record. Neither is an absence. */}
        {day.kind === 'recorded' ? STATUS_INITIAL[day.status] || '?' : day.kind === 'weekend' ? '·' : ''}
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
          words, and "not recorded" in particular must read as "nobody marked
          this day" rather than as an absence.

          SEPARATED BY "|", NOT "·" (F3). The middots were the separator AND
          the weekend glyph, so the weekend entry rendered as "· · weekend" —
          two identical marks where one is the symbol being explained and the
          other is punctuation. A separator may not be one of the things it
          separates. */}
      <p className="mt-2 text-[11px] leading-snug text-fg-muted">
        P present | L late | A absent | E excused | &middot; weekend | dashed = not recorded
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

  // ONE TERM, THE CURRENT ONE, IN BOTH MODES (F2) — `term` is the caller's
  // `currentTerm`. Nothing here walks backwards looking for data.
  const rows = card.data.subjects.map((s) => ({
    name: s.subject_name,
    entry: s.terms?.[term] ?? null,
  }));

  // KEY STAGE 1 SHOWS EVERY SUBJECT, INCLUDING THE UNLETTERED ONES, and that
  // asymmetry with the numerical card is deliberate. The numerical card
  // already carries "N of M subjects recorded" in its caption, so a filtered
  // list is not hiding anything. Key Stage 1 has no such count — §12 refuses
  // one — so the only way a parent can see that four of five subjects are
  // still to come is for the list itself to say Pending.
  const visible = mode === 'descriptive' ? rows : rows.filter((r) => r.entry?.term_grade != null);

  if (!visible.length) return null;
  const shown = visible.slice(0, 4);

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
      {visible.length > shown.length ? (
        <li className="text-xs text-fg-muted">+{visible.length - shown.length} more</li>
      ) : null}
    </ul>
  );
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
export function ChildHero({ linked, user, section, grades, letterTerm, monthDays, letter, term }) {
  return (
    // `brand-panel`, NOT `primary` (UI-D-3). `--primary` is designed as a
    // BUTTON fill, and its dark value is `#ABA8F7` — a light indigo, which
    // turned this full-width panel into the brightest thing on a dark screen,
    // directly against the Dark option's own "easier on the eyes at night".
    // `--brand-panel` exists for exactly this and was already in use by the
    // Login split panel: a solid brand field in BOTH themes (`#08027C` light,
    // `#23204F` dark) with `--brand-panel-fg` white on each. Reusing it means
    // no new token and no new contrast pair — both foregrounds were already
    // asserted; only the badge-on-panel boundaries are new.
    <section className="rounded-xl bg-brand-panel p-5 text-brand-panel-fg">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-panel-muted">Your child</h2>
      {!linked ? (
        <p className="mt-2 text-sm text-brand-panel-fg">
          This account is not linked to a learner yet. Ask the school office.
        </p>
      ) : (
        <>
          {/* INITIALS, NOT A PHOTO. There is no photo column anywhere in the
              schema and no upload route for one, so initials are what the
              data can actually support — and they give the panel a fixed
              anchor on the left that the three figures below line up to. */}
          <div className="mt-1 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-panel-muted text-lg font-semibold"
            >
              {childInitials(user)}
            </span>
            <div className="min-w-0">
              <p className="text-xl font-semibold">{childName(user) || 'Name not recorded'}</p>
              <p className="text-sm text-brand-panel-muted">
                {classLabel(user) || 'Class not recorded'}
                {' · Adviser: '}
                {section.loading ? '…' : section.data?.adviser_name || 'not yet assigned'}
              </p>
            </div>
          </div>

          {/* THIN DIVIDERS BETWEEN THE THREE FIGURES. Stacked on a phone they
              are three unrelated blocks of text with only a gap between them;
              a rule says they are three answers to three questions. The
              divider follows the stacking direction — a top border while
              stacked, a left border once they are side by side — so it is
              never drawn across the flow. `first:border-0` keeps a rule off
              the leading edge in both directions. */}
          <div className="mt-4 grid gap-4 sm:grid-cols-3 [&>div]:border-t [&>div]:border-brand-panel-muted/40 [&>div]:pt-4 [&>div]:first:border-t-0 [&>div]:first:pt-0 sm:[&>div]:border-l sm:[&>div]:border-t-0 sm:[&>div]:pl-4 sm:[&>div]:pt-0 sm:[&>div]:first:border-l-0 sm:[&>div]:first:pl-0">
            <div>
              <p className="text-xs uppercase tracking-wide text-brand-panel-muted">
                {grades?.descriptive ? 'Latest letters' : 'General average'}
              </p>
              {grades?.descriptive ? (
                // KEY STAGE 1 HAS NO GENERAL AVERAGE (GRADING_SPEC §6a), so
                // the hero shows the grades themselves. Darryl, 2026-09-23.
                letterTerm ? (
                  // A CHIP IS NOT A LABEL (UI-D-3). This rendered the letter
                  // alone with the subject in a `title`, so the panel read
                  // "A  D" — two letters with nothing to say what either was
                  // about — and `title` does not exist on touch, which is the
                  // device a parent reads this on. The subject name was in
                  // scope on the element that printed the letter the whole
                  // time; this is a rendering fix, not an API one.
                  //
                  // The DESCRIPTOR comes with it, from the same payload and
                  // equally unused before now. It is the letter's meaning
                  // (GRADING_SPEC Table 8) — "A" alone asks the parent to
                  // remember a scale.
                  <div className="mt-1">
                    <p className="text-xs text-brand-panel-muted">Term {letterTerm.term}</p>
                    <ul className="mt-1 space-y-1.5">
                      {letterTerm.pills.map((p) => (
                        <li key={p.name} className="flex items-baseline gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-brand-panel-muted text-sm font-semibold">
                            {p.letter}
                          </span>
                          <span className="min-w-0 text-sm">
                            {p.name}
                            {p.descriptor ? (
                              <span className="text-brand-panel-muted"> · {p.descriptor}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {/* WHAT IS MISSING IS ALSO A FACT. The old panel filtered
                        unrecorded subjects out and said nothing, so a learner
                        with two letters of five looked complete. This is NOT
                        the "N of M" progress figure §12 refuses for Key Stage
                        1 — it does not imply a denominator of achievement or
                        a bar to fill; it names the subjects that have no
                        letter yet, which is the difference between silence
                        and a claim. */}
                    {letterTerm.missing > 0 ? (
                      <p className="mt-2 text-xs text-brand-panel-muted">
                        {letterTerm.missing} more{' '}
                        {letterTerm.missing === 1 ? 'subject' : 'subjects'} not yet recorded for Term{' '}
                        {letterTerm.term}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-brand-panel-fg">No letters recorded yet.</p>
                )
              ) : grades?.average !== null && grades?.average !== undefined ? (
                <>
                  <p className="mt-1 text-2xl font-semibold">
                    {/* TWO DECIMALS, through the one renderer the whole system
                        uses — GRADING_SPEC §4a. This card printed "87.5"
                        against the report card's "87.50" until DV4.

                        NO `className` SINCE UI-D-1. `GradeValue` used to
                        hardcode `text-fg` — dark in light mode, so on this
                        panel the average was invisible and DV4 had to pass
                        the panel's foreground to beat it, winning only by
                        stylesheet ORDER. `index.css` now sets a base colour
                        and the component emits none, so the figure simply
                        inherits `text-brand-panel-fg` from the section like
                        every other number here. The race is gone rather than
                        guarded. */}
                    <GradeValue value={grades.average} mode="numerical" />
                  </p>
                  {/* THE TERM IS `current_term`, NOT "the greatest term with
                      any grade" (§12). Those are two different questions and
                      this panel used to answer them in two places at once:
                      the letters column read `current_term` while the average
                      read whatever term had data, so one hero could state two
                      terms. The caption names the term so the figure cannot
                      be read as a year-to-date number.

                      THE WORD COMES FROM THE SERVER (pre-Stage-5 #2, item m).
                      UI-D-3 shipped this caption as "Term N" alone, because
                      `general_average_descriptor` describes the YEAR's
                      average and banding the term figure here would be a
                      second BANDS ladder in the client (§12). The server now
                      sends `term_average_descriptors`, one per term, through
                      the same ladder; the page flattens it to a string and
                      this renders it as a JSX child — so if the object ever
                      arrives whole, React refuses it loudly rather than
                      printing "[object Object]". Absent (a partial term, or
                      Key Stage 1), the caption is "Term N" as before. */}
                  <p className="text-xs text-brand-panel-muted">
                    Term {term}
                    {grades.descriptor ? <> · {grades.descriptor}</> : null}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-brand-panel-fg">
                  {grades?.subjects_total
                    ? `Term ${term} — ${grades.subjects_recorded ?? 0} of ${grades.subjects_total} recorded`
                    : 'No grades recorded yet.'}
                </p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-brand-panel-muted">Present this month</p>
              {/* "recorded days" BELONGS TO THE FRACTION and goes inside the
                  branch with it (F4). It used to sit outside, so an account
                  with nothing recorded printed "Nothing recorded this month."
                  followed by an orphan "recorded days" — a caption with no
                  figure above it, which reads as a truncated sentence. */}
              {monthDays ? (
                <>
                  <p className="mt-1 text-2xl font-semibold">
                    {monthDays.present} <span className="text-base font-normal">of {monthDays.total}</span>
                  </p>
                  <p className="text-xs text-brand-panel-muted">recorded days</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-brand-panel-fg">Nothing recorded this month.</p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-brand-panel-muted">Latest excuse letter</p>
              {letter.data ? (
                <div className="mt-1 space-y-1">
                  {/* The badge paints its own tint, so it is unaffected by
                      the panel behind it — but this is the first time one
                      sits anywhere but `surface`, so `check-contrast` gained
                      three boundary pairs for it (UI-D-3). */}
                  <StatusBadge status={letter.data.status} />
                  <AbsenceLine date={letter.data.absence_date} className="text-xs text-brand-panel-muted" />
                </div>
              ) : (
                <p className="mt-1 text-sm text-brand-panel-fg">None sent.</p>
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
          // §1: the unwrap list is the line to change when an endpoint gains a
          // field — left off, the field is silently absent and renders as a
          // plausible empty value (pre-Stage-5 #2, item m).
          'term_average_descriptors',
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

  // THE CURRENT TERM, FROM THE SCHOOL CALENDAR — never "the latest term that
  // has data" (Darryl, F2).
  //
  // The first build walked terms 3 → 1 and used the newest that carried a
  // letter. On the seeded Grade 1 learner that surfaced "Term 3 · C" — a
  // single stale letter from a term the school has not reached — while the
  // Grades card beside it and Marwin's card both said Term 1. One screen
  // showing two different terms is worse than showing nothing, and a parent
  // has no way to tell which one is current.
  //
  // So ONE term drives the hero and the Grades card. It was the
  // `current_term` setting until pre-Stage-5 #7 (2026-09-26); now it is
  // derived from today's date by format/schoolCalendar.js — the same rule
  // the server's dashboard, the class record and the class summary use — so
  // there is no settings read here any more and nothing to fall back from.
  // No cross-term mixing anywhere on this page.
  const currentTerm = calendarTerm(today);

  // That term's letters, for the Key Stage 1 hero. Read from the report card,
  // never computed: a letter IS the grade, so showing it is showing what the
  // server sent. §12 refuses a COUNT or a progress bar for Key Stage 1 —
  // "N of M" for something with no defined progress — and this is neither.
  const letterTerm = (() => {
    const subjects = card.data?.subjects;
    if (!Array.isArray(subjects)) return null;
    // The DESCRIPTOR travels with the letter (UI-D-3). It was already in this
    // payload and already being thrown away here — `buildTermEntry` returns
    // it beside `descriptive_grade` — and a letter without its meaning asks
    // the parent to remember a five-point scale.
    const pills = subjects
      .map((s) => ({
        name: s.subject_name,
        letter: s.terms?.[currentTerm]?.descriptive_grade ?? null,
        // `.descriptor.descriptor` — the ENTRY is an object, `{ descriptor,
        // filipino }` from `gradeComputation.js`'s Table 8, and the English
        // word is the one every other screen renders (`TermValue.jsx:31`,
        // `parent/GradesPage.jsx:290`). Passing the object itself crashed
        // the whole dashboard to a blank page: React refuses an object as a
        // child, and there is no error boundary above this.
        descriptor: s.terms?.[currentTerm]?.descriptor?.descriptor ?? null,
      }))
      .filter((p) => p.letter);
    // WHAT IS NOT RECORDED IS CARRIED TOO, rather than silently filtered:
    // two letters out of five used to look like a complete card.
    return pills.length
      ? { term: currentTerm, pills, missing: subjects.length - pills.length }
      : null;
  })();

  // THE HERO'S AVERAGE IS `current_term`'s, NOT THE DASHBOARD'S (UI-D-3, §12).
  //
  // `GET /api/dashboard` picks "the greatest term 1..3 that has any grade"
  // (`dashboard.js`), which is a different question from "which term is the
  // school in". The letters column already read `current_term`, so one panel
  // could state two terms at once — exactly the defect DV4 fixed for Key
  // Stage 1, still live on the numerical side.
  //
  // `term_averages` from the report card is the SAME COMPUTATION, checked
  // rather than assumed: `computeTermAverages` (`grades.js:660`) and the
  // dashboard's own branch both take the mean of every subject's term grade,
  // return null unless EVERY subject is recorded, and round to 2 — so this
  // changes which term is shown and nothing about how it is worked out. A
  // partial term stays null, and §12's "do not show a partial average" holds.
  const heroGrades = grades?.descriptive
    ? grades
    : {
        ...grades,
        average: card.data?.term_averages?.[currentTerm] ?? null,
        // `.descriptor` — THE ENGLISH WORD, NEVER THE OBJECT, AND NEVER
        // `remarks` (pre-Stage-5 #2, item m). The entry is `{ descriptor,
        // remarks }`: the object as a React child blanked this page once
        // already (§19f), and `remarks` is Passed/Failed — a verdict, which
        // §4 forbids on any screen.
        descriptor: card.data?.term_average_descriptors?.[currentTerm]?.descriptor ?? null,
      };

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
        grades={heroGrades}
        term={currentTerm}
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
            <SubjectList card={card} mode="descriptive" term={currentTerm} />
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
            <SubjectList card={card} mode="numerical" term={currentTerm} />
          </div>
        ) : grades?.term ? (
          <div>
            <Stat
              value="Pending"
              muted
              caption={`Term ${grades.term} — ${grades.subjects_recorded} of ${grades.subjects_total} subjects recorded`}
            />
            <SubjectList card={card} mode="numerical" term={currentTerm} />
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
            <AbsenceLine date={letter.data.absence_date} className="text-sm text-fg-muted" />
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
