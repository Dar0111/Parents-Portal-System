import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { isWeekend, longDate, todayLocalDateString } from '../../format/date';
import { isBuilt } from '../../navigation/routes';
import { useUnread } from '../../realtime/UnreadProvider';
import { useTheme } from '../../theme/ThemeProvider';
import Card, { CardEmpty, Stat } from '../dashboards/Card';
import { useCard } from '../dashboards/useCard';
import { advisedSections, bannerFor } from './dashboard/logic';

// THE TEACHER DASHBOARD (§12) — the web's TeacherDashboard.jsx in one
// column. One request per card, one failure per card, no Promise.all across
// cards. THE BANNER IS ONE ROW PER ADVISORY SECTION, hidden on Saturday and
// Sunday and not rendered at all for a teacher who advises nothing (My
// classes carries that explanation). Today comes from todayLocalDateString,
// never toISOString (§5a-iv), and the weekend test reads the SAME string
// (`isWeekend`), so the two cannot disagree across midnight.
//
// A CARD NEVER LINKS TO A SCREEN THE PHONE DOES NOT HAVE (§12's last rule,
// one platform over): Grades and Attendance land on the second half of this
// branch, so their links are gated on `isBuilt` and appear the moment the
// route does — a link into an unregistered route would throw.
function openIfBuilt(navigation, path) {
  return isBuilt(path) ? () => navigation.navigate(path) : null;
}

function AttendanceBanner({ section, today, navigation }) {
  const day = useCard(
    () =>
      api.get(`/attendance?grade_level=${section.grade_level}&section=${encodeURIComponent(section.name)}&date=${today}&limit=200`, {
        unwrap: 'attendance',
      }),
    [section.id, today]
  );
  const className = `Grade ${section.grade_level} - ${section.name}`;

  if (day.loading) {
    return (
      <View className="rounded-xl border border-edge bg-surface px-4 py-3">
        <Text className="text-sm text-fg-muted">Checking today’s attendance for {className}…</Text>
      </View>
    );
  }
  if (day.error) {
    return (
      <View className="rounded-xl border border-edge bg-surface px-4 py-3">
        <Text className="text-sm text-fg">{className}</Text>
        <Text className="mt-1 text-sm text-fg-muted">{day.error}</Text>
        <Pressable onPress={day.reload} accessibilityRole="button" className="mt-2 self-start">
          <Text className="text-sm font-medium text-brand">Try again</Text>
        </Pressable>
      </View>
    );
  }

  const state = bannerFor(section, day.data || [], Number(section.student_count || 0));
  const success = state.tone === 'success';
  const open = openIfBuilt(navigation, '/teacher/attendance');
  return (
    <View className={`rounded-xl border px-4 py-3 ${success ? 'border-success-edge bg-success-soft' : 'border-warning-edge bg-warning-soft'}`}>
      <Text className={`text-sm font-semibold ${success ? 'text-success-strong' : 'text-warning-strong'}`}>
        {className} — {state.label}
      </Text>
      <Text className="mt-0.5 text-sm text-fg-body">{state.detail}</Text>
      {open ? (
        <Pressable onPress={open} accessibilityRole="button" className="mt-3 self-start rounded-lg bg-primary px-3 py-1.5">
          <Text className="text-sm font-medium text-primary-fg">{success ? 'Open attendance' : 'Record attendance'}</Text>
        </Pressable>
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

  function reloadAll() {
    for (const c of [summary, sections, pending, events]) c.reload();
  }

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={false} onRefresh={reloadAll} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <Text className="text-sm text-fg-muted">{user?.name ? `Good day, ${user.name}.` : 'Good day.'}</Text>

      {!weekend && advisory.length
        ? advisory.map((section) => <AttendanceBanner key={section.id} section={section} today={today} navigation={navigation} />)
        : null}

      <Card
        title="Excuse letters to review"
        icon="fa-envelope-open-text"
        onOpen={openIfBuilt(navigation, '/teacher/excuse-letters')}
        loading={pending.loading}
        error={pending.error}
        onRetry={pending.reload}
        tone={pending.data?.page?.total > 0 ? 'warning' : 'default'}
      >
        {pending.data?.page?.total > 0 ? (
          <Stat value={String(pending.data.page.total)} caption={pending.data.page.total === 1 ? 'letter waiting' : 'letters waiting'} />
        ) : (
          <CardEmpty>Nothing waiting.</CardEmpty>
        )}
      </Card>

      <Card title="Term grades" icon="fa-chart-simple" onOpen={openIfBuilt(navigation, '/teacher/grades')} loading={summary.loading} error={summary.error} onRetry={summary.reload}>
        {d ? (
          d.classes_total === 0 ? (
            <CardEmpty>You have no subject assignments.</CardEmpty>
          ) : (
            <Stat value={`${d.classes_complete} of ${d.classes_total}`} caption={`classes fully recorded, Term ${d.term}`} />
          )
        ) : null}
      </Card>

      <Card title="Messages" icon="fa-comments" onOpen={openIfBuilt(navigation, '/teacher/messages')}>
        {unread > 0 ? <Stat value={String(unread)} caption={unread === 1 ? 'unread message' : 'unread messages'} /> : <CardEmpty>No unread messages.</CardEmpty>}
      </Card>

      <Card
        title="My classes"
        icon="fa-users-rectangle"
        onOpen={openIfBuilt(navigation, '/teacher/grades')}
        linkLabel="Open grades"
        loading={summary.loading}
        error={summary.error}
        onRetry={summary.reload}
      >
        {d?.classes?.length ? (
          <View>
            {d.classes.map((c, i) => (
              <View key={c.assignment_id} className={`py-2 ${i > 0 ? 'border-t border-edge' : ''}`}>
                <Text className="text-sm text-fg">
                  Grade {c.grade_level} - {c.section}
                  <Text className="text-fg-muted">  {c.subject_name}</Text>
                </Text>
                <Text className="text-sm text-fg-muted">
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

      <Card title="Upcoming events" icon="fa-calendar-days" onOpen={openIfBuilt(navigation, '/teacher/events')} loading={events.loading} error={events.error} onRetry={events.reload}>
        {events.data?.length ? (
          <View className="gap-2">
            {events.data.map((row) => (
              <Text key={row.id} className="text-sm text-fg">
                {row.title}
                <Text className="text-xs text-fg-muted">  {longDate(row.event_date)}</Text>
              </Text>
            ))}
          </View>
        ) : (
          <CardEmpty>No upcoming events.</CardEmpty>
        )}
      </Card>
    </ScrollView>
  );
}
