import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshControl, ScrollView, View } from 'react-native';
import api from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import Text from '../../components/Text';
import { isWeekend, longDate, todayLocalDateString, weekdayName } from '../../format/date';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
import { isBuilt } from '../../navigation/routes';
import { useUnread } from '../../realtime/UnreadProvider';
import { useTheme } from '../../theme/ThemeProvider';
import Card, { CardEmpty, Stat } from '../dashboards/Card';
import ProfileHero from '../dashboards/ProfileHero';
import { useCard } from '../dashboards/useCard';
import { advisedSections, bannerFor, classesLead, nextEventLead, reviewLead, termGradesLead, unreadLead } from './dashboard/logic';

// THE TEACHER DASHBOARD (§12) — the web's TeacherDashboard.jsx in one
// column. One request per card, one failure per card, no Promise.all across
// cards. THE BANNER IS ONE ROW PER ADVISORY SECTION, hidden on Saturday and
// Sunday and not rendered at all for a teacher who advises nothing (My
// classes carries that explanation). Today comes from todayLocalDateString,
// never toISOString (§5a-iv), and the weekend test reads the SAME string
// (`isWeekend`), so the two cannot disagree across midnight.
//
// THE PROFILE HERO (feat/ui-refresh, 2026-10-02) follows the greeting: the
// signed-in teacher, today's date, and facts taken from the SAME two reads
// the screen already makes — /dashboard (school year, term, the class count
// My classes shows) and the advisory sections the banners are built from.
// Each fact appears when its read has answered and not before. No request
// was added.
//
// PULL TO REFRESH asks for everything, the advisory sections and each
// banner's day included; the Messages count is UnreadProvider's, kept current
// by the socket.
//
// A CARD NEVER LINKS TO A SCREEN THE PHONE DOES NOT HAVE (§12's last rule,
// one platform over): Grades and Attendance land on the second half of this
// branch, so their links are gated on `isBuilt` and appear the moment the
// route does — a link into an unregistered route would throw.
function openIfBuilt(navigation, path) {
  return isBuilt(path) ? () => navigation.navigate(path) : null;
}

// The banner's frame, shared by its loading, error and loaded states — the
// notice shape, so a re-read swaps the words and the tint, never the outline.
const BANNER_FRAME = 'rounded-xl border px-4 py-3';

