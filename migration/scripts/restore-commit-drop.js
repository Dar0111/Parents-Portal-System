#!/usr/bin/env node
// REVIEW FINDING backup-2 (P3-C-R2 Phase H) — a restore whose connection fails
// AT COMMIT, and the sequences of a restore that does not commit.
//
// An archive of the database itself is made and inspected, then restored
// twice through a TCP relay that ends the connection at the COMMIT:
//   before  the COMMIT is never forwarded — the server rolls the transaction
//           back as the connection closes;
//   after   the COMMIT is forwarded and its answer DROPPED — the server has
//           committed, the client cannot know.
// Each time restoreArchive must throw with `outcomeUnknown` (the transaction
// id and the result it would have returned), and transactionOutcome() on a
// fresh connection must answer 'aborted' and then 'committed'. So that a
// sequence really moves, grade_acknowledgements' sequence (an empty table) is
// lowered to 1 first; the archive recorded its real next value, which the
// restore restores. After 'before' it must be back at 1 with nothing else
// changed — the restore's sequence moves are TRANSACTIONAL now — and after
// 'after' it must stand at the archive's value, with the session cutoff moved.
//
// --mutant setval loads backupArchive.js IN MEMORY with the sequence move as
// setval() (the code before the fix, without its hand put-back): the 'before'
// leg must then FAIL — the sequence stays moved although nothing committed.
//
// The disposable local cluster only, never the transfer target; under the
// session's runner with PG_DATABASE naming a disposable database:
//   node scripts/restore-commit-drop.js [--mutant setval]
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const SERVER = path.join(__dirname, '..', '..', 'server');
const ARCHIVE_FILE = path.join(SERVER, 'utils', 'backupArchive.js');
const { Client } = require(path.join(SERVER, 'node_modules', 'pg'));
const db = require(path.join(SERVER, 'config', 'db.js'));

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
// The table whose sequence the proof lowers: an EMPTY table whose sequence's
// next value is above 1, chosen at run time (main()).
let SEQ = null;
let SEQ_TABLE = null;
const sha = () => crypto.createHash('sha256').update(fs.readFileSync(ARCHIVE_FILE)).digest('hex').slice(0, 16);

function loadArchive(mutant) {
  if (!mutant) return require(ARCHIVE_FILE);
  const src = fs.readFileSync(ARCHIVE_FILE, 'utf8');
  const re = /await client\.query\(`ALTER SEQUENCE \$\{qualified\(sequence, schema\)\} START WITH \$\{next\} RESTART`\);/;
  if (!re.test(src)) throw new Error('mutant anchor not found — refusing to run');
  const replacement =
    "await client.query('SELECT pg_catalog.setval($1::pg_catalog.regclass, $2::bigint, $3::boolean)', [qualified(sequence, schema), next > 1 ? next - 1 : 1, next > 1]);";
  const m = new Module(ARCHIVE_FILE, module);
  m.filename = ARCHIVE_FILE;
  m.paths = Module._nodeModulePaths(path.dirname(ARCHIVE_FILE));
  m._compile(src.replace(re, replacement), ARCHIVE_FILE);
  return m.exports;
}

// A relay to the cluster that ends the connection at the first COMMIT.
function relay(targetHost, targetPort, mode) {
  const state = { sawCommit: false, dropped: false };
  const server = net.createServer((c) => {
    const s = net.connect(targetPort, targetHost);
    let buf = Buffer.alloc(0);
    let startup = true;
    let armed = false;
    const end = () => {
      state.dropped = true;
      c.destroy();
      s.destroy();
    };
    c.on('data', (chunk) => {
      if (state.dropped) return;
      buf = Buffer.concat([buf, chunk]);
      const forward = [];
      for (;;) {
        if (startup) {
          if (buf.length < 4) break;
          const len = buf.readInt32BE(0);
          if (buf.length < len) break;
          forward.push(buf.subarray(0, len));
          buf = buf.subarray(len);
          startup = false;
          continue;
        }
        if (buf.length < 5) break;
        const len = buf.readInt32BE(1);
        if (buf.length < 1 + len) break;
        const msg = buf.subarray(0, 1 + len);
        buf = buf.subarray(1 + len);
        if (msg[0] === 0x51 && msg.subarray(5).toString('utf8') === 'COMMIT\0') {
          state.sawCommit = true;
          if (mode === 'before') {
            for (const m of forward) s.write(m);
            end();
            return;
          }
          forward.push(msg);
          armed = true;
          continue;
        }
        forward.push(msg);
      }
      for (const m of forward) s.write(m);
    });
    s.on('data', (chunk) => {
      if (state.dropped) return;
      if (armed) {
        end();
        return;
      }
      c.write(chunk);
    });
    c.on('error', () => {});
    s.on('error', () => {});
    c.on('close', () => s.destroy());
    s.on('close', () => c.destroy());
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, state, close: () => server.close() })));
}

