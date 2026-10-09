// Migration — the privacy build (feat/privacy, 2026-10-10).
// Follows THE MIGRATION TEMPLATE (scripts/migrate-notifications.js; CLAUDE.md
// → File rules that bite):
//
//   NEVER DROP ANYTHING.        No DROP, no column removed. The learner's four
//                               no-longer-collected columns STAY (NULL-able);
//                               only their stored VALUES are cleared.
//   BE IDEMPOTENT, AND PROVE IT. --print-state emits the evidence; a second
//                               run creates nothing and clears 0 rows.
//   ANNOUNCE per object.        created / already present, never silence.
//   MIRROR into schema.sql.     So a clean db:setup produces this same shape.
//
// What it does, and why:
//   policy_acceptances   a parent's acceptance of the Data Privacy Notice and
//                        the Terms of Use, per document and version
//                        (utils/policy.js, middleware/auth.js).
//   login_attempts       failed sign-ins, keyed by an HMAC of the login id
//                        (utils/loginThrottle.js).
//   students.birthday / gender / address / contact_number → NULL
//                        decision 6: the portal no longer collects them, so
//                        what was collected is not kept either.
//
// Prints counts only — never a value, a login id or an LRN.
//
// Run:  npm run db:migrate:privacy
//       npm run db:migrate:privacy -- --print-state

require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'parents_portal';

const CREATE_POLICY_ACCEPTANCES = `
  CREATE TABLE policy_acceptances (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    document ENUM('privacy_notice','terms_of_use') NOT NULL,
    version VARCHAR(32) NOT NULL,
    student_id INT UNSIGNED DEFAULT NULL,
    accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_policy_once (user_id, document, version),
    CONSTRAINT fk_policy_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_policy_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`;

const CREATE_LOGIN_ATTEMPTS = `
  CREATE TABLE login_attempts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    login_key CHAR(64) NOT NULL,
    ip VARCHAR(45) DEFAULT NULL,
    cleared TINYINT(1) NOT NULL DEFAULT 0,
    attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_login_attempts_key (login_key, attempted_at),
    INDEX idx_login_attempts_ip (ip, attempted_at)
  ) ENGINE=InnoDB`;

const LEARNER_FIELDS_SET = `
  SELECT COUNT(*) AS n FROM students
   WHERE birthday IS NOT NULL OR gender IS NOT NULL OR address IS NOT NULL OR contact_number IS NOT NULL`;

async function tableExists(conn, name) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1',
    [DB_NAME, name]
  );
  return rows.length > 0;
}

// The idempotency evidence. Two runs of this must be byte-identical.
async function printState(conn) {
  const [cols] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND (TABLE_NAME IN ('policy_acceptances', 'login_attempts')
          OR (TABLE_NAME = 'students' AND COLUMN_NAME IN ('birthday', 'gender', 'address', 'contact_number')))
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [DB_NAME]
  );
  const [fks] = await conn.query(
    `SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME
       FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME IN ('policy_acceptances', 'login_attempts')
      ORDER BY CONSTRAINT_NAME`,
    [DB_NAME]
  );
  const [[{ tables }]] = await conn.query(
    'SELECT COUNT(*) AS tables FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
    [DB_NAME]
  );
  const [[{ n: learnersWithFields }]] = await conn.query(LEARNER_FIELDS_SET);

  console.log('--- STATE ---');
  cols.forEach((c) => {
    console.log(`${c.TABLE_NAME}.${c.COLUMN_NAME} ${c.COLUMN_TYPE} null=${c.IS_NULLABLE} default=${c.COLUMN_DEFAULT}`);
  });
  fks.forEach((f) => console.log(`fk ${f.CONSTRAINT_NAME}: ${f.TABLE_NAME} -> ${f.REFERENCED_TABLE_NAME}`));
  console.log('--- ROWS ---');
  console.log(`tables in ${DB_NAME}: ${tables}`);
  console.log(`learners with a birthday, gender, address or contact number: ${learnersWithFields}`);
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

    if (await tableExists(conn, 'policy_acceptances')) {
      console.log('policy_acceptances: already present');
    } else {
      await conn.query(CREATE_POLICY_ACCEPTANCES);
      console.log('policy_acceptances: created');
    }

    if (await tableExists(conn, 'login_attempts')) {
      console.log('login_attempts: already present');
    } else {
      await conn.query(CREATE_LOGIN_ATTEMPTS);
      console.log('login_attempts: created');
    }

    const [[{ n: before }]] = await conn.query(LEARNER_FIELDS_SET);
    const [result] = await conn.query(
      `UPDATE students SET birthday = NULL, gender = NULL, address = NULL, contact_number = NULL
        WHERE birthday IS NOT NULL OR gender IS NOT NULL OR address IS NOT NULL OR contact_number IS NOT NULL`
    );
    const [[{ n: after }]] = await conn.query(LEARNER_FIELDS_SET);
    console.log(
      `students' birthday / gender / address / contact number: ${before} learner(s) held a value, ${result.affectedRows} cleared, ${after} left`
    );
    if (Number(after) !== 0) throw new Error(`${after} learner(s) still hold a value`);

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
