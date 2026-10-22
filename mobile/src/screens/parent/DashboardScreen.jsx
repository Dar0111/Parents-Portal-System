import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshControl, ScrollView, View } from 'react-native';
import api from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import Text from '../../components/Text';
import { longDate, monthName, todayLocalDateString, weekdayName, lastNDays } from '../../format/date';
import GradeValue from '../../format/GradeValue';
import { currentTerm as calendarTerm } from '../../format/schoolCalendar';
import TermValue from '../../format/TermValue';
import Reveal from '../../motion/Reveal';
import { useNotifications } from '../../realtime/NotificationProvider';
import { useUnread } from '../../realtime/UnreadProvider';
import { useTheme } from '../../theme/ThemeProvider';
import Card, { CardEmpty, Stat } from '../dashboards/Card';
import { useCard } from '../dashboards/useCard';
import {
  STATUS_INITIAL,
  attendanceLead,
  childInitials,
  childName,
  classLabel,
  firstOfMonth,
  gradesLead,
  heroGrades,
  letterLead,
  letterTerm,
  nextEventLead,
  postsLead,
  recordedDays,
  unreadLead,
  weekStrip,
} from './dashboard/logic';

// THE PARENT DASHBOARD (§12, §15) — the web's ParentDashboard.jsx in one
// column. Every card owns its state through useCard (a verbatim copy); no
// Promise.all across cards. ONE term, today's from the school calendar. The
// hero is not a Card: the brand panel, three figures, no verdicts (§4). The
// pure helpers live in dashboard/logic.js so a proof can drive them.
//
// PULL TO REFRESH asks every card again (`reloadAll`); a count that belongs
// to a provider (unread messages, unread posts) is kept current by the
// socket (§10).
const EYEBROW = 'text-xs font-semibold uppercase tracking-wide';
// The hero's labels (build 2, Part C): plain words, no uppercase tracking,
// one step up to `text-sm` — the web hero's `HERO_LABEL`. The card's own
// eyebrow ("Last 7 days") keeps EYEBROW.
const HERO_LABEL = 'text-sm font-semibold';

function AbsenceLine({ date, className = '' }) {
  return <Text className={className}>Absence on {longDate(date)}</Text>;
}

function DayCell({ day }) {
  const spoken = `${weekdayName(day.date)} ${longDate(day.date)}`;
  const label =
    day.kind === 'recorded'
      ? `${spoken} — ${day.status}`
      : day.kind === 'weekend'
        ? `${spoken} — weekend, no class recorded`
        : `${spoken} — not recorded`;
  const tone =
    day.kind === 'unrecorded'
      ? 'border-dashed border-edge-strong'
      : day.kind === 'weekend'
        ? 'border-edge bg-surface-subtle'
        : day.status === 'Present'
          ? 'border-success-edge bg-success-soft'
          : day.status === 'Absent'
            ? 'border-danger-edge bg-danger-soft'
            : day.status === 'Late'
              ? 'border-warning-edge bg-warning-soft'
              : 'border-info-edge bg-info-soft';
  const textTone =
    day.kind !== 'recorded'
      ? 'text-fg-muted'
      : day.status === 'Present'
        ? 'text-success-fg'
        : day.status === 'Absent'
          ? 'text-danger-fg'
          : day.status === 'Late'
            ? 'text-warning-fg'
            : 'text-info-fg';
  return (
    <View className="flex-1 items-center gap-1" accessible accessibilityLabel={label}>
      {/* A scale step, never a px size (feat/ui-refresh): the OS font scale
          is the phone's text size (M3) and every step follows it. */}
      <Text className="text-xs font-semibold uppercase text-fg-muted">{weekdayName(day.date).slice(0, 2)}</Text>
      <View className={`h-7 w-7 items-center justify-center rounded-lg border ${tone}`}>
        {/* A GLYPH, NEVER COLOUR ALONE: "·" is a weekend; not-recorded is EMPTY
            inside a dashed outline, because any mark there reads as a record. */}
        <Text className={`text-xs font-bold ${textTone}`}>
          {day.kind === 'recorded' ? STATUS_INITIAL[day.status] || '?' : day.kind === 'weekend' ? '·' : ''}
        </Text>
      </View>
    </View>
  );
}

