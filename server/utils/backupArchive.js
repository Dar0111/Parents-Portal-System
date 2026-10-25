// THE BACKUP ARCHIVE ON POSTGRESQL (Phase 3, commit 6 — migration/docs/04
// §2a, the owner's P4 with Q3 (a) and Q4 (a), 2026-10-25).
//
// One file per backup: a ZIP holding one CSV per table, written by COPY, and
// manifest.json, written LAST. No pg_dump: nothing beyond node_modules is
// needed on the API host, and what an archive leaves out is code, not flags.
//
// WRITING (writeArchive) needs SELECT and nothing else, so it runs as the
// API's own role, portal_app: one REPEATABLE READ, READ ONLY transaction — one
// snapshot for every table, mysqldump's --single-transaction — and each table
// streams through COPY into its member and through SHA-256 on the way. Every
// table is locked IN ACCESS SHARE MODE before the snapshot is taken (P3-C-R2
// Phase H, review finding backup-1): TRUNCATE is not MVCC-safe, so a snapshot
// fixed while a restore held its locks read every table the restore truncated
// as EMPTY once it committed — an empty archive that passed every check. The
// lock waits for such a restore to commit, and the snapshot then sees it. The
// manifest carries the format and its version, the server's version, the
// schema fingerprint, each member's columns, rows, bytes, highest id and
// hash, every identity sequence's next value, the excluded tables and, as its
// last key, completed_at. The caller writes `<name>.zip.partial` and renames
// it once inspectArchive has read the closed file back.
//
// TWO TABLES ARE NEVER IN AN ARCHIVE. `backups` is the catalog itself — the
// table you read to find the file you restore FROM — so a restore keeps it:
// saved, truncated with the rest, put back with its ids. `auth_codes` holds
// bcrypt hashes of six-digit codes, a 10^6 space: a file that is never
// deleted must not carry them, and a restore leaves the table empty.
//
// READING (inspectArchive) is every check a restore makes before it writes:
// a complete manifest (completed_at present, the format and version known),
// every member it lists present and nothing else, and every member's bytes,
// records, header and hash equal to what the manifest says. Nothing is trusted
// until the whole file has been read once.
//
// RESTORING (restoreArchive) runs as portal_migrate, the owner — TRUNCATE and
// ALTER SEQUENCE are what portal_app deliberately lacks — in ONE transaction:
// every table locked, the sequences captured, the constraints deferred, the
// backups rows saved, all tables truncated in one statement, each member
// copied in (its hash checked again on the way), the saved backups rows put
// back with their ids — or the whole restore refused when the archive lacks
// one of their creators (Q3 (a)) — the four retired learner fields cleared
// (decision 6), every sequence set and never moved backwards (Q4 (a)), the
// session cutoff written, the constraints checked, COMMIT. A failure rolls
// back EVERYTHING, the sequences included: since P3-C-R2 Phase H they move by
// ALTER SEQUENCE … START WITH n RESTART, which is transactional (setval() is
// not, and the captured values used to be put back by hand — a put-back that
// could not tell a lost COMMIT from a failed one). When the connection fails
// at COMMIT the outcome is not known to this side, so the restore's
// transaction id travels with the error and the caller asks the server
// (transactionOutcome) — review finding backup-2.
//
// THE FINGERPRINT (schemaFingerprint) is the shape a COPY depends on: every
// table, its columns (type, nullability, identity, generation, collation), its
// constraints and the schema's enum labels — read from pg_catalog, never
// information_schema (which hides what a role may not see), with every name
// schema-qualified, so the same schema gives the same fingerprint whatever the
// role. A restore compares the archive's with the live one and refuses any
// difference, naming it (fingerprintDifferences).
//
// ERROR TEXT NEVER CARRIES DATA. A PostgreSQL error's `detail` and `where` can
// quote a row, so only its code, a fixed phrase and the constraint's name ever
// reach a reply (safeMessage).
const fs = require('fs');
const crypto = require('crypto');
const { Transform, Writable } = require('stream');
const { pipeline } = require('stream/promises');
const yazl = require('yazl');
const yauzl = require('yauzl');
const { to: copyTo, from: copyFrom } = require('pg-copy-streams');

const SCHEMA = 'portal';
const ARCHIVE_FORMAT = 'parents-portal-copy-archive';
const ARCHIVE_FORMAT_VERSION = 1;
const MANIFEST_MEMBER = 'manifest.json';
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
// How long an archive waits for its ACCESS SHARE locks — a restore holding
// ACCESS EXCLUSIVE ones is waited for this long, then the archive fails (and
// nothing is written) rather than wait forever.
const ARCHIVE_LOCK_TIMEOUT = '60s';

const EXCLUDED_TABLES = Object.freeze([
  Object.freeze({
    name: 'auth_codes',
    reason: 'verification codes: a bcrypt hash of a six-digit code is a 10^6 space; a restore leaves the table empty',
  }),
  Object.freeze({
    name: 'backups',
    reason: 'the catalog of backups: a restore keeps the rows it finds, with their ids',
  }),
]);
const EXCLUDED_NAMES = new Set(EXCLUDED_TABLES.map((t) => t.name));