// `tick` is the dashboard's reload count: the banner owns its card, so a
// focus re-fetch or a pull reaches it through this, not by a ref. It is
// useCard's `refresh`, NOT a dep (build 2): a tick re-reads the SAME query, so
// the banner keeps its answer on screen — busy, taking no touches — instead of
// dropping back to "Checking…" on every return to the dashboard.
function AttendanceBanner({ section, today, tick, navigation }) {
  const { tokens } = useTheme();
  const day = useCard(
    () =>
      api.get(`/attendance?grade_level=${section.grade_level}&section=${encodeURIComponent(section.name)}&date=${today}&limit=200`, {
        unwrap: 'attendance',
      }),
    [section.id, today],
    { refresh: tick }
  );
  const className = `Grade ${section.grade_level} - ${section.name}`;

  if (day.loading) {
    return (
      <View className={`${BANNER_FRAME} border-edge bg-surface`}>
        <Text className="text-sm text-fg-muted">Checking today’s attendance for {className}…</Text>
      </View>
    );
  }
  if (day.error) {
    return (
      <View className={`${BANNER_FRAME} border-edge bg-surface`}>
        <Text className="text-sm font-semibold text-fg">{className}</Text>
        <Text className="mt-1 text-sm text-fg-muted">{day.error}</Text>
        <Button size="sm" className="mt-3 self-start" onPress={day.reload}>
          Try again
        </Button>
      </View>
    );
  }

  const state = bannerFor(section, day.data || [], Number(section.student_count || 0));
  const success = state.tone === 'success';
  const open = openIfBuilt(navigation, '/teacher/attendance');
  return (
    <View
      className={`${BANNER_FRAME} ${success ? 'border-success-edge bg-success-soft' : 'border-warning-edge bg-warning-soft'}`}
      pointerEvents={day.refreshing ? 'none' : 'auto'}
      accessibilityState={day.refreshing ? { busy: true } : undefined}
    >
      <View className="flex-row items-start gap-3">
        {/* THE GLYPH SAYS WHAT THE COLOUR SAYS: a check once the register is
            complete, the clipboard while there is still something to mark —
            the two tints are never the only difference. */}
        <Icon
          name={success ? 'fa-circle-check' : 'fa-clipboard-user'}
          size={15}
          color={tokens[success ? 'success-strong' : 'warning-strong']}
          style={{ marginTop: 3 }}
        />
        <View className="min-w-0 flex-1">
          <Text className={`text-sm font-semibold ${success ? 'text-success-strong' : 'text-warning-strong'}`}>
            {className} — {state.label}
          </Text>
          <Text className="mt-0.5 text-sm text-fg-body">{state.detail}</Text>
        </View>
      </View>
      {/* The filled button while there is something to record; the neutral
          one once the day is done, when opening the register is no longer
          the thing this screen asks for. */}
      {open ? (
        <Button variant={success ? 'secondary' : 'primary'} size="sm" className="mt-3 self-start" onPress={open}>
          {success ? 'Open attendance' : 'Record attendance'}
        </Button>
      ) : null}
    </View>
  );
}

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { unread } = useUnread();
  const { tokens } = useTheme();
  const today = todayLocalDateString();
  const weekend = isWeekend(today);

  const summary = useCard(() => api.get('/dashboard', { unwrap: 'dashboard' }), []);
  const sections = useCard(
    () => api.get('/sections?limit=200', { unwrap: 'sections' }).then((rows) => advisedSections(rows, user.id)),
    [user?.id]
  );
  const pending = useCard(() => api.get('/excuse-letters?status=Pending&limit=1', { unwrap: ['excuse_letters', 'page'] }), []);
  // Ascending, explicitly: the endpoint defaults to event_date DESC, so a
  // `limit=3` without this returns the three furthest-away events (§12).
  const events = useCard(() => api.get(`/events?from=${today}&sort=event_date&order=asc&limit=3`, { unwrap: 'events' }), [today]);

  const d = summary.data;
  const advisory = sections.data || [];
  // The lead lines (f2): every card opens on a number, the review queue —
  // first — on the bigger one.
  const review = reviewLead(pending.data?.page);
  const gradesLine = termGradesLead(d);
  const classesLine = classesLead(d);
  const messagesLine = unreadLead(unread);
  const eventLine = nextEventLead(events.data);

  // The hero's facts, in the web's words. The date is the phone's own day;
  // the rest are `d` and `advisory`, so each is simply absent until its read
  // has answered. The class count is the figure My classes leads with, from
  // the same array. The year and the term are keyed on THEIR OWN VALUE, not
  // on `d`: a payload with no school year (the setting unset) must leave the
  // fact out, never print the word "undefined".
  const classCount = d?.classes?.length ?? 0;
  const facts = [
    { key: 'today', label: `${weekdayName(today)}, ${longDate(today)}` },
    d?.school_year ? { key: 'year', label: `School year ${d.school_year}` } : null,
    d?.term ? { key: 'term', label: `Term ${d.term}` } : null,
    classCount ? { key: 'classes', label: `${classCount} ${classCount === 1 ? 'class' : 'classes'}` } : null,
    ...advisory.map((section) => ({
      key: `advisory-${section.id}`,
      label: `Adviser of Grade ${section.grade_level} - ${section.name}`,
    })),
  ];

  // RE-FETCH ON FOCUS (M14, fix/mobile-popto P1, 2026-09-29). A drawer
  // screen is never unmounted, and `popTo` returns to this same instance, so
  // without this the letter count, the banner and the events stayed as
  // first loaded after a write on another screen. The first focus is the
  // mount, which useCard has already fetched — skipped, so a cold open
  // fetches once. Each `reload` is stable until its card's deps change, so
  // `reloadAll` is too.
  const [bannerTick, setBannerTick] = useState(0);
  const reloadAll = useCallback(() => {
    for (const reload of [summary.reload, sections.reload, pending.reload, events.reload]) reload();
    setBannerTick((t) => t + 1);
  }, [summary.reload, sections.reload, pending.reload, events.reload]);
  const firstFocus = useRef(true);
  // A PULL SHOWS THE NATIVE REFRESH INDICATOR WHILE THE CARDS RE-READ (build
  // 2, decision 6): a re-read keeps each card's answer on screen, so the
  // indicator is what says the pull was heard. A focus re-read clears
  // `pulled`, so it stays quiet. The banners re-read on the same tick; the
  // indicator follows the four cards.
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
  const rereading = summary.refreshing || sections.refreshing || pending.refreshing || events.refreshing;

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={pulled && rereading} onRefresh={onPull} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <Text className="text-sm text-fg-body">{user?.name ? `Good day, ${user.name}.` : 'Good day.'}</Text>

      {/* The hero and the five cards arrive one after another (Reveal), once,
          on mount; the cards all exist from the first render — each owns its
          spinner. The banners are not part of it: they appear when the
          advisory read answers, and a notice does not make an entrance. */}
      <Reveal>
        <ProfileHero user={user} facts={facts} />
      </Reveal>

      {!weekend && advisory.length
        ? advisory.map((section) => <AttendanceBanner key={section.id} section={section} today={today} tick={bannerTick} navigation={navigation} />)
        : null}

      <Reveal index={1}>
        <Card
          title="Excuse letters to review"
          icon="fa-envelope-open-text"
          onOpen={openIfBuilt(navigation, '/teacher/excuse-letters')}
          skeleton="lead"
          loading={pending.loading}
          refreshing={pending.refreshing}
          error={pending.error}
          onRetry={pending.reload}
          tone={pending.data?.page?.total > 0 ? 'warning' : 'default'}
        >
          {review ? <Stat large value={review.value} caption={review.caption} /> : null}
        </Card>
      </Reveal>

      <Reveal index={2}>
        <Card
          title="Term grades"
          icon="fa-chart-simple"
          onOpen={openIfBuilt(navigation, '/teacher/grades')}
          loading={summary.loading}
          refreshing={summary.refreshing}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? (
            gradesLine ? (
              <Stat value={gradesLine.value} caption={gradesLine.caption} />
            ) : (
              <CardEmpty>You have no subject assignments.</CardEmpty>
            )
          ) : null}
        </Card>
      </Reveal>

      <Reveal index={3}>
        {/* The count is UnreadProvider's — the server's answer, re-read on
            every `new_message` (§10); this card makes no request of its own. */}
        <Card title="Messages" icon="fa-comments" onOpen={openIfBuilt(navigation, '/teacher/messages')}>
          <Stat value={messagesLine.value} caption={messagesLine.caption} />
        </Card>
      </Reveal>

      <Reveal index={4}>
        <Card
          title="My classes"
          icon="fa-users-rectangle"
          onOpen={openIfBuilt(navigation, '/teacher/grades')}
          skeleton="list"
          loading={summary.loading}
          refreshing={summary.refreshing}
          error={summary.error}
          onRetry={summary.reload}
        >
          {classesLine ? (
            <View>
              <Stat value={classesLine.value} caption={classesLine.caption} />
              {d.classes.map((c, i) => (
                <View key={c.assignment_id} className={`border-t border-edge-soft py-2.5 ${i === 0 ? 'mt-3' : ''}`}>
                  <Text className="text-sm font-semibold text-fg">
                    Grade {c.grade_level} - {c.section}
                    <Text className="font-normal text-fg-muted">  {c.subject_name}</Text>
                  </Text>
                  <Text className="mt-0.5 text-sm text-fg-muted">
                    {c.students} {c.students === 1 ? 'student' : 'students'} · grades recorded {c.recorded} of {c.students}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            // TCH-002 is exactly this account: adviser of a section, no
            // subject assignments at all. Naming the state beats an empty box.
            <CardEmpty>
              You have no subject assignments. An admin assigns subjects to teachers
              {advisory.length ? ', but you can still record attendance for your advisory section.' : '.'}
            </CardEmpty>
          )}
        </Card>
      </Reveal>

      <Reveal index={5}>
        <Card
          title="Upcoming events"
          icon="fa-calendar-days"
          onOpen={openIfBuilt(navigation, '/teacher/events')}
          skeleton="list"
          loading={events.loading}
          refreshing={events.refreshing}
          error={events.error}
          onRetry={events.reload}
        >
          {eventLine ? (
            <View>
              <Stat value={eventLine.value} caption={eventLine.caption} />
              {events.data.length > 1 ? (
                <View className="mt-3 gap-2 border-t border-edge-soft pt-3">
                  {events.data.slice(1).map((row) => (
                    <Text key={row.id} className="text-sm text-fg">
                      {row.title}
                      <Text className="text-xs text-fg-muted">  {longDate(row.event_date)}</Text>
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <CardEmpty>No upcoming events.</CardEmpty>
          )}
        </Card>
      </Reveal>
    </ScrollView>
  );
}
