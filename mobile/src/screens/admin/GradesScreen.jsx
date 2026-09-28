import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok } from '../../components/FormStatus';
import LoadingSpinner from '../../components/LoadingSpinner';
import Segmented from '../../components/Segmented';
import GradeValue from '../../format/GradeValue';
import TermValue from '../../format/TermValue';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';
import { REPORT_UNWRAP } from '../parent/ReportCardView';

// ADMIN → GRADES — the web's admin/GradesPage.jsx: VIEW, plus the LOCK. Pick a
// grade, then a section, then a learner (GET /students status=all), and read
// their record (GET /grades/student/:id, the parent's unwrap). Like the web,
// this is ITS OWN SUBJECT LIST, not the report card: each subject shows its
// three term cells and its Final, and a term cell WITH A GRADE ROW is a
// button into the lock sheet — a Pending cell whose row exists included (the
// lock has no completeness gate). A term with no row has nothing to lock and
// is not a button. A locked cell carries the lock mark. DELETE is
// deliberately not surfaced (KNOWN ISSUES). No verdicts (§4): numbers,
// letters, Pending and N/A only. Re-reads on focus, so a lock or unlock shows
// on return from the sheet (M14).
const GRADES = [1, 2, 3, 4, 5, 6].map((g) => ({ key: String(g), label: `Grade ${g}` }));