async function seqState(client) {
  const { rows } = await client.query(`SELECT last_value, is_called FROM ${SEQ}`);
  return rows[0].is_called ? Number(rows[0].last_value) + 1 : Number(rows[0].last_value);
}

async function counts(client) {
  const { rows } = await client.query(
    `SELECT c.relname AS t, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM portal.%I', c.relname), false, true, '')))[1]::text::bigint AS n
       FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'portal' AND c.relkind = 'r'
        AND c.relname <> 'auth_codes' -- a restore empties it by design (04)
      ORDER BY c.relname`
  );
  return rows.map((r) => `${r.t}:${r.n}`).join(',');
}

function changedTables(a, b) {
  const map = (s) => new Map(s.split(',').map((x) => x.split(':')));
  const ma = map(a);
  const mb = map(b);
  return [...ma.keys()].filter((t) => ma.get(t) !== mb.get(t)).map((t) => `${t} ${ma.get(t)} -> ${mb.get(t)}`);
}

async function pickSequence(client) {
  const { rows } = await client.query(
    `SELECT t.relname AS tab, s.relname AS seq
       FROM pg_depend d JOIN pg_class s ON s.oid = d.objid JOIN pg_class t ON t.oid = d.refobjid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE s.relkind = 'S' AND n.nspname = 'portal' AND d.deptype = 'i' ORDER BY t.relname`
  );
  for (const r of rows) {
    if (r.tab === 'auth_codes' || r.tab === 'backups') continue;
    const n = Number((await client.query(`SELECT count(*) AS n FROM portal.${r.tab}`)).rows[0].n);
    if (n !== 0) continue;
    const st = (await client.query(`SELECT last_value, is_called FROM portal.${r.seq}`)).rows[0];
    const next = st.is_called ? Number(st.last_value) + 1 : Number(st.last_value);
    if (next > 1) return { tab: r.tab, seq: `portal.${r.seq}` };
  }
  throw new Error('no empty table with a sequence above 1 on this database');
}

