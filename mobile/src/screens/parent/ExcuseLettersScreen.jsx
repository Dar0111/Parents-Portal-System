import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, Text, View } from 'react-native';
import { fetchAll } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import DataList from '../../components/DataList';
import FormStatus, { ok } from '../../components/FormStatus';
import Segmented from '../../components/Segmented';
import parentLetterCard from './excuseLetters/card';

// PARENT → EXCUSE LETTERS: the list (the web's DataTable page as a card list
// through the verbatim card builder), a bounded status filter that
// auto-applies (§21), Submit letter in the header row, and the outcome of a
// write ABOVE THE LIST IT DESCRIBES (§7c) — compose navigates back with
// `notice`, consumed once here. Every letter card opens the READING view,
// whatever its status (§17e). Empty copy is derived from the filter state
// (§5f): unlinked / filtered / none.
const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Declined'];

export default function ExcuseLettersScreen({ navigation, route }) {
  const { user } = useAuth();
  const studentId = user?.student_id ?? null;
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('All');
  const notice = route?.params?.notice || null;

  const load = useCallback(async ({ pull = false } = {}) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setLetters(await fetchAll('/excuse-letters/mine', { unwrap: 'excuse_letters' }));
    } catch (err) {
      setError(extractError(err));
      setLetters([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reload when a write brought us back (compose / edit), not on every focus.
  useFocusEffect(
    useCallback(() => {
      if (notice) load();
    }, [notice, load])
  );

  const visible = useMemo(() => (status === 'All' ? letters : letters.filter((row) => row.status === status)), [letters, status]);
  const canSubmit = studentId != null;

  const empty = (() => {
    if (studentId == null && letters.length === 0) {
      return {
        icon: 'fa-link-slash',
        title: "Your account isn't linked to a student record yet",
        message: 'Ask the school office to link your account so you can submit an excuse letter for an absence.',
      };
    }
    if (status !== 'All') {
      return {
        icon: 'fa-filter',
        title: 'No letters match this filter',
        message: 'Try a different status, or show all letters.',
        action: (
          <Pressable onPress={() => setStatus('All')} accessibilityRole="button" className="rounded-lg border border-edge-strong px-3 py-1.5">
            <Text className="text-sm text-fg-body">Show all letters</Text>
          </Pressable>
        ),
      };
    }
    return {
      icon: 'fa-envelope-open-text',
      title: 'No excuse letters yet',
      message: 'Use Submit letter when your child is absent. The adviser reviews it; it does not change the attendance record.',
    };
  })();

  // THE PAGE ACTION IS ON ITS OWN ROW, NEUTRAL, OUT OF THE FILTER (phone
  // check finding, 2026-09-27; the web's §21b rule — "the page action leaves
  // the filter card, neutral"). Beside the chips it squeezed them and cut
  // "Declined" off; the chips now have the whole width and scroll.
  const header = (
    <View className="mb-3 gap-3">
      {canSubmit ? (
        <View className="flex-row justify-end">
          <Pressable
            onPress={() => navigation.navigate('ExcuseLetterCompose')}
            accessibilityRole="button"
            className="rounded-lg border border-edge-strong bg-surface px-4 py-2"
          >
            <Text className="text-sm font-medium text-fg-body">Submit letter</Text>
          </Pressable>
        </View>
      ) : null}
      <Segmented
        label="Status"
        value={status}
        onChange={setStatus}
        options={STATUS_FILTERS.map((s) => ({ key: s, label: s === 'All' ? 'All statuses' : s }))}
      />
      {!canSubmit ? <Text className="text-sm text-fg-muted">Submitting is unavailable until the school office links this account to a student.</Text> : null}
      {notice ? (
        <View>
          <FormStatus status={ok(notice)} />
          <Pressable onPress={() => navigation.setParams({ notice: null })} accessibilityRole="button" className="mt-1 self-end">
            <Text className="text-xs text-fg-muted">Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <DataList
      rows={visible}
      renderCard={(row) => parentLetterCard(row, { onRead: (letter) => navigation.navigate('ExcuseLetterRead', { letter }) })}
      loading={loading}
      error={error}
      onRetry={() => load()}
      refreshing={refreshing}
      onRefresh={() => load({ pull: true })}
      header={header}
      empty={empty}
    />
  );
}
