// MODULE 15 (2026-11-03) — THE ACTIVITY RESET: D-122, by the approved production
// procedure D-175 asks for. docs/ACTIVITY_RESET.md has the scope, the run sheet
// and the rollback. Same owner connection as scripts/demo-clear-messages.js.
//
//   npm run activity:reset -- --before=<T>                        a dry run: BEGIN READ ONLY, counts only
//   npm run activity:reset -- --before=<T> --expect=<N> --apply   ONE transaction; any error rolls it back
//
// <T> is YYYY-MM-DDTHH:MM:SS+08:00 and nothing else: no `Z`, no bare time. A row's
// time is an instant and Admin → Activity log prints it in Manila time, so the
// offset is typed and never assumed. <N> is the dry run's Delete count; any other
// count rolls the whole run back.
//
// A non-loopback host also needs PORTAL_ACTIVITY_RESET=production-activity-reset
// in that one command. PORTAL_DEMO_HOSTED does not unlock this: a line from the
// demo load's history must never be able to delete the log.
//
// WHAT GOES: every row older than T that KEEP_CODES and KEEP_IDS do not name.
// WHAT STAYS: those rows, and every row at or after T. One row is added, with
// counts only, so the reset itself is on the record.
//
// NOTHING ELSE IS TOUCHED. No other table is written, the identity sequence is
// left alone (a restore never moves one backwards, and Entry numbers simply
// continue), and there is no TRUNCATE, which would take today's rows with it.
//
// THIS SCRIPT PRINTS COUNTS BY ACTION CODE. `description` and `user_id` are never
// selected: old rows hold LRNs and login ids in `description`, and a parent's
// login id IS the child's LRN. reportFailure() is the only error path.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../config/db');
const demo = require('./demoData');
const { isRealDate } = require('../utils/manilaTime');
const { COUNT_TABLES, atStep, reportFailure, connectOwner, begin, tableCounts, printCounts } = require('./demo-load');

const { Refusal } = demo;

// The same shape as demo.HOSTED_FLAG, and deliberately not the same key.
const HOSTED_FLAG = 'PORTAL_ACTIVITY_RESET';
const HOSTED_VALUE = 'production-activity-reset';

// The owner's answer of 2026-11-03: Option 2 of the plan. Audit history the
// written rules protect, the record of bulk writes to production, and the log's
// own "I was rewound" rows. `restore_refused` goes.
const KEEP_CODES = Object.freeze([
  'seed',
  'create_contribution',
  'update_contribution',
  'delete_contribution',
  'update_contribution_record',
  'demo_data_load',
  'demo_data_undo',
  'demo_messages_clear',
  'demo_passwords_set',
  'restore_backup',
  'restore_wiped_activity_logs',
]);

// The three rows dated by the clock test (CLAUDE.md → After Stage 4).
const KEEP_IDS = Object.freeze([5515, 5516, 5517]);

// ONE RULE, THREE READINGS. The dry run's count and the DELETE share this text,
// so what was approved is what runs. The columns are NOT NULL, so the three
// parts cover the table exactly.
const OLDER = 'created_at < ?::timestamptz';
const KEPT = '(action = ANY(?::text[]) OR id = ANY(?::int[]))';
const TO_DELETE = `${OLDER} AND NOT ${KEPT}`;
const KEEP_OLD = `${OLDER} AND ${KEPT}`;
const SINCE = 'created_at >= ?::timestamptz';

const BEFORE_SHAPE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\+08:00$/;
const EXPECT_SHAPE = /^\d{1,9}$/;

function parseBefore(value, now) {
  const match = BEFORE_SHAPE.exec(value || '');
  if (!match) throw new Refusal('--before must look like 2026-11-03T03:35:00+08:00: Manila time, with the offset.');
  const [, date, hour, minute, second] = match;
  if (!isRealDate(date) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new Refusal('--before is not a real date and time.');
  }
  if (Date.parse(value) >= now) throw new Refusal('--before is in the future.');
  return value;
}

// `now` is a parameter so a test can fix it.
function parseArgs(argv, now = Date.now()) {
  const args = { before: null, expect: null, apply: false };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg.startsWith('--before=')) args.before = arg.slice('--before='.length);
    else if (arg.startsWith('--expect=')) args.expect = arg.slice('--expect='.length);
    else throw new Refusal('Only --before=<T>, --expect=<N> and --apply are accepted.');
  }
  const before = parseBefore(args.before, now);
  if (args.expect !== null && !args.apply) throw new Refusal('--expect goes with --apply. A dry run needs only --before.');
  if (args.apply && args.expect === null) throw new Refusal("--apply needs --expect=<N>, the dry run's Delete count.");
  if (args.apply && !EXPECT_SHAPE.test(args.expect)) throw new Refusal('--expect must be a whole number.');
  return { before, apply: args.apply, expect: args.apply ? Number(args.expect) : null };
}

// Reading is allowed anywhere; a dry run is a READ ONLY transaction. Deleting on
// anything but a loopback host needs the exact flag, in that command alone.
function assertTarget({ host, apply, flag }) {
  if (!apply || demo.LOOPBACK.has(host)) return;
  if (flag !== HOSTED_VALUE) {
    throw new Refusal(`--apply on a non-loopback host needs ${HOSTED_FLAG}=${HOSTED_VALUE} in that one command.`);
  }
}

