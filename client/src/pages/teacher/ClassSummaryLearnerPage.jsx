import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import { buttonClass, cardClass } from '../../components/buttonClass';
import ReloadButton from '../../components/ReloadButton';
import ReportCard from '../parent/ReportCard';
import { usePageTitle } from '../../layout/usePageTitle';
import Reveal from '../../motion/Reveal';

// Teacher → Class summary → one learner (CR3).
//
// The adviser's drill-through: the same printed Learner's Performance Report
// a parent sees, read-only, reached by tapping a name on the summary.
//
// ---------------------------------------------------------------------------
// ReportCard IS REUSED UNCHANGED, AND THAT IS THE POINT
// ---------------------------------------------------------------------------
// It is a presentational component — "every state below is reachable by
// passing props, with no effects and no requests" — so a second card for a
// second role would be a second implementation of one document. The adviser
// and the parent must be looking at the same sheet; if they can disagree,
// the conversation those two people have is about the software rather than
// the learner.
//
// NOT MODIFIED for this view, deliberately. What differs is what is PASSED:
//
//   - `onOpenTerm` is omitted, so no term cell is a button and the parent's
//     raw-score breakdown modal does not exist here. An adviser who wants the
//     scores behind a mark opens the class record for that subject, which is
//     the screen that owns them; a second route to the same numbers is a
//     second thing to keep in step.
//   - the empty copy is the teacher's, not the parent's.
//
// ---------------------------------------------------------------------------
// SCOPE, AND WHY THIS PAGE NEEDED A SERVER CHANGE FIRST
// ---------------------------------------------------------------------------
// `GET /grades/student/:studentId` was assignments-only until CR3. An adviser
// with no teacher_assignments rows — TCH-002 in the seed — got 404 on every
// learner in the section they advise, so this drill-through could not have
// worked at all. The read scope is now assigned-OR-adviser. Encode scope was
// NOT widened, which is why this page has no write of any kind.
//
// A 403 does not redirect (§2). If a teacher reaches a learner outside their
// scope the API answers 404 and the card shows that message in its own frame.

export default function ClassSummaryLearnerPage() {
  const { studentId } = useParams();

  const [report, setReport] = useState(null);
  const [schoolName, setSchoolName] = useState(null);
  const [adviser, setAdviser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/grades/student/${studentId}`, {
        // The same seven keys the parent card names. An UNNAMED key is
        // silently undefined rather than an error, and undefined renders as
        // Pending — a plausible-looking value, not a visible break (§1). If
        // the endpoint gains a field, this list and the parent page's both
        // change.
        unwrap: [
          'student',
          'school_year',
          'grading_mode',
          'subjects',
          'term_averages',
          'general_average',
          'general_average_descriptor',
        ],
      });
      setReport(data);
    } catch (err) {
      setError(extractError(err));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Both of these are decoration on the printed sheet, and NEITHER may take
  // the card down — the same rule the parent page states. A failed read here
  // leaves the heading blank and the grades intact.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/settings', { unwrap: 'settings' })
      .then((value) => {
        if (!cancelled) setSchoolName(value?.school_name ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const gradeLevel = report?.student?.grade_level;
    const section = report?.student?.section;
    if (!gradeLevel || !section) return undefined;
    let cancelled = false;
    api
      .get(`/sections?grade_level=${gradeLevel}`, { unwrap: 'sections' })
      .then((rows) => {
        if (cancelled) return;
        const match = (rows || []).find((s) => s.name === section);
        setAdviser(match?.adviser_name ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [report?.student?.grade_level, report?.student?.section]);

  const name = report?.student ? `${report.student.first_name} ${report.student.last_name}` : null;

  // THE LEARNER'S NAME IS THE PAGE TITLE, which is what every other detail
  // page already does — `teacher/StudentDetailPage` and both message threads
  // set the record's name and use <h2> inside the page. This one set
  // 'Class summary' in the header and rendered the name as a SECOND <h1>:
  // two top-level headings saying different things, which is worse than the
  // duplicate pair on the two list pages, not better.
  //
  // The fallback matters because the name arrives with the fetch — without
  // it the header would be empty on first paint, and the smoke sweep fails
  // an empty heading as hard as a missing one.
  //
  // Declared AFTER `name` rather than at the top: the hook runs in the same
  // position on every render, which is all the rules require.
  usePageTitle(name || 'Class summary');

  // RELOAD (feat/ui-refresh) IS `load` ITSELF — the learner's card, asked for
  // again; the card's own frame shows the loading and error states, as on the
  // first load. It sits in this page's bar rather than in a section header:
  // the card below already carries the document's <h2> ("Learner's
  // Performance Report"), and a second heading over it would name the same
  // sheet twice.
  return (
    <Reveal className="space-y-6">
      {/* Navigation and a statement about editability: neither survives the
          trip to paper (UI-D). `ReportCard` carries its own masthead — the
          school name, the learner and the school year — so the printed sheet
          is still labelled without this block.

          One bar: the way back on the left as a real 44px control (it was a
          line of muted text), what this view is under it, Reload on the
          right. */}
      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3 p-4 print:hidden`}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <Link to="/teacher/class-summary" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            <span aria-hidden="true" className="flex items-center justify-center">
              <i className="fa-solid fa-arrow-left" />
            </span>
            Back to class summary
          </Link>
          <p className="text-sm text-fg-muted">Report card, read-only.</p>
        </div>
        <ReloadButton onReload={load} loading={loading} label="Reload report card" />
      </div>

      <ReportCard
        report={report}
        schoolName={schoolName}
        adviser={adviser}
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon="fa-chart-simple"
        emptyTitle="No grades recorded yet"
        emptyMessage="This learner has no grades for the current school year. Grades appear as each subject teacher encodes them."
      />
    </Reveal>
  );
}
