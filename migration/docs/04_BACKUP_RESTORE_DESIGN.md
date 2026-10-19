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

**Design (COPY archive):**

- **Create** (`POST /api/backups`): open one `portal_migrate`-or-equivalent
  connection, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` (one
  consistent snapshot for all tables — the counterpart of
  `--single-transaction`), for each of the 25 tables except `backups` and
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
  ALL DEFERRED`, `TRUNCATE` the 23 restorable tables, `COPY FROM STDIN` each
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
