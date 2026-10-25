#!/usr/bin/env node
// Starts the PORTED API (server/server.js) in this process against the
// disposable local cluster, optionally with config/db.js's search fold BROKEN
// in memory — the negative control of scripts/search-route.js (Phase B, check
// 2; Josh's requirement 5: breaking accent folding must make the positive
// test fail). The PG_* / JWT_SECRET / PORT environment comes from the caller;
// this refuses anything but the embedded local cluster and port 5010.
//   node scripts/serve-pg.js [--break-fold]
const path = require('path');
const { LOCAL_PG } = require('../lib/env');

const SERVER = path.join(__dirname, '..', '..', 'server');
const loopback = ['127.0.0.1', 'localhost'].includes(process.env.PG_HOST);
if (!loopback || Number(process.env.PG_PORT) !== LOCAL_PG.port || process.env.PG_DATABASE !== LOCAL_PG.database) {
  console.error('serve-pg runs against the disposable local cluster only (PG_HOST loopback, its port, its database).');
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
require(path.join(SERVER, 'server.js'));