function ownerSettings(apply) {
  const settings = { ...db.settings('migrate'), application_name: 'parents-portal-activity-reset' };
  assertTarget({ host: settings.host, apply, flag: process.env[HOSTED_FLAG] });
  if (!settings.password) throw new Refusal('PG_MIGRATE_PASSWORD is not set.');
  return settings;
}

async function readPart(conn, where, params) {
  const { rows: summary } = await conn.query(
    `SELECT COUNT(*) AS n, MIN(id) AS first_id, MAX(id) AS last_id,
            to_char(MIN(created_at) AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS') AS oldest,
            to_char(MAX(created_at) AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS') AS newest
       FROM activity_logs WHERE ${where}`,
    params
  );
  const { rows: byCode } = await conn.query(
    `SELECT action, COUNT(*) AS n FROM activity_logs WHERE ${where} GROUP BY action ORDER BY action`,
    params
  );
  return { ...summary[0], total: Number(summary[0].n), byCode };
}

async function readParts(conn, before) {
  const keep = [before, [...KEEP_CODES], [...KEEP_IDS]];
  return {
    toDelete: await readPart(conn, TO_DELETE, keep),
    keepOld: await readPart(conn, KEEP_OLD, keep),
    since: await readPart(conn, SINCE, [before]),
    clockRows: Number((await conn.query('SELECT COUNT(*) AS n FROM activity_logs WHERE id = ANY(?::int[])', [[...KEEP_IDS]])).rows[0].n),
  };
}

function printPart(title, part) {
  const span = part.total ? `, ids ${part.first_id} to ${part.last_id}, ${part.oldest} to ${part.newest} Manila` : '';
  console.log(`${title}: ${part.total} ${part.total === 1 ? 'row' : 'rows'}${span}.`);
  for (const row of part.byCode) console.log(`  ${row.action.padEnd(32)}${String(row.n).padStart(7)}`);
}

function printParts(parts) {
  printPart('Delete', parts.toDelete);
  printPart('Keep, older than the cutoff', parts.keepOld);
  printPart('Keep, since the cutoff', parts.since);
  console.log(`Clock rows found: ${parts.clockRows} of ${KEEP_IDS.length}.`);
}

async function writeReset(conn, before, expect, keptOld) {
  atStep('deleting');
  const deleted = await conn.query(`DELETE FROM activity_logs WHERE ${TO_DELETE}`, [before, [...KEEP_CODES], [...KEEP_IDS]]);
  if (deleted.rowCount !== expect) {
    throw new Refusal(`Expected to delete ${expect} rows, deleted ${deleted.rowCount}. Nothing was written.`);
  }

  atStep('activity');
  const { rows } = await conn.query('SELECT id FROM users WHERE login_id = ? LIMIT 1', [demo.ADMIN_LOGIN]);
  await conn.query('INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)', [
    rows[0] ? rows[0].id : null,
    'activity_log_reset',
    `Activity log reset: ${expect} rows older than ${before} deleted, ${keptOld} older rows kept.`,
  ]);
}

async function main() {
  const { before, expect, apply } = parseArgs(process.argv.slice(2));
  const settings = ownerSettings(apply);
  console.log(`Target: ${demo.LOOPBACK.has(settings.host) ? 'loopback' : 'hosted'}.`);
  console.log(`Cutoff: ${before}.`);

  atStep('connecting');
  const { client, conn } = await connectOwner(settings);
  try {
    await begin(conn, apply);
    console.log(apply ? 'BEGIN: one transaction, rollback on any error.' : 'BEGIN READ ONLY: a dry run, nothing can be written.');

    atStep('reading');
    const countsBefore = await tableCounts(conn);
    const parts = await readParts(conn, before);
    printParts(parts);

    if (!apply) {
      await conn.query('ROLLBACK');
      console.log('Dry run complete. Nothing was written.');
      return;
    }

    if (parts.toDelete.total !== expect) {
      throw new Refusal(`--expect says ${expect}, this run counts ${parts.toDelete.total}. Nothing was written.`);
    }
    if (expect === 0) {
      await conn.query('ROLLBACK');
      console.log('Nothing to delete.');
      return;
    }

    await writeReset(conn, before, expect, parts.keepOld.total);
    atStep('commit');
    await conn.query('COMMIT');

    atStep('counts');
    await conn.query('SET search_path TO portal, pg_catalog');
    const countsAfter = await tableCounts(conn);
    printCounts('Counts per table:', countsBefore, countsAfter);
    const changed = COUNT_TABLES.filter((table) => table !== 'activity_logs' && countsAfter[table] !== countsBefore[table]);
    console.log(changed.length ? `Row counts differ: ${changed.join(', ')}.` : 'Row counts equal, activity_logs aside.');
    console.log(`Deleted: ${expect}. Older rows kept: ${parts.keepOld.total}.`);
    console.log('Reset committed.');
  } catch (error) {
    try {
      await conn.query('ROLLBACK');
    } catch {
      // the connection is closed below either way, and that rolls back too
    }
    throw error;
  } finally {
    await client.end();
  }
}

function run() {
  return main()
    .catch(reportFailure)
    .finally(() => db.end());
}

if (require.main === module) run();

// The gate's negative controls compile a changed copy of this file in memory.
module.exports = { HOSTED_FLAG, HOSTED_VALUE, KEEP_CODES, KEEP_IDS, assertTarget, parseArgs, run };
