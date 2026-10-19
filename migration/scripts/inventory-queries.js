#!/usr/bin/env node
// Lists every `.query(` call site in the server's application code (routes,
// utils, middleware, socket.js, server.js — never scripts/ or seeds) with the
// SQL verb and the MySQL-specific constructs it carries, so the port
// inventory (docs/03_QUERY_PORT_INVENTORY.md) is derived, not remembered.
// Prints to stdout only; the document is written by hand from it.
const fs = require('fs');
const path = require('path');
const P = require('../lib/paths');

const ROOTS = ['routes', 'utils', 'middleware'].map((d) => path.join(P.SERVER_SRC_DIR, d)).concat([
  path.join(P.SERVER_SRC_DIR, 'socket.js'),
  path.join(P.SERVER_SRC_DIR, 'server.js'),
]);

const FLAGS = [
  ['IN(?)', /\bIN \(\?\)/],
  ['VALUES?', /VALUES \?/],
  ['ONDUP', /ON DUPLICATE KEY/],
  ['IGNORE', /INSERT IGNORE/],
  ['NOW3', /NOW\(3\)/],
  ['NOW', /NOW\(\)/],
  ['INTERVAL', /INTERVAL/],
  ['TSDIFF', /TIMESTAMPDIFF/],
  ['GROUP_CONCAT', /GROUP_CONCAT/],
  ['CONCAT', /\bCONCAT\(/],
  ['CAST', /CAST\(/],
  ['FORUPDATE', /FOR UPDATE/],
  ['LIKE', /\bLIKE\b/],
  ['LIMIT?', /LIMIT \?/],
  ['NULLSORT', /IS NULL,/],
  ['BOOLSUM', /SUM\([^)]*IS (NOT )?NULL\)/],
  ['BOOLEXPR', /\(([a-z_.]+ IS (NOT )?NULL( OR [a-z_.]+ IS (NOT )?NULL)*)\) AS/],
  ['DQSTR', /"[^"]*"/],
  ['DYNAMIC', /\$\{/],
  ['SELECT*', /SELECT \*|\.\*/],
  ['ENUMEQ', /(is_locked|read_status|cleared|must_change_password|acknowledged) (=|<>) [01?]/],
];

function* walk(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const n of fs.readdirSync(p)) yield* walk(path.join(p, n));
  else if (p.endsWith('.js')) yield p;
}

const rows = [];
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split(/\r?\n/);
    const re = /\.query\(/g;
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split(/\r?\n/).length;
      // the call text up to the matching close paren (bounded)
      let depth = 0; let end = m.index + 6;
      for (; end < src.length && end < m.index + 4000; end += 1) {
        if (src[end] === '(') depth += 1;
        else if (src[end] === ')') { if (depth === 0) break; depth -= 1; }
      }
      const call = src.slice(m.index, end);
      const after = lines.slice(line - 1, line + 6).join(' ');
      const sql = call.replace(/\s+/g, ' ');
      const verb = (sql.match(/\b(SELECT|INSERT|UPDATE|DELETE|START|SET|COMMIT|ROLLBACK|CHECKSUM)\b/i) || [, 'DYNAMIC/REF'])[1].toUpperCase();
      const flags = FLAGS.filter(([, r]) => r.test(sql)).map(([f]) => f);
      if (/insertId/.test(src.slice(m.index, m.index + 1200))) flags.push('insertId');
      if (/affectedRows/.test(src.slice(m.index, m.index + 1200))) flags.push('affectedRows');
      const conn = /conn\.query\(|connection\.query\(/.test(src.slice(m.index - 11, m.index + 7)) ? 'txn' : 'pool';
      const table = (sql.match(/\b(?:FROM|INTO|UPDATE|JOIN)\s+`?([a-z_]+)`?/i) || [, '-'])[1];
      rows.push({ file: path.relative(P.SERVER_SRC_DIR, file).replace(/\\/g, '/'), line, verb, conn, table, flags: flags.join(','), head: sql.slice(0, 90) });
      void after;
    }
  }
}
rows.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
console.log(`TOTAL ${rows.length} query call sites in ${new Set(rows.map((r) => r.file)).size} files`);
const byFile = {};
for (const r of rows) byFile[r.file] = (byFile[r.file] || 0) + 1;
console.log('PER FILE ' + JSON.stringify(byFile));
const byFlag = {};
for (const r of rows) for (const f of r.flags.split(',').filter(Boolean)) byFlag[f] = (byFlag[f] || 0) + 1;
console.log('PER FLAG ' + JSON.stringify(byFlag));
for (const r of rows) console.log(`${r.file}:${r.line}\t${r.verb}\t${r.conn}\t${r.table}\t[${r.flags}]\t${r.head}`);
