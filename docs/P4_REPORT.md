# P4 — the consolidated engineering report (Part A and Part B)

**For:** Josh (P4, the two-part plan approved 2026-10-27, D-167). **Prepared:** 2026-11-06,
by Claude Code on the owner's approval D-261, branch `feature/p4-part-b`. **Owner:** Darryl
Candilada. **Final defense:** 2026-11-11 to 2026-11-13.

**Scope, in Josh's words:** Part A — hosted production acceptance, read-only by default.
Part B — "Use a separate, disposable local PostgreSQL database. Conduct the remaining
concurrency, transaction rollback, database disconnection/reconnection, sequence integrity,
backup restoration, corrupted archive, and failure-injection tests. Verify successful and
failed operations through independent database observations. Ensure the local test
environment cannot connect to production credentials or endpoints."

**Two kinds of evidence, kept apart.** §2 holds PRODUCTION OBSERVATIONS: what the owner did on
the hosted system and what was recorded, with who recorded it. §3 onward holds the ISOLATED
RELIABILITY TESTS of Part B, run on a laptop against a disposable database that was dropped
afterwards. Nothing in Part B touched production, and nothing in §2 is a Part B test.

**This report is not a guarantee that future failures are impossible.** It records what was
tested, how, and what was found; §10 and §12 record what remains.

> **Addendum, 2026-11-06 (D-267): F-1 was found HIGH by the fix's tests-only run and fixed
> with F-2; F-3 is unchanged. See §15.** The sections below are as dated.

---

## 0. Verdict and defense readiness

- **Part A** was carried out on 2026-10-30 by the owner and recorded by the planning chat, not
  in the repository (§2a). Two items Josh asked for are not recorded for that day: the private
  database-identity check and a `403` denial. Later owner operations add production evidence
  (§2c), among them the first restore on production (backup H, 2026-11-05 23:34, D-259) — the
  owner's operation, not a P4 test.
- **Part B is complete.** Every area Josh named was tested on the disposable database, every
  result was read on a separate database connection, and the isolation was proved before any
  test ran (16 negative controls). **0 integrity failures.** The full regression (38 runs,
  2,955 assertions) and the browser sweep (20 of 20) are at their recorded baselines.
- **Three findings, none CRITICAL or HIGH:** one MEDIUM (F-1, a highest possible score can
  change on a class locked during a save, in a race of milliseconds) and two LOW (F-2, a
  duplicate grade confirmation answers `500`; F-3, a write whose COMMIT reply is lost answers
  `500` although it committed). All three are recorded as known limitations with a regression
  test each (`docs/KNOWN_ISSUES.md`); by the owner's answer 5, no application file changed in
  this module, and a fix is a separate module after the defense unless the owner decides
  otherwise.
- **Readiness:** ready for the defense, with §10's three limitations and §12's risks stated.

## 1. Identities and timing (report items: tested commit and deployment; times; environments; duration)

**Tested commit.** Part B tested `main` `b1ecb97`. Its application code is identical to
`3d2e7bb`, the commit the VPS runs since 2026-11-05 20:13: `git diff --stat 3d2e7bb b1ecb97`
lists six documentation files only. The branch adds test files and documentation only
(commits `e1e586f`, `4cbba38`, and the documentation commit). On 2026-10-30 the VPS was
deployed at `0d8b3d4` (§2a).

| | Production (§2) | Isolated, Part B (§3–§9) |
|---|---|---|
| Host | Hostinger KVM 1 VPS (1 vCPU, 4 GB), Malaysia, Ubuntu 24.04.5 LTS, `srv2110222` | the developer's laptop, Windows 11 Pro 10.0.26200 |
| Public names | `https://srv2110222.hstgr.cloud`; `https://chfes-main-parents-portal.online` since 2026-11-03 | none — loopback only |
| Node | v22.23.4 (the Oct 30 record) | **v24.14.1** — a different major version (§12) |
| API process | PM2, one fork-mode process behind Nginx 1.24 | `server/server.js` as a child of each proof; `migration/scripts/serve-pg.js` for the suites |
| Database | Supabase (Singapore), PostgreSQL **17.11** (backup H's `manifest.json`), session pooler, TLS verify-full | embedded PostgreSQL **17.10** at 127.0.0.1:54329, TLS off, database `parents_portal_p4b` (created by `db:setup`, dropped at the end) |
| Schema fingerprint | `b5e84dbd…8ab936d` (backup H, 2026-11-03 22:22) | **`b5e84dbd…8ab936d` — identical** (computed with the same `schemaFingerprint()`) |
| Roles | `portal_app`; `portal_migrate` `NOSUPERUSER` (`migration/schema/002_roles.sql:27–28`) | `portal_app`; on this cluster `portal_migrate` is the cluster's own superuser (§12) |
| Mail and SMS | Gmail SMTP; SMSGate with the owner's phone | file transports only |

**Times (Asia/Manila).** Part B ran from about 23:40 on 2026-11-05 (the worktree) to 00:29 on
2026-11-06 (the teardown): about 50 minutes, the build of the proofs included. The proofs'
final runs: concurrency 23:56, rollback 23:59, restore 00:04, reconnect 00:06, the real
restart 00:07–00:08, the regression to 00:14:41, the existing restore proofs 00:15–00:20,
the browser sweep to 00:26. Part A ran the morning of 2026-10-30 (recorded at 10:01).

## 2. Part A — production observations

### 2a. 2026-10-30 — recorded by the planning chat, outside the repository

Recorded by the planning chat on Oct 30 at 10:01 Manila, outside the repo, from the owner's
runs that morning (the owner's answer 1 of D-261; also `docs/CHANGELOG.md`, the 2026-10-30
hosting row). **This is the chat's record of the owner's actions, not an independent
observation by this report.**

- **Deployment:** `main` `0d8b3d4` on the VPS above; Node v22.23.4; PM2 (`pm2-portal.service`,
  one fork-mode process `parents-portal-api`, saved); Nginx 1.24 with
  `deploy/nginx/parents-portal.conf`; a Let's Encrypt certificate (expires 2027-01-28, renewal
  dry run OK, HTTP→HTTPS 301).
