# 04 — Backup & Restore on PostgreSQL

Admin → Backup & Restore **stays a requirement** (Figure 5 processes 1.27
and 1.28; web only). The MySQL implementation (`routes/backups.js`: two
`mysqldump` passes, `-- Dump completed on` footer check, a one-off
`multipleStatements` connection running the file, `stripBackupsTableDdl()`,
`pool.resetPool()`, the `token_valid_after` write) cannot run against a
hosted PostgreSQL: there is no `mysqldump`, an application role cannot
`DROP DATABASE`, and MySQL DDL being non-transactional was the reason the
"partially restored" failure mode existed at all. This document keeps the
feature and every historical file, and says what changes for the user.

## 1. The 136 existing files — preserved, classified, recoverable

`scripts/backups-manifest.js` read every file in `server/backups/` and the
`backups` table (read-only) on 2026-10-19 → `manifests/backups_20261019T065519.json`.

| Fact | Count |
|---|---|
| Files | 136 `.sql` (169,591,258 bytes), 0 `.partial`; all `mysqldump` format (header `-- MySQL dump 10.13  Distrib 8.0.43`) |
| Catalog rows | 109, every one with its file and an equal `file_size`; 0 rows without a file |
| Files without a row | 27 (the Backups page lists them read-only as "Files with no record") |
| `pre_restore_*` safety copies | 7 files, 3 with rows |
| **Verified** (footer + header + ≥ 20 tables) | 111 |
| **Unverified** | 25 — 17 without the footer (incomplete dumps, including the 2026-09-15 truncated one KNOWN ISSUES names), 8 complete files that predate the 20-table threshold. **Footer presence is not proof of recoverability**; a file becomes "recoverable" only after the historical path below has actually loaded it |
| Carry the retired Contributions tables | 10 (pre 2026-09-13) |
| Predate `assessment_slots` | 41 · predate the privacy tables: 119 · carry `auth_codes` DDL: most since R1 |
| `file_path` | 109 of 109 absolute, all in one directory on this machine |

Rule kept from CLAUDE.md: **no backup file is ever deleted, moved or
rewritten**; the manifest carries each file's sha256 so a later change is
detectable.

## 2. Two capabilities, two mechanisms

### 2a. PostgreSQL-era backups (the admin page's new mechanism)

Preferred: **an application-level logical backup written by the API
itself**, not `pg_dump`.

