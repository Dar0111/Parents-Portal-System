const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { roundTo2 } = require('../utils/gradeComputation');
const { SCHOOL_YEAR, currentTerm } = require('../utils/schoolCalendar');
const { todayLocalDateString } = require('../utils/dateFormat');

const router = express.Router();

// GET /api/dashboard — one read-only endpoint, branched by role (DB1,
// 2026-09-19).
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS AT ALL, AND WHY IT IS DELIBERATELY THIN
// ---------------------------------------------------------------------------
// Most dashboard cards are answered by endpoints that already exist, and they
// stay that way: the parent's attendance counts, the recent announcements,
// the upcoming events, the excuse-letter status, the teacher's today-banner,
// the unread badge. Duplicating those here would mean two copies of nine
// filters, and every later change to a list's scope would have to be made
// twice.
//
// THREE THINGS FAN-OUT CANNOT DO, and they are the whole content of this file
// (Darryl, Q1, 2026-09-19 — build only these):
//
//   1. Teacher class-encoding progress. There is no endpoint that answers
//      "is this class fully encoded for the current term". Assembling it from
//      the client costs one request per assignment and gets worse as a
//      teacher's load grows.
//   2. Admin counts. Three integers that would otherwise be three list
//      requests fetched purely to read `page.total` off each one, plus a
//      lock count that has no endpoint at all.
//   3. The parent grades summary. AMENDMENT A1 (Darryl, 2026-09-19): the
//      latest term with grades, "N of M subjects recorded" and the per-term
//      average are computed HERE, not in the client, using the same
//      `roundTo2` the report card uses — so the dashboard, the report card
//      and Expo can never disagree in the last digit. A client-side mean
//      would have been a second implementation of a number parents compare
//      against their child's card.
//
// Recent activity is NOT here. It needs a read endpoint for `activity_logs`
// (none exists — every reference in server/routes/ is a write) plus a
// redaction rule for free-text `details` written by twenty-odd call sites.
// It moves to the Admin Activity Log page with its own endpoint (Darryl, Q2).
//
// ---------------------------------------------------------------------------
// SCOPE: EVERY QUERY REUSES THE LIST'S OWN `WHERE`, NEVER A WIDENING
// ---------------------------------------------------------------------------
// Same rule the notification fan-out carries (§10), and the same failure mode
// if it is broken: a summary is the easiest place in the system to leak a row
// a role cannot open, because nothing on screen names the row it came from.
// Each query below states which endpoint's predicate it is repeating.
//
// No `logActivity` — this is a read, and it will run on every dashboard load
// of every session. No `sanitizeUser`: no query here selects a user row, only
// counts and names. No `parseId`: there are no route params and no filters,
// which is also why there is no pagination — every result is a fixed-size
// summary, not a list.

// academic_year is seeded and validated by routes/settings.js, so a missing one
// is a real misconfiguration rather than an empty state. Same treatment the
// report card gives it: fail loudly and name the key.
//
// THE TERM IS NOT A SETTING (pre-Stage-5 #7, 2026-09-26). It is derived from
// today's date by utils/schoolCalendar.js, the one table of term dates, so
// the setting an admin could type is gone and this endpoint, the parent hero,
// the class record and the class summary all answer from the same rule. The
// handler below refuses when the setting's school year and the calendar's
// disagree — starting a new school year is a new table AND a new setting.
async function readSchoolContext() {
  const [rows] = await pool.query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'academic_year' LIMIT 1"
  );
  return { schoolYear: rows[0]?.setting_value, term: currentTerm(todayLocalDateString()) };
}

