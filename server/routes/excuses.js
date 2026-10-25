const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const {
  excuseAdviserAudience,
  activeUserById,
  insertNotifications,
  emitNotifications,
} = require('../utils/notify');
const { isValidDateFormat, todayLocalDateString } = require('../utils/dateFormat');
const { TEACHER_VIEW_SCOPE_SQL, teacherViewScopeParams } = require('../utils/teacherScope');
const { readListParams, pageMeta } = require('../utils/pagination');
const { reviewWithAttendance, RETRY_MESSAGE } = require('../utils/excuseAttendance');
const { refuseNul, textTooLong, isCalendarDate } = require('../utils/requestLimits');

const router = express.Router();
router.use(refuseNul);

// CRUD half — submit, list, view, edit — plus PATCH /:id/review
// (approve/decline). The section ADVISER only may review (not any assigned
// teacher), and since feat/excuse-attendance (B8, the owner's decision of
// 2026-10-22) the decision sets that day's attendance in the same
// transaction — the rule is utils/excuseAttendance.js.
const VALID_STATUSES = ['Pending', 'Approved', 'Declined']; // for ?status= filter validation only


function isFutureDate(value) {
  return value > todayLocalDateString();
}

// GET /api/excuse-letters/mine — parent only. Declared before GET /:id:
// routing is first-match, and parseId('mine') would otherwise fire first
// and return 400 for every request to this path.
router.get('/mine', authenticate, authorize('parent'), async (req, res) => {
  const list = readListParams(req.query, {
    sortable: { absence_date: 'absence_date', reason: 'reason', status: 'status', created_at: 'created_at' },
    defaultOrderBy: 'absence_date DESC',
    tiebreaker: 'id DESC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    const {
      rows: [{ total }],
    } = await pool.query('SELECT COUNT(*) AS total FROM excuse_letters WHERE parent_id = ?', [req.user.id]);
    const { rows } = await pool.query(
      `SELECT * FROM excuse_letters WHERE parent_id = ? ${list.orderBy} LIMIT ? OFFSET ?`,
      [req.user.id, list.limit, list.offset]
    );
    return res.json({ success: true, excuse_letters: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
  } catch (error) {
    console.error('List own excuse letters error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch excuse letters.' });
  }
});

// GET /api/excuse-letters — teacher, admin. Admin sees all; teacher sees
// only letters for students they're assigned to — same EXISTS-against-
// teacher_assignments shape routes/students.js uses for its own list
// (matched on the student's grade_level + section, since neither column
// lives on excuse_letters itself).
router.get('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { status, student_id, from, to } = req.query;

  const conditions = [];
  const params = [];

  if (req.user.role === 'teacher') {
    conditions.push(TEACHER_VIEW_SCOPE_SQL);
    params.push(...teacherViewScopeParams(req.user.id));
  }

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of ${VALID_STATUSES.join(', ')}.` });
    }
    conditions.push('el.status = ?');
    params.push(status);
  }

  if (student_id !== undefined) {
    const studentId = parseId(student_id);
    if (studentId === null) {
      return res.status(400).json({ success: false, message: 'Invalid student_id filter.' });
    }
    conditions.push('el.student_id = ?');
    params.push(studentId);
  }

  if (from !== undefined) {
    if (!isValidDateFormat(from)) {
      return res.status(400).json({ success: false, message: 'from must be in YYYY-MM-DD format.' });
    }
    if (!isCalendarDate(from)) {
      return res.status(400).json({ success: false, message: 'from must be a real date in YYYY-MM-DD format.' });
    }
    conditions.push('el.absence_date >= ?');
    params.push(from);
  }

  if (to !== undefined) {
    if (!isValidDateFormat(to)) {
      return res.status(400).json({ success: false, message: 'to must be in YYYY-MM-DD format.' });
    }
    if (!isCalendarDate(to)) {
      return res.status(400).json({ success: false, message: 'to must be a real date in YYYY-MM-DD format.' });
    }
    conditions.push('el.absence_date <= ?');
    params.push(to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const list = readListParams(req.query, {
    sortable: {
      student: 's.last_name, s.first_name',
      class: 's.grade_level, s.section',
      absence_date: 'el.absence_date',
      status: 'el.status',
      created_at: 'el.created_at',
    },
    defaultOrderBy: 'el.absence_date DESC',
    tiebreaker: 'el.id DESC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    const fromClause = `FROM excuse_letters el
       JOIN students s ON s.id = el.student_id
       ${where}`;
    const {
      rows: [{ total }],
    } = await pool.query(`SELECT COUNT(*) AS total ${fromClause}`, params);
    const { rows } = await pool.query(
      `SELECT el.*, s.first_name, s.last_name, s.grade_level, s.section
       ${fromClause}
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [...params, list.limit, list.offset]
    );

    return res.json({ success: true, excuse_letters: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
  } catch (error) {
    console.error('List excuse letters error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch excuse letters.' });
  }
});