| | `pg_dump`/`psql` child process | **Application COPY archive (recommended)** |
|---|---|---|
| Needs on the API host | PostgreSQL 17 client tools installed and version-matched to the server (not present today; `pg_dump` must be ≥ server major) | nothing beyond `pg` (+ `pg-copy-streams`) |
| Scope control | `--schema=portal` + `--exclude-table-data` for `backups` and `auth_codes` | per-table `COPY (SELECT …) TO STDOUT` — the exclusion list is code, not flags |
| Restore | `psql -f` or `pg_restore`; DDL + data; needs the role to own the objects; `--single-transaction` possible for plain SQL | `TRUNCATE … CASCADE` + `COPY FROM STDIN` per table **inside one transaction**; any failure → ROLLBACK → **the "partially restored" state cannot happen** |
| Catalog preservation | the dump must skip `backups` data and the restore must skip its DDL (today's `stripBackupsTableDdl`) | the restore simply never touches `backups` (and never touches `auth_codes` data) |
| Runs on Supabase with `portal_migrate` | yes if the tools are installed where the API runs | yes |
| File format | `.sql` or custom | `.zip` holding `manifest.json` (schema fingerprint, table list, row counts, sha256 per member, source version), one `<table>.csv` per table (COPY CSV, UTF-8, `\N` nulls) |

**BUILT — Phase 3, commit 6 (2026-10-25), the owner's P4 with Q3 (a) and
Q4 (a).** `server/utils/backupArchive.js` (write, inspect, restore, the
fingerprint) and `server/routes/backups.js`. Where the build differs from the
design text below, the build is what the owner approved and this list wins:

1. **Create runs as `portal_app`** (SELECT is all it needs), not
   `portal_migrate`. The file is read back whole before the rename.
2. **The restore truncates all 26 tables in one statement** — `backups`
   included, because its foreign key to `users` is RESTRICT and cannot be
   deferred, so `users` cannot be truncated without it. The `backups` rows
   are saved first (a temporary table, under the restore's locks) and put
   back with their ids after the COPY — the catalog still survives every
   restore. **Q3 (a):** when a saved row's creator is not in the archive the
   whole restore is refused and rolled back (`409 CATALOG_CREATOR_MISSING`).
3. **Q4 (a): a sequence never moves backwards.** Each is set to the furthest
   of its live value, the archive's and the restored rows' highest id — not
   "from the manifest" — so an id handed out before a restore is never
   handed out again. ~~The values are captured under the locks and put back on
   any failure, inside the savepoint before the rollback (`setval` is not
   transactional).~~ **Since P3-C-R2 Phase H (2026-10-25):** each sequence
   moves by `ALTER SEQUENCE … START WITH n RESTART`, which IS transactional —
   a rollback puts it back by itself, so there is no hand put-back, and none
   that could run after a COMMIT that in fact succeeded. `START WITH` keeps
   an uncalled sequence's `start_value` equal to its next value, which is what
   the next archive's manifest reads through `pg_sequences` (with `RESTART
   WITH` alone, 14 of 25 sequences read 1 after a transfer — measured).
   **A connection lost AT COMMIT** (review finding backup-2): the restore's
   transaction id travels with the error, the route asks the server
   (`pg_xact_status`) on a fresh connection, and answers by the server's word —
   committed (the success reply, saying the connection dropped), aborted
   (rolled back), or `500 RESTORE_OUTCOME_UNKNOWN` (check before anything
   else). Proved by `migration/scripts/restore-commit-drop.js` (a relay that
   ends the connection before and after the COMMIT).
4. **Every table is locked** (ACCESS EXCLUSIVE, `lock_timeout` 15 s) before
   anything is read, so no write lands between the saved `backups` rows and
   the truncate, and the schema cannot change under the fingerprint.
   **And an ARCHIVE locks every table IN ACCESS SHARE MODE before its
   snapshot exists** (P3-C-R2 Phase H, review finding backup-1): TRUNCATE is
   not MVCC-safe, so an archive whose snapshot was fixed while a restore held
   its locks read every truncated table as EMPTY after the restore committed
   — an empty archive that passed every check (reproduced: 0 of 201 rows,
   `inspectArchive` passing). The lock waits for the restore (`lock_timeout`
   60 s), and the snapshot taken after it holds the restored rows
   (`migration/scripts/backup-during-restore.js`, with that mutant). A manual
   backup asked for while a restore runs in this process is `409
   RESTORE_RUNNING`, and a second restore's `409 RESTORE_RUNNING` is logged as
   `restore_refused` like every other refusal (backup-3) — written before the
   running restore's transaction, so a successful restore rewinds it with the
   rest of `activity_logs` and counts it in its lost entries
   (`migration/scripts/restore-e2e.js`: 3 wiped with the log line, 2 without).
5. **The fingerprint is read from `pg_catalog`**, never
   `information_schema` (which hides what a role may not see): every table's
   columns (type, nullability, identity, generation, collation), its
   constraints, and the enum labels, every name schema-qualified. A mismatch
   is refused before any write, naming each difference.
6. **Decision 6 is kept by the restore:** the four retired learner fields are
   cleared inside the transaction (the MySQL privacy step's data half; its
   other half — missing tables — cannot happen, the fingerprint refuses it).
7. **A MySQL-era `.sql` row** is listed with its engine and format and
   refused with the recovery procedure (§2b) before any password is asked
   for; the page shows that answer as the server wrote it.
8. **The lost-entries count** is every live log row above the archive's own
   highest `activity_logs` id, counted under the locks (the KNOWN ISSUES
   off-by-one, fixed).

Rehearsed on the isolated target, 39/39 (`docs/RESTORE.md`), and the suites
are `test:backups` 63, `test:restore` 39, `test:privacy` 85
(`docs/TESTING.md`).

**Design (COPY archive), as written before the build:**

- **Create** (`POST /api/backups`): open one `portal_migrate`-or-equivalent
  connection, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` (one
  consistent snapshot for all tables — the counterpart of
  `--single-transaction`), for each of the 26 tables (since the 2026-10-24
  sync; `grade_acknowledgements` included) except `backups` and
  `auth_codes` data: `COPY (SELECT * FROM portal.<t> ORDER BY id) TO STDOUT
  WITH (FORMAT csv, HEADER)`; also record every sequence's `last_value`.
  Write to `<name>.zip.partial`, rename to `.zip` only after the manifest's
  own footer field is written (the `.partial` safeguard survives). Insert the
  `backups` row after the file is complete, as today. `backups.file_path`
  stays an absolute path on the API host — the same contract as today.
- **The footer check** becomes a manifest check: `manifest.completed_at`
  present and every member's sha256 matching.
- **Restore** (`POST /api/backups/:id/restore`): the pre-flight is unchanged
  (row, file present, step-up password → 403, type-the-name → 400, never
  401); **safety backup first** (same mechanism, prefix `pre_restore`);
  verify the archive's schema fingerprint equals the live schema's
  (`001_portal_schema.sql` version marker + a hash of
  `information_schema.columns` for `portal`) — a mismatch is refused with
  the exact difference, which replaces today's "old dump drops
  `assessment_slots`" hazard; then **one transaction**: `SET CONSTRAINTS
  ALL DEFERRED`, `TRUNCATE` the 24 restorable tables (26 minus `backups` and
  `auth_codes`), `COPY FROM STDIN` each
  member, `setval` every sequence from the manifest (never from `MAX(id)`),
  then `INSERT INTO auth_security_state (id, token_valid_after) VALUES (1,
  portal.now_s()) ON CONFLICT (id) DO UPDATE SET token_valid_after =
  EXCLUDED.token_valid_after` **in the same transaction**, COMMIT. On any
  error: ROLLBACK, the reply says nothing changed and names the safety
  backup. No `DROP DATABASE`, no pool reset needed (the pool's connections
  stay valid), no privacy-migration step (the schema is not replaced).
- **`activity_logs`** is rewound as today, and the `restore_wiped_activity_logs`
  marker is written after the commit — with the count computed as
  `COUNT(*) WHERE created_at > <backup.created_at>`; the off-by-one in
  KNOWN ISSUES can be fixed here by counting against the archive's own
  `activity_logs` max id instead.
- **Exclusions**: `backups` rows never leave in a file and are never
  truncated by a restore (the catalog survives every restore, which fixes
  the "table no longer knows later backups" case by construction);
  `auth_codes` rows never leave in a file (10⁶ plaintext space) and the
  restore truncates it to empty, as today.
- **Post-restore token cutoff and sockets**: the cutoff write is inside the
  restore transaction, so no window exists in which the data is restored
  and tokens are still valid. Sockets: `middleware/auth.js` and the
  handshake re-read `token_valid_after` on every request/handshake, but an
  already-open socket is not re-checked per event; the port adds
  `io.disconnectSockets()` right after COMMIT so every live channel
  reconnects and is refused until its user signs in again (today a restored
  MySQL database simply had its pool reset; open sockets likewise kept
  their rooms).
- **Restored `token_version` values cannot revive old JWTs** — verified
  logically and by `rehearse.js` (`restore.cutoff_rejects_old_token_accepts_new`):
  a restore can lower a user's `token_version` back to a value an old token
  carries, which is exactly why the global cutoff exists; every token with
  `iat` before the cutoff is rejected regardless of `v`, and a token minted
  after it carries the restored version. The pair (version equality AND
  cutoff) is unchanged by the port; the semantics matrix proves the
  same-second edge (`02` C.3).
- **Ownership/grants**: the archive is written and read by the API process
  (disk on the API host, as today). The restore needs `TRUNCATE` and
  `setval`, which `portal_app` deliberately lacks — the API opens the
  restore's one-off connection as **`portal_migrate`** (a second credential
  in `.env`, used by this endpoint only), mirroring today's one-off
  `mysql2` connection outside the pool. `portal_app` keeps DML only.
- **Partial failure**: a failed create leaves a `.partial` (swept as today);
  a failed restore leaves nothing changed; a crash between COMMIT and the
  bookkeeping `logActivity` is reported exactly as today ("restored, but
  marking… failed" is no longer possible because the cutoff is in the
  transaction — the only post-commit step is the log row).

### 2b. Historical MySQL backups — the recovery path

A MySQL dump is not loadable into PostgreSQL by the admin page, and
rewriting 136 historical files is out of the question. The recovery path
is **this package, run by hand**:

1. Load the chosen `.sql` into an **isolated MySQL database**
   (`parents_portal_migsrc_<stamp>`): for a file that carries `CREATE
   DATABASE parents_portal`/`USE` (the API's own dumps do — `--databases`),
   do NOT run it as is; `scripts/snapshot-source.js` shows the pattern
   (`mysql --database=<scratch> --execute="source <file>"` after stripping
   the `CREATE DATABASE`/`USE` lines on a copy in the data folder — a step
   to add to the script as `--from-file`). Pre-2026-09-13 files bring the
   Contributions tables (ignored by `lib/tables.js`); pre-`assessment_slots`
   files lack a table (the transfer must then insert nothing for it and
   the restore refuses unless `--allow-missing-tables` is passed with the
   list); pre-privacy files lack `policy_acceptances`/`login_attempts`
   (same rule).
2. `scripts/transfer.js --source-db <scratch> --target <pg>` into an EMPTY
   `portal` schema (or a scratch schema for inspection), then
   `scripts/reconcile.js --source-db <scratch>` → `RECONCILE OK`.
3. Swap: the application-level restore (2a) can then take an archive made
   from that scratch schema, or the owner points the API at the scratch
   database — a documented by-hand operation, logged as
   `manual_backup_adoption`-style rows, never an admin-page button.

Required tools for 2b: MySQL 8.0 client + server (a local MySQL stays
installed for exactly this), Node 24, this package. Deployment dependency
for 2a: none beyond the API's own `node_modules`.

Step 3's archive is `scripts/reconstruct-archive.js write --database
<scratch> --out <file.zip>` (§2c): an archive of the scratch database in the
page's own format, which the owner then registers by hand.

### 2c. The reconstruction procedure — an archive with no API to restore it

`scripts/reconstruct-archive.js` (built in commit 6), on the embedded local
cluster only — it opens no secrets file and has no staging target:

- `verify <archive.zip>` — every check the restore makes on the file (a
  complete manifest, every member against its checksum, rows and header).
- `load <archive.zip> --database <name>` — a NEW database (or an empty one;
  a database that already has a `portal` schema is refused): 001 and 003 in
  one transaction, then the API's own `restoreArchive` in a second — the
  fingerprint against the fresh schema, every member, the sequences, the
  four retired fields, a session cutoff. It prints each table's archive and
  database row counts and fails on any difference (`auth_security_state`
  holds the one cutoff row). Rehearsed 2026-10-25: 24 tables at the
  archive's counts.
- `write --database <name> --out <file.zip>` — the archive of a database the
  page did not write (§2b step 3); `--out` must not exist.

A hosted reconstruction (onto a new Supabase project) is the same two
transactions on the staging connection, once `supabase.env` exists — not
built here.

## 3. User-visible consequences, stated

- The Backups page keeps the same three actions (create, download, restore)
  and the same guards; the downloaded file is a `.zip` archive instead of a
  `.sql` file, and the list shows its format.
- The 136 historical files are listed as **"MySQL-era, restorable by the
  recovery procedure, not from this page"** with their manifest status
  (verified / unverified); the 27 orphans stay read-only as today.
- A restore of a PostgreSQL archive whose schema fingerprint differs is
  refused with the difference named — where today a mismatched MySQL dump
  silently dropped tables.
- A failed restore leaves the database exactly as it was (transactional),
  where today it could leave it partially restored.
- Everyone is signed out by a restore, as today; live sockets are now
  dropped too.

## 4. Catalog rows and absolute paths

The 109 `backups` rows migrate verbatim (the transfer and reconciliation
proved it). Their `file_path` values point at this machine; the new API
host will not have the files unless `server/backups/` is copied. Decision
recorded, not taken here: keep the rows as history and mark them "MySQL-era"
by format (the filename says `.sql`); copy the directory to the new host so
`file_exists` stays true; or leave them where they are and accept
`file_exists: false` for all 109 on the new host. The page already renders
`file_exists`. **Default: copy the directory and keep the rows.**

## 5. What this design does NOT do

It does not add uploads to the archive (profile photos stay outside, as
KNOWN ISSUES records), does not adopt orphan files, does not delete
`pre_restore_*` copies, and does not use Supabase's own daily backups or
PITR as the admin feature — those are the platform's safety net underneath,
listed as a hosted check, not a replacement for process 1.27/1.28.
