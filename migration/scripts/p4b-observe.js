#!/usr/bin/env node
// P4 PART B — THE INDEPENDENT OBSERVER, from the command line (lib/p4b.js
// observe()). Its own connection as the cluster's superuser, one READ ONLY
// snapshot, never the API's pool. Prints counts, 16-hex hashes and booleans;
// never a row.
//
//   node scripts/p4b-observe.js snapshot <label> [--compare <earlier.json>]
//       Writes <DATA_DIR>/rehearsal/p4b_observe-<label>_<stamp>.json and prints
//       the row counts, the sequence check and the sessions; with --compare,
//       the tables that differ from the earlier snapshot.
const fs = require('fs');
const h = require('../lib/p4b');

async function main() {
  const [cmd, label = 'snapshot', ...rest] = process.argv.slice(2);
  if (cmd !== 'snapshot') {
    h.say('usage: node scripts/p4b-observe.js snapshot <label> [--compare <earlier.json>]');
    process.exitCode = 2;
    return;
  }
  h.assertIsolation();
  const c = await h.superClient(process.env.PG_DATABASE, 'p4b-observer');
  let snap;
  try {
    snap = await h.observe(c, label);
  } finally {
    await c.end();
  }
  const file = h.writeReport(`observe-${label.replace(/[^a-z0-9_-]/gi, '_')}`, snap);
  h.say(`snapshot ${label}: ${snap.database}, ${Object.keys(snap.tables).length} tables`);
  h.say(`  rows: ${Object.entries(snap.tables).map(([t, v]) => `${t} ${v.n}`).join(', ')}`);
  const seq = h.sequenceViolations(snap);
  h.say(`  sequences: ${snap.sequences.length} checked, ${seq.length ? `VIOLATIONS ${JSON.stringify(seq)}` : 'every one ahead of its highest id'}`);
  h.say(`  sessions: ${snap.sessions.total} other, idle in transaction ${snap.sessions.idleInTx}, waiting on a lock ${snap.sessions.waitingLock}, prepared ${snap.sessions.prepared}, ungranted locks ${snap.sessions.ungranted}`);
  h.say(`  backup files: ${snap.files.zip.length} .zip, ${snap.files.partial} .partial, ${snap.files.sql} .sql`);
  h.say(`  cutoff row: ${snap.cutoff.rows}`);
  const at = rest.indexOf('--compare');
  if (at >= 0) {
    const earlier = JSON.parse(fs.readFileSync(rest[at + 1], 'utf8'));
    const changed = h.changedTables(earlier, snap);
    h.say(`  changed since ${earlier.label}: ${changed.length ? changed.map((t) => `${t} ${earlier.tables[t] ? earlier.tables[t].n : '-'}->${snap.tables[t] ? snap.tables[t].n : '-'}`).join(', ') : 'none'}`);
    const back = h.sequenceViolations(snap, earlier).filter((v) => v.problem === 'BACKWARDS');
    h.say(`  sequences moved backwards since ${earlier.label}: ${back.length ? JSON.stringify(back) : 'none'}`);
  }
  h.say(`  report: ${file}`);
  process.exitCode = seq.length || snap.sessions.idleInTx || snap.sessions.prepared ? 1 : 0;
}

main().catch((error) => {
  h.say(`observe error: ${error && error.message ? error.message : error}`);
  process.exitCode = 1;
});
