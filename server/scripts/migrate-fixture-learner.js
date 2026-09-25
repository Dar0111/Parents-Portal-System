// MIGRATION: the browser-fixture learner and her parent (pre-Stage-5 #3b,
// 2026-09-25).
//
// Built on the convention recorded in scripts/migrate-notifications.js, the
// first migration this repo had. The rules it set and this one follows:
//
//   - NEVER DROP ANYTHING. This INSERTs at most two rows (one student, one
//     parent account) and one activity_logs line. It deletes nothing and
//     updates nothing that already exists.
//   - BE IDEMPOTENT, and PROVE it. A second run reports "already present" for
//     both rows, inserts nothing, and prints the same state block.
//   - ANNOUNCE what it did, per object.
//   - MIRROR into database/seed.sql (the student) and scripts/setup-db.js
//     (the parent, whose hash is built there) so a clean db:setup produces
//     the same two rows. Done in the same dispatch.
//
// WHY A MIGRATION AND NOT `db:setup`: setup-db drops the database — with it
// `activity_logs` (15,000+ rows of audit history) and the `backups` table's
// rows, which is how ten dump files became orphans on 2026-09-07. A seed
// change that must reach a LIVE database arrives through a script like this
// one, never through a rebuild.
//
// WHY THE LEARNER EXISTS: `test:grades` and `test:dashboard` both target
// Marwin (student 1), so no browser-check fixture could sit on his card
// while a suite ran — DV3's run failed sixteen assertions on `409 A grade
// record already exists` (docs/KNOWN_ISSUES.md, "mutually exclusive on
// student 1"). Every suite stays on Marwin; every browser fixture goes on
// this learner. Same section as Marwin ON PURPOSE: TCH-001 is Malikhain's
// adviser and its Mathematics / English / Filipino teacher, so the one
// account a browser check logs in as can encode, record and review for her.
// "Halimbawa" is Filipino for "example" — a plainly fictional family.
//
// The parent account is ACTIVE (so parent-side screens can be checked on
// this learner) with the seed's default parent password, which this script
// reads from the same helper setup-db.js uses and NEVER PRINTS. It never
// prints the login id either: a parent's login id is the child's LRN, half
// a credential (CLAUDE.md §5c). The state block names people and a class.
//
// Run:  node scripts/migrate-fixture-learner.js
//       node scripts/migrate-fixture-learner.js --print-state
//       npm run db:migrate:fixture-learner

require('dotenv').config();
const mysql = require('mysql2/promise');
const { hashPassword } = require('../utils/password');

const DB_NAME = process.env.DB_NAME || 'parents_portal';
const SCHOOL_YEAR = '2026-2027';

// One place for the two rows, matching database/seed.sql and setup-db.js
// field for field. The LRN is 12 digits (the rule since 2026-09-18).
const LEARNER = {
  lrn: '136893260001',
  first_name: 'Tala',
  last_name: 'Halimbawa',
  grade_level: 6,
  section: 'Malikhain',
  birthday: '2014-05-05',
  gender: 'female',
  address: 'Pateros, Metro Manila',
};
const PARENT = {
  name: 'Ligaya Halimbawa',
  email: 'ligaya.h@email.com',
  contact_number: '09170000007',
  // The seed default, as setup-db.js hashes it. Read here, hashed, never
  // echoed. Change every default before any real account exists (CLAUDE.md
  // → BEFORE THE PARENT DEMO).
  password: 'Parent@2026',
};

async function findLearner(conn) {
  const [rows] = await conn.query('SELECT id, first_name, last_name, grade_level, section, section_id, status FROM students WHERE lrn = ? LIMIT 1', [
    LEARNER.lrn,
  ]);
  return rows[0] || null;
}

async function findParent(conn) {
  const [rows] = await conn.query('SELECT id, name, role, status, student_id FROM users WHERE login_id = ? LIMIT 1', [LEARNER.lrn]);
  return rows[0] || null;
}

async function userIdByLogin(conn, loginId) {
  const [rows] = await conn.query('SELECT id FROM users WHERE login_id = ? LIMIT 1', [loginId]);
  return rows[0]?.id || null;
}

async function printState(conn) {
  const learner = await findLearner(conn);
  const parent = await findParent(conn);
  console.log('STATE — the browser-fixture family:');
  if (learner) {
    console.log(
      `  learner : ${learner.first_name} ${learner.last_name}, Grade ${learner.grade_level} - ${learner.section}` +
        ` (student #${learner.id}, section_id ${learner.section_id ?? 'NULL — investigate'}, ${learner.status})`
    );
  } else {
    console.log('  learner : absent');
  }
  if (parent) {
    console.log(`  parent  : ${parent.name} (${parent.role}, ${parent.status}, linked to student #${parent.student_id ?? 'NULL — investigate'})`);
  } else {
    console.log('  parent  : absent');
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

    // Preconditions this script will not invent: the section row and the
    // adviser account. Absent either, stop and say so — a learner with a
    // NULL section_id is what `backfillSectionIds()` exists to report.
    const [[section]] = await conn.query(
      'SELECT id, adviser_id FROM sections WHERE grade_level = ? AND name = ? AND school_year = ? LIMIT 1',
      [LEARNER.grade_level, LEARNER.section, SCHOOL_YEAR]
    );
    if (!section) {
      console.error(`ABORT — no sections row for Grade ${LEARNER.grade_level} - ${LEARNER.section} in ${SCHOOL_YEAR}. Nothing inserted.`);
      process.exitCode = 1;
      return;
    }
    const adviserId = await userIdByLogin(conn, 'TCH-001');
    const adminId = await userIdByLogin(conn, 'ADMIN001');
    if (!adviserId || !adminId) {
      console.error('ABORT — TCH-001 or ADMIN001 is missing; the learner is created by the adviser and the parent approved by the admin. Nothing inserted.');
      process.exitCode = 1;
      return;
    }

    // ---- object 1: the learner ----
    let learner = await findLearner(conn);
    if (learner) {
      console.log(`students (${LEARNER.first_name} ${LEARNER.last_name}) : already present (#${learner.id})`);
    } else {
      const [res] = await conn.query(
        `INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, birthday, gender, address, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          LEARNER.lrn,
          LEARNER.first_name,
          LEARNER.last_name,
          LEARNER.grade_level,
          LEARNER.section,
          section.id,
          LEARNER.birthday,
          LEARNER.gender,
          LEARNER.address,
          adviserId,
        ]
      );
      console.log(`students (${LEARNER.first_name} ${LEARNER.last_name}) : created (#${res.insertId})`);
      learner = await findLearner(conn);
    }

    // ---- object 2: the parent account ----
    const parent = await findParent(conn);
    if (parent) {
      console.log(`users (${PARENT.name}, parent) : already present (#${parent.id})`);
    } else {
      const hash = await hashPassword(PARENT.password);
      const [res] = await conn.query(
        `INSERT INTO users (login_id, password, role, status, name, email, contact_number, student_id, created_by, approved_by)
         VALUES (?, ?, 'parent', 'active', ?, ?, ?, ?, ?, ?)`,
        [LEARNER.lrn, hash, PARENT.name, PARENT.email, PARENT.contact_number, learner.id, adviserId, adminId]
      );
      console.log(`users (${PARENT.name}, parent) : created (#${res.insertId}, active)`);
      await conn.query('INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)', [
        adminId,
        'seed',
        'Browser-fixture learner and parent added by migrate-fixture-learner.js (Grade 6 - Malikhain; nobody\'s test target)',
      ]);
      console.log('activity_logs : one seed line written');
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