// Every statement of an archive session is fully qualified, so the search path
// can be pg_catalog alone — which is what makes format_type() and
// pg_get_constraintdef() name every type and table with its schema. The dates
// and times are written and read in one fixed style and zone, so the same data
// always gives the same bytes and the same hash.
const SESSION_SETTINGS = [
  'SET LOCAL search_path TO pg_catalog',
  "SET LOCAL DateStyle TO 'ISO, YMD'",
  "SET LOCAL TimeZone TO 'UTC'",
  "SET LOCAL IntervalStyle TO 'postgres'",
  'SET LOCAL extra_float_digits TO 3',
];

// A refusal: the archive or the database is not fit for this restore, and
// nothing was written (or everything written was rolled back). The message is
// written for the admin and never quotes data.
class ArchiveError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'ArchiveError';
    this.code = code;
    Object.assign(this, extra);
  }
}

const PG_CODE_TEXT = {
  '22P04': 'malformed CSV data',
  '22P02': 'a value of the wrong type',
  '22001': 'a value too long for its column',
  '22007': 'an invalid date or time',
  '22008': 'a date or time out of range',
  '23502': 'a missing required value',
  '23503': 'a reference to a row that is not there',
  '23505': 'a duplicate key',
  '23514': 'a value its check refuses',
  '25P02': 'an aborted transaction',
  '40P01': 'a deadlock with another session',
  '42501': 'a missing privilege',
  '55P03': 'a lock it could not take in time',
  '57014': 'a cancelled statement',
};

