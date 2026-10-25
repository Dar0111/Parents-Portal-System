#!/usr/bin/env node
// THE BROWSER SMOKE ON POSTGRESQL (P3-C-R2 Phase J) — client/e2e/smoke.spec.js
// against this session's own servers: the ported API on 5010 and Vite on 3010.
//
// The smoke reads its five accounts from client/e2e/.env.e2e, which this
// worktree does not have — and must not get: a file holding the passwords is
// exactly what that guard exists to prevent. playwright.config.js lets the
// environment win over the file, so this wrapper derives the accounts IN
// MEMORY and hands them to Playwright as environment variables:
//   - the default passwords, from server/scripts/setup-db.js (the one place
//     they live; golden-master.js reads them the same way);
//   - the login ids, from the database the API uses, by role and by child:
//     the admin; Nino's (Grade 1) parent and that class's adviser; Marwin's
//     (Grade 6) parent and that class's adviser.
// Nothing is printed but Playwright's own report (titles name the child or the
// role, never a login id), and the session's runner masks that too.
//
// Run under the session's runner (the PG_* keys — the smoke's own fixture,
// client/e2e/auth.js, connects through server/scripts/test-helpers/db.js):
//   node scripts/smoke-pg.js --app http://localhost:3010 --api http://127.0.0.1:5010
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'server');
const CLIENT = path.join(ROOT, 'client');
const { Client } = require(path.join(SERVER, 'node_modules', 'pg'));
const db = require(path.join(SERVER, 'config', 'db.js'));

const ALLOWED = { app: 'http://localhost:3010', api: 'http://127.0.0.1:5010' };

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

function passwords() {
  const src = fs.readFileSync(path.join(SERVER, 'scripts', 'setup-db.js'), 'utf8');
  const out = {};
  for (const m of src.matchAll(/const (admin|teacher|parent)Hash = bcrypt\.hashSync\('([^']*)', 10\)/g)) out[m[1]] = m[2];
  if (!out.admin || !out.teacher || !out.parent) throw new Error('setup-db.js no longer holds the three default passwords where expected');
  return out;
}

async function loginIds() {
  const c = new Client(db.settings('migrate'));
  await c.connect();
  try {
    const one = async (sql, params, what) => {
      const { rows } = await c.query(sql, params);
      if (rows.length !== 1) throw new Error(`expected exactly one ${what}, found ${rows.length}`);
      return rows[0].login_id;
    };
    const parentOf = (first) =>
      one(
        `SELECT u.login_id FROM portal.users u JOIN portal.students s ON s.id = u.student_id
          WHERE u.role = 'parent' AND u.status = 'active' AND s.first_name = $1`,
        [first],
        `active parent of the ${first === 'Nino' ? 'Grade 1' : 'Grade 6'} learner`
      );
    const adviserOf = (first) =>
      one(
        `SELECT t.login_id FROM portal.students s JOIN portal.sections sec ON sec.id = s.section_id
           JOIN portal.users t ON t.id = sec.adviser_id
          WHERE s.first_name = $1 AND t.status = 'active'`,
        [first],
        `adviser of the ${first === 'Nino' ? 'Grade 1' : 'Grade 6'} learner`
      );
    return {
      admin: await one("SELECT login_id FROM portal.users WHERE role = 'admin' AND status = 'active' ORDER BY id LIMIT 1", [], 'admin'),
      teacher: await adviserOf('Nino'),
      parent: await parentOf('Nino'),
      teacher2: await adviserOf('Marwin'),
      parent2: await parentOf('Marwin'),
    };
  } finally {
    await c.end();
  }
}

async function main() {
  const app = arg('--app');
  const api = arg('--api');
  if (app !== ALLOWED.app || api !== ALLOWED.api) throw new Error(`--app must be ${ALLOWED.app} and --api ${ALLOWED.api} (this session's ports)`);
  const pw = passwords();
  const ids = await loginIds();
  const env = {
    ...process.env,
    E2E_APP_ORIGIN: app,
    E2E_API_ORIGIN: api,
    E2E_ADMIN_ID: ids.admin,
    E2E_ADMIN_PW: pw.admin,
    E2E_TEACHER_ID: ids.teacher,
    E2E_TEACHER_PW: pw.teacher,
    E2E_PARENT_ID: ids.parent,
    E2E_PARENT_PW: pw.parent,
    E2E_TEACHER2_ID: ids.teacher2,
    E2E_TEACHER2_PW: pw.teacher,
    E2E_PARENT2_ID: ids.parent2,
    E2E_PARENT2_PW: pw.parent,
  };
  const cli = path.join(CLIENT, 'node_modules', '@playwright', 'test', 'cli.js');
  // Anything after `--` goes to Playwright as it is (e.g. -g to run one test).
  const dashes = process.argv.indexOf('--');
  const extra = dashes > 0 ? process.argv.slice(dashes + 1) : [];
  const child = spawn(process.execPath, [cli, 'test', '--config', path.join(CLIENT, 'playwright.config.js'), ...extra], {
    cwd: CLIENT,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
  const code = await new Promise((resolve) => child.on('close', (c) => resolve(c === null ? 1 : c)));
  console.log(`smoke-pg: playwright exited ${code}`);
  process.exitCode = code;
}

main().catch((e) => {
  console.error('smoke-pg failed:', e.code || e.message);
  process.exit(1);
});
