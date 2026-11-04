# 09 — Integration acceptance (P3-C-R2 Phase K, 2026-10-25)

**Scope:** the local Phase 3 work on `migrate/postgres-prep` — the ported API
on the embedded PostgreSQL 17 cluster (54329), measured against the MySQL code
it was ported from (`main` `64200f7`). **Not in scope:** the hosted Supabase
project (Phase L, which waits for the owner's go). Every figure below was
measured on 2026-10-25; the runs are `05` §0b–§0i. **Since 2026-10-26:** the
owner's answers and the fix round are §5, Phase L on staging is §6.

**Verdict: local Phase 3 is complete**, with one item NOT RUN (mobile) and
four decisions that are the owner's (§3). Nothing below blocks Phase L's
non-destructive hosted checks.

## 1. The twelve criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | All intended application routes ported | **met** | every file in `server/routes/` and the utilities they call read pg's `{ rows, rowCount }`; no `[rows]` tuple, `insertId`, `affectedRows`, `getConnection`, `GROUP_CONCAT` or `_ci` LIKE remains (`03` §2, `05` §0f) |
| 2 | No unexplained MySQL runtime dependencies | **met** | no route, utility, middleware, config, suite fixture or client file requires `mysql2`; its requirers are the eleven `migrate-*.js` (MySQL history, documented, not run — `03` §5 step 7) and `migration/lib/mysql.js` (the transfer's read of its MySQL source). `mysql2` stays in `server/package.json` for those two and the golden master |
| 3 | No unresolved critical authorization failures | **met** | `test:auth` 69, `test:auth-middleware` 52, `test:socket-auth` 51, `test:privacy` 85, `test:recovery` 143 at their figures; the golden master's 87 requests across the three roles: the same statuses, the gates included (`05` §0g) |
| 4 | Successful committed database operations | **met** | `committed-workflow.js` (commit 7); the golden master's 28 writes committed on both sides with equal ids and equal values (`05` §0g); every HTTP suite's writes and cleanups (`05` §0i) |
| 5 | Correct rollback behaviour | **met** | `transfer-failures.js` — six failure points, rows and the 25 sequences unchanged (`05` §0d, re-run §0h); `restore-commit-drop.js`, the before leg: aborted, nothing moved (§0h); the excuse review's lost race rolls back whole (`test:excuses` 121, `test:excuse-attendance-rule` 60) |
| 6 | Safe sequence allocation | **met** | C1 and C2 closed (`05` §0d); the archive manifest's sequence reading fixed (14 of 25 wrong → 0 of 25, §0h); the golden master's new ids equal on both sides; `restore-e2e.js`: no sequence backwards |
| 7 | Successful and failed restore verification | **met** | `restore-e2e.js` — a real restore through the API on a disposable database (200, the old session 401, the catalog kept + its safety archive, every count as it was); `restore-commit-drop.js` (a COMMIT lost after and before the server); `test:restore` 39 (MySQL-era, incomplete, corrupt and mismatched archives refused before any write); `backup-during-restore.js` (an archive made during a restore waits and holds every row) |
| 8 | Consistent API response contracts | **met** | the golden master: 86 of 87 the same by path and type (the 87th by design, `/api/backups`); 53 reads the same by value and array order (`05` §0g) |
| 9 | Acceptable golden-master results | **met** | every difference classified: `/api/backups` by design (`04`); the int4 cap's two 400s documented (`05` §0f) and confirmed by the owner (§3); the name sort measured — it differs only among names MySQL treats as equal, and `COLLATE portal.ci` reproduces MySQL exactly (`05` §0g); the owner kept the database default (D-2, §3) |
| 10 | Complete applicable regression execution | **met; one item NOT RUN** | 33 suites, `verify:grading-seed`, the client's oxlint / tokens / contrast / build and its one affected render proof at their figures, the browser smoke 20/20 (`05` §0i); **mobile NOT RUN** — no mobile file differs from `main` and the worktree has no mobile dependencies |
| 11 | Preserved source systems | **met** | the main tree, its server on 5000 and the live `parents_portal` were not touched (nothing listened on 5000, 3000, 5001 or 3001 when checked); the MySQL side was read through `lib/mysql.js` READ ONLY sessions and written only in `parents_portal_migsrc_*` scratches and one disposable `parents_portal_migtest_*` (dropped); the smoke fixture's mysql2 default — which would have reached the live database — was ported before any sweep (`05` §0i) |
| 12 | Recorded remaining hosted dependencies | **met** | `06` (staging), `07` (cutover and rollback), `08` §5 (the owner's decisions); Phase L run 2026-10-25/26 without the phone (§6, `06` §4 item 15) |

## 2. Defects found and closed in this dispatch

| Defect | Where | Closed by |
|---|---|---|
| C1 — a stale AUTO_INCREMENT could set a sequence below MySQL's ids | `migration/lib/mysql.js` | fresh statistics per session (`05` §0d) |
| C2 — a failed transfer kept its `setval()`s | `migration/scripts/transfer.js` | transactional `ALTER SEQUENCE … START WITH n RESTART` (`05` §0d, §0h) |
| driver-1 / driver-2 — an unhandled client error; no connect timeout | `server/config/db.js` | `guardClient`, 10 s (`05` §0e) |
| auth-1 / auth-2 — NUL in a login id; a case-only email edit | `routes/auth.js`, `routes/users.js` | `05` §0e |
| the excuse review waited forever on a row lock | `utils/excuseAttendance.js` | `lock_timeout` 50 s, `55P03` a conflict (`05` §0f) |
| grades-1 — legacy components sorted last | `routes/grades.js` | `NULLS FIRST` (`05` §0f) |
| ids past int4 crashed `canMessage()` / answered 500 | `utils/validateId.js` | `MAX_ID` (a documented 400) |
| backup-1 — an archive made during a restore came out empty and valid | `utils/backupArchive.js` | ACCESS SHARE locks before the snapshot (`05` §0h) |
| backup-2 — a lost COMMIT reported as a rollback | `utils/backupArchive.js`, `routes/backups.js` | transactional sequences; `pg_xact_status` (`05` §0h) |
| backup-3 — the RESTORE_RUNNING refusal not logged | `routes/backups.js` | logged (`05` §0h) |
| the archive manifest's sequences read 1 after a transfer | `transfer.js`, `backupArchive.js` | `START WITH` (`05` §0h) |
| the smoke's fixture opened mysql2 (the live database by default) | `client/e2e/auth.js` | the suites' pg helper (`05` §0i) |

## 3. Decisions that are the owner's (none blocks Phase L)

1. **D-2** — the name sort: `COLLATE portal.ci` (MySQL's order, measured) or the database collation.
   **Answered 2026-10-25: the database collation; the different tie order is
   accepted (D-135 Q5, reaffirmed in D-141); `COLLATE portal.ci` is not
   applied.** The measurement and the option not taken: `02` §E, D-2.
2. **The int4 cap** — 400 above 2,147,483,647 (implemented) or the old per-route answers.
   **Answered 2026-10-25 (D-141): confirmed — an id above 2,147,483,647
   answers 400** (`02` §E).
3. **NUL in text, the 64 KB TEXT cap, impossible dates in filters** — refuse / keep.
   **Answered 2026-10-25 (D-141, with the golden master's 23 affected
   requests): refuse all three at the request boundary (MySQL's 64 KB cap kept
   on the same fields) — built, §5.**
4. **`test:students`' vacuous assertion** — a one-line fix on `main` (`08` §3).
   **Answered 2026-10-25: fixed on this branch (it reaches `main` with the
   cutover merge) — §5.**

## 4. Known limitations of the evidence

- The lost-COMMIT proof's first run reported a row-count change in its committed
  leg without naming the table; two later runs naming the tables showed none
  (`05` §0h). Not explained. **Explained and classified 2026-10-25 (§5 item 6):
  a test defect — the cutoff row a first restore creates.**
- The browser smoke never interacts (its own rule); a write flow on screen is
  the owner's device check.
- Everything here ran on the local cluster (ICU `en-US` default collation, PG
  17.10). The hosted project's version, collation and network are Phase L's.

## 5. The owner's answers and the fix round (2026-10-25/26)

The owner answered §3 on 2026-10-25: D-2 kept (the database collation; D-135
Q5, reaffirmed in D-141), the int4 cap confirmed (D-141), NUL / the 64 KB cap / impossible dates in filters refused at
the request boundary, `test:students` fixed on this branch, the lost-COMMIT
proof run ten times. One commit per item, each with its tests:

| # | Item | Commit | What it is | Its proof |
|---|---|---|---|---|
| 1 | D-2 and the int4 cap | `b347afc` | recorded in `02` §E (the measurement and the option not taken); no code | — |
| 2 | NUL refused | `c41eabf` | `server/utils/requestLimits.js` `refuseNul`, mounted first on all 20 routers (17 route files): a NUL in the body (keys and values, any depth, iteratively), the query or the address is `400`, naming the field only when its path is a plain name, before `authenticate` | `test:content` +10; the in-memory mutant (refuseNul passing everything) fails exactly those 8 NUL assertions — title, content and the query come back `500` (PostgreSQL's 22021), the ignored fields `201` |
| 3 | the 64 KB cap | `744b626` | `textTooLong` (65,535 UTF-8 bytes, on the value as stored) on the nine request-writable former TEXT fields (`02` §B) | at the limit and one byte past, in ASCII and in two-byte é: `test:content` +18, `test:messages` +5, `test:excuses` +8, `test:settings` +3, `test:auth` +2; the mutant fails exactly the past-limit assertions and their cascades (PostgreSQL stores the value: `201` / `200`) |
| 4 | impossible dates in filters | `f9b3461` | `isCalendarDate` (Gregorian, years 0001–9999) at the eleven filter sites | five real days (leap days, year 0001) `200` and eight impossible ones `400` per site: `test:attendance` +14, `test:excuses` +4, `test:content` +4; the mutant fails exactly the 11 impossible-day assertions (`500`, the 22008); agreement with PostgreSQL's `::date` on 5,082 boundary values (11 years × months 00–13 × days 00–32): 0 disagreements, 3,652 real days |
| 5 | `test:students`' vacuous check | `6ce6920` | the `LIKE` pattern follows the route's template (`%student #<id> to %`), plus a guard that the counter sees the run's own deactivation | `98/98` (+1); against an in-memory route that logs on a no-op, the HEAD version passes 97/97 (vacuous) and the fixed one fails exactly "That no-op writes no update_student_status entry" |
| 6 | the lost-COMMIT proof's row-count change | `3fac5d4` | **classified: a TEST defect.** A database never restored has no `auth_security_state` row (a fresh setup; MySQL's schema never seeded one either), and the committed restore creates it while writing the cutoff — `0 -> 1`, the "row count changed" of the first run against every new database | ten runs on `parents_portal_fixround_20261025` with the tables named: run 1 (right after the regression, the database's first restore) `auth_security_state 0 -> 1`, runs 2–10 `RESTORE COMMIT DROP OK`; reproduced on demand by deleting the row; the proof now checks that row on its own (unchanged after the aborted leg, exactly `[1]` after the committed one): OK at `0 -> 1` and at `1 -> 1`, and `--mutant setval` still fails the before leg |

**Deleted:** `client/e2e-out` (git-ignored), and the eight local databases
`parents_portal_phasef_20261025`, `_phasej_`, `_reconstruct_` (+`b`),
`_rehearse_`, `_restore_` and `_setup_` (+`b`) — each with no connection,
listed before and after. Kept: `parents_portal_pg`, and the MySQL scratch
`parents_portal_migsrc_20261025_140024`; the two older MySQL scratches stay for
the owner. **Created for this round:** `parents_portal_fixround_20261025` (local,
disposable).

**After the last code edit, on a fresh `db:setup` of
`parents_portal_fixround_20261025`, one command per suite, the API on 5010 with
file mail and file SMS:** the nine units at their figures (sanitize 9,
grade-computation 77, pg-driver 33, school-calendar 34, cors-origins 44,
auth-middleware 52, socket-auth 51, sms-transport 94, excuse-attendance-rule
60); the 23 HTTP suites — auth **71**, students **98**, sections 30,
assignments 62, grading-modes 13, grades 258, attendance **87**, content
**129**, settings **38**, users 73, backups 63 (`FAIL_PORT=5030`), messages
**91**, restore 39, excuses **133**, notifications 227, dashboard 78,
class-record 132, class-summary 59, grade-locks 51, grade-acknowledgements 62,
recovery 143, profile-photo 70, activity-log 98 — 0 failed, exit 0 (bold: the
new figures); `test:privacy` **85/85** on the transfer copy. **The browser
smoke, 20/20 (5.8 min)** on Vite 3010 and the API 5010 against another fresh
setup of the same database; afterwards acceptances, confirmed contacts,
notifications and codes at 0 and the login rows +25, the recorded figure.

**The golden master, re-run** (the copy re-transferred from the scratch, READY;
A = `main` `64200f7` on 5030, B = this branch on 5010): `compare` 84 requests,
83 the same, 1 by design (`/api/backups`); `golden-values` 90 requests, 86 the
same, 4 known (the int4 cap's two `400`s, the D-2 tie order asc and desc),
0 rows left on either side; **the affected requests** (D-141; a scratchpad
probe, 23 requests — NUL ×5, the cap ×10 with two at-the-limit controls, dates ×6 with
two controls), 23 as measured, 0 rows left. **It corrected one record:** `05`
§0f said MySQL answered an impossible date in a filter with an empty `200`; it
answers **`500`** (strict mode refuses the comparison) for every case but a
year-0000 day (`200`). The new `400` improves on both engines rather than
restoring MySQL's answer. `05` §0f's line, `05` §0f's "this branch does not
change it" for `test:students` and `08`'s matching proposals are superseded by
this section (both files are outside this round's whitelist).
`migration/scripts/port-review-fixes.js`'s NUL sign-in expectation (`401`) is
superseded too: a NUL login id is now the boundary's `400`.

## 6. Phase L on staging — without the phone (2026-10-25/26)

The full record is `06` §4 item 15. In one line each:

| Step | Result |
|---|---|
| a. staging's schema vs `001` + `003` (read-only) | **IDENTICAL** in all 14 catalog categories; only the ICU collation version differs (platform); the comparator's negative control found its 3 planted differences; nothing applied |
| b. 06's checks, re-run | identity, PostgreSQL 17.11, ICU (854), both roles (no superuser, no BYPASSRLS), TLS verify-full, the session pooler, RLS 26/26 with 0 forced and no Data API access — all as recorded; `RLS CHECK OK`; **the clock had drifted to +2,906 ms** (the owner synced it: +1 ms); new facts: `statement_timeout` 2 min, no server-side idle timeouts, the default collation ICU `en-US` (D-2's accepted tie order, as locally) |
| c. the API on staging | `migration/scripts/staging-api.js` (new): `portal_app` through the pooler, settings from `supabase.env` in memory, file mail and SMS; health 200 `db ok`, public settings 200, no write |
| d. the browser smoke | **20/20 (8.7 min)** — after the owner's scoped exception in `server/scripts/test-helpers/db.js` (`PORTAL_FIXTURE_HOSTED=staging-smoke` in the smoke's process only, the pooler host, verify-full) and its negative test `scripts/test-fixture-guard.js` **10/10** (its flag-removal mutant fails exactly the 2 flag cases); the read-only counts by role before and after the teardown **match**; the admin Backups page in a browser at 1280 and 390 px: MySQL-era rows labelled "MySQL", the archives "PostgreSQL", 0 console errors, 0 failed requests |
| e. Backup & Restore on staging | **`STAGING RESTORE OK`**: every refusal before a write (409 MySQL-era, 400 / 403 / 400), one backup (201; the manifest checked against its checksums and the live counts), one restore (200): the safety archive, the old session 401, a new sign-in 200 at once, the cutoff moved, no sequence backwards, every table at the manifest's count; the hosted roles allowed every statement the archive and the restore make, and refused nothing they need. The admin's two `draft-2` acceptances left in place (the owner) |
| f. | the local cluster, the API and Vite stopped; nothing listening on the session's or the forbidden ports |

### 6a. What the phone smoke needs from the owner (not run — the dispatch stops before it)

The phone runs **Expo Go (SDK 57)** against the ported API on this laptop,
which talks to staging. No mobile file differs from `main` on this branch,
and this worktree has no mobile dependencies, so Expo runs from `mobile/` in
the tree of the owner's choice (the main tree's `mobile/` is the same code;
this worktree needs `npm ci` in `mobile/` first).

1. **The API on staging, reachable from the hotspot:** in this worktree,
   `cd migration` then `node scripts/staging-api.js`. The preflight must show
   the clock skew under one second (resync Windows first if not). It listens
   on all interfaces, port **5010**; the Windows firewall needs the
   program-level Allow for `node.exe` on the **Public** profile
   (`docs/MOBILE_CONVENTIONS.md` M5 — a hotspot is Public).
2. **The laptop's IPv4 on the hotspot:** `ipconfig` (the hotspot adapter's
   IPv4 address, e.g. `192.168.43.x`).
3. **The proof order (M5):** the phone's Chrome opens
   `http://<laptop-ip>:5010/api/health` and shows `"db":"ok"` **first**.
4. **The Expo bundle's one env line**, in `mobile/.env` (git-ignored):
   `EXPO_PUBLIC_API_URL=http://<laptop-ip>:5010/api` — then
   `npx expo start --clear` (M7: `--clear` after any change to that line or a
   checkout; Expo inlines it at bundle time). Reload by cold boot, never `r`.
5. **CORS:** none is needed for the Expo app (a native request carries no
   `Origin`; Socket.io's handshake likewise). Only the phone's **Chrome**
   against the web client would need its origin listed — the launcher allows
   `http://localhost:3010` alone, so a phone-Chrome pass of the web would add
   `http://<laptop-ip>:3010` (a launcher change, not made here).
6. **The accounts:** on staging every account meets the consent screen
   (draft-2; the admin has accepted since step e), and the three parents have
   no confirmed contact — on the phone they land on Confirm contact, whose
   code goes to the API's file transports on the laptop
   (`MAIL_TRANSPORT=file`, `SMS_TRANSPORT=file`), never to a real inbox.
   Whatever the phone pass accepts or confirms stays on staging until the
   cutover reload unless it is put back by hand.

### 6b. What the cutover needs

`07` is the procedure (freeze → load → switch → after); what this round adds
to it, and what is still open:

1. **The owner's go** for the window, and the hosting decision (`CLAUDE.md`
   BUILD ORDER: hosting last).
2. **`07` Phase 1–2 as written:** the API stopped (the write freeze), the final
   `snapshot` → `snapshot:restore-check`; then `pg:schema --target staging`
   on an **empty** schema — the rehearsal data this phase left (the admin's two
   `draft-2` acceptances, the 2 archive rows, the extra log rows) goes when the
   owner drops the schema as `portal_migrate` with
   `scripts/drop-staging-schema.js --target staging` (`07` Phase 2), since
   `--drop-first` is refused for staging (D-65); then `transfer` and `reconcile` (`RECONCILE
   OK`, `grown=0`). The schema to apply is the one compared IDENTICAL in §6.
3. **The API host's clock** measured against the database (`06` item 4) —
   under one second, fixed on the host otherwise. It drifted to 2.9 s on this
   laptop within a day of a sync; the launcher's preflight prints it.
4. **The application host's settings** (`06` §3, `07` Phase 3): `PG_HOST` /
   `PG_PORT` / `PG_DATABASE` / `PG_USER` / `PG_PASSWORD` (portal_app, the
   session pooler), `PG_MIGRATE_USER` / `PG_MIGRATE_PASSWORD` (portal_migrate,
   the restore), `PG_SSL=verify-full` with `PG_CA_FILE`, the **same
   `JWT_SECRET`**, `trust proxy` if behind a load balancer, `CORS_ORIGIN`,
   and the real mail and SMS transports. `staging-api.js` shows the set; it
   is not the production launcher.
5. **`07` Phase 3's smoke** — now proven possible on the hosted target: the
   browser smoke through `staging-api.js --smoke`'s flag (§6 d) and Backup &
   Restore through the API (§6 e). After the cutover the web smoke runs
   against the owner's own 5000 / 3000 through `staging-api.js --smoke-live`
   (the owner's Q8 (b)), and the email and SMS codes are checked as `07`
   Phase 3 item 5 says (the owner's Q3).
6. **Still open in `06` §4:** item 6 (the pooler's own idle limit) and item 12
   (the plan's backup cadence and PITR); and the phone pass (§6a).
7. **The merge** of `migrate/postgres-prep`, with `08`'s context-sync
   proposals applied then, plus this round's: `test:fixture-guard` (10) and
   the new suite figures for `docs/TESTING.md`; the `test:students` KNOWN
   ISSUES proposal (`08` §3) is closed by §5 item 5; `02` §B's four refusals
   for `docs/API_REFERENCE.md`.
8. **After the cutover:** the old MySQL scratches dropped by the owner by
   hand; this worktree's two staging archives in `server/backups/` (copied
   live records) kept or removed by the owner.

## 7. The pre-merge gate and its follow-up (2026-10-26)

### 7a. The gate (the cutover plan's step 7, at `47290ae`)

Local only, on a fresh `db:setup` of `parents_portal_fixround_20261025`, one
command per suite, the API on 5010 with file mail and file SMS. **At their
baselines:** `verify:grading-seed` 55; the ten units (sanitize 9,
grade-computation 77, pg-driver 33, school-calendar 34, cors-origins 44,
auth-middleware 52, socket-auth 51, sms-transport 94, excuse-attendance-rule
60, fixture-guard 10); the 23 HTTP suites at §5's figures; `test:privacy` 85
and `rehearse.js` `REHEARSAL OK` (95 cases, its MySQL leg read-only and
equal) on `parents_portal_pg`; `committed-workflow` OK (10);
`backup-during-restore` OK and `restore-commit-drop` OK, each mutant failing
as it must; `proof:backups` 10 of 10 complete, 0 resets; the source-zip proof
24; oxlint 40 warnings / 0 errors (no `no-undef`), `lint:tokens` 0,
`lint:contrast` 0 unwaived, `npm run build` exit 0; 34 of the 35 SSR proofs
with their run-books; `smoke:isolated` 20/20. Mobile not run (no mobile file
differs from `main`; no mobile dependencies in the worktree). The new tests:
`test-drop-staging-schema.js` 31/31 and `test-smoke-live.js` 7/7, 9/9 with
`--e2e`. **Two red, closed in §7b:** `restore-e2e` (the cutoff row 0 → 1 on a
first restore; a re-run passed) and `ssr-visit-clear` 18/20. **Not run, by
the dispatch:** the golden master, `semantics`, `component-order` (each
writes to a MySQL scratch), `transfer-failures` and `sequence-rollback` —
and the fix round's scratch `parents_portal_migsrc_20261025_140024` no longer
transfers: a NUL byte (0x00) in `activity_logs`, written there by the fix
round's own affected-requests probe (MySQL accepted the NUL requests, `02`
§B). The transfer rolled back; the scratch is left for the owner's step 13.

### 7b. The follow-up (the owner's approval of 2026-10-26)

**Today's live data transfers cleanly.** `npm run snapshot` and
`npm run snapshot:restore-check` (the live `parents_portal` only read): two
dumps, `source_parents_portal_20261026_105453.sql` and
`source_parents_portal_20261026_105509.sql` (each 2,887,283 bytes, 26
`CREATE TABLE`, the footer present; manifests `snapshot_20261026_105453.json`
and `snapshot_20261026_105509.json`) — the restore-check makes its own dump,
so the second is the one loaded — and the new scratch
**`parents_portal_migsrc_20261026_105509`**, 26 of 26 equal (counts,
AUTO_INCREMENT, `CHECKSUM TABLE`). A rehearsal, not the cutover's snapshot;
both dumps and both scratches stay for step 13. Transferred into
`parents_portal_pg` (`--truncate`): **COMMITTED, READY**, 25 sequences at the
source's AUTO_INCREMENT, no NUL anywhere (`activity_logs` 31,807 rows);
**`RECONCILE OK`**, 26 tables, `grown=0`, every sequence equal; then
`test:privacy` **85/85** on it.

**The proofs not run: where each last passed, and what changed since** (`git
diff --stat <commit> 47290ae`, one range each; read-only, nothing run):

| Proof | Last passed | Its dependencies changed by `47290ae`? |
|---|---|---|
| The golden master — `compare`, `golden-values` (reads, the 33 writes, the four known differences), the affected-requests probe | the fix round, on the tree of `3fac5d4`, recorded in `3382f7b` (§5) | **No.** 14 files changed, none it uses: no application file (`server/` routes, utils, config, middleware, `server.js`, `socket.js`, `policy/`, the schema), and `golden-master.js`, `golden-values.js` and `migration/lib/` unchanged. The three server-side changes are `package.json` (the `test:fixture-guard` alias), `scripts/test-fixture-guard.js` (new) and `scripts/test-helpers/db.js` (the hosted-smoke flag), which no golden-master script loads (0 references); the rest are docs and the new launcher, drop and test scripts |
| `semantics.js` | Phase 3 commit 7, `61ffb44` (`05` §0c) | **Two dependencies changed; neither affects a measured case.** `migration/lib/mysql.js` (`63b70fb`, Phase C): every MySQL session — the `scratch()` connection `semantics` opens included — now sets `information_schema_stats_expiry = 0` and reads it back; `semantics` reads no table statistics or AUTO_INCREMENT. `server/config/db.js` (`80adb7f`, Phases D–E): a 10 s connect timeout and `guardClient` on checked-out clients; the name fold section G measures (`foldText`, `foldedSql`, `foldedContains`) is unchanged. `semantics.js`, `lib/pg.js`, `lib/env.js` and `lib/paths.js` unchanged |
| `component-order.js` | Phase F, `b97849b` (`05` §0f) | **One dependency changed, not the statement it compares.** `server/routes/grades.js` gained only the `refuseNul` import and its `router.use` (`c41eabf`); the `GET /grades/:id` components statement and its `NULLS FIRST` are unchanged. `component-order.js`, `config/db.js` and `migration/lib/` unchanged; `transfer.js` changed (`7ed1f1c`, sequences only), and the proof's descriptors carry no sequence-made id |
| `transfer-failures.js` | Phase H's re-run, `7ed1f1c` (`05` §0h) | **No.** `transfer-failures.js`, `transfer.js`, `reconcile.js`, `migration/lib/` and the schema unchanged |
| `sequence-rollback.js` | Phase C, `63b70fb` (`05` §0d, 0 of 25 moved) | **One dependency changed, and its claim was re-proved after it.** `transfer.js` changed once (`7ed1f1c`, Phase H: `ALTER SEQUENCE … START WITH n RESTART`, so an uncalled sequence archives its real value); `transfer-failures.js`' trigger-at-COMMIT case — the same scenario — passed at `7ed1f1c` with every sequence unchanged. `sequence-rollback.js` and `migration/lib/` unchanged |

**The two red items of §7a, fixed (test files only):**
- `migration/scripts/restore-e2e.js` (`bb6a0ba`) checks the cutoff row on its
  own, as `restore-commit-drop.js` does since `3fac5d4`: `auth_security_state`
  is out of the row-count comparison and must be exactly `[1]` after the
  restore. On a fresh `db:setup`, the first run: **`RESTORE E2E OK`**,
  `auth_security_state` 0 → 1, `[1]`.
- `client/scripts/ssr-visit-clear.jsx` (`cdafb8d`): its two static checks of
  `server/routes/notifications.js` follow the ported text — the mark-all-read
  with `portal.now_s()` and `result.rowCount`, and the no-ids skip before an
  UPDATE on `id = ANY(?::int[])` — and each still fails its in-memory mutant.
  **20/20** (18/20 since the Phase F port). `notifications.js` unchanged, so
  `test:notifications` (227) needed no re-run.

## 8. The cutover (2026-10-26/27) — the owner's GO, D-157

**The application runs on PostgreSQL (Supabase) since 2026-10-27; MySQL is
the disconnected fallback (D-66).** Part B of the plan of 2026-10-26 01:53,
steps 1–6 and 8–12 as approved in D-147; step 7 was the gate at `47290ae`
with the two test fixes at `0364c1e` (§7). Josh reviews the GO/NO-GO report
afterwards; it did not hold the run.

| Step | Result |
|---|---|
| 1 | main clean at `64200f7`; `staging-api.js --check`: TLS verify-full, both roles, RLS 26/26, clock skew +172 ms |
| 2 | the last MySQL write: the app backup, row **390** (`parents_portal_2026-10-27_002329.sql`, 2,863,317 bytes, footer) — the pre-cutover dump; the restore point stays **376**. MySQL API, web and Expo stopped; no listener on 5000, 3000, 5001, 3001, 8081 |
| 3 | `snapshot`: `source_parents_portal_20261027_002732.sql` (2,887,674 bytes, 26 tables, footer), kept (D-19); `snapshot:restore-check`: its own dump `source_parents_portal_20261027_002828.sql`, scratch **`parents_portal_migsrc_20261027_002828`**, 26 of 26 equal |
| 4 | the owner ran `drop-staging-schema.js --target staging` after the planning chat's approval of its survey and statement: `portal schemas: 0`, both roles and their settings unchanged; confirmed by a read-only query |
| 5 | `pg:schema`: COUNTS 26 / 86 / 35 / 15 / 25 / 26 / 13 / 7 / 25, POLICIES as `06` item 7; `rls:check`: `RLS CHECK OK`; `transfer` from the scratch: READY, 26 tables, 25 sequences; `reconcile`: **`RECONCILE OK`**, 26 tables, `grown=0`, every sequence equal (D-67 check 1); the schema comparator: **IDENTICAL** |
| 6 | tag `mysql-fallback-64200f7` (annotated, on `64200f7`), pushed |
| 8 | main fast-forwarded `64200f7..0364c1e`; `npm ci` in `server/` (153 packages; npm reports 7 known dependency vulnerabilities, left for after 2026-10-30) |
| 9 | `server/.env` copied to `server/.env.mysql.local` by the owner; the nine `PG_*` keys `config/db.js` reads written once each from `supabase.env` by a script (the owner's scope addition; names and counts only printed), `PG_OWNER_URL` and the two role passwords' keys removed from it; mail stays real (`MAIL_TRANSPORT` absent = SMTP) |
| 10 | clock skew +204 ms; health on 5000 `db ok`; `staging-api.js --smoke-live` (5000 / 3000): **20/20** (8.6 min), the counts by role **MATCH**, login rows +25 (D-67 check 2, web) |
| 11 | the owner's short ★ phone check on the Tecno against `http://<hotspot IPv4>:5000/api`: **PASS** — sign-ins (the admin, Lito Bautista with the draft-2 consent, #7), Lito's attendance for Nino shown on #7's dashboard, the live toast and badge, the real email code (Ana Reyes, Forgot password) and the real SMS code (Lito Bautista, Forgot password via SMSGate), no code entered and no reset |
| 12 | **the owner's go (D-67 check 3)**, 2026-10-27 about 02:00 Manila — the end of the smoke window (`07` Phase 4); `DB_*` removed from `server/.env` by a script (the `.local` copy keeps them), the API restarted: health `db ok`; MySQL80 set to Manual and stopped (D-66, D-147 Q9) |

**Waits until after the weekly reset (2026-10-30):** step 13 (the D-122
activity reset, a backup on Supabase as the new restore point, the cleanup
list of the plan), the Part C docs pass except its items 1–2 (done in
`CLAUDE.md` with this record), the idle measurement (`06` §4 item 6), the
`server/.env` `SMS_GATEWAY_*` duplicate cleanup (D-117), and the npm
vulnerabilities above. **Rollback from here is forward-fix on PostgreSQL**;
`mysql-fallback-64200f7`, `server/.env.mysql.local` and backup 390 remain
the documented way back (`07`).

**Status, 2026-11-04 (M16):** step 13's reset ran on production on 2026-11-03,
and backup H is the restore point (`docs/ACTIVITY_RESET.md` → The run). The
`SMS_GATEWAY_*` duplicate cleanup is `a4a04a8` (2026-10-28), and the server's
npm audit is 0 since Module 3 (2026-10-30, `docs/CHANGELOG.md`). The Part C
docs pass, the idle measurement and the plan's cleanup list are not re-checked
here.
