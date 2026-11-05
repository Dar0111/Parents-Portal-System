#!/usr/bin/env node
// Starts the PORTED API (server/server.js) in this process against the
// disposable local cluster, optionally with ONE thing broken in memory — a
// negative control (the file on disk is never written):
//   --break-fold          config/db.js's search fold case-only (Phase B,
//                         check 2: scripts/search-route.js)
//   --mutant no-running-log
//                         routes/backups.js without the log line of the
//                         RESTORE_RUNNING refusal (Phase H, backup-3:
//                         scripts/restore-e2e.js --expect-unlogged)
//   --mutant no-class-row-lock
//                         routes/grades.js: PUT /class-record without the lock
//                         on its class's grade rows (F-1, D-267; the control
//                         for p4b-concurrency.js C3, C3sf, C3mf, C3r, C3s, C3m)
//   --mutant bulk-lock-without-of
//                         routes/grades.js: POST /locks locking every joined
//                         table again, the students rows too (D-267 addition 1;
//                         the control for p4b-concurrency.js C3d)
//   --mutant no-ack-on-conflict
//                         routes/grades.js: POST /acknowledgements without ON
//                         CONFLICT (F-2, D-267; the control for C1)
// Each mutant names ONE change, refused unless its anchor matches exactly once.
// The PG_* / JWT_SECRET / PORT environment comes from the caller; this refuses
// anything but the embedded local cluster, one of this package's databases on
// it (the transfer target or a disposable parents_portal_* one), and 5010.
//   node scripts/serve-pg.js [--break-fold] [--mutant <name>]
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { LOCAL_PG } = require('../lib/env');

const SERVER = path.join(__dirname, '..', '..', 'server');
const loopback = ['127.0.0.1', 'localhost'].includes(process.env.PG_HOST);
const ownDatabase = process.env.PG_DATABASE === LOCAL_PG.database || /^parents_portal_[a-z0-9_]+$/.test(process.env.PG_DATABASE || '');
if (!loopback || Number(process.env.PG_PORT) !== LOCAL_PG.port || !ownDatabase) {
  console.error('serve-pg runs against the disposable local cluster only (PG_HOST loopback, its port, one of its databases).');
  process.exit(2);
}
if (Number(process.env.PORT) !== 5010) {
  console.error('serve-pg listens on 5010 only.');
  process.exit(2);
}
process.chdir(SERVER);
const db = require(path.join(SERVER, 'config', 'db'));
if (process.argv.includes('--break-fold')) {
  // case folding kept, ACCENT folding gone: what a port without the fold did
  db.foldedSql = (expression) => `lower(${expression} COLLATE "und-x-icu")`;
  db.foldedContains = (term) => `%${String(term).toLowerCase()}%`;
  db.foldText = (value) => String(value).toLowerCase();
  console.log('NEGATIVE CONTROL: the search fold is broken in memory (case only, no accent folding)');
}
const MUTANTS = {
  'no-running-log': {
    file: 'backups.js',
    re: / {4}await logRestoreRefusal\(req\.user\.id, backup\.filename, 'another restore was running'\);\r?\n/,
    to: '',
    note: 'routes/backups.js without the RESTORE_RUNNING refusal log line',
  },
  'no-class-row-lock': {
    file: 'grades.js',
    re: / {4}await conn\.query\(\r?\n {6}`SELECT g\.id\r?\n\s+FROM grades g\r?\n\s+JOIN students st ON st\.id = g\.student_id\r?\n\s+WHERE st\.grade_level = \? AND st\.section = \? AND g\.subject_id = \? AND g\.term = \? AND g\.school_year = \?\r?\n\s+ORDER BY g\.id\r?\n\s+FOR UPDATE OF g`,\r?\n {6}\[key\.gradeLevel, key\.section, key\.subjectId, key\.term, key\.schoolYear\]\r?\n {4}\);\r?\n/,
    to: '',
    note: 'routes/grades.js: PUT /class-record without the lock on its class\'s grade rows',
  },
  'bulk-lock-without-of': {
    file: 'grades.js',
    re: /\$\{dryRun \? '' : 'FOR UPDATE OF g'\}/,
    to: "${dryRun ? '' : 'FOR UPDATE'}",
    note: 'routes/grades.js: POST /locks taking FOR UPDATE on every joined table (the students rows too)',
  },
  'no-ack-on-conflict': {
    file: 'grades.js',
    re: /\r?\n\s+ON CONFLICT \(student_id, school_year, term\) DO NOTHING/,
    to: '',
    note: 'routes/grades.js: POST /acknowledgements without ON CONFLICT',
  },
};
const mutantAt = process.argv.indexOf('--mutant');
if (mutantAt > 0) {
  const name = process.argv[mutantAt + 1];
  const mutant = MUTANTS[name];
  if (!mutant) {
    console.error(`--mutant must be one of: ${Object.keys(MUTANTS).join(', ')}`);
    process.exit(2);
  }
  const file = path.join(SERVER, 'routes', mutant.file);
  const src = fs.readFileSync(file, 'utf8');
  const hits = src.match(new RegExp(mutant.re.source, 'g')) || [];
  if (hits.length !== 1) {
    console.error(`mutant anchor matched ${hits.length} times (need exactly 1) — refusing to start`);
    process.exit(2);
  }
  const mutated = src.replace(mutant.re, () => mutant.to);
  const load = Module._extensions['.js'];
  Module._extensions['.js'] = function patched(m, filename) {
    if (path.resolve(filename) === path.resolve(file)) return m._compile(mutated, filename);
    return load(m, filename);
  };
  console.log(`NEGATIVE CONTROL: ${mutant.note} (in memory)`);
}
require(path.join(SERVER, 'server.js'));
