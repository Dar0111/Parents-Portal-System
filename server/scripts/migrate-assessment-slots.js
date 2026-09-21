// MIGRATION: assessment_slots, and grade_components.slot_id (2026-09-22).
//
// Follows scripts/migrate-notifications.js, the template this repo set with
// its first migration: NEVER DROP ANYTHING, be idempotent and PROVE it,
// announce created / already present per object, and mirror into
// database/schema.sql so a clean db:setup produces the same shape. The
// schema half is done in the same dispatch.
//
// WHY: the class-record grid (CR1) needs one highest possible score per
// assessment COLUMN, shared by the class. Until now the only max lived on
// each learner's grade_components row, which cannot express "this slot is
// unused" — see the table comment in schema.sql.
//
// FOUR OBJECTS, each checked and announced independently, because a run
// that half-applied must be safe to re-run:
//   1. the assessment_slots table
//   2. grade_components.slot_id            (nullable column)
//   3. its FK to assessment_slots          (ON DELETE RESTRICT)
//   4. grade_components.label              (NOT NULL -> NULL)
//
// EXISTING ROWS ARE LEFT ALONE. A grade_components row written before the
// grid has no slot and never gets an invented one — back-filling would mean
// guessing which class column a score belonged to, and a guess stored as
// fact is worse than a NULL that says "recorded the old way". The script
// REPORTS how many such rows it found, the same way setup-db.js reports
// every row backfillSectionIds() leaves NULL, so the number is visible
// rather than assumed. The seeded baseline is 0.
//
// Run:  node scripts/migrate-assessment-slots.js
//       node scripts/migrate-assessment-slots.js --print-state
//   or: npm run db:migrate:assessment-slots

require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'parents_portal';

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1',
    [DB_NAME, table]
  );
  return rows.length > 0;
}

async function columnInfo(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT IS_NULLABLE, COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [DB_NAME, table, column]
  );
  return rows[0] || null;
}

async function constraintExists(conn, table, name) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
    [DB_NAME, table, name]
  );
  return rows.length > 0;
}

async function printState(conn) {
  console.log('STATE:');
  console.log(`  assessment_slots table      ${(await tableExists(conn, 'assessment_slots')) ? 'present' : 'MISSING'}`);

  const slotCol = await columnInfo(conn, 'grade_components', 'slot_id');
  console.log(`  grade_components.slot_id    ${slotCol ? `present (${slotCol.COLUMN_TYPE}, nullable ${slotCol.IS_NULLABLE})` : 'MISSING'}`);

  const labelCol = await columnInfo(conn, 'grade_components', 'label');
  console.log(`  grade_components.label      ${labelCol ? `nullable ${labelCol.IS_NULLABLE}` : 'MISSING'}`);

  console.log(
    `  fk_grade_components_slot    ${(await constraintExists(conn, 'grade_components', 'fk_grade_components_slot')) ? 'present' : 'MISSING'}`
  );

  if (await tableExists(conn, 'assessment_slots')) {
    const [[slots]] = await conn.query('SELECT COUNT(*) n FROM assessment_slots');
    console.log(`  assessment_slots rows       ${slots.n}`);
  }
  if (slotCol) {
    const [[legacy]] = await conn.query('SELECT COUNT(*) n FROM grade_components WHERE slot_id IS NULL');
    const [[total]] = await conn.query('SELECT COUNT(*) n FROM grade_components');
    console.log(`  grade_components rows       ${total.n} total, ${legacy.n} with NO slot (legacy, left alone)`);
  }
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

    // 1. assessment_slots
    if (await tableExists(conn, 'assessment_slots')) {
      console.log('  assessment_slots            already present');
    } else {
      await conn.query(`
        CREATE TABLE assessment_slots (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          subject_id INT UNSIGNED NOT NULL,
          grade_level TINYINT UNSIGNED NOT NULL,
          section VARCHAR(50) NOT NULL,
          term TINYINT UNSIGNED NOT NULL CHECK (term BETWEEN 1 AND 3),
          school_year VARCHAR(9) NOT NULL,
          type ENUM('WW', 'PT') NOT NULL,
          slot_no TINYINT UNSIGNED NOT NULL,
          name VARCHAR(100) DEFAULT NULL,
          max_score DECIMAL(5,2) DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_slot (subject_id, grade_level, section, term, school_year, type, slot_no),
          CONSTRAINT fk_slot_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
      console.log('  assessment_slots            created');
    }

    // 2. grade_components.slot_id
    if (await columnInfo(conn, 'grade_components', 'slot_id')) {
      console.log('  grade_components.slot_id    already present');
    } else {
      await conn.query('ALTER TABLE grade_components ADD COLUMN slot_id INT UNSIGNED DEFAULT NULL AFTER grade_id');
      await conn.query('ALTER TABLE grade_components ADD INDEX idx_grade_components_slot (slot_id)');
      console.log('  grade_components.slot_id    created (nullable, indexed)');
    }

    // 3. the FK
    if (await constraintExists(conn, 'grade_components', 'fk_grade_components_slot')) {
      console.log('  fk_grade_components_slot    already present');
    } else {
      await conn.query(
        `ALTER TABLE grade_components
           ADD CONSTRAINT fk_grade_components_slot
           FOREIGN KEY (slot_id) REFERENCES assessment_slots(id) ON DELETE RESTRICT`
      );
      console.log('  fk_grade_components_slot    created (ON DELETE RESTRICT)');
    }

    // 4. label NOT NULL -> NULL
    const label = await columnInfo(conn, 'grade_components', 'label');
    if (!label) {
      console.error('ABORT — grade_components.label does not exist. This is not the database this expects.');
      process.exitCode = 1;
      return;
    }
    if (label.IS_NULLABLE === 'YES') {
      console.log('  grade_components.label      already nullable');
    } else {
      // Widening a constraint only — no row can violate NULL-allowed, so
      // this cannot fail on data and nothing is rewritten.
      await conn.query('ALTER TABLE grade_components MODIFY COLUMN label VARCHAR(100) DEFAULT NULL');
      console.log('  grade_components.label      NOT NULL -> nullable');
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
