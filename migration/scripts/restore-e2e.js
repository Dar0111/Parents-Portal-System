#!/usr/bin/env node
// A REAL RESTORE THROUGH THE API (P3-C-R2 Phase H) — on a DISPOSABLE database
// only, never the transfer target: test:restore never runs one, by design.
//
//   1. the seeded admin signs in (its default password read from setup-db.js
//      at run time, never printed); on a fresh setup the admin has no
//      confirmed contact, so one `.invalid` address is marked confirmed by SQL
//      for the run and put back afterwards (nothing is ever sent);
//   2. POST /api/backups — the archive to restore (the database as it is);
//   3. POST /api/backups/:id/restore with the password and the typed name, and
//      — once that restore has STARTED its safety archive (its pre_restore_
//      file appears in server/backups) — a second restore of the same archive
//      and a manual POST /api/backups. The second restore must be 409
//      RESTORE_RUNNING and LOGGED as restore_refused (review finding backup-3,
//      counted by action, never by description); the manual backup 409
//      RESTORE_RUNNING (backup-1's guard); the first 200;
//   4. after: every session is invalid (the old token 401), every table's row
//      count is what it was but backups (+2: the archive and the safety one)
//      and activity_logs (the restore rewinds it, then writes its own rows);
//      no sequence moved backwards; the archive and the safety archive are
//      deleted through the API and their files are gone.
//
//   node scripts/restore-e2e.js --api http://127.0.0.1:5010
// under the session's runner with PG_DATABASE naming the database the API on
// that port uses.
const fs = require('fs');
const path = require('path');
const { seededAccounts, call } = require('./golden-master');

const SERVER = path.join(__dirname, '..', '..', 'server');
const BACKUPS_DIR = path.join(SERVER, 'backups');
const { Client } = require(path.join(SERVER, 'node_modules', 'pg'));
const db = require(path.join(SERVER, 'config', 'db.js'));
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

async function tableCounts(c) {
  const { rows } = await c.query(
    `SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'portal' AND c.relkind = 'r' ORDER BY c.relname`
  );
  const out = {};
  for (const r of rows) out[r.t] = Number((await c.query(`SELECT count(*) AS n FROM portal.${r.t}`)).rows[0].n);
  return out;
}

async function sequenceNexts(c) {
  const { rows } = await c.query(
    `SELECT s.relname AS seq FROM pg_class s JOIN pg_namespace n ON n.oid = s.relnamespace WHERE s.relkind = 'S' AND n.nspname = 'portal' ORDER BY s.relname`
  );
  const out = {};
  for (const r of rows) {
    const st = (await c.query(`SELECT last_value, is_called FROM portal.${r.seq}`)).rows[0];
    out[r.seq] = st.is_called ? Number(st.last_value) + 1 : Number(st.last_value);
  }
  return out;
}

