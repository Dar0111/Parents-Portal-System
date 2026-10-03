import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import api from '../../api/client';
import { cardClass } from '../../components/buttonStyles';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import Segmented from '../../components/Segmented';
import StatusBadge from '../../components/StatusBadge';
import Text from '../../components/Text';
import GradeValue from '../../format/GradeValue';
import TermValue from '../../format/TermValue';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';
import { DESCRIPTIVE_LEGEND, NUMERICAL_LEGEND, SEGMENTS, finalCell, initialSegment, readingNoteLines, showGeneralAverage, statusLine, termStatuses } from './reportCard/logic';

// THE REPORT CARD ON A PHONE — the web's ReportCard's NARROW branch only
// (its "term view": four segments and one row per learning area); the wide
// SF9 table is not built here. Extracted from Parent → Grades on branch 3 so
// Teacher → Class summary's learner screen renders the SAME card, as the web's
// ClassSummaryLearnerPage renders the same ReportCard — one document, two
// readers. Everything on the card comes from the report payload: a name is
// not an identifier, no LRN, no login_id, no student.id shown (§5c).
// `initial_grade` is in the payload and is NEVER rendered (§5a-v).
//
// `onOpenTerm` makes a term cell with a grade row a button into the
// breakdown; the teacher's read-only view passes none, and the reading note
// then says nothing about tapping. The school name and the adviser are
// fetched here because both readers need them and neither is in the payload.
//
// THE LOOK (feat/ui-refresh), as the web's card: a title band on the quiet
// surface (the document's name in the title face beside its icon chip), the
// learner's three facts under eyebrow labels, then the term picker, the
// rows, the general-average box and the two keys. The order is fixed — it is
// a document, not a list. The chosen segment is this component's state and
// the component stays mounted through a pull-to-refresh, so a pull keeps the
// term.
export const REPORT_UNWRAP = [
  'student',
  'school_year',
  'grading_mode',
  'subjects',
  'term_averages',
  'term_average_descriptors',
  'general_average',
  'general_average_descriptor',
];

// The label over a fact or a key: the eyebrow style.
const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-fg-muted';

