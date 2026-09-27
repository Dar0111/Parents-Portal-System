import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../theme/ThemeProvider';
import ReportCardView, { REPORT_UNWRAP } from './ReportCardView';

// PARENT → GRADES — the report card for the signed-in parent's own child.
// The card itself is `ReportCardView` (branch 3), shared with Teacher →
// Class summary's learner screen; this screen owns the fetch, the unlinked
// empty state and the one thing only a parent does here: a term cell with a
// grade row opens the breakdown as a modal screen.
export default function GradesScreen({ navigation }) {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const studentId = user?.student_id ?? null;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ pull = false } = {}) => {
      if (studentId == null) {
        setReport(null);
        setError(null);
        setLoading(false);
        return;
      }
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

  const student = report?.student ?? null;
  const empty =
    studentId == null
      ? {
          icon: 'fa-link-slash',
          title: "Your account isn't linked to a student record yet",
          message: "Ask the school office to link your account so you can see your child's report card.",
        }
      : {
          icon: 'fa-book',
          title: student ? `No subjects are set up for Grade ${student.grade_level} yet` : 'No subjects are set up for this grade level yet',
          message: "The school office sets up the subject list for each grade level. Your child's grades appear here once it exists.",
        };

  function openTerm(entry, subjectName, termNo, mode) {
    if (!entry?.grade_id) return;
    navigation.navigate('GradeBreakdown', { gradeId: entry.grade_id, subjectName, term: termNo, mode });
  }

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <ReportCardView report={report} loading={loading} error={error} onRetry={() => load()} empty={empty} onOpenTerm={openTerm} />
    </ScrollView>
  );
}
