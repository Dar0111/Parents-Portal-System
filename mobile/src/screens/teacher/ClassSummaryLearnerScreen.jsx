import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import ReportCardView, { REPORT_UNWRAP } from '../parent/ReportCardView';

// ONE LEARNER'S REPORT CARD, READ-ONLY — the web's ClassSummaryLearnerPage:
// the SAME card the parent reads (`ReportCardView`), reached from the class
// summary by `students.id`, never the LRN (§5c). No breakdown tap: the
// summary is a read surface, and the grades are encoded under Grades.
export default function ClassSummaryLearnerScreen({ route }) {
  const studentId = route.params.studentId;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.get(`/grades/student/${studentId}`, { unwrap: REPORT_UNWRAP }));
    } catch (err) {
      setError(extractError(err));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-3 p-4 pb-10">
      <Text className="text-sm text-fg-muted">Report card, read-only.</Text>
      <ReportCardView
        report={report}
        loading={loading}
        error={error}
        onRetry={load}
        empty={{
          icon: 'fa-chart-simple',
          title: 'No grades recorded yet',
          message: 'This learner has no grades for the current school year. Grades appear as each subject teacher encodes them.',
        }}
      />
    </ScrollView>
  );
}
