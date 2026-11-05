#!/usr/bin/env node
// P4 PART B — BACKUP RESTORATION, CORRUPTED ARCHIVES AND RESTORE FAULTS
// (D-261, the plan's rows B1, S2, K1–K13, R1–R4 and F1–F3). On this run's
// disposable database only, after a fresh db:setup; starts its own API on
// 5010 (and, for F1, a read-only one on 5030). Run-made admin; every result
// read on the observer's own connection, never through the API.
//
//   B1   a real restore through the API returns every table's CONTENT (hash,
//        not only the count) to the archive's, but the documented three:
//        backups (the catalog is kept, plus the safety archive),
//        activity_logs (rewound, then the restore's own rows) and
//        auth_security_state (the cutoff). The old session is then 401.
//   S2   an OLDER archive (Q4): rows added after it are gone, the sequences do
//        not move backwards, and the next id is past every id ever handed out.
//   K    thirteen corrupted archives, each restored with the real password and
//        the typed name, each refused 409 with its code before any write: no
//        safety archive, no file, the cutoff unchanged, one restore_refused
//        row (counted by action, never by description). Control: the
//        untouched archive passes inspectArchive.
//   R1   a member whose value cannot load (COPY 22P02) — inside the
//        transaction, after the safety archive: rolled back, the safety
//        archive the only change.
//   R2   a foreign key broken by a member (23503 at SET CONSTRAINTS ALL
//        IMMEDIATE, after the sequences were moved): rolled back, every
//        sequence exactly as before.
//   R3   restoreArchive called directly: (a) the manifest changed after the
//        check — refused before BEGIN; (b) a member changed after the check
//        with the same manifest — found AFTER the truncate, mid-load: rolled
//        back, every table as it was.
//   R4   Q3: a kept backup row whose creator the archive does not hold —
//        CATALOG_CREATOR_MISSING, rolled back.
//   F1   the pre-restore safety archive fails (an API whose every transaction
//        is READ ONLY): "Restore aborted", nothing changed, no file left.
//   F3   the restore's own database session terminated while it waits for its
//        locks: 500 "rolled back in full", nothing changed but the safety archive.
//   F2   the API process killed while the restore waits for its locks: nothing
//        changed but the safety archive; a restarted API restores normally.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const h = require('../lib/p4b');

h.assertIsolation();
const BASE = process.env.API_BASE;
const BASE_RO = 'http://127.0.0.1:5030';
const archive = h.serverModule('utils', 'backupArchive.js');

const stamp = crypto.randomBytes(3).toString('hex');
const fileOf = (name) => path.join(h.BACKUPS_DIR, name);

async function countAction(c, action) {
  const { rows } = await c.query('SELECT count(*)::int AS n FROM portal.activity_logs WHERE action = $1', [action]);
  return rows[0].n;
}

function manifestOf(entries) {
  return JSON.parse(entries.find(([n]) => n === 'manifest.json')[1].toString('utf8'));
}

