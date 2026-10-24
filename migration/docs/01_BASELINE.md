# 01 — Verified source baseline, snapshot evidence and remaining assumptions

Measured 2026-10-19 (Phase 2 preparation). Phase 1's report is the reported
inventory; everything below was re-read from the repository or the live
server where it mattered.

## 1. Code baseline

| Fact | Value | How verified |
|---|---|---|
| Source branch / commit | `feat/first-signin` at `546a4c1d1e1069284ca7a4fe291136e3762c9265` | `git rev-parse HEAD`, `git log main..HEAD` (5 commits ahead of `main` `bae0800`), working tree clean |
| Preserved untouched | the 5 commits, the stash `stash@{0}: On main: wip teacher-contributions leftover on working tree`, the detached worktree `Parents_Portal-first-signin` at the same commit, the running API/web/Expo and the main tree where the parallel session works | not checked out, not stashed, not edited; this package lives in its own worktree |
| Migration worktree | `C:\Users\Win10 User\Parents_Portal-pg-migration`, branch `migrate/postgres-prep`, created from `546a4c1` | `git worktree add -b migrate/postgres-prep … 546a4c1` |
| Data folder (outside git and outside `server/backups`) | `C:\Users\Win10 User\Parents_Portal-migration-data` — `tooling/` (npm packages), `snapshots/`, `manifests/`, `rehearsal/`, `pg17/`, `secrets/` | created by this package; listed file by file in the dispatch report |

## 2. Source database baseline (read-only probe, `information_schema` + aggregates)