- **Runtime permissions:** `server/.env` mode 600, the secrets folder 700, `PG_CA_FILE` pointing
  at the CA there, `NODE_ENV=production`; TZ Asia/Manila (host and PM2), NTP synced; UFW
  OpenSSH, 80, 443; SSH key-only, password login refused (verified).
- **Health:** `/api/health` `db` ok over loopback, through Nginx, and over HTTPS.
- **Authentication and denial:** the admin's web sign-in; an unauthenticated `GET /api/users`
  answered `401`.
- **Browser and phone acceptance:** the dashboard; live connection Connected (Socket.io through
  Nginx); a deep-link reload; a profile photo uploaded and removed (admin); a Forgot-password
  email delivered from the VPS (09:51) and a Forgot-password SMS to a seeded teacher account
  (09:52), no reset performed; a live message from that teacher (web) reached a parent on the
  phone (Expo Go against the VPS) as a toast, and the parent's Grades loaded from the VPS.
- **Backup:** one backup through the app on the VPS, `parents_portal_2026-10-30_100043.zip`
  (279.3 KB), present on the VPS disk.
- The professor's system check passed the same day.

### 2b. What is NOT recorded for Part A

Stated plainly, not reconstructed:

- the private database-identity check against an owner-approved reference (`deploy/README.md`
  section 10, step 1) and the separately approved `SELECT 1` probe (step 3) — no result is
  recorded anywhere in the repository;
- a `403` authorization denial on production (only the unauthenticated `401`);
- low-impact stability figures (response times, error counts, uptime over the day);
- read-only regression checks beyond the acceptance list above.

**Database identity, from what is recorded:** Supabase, Singapore region, PostgreSQL 17; and,
read for this report from backup H's `manifest.json` only (its CSV members were never opened):
format `parents-portal-copy-archive` v1, engine `postgresql`, schema `portal`, server version
17.11, 26 tables in the fingerprint (26 constraints entries, 13 enums), 24 data members,
`auth_codes` and `backups` excluded, 25 sequences, fingerprint `b5e84dbdc9ac…8ab936d`. That
fingerprint is the one Part B's database has (§1), so Part B tested the production schema.

### 2c. Later owner operations on production (not P4 tests)

| When | What | Recorded in |
|---|---|---|
| 2026-11-03 03:35–04:41 | Module 13's sitting: credentials rotated in place, one `pm2 reload`; `/api/health` `db` ok from about 04:02; `CORS_ORIGIN` for the domain; admin sign-in, Activity log, Messages and socket.io 101 on the domain; a real Forgot-password email code at 04:11 | `docs/TESTING.md:183–200` |
| 2026-11-03 05:12–05:22 | Module 14's check: consent, the DO 72 sentence, Grades labels, web and phone | `docs/TESTING.md:202–209` |
| 2026-11-03 22:20 | The D-122 activity reset: backup G before, H after; every other table's count equal | `docs/ACTIVITY_RESET.md:81–101` |
| 2026-11-04 11:33–11:40 | Backup H's SHA-256 equal on the VPS and the laptop; `/api/health` on the domain `db` ok | `docs/ACTIVITY_RESET.md:96–98` |
| 2026-11-05 15:37–15:43 | The phone on the domain (D-246): health 200, a parent's sign-in, Messages, Grades | `docs/TESTING.md:129–134` |
| 2026-11-05 20:10–20:36 | M18: the VPS from `31333c3` to `3d2e7bb` (full hash confirmed), `JWT_SECRET` rotated, one reload; a session from before the reload sent to Login — a production `401` path; fresh sign-ins on both names and the phone; secrets mode 600 | `docs/TESTING.md:60–91` |
| 2026-11-05 22:47–22:49 | Four Ubuntu security updates as root (`apt`, `apt-utils`, `apt-transport-https`, `libapt-pkg6.0t64`: 2.8.3 → 2.8.4ubuntu0.1; `libsqlite3-0` deferred by phasing); no reboot required; health `"db":"ok"` on both names afterwards | the owner's record (answer 1 of D-261) |
| 2026-11-05 23:28 → 2026-11-06 00:00 | D-259: the Nov 4–5 demo's writes undone by **the first restore on production**, backup H through the app; restore point K made — **an owner operation on production, not a P4 test** (below) | the owner's record; `docs/CHANGELOG.md` and `docs/KNOWN_ISSUES.md`, 2026-11-06 (`main` `a04ba62`); `docs/ACTIVITY_RESET.md:104` |