// GET /api/excuse-letters/:id — all roles, scoped. Reads that fall outside
// scope return 404 (anti-enumeration), never 403.
router.get('/:id', authenticate, authorize('parent', 'teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid excuse letter id.' });
  }

  try {
    if (req.user.role === 'parent') {
      const { rows } = await pool.query('SELECT * FROM excuse_letters WHERE id = ? AND parent_id = ? LIMIT 1', [
        id,
        req.user.id,
      ]);
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Excuse letter not found.' });
      }
      return res.json({ success: true, excuse_letter: rows[0] });
    }

    if (req.user.role === 'teacher') {
      const { rows } = await pool.query(
        `SELECT el.* FROM excuse_letters el
         JOIN students s ON s.id = el.student_id
         WHERE el.id = ?
           AND ${TEACHER_VIEW_SCOPE_SQL}
         LIMIT 1`,
        [id, ...teacherViewScopeParams(req.user.id)]
      );
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Excuse letter not found.' });
      }
      return res.json({ success: true, excuse_letter: rows[0] });
    }

    // admin
    const { rows } = await pool.query('SELECT * FROM excuse_letters WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Excuse letter not found.' });
    }
    return res.json({ success: true, excuse_letter: rows[0] });
  } catch (error) {
    console.error('Get excuse letter error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch excuse letter.' });
  }
});

