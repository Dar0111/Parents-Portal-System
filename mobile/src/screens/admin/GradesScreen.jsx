import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import Avatar from '../../components/Avatar';
import { cardClass } from '../../components/buttonStyles';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok } from '../../components/FormStatus';
import LoadingSpinner from '../../components/LoadingSpinner';
import SectionHeader from '../../components/SectionHeader';
import Segmented from '../../components/Segmented';
import Text from '../../components/Text';
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
//
// THE LOOK (feat/ui-refresh, 2026-10-03) is the web's: the section's header,
// the picker in its own card, the learner's header card (initials only — a
// learner has no photo, §25), one card per subject, and the General Average
// as the card's one figure — its SIZE on the wrapper, never on GradeValue
// (§3). A term cell that opens the lock sheet is a bordered 48dp button; a
// term with nothing to lock has no border, so only a button looks like one.
// The chosen learner's row is tinted, heavier AND carries a check — never
// colour alone. NO MOTION here: a lock state must read at once.
//
// PULL TO REFRESH re-reads what the screen shows with the grade, section and
// learner as chosen: `loadReport` (the request every focus already makes) and
// the section's learner list, whose effect takes `studentsAttempt` as a key.
const GRADES = [1, 2, 3, 4, 5, 6].map((g) => ({ key: String(g), label: `Grade ${g}` }));

// 48dp, in dp (M19): the cell's height whether or not it is a button, so a
// row of three stays level.
const CELL = 48;

