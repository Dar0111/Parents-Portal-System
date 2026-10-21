import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import api from '../../api/client';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import Segmented from '../../components/Segmented';
import Skeleton, { SkeletonBar } from '../../components/Skeleton';
import StatusBadge from '../../components/StatusBadge';
import Text from '../../components/Text';
import { CONFIRM_BUTTON, TERM_FINAL_BODY, confirmedLine, confirmedReaderLine, lockedTerms, termFinalTitle } from '../../format/acknowledgement';
import { timestampDay } from '../../format/date';
import GradeValue from '../../format/GradeValue';
import TermValue from '../../format/TermValue';
import { useSkeleton } from '../../hooks/useSkeleton';
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
  // feat/grade-acknowledgement: per term, locked and confirmed — the NINTH
  // key, and the line to change (§1).
  'acknowledgements',
];

// The label over a fact or a key: the eyebrow style.
const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-fg-muted';

// THE TERM CONFIRMATIONS (feat/grade-acknowledgement, 2026-10-21) — the web's
// ReportCard.TermConfirmations: one block per LOCKED term between the
// learner's facts and the term picker. With `onConfirmTerm` (the parent's
// screen) it asks — the body and the one 48dp button — and, once confirmed,
// says when; with no handler (the adviser's learner screen) it says whether
// the parent has confirmed, and nothing is a button. The button hands the
// term to the screen, whose system Alert is the §5e step; this card never
// writes. The words are the mirrored format/acknowledgement.js; the date is
// timestampDay (Asia/Manila). `confirmError` is the write's failure, shown
// under the button that caused it (§7c).
export function TermConfirmations({ acknowledgements, onConfirmTerm, confirmingTerm, confirmError }) {
  const terms = lockedTerms(acknowledgements);
  if (!terms.length) return null;
  return (
    <View className="gap-3 border-b border-edge px-4 py-4">
      {terms.map((term) => {
        const ack = acknowledgements[term];
        const when = ack.acknowledged_at ? timestampDay(ack.acknowledged_at, { style: 'long' }) : null;
        let body;
        if (when) {
          body = <Text className="mt-1 text-sm text-fg-body">{onConfirmTerm ? confirmedLine(term, when) : confirmedReaderLine(when)}</Text>;
        } else if (onConfirmTerm) {
          body = (
            <>
              <Text className="mt-1 text-sm text-fg-body">{TERM_FINAL_BODY}</Text>
              <View className="mt-3 items-start">
                <Button
                  variant="primary"
                  icon="fa-check"
                  onPress={() => onConfirmTerm(term)}
                  loading={confirmingTerm === term}
                  disabled={confirmingTerm != null && confirmingTerm !== term}
                >
                  {CONFIRM_BUTTON}
                </Button>
              </View>
              {confirmError && confirmingTerm == null ? (
                <View className="mt-3">
                  <ErrorAlert message={confirmError} />
                </View>
              ) : null}
            </>
          );
        } else {
          body = <Text className="mt-1 text-sm text-fg-muted">{confirmedReaderLine(null)}</Text>;
        }
        return (
          <View key={term} accessibilityLabel={termFinalTitle(term)} className="rounded-xl border border-edge bg-surface-subtle px-4 py-3">
            <Text className="text-sm font-semibold text-fg">{termFinalTitle(term)}</Text>
            {body}
          </View>
        );
      })}
    </View>
  );
}

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

// THE CARD'S SKELETON (build 2, feat/dashboards-look, 2026-10-07), the web's
// shape on one column: under the real title band, the learner's line and the
// class / adviser pair, the term picker's track, one name-and-value bar pair
// per learning area at the row's 48dp, and the general-average box — which a
// Key Stage 1 card does not have, when the mode is already known. It replaces
// the spinner whenever the card loads; painted after 300 ms (useSkeleton).
const SKELETON_SUBJECTS = ['w-2/5', 'w-1/3', 'w-1/2', 'w-2/5', 'w-1/4', 'w-1/3'];

function Fact({ width = 'w-3/4' }) {
  return (
    <View className="min-w-0 flex-1">
      <View className="h-4 justify-center">
        <SkeletonBar className="h-2.5 w-16" />
      </View>
      <View className="mt-0.5 h-5 justify-center">
        <SkeletonBar className={`h-3 ${width}`} />
      </View>
    </View>
  );
}

function ReportSkeleton({ phase, mode }) {
  return (
    <Skeleton phase={phase}>
      <View className="gap-3 border-b border-edge px-4 py-4">
        <Fact width="w-1/2" />
        <View className="flex-row gap-4">
          <Fact />
          <Fact />
        </View>
      </View>
      <View className="p-4">
        <SkeletonBar round="rounded-lg" className="h-12 w-full" />
        <View className="mt-3">
          {SKELETON_SUBJECTS.map((w, i) => (
            <View key={i} className="flex-row items-center justify-between gap-3 border-b border-edge-soft" style={{ minHeight: 48 }}>
              <SkeletonBar className={`h-3 ${w}`} />
              <SkeletonBar className="h-3 w-12" />
            </View>
          ))}
        </View>
        {mode !== 'descriptive' ? <SkeletonBar round="rounded-xl" className="mt-4 h-12 w-full" /> : null}
      </View>
    </Skeleton>
  );
}

export default function ReportCardView({
  report,
  loading,
  error,
  onRetry,
  empty,
  onOpenTerm = null,
  // feat/grade-acknowledgement: the parent's screen passes the three; a
  // reader passes none.
  onConfirmTerm = null,
  confirmingTerm = null,
  confirmError = null,
}) {
  const { tokens } = useTheme();
  const skeleton = useSkeleton(Boolean(loading) && !error);
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
  else if (loading) body = <ReportSkeleton phase={skeleton} mode={report?.grading_mode} />;
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

        <TermConfirmations
          acknowledgements={report.acknowledgements}
          onConfirmTerm={onConfirmTerm}
          confirmingTerm={confirmingTerm}
          confirmError={confirmError}
        />

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
