// MIGRATION — grade acknowledgements (feat/grade-acknowledgement, 2026-10-21).
// Modelled on scripts/migrate-notifications.js, THE MIGRATION TEMPLATE
// (CLAUDE.md → File rules that bite): never drops, idempotent and PROVED so
// (--print-state), announces created / already present per object, and
// mirrors database/schema.sql character for character.
//
// Two objects, both ADDITIVE:
//
//   1. the table `grade_acknowledgements` and its two foreign keys
//      (CREATE TABLE IF NOT EXISTS; each FK guarded by a lookup in
//      information_schema.TABLE_CONSTRAINTS — MySQL 8 has no
//      ADD CONSTRAINT IF NOT EXISTS);
//   2. two values appended to `notifications.type` — 'grades_locked' and
//      'grades_acknowledged'. Guarded by information_schema.COLUMNS'
//      COLUMN_TYPE: the ALTER runs only while a value is missing, and it
//      restates the WHOLE list in schema.sql's order. Appending at the end of
//      an ENUM is an in-place metadata change in MySQL 8 (no table rebuild).
//
// NOTHING ON `grades` CHANGES: the dormant `acknowledged` /
// `acknowledged_at` columns stay as they are (the owner's Q8).
//
// Run from server/ (the worktree has no .env of its own — point --env-file at
// the main tree's):
//   node --env-file=<main>\server\.env scripts/migrate-grade-acknowledgements.js
//   node --env-file=<main>\server\.env scripts/migrate-grade-acknowledgements.js --print-state
//
// A live-DB write: GET /api/health must answer and POST /api/backups must
// return 201 first (CLAUDE.md → working agreement).

require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'parents_portal';

// Kept character-for-character in step with database/schema.sql. If you change
// one, change both in the same dispatch.
const CREATE_GRADE_ACKNOWLEDGEMENTS = `CREATE TABLE IF NOT EXISTS grade_acknowledgements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  school_year VARCHAR(9) NOT NULL,
  term TINYINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED DEFAULT NULL,
  acknowledged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_grade_ack_term (student_id, school_year, term),
  INDEX idx_grade_ack_user (user_id),
  CONSTRAINT chk_grade_ack_term CHECK (term BETWEEN 1 AND 3)
) ENGINE=InnoDB`;

const FOREIGN_KEYS = [
  {
    name: 'fk_grade_ack_student',
    sql: 'ALTER TABLE grade_acknowledgements ADD CONSTRAINT fk_grade_ack_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE',
  },
  {
    name: 'fk_grade_ack_user',
    sql: 'ALTER TABLE grade_acknowledgements ADD CONSTRAINT fk_grade_ack_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL',
  },
];

// schema.sql's list, in its order, with the two new values LAST.
const NOTIFICATION_TYPES = [
  'announcement',
  'memo',
  'event',
  'excuse_submitted',
  'excuse_reviewed',
  'parent_pending',
  'grade_available',
  'grades_locked',
  'grades_acknowledged',
];
const NEW_TYPES = ['grades_locked', 'grades_acknowledged'];
const ALTER_NOTIFICATION_TYPE = `ALTER TABLE notifications MODIFY COLUMN type ENUM(${NOTIFICATION_TYPES.map((t) => `'${t}'`).join(',')}) NOT NULL`;

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [DB_NAME, table]
  );
  return rows.length > 0;
}

async function constraintExists(conn, name) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ?',
    [DB_NAME, name]
  );
  return rows.length > 0;
}

// The live ENUM definition, e.g. "enum('announcement','memo',...)".
async function notificationTypeColumn(conn) {
  const [rows] = await conn.query(
    "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'type'",
    [DB_NAME]
  );
  return rows[0] ? rows[0].COLUMN_TYPE : null;
}

function missingTypes(columnType) {
  return NEW_TYPES.filter((t) => !String(columnType || '').includes(`'${t}'`));
}

// The idempotency evidence. Two runs of this must be byte-identical.
async function printState(conn) {
  const [[create]] = await conn.query('SHOW CREATE TABLE grade_acknowledgements');
  const [constraints] = await conn.query(
    `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'grade_acknowledgements' AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY CONSTRAINT_NAME`,
    [DB_NAME]
  );
  const [[{ rowCount }]] = await conn.query('SELECT COUNT(*) AS rowCount FROM grade_acknowledgements');
  const columnType = await notificationTypeColumn(conn);

  console.log('--- STATE ---');
  console.log(create['Create Table']);
  console.log('--- FOREIGN KEYS ---');
  constraints.forEach((c) => {
    console.log(`${c.CONSTRAINT_NAME}: ${c.COLUMN_NAME} -> ${c.REFERENCED_TABLE_NAME}(${c.REFERENCED_COLUMN_NAME})`);
  });
  console.log('--- ROWS ---');
  console.log(String(rowCount));
  console.log('--- notifications.type ---');
  console.log(String(columnType));
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

    const had = await tableExists(conn, 'grade_acknowledgements');
    await conn.query(CREATE_GRADE_ACKNOWLEDGEMENTS);
    console.log(had ? 'grade_acknowledgements: already present' : 'grade_acknowledgements: created');

    for (const fk of FOREIGN_KEYS) {
      if (await constraintExists(conn, fk.name)) {
        console.log(`${fk.name}: already present`);
      } else {
        await conn.query(fk.sql);
        console.log(`${fk.name}: created`);
      }
    }

    const before = await notificationTypeColumn(conn);
    const missing = missingTypes(before);
    if (!missing.length) {
      console.log('notifications.type: grades_locked, grades_acknowledged already present');
    } else {
      await conn.query(ALTER_NOTIFICATION_TYPE);
      console.log(`notifications.type: added ${missing.join(', ')}`);
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
