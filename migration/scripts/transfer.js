#!/usr/bin/env node
// Deterministic data transfer MySQL -> PostgreSQL.
//
//   node scripts/transfer.js [--target local|staging] [--source-db <name>] [--truncate]
//
// Rules it keeps:
//   - the source is read on ONE read-only connection inside ONE consistent
//     snapshot (START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY), in the
//     UTC session time zone — see lib/mysql.js
//   - the destination is written in ONE transaction with every FK deferred:
//     either all 26 tables land, every count matches and every sequence is set,
//     or nothing changes (ROLLBACK) and the run can simply be repeated
//   - every value crosses through lib/tables.js#toPg, which throws on anything
//     it does not recognise (a zero date, a non-0/1 flag, a malformed decimal)
//     — nothing is silently skipped, coerced or defaulted
//   - ids are inserted explicitly; afterwards each identity sequence is set so
//     that its NEXT value equals MySQL's AUTO_INCREMENT (empty tables too), so
//     no id MySQL ever handed out is reused. The AUTO_INCREMENT is the storage
//     engine's own, never information_schema's cache (lib/mysql.js
//     freshStatistics, P3-C-R2 C1)
//   - THE SEQUENCES ARE TRANSACTIONAL TOO (P3-C-R2 C2). setval() is not — a
//     transfer failed at COMMIT kept every setval() while its rows rolled back
//     (measured, docs/05 §0c) — so each sequence moves by ALTER SEQUENCE …
//     START WITH <AUTO_INCREMENT> RESTART (START too since Phase H, so a
//     backup's manifest reads the right next value from pg_sequences while
//     the sequence is uncalled), which rolls back with the rest and makes
//     a concurrent nextval() or INSERT wait for the transaction (measured on
//     17.10; ALTER TABLE … RESTART is refused here, the deferred keys leave
//     pending trigger events on the table). After a failure a SEPARATE connection checks
//     that every sequence is where it was before BEGIN; after the COMMIT one
//     checks that every sequence is at the source's AUTO_INCREMENT and above
//     its table's highest id, and only then is the target READY (the report's
//     `ready`; anything else exits 1)
//   - MIGRATION_FAILPOINT=<name> stops the run at one named place on purpose —
//     the disposable local target only (scripts/transfer-failures.js)
//   - it touches only the 26 tables in schema portal; it refuses a target
//     table that already has rows unless --truncate (local only)
//   - the source's base tables must be EXACTLY lib/tables.js's set (the
//     2026-10-24 sync): a table missing from the map is a refusal, never a
//     silent skip
//   - the report (counts, ids, sequences — never values) goes to
//     <DATA_DIR>/rehearsal/transfer_<target>_<stamp>.json
const fs = require('fs');
const path = require('path');
const { readOnly, sourceConfig } = require('../lib/mysql');
const { targetName, targetConfig, isDisposableLocal } = require('../lib/env');
const { pool } = require('../lib/pg');
const { TABLES, toPg, tableSetMismatch } = require('../lib/tables');
const P = require('../lib/paths');

const BATCH = 500;

// FAILPOINTS (P3-C-R2 C2's regression evidence): where a run may be stopped on
// purpose. Honoured on the disposable local target only — anywhere else a set
// MIGRATION_FAILPOINT is a refusal before anything is read.
const FAILPOINT = process.env.MIGRATION_FAILPOINT || null;
const FAILPOINTS = new Set(['before_load', 'mid_load', 'before_sequences', 'after_sequences', 'deferred_fk', 'at_commit']);
function failpoint(name) {
  if (FAILPOINT === name) throw new Error(`FAILPOINT ${name}: the run is stopped here on purpose`);
}

