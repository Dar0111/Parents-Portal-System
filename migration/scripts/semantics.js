#!/usr/bin/env node
// Measured semantics, side by side: the local PostgreSQL 17 (or --target
// staging for the parts that need no superuser) against an ISOLATED MySQL
// scratch database (a restored snapshot; --mysql-db <name>). Nothing here
// reads an application row: every case runs on literals or on throwaway
// tables named zz_sem_* that are dropped at the end.
//
//   node scripts/semantics.js --mysql-db parents_portal_migsrc_<stamp> [--target local]
//
// Sections (each prints PASS/INFO lines and lands in the JSON report):
//   A  server facts              version, ICU, collations, isolation defaults
//   B  time                      now() vs statement/clock time, precision
//                                rounding vs truncation, same-second cutoff,
//                                JS parsing under two session time zones
//   C  ON UPDATE matrix          7 behaviours of the trigger vs MySQL's clause
//   D  collation matrix          equality / unique / join / group / LIKE /
//                                order / wildcard escaping per candidate
//   E  driver and port checks    boolean params, ANY([]), ON CONFLICT batches,
//                                aggregate types, error classes, rowCount,
//                                interval maths, double-quoted strings
//   F  concurrency               FOR UPDATE, upsert races, duplicate-key
//                                races, REPEATABLE READ write conflicts
const fs = require('fs');
const path = require('path');
const { pool, pg } = require('../lib/pg');
const { targetConfig } = require('../lib/env');
const { scratch } = require('../lib/mysql');
const P = require('../lib/paths');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const { safeMessage } = require('../lib/safeMessage');

const report = { sections: {} };
let failures = 0;
function note(section, key, value, expect) {
  report.sections[section] = report.sections[section] || {};
  report.sections[section][key] = expect === undefined ? value : { value, expect, ok: JSON.stringify(value) === JSON.stringify(expect) };
  const tag = expect === undefined ? 'INFO' : JSON.stringify(value) === JSON.stringify(expect) ? 'PASS' : 'FAIL';
  if (tag === 'FAIL') failures += 1;
  console.log(`${tag} ${section}.${key} = ${JSON.stringify(value)}${expect === undefined ? '' : ` (expected ${JSON.stringify(expect)})`}`);
}
async function tryq(c, sql, params) {
  try {
    const r = await c.query(sql, params);
    return { ok: true, rows: r.rows, rowCount: r.rowCount };
  } catch (e) {
    return { ok: false, code: e.code, message: safeMessage(e) };
  }
}
async function tryMy(c, sql, params) {
  try {
    const [r] = await c.query(sql, params);
    return { ok: true, rows: Array.isArray(r) ? r : null, affectedRows: r.affectedRows, changedRows: r.changedRows, insertId: r.insertId };
  } catch (e) {
    return { ok: false, code: e.code, errno: e.errno, message: safeMessage(e) };
  }
}

async function sectionA(pgc, my) {
  const v = (await pgc.query('SELECT version() v, current_setting(\'server_version\') sv, current_setting(\'TimeZone\') tz, current_setting(\'default_transaction_isolation\') iso, current_setting(\'server_encoding\') enc')).rows[0];
  note('A', 'pg_version', v.sv);
  note('A', 'pg_timezone_setting', v.tz);
  note('A', 'pg_default_isolation', v.iso);
  const icu = (await pgc.query("SELECT count(*)::int n FROM pg_collation WHERE collprovider = 'i'")).rows[0].n;
  note('A', 'pg_icu_collations_available', icu > 0);
  // PostgreSQL 17 renamed colliculocale -> colllocale and daticulocale ->
  // datlocale; read the rows as JSON so either version answers.
  const ci = (await tryq(pgc, "SELECT to_jsonb(c) AS j FROM pg_collation c JOIN pg_namespace n ON n.oid = c.collnamespace WHERE n.nspname = 'portal' AND collname = 'ci'"));
  const cj = ci.ok && ci.rows[0] ? ci.rows[0].j : null;
  note('A', 'portal_ci', cj ? { provider: cj.collprovider, deterministic: cj.collisdeterministic, locale: cj.colllocale || cj.colliculocale || null } : 'absent (apply the schema first)');
  const dj = (await pgc.query('SELECT to_jsonb(d) AS j FROM pg_database d WHERE datname = current_database()')).rows[0].j;
  note('A', 'pg_database_locale', { datcollate: dj.datcollate, datctype: dj.datctype, provider: dj.datlocprovider, locale: dj.datlocale || dj.daticulocale || null });
  const ext = await tryq(pgc, "SELECT name, installed_version, default_version FROM pg_available_extensions WHERE name IN ('citext','unaccent','pg_trgm','pgcrypto') ORDER BY name");
  note('A', 'pg_extensions_available', ext.ok ? ext.rows : ext.code);
  if (my) {
    const [[m]] = await my.query('SELECT VERSION() v, @@transaction_isolation iso, @@collation_database coll, @@time_zone tz');
    note('A', 'mysql_version', m.v);
    note('A', 'mysql_default_isolation', m.iso);
    note('A', 'mysql_scratch_collation', m.coll);
  }
}