// ---------------------------------------------------------------------------
// TEACHER
// ---------------------------------------------------------------------------
// Predicate reused: `GET /api/assignments` for a teacher — `teacher_id = ?`,
// own rows only. The roster count repeats `GET /api/students`'s own class
// matching (grade_level + section VARCHAR, active only), which is what the
// encode screen lists.
//
// "Recorded" counts a student as done when EITHER `term_grade` or
// `descriptive_grade` is present. Grade 1 is descriptive, so its rows carry a
// letter and a NULL `term_grade`; counting only the number would report every
// Grade 1 class as 0 recorded forever. A shell row from POST /api/grades has
// neither and is correctly not counted — it is a row, not a grade.
async function teacherDashboard(userId, schoolYear, term) {
  const [assignments] = await pool.query(
    `SELECT ta.id AS assignment_id, ta.subject_id, ta.grade_level, ta.section,
            s.name AS subject_name
       FROM teacher_assignments ta
       JOIN subjects s ON s.id = ta.subject_id
      WHERE ta.teacher_id = ?
      ORDER BY ta.grade_level ASC, ta.section ASC, s.name ASC`,
    [userId]
  );

  const classes = [];
  for (const row of assignments) {
    const [[roster]] = await pool.query(
      "SELECT COUNT(*) AS n FROM students WHERE grade_level = ? AND section = ? AND status = 'active'",
      [row.grade_level, row.section]
    );
    const [[done]] = await pool.query(
      `SELECT COUNT(DISTINCT g.student_id) AS n
         FROM grades g
         JOIN students st ON st.id = g.student_id
        WHERE g.subject_id = ? AND g.term = ? AND g.school_year = ?
          AND st.grade_level = ? AND st.section = ? AND st.status = 'active'
          AND (g.term_grade IS NOT NULL OR g.descriptive_grade IS NOT NULL)`,
      [row.subject_id, term, schoolYear, row.grade_level, row.section]
    );

    const students = Number(roster.n);
    const recorded = Number(done.n);
    classes.push({
      assignment_id: row.assignment_id,
      subject_id: row.subject_id,
      subject_name: row.subject_name,
      grade_level: row.grade_level,
      section: row.section,
      students,
      recorded,
      // A class with no learners is NOT complete. Vacuous truth would let a
      // teacher's "fully recorded" line reach X of Y with nothing encoded,
      // and the per-class row right below it says "0 students", so the
      // reason is on screen rather than mysterious.
      complete: students > 0 && recorded === students,
    });
  }

  return {
    role: 'teacher',
    school_year: schoolYear,
    term,
    classes,
    classes_complete: classes.filter((c) => c.complete).length,
    classes_total: classes.length,
  };
}

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------
// Each count repeats the predicate of the page the card LINKS TO, so the
// number on the dashboard is the number on the next screen:
//
//   students        GET /api/students        — Admin → Students defaults to
//                                              status=all, so this is all
//   teachers        GET /api/users?role=teacher      — no status filter there
//   active_parents  GET /api/users?role=parent&status=active
//   pending         GET /api/users/parents/pending   — role parent + pending
//
// Getting this wrong is not a rounding error: a card reading 42 that opens a
// list of 37 is a bug report, and the cause would be invisible.
async function adminDashboard(schoolYear, term) {
  const [[students]] = await pool.query('SELECT COUNT(*) AS n FROM students');
  const [[teachers]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE role = 'teacher'");
  const [[parents]] = await pool.query(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'parent' AND status = 'active'"
  );
  const [[pending]] = await pool.query(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'parent' AND status = 'pending'"
  );

  // Lock status as a COUNT for the current term (Darryl, Q3, option b).
  // There is no global lock and no `is_locked` filter on GET /api/grades —
  // `is_locked` is per grade row, so "lock status" can only mean how many of
  // this term's rows are finalized. SUM over a TINYINT comes back as a string
  // or null from mysql2; Number() on null is 0, which is the right answer for
  // "no rows yet".
  const [[locks]] = await pool.query(
    'SELECT COUNT(*) AS total, SUM(is_locked) AS locked FROM grades WHERE school_year = ? AND term = ?',
    [schoolYear, term]
  );

  // THE LOCKOUT HAZARD (Darryl, Q7 — build it). The temporary-password
  // fallback is admin-only AND refuses your own id, and self-service reset
  // needs a CONFIRMED email, so an installation with exactly one active admin
  // whose email is unverified has both routes back in closed at once. The
  // seed ships precisely that. Reported as a flag, never as a message, and
  // never naming an account: the client owns the wording, and there is only
  // one account it could be about.
  const [[admins]] = await pool.query(
    "SELECT COUNT(*) AS n, SUM(email_verified_at IS NULL) AS unverified FROM users WHERE role = 'admin' AND status = 'active'"
  );

  return {
    role: 'admin',
    school_year: schoolYear,
    term,
    totals: {
      students: Number(students.n),
      teachers: Number(teachers.n),
      active_parents: Number(parents.n),
    },
    pending_parents: Number(pending.n),
    grade_locks: { term, locked: Number(locks.locked || 0), total: Number(locks.total) },
    hazard: {
      single_unverified_admin: Number(admins.n) === 1 && Number(admins.unverified || 0) === 1,
    },
  };
}

// ---------------------------------------------------------------------------
// PARENT — amendment A1
// ---------------------------------------------------------------------------
// Same scope as the report card: `users.student_id`, the parent's own learner
// and nothing else. The student id is never taken from a query or a body.
//
// The three rules, decided against the real tables:
//
//   "latest term that has grades"  the greatest term 1..3 in which at least
//     one subject has a grade. DELIBERATELY NOT system_settings.current_term:
//     an admin can advance that before anyone encodes, and the card would
//     then read "Pending — 0 of 8" for a term nobody has started.
//
//   "every subject recorded"  every subject AT THE GRADE LEVEL, including
//     ones with no grade row at all, has a non-null term grade for that term.
//     Both halves matter: a shell row exists with term_grade NULL, so the row
//     existing is not the same as the grade existing.
//
//   the average  the mean of those term grades, rounded by the same roundTo2
//     the report card uses, and RETURNED ONLY WHEN THE TERM IS COMPLETE. When
//     it is not, this returns null and the client cannot render a partial
//     figure even by mistake — the same reason Initial Grade, Final Grade and
//     General Average are all NULL until every input exists. A partial
//     average reads as settled.
//
// Grade 1 / descriptive returns a FLAG AND NO NUMBERS. A descriptive subject
// is null at every computed level because it is inapplicable, not incomplete
// (§3's pending-vs-N/A split), so there is no "N of M" to show either — the
// card's copy is fixed text plus a link, and giving it counts would invite a
// progress bar for something that has no progress.
async function parentDashboard(studentId, schoolYear) {
  if (!studentId) {
    return { role: 'parent', school_year: schoolYear, student_id: null, grades: null };
  }

  const [[student]] = await pool.query('SELECT id, grade_level FROM students WHERE id = ? LIMIT 1', [studentId]);
  if (!student) {
    return { role: 'parent', school_year: schoolYear, student_id: studentId, grades: null };
  }

  const [modeRows] = await pool.query(
    'SELECT mode FROM grading_mode_configs WHERE grade_level = ? AND school_year = ? LIMIT 1',
    [student.grade_level, schoolYear]
  );
  const mode = modeRows[0]?.mode;
  if (!mode) {
    // The report card answers 409 here. A dashboard must not: one unconfigured
    // grade level would blank every other card on the page. The card reports
    // its own gap and the rest of the dashboard renders.
    return {
      role: 'parent',
      school_year: schoolYear,
      student_id: studentId,
      grades: { unavailable: 'grading_mode_not_configured' },
    };
  }

  const [[subjectCount]] = await pool.query('SELECT COUNT(*) AS n FROM subjects WHERE grade_level = ?', [
    student.grade_level,
  ]);
  const subjectsTotal = Number(subjectCount.n);

  if (mode !== 'numerical') {
    return {
      role: 'parent',
      school_year: schoolYear,
      student_id: studentId,
      grades: {
        descriptive: true,
        term: null,
        subjects_recorded: null,
        subjects_total: subjectsTotal,
        complete: null,
        general_average: null,
      },
    };
  }

  // One row per (subject, term) that actually carries a numerical grade.
  // Restricted to subjects at the learner's own grade level, matching the
  // report card's subject list — a stale row for a subject from another
  // grade level must not count towards "recorded".
  const [graded] = await pool.query(
    `SELECT g.term, g.subject_id, g.term_grade
       FROM grades g
       JOIN subjects s ON s.id = g.subject_id AND s.grade_level = ?
      WHERE g.student_id = ? AND g.school_year = ? AND g.term_grade IS NOT NULL`,
    [student.grade_level, studentId, schoolYear]
  );

  const byTerm = new Map();
  for (const row of graded) {
    if (!byTerm.has(row.term)) byTerm.set(row.term, []);
    byTerm.get(row.term).push(Number(row.term_grade));
  }

  let term = null;
  for (const t of byTerm.keys()) {
    if (term === null || t > term) term = t;
  }

  if (term === null) {
    return {
      role: 'parent',
      school_year: schoolYear,
      student_id: studentId,
      grades: {
        descriptive: false,
        term: null,
        subjects_recorded: 0,
        subjects_total: subjectsTotal,
        complete: false,
        general_average: null,
      },
    };
  }

  const values = byTerm.get(term);
  const complete = subjectsTotal > 0 && values.length === subjectsTotal;
  const sum = values.reduce((acc, n) => acc + n, 0);

  return {
    role: 'parent',
    school_year: schoolYear,
    student_id: studentId,
    grades: {
      descriptive: false,
      term,
      subjects_recorded: values.length,
      subjects_total: subjectsTotal,
      complete,
      general_average: complete ? roundTo2(sum / values.length) : null,
    },
  };
}

// Every authenticated role, and the role decides the payload — there is no
// `authorize()` list, because there is no role this endpoint refuses. The
// branch below is exhaustive over users.role.
router.get('/', authenticate, async (req, res) => {
  try {
    const { schoolYear, term } = await readSchoolContext();
    if (!schoolYear) {
      return res
        .status(500)
        .json({ success: false, message: 'academic_year is not configured in system settings.' });
    }
    if (schoolYear !== SCHOOL_YEAR) {
      return res.status(500).json({
        success: false,
        message: `academic_year is ${schoolYear} in system settings but the school calendar is for ${SCHOOL_YEAR}.`,
      });
    }
    const termNumber = term;

    let dashboard;
    if (req.user.role === 'teacher') {
      dashboard = await teacherDashboard(req.user.id, schoolYear, termNumber);
    } else if (req.user.role === 'admin') {
      dashboard = await adminDashboard(schoolYear, termNumber);
    } else {
      dashboard = await parentDashboard(req.user.student_id, schoolYear);
    }

    return res.json({ success: true, dashboard });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ success: false, message: 'Failed to build the dashboard.' });
  }
});

module.exports = router;
