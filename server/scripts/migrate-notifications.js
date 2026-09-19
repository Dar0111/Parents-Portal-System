// FIRST MIGRATION SCRIPT IN THIS REPO — the convention starts here (N1,
// 2026-09-19). Before this there were none: server/scripts/ held setup-db.js,
// verify-grading-seed.js and the sixteen test files, and the only way to get a
// schema change in was scripts/setup-db.js, which begins
//
//     DROP DATABASE IF EXISTS `parents_portal`          (setup-db.js:175)
//
// and is therefore never run against a database anyone cares about. A feature
// that needs a new table on a live database needed a second tool. This is it.
//
// WHAT A MIGRATION IN THIS REPO MUST DO, and what the next one should copy:
//
//   - NEVER DROP ANYTHING. No DROP DATABASE, no DROP TABLE, no destructive
//     ALTER. A migration adds; removing is a separate, argued decision.
//   - BE IDEMPOTENT, and PROVE it rather than claim it. Run twice, the schema
//     is byte-identical and no row was touched. This script prints the
//     evidence for that comparison itself (see --print-state below) so the
//     proof is a diff of two runs, not a reading of the code.
//   - ANNOUNCE what it did, per object: `created` or `already present`. A
//     silent second run is indistinguishable from a broken one.
//   - MIRROR the change into database/schema.sql, so a future clean
//     db:setup produces the same shape this produces on a live database. The
//     two must not drift; schema.sql is the definition, this is the migration
//     path for databases that already exist.
//
// MySQL 8 has no `ADD CONSTRAINT IF NOT EXISTS`, so each foreign key is
// guarded by a lookup in information_schema.TABLE_CONSTRAINTS. CREATE TABLE
// has IF NOT EXISTS and uses it.
//
// Run:  npm run db:migrate:notifications
//       npm run db:migrate:notifications -- --print-state   (proof output only)

require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'parents_portal';

// Kept character-for-character in step with database/schema.sql. If you change
// one, change both in the same dispatch.
const CREATE_NOTIFICATIONS = `
CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('announcement','memo','event','excuse_submitted','excuse_reviewed','parent_pending','grade_available') NOT NULL,
  item_type ENUM('announcement','memo','event','excuse_letter','user','grade') NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  title_snapshot VARCHAR(200) DEFAULT NULL,
  actor_id INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_notifications_once (user_id, type, item_id),
  INDEX idx_notifications_unread (user_id, read_at, created_at),
  INDEX idx_notifications_item (item_type, item_id)
) ENGINE=InnoDB`;

const FOREIGN_KEYS = [
  {
    name: 'fk_notifications_user',
    sql: 'ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
  },
  {
    name: 'fk_notifications_actor',
    sql: 'ALTER TABLE notifications ADD CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL',
  },
];

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1',
    [DB_NAME, table]
  );
  return rows.length > 0;
}

async function constraintExists(conn, name) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ? LIMIT 1',
    [DB_NAME, name]
  );
  return rows.length > 0;
}

// The idempotency evidence. Two runs of this must be byte-identical.
async function printState(conn) {
  const [[create]] = await conn.query('SHOW CREATE TABLE notifications');
  const [constraints] = await conn.query(
    `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'notifications' AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY CONSTRAINT_NAME`,
    [DB_NAME]
  );
  const [[{ rowCount }]] = await conn.query('SELECT COUNT(*) AS rowCount FROM notifications');

  console.log('--- STATE ---');
  console.log(create['Create Table']);
  console.log('--- FOREIGN KEYS ---');
  constraints.forEach((c) => {
    console.log(`${c.CONSTRAINT_NAME} (${c.COLUMN_NAME}) -> ${c.REFERENCED_TABLE_NAME}(${c.REFERENCED_COLUMN_NAME})`);
  });
  console.log('--- ROWS ---');
  console.log(String(rowCount));
}

async function main() {
  const stateOnly = process.argv.includes('--print-state');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: DB_NAME,
  });

  try {
    if (stateOnly) {
      await printState(conn);
      return;
    }

    const had = await tableExists(conn, 'notifications');
    await conn.query(CREATE_NOTIFICATIONS);
    console.log(had ? 'notifications: already present' : 'notifications: created');

    for (const fk of FOREIGN_KEYS) {
      if (await constraintExists(conn, fk.name)) {
        console.log(`${fk.name}: already present`);
      } else {
        await conn.query(fk.sql);
        console.log(`${fk.name}: created`);
      }
    }

    console.log('');
    await printState(conn);
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