// The band column is as wide as its longest value: "Below 65" for the
// numerical scale, one letter for Key Stage 1 — a letter in a column sized
// for a range left a gap that read as a missing value.
function Legend({ mode }) {
  const descriptive = mode === 'descriptive';
  const rows = descriptive ? DESCRIPTIVE_LEGEND : NUMERICAL_LEGEND;
  return (
    <View>
      <Text className={EYEBROW}>Performance descriptors</Text>
      <View className="mt-2 gap-1.5">
        {rows.map(([band, word]) => (
          <View key={band} className="flex-row items-baseline gap-2">
            <Text className={`${descriptive ? 'w-6' : 'w-20'} text-sm font-semibold text-fg-secondary`} style={{ fontVariant: ['tabular-nums'] }}>
              {band}
            </Text>
            <Text className="min-w-0 flex-1 text-sm text-fg-body">{word}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ReportCardView({ report, loading, error, onRetry, empty, onOpenTerm = null }) {
  const { tokens } = useTheme();
  const [schoolName, setSchoolName] = useState(null);
  const [adviser, setAdviser] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let live = true;
    api
      .get('/settings', { unwrap: 'settings' })
      .then((settings) => {
        if (live) setSchoolName(settings?.school_name ?? null);
      })
      .catch(() => {
        if (live) setSchoolName(null);
      });
    return () => {
      live = false;
    };
  }, []);

  const gradeLevel = report?.student?.grade_level ?? null;
  const sectionName = report?.student?.section ?? null;
  const schoolYear = report?.school_year ?? null;
  useEffect(() => {
    if (gradeLevel == null || !sectionName) return undefined;
    let live = true;
    api
      .get(`/sections?grade_level=${gradeLevel}`, { unwrap: 'sections' })
      .then((sections) => {
        if (!live) return;
        const match = sections.find((s) => s.name === sectionName && (!schoolYear || s.school_year === schoolYear));
        setAdviser(match?.adviser_name ?? null);
      })
      .catch(() => {
        if (live) setAdviser(null);
      });
    return () => {
      live = false;
    };
  }, [gradeLevel, sectionName, schoolYear]);

  const student = report?.student ?? null;
  const mode = report?.grading_mode ?? 'numerical';
  const subjects = useMemo(() => report?.subjects ?? [], [report?.subjects]);
  const statuses = useMemo(() => termStatuses(subjects, mode), [subjects, mode]);
  const canOpen = Boolean(onOpenTerm) && subjects.some((subject) => [1, 2, 3].some((term) => subject.terms?.[term]?.grade_id));
  const hasTermGrade = subjects.some((subject) => [1, 2, 3].some((term) => subject.terms?.[term]?.term_grade != null));
  const segment = selected ?? initialSegment(statuses);
  const isFinal = segment === 'final';
  const term = isFinal ? null : Number(segment);
  const line = statusLine(statuses);
  // A RECORDED number is the row's emphasised value. A letter already is
  // (TermValue sets it in the heavier face), and its descriptor beside it
  // must stay the quiet one — nested text inherits the family, so no weight
  // goes on here. "— Pending" is not a value and keeps the regular face.
  const valueClassFor = (recorded) => (mode !== 'descriptive' && recorded ? 'text-base font-semibold text-fg' : 'text-base text-fg');

  // THE TITLE BAND: the document's name in the title face on the quiet
  // surface, the school and the year under it, and the recording status
  // below. The icon chip is decoration.
  const header = (
    <View className="border-b border-edge bg-surface-subtle px-4 py-4">
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft">
          <Icon name="fa-file-lines" size={14} color={tokens.brand} />
        </View>
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" className="font-serif text-base text-fg">
            Learner’s Performance Report
          </Text>
          {schoolName ? <Text className="mt-0.5 text-sm text-fg-secondary">{schoolName}</Text> : null}
          {report?.school_year ? <Text className="text-xs text-fg-muted">School year {report.school_year}</Text> : null}
        </View>
      </View>
      {report && subjects.length ? (
        <View className="mt-3">
          <StatusBadge status="recorded" tone={line.tone} label={line.label} />
          {line.missing.length ? (
            <Text className="mt-1 text-xs text-fg-muted">
              {line.missing.length === 1 ? `Term ${line.missing[0]}` : `Terms ${line.missing.slice(0, -1).join(', ')} and ${line.missing[line.missing.length - 1]}`} not yet recorded
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  let body;
  if (error) body = <View className="p-4"><ErrorAlert message={error} onRetry={onRetry} /></View>;
  else if (loading) body = <LoadingSpinner className="py-12" />;
  else if (!report || !subjects.length) body = <EmptyState icon={empty.icon} title={empty.title} message={empty.message} />;
  else {
    body = (
      <>
        {/* The learner takes the first line alone; the class and the adviser
            share the second, each in half the card and free to wrap. */}
        {student ? (
          <View className="gap-3 border-b border-edge px-4 py-4">
            <View>
              <Text className={EYEBROW}>Learner</Text>
              <Text className="mt-0.5 text-sm font-semibold text-fg">
                {student.first_name} {student.last_name}
              </Text>
            </View>
            <View className="flex-row gap-4">
              <View className="min-w-0 flex-1">
                <Text className={EYEBROW}>Grade & section</Text>
                <Text className="mt-0.5 text-sm text-fg">
                  Grade {student.grade_level} - {student.section}
                </Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text className={EYEBROW}>Adviser</Text>
                <Text className={`mt-0.5 text-sm ${adviser ? 'text-fg' : 'text-fg-muted'}`}>{adviser || 'Not yet assigned'}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View className="p-4">
          <Segmented options={SEGMENTS} value={segment} onChange={setSelected} label="Term" />
          {/* ONE ROW PER LEARNING AREA, each at least 48dp (a plain style
              object in dp — M19). Where the card can open the scores behind a
              grade, the last slot is the same width on every row — a chevron
              on a row that opens, an empty space on one that does not — so
              the values line up in one column and only the rows that can be
              opened say so. */}
          <View className="mt-3">
            {subjects.map((subject, index) => {
              const entry = isFinal ? null : subject.terms?.[term];
              const openable = Boolean(onOpenTerm) && !isFinal && Boolean(entry?.grade_id);
              const cell = isFinal ? finalCell(subject, mode) : null;
              const valueClass = valueClassFor(isFinal ? cell.value != null : entry?.term_grade != null);
              const value = isFinal ? (
                cell.kind === 'letter' ? <TermValue entry={cell.entry} mode={mode} className={valueClass} /> : <GradeValue value={cell.value} mode={mode} whole className={valueClass} />
              ) : (
                <TermValue entry={entry} mode={mode} className={valueClass} />
              );
              const row = (
                <View
                  className={`flex-row items-center justify-between gap-3 py-2.5 ${index > 0 ? 'border-t border-edge-soft' : ''}`}
                  style={{ minHeight: 48 }}
                >
                  <Text className="min-w-0 flex-1 text-sm text-fg">{subject.subject_name}</Text>
                  <View>{value}</View>
                  {onOpenTerm ? (
                    <View className="items-center" style={{ width: 12 }}>
                      {openable ? <Icon name="fa-chevron-right" size={10} color={tokens['fg-faint']} /> : null}
                    </View>
                  ) : null}
                </View>
              );
              return openable ? (
                <Pressable
                  key={subject.subject_id}
                  onPress={() => onOpenTerm(entry, subject.subject_name, term, mode)}
                  accessibilityRole="button"
                  accessibilityLabel={`${subject.subject_name}, term ${term} — see the scores behind this grade`}
                  android_ripple={{ color: tokens['edge-strong'] }}
                >
                  {row}
                </Pressable>
              ) : (
                <View key={subject.subject_id}>{row}</View>
              );
            })}
          </View>

          {/* The General Average box is keyed on the MODE, never on whether
              the values happen to be null: Key Stage 1 has no general
              average at all (§14c). */}
          {showGeneralAverage(mode) ? (
            <View className="mt-4 rounded-xl bg-brand-soft px-4 py-3">
              <View className="flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Text className="text-xs font-semibold uppercase tracking-wide text-fg-body">{isFinal ? 'General average' : `General average, term ${term}`}</Text>
                <GradeValue value={isFinal ? report.general_average : report.term_averages?.[term] ?? null} mode={mode} className="text-lg font-bold text-fg" />
              </View>
              {isFinal && report.general_average_descriptor ? <Text className="mt-1 text-xs text-fg-muted">{report.general_average_descriptor.descriptor}</Text> : null}
            </View>
          ) : null}
        </View>

        {/* The two keys. The reading note is a bulleted list: five sentences
            run together read as one paragraph. The markers are decoration. */}
        <View className="gap-4 border-t border-edge px-4 py-4">
          <Legend mode={mode} />
          <View>
            <Text className={EYEBROW}>Reading this report</Text>
            <View className="mt-2 gap-1.5">
              {readingNoteLines(mode, { hasTermGrade, canOpen }).map((l) => (
                <View key={l} className="flex-row items-start gap-2">
                  <View className="mt-2 h-1.5 w-1.5 rounded-full bg-edge-strong" />
                  <Text className="min-w-0 flex-1 text-sm text-fg-muted">{l}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </>
    );
  }

  // `overflow-hidden` clips the title band to the card's 16px corners.
  return (
    <View className={`${cardClass} overflow-hidden`}>
      {header}
      {body}
    </View>
  );
}