async function sectionB(pgc, my) {
  // B1: three clocks inside one transaction
  await pgc.query('BEGIN');
  const t1 = (await pgc.query('SELECT now() n, statement_timestamp() s, clock_timestamp() c')).rows[0];
  await pgc.query('SELECT pg_sleep(0.25)');
  const t2 = (await pgc.query('SELECT now() n, statement_timestamp() s, clock_timestamp() c')).rows[0];
  await pgc.query('COMMIT');
  note('B', 'now_constant_in_txn', t1.n.getTime() === t2.n.getTime(), true);
  note('B', 'statement_timestamp_advances_in_txn', t2.s.getTime() > t1.s.getTime(), true);
  note('B', 'clock_timestamp_advances_in_statement', (await pgc.query('SELECT clock_timestamp() > statement_timestamp() OR clock_timestamp() = statement_timestamp() AS ok')).rows[0].ok, true);

  // B2: precision — a (0) column ROUNDS, portal.now_s TRUNCATES
  const r = (await pgc.query(`SELECT ('2026-01-01 00:00:00.6+00'::timestamptz)::timestamptz(0) AS rounded,
                                     date_trunc('second', '2026-01-01 00:00:00.6+00'::timestamptz) AS truncated,
                                     ('2026-01-01 00:00:00.0006+00'::timestamptz)::timestamptz(3) AS ms_rounded`)).rows[0];
  note('B', 'timestamptz0_rounds_600ms_up', r.rounded.toISOString(), '2026-01-01T00:00:01.000Z');
  note('B', 'date_trunc_second_truncates', r.truncated.toISOString(), '2026-01-01T00:00:00.000Z');
  note('B', 'timestamptz3_rounds_microseconds', r.ms_rounded.toISOString(), '2026-01-01T00:00:00.001Z');
  const nowS = (await pgc.query('SELECT portal.now_s() s, statement_timestamp() raw')).rows[0];
  note('B', 'portal_now_s_is_whole_second', nowS.s.getTime() % 1000 === 0 && nowS.s.getTime() <= nowS.raw.getTime(), true);

  // B3: the restore cutoff vs a JWT iat in the SAME second
  await pgc.query('CREATE TEMP TABLE zz_cut (token_valid_after timestamptz(0))');
  await pgc.query('INSERT INTO zz_cut VALUES (portal.now_s())');
  const cutoff = (await pgc.query('SELECT token_valid_after FROM zz_cut')).rows[0].token_valid_after;
  const iatNow = Math.floor(Date.now() / 1000); // a token minted right after the cutoff write
  const rejectedNow = iatNow * 1000 < new Date(cutoff).getTime();
  const rejectedPrev = (iatNow - 1) * 1000 < new Date(cutoff).getTime();
  note('B', 'cutoff_same_second_token_minted_after_write_is_accepted', !rejectedNow, true);
  note('B', 'cutoff_token_one_second_earlier_is_rejected', rejectedPrev, true);
  // What rounding would have done: a cutoff rounded UP to the next second
  // would reject a legitimate token minted later in the same second.
  const roundedCutoff = (await pgc.query("SELECT (statement_timestamp() + interval '0.5 second')::timestamptz(0) AS c")).rows[0].c;
  note('B', 'rounded_cutoff_would_reject_same_second_token', Math.floor(Date.now() / 1000) * 1000 < new Date(roundedCutoff).getTime());
  // The middleware's comparison on a pg Date: identical to the MySQL path (decoded.iat*1000 < new Date(x).getTime())
  note('B', 'cutoff_value_is_js_date', cutoff instanceof Date, true);

  // B4: the instant survives the session time zone
  await pgc.query("SET TIME ZONE 'UTC'");
  const utc = (await pgc.query("SELECT '2026-10-13 16:39:44+08'::timestamptz AS t, ('2026-10-13 16:39:44+08'::timestamptz)::text AS txt")).rows[0];
  await pgc.query("SET TIME ZONE 'Asia/Manila'");
  const mnl = (await pgc.query("SELECT '2026-10-13 16:39:44+08'::timestamptz AS t, ('2026-10-13 16:39:44+08'::timestamptz)::text AS txt")).rows[0];
  await pgc.query('RESET TIME ZONE');
  note('B', 'timestamptz_same_instant_under_UTC_and_Manila', utc.t.getTime() === mnl.t.getTime(), true);
  note('B', 'timestamptz_text_differs_by_session_zone', [utc.txt, mnl.txt], ['2026-10-13 08:39:44+00', '2026-10-13 16:39:44+08']);
  note('B', 'timestamptz_json', utc.t.toJSON(), '2026-10-13T08:39:44.000Z');

  // B5: DATE stays a string; MySQL's dateStrings: ['DATE'] contract
  const d = (await pgc.query("SELECT DATE '2026-08-29' AS d, '2026-08-29'::date + 1 AS next")).rows[0];
  note('B', 'date_returned_as_string', [typeof d.d, d.d, d.next], ['string', '2026-08-29', '2026-08-30']);

  // B6: interval and difference maths used by authCodes / loginThrottle
  const iv = (await pgc.query("SELECT (timestamptz '2026-01-01 00:00:10+00' - make_interval(mins => $1)) AS back, floor(extract(epoch from (timestamptz '2026-01-01 00:00:59.9+00' - timestamptz '2026-01-01 00:00:00+00')))::int AS secs, extract(epoch from (timestamptz '2026-01-01 00:00:59.9+00' - timestamptz '2026-01-01 00:00:00+00'))::int AS secs_cast", [15])).rows[0];
  note('B', 'make_interval_bound_minutes', iv.back.toISOString(), '2025-12-31T23:45:10.000Z');
  note('B', 'epoch_diff_floor_matches_TIMESTAMPDIFF_truncation', iv.secs, 59);
  note('B', 'epoch_diff_plain_int_cast_ROUNDS', iv.secs_cast, 60);
  if (my) {
    const [[m]] = await my.query("SELECT TIMESTAMPDIFF(SECOND, '2026-01-01 00:00:00', '2026-01-01 00:00:59.9') AS secs, CAST('2026-01-01 00:00:00.6' AS DATETIME(0)) AS rounded0, NOW() = NOW() AS same, (SELECT SLEEP(0.2)) AS slept, NOW() AS n2");
    note('B', 'mysql_TIMESTAMPDIFF_truncates', Number(m.secs), 59);
    note('B', 'mysql_datetime0_rounds_600ms_up', String(m.rounded0), '2026-01-01 00:00:01');
  }
}