function TermCell({ term, entry, mode, onOpen }) {
  const { tokens } = useTheme();
  const body = (
    <View className="items-center gap-0.5 rounded-lg px-2 py-1.5">
      <Text className="text-[11px] uppercase text-fg-muted">T{term}</Text>
      <View className="flex-row items-center gap-1">
        <TermValue entry={entry} mode={mode} className="text-sm text-fg" />
        {entry?.is_locked ? <Icon name="fa-lock" size={10} color={tokens['fg-faint']} /> : null}
      </View>
    </View>
  );
  if (!entry?.grade_id) return <View className="flex-1">{body}</View>;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Term ${term}${entry.is_locked ? ', locked' : ''} — lock or unlock`}
      className="flex-1 rounded-lg border border-edge-strong"
    >
      {body}
    </Pressable>
  );
}

export default function GradesScreen({ navigation, route }) {
  const notice = route?.params?.notice || null;
  const [sections, setSections] = useState([]);
  const [grade, setGrade] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [studentId, setStudentId] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState(null);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (!cancelled) setSections(rows);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!grade || !sectionName) {
      setStudents([]);
      setStudentsError(null);
      return undefined;
    }
    let cancelled = false;
    setStudentsLoading(true);
    setStudentsError(null);
    api
      .get('/students', { unwrap: 'students', params: { grade_level: grade, section: sectionName, status: 'all' } })
      .then((rows) => {
        if (!cancelled) setStudents(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setStudentsError(extractError(err));
          setStudents([]);
        }
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [grade, sectionName]);

  const loadReport = useCallback(async () => {
    if (!studentId) {
      setReport(null);
      setReportError(null);
      return;
    }
    setReportLoading(true);
    setReportError(null);
    try {
      setReport(await api.get(`/grades/student/${studentId}`, { unwrap: REPORT_UNWRAP }));
    } catch (err) {
      setReportError(extractError(err));
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      loadReport();
    }, [loadReport])
  );

  useFocusEffect(
    useCallback(() => {
      if (notice) {
        setStatus(ok(notice));
        navigation.setParams({ notice: null });
      }
    }, [notice, navigation])
  );

  const sectionOptions = useMemo(
    () => (grade ? sections.filter((s) => Number(s.grade_level) === Number(grade)).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [sections, grade]
  );
  const mode = report?.grading_mode ?? 'numerical';
  const subjects = report?.subjects ?? [];
  const student = report?.student ?? null;
  const noGradesYet = subjects.length > 0 && subjects.every((s) => !s.terms[1] && !s.terms[2] && !s.terms[3]);
  const chosenSection = sectionOptions.find((s) => s.name === sectionName) || null;

  function openCell(subject, term) {
    setStatus(null);
    navigation.navigate('GradeLock', { subjectName: subject.subject_name, term, mode, entry: subject.terms[term] });
  }

  let body;
  if (studentsError) body = <ErrorAlert message={studentsError} />;
  else if (!studentId) {
    body =
      sectionName && !studentsLoading && students.length === 0 ? (
        <EmptyState
          icon="fa-user-graduate"
          title={`Grade ${grade} - ${sectionName} has no students`}
          message={chosenSection && Number(chosenSection.student_count) === 0 ? 'No student is enrolled in this section, so there is no report card to show.' : 'No students were returned for this section.'}
        />
      ) : (
        <EmptyState icon="fa-magnifying-glass" title="Pick a student to see their report card" message="Choose a grade, then a section, then a student." />
      );
  } else if (reportError) body = <ErrorAlert message={reportError} onRetry={loadReport} />;
  else if (reportLoading && !report) body = <LoadingSpinner className="py-10" />;
  else if (report && !subjects.length) {
    body = (
      <EmptyState
        icon="fa-book"
        title={student ? `No subjects are set up for Grade ${student.grade_level} yet` : 'No subjects are set up for this grade level yet'}
        message="A grade level needs its subject list before a report card can exist."
      />
    );
  } else if (report) {
    body = (
      <View className="gap-3">
        {student ? (
          <View>
            <Text className="text-base font-semibold text-fg">
              {student.first_name} {student.last_name}
            </Text>
            <Text className="text-xs text-fg-muted">
              Grade {student.grade_level} · {student.section} · School year {report.school_year}
            </Text>
          </View>
        ) : null}
        {noGradesYet ? <Text className="text-sm text-fg-muted">No grades have been recorded for this student yet.</Text> : null}
        <Text className="text-sm text-fg-muted">Select a term grade to lock or unlock it. A term with nothing recorded has no grade to lock.</Text>
        {subjects.map((subject) => (
          <View key={subject.subject_id} className="rounded-xl border border-edge bg-surface p-3">
            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="min-w-0 flex-1 text-sm font-semibold text-fg">{subject.subject_name}</Text>
              <Text className="text-xs text-fg-muted">
                Final <GradeValue value={subject.final_grade} mode={mode} whole className="text-sm text-fg" />
              </Text>
            </View>
            {subject.final_grade_descriptor ? <Text className="text-right text-xs text-fg-muted">{subject.final_grade_descriptor.descriptor}</Text> : null}
            <View className="mt-2 flex-row gap-2">
              {[1, 2, 3].map((t) => (
                <TermCell key={t} term={t} entry={subject.terms[t]} mode={mode} onOpen={() => openCell(subject, t)} />
              ))}
            </View>
          </View>
        ))}
        <Text className="text-xs text-fg-muted">
          “— Pending” means not yet computable{mode === 'descriptive' ? '; “— N/A” means it does not apply to this grade level' : ''}.
        </Text>
        <View className="flex-row flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-edge bg-surface px-4 py-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">General Average</Text>
          <GradeValue value={report.general_average} mode={mode} className="text-base text-fg" />
          {report.general_average_descriptor ? <Text className="text-xs text-fg-muted">{report.general_average_descriptor.descriptor}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-3 p-4 pb-10">
      <View className="gap-3 rounded-xl border border-edge bg-surface p-3">
        <Segmented
          label="Grade"
          value={grade}
          onChange={(g) => {
            setGrade(g);
            setSectionName('');
            setStudentId(null);
            setStatus(null);
          }}
          options={GRADES}
        />
        {grade ? (
          <Segmented
            label="Section"
            value={sectionName}
            onChange={(name) => {
              setSectionName(name);
              setStudentId(null);
              setStatus(null);
            }}
            options={sectionOptions.map((s) => ({ key: s.name, label: s.name }))}
          />
        ) : (
          <Text className="text-sm text-fg-muted">Pick a grade first.</Text>
        )}
        {sectionName ? (
          studentsLoading ? (
            <Text className="text-sm text-fg-muted">Loading…</Text>
          ) : students.length ? (
            <View className="rounded-lg border border-edge">
              {students.map((s, i) => {
                const active = s.id === studentId;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => {
                      setStudentId(s.id);
                      setStatus(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, checked: active }}
                    className={`px-3 py-2.5 ${i > 0 ? 'border-t border-edge-soft' : ''} ${active ? 'bg-brand-soft' : ''}`}
                  >
                    <Text className={`text-sm ${active ? 'font-medium text-brand' : 'text-fg'}`}>
                      {s.last_name}, {s.first_name}
                      {s.status === 'inactive' ? ' (inactive)' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null
        ) : null}
      </View>
      <FormStatus status={status} />
      {body}
    </ScrollView>
  );
}
