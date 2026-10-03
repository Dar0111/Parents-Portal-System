import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DataList from '../../components/DataList';
import DateField from '../../components/DateField';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormStatus, { ok } from '../../components/FormStatus';
import SectionHeader from '../../components/SectionHeader';
import Segmented from '../../components/Segmented';
import teacherLetterCard from './excuseLetters/card';

// TEACHER → EXCUSE LETTERS — the queue. THE SPLIT THIS PAGE SURFACES:
//   SEE a letter    -> assigned to the student's class OR adviser of its section
//   REVIEW a letter -> ADVISER ONLY (sections.adviser_id)
// `canReview` predicts the second before the tap so a card is never a dead
// end; the server stays the authority and the review screen handles its 403.
// Status + From + To are STAGED behind Apply (§21a): three controls commit
// together, and Pending — the actionable set — is the visible default.
//
// THE CARD IS THE VERBATIM `excuseLetters/card.jsx`, and its tap has three
// outcomes (UI-E): Pending + adviser → the review screen; Approved /
// Declined → the reading screen; Pending + not adviser → a static card,
// because a tap would only produce the 403. Empty copy is derived from the
// applied values, three branches (§5f). The outcome of a review renders
// above the list and NAMES THE LEARNER, because a reviewed letter leaves the
// default Pending list on the reload.
//
// From and To sit one under the other: side by side in this card on a 360dp
// phone, a chosen date beside its clear button is left about 38dp — less
// than one word of "September 24, 2026" (worked out from the paddings, not
// seen on a device).
const STATUS_FILTERS = ['Pending', 'Approved', 'Declined', 'All'];
const DEFAULT = { status: 'Pending', from: '', to: '' };

export default function ExcuseLettersScreen({ navigation, route }) {
  const { user } = useAuth();
  const notice = route?.params?.notice || null;

  const [letters, setLetters] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [advisorySections, setAdvisorySections] = useState([]);

  const [status, setStatus] = useState(DEFAULT.status);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState(DEFAULT);
  const draftFilters = { status, from, to };
  const dirty = isDirty(draftFilters, applied);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((all) => {
        if (!cancelled) setAdvisorySections(all.filter((s) => s.adviser_id === user?.id));
      })
      .catch(() => {
        // Only the prediction is lost: every card that needed it goes static
        // and the server would refuse anyway.
        if (!cancelled) setAdvisorySections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const load = useCallback(
    async (offset, { pull = false } = {}) => {
      if (offset === 0) {
        if (pull) setRefreshing(true);
        else setLoading(true);
      } else setLoadingMore(true);
      setError(null);
      try {
        const params = { ...listParams({ offset }) };
        if (applied.status !== 'All') params.status = applied.status;
        if (applied.from) params.from = applied.from;
        if (applied.to) params.to = applied.to;
        const result = await api.get('/excuse-letters', { unwrap: ['excuse_letters', 'page'], params });
        setLetters((prev) => (offset === 0 ? result.excuse_letters : [...prev, ...result.excuse_letters]));
        setPage(result.page);
      } catch (err) {
        setError(extractError(err));
        if (offset === 0) setLetters([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [applied]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (notice) load(0);
    }, [notice, load])
  );

  // Reviewable iff still Pending AND its class is one this teacher advises.
  // The client matches on grade_level + section NAME while the server decides
  // on students.section_id — they agree for every real row, and the 403 is
  // still handled as a real path on the review screen.
  const canReview = useCallback(
    (letter) => letter.status === 'Pending' && advisorySections.some((s) => s.grade_level === letter.grade_level && s.name === letter.section),
    [advisorySections]
  );

  function openLetter(letter) {
    if (letter.status === 'Pending') navigation.navigate('ExcuseLetterReview', { letter });
    else navigation.navigate('TeacherExcuseLetterRead', { letter });
  }

  function applyFilters() {
    setApplied(draftFilters);
  }

  function resetFilters() {
    setStatus(DEFAULT.status);
    setFrom('');
    setTo('');
    setApplied(DEFAULT);
  }

  const hasDateRange = Boolean(applied.from || applied.to);
  const canReset = applied.status !== 'Pending' || hasDateRange;

  const empty = (() => {
    if (hasDateRange || (applied.status !== 'All' && applied.status !== 'Pending')) {
      return {
        icon: 'fa-filter',
        title: 'No letters match these filters',
        message: 'Try a different status or date range.',
        action: (
          <Button size="sm" onPress={resetFilters}>
            Reset filters
          </Button>
        ),
      };
    }
    if (applied.status === 'Pending') {
      return {
        icon: 'fa-envelope-open-text',
        title: 'Nothing waiting for review',
        message: 'No letter from your classes is waiting for review. To see letters already reviewed, switch the status filter.',
      };
    }
    return { icon: 'fa-envelope-open-text', title: 'No excuse letters yet', message: 'Letters submitted by parents in your classes will appear here.' };
  })();

  const header = (
    <View className="mb-4 gap-4">
      <SectionHeader title="Letters from my classes" />
      <View className={`${cardClass} gap-3 p-4`}>
        <Segmented label="Status" value={status} onChange={setStatus} options={STATUS_FILTERS.map((s) => ({ key: s, label: s === 'All' ? 'All statuses' : s }))} />
        <DateField label="From" value={from} onChange={setFrom} clearable />
        <DateField label="To" value={to} onChange={setTo} clearable />
        <FilterActions dirty={dirty} canReset={canReset} onApply={applyFilters} onReset={resetFilters} />
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
      rows={letters}
      renderCard={(row) => teacherLetterCard(row, { canReview, onOpen: openLetter })}
      loading={loading}
      error={error}
      onRetry={() => load(0)}
      refreshing={refreshing}
      onRefresh={() => load(0, { pull: true })}
      hasMore={Boolean(page?.has_more)}
      loadingMore={loadingMore}
      onLoadMore={() => load(letters.length || PAGE_SIZE)}
      header={header}
      empty={empty}
    />
  );
}
