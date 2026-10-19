#!/usr/bin/env node
// Manifest of every file in the application's server/backups/ (READ ONLY —
// nothing is moved, renamed, deleted or rewritten) reconciled against the
// `backups` table (read-only). Output: <DATA_DIR>/manifests/backups_<stamp>.json
// with per-file sha256, size, mtime, header (dump tool + versions), footer
// presence, CREATE DATABASE presence, table-structure count, the presence of
// the two retired Contributions tables, and the catalog row if any. The
// console gets counts only.
//
// Validation status per file:
//   verified     footer present, header is a mysqldump header, >= 20 tables
//   unverified   no footer (an incomplete dump until investigated by hand) or
//                an unexpected header / table count
//   partial      a `.sql.partial` left by a process that died mid-dump
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readOnly } = require('../lib/mysql');
const P = require('../lib/paths');

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function tail(file, size, n = 200) {
  const len = Math.min(n, size);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

async function main() {
  const dir = P.APP_BACKUPS_DIR;
  const names = fs.readdirSync(dir).filter((n) => n.endsWith('.sql') || n.endsWith('.sql.partial'));
  const files = [];
  for (const name of names) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    const text = fs.readFileSync(full, 'utf8');
    const header = text.split(/\r?\n/, 3);
    const footer = /-- Dump completed on/.test(tail(full, st.size));
    const tables = (text.match(/^-- Table structure for table `([^`]+)`/gm) || []).map((l) => l.replace(/^-- Table structure for table `([^`]+)`/, '$1'));
    const entry = {
      filename: name,
      bytes: st.size,
      mtime: st.mtime.toISOString(),
      sha256: sha256(full),
      header: header[0] || '',
      server_version_line: header[2] || '',
      footer_present: footer,
      create_database: /^CREATE DATABASE/m.test(text),
      table_count: tables.length,
      has_contributions: tables.includes('contributions') || tables.includes('contribution_records'),
      has_assessment_slots: tables.includes('assessment_slots'),
      has_privacy_tables: tables.includes('policy_acceptances') && tables.includes('login_attempts'),
      has_auth_codes: tables.includes('auth_codes'),
      backups_ddl_block: tables.includes('backups'),
      kind: name.startsWith('pre_restore_') ? 'pre_restore' : name.endsWith('.partial') ? 'partial' : 'manual',
      format: /^-- MySQL dump/.test(header[0] || '') ? 'mysqldump' : 'unknown',
      status: name.endsWith('.partial') ? 'partial' : footer && /^-- MySQL dump/.test(header[0] || '') && tables.length >= 20 ? 'verified' : 'unverified',
      catalog_row: null,
    };
    files.push(entry);
  }

  const conn = await readOnly();
  const [rows] = await conn.query('SELECT id, filename, file_path, file_size, created_by, created_at FROM backups ORDER BY id');
  await conn.end();
  const byName = new Map(files.map((f) => [f.filename, f]));
  const rowsWithoutFile = [];
  const sizeMismatch = [];
  for (const r of rows) {
    const f = byName.get(r.filename);
    if (!f) { rowsWithoutFile.push(r.id); continue; }
    f.catalog_row = { id: r.id, file_size: Number(r.file_size), created_by: r.created_by, created_at: r.created_at, file_path_is_absolute: path.isAbsolute(r.file_path), file_path_dir_matches: path.dirname(r.file_path).toLowerCase() === dir.toLowerCase() };
    if (Number(r.file_size) !== f.bytes) sizeMismatch.push(r.id);
  }
  const summary = {
    directory_files: files.length,
    sql_files: files.filter((f) => f.kind !== 'partial').length,
    partial_files: files.filter((f) => f.kind === 'partial').length,
    catalog_rows: rows.length,
    rows_with_file: rows.length - rowsWithoutFile.length,
    rows_without_file: rowsWithoutFile.length,
    files_without_row: files.filter((f) => !f.catalog_row && f.kind !== 'partial').length,
    size_mismatches: sizeMismatch.length,
    verified: files.filter((f) => f.status === 'verified').length,
    unverified: files.filter((f) => f.status === 'unverified').length,
    no_footer: files.filter((f) => !f.footer_present && f.kind !== 'partial').length,
    with_contributions_tables: files.filter((f) => f.has_contributions).length,
    without_assessment_slots: files.filter((f) => !f.has_assessment_slots && f.kind !== 'partial').length,
    without_privacy_tables: files.filter((f) => !f.has_privacy_tables && f.kind !== 'partial').length,
    pre_restore_files: files.filter((f) => f.kind === 'pre_restore').length,
    pre_restore_rows: rows.filter((r) => r.filename.startsWith('pre_restore_')).length,
    all_rows_absolute_paths: rows.every((r) => path.isAbsolute(r.file_path)),
    all_rows_point_at_this_dir: rows.every((r) => path.dirname(r.file_path).toLowerCase() === dir.toLowerCase()),
    total_bytes: files.reduce((s, f) => s + f.bytes, 0),
    oldest_mtime: files.map((f) => f.mtime).sort()[0] || null,
    newest_mtime: files.map((f) => f.mtime).sort().slice(-1)[0] || null,
  };
  fs.mkdirSync(P.MANIFEST_DIR, { recursive: true });
  const outPath = path.join(P.MANIFEST_DIR, `backups_${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ directory: dir, generated_at: new Date().toISOString(), summary, files, rows_without_file: rowsWithoutFile, size_mismatch_rows: sizeMismatch }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`manifest: ${outPath}`);
}

main().catch((e) => { console.error('backups-manifest failed:', require('../lib/safeMessage').safeMessage(e)); process.exit(1); });
