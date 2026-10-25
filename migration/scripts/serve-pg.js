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
// The PG_* / JWT_SECRET / PORT environment comes from the caller; this refuses
// anything but the embedded local cluster, one of this package's databases on
// it (the transfer target or a disposable parents_portal_* one), and 5010.
//   node scripts/serve-pg.js [--break-fold] [--mutant no-running-log]
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
const mutantAt = process.argv.indexOf('--mutant');
if (mutantAt > 0) {
  if (process.argv[mutantAt + 1] !== 'no-running-log') {
    console.error('--mutant must be no-running-log');
    process.exit(2);
  }
  const file = path.join(SERVER, 'routes', 'backups.js');
  const src = fs.readFileSync(file, 'utf8');
  const re = / {4}await logRestoreRefusal\(req\.user\.id, backup\.filename, 'another restore was running'\);\r?\n/;
  if (!re.test(src)) {
    console.error('mutant anchor not found — refusing to start');
    process.exit(2);
  }
  const mutated = src.replace(re, '');
  const load = Module._extensions['.js'];
  Module._extensions['.js'] = function patched(m, filename) {
    if (path.resolve(filename) === path.resolve(file)) return m._compile(mutated, filename);
    return load(m, filename);
  };
  console.log('NEGATIVE CONTROL: routes/backups.js without the RESTORE_RUNNING refusal log line (in memory)');
}
require(path.join(SERVER, 'server.js'));