**D-259, step by step — an owner operation on production, not a P4 test** (Asia/Manila; the
owner's record, passed to this report by the planning chat; recorded in `main` `a04ba62`):

- **2026-11-05 23:28 — production read through the read-only Supabase connector (D-70):**
  `transaction_read_only` on, `current_user` `supabase_read_only_user`; `users` 376 (H's
  count); the counts of everything written since H.
- **23:31 — the VPS pre-check:** health `"db":"ok"`; the zone Asia/Manila; the clock
  synchronized, NTP active.
- **23:34 — the restore:** backup H (`parents_portal_2026-11-03_222242.zip`, taken 2026-11-03
  22:22:42) through Admin → Backup & Restore. The archive and schema checks passed; the safety
  copy was made first (`pre_restore_2026-11-05_233431.zip`); one transaction; every session
  ended — the tab went straight to Login: "Session invalidated by a database restore. Please
  log in again."; the 122 activity-log rows recorded after H were rewound (the
  `restore_backup` row's id 32262 − 32140).
- **23:36 — an independent read-only re-check:** every counted table equal to H (`users` 376,
  `students` 350, slots 1,390, scores 20,938, `grades` 4,701, `attendance` 3,500,
  `notifications` 4, acceptances 50); nothing changed in place since H; no locked grade,
  acknowledgement, message, auth code or inactive account; the protected fixture (student 1037,
  parent 647) unchanged.
- **23:37 — the account-state diff** showed only the two accounts expected (ids 2 and 6).
- **23:41 — the new restore point K**, `parents_portal_2026-11-05_234112.zip` (id 405, 257,841
  bytes); its SHA-256 equal on the VPS and on the laptop; kept privately on Drive. **Restore
  only K** from now on (`docs/ACTIVITY_RESET.md:104`).
- **Deleted:** J (403) and I (402) through the page at 23:45; the safety copy (404) on
  2026-11-06 at 00:00 through `DELETE /api/backups/404` from the admin's session (`200`).

What this shows, as production evidence beside Part B: the restore path behaved on the hosted
system as Part B's B1 and `restore-e2e.js` predict — the checks first, the safety copy before
any write, one transaction, the session cutoff, the activity rewind counted — and a read-only
check on a separate connection found the data equal to the archive.

## 3. Part B — the isolation, proved first

**How a Part B run is kept away from production** (the mechanism, not a promise):

1. **A worktree with no `.env`.** `server/config/db.js:1` and `server/server.js:1` call
   `dotenv.config()` from the working directory, and the main checkout's `server/.env` points
   at production; dotenv never overrides a set key, but an unset one would have come from it.
   The worktree `Parents_Portal-p4b` holds no `server/.env`, `client/e2e/.env.e2e` or
   `mobile/.env`.
2. **The migration paths pinned to the worktree.** From a sibling worktree,
   `migration/lib/paths.js:19, 26, 27` resolve `APP_TREE` to the MAIN checkout, the source env
   file to its production `server/.env` (which exists) and the backups folder to its
   `server/backups` — measured, existence only. The launcher sets `MIGRATION_APP_TREE` to the
   worktree and `MIGRATION_SOURCE_ENV` to a file that does not exist.
3. **A network preload in every node process** (`migration/scripts/p4b-net-guard.js`, through
   `NODE_OPTIONS=--require`): the existing `test-loopback-guard.js`, which refuses any
   connection off the loopback before a DNS lookup, plus a refusal of loopback ports 5000,
   3000, 3306 and 8081 — **loopback is not isolated**: 25 suites default to port 5000, and the
   laptop's main-checkout API there serves the production database.
4. **One environment, set by a launcher outside the repository**: the loopback cluster's host,
   port and this run's database; the 5010 API; file mail and file SMS; a random test
   `JWT_SECRET` per launch; no mail, SMS or database credential; no hosted flag. No value is
   ever printed.
5. **Per-script refusals** that were already there: `serve-pg.js:21–30`,
   `server/scripts/test-helpers/db.js:56–62`, `server/scripts/setup-db.js:52`,
   `test-pg-driver.js:59–66`; and the new harness's own (`migration/lib/p4b.js`).

**The preflight** (`node migration/scripts/p4b-preflight.js`): every check above, the guard
live in its own process, ports 5000 and 3000 closed, and the server's identity —
127.0.0.1:54329, PostgreSQL 17.10, TLS off, the API's runtime and migrate roles landing in
`parents_portal_p4b`. **PREFLIGHT OK**, before the first test and again after the cluster's
restart.

**Its negative controls** (`--controls`), each in its own child process, each refused for its
own reason: a socket to TEST-NET-1 and one to 127.0.0.1:5000 refused by the guard, and neither
refused without the preload (so the probe can fail); a non-loopback `PG_HOST` with the guard
absent, refused before any connection; `PG_DATABASE` as the suites' shared `parents_portal_pg`
and as `postgres`; `PG_PORT` 5432; the root pointed at the main checkout, refused because its
`server/.env` exists (never opened); `MIGRATION_APP_TREE` unset; `MIGRATION_SOURCE_ENV` unset;
`PORTAL_FIXTURE_HOSTED` set; `API_BASE` on 5000; mail not on the file transport; a mail
credential key set; `PG_SSL=require`; and the unchanged environment passing. **16 of 16.**

The regression's 38 runs (§11) all ran under the preload: none tried to leave the loopback or
reach port 5000, or it would have failed.

## 4. Tests executed — totals (report items: tests executed; passed / failed / skipped / blocked)

| Group | Command | Result |
|---|---|---|
| Isolation | `p4b-preflight.js`, `--controls` | PREFLIGHT OK; controls 16/16 |
| Concurrency | `p4b-concurrency.js` | 19/19; findings F-1 (MEDIUM), F-2 (LOW) |
| Rollback | `p4b-rollback.js` | 35/35; no finding |
| Restore, corrupted archives, restore faults | `p4b-restore.js` | 59/59; no finding |
| Reconnection | `p4b-reconnect.js`, then `--real-restart` | 25/25, then 35/35; finding F-3 (LOW) |
| Existing restore proofs | `restore-e2e.js`; `restore-commit-drop.js` ×3; `backup-during-restore.js` | OK; 3 of 3 OK; OK — each negative control FAILED as designed |
| No-API recovery | `reconstruct-archive.js` write / verify / load | RECONSTRUCT OK; content hashes equal (§9) |
| Regression | the 37 `test:*` aliases and `verify:grading-seed` | 38 runs, 2,955 assertions, 0 failed; every figure at its `docs/TESTING.md` baseline |
| Browser | the smoke sweep through `smoke-pg.js` (§11) | 20/20 (5.7 min) |

**Failed: 0. Blocked: 0. Skipped, by design:** the migration tooling's proofs that need the
MySQL source or the shared transfer target (`committed-workflow.js`, `transfer-failures.js`,
`sequence-rollback.js`, `autoinc-fresh.js`) — their 2026-10-25 results are history
(`migration/docs/05_VALIDATION_MATRIX.md` §0c, §0d, §0h) and the MySQL fallback was not
touched; the `--gate` halves of `test:demo-data` and `test:activity-reset`, which use their own
databases (both ran plain); the client's lint and render proofs and the mobile proofs (no
client or mobile file changed).

