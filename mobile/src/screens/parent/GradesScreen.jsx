import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import SectionHeader from '../../components/SectionHeader';
import { confirmDialog } from '../../format/acknowledgement';
import Reveal from '../../motion/Reveal';
import { useTheme } from '../../theme/ThemeProvider';
import ReportCardView, { REPORT_UNWRAP } from './ReportCardView';

// PARENT → GRADES — the report card for the signed-in parent's own child.
// The card itself is `ReportCardView` (branch 3), shared with Teacher →
// Class summary's learner screen; this screen owns the fetch, the unlinked
// empty state and the two things only a parent does here: a term cell with a
// grade row opens the breakdown as a modal screen, and a locked term's "I
// have seen these grades" (feat/grade-acknowledgement, 2026-10-21) — the
// card's button hands the term here, a system Alert is the §5e step (the
// web's Modal; the phone's confirms are system Alerts, M25), and only its
// confirm writes POST /grades/acknowledgements. On success the card is
// re-read, and its block says "You confirmed Term N on <date>." from the
// server's row; a failure shows under the button (§7c).
//
// PULL TO REFRESH is `load` itself: the report card's own request. The term
// a parent picked is kept — that choice is ReportCardView's state, and the
// card stays mounted through a pull (only the first load shows its spinner).
export default function GradesScreen({ navigation }) {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const studentId = user?.student_id ?? null;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingTerm, setConfirmingTerm] = useState(null);
  const [confirmError, setConfirmError] = useState(null);

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

  // The one write: after the Alert's confirm, never before.
  async function confirmTerm(term) {
    setConfirmingTerm(term);
    setConfirmError(null);
    try {
      await api.post('/grades/acknowledgements', { term }, { unwrap: 'acknowledgement' });
      await load({ pull: true });
    } catch (err) {
      setConfirmError(extractError(err));
    } finally {
      setConfirmingTerm(null);
    }
  }

  // The card's button: the §5e step as a system Alert naming the term back.
  function askConfirm(term) {
    if (confirmingTerm != null) return;
    setConfirmError(null);
    const words = confirmDialog(term);
    Alert.alert(words.title, words.body, [
      { text: words.cancel, style: 'cancel' },
      { text: words.confirm, onPress: () => confirmTerm(term) },
    ]);
  }

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <Reveal>
        <View className="gap-4">
          <SectionHeader title="Report card" />
          <ReportCardView
            report={report}
            loading={loading}
            error={error}
            onRetry={() => load()}
            empty={empty}
            onOpenTerm={openTerm}
            onConfirmTerm={askConfirm}
            confirmingTerm={confirmingTerm}
            confirmError={confirmError}
          />
        </View>
      </Reveal>
    </ScrollView>
  );
}