function TermCell({ term, entry, mode, onOpen }) {
  const { tokens } = useTheme();
  const body = (
    <View className="items-center justify-center gap-0.5 px-2 py-1.5" style={{ minHeight: CELL }}>
      <Text className="text-xs uppercase text-fg-muted">T{term}</Text>
      <View className="flex-row items-center gap-1">
        <TermValue entry={entry} mode={mode} className="text-sm text-fg" />
        {/* The lock is the only sign a grade is locked in this grid, so it
            takes a text colour, not a decoration's. */}
        {entry?.is_locked ? <Icon name="fa-lock" size={11} color={tokens['fg-muted']} /> : null}
      </View>
    </View>
  );
  if (!entry?.grade_id) return <View className="flex-1">{body}</View>;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Term ${term}${entry.is_locked ? ', locked' : ''} — lock or unlock`}
      android_ripple={{ color: tokens['edge-strong'] }}
      className="flex-1 overflow-hidden rounded-xl border border-edge-strong bg-surface"
    >
      {body}
    </Pressable>
  );
}

export default function GradesScreen({ navigation, route }) {
  const { tokens } = useTheme();
  const notice = route?.params?.notice || null;
  const [sections, setSections] = useState([]);
  const [grade, setGrade] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [studentId, setStudentId] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState(null);
  const [studentsAttempt, setStudentsAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
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
  }, [grade, sectionName, studentsAttempt]);

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

  // The pull's handler: the learner list (through its effect's key) and the
  // report card, as chosen. A card already on screen stays there while it is
  // read again.
  async function pullToRefresh() {
    setRefreshing(true);
    setStudentsAttempt((n) => n + 1);
    try {
      await loadReport();
    } finally {
      setRefreshing(false);
    }
  }

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
  // The learner list's own retry (feat/look-fixes): its effect takes
  // `studentsAttempt` as a key, so bumping it reads the list again.
  if (studentsError) body = <ErrorAlert message={studentsError} onRetry={() => setStudentsAttempt((n) => n + 1)} />;
  else if (!studentId) {
    // In the frame the report card will take, so the screen keeps its shape
    // when a student is picked.
    body = (
      <View className={cardClass}>
        {sectionName && !studentsLoading && students.length === 0 ? (
          <EmptyState
            icon="fa-user-graduate"
            title={`Grade ${grade} - ${sectionName} has no students`}
            message={chosenSection && Number(chosenSection.student_count) === 0 ? 'No student is enrolled in this section, so there is no report card to show.' : 'No students were returned for this section.'}
          />
        ) : (
          <EmptyState icon="fa-magnifying-glass" title="Pick a student to see their report card" message="Choose a grade, then a section, then a student." />
        )}
      </View>
    );
  } else if (reportError) body = <ErrorAlert message={reportError} onRetry={loadReport} />;
  else if (reportLoading && !report) body = <LoadingSpinner className="py-10" />;
  else if (report && !subjects.length) {
    body = (
      <View className={cardClass}>
        <EmptyState
          icon="fa-book"
          title={student ? `No subjects are set up for Grade ${student.grade_level} yet` : 'No subjects are set up for this grade level yet'}
          message="A grade level needs its subject list before a report card can exist."
        />
      </View>
    );
  } else if (report) {
    body = (
      <View className="gap-4">
        {/* THE LEARNER'S HEADER CARD: whose card this is, before the card. */}
        {student ? (
          <View className={`${cardClass} flex-row items-center gap-3 p-4`}>
            <Avatar name={`${student.first_name} ${student.last_name}`} size={48} />
            <View className="min-w-0 flex-1">
              <Text accessibilityRole="header" className="font-serif text-xl text-fg">
                {student.first_name} {student.last_name}
              </Text>
              <Text className="mt-0.5 text-sm text-fg-muted">
                Grade {student.grade_level} · {student.section} · School year {report.school_year}
              </Text>
            </View>
          </View>
        ) : null}

        <View className="gap-1">
          {/* An all-Pending card is the normal early state, not an empty
              state: replacing it would hide the subject list. A line above it
              instead. */}
          {noGradesYet ? <Text className="text-sm font-semibold text-fg-secondary">No grades have been recorded for this student yet.</Text> : null}
          <Text className="text-sm text-fg-muted">Select a term grade to lock or unlock it. A term with nothing recorded has no grade to lock.</Text>
        </View>

        <View className="gap-3">
          {subjects.map((subject) => (
            <View key={subject.subject_id} className={`${cardClass} gap-3 p-4`}>
              <View className="flex-row items-start justify-between gap-3">
                <Text className="min-w-0 flex-1 font-serif text-base text-fg">{subject.subject_name}</Text>
                {/* TWO RENDERERS FOR THE FINAL (feat/look-fixes), as on the
                    parent's card: Grade 1's Final is a LETTER, and GradeValue
                    prints a letter as "— N/A". TermValue carries the letter
                    and its descriptor; a number keeps GradeValue. */}
                <View className="items-end">
                  {mode === 'descriptive' ? (
                    <Text className="text-xs text-fg-muted">
                      Final <TermValue entry={{ descriptive_grade: subject.final_grade, descriptor: subject.final_grade_descriptor }} mode={mode} className="text-sm text-fg" />
                    </Text>
                  ) : (
                    <>
                      <Text className="text-xs text-fg-muted">
                        Final <GradeValue value={subject.final_grade} mode={mode} whole className="text-sm text-fg" />
                      </Text>
                      {subject.final_grade_descriptor ? <Text className="text-right text-xs text-fg-muted">{subject.final_grade_descriptor.descriptor}</Text> : null}
                    </>
                  )}
                </View>
              </View>
              <View className="flex-row gap-2">
                {[1, 2, 3].map((t) => (
                  <TermCell key={t} term={t} entry={subject.terms[t]} mode={mode} onOpen={() => openCell(subject, t)} />
                ))}
              </View>
            </View>
          ))}
        </View>

        <Text className="text-xs text-fg-muted">
          “— Pending” means not yet computable{mode === 'descriptive' ? '; “— N/A” means it does not apply to this grade level' : ''}.
        </Text>

        {/* NO GENERAL AVERAGE ON A DESCRIPTIVE CARD (feat/look-fixes), the
            parent card's rule (§5a-v: "has a Final" and "has a General
            Average" are two flags): Grade 1 has none at all. Grades 2–3 are
            numerical and keep it. */}
        {mode !== 'descriptive' ? (
          <View className={`${cardClass} flex-row flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-4`}>
            <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">General Average</Text>
            <Text className="text-xl font-bold text-fg">
              <GradeValue value={report.general_average} mode={mode} />
            </Text>
            {report.general_average_descriptor ? <Text className="text-xs text-fg-muted">{report.general_average_descriptor.descriptor}</Text> : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <SectionHeader title="Report card" />

      {/* THE PICKER CARD. Each choice acts at once and narrows the next —
          there is no Apply here. */}
      <View className={`${cardClass} gap-4 p-4`}>
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
            <View className="overflow-hidden rounded-xl border border-edge">
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
                    android_ripple={{ color: tokens['edge-strong'] }}
                    className={`flex-row items-center gap-2 px-4 py-2 ${i > 0 ? 'border-t border-edge-soft' : ''} ${active ? 'bg-brand-soft' : ''}`}
                    style={{ minHeight: 48 }}
                  >
                    <Text className={`min-w-0 flex-1 text-sm ${active ? 'font-semibold text-brand' : 'text-fg'}`}>
                      {s.last_name}, {s.first_name}
                      {s.status === 'inactive' ? ' (inactive)' : ''}
                    </Text>
                    {active ? <Icon name="fa-check" size={14} color={tokens.brand} /> : null}
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
