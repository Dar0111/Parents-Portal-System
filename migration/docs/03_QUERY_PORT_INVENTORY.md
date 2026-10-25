# 03 — Query-port inventory and implementation order

Derived on 2026-10-19 by `scripts/inventory-queries.js` (326 `.query(` call
sites in 24 application files — routes, utils, middleware, `socket.js`,
`server.js`; `scripts/` excluded) and by line-level greps for each
construct. **Re-derived on 2026-10-24 after the sync with `main` `5426b70`:
350 call sites in 27 files** — `routes/activityLogs.js` (B2),
`utils/excuseAttendance.js` (B8) and `utils/passwordAlert.js` (B6) are new;
`routes/grades.js` 82 → 92 (B1), `routes/notifications.js` 6 → 8 (B1, B3),
`utils/notify.js` 10 → 12 (B1), `routes/excuses.js` 17 → 16 (B8). The
per-file rows below carry the 2026-10-24 line numbers for every file `main`
changed. The application port is **not** part of this phase; this is the
map it follows. Measured behaviour cited as "(measured)" is in
`rehearsal/semantics_local_*.json` and "(rehearsed)" in
`rehearsal/rehearse_local_*.json` (90 checks since the sync, 71 before).

## 1. Strategy

- **Explicit PostgreSQL SQL, no ORM, no translation layer.** Every `?`
  becomes `$n`; every `const [rows] = await pool.query(…)` becomes
  `const { rows } = await db.query(…)`. A small shared `server/config/db.js`
  replacement exports `query`, `getClient` (one leased client per
  transaction — `BEGIN`/`COMMIT`/`ROLLBACK` on that client only) and the
  type parsers from `migration/lib/pg.js`; `resetPool()` goes (the
  PostgreSQL restore does not drop the database).
- **Helpers, each a few lines, used everywhere the same idiom appears:**
  `any(ids)` → `= ANY($n::int[])`; `insertReturningId(sql, params)`;
  `upsert` is written out per site (five sites, two shapes);
  `isUniqueViolation(e)` (`e.code === '23505'`) replaces `ER_DUP_ENTRY`;
  `isDbUnavailable(e)` gains the SQLSTATE classes `08xxx`, `57P0x`, `53300`,
  `28P01`, `3D000` beside the Node socket codes it already has.
- **Transactions**: the 12 `getConnection()+beginTransaction()` blocks
  (`grades.js` 8, `attendance.js`, `content.js`, `settings.js` 1 each, and
  since B8 `utils/excuseAttendance.js:95-149`; 10 on 2026-10-19) keep
  their shape on one leased pg client; isolation stays READ COMMITTED (D-5
  in `02`); the four `FOR UPDATE` reads stay (the bulk lock, the
  acknowledgement, the letter and the day); the guarded
  `UPDATE … WHERE is_locked <> ?` stays (both measured as race-safe).
- **Flags stay numbers**: `is_locked = $1` with `lock ? 1 : 0`; a JS
  boolean bound to a smallint is refused by pg (measured), so no site may
  start passing booleans.
- **Enum columns against lists** (since the sync): `type IN (?)` on
  `notifications.type` — `utils/notify.js:230, :235` and
  `routes/notifications.js:542` — becomes `= ANY($n::portal.notification_type[])`;
  a `::text[]` cast against the enum column is 42883 (rehearsed). Id and
  text columns keep `= ANY($n::int[])` / `= ANY($n::text[])`.
- **Dynamic placeholders** (since the sync): `routes/activityLogs.js:86-114`
  builds its WHERE from `?` lists at request time, so the port numbers its
  `$n` with a counter where the list is built — the same rule the two
  `SET ${columns}` sites in `grades.js` (`:1649, :1789`) already need.
- **Time**: `NOW()` → `portal.now_s()`, `NOW(3)` → `portal.now_ms()`,
  `CURRENT_TIMESTAMP` → `portal.now_s()`, intervals and differences per `02` C.6.
- **Error bodies unchanged**: the uniform `{ success: false, message }`
  shape and the 404-vs-403 convention are route logic, untouched.

## 2. Per-file inventory