// POST /api/excuse-letters — parent only. parent_id/student_id come from
// the authenticated user, never the body; status is always 'Pending' on
// create. attachment_url is not accepted — upload isn't built, stays NULL.
// Unlinked parent (users.student_id NULL) is 409 before the INSERT.
router.post('/', authenticate, authorize('parent'), async (req, res) => {
  const { absence_date, reason, details } = req.body;

  if (!absence_date || !reason || !String(reason).trim()) {
    return res.status(400).json({
      success: false,
      message: 'absence_date and reason are required.',
    });
  }

  if (!isValidDateFormat(absence_date)) {
    return res.status(400).json({ success: false, message: 'absence_date must be in YYYY-MM-DD format.' });
  }

  if (isFutureDate(absence_date)) {
    return res.status(400).json({ success: false, message: 'absence_date cannot be in the future.' });
  }

  const textError = textTooLong('reason', reason) || textTooLong('details', details || null);
  if (textError) {
    return res.status(400).json({ success: false, message: textError });
  }

  // Precondition, not a query failure: refuse before try so a NULL
  // student_id never reaches the NOT NULL INSERT (that was a 500 via
  // ER_BAD_NULL_ERROR in the generic catch). logActivity names
  // student_id too and is unreachable once this returns — no second fix.
  //
  // Test null/undefined (`== null`), not falsy. students.id is
  // AUTO_INCREMENT so there is no 0 today, but a falsy check is wrong
  // the first day there is one.
  //
  // authenticate re-reads the user row on every request, so a parent
  // linked by the school office mid-session clears this guard on their
  // next request with no re-login.
  //
  // 409, not 400: the body is valid; student_id does not come from it.
  // Same family as POST /api/students with no academic_year, and a
  // missing grading_mode_configs row. A 400 would tell a parent to
  // fix a request they cannot fix. "school office" (not "An admin")
  // matches Parent → Excuse Letters' own unlinked copy — §5i, even
  // though no caller renders this string yet.
  if (req.user.student_id == null) {
    return res.status(409).json({
      success: false,
      message:
        'This account is not linked to a student record yet. The school office must link it before excuse letters can be submitted.',
    });
  }

  try {
    // RETURNING id is mysql2's insertId (config/db.js has none).
    const { rows: inserted } = await pool.query(
      `INSERT INTO excuse_letters (student_id, parent_id, absence_date, reason, details)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [req.user.student_id, req.user.id, absence_date, reason, details || null]
    );

    const { rows } = await pool.query('SELECT * FROM excuse_letters WHERE id = ? LIMIT 1', [inserted[0].id]);
    await logActivity(
      req.user.id,
      'submit_excuse_letter',
      `Submitted excuse letter for student #${req.user.student_id}, absence on ${absence_date}`
    );

    // Fan-out is best effort, exactly like logActivity above it: the thing
    // this describes is already written and logged, so a failure here must
    // not turn a successful post into a 500. Emit only after the write.
    //
    // NARROWING (see utils/notify.js): the section ADVISER alone, not every
    // teacher the list would show this letter to. Review authority is
    // adviser-only, so announcing it to an assigned-but-not-adviser teacher
    // would point at a queue they cannot act on. 20 of the 23 seeded
    // sections have no adviser, so a letter from one of those notifies
    // nobody -- accepted 2026-09-19, and the fix is an adviser on every real
    // section before the pilot, not a fallback recipient here.
    try {
      const audience = await excuseAdviserAudience(pool, req.user.student_id);
      const notified = await insertNotifications(pool, {
        type: 'excuse_submitted',
        itemType: 'excuse_letter',
        itemId: rows[0].id,
        actorId: req.user.id,
        titleSnapshot: null,
        userIds: audience,
      });
      emitNotifications(req, notified);
    } catch (notifyError) {
      console.error('Excuse letter notification fan-out failed:', notifyError);
    }

    return res.status(201).json({ success: true, message: 'Excuse letter submitted.', excuse_letter: rows[0] });
  } catch (error) {
    console.error('Submit excuse letter error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit excuse letter.' });
  }
});

// PUT /api/excuse-letters/:id — parent, own letter, only while Pending.
// Editable: absence_date, reason, details only — status/teacher_remarks/
// reviewed_by/parent_id/student_id are never read from the body at all.
router.put('/:id', authenticate, authorize('parent'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid excuse letter id.' });
  }

  const { absence_date, reason, details } = req.body;

  if (absence_date !== undefined) {
    if (!isValidDateFormat(absence_date)) {
      return res.status(400).json({ success: false, message: 'absence_date must be in YYYY-MM-DD format.' });
    }
    if (isFutureDate(absence_date)) {
      return res.status(400).json({ success: false, message: 'absence_date cannot be in the future.' });
    }
  }

  if (reason !== undefined && !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'reason must not be empty.' });
  }

  const textError = textTooLong('reason', reason) || textTooLong('details', details !== undefined ? details || null : null);
  if (textError) {
    return res.status(400).json({ success: false, message: textError });
  }

  try {
    // Read-scope fails first: not found or not this parent's letter both
    // return the same 404, so a parent probing ids can't distinguish them.
    const { rows } = await pool.query('SELECT * FROM excuse_letters WHERE id = ? AND parent_id = ? LIMIT 1', [
      id,
      req.user.id,
    ]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Excuse letter not found.' });
    }

    if (existing.status !== 'Pending') {
      return res.status(403).json({
        success: false,
        message: 'This excuse letter has already been reviewed and can no longer be edited.',
      });
    }

    // Absent fields keep the existing value — no computed default.
    const nextAbsenceDate = absence_date !== undefined ? absence_date : existing.absence_date;
    const nextReason = reason !== undefined ? reason : existing.reason;
    const nextDetails = details !== undefined ? details || null : existing.details;

    // The UPDATE re-checks Pending (feat/excuse-attendance): a review that
    // committed between the read above and this write has already set the
    // day's attendance on the old date, and moving the letter's date now
    // would leave the letter and its day apart. The same 403 as above.
    const edit = await pool.query(
      "UPDATE excuse_letters SET absence_date = ?, reason = ?, details = ? WHERE id = ? AND status = 'Pending'",
      [nextAbsenceDate, nextReason, nextDetails, id]
    );
    if (edit.rowCount !== 1) {
      return res.status(403).json({
        success: false,
        message: 'This excuse letter has already been reviewed and can no longer be edited.',
      });
    }

    const { rows: updated } = await pool.query('SELECT * FROM excuse_letters WHERE id = ? LIMIT 1', [id]);
    await logActivity(req.user.id, 'update_excuse_letter', `Updated excuse letter #${id}`);

    return res.json({ success: true, message: 'Excuse letter updated.', excuse_letter: updated[0] });
  } catch (error) {
    console.error('Update excuse letter error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update excuse letter.' });
  }
});

