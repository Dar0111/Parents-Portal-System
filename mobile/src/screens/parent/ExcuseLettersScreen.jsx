import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View } from 'react-native';
import { fetchAll } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DataList from '../../components/DataList';
import FormStatus, { ok } from '../../components/FormStatus';
import SectionHeader from '../../components/SectionHeader';
import Segmented from '../../components/Segmented';
import Text from '../../components/Text';
import Icon from '../../icons';
import useVisitClear from '../../realtime/useVisitClear';
import { useTheme } from '../../theme/ThemeProvider';
import parentLetterCard from './excuseLetters/card';

// PARENT → EXCUSE LETTERS: the list (the web's DataTable page as a card list
// through the verbatim card builder), a bounded status filter that
// auto-applies (§21), Submit letter under the section's header, and the
// outcome of a write ABOVE THE LIST IT DESCRIBES (§7c) — compose navigates
// back with `notice`, consumed once here. Every letter card opens the READING
// view, whatever its status (§17e). Empty copy is derived from the filter
// state (§5f): unlinked / filtered / none.
const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Declined'];

export default function ExcuseLettersScreen({ navigation, route }) {
  const { user } = useAuth();
  const { tokens } = useTheme();
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
      return true;
    } catch (err) {
      setError(extractError(err));
      setLetters([]);
      return false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // EVERY FOCUS RE-READS, as Admin → Announcements does (fix/f3-badges) — a
  // return from compose or edit included, so the write's `notice` needs no
  // reload of its own: a drawer screen stays mounted, so a visit is a focus,
  // and a visit whose letters load clears the badge's reviewed-letter rows
  // (realtime/useVisitClear.js). The first focus is the mount.
  const visited = useVisitClear('excuse_letters');
  useFocusEffect(
    useCallback(() => {
      load().then(visited);
    }, [load, visited])
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
          <Button size="sm" onPress={() => setStatus('All')}>
            Show all letters
          </Button>
        ),
      };
    }
    return {
      icon: 'fa-envelope-open-text',
      title: 'No excuse letters yet',
      message: 'Use Submit letter when your child is absent. The adviser reviews it; it does not change the attendance record.',
    };
  })();

  // THE PAGE ACTION IS ON ITS OWN ROW, OUT OF THE FILTER (phone check
  // finding, 2026-09-27: beside the chips it squeezed them and cut "Declined"
  // off). Since feat/ui-refresh it is this screen's ONE filled action, as on
  // the web, and it sits under the section's header rather than in it, so the
  // title keeps the full width at any text size. The four status pills have a
  // card to themselves and scroll sideways if a larger text size needs it.
  const header = (
    <View className="mb-4 gap-4">
      <SectionHeader title="Submitted letters" />
      {canSubmit ? (
        <Button variant="primary" icon="fa-plus" className="self-end" onPress={() => navigation.navigate('ExcuseLetterCompose')}>
          Submit letter
        </Button>
      ) : (
        <View className="flex-row items-start gap-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3">
          <Icon name="fa-circle-info" size={16} color={tokens['info-strong']} style={{ marginTop: 2 }} />
          <Text className="min-w-0 flex-1 text-sm text-info-strong">Submitting is unavailable until the school office links this account to a student.</Text>
        </View>
      )}
      <View className={`${cardClass} p-4`}>
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_FILTERS.map((s) => ({ key: s, label: s === 'All' ? 'All statuses' : s }))}
        />
      </View>
      {notice ? (
        <View className="gap-1">
          <FormStatus status={ok(notice)} />
          <Button variant="ghost" size="sm" className="self-end" onPress={() => navigation.setParams({ notice: null })}>
            Dismiss
          </Button>
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
      onRetry={() => load().then(visited)}
      refreshing={refreshing}
      onRefresh={() => load({ pull: true }).then(visited)}
      header={header}
      empty={empty}
    />
  );
}
