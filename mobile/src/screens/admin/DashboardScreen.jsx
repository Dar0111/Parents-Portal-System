import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshControl, ScrollView, View } from 'react-native';
import api from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import Text from '../../components/Text';
import { longDate, todayLocalDateString, weekdayName } from '../../format/date';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
import { isBuilt } from '../../navigation/routes';
import { useSocket } from '../../realtime/SocketProvider';
import { useTheme } from '../../theme/ThemeProvider';
import Card, { Stat } from '../dashboards/Card';
import ProfileHero from '../dashboards/ProfileHero';
import { useCard } from '../dashboards/useCard';
import { backupAge, CARD_LINKS, pendingLead, pendingTone, showLockoutHazard } from './dashboard/logic';

// THE ADMIN DASHBOARD (§12) — the web's AdminDashboard.jsx in one column. One
// request per card; every count is the server's (`GET /dashboard`) and each
// card opens the list whose WHERE it repeats. NOTHING IS RED. The lockout
// hazard card is amber, not dismissible, names no account, and clears itself.
// Recent activity is deliberately absent (no read endpoint for
// activity_logs). BACKUP & RESTORE IS WEB ONLY: the System card shows the
// last backup's age and never links to it. It re-reads on focus (M14): a
// drawer screen is never unmounted, and a review on Users changes the
// waiting count behind it.
//
// THE PROFILE HERO (feat/ui-refresh, 2026-10-02) leads the screen: the
// signed-in admin, today's date, and the school year and term — the last two
// from the SAME /dashboard read the cards use, so they appear when it has
// answered and not before. No request was added for it.
//
// RELOAD (feat/ui-refresh): ONE request feeds all five cards, so each card's
// Reload is that one `summary.reload` and pressing any of them refreshes all
// five. System's also re-reads the backup line.
function Row({ label, value, tone }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 border-t border-edge-soft py-2">
      <Text className="min-w-0 flex-1 text-sm text-fg-muted">{label}</Text>
      <Text className={`text-sm font-semibold ${tone === 'success' ? 'text-success-strong' : tone === 'warning' ? 'text-warning-strong' : 'text-fg'}`}>{value}</Text>
    </View>
  );
}

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const { connected } = useSocket();
  const today = todayLocalDateString();
  const summary = useCard(() => api.get('/dashboard', { unwrap: 'dashboard' }), []);
  const backups = useCard(() => api.get('/backups?limit=1', { unwrap: 'backups' }).then((rows) => rows[0] || null), []);

  const reloadAll = useCallback(() => {
    summary.reload();
    backups.reload();
    // `reload` is a new function each render; the cards' own deps decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // THE FIRST FOCUS IS THE MOUNT, which useCard has already fetched — so it
  // is skipped, and a cold open fetches each card ONCE (feat/ui-polish,
  // 2026-09-30; the parent and teacher dashboards' pattern since P1). Every
  // later focus re-fetches (M14).
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

  const d = summary.data;
  const pending = d?.pending_parents ?? 0;
  const age = backupAge(backups.data?.created_at);
  const backupWarn = Boolean(backups.error) || age.tone !== 'success';
  const open = (key) => (isBuilt(CARD_LINKS[key]) ? () => navigation.navigate(CARD_LINKS[key]) : null);

  // The hero's facts, in the web's words. The date is the phone's own day;
  // the other two are `d`, so they are simply absent until /dashboard has
  // answered. Each is keyed on ITS OWN VALUE, not on `d`: a payload with no
  // school year (the setting unset) must leave the pill out, never print the
  // word "undefined".
  const facts = [
    { key: 'today', icon: 'fa-calendar-days', label: `${weekdayName(today)}, ${longDate(today)}` },
    d?.school_year ? { key: 'year', icon: 'fa-school', label: `School year ${d.school_year}` } : null,
    d?.term ? { key: 'term', icon: 'fa-book', label: `Term ${d.term}` } : null,
  ];

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={false} onRefresh={reloadAll} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      {/* The hero and the five cards arrive one after another (Reveal), once,
          on mount; the cards all exist from the first render — each owns its
          spinner. The hazard notice is not part of it. */}
      <Reveal>
        <ProfileHero user={user} facts={facts} />
      </Reveal>

      {showLockoutHazard(d) ? (
        <View className="flex-row items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3">
          <Icon name="fa-triangle-exclamation" size={15} color={tokens['warning-strong']} style={{ marginTop: 3 }} />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-warning-strong">This is the only admin account, and its email is not confirmed</Text>
            <Text className="mt-1 text-sm text-fg-body">
              If this password is lost there is no way back in through the app: resetting your own password needs a confirmed email, and a temporary password can
              only be issued by a different admin — and a second admin account cannot be created from inside the app. Confirming your email is the fix available
              here.
            </Text>
            {/* The neutral button, not the filled one: this screen has no
                primary action, and a warning is not made louder by its link.
                Still announced as a link — it opens Account information. */}
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 self-start"
              accessibilityRole="link"
              onPress={() => navigation.navigate('AccountInfo')}
            >
              Confirm your email
            </Button>
          </View>
        </View>
      ) : null}

      {/* The approval queue is the EMPHASISED card (f2): FIRST, and the
          bigger number — on one column, that is what emphasis can be. */}
      <Reveal index={1}>
        <Card
          title="Waiting for approval"
          icon="fa-user-clock"
          onOpen={open('pending')}
          tone={pendingTone(pending)}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
          onReload={summary.reload}
        >
          {d ? <Stat large value={pendingLead(pending).value} caption={pendingLead(pending).caption} /> : null}
        </Card>
      </Reveal>
      <Reveal index={2}>
        <Card
          title="Students"
          icon="fa-user-graduate"
          onOpen={open('students')}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
          onReload={summary.reload}
        >
          {d ? <Stat value={String(d.totals.students)} caption="on the roll" /> : null}
        </Card>
      </Reveal>
      <Reveal index={3}>
        <Card
          title="Teachers"
          icon="fa-chalkboard-user"
          onOpen={open('teachers')}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
          onReload={summary.reload}
        >
          {d ? <Stat value={String(d.totals.teachers)} caption="teacher accounts" /> : null}
        </Card>
      </Reveal>
      <Reveal index={4}>
        <Card
          title="Parents"
          icon="fa-users"
          onOpen={open('parents')}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
          onReload={summary.reload}
        >
          {d ? <Stat value={String(d.totals.active_parents)} caption="active parent accounts" /> : null}
        </Card>
      </Reveal>
      <Reveal index={5}>
        <Card
          title="System"
          icon="fa-server"
          onOpen={open('system')}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
          // This card reads TWO things — the summary and the newest backup —
          // so its Reload asks for both, and stays busy until both are back.
          onReload={() => {
            summary.reload();
            backups.reload();
          }}
          reloading={summary.loading || backups.loading}
        >
          {/* The last backup leads, in the same never-red colours (the web's
              System card since f2): it is the one fact here that goes stale on
              its own. One step down to `text-xl`, like every figure (§24).

              THE GLYPH SAYS WHAT THE COLOUR SAYS (feat/ui-refresh): a check
              at a week or less, the warning triangle beyond it, never or
              unreadable — so the state does not rest on the two tints alone.
              The words carry the age. */}
          <View className="flex-row items-center gap-2">
            {backups.loading ? null : (
              <Icon
                name={backupWarn ? 'fa-triangle-exclamation' : 'fa-circle-check'}
                size={16}
                color={tokens[backupWarn ? 'warning-strong' : 'success-strong']}
              />
            )}
            <Text
              className={`min-w-0 flex-1 text-xl font-bold ${
                backups.loading ? 'text-fg-muted' : backupWarn ? 'text-warning-strong' : 'text-success-strong'
              }`}
            >
              {backups.loading ? '…' : backups.error ? 'Could not read backups' : age.label}
            </Text>
          </View>
          {d ? (
            <View className="mt-3">
              <Row label="School year" value={d.school_year} />
              <Row label="Current term" value={`Term ${d.term}`} />
              <Row label={`Grade records locked (Term ${d.term})`} value={`${d.grade_locks.locked} of ${d.grade_locks.total}`} />
              <Row label="Live connection" value={connected ? 'Connected' : 'Paused'} tone={connected ? 'success' : 'warning'} />
              {/* Web only (Darryl): the phone names the fact and where to act. */}
              <Text className="mt-2 text-xs text-fg-muted">Backup & Restore is on the web version only.</Text>
            </View>
          ) : null}
        </Card>
      </Reveal>
    </ScrollView>
  );
}
