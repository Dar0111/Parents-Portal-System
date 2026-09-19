// Migration 2 — account recovery (R1, 2026-09-19). Copied from
// scripts/migrate-notifications.js, which is THE MIGRATION TEMPLATE
// (CLAUDE.md → File rules that bite). Its four rules, followed here:
//
//   NEVER DROP ANYTHING.        No DROP, no destructive ALTER.
//   BE IDEMPOTENT, AND PROVE IT. --print-state emits the evidence, so two runs
//                               are compared by diff rather than by reading
//                               the code.
//   ANNOUNCE per object.        created / already present, never silence.
//   MIRROR into schema.sql.     So a clean db:setup produces this same shape.
//
// MySQL 8 has no ADD CONSTRAINT IF NOT EXISTS and no ADD COLUMN IF NOT EXISTS,
// so both are guarded by an information_schema lookup.
//
// Run:  npm run db:migrate:auth-codes
//       npm run db:migrate:auth-codes -- --print-state

require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'parents_portal';

// Kept character-for-character in step with database/schema.sql.
const CREATE_AUTH_CODES = `
CREATE TABLE IF NOT EXISTS auth_codes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  purpose ENUM('password_reset','email_verification') NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  email_snapshot VARCHAR(100) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at TIMESTAMP NULL DEFAULT NULL,
  request_ip VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_codes_lookup (user_id, purpose, consumed_at, expires_at),
  INDEX idx_auth_codes_rate (user_id, purpose, created_at),
  INDEX idx_auth_codes_ip (request_ip, created_at)
) ENGINE=InnoDB`;

const COLUMNS = [
  {
    table: 'users',
    name: 'email_verified_at',
    sql: 'ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP NULL DEFAULT NULL AFTER email',
  },
  {
    table: 'users',
    name: 'password_changed_at',
    sql: 'ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP(3) NULL DEFAULT NULL AFTER password',
  },
  {
    table: 'users',
    name: 'token_version',
    sql: 'ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER password_changed_at',
  },
  {
    table: 'users',
    name: 'must_change_password',
    sql: 'ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_changed_at',
  },
];

const FOREIGN_KEYS = [
  {
    name: 'fk_auth_codes_user',
    sql: 'ALTER TABLE auth_codes ADD CONSTRAINT fk_auth_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
  },
];

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1',
    [DB_NAME, table]
  );
  return rows.length > 0;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [DB_NAME, table, column]
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
  const [[create]] = await conn.query('SHOW CREATE TABLE auth_codes');
  const [constraints] = await conn.query(
    `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_codes' AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY CONSTRAINT_NAME`,
    [DB_NAME]
  );
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
        AND COLUMN_NAME IN ('email_verified_at','password_changed_at','token_version','must_change_password')
      ORDER BY COLUMN_NAME`,
    [DB_NAME]
  );
  const [[{ rowCount }]] = await conn.query('SELECT COUNT(*) AS rowCount FROM auth_codes');

  console.log('--- STATE ---');
  console.log(create['Create Table']);
  console.log('--- FOREIGN KEYS ---');
  constraints.forEach((c) => {
    console.log(`${c.CONSTRAINT_NAME} (${c.COLUMN_NAME}) -> ${c.REFERENCED_TABLE_NAME}(${c.REFERENCED_COLUMN_NAME})`);
  });
  console.log('--- USERS COLUMNS ---');
  cols.forEach((c) => {
    console.log(`${c.COLUMN_NAME} ${c.COLUMN_TYPE} nullable=${c.IS_NULLABLE} default=${c.COLUMN_DEFAULT}`);
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

    const had = await tableExists(conn, 'auth_codes');
    await conn.query(CREATE_AUTH_CODES);
    console.log(had ? 'auth_codes: already present' : 'auth_codes: created');

    for (const c of COLUMNS) {
      if (await columnExists(conn, c.table, c.name)) {
        console.log(`${c.table}.${c.name}: already present`);
      } else {
        await conn.query(c.sql);
        console.log(`${c.table}.${c.name}: created`);
      }
    }

    // password_changed_at must be TIMESTAMP(3). An earlier run of this
    // script created it as a plain TIMESTAMP (whole seconds), which left a
    // one-second hole in token revocation. Widening precision is
    // non-destructive and idempotent — it preserves every stored value and
    // is skipped once already correct, so this stays safe to re-run.
    const [[prec]] = await conn.query(
      `SELECT DATETIME_PRECISION AS p FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_changed_at'`,
      [DB_NAME]
    );
    if (prec && Number(prec.p) !== 3) {
      await conn.query('ALTER TABLE users MODIFY COLUMN password_changed_at TIMESTAMP(3) NULL DEFAULT NULL');
      console.log('users.password_changed_at: widened to TIMESTAMP(3)');
    } else if (prec) {
      console.log('users.password_changed_at: already TIMESTAMP(3)');
    }

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
