const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { isValidDateFormat, todayLocalDateString } = require('../utils/dateFormat');
const { readListParams, pageMeta } = require('../utils/pagination');
const { refuseNul } = require('../utils/requestLimits');
const {
  announcementAudience,
  memoAudience,
  eventAudience,
  insertNotifications,
  removeItemNotifications,
  emitNotifications,
} = require('../utils/notify');

// ONE DELETE, ITS NOTIFICATIONS WITH IT (fix/server-reliability, 2026-09-30).
// The item row and every notification about it go in ONE transaction, and
// after the commit each recipient gets `notification_counts` — so a bell or a
// badge that counted the item refetches instead of showing "1 unread" over an
// empty list (KNOWN ISSUES A2). `table` is one of three constants below,
// never request input.
async function deleteWithNotifications(req, table, itemType, id) {
  const conn = await pool.connect();
  let recipients = [];
  try {
    await conn.beginTransaction();
    recipients = await removeItemNotifications(conn, itemType, id);
    await conn.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
  emitNotifications(req, recipients);
}

function isValidGradeLevel(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

function isMoreThanOneYearAhead(dateStr) {
  const [y, m, d] = todayLocalDateString().split('-').map(Number);
  const maxYear = y + 1;
  const max = `${maxYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return dateStr > max;
}

async function getStudentClass(studentId) {
  const { rows } = await pool.query('SELECT grade_level, section FROM students WHERE id = ? LIMIT 1', [studentId]);
  return rows[0] || null;
}

// Assigned to teach that grade+section, OR its adviser.
//
// THIS WIDENS A WRITE GATE, deliberately — unlike routes/students.js, where the
// equivalent widening was confined to reads on purpose. The reason is a stated
// school requirement rather than symmetry: the Class Board is a section-scoped
// announcement (teacher posts, every parent in the section reads), and an
// adviser who cannot post to their own advisory section cannot deliver it. An
// adviser holding zero subject assignments in their own section was locked out
// entirely — TCH-002 is exactly that account, which is what moved this edge
// case from "theoretical" to demonstrated.
//
// It stays inside the existing grant and grants nothing new in kind: a teacher
// still cannot post school-wide (admin-only), still cannot post whole-grade,
// and still cannot name a section they neither teach nor advise. The only
// change is that "connected to this section" now means assigned OR adviser,
// which is the same definition every other module already uses.
//
// Matches sections by grade_level + name rather than section_id: there is no
// student row in a content query to resolve a section_id from, which is also
// why utils/teacherScope.js's TEACHER_VIEW_SCOPE_SQL cannot be reused here.
async function teacherHasAssignment(teacherId, gradeLevel, section) {
  const { rows } = await pool.query(
    `SELECT 1 FROM teacher_assignments
     WHERE teacher_id = ? AND grade_level = ? AND section = ?
     LIMIT 1`,
    [teacherId, gradeLevel, section]
  );
  if (rows.length) return true;

  const { rows: adviserRows } = await pool.query(
    `SELECT 1 FROM sections
     WHERE grade_level = ? AND name = ? AND adviser_id = ?
     LIMIT 1`,
    [gradeLevel, section, teacherId]
  );
  return adviserRows.length > 0;
}

// Any assignment in that grade, OR adviser of any section in it. Events have no
// target_section column, so this is grade-level by the schema's own design.
//
// The adviser leg is NOT a broader class of grant than what already existed:
// this helper already lets a teacher with a single assignment in one section of
// a grade post an event to that whole grade. An adviser of one section in the
// grade is the same relationship expressed the other way, so admitting them is
// consistency, not expansion.
async function teacherHasGradeAssignment(teacherId, gradeLevel) {
  const { rows } = await pool.query(
    'SELECT 1 FROM teacher_assignments WHERE teacher_id = ? AND grade_level = ? LIMIT 1',
    [teacherId, gradeLevel]
  );
  if (rows.length) return true;

  const { rows: adviserRows } = await pool.query(
    'SELECT 1 FROM sections WHERE grade_level = ? AND adviser_id = ? LIMIT 1',
    [gradeLevel, teacherId]
  );
  return adviserRows.length > 0;
}

// Resolves + validates the (target_grade, target_section) a writer is allowed to use.
// Admin: anything, including both NULL (school-wide). Teacher: must name an exact
// grade+section they are assigned to — school-wide and whole-grade posts are admin-only.
async function resolveAnnouncementTarget(user, targetGradeInput, targetSectionInput) {
  if (user.role === 'admin') {
    let gradeLevel = null;
    let section = null;
    if (targetGradeInput !== undefined && targetGradeInput !== null) {
      if (!isValidGradeLevel(targetGradeInput)) {
        return { ok: false, status: 400, message: 'target_grade must be between 1 and 6.' };
      }
      gradeLevel = Number(targetGradeInput);
    }
    if (targetSectionInput !== undefined && targetSectionInput !== null && String(targetSectionInput).trim()) {
      section = String(targetSectionInput).trim();
    }
    if (section !== null && gradeLevel === null) {
      return { ok: false, status: 400, message: 'target_section requires target_grade.' };
    }
    return { ok: true, gradeLevel, section };
  }

  if (targetGradeInput === undefined || targetGradeInput === null) {
    return {
      ok: false,
      status: 403,
      message: 'School-wide announcements are admin-only. Specify a target_grade and target_section you are assigned to.',
    };
  }
  if (!isValidGradeLevel(targetGradeInput)) {
    return { ok: false, status: 400, message: 'target_grade must be between 1 and 6.' };
  }
  if (!targetSectionInput || !String(targetSectionInput).trim()) {
    return {
      ok: false,
      status: 403,
      message: 'Whole-grade announcements are admin-only. Specify the exact grade and section you are assigned to.',
    };
  }

  const gradeLevel = Number(targetGradeInput);
  const section = String(targetSectionInput).trim();
  const allowed = await teacherHasAssignment(user.id, gradeLevel, section);
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      // True for both legs (assigned and adviser) without naming the mechanism.
      message: `You are not connected to Grade ${gradeLevel} - ${section}. You may only post announcements to a section you teach or advise.`,
    };
  }
  return { ok: true, gradeLevel, section };
}

// Same idea for events, minus section — the events table has no target_section column.
async function resolveEventTarget(user, targetGradeInput) {
  if (user.role === 'admin') {
    if (targetGradeInput !== undefined && targetGradeInput !== null) {
      if (!isValidGradeLevel(targetGradeInput)) {
        return { ok: false, status: 400, message: 'target_grade must be between 1 and 6.' };
      }
      return { ok: true, gradeLevel: Number(targetGradeInput) };
    }
    return { ok: true, gradeLevel: null };
  }

  if (targetGradeInput === undefined || targetGradeInput === null) {
    return {
      ok: false,
      status: 403,
      message: 'School-wide events are admin-only. Specify a target_grade you are assigned to.',
    };
  }
  if (!isValidGradeLevel(targetGradeInput)) {
    return { ok: false, status: 400, message: 'target_grade must be between 1 and 6.' };
  }
  const gradeLevel = Number(targetGradeInput);
  const allowed = await teacherHasGradeAssignment(user.id, gradeLevel);
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      message: `You are not connected to Grade ${gradeLevel}. You may only post events to a grade you teach in or advise a section of.`,
    };
  }
  return { ok: true, gradeLevel };
}

// ---------------------------------------------------------------------------
// Announcements — target_grade + target_section, both nullable (NULL = school-wide)
// ---------------------------------------------------------------------------

const announcementsRouter = express.Router();
announcementsRouter.use(refuseNul);

announcementsRouter.get('/', authenticate, async (req, res) => {
  const { category, grade_level, section } = req.query;
  const conditions = [];
  const params = [];

  // `category` is the one NULL-able sort key here. MySQL put NULLs first
  // ascending and last descending; PostgreSQL does the opposite. The
  // pagination helper appends the direction to each column, so the NULL test
  // leads the key: false (NULL) sorts first ascending and last descending —
  // the order MySQL returned.
  const list = readListParams(req.query, {
    sortable: {
      title: 'a.title',
      posted_by_name: 'u.name',
      created_at: 'a.created_at',
      category: '(a.category IS NOT NULL), a.category',
    },
    defaultOrderBy: 'a.created_at DESC',
    tiebreaker: 'a.id DESC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    if (req.user.role === 'parent') {
      const student = await getStudentClass(req.user.student_id);
      if (!student) {
        return res.json({
          success: true,
          announcements: [],
          page: pageMeta({ limit: list.limit, offset: list.offset, total: 0 }),
        });
      }
      conditions.push(
        '(a.target_grade IS NULL OR (a.target_grade = ? AND (a.target_section IS NULL OR a.target_section = ?)))'
      );
      params.push(student.grade_level, student.section);
    } else if (req.user.role === 'teacher') {
      // School-wide, plus anything targeting a grade+section this teacher is
      // assigned to OR advises. The adviser leg mirrors the write gate above so
      // a teacher can always read back what they are allowed to post.
      conditions.push(`(a.target_grade IS NULL OR EXISTS (
        SELECT 1 FROM teacher_assignments ta
        WHERE ta.teacher_id = ? AND ta.grade_level = a.target_grade
          AND (a.target_section IS NULL OR a.target_section = ta.section)
      ) OR EXISTS (
        SELECT 1 FROM sections sec
        WHERE sec.adviser_id = ? AND sec.grade_level = a.target_grade
          AND (a.target_section IS NULL OR a.target_section = sec.name)
      ))`);
      params.push(req.user.id, req.user.id);
    }
    // admin: no condition

    if (category) {
      // utf8mb4_unicode_ci made this equality case- and accent-insensitive;
      // category is not one of the nine portal.ci columns, so the collation is
      // named here (equality on a nondeterministic collation is allowed;
      // trailing spaces are significant, 02 §D decision 2).
      conditions.push('a.category COLLATE portal.ci = ?');
      params.push(String(category).trim());
    }
    if (grade_level !== undefined) {
      if (!isValidGradeLevel(grade_level)) {
        return res.status(400).json({ success: false, message: 'grade_level must be between 1 and 6.' });
      }
      conditions.push('a.target_grade = ?');
      params.push(Number(grade_level));
    }
    if (section) {
      conditions.push('a.target_section = ?');
      params.push(String(section).trim());
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // posted_by stays — PUT/DELETE authorize on the numeric id. posted_by_name
    // is display-only (users.name). INNER JOIN: posted_by is NOT NULL with
    // ON DELETE RESTRICT, so a missing poster cannot exist. Written longhand
    // at all nine returning SELECTs (3 list + 3 POST + 3 PUT); load-existing
    // for PUT/DELETE stays SELECT * and is not returned to a caller.
    const fromClause = `FROM announcements a
       INNER JOIN users u ON u.id = a.posted_by
       ${where}`;
    const {
      rows: [{ total }],
    } = await pool.query(`SELECT COUNT(*) AS total ${fromClause}`, params);
    const { rows } = await pool.query(
      `SELECT a.*, u.name AS posted_by_name
       ${fromClause}
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [...params, list.limit, list.offset]
    );

    return res.json({ success: true, announcements: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
  } catch (error) {
    console.error('List announcements error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch announcements.' });
  }
});