| File | Sites | Constructs to port | Result-metadata readers | Notes |
|---|---|---|---|---|
| `routes/grades.js` | 92 (8 transactions) — 2026-10-24 lines | `IN (?)` ×8 (`:636, :1154, :1160, :1601, :1867, :2042, :2484, :2498`), `insertId` ×8 (`:1682, :2950, :3062` and the slot/component inserts around `:1567`), `affectedRows` ×3 (`:623, :2503, :3598`), `FOR UPDATE` ×2 (`:2239`, `:2427`), `IS NULL,` ordering ×3 (`:2027, :2760` + summary), dynamic `SET ${columns}` ×2 (`:1649, :1789`), `(… IS NOT NULL OR …) AS has_value :2423` (boolean → `Number()` reads it, measured), `is_locked = 0/1/?` ×5. **Since the sync (B1, feat/grade-acknowledgement):** `loadTermLockState` `:587-590`, `clearTermAcknowledgement`'s DELETE `:618`, `acknowledgementsFor` `:632-636` (`IN (?)` → `= ANY($n::int[])`, rehearsed), the new `POST /acknowledgements` transaction `:2236-2266` with `SELECT … FOR UPDATE` `:2239` and the INSERT `:2266` (a repeat is 23505, the term range 23514 — both rehearsed), the unlock's count `:2484`, the single-lock hook `:3620` | `insertId` → `RETURNING id`; `affectedRows` → `rowCount` (same matched-rows meaning as mysql2's default FOUND_ROWS, measured) | the highest-risk file; port it last among the modules and run `test:grades`, `test:class-record`, `test:class-summary`, `test:grade-locks`, `test:grade-acknowledgements`, `test:notifications`, `test:dashboard` |
| `routes/users.js` | 31 — 2026-10-24 lines | `CAST(role AS CHAR)` / `CAST(status AS CHAR)` (`:437-438`) → `role::text`, `status::text` (measured ordering); `LIKE` on `login_id` `:421` → `login_id COLLATE "C" ILIKE $n` (D-3) and `name ILIKE`; `NOT (email <=> ?)` `:556` → `email IS DISTINCT FROM $n`; `NOW(3)` `:723`; `insertId` ×2 sites (`:89-95`, `:193-204`; the audit lines reuse the same id since B2) | `insertId` | `must_change_password = 1` literal stays; the two INSERT column lists lost `email` and `contact_number` (B5, 2026-10-21) |
| `routes/content.js` | 30 (1 transaction, the delete-with-notifications) | `insertId` ×3 (`:321, :488, :695`); `LIMIT ? OFFSET ?` ×3 | `insertId` | audience SQL is plain. **PORTED (P3-C-R2 Phase F, 2026-10-25):** `RETURNING id` ×3, `pool.connect()`, pg result shapes; the nullable `category` sort leads with `(a.category IS NOT NULL)` so NULLs sort first ascending as on MySQL; the category filter `a.category COLLATE portal.ci = ?` (MySQL's `_ci` equality). `test:content` 97/97 on PostgreSQL |
| `routes/auth.js` | 24 — 2026-10-24 lines | `NOW(3)` ×3 (`:234, :324, :743`), `NOW()` ×3 (`:827, :861, :951`), `affectedRows === 0` ×3 (after `:324, :861, :951`) — all guarded `WHERE`s, so matched-rows semantics are identical (rehearsed `password.second_first_password_is_refused`, `contact.confirm_with_changed_number`) | `affectedRows` | `WHERE u.login_id = ?` depends on `portal.ci` (rehearsed lowercase match); the password alert (B6) adds no SQL here — its one SELECT is `utils/passwordAlert.js` |
| `routes/students.js` | 19 | `CONCAT(s.first_name, " ", s.last_name) LIKE ?` `:130` — the **double-quoted string** is an identifier in PostgreSQL (42703, measured) → `concat(s.first_name, ' ', s.last_name) ILIKE $n` (+ `unaccent` per D-1); `insertId` ×2 (`:318, :324`); `affectedRows === 0` `:490` (guarded) | both | `section_id` resolution unchanged |
| `routes/attendance.js` | 18 (1 transaction) | `ON DUPLICATE KEY UPDATE … VALUES(col)` ×2 (`:416, :510`) → `ON CONFLICT (student_id, date) DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by` (rehearsed, trigger-correct); `IN (?)` ×2 (`:487, :517`) | none | `date` stays a string both ways. **PORTED (Phase F):** both upserts as written, `= ANY(?::int[])` ×2, `pool.connect()`, the bulk loop binds each id in turn, the bulk read-back `ORDER BY student_id` (a PostgreSQL heap does not return rows in insertion order). `test:attendance` 73/73 |
| `routes/excuses.js` | 16 — 2026-10-24 lines | `insertId` `:242-248`; `TEACHER_VIEW_SCOPE_SQL` ×3 (plain EXISTS); **since B8** the parent's edit `:340` re-checks `status = 'Pending'` inside the UPDATE and reads `affectedRows`; the review's UPDATE moved into `utils/excuseAttendance.js` | `insertId`, `affectedRows` | review `UPDATE` bumps `updated_at` via the trigger (rehearsed). **PORTED (Phase F):** `RETURNING id`, `edit.rowCount`, pg result shapes. `test:excuses` 121/121 on PostgreSQL |
| `utils/excuseAttendance.js` (B8, since the sync) | 6 (1 transaction) | the review and the day in ONE transaction `:95-149`: the letter's guarded UPDATE `:99` (`affectedRows` `:103`), `SELECT … FOR UPDATE` ×2 (`:107, :109`), the day's INSERT `:117` / UPDATE by id `:124`, the read-back `:126`; `isWriteConflict` `:77-81` already lists `23505`, `40P01`, `40001` beside the MySQL codes | `affectedRows` | rehearsed: an unrecorded class day inserted as Excused, Absent → Excused by id, a duplicate day is 23505; `test:excuses`, `test:excuse-attendance-rule` (pure, no database). **PORTED (Phase F):** `pool.connect()`, `letter.rowCount`, pg result shapes; **`SET LOCAL lock_timeout = '50s'`** as the transaction's first statement — MySQL's own wait (`innodb_lock_wait_timeout` 50, measured on the source server 2026-10-25), because PostgreSQL waits forever by default — and **`55P03`** (lock_not_available) added to the conflict codes; the comment now says how the race differs (READ COMMITTED, no gap locks: the second INSERT waits on the unique index, then 23505; neighbouring days no longer meet). The rule suite's stub pool is pg-shaped; +2 assertions (55P03 is a conflict; every review transaction sets the timeout first), each failing under its mutation (no SET LOCAL, no 55P03, timeout 0, SET before BEGIN). `test:excuse-attendance-rule` 60/60 |
| `routes/activityLogs.js` (B2, since the sync) | 4 | the WHERE is BUILT from `?` placeholders `:86-114` (`created_at >= ?` / `< ?` with JS `Date` instants from `utils/manilaTime.js`, `u.role = ?`, `a.user_id IS NULL`, `a.action = ?`, `IN (?, ?, …)` / `NOT IN (?, ?, …)` written out by `placeholders()` `:52`) — the one site that must NUMBER its `$n` with a counter; `COUNT(*)` `:143`, the page `:166` (`LIMIT ? OFFSET ?`, `ORDER BY a.created_at DESC, a.id DESC`), `SELECT DISTINCT action` `:188`, the export `:236` (a bare `LIMIT ?`); `description` is never selected — port that as it is | none | rehearsed: Date bounds on `created_at`, `= ANY($n::text[])` for a group, `<> ALL($n::text[])` for Other, a newest-first page of 50, the export's count equal to the total; `test:activity-log`. **PORTED (Phase F):** four result shapes only — `?` stays at the call site and the adapter numbers it, so `placeholders()` needs no counter |
| `utils/passwordAlert.js` (B6, since the sync) | 1 | one SELECT by id `:61` | none | runs after the reply, never awaited; no SQL change in its four callers |
| `routes/messages.js` | 16 | `ROW_NUMBER() OVER` ×2 (portable, rehearsed), `GROUP_CONCAT(DISTINCT … ORDER BY … SEPARATOR ', ')` ×2 (`:279, :293`) → `string_agg(DISTINCT x, ', ' ORDER BY x)` (measured), `CONCAT` ×3 → `concat()`, `COALESCE` (same), `LIKE` `:235` → **the `config/db.js` name fold, `foldedSql(u.name)` / `foldedSql(st.student_name)` `LIKE foldedContains(term)` (the owner's Q5 (b); supersedes the earlier `ILIKE`, which would have missed `nino` → `Niño`)**, `read_status = 0/1`, `insertId` `:430`, `affectedRows` `:497, :500` (count of rows updated, guarded by `read_status = 0`) | both | the window query ported verbatim in `rehearse.js`. **PORTED (Phase F):** as listed, plus the nullable `student_name` and `last_message_at` sorts leading with an `IS NOT NULL` key (MySQL's NULL placement). Ids past the int4 range are refused by `parseId()` (400) before any lookup, so `canMessage()` — outside the send handler's try — cannot fail with 22003. `string_agg` has no 1024-byte cap where `GROUP_CONCAT` had one (no current label near it). `test:messages` 86/86 |
| `routes/dashboard.js` | 14 | `SUM(email_verified_at IS NULL)` `:188` → `SUM((email_verified_at IS NULL)::int)`; `SUM(is_locked)` (smallint sum → number, measured); the rest are counts | none | readers already `Number()` everything |
| `routes/backups.js` | 13 | **replaced by `04`'s design**: no `mysqldump`, no one-off `multipleStatements` connection, no `stripBackupsTableDdl`, no `resetPool`; the cutoff upsert `:666` → `ON CONFLICT (id) DO UPDATE` inside the restore transaction; `COUNT(*) … created_at > ?` with a Date param (rehearsed) | `insertId` `:299` | the only module whose behaviour changes for the user (`04` §3) |
| `routes/assignments.js` | 11 | `error.code === 'ER_DUP_ENTRY'` `:241` → `'23505'` (measured, rehearsed with a case-variant section); `insertId` `:232`; `IS NULL,` ordering ×2 | `insertId` | `uq_teacher_assignment` on `portal.ci` section |
| `utils/notify.js` | 12 — 2026-10-24 lines | `INSERT IGNORE … VALUES ?` `:193` → multi-row `INSERT … ON CONFLICT DO NOTHING` built from the recipient list (duplicates inside one batch are fine with DO NOTHING — measured; DO UPDATE would be 21000); `rowCount` = rows actually inserted (same as `affectedRows` under INSERT IGNORE, measured); **since B1** `removeTypedNotifications` `:230, :235` — `type IN (?)` on the ENUM column → `= ANY($n::portal.notification_type[])` (rehearsed: recipients 2, rowCount 2; `::text[]` is 42883) | none | fan-out rehearsed with a duplicate recipient; the two new labels `grades_locked` / `grades_acknowledged` insert and repeat as the older ones (rehearsed) |
| `utils/authCodes.js` | 10 | `NOW() - INTERVAL 1 HOUR` ×2, `NOW() + INTERVAL ? MINUTE` `:95` → `portal.now_s() + make_interval(mins => $n)`, `TIMESTAMPDIFF(SECOND, created_at, NOW())` `:71` → `floor(extract(epoch from (portal.now_s() - created_at)))::int` (truncation, measured), `NOW()` ×5 | none | the hourly limits and the 60 s cooldown rehearsed |
| `routes/notifications.js` | 8 — 2026-10-24 lines | `CURRENT_TIMESTAMP` ×3 (`:446, :511, :549`) → `portal.now_s()`; `affectedRows` ×2 (after `:511`, `:549`; guarded `read_at IS NULL`); **since the sync:** the visit clear (B3) `:542` — a SELECT of ids with `n.type IN (?)` on the ENUM column → `= ANY($n::portal.notification_type[])`, then `:549` UPDATE with `id IN (?)` → `= ANY($n::int[])` (rehearsed: ids 1, rowCount 1); the parent clause's `NOT EXISTS` on `grade_acknowledgements` `:104` (B1; rehearsed as the self-heal) and the adviser clause for grade rows `:147-151`, both plain SQL; `:185` one more LEFT JOIN | `affectedRows` | rehearsed read-all |
| `routes/settings.js` | 5 (1 transaction) | `IN (?)` ×2 (`:142, :174`) → `= ANY($1::text[])` (works on the `portal.ci` column, rehearsed); `ON DUPLICATE KEY UPDATE` ×2 (`:230, :286`) → `ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value` (rehearsed, case-variant key hits the same row) | none | **PORTED (Phase F):** as listed, plus `ORDER BY id` on the allow-listed read (MySQL scanned in primary-key order, measured; a PostgreSQL heap returns an updated row later, so the object's key order would drift). `test:settings` 35/35 |
| `utils/loginThrottle.js` | 5 | `NOW() - INTERVAL ? MINUTE/HOUR` ×3 → `make_interval(mins => $n)` / `(hours => $n)`; `cleared = 0/1` | none | rehearsed: 5 failures, clear, prune |
| `routes/sections.js` | 5 | plain | none | |
| `middleware/auth.js` | 2 | the policy-count subquery with `pa.document = ?` (enum vs text param, measured OK) | none | `policy_accepted` is a number (int8 parser) — the code's `Number()` stays |
| `socket.js` | 2 | same as the middleware | none | |
| `routes/gradingModes.js` | 2 | plain | none | the `grading_mode` wrapper shape is route logic. **PORTED (Phase F):** two result shapes. `test:grading-modes` 13/13 |
| `routes/policy.js` | 1 | `INSERT IGNORE` `:95` → `ON CONFLICT (user_id, document, version) DO NOTHING`; `affectedRows` `:98` → `rowCount` (0 on the ignored row, measured) | `affectedRows` | rehearsed |
| `utils/policy.js` | 1 | `(document = ? AND version = ?)` list — plain | none | |
| `utils/activity.js` | 1 | plain insert | none | |
| `server.js` | 1 | `SELECT 1` health | none | `"db":"ok"` unchanged |
| `config/db.js` | — | replaced: pg Pool + the three type parsers; `dateStrings` has no pg equivalent — the DATE parser is the contract | — | first file of the port |
| `utils/dbUnavailable.js` | — | add SQLSTATE classes | — | with `config/db.js` |

Counts by construct (precise greps, not the regex flags; re-counted
2026-10-24 for the constructs the sync touched, the rest unchanged): `IN (?)`
16 (10 on 2026-10-19) · `VALUES ?` 1 · `ON DUPLICATE KEY` 5 · `INSERT IGNORE`
2 · `NOW(3)` 4 · `NOW()` 17 · `CURRENT_TIMESTAMP` 3 (2) · `INTERVAL` 6 ·
`TIMESTAMPDIFF` 1 · `GROUP_CONCAT` 2 · `CONCAT` 4 (one with a double-quoted
literal) · `CAST(… AS CHAR)` 2 · `FOR UPDATE` 4 (1) · `LIKE` 3 · `<=>` 1 ·
`insertId` 18 · `affectedRows` 14 (10) · `ER_DUP_ENTRY` 1 · `SUM(expr IS
NULL)` 1 · boolean-expression columns 1 · `LIMIT ? OFFSET ?` 17 (16) plus one
bare `LIMIT ?` · `IS NULL,` null-last ordering 4 · transactions 12 (10) ·
dynamic `?`-list builders 1 (`activityLogs.js`) · `multipleStatements` 1
(removed with the restore).

## 3. Parameters, arrays, batches, conflicts (the review list)

| Item | Finding | Port rule |
|---|---|---|
| Scalar params | mysql2 `?` → `$n`; a value used twice (e.g. `is_locked = ? … is_locked <> ?`) is one `$1` reused | reuse the same `$n` |
| Array params | mysql2 expands `IN (?)`; **an empty array is a parse error on MySQL today** (`IN ()`, measured), so no caller passes one | `= ANY($n::int[])`; an empty array returns no rows with no error (measured) — strictly more forgiving |
| Bulk inserts | `VALUES ?` nested arrays (notify) | build `($1,$2,…),($7,…)` from the list; pg's 65,535-parameter limit allows ~10,000 notifications per statement — chunk at 500 rows like `transfer.js` |
| Duplicate keys inside one upsert batch | notify dedupes recipients with a `Set` before inserting | `ON CONFLICT DO NOTHING` tolerates duplicates anyway (measured); never use `DO UPDATE` for the fan-out (21000) |
| Explicit conflict targets | MySQL infers the key | name it: `(student_id, date)`, `(setting_key)`, `(id)`, `(user_id, document, version)`; the fan-out's `DO NOTHING` may stay target-less |
| `INSERT IGNORE` | ignores every error class on MySQL | `ON CONFLICT DO NOTHING` ignores **unique** conflicts only; an FK or CHECK violation now raises — which is the better behaviour and what the routes validate for already |
| `RETURNING` | — | every `insertId` site re-selects the row right after the insert today (`SELECT * … WHERE id = ?`); keep that second read (it returns the DB-computed defaults) and take the id from `RETURNING id` |
| Result-count branches | 10 `affectedRows` readers, all after `UPDATE`/`DELETE`/`INSERT IGNORE` with a guarding `WHERE` | `rowCount`; semantics identical (matched rows on both — measured with mysql2's default flags) |
| Error classification | `ER_DUP_ENTRY` → 409 in assignments; outages via Node/mysql2 codes | `23505` → 409; `23503`/`23514`/`23502` → 500 as today (they are validation bypasses); outages: Node socket codes + `08000/08003/08006` (connection), `57P01/57P02/57P03` (shutdown), `53300` (too many connections), `28P01` (auth), `3D000` (missing database) → 503 |
| SQL functions | `CONCAT`, `GROUP_CONCAT`, `CAST`, `TIMESTAMPDIFF`, `NOW`, `INTERVAL` | all mapped above and measured |
| Strings | one double-quoted literal (`students.js:130`) | single quotes |
| Aggregates | `COUNT(*)` bigint → number (parser); `SUM(int)` → number; `SUM(numeric)` → string; `SUM(bool-expr)` needs `::int` | measured |
| Enum params | text params compare to enum columns directly; labels are case-sensitive | routes validate the vocabulary first (they do) |
| Type conversions | DECIMAL strings pass through; DATE strings pass through; Date params for timestamptz work (rehearsed `created_at > $1` with a Date) | none needed at call sites |

## 4. Concurrency checks (measured, `semantics.js` F)

| Operation | Today (MySQL RR + InnoDB) | PostgreSQL (RC) | Verdict |
|---|---|---|---|
| Bulk grade lock: `SELECT … FOR UPDATE` then `UPDATE … WHERE id IN … AND is_locked <> ?` | second locker blocks, then sees the committed value | same (blocks, then sees `is_locked = 1`) | keep |
| Single lock: guarded `UPDATE … WHERE is_locked <> ?` without a transaction | one of two concurrent lockers changes 1 row | measured `[0, 1]` | keep |
| Attendance bulk upsert on the same key from two advisers | last writer wins, no error | same (measured) | keep; the API's "second recorder takes over" note holds |
| Concurrent `INSERT` of the same grade row | one `ER_DUP_ENTRY` | one `23505` (measured) | map to the same 409/retry path |
| Class-record PUT (plain SELECTs then writes in one transaction) | RR snapshot for the reads, blocking writes | RC: reads see later commits; writes proceed | keep RC. Switching these transactions to REPEATABLE READ would make PostgreSQL abort with 40001 on a write after a concurrent commit (measured) where MySQL blocks and proceeds — a new failure mode, not a safety gain |
| Lost-update check under RC | — | two increments both land (measured) | fine |

## 5. Implementation order (each step runs the suites that WRITE through it)

1. `config/db.js` + `utils/dbUnavailable.js` + a `query`/`getClient` helper; `test:auth-middleware`, `test:socket-auth`, `test:cors-origins` (stubs; prove the shape).
2. `middleware/auth.js`, `socket.js`, `utils/policy.js`, `utils/accountGates.js` (no SQL change), `routes/policy.js`, `utils/loginThrottle.js`, `utils/authCodes.js`, `routes/auth.js`; `test:auth`, `test:privacy`, `test:recovery`, `test:socket-auth`.
3. `routes/users.js`, `routes/sections.js`, `routes/students.js`, `routes/assignments.js`, `routes/gradingModes.js`, `utils/activity.js`, `utils/passwordAlert.js` (since the sync); `test:users`, `test:sections`, `test:students`, `test:assignments`, `test:grading-modes`, `test:profile-photo`.
4. `utils/notify.js`, `routes/notifications.js`, `routes/content.js`, `routes/excuses.js` with `utils/excuseAttendance.js` (since the sync), `routes/messages.js`, `routes/settings.js`, `routes/attendance.js`; `test:notifications`, `test:content`, `test:excuses`, `test:excuse-attendance-rule` (pure), `test:messages`, `test:settings`, `test:attendance`.
5. `routes/grades.js`, `routes/dashboard.js`, `routes/activityLogs.js` (since the sync); `test:grades`, `test:class-record`, `test:class-summary`, `test:grade-locks`, `test:grade-acknowledgements`, `test:dashboard`, `test:activity-log`.
6. `routes/backups.js` per `04`; `test:backups`, `test:restore` rewritten for the archive format (they assert mysqldump specifics today: `CREATE DATABASE` in the file, `stripBackupsTableDdl`). **BUILT — commit 6 (2026-10-25):** `utils/backupArchive.js` + `routes/backups.js` (the owner's P4 with Q3 (a) and Q4 (a); `04` lists where the build differs from its design text), the Admin → Backup & Restore page's engine and format, `test:backups` 63, `test:restore` 39, `test:privacy` 85 (its six restore checks rewritten on a scratch schema), `scripts/proof-backup-loop.js` ported in place, and `migration/scripts/reconstruct-archive.js`. `scripts/migrate-privacy.js` lost its one runtime caller, as step 7 foresaw.
7. `scripts/setup-db.js` → a PostgreSQL setup (`001_portal_schema.sql` + a ported `seed.sql`, then the ported seed Grade 1 block). Since B7 (2026-10-24) `setup-db.js` runs the schema, the seed as one multi-statement query, `backfillSectionIds()`, then `applyDemoGrade1()` from `scripts/demoGrade1.js`, which finds the learner by name, grade and section, inserts two slots (`insertId`), a two-row `grade_components` VALUES and updates the grade row guarded by `is_locked = 0` (`affectedRows`); the seed file itself still inserts the five letter-only grade rows. The eleven `migrate-*.js` (nine on 2026-10-19 plus `migrate-grade-acknowledgements.js` and `migrate-demo-grade1.js`) become **history** — **`migrate-demo-grade1.js` stays MySQL history by the owner's word (2026-10-25, after commit 5): it is a MySQL one-off whose rows are already in the copied data, it is not ported, and since commit 5 it would hand a mysql2 connection to the pg-shaped `demoGrade1.js`, so it is not to be run on this branch** — (the schema file already includes every migration's end state) except `migrate-privacy.js`'s one runtime caller (the restore) which `04` removes. `scripts/verify-grading-seed.js` (read-only SELECTs, one `IN (?)` at `:323`, `===` on counts) is retargeted with the suites.
8. The 24 HTTP suites' fixture/cleanup code (22 on 2026-10-19; `test:grade-acknowledgements` and `test:activity-log` since) — `mysql.createConnection(dbConfig)` → pg; `insertId` → `RETURNING`; `=== 1` flag assertions stay valid; the `test:privacy` scratch-database case becomes a scratch **schema**); `05` §3 has the retargeting rules.

### 5a. The split between the two sessions (the owner, 2026-10-25)

The order above is the dependency order; the WORK is split in two, as
rebalanced after commit F:

- **Session B (this branch):** commit F, `7e6382e` — step 1, step 2 and,
  because the auth, privacy and recovery suites' fixtures reach them, six
  files of steps 3–4: `routes/users.js`, `routes/students.js`,
  `routes/sections.js`, `routes/assignments.js`, `routes/notifications.js`,
  `utils/notify.js`; then commit 2 — step 5's `routes/grades.js` and
  `routes/dashboard.js` with the six grades and dashboard suites; then
  commit 5 — step 7, the setup, the seed, the Grade 1 demo block and the
  grading-seed verifier; then commit 6 — step 6, Backup & Restore.
- **Session A's half:** `routes/content.js`, `routes/excuses.js` with
  `utils/excuseAttendance.js`, `routes/messages.js`, `routes/settings.js`,
  `routes/attendance.js`, `routes/activityLogs.js` and
  `routes/gradingModes.js`, with their suites. **It starts after Session A
  merges its two branches.**
- **That half was done HERE, on this branch (P3-C-R2 Phase F, 2026-10-25)** —
  the owner's addendum to the dispatch: "this session alone"; Session A stays
  idle on `main`. The seven files above are ported, with the excuse rule's
  lock timeout and `55P03`, `utils/validateId.js`'s int4 cap (`MAX_ID`, a
  documented 400) and the `GET /grades/:id` components' `NULLS FIRST`
  (review finding grades-1); the nine suites still on mysql2 — sections,
  assignments, content, attendance, messages, settings, notifications,
  profile-photo, activity-log — run on `test-helpers/db.js`. The figures are
  in `05` §0f.

Ported so far through `config/db.js`'s helpers: `?` stays at the call
sites and is numbered at the driver (the owner's Q1 (a)); the one search
fold lives in `config/db.js` (Q5 (b)); a `? IS NULL` parameter carries a
cast (42P18 otherwise, measured); a best-effort hook inside a transaction
runs in a SAVEPOINT, because a failed statement aborts a PostgreSQL
transaction where MySQL kept it open.

**Both `transfer.js` defects are REQUIRED MIGRATION CORRECTNESS WORK and are
CLOSED (P3-C-R2 Phase C, 2026-10-25; the owner's dispatch) — the closure
record follows the two findings as commit 7 measured them.**

**Defect C1 — stale AUTO_INCREMENT. Closed.** *Root cause:* MySQL 8 caches
`information_schema.TABLES.AUTO_INCREMENT` for `information_schema_stats_expiry`
seconds (86,400 by default); the transfer read it on a session at the default.
*Reproduction (`scripts/autoinc-fresh.js`, a disposable `parents_portal_migtest_*`
database, dropped and asserted gone):* rows inserted after the cache was
filled — the old session read next id 4 for a table whose highest id was 7
(the guard refused, as measured twice on the scratch); **an empty table whose
counter was moved to 500 — the old session read 1 and the guard PASSED** (an
empty table has no highest id to compare), so the old transfer would have
set that sequence to 1 silently, below every id MySQL had handed out; deleted
rows (highest id 5, next id 11) and a plain table read right on both. *Fix
(scoped to `migration/lib/mysql.js`):* `freshStatistics()` sets
`information_schema_stats_expiry = 0` on every `readOnly()` and `scratch()`
session — the transfer's, the reconcile's and every rehearsal's source — reads
the value back, and refuses (closes the session, throws) when it is not 0. The
transfer's own guards stay: a NULL AUTO_INCREMENT, one not above the highest
id, or one that is not a positive integer is a refusal. *After:* every case
reads the storage engine's value (`AUTOINC FRESH OK`), and the older scratch —
never `ANALYZE`d since it was made — transferred READY and reconciled (C2's
case 10). *Limitation:* the AUTO_INCREMENT is read after the source snapshot
starts, so an insert committed after the snapshot only raises it (the next id
is higher, never lower) — safe by construction, not by a cache.

**Defect C2 — sequence changes outside the transaction. Closed.** *Root
cause:* `setval()` is not transactional; a transfer that failed after its
sequence step rolled back its rows and kept every sequence (commit 7: 25 of 25
survived, 2 backwards, `login_attempts` at its own highest id). *Measured
(17.10):* `setval()` survives a ROLLBACK; `ALTER SEQUENCE … RESTART WITH` and
`ALTER TABLE … ALTER COLUMN … RESTART WITH` both roll back, and while one is
uncommitted a concurrent `nextval()` and an INSERT using the default both
WAIT (statement timeout 57014) — no other connection can take a value from
either state. `ALTER TABLE` is refused inside the transfer, though: with every
foreign key deferred the table has pending trigger events (55006, found by the
first run of the regression proof). *Fix (scoped to `scripts/transfer.js`):*
each sequence moves by `ALTER SEQUENCE <seq> RESTART WITH <AUTO_INCREMENT>`
inside the transfer's one transaction; before `BEGIN` every sequence's next
value is read on a separate connection, and after any failure a separate
connection checks each one is exactly there (`sequences_after_failure` in the
report); after the COMMIT a separate connection reads every sequence at the
source's AUTO_INCREMENT and above its table's highest id, and only then is the
report `ready: true` — anything else exits 1 (`TARGET NOT READY`). A failed
transfer is never ready. Six named failpoints (`MIGRATION_FAILPOINT`, honoured
on the disposable local target only, refused anywhere else). *Regression
evidence (`scripts/transfer-failures.js`, the real `transfer.js` and
`reconcile.js` as child processes, every state read on the proof's own
connection, each failure required to come from its NAMED point):* a failure
before the load, midway, immediately before the first sequence change, after
the last one, at the deferred foreign key's check at COMMIT, and in a trigger
raising at COMMIT — each exit 1, `ready` false, every row and all 25
sequences exactly as before, and each retry READY with `RECONCILE OK`;
sequences set below their tables' highest ids are refused by reconcile, left
as they were by a failed run (neither hidden nor worsened) and repaired by a
retry; sequences set 1,000 ahead are left by a failed run and put back at the
source's AUTO_INCREMENT by a retry; an older snapshot (20 lower values) is
READY and reconciles against itself, then the newest again; the concurrency
case above. `TRANSFER FAILURES OK`, 24 checks. `scripts/sequence-rollback.js`
(the commit 7 measurement) now reports 0 of 25 moved. *Limitations:* a
sequence another session moves AFTER the COMMIT is outside any transfer
(reconcile reports it); the readiness check reads the sequences once, right
after the COMMIT — a target is the application's only once reconcile has also
passed (`07` keeps both gates).

**Commit 7 (2026-10-25) — the proof gaps, the golden master and the token
fix (`05` §0c).** Two findings about `scripts/transfer.js`, measured, **not
fixed here** (the script is outside that commit's whitelist):

1. **A failed transfer rolls back its rows, not its sequences.** Failed at
   COMMIT after every sequence step, the target held exactly its old rows
   while all 25 sequences stood at the source's AUTO_INCREMENT — two moved
   backwards, one (`login_attempts`) at or below its own highest id.
   `setval()` is not transactional. **Rule until it is fixed: after a failed
   transfer, run the transfer again before anything else touches the
   target** (it resets every sequence — measured). The fix: capture the
   sequences before `BEGIN` and put them back in the catch, as the restore
   does (`server/utils/backupArchive.js`).
2. **The transfer reads AUTO_INCREMENT from a cache.** MySQL 8's
   `information_schema.TABLES.AUTO_INCREMENT` is cached for the statistics
   expiry (a day by default): after inserts on the source the figure is stale,
   and the transfer's guard refuses (`AUTO_INCREMENT … is not above MAX(id)`,
   measured on the scratch). At cutover the live database will have been
   written minutes earlier. The fix: `SET SESSION information_schema_stats_expiry
   = 0` on the read-only session (`lib/mysql.js readOnly()`), or `ANALYZE
   TABLE` on the source first — an own dispatch, before the cutover rehearsal.

The golden master agrees on every ported endpoint for the three roles; its
37 differences are this split's other half, the seven route files whose
reads still destructure mysql2's `[rows]`. `middleware/auth.js` and
`socket.js` now refuse a token with no numeric `iat` (KNOWN_ISSUES).

## 6. Open questions carried to the port

- **Q-12** accent-insensitive search (D-1). **Q-13** name ordering (D-2).
- `req.ip` behind a proxy (`trust proxy`) — deployment, flagged in Phase 1.
- `JWT_SECRET` continuity across the move (`07`).