async function sectionC(pgc, my) {
  await pgc.query(`CREATE TEMP TABLE zz_touch (id int PRIMARY KEY, a int, b text, updated_at timestamptz(0) NOT NULL DEFAULT portal.now_s())`);
  await pgc.query('CREATE TRIGGER zz_touch_upd BEFORE UPDATE ON zz_touch FOR EACH ROW EXECUTE FUNCTION portal.touch_updated_at()');
  await pgc.query("INSERT INTO zz_touch (id, a, b, updated_at) VALUES (1, 1, 'x', '2020-01-01 00:00:00+00'), (2, NULL, 'y', '2020-01-01 00:00:00+00')");
  const read = async (id) => (await pgc.query('SELECT updated_at FROM zz_touch WHERE id = $1', [id])).rows[0].updated_at.toISOString();
  const OLD = '2020-01-01T00:00:00.000Z';
  let r = await pgc.query('UPDATE zz_touch SET a = 2 WHERE id = 1');
  note('C', 'pg_real_change_bumps', (await read(1)) !== OLD, true);
  const after1 = await read(1);
  r = await pgc.query('UPDATE zz_touch SET a = 2 WHERE id = 1');
  note('C', 'pg_noop_update_does_not_bump', (await read(1)) === after1, true);
  note('C', 'pg_noop_update_rowCount', r.rowCount, 1);
  await pgc.query('UPDATE zz_touch SET a = 5 WHERE id = 2');
  note('C', 'pg_null_to_value_bumps', (await read(2)) !== OLD, true);
  await pgc.query("UPDATE zz_touch SET updated_at = '2020-01-01 00:00:00+00' WHERE id = 2");
  note('C', 'pg_explicit_set_updated_at_wins', await read(2), OLD);
  await pgc.query('UPDATE zz_touch SET a = NULL WHERE id = 2');
  note('C', 'pg_value_to_null_bumps', (await read(2)) !== OLD, true);
  await pgc.query("UPDATE zz_touch SET updated_at = '2020-01-01 00:00:00+00' WHERE id = 1");
  r = await pgc.query("INSERT INTO zz_touch (id, a, b) VALUES (1, 2, 'x') ON CONFLICT (id) DO UPDATE SET a = EXCLUDED.a, b = EXCLUDED.b");
  note('C', 'pg_upsert_same_values_does_not_bump', await read(1), OLD);
  note('C', 'pg_upsert_same_values_rowCount', r.rowCount, 1);
  r = await pgc.query("INSERT INTO zz_touch (id, a, b) VALUES (1, 9, 'x') ON CONFLICT (id) DO UPDATE SET a = EXCLUDED.a, b = EXCLUDED.b");
  note('C', 'pg_upsert_changed_values_bumps', (await read(1)) !== OLD, true);
  r = await pgc.query("INSERT INTO zz_touch (id, a, b) VALUES (3, 1, 'z') ON CONFLICT (id) DO UPDATE SET a = EXCLUDED.a");
  note('C', 'pg_upsert_insert_path_rowCount', r.rowCount, 1);

  if (my) {
    await my.query('DROP TABLE IF EXISTS zz_sem_touch');
    await my.query("CREATE TABLE zz_sem_touch (id INT PRIMARY KEY, a INT NULL, b VARCHAR(10), updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB");
    await my.query("INSERT INTO zz_sem_touch (id, a, b, updated_at) VALUES (1, 1, 'x', '2020-01-01 00:00:00'), (2, NULL, 'y', '2020-01-01 00:00:00')");
    const mread = async (id) => (await my.query('SELECT updated_at FROM zz_sem_touch WHERE id = ?', [id]))[0][0].updated_at;
    const MOLD = '2020-01-01 00:00:00';
    let m = await tryMy(my, 'UPDATE zz_sem_touch SET a = 2 WHERE id = 1');
    note('C', 'mysql_real_change_bumps', (await mread(1)) !== MOLD, true);
    note('C', 'mysql_real_change_affectedRows_changedRows', [m.affectedRows, m.changedRows]);
    const mAfter = await mread(1);
    m = await tryMy(my, 'UPDATE zz_sem_touch SET a = 2 WHERE id = 1');
    note('C', 'mysql_noop_update_does_not_bump', (await mread(1)) === mAfter, true);
    note('C', 'mysql_noop_update_affectedRows_changedRows', [m.affectedRows, m.changedRows]);
    await my.query('UPDATE zz_sem_touch SET a = 5 WHERE id = 2');
    note('C', 'mysql_null_to_value_bumps', (await mread(2)) !== MOLD, true);
    await my.query("UPDATE zz_sem_touch SET updated_at = '2020-01-01 00:00:00' WHERE id = 2");
    note('C', 'mysql_explicit_set_updated_at_wins', await mread(2), MOLD);
    await my.query('UPDATE zz_sem_touch SET a = NULL WHERE id = 2');
    note('C', 'mysql_value_to_null_bumps', (await mread(2)) !== MOLD, true);
    await my.query("UPDATE zz_sem_touch SET updated_at = '2020-01-01 00:00:00' WHERE id = 1");
    m = await tryMy(my, "INSERT INTO zz_sem_touch (id, a, b) VALUES (1, 2, 'x') ON DUPLICATE KEY UPDATE a = VALUES(a), b = VALUES(b)");
    note('C', 'mysql_upsert_same_values_does_not_bump', await mread(1), MOLD);
    note('C', 'mysql_upsert_same_values_affectedRows', m.affectedRows);
    m = await tryMy(my, "INSERT INTO zz_sem_touch (id, a, b) VALUES (1, 9, 'x') ON DUPLICATE KEY UPDATE a = VALUES(a), b = VALUES(b)");
    note('C', 'mysql_upsert_changed_values_bumps', (await mread(1)) !== MOLD, true);
    note('C', 'mysql_upsert_changed_values_affectedRows', m.affectedRows);
    m = await tryMy(my, "INSERT INTO zz_sem_touch (id, a, b) VALUES (3, 1, 'z') ON DUPLICATE KEY UPDATE a = VALUES(a)");
    note('C', 'mysql_upsert_insert_path_affectedRows', m.affectedRows);
    await my.query('DROP TABLE zz_sem_touch');
  }
}