function WeekStrip({ week, today }) {
  if (week.loading) return <Text className="mt-3 text-xs text-fg-muted">Loading the last week…</Text>;
  if (week.error || !Array.isArray(week.data)) return null;
  const days = weekStrip(week.data, today);
  return (
    <View className="mt-3 border-t border-edge-soft pt-3">
      <Text className={`mb-2 ${EYEBROW} text-fg-muted`}>Last 7 days</Text>
      <View className="flex-row gap-1">
        {days.map((day) => (
          <DayCell key={day.date} day={day} />
        ))}
      </View>
      {/* Separated by "|", never "·" — a separator may not be one of the
          glyphs it separates (F3). */}
      <Text className="mt-2 text-xs text-fg-muted">P present | L late | A absent | E excused | · weekend | dashed = not recorded</Text>
    </View>
  );
}

function SubjectList({ card, mode, term }) {
  if (card.loading) return <Text className="mt-3 text-xs text-fg-muted">Loading subjects…</Text>;
  if (card.error || !Array.isArray(card.data?.subjects)) return null;
  const rows = card.data.subjects.map((s) => ({ name: s.subject_name, entry: s.terms?.[term] ?? null }));
  // Key Stage 1 lists EVERY subject with Pending; the numerical card lists
  // only what is recorded (§15b).
  const visible = mode === 'descriptive' ? rows : rows.filter((r) => r.entry?.term_grade != null);
  if (!visible.length) return null;
  const shown = visible.slice(0, 4);
  return (
    <View className="mt-3 gap-1.5 border-t border-edge-soft pt-3">
      {shown.map((r) => (
        <View key={r.name} className="flex-row items-baseline justify-between gap-3">
          <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-fg-muted">
            {r.name}
          </Text>
          <TermValue entry={r.entry} mode={mode} className="text-sm font-semibold text-fg" />
        </View>
      ))}
      {visible.length > shown.length ? <Text className="text-xs text-fg-muted">+{visible.length - shown.length} more</Text> : null}
    </View>
  );
}

// 44dp square, as a plain style object: the phone's rem is 14 (M19), so a
// size class would be smaller than the two lines it holds need.
function DateTile({ dateStr }) {
  const [, m, d] = String(dateStr).split('-');
  return (
    <View className="items-center justify-center rounded-xl border border-edge bg-surface-subtle" style={{ width: 44, height: 44 }}>
      <Text className="text-xs font-semibold uppercase leading-none text-fg-muted">{monthName(Number(m)).slice(0, 3)}</Text>
      <Text className="text-base font-bold leading-tight text-fg">{Number(d)}</Text>
    </View>
  );
}

function HeroFigure({ label, children, first = false }) {
  return (
    <View className={first ? '' : 'mt-4 border-t border-brand-panel-ring pt-4'}>
      <Text className={`${HERO_LABEL} text-brand-panel-muted`}>{label}</Text>
      {children}
    </View>
  );
}