announcementsRouter.post('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { title, content, category, target_grade, target_section, attachment_url } = req.body;

  if (!title || !content) {
    return res.status(400).json({ success: false, message: 'title and content are required.' });
  }

  const target = await resolveAnnouncementTarget(req.user, target_grade, target_section);
  if (!target.ok) {
    return res.status(target.status).json({ success: false, message: target.message });
  }

  try {
    const { rows: inserted } = await pool.query(
      `INSERT INTO announcements (title, content, category, target_grade, target_section, attachment_url, posted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [title, content, category || null, target.gradeLevel, target.section, attachment_url || null, req.user.id]
    );

    const { rows } = await pool.query(
      `SELECT a.*, u.name AS posted_by_name
       FROM announcements a
       INNER JOIN users u ON u.id = a.posted_by
       WHERE a.id = ? LIMIT 1`,
      [inserted[0].id]
    );
    await logActivity(req.user.id, 'create_announcement', `Posted announcement "${title}"`);

    // Fan-out is best effort, exactly like logActivity above it: the thing
    // this describes is already written and logged, so a failure here must
    // not turn a successful post into a 500. Emit only after the write.
    try {
      const audience = await announcementAudience(pool, rows[0]);
      const notified = await insertNotifications(pool, {
        type: 'announcement',
        itemType: 'announcement',
        itemId: rows[0].id,
        actorId: req.user.id,
        titleSnapshot: rows[0].title,
        userIds: audience,
      });
      emitNotifications(req, notified);
    } catch (notifyError) {
      console.error('Announcement notification fan-out failed:', notifyError);
    }

    return res.status(201).json({ success: true, message: 'Announcement posted.', announcement: rows[0] });
  } catch (error) {
    console.error('Create announcement error:', error);
    return res.status(500).json({ success: false, message: 'Failed to post announcement.' });
  }
});

announcementsRouter.put('/:id', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid announcement id.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM announcements WHERE id = ? LIMIT 1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }
    if (req.user.role !== 'admin' && existing.posted_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You may only edit your own announcements.' });
    }

    const { title, content, category, target_grade, target_section, attachment_url } = req.body;
    const nextTitle = title !== undefined ? title : existing.title;
    const nextContent = content !== undefined ? content : existing.content;
    const nextCategory = category !== undefined ? category || null : existing.category;
    const nextAttachment = attachment_url !== undefined ? attachment_url || null : existing.attachment_url;
    const nextTargetGrade = target_grade !== undefined ? target_grade : existing.target_grade;
    const nextTargetSection = target_section !== undefined ? target_section : existing.target_section;

    if (!nextTitle || !nextContent) {
      return res.status(400).json({ success: false, message: 'title and content are required.' });
    }

    const target = await resolveAnnouncementTarget(req.user, nextTargetGrade, nextTargetSection);
    if (!target.ok) {
      return res.status(target.status).json({ success: false, message: target.message });
    }

    await pool.query(
      `UPDATE announcements
       SET title = ?, content = ?, category = ?, target_grade = ?, target_section = ?, attachment_url = ?
       WHERE id = ?`,
      [nextTitle, nextContent, nextCategory, target.gradeLevel, target.section, nextAttachment, id]
    );

    const { rows: updated } = await pool.query(
      `SELECT a.*, u.name AS posted_by_name
       FROM announcements a
       INNER JOIN users u ON u.id = a.posted_by
       WHERE a.id = ? LIMIT 1`,
      [id]
    );
    await logActivity(req.user.id, 'update_announcement', `Updated announcement "${nextTitle}" (#${id})`);

    return res.json({ success: true, message: 'Announcement updated.', announcement: updated[0] });
  } catch (error) {
    console.error('Update announcement error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update announcement.' });
  }
});

