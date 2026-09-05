const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');

const router = express.Router();

function isValidTerm(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 3;
}

// Duplicated from routes/settings.js's validateAcademicYear rather than
// shared — this is only the second place this exact check exists.
// Extract into a shared util if a third place ever needs it, matching
// utils/dateFormat.js's own precedent (extracted only after 3 copies).
function isValidSchoolYear(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const match = value.match(/^(\d{4})-(\d{4})$/);
  if (!match) {
    return false;
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  return second === first + 1;
}

// Grade encoding is the SUBJECT TEACHER's authority via teacher_assignments
// (teacher_id + subject_id + grade_level + section all four must match) —
// not sections.adviser_id, which governs attendance and excuse-letter
// review only. Uses the VARCHAR grade_level/section columns, not
// section_id — see CLAUDE.md's "sections table" note: section_id is
// reserved for exactly two routes (attendance, the unbuilt Class Board),
// neither of which is Grades.
async function teacherCanEncodeGrade(teacherId, subjectId, gradeLevel, section) {
  const [rows] = await pool.query(
    `SELECT 1 FROM teacher_assignments
     WHERE teacher_id = ? AND subject_id = ? AND grade_level = ? AND section = ?
     LIMIT 1`,
    [teacherId, subjectId, gradeLevel, section]
  );
  return rows.length > 0;
}

// POST /api/grades — creates a shell row only: every score and computed
// column stays NULL, is_locked 0. No computation happens here at all —
// utils/gradeComputation.js is not imported in this file; that's G2c/G2d.
// grading_mode_configs is deliberately not consulted here either: a
// Grade 1 row and a Grade 5 row are structurally identical at creation,
// since nothing mode-specific is written yet.
router.post('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { student_id, subject_id, term, school_year } = req.body;

  const studentId = parseId(student_id);
  if (studentId === null) {
    return res.status(400).json({ success: false, message: 'student_id must be a positive integer.' });
  }

  const subjectId = parseId(subject_id);
  if (subjectId === null) {
    return res.status(400).json({ success: false, message: 'subject_id must be a positive integer.' });
  }

  if (!isValidTerm(term)) {
    return res.status(400).json({ success: false, message: 'term must be 1, 2, or 3.' });
  }
  const termNum = Number(term);

  if (!isValidSchoolYear(school_year)) {
    return res.status(400).json({
      success: false,
      message: 'school_year must match YYYY-YYYY with consecutive years (e.g. 2026-2027).',
    });
  }

  try {
    // Checked before touching the student at all — subjects are unscoped
    // reference data, so this leaks nothing role-sensitive either way.
    const [subjectRows] = await pool.query('SELECT * FROM subjects WHERE id = ? LIMIT 1', [subjectId]);
    const subject = subjectRows[0];
    if (!subject) {
      return res.status(400).json({ success: false, message: 'subject_id does not reference an existing subject.' });
    }

    const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [studentId]);
    const student = studentRows[0];

    if (req.user.role === 'admin') {
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
    } else {
      // Collapse "student doesn't exist" and "exists but out of scope"
      // into the same 403 — matching POST /api/attendance's identical
      // reasoning: a teacher probing student ids shouldn't be able to
      // tell which. The message names the SUBJECT specifically (the
      // teacher supplied subject_id themselves, so echoing it back
      // leaks nothing) but stays generic about grade/section — a real
      // student's actual grade and section are not this teacher's to
      // learn just by probing.
      const allowed =
        student && (await teacherCanEncodeGrade(req.user.id, subjectId, student.grade_level, student.section));
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: `You are not assigned to teach ${subject.name} for this student's grade level and section.`,
        });
      }
    }

    // SECURITY-MOTIVATED ORDERING — do not move this check earlier, even
    // though it looks like a cheap, obvious validation to run first. It
    // runs only after the block above has already confirmed (for a
    // teacher) that this teacher is authorized to act on this specific
    // student, or (for admin) that the student exists at all. Checking
    // subject.grade_level against student.grade_level any sooner would
    // let an unauthorized, out-of-scope teacher learn a real student's
    // actual grade level just by probing with a deliberately wrong
    // subject_id and reading the resulting error message — exactly the
    // enumeration the collapsed 403 above exists to prevent. A future
    // session reordering this "for efficiency" would silently reopen it.
    if (subject.grade_level !== student.grade_level) {
      return res.status(400).json({
        success: false,
        message: `This subject is offered at Grade ${subject.grade_level}, but this student is in Grade ${student.grade_level}.`,
      });
    }

    if (student.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot create a grade record for an inactive student.' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM grades WHERE student_id = ? AND subject_id = ? AND term = ? AND school_year = ? LIMIT 1',
      [studentId, subjectId, termNum, school_year]
    );
    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: 'A grade record already exists for this student, subject, term, and school year.',
      });
    }

    const [result] = await pool.query(
      'INSERT INTO grades (student_id, subject_id, term, school_year) VALUES (?, ?, ?, ?)',
      [studentId, subjectId, termNum, school_year]
    );

    const [rows] = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [result.insertId]);
    await logActivity(
      req.user.id,
      'create_grade',
      `Created grade record for student #${studentId}, subject #${subjectId}, term ${termNum}, ${school_year}`
    );

    return res.status(201).json({ success: true, message: 'Grade record created.', grade: rows[0] });
  } catch (error) {
    console.error('Create grade error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create grade record.' });
  }
});

module.exports = router;
