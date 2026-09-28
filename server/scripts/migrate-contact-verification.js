// Migration — a confirmed mobile number (feat/sms-transport, 2026-09-29).
// Copied from scripts/migrate-auth-codes.js, which follows THE MIGRATION
// TEMPLATE (scripts/migrate-notifications.js; CLAUDE.md → File rules that
// bite). Its four rules, followed here:
//
//   NEVER DROP ANYTHING.        No DROP. The two MODIFYs only WIDEN: an ENUM
//                               gains a value at the end, and a NOT NULL
//                               column becomes NULL-able. Every stored value
//                               survives both.
//   BE IDEMPOTENT, AND PROVE IT. --print-state emits the evidence, so two runs
//                               are compared by diff rather than by reading
//                               the code.
//   ANNOUNCE per object.        created / already present, never silence.
//   MIRROR into schema.sql.     So a clean db:setup produces this same shape.
//
// What it adds, and why:
//   users.contact_verified_at        the twin of email_verified_at — NULL until
//                                    the account proves it receives texts at
//                                    that number. Seeded NULL for everyone.
//   auth_codes.purpose + 'contact_verification'
//                                    one table, one lifecycle, one set of
//                                    limits (utils/authCodes.js).
//   auth_codes.contact_snapshot      WHICH number a code went to. Confirm
//                                    refuses when it no longer matches the
//                                    account's number, so a code sent to an
//                                    old number cannot confirm a new one.
//   auth_codes.email_snapshot → NULL-able
//                                    a code sent only by text has no email.
//
// Run:  npm run db:migrate:contact-verification
//       npm run db:migrate:contact-verification -- --print-state

require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'parents_portal';

const PURPOSES = "ENUM('password_reset','email_verification','contact_verification')";

async function column(conn, table, name) {
  const [rows] = await conn.query(
    `SELECT COLUMN_TYPE AS type, IS_NULLABLE AS nullable FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [DB_NAME, table, name]
  );
  return rows[0] || null;
}

// The idempotency evidence. Two runs of this must be byte-identical.
async function printState(conn) {
  const [cols] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND ((TABLE_NAME = 'users' AND COLUMN_NAME IN ('contact_number','contact_verified_at'))
          OR (TABLE_NAME = 'auth_codes' AND COLUMN_NAME IN ('purpose','email_snapshot','contact_snapshot')))
      ORDER BY TABLE_NAME, COLUMN_NAME`,
    [DB_NAME]
  );
  const [[{ verified }]] = await conn.query('SELECT COUNT(*) AS verified FROM users WHERE contact_verified_at IS NOT NULL');
  const [[{ codes }]] = await conn.query('SELECT COUNT(*) AS codes FROM auth_codes');

  console.log('--- STATE ---');
  cols.forEach((c) => {
    console.log(`${c.TABLE_NAME}.${c.COLUMN_NAME} ${c.COLUMN_TYPE} nullable=${c.IS_NULLABLE} default=${c.COLUMN_DEFAULT}`);
  });
  console.log('--- ROWS ---');
  console.log(`users with a confirmed number: ${verified}`);
  console.log(`auth_codes rows: ${codes}`);
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

    if (!(await column(conn, 'auth_codes', 'purpose'))) {
      throw new Error('auth_codes is missing — run npm run db:migrate:auth-codes first.');
    }

    if (await column(conn, 'users', 'contact_verified_at')) {
      console.log('users.contact_verified_at: already present');
    } else {
      await conn.query('ALTER TABLE users ADD COLUMN contact_verified_at TIMESTAMP NULL DEFAULT NULL AFTER contact_number');
      console.log('users.contact_verified_at: created');
    }

    const purpose = await column(conn, 'auth_codes', 'purpose');
    if (purpose.type.includes("'contact_verification'")) {
      console.log("auth_codes.purpose: already has 'contact_verification'");
    } else {
      await conn.query(`ALTER TABLE auth_codes MODIFY COLUMN purpose ${PURPOSES} NOT NULL`);
      console.log("auth_codes.purpose: 'contact_verification' added");
    }

    const emailSnap = await column(conn, 'auth_codes', 'email_snapshot');
    if (emailSnap.nullable === 'YES') {
      console.log('auth_codes.email_snapshot: already NULL-able');
    } else {
      await conn.query('ALTER TABLE auth_codes MODIFY COLUMN email_snapshot VARCHAR(100) NULL DEFAULT NULL');
      console.log('auth_codes.email_snapshot: now NULL-able');
    }

    if (await column(conn, 'auth_codes', 'contact_snapshot')) {
      console.log('auth_codes.contact_snapshot: already present');
    } else {
      await conn.query('ALTER TABLE auth_codes ADD COLUMN contact_snapshot VARCHAR(20) NULL DEFAULT NULL AFTER email_snapshot');
      console.log('auth_codes.contact_snapshot: created');
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
