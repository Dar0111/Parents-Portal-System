// fix/demo-passwords (2026-11-02) — SETS THE DEMO PASSWORDS AGAIN. The values
// typed for the load on 2026-11-01 were saved nowhere, so nobody could sign in
// to the demo accounts. Same owner connection and guard as scripts/demo-load.js.
//
//   npm run demo:passwords                 a dry run: BEGIN READ ONLY, counts only
//   npm run demo:passwords -- --apply      ONE transaction; any error rolls it back
//
// A non-loopback host also needs PORTAL_DEMO_HOSTED=production-demo-load in that
// one command (demoData.js assertTarget). DEMO_TEACHER_PASSWORD and
// DEMO_PARENT_PASSWORD are read from the terminal's environment, dropped from it
// at once and never written to a file (docs/DEMO_DATA.md). There are two values
// and they go by ROLE: pre-confirmed or not is a state of the account, and that
// state stays.
//
// WHAT IT WRITES, and nothing else:
//   users.password   marked accounts whose holder has changed nothing
//   users.email      the 11 new pre-confirmed accounts, to SMTP_USER: the load
//                    stored a mistyped address, and the reset codes bounced.
//                    SMTP_USER and not SMTP_FROM, which carries a display name
//   activity_logs    one row, counts only
// users.updated_at moves with both, by trigger (trg_users_updated_at).
//
// IT NEVER WRITES password_changed_at, token_version or must_change_password:
// the first two are how an account the holder changed is told from one they did
// not, so writing them would make a re-run skip everyone and a mistyped value
// could never be repaired. No alert, no notification, no socket emit.
//
// ADMIN001, TCH-001, TCH-002, TCH-003 and the seeded parents carry no marker and
// are never written. A kept account still on the load's address is counted and
// left for Module 13.
//
// THIS SCRIPT PRINTS COUNTS. Never a name, an LRN, a login id, an email, a
// password or a hash; reportFailure() is the only error path.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../config/db');
const { hashPassword, comparePassword } = require('../utils/password');
const { validateNewPassword } = require('../utils/passwordRule');
const { validateEmail } = require('../utils/emailRule');
const demo = require('./demoData');
const { COUNT_TABLES, atStep, reportFailure, ownerSettings, connectOwner, begin, tableCounts, printCounts } = require('./demo-load');

const { Refusal } = demo;

const SENDER_KEY = 'SMTP_USER';

// The same clause the plan decided on, repeated in the statement: a holder who
// changes a password between the read and the write makes the count differ, and
// the whole transaction rolls back.
const WRITE_PASSWORD = `UPDATE users SET password = ?
                         WHERE id = ANY(?::int[]) AND password_changed_at IS NULL AND token_version = 0`;
const WRITE_CONTACT = `UPDATE users SET email = ?
                        WHERE id = ANY(?::int[]) AND contact_verified_at IS NULL AND email_verified_at IS NOT NULL`;

// Validated before anything else; a refusal names the variable, never a value.
function readValues() {
  const keys = { teacher: demo.SECRET_KEYS.teacher, parent: demo.SECRET_KEYS.parent };
  const values = {};
  const problems = [];
  for (const [role, key] of Object.entries(keys)) {
    const value = process.env[key];
    if (!value) problems.push(`${key} is not set.`);
    else if (validateNewPassword(value)) problems.push(`${key} does not meet the password rule.`);
    else values[role] = value;
  }
  if (values.teacher && values.teacher === values.parent) {
    problems.push(`${keys.teacher} and ${keys.parent} must differ.`);
  }

  const rawSender = process.env[SENDER_KEY];
  const sender = validateEmail(rawSender);
  if (!rawSender) problems.push(`${SENDER_KEY} is not set.`);
  else if (sender.error) problems.push(`${SENDER_KEY} is not a bare email address.`);

  if (problems.length) throw new Refusal(problems.join('\n  '));
  for (const key of Object.values(keys)) delete process.env[key];
  return { ...values, sender: sender.value };
}

async function readFacts(conn) {
  const { rows: settings } = await conn.query('SELECT setting_value FROM system_settings WHERE setting_key = ?', [demo.MANIFEST_KEY]);
  if (!settings.length) throw new Refusal('No demo load here: the manifest is missing.');

  const lrnMarker = `${demo.LRN_PREFIX}%`;
  const { rows: accounts } = await conn.query(
    `SELECT id, login_id, role::text AS role, password, email, email_verified_at, contact_verified_at,
            password_changed_at, token_version, must_change_password
       FROM users
      WHERE (role = 'teacher' AND login_id COLLATE "und-x-icu" LIKE ?)
         OR (role = 'parent' AND login_id COLLATE "und-x-icu" LIKE ?)`,
    [`${demo.TEACHER_PREFIX}%`, lrnMarker]
  );
  const { rows: students } = await conn.query('SELECT COUNT(*) AS n FROM students WHERE lrn COLLATE "und-x-icu" LIKE ?', [lrnMarker]);
  const { rows: keptAccounts } = await conn.query('SELECT id, email FROM users WHERE login_id = ANY(?::text[])', [demo.CONFIRMED_EXISTING]);
  return {
    accounts,
    keptAccounts,
    manifest: JSON.parse(settings[0].setting_value),
    markedStudents: Number(students[0].n),
  };
}

