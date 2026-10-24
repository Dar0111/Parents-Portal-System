#!/usr/bin/env node
// Per-table reconciliation MySQL -> PostgreSQL after a transfer.
//
//   node scripts/reconcile.js [--target local|staging] [--source-db <name>] [--report <transfer json>]
//
// For every table: row counts, then every row's canonical form (lib/tables.js
// #canonical: timestamps as UTC seconds, decimals at two places, nulls as \N)
// hashed on both sides and compared by primary key. Rows that exist in the
// source above the transfer's max id are reported as "grown since transfer"
// (the application was in use), never as a mismatch. Also: every identity
// sequence's next value against the source AUTO_INCREMENT, and the catalog
// counts (PK/unique/FK/check). Prints table names, ids and counts only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readOnly, sourceConfig } = require('../lib/mysql');
const { targetConfig } = require('../lib/env');
const { pool } = require('../lib/pg');
const { TABLES, canonical, tableSetMismatch } = require('../lib/tables');
const P = require('../lib/paths');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function latestTransferReport(targetName) {
  if (!fs.existsSync(P.REHEARSAL_DIR)) return null;
  const files = fs.readdirSync(P.REHEARSAL_DIR).filter((f) => f.startsWith(`transfer_${targetName}_`) && f.endsWith('.json')).sort();
  return files.length ? path.join(P.REHEARSAL_DIR, files[files.length - 1]) : null;
}

function rowHash(table, row) {
  const parts = table.columns.map((c) => canonical(c.kind, row[c.name]));
  return crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

async function main() {
  const target = targetConfig();
  const sourceDb = arg('--source-db', sourceConfig().database);
  const reportFile = arg('--report', latestTransferReport(target.name));
  const transfer = reportFile ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : null;

  const src = await readOnly({ database: sourceDb });
  const p = pool(target.pg);
  const out = { target: target.name, source_database: sourceDb, transfer_report: reportFile, tables: {}, sequences: {}, catalog: {}, ok: true };

  await src.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const [aiRows] = await src.query('SELECT TABLE_NAME t, AUTO_INCREMENT ai FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [sourceDb]);
  const autoInc = new Map(aiRows.map((r) => [r.t, r.ai === null ? null : Number(r.ai)]));

  const pgc = await p.connect();
  try {
    await pgc.query("SET TIME ZONE 'UTC'");

    // The set-equality guard (the 2026-10-24 sync): a source table missing from
    // lib/tables.js would otherwise be skipped and RECONCILE OK would still print.
    const [baseRows] = await src.query(
      "SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'", [sourceDb]
    );
    const mismatch = tableSetMismatch(baseRows.map((r) => r.t));
    out.source_tables = baseRows.length;
    if (mismatch) {
      out.ok = false;
      out.table_set_mismatch = mismatch;
      throw new Error(`source ${sourceDb} and lib/tables.js disagree — not in tables.js: [${mismatch.notInTables.join(', ')}]; not in the source: [${mismatch.notInSource.join(', ')}]`);
    }
    console.log(`source ${sourceDb}: ${baseRows.length} base tables, the same set as lib/tables.js`);

    for (const table of TABLES) {
      const cols = table.columns.map((c) => c.name);
      const cap = transfer && transfer.tables[table.name] ? transfer.tables[table.name].max_id : null;
      const where = cap === null ? '' : ' WHERE id <= ?';
      const [srcRows] = await src.query(`SELECT ${cols.map((n) => `\`${n}\``).join(', ')} FROM \`${table.name}\`${where} ORDER BY id`, cap === null ? [] : [cap]);
      const [[{ grown }]] = cap === null
        ? [[{ grown: 0 }]]
        : await src.query(`SELECT COUNT(*) AS grown FROM \`${table.name}\` WHERE id > ?`, [cap]);
      const pgSql = `SELECT ${cols.map((n) => `${n}::text AS ${n}`).join(', ')} FROM portal.${table.name}${cap === null ? '' : ' WHERE id <= $1'} ORDER BY id`;
      const { rows: pgRows } = await pgc.query(pgSql, cap === null ? [] : [cap]);

      const srcMap = new Map(srcRows.map((r) => [String(r.id), rowHash(table, r)]));
      const pgMap = new Map(pgRows.map((r) => [String(r.id), rowHash(table, r)]));
      const missing = [...srcMap.keys()].filter((id) => !pgMap.has(id));
      const extra = [...pgMap.keys()].filter((id) => !srcMap.has(id));
      const differ = [...srcMap.keys()].filter((id) => pgMap.has(id) && pgMap.get(id) !== srcMap.get(id));
      const entry = {
        source_rows: srcRows.length, target_rows: pgRows.length, grown_since_transfer: Number(grown),
        missing_in_target: missing.length, extra_in_target: extra.length, value_mismatch: differ.length,
        sample_ids: { missing: missing.slice(0, 10), extra: extra.slice(0, 10), differ: differ.slice(0, 10) },
      };
      const ok = missing.length === 0 && extra.length === 0 && differ.length === 0 && srcRows.length === pgRows.length;
      if (!ok) out.ok = false;
      out.tables[table.name] = entry;
      console.log(`${ok ? 'OK  ' : 'DIFF'} ${table.name.padEnd(22)} src=${srcRows.length} pg=${pgRows.length} grown=${grown} miss=${missing.length} extra=${extra.length} differ=${differ.length}`);

      if (table.sequence) {
        const seq = (await pgc.query(`SELECT pg_get_serial_sequence('portal.${table.name}', 'id') AS s`)).rows[0].s;
        const { rows: [s] } = await pgc.query(`SELECT last_value, is_called FROM ${seq}`);
        const next = s.is_called ? Number(s.last_value) + 1 : Number(s.last_value);
        const ai = autoInc.get(table.name);
        const seqOk = next === ai;
        if (!seqOk) out.ok = false;
        out.sequences[table.name] = { next_value: next, source_auto_increment: ai, ok: seqOk };
        if (!seqOk) console.log(`SEQ  ${table.name}: next ${next} vs AUTO_INCREMENT ${ai}`);
      }
    }

    const { rows: [cat] } = await pgc.query(`SELECT
      (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'portal' AND c.contype = 'p') AS pks,
      (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'portal' AND c.contype = 'u') AS uniques,
      (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'portal' AND c.contype = 'f') AS fks,
      (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'portal' AND c.contype = 'c') AS checks,
      (SELECT count(*) FROM pg_indexes WHERE schemaname = 'portal') AS indexes`);
    out.catalog = { ...cat, expected: { pks: 26, uniques: 15, fks: 35, checks: '9 source + 0/1 flag and >= 0 checks (25)', indexes: '86 — see 02_CONTRACTS.md' } };
    console.log(`CATALOG ${JSON.stringify(cat)}`);
    console.log(out.ok ? 'RECONCILE OK' : 'RECONCILE FOUND DIFFERENCES');
    if (!out.ok) process.exitCode = 1;
  } finally {
    pgc.release();
    await p.end();
    try { await src.query('ROLLBACK'); } catch { /* read-only */ }
    await src.end();
    fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
    const outPath = path.join(P.REHEARSAL_DIR, `reconcile_${target.name}_${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`report: ${outPath}`);
  }
}

main().catch((e) => { console.error('reconcile failed:', require('../lib/safeMessage').safeMessage(e)); process.exit(1); });
