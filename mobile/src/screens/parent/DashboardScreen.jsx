import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import { longDate, monthName, todayLocalDateString, weekdayName, lastNDays } from '../../format/date';
import GradeValue from '../../format/GradeValue';
import { currentTerm as calendarTerm } from '../../format/schoolCalendar';
import TermValue from '../../format/TermValue';
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
// hero is not a Card: navy, three figures, no verdicts (§4). The pure
// helpers live in dashboard/logic.js so a proof can drive them.
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
      <Text className="text-[10px] uppercase text-fg-muted">{weekdayName(day.date).slice(0, 2)}</Text>
      <View className={`h-7 w-7 items-center justify-center rounded-md border ${tone}`}>
        {/* A GLYPH, NEVER COLOUR ALONE: "·" is a weekend; not-recorded is EMPTY
            inside a dashed outline, because any mark there reads as a record. */}
        <Text className={`text-xs font-semibold ${textTone}`}>
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
    <View className="mt-3 border-t border-edge pt-3">
      <Text className="mb-2 text-xs uppercase text-fg-muted">Last 7 days</Text>
      <View className="flex-row gap-1">
        {days.map((day) => (
          <DayCell key={day.date} day={day} />
        ))}
      </View>
      {/* Separated by "|", never "·" — a separator may not be one of the
          glyphs it separates (F3). */}
      <Text className="mt-2 text-[11px] leading-snug text-fg-muted">
        P present | L late | A absent | E excused | · weekend | dashed = not recorded
      </Text>
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
    <View className="mt-3 gap-1 border-t border-edge pt-2">
      {shown.map((r) => (
        <View key={r.name} className="flex-row items-baseline justify-between gap-3">
          <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-fg-muted">
            {r.name}
          </Text>
          <TermValue entry={r.entry} mode={mode} className="text-sm font-medium text-fg" />
        </View>
      ))}
      {visible.length > shown.length ? <Text className="text-xs text-fg-muted">+{visible.length - shown.length} more</Text> : null}
    </View>
  );
}

function DateTile({ dateStr }) {
  const [, m, d] = String(dateStr).split('-');
  return (
    <View className="h-11 w-11 items-center justify-center rounded-lg border border-edge bg-surface-subtle">
      <Text className="text-[10px] uppercase leading-none text-fg-muted">{monthName(Number(m)).slice(0, 3)}</Text>
      <Text className="text-base font-semibold leading-tight text-fg">{Number(d)}</Text>
    </View>
  );
}

function HeroFigure({ label, children, first = false }) {
  return (
    <View className={first ? '' : 'mt-4 border-t border-brand-panel-ring pt-4'}>
      <Text className="text-xs uppercase tracking-wide text-brand-panel-muted">{label}</Text>
      {children}
    </View>
  );
}