async function report(plan, values) {
  const storedHashes = (ids) => new Set(plan.accounts.filter((row) => ids.includes(row.id)).map((row) => row.password)).size;
  let onValue = 0;
  for (const row of plan.skipped) {
    if (await comparePassword(values[row.role], row.password)) onValue += 1;
  }
  console.log(`Marked: ${plan.marked.teachers} teachers, ${plan.marked.parents} parents. Manifest present.`);
  console.log(`Will set: ${plan.write.teacher.length} teachers, ${plan.write.parent.length} parents.`);
  console.log(`Skipped: ${plan.skipped.length} (password changed ${plan.skippedPassword}, contact confirmed ${plan.skippedContact}).`);
  console.log(`Skipped accounts already on their role's typed value: ${onValue} of ${plan.skipped.length} (information only).`);
  console.log(`Stored hashes to replace: ${storedHashes(plan.write.teacher)} teachers, ${storedHashes(plan.write.parent)} parents.`);
  console.log(`Contact fix: ${plan.contactFix.length} of ${plan.confirmedTotal} (own contact kept ${plan.contactKept}, already correct ${plan.contactCorrect}).`);
  console.log(`Kept accounts still on the load's address: ${plan.keptOnLoadAddress} of ${plan.keptTotal}.`);
}

async function writePasswords(conn, ids, hash, label) {
  if (!ids.length) return;
  const { rowCount } = await conn.query(WRITE_PASSWORD, [hash, ids]);
  if (rowCount !== ids.length) throw new Refusal(`${label}: expected ${ids.length} rows, updated ${rowCount}. An account changed during the run; nothing was written.`);
}

// One stored hash per value, and it is the value that was typed.
async function verifyStored(conn, ids, value, label) {
  if (!ids.length) return;
  const { rows } = await conn.query('SELECT DISTINCT password FROM users WHERE id = ANY(?::int[])', [ids]);
  if (rows.length !== 1 || !(await comparePassword(value, rows[0].password))) {
    throw new Refusal(`${label}: the stored password does not match the typed value.`);
  }
}

async function writePlan(conn, plan, values) {
  atStep('hashing the passwords');
  const hashes = { teacher: await hashPassword(values.teacher), parent: await hashPassword(values.parent) };

  atStep('teacher passwords');
  await writePasswords(conn, plan.write.teacher, hashes.teacher, 'Teachers');
  atStep('parent passwords');
  await writePasswords(conn, plan.write.parent, hashes.parent, 'Parents');

  atStep('contact fix');
  if (plan.contactFix.length) {
    const { rowCount } = await conn.query(WRITE_CONTACT, [values.sender, plan.contactFix]);
    if (rowCount !== plan.contactFix.length) {
      throw new Refusal(`Contact fix: expected ${plan.contactFix.length} rows, updated ${rowCount}. An account changed during the run; nothing was written.`);
    }
  }

  atStep('verifying');
  await verifyStored(conn, plan.write.teacher, values.teacher, 'Teachers');
  await verifyStored(conn, plan.write.parent, values.parent, 'Parents');

  atStep('activity');
  const { rows: admin } = await conn.query('SELECT id FROM users WHERE login_id = ?', [demo.ADMIN_LOGIN]);
  await conn.query('INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)', [
    admin[0] ? admin[0].id : null,
    'demo_passwords_set',
    `Demo passwords set: ${plan.write.teacher.length} teachers, ${plan.write.parent.length} parents. Contact fix: ${plan.contactFix.length}.`,
  ]);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const settings = ownerSettings(apply);
  const values = readValues();
  console.log(`Target: ${demo.LOOPBACK.has(settings.host) ? 'loopback' : 'hosted'}.`);

  atStep('connect');
  const { client, conn } = await connectOwner(settings);
  try {
    await begin(conn, apply);
    console.log(apply ? 'BEGIN: one transaction, rollback on any error.' : 'BEGIN READ ONLY: a dry run, nothing can be written.');

    atStep('reading');
    const before = await tableCounts(conn);
    const facts = await readFacts(conn);
    atStep('planning');
    const plan = { ...demo.planPasswords({ ...facts, sender: values.sender }), accounts: facts.accounts };
    if (plan.refusals.length) throw new Refusal(`\n  ${plan.refusals.join('\n  ')}`);
    await report(plan, values);

    if (!apply) {
      await conn.query('ROLLBACK');
      console.log('Dry run complete. Nothing was written.');
      return;
    }

    if (!plan.write.teacher.length && !plan.write.parent.length && !plan.contactFix.length) {
      await conn.query('ROLLBACK');
      console.log('Nothing to write.');
      return;
    }

    await writePlan(conn, plan, values);
    atStep('commit');
    await conn.query('COMMIT');

    atStep('counts');
    await conn.query('SET search_path TO portal, pg_catalog');
    const after = await tableCounts(conn);
    printCounts('Counts per table:', before, after);
    const changed = COUNT_TABLES.filter((table) => table !== 'activity_logs' && after[table] !== before[table]);
    console.log(changed.length ? `Row counts differ: ${changed.join(', ')}.` : 'Row counts equal, activity_logs aside.');
    console.log(`Set: ${plan.write.teacher.length} teachers, ${plan.write.parent.length} parents. Contact fix: ${plan.contactFix.length}.`);
    console.log('Passwords committed.');
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

function run() {
  return main()
    .catch(reportFailure)
    .finally(() => db.end());
}

if (require.main === module) run();

// The gate's negative control compiles a changed copy of this file in memory.
module.exports = { run };
