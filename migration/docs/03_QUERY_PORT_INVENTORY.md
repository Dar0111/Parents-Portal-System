# 03 — Query-port inventory and implementation order

Derived on 2026-10-19 by `scripts/inventory-queries.js` (326 `.query(` call
sites in 24 application files — routes, utils, middleware, `socket.js`,
`server.js`; `scripts/` excluded) and by line-level greps for each
construct. The application port is **not** part of this phase; this is the
map it follows. Measured behaviour cited as "(measured)" is in
`rehearsal/semantics_local_*.json` and `rehearsal/rehearse_local_*.json`.

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
- **Transactions**: the 10 `getConnection()+beginTransaction()` blocks keep
  their shape on one leased pg client; isolation stays READ COMMITTED (D-5
  in `02`); the `FOR UPDATE` in the bulk lock stays; the guarded
  `UPDATE … WHERE is_locked <> ?` stays (both measured as race-safe).
- **Flags stay numbers**: `is_locked = $1` with `lock ? 1 : 0`; a JS
  boolean bound to a smallint is refused by pg (measured), so no site may
  start passing booleans.
- **Time**: `NOW()` → `portal.now_s()`, `NOW(3)` → `portal.now_ms()`,
  `CURRENT_TIMESTAMP` → `portal.now_s()`, intervals and differences per `02` C.6.
- **Error bodies unchanged**: the uniform `{ success: false, message }`
  shape and the 404-vs-403 convention are route logic, untouched.

## 2. Per-file inventory