export function ChildHero({ linked, user, section, grades, letterTerm: letters, monthDays, letter, term }) {
  return (
    <View className="rounded-xl bg-brand-panel p-5">
      <Text className="text-sm font-semibold uppercase tracking-wider text-brand-panel-muted">Your child</Text>
      {!linked ? (
        <Text className="mt-2 text-sm text-brand-panel-fg">This account is not linked to a learner yet. Ask the school office.</Text>
      ) : (
        <>
          <View className="mt-1 flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-full border border-brand-panel-muted">
              <Text className="text-lg font-semibold text-brand-panel-fg">{childInitials(user)}</Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-xl font-semibold text-brand-panel-fg">{childName(user) || 'Name not recorded'}</Text>
              <Text className="text-sm text-brand-panel-muted">
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
                          <View className="h-6 w-6 items-center justify-center rounded-md border border-brand-panel-muted">
                            <Text className="text-sm font-semibold text-brand-panel-fg">{p.letter}</Text>
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
                  <GradeValue value={grades.average} mode="numerical" className="mt-1 text-2xl font-semibold text-brand-panel-fg" />
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
                  <Text className="mt-1 text-2xl font-semibold text-brand-panel-fg">
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
  // The lead lines (f2): every card opens on a number or the next action, and
  // Grades and Attendance — first after the hero — carry the bigger number.
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
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      reloadAll();
    }, [reloadAll])
  );

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={false} onRefresh={reloadAll} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <Text className="text-sm text-fg-muted">
        {user?.name ? `Good day, ${user.name}.` : 'Good day.'} Here is how {childName(user) || 'your child'} is doing.
      </Text>

      <ChildHero linked={linked} user={user} section={section} grades={hero} term={currentTerm} letterTerm={letters} monthDays={monthDays} letter={letter} />

      <Card title="Grades" icon="fa-chart-simple" onOpen={() => navigation.navigate('/parent/grades')} loading={summary.loading} error={summary.error} onRetry={summary.reload}>
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
          <View>
            <Stat large value={gLead.average !== undefined ? <GradeValue value={gLead.average} mode="numerical" /> : gLead.value} caption={gLead.caption} />
            <SubjectList card={card} mode="numerical" term={currentTerm} />
          </View>
        ) : (
          <CardEmpty>No grades recorded yet.</CardEmpty>
        )}
      </Card>

      <Card
        title="Attendance"
        icon="fa-clipboard-user"
        onOpen={() => navigation.navigate('/parent/attendance')}
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

      <Card title="Messages" icon="fa-comments" onOpen={() => navigation.navigate('/parent/messages')} loading={latestMessage.loading} error={latestMessage.error} onRetry={latestMessage.reload}>
        {mLead ? <Stat value={mLead.value} caption={mLead.caption} /> : null}
        {latestMessage.data ? (
          <View className="mt-3 border-t border-edge pt-2">
            <Text className="text-sm font-medium text-fg">{latestMessage.data.other_user_name}</Text>
            <Text numberOfLines={2} className="mt-0.5 text-sm text-fg-muted">
              {latestMessage.data.last_message_body}
            </Text>
          </View>
        ) : unread > 0 ? null : (
          <CardEmpty>No messages yet.</CardEmpty>
        )}
      </Card>

      <Card title="Excuse letters" icon="fa-envelope-open-text" onOpen={() => navigation.navigate('/parent/excuse-letters')} loading={letter.loading} error={letter.error} onRetry={letter.reload}>
        {!linked ? (
          <CardEmpty>No learner is linked to this account.</CardEmpty>
        ) : (
          <View className="gap-2">
            <Stat value={lLead.value} caption={lLead.caption} />
            {letter.data ? <AbsenceLine date={letter.data.absence_date} className="text-sm text-fg-muted" /> : null}
          </View>
        )}
      </Card>

      <Card title="Announcements & memos" icon="fa-bullhorn" onOpen={() => navigation.navigate('/parent/announcements')} loading={posts.loading} error={posts.error} onRetry={posts.reload}>
        {posts.data && (posts.data.announcements.length || posts.data.memos.length) ? (
          <View className="gap-2">
            <Stat value={pLead.value} caption={pLead.caption} />
            <View className="mt-1 border-t border-edge" />
            {posts.data.announcements.map((row) => (
              <Text key={`a-${row.id}`} className="text-sm text-fg">
                {row.title}
                <Text className="text-xs text-fg-muted">  Announcement</Text>
              </Text>
            ))}
            {posts.data.memos.map((row) => (
              <Text key={`m-${row.id}`} className="text-sm text-fg">
                {row.title}
                <Text className="text-xs text-fg-muted">  Memo</Text>
              </Text>
            ))}
          </View>
        ) : (
          <CardEmpty>Nothing posted yet.</CardEmpty>
        )}
      </Card>

      <Card title="Upcoming events" icon="fa-calendar-days" onOpen={() => navigation.navigate('/parent/events')} loading={events.loading} error={events.error} onRetry={events.reload}>
        {eLead ? (
          <View className="gap-2.5">
            <Stat value={eLead.value} caption={eLead.caption} />
            {events.data.length > 1 ? <View className="border-t border-edge" /> : null}
            {events.data.slice(1).map((row) => (
              <View key={row.id} className="flex-row items-center gap-3">
                <DateTile dateStr={row.event_date} />
                <Text className="min-w-0 flex-1 text-sm text-fg">{row.title}</Text>
              </View>
            ))}
          </View>
        ) : (
          <CardEmpty>No upcoming events.</CardEmpty>
        )}
      </Card>
    </ScrollView>
  );
}
