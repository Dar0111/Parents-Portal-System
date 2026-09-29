import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import { isBuilt } from '../../navigation/routes';
import { useSocket } from '../../realtime/SocketProvider';
import { useTheme } from '../../theme/ThemeProvider';
import Card, { Stat } from '../dashboards/Card';
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
function Row({ label, value, tone }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 py-1">
      <Text className="flex-1 text-sm text-fg-muted">{label}</Text>
      <Text className={`text-sm font-medium ${tone === 'success' ? 'text-success-strong' : tone === 'warning' ? 'text-warning-strong' : 'text-fg'}`}>{value}</Text>
    </View>
  );
}

export default function DashboardScreen({ navigation }) {
  const { tokens } = useTheme();
  const { connected } = useSocket();
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
  const open = (key) => (isBuilt(CARD_LINKS[key]) ? () => navigation.navigate(CARD_LINKS[key]) : null);

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={false} onRefresh={reloadAll} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      {showLockoutHazard(d) ? (
        <View className="rounded-xl border border-warning-edge bg-warning-soft px-4 py-3">
          <Text className="text-sm font-semibold text-warning-strong">This is the only admin account, and its email is not confirmed</Text>
          <Text className="mt-1 text-sm text-fg-body">
            If this password is lost there is no way back in through the app: resetting your own password needs a confirmed email, and a temporary password can
            only be issued by a different admin — and a second admin account cannot be created from inside the app. Confirming your email is the fix available
            here.
          </Text>
          <Pressable onPress={() => navigation.navigate('AccountInfo')} accessibilityRole="link" className="mt-3 self-start">
            <Text className="text-sm font-medium text-brand">Confirm your email →</Text>
          </Pressable>
        </View>
      ) : null}

      {/* The approval queue is the EMPHASISED card (f2): FIRST, and the
          bigger number — on one column, that is what emphasis can be. */}
      <Card
        title="Waiting for approval"
        icon="fa-user-clock"
        onOpen={open('pending')}
        tone={pendingTone(pending)}
        loading={summary.loading}
        error={summary.error}
        onRetry={summary.reload}
      >
        {d ? <Stat large value={pendingLead(pending).value} caption={pendingLead(pending).caption} /> : null}
      </Card>
      <Card title="Students" icon="fa-user-graduate" onOpen={open('students')} loading={summary.loading} error={summary.error} onRetry={summary.reload}>
        {d ? <Stat value={String(d.totals.students)} caption="on the roll" /> : null}
      </Card>
      <Card title="Teachers" icon="fa-chalkboard-user" onOpen={open('teachers')} loading={summary.loading} error={summary.error} onRetry={summary.reload}>
        {d ? <Stat value={String(d.totals.teachers)} caption="teacher accounts" /> : null}
      </Card>
      <Card title="Parents" icon="fa-users" onOpen={open('parents')} loading={summary.loading} error={summary.error} onRetry={summary.reload}>
        {d ? <Stat value={String(d.totals.active_parents)} caption="active parent accounts" /> : null}
      </Card>
      <Card title="System" icon="fa-server" onOpen={open('system')} loading={summary.loading} error={summary.error} onRetry={summary.reload}>
        {/* The last backup leads, in the same never-red colours (the web's
            System card since f2): it is the one fact here that goes stale on
            its own. */}
        <Text
          className={`text-2xl font-semibold ${
            backups.loading ? 'text-fg-muted' : backups.error || age.tone !== 'success' ? 'text-warning-strong' : 'text-success-strong'
          }`}
        >
          {backups.loading ? '…' : backups.error ? 'Could not read backups' : age.label}
        </Text>
        {d ? (
          <View className="mt-3 border-t border-edge pt-2">
            <Row label="School year" value={d.school_year} />
            <Row label="Current term" value={`Term ${d.term}`} />
            <Row label={`Grade records locked (Term ${d.term})`} value={`${d.grade_locks.locked} of ${d.grade_locks.total}`} />
            <Row label="Live connection" value={connected ? 'Connected' : 'Paused'} tone={connected ? 'success' : 'warning'} />
            {/* Web only (Darryl): the phone names the fact and where to act. */}
            <Text className="mt-2 text-xs text-fg-muted">Backup & Restore is on the web version only.</Text>
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}