// THE SAME BAND AS THE STAFF PROFILE HERO since feat/ui-refresh
// (dashboards/ProfileHero.jsx): the container corner (`rounded-xl`, since
// build 2's Part C), the hairline edge, plain-word labels (no uppercase
// tracking since Part C), the name in the title face, and a 64dp disc.
// INITIALS, NOT A PHOTO — a learner has none (`students` has no photo column,
// §25), so the disc is drawn as Avatar draws its fallback. A letter sits on
// the plain surface.
export function ChildHero({ linked, user, section, grades, letterTerm: letters, monthDays, letter, term }) {
  return (
    <View className="rounded-xl border border-edge bg-brand-panel p-5">
      <Text className={`${HERO_LABEL} text-brand-panel-muted`}>Your child</Text>
      {!linked ? (
        <Text className="mt-2 text-sm text-brand-panel-fg">This account is not linked to a learner yet. Ask the school office.</Text>
      ) : (
        <>
          <View className="mt-3 flex-row items-center gap-4">
            <View className="items-center justify-center rounded-full border border-edge bg-brand-soft" style={{ width: 64, height: 64 }}>
              <Text className="text-xl font-semibold text-brand">{childInitials(user)}</Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-serif text-xl text-brand-panel-fg">{childName(user) || 'Name not recorded'}</Text>
              <Text className="mt-1 text-sm text-brand-panel-muted">
                {classLabel(user) || 'Class not recorded'} · Adviser: {section.loading ? '…' : section.data?.adviser_name || 'not yet assigned'}
              </Text>
            </View>
          </View>

          <View className="mt-4">
            <HeroFigure label={grades?.descriptive ? 'Latest letters' : 'General average'} first>
              {grades?.descriptive ? (
                letters ? (
                  <View className="mt-1">
                    <Text className="text-xs text-brand-panel-muted">Term {letters.term}</Text>
                    <View className="mt-1 gap-1.5">
                      {letters.pills.map((p) => (
                        <View key={p.name} className="flex-row items-baseline gap-2">
                          <View className="h-7 w-7 items-center justify-center rounded-lg bg-surface">
                            <Text className="text-sm font-bold text-fg-secondary">{p.letter}</Text>
                          </View>
                          <Text className="min-w-0 flex-1 text-sm text-brand-panel-fg">
                            {p.name}
                            {p.descriptor ? <Text className="text-brand-panel-muted"> · {p.descriptor}</Text> : null}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {letters.missing > 0 ? (
                      <Text className="mt-2 text-xs text-brand-panel-muted">
                        {letters.missing} more {letters.missing === 1 ? 'subject' : 'subjects'} not yet recorded for Term {letters.term}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text className="mt-1 text-sm text-brand-panel-fg">No letters recorded yet.</Text>
                )
              ) : grades?.average !== null && grades?.average !== undefined ? (
                <>
                  <GradeValue value={grades.average} mode="numerical" className="mt-1 text-xl font-bold text-brand-panel-fg" />
                  <Text className="text-xs text-brand-panel-muted">
                    Term {term}
                    {grades.descriptor ? ` · ${grades.descriptor}` : ''}
                  </Text>
                </>
              ) : (
                <Text className="mt-1 text-sm text-brand-panel-fg">
                  {grades?.subjects_total
                    ? `Term ${term} — ${grades.subjects_recorded ?? 0} of ${grades.subjects_total} recorded`
                    : 'No grades recorded yet.'}
                </Text>
              )}
            </HeroFigure>

            <HeroFigure label="Present this month">
              {monthDays ? (
                <>
                  <Text className="mt-1 text-xl font-bold text-brand-panel-fg">
                    {monthDays.present} <Text className="text-base font-normal">of {monthDays.total}</Text>
                  </Text>
                  <Text className="text-xs text-brand-panel-muted">recorded days</Text>
                </>
              ) : (
                <Text className="mt-1 text-sm text-brand-panel-fg">Nothing recorded this month.</Text>
              )}
            </HeroFigure>

            <HeroFigure label="Latest excuse letter">
              {letter.data ? (
                <View className="mt-1 gap-1">
                  <StatusBadge status={letter.data.status} />
                  <AbsenceLine date={letter.data.absence_date} className="text-xs text-brand-panel-muted" />
                </View>
              ) : (
                <Text className="mt-1 text-sm text-brand-panel-fg">None sent.</Text>
              )}
            </HeroFigure>
          </View>
        </>
      )}
    </View>
  );
}

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { unread } = useUnread();
  const { counts } = useNotifications();
  const { tokens } = useTheme();
  const studentId = user?.student_id ?? null;
  const linked = Boolean(studentId);
  const today = todayLocalDateString();

  const summary = useCard(() => api.get('/dashboard', { unwrap: 'dashboard' }), [studentId]);
  const section = useCard(
    () => api.get(`/sections?grade_level=${user.grade_level}`, { unwrap: 'sections' }).then((rows) => rows.find((r) => r.name === user.section) || null),
    [user?.grade_level, user?.section],
    { skip: user?.grade_level == null || !user?.section }
  );
  const month = useCard(
    () => api.get(`/attendance/summary/${studentId}?from=${firstOfMonth(today)}&to=${today}`, { unwrap: 'summary' }),
    [studentId, today],
    { skip: !linked }
  );
  const allTime = useCard(() => api.get(`/attendance/summary/${studentId}`, { unwrap: 'summary' }), [studentId], { skip: !linked });
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
        if (a.status === 'rejected' && m.status === 'rejected') throw a.reason;
        return { announcements: a.status === 'fulfilled' ? a.value : [], memos: m.status === 'fulfilled' ? m.value : [] };
      }),
    []
  );
  const events = useCard(() => api.get(`/events?from=${today}&sort=event_date&order=asc&limit=3`, { unwrap: 'events' }), [today]);
  const card = useCard(
    () =>
      api.get(`/grades/student/${studentId}`, {
        unwrap: ['student', 'school_year', 'grading_mode', 'subjects', 'term_averages', 'term_average_descriptors', 'general_average', 'general_average_descriptor'],
      }),
    [studentId],
    { skip: !linked }
  );
  const week = useCard(
    () => api.get(`/attendance/student/${studentId}?from=${lastNDays(7, today)[0]}&to=${today}`, { unwrap: 'attendance' }),
    [studentId, today],
    { skip: !linked }
  );
  const latestMessage = useCard(
    () => api.get('/messages/conversations?limit=1&sort=last_message_at&order=desc', { unwrap: 'conversations' }).then((rows) => rows[0] || null),
    []
  );

  const grades = summary.data?.grades ?? null;
  const currentTerm = calendarTerm(today);
  const letters = letterTerm(card.data?.subjects, currentTerm);
  const hero = heroGrades(grades, card.data, currentTerm);
  const monthDays = recordedDays(month.data);
  // The lead lines. Since 2026-09-30 the phone follows the WEB parent
  // dashboard: Grades is one normal-size line, Excuse letters the small badge
  // and the date; Attendance keeps its large absences number.
  const gLead = gradesLead(grades);
  const aLead = attendanceLead(monthDays, today);
  const mLead = unreadLead(unread, Boolean(latestMessage.data));
  const eLead = nextEventLead(events.data);
  const lLead = letterLead(letter.data);
  const pLead = postsLead(counts);

  // RE-FETCH ON FOCUS (M14, fix/mobile-popto P1, 2026-09-29). A drawer
  // screen is never unmounted, and `popTo` returns to this same instance, so
  // without this a letter just submitted, a new announcement or event, or
  // attendance recorded meanwhile stayed as first loaded until a pull. The
  // first focus is the mount, which useCard has already fetched — skipped,
  // so a cold open fetches once. Each `reload` is stable until its card's
  // deps change, so `reloadAll` is too.
  const reloadAll = useCallback(() => {
    for (const reload of [
      summary.reload,
      section.reload,
      month.reload,
      allTime.reload,
      letter.reload,
      posts.reload,
      events.reload,
      card.reload,
      week.reload,
      latestMessage.reload,
    ])
      reload();
  }, [summary.reload, section.reload, month.reload, allTime.reload, letter.reload, posts.reload, events.reload, card.reload, week.reload, latestMessage.reload]);
  const firstFocus = useRef(true);
  // A PULL SHOWS THE NATIVE REFRESH INDICATOR WHILE THE CARDS RE-READ (build
  // 2, decision 6): a re-read keeps each card's answer on screen, so the
  // indicator is what says the pull was heard. A focus re-read clears
  // `pulled`, so it stays quiet.
  const [pulled, setPulled] = useState(false);
  const onPull = useCallback(() => {
    setPulled(true);
    reloadAll();
  }, [reloadAll]);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setPulled(false);
      reloadAll();
    }, [reloadAll])
  );
  const rereading = [summary, section, month, allTime, letter, posts, events, card, week, latestMessage].some((c) => c.refreshing);

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={pulled && rereading} onRefresh={onPull} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <Text className="text-sm text-fg-body">
        {user?.name ? `Good day, ${user.name}.` : 'Good day.'} Here is how {childName(user) || 'your child'} is doing.
      </Text>

      {/* The hero and the six cards arrive one after another (Reveal), once,
          on mount; all of them exist from the first render — each card owns
          its spinner — so a reload never replays it. */}
      <Reveal>
        <ChildHero linked={linked} user={user} section={section} grades={hero} term={currentTerm} letterTerm={letters} monthDays={monthDays} letter={letter} />
      </Reveal>

      <Reveal index={1}>
        <Card
          title="Grades"
          icon="fa-chart-simple"
          onOpen={() => navigation.navigate('/parent/grades')}
          skeleton="list"
          loading={summary.loading}
          refreshing={summary.refreshing || card.refreshing}
          error={summary.error}
          onRetry={summary.reload}
        >
          {!linked ? (
            <CardEmpty>No learner is linked to this account.</CardEmpty>
          ) : grades?.unavailable ? (
            <CardEmpty>Grading is not set up for this grade level yet. Ask the school office.</CardEmpty>
          ) : grades?.descriptive ? (
            <View>
              <Text className="text-sm text-fg-muted">Reported as a letter for each subject.</Text>
              <SubjectList card={card} mode="descriptive" term={currentTerm} />
            </View>
          ) : gLead ? (
            // The web's card (2026-09-30): until complete, one normal-size line
            // and the recorded subjects; complete, the average as a Stat.
            <View>
              {gLead.line ? (
                <Text className="text-sm font-semibold text-fg">{gLead.line}</Text>
              ) : (
                <Stat value={<GradeValue value={gLead.average} mode="numerical" />} caption={gLead.caption} />
              )}
              <SubjectList card={card} mode="numerical" term={currentTerm} />
            </View>
          ) : (
            <CardEmpty>No grades recorded yet.</CardEmpty>
          )}
        </Card>
      </Reveal>

      <Reveal index={2}>
        <Card
          title="Attendance"
          icon="fa-clipboard-user"
          onOpen={() => navigation.navigate('/parent/attendance')}
          skeleton="lead"
          loading={month.loading || allTime.loading}
          refreshing={month.refreshing || allTime.refreshing || week.refreshing}
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
                  <View>
                    <CardEmpty>Nothing recorded this month.</CardEmpty>
                    {a ? <Text className="mt-2 text-sm text-fg-muted">School year so far: {a.present} of {a.total} recorded days</Text> : null}
                  </View>
                );
              }
              return (
                <View>
                  <Stat large value={aLead.value} caption={aLead.caption} />
                  <View className="mt-3">
                    <Stat value={`${m.present} of ${m.total}`} caption="Present on recorded days, this month" />
                  </View>
                  <Text className="mt-2 text-sm text-fg-muted">
                    {m.absent} absent · {m.late} late
                  </Text>
                  <WeekStrip week={week} today={today} />
                  {a ? <Text className="mt-2 text-sm text-fg-muted">School year so far: {a.present} of {a.total} recorded days</Text> : null}
                </View>
              );
            })()
          )}
        </Card>
      </Reveal>

      <Reveal index={3}>
        {/* THE COUNT IS STILL THE SERVER'S ANSWER (§10) — `unread` comes from
            UnreadProvider, never from the length of this list. The preview
            below supplies only the sender and the snippet. */}
        <Card
          title="Messages"
          icon="fa-comments"
          onOpen={() => navigation.navigate('/parent/messages')}
          loading={latestMessage.loading}
          refreshing={latestMessage.refreshing}
          error={latestMessage.error}
          onRetry={latestMessage.reload}
        >
          {mLead ? <Stat value={mLead.value} caption={mLead.caption} /> : null}
          {latestMessage.data ? (
            <View className="mt-3 border-t border-edge-soft pt-3">
              <Text className="text-sm font-semibold text-fg">{latestMessage.data.other_user_name}</Text>
              <Text numberOfLines={2} className="mt-0.5 text-sm text-fg-muted">
                {latestMessage.data.last_message_body}
              </Text>
            </View>
          ) : unread > 0 ? null : (
            <CardEmpty>No messages yet.</CardEmpty>
          )}
        </Card>
      </Reveal>

      <Reveal index={4}>
        <Card
          title="Excuse letters"
          icon="fa-envelope-open-text"
          onOpen={() => navigation.navigate('/parent/excuse-letters')}
          loading={letter.loading}
          refreshing={letter.refreshing}
          error={letter.error}
          onRetry={letter.reload}
        >
          {!linked ? (
            <CardEmpty>No learner is linked to this account.</CardEmpty>
          ) : lLead ? (
            // The web's card: the small badge, then the absence date.
            <View className="items-start gap-2">
              <StatusBadge status={lLead.status} />
              <AbsenceLine date={lLead.absenceDate} className="text-sm text-fg-muted" />
            </View>
          ) : (
            <CardEmpty>No excuse letters.</CardEmpty>
          )}
        </Card>
      </Reveal>

      <Reveal index={5}>
        <Card
          title="Upcoming events"
          icon="fa-calendar-days"
          onOpen={() => navigation.navigate('/parent/events')}
          skeleton="list"
          loading={events.loading}
          refreshing={events.refreshing}
          error={events.error}
          onRetry={events.reload}
        >
          {eLead ? (
            <View>
              {/* NOT a Stat (the B3 device check's finding #1): the title
                  reads at the cards' line size, text-sm, in bold. The caption
                  keeps Stat's own classes, unchanged. */}
              <View className="min-w-0">
                <Text className="text-sm font-bold text-fg">{eLead.value}</Text>
                <Text className="mt-1 text-sm text-fg-muted">{eLead.caption}</Text>
              </View>
              {events.data.length > 1 ? (
                <View className="mt-3 gap-2.5 border-t border-edge-soft pt-3">
                  {events.data.slice(1).map((row) => (
                    <View key={row.id} className="flex-row items-center gap-3">
                      <DateTile dateStr={row.event_date} />
                      <Text className="min-w-0 flex-1 text-sm text-fg">{row.title}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <CardEmpty>No upcoming events.</CardEmpty>
          )}
        </Card>
      </Reveal>

      {/* LAST, AS A LIST (Part C, the web's order): one row per post, its
          title on the left and its kind on the right, a hairline between. */}
      <Reveal index={6}>
        <Card
          title="Announcements & memos"
          icon="fa-bullhorn"
          onOpen={() => navigation.navigate('/parent/announcements')}
          skeleton="list"
          loading={posts.loading}
          refreshing={posts.refreshing}
          error={posts.error}
          onRetry={posts.reload}
        >
          {posts.data && (posts.data.announcements.length || posts.data.memos.length) ? (
            <View>
              <Stat value={pLead.value} caption={pLead.caption} />
              <View className="mt-3 border-t border-edge-soft">
                {[
                  ...posts.data.announcements.map((row) => ({ key: `a-${row.id}`, title: row.title, kind: 'Announcement' })),
                  ...posts.data.memos.map((row) => ({ key: `m-${row.id}`, title: row.title, kind: 'Memo' })),
                ].map((post, i) => (
                  <View key={post.key} className={`flex-row items-baseline justify-between gap-3 py-2.5 ${i ? 'border-t border-edge-soft' : ''}`}>
                    <Text className="min-w-0 flex-1 text-sm text-fg">{post.title}</Text>
                    <Text className="text-xs text-fg-muted">{post.kind}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <CardEmpty>Nothing posted yet.</CardEmpty>
          )}
        </Card>
      </Reveal>
    </ScrollView>
  );
}