| Fact | Value |
|---|---|
| Server | MySQL Community 8.0.43, InnoDB 8.0.43, Win64 |
| `sql_mode` | IGNORE_SPACE, ONLY_FULL_GROUP_BY, STRICT_TRANS_TABLES, NO_ZERO_IN_DATE, NO_ZERO_DATE, ERROR_FOR_DIVISION_BY_ZERO, NO_ENGINE_SUBSTITUTION |
| Time zone | `time_zone = SYSTEM`, system zone "Malay Peninsula Standard Time", `NOW() − UTC_TIMESTAMP()` = 480 min (UTC+8, no DST) |
| Charset / collation | database `utf8mb4` / `utf8mb4_unicode_ci`; server default `utf8mb4_0900_ai_ci`; **0 columns deviate** from `utf8mb4_unicode_ci`; `utf8mb4_unicode_ci` is **PAD SPACE** (`information_schema.COLLATIONS`), `utf8mb4_0900_ai_ci` is NO PAD |
| Isolation | REPEATABLE-READ; `innodb_lock_wait_timeout` 50 s; `autocommit` 1; `max_connections` 151 |
| Identity | `auto_increment_increment` 1, `auto_increment_offset` 1, `explicit_defaults_for_timestamp` ON, `lower_case_table_names` 1 |
| Objects | 25 tables, 208 columns (int 60, varchar 42, timestamp 33, decimal 22, tinyint 20, enum 14, text 11, date 5, char 1), 84 indexes (25 PK, 14 unique, 45 non-unique of which 11 are MySQL's auto FK indexes), 33 FKs (CASCADE 17, SET NULL 9, RESTRICT 7; ON UPDATE NO ACTION), 8 enforced CHECKs, 7 `ON UPDATE CURRENT_TIMESTAMP` columns, 1 `TIMESTAMP(3)` |
| Rows (dump time, 2026-10-19 14:57 local) | 25,085: activity_logs 24,775 · backups 109 · transmutation_table 41 · subjects 40 · grade_weight_configs 40 · sections 23 · system_settings 9 · users 8 · teacher_assignments 8 · policy_acceptances 8 · login_attempts 8 · grading_mode_configs 6 · grades 5 · students 4 · auth_security_state 1 · ten tables empty |
| AUTO_INCREMENT next values | users 982 · students 1450 · grades 5258 · assessment_slots 2197 · notifications 3132 · grade_components 3161 · policy_acceptances 903 · login_attempts 880 · system_settings 549 · messages 593 · excuse_letters 517 · attendance 407 · announcements 356 · auth_codes 285 · teacher_assignments 248 · events 239 · memos 121 · backups 324 · activity_logs 24777 · sections 24 · subjects 41 · grade_weight_configs 41 · transmutation_table 42 · grading_mode_configs 7 (all above MAX(id); the transfer sets each PostgreSQL sequence to exactly these) |
| ID limits | every id is `INT UNSIGNED` (max 4,294,967,295); the largest id in use is 24,776; PostgreSQL `integer` (max 2,147,483,647) keeps the JSON number type and leaves four orders of magnitude of headroom |

### Source data checks for the proposed conversions (all aggregates)

| Check | Result |
|---|---|
| Boolean-like `TINYINT(1)` values | `grades.is_locked` {0}, `grades.acknowledged` {0}, `users.must_change_password` {0}, `login_attempts.cleared` {0: 2, 1: 6}, `messages.read_status` (empty) — **only 0 and 1 exist**, so the 0/1 CHECK is safe |
| DATE columns | 0 non-NULL values in all five (`students.birthday` is NULL on all 4 rows since the privacy build); no zero-date or pre-1900 value can exist |
| TIMESTAMP columns | all whole seconds except `users.password_changed_at` (4 of 4 non-NULL values carry milliseconds); range 2026-09-07 → 2026-10-18; `auth_security_state.token_valid_after` is set (one restore ran on 2026-10-13) |
| Unsigned ranges | `token_version` max 78; `backups.file_size` max 2,215,738; grade levels 1–6; terms ≤ 3; `transmuted_grade` ≤ 100; `display_order` ≤ 8, none NULL |
| DECIMAL | 5 grade rows, all descriptive (letters), no numerical value; 40 weight rows, all sum to 100.00 |
| Collation collisions | no column has a trailing/leading space, a control character or a case-variant duplicate (`COUNT(DISTINCT)` equals `COUNT(DISTINCT BINARY)` everywhere); `login_id` has mixed case on 4 of 8 rows; the VARCHAR class-key joins (students ↔ sections ↔ teacher_assignments) give identical counts under case-insensitive and binary comparison; every `students.section_id` matches its VARCHAR pair |
| FK orphans | 0 (users→students, activity_logs→users, backups→users, policy_acceptances→users) |
| `activity_logs` | 24,775 rows, 72 distinct actions, 1,540 with NULL `user_id`, longest description 292 chars, 65 rows with non-ASCII text; migrated whole (the description column is never read by the API and never printed by this package) |
| `backups.file_path` | 109 rows, all absolute paths on this machine, all in one directory |

## 3. Snapshot evidence

| Item | Value |
|---|---|
| File | `C:\Users\Win10 User\Parents_Portal-migration-data\snapshots\source_parents_portal_20261019_145706.sql` — 2,236,883 bytes |
| sha256 | `d5900c194ccb9dec…` (full hash in the manifest) |
| Manifest | `…\manifests\snapshot_20261019_145706.json` |
| Tool | mysqldump 8.0.43 against 8.0.43: `--single-transaction --quick --hex-blob --routines --triggers --events --no-create-db --tz-utc --set-gtid-purged=OFF --default-character-set=utf8mb4 --complete-insert`; no `--databases`, so the file carries no `CREATE DATABASE`/`USE` |
| Verification | footer `-- Dump completed on` present; 25 `CREATE TABLE`; `SET TIME_ZONE='+00:00'` preamble (TIMESTAMPs in UTC) |
| Isolated restore | loaded into **`parents_portal_migsrc_20261019_145706`** on the same MySQL server (created by the package, `utf8mb4_unicode_ci`); every table's row count, AUTO_INCREMENT and `CHECKSUM TABLE` equals the live database as read in the same consistent snapshot — **25 of 25 match**. The scratch database is kept for the semantics matrix; drop it with `scripts/snapshot-source.js --restore-check --drop-scratch` on a future run or by hand |

Not done against the source: no fixture, migration or cleanup suite ran; no
write of any kind. The one open MySQL connection per script was put in
`SET SESSION TRANSACTION READ ONLY`.

## 4. Backups directory (read-only manifest, `…\manifests\backups_20261019T065519.json`)

136 `.sql` files, 169,591,258 bytes, 0 `.partial`; 109 catalog rows, all
with a file and a matching size; 27 files without a row (7 `pre_restore_*`
on disk, 3 with rows); **17 files lack the footer and are "unverified"**,
8 more are unverified because they predate the 20-table threshold or have
an unexpected header — 111 verified by footer + header + table count; 10
files still carry the two Contributions tables; 41 predate
`assessment_slots`; 119 predate the privacy tables. Every row's `file_path`
is absolute and points at the one directory. Details and the design that
keeps all 136: `04_BACKUP_RESTORE_DESIGN.md`.

## 5. Tools and versions actually available

| Tool | Status |
|---|---|
| Node | v24.14.1 (`require()` of an ES module works — used for embedded-postgres) |
| mysql / mysqldump | 8.0.43, on PATH |
| PostgreSQL server | none installed; **embedded PostgreSQL 17.10** (`embedded-postgres@17.10.0-beta.17`, zonky binaries, ICU 67 included) runs from the data folder for the rehearsal |
| `pg_dump` / `psql` | **not available** (the embedded bundle ships `initdb`, `pg_ctl`, `postgres` only) — see `04_BACKUP_RESTORE_DESIGN.md` |
| pgloader | not installed, no Windows build; evaluated from its documentation and **not used**: it resets sequences to `MAX(id)` (this package needs the AUTO_INCREMENT floor) and maps `tinyint(1)` to `boolean` (this package keeps 0/1) |
| node-postgres | `pg` 8.23.1 (pg-types 4.1.0) |
| mysql2 | 3.12.0 (the application's version) |
| Supabase | no project yet; nothing contacted |

## 6. Assumptions that remain

1. The hosted target is PostgreSQL 17.x (the platform default per the
   changelog). The schema and matrix were rehearsed on 17.10; on 18.x one
   conclusion changes for the better (LIKE on `portal.ci`), nothing breaks.
2. The API host and the database host keep clocks within one second of each
   other (NTP). Measured as a hosted check, not assumed forever.
3. `JWT_SECRET` is carried over unchanged, so `login_attempts.login_key`
   and every active token keep meaning what they mean.
4. The `backups.file_path` values remain machine-specific after the move
   and are handled by the design in §04, not by rewriting rows.
5. Profile photos stay on the API host's disk (0 files today). Object
   storage is a separate decision.

## 7. Re-baseline after the sync with `main` (2026-10-24)

The branch was rebased onto `main` `5426b70` (B4 `feat/first-signin`'s
merge, B5 `feat/account-create`, B6 `feat/password-alert`, B1
`feat/grade-acknowledgement`, B3 `fix/f3-badges`, B8 `feat/excuse-attendance`,
B2 `feat/activity-log` and B7 `chore/pre-migration`, merged since
`546a4c1`), so §1's "source branch" is now `main` at that commit; §2–§6 stay
as the 2026-10-19 record. Measured again on 2026-10-24, the source opened
read-only as before:

| Fact | Value |
|---|---|
| Source objects | **26 tables** — `grade_acknowledgements` since B1 (2026-10-21), with `uq_grade_ack_term`, `idx_grade_ack_user`, `chk_grade_ack_term` and two FKs; `notifications.type` carries `grades_locked` and `grades_acknowledged` at the end of its list. B2, B3, B5–B8 changed no schema |
| Snapshot | `snapshots/source_parents_portal_20261024_164012.sql` — 2,759,750 bytes, footer present, 26 `CREATE TABLE`, UTC preamble; `manifests/snapshot_20261024_164012.json` |
| Isolated restore | `parents_portal_migsrc_20261024_164012` on the same MySQL server: 26 of 26 row counts, AUTO_INCREMENTs and `CHECKSUM TABLE` equal to the live database's consistent snapshot. The 2026-10-19 scratch stays beside it until after the cutover; the owner drops both by hand then (the owner's answer of 2026-10-24) |
| Rows at dump time | 30,780: activity_logs 30,409 · backups 130 · transmutation_table 41 · subjects 40 · grade_weight_configs 40 · sections 23 · login_attempts 17 · auth_codes 11 · assessment_slots 10 · grade_components 10 · system_settings 9 · users 8 · teacher_assignments 8 · policy_acceptances 8 · grading_mode_configs 6 · grades 5 · students 4 · auth_security_state 1 · eight tables empty (attendance, excuse_letters, messages, announcements, memos, events, notifications, grade_acknowledgements) |
| The seeded baseline | grades 5, assessment_slots 10, grade_components 10, grade_acknowledgements 0 — the four counts the owner named. Session A's HTTP suites were running on 5001 against the source at the time and left no row in the dump, so no second snapshot was needed |
| Local PostgreSQL | embedded 17.10, re-applied with `--drop-first`: tables 26, indexes 86, fks 35, uniques 15, checks 25, pks 26, enums 13, triggers 7, sequences 25; `portal.ci` ICU nondeterministic |
| Transfer and reconciliation | from the isolated scratch (`--source-db`), one transaction, 26 tables, 30,780 rows, every sequence at the source AUTO_INCREMENT; `RECONCILE OK`, grown 0 on every table; catalog pks 26 / uniques 15 / fks 35 / checks 25 / indexes 86. Both scripts now refuse a source whose base-table set is not exactly `lib/tables.js`'s (printed as "26 base tables, the same set") |
| Rehearsal | `REHEARSAL OK`, 90 checks — the 71 of 2026-10-19 plus 19 for the acknowledgements, the two new notification labels and the typed delete, the visit clear, the activity log's page and export, and the excuse review's attendance write (`05` §3a) |
| Semantics | `SEMANTICS OK`, 0 failures, against the new scratch; no conclusion changed |
| Inventory | 350 `.query(` call sites in 27 files (`03`) |
| Supabase | a project exists (the owner's, D-70's read-only MCP registered); read-only catalog facts of 2026-10-24 for the fix round's docs: PostgreSQL 17.11, `TimeZone` UTC, read committed, ICU present; no `portal` schema and no table in `public` yet; the two portal roles not created yet |
