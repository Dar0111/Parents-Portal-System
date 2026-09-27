import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import { shortDate } from '../../format/date';
import GradeValue from '../../format/GradeValue';
import { SCORE_PENDING, formatScorePair } from '../../format/scorePair';
import TermValue from '../../format/TermValue';

// THE GRADE BREAKDOWN — the web's modal, as a modal SCREEN (approved
// 2026-09-11; NOW POSSIBLE). Term grade stays; Initial Grade and weights are
// NOT shown; no rank, no class average, no "Passing", no remarks. For a
// Grade 1 row the payload carries a real `initial_grade` and NOTHING in the
// descriptive branch may print it — not as a subtitle, not as "out of 100"
// — nor explain how the letter is produced (NOW POSSIBLE, 2026-09-22).
const DETAIL_UNWRAP = ['grade', 'grade_components', 'descriptor'];

function ScorePair({ score, max }) {
  if (score == null && max == null) return <Text className="text-sm text-fg-muted">Not yet recorded</Text>;
  const pair = formatScorePair(score, max);
  if (pair === null) return null;
  if (pair === SCORE_PENDING) return <Text className="text-sm text-fg-muted">Pending</Text>;
  return (
    <Text className="text-sm text-fg" style={{ fontVariant: ['tabular-nums'] }}>
      {pair}
    </Text>
  );
}

function ComponentList({ title, rows, empty }) {
  return (
    <View>
      <Text className="text-sm font-semibold text-fg">{title}</Text>
      {rows.length === 0 ? (
        <Text className="mt-1 text-sm text-fg-muted">{empty}</Text>
      ) : (
        <View className="mt-2">
          {rows.map((row, i) => (
            <View key={row.id} className={`flex-row items-baseline justify-between gap-3 py-1.5 ${i > 0 ? 'border-t border-edge-soft' : ''}`}>
              <View className="min-w-0 flex-1">
                <Text className="text-sm text-fg-secondary">{row.label}</Text>
                {row.date_recorded ? <Text className="text-xs text-fg-muted">{shortDate(row.date_recorded)}</Text> : null}
              </View>
              <ScorePair score={row.score} max={row.max_score} />
            </View>
          ))}
        </View>
      )}
    </View>
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
    <View>
      <Text className="text-sm font-semibold text-fg">{summative ? 'Summative' : 'Examinations'}</Text>
      {!anyRecorded ? (
        <Text className="mt-1 text-sm text-fg-muted">No {summative ? 'summative' : 'examination'} scores recorded yet</Text>
      ) : (
        <View className="mt-2">
          {lines.map((line, i) => (
            <View key={line.key} className={`flex-row items-baseline justify-between gap-3 py-1.5 ${i > 0 ? 'border-t border-edge-soft' : ''}`}>
              <Text className="text-sm text-fg-secondary">{line.label}</Text>
              <ScorePair score={line.score} max={line.max} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

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
      <View className="gap-3">
        <TermValue entry={{ descriptive_grade: grade.descriptive_grade, descriptor: detail.descriptor }} mode="descriptive" className="text-base text-fg" />
        {hasRecordedBreakdown ? (
          <View className="gap-4 border-t border-edge-soft pt-3">
            {ww.length > 0 ? <ComponentList title="Written Works" rows={ww} empty="" /> : null}
            {pt.length > 0 ? <ComponentList title="Performance Tasks" rows={pt} empty="" /> : null}
            {hasExam ? <ExamList grade={grade} mode={mode} /> : null}
          </View>
        ) : (
          <Text className="border-t border-edge-soft pt-3 text-sm text-fg-muted">
            This grade was recorded before scores were kept for this learning area, so there is nothing to show behind it.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-baseline gap-2">
        <GradeValue value={grade.term_grade} mode={mode} whole className="text-base font-semibold text-fg" />
        {detail.descriptor?.descriptor ? <Text className="text-xs text-fg-muted">{detail.descriptor.descriptor}</Text> : null}
      </View>
      <ComponentList title="Written Works" rows={ww} empty="No written works recorded yet" />
      <ComponentList title="Performance Tasks" rows={pt} empty="No performance tasks recorded yet" />
      <ExamList grade={grade} mode={mode} />
    </View>
  );
}

export default function GradeBreakdownScreen({ route }) {
  const { gradeId, mode } = route.params;
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      setDetail(await api.get(`/grades/${gradeId}`, { unwrap: DETAIL_UNWRAP }));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [gradeId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4 pb-10">
      <View className="rounded-xl border border-edge bg-surface p-4">
        {loading ? <LoadingSpinner size="sm" label="Loading scores…" /> : null}
        {error ? <ErrorAlert message={error} onRetry={load} /> : null}
        {detail ? <BreakdownBody mode={mode} detail={detail} /> : null}
      </View>
    </ScrollView>
  );
}
