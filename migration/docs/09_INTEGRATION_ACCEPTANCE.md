# 09 — Integration acceptance (P3-C-R2 Phase K, 2026-10-25)

**Scope:** the local Phase 3 work on `migrate/postgres-prep` — the ported API
on the embedded PostgreSQL 17 cluster (54329), measured against the MySQL code
it was ported from (`main` `64200f7`). **Not in scope:** the hosted Supabase
project (Phase L, which waits for the owner's go). Every figure below was
measured on 2026-10-25; the runs are `05` §0b–§0i.

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
| 9 | Acceptable golden-master results | **met; D-2 the owner's** | every difference classified: `/api/backups` by design (`04`); the int4 cap's two 400s documented (`05` §0f); the name sort measured — it differs only among names MySQL treats as equal, and `COLLATE portal.ci` reproduces MySQL exactly (`05` §0g) |
| 10 | Complete applicable regression execution | **met; one item NOT RUN** | 33 suites, `verify:grading-seed`, the client's oxlint / tokens / contrast / build and its one affected render proof at their figures, the browser smoke 20/20 (`05` §0i); **mobile NOT RUN** — no mobile file differs from `main` and the worktree has no mobile dependencies |
| 11 | Preserved source systems | **met** | the main tree, its server on 5000 and the live `parents_portal` were not touched (nothing listened on 5000, 3000, 5001 or 3001 when checked); the MySQL side was read through `lib/mysql.js` READ ONLY sessions and written only in `parents_portal_migsrc_*` scratches and one disposable `parents_portal_migtest_*` (dropped); the smoke fixture's mysql2 default — which would have reached the live database — was ported before any sweep (`05` §0i) |
| 12 | Recorded remaining hosted dependencies | **met** | `06` (staging), `07` (cutover and rollback), `08` §5 (the owner's decisions); Phase L not started |

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
2. **The int4 cap** — 400 above 2,147,483,647 (implemented) or the old per-route answers.
3. **NUL in text, the 64 KB TEXT cap, impossible dates in filters** — refuse / keep.
4. **`test:students`' vacuous assertion** — a one-line fix on `main` (`08` §3).

## 4. Known limitations of the evidence

- The lost-COMMIT proof's first run reported a row-count change in its committed
  leg without naming the table; two later runs naming the tables showed none
  (`05` §0h). Not explained.
- The browser smoke never interacts (its own rule); a write flow on screen is
  the owner's device check.
- Everything here ran on the local cluster (ICU `en-US` default collation, PG
  17.10). The hosted project's version, collation and network are Phase L's.
