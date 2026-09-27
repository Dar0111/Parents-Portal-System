import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import Segmented from '../../components/Segmented';
import { todayLocalDateString } from '../../format/date';
import GradeValue from '../../format/GradeValue';
import { currentTerm } from '../../format/schoolCalendar';
import TermValue from '../../format/TermValue';
import { useTheme } from '../../theme/ThemeProvider';

// TEACHER → CLASS SUMMARY — the adviser's sheet (§14), read-only. A SIDEWAYS
// SHEET WITH A FIXED LEARNER COLUMN (Darryl, branch 3 decision 3): the
// learner names are one column that never moves, the subjects and the
// Average scroll beside it, and every row is one fixed height on both sides
// so the two halves cannot drift apart. The order is `subjects` as the
// server sends it (`display_order`); nothing is sorted here. A cell is a
// TermValue, never a GradeValue — a Grade 1 letter through the number path
// would read "— N/A" (§14). The General Average column is keyed on the
// server's `show_general_average`, never on the values. THE TERM IS PINNED
// ONCE from the school calendar (§13g, a lazy useState); the segment
// overrides it. Class summary is for ADVISERS: a teacher who advises nothing
// gets the explaining empty state. No print on the phone.
const TERMS = [
  { key: 1, label: 'Term 1' },
  { key: 2, label: 'Term 2' },
  { key: 3, label: 'Term 3' },
  { key: 'final', label: 'Final' },
];
const SUMMARY_UNWRAP = ['section', 'school_year', 'term', 'grading_mode', 'show_final', 'show_general_average', 'subjects', 'learners', 'completeness'];
const ROW_H = 44;
const HEAD_H = 76;
const NAME_W = 150;
const CELL_W = 96;

function Completeness({ entry }) {
  if (!entry || entry.total === 0) return null;
  const pending = entry.total - entry.recorded;
  return <Text className="mt-0.5 text-[11px] text-fg-muted">{pending === 0 ? 'Complete' : `${pending} pending`}</Text>;
}

