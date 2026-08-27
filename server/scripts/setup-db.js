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

UPDATE students SET created_by = 2 WHERE lrn IN ('13567454', '1234567');

INSERT INTO users (login_id, password, role, status, name, email, contact_number, student_id, created_by, approved_by) VALUES
  ('13567454', '${parentHash}', 'parent', 'active', 'Ashley Geguiera', 'ashley.g@email.com', '09170000003', 1, 2, 1),
  ('1234567', '${parentHash}', 'parent', 'pending', 'Ashley Geguiera', 'ashley.g@email.com', '09170000003', 2, 2, NULL);

INSERT INTO teacher_assignments (teacher_id, subject_id, grade_level, section)
SELECT 2, s.id, s.grade_level, 'Mabini'
FROM subjects s
WHERE s.grade_level = 6 AND s.name IN ('Mathematics', 'English', 'Filipino');

INSERT INTO activity_logs (user_id, action, description) VALUES
  (1, 'seed', 'Initial admin account seeded'),
  (2, 'seed', 'Sample teacher account seeded');
`;
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
    let seedSql = fs.readFileSync(SEED_PATH, 'utf8');
    const userSeed = await buildUserSeedSql();
    seedSql = seedSql.replace('-- __SEED_USERS__', userSeed);
    seedSql = seedSql.replace('-- __SEED_ASSIGNMENTS__', '');
    seedSql = seedSql.replace('-- __SEED_ACTIVITY__', '');

    await connection.query(seedSql);

    console.log('\nDatabase setup complete.\n');
    console.log('Default accounts:');
    console.log('  Admin:   ADMIN001  / Admin@2026');
    console.log('  Teacher: TCH-001   / Teacher@2026');
    console.log('  Parent:  13567454  / Parent@2026  (active — Marwin)');
    console.log('  Parent:  1234567   / Parent@2026  (pending — Jea, for approval flow testing)');
  } catch (error) {
    console.error('Database setup failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main();
