// Module 13 (2026-11-03) — THE ACCOUNT STATE, AS BOOLEANS. Admin → Users shows
// a name, a status and an email, and nothing on it says what is confirmed,
// whether the current policy is accepted or whether a temporary password is
// pending. This prints those facts for every account the demo load did not make.
//
//   node scripts/account-state.js        run in server/, on the VPS as portal
//
// READ ONLY: one BEGIN READ ONLY transaction as the API's own role, rolled back.
//
// THE MASK IS THE QUERY, NOT A FILTER ON THE OUTPUT. Every column is worked out
// in SQL, so no login id, name, email or number reaches this process and none
// can be printed. activity_logs is not read. An error prints its code alone.
//
// load_addr: the row still holds the address the demo load wrote and confirmed
// (the manifest's contacts). That address was mistyped on 2026-11-01, so `yes`
// means a code to this account bounces.
//
// `policy` is yes when every CURRENT document is accepted, the rule the sign-in
// gate uses (utils/policy.js).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../config/db');
const policy = require('../utils/policy');
const demo = require('./demoData');

const COLUMNS = [
  ['id', 4],
  ['role', 7],
  ['status', 8],
  ['email_file', 10],
  ['email_ok', 8],
  ['number_file', 11],
  ['number_ok', 9],
  ['policy', 6],
  ['temp', 4],
  ['load_addr', 9],
];

const yesNo = (value) => (value ? 'yes' : 'no');

function stateQuery() {
  const accepted = policy.acceptedCountSql('u.id');
  const sql = `
    WITH manifest AS MATERIALIZED (
      SELECT setting_value::jsonb -> 'contacts' AS contacts
        FROM system_settings
       WHERE setting_key = ?
    ), load_contacts AS (
      SELECT (entry ->> 'id')::int AS user_id, entry ->> 'email_set' AS email
        FROM manifest
       CROSS JOIN LATERAL jsonb_array_elements(manifest.contacts) AS entry
    )
    SELECT u.id,
           u.role::text AS role,
           u.status::text AS status,
           (NULLIF(u.email, '') IS NOT NULL) AS email_file,
           (NULLIF(u.email, '') IS NOT NULL AND u.email_verified_at IS NOT NULL) AS email_ok,
           (NULLIF(u.contact_number, '') IS NOT NULL) AS number_file,
           (NULLIF(u.contact_number, '') IS NOT NULL AND u.contact_verified_at IS NOT NULL) AS number_ok,
           ${accepted.sql} AS accepted,
           (u.must_change_password = 1) AS temp,
           EXISTS (SELECT 1 FROM load_contacts c WHERE c.user_id = u.id AND c.email = u.email) AS load_addr
      FROM users u
     WHERE NOT ((u.role = 'teacher' AND u.login_id COLLATE "und-x-icu" LIKE ?)
             OR (u.role = 'parent' AND u.login_id COLLATE "und-x-icu" LIKE ?))
     ORDER BY u.id`;
  return {
    sql,
    params: [demo.MANIFEST_KEY, ...accepted.params, `${demo.TEACHER_PREFIX}%`, `${demo.LRN_PREFIX}%`],
  };
}

function printRow(cells) {
  console.log(cells.map((cell, index) => String(cell).padEnd(COLUMNS[index][1])).join(' ').trimEnd());
}

function printTable(rows) {
  printRow(COLUMNS.map(([name]) => name));
  for (const row of rows) {
    printRow([
      row.id,
      row.role,
      row.status,
      yesNo(row.email_file),
      yesNo(row.email_ok),
      yesNo(row.number_file),
      yesNo(row.number_ok),
      yesNo(!policy.isPending(row.role, row.accepted)),
      yesNo(row.temp),
      yesNo(row.load_addr),
    ]);
  }
  console.log(`Rows: ${rows.length}.`);
}

async function main() {
  let client = null;
  try {
    client = await db.connect();
    await client.query('BEGIN READ ONLY');
    const { sql, params } = stateQuery();
    const { rows } = await client.query(sql, params);
    await client.query('ROLLBACK');
    printTable(rows);
    console.log('Nothing was written.');
  } finally {
    if (client) client.release();
    await db.end();
  }
}

main().catch((error) => {
  console.error(`FAILED: ${(error && error.code) || 'no code'}`);
  process.exitCode = 1;
});
