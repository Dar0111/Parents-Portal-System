# 05 — Validation matrix (actual outcomes, 2026-10-19; re-run 2026-10-24 after the sync with `main` — §0 and §3a)

Three columns of truth: **ran** (with the result and the report file),
**planned** (needs the application port or the hosted project), **blocked**
(cannot run in this environment and why). Reports are JSON files under
`C:\Users\Win10 User\Parents_Portal-migration-data\` and contain counts,
ids, types and table names — never a row value.

Targets used: embedded PostgreSQL 17.10 (`pg17/`, ICU, `en-US` ICU default
locale, `C` libc) and the isolated MySQL copy `parents_portal_migsrc_20261019_145706`.
The application database was only ever read (session `READ ONLY`).

## 0. The re-run after the sync with `main` `5426b70` (2026-10-24, 26 tables)

| Requirement | Status | Result / evidence |
|---|---|---|
| Fresh verified snapshot, 26 tables | **ran** | `snapshots/source_parents_portal_20261024_164012.sql`, 2,759,750 B, footer, 26 CREATE TABLE, UTC preamble — `manifests/snapshot_20261024_164012.json` |
| Isolated restore of the snapshot (MySQL) | **ran** | `parents_portal_migsrc_20261024_164012`: 26/26 tables — row counts, AUTO_INCREMENT and CHECKSUM TABLE equal to the live database's consistent snapshot; the seeded baseline's four counts held (grades 5, assessment_slots 10, grade_components 10, grade_acknowledgements 0) |
| Schema applied | **ran** | local 17.10, `--drop-first`: tables 26, indexes 86, fks 35, uniques 15, checks 25, pks 26, enums 13, triggers 7, sequences 25; `portal.ci` = ICU `und-u-ks-level1` nondeterministic |
| Source table set equals `lib/tables.js` | **ran** (the new guard) | 26 base tables, the same set — checked by `transfer.js` before `BEGIN` and by `reconcile.js` before the first table |
| Transfer | **ran** | from the isolated scratch (`--source-db`): 26 tables, 30,780 rows, one transaction, every sequence set — `rehearsal/transfer_local_20261024T084124.json` |
| Per-table reconciliation | **ran** | `rehearsal/reconcile_local_20261024T084250.json`: `RECONCILE OK`, 26 tables, 0 missing / extra / differing, 0 grown, every sequence equal; catalog pks 26, uniques 15, fks 35, checks 25, indexes 86 |
| Semantics matrix | **ran** | `rehearsal/semantics_local_20261024T084545.json`: `SEMANTICS OK`, 0 failures against the new scratch; every conclusion of §2 unchanged |
| Workflow rehearsal | **ran** | `rehearsal/rehearse_local_20261024T084423.json`: `REHEARSAL OK`, 90 checks (71 + the 19 of §3a), 0 synthetic rows left |
| Query inventory | **ran** | 350 `.query(` call sites in 27 files (`03`) |

## 0b. The D-65 fix round (2026-10-24; `06` §2–§2a, §4)

| Requirement | Status | Result / evidence |
|---|---|---|
| Schema + grants + RLS applied in one transaction | **ran** | local `--drop-first` (the discard printed first: 26 tables, about 30,780 rows): COUNTS as §0; POLICIES `rls_on 26, forced 0, policies 26, portal_app_all 26, app_schema_usage true, app_schema_create false, app_dml_tables 26, app_truncate_tables 0, app_usage_sequences 25, anon/authenticated/service_role schema usage false, anon/service_role select tables 0`; the local roles created NOLOGIN |
| The allow-and-deny matrix | **ran** | `rehearsal/rlscheck_local_20261024T090921.json`: `RLS CHECK OK`, 20 checks + 6 INFO — catalog 7; deny 3 × 104 of 104 at 42501 (anon, authenticated, service_role with BYPASSRLS); RLS alone: 0 rows in 26 tables (18 populated) for a granted role without a policy and its INSERT 42501 by RLS's own message; allow: `portal_app` equal counts on 26, insert/update/delete 1/1/1, TRUNCATE/ALTER/DROP/CREATE 42501, `now_s()` executable; owner: reads 26 and inserts without a policy (no FORCE); rollback left nothing (0 throwaway roles, 0 synthetic rows, 26 tables owned by the migrator, 26 policies). The first run (`rlscheck_local_20261024T090832.json`) failed the owner INSERT on the function revoke, not on RLS — the emulation now grants EXECUTE, as the real owner has |
| The staging refusals, flag first | **ran** | `apply-schema.js --target staging --drop-first` and `transfer.js --target staging --truncate` both exit 1 naming the flag, with no `supabase.env` on disk — no secret was read; the connection check (`isDisposableLocal`) passed for the real local target on the `--truncate` run |
| `set-role-passwords.js --dry-run` | **ran** | exit 1, names only: the file and the three keys MISSING, the CA file MISSING → TLS would be refused without `--tls-encrypt-only`; no connection opened; `--target local` refused |
| Transfer and reconcile after 003 | **ran** | `transfer_local_20261024T090817.json` 26 tables, 30,780 rows as `portal_migrate` with RLS on (the owner exempt); `reconcile_local_20261024T090929.json` `RECONCILE OK`, every sequence equal after the matrix; a second transfer with `--truncate` printed the per-table discards and the total before loading again — its first run counted 7 tables / 122 rows because `TRUNCATE … CASCADE` on `users` had already emptied the dependents when their turn came; the guard now counts every table BEFORE truncating any and printed 18 tables / 30,780 rows (`transfer_local_20261024T091356.json`); the reconcile after it `RECONCILE OK` |
| The hosted RLS proof | **pending** `supabase.env` | `06` §4 items 7, 8 and 13 |

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

## 3. Workflows (`rehearsal/rehearse_local_20261019T110102.json`, `REHEARSAL OK`, 71 checks; 2026-10-24 `rehearse_local_20261024T084423.json`, 90 checks — §3a)

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

### 3a. The 19 checks added by the sync (2026-10-24; all PASS)

| Requirement | Status | Result |
|---|---|---|
| Grade acknowledgements (B1): insert RETURNING a whole-second stamp, a repeat 23505 (`uq_grade_ack_term`), term 4 refused 23514 (`chk_grade_ack_term`), the read `FOR UPDATE`, `acknowledgementsFor` with `= ANY($n::int[])` and its JSON types, the unlock's count | **rehearsed (SQL)** | 6/6 |
| The two new notification labels insert and a relock repeat is absorbed; `type = ANY($1::text[])` on the ENUM column is 42883 and `= ANY($1::portal.notification_type[])` is the port form; the parent's `grades_locked` row self-heals once the term is confirmed; the typed delete returns the recipients and the rowCount | **rehearsed (SQL)** | 5/5 |
| The visit clear (B3): the badge's ids by enum-array ANY, then the UPDATE by `id = ANY($n::int[])` | **rehearsed (SQL)** | 1/1 |
| The activity log (B2): the count and a newest-first page of 50 with `Date` bounds on `created_at`, `= ANY($n::text[])` for a group, `<> ALL($n::text[])` for Other, `SELECT DISTINCT action`, the export's count equal to the total | **rehearsed (SQL)** | 4/4 |
| The excuse review's attendance write (B8): an unrecorded class day inserted as Excused after the guarded letter UPDATE and the two `FOR UPDATE` reads, a duplicate day 23505 (`isWriteConflict`), Absent → Excused by id with `recorded_by` | **rehearsed (SQL)** | 3/3 |

### Retargeting rules for the 24 HTTP suites (22 inspected 2026-10-19 through a masked viewer; `test:grade-acknowledgements` and `test:activity-log` since the sync, plus the pure `test:excuse-attendance-rule`, which opens no database)

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
| Supabase version, ICU, TimeZone, isolation default | **read 2026-10-24 through the read-only MCP (D-70):** PostgreSQL 17.11, ICU present, `TimeZone` UTC, read committed — recorded in `06` by the fix round | `06` §4 items 1–3 |
| Supabase extensions, privileges | no `supabase.env` yet | `06` §4 item 5 |
| API-host ↔ database clock skew | one machine today | `06` §4 item 4 |
| Connection mode (session pooler over IPv4), idle limits, TLS verify-full | no project | `06` §4 item 6 |
| Schema, transfer, reconcile, semantics, rehearsal on the hosted target | no project | `06` §4 items 7–10 |
| Data API on (D-17), `portal` not exposed; the RLS proof as `anon` | no `supabase.env` | `06` §4 items 11 and 13 |
| `pg_dump` option for `04` | no client tools on this host; the recommended design needs none | — |
| Full HTTP suite run against PostgreSQL | application port not written (out of this phase) | `03` §5 steps 1–8 |
| Browser smoke (`npm run smoke`) against PostgreSQL | same | after the port |