announcementsRouter.delete('/:id', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid announcement id.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM announcements WHERE id = ? LIMIT 1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }
    if (req.user.role !== 'admin' && existing.posted_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You may only delete your own announcements.' });
    }

    // Hard delete — this table has no status column. Log the title before it's
    // gone so activity_logs still has a record of what existed.
    await deleteWithNotifications(req, 'announcements', 'announcement', id);
    await logActivity(req.user.id, 'delete_announcement', `Deleted announcement "${existing.title}" (#${id})`);

    return res.json({ success: true, message: 'Announcement deleted.' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete announcement.' });
  }
});

// ---------------------------------------------------------------------------
// Memos — no targeting, no category. School-wide by design (schema has no
// target_grade/target_section/category columns on this table).
// ---------------------------------------------------------------------------

const memosRouter = express.Router();
memosRouter.use(refuseNul);

memosRouter.get('/', authenticate, async (req, res) => {
  const list = readListParams(req.query, {
    sortable: { title: 'm.title', posted_by_name: 'u.name', created_at: 'm.created_at' },
    defaultOrderBy: 'm.created_at DESC',
    tiebreaker: 'm.id DESC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    // m.* is the same column set SELECT * used to return (id, title, content,
    // attachment_url, posted_by, created_at). Alias required so the JOIN
    // cannot collide posted_by with u.id.
    const {
      rows: [{ total }],
    } = await pool.query('SELECT COUNT(*) AS total FROM memos');
    const { rows } = await pool.query(
      `SELECT m.*, u.name AS posted_by_name
       FROM memos m
       INNER JOIN users u ON u.id = m.posted_by
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [list.limit, list.offset]
    );
    return res.json({ success: true, memos: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
  } catch (error) {
    console.error('List memos error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch memos.' });
  }
});

memosRouter.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { title, content, attachment_url } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, message: 'title and content are required.' });
  }

  try {
    const { rows: inserted } = await pool.query(
      'INSERT INTO memos (title, content, attachment_url, posted_by) VALUES (?, ?, ?, ?) RETURNING id',
      [title, content, attachment_url || null, req.user.id]
    );

    const { rows } = await pool.query(
      `SELECT m.*, u.name AS posted_by_name
       FROM memos m
       INNER JOIN users u ON u.id = m.posted_by
       WHERE m.id = ? LIMIT 1`,
      [inserted[0].id]
    );
    await logActivity(req.user.id, 'create_memo', `Posted memo "${title}"`);

    // Fan-out is best effort, exactly like logActivity above it: the thing
    // this describes is already written and logged, so a failure here must
    // not turn a successful post into a 500. Emit only after the write.
    try {
      const audience = await memoAudience(pool);
      const notified = await insertNotifications(pool, {
        type: 'memo',
        itemType: 'memo',
        itemId: rows[0].id,
        actorId: req.user.id,
        titleSnapshot: rows[0].title,
        userIds: audience,
      });
      emitNotifications(req, notified);
    } catch (notifyError) {
      console.error('Memo notification fan-out failed:', notifyError);
    }

    return res.status(201).json({ success: true, message: 'Memo posted.', memo: rows[0] });
  } catch (error) {
    console.error('Create memo error:', error);
    return res.status(500).json({ success: false, message: 'Failed to post memo.' });
  }
});

memosRouter.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid memo id.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM memos WHERE id = ? LIMIT 1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Memo not found.' });
    }

    const { title, content, attachment_url } = req.body;
    const nextTitle = title !== undefined ? title : existing.title;
    const nextContent = content !== undefined ? content : existing.content;
    const nextAttachment = attachment_url !== undefined ? attachment_url || null : existing.attachment_url;

    if (!nextTitle || !nextContent) {
      return res.status(400).json({ success: false, message: 'title and content are required.' });
    }

    await pool.query('UPDATE memos SET title = ?, content = ?, attachment_url = ? WHERE id = ?', [
      nextTitle,
      nextContent,
      nextAttachment,
      id,
    ]);

    const { rows: updated } = await pool.query(
      `SELECT m.*, u.name AS posted_by_name
       FROM memos m
       INNER JOIN users u ON u.id = m.posted_by
       WHERE m.id = ? LIMIT 1`,
      [id]
    );
    await logActivity(req.user.id, 'update_memo', `Updated memo "${nextTitle}" (#${id})`);

    return res.json({ success: true, message: 'Memo updated.', memo: updated[0] });
  } catch (error) {
    console.error('Update memo error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update memo.' });
  }
});

memosRouter.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid memo id.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM memos WHERE id = ? LIMIT 1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Memo not found.' });
    }

    await deleteWithNotifications(req, 'memos', 'memo', id);
    await logActivity(req.user.id, 'delete_memo', `Deleted memo "${existing.title}" (#${id})`);

    return res.json({ success: true, message: 'Memo deleted.' });
  } catch (error) {
    console.error('Delete memo error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete memo.' });
  }
});

