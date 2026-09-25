/**
 * Shared cleanup for the `notifications` rows a test run fans out.
 *
 * `notifications.item_id` is polymorphic (six possible tables) and therefore
 * carries NO foreign key, so deleting an announcement, a letter, a grade or a
 * pending parent does not cascade to the rows it produced. Every reader drops
 * them at read time (the visibility re-check in routes/notifications.js), so
 * they are invisible — but they accumulate: measured at 25 / 10 / 3 rows per
 * run of content / excuses / grades on 2026-09-19, and the same 3 again after
 * #2's grades run on 2026-09-25. This is the one place the suites clean them.
 *
 * THE ONLY KEY IS THE EXACT (item_type, item_id) PAIR THIS RUN CREATED.
 * Never a blanket DELETE, never a date, never an item_type alone: any of
 * those would throw away real rows belonging to whoever is using the system,
 * which is the mistake test-attendance's cleanup made with dates until
 * pre-Stage-5 #3a. Lifted from test-notifications-flows.js, which had the
 * rule first, so there is one implementation rather than two.
 *
 * Takes the suite's own connection (every suite has a withDb(fn) that opens
 * one), so this file owns no config and opens nothing.
 */

// `pairs` is an array of [itemType, itemId]. `pairsFor(type, ids)` builds one
// from an id list, which is the shape every suite already tracks.
function pairsFor(itemType, ids) {
  return (ids || []).filter((id) => id !== undefined && id !== null).map((id) => [itemType, id]);
}

async function deleteNotificationsFor(conn, pairs) {
  let deleted = 0;
  for (const [itemType, itemId] of pairs || []) {
    const [res] = await conn.query('DELETE FROM notifications WHERE item_type = ? AND item_id = ?', [itemType, itemId]);
    deleted += res.affectedRows;
  }
  return deleted;
}

// The proof that cleanup was complete: rows for THIS RUN's pairs, which must
// be 0 after deleteNotificationsFor. Deliberately not COUNT(*) on the table —
// rows created by anyone else are not this run's to assert on.
async function countNotificationsFor(conn, pairs) {
  let total = 0;
  for (const [itemType, itemId] of pairs || []) {
    const [[row]] = await conn.query('SELECT COUNT(*) AS n FROM notifications WHERE item_type = ? AND item_id = ?', [
      itemType,
      itemId,
    ]);
    total += Number(row.n);
  }
  return total;
}

module.exports = { pairsFor, deleteNotificationsFor, countNotificationsFor };
