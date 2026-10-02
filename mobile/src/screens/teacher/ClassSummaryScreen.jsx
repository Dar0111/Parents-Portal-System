import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import { cardClass } from '../../components/buttonStyles';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import SectionHeader from '../../components/SectionHeader';
import Segmented from '../../components/Segmented';
import Text from '../../components/Text';
import { todayLocalDateString } from '../../format/date';
import GradeValue from '../../format/GradeValue';
import { currentTerm } from '../../format/schoolCalendar';
import TermValue from '../../format/TermValue';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
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
//
// THE TWO HEIGHTS, RE-MEASURED FOR THE NEW TYPE SCALE (feat/ui-refresh,
// 2026-10-03). `text-sm` is 13.1dp on a 19.25dp line and `text-xs` 11.4dp on
// 15.75dp (the phone's rem is 14 — M19).
//   ROW_H 48 (was 44): a learner's name may now take TWO lines instead of
//     being cut at one — 38.5dp of text — and the name is the row's tap
//     target, so the row is a full 48dp. A value cell is one line.
//   HEAD_H 88 (was 76): a subject name on three lines, its completeness line
//     and the bottom padding come to 71.75dp. In 76 that left 4dp, so an OS
//     font scale above 1.06 would have clipped the first line; 88 gives back
//     the headroom the old sizes had (about 1.2).
// Both are plain numbers used by BOTH halves, which is what keeps them level.
// CELL_W stays 96; the column label's side padding went from 5.25dp to 3.5dp,
// which gives the 4%-larger label back the width its longest word needs.
//
// RELOAD (feat/ui-refresh) IS `load` ITSELF — the same request, for the class
// and term chosen; nothing is reset. Pull-to-refresh stays.
const TERMS = [
  { key: 1, label: 'Term 1' },
  { key: 2, label: 'Term 2' },
  { key: 3, label: 'Term 3' },
  { key: 'final', label: 'Final' },
];
const SUMMARY_UNWRAP = ['section', 'school_year', 'term', 'grading_mode', 'show_final', 'show_general_average', 'subjects', 'learners', 'completeness'];
const ROW_H = 48;
const HEAD_H = 88;
const NAME_W = 150;
const CELL_W = 96;
const LABEL = 'mb-1.5 text-sm font-semibold text-fg-secondary';
// The column label, as on every table since the refresh: small, uppercase,
// muted — quieter than the values under it.
const HEAD_TEXT = 'text-xs font-semibold uppercase tracking-wide text-fg-muted';

// COUNTED, NEVER CONCLUDED (§4): how many learners have a mark, never whether
// the class is behind.
function Completeness({ entry }) {
  if (!entry || entry.total === 0) return null;
  const pending = entry.total - entry.recorded;
  return <Text className="mt-0.5 text-xs text-fg-muted">{pending === 0 ? 'Complete' : `${pending} pending`}</Text>;
}

