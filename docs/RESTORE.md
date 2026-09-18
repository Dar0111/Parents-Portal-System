# RESTORE — built (full text)

> The full design record for `POST /api/backups/:id/restore`: every guard, the two live-restore bugs and how each was found, and what `npm run test:restore` deliberately never does. Code comments in `server/routes/backups.js` and `server/scripts/test-restore-flows.js` cite "CLAUDE.md's RESTORE section"; that heading still exists there as the summary, and this file is the text they mean.
> Moved out of `CLAUDE.md` on 2026-09-18 verbatim so that file fits Claude Code's 150k-char limit. `CLAUDE.md` holds the condensed version and wins on any present-tense claim; if the two disagree, the code is correct and both must be fixed.
> Dated entries record what was true on their date and are never back-edited.

`POST /api/backups/:id/restore`, admin only, `routes/backups.js`. Restoring
drops and recreates the whole database; a bad implementation is
unrecoverable in a way almost nothing else in this system is. Every guard
below is in the shipped code, not a plan:

- **Source validation is structural.** The only input is `backups.id` —
  there is no file upload path and no arbitrary filename parameter
  anywhere in the handler. The row is loaded first (`404` if missing, a
  separate `404` naming it specifically if the file is gone from disk),
  ahead of the password/`confirm_filename` checks — the spec this was
  built from listed those first, but `confirm_filename` can't be verified
  without knowing the real filename to compare against, so the load moved
  first. Flagged and confirmed as no security cost: any admin can already
  see every backup's filename for free via `GET /api/backups`, so a `404`
  before step-up auth reveals nothing new.
- **Step-up auth.** `password` is re-verified against the caller's own
  bcrypt hash — `400` if missing, `403` "Incorrect password." if wrong
  (both were `401` until 2026-09-15; the token is valid, and a 401 told the
  client the session was dead). Every step-up and `confirm_filename`
  refusal is logged as `restore_refused` (see KNOWN ISSUES for the caveat).
  An open admin session is not authorization for a total, irreversible
  data wipe on its own.
- **Type-the-name confirmation.** `confirm_filename` must exactly match
  the backup's real filename — `400` naming both the value sent and the
  real one, so a typo is obviously a typo, not just "bad request."
- **Automatic safety dump of the current state, before touching
  anything.** Same `createBackupRecord()` machinery as a manual backup,
  named `pre_restore_<timestamp>.sql`. If this fails for any reason, the
  restore aborts outright and nothing is changed — this is the single
  most important line in the feature.
