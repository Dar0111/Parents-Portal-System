import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
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
import { backupAge, CARD_LINKS, countRows, hazardSlot, pendingLead, pendingTone } from './dashboard/logic';

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
// THE LOCKOUT HAZARD NOTICE (fix round F1, 2026-10-08), the web's
// HazardSlot.jsx on the phone: compact — the warning, then "Why this matters"
// (the long explanation, word for word, behind it) and "Confirm your email",
// one tap away — and its space HELD while the dashboard loads, so its arrival
// never pushes the cards down. `hazardSlot` (dashboard/logic.js) says where
// it stands: the notice on the server's flag; while loading with THIS admin's
// email unconfirmed, the same notice laid out at opacity 0, untouchable and
// hidden from the screen reader; otherwise nothing. Not dismissible, names no
// account, amber, never red.
const HAZARD_TITLE = 'This is the only admin account, and its email is not confirmed';
const HAZARD_EXPLANATION =
  'If this password is lost there is no way back in through the app: resetting your own password needs a confirmed email, and a temporary password can only be issued by a different admin — and a second admin account cannot be created from inside the app. Confirming your email is the fix available here.';

function HazardNotice({ reserved, onConfirm }) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View
      className="rounded-xl border border-warning-edge bg-warning-soft px-4 py-3"
      style={reserved ? { opacity: 0 } : undefined}
      pointerEvents={reserved ? 'none' : 'auto'}
      importantForAccessibility={reserved ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={reserved}
    >
      <View className="flex-row items-start gap-3">
        <Icon name="fa-triangle-exclamation" size={15} color={tokens['warning-strong']} style={{ marginTop: 3 }} />
        <Text className="min-w-0 flex-1 text-sm font-semibold text-warning-strong">{HAZARD_TITLE}</Text>
      </View>
      {/* The neutral button, not the filled one: this screen has no primary
          action, and a warning is not made louder by its link. Still
          announced as a link — it opens Account information. */}
      <View className="mt-3 flex-row flex-wrap gap-2">
        <Button variant="ghost" size="sm" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)}>
          Why this matters
        </Button>
        <Button variant="secondary" size="sm" accessibilityRole="link" onPress={onConfirm}>
          Confirm your email
        </Button>
      </View>
      {open ? <Text className="mt-2 text-sm text-fg-body">{HAZARD_EXPLANATION}</Text> : null}
    </View>
  );
}

// THE USERS CARD (build 2, Part C, decision 3; "People" until the fix round,
// F2): the web's three counts in one card, each its own link — announced as
// a link with its label, number and caption, 48dp at least, Android's ripple
// for the press (M20) — because the three open different lists. A count whose
// list is not built is static.
function CountLink({ row, onOpen }) {
  const { tokens } = useTheme();
  const body = (
    <>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-fg">{row.label}</Text>
        <Stat value={row.value} caption={row.caption} />
      </View>
      {onOpen ? <Icon name="fa-chevron-right" size={12} color={tokens['fg-faint']} /> : null}
    </>
  );
  const shape = 'flex-row items-center justify-between gap-2 rounded-lg px-3 py-2';
  if (!onOpen) {
    return (
      <View className={shape} style={{ minHeight: 48 }}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="link"
      accessibilityLabel={`${row.label}, ${row.value} ${row.caption}`}
      android_ripple={{ color: tokens['edge-strong'] }}
      className={`${shape} overflow-hidden`}
      style={{ minHeight: 48 }}
    >
      {body}
    </Pressable>
  );
}

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
  // A PULL SHOWS THE NATIVE REFRESH INDICATOR WHILE THE CARDS RE-READ (build
  // 2, decision 6). Since build 2 a re-read keeps every card's answer on
  // screen (useCard `refreshing`), so without this a pull showed nothing at
  // all. `pulled` says the re-read is the pull's; a focus re-read clears it,
  // so its quiet re-read never shows the indicator.
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
  const rereading = summary.refreshing || backups.refreshing;

  const d = summary.data;
  const pending = d?.pending_parents ?? 0;
  const age = backupAge(backups.data?.created_at);
  const backupWarn = Boolean(backups.error) || age.tone !== 'success';
  const open = (key) => (isBuilt(CARD_LINKS[key]) ? () => navigation.navigate(CARD_LINKS[key]) : null);
  // A count with a preset (fix round F3) opens Users already filtered. The
  // `key` is the moment of the press, so tapping the same count again
  // re-applies its preset even though Users, a drawer screen, stayed mounted.
  const openCount = (row) =>
    isBuilt(row.link)
      ? () => navigation.navigate(row.link, row.preset ? { preset: { ...row.preset, key: Date.now() } } : undefined)
      : null;
  const hazard = hazardSlot(d, { loading: summary.loading, emailConfirmed: Boolean(user?.email_verified_at) });

  // The hero's facts, in the web's words. The date is the phone's own day;
  // the other two are `d`, so they are simply absent until /dashboard has
  // answered. Each is keyed on ITS OWN VALUE, not on `d`: a payload with no
  // school year (the setting unset) must leave the fact out, never print the
  // word "undefined".
  const facts = [
    { key: 'today', label: `${weekdayName(today)}, ${longDate(today)}` },
    d?.school_year ? { key: 'year', label: `School year ${d.school_year}` } : null,
    d?.term ? { key: 'term', label: `Term ${d.term}` } : null,
  ];

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={pulled && rereading} onRefresh={onPull} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      {/* The hero and the three cards arrive one after another (Reveal), once,
          on mount; the cards all exist from the first render — each owns its
          spinner. The hazard notice is not part of it. */}
      <Reveal>
        <ProfileHero user={user} facts={facts} />
      </Reveal>

      {hazard !== 'none' ? <HazardNotice reserved={hazard === 'reserve'} onConfirm={() => navigation.navigate('AccountInfo')} /> : null}

      {/* The approval queue is the LEAD card (f2, Part C): FIRST, and the
          bigger number — on one column, that is what emphasis can be. Then
          the Users card with the three counts, then System — the web's
          order (Part C, 2026-10-07). */}
      <Reveal index={1}>
        <Card
          title="Waiting for approval"
          icon="fa-user-clock"
          onOpen={open('pending')}
          tone={pendingTone(pending)}
          skeleton="lead"
          loading={summary.loading}
          refreshing={summary.refreshing}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? <Stat large value={pendingLead(pending).value} caption={pendingLead(pending).caption} /> : null}
        </Card>
      </Reveal>
      <Reveal index={2}>
        {/* NO `onOpen`: the one card that is not its own press target
            (decision 3) — its three counts are. */}
        <Card
          title="Users"
          icon="fa-users"
          skeleton="counts"
          loading={summary.loading}
          refreshing={summary.refreshing}
          error={summary.error}
          onRetry={summary.reload}
        >
          {d ? (
            <View className="gap-1">
              {countRows(d.totals).map((row) => (
                <CountLink key={row.key} row={row} onOpen={openCount(row)} />
              ))}
            </View>
          ) : null}
        </Card>
      </Reveal>
      <Reveal index={3}>
        <Card
          title="System"
          icon="fa-server"
          onOpen={open('system')}
          skeleton="facts"
          loading={summary.loading}
          refreshing={summary.refreshing || backups.refreshing}
          error={summary.error}
          onRetry={summary.reload}
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
