# 08 — Context sync: what CLAUDE.md, TESTING, KNOWN ISSUES and the Project instructions should say after this branch merges

**P3-C-R2 Phase I, 2026-10-25.** By the owner's addendum, **CLAUDE.md is not
edited on this branch, and nothing in claude.ai memory or the Project
instructions is changed.** This file holds the proposals, each with the
evidence behind it, for the owner to apply (or refuse) at the merge. Every
figure below was measured on this branch on 2026-10-25; `05` §0d–§0h hold the
runs.

**Status of the branch at this writing:** `migrate/postgres-prep`, merged
with `main` `64200f7` (merge `0d2b629`); Phases B–H committed (`d4a2bd7`,
`63b70fb`, `80adb7f`, `b97849b`, `e26a114`, `7ed1f1c`); every route in
`server/routes/` and every suite fixture runs on PostgreSQL.

---

## 1. CLAUDE.md — present-tense facts that change at the merge

Proposed wording first, then why. Dated CHANGELOG rows stay as they are.

| Where | Today | Proposed | Why |
|---|---|---|---|
| Front matter table, "Database" | `parents_portal` — 26 tables | **PostgreSQL**: schema `portal`, 26 tables — locally the embedded cluster on 54329 (`parents_portal_pg`), hosted on Supabase | the port (`03`, `05`) |
| LOCKED DECISIONS → Stack, Backend | Node.js, Express, MySQL, JWT, bcrypt, Socket.io | Node.js, Express, **PostgreSQL (`pg`)**, JWT, bcrypt, Socket.io | the owner's migration decision; `mysql2` stays a dependency only for `migration/` (the transfer reads MySQL) and the golden master |
| CURRENT STATE → Files that exist → File rules that bite → `config/db.js` | `dateStrings: ['DATE']`; the pool is a proxy so `resetPool()` can swap it after a restore | **`config/db.js` — four.** `?` placeholders stay at the call sites and `toPg()` numbers them; a hand-written `$n` is refused, and an array needs `= ANY(?::type[])` (never `IN (?)`). Results are `{ rows, rowCount }` — no `insertId` (use `RETURNING id`), `rowCount` is MATCHED rows (mysql2's `affectedRows` meaning). Type parsers: DATE is the `YYYY-MM-DD` string, int8 a number, numeric a string. Every checked-out client carries an `'error'` listener (`guardClient`) and connections time out at 10 s. **There is no `resetPool()`**: a restore no longer drops the database | `05` §0e (driver-1, driver-2); the restore design `04` |
| File rules → a new line | — | **`utils/validateId.js` — ids stop at 2,147,483,647** (`MAX_ID`): a larger id is the route's 400, never a 22003 (a documented difference: MySQL answered 404 or an empty 200) | `05` §0f |
| File rules → a new line | — | **`utils/excuseAttendance.js` — the review sets `lock_timeout` to 50 s** (MySQL's `innodb_lock_wait_timeout`), and `55P03` is a lost race (409) | `05` §0f |
| File rules → `scripts/setup-db.js` | `backfillSectionIds()` reports | unchanged, plus: **it drops the `portal` schema of the database `PG_DATABASE` names, on a loopback host only** | the HAZARD row below |
| CURRENT STATE → Files that exist, "eleven migrations" | eleven `migrate-*.js` | **the eleven `migrate-*.js` are MySQL history** (the schema file holds their end state); `migrate-demo-grade1.js` must not be run on PostgreSQL | `03` §5 step 7 |
| The whole RESTORE section | mysqldump, `--ignore-table`, `stripBackupsTableDdl()`, a one-off `multipleStatements` connection, `resetPool()`, DROP DATABASE | Replace with `04` §2a as built: a COPY archive (`.zip`: one CSV per table + `manifest.json` written last), `backups` and `auth_codes` never in a file; the restore in ONE transaction (every table ACCESS EXCLUSIVE, the fingerprint, `backups` rows saved and put back, sequences `ALTER SEQUENCE … START WITH n RESTART` — never backwards, Q4 (a) — the cutoff inside the transaction); a MySQL-era `.sql` is refused `409 MYSQL_ERA_BACKUP` (the recovery procedure only); **an archive locks every table IN ACCESS SHARE MODE before its snapshot** (backup-1); **a COMMIT with no answer is settled by `pg_xact_status`** (backup-2); a manual backup while a restore runs is `409 RESTORE_RUNNING`; every refusal logged (backup-3). Keep: step-up password (400/403, never 401), the typed name, the safety archive FIRST, `activity_logs` rewound on purpose, `test:restore` never runs a real restore | `04`, `05` §0h |
| RESTORE → "Five things a restore of an old dump does" | five MySQL-dump hazards | **gone with the format**: no API restore reads a MySQL dump; each hazard applies only to the by-hand recovery procedure (`04` §2b) | `04` |
| BUILD ORDER → NEXT, Session B's item 3 | the sync, the D-65 fix round, then Phase 3 | **done on this branch** (the sync `0d2b629`; Phase 3 by P3-C-R2, Phases B–H); what remains is the owner's decisions (§5) and Phase L's hosted checks | this dispatch |
| HOW TO WORK WITH DARRYL → the live-DB write rule | health + `POST /api/backups` `201` before any live write | unchanged in substance — after the merge the backup is an archive (`.zip`) | — |

**A one-line rule worth adding to CURRENT STATE** (it cost this dispatch a
re-run): *a golden master compares against the MySQL code this branch is
ported FROM — after a sync with `main`, that is `main`'s merged commit, not the
branch's old base* (`05` §0g: against `5426b70` every gated route on the ported
side answered 403, a policy-version difference, not a port one).

---

## 2. docs/TESTING.md — the figures that change, and the ones that hold

Proposed: a new paragraph **"On PostgreSQL (Phase 3, 2026-10-25)"** at the top
of "Suites and their baselines", and the per-suite bullets below updated in
place. The suite count becomes **thirty-three**: `test:pg-driver` is new, with
its alias added to `server/package.json` in Phase I.

| Suite | MySQL baseline | **PostgreSQL** | Where measured | Note |
|---|---|---|---|---|
| `test:auth-middleware` | 48 | **52** | unit | +4 (CHANGELOG row of commit 7): fixtures signed with and without `iat` through the real `signToken`; with the check disabled exactly the two no-`iat` cases fail |
| `test:socket-auth` | 47 | **51** | unit | +4 (the same row): two cases and their in-memory mutants |
| `test:grades` | 256 | **258** | fresh `db:setup` | +2 (the same row): a component's `date_recorded` on the year boundary read back from the write and from `GET /:id`, under `TZ=UTC` and `Asia/Manila` |
| `test:pg-driver` | — | **33** (new) | unit + the local cluster | `toPg`, NUL refused (22021), transactions and release, an idle and an active connection killed, the reset relay (driver-1), a refused port, a silent server (driver-2), the API answering 503 |
| `test:excuse-attendance-rule` | 58 | **60** | unit | +2: `55P03` is a conflict; every review sets the 50 s lock timeout first — each failing under its mutation |
| `test:backups` | 52 | **63** | fresh `db:setup`, `FAIL_PORT=5030` | rewritten for the COPY archive (commit 6) |
| `test:restore` | 29 | **39** | fresh `db:setup` | rewritten (commit 6) |
| `test:recovery` | 143 | **143** | file transports | P-19 on PostgreSQL |
| `test:privacy` | 85 | **85** | the transfer target (a confirmed admin) | its restore checks on a scratch schema (commit 6) |
| `test:auth` | 69 | **69** | | |
| `test:users` | 73 | **73** | | |
| `test:students` | 97 | **97** | | see §3's finding — one assertion is vacuous on both engines |
| `test:sections` | 30 | **30** | | |
| `test:assignments` | 62 | **62** | | |
| `test:grading-modes` | 13 | **13** | | |
| `test:attendance` | 73 | **73** | | |
| `test:content` | 97 | **97** | | |
| `test:settings` | 35 | **35** | | |
| `test:messages` | 86 | **86** | | |
| `test:excuses` | 121 | **121** | | |
| `test:notifications` | 227 | **227** | **a fresh `db:setup` only** | on the transfer target it is 225/2: its exact-count cleanup checks meet the golden master's fixture rows (`05` §0f) |
| `test:profile-photo` | 70 | **70** | fresh `db:setup` | |
| `test:activity-log` | 98 | **98** | fresh `db:setup` | |
| `test:sms-transport` | 94 | **94** | unit | |
| the others (`dashboard`, `class-record`, `class-summary`, `grade-locks`, `grade-acknowledgements`, `cors-origins`, `sanitize`, `school-calendar`, `grade-computation`) | — | Phase J's run (`05` §0i) | | |

**How a suite runs on PostgreSQL** (proposed for "Before you run it"): the
`PG_*` keys (host loopback, `PG_PORT` 54329 locally), the API on 5010 against
the same database, `MAIL_TRANSPORT=file SMS_TRANSPORT=file` on the server for
`test:recovery`, and `FAIL_PORT` set inside the allowed ports for
`test:backups`. The suites' fixtures connect through
`server/scripts/test-helpers/db.js` only, which refuses a non-loopback host.
**Suites that count a shared table exactly belong on a fresh `db:setup`**
(`test:notifications`'s cleanup checks), never on a transfer target.

**The browser smoke on PostgreSQL** (proposed for "The smoke run"): its
fixture, `client/e2e/auth.js`, now connects through
`server/scripts/test-helpers/db.js` (it opened mysql2 against `server/.env`
until Phase J — on a tree without a `.env` that defaulted to the live
database). `migration/scripts/smoke-pg.js` runs it against a chosen pair of
servers with the accounts handed over as environment variables, never a file;
**`VITE_API_BASE_URL` must end in `/api`** (`client/src/api/apiBase.js` uses it
verbatim — without it every login stays on `/login`, measured).

**New proofs** (`migration/scripts/`, each with its negative control):
`component-order.js` (grades-1), `golden-values.js` (values, order, writes,
D-2), `backup-during-restore.js` (backup-1), `restore-commit-drop.js`
(backup-2), `restore-e2e.js` (a real restore through the API; backup-3),
and the updated `transfer-failures.js`.

---

## 3. KNOWN ISSUES — rows to add, close or rewrite

**Add (open):**

| Issue | Where | Note |
|---|---|---|
| **A NUL (U+0000) in a text value is a 500 on PostgreSQL** | every route that stores or searches typed text | PostgreSQL text refuses it (22021); MySQL stored or searched it. Sign-in, forgot and reset are fixed (`routes/auth.js cannotBeALoginId`, Phase E). A strip-or-refuse rule elsewhere is a behaviour decision — the owner's |
| **A body over 64 KB in a former TEXT column is now stored** | `messages.body`, announcements, memos, excuse letters | MySQL's TEXT (65,535 bytes) refused it with a 500; PostgreSQL `text` has no cap. A `CHECK (octet_length(…) <= 65535)` per column brings the refusal back, or record it as accepted |
| **An impossible date that passes the shape check is a 500 in a filter** | `isValidDateFormat` (shape only) + every date filter | `2026-02-30` is 22008 on PostgreSQL; MySQL matched nothing (200). The fix is a real-date check in the one helper |
| **The name sorts follow the database's collation (D-2)** | `?sort=name` on students, users, contacts, excuse letters; the conversations name sort | Measured (`05` §0g): only names MySQL treats as EQUAL (case and accent variants) order differently; `COLLATE portal.ci` reproduces MySQL exactly. The owner's D-2 |
| **Outside the excuse review, a row-lock wait has no limit on PostgreSQL** | every transaction but `reviewWithAttendance` | MySQL gave up after 50 s (a 500); PostgreSQL waits. Reached only behind a stuck transaction |
| **`test:students`' "that no-op writes no `update_student_status` entry" is vacuous — on `main` too** | `server/scripts/test-student-flows.js:642-643` | Its pattern `(#<id>) to` has not matched the route's `Set student #<id> to <status>` since `dab1bb5` (2026-09-18); the counter is 0 before and after. Fix the pattern on `main` (`%student #<id> to %`) |

**Close:**

| Row | Why |
|---|---|
| "The restore's lost-entries count undercounts by the source backup's own `create_backup` row" | the PostgreSQL restore counts `activity_logs` rows above the archive's own highest id, under its locks — the archive's `create_backup` row is counted (measured: 3 = that row, the refusal, the safety archive's row; `05` §0h) |

**Rewrite:**

| Row | Proposed |
|---|---|
| "HAZARD — `DB_NAME=<other> npm run db:setup` destroys `<other>`…" | **`db:setup` drops the `portal` schema of the database `PG_DATABASE` names** (creating the database if it is missing), on a loopback host only; it never touches another database. Never point `PG_DATABASE` at a database whose `portal` schema matters |
| The four "Restoring a backup taken before …" rows (Contributions, sms-transport, grade-acknowledgement, and the CR1 note in RESTORE) | One row: **a MySQL-era `.sql` backup is refused by the API (`409 MYSQL_ERA_BACKUP`)**; restoring one is the by-hand recovery procedure (`04` §2b), and those four hazards apply only there |
| "Ten `.sql` files on disk have no `backups` row" | unchanged, plus: they list with `engine: mysql` and can never be restored through the API |
| "A truncated dump from the 2026-09-15 browser check is on disk as an orphan" | unchanged for the by-hand recovery procedure (check the footer before adopting any orphan); the API cannot restore it at all, and a new archive cannot be truncated silently — it is renamed from `.partial` only after `inspectArchive` read it back whole |

---

## 4. Project instructions (claude.ai) — lines the owner may add

Proposed, not applied:

- *The database is PostgreSQL since the Phase 3 merge: schema `portal`, the
  local cluster on 54329, Supabase hosted. MySQL is the transfer's source and
  history; the `migrate-*.js` scripts are not run.*
- *A backup is a `.zip` COPY archive; a MySQL-era `.sql` is restored only by
  the by-hand recovery procedure.*
- *Suites run against a loopback PostgreSQL only; any suite that counts a
  shared table runs on a fresh `db:setup`.*

---

## 5. Decisions left for the owner

None open. The four that stood here are answered in
`migration/docs/09_INTEGRATION_ACCEPTANCE.md` §3:

1. **D-2** — the database collation; the different tie order is accepted;
   `COLLATE portal.ci` is not applied to name sorts.
2. **The int4 cap** — an id above 2,147,483,647 answers 400.
3. **NUL, the 64 KB cap, and impossible filter dates** — refused at the
   request boundary. The cap is kept on the same fields.
4. **`test:students`' vacuous assertion** — fixed.

---

## 6. Memory

Nothing in claude.ai memory or the Project instructions was changed (the
addendum). The session's local working notes are unchanged.
