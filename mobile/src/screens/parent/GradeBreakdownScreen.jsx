import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import SectionHeader from '../../components/SectionHeader';
import Text from '../../components/Text';
import { shortDate } from '../../format/date';
import GradeValue from '../../format/GradeValue';
import { SCORE_PENDING, formatScorePair } from '../../format/scorePair';
import TermValue from '../../format/TermValue';
import { useTheme } from '../../theme/ThemeProvider';

// THE GRADE BREAKDOWN — the web's modal, as a modal SCREEN (approved
// 2026-09-11; NOW POSSIBLE). Term grade stays; Initial Grade and weights are
// NOT shown; no rank, no class average, no "Passing", no remarks. For a
// Grade 1 row the payload carries a real `initial_grade` and NOTHING in the
// descriptive branch may print it — not as a subtitle, not as "out of 100"
// — nor explain how the letter is produced (NOW POSSIBLE, 2026-09-22).
//
// THE LOOK (feat/ui-refresh): the grade the parent tapped is the screen's
// figure, in a card of its own, and each group of scores is a card under it
// with its name in the title face.
//
// PULL TO REFRESH is `load` itself — the one request this screen makes, for
// the same grade. A pull keeps the scores on screen under the pull spinner;
// a failed read clears them, so the error is never beside stale scores.
const DETAIL_UNWRAP = ['grade', 'grade_components', 'descriptor'];

function ScorePair({ score, max }) {
  if (score == null && max == null) return <Text className="text-sm text-fg-muted">Not yet recorded</Text>;
  const pair = formatScorePair(score, max);
  if (pair === null) return null;
  if (pair === SCORE_PENDING) return <Text className="text-sm text-fg-muted">Pending</Text>;
  return (
    <Text className="text-sm font-semibold text-fg" style={{ fontVariant: ['tabular-nums'] }}>
      {pair}
    </Text>
  );
}

// One group of scores: a card, its name in the title face.
function Group({ title, children }) {
  return (
    <View className={`${cardClass} p-4`}>
      <Text accessibilityRole="header" className="font-serif text-base text-fg">
        {title}
      </Text>
      {children}
    </View>
  );
}

function ComponentList({ title, rows, empty }) {
  return (
    <Group title={title}>
      {rows.length === 0 ? (
        <Text className="mt-1.5 text-sm text-fg-muted">{empty}</Text>
      ) : (
        <View className="mt-1">
          {rows.map((row, i) => (
            <View key={row.id} className={`flex-row items-baseline justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-edge-soft' : ''}`}>
              <View className="min-w-0 flex-1">
                <Text className="text-sm text-fg-secondary">{row.label}</Text>
                {row.date_recorded ? (
                  <Text className="text-xs text-fg-muted" style={{ fontVariant: ['tabular-nums'] }}>
                    {shortDate(row.date_recorded)}
                  </Text>
                ) : null}
              </View>
              <ScorePair score={row.score} max={row.max_score} />
            </View>
          ))}
        </View>
      )}
    </Group>
  );
}

function ExamList({ grade, mode }) {
  const summative = mode === 'descriptive';
  const lines = [
    { key: 'st1', label: 'ST1', score: grade?.ex_st1, max: grade?.ex_st1_max },
    { key: 'st2', label: 'ST2', score: grade?.ex_st2, max: grade?.ex_st2_max },
    { key: 'te', label: 'TE', score: grade?.ex_te, max: grade?.ex_te_max },
  ];
  const anyRecorded = lines.some((line) => line.score != null || line.max != null);
  return (
    <Group title={summative ? 'Summative' : 'Examinations'}>
      {!anyRecorded ? (
        <Text className="mt-1.5 text-sm text-fg-muted">No {summative ? 'summative' : 'examination'} scores recorded yet</Text>
      ) : (
        <View className="mt-1">
          {lines.map((line, i) => (
            <View key={line.key} className={`flex-row items-baseline justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-edge-soft' : ''}`}>
              <Text className="min-w-0 flex-1 text-sm text-fg-secondary">{line.label}</Text>
              <ScorePair score={line.score} max={line.max} />
            </View>
          ))}
        </View>
      )}
    </Group>
  );
}

// Returns the screen's cards as siblings: the scroll view spaces them.
function BreakdownBody({ mode, detail }) {
  const grade = detail.grade;
  const components = detail.grade_components || [];
  const ww = components.filter((row) => row.type === 'WW');
  const pt = components.filter((row) => row.type === 'PT');
  const hasExam =
    grade.ex_st1 != null || grade.ex_st2 != null || grade.ex_te != null || grade.ex_st1_max != null || grade.ex_st2_max != null || grade.ex_te_max != null;
  const hasRecordedBreakdown = ww.length > 0 || pt.length > 0 || hasExam;

  if (mode === 'descriptive') {
    return (
      <>
        {/* The letter the parent tapped, as the screen's figure. */}
        <View className={`${cardClass} p-5`}>
          <TermValue entry={{ descriptive_grade: grade.descriptive_grade, descriptor: detail.descriptor }} mode="descriptive" className="text-2xl text-fg" />
        </View>
        {hasRecordedBreakdown ? (
          <>
            {ww.length > 0 ? <ComponentList title="Written Works" rows={ww} empty="" /> : null}
            {pt.length > 0 ? <ComponentList title="Performance Tasks" rows={pt} empty="" /> : null}
            {hasExam ? <ExamList grade={grade} mode={mode} /> : null}
          </>
        ) : (
          <View className={`${cardClass} p-4`}>
            <Text className="text-sm text-fg-muted">
              This grade was recorded before scores were kept for this learning area, so there is nothing to show behind it.
            </Text>
          </View>
        )}
      </>
    );
  }

  return (
    <>
      {/* The term grade, through the same renderer as the cell the parent
          tapped to open this screen — the two must not disagree. */}
      <View className={`${cardClass} flex-row flex-wrap items-baseline gap-x-2 gap-y-1 p-5`}>
        <GradeValue value={grade.term_grade} mode={mode} whole className="text-2xl font-bold text-fg" />
        {detail.descriptor?.descriptor ? <Text className="text-sm text-fg-muted">{detail.descriptor.descriptor}</Text> : null}
      </View>
      <ComponentList title="Written Works" rows={ww} empty="No written works recorded yet" />
      <ComponentList title="Performance Tasks" rows={pt} empty="No performance tasks recorded yet" />
      <ExamList grade={grade} mode={mode} />
    </>
  );
}

export default function GradeBreakdownScreen({ route }) {
  const { gradeId, mode } = route.params;
  const { tokens } = useTheme();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ pull = false } = {}) => {
      if (pull) setRefreshing(true);
      else {
        setLoading(true);
        setDetail(null);
      }
      setError(null);
      try {
        setDetail(await api.get(`/grades/${gradeId}`, { unwrap: DETAIL_UNWRAP }));
      } catch (err) {
        setError(extractError(err));
        setDetail(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [gradeId]
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
      <SectionHeader title="Scores behind this grade" />
      {loading || (refreshing && !detail) ? (
        <View className={`${cardClass} p-5`}>
          <LoadingSpinner size="sm" label="Loading scores…" />
        </View>
      ) : null}
      {error ? <ErrorAlert message={error} onRetry={() => load()} /> : null}
      {detail ? <BreakdownBody mode={mode} detail={detail} /> : null}
    </ScrollView>
  );
}