const PAIRS = [
  ['case', 'abc', 'ABC'],
  ['trailing_space', 'abc', 'abc '],
  ['accent_n_tilde', 'Niño', 'Nino'],
  ['accent_e', 'José', 'Jose'],
  ['nfc_vs_nfd', 'é', 'é'],
  ['eszett_vs_ss', 'straße', 'strasse'],
  ['ligature_fi', 'ﬁsh', 'fish'],
  ['turkish_dotted_I', 'İ', 'i'],
  ['hyphen_vs_space', 'Mabait-A', 'Mabait A'],
  ['full_vs_half_width', 'ＡＢＣ', 'ABC'],
];
async function sectionD(pgc, my) {
  // candidates
  const candidates = [['default', 'COLLATE "default"'], ['portal_ci', 'COLLATE portal.ci']];
  const und = await tryq(pgc, "SELECT 1 FROM pg_collation WHERE collname = 'und-x-icu'");
  if (und.ok && und.rowCount) {
    candidates.push(['und_x_icu', 'COLLATE "und-x-icu"']);
    await tryq(pgc, "CREATE COLLATION portal.zz_sem_level2 (provider = icu, locale = 'und-u-ks-level2', deterministic = false)");
    await tryq(pgc, "CREATE COLLATION portal.zz_sem_level1_det (provider = icu, locale = 'und-u-ks-level1', deterministic = true)");
    candidates.push(['icu_level2_nondet', 'COLLATE portal.zz_sem_level2']);
    candidates.push(['icu_level1_det_sort_only', 'COLLATE portal.zz_sem_level1_det']);
  }
  const citext = await tryq(pgc, 'CREATE EXTENSION IF NOT EXISTS citext');
  note('D', 'citext_extension', citext.ok ? 'created/present' : citext.code);
  const D = {};
  for (const [name, coll] of candidates) {
    const row = {};
    for (const [label, a, b] of PAIRS) {
      const eq = await tryq(pgc, `SELECT ($1::text ${coll}) = ($2::text ${coll}) AS eq`, [a, b]);
      row[`eq:${label}`] = eq.ok ? eq.rows[0].eq : eq.code;
    }
    const like = await tryq(pgc, `SELECT ($1::text ${coll}) LIKE ($2::text ${coll}) AS m`, ['Mabait', 'mab%']);
    row['like_case'] = like.ok ? like.rows[0].m : `ERR ${like.code}`;
    const ilike = await tryq(pgc, `SELECT ($1::text ${coll}) ILIKE ($2::text ${coll}) AS m`, ['Mabait', 'mab%']);
    row['ilike_case'] = ilike.ok ? ilike.rows[0].m : `ERR ${ilike.code}`;
    const ilikeAcc = await tryq(pgc, `SELECT ($1::text ${coll}) ILIKE ($2::text ${coll}) AS m`, ['Niño', '%nino%']);
    row['ilike_accent'] = ilikeAcc.ok ? ilikeAcc.rows[0].m : `ERR ${ilikeAcc.code}`;
    const ord = await tryq(pgc, `SELECT string_agg(v, ',' ORDER BY v ${coll}) AS o FROM unnest(ARRAY['b','B','a','A','Á','á','z']) v`);
    row['order'] = ord.ok ? ord.rows[0].o : `ERR ${ord.code}`;
    const grp = await tryq(pgc, `SELECT count(*)::int AS groups FROM (SELECT 1 FROM unnest(ARRAY['Mabait','MABAIT','mabait','Masigasig']) v GROUP BY v ${coll}) g`);
    row['group_count'] = grp.ok ? grp.rows[0].groups : `ERR ${grp.code}`;
    const dst = await tryq(pgc, `SELECT count(DISTINCT v ${coll})::int AS n FROM unnest(ARRAY['Mabait','MABAIT','mabait','Masigasig']) v`);
    row['distinct_count'] = dst.ok ? dst.rows[0].n : `ERR ${dst.code}`;
    await tryq(pgc, 'DROP TABLE IF EXISTS zz_uq');
    const mk = await tryq(pgc, `CREATE TEMP TABLE zz_uq (v text ${coll} UNIQUE)`);
    if (mk.ok) {
      await pgc.query("INSERT INTO zz_uq VALUES ('Mabait')");
      const dup = await tryq(pgc, "INSERT INTO zz_uq VALUES ('MABAIT')");
      row['unique_refuses_case_variant'] = dup.ok ? false : dup.code;
      const dupAcc = await tryq(pgc, "INSERT INTO zz_uq VALUES ('Mabaít')");
      row['unique_refuses_accent_variant'] = dupAcc.ok ? false : dupAcc.code;
      const join = await tryq(pgc, `SELECT count(*)::int n FROM zz_uq a JOIN (SELECT 'mabait'::text ${coll} AS v) b ON a.v = b.v`);
      row['join_matches_lowercase'] = join.ok ? join.rows[0].n : `ERR ${join.code}`;
      const idx = await tryq(pgc, `SELECT count(*)::int n FROM zz_uq WHERE v = ('MABAIT'::text ${coll})`);
      row['where_eq_matches_uppercase'] = idx.ok ? idx.rows[0].n : `ERR ${idx.code}`;
      await pgc.query('DROP TABLE zz_uq');
    } else row['unique_table'] = `ERR ${mk.code}`;
    D[name] = row;
    console.log(`INFO D.${name} ${JSON.stringify(row)}`);
  }
  if (citext.ok) {
    const row = {};
    for (const [label, a, b] of PAIRS) {
      const eq = await tryq(pgc, 'SELECT $1::citext = $2::citext AS eq', [a, b]);
      row[`eq:${label}`] = eq.ok ? eq.rows[0].eq : eq.code;
    }
    const like = await tryq(pgc, 'SELECT $1::citext LIKE $2::citext AS m', ['Mabait', 'mab%']);
    row['like_case'] = like.ok ? like.rows[0].m : `ERR ${like.code}`;
    const likeAcc = await tryq(pgc, 'SELECT $1::citext LIKE $2::citext AS m', ['Niño', '%nino%']);
    row['like_accent'] = likeAcc.ok ? likeAcc.rows[0].m : `ERR ${likeAcc.code}`;
    const ord = await tryq(pgc, "SELECT string_agg(v::text, ',' ORDER BY v::citext) AS o FROM unnest(ARRAY['b','B','a','A','Á','á','z']) v");
    row['order'] = ord.ok ? ord.rows[0].o : `ERR ${ord.code}`;
    D.citext = row;
    console.log(`INFO D.citext ${JSON.stringify(row)}`);
  }
  // lower() strategy
  {
    const row = {};
    for (const [label, a, b] of PAIRS) {
      const eq = await tryq(pgc, 'SELECT lower($1::text) = lower($2::text) AS eq', [a, b]);
      row[`eq:${label}`] = eq.ok ? eq.rows[0].eq : eq.code;
    }
    D.lower = row;
    console.log(`INFO D.lower ${JSON.stringify(row)}`);
  }
  // wildcard escaping
  const wc = await tryq(pgc, "SELECT 'a_c' LIKE 'a_c' AS underscore_is_wild, 'abc' LIKE 'a_c' AS underscore_matches_b, 'a_c' LIKE 'a\\_c' AS escaped_default, 'abc' LIKE 'a\\_c' AS escaped_rejects_b, '100%' LIKE '100\\%' AS percent_escaped");
  note('D', 'pg_like_wildcards', wc.ok ? wc.rows[0] : wc.code);
  report.sections.D = { ...(report.sections.D || {}), matrix: D };

  if (my) {
    const M = {};
    for (const [label, a, b] of PAIRS) {
      const r = await tryMy(my, 'SELECT ? COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci AS eq', [a, b]);
      M[`eq:${label}`] = r.ok ? Number(r.rows[0].eq) === 1 : r.code;
    }
    const like = await tryMy(my, 'SELECT ? COLLATE utf8mb4_unicode_ci LIKE ? AS m', ['Mabait', 'mab%']);
    M['like_case'] = like.ok ? Number(like.rows[0].m) === 1 : like.code;
    const likeAcc = await tryMy(my, 'SELECT ? COLLATE utf8mb4_unicode_ci LIKE ? AS m', ['Niño', '%nino%']);
    M['like_accent'] = likeAcc.ok ? Number(likeAcc.rows[0].m) === 1 : likeAcc.code;
    const ord = await tryMy(my, "SELECT GROUP_CONCAT(v ORDER BY v COLLATE utf8mb4_unicode_ci SEPARATOR ',') AS o FROM (SELECT 'b' v UNION ALL SELECT 'B' UNION ALL SELECT 'a' UNION ALL SELECT 'A' UNION ALL SELECT 'Á' UNION ALL SELECT 'á' UNION ALL SELECT 'z') t");
    M['order'] = ord.ok ? ord.rows[0].o : ord.code;
    const grp = await tryMy(my, "SELECT COUNT(*) AS groups FROM (SELECT 1 FROM (SELECT 'Mabait' COLLATE utf8mb4_unicode_ci v UNION ALL SELECT 'MABAIT' UNION ALL SELECT 'mabait' UNION ALL SELECT 'Masigasig') t GROUP BY v) g");
    M['group_count'] = grp.ok ? Number(grp.rows[0].groups) : grp.code;
    await my.query('DROP TABLE IF EXISTS zz_sem_uq');
    await my.query('CREATE TABLE zz_sem_uq (v VARCHAR(50) UNIQUE) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await my.query("INSERT INTO zz_sem_uq VALUES ('Mabait')");
    const dup = await tryMy(my, "INSERT INTO zz_sem_uq VALUES ('MABAIT')");
    M['unique_refuses_case_variant'] = dup.ok ? false : dup.code;
    const dupAcc = await tryMy(my, "INSERT INTO zz_sem_uq VALUES ('Mabaít')");
    M['unique_refuses_accent_variant'] = dupAcc.ok ? false : dupAcc.code;
    const dupSp = await tryMy(my, "INSERT INTO zz_sem_uq VALUES ('Mabait ')");
    M['unique_refuses_trailing_space_variant'] = dupSp.ok ? false : dupSp.code;
    const wcm = await tryMy(my, "SELECT 'a_c' LIKE 'a_c' AS underscore_is_wild, 'abc' LIKE 'a_c' AS underscore_matches_b, 'a_c' LIKE 'a\\\\_c' AS escaped_default, 'abc' LIKE 'a\\\\_c' AS escaped_rejects_b, '100%' LIKE '100\\\\%' AS percent_escaped");
    M['like_wildcards'] = wcm.ok ? wcm.rows[0] : wcm.code;
    await my.query('DROP TABLE zz_sem_uq');
    report.sections.D.mysql_unicode_ci = M;
    console.log(`INFO D.mysql_unicode_ci ${JSON.stringify(M)}`);
  }
  await tryq(pgc, 'DROP COLLATION IF EXISTS portal.zz_sem_level2');
  await tryq(pgc, 'DROP COLLATION IF EXISTS portal.zz_sem_level1_det');
}

async function sectionE(pgc, my, cfg) {
  await pgc.query('CREATE TEMP TABLE zz_flag (id int PRIMARY KEY, f smallint NOT NULL DEFAULT 0 CHECK (f IN (0,1)), n numeric(5,2), d date)');
  const b = await tryq(pgc, 'INSERT INTO zz_flag (id, f) VALUES (1, $1)', [true]);
  note('E', 'smallint_with_js_boolean_param', b.ok ? 'accepted' : b.code, '22P02');
  const n = await tryq(pgc, 'INSERT INTO zz_flag (id, f) VALUES (1, $1)', [1]);
  note('E', 'smallint_with_js_number_param', n.ok, true);
  const two = await tryq(pgc, 'INSERT INTO zz_flag (id, f) VALUES (2, $1)', [2]);
  note('E', 'check_01_refuses_2', two.code, '23514');
  const flagType = (await pgc.query('SELECT f, f = 1 AS is_one, f::int AS asint FROM zz_flag WHERE id = 1')).rows[0];
  note('E', 'smallint_returns_js_number_1', [typeof flagType.f, flagType.f, flagType.is_one], ['number', 1, true]);

  const anyEmpty = await tryq(pgc, 'SELECT count(*)::int n FROM zz_flag WHERE id = ANY($1::int[])', [[]]);
  note('E', 'any_empty_array_returns_zero_rows_no_error', anyEmpty.ok ? anyEmpty.rows[0].n : anyEmpty.code, 0);
  const anyIds = await tryq(pgc, 'SELECT count(*)::int n FROM zz_flag WHERE id = ANY($1::int[])', [[1, 7]]);
  note('E', 'any_int_array', anyIds.ok ? anyIds.rows[0].n : anyIds.code, 1);
  if (my) {
    const inEmpty = await tryMy(my, 'SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_NAME IN (?)', [[]]);
    note('E', 'mysql2_IN_with_empty_array', inEmpty.ok ? 'accepted' : inEmpty.code, 'ER_PARSE_ERROR');
  }

  await pgc.query('CREATE TEMP TABLE zz_notif (user_id int, type text, item_id int, UNIQUE (user_id, type, item_id))');
  const dn = await tryq(pgc, "INSERT INTO zz_notif VALUES (1,'a',1),(1,'a',1),(2,'a',1) ON CONFLICT DO NOTHING");
  note('E', 'on_conflict_do_nothing_duplicates_in_one_batch_rowCount', dn.ok ? dn.rowCount : dn.code, 2);
  const dn2 = await tryq(pgc, "INSERT INTO zz_notif VALUES (1,'a',1) ON CONFLICT DO NOTHING");
  note('E', 'on_conflict_do_nothing_existing_rowCount', dn2.ok ? dn2.rowCount : dn2.code, 0);
  const du = await tryq(pgc, "INSERT INTO zz_notif VALUES (3,'a',1),(3,'a',1) ON CONFLICT (user_id, type, item_id) DO UPDATE SET type = EXCLUDED.type");
  note('E', 'on_conflict_do_update_duplicates_in_one_batch', du.ok ? 'accepted' : du.code, '21000');
  if (my) {
    await my.query('DROP TABLE IF EXISTS zz_sem_notif');
    await my.query('CREATE TABLE zz_sem_notif (user_id INT, type VARCHAR(10), item_id INT, UNIQUE uq (user_id, type, item_id)) ENGINE=InnoDB');
    const mi = await tryMy(my, 'INSERT IGNORE INTO zz_sem_notif VALUES ?', [[[1, 'a', 1], [1, 'a', 1], [2, 'a', 1]]]);
    note('E', 'mysql_insert_ignore_duplicates_in_one_batch_affectedRows', mi.ok ? mi.affectedRows : mi.code, 2);
    const mi2 = await tryMy(my, 'INSERT IGNORE INTO zz_sem_notif VALUES ?', [[[1, 'a', 1]]]);
    note('E', 'mysql_insert_ignore_existing_affectedRows', mi2.ok ? mi2.affectedRows : mi2.code, 0);
    await my.query('DROP TABLE zz_sem_notif');
  }

  await pgc.query("INSERT INTO zz_flag (id, f, n, d) VALUES (3, 0, 88.05, '2026-08-29'), (4, 1, 90.125, '2026-08-30')");
  const agg = (await pgc.query('SELECT count(*) AS c, sum(f) AS sf, sum((d IS NULL)::int) AS nulls, sum(n) AS sn, avg(n) AS an, max(n) AS mx, (n IS NOT NULL OR d IS NOT NULL) AS has_value FROM zz_flag GROUP BY n, d ORDER BY n LIMIT 1')).rows[0];
  note('E', 'count_returns_number', [typeof agg.c, agg.c], ['number', 1]);
  note('E', 'sum_smallint_returns_number', typeof agg.sf, 'number');
  note('E', 'sum_bool_cast_returns_number', typeof agg.nulls, 'number');
  note('E', 'sum_numeric_returns_string', typeof agg.sn, 'string');
  note('E', 'numeric_5_2_keeps_two_places', agg.mx, '88.05');
  note('E', 'boolean_expr_returns_true_Number_is_1', [agg.has_value, Number(agg.has_value)], [true, 1]);
  const rounded = (await pgc.query("SELECT n::text FROM zz_flag WHERE id = 4")).rows[0].n;
  note('E', 'numeric_5_2_rounds_90_125_half_up_on_insert', rounded, '90.13');
  if (my) {
    const [[m]] = await my.query("SELECT COUNT(*) c, SUM(1) s1, SUM(NULL IS NULL) sb, CAST(90.125 AS DECIMAL(5,2)) r, (1 IS NOT NULL OR NULL IS NOT NULL) hv");
    note('E', 'mysql2_count_sum_types', [typeof m.c, typeof m.s1, typeof m.sb, m.r, m.hv], ['number', 'string', 'string', '90.13', 1]);
  }

  // error classes
  const dup = await tryq(pgc, 'INSERT INTO zz_flag (id, f) VALUES (1, 0)');
  note('E', 'unique_violation_code', dup.code, '23505');
  await pgc.query('CREATE TEMP TABLE zz_parent (id int PRIMARY KEY); CREATE TEMP TABLE zz_child (pid int REFERENCES zz_parent(id))');
  const fk = await tryq(pgc, 'INSERT INTO zz_child VALUES (99)');
  note('E', 'fk_violation_code', fk.code, '23503');
  const nn = await tryq(pgc, 'INSERT INTO zz_flag (id, f) VALUES (NULL, 0)');
  note('E', 'not_null_violation_code', nn.code, '23502');
  const dq = await tryq(pgc, 'SELECT CONCAT(\'a\', " ", \'b\') AS s');
  note('E', 'double_quoted_string_literal_is_an_identifier', dq.code, '42703');
  const badcol = await tryq(pgc, 'SELECT nope FROM zz_flag');
  note('E', 'undefined_column_code', badcol.code, '42703');
  const refused = await (async () => { const c = new pg.Client({ host: '127.0.0.1', port: 1, user: 'x', password: 'x', database: 'x', connectionTimeoutMillis: 1500 }); try { await c.connect(); return 'connected'; } catch (e) { return e.code; } })();
  note('E', 'connection_refused_code', refused, 'ECONNREFUSED');
  const badpw = await (async () => { const c = new pg.Client({ ...cfg, password: 'wrong-password' }); try { await c.connect(); await c.end(); return 'connected'; } catch (e) { return e.code; } })();
  note('E', 'wrong_password_code', badpw, '28P01');
  if (my) {
    await my.query('DROP TABLE IF EXISTS zz_sem_dup');
    await my.query('CREATE TABLE zz_sem_dup (id INT PRIMARY KEY) ENGINE=InnoDB');
    await my.query('INSERT INTO zz_sem_dup VALUES (1)');
    const md = await tryMy(my, 'INSERT INTO zz_sem_dup VALUES (1)');
    note('E', 'mysql_duplicate_code', md.code, 'ER_DUP_ENTRY');
    const mu = await tryMy(my, 'UPDATE zz_sem_dup SET id = 1 WHERE id = 1');
    note('E', 'mysql2_noop_update_affectedRows_changedRows_default_flags', [mu.affectedRows, mu.changedRows]);
    await my.query('DROP TABLE zz_sem_dup');
  }
  const noop = await pgc.query('UPDATE zz_flag SET f = f WHERE id = 1');
  note('E', 'pg_noop_update_rowCount_is_matched_rows', noop.rowCount, 1);

  // ordering idioms
  const ns = (await pgc.query("SELECT string_agg(coalesce(v::text,'null'), ',' ORDER BY v IS NULL, v) o FROM unnest(ARRAY[3,NULL,1,2]) v")).rows[0].o;
  note('E', 'order_by_is_null_then_value_nulls_last', ns, '1,2,3,null');
  const en = (await pgc.query("SELECT string_agg(r::text, ',' ORDER BY r) AS by_enum, string_agg(r::text, ',' ORDER BY r::text) AS by_text FROM unnest(ARRAY['teacher','admin','parent']::portal.user_role[]) r")).rows[0];
  note('E', 'enum_sorts_by_declaration_and_text_cast_sorts_alphabetically', [en.by_enum, en.by_text], ['parent,teacher,admin', 'admin,parent,teacher']);
  const sa = (await pgc.query("SELECT string_agg(DISTINCT v, ', ' ORDER BY v) s FROM unnest(ARRAY['Math','English','Math']) v")).rows[0].s;
  note('E', 'string_agg_distinct_ordered_replaces_GROUP_CONCAT', sa, 'English, Math');
  const lim = await tryq(pgc, 'SELECT id FROM zz_flag ORDER BY id LIMIT $1 OFFSET $2', [2, 1]);
  note('E', 'limit_offset_bound_params', lim.ok ? lim.rows.map((r) => r.id) : lim.code, [3, 4]);
  const enumParam = await tryq(pgc, "SELECT $1 = 'admin'::portal.user_role AS ok", ['admin']);
  note('E', 'enum_compared_with_text_param', enumParam.ok ? enumParam.rows[0].ok : enumParam.code, true);
  const enumBad = await tryq(pgc, "SELECT $1::portal.user_role AS r", ['ADMIN']);
  note('E', 'enum_label_is_case_sensitive', enumBad.ok ? 'accepted' : enumBad.code, '22P02');
  const ret = await tryq(pgc, 'INSERT INTO zz_flag (id, f) VALUES (10, 0) RETURNING id');
  note('E', 'insert_returning_id', ret.ok ? ret.rows[0].id : ret.code, 10);
}

async function sectionF(p, my) {
  const a = await p.connect();
  const b = await p.connect();
  try {
    await a.query('CREATE TABLE portal.zz_sem_grade (id int PRIMARY KEY, is_locked smallint NOT NULL DEFAULT 0, v int)');
    await a.query('INSERT INTO portal.zz_sem_grade VALUES (1, 0, 0), (2, 0, 0)');
    // F1: FOR UPDATE serialises check-then-write
    await a.query('BEGIN');
    await a.query('SELECT * FROM portal.zz_sem_grade WHERE id = 1 FOR UPDATE');
    let bDone = false;
    const bWait = (async () => { await b.query('BEGIN'); const r = await b.query('SELECT is_locked FROM portal.zz_sem_grade WHERE id = 1 FOR UPDATE'); bDone = true; return r.rows[0].is_locked; })();
    await new Promise((res) => setTimeout(res, 300));
    const blocked = !bDone;
    await a.query('UPDATE portal.zz_sem_grade SET is_locked = 1 WHERE id = 1');
    await a.query('COMMIT');
    const seenByB = await bWait;
    await b.query('COMMIT');
    note('F', 'for_update_blocks_second_reader_until_commit', blocked, true);
    note('F', 'for_update_reader_sees_committed_value_after_wait', seenByB, 1);

    // F2: the guarded UPDATE (is_locked <> ?) is atomic: two concurrent lockers, one wins
    await a.query('UPDATE portal.zz_sem_grade SET is_locked = 0 WHERE id = 1');
    const [ra, rb] = await Promise.all([
      a.query('UPDATE portal.zz_sem_grade SET is_locked = 1 WHERE id = 1 AND is_locked <> 1'),
      b.query('UPDATE portal.zz_sem_grade SET is_locked = 1 WHERE id = 1 AND is_locked <> 1'),
    ]);
    note('F', 'guarded_update_race_exactly_one_rowCount_1', [ra.rowCount, rb.rowCount].sort(), [0, 1]);

    // F3: concurrent upserts on one key — no error, last writer wins
    await a.query('CREATE TABLE portal.zz_sem_att (student_id int, d date, status text, PRIMARY KEY (student_id, d))');
    const ups = await Promise.all(['Present', 'Absent'].map((s, i) => (i ? b : a).query(
      "INSERT INTO portal.zz_sem_att VALUES (1, '2026-10-19', $1) ON CONFLICT (student_id, d) DO UPDATE SET status = EXCLUDED.status RETURNING status", [s]
    )));
    const final = (await a.query("SELECT status FROM portal.zz_sem_att WHERE student_id = 1")).rows[0].status;
    note('F', 'concurrent_upserts_both_succeed', ups.every((r) => r.rowCount === 1), true);
    note('F', 'concurrent_upserts_leave_one_row_with_a_winner', ['Present', 'Absent'].includes(final), true);

    // F4: duplicate-key race on a plain INSERT -> one 23505
    const dupRace = await Promise.all([a, b].map((c) => tryq(c, "INSERT INTO portal.zz_sem_att VALUES (2, '2026-10-19', 'Late')")));
    note('F', 'insert_race_one_unique_violation', dupRace.map((r) => (r.ok ? 'ok' : r.code)).sort(), ['23505', 'ok']);

    // F5: REPEATABLE READ write conflict aborts in PostgreSQL (MySQL blocks and proceeds)
    await a.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await a.query('SELECT v FROM portal.zz_sem_grade WHERE id = 2');
    await b.query('UPDATE portal.zz_sem_grade SET v = v + 1 WHERE id = 2');
    const rr = await tryq(a, 'UPDATE portal.zz_sem_grade SET v = v + 1 WHERE id = 2');
    await tryq(a, 'ROLLBACK');
    note('F', 'pg_repeatable_read_write_after_concurrent_commit', rr.ok ? 'accepted' : rr.code, '40001');
    // and under READ COMMITTED the same sequence proceeds
    await a.query('BEGIN');
    await a.query('SELECT v FROM portal.zz_sem_grade WHERE id = 2');
    await b.query('UPDATE portal.zz_sem_grade SET v = v + 1 WHERE id = 2');
    const rc = await tryq(a, 'UPDATE portal.zz_sem_grade SET v = v + 1 WHERE id = 2');
    await a.query('COMMIT');
    const v = (await a.query('SELECT v FROM portal.zz_sem_grade WHERE id = 2')).rows[0].v;
    note('F', 'pg_read_committed_write_after_concurrent_commit', rc.ok ? 'accepted' : rc.code, 'accepted');
    note('F', 'pg_read_committed_no_lost_update_both_increments_land', v, 3);
  } finally {
    await tryq(a, 'DROP TABLE IF EXISTS portal.zz_sem_grade');
    await tryq(a, 'DROP TABLE IF EXISTS portal.zz_sem_att');
    a.release();
    b.release();
  }
  if (my) {
    const my2 = await scratch(arg('--mysql-db'));
    try {
      await my.query('DROP TABLE IF EXISTS zz_sem_grade');
      await my.query('CREATE TABLE zz_sem_grade (id INT PRIMARY KEY, v INT) ENGINE=InnoDB');
      await my.query('INSERT INTO zz_sem_grade VALUES (2, 0)');
      await my.query('START TRANSACTION');
      await my.query('SELECT v FROM zz_sem_grade WHERE id = 2');
      await my2.query('UPDATE zz_sem_grade SET v = v + 1 WHERE id = 2');
      const r = await tryMy(my, 'UPDATE zz_sem_grade SET v = v + 1 WHERE id = 2');
      await my.query('COMMIT');
      const [[{ v }]] = await my.query('SELECT v FROM zz_sem_grade WHERE id = 2');
      note('F', 'mysql_repeatable_read_write_after_concurrent_commit', r.ok ? 'accepted' : r.code, 'accepted');
      note('F', 'mysql_repeatable_read_both_increments_land', Number(v), 2);
      await my.query('DROP TABLE zz_sem_grade');
    } finally {
      await my2.end();
    }
  }
}

async function main() {
  const target = targetConfig();
  const myDb = arg('--mysql-db', null);
  const p = pool(target.pg);
  let pgc = await p.connect();
  const my = myDb ? await scratch(myDb) : null;
  report.target = target.name;
  report.mysql_scratch = myDb;
  report.started_at = new Date().toISOString();
  const release = () => { if (pgc) { try { pgc.release(true); } catch { /* already released */ } pgc = null; } };
  try {
    await sectionA(pgc, my);
    await sectionB(pgc, my);
    await sectionC(pgc, my);
    await sectionD(pgc, my);
    await sectionE(pgc, my, target.pg);
    release();
    await sectionF(p, my);
  } catch (error) {
    failures += 1;
    console.error('SECTION FAILED:', safeMessage(error));
  } finally {
    // Release before p.end(): pool.end() waits for every leased client, and a
    // client still leased after a throw would hang the process for ever.
    release();
    if (my) await my.end().catch(() => {});
    await p.end();
    report.failures = failures;
    fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
    const out = path.join(P.REHEARSAL_DIR, `semantics_${target.name}_${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}.json`);
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`${failures === 0 ? 'SEMANTICS OK' : `SEMANTICS: ${failures} expectation(s) not met`} — report: ${out}`);
  }
}

main().catch((e) => { console.error('semantics failed:', safeMessage(e)); process.exit(1); });
