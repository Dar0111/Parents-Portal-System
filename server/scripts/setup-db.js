/**
 * Runs schema.sql + seed.sql against MySQL.
 * Hashes default passwords with bcrypt before inserting users.
 *
 * Usage: npm run db:setup   (from server/)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { applyDemoGrade1 } = require('./demoGrade1');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'parents_portal';

const ROOT = path.join(__dirname, '..', '..');
const SCHEMA_PATH = path.join(ROOT, 'database', 'schema.sql');
const SEED_PATH = path.join(ROOT, 'database', 'seed.sql');

async function runSqlFile(connection, filePath, multi = true) {
  const sql = fs.readFileSync(filePath, 'utf8');
  await connection.query({ sql, multipleStatements: multi });
}

async function buildUserSeedSql() {
  const adminHash = bcrypt.hashSync('Admin@2026', 10);
  const teacherHash = bcrypt.hashSync('Teacher@2026', 10);
  const parentHash = bcrypt.hashSync('Parent@2026', 10);

  return `
INSERT INTO users (login_id, password, role, status, name, email, contact_number, student_id, created_by, approved_by) VALUES
  ('ADMIN001', '${adminHash}', 'admin', 'active', 'Principal Admin', 'admin@chfes.edu.ph', '09170000001', NULL, NULL, NULL),
  ('TCH-001', '${teacherHash}', 'teacher', 'active', 'Maria Santos', 'msantos@chfes.edu.ph', '09170000002', NULL, 1, NULL);

UPDATE students SET created_by = 2 WHERE lrn IN ('13567454', '1234567', '136893260001');

INSERT INTO users (login_id, password, role, status, name, email, contact_number, student_id, created_by, approved_by) VALUES
  ('13567454', '${parentHash}', 'parent', 'active', 'Ashley Geguiera', 'ashley.g@email.com', '09170000003', 1, 2, 1),
  ('1234567', '${parentHash}', 'parent', 'pending', 'Ashley Geguiera', 'ashley.g@email.com', '09170000003', 2, 2, NULL);

-- Second adviser, for the attendance per-day model (Stage B1): one adviser
-- per section is the minimum needed to test adviser-scoping at all beyond a
-- single account. Created the same way TCH-001 is — bcrypt hash, active
-- immediately, same default password. Plainly fictional name, deliberately
-- not one of the school's real teachers.
INSERT INTO users (login_id, password, role, status, name, email, contact_number, student_id, created_by, approved_by) VALUES
  ('TCH-002', '${teacherHash}', 'teacher', 'active', 'Ana Reyes', 'areyes@chfes.edu.ph', '09170000004', NULL, 1, NULL);

-- Grade 1 adviser + subject teacher. A NEW account, not TCH-002: that
-- account's whole value is being assignment-less (test-messages asserts
-- it sees zero parent contacts because Jea's parent is pending; adding
-- an active Grade 1 parent under TCH-002 would flip that assertion and
-- its own comment would send the next reader hunting a scope bug).
-- Grades encode-scope is teacher_assignments only — an adviser with no
-- assignment rows cannot encode a letter — so TCH-003 gets all five
-- Grade 1 subjects in Mabait. Deliberately NOT Matipid: the grades
-- suite raw-inserts (TCH-001, Grade 1 Mathematics, Matipid) and would
-- collide on uq_teacher_assignment if a seeded row used that tuple.
INSERT INTO users (login_id, password, role, status, name, email, contact_number, student_id, created_by, approved_by) VALUES
  ('TCH-003', '${teacherHash}', 'teacher', 'active', 'Lito Bautista', 'lbautista@chfes.edu.ph', '09170000005', NULL, 1, NULL);

UPDATE students SET created_by = (SELECT id FROM users WHERE login_id = 'TCH-003')
  WHERE lrn = '1090001';

INSERT INTO users (login_id, password, role, status, name, email, contact_number, student_id, created_by, approved_by) VALUES
  ('1090001', '${parentHash}', 'parent', 'active', 'Rosa Alcantara', 'rosa.a@email.com', '09170000006',
   (SELECT id FROM students WHERE lrn = '1090001'),
   (SELECT id FROM (SELECT id FROM users WHERE login_id = 'TCH-003') AS tch003),
   1);

-- The browser-fixture learner's parent (pre-Stage-5 #3b, 2026-09-25): ACTIVE,
-- so the parent-side screens can be checked on this learner while the suites
-- keep Marwin. Plainly fictional ("Halimbawa" = example). Created by TCH-001,
-- the adviser — the enrolment rule — and approved by the admin. Mirrored by
-- scripts/migrate-fixture-learner.js for a live database.
INSERT INTO users (login_id, password, role, status, name, email, contact_number, student_id, created_by, approved_by) VALUES
  ('136893260001', '${parentHash}', 'parent', 'active', 'Ligaya Halimbawa', 'ligaya.h@email.com', '09170000007',
   (SELECT id FROM students WHERE lrn = '136893260001'), 2, 1);

INSERT INTO teacher_assignments (teacher_id, subject_id, grade_level, section)
SELECT 2, s.id, s.grade_level, 'Malikhain'
FROM subjects s
WHERE s.grade_level = 6 AND s.name IN ('Mathematics', 'English', 'Filipino');

INSERT INTO teacher_assignments (teacher_id, subject_id, grade_level, section)
SELECT u.id, s.id, s.grade_level, 'Mabait'
FROM users u
CROSS JOIN subjects s
WHERE u.login_id = 'TCH-003' AND s.grade_level = 1;

INSERT INTO activity_logs (user_id, action, description) VALUES
  (1, 'seed', 'Initial admin account seeded'),
  (2, 'seed', 'Sample teacher account seeded'),
  (1, 'seed', 'Second sample teacher account seeded (adviser, Grade 5 - Masigasig)'),
  (1, 'seed', 'Third sample teacher account seeded (adviser + subject teacher, Grade 1 - Mabait)'),
  (1, 'seed', 'Browser-fixture learner and parent seeded (Grade 6 - Malikhain; nobody''s test target)');
`;
}

// Stage A of the sections migration: schema + seed only, no route changes.
// students.section / teacher_assignments.section / announcements.target_section
// stay as the VARCHAR columns every route still reads and writes — section_id
// is populated here for verification only, not yet relied on by anything.
// A NULL section_id after this runs means the VARCHAR value has no matching
// row in `sections` (wrong name, wrong grade, or a value seed.sql's 23
// sections simply don't cover) — reported below, never silently ignored.
async function backfillSectionIds(connection) {
  await connection.query(`
    UPDATE students s
      JOIN sections sec
        ON sec.name = s.section
       AND sec.grade_level = s.grade_level
       AND sec.school_year = '2026-2027'
      SET s.section_id = sec.id
  `);

  await connection.query(`
    UPDATE teacher_assignments ta
      JOIN sections sec
        ON sec.name = ta.section
       AND sec.grade_level = ta.grade_level
       AND sec.school_year = '2026-2027'
      SET ta.section_id = sec.id
  `);

  await connection.query(`
    UPDATE announcements a
      JOIN sections sec
        ON sec.name = a.target_section
       AND sec.grade_level = a.target_grade
       AND sec.school_year = '2026-2027'
      SET a.section_id = sec.id
    WHERE a.target_section IS NOT NULL
  `);

  const [studentRows] = await connection.query(
    'SELECT section, grade_level, COUNT(*) AS c FROM students WHERE section_id IS NULL GROUP BY section, grade_level'
  );
  const [assignmentRows] = await connection.query(
    `SELECT section, grade_level, COUNT(*) AS c FROM teacher_assignments
     WHERE section_id IS NULL GROUP BY section, grade_level`
  );
  // Scoped to target_section IS NOT NULL — a school-wide announcement
  // (target_section NULL by design) has no section to match and is not a
  // backfill mismatch, unlike a grade+section-targeted one that failed to match.
  const [announcementRows] = await connection.query(
    `SELECT target_section AS section, target_grade AS grade_level, COUNT(*) AS c FROM announcements
     WHERE section_id IS NULL AND target_section IS NOT NULL GROUP BY target_section, target_grade`
  );

  console.log('\nsection_id backfill results:');
  reportUnmatched('students', studentRows);
  reportUnmatched('teacher_assignments', assignmentRows);
  reportUnmatched('announcements (target_section-scoped only)', announcementRows);
}

function reportUnmatched(tableName, rows) {
  const total = rows.reduce((sum, row) => sum + row.c, 0);
  if (total === 0) {
    console.log(`  ${tableName}: 0 rows with NULL section_id.`);
    return;
  }
  console.log(`  ${tableName}: ${total} row(s) with NULL section_id — unmatched values:`);
  for (const row of rows) {
    console.log(`    "${row.section}" (grade ${row.grade_level}) — ${row.c} row(s)`);
  }
}

async function main() {
  console.log('Connecting to MySQL...');
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    console.log('Dropping existing database (if any)...');
    await connection.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);

    console.log('Running schema.sql...');
    await runSqlFile(connection, SCHEMA_PATH);

    console.log('Running seed.sql...');
    const seedSql = await buildSeedSql();

    await connection.query(seedSql);

    console.log('Backfilling section_id from existing VARCHAR values...');
    await backfillSectionIds(connection);

    // D-102 (B7): the demo learner's five Grade 1 letters get the scores and
    // highest possible scores that compute them — the same module the live
    // database's db:migrate:demo-grade1 runs, so the two agree.
    console.log("Scoring the demo learner's Grade 1 letters (scripts/demoGrade1.js)...");
    const demo = await applyDemoGrade1(connection);
    console.log(`  ${demo.filter((r) => r.state === 'applied').length} of ${demo.length} rows scored`);

    console.log('\nDatabase setup complete.\n');
    console.log('Default accounts:');
    console.log('  Admin:   ADMIN001  / Admin@2026');
    console.log('  Teacher: TCH-001   / Teacher@2026  (Grade 6 - Malikhain)');
    console.log('  Teacher: TCH-002   / Teacher@2026  (adviser-only, Grade 5 - Masigasig)');
    console.log('  Teacher: TCH-003   / Teacher@2026  (Grade 1 - Mabait, all five subjects)');
    console.log('  Parent:  13567454  / Parent@2026  (active — Marwin, Grade 6 numerical)');
    console.log('  Parent:  1234567   / Parent@2026  (pending — Jea, for approval flow testing)');
    console.log('  Parent:  1090001   / Parent@2026  (active — Nino, Grade 1 descriptive)');
  } catch (error) {
    console.error('Database setup failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// The seed SQL exactly as db:setup runs it. Exported, with the two helpers
// beside it, for B7's disposable-schema proof (a fresh setup and the live
// database agree on D-102's rows); `npm run db:setup` is unchanged.
async function buildSeedSql() {
  let seedSql = fs.readFileSync(SEED_PATH, 'utf8');
  const userSeed = await buildUserSeedSql();
  seedSql = seedSql.replace('-- __SEED_USERS__', userSeed);
  seedSql = seedSql.replace('-- __SEED_ASSIGNMENTS__', '');
  seedSql = seedSql.replace('-- __SEED_ACTIVITY__', '');
  return seedSql;
}

if (require.main === module) main();

module.exports = { SCHEMA_PATH, buildSeedSql, backfillSectionIds };
