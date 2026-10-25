const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { refuseNul } = require('../utils/requestLimits');

const router = express.Router();
router.use(refuseNul);

// Third copy of the YYYY-YYYY consecutive-year check (settings.js
// validateAcademicYear, grades.js isValidSchoolYear). Extract into a
// shared util the next time a fourth place needs it — matching
// utils/dateFormat.js (extracted at three, not two).
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

// GET /api/grading-modes — any authenticated role.
// Not a system_settings key. That table is a five-key flat allow-list;
// grading_mode_configs is keyed (grade_level, school_year) and exists
// specifically because a flat store cannot express that lookup. A missing
// row is 409, the same status both existing readers in routes/grades.js
// already use (write preflight and GET /student/:studentId). Do not
// invent 404 or an empty success for the same condition.
router.get('/', authenticate, async (req, res) => {
  const { grade_level, school_year } = req.query;

  if (grade_level === undefined) {
    return res.status(400).json({
      success: false,
      message: 'grade_level is required and must be between 1 and 6.',
    });
  }
  const n = Number(grade_level);
  if (!Number.isInteger(n) || n < 1 || n > 6) {
    return res.status(400).json({
      success: false,
      message: 'grade_level is required and must be between 1 and 6.',
    });
  }

  try {
    let schoolYear = school_year;
    if (schoolYear === undefined) {
      const { rows: settingRows } = await pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'academic_year' LIMIT 1"
      );
      schoolYear = settingRows[0]?.setting_value;
      if (!schoolYear) {
        return res.status(500).json({
          success: false,
          message: 'academic_year is not configured in system settings.',
        });
      }
    } else if (!isValidSchoolYear(schoolYear)) {
      return res.status(400).json({
        success: false,
        message: 'school_year must match YYYY-YYYY with consecutive years (e.g. 2026-2027).',
      });
    }

    const { rows: modeRows } = await pool.query(
      'SELECT mode FROM grading_mode_configs WHERE grade_level = ? AND school_year = ? LIMIT 1',
      [n, schoolYear]
    );
    const modeConfig = modeRows[0];
    if (!modeConfig) {
      return res.status(409).json({
        success: false,
        message: `No grading_mode_configs row exists for Grade ${n}, school year ${schoolYear}. An admin must configure the grading mode before this can be recorded.`,
      });
    }

    // Wrapper key `grading_mode` is an OBJECT here { grade_level, school_year, mode }.
    // GET /grades/student/:studentId uses the same key as a STRING. Two
    // shapes, two endpoints — same catalog hazard as `subjects`. Callers
    // must declare unwrap accordingly; do not "flatten" this to a string
    // to match the report card.
    return res.json({
      success: true,
      grading_mode: {
        grade_level: n,
        school_year: schoolYear,
        mode: modeConfig.mode,
      },
    });
  } catch (error) {
    console.error('Get grading mode error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch grading mode.' });
  }
});

module.exports = router;