function safeMessage(error) {
  if (error instanceof ArchiveError) return error.message;
  const code = error && typeof error.code === 'string' ? error.code : null;
  const where = error && error.archiveTable ? `while loading ${error.archiveTable}: ` : '';
  if (code && /^[0-9A-Z]{5}$/.test(code)) {
    const constraint = error.constraint ? ` (constraint ${error.constraint})` : '';
    return `${where}PostgreSQL ${code}, ${PG_CODE_TEXT[code] || 'a database error'}${constraint}`;
  }
  if (code && /^E[A-Z]+$/.test(code)) return `${where}file system error ${code}`;
  return `${where}an unexpected error`;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function qualified(table, schema = SCHEMA) {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// JSON with every object's keys sorted, so a structure hashes the same however
// it was built.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

// The format a catalog row's file is in, read from its name: the API writes
// `.zip` archives since the move, and every `.sql` file is a mysqldump of the
// MySQL era (restorable by the recovery procedure, migration/docs/04 §2b).
function describeFormat(filename) {
  const name = String(filename || '');
  if (/\.zip$/i.test(name)) return { engine: 'postgresql', format: 'copy-archive' };
  if (/\.sql$/i.test(name)) return { engine: 'mysql', format: 'mysqldump' };
  return { engine: null, format: 'unknown' };
}

// ---------------------------------------------------------------------------
// The session and the catalog
// ---------------------------------------------------------------------------

// Call inside a transaction: SET LOCAL outside one only warns, so the result
// is checked rather than trusted.
async function useArchiveSession(client) {
  for (const sql of SESSION_SETTINGS) await client.query(sql);
  const { rows } = await client.query("SELECT pg_catalog.current_setting('search_path') AS path");
  if (rows[0].path !== 'pg_catalog') {
    throw new Error('An archive session must run inside a transaction (SET LOCAL had no effect).');
  }
}

async function schemaFingerprint(client, schema = SCHEMA) {
  const { rows: columns } = await client.query(
    `SELECT c.relname AS table_name, a.attname AS column_name,
            CASE WHEN tn.nspname = 'pg_catalog' THEN pg_catalog.format_type(a.atttypid, a.atttypmod)
                 ELSE tn.nspname || '.' || t.typname END AS type,
            a.attnotnull AS not_null, a.attidentity::text AS identity, a.attgenerated::text AS generated,
            CASE WHEN a.attcollation = 0 OR a.attcollation = t.typcollation THEN NULL
                 ELSE cn.nspname || '.' || co.collname END AS collation
       FROM pg_catalog.pg_attribute a
       JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
       JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace
       LEFT JOIN pg_catalog.pg_collation co ON co.oid = a.attcollation
       LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid = co.collnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum`,
    [schema]
  );
  const { rows: constraints } = await client.query(
    `SELECT c.relname AS table_name, con.conname AS name, pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
       FROM pg_catalog.pg_constraint con
       JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
      ORDER BY c.relname, con.conname`,
    [schema]
  );
  const { rows: enums } = await client.query(
    `SELECT t.typname AS name, pg_catalog.array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
       FROM pg_catalog.pg_type t
       JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
       JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = $1
      GROUP BY t.typname
      ORDER BY t.typname`,
    [schema]
  );

  const body = { tables: {}, constraints: {}, enums: {} };
  for (const col of columns) {
    body.tables[col.table_name] = body.tables[col.table_name] || {};
    body.tables[col.table_name][col.column_name] = {
      type: col.type,
      not_null: col.not_null,
      identity: col.identity,
      generated: col.generated,
      collation: col.collation,
    };
  }
  for (const con of constraints) {
    body.constraints[con.table_name] = body.constraints[con.table_name] || {};
    body.constraints[con.table_name][con.name] = con.definition;
  }
  for (const en of enums) body.enums[en.name] = en.labels;
  return { sha256: sha256(canonical(body)), ...body };
}

function describeColumn(c) {
  const parts = [c.type, c.not_null ? 'not null' : 'nullable'];
  if (c.identity) parts.push(`identity ${c.identity}`);
  if (c.generated) parts.push('generated');
  if (c.collation) parts.push(`collate ${c.collation}`);
  return parts.join(', ');
}

// What differs between an archive's fingerprint and this database's, one line
// each, in a fixed order. A missing table is one line, not one per column.
function fingerprintDifferences(archive, live) {
  const out = [];
  const names = (o) => Object.keys(o || {});
  const union = (a, b) => [...new Set([...names(a), ...names(b)])].sort();
  for (const table of union(archive.tables, live.tables)) {
    const a = (archive.tables || {})[table];
    const b = (live.tables || {})[table];
    if (!b) {
      out.push(`table ${table} is in the archive but not in this database`);
      continue;
    }
    if (!a) {
      out.push(`table ${table} is in this database but not in the archive`);
      continue;
    }
    for (const column of union(a, b)) {
      if (!b[column]) out.push(`column ${table}.${column} is in the archive but not in this database`);
      else if (!a[column]) out.push(`column ${table}.${column} is in this database but not in the archive`);
      else if (canonical(a[column]) !== canonical(b[column])) {
        out.push(`column ${table}.${column} is ${describeColumn(a[column])} in the archive, ${describeColumn(b[column])} here`);
      }
    }
    const ca = (archive.constraints || {})[table] || {};
    const cb = (live.constraints || {})[table] || {};
    for (const name of union(ca, cb)) {
      if (!(name in cb)) out.push(`constraint ${table}.${name} is in the archive but not in this database`);
      else if (!(name in ca)) out.push(`constraint ${table}.${name} is in this database but not in the archive`);
      else if (ca[name] !== cb[name]) out.push(`constraint ${table}.${name} differs`);
    }
  }
  for (const name of union(archive.enums, live.enums)) {
    const a = (archive.enums || {})[name];
    const b = (live.enums || {})[name];
    if (!b) out.push(`enum ${name} is in the archive but not in this database`);
    else if (!a) out.push(`enum ${name} is in this database but not in the archive`);
    else if (canonical(a) !== canonical(b)) out.push(`enum ${name} has the labels ${a.join(', ')} in the archive, ${b.join(', ')} here`);
  }
  return out;
}

function describeDifferences(differences, shown = 6) {
  const head = differences.slice(0, shown).join('; ');
  const more = differences.length > shown ? `; and ${differences.length - shown} more` : '';
  return `this archive was made from a different database schema — ${head}${more}`;
}

async function primaryKeys(client, schema = SCHEMA) {
  const { rows } = await client.query(
    `SELECT c.relname AS table_name, pg_catalog.array_agg(a.attname::text ORDER BY k.ord) AS columns
       FROM pg_catalog.pg_constraint con
       JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL pg_catalog.unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      WHERE con.contype = 'p' AND n.nspname = $1
      GROUP BY c.relname`,
    [schema]
  );
  return new Map(rows.map((r) => [r.table_name, r.columns]));
}

async function columnOrder(client, schema = SCHEMA) {
  const { rows } = await client.query(
    `SELECT c.relname AS table_name, pg_catalog.array_agg(a.attname::text ORDER BY a.attnum) AS columns
       FROM pg_catalog.pg_attribute a
       JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
      GROUP BY c.relname`,
    [schema]
  );
  return new Map(rows.map((r) => [r.table_name, r.columns]));
}

// Every identity (or serial) column and the sequence behind it.
async function identitySequences(client, schema = SCHEMA) {
  const { rows } = await client.query(
    `SELECT t.relname AS table_name, a.attname AS column_name, s.relname AS sequence_name
       FROM pg_catalog.pg_depend d
       JOIN pg_catalog.pg_class s ON s.oid = d.objid AND s.relkind = 'S'
       JOIN pg_catalog.pg_namespace n ON n.oid = s.relnamespace
       JOIN pg_catalog.pg_class t ON t.oid = d.refobjid
       JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      WHERE d.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
        AND d.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
        AND d.deptype IN ('a', 'i') AND n.nspname = $1
      ORDER BY t.relname, a.attname`,
    [schema]
  );
  return rows.map((r) => ({ table: r.table_name, column: r.column_name, sequence: r.sequence_name }));
}

// The next value each sequence would hand out, through pg_sequences — what a
// role with USAGE (portal_app) may read. last_value is NULL while the sequence
// is uncalled — never used, or restarted and not used since — and then the
// next value is start_value: the transfer and restoreArchive restart a
// sequence with START WITH its next value, so the two agree (P3-C-R2 Phase H;
// with RESTART WITH alone, start_value stayed 1 and 14 of 25 sequences read 1
// after a transfer, measured).
async function sequenceNextValues(client, sequences, schema = SCHEMA) {
  const { rows } = await client.query(
    `SELECT sequencename AS name, last_value, start_value, increment_by
       FROM pg_catalog.pg_sequences WHERE schemaname = $1`,
    [schema]
  );
  const byName = new Map(rows.map((r) => [r.name, r]));
  return sequences.map((s) => {
    const r = byName.get(s.sequence);
    if (!r) throw new Error(`Sequence ${s.sequence} is not readable.`);
    const next = r.last_value === null ? Number(r.start_value) : Number(r.last_value) + Number(r.increment_by);
    return { ...s, next_value: next };
  });
}

// The exact state (last_value, is_called), which only the owner may read —
// the live next value a restore never moves below (Q4 (a)).
async function exactSequenceState(client, sequences, schema = SCHEMA) {
  const out = [];
  for (const s of sequences) {
    const { rows } = await client.query(`SELECT last_value, is_called FROM ${qualified(s.sequence, schema)}`);
    const lastValue = Number(rows[0].last_value);
    out.push({ ...s, last_value: lastValue, is_called: rows[0].is_called, next_value: rows[0].is_called ? lastValue + 1 : lastValue });
  }
  return out;
}

// Leave the sequence so its next value is `next` — TRANSACTIONALLY: a
// rollback of the restore puts it back by itself. START WITH as well, so the
// uncalled sequence's start_value is the value pg_sequences readers (the next
// archive's manifest) fall back to.
async function restartAt(client, sequence, next, schema = SCHEMA) {
  if (!Number.isSafeInteger(next) || next < 1) throw new Error(`A sequence's next value must be a positive integer (${sequence}).`);
  await client.query(`ALTER SEQUENCE ${qualified(sequence, schema)} START WITH ${next} RESTART`);
}

// The fate of a restore whose connection failed at COMMIT, asked of the
// server on a fresh connection: 'committed', 'aborted', or 'in progress'
// while the server has not finished with it (a few short waits, then given
// up as unknown). `xid` is the restore transaction's own id (xid8 text).
async function transactionOutcome(client, xid, { tries = 10, waitMs = 300 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    const { rows } = await client.query('SELECT pg_catalog.pg_xact_status($1::xid8) AS status', [xid]);
    const status = rows[0].status;
    if (status === 'committed' || status === 'aborted') return status;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return 'unknown';
}

// DECISION 6 (feat/privacy): the learner's birthday, gender, address and
// contact number are not collected, so a restore never brings them back —
// the job the MySQL restore's privacy step did after an older dump. Returns
// the rows it cleared.
async function clearRetiredLearnerFields(client, schema = SCHEMA) {
  const result = await client.query(
    `UPDATE ${qualified('students', schema)}
        SET birthday = NULL, gender = NULL, address = NULL, contact_number = NULL
      WHERE birthday IS NOT NULL OR gender IS NOT NULL OR address IS NOT NULL OR contact_number IS NOT NULL`
  );
  return result.rowCount;
}

// ---------------------------------------------------------------------------
// The members: hashing, counting, the header
// ---------------------------------------------------------------------------

// Counts CSV records the way COPY's CSV format separates them: a newline
// outside double quotes ends a record (a doubled quote toggles twice).
class CsvRecords {
  constructor() {
    this.quoted = false;
    this.records = 0;
    this.open = false;
    this.header = [];
    this.headerDone = false;
  }

  push(chunk) {
    for (let i = 0; i < chunk.length; i += 1) {
      const b = chunk[i];
      if (!this.headerDone) {
        if (b === 0x0a && !this.quoted) this.headerDone = true;
        else if (this.header.length < 65536) this.header.push(b);
      }
      if (b === 0x22) {
        this.quoted = !this.quoted;
        this.open = true;
      } else if (b === 0x0a && !this.quoted) {
        this.records += 1;
        this.open = false;
      } else {
        this.open = true;
      }
    }
  }

  result() {
    const records = this.records + (this.open ? 1 : 0);
    return {
      rows: Math.max(0, records - 1),
      header: Buffer.from(this.header).toString('utf8').replace(/\r$/, ''),
      openQuote: this.quoted,
    };
  }
}

class MemberTap extends Transform {
  constructor() {
    super();
    this.hash = crypto.createHash('sha256');
    this.bytes = 0;
    this.csv = new CsvRecords();
  }

  _transform(chunk, _encoding, callback) {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    this.csv.push(chunk);
    callback(null, chunk);
  }

  result() {
    return { sha256: this.hash.digest('hex'), bytes: this.bytes, ...this.csv.result() };
  }
}

function discard() {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

// Writes the archive to `outputPath` (the caller's `.partial`) on a connected
// node-postgres client and returns its manifest. On any failure the file is
// removed and the error thrown.
async function writeArchive(client, outputPath) {
  const zip = new yazl.ZipFile();
  const out = fs.createWriteStream(outputPath, { flags: 'wx' });
  let rejectFailure;
  const failure = new Promise((_, reject) => {
    rejectFailure = reject;
  });
  failure.catch(() => {});
  zip.on('error', rejectFailure);
  zip.outputStream.on('error', rejectFailure);
  out.on('error', rejectFailure);
  const closed = new Promise((resolve) => out.once('close', resolve));
  zip.outputStream.pipe(out);

  let began = false;
  let current = null;
  try {
    // The tables, listed BEFORE the transaction (a statement of its own, so
    // no snapshot is carried into it), then locked IN ACCESS SHARE MODE as
    // the transaction's first statements. LOCK does not fix a REPEATABLE READ
    // snapshot — the first SELECT does (useArchiveSession) — so a restore that
    // holds its ACCESS EXCLUSIVE locks is waited for, and committed, before
    // the snapshot exists (backup-1). ACCESS SHARE blocks nothing but
    // TRUNCATE and DDL; ordinary writes go on.
    const { rows: listed } = await client.query(
      `SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') ORDER BY c.relname`,
      [SCHEMA]
    );
    const lockedNames = listed.map((r) => r.name);
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    began = true;
    await client.query(`SET LOCAL lock_timeout = '${ARCHIVE_LOCK_TIMEOUT}'`);
    await client.query(`LOCK TABLE ${lockedNames.map((t) => qualified(t)).join(', ')} IN ACCESS SHARE MODE`);
    await useArchiveSession(client);
    const { rows: about } = await client.query(
      "SELECT pg_catalog.current_setting('server_version') AS server_version, pg_catalog.transaction_timestamp() AS snapshot_at"
    );
    const fingerprint = await schemaFingerprint(client);
    // A table created between the listing and the lock would be archived
    // unlocked; the archive is refused instead.
    if (Object.keys(fingerprint.tables).sort().join(',') !== [...lockedNames].sort().join(',')) {
      throw new Error('The schema changed while the archive was being made; nothing was written.');
    }
    const keys = await primaryKeys(client);
    const order = await columnOrder(client);
    const sequences = await sequenceNextValues(client, await identitySequences(client));

    const members = [];
    for (const table of Object.keys(fingerprint.tables).sort()) {
      if (EXCLUDED_NAMES.has(table)) continue;
      const columns = order.get(table);
      const pk = keys.get(table);
      if (!pk || !pk.length) throw new Error(`Table ${table} has no primary key to order its rows by.`);
      const hasId = columns.includes('id');
      const { rows: counted } = await client.query(
        `SELECT pg_catalog.count(*)::bigint AS n${hasId ? ', pg_catalog.max(id)::bigint AS max_id' : ''} FROM ${qualified(table)}`
      );
      const rows = Number(counted[0].n);
      const maxId = hasId && counted[0].max_id !== null ? Number(counted[0].max_id) : null;
      const member = `data/${table}.csv`;
      const copy = client.query(
        copyTo(
          `COPY (SELECT ${columns.map(quoteIdent).join(', ')} FROM ${qualified(table)} ORDER BY ${pk
            .map(quoteIdent)
            .join(', ')}) TO STDOUT WITH (FORMAT csv, HEADER true)`
        )
      );
      current = copy;
      const tap = new MemberTap();
      const done = new Promise((resolve, reject) => {
        copy.on('error', reject);
        tap.on('error', reject);
        tap.on('end', resolve);
      });
      copy.pipe(tap);
      zip.addReadStream(tap, member);
      await Promise.race([done, failure]);
      current = null;
      const seen = tap.result();
      if (seen.rows !== rows) {
        throw new Error(`Table ${table}: ${seen.rows} records written for ${rows} rows.`);
      }
      members.push({ table, member, columns, rows, bytes: seen.bytes, max_id: maxId, sha256: seen.sha256 });
    }
    await client.query('COMMIT');
    began = false;

    const manifest = {
      format: ARCHIVE_FORMAT,
      format_version: ARCHIVE_FORMAT_VERSION,
      engine: 'postgresql',
      server_version: about[0].server_version,
      schema: SCHEMA,
      snapshot_at: new Date(about[0].snapshot_at).toISOString(),
      schema_fingerprint: fingerprint,
      tables: members,
      excluded_tables: EXCLUDED_TABLES,
      sequences,
      completed_at: new Date().toISOString(),
    };
    zip.addBuffer(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'), MANIFEST_MEMBER);
    zip.end();
    await Promise.race([closed, failure]);
    return manifest;
  } catch (error) {
    // A COPY still streaming (the zip or the disk failed, not the query) is
    // drained so the ROLLBACK queued behind it can run.
    if (current) {
      current.unpipe();
      current.resume();
    }
    if (began) await client.query('ROLLBACK').catch(() => {});
    zip.outputStream.unpipe(out);
    out.destroy();
    await closed;
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // never created, or already gone
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

async function openZip(filePath) {
  try {
    return await yauzl.openPromise(filePath, { autoClose: false, strictFileNames: true, validateEntrySizes: true });
  } catch {
    throw new ArchiveError('ARCHIVE_INVALID', 'the file is not a readable zip archive');
  }
}

async function listEntries(zip) {
  const entries = new Map();
  try {
    for await (const entry of zip.eachEntry()) {
      if (entries.has(entry.fileName)) throw new ArchiveError('ARCHIVE_INVALID', `the member ${entry.fileName} appears twice`);
      entries.set(entry.fileName, entry);
    }
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError('ARCHIVE_INVALID', 'the zip directory cannot be read');
  }
  return entries;
}

async function readManifestBytes(zip, entries) {
  const entry = entries.get(MANIFEST_MEMBER);
  if (!entry) throw new ArchiveError('ARCHIVE_INCOMPLETE', 'the archive is incomplete — it has no manifest');
  if (entry.uncompressedSize > MAX_MANIFEST_BYTES) throw new ArchiveError('ARCHIVE_INVALID', 'the manifest is too large');
  const chunks = [];
  try {
    const stream = await zip.openReadStreamPromise(entry);
    for await (const chunk of stream) chunks.push(chunk);
  } catch {
    throw new ArchiveError('ARCHIVE_INVALID', 'the manifest cannot be read');
  }
  return Buffer.concat(chunks);
}

const isCount = (n) => Number.isSafeInteger(n) && n >= 0;
const isHash = (h) => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h);

function validateManifest(manifest) {
  const invalid = (why) => new ArchiveError('ARCHIVE_INVALID', `the manifest ${why}`);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw invalid('is not an object');
  if (manifest.format !== ARCHIVE_FORMAT) throw new ArchiveError('ARCHIVE_INVALID', 'the file is not a Parents Portal archive');
  if (manifest.format_version !== ARCHIVE_FORMAT_VERSION) {
    throw new ArchiveError('ARCHIVE_INVALID', `archive format version ${String(manifest.format_version)} is not one this server reads`);
  }
  if (typeof manifest.completed_at !== 'string' || Number.isNaN(Date.parse(manifest.completed_at))) {
    throw new ArchiveError('ARCHIVE_INCOMPLETE', 'the archive is incomplete — its manifest has no completed_at');
  }
  if (manifest.engine !== 'postgresql' || manifest.schema !== SCHEMA) throw invalid('names another engine or schema');

  const fp = manifest.schema_fingerprint;
  if (!fp || typeof fp !== 'object' || !isHash(fp.sha256) || !fp.tables || !fp.constraints || !fp.enums) {
    throw invalid('has no schema fingerprint');
  }
  const { sha256: claimed, ...body } = fp;
  if (sha256(canonical(body)) !== claimed) throw invalid("schema fingerprint does not match its own hash");

  const excluded = Array.isArray(manifest.excluded_tables) ? manifest.excluded_tables.map((t) => t && t.name).sort() : null;
  if (!excluded || canonical(excluded) !== canonical([...EXCLUDED_NAMES].sort())) throw invalid('does not exclude exactly auth_codes and backups');

  if (!Array.isArray(manifest.tables)) throw invalid('lists no tables');
  const expected = Object.keys(fp.tables).filter((t) => !EXCLUDED_NAMES.has(t)).sort();
  const listed = manifest.tables.map((t) => t && t.table);
  if (canonical([...listed].sort()) !== canonical(expected)) throw invalid('does not list one member for every table of its schema');
  for (const t of manifest.tables) {
    if (t.member !== `data/${t.table}.csv`) throw invalid(`names an unexpected member for ${t.table}`);
    if (!Array.isArray(t.columns) || canonical([...t.columns].sort()) !== canonical(Object.keys(fp.tables[t.table]).sort())) {
      throw invalid(`lists other columns for ${t.table} than its schema has`);
    }
    if (!isCount(t.rows) || !isCount(t.bytes) || !isHash(t.sha256) || !(t.max_id === null || Number.isSafeInteger(t.max_id))) {
      throw invalid(`has an unreadable entry for ${t.table}`);
    }
  }
  if (!Array.isArray(manifest.sequences) || !manifest.sequences.every((s) => s && s.table && s.column && Number.isSafeInteger(s.next_value))) {
    throw invalid('has unreadable sequence values');
  }
}

async function verifyMember(zip, entry, member) {
  const tap = new MemberTap();
  try {
    await pipeline(await zip.openReadStreamPromise(entry), tap, discard());
  } catch {
    throw new ArchiveError('ARCHIVE_INVALID', `the member ${member.member} cannot be read`);
  }
  const seen = tap.result();
  if (seen.bytes !== member.bytes || seen.sha256 !== member.sha256) {
    throw new ArchiveError('ARCHIVE_INVALID', `the member ${member.member} does not match its checksum`);
  }
  if (seen.openQuote) throw new ArchiveError('ARCHIVE_INVALID', `the member ${member.member} ends inside a quoted value`);
  if (seen.rows !== member.rows) {
    throw new ArchiveError('ARCHIVE_INVALID', `the member ${member.member} holds ${seen.rows} rows where the manifest says ${member.rows}`);
  }
  if (seen.header !== member.columns.join(',')) {
    throw new ArchiveError('ARCHIVE_INVALID', `the member ${member.member} has another header than its manifest`);
  }
}

// Every check a restore makes on the FILE before it writes. Returns the
// manifest and the hash of its bytes (restoreArchive refuses a file that
// changed after this read).
async function inspectArchive(filePath) {
  const zip = await openZip(filePath);
  try {
    const entries = await listEntries(zip);
    const bytes = await readManifestBytes(zip, entries);
    let manifest;
    try {
      manifest = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new ArchiveError('ARCHIVE_INCOMPLETE', 'the archive is incomplete — its manifest is not valid JSON');
    }
    validateManifest(manifest);
    const expected = new Set([MANIFEST_MEMBER, ...manifest.tables.map((t) => t.member)]);
    for (const name of entries.keys()) {
      if (!expected.has(name)) throw new ArchiveError('ARCHIVE_INVALID', `the archive holds an unexpected member, ${name}`);
    }
    for (const member of manifest.tables) {
      const entry = entries.get(member.member);
      if (!entry) throw new ArchiveError('ARCHIVE_INCOMPLETE', `the archive is incomplete — the member ${member.member} is missing`);
      await verifyMember(zip, entry, member);
    }
    return { manifest, manifest_sha256: sha256(bytes) };
  } finally {
    zip.close();
  }
}

// ---------------------------------------------------------------------------
// Restoring
// ---------------------------------------------------------------------------

// The member streams into COPY ... FROM STDIN. Piped by hand rather than
// through stream.pipeline: when the SERVER refuses the data (a malformed row,
// a duplicate key) the COPY stream has already left COPY mode and must not be
// destroyed again; when the FILE fails, destroying the COPY sends CopyFail so
// the server leaves COPY mode. Either way the connection stays usable for the
// ROLLBACK TO SAVEPOINT that follows.
async function loadMember(client, zip, entry, member) {
  let source;
  try {
    source = await zip.openReadStreamPromise(entry);
  } catch {
    throw new ArchiveError('ARCHIVE_INVALID', `the member ${member.member} cannot be read`);
  }
  const tap = new MemberTap();
  const copy = client.query(
    copyFrom(
      `COPY ${qualified(member.table)} (${member.columns.map(quoteIdent).join(', ')}) FROM STDIN WITH (FORMAT csv, HEADER MATCH)`
    )
  );
  await new Promise((resolve, reject) => {
    let settled = false;
    copy.on('error', (error) => {
      source.unpipe(tap);
      tap.unpipe(copy);
      source.destroy();
      if (settled) return;
      settled = true;
      error.archiveTable = member.table;
      reject(error);
    });
    copy.on('finish', () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    const abort = (error) => {
      tap.unpipe(copy);
      copy.destroy(error);
    };
    source.on('error', abort);
    tap.on('error', abort);
    source.pipe(tap).pipe(copy);
  });
  const seen = tap.result();
  if (seen.sha256 !== member.sha256 || seen.rows !== member.rows || copy.rowCount !== member.rows) {
    throw new ArchiveError('ARCHIVE_INVALID', `the member ${member.member} changed after it was checked`);
  }
}

// Restores `filePath` (already through inspectArchive) on a connected client
// of the owner role. Returns what it did; throws an ArchiveError for a
// refusal, anything else for a failure — with everything rolled back, the
// sequences included. One case cannot say that: the connection failing AT
// COMMIT. Then the error carries `outcomeUnknown` — the transaction's id and
// the result it would have returned — for the caller to settle with
// transactionOutcome() on a fresh connection.
async function restoreArchive(client, filePath, inspection) {
  const { manifest } = inspection;
  const zip = await openZip(filePath);
  let began = false;
  let inSavepoint = false;
  let committing = false;
  let xid = null;
  let pending = null;
  let captured = null;
  try {
    const entries = await listEntries(zip);
    if (sha256(await readManifestBytes(zip, entries)) !== inspection.manifest_sha256) {
      throw new ArchiveError('ARCHIVE_INVALID', 'the file changed after it was checked');
    }

    await client.query('BEGIN');
    began = true;
    await client.query("SET LOCAL lock_timeout = '15s'");
    // The transaction's own id, assigned now: if the connection fails at
    // COMMIT, the server can still be asked what became of it.
    ({
      rows: [{ xid }],
    } = await client.query('SELECT pg_catalog.pg_current_xact_id()::text AS xid'));
    await useArchiveSession(client);
    const { rows: listed } = await client.query(
      `SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') ORDER BY c.relname`,
      [SCHEMA]
    );
    const tables = listed.map((r) => r.name);
    const tableList = tables.map((t) => qualified(t)).join(', ');
    // Every table, before anything is read: nothing can write between the
    // saved backups rows and the truncate, and the schema cannot change under
    // the fingerprint.
    await client.query(`LOCK TABLE ${tableList} IN ACCESS EXCLUSIVE MODE`);

    const differences = fingerprintDifferences(manifest.schema_fingerprint, await schemaFingerprint(client));
    if (differences.length) throw new ArchiveError('SCHEMA_MISMATCH', describeDifferences(differences), { differences });

    // Captured under the locks, so no id can be handed out between the
    // capture and a put-back.
    captured = await exactSequenceState(client, await identitySequences(client));

    await client.query('SAVEPOINT restore_work');
    inSavepoint = true;
    await client.query('SET CONSTRAINTS ALL DEFERRED');

    const activity = manifest.tables.find((t) => t.table === 'activity_logs');
    const { rows: lostRows } = await client.query(
      'SELECT pg_catalog.count(*)::bigint AS n FROM portal.activity_logs WHERE $1::bigint IS NULL OR id > $1::bigint',
      [activity ? activity.max_id : null]
    );

    await client.query('CREATE TEMPORARY TABLE restore_saved_backups ON COMMIT DROP AS SELECT * FROM portal.backups');
    const { rows: savedRows } = await client.query('SELECT pg_catalog.count(*)::bigint AS n FROM pg_temp.restore_saved_backups');

    await client.query(`TRUNCATE TABLE ${tableList}`);
    for (const member of manifest.tables) await loadMember(client, zip, entries.get(member.member), member);

    // Q3 (a): every backup kept must keep its creator.
    const { rows: orphaned } = await client.query(
      `SELECT s.filename FROM pg_temp.restore_saved_backups s
        WHERE NOT EXISTS (SELECT 1 FROM portal.users u WHERE u.id = s.created_by)
        ORDER BY s.id`
    );
    if (orphaned.length) {
      const names = orphaned.slice(0, 3).map((r) => r.filename).join(', ');
      const more = orphaned.length > 3 ? ` and ${orphaned.length - 3} more` : '';
      throw new ArchiveError(
        'CATALOG_CREATOR_MISSING',
        `${orphaned.length} backup record${orphaned.length === 1 ? ' was' : 's were'} made by an account this archive does not hold (${names}${more}) — restoring it would leave ${orphaned.length === 1 ? 'that record' : 'those records'} without a creator`
      );
    }
    await client.query('INSERT INTO portal.backups SELECT * FROM pg_temp.restore_saved_backups');

    const learnerFieldsCleared = await clearRetiredLearnerFields(client);

    // Q4 (a): never backwards — the live value, the archive's and the
    // restored rows' highest id, whichever is furthest on.
    const archived = new Map(manifest.sequences.map((s) => [`${s.table}.${s.column}`, s.next_value]));
    const sequences = [];
    for (const seq of captured) {
      const { rows: maxRows } = await client.query(
        `SELECT pg_catalog.max(${quoteIdent(seq.column)})::bigint AS m FROM ${qualified(seq.table)}`
      );
      const next = Math.max(seq.next_value, archived.get(`${seq.table}.${seq.column}`) || 1, Number(maxRows[0].m || 0) + 1);
      await restartAt(client, seq.sequence, next);
      sequences.push({ table: seq.table, before: seq.next_value, archive: archived.get(`${seq.table}.${seq.column}`) || null, after: next });
    }

    const { rows: cutoffRows } = await client.query(
      `INSERT INTO portal.auth_security_state (id, token_valid_after) VALUES (1, portal.now_s())
       ON CONFLICT (id) DO UPDATE SET token_valid_after = EXCLUDED.token_valid_after
       RETURNING token_valid_after`
    );
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('RELEASE SAVEPOINT restore_work');
    inSavepoint = false;

    pending = {
      tables_truncated: tables.length,
      members_loaded: manifest.tables.length,
      rows_loaded: manifest.tables.reduce((sum, t) => sum + t.rows, 0),
      backups_kept: Number(savedRows[0].n),
      lost_activity_logs: Number(lostRows[0].n),
      learner_fields_cleared: learnerFieldsCleared,
      sequences,
      cutoff: cutoffRows[0].token_valid_after,
    };
    committing = true;
    await client.query('COMMIT');
    began = false;
    return pending;
  } catch (error) {
    if (began) {
      if (committing) {
        // COMMIT was sent and no answer came back: it may have committed.
        // Nothing here can tell, so nothing is undone or claimed — the
        // caller asks the server (transactionOutcome) on a fresh connection.
        error.outcomeUnknown = { xid, result: pending };
      } else {
        try {
          if (inSavepoint) await client.query('ROLLBACK TO SAVEPOINT restore_work');
          await client.query('ROLLBACK');
        } catch {
          // The connection itself failed before COMMIT; the server rolls the
          // transaction back as it closes — the sequences with it (restartAt
          // is transactional), so there is nothing to put back by hand.
        }
      }
    }
    throw error;
  } finally {
    zip.close();
  }
}

module.exports = {
  ARCHIVE_FORMAT,
  ARCHIVE_FORMAT_VERSION,
  EXCLUDED_TABLES,
  MANIFEST_MEMBER,
  SCHEMA,
  ArchiveError,
  canonical,
  clearRetiredLearnerFields,
  describeDifferences,
  describeFormat,
  fingerprintDifferences,
  inspectArchive,
  restoreArchive,
  safeMessage,
  schemaFingerprint,
  transactionOutcome,
  useArchiveSession,
  writeArchive,
};
