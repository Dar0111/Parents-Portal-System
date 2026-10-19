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
//     either all 25 tables land, every count matches and every sequence is set,
//     or nothing changes (ROLLBACK) and the run can simply be repeated
//   - every value crosses through lib/tables.js#toPg, which throws on anything
//     it does not recognise (a zero date, a non-0/1 flag, a malformed decimal)
//     — nothing is silently skipped, coerced or defaulted
//   - ids are inserted explicitly; afterwards each identity sequence is set so
//     that its NEXT value equals MySQL's AUTO_INCREMENT (empty tables too), so
//     no id MySQL ever handed out is reused
//   - it touches only the 25 tables in schema portal; it refuses a target
//     table that already has rows unless --truncate (local only)
//   - the report (counts, ids, sequences — never values) goes to
//     <DATA_DIR>/rehearsal/transfer_<target>_<stamp>.json
const fs = require('fs');
const path = require('path');
const { readOnly, sourceConfig } = require('../lib/mysql');
const { targetConfig } = require('../lib/env');
const { pool } = require('../lib/pg');
const { TABLES, toPg } = require('../lib/tables');
const P = require('../lib/paths');

const BATCH = 500;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const target = targetConfig();
  const truncate = process.argv.includes('--truncate');
  if (truncate && target.name !== 'local') throw new Error('--truncate is allowed on the local target only.');
  const sourceDb = arg('--source-db', sourceConfig().database);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
  const reportPath = path.join(P.REHEARSAL_DIR, `transfer_${target.name}_${stamp}.json`);

  const src = await readOnly({ database: sourceDb });
  const p = pool(target.pg);
  const pgc = await p.connect();
  const report = { target: target.name, source_database: sourceDb, started_at: new Date().toISOString(), tables: {}, sequences: {}, ok: false };

  try {
    await src.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const [aiRows] = await src.query(
      'SELECT TABLE_NAME t, AUTO_INCREMENT ai FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [sourceDb]
    );
    const autoInc = new Map(aiRows.map((r) => [r.t, r.ai === null ? null : Number(r.ai)]));

    await pgc.query('BEGIN');
    await pgc.query('SET CONSTRAINTS ALL DEFERRED');
    await pgc.query("SET LOCAL TIME ZONE 'UTC'");

    for (const table of TABLES) {
      const existing = (await pgc.query(`SELECT count(*)::int AS n FROM portal.${table.name}`)).rows[0].n;
      if (existing > 0) {
        if (!truncate) throw new Error(`portal.${table.name} already holds ${existing} rows — refusing (local: --truncate).`);
        await pgc.query(`TRUNCATE portal.${table.name} CASCADE`);
      }
    }

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
      console.log(`${table.name.padEnd(22)} ${String(rows.length).padStart(6)} rows -> ${inserted}`);

      if (table.sequence) {
        const ai = autoInc.get(table.name);
        if (ai === null || ai === undefined) throw new Error(`${table.name}: no AUTO_INCREMENT value in information_schema`);
        if (maxId !== null && ai <= maxId) throw new Error(`${table.name}: AUTO_INCREMENT ${ai} is not above MAX(id) ${maxId}`);
        const seq = (await pgc.query(`SELECT pg_get_serial_sequence('portal.${table.name}', 'id') AS s`)).rows[0].s;
        if (ai > 1) await pgc.query('SELECT setval($1, $2, true)', [seq, ai - 1]);
        else await pgc.query('SELECT setval($1, 1, false)', [seq]);
        report.sequences[table.name] = { sequence: seq, source_auto_increment: ai, next_value: ai };
      }
    }

    // The fixed row must be there exactly once.
    const state = (await pgc.query('SELECT count(*)::int AS n FROM portal.auth_security_state')).rows[0].n;
    if (state !== 1) throw new Error(`auth_security_state holds ${state} rows after the load; expected 1`);

    await pgc.query('COMMIT');
    report.ok = true;
    report.finished_at = new Date().toISOString();
    console.log(`COMMITTED ${TABLES.length} tables into ${target.name}`);
  } catch (error) {
    try { await pgc.query('ROLLBACK'); } catch { /* connection may be gone */ }
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
