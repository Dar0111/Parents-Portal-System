# 05 — Validation matrix (actual outcomes, 2026-10-19)

Three columns of truth: **ran** (with the result and the report file),
**planned** (needs the application port or the hosted project), **blocked**
(cannot run in this environment and why). Reports are JSON files under
`C:\Users\Win10 User\Parents_Portal-migration-data\` and contain counts,
ids, types and table names — never a row value.

Targets used: embedded PostgreSQL 17.10 (`pg17/`, ICU, `en-US` ICU default
locale, `C` libc) and the isolated MySQL copy `parents_portal_migsrc_20261019_145706`.
The application database was only ever read (session `READ ONLY`).

## 1. Data

| Requirement | Status | Result / evidence |
|---|---|---|
| Fresh uniquely named verified snapshot | **ran** | `snapshots/source_parents_portal_20261019_145706.sql`, 2,236,883 B, footer, 25 CREATE TABLE, UTC preamble — `manifests/snapshot_20261019_145706.json` |
| Isolated restore of the snapshot (MySQL) | **ran** | `parents_portal_migsrc_20261019_145706`: 25/25 tables — row counts, AUTO_INCREMENT and CHECKSUM TABLE equal to the live database's consistent snapshot |
| Source data checks for the conversions | **ran** | `01_BASELINE.md` §2: flags only 0/1; no DATE values; no zero dates possible; whole-second timestamps except `password_changed_at` (ms); no padded/mixed-case collisions; FK orphans 0 |
| Schema applied | **ran** | local: tables 25, indexes 83, fks 33, uniques 14, checks 24, pks 25, enums 13, triggers 7, sequences 24; `portal.ci` = ICU `und-u-ks-level1` nondeterministic |
| Per-table reconciliation (counts + per-row normalized hashes) | **ran** | `rehearsal/reconcile_local_20261019T095753.json`: `RECONCILE OK`, 25 tables, 25,085 rows, 0 missing / extra / differing, 0 grown |
| IDs, relationships, constraints | **ran** | ids preserved (hash includes id); 33 FKs enforced after load (deferred only inside the load transaction); constraint counts in the report |
| Next-ID validation | **ran** | every identity sequence's next value = source AUTO_INCREMENT (24 tables; empty tables included) — reconcile prints no `SEQ` line |
| Transfer repeatability / partial failure | **ran (by design + one failure path)** | one transaction; the first semantics run's hang was unrelated; a refused re-run without `--truncate` is the guard against double loads (`transfer.js`) |
| Backup files manifest (hash, size, format, footer) | **ran** | `manifests/backups_20261019T065519.json`: 136 files, 109 rows reconciled, 27 orphans, 17 no-footer → unverified, sha256 per file |

## 2. Semantics (`rehearsal/semantics_local_20261019T101632.json`, 0 failures)

| Requirement | Status | Result |
|---|---|---|
| now() vs statement vs clock time | **ran** | now() constant in a transaction, statement_timestamp advances; `portal.now_s()` whole-second, ≤ instant |
| Rounding vs truncation | **ran** | `timestamptz(0)` rounds .600 up (MySQL `DATETIME(0)` cast rounds too); `date_trunc` truncates; (3) rounds µs to ms |
| Same-second cutoff equality | **ran** | token minted after the write in the same second accepted; one second earlier rejected; a rounded cutoff would reject (counter-example) |
| JS parsing and session zones | **ran** | same instant under UTC and Asia/Manila; JSON `…T08:39:44.000Z`; DATE as string |
| Interval maths | **ran** | `make_interval(mins => $1)`; epoch-diff floor = TIMESTAMPDIFF truncation (59), plain `::int` rounds (60) |
| The seven ON UPDATE behaviours | **ran, both engines** | identical bump/no-bump on all seven; `affectedRows` (mysql2 default flags) = matched rows like pg `rowCount`; upsert-changed = 2 on MySQL (unused by the app) |
| Collation matrix (equality, unique, join, group, LIKE, order, escaping; case, accents, trailing spaces, NFC/NFD, ß/ss, ligature, dotted İ, full-width) | **ran, both engines** | `02_CONTRACTS.md` D; `portal.ci` matches MySQL on every equality case except trailing spaces; LIKE on `portal.ci` is 0A000 on PG 17 (PROVISIONAL for the hosted version) |
| Driver/port checks | **ran** | boolean→smallint 22P02; `ANY([])` ok vs mysql2 `IN ()` parse error; ON CONFLICT batches; aggregate JS types; error classes 23505/23503/23502/23514/42703/ECONNREFUSED/28P01 vs ER_DUP_ENTRY; RETURNING; enum ordering/casing; null-last ordering; string_agg |
| Concurrency: FOR UPDATE, guarded UPDATE race, concurrent upserts, duplicate-key race, RR vs RC write conflict | **ran, both engines** | `03_QUERY_PORT_INVENTORY.md` §4; keep READ COMMITTED |

## 3. Workflows (`rehearsal/rehearse_local_20261019T110102.json`, `REHEARSAL OK`, 71 checks)

Ported statements run on the migrated copy inside one rolled-back
transaction with synthetic rows (no real row printed, nothing persisted —
the last check proves 0 synthetic rows remain).

| Requirement | Status | Result |
|---|---|---|
| Sign-in lookup (exact, lower-case, parent-by-LRN join; trailing space now misses) | **rehearsed (SQL)** | 4/4 |
| The three gates: consent count subquery, contact "confirmed since iat", forced password (`token_version` bump, replacement, second attempt 409) | **rehearsed (SQL)** | 11/11 |
| Reset/verification limits: hourly count, 60 s cooldown age, live-code read, burn | **rehearsed (SQL)** | 4/4 |
| Sign-in limits: 5 failures, clear, prune | **rehearsed (SQL)** | 3/3 |
| Attendance bulk upsert ×3, ANY read, enum casing, summary | **rehearsed (SQL)** | 5/5 |
| Excuse letter submit, adviser-only review once, `updated_at` bump | **rehearsed (SQL)** | 4/4 |
| Notifications fan-out with a duplicate recipient, unread counts, read-all, delete-with-recipients | **rehearsed (SQL)** | 4/4 |
| Messages: send, conversation window (ROW_NUMBER), mark-read count, contacts (string_agg/concat/ILIKE) | **rehearsed (SQL)** | 3/3 |
| Students search (LRN ci, name ILIKE; accent gap; `unaccent` candidate) | **rehearsed (SQL)** | 3/3 + INFO |
| Users sort by role text, LIKE on `portal.ci` refused, `COLLATE "C" ILIKE` works, duplicate assignment 23505 | **rehearsed (SQL)** | 4/4 |
| Grades: row, slot, components, recompute-shaped update (numeric strings, half-up), slot RESTRICT, lock read FOR UPDATE, bulk lock + repeat, dashboard SUM, delete refused while locked, subject order, JSON types | **rehearsed (SQL)** | 11/11 |
| Settings upsert (case-variant key) + ANY read on `portal.ci` | **rehearsed (SQL)** | 1/1 |
| Dashboards: boolean sums, ci section count | **rehearsed (SQL)** | 2/2 |
| Pagination `page.total` integer | **rehearsed (SQL)** | 1/1 |
| Backups row, wiped count with a Date param, restore cutoff (old token rejected, new accepted), single-row state | **rehearsed (SQL)** | 4/4 |
| Activity log insert; assignment delete keeps grades | **rehearsed (SQL)** | 2/2 |
| HTTP response type compatibility | **rehearsed (SQL)** via `JSON.parse(JSON.stringify(row))` on users/grades rows; **planned (HTTP)** through the suites once the port exists | types per `02` B |
| Socket.io handshake, 401/403/503 paths | **planned** — `test:socket-auth`, `test:auth-middleware` on stubs need the pg-shaped pool first (step 1 of `03` §5) | — |
| Grade computation, locking, rollback, concurrent requests end to end | **planned** — `test:grades`, `test:class-record`, `test:grade-locks` (step 5) | concurrency primitives measured in §2 |
| Authorization denial cases (404 vs 403) | **planned** — route logic, unchanged; every suite asserts them | — |
| Backup recovery + post-restore auth | **planned** — needs `04`'s implementation; the cutoff statement and the `token_version` argument rehearsed | — |
| Existing suites retargeted | **planned** — rules below | — |

### Retargeting rules for the 22 HTTP suites (inspected 2026-10-19 through a masked viewer)

- Every HTTP suite builds `dbConfig` from `DB_HOST/PORT/USER/PASSWORD/NAME`
  with `mysql.createConnection(dbConfig)` for fixtures and cleanup; none
  has a separate test database variable, so today a suite pointed by
  `.env` at the application database writes to it (by design — they clean
  up by id). The pg version takes the same keys from `PG_*`/`PG_URL` and a
  `pg.Client`; `insertId` → `RETURNING id`; `affectedRows` →
  `rowCount`; the `=== 1` / `=== 0` flag assertions stay (smallint); the
  class-summary suite's `is_locked === false` assertion is route-coerced
  and stays.
- `test:privacy` creates and drops a scratch **database** for the restore's
  privacy step; on PostgreSQL that step no longer exists (`04`), so the
  case becomes an assertion that the restore refuses a mismatched schema
  fingerprint.
- `test:backups` and `test:restore` assert mysqldump specifics
  (`CREATE DATABASE` in the file, `stripBackupsTableDdl`, `.partial`
  sweep); they are rewritten for the archive format with the same guards.
- `test:recovery` reads `server/tmp/mail` and `server/tmp/sms` (file
  transports) — unchanged. `test:profile-photo` touches
  `uploads/avatars/` — unchanged.
- Two suites read line 172 of `proof-backup-loop.js` for the seeded admin
  sign-in at run time — unchanged by the port; KNOWN ISSUES already says
  the seeded passwords must change before the pilot.
- Safeguard against the source: the pg suites must refuse to start when
  `DB_NAME`-style settings point at a database whose name is
  `parents_portal` on a MySQL host; simpler, the MySQL keys are removed
  from `.env` once the port lands, so no suite can reach MySQL at all.

## 4. Blocked here, listed for the hosted run

| Check | Why blocked locally | Where it runs |
|---|---|---|
| Supabase version, ICU, TimeZone, isolation default, extensions | no staging project yet | `06` §4 items 1–3, 5 |
| API-host ↔ database clock skew | one machine today | `06` §4 item 4 |
| Connection mode (session pooler over IPv4), idle limits, TLS verify-full | no project | `06` §4 item 6 |
| Schema, transfer, reconcile, semantics, rehearsal on the hosted target | no project | `06` §4 items 7–10 |
| Data API disabled / `portal` not exposed | no project | `06` §4 item 11 |
| `pg_dump` option for `04` | no client tools on this host; the recommended design needs none | — |
| Full HTTP suite run against PostgreSQL | application port not written (out of this phase) | `03` §5 steps 1–8 |
| Browser smoke (`npm run smoke`) against PostgreSQL | same | after the port |
