const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');

const router = express.Router();

// Shared by GET /:id and the PATCH re-fetch — a correlated subquery for
// student_count instead of a JOIN + GROUP BY: joining students directly
// would fan out (a section has many), and whether the adviser join's
// u.name is safely functionally-dependent under MySQL 8's
// ONLY_FULL_GROUP_BY is exactly the kind of subtle GROUP BY question this
// codebase already rejected once (see the Messages module's window
// function vs. GROUP BY + MAX(created_at) in CLAUDE.md). A subquery has
// no fan-out and no ambiguity — 23 sections total, so running it per row
// costs nothing.
const SECTION_DETAIL_SQL = `
  SELECT sec.id, sec.name, sec.grade_level, sec.adviser_id, sec.school_year,
         sec.created_at, sec.updated_at,
         u.name AS adviser_name,
         (SELECT COUNT(*) FROM students st WHERE st.section_id = sec.id) AS student_count
  FROM sections sec
  LEFT JOIN users u ON u.id = sec.adviser_id
  WHERE sec.id = ?
  LIMIT 1
`;

// student_count is COUNT(*) — bigint on PostgreSQL, a JSON number through
// config/db.js's int8 parser, as it was on MySQL.
async function fetchSectionDetail(id) {
  const { rows } = await pool.query(SECTION_DETAIL_SQL, [id]);
  return rows[0];
}

// GET /api/sections — all roles. Sections are unscoped reference data (no
// per-role restriction, matching routes/settings.js's GET / pattern) —
// not "each role sees their own," everyone sees the same 23.
router.get('/', authenticate, async (req, res) => {
  const { grade_level, school_year } = req.query;

  const conditions = [];
  const params = [];

  if (grade_level !== undefined) {
    const n = Number(grade_level);
    if (!Number.isInteger(n) || n < 1 || n > 6) {
      return res.status(400).json({ success: false, message: 'grade_level must be between 1 and 6.' });
    }
    conditions.push('sec.grade_level = ?');
    params.push(n);
  }

  if (school_year !== undefined) {
    conditions.push('sec.school_year = ?');
    params.push(String(school_year).trim());
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT sec.id, sec.name, sec.grade_level, sec.adviser_id, sec.school_year,
              sec.created_at, sec.updated_at,
              u.name AS adviser_name,
              (SELECT COUNT(*) FROM students st WHERE st.section_id = sec.id) AS student_count
       FROM sections sec
       LEFT JOIN users u ON u.id = sec.adviser_id
       ${where}
       ORDER BY sec.grade_level, sec.name`,
      params
    );

    return res.json({ success: true, sections: rows });
  } catch (error) {
    console.error('List sections error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch sections.' });
  }
});

// GET /api/sections/:id — all roles, unscoped. 404 only for a genuinely
// nonexistent id — there is no "wrong role for this section" case.
router.get('/:id', authenticate, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid section id.' });
  }

  try {
    const section = await fetchSectionDetail(id);
    if (!section) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }
    return res.json({ success: true, section });
  } catch (error) {
    console.error('Get section error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch section.' });
  }
});

// PATCH /api/sections/:id/adviser — admin only. This is what makes the 21
// currently-unassigned sections usable, since attendance scoping now
// depends on sections.adviser_id. No POST/DELETE — the 23 sections are
// fixed for the school year.
router.patch('/:id/adviser', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid section id.' });
  }

  if (req.body.adviser_id === undefined) {
    return res.status(400).json({
      success: false,
      message: "adviser_id is required — provide a teacher's user id, or null to clear the adviser.",
    });
  }

  const { adviser_id } = req.body;
  let adviserId = null;

  if (adviser_id !== null) {
    adviserId = parseId(adviser_id);
    if (adviserId === null) {
      return res.status(400).json({
        success: false,
        message: 'adviser_id must be a positive integer, or null to clear the adviser.',
      });
    }
  }

  try {
    const { rows: sectionRows } = await pool.query('SELECT * FROM sections WHERE id = ? LIMIT 1', [id]);
    const section = sectionRows[0];
    if (!section) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    // adviser_id: null clears it — skip the existence/role/status checks
    // entirely, there's nothing to validate against.
    if (adviserId !== null) {
      const { rows: userRows } = await pool.query('SELECT id, role, status FROM users WHERE id = ? LIMIT 1', [adviserId]);
      const user = userRows[0];

      if (!user) {
        return res.status(400).json({ success: false, message: 'adviser_id does not reference an existing user.' });
      }
      // A teacher may already advise another section — that's allowed,
      // not checked here. Only identity, role, and status are validated.
      if (user.role !== 'teacher') {
        return res.status(400).json({
          success: false,
          message: `adviser_id must reference a user with role 'teacher' (found role '${user.role}').`,
        });
      }
      if (user.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: `adviser_id must reference an active teacher account (this one is '${user.status}').`,
        });
      }
    }

    await pool.query('UPDATE sections SET adviser_id = ? WHERE id = ?', [adviserId, id]);

    const updated = await fetchSectionDetail(id);

    await logActivity(
      req.user.id,
      'update_section_adviser',
      `Set adviser for section #${id} (${section.name}, Grade ${section.grade_level}) from ${
        section.adviser_id ?? 'none'
      } to ${adviserId ?? 'none'}`
    );

    return res.json({ success: true, message: 'Section adviser updated.', section: updated });
  } catch (error) {
    console.error('Update section adviser error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update section adviser.' });
  }
});

module.exports = router;
