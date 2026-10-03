import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { cardClass } from '../../components/buttonStyles';
import Text from '../../components/Text';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
import { useTheme } from '../../theme/ThemeProvider';
import ReportCardView, { REPORT_UNWRAP } from '../parent/ReportCardView';

// ONE LEARNER'S REPORT CARD, READ-ONLY — the web's ClassSummaryLearnerPage:
// the SAME card the parent reads (`ReportCardView`), reached from the class
// summary by `students.id`, never the LRN (§5c). No breakdown tap: the
// summary is a read surface, and the grades are encoded under Grades.
//
// PULL TO REFRESH IS `load` ITSELF — the learner's card, asked for again; the
// card stays on screen under the pull spinner (only the first load shows its
// loading frame), so the term picked on it is kept (that choice is
// ReportCardView's state, and the card stays mounted). The bar says what this
// view is; the card below already carries the document's heading
// ("Learner's Performance Report"), and the navigator's title is the
// learner's name. The bar is the one block that has an entrance; the card
// does not move.
export default function ClassSummaryLearnerScreen({ route }) {
  const studentId = route.params.studentId;
  const { tokens } = useTheme();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ pull = false } = {}) => {
      if (pull) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setReport(await api.get(`/grades/student/${studentId}`, { unwrap: REPORT_UNWRAP }));
      } catch (err) {
        setError(extractError(err));
        setReport(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [studentId]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <Reveal>
        {/* ONE BAR: what this view is. The eye is decoration — the sentence
            beside it says it. */}
        <View className={`${cardClass} flex-row items-center gap-3 p-4`}>
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft">
            <Icon name="fa-eye" size={15} color={tokens.brand} />
          </View>
          <Text className="min-w-0 flex-1 text-sm text-fg-muted">Report card, read-only.</Text>
        </View>
      </Reveal>
      <ReportCardView
        report={report}
        loading={loading || (refreshing && !report)}
        error={error}
        onRetry={() => load()}
        empty={{
          icon: 'fa-chart-simple',
          title: 'No grades recorded yet',
          message: 'This learner has no grades for the current school year. Grades appear as each subject teacher encodes them.',
        }}
      />
    </ScrollView>
  );
}