- **`backups`' own data is excluded from every dump.** Found by hand
  during the first live restore, not by the automated suite (see below)
  — `GET /api/backups` came back empty afterward, and not just for the
  safety dump. The `backups` table is uniquely self-referential: it's the
  table you consult to find the file you're restoring *from*. A row is
  only ever inserted after its own file finishes dumping
  (`createBackupRecord`), so a backup's file can never contain its own
  row — and restoring any backup rewinds `backups` to a state missing
  that row, the safety dump's row taken moments earlier, and the row of
  *every other* backup taken after the one being restored from. Their
  files stay on disk, untouched; the table just stops knowing they exist.
  Fixed at the source: `dumpDatabase()` runs `mysqldump` twice —
  `--ignore-table=<db>.backups` on the main dump (full structure + data
  for every other table), then a second `--no-data` pass appended for
  `backups` alone, so the file still creates an empty `backups` table
  (a bare-metal restore done by hand, outside this API, still ends up
  with a real table, not one requiring `schema.sql` to be reapplied) but
  never repopulates it with stale rows. Considered and rejected: re-
  inserting the two rows the handler happens to hold references to after
  a restore — that only patches what one operation touched directly, not
  backup #6 or #7 taken between the source dump and the restore, whose
  rows are equally gone and whose files are equally still on disk.
  **That fix was incomplete — found in a second live restore.** The
  `--no-data` pass still writes `DROP TABLE IF EXISTS \`backups\`` right
  before the empty `CREATE TABLE`, and the restore endpoint executed the
  entire file verbatim — so that DROP+CREATE ran against the *live* table
  too, on every restore, unconditionally wiping it to zero rows
  regardless of which backup was restored from (confirmed live: restoring
  from backup #1 also erased backup #2, taken after #1's dump and
  therefore never in #1's file under either version of this fix). Content-
  inspecting the dump for "no `INSERT INTO backups`" — the test written
  for the first bug — passed the whole time; it verified the anticipated
  symptom, not the actual mechanism of harm. `--ignore-table` can't be
  applied to the second pass either, since that pass exists specifically
  to *include* `backups`' `CREATE TABLE` for a bare-metal restore — one
  mysqldump invocation can't both include and exclude the same table.
  Fixed by splitting the concern instead of the file: the dump on disk is
  unchanged (still has a real `CREATE TABLE backups`, still useful for
  recovery outside this API); a new `stripBackupsTableDdl()` in
  `routes/backups.js` removes just `backups`' table block — matched on
  mysqldump's own `-- Table structure for table` comment convention, not
  a marker only new dumps would carry, so it also protects every backup
  file already on disk from before this fix, including ones from the
  original bug with stale rows — from the SQL string the restore
  connection actually executes. Verified four ways: the function against
  the real dump that exposed the bug (DROP/CREATE gone from the executed
  string, `users`/`auth_security_state` untouched); the *stripped* SQL
  executed for real against a disposable scratch database (name-
  redirected, dropped immediately after) — 18 tables created, `backups`
  correctly absent rather than present-and-empty, real data restored;
  a permanent regression test in `test:backups` doing the same
  content-level check; and — the actual proof, once the fix was in — a
  real live restore against the shared dev DB: `GET /api/backups`
  afterward showed three rows, both backups and the safety dump, all
  present, `activity_logs_wiped: 2` in the response confirming that
  marker fires too. Zero rows survived before this fix; three survived
  after.
  `activity_logs` does **not** get the same treatment — reverting it to
  the backup's point in time is the *correct* behavior for a snapshot
  restore, same as any other domain table losing rows written after that
  point; it isn't self-referential the way `backups` is. One narrow
  exception inside `activity_logs` has the identical shape, though:
  verified live, only the `restore_backup` entry survives a restore (it's
  logged *after* the restore SQL runs); the safety dump's `create_backup`
  entry is provably wiped by the very restore it documents, for the same
  reason `backups`' own row used to be. Not fixed the same way `backups`
  was (re-logging both writes after the restore completes, so nothing is
  actually lost) — instead, `restore_wiped_activity_logs`: the handler
  counts `activity_logs` rows newer than the restored backup's
  `created_at` right before the restore SQL runs (as late as possible, so
  it's exact, and naturally includes the safety dump's own entry), then
  writes one marker row *after* the restore completes — same timing as
  `restore_backup` — naming the source backup, its `created_at` as the
  boundary, and the exact count lost. The wipe itself still happens; the
  marker only makes it stop being silent. It's also not tamper-proof — an
  admin with direct DB access could delete the marker row same as any
  other — accepted deliberately: not silent is still better than silent.
  Response body carries `activity_logs_wiped: <count>` too, so the acting
  admin sees it immediately, not only in the log. `GET /api/backups` now also reconciles the table against
  `server/backups/` on every read and returns any `.sql` file with no
  matching row as `orphaned_files` — read-only, never auto-inserted; an
  unexpected file is reported, not silently adopted into the table as
  though the system created it, since a fabricated `created_by` would be
  a guess no one could vouch for. Every orphan this feature has produced
  across its two live-restore bugs — the original all-rows-wipe and the
  later DROP-TABLE wipe, five files total — was adopted by hand, once
  each, as a data fix, not automatically, and only after each underlying
  bug was actually fixed and confirmed by a live restore, so adopting
  never masked a still-broken state: `backups.created_by` is `ADMIN001`,
  `created_at` taken from the file's own mtime, and each is recorded in
  `activity_logs` as `manual_backup_adoption`, distinct from
  `create_backup`, so the log stays honest about how those rows actually
  came to exist. `backups` held 8 rows this way on 2026-08-29.
  **That count went stale on 2026-09-07 and was never updated — corrected
  2026-09-13.** The `db:setup` that seeded the Grade 1 fixture dropped and
  recreated the whole database (`users` and `backups` both show
  CREATE_TIME 2026-09-07 21:08), wiping the 8 adopted rows. Evidence:
  `backups` AUTO_INCREMENT is 9 and every row since is from `test:backups`
  runs (8 `create_backup` / 4 `delete_backup` entries in `activity_logs`),
  all cleaned up — so the table held 0 rows, and the `.sql` files on disk
  had no rows (`GET /api/backups` lists unmatched files as
  `orphaned_files`). **No longer 0 since the 2026-09-15 browser-check
  restore** (it left the manual backup it restored from and its
  `pre_restore_` safety copy); verify the count against the database
  before quoting one. The ten pre-2026-09-13 files are still orphans, and
  the check left an eleventh — a truncated dump (KNOWN ISSUES). **Do not "restore" the 8 by recreating rows from
  memory**; a fabricated `created_by` is the guess the adoption rule refuses.
- **The restore itself runs on a dedicated one-off `mysql2` connection**
  (`multipleStatements: true`), never the shared pool — the pool's
  existing connections would error once the database they're attached to
  is dropped and recreated underneath them mid-restore.
  `multipleStatements` is safe specifically because this SQL always comes
  from our own `mysqldump` output via a tracked `backups` row, never from
  user-supplied text; if this endpoint ever took an uploaded file
  instead, this stops being safe. MySQL does not support transactional
  DDL — `DROP DATABASE`/`CREATE DATABASE` auto-commit, so a failure
  partway through the dump SQL cannot be rolled back. That failure path
  gets its own message, distinct from every other error in this handler:
  it names the safety dump's filename and says plainly that the database
  may be partially restored and manual recovery may be needed — the one
  message someone reads while panicking, so it doesn't just say "500."
- **The shared pool is reset after a successful restore**
  (`pool.resetPool()`, `config/db.js`) so the rest of the running app
  gets fresh connections against the now-restored database. `config/db.js`
  was restructured into a proxy object for this — `query`/`getConnection`
  delegate to whatever the current pool is, and `resetPool()` swaps that
  current pool for a new one. A plain `module.exports = newPool`
  reassignment couldn't do this: every file that already did
  `const pool = require('../config/db')` holds a direct reference to the
  original object, not a live binding, so a later reassignment would
  never reach them.
- **Every currently-active JWT is invalidated.** A restore can replace
  every `users` row with different data (different ids, different
  password hashes, accounts that didn't exist yet at backup time) — so
  the decision made is force-logout-everyone, the simplest and safest of
  the two options considered. Implemented via a new table,
  `auth_security_state` (single row, `id = 1`, `token_valid_after`),
  never a `system_settings` key — that table is readable by every
  authenticated role and writable by any admin through a generic form,
  neither appropriate for a value only the restore endpoint itself should
  ever touch. `middleware/auth.js`'s `authenticate` reads it on every
  request and rejects any JWT whose `iat` predates it, with a message
  that says why ("Session invalidated by a database restore").
- **Two activity log entries in sequence** — `create_backup` for the
  safety dump, then `restore_backup` — so the log reads as an honest
  two-step sequence, not one opaque event.
- **Synchronous, not async job tracking — a deliberate call, not a
  silent override of a requirement written for this same feature.** At
  this database's actual size, a dump/restore completes in well under a
  second; a status-polling endpoint would be complexity with nothing to
  report. **Trigger to revisit:** if this ever runs against a database
  large enough that a dump takes more than a few seconds, redesign as an
  async job with a status endpoint — don't let a synchronous request hold
  open indefinitely once that stops being true.

**What `npm run test:restore` (26/26) does and does not cover.** Every
pre-flight gate is tested for real over HTTP — admin-only, `parseId`,
missing backup, missing file on disk, missing/wrong password, wrong
`confirm_filename` — with confirmation that nothing was created, that each
refusal wrote one `restore_refused` entry without the typed password or file
name, and that `token_valid_after` is unchanged by the run. (Since
2026-09-15 the suite records the cutoff it finds — a real restore's, after
Darryl's — and puts exactly that back; it never deletes one.) `token_valid_after` itself is
tested in isolation using crafted JWTs with a deliberately chosen `iat`
(same secret, `jwt.sign(..., { noTimestamp: true })`) rather than real
logins timed around a wall-clock boundary — deterministic instead of a
race. What it deliberately does **not** do: trigger an actual restore. That
would `DROP DATABASE` on the same shared dev database every other suite,
the running `--watch` server, and manual testing all depend on, reset the
live pool inside the actually-running process mid-test, and invalidate
every session including whichever one is open right now. No request in the
suite ever combines the admin's *real* password with a backup's *real*
`confirm_filename` in the same call — every permission test gets at least
one of the two wrong on purpose, or fails an earlier gate first. A real
end-to-end restore is run once, manually, with `db:setup` ready
immediately after — not from the automated suite.

**What could have caught the `backups`-data bug above without a live
restore, and now does:** the consequence (empty `backups` table after
restore) genuinely needed a live restore to observe — that's exactly why
it surfaced by hand and not in `test:restore`. But the *precondition*
(a backup's file can never contain its own row) was checkable the whole
time, from a dump's content alone, with no restore involved — the same
content-inspection shape already used for `mysqldump` header/`CREATE
DATABASE` checks. `npm run test:backups` now asserts a real dump both
contains `CREATE TABLE backups` (structure survives) and contains no
`INSERT INTO backups` (no stale rows) — a direct regression test for the
`--ignore-table`/`--no-data` fix. If the flag is ever removed, this test
fails immediately, without needing another live restore to find out.
That gap — content-inspecting the dump for what restoring it would imply
about `backups` specifically — existed before this bug was found and
should have been written earlier; it wasn't a deliberate tradeoff the way
excluding a live restore from the suite was.

**That test still wasn't enough — it caught the stale-row bug and missed
the DROP TABLE bug living right next to it.** "No `INSERT INTO backups`"
says nothing about whether a `DROP TABLE` runs against the live table;
both bugs were findable by content-inspecting the same dump, and only one
check had been written. `npm run test:backups` now also asserts, against
a real dump, that `stripBackupsTableDdl()` — the function the restore
handler runs the SQL through before executing it — removes `backups`'
`DROP TABLE` and `CREATE TABLE` from what would actually run, while
leaving every other table's structure and data untouched. `npm run
test:backups` — 39 passing (was 35 after the first fix; four more
assertions here). The lesson: a content-inspection test proves what it
explicitly checks for, not "this dump is now safe to restore" in
general — the next thing to ask is "what else does executing this file
imply," not just "does this one anticipated symptom show up."

---