function withManifest(entries, manifest) {
  return entries.map(([n, b]) => (n === 'manifest.json' ? [n, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')] : [n, b]));
}

// Replace one member's bytes and keep the manifest's bytes / sha256 true to them.
function editMember(entries, table, edit, { keepManifest = false } = {}) {
  const manifest = manifestOf(entries);
  const name = `data/${table}.csv`;
  let out = entries.map(([n, b]) => (n === name ? [n, Buffer.from(edit(b.toString('utf8')), 'utf8')] : [n, b]));
  if (!keepManifest) {
    const buf = out.find(([n]) => n === name)[1];
    const m = manifest.tables.find((t) => t.table === table);
    m.bytes = buf.length;
    m.sha256 = h.sha256(buf);
    out = withManifest(out, manifest);
  }
  return out;
}

async function main() {
  const checks = h.makeChecks('restore');
  const obs = await h.superClient(process.env.PG_DATABASE, 'p4b-observer');
  const fault = await h.superClient(process.env.PG_DATABASE, 'p4b-fault');
  const report = { cases: {} };
  let api = null;
  let apiRo = null;
  try {
    const admin = await h.makeAccount(obs, { role: 'admin', name: 'P4B Admin' });
    api = h.spawnApi({ port: 5010 });
    checks.check('the API on 5010 started', (await api.ready).ok, api.tail.slice(-5));
    let token = await h.signIn(BASE, admin);
    const restore = (id, filename, base = BASE, tk = token) =>
      h.call(base, 'POST', `/api/backups/${id}/restore`, { token: tk, body: { password: admin.password, confirm_filename: filename } });
    const makeArchive = async () => {
      const r = await h.call(BASE, 'POST', '/api/backups', { token });
      if (r.status !== 201) throw new Error(`backup create answered ${r.status}`);
      return r.data.backup;
    };
    const register = async (name) => {
      const full = fileOf(name);
      const { rows } = await obs.query(
        'INSERT INTO portal.backups (filename, file_path, file_size, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
        [name, full, fs.statSync(full).size, admin.id]
      );
      return rows[0].id;
    };
    const baseline = await h.observe(obs, 'baseline');

    // ---- B1 ---------------------------------------------------------------------
    h.say('\nB1 a real restore returns every table\'s content');
    const h0 = await h.observe(obs, 'B1-h0');
    const A = await makeArchive();
    await obs.query("INSERT INTO portal.announcements (title, content, posted_by) VALUES ('P4B after the archive', 'fixture', $1)", [admin.id]);
    await obs.query("UPDATE portal.system_settings SET setting_value = 'P4B changed after the archive' WHERE setting_key = 'school_name'");
    await obs.query('DELETE FROM portal.grade_components WHERE id = (SELECT min(id) FROM portal.grade_components)');
    const oldToken = token;
    const b1 = await restore(A.id, A.filename);
    checks.check('B1 the restore answers 200', b1.status === 200, b1.status);
    const h1 = await h.observe(obs, 'B1-h1');
    const b1Unexpected = h.unexpectedChanges(h0, h1, ['backups', 'activity_logs', 'auth_security_state']);
    checks.check('B1 every other table\'s content equals the archive\'s (hash by hash)', b1Unexpected.length === 0, b1Unexpected);
    checks.check('B1 the catalog keeps the archive\'s row and gains the safety archive', h1.tables.backups.n === h0.tables.backups.n + 2, `${h0.tables.backups.n} -> ${h1.tables.backups.n}`);
    checks.check('B1 the cutoff row is written', h1.cutoff.rows === 1);
    const stale = await h.call(BASE, 'GET', '/api/auth/me', { token: oldToken });
    checks.check('B1 the session from before the restore is 401', stale.status === 401, stale.status);
    checks.check('B1 no sequence moved backwards', h.sequenceViolations(h1, h0).length === 0, h.sequenceViolations(h1, h0));
    token = await h.signIn(BASE, admin);
    report.cases.B1 = { status: b1.status, unexpected: b1Unexpected };

    // ---- S2 ---------------------------------------------------------------------
    h.say('\nS2 an older archive: rows after it go, the sequences do not go back');
    const A2 = await makeArchive();
    const added = [];
    for (let i = 0; i < 3; i += 1) {
      const { rows } = await obs.query("INSERT INTO portal.announcements (title, content, posted_by) VALUES ('P4B newer', 'fixture', $1) RETURNING id", [admin.id]);
      added.push(rows[0].id);
    }
    const highest = Math.max(...added);
    const s2 = await restore(A2.id, A2.filename);
    checks.check('S2 the restore answers 200', s2.status === 200, s2.status);
    const { rows: still } = await obs.query('SELECT count(*)::int AS n FROM portal.announcements WHERE id = ANY($1::int[])', [added]);
    checks.check('S2 the three rows added after the archive are gone', still[0].n === 0, still[0].n);
    const s2Snap = await h.observe(obs, 'S2-after');
    checks.check(`S2 the announcements sequence did not move back (next ${h.nextValue(s2Snap, 'announcements')} > ${highest})`, h.nextValue(s2Snap, 'announcements') > highest);
    const { rows: fresh } = await obs.query("INSERT INTO portal.announcements (title, content, posted_by) VALUES ('P4B next', 'fixture', $1) RETURNING id", [admin.id]);
    checks.check('S2 the next row gets an id past every id ever handed out', fresh[0].id > highest, `${fresh[0].id} > ${highest}`);
    await obs.query('DELETE FROM portal.announcements WHERE id = $1', [fresh[0].id]);
    token = await h.signIn(BASE, admin);
    report.cases.S2 = { status: s2.status, highest, next: fresh[0].id };

    // ---- K: corrupted archives ------------------------------------------------------
    h.say('\nK corrupted archives, refused before any write');
    const goodFile = fileOf(A.filename);
    const goodBytes = fs.readFileSync(goodFile);
    const goodEntries = await h.readZip(goodFile);
    let controlOk = false;
    try {
      await archive.inspectArchive(goodFile);
      controlOk = true;
    } catch {
      controlOk = false;
    }
    checks.check('K control: the untouched archive passes inspectArchive', controlOk);
    const variants = [
      ['K1', 'not a zip at all', 'ARCHIVE_INVALID', { raw: crypto.randomBytes(4096) }],
      ['K2', 'truncated to half its bytes', 'ARCHIVE_INVALID', { raw: goodBytes.subarray(0, Math.floor(goodBytes.length / 2)) }],
      ['K3', 'no manifest', 'ARCHIVE_INCOMPLETE', { entries: goodEntries.filter(([n]) => n !== 'manifest.json') }],
      ['K4', 'a manifest that is not JSON', 'ARCHIVE_INCOMPLETE', { entries: goodEntries.map(([n, b]) => (n === 'manifest.json' ? [n, Buffer.from('{"format": "parents-portal-copy-archive", ', 'utf8')] : [n, b])) }],
      ['K5', 'a format version this server does not read', 'ARCHIVE_INVALID', { entries: withManifest(goodEntries, { ...manifestOf(goodEntries), format_version: 99 }) }],
      ['K6', 'a listed member missing', 'ARCHIVE_INCOMPLETE', { entries: goodEntries.filter(([n]) => n !== 'data/subjects.csv') }],
      ['K7', 'an unexpected extra member', 'ARCHIVE_INVALID', { entries: [...goodEntries, ['data/p4b_extra.csv', Buffer.from('id\n1\n')]] }],
      ['K8', 'the same member twice', 'ARCHIVE_INVALID', { entries: [...goodEntries, goodEntries.find(([n]) => n === 'data/subjects.csv')] }],
      ['K9', 'a row count that disagrees with the member', 'ARCHIVE_INVALID', (() => {
        const m = manifestOf(goodEntries);
        m.tables.find((t) => t.table === 'subjects').rows += 1;
        return { entries: withManifest(goodEntries, m) };
      })()],
      ['K10', 'a header that disagrees with the manifest\'s column order', 'ARCHIVE_INVALID', (() => {
        const m = manifestOf(goodEntries);
        const t = m.tables.find((x) => x.table === 'subjects');
        t.columns = [...t.columns].reverse();
        return { entries: withManifest(goodEntries, m) };
      })()],
      ['K11', 'a member that ends inside a quoted value (checksum made true)', 'ARCHIVE_INVALID', { entries: editMember(goodEntries, 'system_settings', (s) => `${s}"p4b-unterminated`) }],
      ['K12', 'a schema fingerprint that does not match its own hash', 'ARCHIVE_INVALID', (() => {
        const m = manifestOf(goodEntries);
        m.schema_fingerprint.sha256 = '0'.repeat(64);
        return { entries: withManifest(goodEntries, m) };
      })()],
      ['K13', 'excluded tables that are not exactly auth_codes and backups', 'ARCHIVE_INVALID', { entries: withManifest(goodEntries, { ...manifestOf(goodEntries), excluded_tables: [] }) }],
    ];
    for (const [id, label, code, how] of variants) {
      const name = `p4b_${id}_${stamp}.zip`;
      if (how.raw) fs.writeFileSync(fileOf(name), how.raw, { flag: 'wx' });
      else await h.writeZip(fileOf(name), how.entries);
      const rowId = await register(name);
      const before = await h.observe(obs, `${id}-before`);
      const refusedBefore = await countAction(obs, 'restore_refused');
      const r = await restore(rowId, name);
      const after = await h.observe(obs, `${id}-after`);
      const refusedAfter = await countAction(obs, 'restore_refused');
      const unexpected = h.unexpectedChanges(before, after, ['activity_logs']);
      const ok =
        r.status === 409 &&
        r.data &&
        r.data.code === code &&
        unexpected.length === 0 &&
        after.files.zip.length === before.files.zip.length &&
        after.files.partial === 0 &&
        after.cutoff.at === before.cutoff.at &&
        refusedAfter === refusedBefore + 1;
      checks.check(`${id} ${label}: 409 ${code}, nothing written, one restore_refused row`, ok, {
        status: r.status,
        code: r.data && r.data.code,
        unexpected,
        files: `${before.files.zip.length}->${after.files.zip.length}`,
        refused: refusedAfter - refusedBefore,
      });
      report.cases[id] = { status: r.status, code: r.data && r.data.code };
    }

    // ---- R: failures inside the restore transaction -----------------------------------
    const insideCase = async (id, label, entries, expectCode = null) => {
      const name = `p4b_${id}_${stamp}.zip`;
      await h.writeZip(fileOf(name), entries);
      const rowId = await register(name);
      const before = await h.observe(obs, `${id}-before`);
      const r = await restore(rowId, name);
      const after = await h.observe(obs, `${id}-after`);
      const unexpected = h.unexpectedChanges(before, after, ['backups', 'activity_logs']);
      const seqMoved = before.sequences
        .filter((s) => !['backups', 'activity_logs'].includes(s.table))
        .filter((s) => h.nextValue(after, s.table) !== s.next)
        .map((s) => s.table);
      checks.check(
        `${id} ${label}: ${expectCode ? `409 ${expectCode}` : '500'} with a safety archive, rolled back`,
        (expectCode ? r.status === 409 && r.data && r.data.code === expectCode : r.status === 500) && r.data && r.data.safety_backup,
        { status: r.status, code: r.data && r.data.code }
      );
      checks.check(`${id} every table but the catalog and the log is as it was (content hashes)`, unexpected.length === 0, unexpected);
      checks.check(`${id} the catalog gained exactly the safety archive`, after.tables.backups.n === before.tables.backups.n + 1 && after.files.zip.length === before.files.zip.length + 1, `${before.tables.backups.n}->${after.tables.backups.n}`);
      checks.check(`${id} every sequence exactly as before`, seqMoved.length === 0, seqMoved);
      checks.check(`${id} the cutoff unchanged`, after.cutoff.at === before.cutoff.at && after.cutoff.rows === before.cutoff.rows);
      report.cases[id] = { status: r.status, code: r.data && r.data.code, unexpected, seqMoved };
    };
    h.say('\nR failures inside the restore transaction');
    await insideCase('R1', 'a member value that cannot load (COPY 22P02)', editMember(goodEntries, 'system_settings', (s) => {
      const lines = s.split('\n');
      lines[1] = lines[1].replace(/^\d+/, 'p4b');
      return lines.join('\n');
    }));
    await insideCase('R2', 'a foreign key broken by a member (23503, after the sequences moved)', editMember(goodEntries, 'grades', (s) => {
      const lines = s.split('\n');
      const cols = lines[0].split(',');
      const at = cols.indexOf('student_id');
      const fields = lines[1].split(',');
      fields[at] = '999999';
      lines[1] = fields.join(',');
      return lines.join('\n');
    }));

    h.say('\nR4 Q3: a kept backup whose creator the archive does not hold');
    const A3 = await makeArchive();
    const admin2 = await h.makeAccount(obs, { role: 'admin', name: 'P4B Second Admin' });
    const token2 = await h.signIn(BASE, admin2);
    const b3 = await h.call(BASE, 'POST', '/api/backups', { token: token2 });
    checks.check('R4 the second admin\'s backup exists', b3.status === 201, b3.status);
    const r4Before = await h.observe(obs, 'R4-before');
    const r4 = await restore(A3.id, A3.filename);
    const r4After = await h.observe(obs, 'R4-after');
    const r4Unexpected = h.unexpectedChanges(r4Before, r4After, ['backups', 'activity_logs']);
    checks.check('R4 409 CATALOG_CREATOR_MISSING with a safety archive', r4.status === 409 && r4.data && r4.data.code === 'CATALOG_CREATOR_MISSING' && r4.data.safety_backup, { status: r4.status, code: r4.data && r4.data.code });
    checks.check('R4 rolled back: every table but the catalog and the log as it was; the second admin still exists', r4Unexpected.length === 0, r4Unexpected);
    report.cases.R4 = { status: r4.status, code: r4.data && r4.data.code };

    h.say('\nR3 restoreArchive called directly');
    const db = h.serverDb();
    const { Client } = h.serverModule('node_modules', 'pg');
    const direct = async (id, label, buildSwap, expectMessage) => {
      const name = `p4b_${id}_${stamp}.zip`;
      fs.copyFileSync(goodFile, fileOf(name));
      const inspection = await archive.inspectArchive(fileOf(name));
      await buildSwap(fileOf(name));
      const before = await h.observe(obs, `${id}-before`);
      const c = db.guardClient(new Client({ ...db.settings('migrate'), application_name: 'p4b-direct-restore' }), 'p4b');
      await c.connect();
      let thrown = null;
      try {
        await archive.restoreArchive(c, fileOf(name), inspection);
      } catch (error) {
        thrown = error;
      } finally {
        await c.end().catch(() => {});
      }
      const after = await h.observe(obs, `${id}-after`);
      const unexpected = h.unexpectedChanges(before, after, []);
      checks.check(`${id} ${label}: refused (${expectMessage})`, thrown instanceof archive.ArchiveError && new RegExp(expectMessage).test(thrown.message), thrown ? thrown.message : 'no error');
      checks.check(`${id} every table as it was (content hashes), every sequence too`, unexpected.length === 0 && before.sequences.every((s) => h.nextValue(after, s.table) === s.next), unexpected);
      fs.unlinkSync(fileOf(name));
      report.cases[id] = { refused: Boolean(thrown), unexpected };
    };
    await direct('R3a', 'the manifest changed after the check', async (file) => {
      fs.copyFileSync(fileOf(A3.filename), file);
    }, 'changed after it was checked');
    await direct('R3b', 'a member changed after the check, the manifest the same (found mid-load, after the truncate)', async (file) => {
      const swapped = editMember(goodEntries, 'grade_weight_configs', (s) => {
        const lines = s.split('\n');
        let last = lines.length - 1;
        while (last > 0 && !lines[last]) last -= 1;
        lines[last] = lines[last].replace(/^(\d+)/, (m) => String(Number(m) + 1000));
        return lines.join('\n');
      }, { keepManifest: true });
      fs.unlinkSync(file);
      await h.writeZip(file, swapped);
    }, 'changed after it was checked');

    // ---- F1 --------------------------------------------------------------------------
    h.say('\nF1 the safety archive fails: restore aborted, nothing changed');
    apiRo = h.spawnApi({ port: 5030, env: { PGOPTIONS: '-c default_transaction_read_only=on' } });
    checks.check('F1 the read-only API on 5030 started', (await apiRo.ready).ok, apiRo.tail.slice(-5));
    const f1Before = await h.observe(obs, 'F1-before');
    const f1 = await restore(A.id, A.filename, BASE_RO);
    const f1After = await h.observe(obs, 'F1-after');
    const f1Unexpected = h.unexpectedChanges(f1Before, f1After, ['activity_logs']);
    checks.check('F1 500 "Restore aborted: the pre-restore safety backup failed"', f1.status === 500 && f1.data && /Restore aborted/.test(f1.data.message || ''), f1.status);
    checks.check('F1 every table as it was, no file and no .partial left', f1Unexpected.length === 0 && f1After.files.zip.length === f1Before.files.zip.length && f1After.files.partial === 0, { f1Unexpected, files: `${f1Before.files.zip.length}->${f1After.files.zip.length}` });
    await h.killApi(apiRo);
    apiRo = null;
    report.cases.F1 = { status: f1.status, unexpected: f1Unexpected };

    // ---- F3 and F2: held behind a lock the restore needs ----------------------------------
    const stagedRestore = async (id) => {
      const before = await h.observe(obs, `${id}-before`);
      await fault.query('BEGIN');
      await fault.query('SELECT 1 FROM portal.subjects LIMIT 1'); // ACCESS SHARE: the restore's ACCESS EXCLUSIVE waits
      const pending = restore(A.id, A.filename);
      const waits = await h.waitFor(async () => (await h.waitingOnLock(obs, 'parents-portal-restore')) >= 1, { timeoutMs: 12000, intervalMs: 50 });
      checks.check(`${id} the restore took its safety archive and waits for its locks`, waits.ok, `${waits.ms} ms`);
      return { before, pending };
    };
    h.say('\nF3 the restore\'s session terminated while it waits');
    {
      const { before, pending } = await stagedRestore('F3');
      const { rows } = await obs.query(
        "SELECT pg_catalog.pg_terminate_backend(pid) AS t FROM pg_catalog.pg_stat_activity WHERE datname = current_database() AND application_name = 'parents-portal-restore'"
      );
      await fault.query('ROLLBACK');
      const r = await pending;
      const after = await h.observe(obs, 'F3-after');
      const unexpected = h.unexpectedChanges(before, after, ['backups', 'activity_logs']);
      checks.check('F3 one restore session terminated', rows.length === 1 && rows[0].t === true, rows.length);
      checks.check('F3 500 "rolled back in full", not an unknown outcome', r.status === 500 && r.data && /rolled back in full/.test(r.data.message || '') && r.data.code !== 'RESTORE_OUTCOME_UNKNOWN', r.status);
      checks.check('F3 every table but the catalog and the log as it was; only the safety archive added', unexpected.length === 0 && after.tables.backups.n === before.tables.backups.n + 1, unexpected);
      checks.check('F3 the cutoff unchanged and the API still up', after.cutoff.at === before.cutoff.at && api.alive());
      report.cases.F3 = { status: r.status, unexpected };
    }
    h.say('\nF2 the API killed while the restore waits');
    {
      const { before, pending } = await stagedRestore('F2');
      await h.killApi(api);
      await fault.query('ROLLBACK');
      const r = await pending;
      const drained = await h.waitFor(async () => (await obs.query(
        "SELECT count(*)::int AS n FROM pg_catalog.pg_stat_activity WHERE datname = current_database() AND application_name IN ('parents-portal-restore', 'parents-portal-api')"
      )).rows[0].n === 0, { timeoutMs: 30000, intervalMs: 250 });
      const after = await h.observe(obs, 'F2-after');
      const unexpected = h.unexpectedChanges(before, after, ['backups', 'activity_logs']);
      checks.check('F2 the dead API\'s sessions end, the restore\'s with them', drained.ok, `${drained.ms} ms`);
      checks.check('F2 nothing restored: every table but the catalog and the log as it was', unexpected.length === 0, unexpected);
      checks.check('F2 the cutoff unchanged', after.cutoff.at === before.cutoff.at);
      h.say(`  info  F2 the client saw: ${r.status === 0 ? `no reply (${r.error})` : r.status}`);
      api = h.spawnApi({ port: 5010 });
      checks.check('F2 a restarted API comes up', (await api.ready).ok, api.tail.slice(-5));
      token = await h.signIn(BASE, admin);
      // an archive made NOW, so it holds every kept backup's creator (A predates
      // R4's second admin and would be refused by Q3, as R4 proved)
      const current = await makeArchive();
      const again = await restore(current.id, current.filename);
      checks.check('F2 control: the restarted API restores normally (200)', again.status === 200, { status: again.status, code: again.data && again.data.code });
      token = await h.signIn(BASE, admin);
      report.cases.F2 = { clientSaw: r.status, drainedMs: drained.ms, unexpected, after: again.status };
    }

    const end = await h.observe(obs, 'end');
    checks.check('every sequence ahead of its highest id, none moved backwards', h.sequenceViolations(end, baseline).length === 0, h.sequenceViolations(end, baseline));
    checks.check('no session idle in a transaction, no prepared transaction', end.sessions.idleInTx === 0 && end.sessions.prepared === 0, end.sessions);

    // ---- cleanup: every backup row and file of this run ---------------------------------
    for (let round = 0; round < 20; round += 1) {
      const list = await h.call(BASE, 'GET', '/api/backups', { token });
      const rows = (list.data && list.data.backups) || [];
      if (!rows.length) break;
      for (const b of rows) await h.call(BASE, 'DELETE', `/api/backups/${b.id}`, { token });
    }
    const left = fs.readdirSync(h.BACKUPS_DIR).filter((n) => /\.(zip|partial|sql)$/.test(n));
    checks.check('cleanup: every backup this run made is deleted, rows and files', left.length === 0, left.length);
  } finally {
    await fault.query('ROLLBACK').catch(() => {});
    if (apiRo) await h.killApi(apiRo);
    if (api) await h.killApi(api);
    await fault.end().catch(() => {});
    await obs.end().catch(() => {});
  }
  const s = checks.summary();
  report.summary = { passed: s.passed, failed: s.failed, findings: s.findings };
  h.say(`report: ${h.writeReport('restore', report)}`);
  process.exitCode = s.failed ? 1 : 0;
}

main().catch((error) => {
  h.say(`restore error: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