// ---------------------------------------------------------------------------
// Events — target_grade only (no target_section column in this table)
// ---------------------------------------------------------------------------

const eventsRouter = express.Router();
eventsRouter.use(refuseNul);

eventsRouter.get('/', authenticate, async (req, res) => {
  const { grade_level, from, to } = req.query;
  const conditions = [];
  const params = [];

  const list = readListParams(req.query, {
    sortable: { title: 'e.title', event_date: 'e.event_date', posted_by_name: 'u.name', created_at: 'e.created_at' },
    defaultOrderBy: 'e.event_date DESC',
    tiebreaker: 'e.id DESC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    if (req.user.role === 'parent') {
      const student = await getStudentClass(req.user.student_id);
      if (!student) {
        return res.json({ success: true, events: [], page: pageMeta({ limit: list.limit, offset: list.offset, total: 0 }) });
      }
      conditions.push('(e.target_grade IS NULL OR e.target_grade = ?)');
      params.push(student.grade_level);
    } else if (req.user.role === 'teacher') {
      // Same two legs as the announcements filter, minus the section match —
      // the events table has no target_section column.
      conditions.push(`(e.target_grade IS NULL OR EXISTS (
        SELECT 1 FROM teacher_assignments ta WHERE ta.teacher_id = ? AND ta.grade_level = e.target_grade
      ) OR EXISTS (
        SELECT 1 FROM sections sec WHERE sec.adviser_id = ? AND sec.grade_level = e.target_grade
      ))`);
      params.push(req.user.id, req.user.id);
    }

    if (grade_level !== undefined) {
      if (!isValidGradeLevel(grade_level)) {
        return res.status(400).json({ success: false, message: 'grade_level must be between 1 and 6.' });
      }
      conditions.push('e.target_grade = ?');
      params.push(Number(grade_level));
    }
    if (from) {
      if (!isValidDateFormat(from)) {
        return res.status(400).json({ success: false, message: 'from must be in YYYY-MM-DD format.' });
      }
      conditions.push('e.event_date >= ?');
      params.push(from);
    }
    if (to) {
      if (!isValidDateFormat(to)) {
        return res.status(400).json({ success: false, message: 'to must be in YYYY-MM-DD format.' });
      }
      conditions.push('e.event_date <= ?');
      params.push(to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const fromClause = `FROM events e
       INNER JOIN users u ON u.id = e.posted_by
       ${where}`;
    const {
      rows: [{ total }],
    } = await pool.query(`SELECT COUNT(*) AS total ${fromClause}`, params);
    const { rows } = await pool.query(
      `SELECT e.*, u.name AS posted_by_name
       ${fromClause}
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [...params, list.limit, list.offset]
    );

    return res.json({ success: true, events: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
  } catch (error) {
    console.error('List events error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch events.' });
  }
});

eventsRouter.post('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { title, description, event_date, target_grade } = req.body;

  if (!title || !event_date) {
    return res.status(400).json({ success: false, message: 'title and event_date are required.' });
  }
  if (!isValidDateFormat(event_date)) {
    return res.status(400).json({ success: false, message: 'event_date must be in YYYY-MM-DD format.' });
  }
  if (isMoreThanOneYearAhead(event_date)) {
    return res.status(400).json({ success: false, message: 'event_date cannot be more than one year in the future.' });
  }

  const target = await resolveEventTarget(req.user, target_grade);
  if (!target.ok) {
    return res.status(target.status).json({ success: false, message: target.message });
  }

  try {
    const { rows: inserted } = await pool.query(
      'INSERT INTO events (title, description, event_date, target_grade, posted_by) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [title, description || null, event_date, target.gradeLevel, req.user.id]
    );

    const { rows } = await pool.query(
      `SELECT e.*, u.name AS posted_by_name
       FROM events e
       INNER JOIN users u ON u.id = e.posted_by
       WHERE e.id = ? LIMIT 1`,
      [inserted[0].id]
    );
    await logActivity(req.user.id, 'create_event', `Posted event "${title}" on ${event_date}`);

    // Fan-out is best effort, exactly like logActivity above it: the thing
    // this describes is already written and logged, so a failure here must
    // not turn a successful post into a 500. Emit only after the write.
    try {
      const audience = await eventAudience(pool, rows[0]);
      const notified = await insertNotifications(pool, {
        type: 'event',
        itemType: 'event',
        itemId: rows[0].id,
        actorId: req.user.id,
        titleSnapshot: rows[0].title,
        userIds: audience,
      });
      emitNotifications(req, notified);
    } catch (notifyError) {
      console.error('Event notification fan-out failed:', notifyError);
    }

    return res.status(201).json({ success: true, message: 'Event posted.', event: rows[0] });
  } catch (error) {
    console.error('Create event error:', error);
    return res.status(500).json({ success: false, message: 'Failed to post event.' });
  }
});

eventsRouter.put('/:id', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid event id.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM events WHERE id = ? LIMIT 1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    if (req.user.role !== 'admin' && existing.posted_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You may only edit your own events.' });
    }

    const { title, description, event_date, target_grade } = req.body;
    const nextTitle = title !== undefined ? title : existing.title;
    const nextDescription = description !== undefined ? description || null : existing.description;
    // existing.event_date is already a plain 'YYYY-MM-DD' string — the DATE
    // type parser in config/db.js (mysql2's dateStrings: ['DATE'] job) means
    // DATE columns never come back as JS Date objects, so no conversion is
    // needed (or safe to reintroduce) here.
    const nextEventDate = event_date !== undefined ? event_date : existing.event_date;
    const nextTargetGrade = target_grade !== undefined ? target_grade : existing.target_grade;

    if (!nextTitle) {
      return res.status(400).json({ success: false, message: 'title is required.' });
    }
    if (!isValidDateFormat(nextEventDate)) {
      return res.status(400).json({ success: false, message: 'event_date must be in YYYY-MM-DD format.' });
    }
    if (isMoreThanOneYearAhead(nextEventDate)) {
      return res.status(400).json({ success: false, message: 'event_date cannot be more than one year in the future.' });
    }

    const target = await resolveEventTarget(req.user, nextTargetGrade);
    if (!target.ok) {
      return res.status(target.status).json({ success: false, message: target.message });
    }

    await pool.query('UPDATE events SET title = ?, description = ?, event_date = ?, target_grade = ? WHERE id = ?', [
      nextTitle,
      nextDescription,
      nextEventDate,
      target.gradeLevel,
      id,
    ]);

    const { rows: updated } = await pool.query(
      `SELECT e.*, u.name AS posted_by_name
       FROM events e
       INNER JOIN users u ON u.id = e.posted_by
       WHERE e.id = ? LIMIT 1`,
      [id]
    );
    await logActivity(req.user.id, 'update_event', `Updated event "${nextTitle}" (#${id})`);

    return res.json({ success: true, message: 'Event updated.', event: updated[0] });
  } catch (error) {
    console.error('Update event error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update event.' });
  }
});

eventsRouter.delete('/:id', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid event id.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM events WHERE id = ? LIMIT 1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    if (req.user.role !== 'admin' && existing.posted_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You may only delete your own events.' });
    }

    await deleteWithNotifications(req, 'events', 'event', id);
    await logActivity(req.user.id, 'delete_event', `Deleted event "${existing.title}" (#${id})`);

    return res.json({ success: true, message: 'Event deleted.' });
  } catch (error) {
    console.error('Delete event error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete event.' });
  }
});

module.exports = { announcementsRouter, memosRouter, eventsRouter };