## 5. Authentication and authorization denial

**Isolated:** `test:auth` 71, `test:auth-middleware` 52, `test:socket-auth` 51, `test:privacy`
85, `test:recovery` 143, `test:jwt-secret` 38 — every gate, the `401` / `403` split and the
session revocation at their baselines. Under a database outage the API answered `503`, never
`401`, with a valid token, both through the relay and across a real cluster restart (§8); a
restore ended every session (`401` afterwards, B1 and `restore-e2e.js`).

**Production:** the unauthenticated `401` (§2a) and M18's revoked session (§2c). No production
`403` is recorded.

## 6. Database integrity

Every result below was read on the observer's own connection (`migration/lib/p4b.js`
`observe()`: a REPEATABLE READ, READ ONLY snapshot; per table the row count and a content hash
of every row; every identity sequence against its table's highest id; sessions, prepared
transactions and ungranted locks), never through the API.

- Four multi-statement writes with a failure injected part-way (a test trigger raising inside
  the route's transaction): the class-record save, the excuse review, the acknowledgement, the
  bulk lock. Each answered an error and **left every table byte-for-byte as it was**; without
  the trigger the same request succeeded and changed exactly its own tables. The triggers were
  dropped and confirmed gone. (`p4b-rollback.js` T1a–d)
- No session was ever left idle in a transaction and no prepared transaction remained, after
  any proof.
- **Sequence integrity:** after every phase every one of the 25 identity sequences was ahead of
  its table's highest id and none moved backwards; ids burned by failed inserts were never
  handed out again (S3); a restore of an older archive kept every sequence forward and the next
  id was past every id ever issued (S2); a restore that failed after moving the sequences left
  every sequence exactly as before (R2); a lost COMMIT moved a sequence only when the restore
  had committed (`restore-commit-drop.js`).

## 7. Concurrency

| Case | Staged how | Result |
|---|---|---|
| C2 — ten identical assignment creates at once | parallel requests | exactly one row; one `201`, nine `409` |
| C1 — two confirmations of one locked term at once | the notifications table held EXCLUSIVE, so both wait at the database | exactly one row; replies `201` + **`500`** (F-2). A burst of ten, nothing held: one row; 1 × `201`, 6 × `200`, 3 × `500` |
| C3 — a highest-possible-score change against the bulk lock | `assessment_slots` held EXCLUSIVE: the save passes its check and waits at its first write while the lock commits | every row locked, **no locked grade value changed**; but the save answered `200` and the slot's HPS went 20 → 25, a locked learner's score row 18/20 → 18/25 (F-1). Serialized, the same change is `409` |
| A restore while a restore runs; a backup while a restore runs | `restore-e2e.js`; `backup-during-restore.js` | `409 RESTORE_RUNNING` for both; the backup waited and holds every row (the no-lock mutant: 0 rows and still passing inspection) |
| Two reviews of one day | `test:excuses` (133) | at baseline |

## 8. Connection stability

| Case | Result |
|---|---|
| The relay cut (every connection reset, new ones refused) | health `503` in 7–11 ms; `/auth/me` with a valid token `503`, never `401`; a write `503` and absent; a new socket handshake refused; the API process up |
| A cut while a save is inside its transaction | the client got `500`; the server ended the cut sessions on its own; nothing of the save landed; no session left idle in a transaction |
| The relay back | health `200` in 54–71 ms **without an API restart**; the same token works; writes land; the handshake is accepted |
| The real cluster stopped (`pg-local.js stop`) and started again | health `503` while down, `/auth/me` `503`; the API process survived the shutdown of every connection; health `200` 132 ms after the cluster accepted connections, the same token working, a write landing, a handshake accepted |
| The pool exhausted behind a held row lock (ten writes holding all ten connections) | health `503` at 10,004 ms (the 10 s connect timeout); on release every waiting write completed `200` and health was `200` in 13 ms; at most ten API connections. The two requests that found no connection answered `500` (a route's own catch) and `503` (the auth middleware) — an observation, not a finding |
| `test:pg-driver` (33): a server-killed idle connection, a mid-query reset, a refused port, a silent server, the API with its database unreachable | at baseline |

Thresholds (the owner's answer 9): a result fails only past the configured timeout plus 5 s
(15 s). None did.

## 9. Backup and recovery evidence

**Isolated:**

- **B1:** a real restore through the API returned every table's content, hash by hash, to the
  archive's, but the three documented: `backups` (the catalog kept, plus the safety archive),
  `activity_logs` (rewound, then the restore's own rows) and `auth_security_state` (the
  cutoff). The session from before was `401`.
- **Thirteen corrupted archives**, each restored with the real password and the typed name,
  each refused `409` before any write — no safety archive, no file, the cutoff unchanged, one
  `restore_refused` row each (counted by action, never by description): not a zip; truncated;
  no manifest; a manifest that is not JSON; an unknown format version; a member missing; an
  extra member; a member twice; a row count, a header and a closing quote each disagreeing
  (the checksum made true where needed); a schema fingerprint not matching its own hash;
  excluded tables altered. With `test:restore`'s own three (no completed marker, a changed
  byte, a schema mismatch) and the MySQL-era refusal.
- **Failures inside the restore transaction:** a value that cannot load (COPY `22P02`); a
  foreign key broken by a member (`23503`, after the sequences moved); a kept backup whose
  creator the archive lacks (`CATALOG_CREATOR_MISSING`); the manifest changed after the check;
  a member changed after the check with the same manifest — found mid-load, after the
  truncate. **Every one rolled back:** every table as it was, every sequence exactly as
  before, only the safety archive added where one was taken.
- **Injected faults:** the safety archive failing (a read-only API) — "Restore aborted",
  nothing changed, no file left; the restore's own session terminated while it waited for its
  locks — `500` "rolled back in full", not an unknown outcome; the API process killed at that
  moment — nothing restored, and a restarted API restored normally.
- **Existing proofs:** `restore-e2e.js` RESTORE E2E OK (its mutant control fails: 2 entries
  wiped for 3); `restore-commit-drop.js` OK three times (the before-COMMIT loss aborted with
  the sequence back at 1; the after-COMMIT loss confirmed committed by the server) and its
  `setval` mutant fails; `backup-during-restore.js` OK.
- **The no-API path** (`migration/docs/04` §2c): `reconstruct-archive.js` wrote, verified and
  loaded an archive into a second disposable database; every table's content hash equal to the
  source's, the new cutoff row aside.

**Production (owner operations, not P4 tests; §2c):** backups through the app on Oct 30 (§2a),
G and H around the D-122 reset, and K after D-259; H's and K's SHA-256 equal on the VPS and on
the laptop. No production restore was a P4 test (Part A forbids restore rehearsals). **The first
restore on production was the owner's, on 2026-11-05 at 23:34 (D-259):** backup H through
Admin → Backup & Restore — the archive and schema checks passed, the safety copy was made first,
one transaction, every session ended, the 122 activity rows after H rewound; an independent
read-only re-check at 23:36 found every counted table equal to H and nothing changed in place.
The restore point since is K (id 405).

## 10. Findings

Classes are proposed by this report; the owner may reclassify.

### F-1 — MEDIUM: a highest-possible-score change can land on a class locked while the save was in flight

- **Reproduction:** a Grade 4 class whose learners are graded in every subject and unlocked, a
  WW slot at 20, one learner's score 18 in it. Hold `LOCK TABLE portal.assessment_slots IN
  EXCLUSIVE MODE` on a separate connection; send `PUT /api/grades/class-record` changing the
  slot's `max_score` to 25; once it waits, send `POST /api/grades/locks` (lock, term 1, the
  class) and let it commit; release the held lock.
- **Environment:** Part B, the isolated cluster (§1).
- **Expected:** with any learner of the class locked, an HPS change is refused `409`
  (`docs/API_REFERENCE.md`, the class record; `CLAUDE.md`: "A locked learner freezes the class's
  highest possible scores").
- **Actual:** the save answered `200`; the slot's HPS is 25 on a fully locked class; the locked
  learner's stored score row reads 18 of 25. No locked grade value changed.
- **Root-cause hypothesis:** the check at `server/routes/grades.js:1505–1513` is a plain read
  under READ COMMITTED; the bulk lock takes `FOR UPDATE` on the grade rows only
  (`:2432–2438`); nothing orders the two, so a lock that commits between the check and the
  save's first write (`:1556`) is not seen.
- **Evidence:** `migration/scripts/p4b-concurrency.js` C3; report
  `p4b_concurrency_20261105T155644.json` (outside the repository). The serialized control is
  `409`.
- **Recommended correction (not made):** take the check under a lock the bulk lock must wait
  on — e.g. `SELECT … FOR SHARE OF g` on the class's grade rows for that subject and term —
  and leave a locked learner's component rows alone.
- **Regression test:** C3, which must turn from FINDING to SPEC.
- **Remaining uncertainty:** the window in real use is the few milliseconds between the check
  and the first write, and needs an admin's bulk lock inside it; how often that happens is not
  measured. A class that shows it is corrected by an unlock, the teacher's save, a relock.

### F-2 — LOW: two confirmations of one term at the same moment — one row, but the second answers `500`

- **Reproduction:** a parent whose child's term is fully locked; two
  `POST /api/grades/acknowledgements` at once (staged: the notifications table held so both
  reach the database), or ten in a burst.
- **Environment:** Part B.
- **Expected:** `201` the first time, `200` "Already confirmed" on a repeat
  (`docs/API_REFERENCE.md`, grade acknowledgements).
- **Actual:** exactly one row (correct); the replies `201` + `500` "Failed to confirm the
  grades."; in the burst 1 × `201`, 6 × `200`, 3 × `500`.
- **Root-cause hypothesis:** `server/routes/grades.js:2249–2252` takes `FOR UPDATE` on a row
  that does not exist yet, which locks nothing under PostgreSQL's READ COMMITTED (MySQL's gap
  lock did), so the second request reaches the insert (`:2277`), meets `uq_grade_ack_term`
  (`migration/schema/001_portal_schema.sql:500`) and falls to the generic `500`
  (`:2303–2312`). `server/utils/excuseAttendance.js:74–83` documents and handles the same
  difference for the excuse review.
- **Evidence:** `p4b-concurrency.js` C1.
- **Recommended correction (not made):** treat `23505` on that insert as the repeat (`200`).
- **Regression test:** C1, staged and burst.
- **Remaining uncertainty:** a real double tap may be serialized by the browser; two devices
  are not.

### F-3 — LOW: a write whose COMMIT reached the database but whose reply was lost answers `500`, although it committed

- **Reproduction:** a relay between the API and the database that forwards the COMMIT of
  `PATCH /api/excuse-letters/:id/review` and drops its reply.
- **Environment:** Part B.
- **Expected:** a reply that says the write failed means nothing was saved.
- **Actual:** `500` "Failed to review excuse letter."; the letter is Approved and the day
  Excused. A retry answers `403` (already reviewed), so this write cannot happen twice.
- **Root-cause hypothesis:** only the restore asks the server what became of a COMMIT
  (`server/routes/backups.js:485–501`, `pg_xact_status`); every other route reports the
  connection error as a failure.
- **Evidence:** `p4b-reconnect.js` N7 (both runs).
- **Recommended correction:** none before the defense; afterwards, copy that says a save may
  have landed, or an outcome check for the writes that are not guarded against a repeat.
- **Regression test:** N7.
- **Remaining uncertainty:** it needs the connection to fail in the instant after the COMMIT;
  through Supabase's pooler that instant was not tested (§12).

**Observations, not findings:** the two requests in P1 that found no pool connection answered
`500` and `503` (only the auth middleware maps an outage to `503`); the regression's suites
leave `login_attempts` above the seeded 0 (`test:auth` 4, `test:users` 2, `test:recovery` 1),
as M18 recorded.

## 11. Regressions and fixes

**No regression.** The 37 `test:*` aliases and `verify:grading-seed`, one at a time, each
database suite on a fresh `db:setup` with its own API on 5010 (`test:backups` with its
read-only second API on 5030), under the network preload: sanitize 9, grade-computation 77,
school-calendar 34, auth-middleware 52, socket-auth 51, sms-transport 94, cors-origins 44,
jwt-secret 38, excuse-attendance-rule 60, fixture-guard 10, demo-data 145, activity-reset 44,
verify:grading-seed 55, pg-driver 33, auth 71, students 98, sections 35, assignments 76,
grading-modes 13, grades 258, attendance 87, content 129, settings 38, users 73, backups 63,
messages 91, restore 39, excuses 133, notifications 227, dashboard 78, class-record 132,
class-summary 59, grade-locks 51, grade-acknowledgements 62, recovery 143, profile-photo 70,
privacy 85, activity-log 98 — 2,955 assertions, 0 failed, every exit code 0 (none
`0xC0000409`), each figure its `docs/TESTING.md` baseline. After every suite the row counts
were back at the seeded baseline, `activity_logs` and `login_attempts` aside.

**The browser sweep:** `client/e2e/smoke.spec.js` (the sweep `smoke:isolated` runs) through
`migration/scripts/smoke-pg.js`, which derives its five accounts in memory —
`smoke:isolated` itself reads them from `client/e2e/.env.e2e`, which the worktree must not
have — against the launcher's API on 5010 and Vite on 3010: **20 passed (5.7 min)**; afterwards
acceptances, confirmations, notifications and codes at 0.

**Fixes:** none. By the owner's answer 5 no application file changed in this module; the three
findings are limitations with regression tests (§10).

**No significant regression hidden by passing tests:** every new proof has a control that shows
it can fail — the preflight's 16; C3's serialized `409`; each T1 case's trigger-free success;
the K control archive passing inspection; F2's restore after a restart; the relay's pass state —
and the existing proofs' mutants (`restore-e2e.js`, `restore-commit-drop.js --mutant setval`,
`backup-during-restore.js --mutant no-lock`) all failed as designed with the files on disk
unchanged.

## 12. Remaining known issues and production risks

- **The three findings** (§10; `docs/KNOWN_ISSUES.md`, the rows of 2026-11-06).
- **Differences between the tested and the production environment:** Node v24.14.1 against
  v22.23.4; PostgreSQL 17.10 against 17.11; Windows against Ubuntu; a direct loopback socket
  against Supabase's session pooler over TLS (a connection lost inside the pooler was not
  tested); on the local cluster `portal_migrate` is a superuser, on production it is not, so a
  privilege the restore lacks on production would not have shown here; Supabase's
  `statement_timeout` (2 minutes on staging, not remeasured) is not set locally.
- **From `docs/KNOWN_ISSUES.md`, still open and relevant on production:** a row-lock wait has no
  limit outside the excuse review, the archive and the restore (P1 measured its effect: health
  `503` after 10 s, full recovery on release); a request body over 100 KB answers `500`; a
  broken mailer or SMS gateway is invisible behind the uniform `202`; the API host's clock is
  to be measured against the database before every restore and demo; the demo data must be
  undone before a pilot (the Nov 4–5 demo's own writes were undone by D-259); the SMSGate pair
  is not rotated; **restore only backup K (id 405)**, never an older archive
  (`docs/ACTIVITY_RESET.md:104`); the restore result panel can be skipped by the tab going
  straight to Login (a LOW row of 2026-11-06, seen in D-259); the single-admin recovery hazard;
  Node 24.14.1's
  `UV_HANDLE_CLOSING` abort at exit on this laptop (not seen in any run of this report).

## 13. Recommended next actions

1. After the defense, a module for F-1 (the check under `FOR SHARE`), with C3 as its test, and
   one for F-2 (`23505` as the repeat), with C1.
2. Before a pilot: the demo undo (`docs/DEMO_DATA.md`); the SMSGate pair; confirm the admin's
   email (the single-admin hazard).
3. Re-run `p4b-reconnect.js` against a staging project through the pooler, if a hosted test
   window is ever approved — it is the one connection path Part B could not reach.
4. Record a production database-identity check and a `403` denial at the next owner check, so
   Part A's two unrecorded items are closed.

## 14. Acceptance (Josh's criteria)

| Criterion | Status | Evidence |
|---|---|---|
| Deployment identity confirmed | **met** | Oct 30 `0d8b3d4` (§2a, the chat's record); Nov 5 `3d2e7bb` by full hash (§2c); the tested code is `3d2e7bb`'s (§1) |
| No unexplained critical data-integrity issue | **met** | no CRITICAL or HIGH; F-1 MEDIUM explained, no locked grade value changed (§10) |
| Authorization-denial checks pass | **met isolated; partly on production** | §5; no production `403` recorded |
| Core workflows work | **met** | the regression and the sweep (§11); §2a and §2c on production |
| Connection recovery behaves correctly | **met** | §8, the relay and a real cluster restart |
| Important transactions stay consistent | **met, with F-1 and F-3 as limitations** | §6, §7, §10 |
| Backup recoverability established | **met** — isolated by Part B; on production by the owner's restore of H on 2026-11-05 (D-259, an owner operation, not a P4 test): the checks passed, one transaction, the sessions ended, every counted table equal to H on an independent read-only re-check; the new restore point K made and hashed | §9, §2c |
| No significant regression hidden by passing tests | **met** | §11, the controls and mutants |
| Every remaining limitation documented | **met** | §10, §12, `docs/KNOWN_ISSUES.md` |

## 15. Addendum, 2026-11-06 — F-1 found HIGH and fixed, F-2 fixed, F-3 unchanged (D-267)

The sections above are as dated; this records what followed, on the owner's PLAN APPROVED
D-267 (branch `feature/p4-findings`, the worktree `Parents_Portal-p4b`, the same isolation as
§3: a rebuilt launcher outside the repository, PREFLIGHT OK, controls 16/16, loopback only).

- **Tests first.** `6f1c8e5` changed tests only: C1 and C3 became specifications, C3 was
  re-staged in both orders for all three save paths, each order proved with
  `pg_blocking_pids` before the release, and C3d and the C3x burst were added. On that commit
  (the application code `3d2e7bb`'s) `p4b-concurrency.js` was **44/61**.
- **F-1 is HIGH, not MEDIUM.** C3r and C3s (the lock first, holding the rows, then an HPS
  change and a score) each answered `200` and changed locked grade values; C3m did the same
  through the Summative maxima. §10's "no locked grade value changed" held only for the order
  §7 staged. On Josh's Phase 5 scale a transaction-integrity defect is HIGH (the owner's Q1).
- **F-1 fixed in `366e692`:** the class record takes its class's grade rows `FOR UPDATE`, in
  id order, before any lock check; the bulk lock reads its rows in the same order and
  `FOR UPDATE OF g`, so it no longer locks students rows (with them, C3d deadlocked: `40P01`).
  §10's proposed `FOR SHARE` was not used: two saves of one class would deadlock on it.
- **F-2 fixed in `c7c04c0`:** the confirmation inserts `ON CONFLICT (student_id, school_year,
  term) DO NOTHING`; a second confirmation is the `200` repeat. Production's
  `uq_grade_ack_term` was read through the read-only connector and matches the schema.
- **After the fixes:** `p4b-concurrency.js` **61/61**; each fix's in-memory control fails
  (`no-class-row-lock` 34/48, `bulk-lock-without-of` 9/13 with a `40P01`, `no-ack-on-conflict`
  11/14); `p4b-rollback.js` 35/35; `p4b-reconnect.js` 25/25. The regression figures are in
  `docs/TESTING.md`.
- **F-3 stays a documented limitation** (the owner's Q3), its row now noting that a lost reply
  also skips the review's activity rows and the parent's notification. Two new LOW rows from
  the fix's survey are recorded, not fixed (`docs/KNOWN_ISSUES.md`, 2026-11-06).
- **Not deployed by this addendum:** the VPS runs `3d2e7bb` until the owner's deploy.
- **Merged and deployed, 2026-11-06** (noted after Josh's review, 2026-11-06): `f2b75e4` was
  merged to `main` at 06:09 and deployed to the VPS at 06:14, a fast-forward from `3d2e7bb`
  (D-271, D-272). F-1's and F-2's fixes are live on production.

---

### Appendix A — commands (each through the launcher, which sets the environment above)

```
node migration/scripts/pg-local.js serve            (the loopback cluster; run attached)
node migration/scripts/p4b-preflight.js
node migration/scripts/p4b-preflight.js --controls
node server/scripts/setup-db.js                     (before each proof; output withheld but its exit code and safe lines)
node migration/scripts/p4b-concurrency.js
node migration/scripts/p4b-rollback.js
node migration/scripts/p4b-restore.js
node migration/scripts/p4b-reconnect.js
node migration/scripts/p4b-reconnect.js --real-restart     (the operator restarts the cluster when it waits)
node migration/scripts/restore-e2e.js --api http://127.0.0.1:5010            (and against serve-pg.js --mutant no-running-log)
node migration/scripts/restore-commit-drop.js       (x3, then --mutant setval)
node migration/scripts/backup-during-restore.js     (then --mutant no-lock)
node migration/scripts/reconstruct-archive.js write | verify | load
node migration/scripts/p4b-observe.js snapshot <label> [--database <db>] [--compare <file>]
the 37 test:* scripts and verify:grading-seed, as node scripts/<file>.js
node migration/scripts/smoke-pg.js --app http://localhost:3010 --api http://127.0.0.1:5010
node migration/scripts/p4b-preflight.js --drop parents_portal_p4b parents_portal_p4b_reconstruct
node migration/scripts/pg-local.js stop
```

### Appendix B — evidence files

The proofs' JSON reports (counts, hashes, booleans and timings; no row, no value) are in
`Parents_Portal-migration-data/rehearsal/`, outside the repository:
`p4b_concurrency_20261105T155644.json`, `p4b_rollback_20261105T155907.json`,
`p4b_restore_20261105T160402.json`, `p4b_reconnect_20261105T160602.json`,
`p4b_reconnect-real-restart_20261105T160737.json`, and the observer's `p4b_observe-*` snapshots.