| File | Sites | Constructs to port | Result-metadata readers | Notes |
|---|---|---|---|---|
| `routes/grades.js` | 82 (7 transactions) | `IN (?)` ×6 (`:1041, :1047, :1488, :1755, :1929, :2208`), `insertId` ×8 (`:1461, :1535, :1570, :2594, :2706` and the slot/component inserts), `affectedRows` ×2 (`:2213, :3239`), `FOR UPDATE :2153`, `IS NULL,` ordering ×3 (`:1915, :2426` + summary), dynamic `SET ${columns}` ×2 (`:1537, :1677`), `(… IS NOT NULL OR …) AS has_value :2149` (boolean → `Number()` reads it, measured), `is_locked = 0/1/?` ×5 | `insertId` → `RETURNING id`; `affectedRows` → `rowCount` (same matched-rows meaning as mysql2's default FOUND_ROWS, measured) | the highest-risk file; port it last among the modules and run `test:grades`, `test:class-record`, `test:class-summary`, `test:grade-locks`, `test:notifications`, `test:dashboard` |
| `routes/users.js` | 31 | `CAST(role AS CHAR)` / `CAST(status AS CHAR)` (`:421-422`) → `role::text`, `status::text` (measured ordering); `LIKE` on `login_id` `:405` → `login_id COLLATE "C" ILIKE $n` (D-3) and `name ILIKE`; `NOT (email <=> ?)` `:540` → `email IS DISTINCT FROM $n`; `NOW(3)` `:703`; `insertId` ×3 (`:76, :188, :196`) | `insertId` | `must_change_password = 1` literal stays |
| `routes/content.js` | 30 (1 transaction, the delete-with-notifications) | `insertId` ×3 (`:321, :488, :695`); `LIMIT ? OFFSET ?` ×3 | `insertId` | audience SQL is plain |
| `routes/auth.js` | 24 | `NOW(3)` ×3 (`:234, :319, :734`), `NOW()` ×3 (`:812, :846, :937`), `affectedRows === 0` ×3 (`:324, :850, :940`) — all guarded `WHERE`s, so matched-rows semantics are identical (rehearsed `password.second_first_password_is_refused`, `contact.confirm_with_changed_number`) | `affectedRows` | `WHERE u.login_id = ?` depends on `portal.ci` (rehearsed lowercase match) |
| `routes/students.js` | 19 | `CONCAT(s.first_name, " ", s.last_name) LIKE ?` `:130` — the **double-quoted string** is an identifier in PostgreSQL (42703, measured) → `concat(s.first_name, ' ', s.last_name) ILIKE $n` (+ `unaccent` per D-1); `insertId` ×2 (`:318, :324`); `affectedRows === 0` `:490` (guarded) | both | `section_id` resolution unchanged |
| `routes/attendance.js` | 18 (1 transaction) | `ON DUPLICATE KEY UPDATE … VALUES(col)` ×2 (`:416, :510`) → `ON CONFLICT (student_id, date) DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by` (rehearsed, trigger-correct); `IN (?)` ×2 (`:487, :517`) | none | `date` stays a string both ways |
| `routes/excuses.js` | 17 | `insertId` `:247`; `TEACHER_VIEW_SCOPE_SQL` ×3 (plain EXISTS) | `insertId` | review `UPDATE` bumps `updated_at` via the trigger (rehearsed) |
| `routes/messages.js` | 16 | `ROW_NUMBER() OVER` ×2 (portable, rehearsed), `GROUP_CONCAT(DISTINCT … ORDER BY … SEPARATOR ', ')` ×2 (`:279, :293`) → `string_agg(DISTINCT x, ', ' ORDER BY x)` (measured), `CONCAT` ×3 → `concat()`, `COALESCE` (same), `LIKE` `:235` → `ILIKE`, `read_status = 0/1`, `insertId` `:430`, `affectedRows` `:497, :500` (count of rows updated, guarded by `read_status = 0`) | both | the window query ported verbatim in `rehearse.js` |
| `routes/dashboard.js` | 14 | `SUM(email_verified_at IS NULL)` `:188` → `SUM((email_verified_at IS NULL)::int)`; `SUM(is_locked)` (smallint sum → number, measured); the rest are counts | none | readers already `Number()` everything |
| `routes/backups.js` | 13 | **replaced by `04`'s design**: no `mysqldump`, no one-off `multipleStatements` connection, no `stripBackupsTableDdl`, no `resetPool`; the cutoff upsert `:666` → `ON CONFLICT (id) DO UPDATE` inside the restore transaction; `COUNT(*) … created_at > ?` with a Date param (rehearsed) | `insertId` `:299` | the only module whose behaviour changes for the user (`04` §3) |
| `routes/assignments.js` | 11 | `error.code === 'ER_DUP_ENTRY'` `:241` → `'23505'` (measured, rehearsed with a case-variant section); `insertId` `:232`; `IS NULL,` ordering ×2 | `insertId` | `uq_teacher_assignment` on `portal.ci` section |
| `utils/notify.js` | 10 | `INSERT IGNORE … VALUES ?` `:194` → multi-row `INSERT … ON CONFLICT DO NOTHING` built from the recipient list (duplicates inside one batch are fine with DO NOTHING — measured; DO UPDATE would be 21000); `rowCount` = rows actually inserted (same as `affectedRows` under INSERT IGNORE, measured) | none | fan-out rehearsed with a duplicate recipient |
| `utils/authCodes.js` | 10 | `NOW() - INTERVAL 1 HOUR` ×2, `NOW() + INTERVAL ? MINUTE` `:95` → `portal.now_s() + make_interval(mins => $n)`, `TIMESTAMPDIFF(SECOND, created_at, NOW())` `:71` → `floor(extract(epoch from (portal.now_s() - created_at)))::int` (truncation, measured), `NOW()` ×5 | none | the hourly limits and the 60 s cooldown rehearsed |
| `routes/notifications.js` | 6 | `CURRENT_TIMESTAMP` ×2 (`:398, :427`) → `portal.now_s()`; `affectedRows` `:431` (guarded `read_at IS NULL`) | `affectedRows` | rehearsed read-all |
| `routes/settings.js` | 5 (1 transaction) | `IN (?)` ×2 (`:142, :174`) → `= ANY($1::text[])` (works on the `portal.ci` column, rehearsed); `ON DUPLICATE KEY UPDATE` ×2 (`:230, :286`) → `ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value` (rehearsed, case-variant key hits the same row) | none | |
| `utils/loginThrottle.js` | 5 | `NOW() - INTERVAL ? MINUTE/HOUR` ×3 → `make_interval(mins => $n)` / `(hours => $n)`; `cleared = 0/1` | none | rehearsed: 5 failures, clear, prune |
| `routes/sections.js` | 5 | plain | none | |
| `middleware/auth.js` | 2 | the policy-count subquery with `pa.document = ?` (enum vs text param, measured OK) | none | `policy_accepted` is a number (int8 parser) — the code's `Number()` stays |
| `socket.js` | 2 | same as the middleware | none | |
| `routes/gradingModes.js` | 2 | plain | none | the `grading_mode` wrapper shape is route logic |
| `routes/policy.js` | 1 | `INSERT IGNORE` `:95` → `ON CONFLICT (user_id, document, version) DO NOTHING`; `affectedRows` `:98` → `rowCount` (0 on the ignored row, measured) | `affectedRows` | rehearsed |
| `utils/policy.js` | 1 | `(document = ? AND version = ?)` list — plain | none | |
| `utils/activity.js` | 1 | plain insert | none | |
| `server.js` | 1 | `SELECT 1` health | none | `"db":"ok"` unchanged |
| `config/db.js` | — | replaced: pg Pool + the three type parsers; `dateStrings` has no pg equivalent — the DATE parser is the contract | — | first file of the port |
| `utils/dbUnavailable.js` | — | add SQLSTATE classes | — | with `config/db.js` |

Counts by construct (precise greps, not the regex flags): `IN (?)` 10 ·
`VALUES ?` 1 · `ON DUPLICATE KEY` 5 · `INSERT IGNORE` 2 · `NOW(3)` 4 ·
`NOW()` 17 · `CURRENT_TIMESTAMP` 2 · `INTERVAL` 6 · `TIMESTAMPDIFF` 1 ·
`GROUP_CONCAT` 2 · `CONCAT` 4 (one with a double-quoted literal) · `CAST(… AS
CHAR)` 2 · `FOR UPDATE` 1 · `LIKE` 3 · `<=>` 1 · `insertId` 18 · `affectedRows`
10 · `ER_DUP_ENTRY` 1 · `SUM(expr IS NULL)` 1 · boolean-expression columns 1 ·
`LIMIT ? OFFSET ?` 16 · `IS NULL,` null-last ordering 4 · transactions 10 ·
`multipleStatements` 1 (removed with the restore).

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
3. `routes/users.js`, `routes/sections.js`, `routes/students.js`, `routes/assignments.js`, `routes/gradingModes.js`, `utils/activity.js`; `test:users`, `test:sections`, `test:students`, `test:assignments`, `test:grading-modes`, `test:profile-photo`.
4. `utils/notify.js`, `routes/notifications.js`, `routes/content.js`, `routes/excuses.js`, `routes/messages.js`, `routes/settings.js`, `routes/attendance.js`; `test:notifications`, `test:content`, `test:excuses`, `test:messages`, `test:settings`, `test:attendance`.
5. `routes/grades.js`, `routes/dashboard.js`; `test:grades`, `test:class-record`, `test:class-summary`, `test:grade-locks`, `test:dashboard`.
6. `routes/backups.js` per `04`; `test:backups`, `test:restore` rewritten for the archive format (they assert mysqldump specifics today: `CREATE DATABASE` in the file, `stripBackupsTableDdl`).
7. `scripts/setup-db.js` → a PostgreSQL setup (`001_portal_schema.sql` + a ported `seed.sql`); the nine `migrate-*.js` become **history** (the schema file already includes every migration's end state) except `migrate-privacy.js`'s one runtime caller (the restore) which `04` removes.
8. The 22 HTTP suites' fixture/cleanup code (`mysql.createConnection(dbConfig)` → pg; `insertId` → `RETURNING`; `=== 1` flag assertions stay valid; the `test:privacy` scratch-database case becomes a scratch **schema**); `05` §3 has the retargeting rules.

## 6. Open questions carried to the port

- **Q-12** accent-insensitive search (D-1). **Q-13** name ordering (D-2).
- `req.ip` behind a proxy (`trust proxy`) — deployment, flagged in Phase 1.
- `JWT_SECRET` continuity across the move (`07`).