async function main() {
  const mutant = process.argv.includes('--mutant') ? process.argv[process.argv.indexOf('--mutant') + 1] : null;
  if (mutant && mutant !== 'setval') throw new Error('--mutant must be setval');
  const runtime = db.settings('runtime');
  const owner = db.settings('migrate');
  if (!LOOPBACK.has(runtime.host) || !LOOPBACK.has(owner.host)) throw new Error('loopback PostgreSQL only');
  if (runtime.database === 'parents_portal_pg') throw new Error('name a disposable database (PG_DATABASE), not the transfer target');
  const before = sha();
  const archive = loadArchive(mutant);
  if (mutant) console.log('MUTANT setval: the restore moves sequences with setval() (in memory) — the before leg must FAIL');

  const problems = [];
  const d = new Client(owner);
  await d.connect();
  const zipPath = path.join(os.tmpdir(), `restore-commit-drop-${process.pid}-${Date.now()}.zip`);
  try {
    ({ tab: SEQ_TABLE, seq: SEQ } = await pickSequence(d));
    const realNext = await seqState(d);

    // The archive of the database as it stands, with the real next value.
    const r = new Client(runtime);
    await r.connect();
    try {
      await archive.writeArchive(r, `${zipPath}.partial`);
    } finally {
      await r.end();
    }
    fs.renameSync(`${zipPath}.partial`, zipPath);
    const inspection = await archive.inspectArchive(zipPath);
    const archived = inspection.manifest.sequences.find((s) => s.table === SEQ_TABLE).next_value;
    console.log(`${SEQ_TABLE} (empty): next value ${realNext}, archived ${archived}; lowered to 1 for the run`);

    // Lowered, so the restore has a sequence to move.
    await d.query(`ALTER SEQUENCE ${SEQ} START WITH 1 RESTART`);
    const lowered = await seqState(d);
    const cutoff0 = (await d.query('SELECT token_valid_after::text AS t FROM portal.auth_security_state WHERE id = 1')).rows[0];
    const counts0 = await counts(d);

    for (const mode of ['before', 'after']) {
      const rl = await relay(owner.host, owner.port, mode);
      const viaRelay = new Client({ ...owner, host: '127.0.0.1', port: rl.port });
      viaRelay.on('error', () => {});
      let error = null;
      try {
        await viaRelay.connect();
        await archive.restoreArchive(viaRelay, zipPath, inspection);
      } catch (e) {
        error = e;
      } finally {
        await viaRelay.end().catch(() => {});
        rl.close();
      }
      const unknown = Boolean(error && error.outcomeUnknown && error.outcomeUnknown.xid);
      const outcome = unknown ? await archive.transactionOutcome(d, error.outcomeUnknown.xid) : null;
      const next = await seqState(d);
      const cutoff = (await d.query('SELECT token_valid_after::text AS t FROM portal.auth_security_state WHERE id = 1')).rows[0];
      const countsNow = await counts(d);
      const want = mode === 'before' ? 'aborted' : 'committed';
      console.log(
        `${mode.padEnd(6)}: the relay saw the COMMIT ${rl.state.sawCommit} and ended the connection ${rl.state.dropped}; restoreArchive threw ${Boolean(error)}, outcomeUnknown ${unknown}; the server says ${outcome}; the sequence's next value ${next}; the cutoff moved ${(cutoff && cutoff.t) !== (cutoff0 && cutoff0.t)}; the row counts as before ${countsNow === counts0}`
      );
      if (!rl.state.sawCommit || !rl.state.dropped) problems.push(`${mode}: the relay did not end the connection at the COMMIT`);
      if (!unknown) problems.push(`${mode}: restoreArchive did not report an unknown outcome`);
      if (outcome !== want) problems.push(`${mode}: the server says ${outcome}, expected ${want}`);
      if (mode === 'before') {
        if (next !== lowered) problems.push(`before: the sequence stands at ${next} although nothing committed (it was ${lowered})`);
        if ((cutoff && cutoff.t) !== (cutoff0 && cutoff0.t)) problems.push('before: the session cutoff moved although nothing committed');
      } else {
        if (next !== Math.max(archived, lowered)) problems.push(`after: the sequence stands at ${next}, expected the archive's ${archived}`);
        if ((cutoff && cutoff.t) === (cutoff0 && cutoff0.t)) problems.push('after: the session cutoff did not move');
      }
      if (countsNow !== counts0) problems.push(`${mode}: the row counts changed (${changedTables(counts0, countsNow).join('; ')})`);
    }
    // Leave the sequence where it really belongs.
    if ((await seqState(d)) < realNext) await d.query(`ALTER SEQUENCE ${SEQ} START WITH ${realNext} RESTART`);
    console.log(`${SEQ_TABLE}'s sequence left at ${await seqState(d)} (its real next value ${realNext})`);
  } finally {
    await d.end().catch(() => {});
    for (const p of [zipPath, `${zipPath}.partial`]) if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const after = sha();
  console.log(`backupArchive.js on disk: sha ${before} -> ${after} ${before === after ? 'unchanged' : 'CHANGED'}`);
  console.log(problems.length ? `RESTORE COMMIT DROP: ${problems.join('; ')}` : 'RESTORE COMMIT DROP OK');
  process.exitCode = problems.length ? 1 : 0;
}

main().catch((e) => {
  console.error('restore-commit-drop failed:', e.code || e.message);
  process.exit(1);
});
