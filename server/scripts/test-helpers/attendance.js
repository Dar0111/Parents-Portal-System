/**
 * The attendance days a test run's excuse reviews touch (feat/excuse-attendance,
 * B8).
 *
 * Since B8 a review SETS that day's attendance, so a suite that reviews a
 * letter on a seeded learner changes a real day — possibly one an adviser
 * recorded on the live database. So each suite snapshots the exact
 * (learner, day) pairs it will review BEFORE the first review, and its cleanup
 * puts every one back exactly: a row the run created is deleted by id, a row
 * it changed gets its status, recorded_by and both timestamps back, and the
 * run asserts every day equals its snapshot. Never a blanket DELETE, never a
 * date range — the same rule as test-helpers/notifications.js.
 *
 * Restore BEFORE the cleanup deletes any fixture user: `recorded_by` is ON
 * DELETE RESTRICT. Timestamps travel as 'YYYY-MM-DD HH:MM:SS' strings, read
 * and written back in the session's time zone — every connection a suite opens
 * shares one config, so the snapshot's connection and the restore's agree and
 * no conversion can move them; setting `updated_at` explicitly keeps ON UPDATE
 * from stamping the restore itself.
 *
 * Takes the suite's own connection, like the notifications helper.
 */

// PostgreSQL since Phase 3 (commit F): the timestamps travel as their own text
// form WITH the offset (`created_at::text`), so the value written back is the
// same instant whatever the session's zone — stricter than the MySQL version's
// zone-less strings, never looser.
const ROW = `SELECT id, status, recorded_by,
                    created_at::text AS created_at,
                    updated_at::text AS updated_at
               FROM attendance WHERE student_id = ? AND date = ? LIMIT 1`;

// `pairs` is [[studentId, 'YYYY-MM-DD'], …]; a pair named twice is kept once.
async function snapshotDays(conn, pairs) {
  const seen = new Set();
  const snapshot = [];
  for (const [studentId, date] of pairs) {
    const key = `${studentId}|${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [rows] = await conn.query(ROW, [studentId, date]);
    snapshot.push({ studentId, date, row: rows[0] || null });
  }
  return snapshot;
}

// Puts every day back; answers how many rows it had to touch.
async function restoreDays(conn, snapshot) {
  let touched = 0;
  for (const { studentId, date, row } of snapshot) {
    const [rows] = await conn.query('SELECT id FROM attendance WHERE student_id = ? AND date = ? LIMIT 1', [studentId, date]);
    const now = rows[0] || null;
    if (!row && now) {
      await conn.query('DELETE FROM attendance WHERE id = ?', [now.id]);
      touched += 1;
    } else if (row && now) {
      // "Touched" counts a row whose values CHANGED (mysql2's changedRows):
      // PostgreSQL has no such count, so the WHERE clause asks for exactly that.
      const [result] = await conn.query(
        `UPDATE attendance SET status = ?::portal.attendance_status, recorded_by = ?,
                created_at = ?::timestamptz, updated_at = ?::timestamptz
          WHERE id = ? AND (status, recorded_by, created_at, updated_at)
                IS DISTINCT FROM (?::portal.attendance_status, ?::integer, ?::timestamptz, ?::timestamptz)`,
        [
          row.status,
          row.recorded_by,
          row.created_at,
          row.updated_at,
          now.id,
          row.status,
          row.recorded_by,
          row.created_at,
          row.updated_at,
        ]
      );
      touched += result.affectedRows;
      // portal.touch_updated_at() keeps an updated_at the statement CHANGES,
      // but bumps one the statement sets to the value it already had while
      // another column changed (MySQL's ON UPDATE would not). Setting it once
      // more, alone, makes it exactly the snapshot's.
      await conn.query('UPDATE attendance SET updated_at = ?::timestamptz WHERE id = ? AND updated_at IS DISTINCT FROM ?::timestamptz', [
        row.updated_at,
        now.id,
        row.updated_at,
      ]);
    } else if (row && !now) {
      await conn.query(
        'INSERT INTO attendance (id, student_id, date, status, recorded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [row.id, studentId, date, row.status, row.recorded_by, row.created_at, row.updated_at]
      );
      touched += 1;
    }
  }
  return touched;
}

// True when every day is exactly as snapshotted (id, status, recorder, both stamps).
async function daysMatch(conn, snapshot) {
  const again = await snapshotDays(
    conn,
    snapshot.map((s) => [s.studentId, s.date])
  );
  return again.length === snapshot.length && again.every((s, i) => JSON.stringify(s.row) === JSON.stringify(snapshot[i].row));
}

module.exports = { snapshotDays, restoreDays, daysMatch };