// PATCH /api/excuse-letters/:id/review — adviser of the student's section,
// or admin. Writes the letter's status, teacher_remarks and reviewed_by AND,
// since feat/excuse-attendance (B8), that day's attendance, in ONE
// transaction (utils/excuseAttendance.js: approved → Excused, declined →
// Absent, Present / Late / Excused kept, no write on a day that is not a
// class day). This REPLACES the school's earlier rule — "excuse lang yung
// bata pero absent pa rin", under which a review never touched attendance —
// by the owner's decision of 2026-10-22. The reply adds `attendance` (the
// day's row afterwards, or null), `attendance_from` (its status before, or
// null) and `class_day`; a lost race on the day's row is a 409 and the letter
// stays Pending.
router.patch('/:id/review', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid excuse letter id.' });
  }

  const { status, teacher_remarks } = req.body;
  const REVIEW_STATUSES = ['Approved', 'Declined'];
  if (!REVIEW_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `status must be one of ${REVIEW_STATUSES.join(', ')}.`,
    });
  }

  const remarksTooLong = textTooLong('teacher_remarks', teacher_remarks || null);
  if (remarksTooLong) {
    return res.status(400).json({ success: false, message: remarksTooLong });
  }

  try {
    let existing;

    if (req.user.role === 'admin') {
      const { rows } = await pool.query('SELECT * FROM excuse_letters WHERE id = ? LIMIT 1', [id]);
      existing = rows[0];
    } else {
      // Same existence/read-scope query GET /:id already uses for a teacher —
      // assigned to the class OR adviser of the section. A teacher who can't
      // even GET this letter gets the same 404 here — never a leak that the
      // id exists.
      //
      // This clause MUST be the wide one. It is an existence check, not the
      // authority gate: the adviser check below is the authority, and it does
      // not move. Narrowing this back to teacher_assignments would 404 an
      // adviser out before they ever reach the check they would pass — which
      // is exactly the bug fixed on 2026-09-06.
      const { rows } = await pool.query(
        `SELECT el.*, s.grade_level, s.section, s.section_id
         FROM excuse_letters el
         JOIN students s ON s.id = el.student_id
         WHERE el.id = ?
           AND ${TEACHER_VIEW_SCOPE_SQL}
         LIMIT 1`,
        [id, ...teacherViewScopeParams(req.user.id)]
      );
      existing = rows[0];
    }

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Excuse letter not found.' });
    }

    if (req.user.role === 'teacher') {
      // Read-scope above is teacher_assignments-based — any assigned
      // teacher can see the letter. Review authority is narrower: the
      // section ADVISER only (school-confirmed). A non-adviser teacher
      // who reached this point already got 200 from GET /:id on this
      // same id, so 404 here would contradict GET and hide nothing —
      // 403 naming the reason instead. Deliberately NOT matching
      // PUT /api/attendance/:id's 404-for-out-of-scope precedent: that
      // precedent holds there because attendance's read-scope and
      // write-scope are both adviser-only already, so GET and PUT never
      // disagree. Here they can, so this is an intentional exception —
      // do not "fix" it back to 404.
      let isAdviser = false;
      if (existing.section_id) {
        const { rows: adviserRows } = await pool.query('SELECT 1 FROM sections WHERE id = ? AND adviser_id = ? LIMIT 1', [
          existing.section_id,
          req.user.id,
        ]);
        isAdviser = adviserRows.length > 0;
      }
      // existing.section_id can be NULL (VARCHAR section never matched a
      // seeded section) — isAdviser stays false, so only admin can review
      // that letter. Same accepted edge case as attendance.js.

      if (!isAdviser) {
        return res.status(403).json({
          success: false,
          message: "Only the adviser of this student's section can review excuse letters.",
        });
      }
    }

    if (existing.status !== 'Pending') {
      return res.status(403).json({
        success: false,
        message: 'This excuse letter has already been reviewed.',
      });
    }

    const remarks = teacher_remarks || null;

    // The letter and its day in one transaction. The UPDATE re-checks
    // Pending, so two reviews of one letter at once cannot both land, and the
    // learner and date come from the letter as it stands INSIDE the
    // transaction; a lost race on the day's row (a duplicate key, a deadlock)
    // rolls everything back and is a 409 — the reviewer tries again.
    const result = await reviewWithAttendance(pool, {
      letterId: id,
      status,
      remarks,
      reviewerId: req.user.id,
    });
    if (result.outcome === 'already_reviewed') {
      return res.status(403).json({
        success: false,
        message: 'This excuse letter has already been reviewed.',
      });
    }
    if (result.outcome === 'conflict') {
      return res.status(409).json({ success: false, message: RETRY_MESSAGE });
    }

    const { rows: updated } = await pool.query('SELECT * FROM excuse_letters WHERE id = ? LIMIT 1', [id]);
    await logActivity(
      req.user.id,
      'review_excuse_letter',
      `Reviewed excuse letter #${id}: ${existing.status} -> ${status}`
    );
    if (result.write) {
      await logActivity(
        req.user.id,
        'excuse_attendance',
        `Set attendance for student #${result.studentId}, ${result.absenceDate}: ${result.from || 'not recorded'} -> ${result.to} (excuse letter #${id})`
      );
    }

    // Fan-out is best effort, exactly like logActivity above it: the thing
    // this describes is already written and logged, so a failure here must
    // not turn a successful post into a 500. Emit only after the write.
    //
    // A DISTINCT TYPE from excuse_submitted on the same item_id. The two are
    // different events on one row and the unique key is
    // (user_id, type, item_id), so both can exist. They could not be told
    // apart by a read-marker design: excuse_letters has no reviewed_at, and
    // updated_at also moves when a parent edits a Pending letter.
    try {
      const audience = await activeUserById(pool, updated[0].parent_id);
      const notified = await insertNotifications(pool, {
        type: 'excuse_reviewed',
        itemType: 'excuse_letter',
        itemId: id,
        actorId: req.user.id,
        titleSnapshot: null,
        userIds: audience,
      });
      emitNotifications(req, notified);
    } catch (notifyError) {
      console.error('Excuse review notification fan-out failed:', notifyError);
    }

    // The REVIEWER'S counts changed too: their own "letter submitted" row
    // stops counting now that the letter is no longer Pending (the
    // self-healing clause in routes/notifications.js). Nothing was inserted
    // for them, so the fan-out above never signals them — without this the
    // badge dropped only on the next reload (fix/smoke-gate). The signal
    // carries nothing and means "refetch" (utils/notify.js), and it is sent
    // outside the fan-out's try so a failed parent insert cannot skip it.
    emitNotifications(req, [req.user.id]);

    return res.json({
      success: true,
      message: 'Excuse letter reviewed.',
      excuse_letter: updated[0],
      // The day as this review's transaction left it (read before COMMIT).
      attendance: result.row,
      attendance_from: result.from,
      class_day: result.classDay,
    });
  } catch (error) {
    console.error('Review excuse letter error:', error);
    return res.status(500).json({ success: false, message: 'Failed to review excuse letter.' });
  }
});

module.exports = router;
