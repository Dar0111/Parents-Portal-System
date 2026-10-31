// MODULE 12 (2026-10-31) — CLEARING THE OLD MESSAGES, Darryl's decision. Same
// owner connection, same guard as scripts/demo-load.js.
//
//   npm run demo:clear-messages                 counts only: BEGIN READ ONLY
//   npm run demo:clear-messages -- --apply      ONE transaction
//
// `body` is never selected. The only copy of what is deleted here is the
// backup taken first (docs/DEMO_DATA.md).
//
// NO NOTIFICATION CAN BE TIED TO A MESSAGE: notification_item_type has no
// message label, because messages keep their own unread count (§10). So
// nothing is deleted from `notifications`; the script asserts its count did not
// move rather than trusting that sentence.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../config/db');
const demo = require('./demoData');
const { atStep, reportFailure, ownerSettings, connectOwner, begin } = require('./demo-load');

async function countOf(conn, table) {
  const { rows } = await conn.query(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(rows[0].n);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const settings = ownerSettings(apply);

  atStep('connecting');
  const { client, conn } = await connectOwner(settings);
  try {
    await begin(conn, apply);
    console.log(apply ? 'BEGIN: one transaction, rollback on any error.' : 'BEGIN READ ONLY: counts only, nothing can be written.');

    atStep('reading');
    const messages = await countOf(conn, 'messages');
    const notifications = await countOf(conn, 'notifications');

    if (!apply) {
      await conn.query('ROLLBACK');
      console.log(`messages: ${messages}`);
      console.log(`notifications: ${notifications}`);
      console.log('Dry run complete. Nothing was written.');
      return;
    }

    atStep('deleting');
    const deleted = await conn.query('DELETE FROM messages');
    const left = await countOf(conn, 'messages');
    const notificationsAfter = await countOf(conn, 'notifications');
    if (deleted.rowCount !== messages || left !== 0) throw new Error('The message count did not reach zero.');
    if (notificationsAfter !== notifications) throw new Error('The notification count moved.');

    const { rows } = await conn.query('SELECT id FROM users WHERE login_id = ? LIMIT 1', [demo.ADMIN_LOGIN]);
    await conn.query('INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)', [
      rows[0] ? rows[0].id : null,
      'demo_messages_clear',
      `Cleared ${messages} messages before the demo data.`,
    ]);

    atStep('commit');
    await conn.query('COMMIT');
    console.log(`messages: ${messages} -> ${left}`);
    console.log(`notifications: ${notifications} -> ${notificationsAfter}`);
    console.log('Clear committed.');
  } catch (error) {
    try {
      await conn.query('ROLLBACK');
    } catch {
      // the connection is closed below either way, and that rolls back too
    }
    throw error;
  } finally {
    await client.end();
  }
}

main()
  .catch(reportFailure)
  .finally(() => db.end());
