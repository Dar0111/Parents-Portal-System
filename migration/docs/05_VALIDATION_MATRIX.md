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

## 0c. Phase 3 commit 7 (2026-10-25): the proof gaps and the golden master

Sources: a fresh snapshot of the live database (read-only, `snapshot-source.js --restore-check`: 26 tables, every count, AUTO_INCREMENT and CHECKSUM TABLE equal) restored into a new isolated MySQL scratch, a few DATE rows added to that scratch only, and the local copy transferred from it (`RECONCILE OK`, 26 tables, every sequence equal). Reports under `rehearsal/` (`seqrollback_*`, `committed_*`, `semantics_local_*`, `rehearse_local_*`, `golden_*`).

| Requirement | Status | Result / evidence |
|---|---|---|
| **A committed workflow** — synthetic rows committed, verified from a second connection, deleted by id (`scripts/committed-workflow.js`) | **ran** | `COMMITTED WORKFLOW OK`, 10 of 10: a row is invisible to a second connection before COMMIT and visible after; 14 synthetic rows in 12 tables, one committed transaction each, all visible by id from the second connection, with the API's types (DATE `'2026-12-31'` / `'2026-12-30'` / `'2027-01-04'` as strings, numeric `'15.00'`, the 0/1 flags as numbers, `created_at` a Date, enums as text) and their joins resolving; deleted by id children first; none remains from the second connection, and no sequence moved back, so no deleted id is handed out again |
| **The sequence-rollback test** — a real `transfer.js` failed after its sequence step (`scripts/sequence-rollback.js`) | **ran** | a DEFERRED constraint trigger planted for the run made the transfer fail at COMMIT, after all 26 tables were copied and all 25 sequences set: **every row and the TRUNCATE were rolled back (26 of 26 tables as they were) and every `setval()` SURVIVED** (25 of 25 at the source's AUTO_INCREMENT; 13 moved, 2 of them backwards, and `login_attempts` left at or below its own highest id — the next insert there would have collided). The trigger was removed and asserted gone; the next, successful transfer reset every sequence (`RECONCILE OK`). **So `transfer.js`'s "nothing changes (ROLLBACK)" holds for rows and not for sequences: after a failed transfer the target must not be used until a transfer succeeds** (`03` §5) |
| …and a first, unplanned failure of the same test | **ran** | the first attempt failed earlier, at `attendance`: `AUTO_INCREMENT … is not above MAX(id)`. MySQL 8 caches `information_schema.TABLES.AUTO_INCREMENT` (the statistics expiry), so right after the DATE rows went in the transfer read a stale figure; its guard refused, and the rows and the six sequences set before it behaved as above (rolled back / survived). `ANALYZE TABLE` on the three scratch tables refreshed it. **The same can happen on the live database at cutover after any write in the last day** — `03` §5 carries the fix (`information_schema_stats_expiry = 0` on the transfer's read session), not made here |
| **The three rehearsal expectations**, original and corrected | **recorded** | below, §3b. Josh is asked to confirm these are his three |
| **Populated DATE fields through the API, under UTC and UTC+8** | **ran** | `test:grades` writes a component's `date_recorded` on the year boundary (`2026-12-31`, `2027-01-01`) and reads it back from the write and from `GET /:id`: **258/258 with the API under `TZ=UTC` and 258/258 under `TZ=Asia/Manila`** (Node reported offsets 0 and −480); the golden master's scratch carries DATE rows too |
| **The search fold (Q5) re-measured against the staging results** | **ran** | `semantics.js` section G, local against the new MySQL scratch: config/db.js's fold equals `utf8mb4_unicode_ci LIKE` on the seven case and Latin-accent pairs (`nino`→Niño, `jose`→JOSÉ, `JOSÉ`→jose, `ma. cris`, `PENAFLOR`→Peñaflor, `ñ`→Ñoño, `ána`→Ana) and on the no-match control; measured divergences: `lukasz`→Łukasz the fold finds and MySQL does not; full-width `Ａｎａ` and `İsmail` MySQL finds and the fold does not; `strasse`→straße neither; NFD José both. The cluster-dependent half (NFC + ICU `lower()`) hashed over the 13 probes is **identical on the local cluster (17.10, ICU collversion 153.14) and on the hosted one (17.11, 153.121)**, read through the read-only MCP (a SELECT on literals, no table) |
| **The golden master (Q7)** — the unported API (`5426b70`, a `git archive` export outside every tree, on 5030 against the MySQL scratch, file mail and SMS) and the ported API (5010, the PostgreSQL copy), the same requests in the same order, diffed by JSON path and type only | **ran** | §3c |

### 3b. The three rehearsal expectations — original and corrected

Git holds only the corrected versions, so each original is reconstructed from its check's name and comment (`scripts/rehearse.js` now carries the note at each); **Josh is asked to confirm these are his three.** All three PASS in their corrected form (2026-10-25, `REHEARSAL OK`).

| # | Check (`rehearse.js`) | Original expectation | Corrected | Basis |
|---|---|---|---|---|
| 1 | the sign-in throttle prune (`:135–137`) | the 24-hour prune removes **nothing** — the run's own five failures are minutes old | it removes **exactly the stale rows counted just before it**, and the run's five remain | the copied data holds real `login_attempts` older than a day, so "nothing" was a fact about an empty database, not about the statement |
| 2 | the accent-gap probe (`:197–202`) | an ASCII term finds **no** learner (MySQL's accent folding is gone) — searched over the whole roster | the same expectation, **scoped to the synthetic learner** (`AND s.id = $3`) | a seeded learner's ASCII name matched the term, so the unscoped probe measured the roster, not the gap |
| 3 | the login-id `ILIKE` count with an explicit collation (`:209–215`) | **3** — one per synthetic account | **2** | only two of the three synthetic login ids carry the hyphen the pattern asks for |

### 3c. The golden master (2026-10-25)

**84 requests** (the second run; the first, 85, also accepted the parent's notice and terms on both sides): `GET /api/health` and `/api/settings/public` with no token; for the admin, a teacher and a parent — the seeded accounts, their default passwords read from `setup-db.js` at run time — the sign-in, `/auth/me`, and every read route of their role (users, students, sections, subjects, assignments, grades list / `:id` / student / class record / class summary, grading modes, attendance list / student / summary, announcements, memos, events, excuse letters, settings, backups, messages, notifications, dashboard, policy, activity log). Ids came from A's answers. The seeded parent's contact step was done the same way on both sides first (`golden-master.js confirm-parent`: one `.invalid` address marked confirmed in the scratch and in the copy), so the parent's requests reached their routes.

- **46 the same** by status, content type, path and type — **every endpoint whose route is ported**: auth, users, students, sections, subjects, assignments, every grades read (the parent's report card included), the three dashboards, notifications and unread counts, policy. No type differs on any ported path.
- **37 differ, one cause: the route is not ported yet** — requests to `settings`, `gradingModes`, `attendance`, `content` (announcements, memos, events), `excuses`, `messages` and `activityLogs`, across the three roles: 200 on MySQL, 500 on PostgreSQL. Each is a file of Session A's half (`03` §5a) whose reads still destructure mysql2's `[rows]` tuple — 81 such sites in exactly those seven files and none elsewhere.
- **1 differs by design:** `GET /api/backups` — the PostgreSQL side adds `engine` and `format` to every row (commit 6), and its `orphaned_files` is non-empty because the worktree's `server/backups/` holds the 14 rehearsal archives kept until the merge (the export's directory is empty).

The golden master is to be re-run when Session A's half lands; on this evidence the remaining 37 should become the same.

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
