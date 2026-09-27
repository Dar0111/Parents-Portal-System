import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import api from '../../api/client';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import Segmented from '../../components/Segmented';
import StatusBadge from '../../components/StatusBadge';
import GradeValue from '../../format/GradeValue';
import TermValue from '../../format/TermValue';
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

function Legend({ mode }) {
  const rows = mode === 'descriptive' ? DESCRIPTIVE_LEGEND : NUMERICAL_LEGEND;
  return (
    <View>
      <Text className="text-xs font-semibold uppercase tracking-wider text-fg-body">Performance descriptors</Text>
      <View className="mt-2 gap-1">
        {rows.map(([band, word]) => (
          <View key={band} className="flex-row items-baseline gap-2">
            <Text className="w-20 text-sm text-fg-muted" style={{ fontVariant: ['tabular-nums'] }}>
              {band}
            </Text>
            <Text className="text-sm text-fg-secondary">{word}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ReportCardView({ report, loading, error, onRetry, empty, onOpenTerm = null }) {
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

  const header = (
    <View className="border-b border-edge px-4 py-4">
      <Text className="text-base font-semibold text-fg">Learner’s Performance Report</Text>
      {schoolName ? <Text className="text-sm text-fg-secondary">{schoolName}</Text> : null}
      {report?.school_year ? <Text className="text-xs text-fg-muted">School year {report.school_year}</Text> : null}
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
        {student ? (
          <View className="gap-2 border-b border-edge px-4 py-3">
            <View>
              <Text className="text-xs uppercase tracking-wider text-fg-muted">Learner</Text>
              <Text className="text-sm text-fg">
                {student.first_name} {student.last_name}
              </Text>
            </View>
            <View>
              <Text className="text-xs uppercase tracking-wider text-fg-muted">Grade & section</Text>
              <Text className="text-sm text-fg">
                Grade {student.grade_level} - {student.section}
              </Text>
            </View>
            <View>
              <Text className="text-xs uppercase tracking-wider text-fg-muted">Adviser</Text>
              <Text className={`text-sm ${adviser ? 'text-fg' : 'text-fg-muted'}`}>{adviser || 'Not yet assigned'}</Text>
            </View>
          </View>
        ) : null}

        <View className="p-4">
          <Segmented options={SEGMENTS} value={segment} onChange={setSelected} label="Term" />
          <View className="mt-4">
            {subjects.map((subject, index) => {
              const entry = isFinal ? null : subject.terms?.[term];
              const openable = Boolean(onOpenTerm) && !isFinal && Boolean(entry?.grade_id);
              const cell = isFinal ? finalCell(subject, mode) : null;
              const value = isFinal ? (
                cell.kind === 'letter' ? <TermValue entry={cell.entry} mode={mode} className="text-sm text-fg" /> : <GradeValue value={cell.value} mode={mode} whole className="text-sm text-fg" />
              ) : (
                <TermValue entry={entry} mode={mode} className="text-sm text-fg" />
              );
              const row = (
                <View className={`flex-row items-baseline justify-between gap-3 py-2.5 ${index > 0 ? 'border-t border-edge-soft' : ''}`}>
                  <Text className="min-w-0 flex-1 text-sm text-fg">{subject.subject_name}</Text>
                  <View>{value}</View>
                </View>
              );
              return openable ? (
                <Pressable
                  key={subject.subject_id}
                  onPress={() => onOpenTerm(entry, subject.subject_name, term, mode)}
                  accessibilityRole="button"
                  accessibilityLabel={`${subject.subject_name}, term ${term} — see the scores behind this grade`}
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
                <Text className="text-xs font-semibold uppercase tracking-wider text-fg-body">{isFinal ? 'General average' : `General average, term ${term}`}</Text>
                <GradeValue value={isFinal ? report.general_average : report.term_averages?.[term] ?? null} mode={mode} className="text-base font-semibold text-fg" />
              </View>
              {isFinal && report.general_average_descriptor ? <Text className="mt-1 text-xs text-fg-muted">{report.general_average_descriptor.descriptor}</Text> : null}
            </View>
          ) : null}
        </View>

        <View className="gap-4 border-t border-edge px-4 py-4">
          <Legend mode={mode} />
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wider text-fg-body">Reading this report</Text>
            <View className="mt-2 gap-1">
              {readingNoteLines(mode, { hasTermGrade, canOpen }).map((l) => (
                <Text key={l} className="text-sm text-fg-muted">
                  {l}
                </Text>
              ))}
            </View>
          </View>
        </View>
      </>
    );
  }

  return (
    <View className="rounded-xl border border-edge bg-surface">
      {header}
      {body}
    </View>
  );
}