// Every identity sequence's next value and its table's highest id, read on a
// connection of its own (never the transfer's), numbers only.
async function sequenceStates(p) {
  const c = await p.connect();
  try {
    const out = {};
    for (const table of TABLES.filter((t) => t.sequence)) {
      const seq = (await c.query(`SELECT pg_get_serial_sequence('portal.${table.name}', 'id') AS s`)).rows[0].s;
      const s = (await c.query(`SELECT last_value, is_called FROM ${seq}`)).rows[0];
      const max = (await c.query(`SELECT max(id) AS m FROM portal.${table.name}`)).rows[0].m;
      out[table.name] = { next: Number(s.last_value) + (s.is_called ? 1 : 0), max_id: max === null ? null : Number(max) };
    }
    return out;
  } finally {
    c.release();
  }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  // THE GUARD, FLAG FIRST (D-65): refused by the target name before any secret
  // is read, then by the connection itself (the disposable local cluster only).
  const truncate = process.argv.includes('--truncate');
  const name = targetName();
  if (truncate && name !== 'local') throw new Error(`--truncate is allowed on the local target only (refused for ${name} before any secret was read).`);
  const target = targetConfig();
  if (FAILPOINT && (!FAILPOINTS.has(FAILPOINT) || !isDisposableLocal(target))) {
    throw new Error('MIGRATION_FAILPOINT is honoured on the disposable local target only, and must name a known failpoint.');
  }
  if (truncate && !isDisposableLocal(target)) throw new Error('--truncate refused: the target is not the disposable local cluster (127.0.0.1, the embedded port and database, no TLS).');
  console.log(`target ${target.name}: tls ${target.tlsMode}`);
  const sourceDb = arg('--source-db', sourceConfig().database);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
  const reportPath = path.join(P.REHEARSAL_DIR, `transfer_${target.name}_${stamp}.json`);

  const src = await readOnly({ database: sourceDb });
  const p = pool(target.pg);
  const pgc = await p.connect();
  const report = { target: target.name, source_database: sourceDb, started_at: new Date().toISOString(), tables: {}, sequences: {}, ok: false, ready: false };
  let sequencesBefore = null;

  try {
    await src.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const [aiRows] = await src.query(
      'SELECT TABLE_NAME t, AUTO_INCREMENT ai FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [sourceDb]
    );
    const autoInc = new Map(aiRows.map((r) => [r.t, r.ai === null ? null : Number(r.ai)]));

    // The set-equality guard: the source's base tables are exactly the map's.
    const [baseRows] = await src.query(
      "SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'", [sourceDb]
    );
    const mismatch = tableSetMismatch(baseRows.map((r) => r.t));
    if (mismatch) {
      throw new Error(`source ${sourceDb} and lib/tables.js disagree — not in tables.js: [${mismatch.notInTables.join(', ')}]; not in the source: [${mismatch.notInSource.join(', ')}]`);
    }
    report.source_tables = baseRows.length;
    console.log(`source ${sourceDb}: ${baseRows.length} base tables, the same set as lib/tables.js`);

    // Where every sequence stands BEFORE the transaction: a failed run must
    // leave each one exactly there (checked in the catch, on its own connection).
    sequencesBefore = await sequenceStates(p);
    await pgc.query('BEGIN');
    await pgc.query('SET CONSTRAINTS ALL DEFERRED');
    if (FAILPOINT === 'at_commit') {
      // A deferred constraint trigger that raises at COMMIT, created INSIDE this
      // transaction, so it rolls back with everything else.
      await pgc.query("CREATE FUNCTION portal.zz_transfer_failpoint() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'FAILPOINT at_commit: the COMMIT is stopped here on purpose'; END $f$");
      await pgc.query('CREATE CONSTRAINT TRIGGER zz_transfer_failpoint AFTER INSERT ON portal.auth_security_state DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION portal.zz_transfer_failpoint()');
    }
    await pgc.query("SET LOCAL TIME ZONE 'UTC'");

    // Count EVERY table before truncating ANY: TRUNCATE … CASCADE on users
    // empties its dependents, so a count taken table by table would under-
    // state the discard (the first run of this guard printed 7 tables where
    // 18 held rows). The figure printed is what the target held.
    const held = {};
    for (const table of TABLES) {
      held[table.name] = (await pgc.query(`SELECT count(*)::int AS n FROM portal.${table.name}`)).rows[0].n;
    }
    const nonEmpty = TABLES.filter((t) => held[t.name] > 0);
    if (nonEmpty.length && !truncate) {
      throw new Error(`portal.${nonEmpty[0].name} already holds ${held[nonEmpty[0].name]} rows (${nonEmpty.length} tables hold rows) — refusing (local: --truncate).`);
    }
    if (truncate && nonEmpty.length) {
      const discardedRows = nonEmpty.reduce((sum, t) => sum + held[t.name], 0);
      for (const t of nonEmpty) console.log(`discarding ${held[t.name]} rows from portal.${t.name} (local --truncate)`);
      report.discarded = { tables: nonEmpty.length, rows: discardedRows };
      console.log(`TRUNCATING ${nonEmpty.length} tables, ${discardedRows} rows discarded on ${target.name} (counts only; the discard is visible, never silent)`);
      await pgc.query(`TRUNCATE ${nonEmpty.map((t) => `portal.${t.name}`).join(', ')} CASCADE`);
    }

    failpoint('before_load');
    for (const table of TABLES) {
      const cols = table.columns.map((c) => c.name);
      const [rows] = await src.query(`SELECT ${cols.map((n) => `\`${n}\``).join(', ')} FROM \`${table.name}\` ORDER BY id`);
      let inserted = 0;
      let maxId = null;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const params = [];
        const tuples = chunk.map((row, r) => {
          const placeholders = table.columns.map((c, k) => {
            params.push(toPg(c.kind, row[c.name], `${table.name}.${c.name} id=${row.id}`));
            return `$${r * cols.length + k + 1}`;
          });
          return `(${placeholders.join(', ')})`;
        });
        const res = await pgc.query(
          `INSERT INTO portal.${table.name} (${cols.join(', ')}) VALUES ${tuples.join(', ')}`,
          params
        );
        inserted += res.rowCount;
        for (const row of chunk) if (maxId === null || Number(row.id) > maxId) maxId = Number(row.id);
      }
      if (inserted !== rows.length) throw new Error(`${table.name}: read ${rows.length} rows, inserted ${inserted}`);
      report.tables[table.name] = { source_rows: rows.length, inserted, max_id: maxId };
      if (TABLES.indexOf(table) === Math.floor(TABLES.length / 2)) failpoint('mid_load');
      console.log(`${table.name.padEnd(22)} ${String(rows.length).padStart(6)} rows -> ${inserted}`);

      if (table.sequence) {
        const ai = autoInc.get(table.name);
        if (ai === null || ai === undefined) throw new Error(`${table.name}: no AUTO_INCREMENT value in information_schema`);
        if (maxId !== null && ai <= maxId) throw new Error(`${table.name}: AUTO_INCREMENT ${ai} is not above MAX(id) ${maxId}`);
        const seq = (await pgc.query(`SELECT pg_get_serial_sequence('portal.${table.name}', 'id') AS s`)).rows[0].s;
        failpoint('before_sequences');
        if (!Number.isSafeInteger(ai) || ai < 1) throw new Error(`${table.name}: AUTO_INCREMENT ${ai} is not a positive integer`);
        // TRANSACTIONAL (C2): the next value is `ai`, and a ROLLBACK undoes it.
        // ALTER SEQUENCE, not ALTER TABLE … RESTART: with every foreign key
        // deferred the table already has pending trigger events and PostgreSQL
        // refuses ALTER TABLE on it (55006, measured); the sequence has none.
        // START WITH as well as RESTART (P3-C-R2 Phase H): a restarted
        // sequence is uncalled, and pg_sequences — what a backup's manifest
        // reads as portal_app — shows an uncalled sequence's last_value as
        // NULL, so the manifest fell back to start_value (1) for 14 of 25
        // sequences after a transfer (measured). With START WITH `ai` that
        // fallback IS the next value.
        await pgc.query(`ALTER SEQUENCE ${seq} START WITH ${ai} RESTART`);
        report.sequences[table.name] = { sequence: seq, source_auto_increment: ai, next_value: ai };
      }
    }

    failpoint('after_sequences');

    // The fixed row must be there exactly once.
    const state = (await pgc.query('SELECT count(*)::int AS n FROM portal.auth_security_state')).rows[0].n;
    if (state !== 1) throw new Error(`auth_security_state holds ${state} rows after the load; expected 1`);

    // A deferred foreign key broken on purpose, so the COMMIT's constraint check fails.
    if (FAILPOINT === 'deferred_fk') await pgc.query('UPDATE portal.students SET created_by = -1 WHERE id = (SELECT min(id) FROM portal.students)');
    await pgc.query('COMMIT');
    report.ok = true;
    // READY only when a SEPARATE connection reads every sequence where this run
    // set it and above its table's highest id.
    const after = await sequenceStates(p);
    const unsafe = Object.keys(report.sequences).filter((t) => after[t].next !== report.sequences[t].next_value || (after[t].max_id !== null && after[t].next <= after[t].max_id));
    report.sequences_verified = after;
    report.ready = unsafe.length === 0;
    if (report.ready) {
      console.log(`READY: ${Object.keys(after).length} sequences read back on a separate connection, each at the source's AUTO_INCREMENT and above its highest id`);
    } else {
      console.error(`TARGET NOT READY: ${unsafe.length} sequence(s) not at the source's AUTO_INCREMENT or not above the highest id: ${unsafe.join(', ')}`);
      process.exitCode = 1;
    }
    report.finished_at = new Date().toISOString();
    console.log(`COMMITTED ${TABLES.length} tables into ${target.name}`);
  } catch (error) {
    try { await pgc.query('ROLLBACK'); } catch { /* connection may be gone */ }
    // A failed run is never READY. Its sequences must stand exactly where they
    // stood before BEGIN — read on a connection of its own.
    report.ready = false;
    if (sequencesBefore) {
      try {
        const after = await sequenceStates(p);
        const moved = Object.keys(sequencesBefore).filter((t) => sequencesBefore[t].next !== after[t].next);
        report.sequences_after_failure = { unchanged: moved.length === 0, moved };
        if (moved.length) console.error(`SEQUENCES MOVED by the failed run (${moved.join(', ')}) — the target is NOT READY; run the transfer again`);
        else console.error(`the failed run left all ${Object.keys(after).length} sequences where they were (read on a separate connection); the target is not ready — run the transfer again`);
      } catch (e) {
        report.sequences_after_failure = { unchanged: null };
        console.error('the sequences could not be read back after the failure — the target is NOT READY');
      }
    }
    report.error = require('../lib/safeMessage').safeMessage(error);
    console.error('TRANSFER ROLLED BACK —', report.error);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`report: ${reportPath}`);
    pgc.release();
    await p.end();
    try { await src.query('ROLLBACK'); } catch { /* read-only snapshot */ }
    await src.end();
  }
}

main().catch((e) => { console.error('transfer failed:', require('../lib/safeMessage').safeMessage(e)); process.exit(1); });