export default function ClassSummaryScreen({ navigation }) {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const [sections, setSections] = useState(null);
  const [sectionsError, setSectionsError] = useState(null);
  const [sectionId, setSectionId] = useState(null);
  const [pinnedTerm] = useState(() => currentTerm(todayLocalDateString()));
  const [term, setTerm] = useState(pinnedTerm);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (cancelled) return;
        const mine = rows.filter((s) => Number(s.adviser_id) === Number(user?.id));
        setSections(mine);
        if (mine.length) setSectionId(mine[0].id);
      })
      .catch((err) => {
        if (!cancelled) setSectionsError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const selected = useMemo(() => (sections || []).find((s) => s.id === sectionId) || null, [sections, sectionId]);

  const load = useCallback(
    async ({ pull = false } = {}) => {
      if (!selected) return;
      if (pull) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setData(
          await api.get('/grades/class-summary', {
            unwrap: SUMMARY_UNWRAP,
            params: { grade_level: selected.grade_level, section: selected.name, term: String(term) },
          })
        );
      } catch (err) {
        setError(extractError(err));
        setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selected, term]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (sectionsError) {
    return (
      <View className="flex-1 bg-page p-4">
        <ErrorAlert message={sectionsError} />
      </View>
    );
  }
  if (sections === null) return <LoadingSpinner className="py-16" label="Loading your classes…" />;
  if (sections.length === 0) {
    return (
      <View className="flex-1 bg-page p-4">
        <EmptyState
          icon="fa-table-list"
          title="Class summary is for class advisers"
          message="You are not assigned as an adviser of any section. An admin assigns advisers; your subject classes are under Grades."
        />
      </View>
    );
  }

  const subjects = data?.subjects ?? [];
  const learners = data?.learners ?? [];
  const mode = data?.grading_mode;
  const showGA = data?.show_general_average === true;
  const isFinal = data?.show_final === true;
  const completeness = new Map((data?.completeness ?? []).map((e) => [e.subject_id, e]));

  const sheet = (
    <View className="flex-row overflow-hidden rounded-xl border border-edge bg-surface">
      {/* THE FIXED COLUMN. */}
      <View style={{ width: NAME_W }} className="border-r border-edge">
        <View style={{ height: HEAD_H }} className="justify-end bg-surface-subtle px-3 pb-2">
          <Text className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Learner</Text>
        </View>
        {learners.map((learner) => (
          <Pressable
            key={learner.student_id}
            onPress={() => navigation.navigate('ClassSummaryLearner', { studentId: learner.student_id, name: `${learner.first_name} ${learner.last_name}` })}
            accessibilityRole="link"
            accessibilityLabel={`${learner.last_name}, ${learner.first_name} — open the report card`}
            style={{ height: ROW_H }}
            className="justify-center border-t border-edge px-3"
          >
            <Text numberOfLines={1} className="text-sm text-brand">
              {learner.last_name}, {learner.first_name}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* THE SCROLLING SUBJECTS. */}
      <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Class summary, scrolls sideways">
        <View>
          <View style={{ height: HEAD_H }} className="flex-row bg-surface-subtle">
            {subjects.map((subject) => (
              <View key={subject.id} style={{ width: CELL_W }} className="items-center justify-end px-1.5 pb-2">
                <Text numberOfLines={3} className="text-center text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                  {subject.name}
                </Text>
                {!isFinal ? <Completeness entry={completeness.get(subject.id)} /> : null}
              </View>
            ))}
            {showGA ? (
              <View style={{ width: CELL_W }} className="items-center justify-end px-1.5 pb-2">
                <Text className="text-center text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{isFinal ? 'General Average' : 'Average'}</Text>
              </View>
            ) : null}
          </View>
          {learners.map((learner) => (
            <View key={learner.student_id} style={{ height: ROW_H }} className="flex-row border-t border-edge">
              {subjects.map((subject, index) => {
                const cell = learner.cells?.[index];
                return (
                  <View key={subject.id} style={{ width: CELL_W }} className="items-center justify-center">
                    <TermValue
                      entry={mode === 'descriptive' ? { descriptive_grade: cell?.value ?? null } : { term_grade: cell?.value ?? null }}
                      mode={mode}
                      className="text-sm text-fg"
                    />
                  </View>
                );
              })}
              {showGA ? (
                <View style={{ width: CELL_W }} className="items-center justify-center">
                  <GradeValue value={learner.general_average ?? null} mode={mode} className="text-sm font-semibold text-fg" />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-3 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <Text className="text-sm text-fg-muted">Every learner in your advisory section, across every learning area.</Text>
      <View className="gap-3 rounded-xl border border-edge bg-surface p-3">
        {sections.length > 1 ? (
          <Segmented label="Class" value={sectionId} onChange={setSectionId} options={sections.map((s) => ({ key: s.id, label: `Grade ${s.grade_level} - ${s.name}` }))} />
        ) : null}
        <Segmented label="Term" value={term} onChange={setTerm} options={TERMS} />
      </View>
      {selected ? (
        <Text className="text-sm text-fg-muted">
          Grade {selected.grade_level} - {selected.name}
          {data?.section?.adviser_name ? ` · Adviser: ${data.section.adviser_name}` : ''}
        </Text>
      ) : null}
      {error ? (
        <ErrorAlert message={error} onRetry={() => load()} />
      ) : loading && !data ? (
        <LoadingSpinner className="py-10" label="Loading the class summary…" />
      ) : learners.length === 0 ? (
        <EmptyState icon="fa-user-graduate" title="No learners in this class yet" message="Learners appear here once they are enrolled in this section." />
      ) : (
        <>
          {sheet}
          {subjects.length > 2 ? <Text className="text-xs text-fg-muted">Swipe the grades sideways for every subject{showGA ? ' and the Average' : ''}. Tap a name for the report card.</Text> : null}
        </>
      )}
      <Text className="text-xs text-fg-muted">Read-only. Grades are encoded by each subject's teacher under Grades.</Text>
    </ScrollView>
  );
}