async function main() {
  const API = arg('--api');
  if (!LOOPBACK.test(API || '')) throw new Error('--api must be a loopback base URL');
  const owner = db.settings('migrate');
  if (owner.database === 'parents_portal_pg') throw new Error('a disposable database only (PG_DATABASE), never the transfer target');
  const acct = seededAccounts().admin;
  const problems = [];
  const c = new Client(owner);
  await c.connect();
  let contactBefore = null;
  const madeBackups = [];
  try {
    const adminRow = (await c.query('SELECT id, email, email_verified_at::text AS v FROM portal.users WHERE login_id = $1', [acct.login])).rows[0];
    contactBefore = adminRow;
    if (!adminRow.v) {
      await c.query("UPDATE portal.users SET email = 'restore-e2e-admin@example.invalid', email_verified_at = portal.now_s() WHERE id = $1", [adminRow.id]);
    }
    const login = async () => {
      const r = await call(API, 'POST', '/api/auth/login', { body: { login_id: acct.login, password: acct.password } });
      if (r.status !== 200) throw new Error(`the admin sign-in answered ${r.status}`);
      let token = r.json.token;
      const me = (await call(API, 'GET', '/api/auth/me', { token })).json.user;
      if (me.policy_pending) {
        const docs = (await call(API, 'GET', '/api/policy', { token })).json.documents;
        const versions = Object.fromEntries(docs.map((d) => [d.document, d.version]));
        const acc = await call(API, 'POST', '/api/policy/accept', { token, body: { versions } });
        if (acc.status !== 200) throw new Error(`the policy accept answered ${acc.status}`);
      }
      return token;
    };
    let token = await login();

    const created = await call(API, 'POST', '/api/backups', { token });
    if (created.status !== 201) throw new Error(`POST /api/backups answered ${created.status}`);
    const target = created.json.backup;
    madeBackups.push(target.id);
    const refusedBefore = Number((await c.query("SELECT count(*) AS n FROM portal.activity_logs WHERE action = 'restore_refused' AND user_id = $1", [adminRow.id])).rows[0].n);
    const countsBefore = await tableCounts(c);
    const seqBefore = await sequenceNexts(c);
    const filesBefore = new Set(fs.readdirSync(BACKUPS_DIR));

    const body = { password: acct.password, confirm_filename: target.filename };
    const first = call(API, 'POST', `/api/backups/${target.id}/restore`, { token, body });
    // Wait for the first restore's safety archive to start.
    let started = false;
    for (let i = 0; i < 200 && !started; i += 1) {
      started = fs.readdirSync(BACKUPS_DIR).some((f) => f.startsWith('pre_restore_') && !filesBefore.has(f));
      if (!started) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const [second, manual] = await Promise.all([
      call(API, 'POST', `/api/backups/${target.id}/restore`, { token, body }),
      call(API, 'POST', '/api/backups', { token }),
    ]);
    const done = await first;
    console.log(`first restore ${done.status}; second restore ${second.status} ${second.json && second.json.code}; manual backup ${manual.status} ${manual.json && manual.json.code}; the second request was sent after the first's safety archive started: ${started}`);
    if (!started) problems.push('the first restore never started its safety archive');
    if (done.status !== 200) problems.push(`the first restore answered ${done.status}`);
    if (!(second.status === 409 && second.json.code === 'RESTORE_RUNNING')) problems.push('the second restore was not refused RESTORE_RUNNING');
    if (!(manual.status === 409 && manual.json.code === 'RESTORE_RUNNING')) problems.push('the manual backup was not refused RESTORE_RUNNING');
    if (manual.status === 201) madeBackups.push(manual.json.backup.id);
    if (done.status === 200) madeBackups.push(done.json.safety_backup.id);

    const old = await call(API, 'GET', '/api/auth/me', { token });
    console.log(`the old session after the restore: ${old.status}`);
    if (old.status !== 401) problems.push('the old session still works after the restore');
    token = await login();

    // The refusal is written while the first restore is still making its
    // safety archive — BEFORE its transaction — so that restore rewinds it
    // with the rest of activity_logs, as the route documents for every
    // refusal made just before a successful restore. It is then in the
    // restore's lost-entries count: rows above the archive's highest id are
    // the archive's own create_backup row (written after its file), this
    // refusal and the safety archive's create_backup row — 3; without the
    // refusal's log line, 2 (serve-pg.js --mutant no-running-log).
    const wiped = done.status === 200 ? done.json.activity_logs_wiped : null;
    const expectWiped = process.argv.includes('--expect-unlogged') ? 2 : 3;
    const refusedAfter = Number((await c.query("SELECT count(*) AS n FROM portal.activity_logs WHERE action = 'restore_refused' AND user_id = $1", [adminRow.id])).rows[0].n);
    const markers = (await c.query("SELECT action, count(*)::int AS n FROM portal.activity_logs WHERE action IN ('restore_backup', 'restore_wiped_activity_logs') AND user_id = $1 GROUP BY action ORDER BY action", [adminRow.id])).rows;
    console.log(`activity_logs entries the restore wiped: ${wiped} (expected ${expectWiped}); restore_refused rows ${refusedBefore} -> ${refusedAfter} (rewound with the rest); after it: ${markers.map((m) => `${m.action} ${m.n}`).join(', ')}`);
    if (wiped !== expectWiped) problems.push(`the restore wiped ${wiped} activity_logs entries, expected ${expectWiped}`);
    if (!markers.find((m) => m.action === 'restore_backup') || !markers.find((m) => m.action === 'restore_wiped_activity_logs')) problems.push('the restore did not write its own two activity rows');

    const countsAfter = await tableCounts(c);
    const changed = Object.keys(countsBefore).filter((t) => countsBefore[t] !== countsAfter[t] && !['backups', 'activity_logs', 'auth_codes', 'login_attempts', 'policy_acceptances'].includes(t));
    console.log(`backups ${countsBefore.backups} -> ${countsAfter.backups}; tables otherwise changed: ${changed.length ? changed.join(', ') : 'none'}`);
    if (countsAfter.backups !== countsBefore.backups + 1) problems.push('the backups catalog did not keep its rows plus the safety archive');
    if (changed.length) problems.push(`row counts changed: ${changed.join(', ')}`);
    const seqAfter = await sequenceNexts(c);
    const backwards = Object.keys(seqBefore).filter((s) => seqAfter[s] < seqBefore[s]);
    console.log(`sequences moved backwards: ${backwards.length ? backwards.join(', ') : 'none'}`);
    if (backwards.length) problems.push(`sequences moved backwards: ${backwards.join(', ')}`);

    for (const id of madeBackups) {
      const del = await call(API, 'DELETE', `/api/backups/${id}`, { token });
      if (del.status !== 200) problems.push(`DELETE /api/backups/${id} answered ${del.status}`);
    }
    const left = fs.readdirSync(BACKUPS_DIR).filter((f) => !filesBefore.has(f) && f !== target.filename);
    console.log(`archives this run made, deleted: ${madeBackups.length}; files of this run left in server/backups: ${left.length}`);
    if (left.length) problems.push('files of this run are left in server/backups');
  } finally {
    if (contactBefore && !contactBefore.v) {
      await c.query('UPDATE portal.users SET email = $1, email_verified_at = NULL WHERE id = $2', [contactBefore.email, contactBefore.id]).catch(() => {});
    }
    await c.end().catch(() => {});
  }
  console.log(problems.length ? `RESTORE E2E: ${problems.join('; ')}` : 'RESTORE E2E OK');
  process.exitCode = problems.length ? 1 : 0;
}

main().catch((e) => {
  console.error('restore-e2e failed:', e.code || e.message);
  process.exit(1);
});