// The section's header, on every state of the screen: the sheet's own name
// and the standing sentence under it. The reload props arrive only from the
// return that has a sheet to reload.
function Header(reloadProps) {
  return <SectionHeader title="Summary of Grades" description="Every learner in your advisory section, across every learning area." {...reloadProps} />;
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
      <View className="flex-1 gap-4 bg-page p-4">
        <Header />
        <ErrorAlert message={sectionsError} />
      </View>
    );
  }
  if (sections === null) return <LoadingSpinner className="py-16" label="Loading your classes…" />;
  if (sections.length === 0) {
    return (
      <View className="flex-1 gap-4 bg-page p-4">
        <Header />
        <View className={cardClass}>
          <EmptyState
            icon="fa-table-list"
            title="Class summary is for class advisers"
            message="You are not assigned as an adviser of any section. An admin assigns advisers; your subject classes are under Grades."
          />
        </View>
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
    <View className={`flex-row overflow-hidden ${cardClass}`}>
      {/* THE FIXED COLUMN. */}
      <View style={{ width: NAME_W }} className="border-r border-edge">
        <View style={{ height: HEAD_H }} className="justify-end bg-surface-subtle px-3 pb-2">
          <Text className={HEAD_TEXT}>Learner</Text>
        </View>
        {learners.map((learner) => (
          // IT LOOKS LIKE THE LINK IT IS: the accent colour and weight of
          // every text link — a name opens that learner's report card. The
          // press is answered by Android's ripple (a prop — M20).
          <Pressable
            key={learner.student_id}
            onPress={() => navigation.navigate('ClassSummaryLearner', { studentId: learner.student_id, name: `${learner.first_name} ${learner.last_name}` })}
            accessibilityRole="link"
            accessibilityLabel={`${learner.last_name}, ${learner.first_name} — open the report card`}
            android_ripple={{ color: tokens['edge-strong'] }}
            style={{ height: ROW_H }}
            className="justify-center border-t border-edge-soft px-3"
          >
            <Text numberOfLines={2} className="text-sm font-semibold text-brand">
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
              <View key={subject.id} style={{ width: CELL_W }} className="items-center justify-end px-1 pb-2">
                <Text numberOfLines={3} className={`text-center ${HEAD_TEXT}`}>
                  {subject.name}
                </Text>
                {!isFinal ? <Completeness entry={completeness.get(subject.id)} /> : null}
              </View>
            ))}
            {showGA ? (
              <View style={{ width: CELL_W }} className="items-center justify-end px-1 pb-2">
                <Text className={`text-center ${HEAD_TEXT}`}>{isFinal ? 'General Average' : 'Average'}</Text>
              </View>
            ) : null}
          </View>
          {learners.map((learner) => (
            <View key={learner.student_id} style={{ height: ROW_H }} className="flex-row border-t border-edge-soft">
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
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <Reveal>
        <View className="gap-4">
          <Header onReload={() => load()} reloading={loading || refreshing} reloadLabel="Reload class summary" />
          {/* WHICH SHEET: the class and the term, in one card. The class is
              named in the title face with its adviser after it — the same
              line, the same words, as before the refresh. */}
          <View className={`${cardClass} gap-3 p-4`}>
            {selected ? (
              <View className="flex-row items-center gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft">
                  <Icon name="fa-table-list" size={15} color={tokens.brand} />
                </View>
                <Text className="min-w-0 flex-1 text-sm text-fg-muted">
                  <Text className="font-serif text-base text-fg">
                    Grade {selected.grade_level} - {selected.name}
                  </Text>
                  {data?.section?.adviser_name ? ` · Adviser: ${data.section.adviser_name}` : ''}
                </Text>
              </View>
            ) : null}
            {sections.length > 1 ? (
              <View>
                <Text className={LABEL}>Class</Text>
                <Segmented label="Class" value={sectionId} onChange={setSectionId} options={sections.map((s) => ({ key: s.id, label: `Grade ${s.grade_level} - ${s.name}` }))} />
              </View>
            ) : null}
            <View>
              <Text className={LABEL}>Term</Text>
              <Segmented label="Term" value={term} onChange={setTerm} options={TERMS} />
            </View>
          </View>
        </View>
      </Reveal>
      {error ? (
        <ErrorAlert message={error} onRetry={() => load()} />
      ) : loading && !data ? (
        <LoadingSpinner className="py-10" label="Loading the class summary…" />
      ) : learners.length === 0 ? (
        <View className={cardClass}>
          <EmptyState icon="fa-user-graduate" title="No learners in this class yet" message="Learners appear here once they are enrolled in this section." />
        </View>
      ) : (
        <>
          {sheet}
          {subjects.length > 2 ? <Text className="text-xs text-fg-muted">Swipe the grades sideways for every subject{showGA ? ' and the Average' : ''}. Tap a name for the report card.</Text> : null}
        </>
      )}
      {/* A statement about who may EDIT this screen. An eye, not a padlock:
          beside grades a padlock means a LOCKED term grade (the admin's
          lock), and nothing here is. */}
      <View className="flex-row items-start gap-2">
        <Icon name="fa-eye" size={11} color={tokens['fg-faint']} style={{ marginTop: 3 }} />
        <Text className="min-w-0 flex-1 text-xs text-fg-muted">Read-only. Grades are encoded by each subject's teacher under Grades.</Text>
      </View>
    </ScrollView>
  );
}
