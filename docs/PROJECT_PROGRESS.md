# CAPSTONE — Parent's Portal System

> Mirror of CLAUDE.md for reference when switching between tools.
> CLAUDE.md is authoritative. If the two disagree, CLAUDE.md wins.

**Captain H. Francisco Elementary School (Gr 1–6)**
**Sept 7, 2026** — system proposal checkpoint, **not** the final defense.
**Final defense** — expected around November 2026.

**Last updated:** 2026-09-03

> **Build order:** Database → Auth → Backend APIs → React Web → Expo

---

## Milestone tracker (roadmap — status, not percentages)

| Stage | Backend | Web | Mobile |
|-------|---------|-----|--------|
| Stage 1 — Foundation (schema, seed, auth API, auth tests) | ✅ | — | — |
| Stage 2 — Auth frontend (login, ProtectedRoute, 3 dashboards) | — | ✅ | — |
| Stage 3 — Backend modules (Student Records → … → Grades) | 🔨 | — | — |
| Stage 4 — Web pages (parent / teacher / admin) | — | ❌ | — |
| Stage 5 — Mobile (Expo) | — | — | ❌ |
| Stage 6 — Integration, deployment, demo polish | ❌ | ❌ | ❌ |

Stage 3 is 🔨: Student Records, Attendance, Announcements/Memos/Events,
Contributions, System Settings, User Management, Messages + Socket.io,
Backup/Restore, and Excuse Letters' CRUD half are fully built (see
CLAUDE.md's "RESTORE" section for what the automated suite deliberately
does not cover). `sections` (schema + 23-row seed) is also in — see
CLAUDE.md's "sections table — schema only, nothing reads it yet"; no
route reads `section_id` anywhere yet, deliberately. **The school-visit
answers have started arriving.** Grades' original four blockers are all
answered (DO 009/DO 015 s. 2026 — see CLAUDE.md's "BLOCKED / RESOLVED")
but not built. Excuse Letters' approve/decline has one of two blockers
resolved (record-only, no attendance mutation) and one still open (who
approves) — not built, not stubbed. See table below.

---

## Per-module breakdown

Schema = table exists in `schema.sql`. API = working endpoints exist in a
route file. Web = pages exist in `client/src`. Mobile = screens exist in an
Expo app (no Expo app exists yet, so this column is ❌ everywhere).

| Module | Schema | API | Web | Mobile | Notes |
|--------|--------|-----|-----|--------|-------|
| Authentication | ✅ `users` (status ENUM now `pending`/`active`/`rejected`/`inactive`) | ✅ 3 endpoints — login, me, change-password | ✅ Login page, `ProtectedRoute`, axios JWT interceptor | ❌ | 25/25 auth tests pass (`npm run test:auth`), idempotent — no `db:setup` needed between runs. Login round-trip verified in browser — admin → `/admin`, wrong password → inline error, pending account → inline message, refresh → spinner with no flash. `authenticate` and login both already had a generic `status !== 'active'` fallback, so adding `'inactive'` (for User Management) needed zero changes there — deactivation takes effect immediately, even on an already-issued JWT. `sanitizeUser()` hardened and moved to `utils/sanitizeUser.js` (was duplicated in `routes/auth.js` and `routes/users.js`) — now strips any key containing `password`, case-insensitive, not just the exact key; closes the aliased-JOIN gap Messages was about to trigger. 9/9 direct-call unit tests (`npm run test:sanitize`). Mobile: Expo project doesn't exist. |
| User Management (Admin) | ✅ `users` | ✅ 9 endpoints — create teacher, create parent, list pending, approve, reject, list, view, edit, status | ❌ Dashboards are empty placeholders | ❌ | 39/39 tests pass (`npm run test:users`), idempotent. `PUT` rejects `role`/`login_id`/`student_id`/`password`/`status` with `400` naming them rather than silently ignoring. `PATCH .../status` (active/inactive only): blocks self-deactivation unconditionally, blocks deactivating the last active admin via an independent count check, and requires the account's *current* status already be active/inactive — a pending/rejected account must go through approve/reject first. Schema change: `users.status` ENUM gained `'inactive'` (see Authentication row). Next: web screens. |
| Grade Management & Viewing | ✅ `grades`, `grade_components`, `grade_weight_configs` | ❌ | ❌ | ❌ | **Answered (school visit + DO 009/DO 015 s. 2026), not built.** Three terms not four quarters (Jun 8–Sep 15 / Sep 16–Dec 18 / Jan 4–Apr 8, 201 class days). Three components not five — Written Works/Performance Tasks/Examinations, DO 015 repeals DO 8 s. 2015; the manuscript's five (Figs. 17, 25) was wrong, not the schema. Weights keyed by learning area: core 20/50/30, EPP-TLE/MAPEH 20/60/20 — confirms the known `grade_weight_configs` defect (keyed by grade band, needs re-keying to subject/learning-area). Grade 1 alone uses descriptive grading (A–E) for SY 2026-2027, Grades 2-6 stay numerical with an adjusted transmutation table — both run simultaneously, it's not "1-3 vs 4-6." Examinations is itself `(ST1×0.30)+(ST2×0.30)+(TE×0.40)`, scaled by the learning area's EX weight — no column currently holds ST1/ST2/TE separately. Full detail meant to live in `docs/GRADING_SPEC.md`, which doesn't exist yet — flagged, not silently created. See CLAUDE.md "BLOCKED / RESOLVED." |
| Attendance Monitoring | ✅ `attendance` | ✅ 6 endpoints — list, per-student, summary, record, bulk record, correct | ❌ | ❌ | 33/33 tests pass (`npm run test:attendance`), idempotent. Teacher scoping checks `teacher_assignments` on subject **and** grade/section together — not just grade/section. Bulk record is all-or-nothing in a transaction. Same `(student, subject, date)` recorded twice updates, doesn't error. Summary returns raw counts only, no rate (undefined formula) — API is not blocked by this, but the parent-facing attendance page (Stage 4) is: showing a percentage needs the school to confirm whether Late counts toward "present" and whether Excused counts in the denominator. Admin unscoped on all writes. **2026-08-30: fixed a real DATE round-trip bug** — a posted date came back shifted a calendar day backward at UTC+8 (mysql2 without `dateStrings` returns a JS `Date`, `res.json()` serializes it via `toISOString()`/UTC). Fixed pool-wide via `dateStrings: ['DATE']` in `config/db.js`, covering every DATE column, not just this one. Also fixed an adjacent bug found in the same file: `isFutureDate()` computed "today" via UTC too, which would reject a teacher's own-day entry as "future" for the first 8 hours of every PH day — now uses local wall-clock getters (`utils/dateFormat.js`). `GET /` and `GET /student/:studentId` now also join `subjects` and return `subject_name`, not just `subject_id`. See CLAUDE.md CHANGELOG for the full writeup, including why the prior 336 tests never caught the round-trip bug. **2026-09-03, from the school visit:** attendance is recorded per **day** on the school's SF9 report (monthly Class Days/Days Present/Days Absent), not per subject like the current table (`UNIQUE (student_id, subject_id, date)`) — needs converting, not extending; not done yet. Also confirmed: attendance does not feed grade computation — separate report-card section entirely. This is a different question from the still-open rate-formula one above (Late/Excused handling for a percentage) — resolving "per day" didn't resolve that. Next: web screens and Expo screens. |
| Student Records Management | ✅ `students` | ✅ 5 endpoints — list, view, create, update, status | ❌ | ❌ | 30/30 tests pass (`npm run test:students`), idempotent — no `db:setup` needed between runs. Parents see only their own child; teachers see only their assigned grade/section, both via `404` (not `403`) to avoid enumeration. Teacher creates outside their assignment get `403`. **2026-08-30:** `birthday` (a DATE column) had the same UTC round-trip bug as attendance/events/contributions, fixed by the same pool-wide `dateStrings: ['DATE']` change — no code change needed in this file itself, since it already passed `existing.birthday` straight through with no buggy conversion wrapper; added a regression test locking that in. Next: web screens (list, view, create, edit) and Expo screens. |
| Announcements & Memo Dissemination | ✅ `announcements`, `memos`, `events` | ✅ 12 endpoints — 4 each for announcements/memos/events | ❌ | ❌ | 47/47 tests pass (`npm run test:content`), idempotent. `routes/content.js`, one file, three routers. **Schema correction:** `events` has no `target_section` column (only `announcements` does) — event audience scoping is grade-only. Teacher writes require an exact grade+section (announcements) or grade (events) they're assigned to; a school-wide/whole-grade attempt gets a `403` naming the specific reason, not a bare "forbidden." Memos have no targeting/category columns at all — school-wide by schema design, admin-only writes. Hard delete on all three (no status column); title logged to `activity_logs` before deletion. **2026-08-30: fixed two real bugs on `events.event_date`.** (1) Same UTC round-trip bug as attendance — fixed pool-wide via `dateStrings: ['DATE']`. (2) A separate `toDateString()` helper, used when `PUT /events/:id` omits `event_date` and falls back to the existing row, had the identical UTC-shift bug on a **write path** — silently corrupting the date on any edit that didn't resend it. Removed; the fallback is just `existing.event_date` directly now, safe since it's already a plain string. Also fixed `isMoreThanOneYearAhead()`, which computed "today" via UTC the same wrong way. New shared `utils/dateFormat.js` replaces this file's local `isValidDateFormat`. Next: web screens and Expo screens. |
| Parent-Teacher Messaging | ✅ `messages` | ✅ 5 endpoints — conversations, thread, send, mark-read, mark-thread-read | ❌ | ❌ | 39/39 tests pass (`npm run test:messages`), idempotent. **2026-08-30: fixed a real bug found by hand, not the suite** — one stray row in `messages` from earlier manual API testing (outside the suite) broke the thread-order assertion, because the suite reuses the seeded parent/teacher accounts as fixtures every run instead of creating fresh ones. Fixed the data (deleted the row) and, more importantly, the test: `unread_count`, `last_message_body`, and the thread-order and read-all-count checks were all hardcoded to literals scoped to these same permanently-reused accounts — rewritten to compare against ground truth computed the same way the endpoint does, or to only the run's own tracked message ids, so real messages sent through these accounts during the demo or Stage 4 dev won't break the suite again. Verified by simulating real messages and confirming the suite survives them. New working-agreement rule in CLAUDE.md as a result: test assertions against shared tables must be scoped to the run's own rows or written as invariants, never an exact count/exact content on a table the app also writes to. `canMessage()` (parent↔child's assigned teachers + admin; teacher↔own students' parents + other teachers + admin) runs only on send — reads are participant-scoped instead (`WHERE sender_id = you OR receiver_id = you`), deliberately not re-checked against current eligibility, so a thread survives a teacher's later reassignment. Conversations list uses a window function (`ROW_NUMBER() OVER PARTITION BY` the other party, computed via `CASE`), not `GROUP BY` + `MAX(created_at)` — the latter doesn't guarantee the other selected columns come from the actual max row. `server.js` now wraps Express in an explicit `http.createServer` so Socket.io shares it. Socket auth is connection-time only (JWT + live `status` re-check, same as HTTP), verified against a user deactivated after their token was issued. Delivery is `io.to(user-room).emit(...)`, never a broadcast — tested via connection-auth (deterministic) plus a source check for the room-scoped emit pattern, not via a two-socket delivery test (would need a timeout-based "nothing arrived" assertion, rejected as not real proof). No queries here select `u.*`/`SELECT *` on `users`, so `sanitizeUser` isn't called despite the double sender/receiver JOIN — the fix is not fetching the password column, not scrubbing it after. Next: web screens. |
| Excuse Letter Submission & Management | ✅ `excuse_letters` | ✅ 5 endpoints — submit, mine, list, view, edit. **`approve`/`decline` not built, blocked.** | ❌ | ❌ | 41/41 tests pass (`npm run test:excuses`), idempotent, confirmed twice, DB verified back to baseline. `parent_id`/`student_id` always from `req.user`, never the body; `status` always `Pending` on create; forbidden fields (`status`, `teacher_remarks`, `reviewed_by`, `parent_id`, `student_id`) sent in a body are silently ignored, not rejected — a deliberate spec choice for this module, unlike `routes/users.js`'s PUT which rejects loudly. Teacher scoping reuses the exact `EXISTS`-on-`teacher_assignments` shape `routes/students.js` already uses. `GET /mine` declared before `GET /:id` so `parseId('mine')` can't fire first. Reads out of scope → `404`; the one write-scope violation (edit after review) → `403` naming the reason. No submission-deadline check (school hasn't set one) and duplicate letters per date are allowed on purpose (resubmission after a decline). **2026-09-03: one of the two original blockers is now resolved.** Approval is record-only — the learner stays `Absent`, the letter documents the reason, approval must not modify `attendance` rows. Still open: who can approve — class adviser only, or any teacher assigned to the grade/section? The new `sections.adviser_id` column (see CLAUDE.md's "sections table" note) is the right mechanism for "adviser only," but that answer wasn't re-confirmed, and `adviser_id` is `NULL` for every section regardless. Do not treat `approve`/`decline` as fully unblocked. **Manually verified 00:25 AM PH** (inside the UTC failing window): POST with today's date accepted (not rejected as future), `absence_date` round-trips as `"2026-08-31"` while `created_at` stays ISO (confirming `dateStrings: ['DATE']` applies to DATE only), partial `PUT` with `details` only preserved `absence_date`/`reason`, teacher assignment scoping and the parent/teacher-only-list `403` both correct — all five passed. Response shape: `login` returns `token`/`user` at the top level, excuse-letter endpoints wrap in `excuse_letter` — no `data` wrapper anywhere. |
| Contribution/Fees Monitoring | ✅ `contributions`, `contribution_records` | ✅ 8 endpoints — list, detail, roster, my-records, create, update, delete, mark paid/pending | ❌ | ❌ | 38/38 tests pass (`npm run test:contributions`), idempotent. `grade_level` is `NOT NULL` — no school-wide option, unlike announcements/events. Roster is a live LEFT JOIN against active students, not a snapshot — a late enrollee shows up automatically as Pending. Amount override on a payment can go below the fee (discount) but never above it (`400`, names the cap). `DELETE` blocked with `409` naming the exact record count when `contribution_records` exist — that FK is `ON DELETE CASCADE`, so an unguarded delete would silently destroy payment history. `my-records` (parent) never touches another student's row, individually or in aggregate. Also open: no CSV export (manuscript Fig. 19), GWA computation undecided — unrelated to this API. **2026-08-30:** `due_date` had the same two bugs as `events.event_date` (UTC round-trip on read, a `toDateString()` fallback silently corrupting it on a PUT that omitted it) — same fixes, same shared `utils/dateFormat.js`. Next: web screens and Expo screens. |
| System Settings Management (Admin) | ✅ `system_settings` | ✅ 4 endpoints — get all, get one, update one, bulk update | ❌ | ❌ | 27/27 tests pass (`npm run test:settings`), idempotent (restores original values). 5-key allow-list (`school_name`, `school_address`, `academic_year`, `current_quarter`, `logo_url`) — unknown key rejected with `400` naming the allowed ones. `current_quarter`'s valid values read live from `grades.quarter`'s ENUM via `INFORMATION_SCHEMA` rather than hardcoded, since that ENUM is still provisional (school hasn't confirmed quarters vs. terms). `academic_year` seed typo fixed to `'2026-2027'` as part of this. `PATCH` (bulk) is all-or-nothing. Next: web screens (admin settings form). |
| Backup & Restore (Admin, web only) | ✅ `backups`, `auth_security_state` | ✅ 5 endpoints — list, create, download, delete, restore | ❌ | — (web-only by design, mobile excluded) | 39/39 backup tests pass (`npm run test:backups`), 22/22 restore tests pass (`npm run test:restore`), both idempotent — a real end-to-end restore, run once manually together, found the backups-table wipe bug below; the automated suite deliberately never runs one, so it could not have caught it. A **second** live restore later found a sharper version of the same bug that the first fix didn't actually fix — see below. Backup: real `mysqldump` — not mocked. Password via `MYSQL_PWD` on the spawned process's own env, never on argv. Row inserted only after the dump succeeds and the file is confirmed non-empty. Caught and fixed before shipping: the filename format is second-granularity with no uniqueness constraint, so two backups in the same second would have silently overwritten each other's file — added a collision-safe filename reservation, verified in tests. Known residual gap: closes the sequential case, not two truly concurrent requests in the same tick — accepted for a single-admin deployment. `download_backup` is logged alongside create/delete — the most sensitive action the API permits (a full copy of every student's data leaving in one file). `scripts/create-backup-zip.js` is a separate, legitimate source-code archiver (zips the codebase to the Desktop) — not the DB backup and not touched by this work. Restore: `POST /:id/restore` — step-up password re-verification, `confirm_filename` exact-match, automatic `pre_restore_*` safety dump before anything is touched (abort with nothing changed if it fails), the actual restore on a dedicated one-off `mysql2` connection (never the shared pool), a partial-failure message naming the safety dump and warning manual recovery may be needed (MySQL has no transactional DDL), shared pool reset via a new proxy pattern in `config/db.js`, and every active JWT invalidated via a new `auth_security_state.token_valid_after` cutoff checked in `middleware/auth.js`. Deliberately synchronous, not async job tracking, given the database's current size — see CLAUDE.md's "RESTORE" section for the explicit trigger to revisit that. Test suite covers every pre-flight gate and `token_valid_after` in isolation (via crafted JWTs) but deliberately never triggers a real restore — that's run once, manually, with `db:setup` ready. **Real bug found in that manual run, since fixed:** `backups` is self-referential (a row is inserted only after its own file finishes dumping, so a backup's file can never contain its own row) — restoring emptied the whole table, not just the safety dump's row. Fixed by excluding `backups`' data from every dump (`--ignore-table` + a `--no-data` pass so the table structure still survives) and adding read-only orphan reconciliation on `GET /api/backups` (`orphaned_files` — never auto-inserted). `activity_logs` was checked for the same shape and found to have a narrower version of it (the safety dump's `create_backup` log entry is wiped by the restore it documents; `restore_backup` itself survives). Not fixed the same way as `backups` (nothing was reordered to stop the loss) — instead a `restore_wiped_activity_logs` marker: counts `activity_logs` rows newer than the restored backup right before the restore runs, then logs one entry after the restore completes (same timing as `restore_backup`, so it survives) naming the source backup and the exact count lost. The wipe still happens; the marker stops it being silent, and isn't tamper-proof against an admin with direct DB access — accepted deliberately. `activity_logs_wiped: <count>` is also in the response body. **The first `backups` fix was incomplete:** the `--no-data` pass still writes `DROP TABLE backups` right before the empty `CREATE TABLE`, and the restore endpoint executed the whole file verbatim — so that DROP ran against the *live* table too, wiping it to zero rows on every restore regardless of source backup (confirmed live: restoring from backup #1 also erased backup #2, taken after #1's dump). The "no `INSERT INTO backups`" test passed the entire time — it checked the anticipated symptom, not this mechanism. Fixed by splitting the concern: the dump file is unchanged (still has a real `CREATE TABLE backups` for bare-metal recovery); a new `stripBackupsTableDdl()` removes just `backups`' block from the SQL the restore *connection* executes — name-based (mysqldump's own `-- Table structure for table` comment), so it protects every backup file already on disk, not just new ones. Verified four ways: against the real dump that exposed the bug, by executing the *stripped* SQL for real against a disposable scratch database (18 tables created, `backups` correctly absent, real data restored), via a permanent `test:backups` regression check, and — the actual proof — a real live restore against the shared dev DB: zero rows survived before this fix, three survived after (both backups + the safety dump), `activity_logs_wiped: 2` in the response confirming that marker fires on a real restore too. `auth_security_state` was checked for the same shape and found *not* to have it — it does get dropped/recreated by a restore too, but an unconditional post-restore write (`token_valid_after = NOW()`, no gating condition) always re-asserts it correctly regardless, verified live. Every orphan across both live-restore bugs (5 files total — the original wipe's 2, this bug's 3) was adopted by hand once each, only after its bug was fixed and confirmed live: `created_by` `ADMIN001`, `created_at` from file mtime, each logged as `manual_backup_adoption`. `backups` now holds 8 rows this way, 0 `orphaned_files`. See CLAUDE.md's RESTORE section and CHANGELOG for the full writeup. |

---

## What's left, module by module

**Authentication** — done except mobile.
- [ ] Expo login screen (Stage 5, not started).

**User Management (Admin)** — API done, no screens yet.
- [ ] Admin web screens: pending-approvals list, user list, edit-user form, activate/deactivate control.

**Student Records Management** — API done, no screens yet.
- [ ] Web pages: student list, student detail, create/edit forms.
- [ ] Expo screens (Stage 5, not started).

**Attendance Monitoring** — API done, no screens yet.
- [ ] Web pages: per-class recording grid, per-student history, summary view.
- [ ] Expo screens (Stage 5, not started).

**Announcements & Memo Dissemination** — API done, no screens yet.
- [ ] Web pages: feed view (parent/teacher), post/edit forms (teacher/admin), memo management (admin).
- [ ] Expo screens (Stage 5, not started).

**Parent-Teacher Messaging** — API + Socket.io done, no screens yet.
- [ ] `GET /api/messages/contacts` — design decided, not built. Scoped by the
      inverse of `canMessage()`: parent sees their child's teachers (+ subject)
      plus admin; teacher sees their students' parents (+ student name) plus
      other teachers and admin; admin sees everyone. Optional `?search=` within
      scope only — never unscoped. Includes last message + unread count inline
      so the frontend needs one call. Build alongside the web page below, not
      before — see CLAUDE.md's "GET /api/messages/contacts" section.
- [ ] Web pages: conversation list, thread view, compose (live via Socket.io).
- [ ] Expo screens (Stage 5, not started).

**Contribution/Fees Monitoring** — API done, no screens yet.
- [ ] Web pages: fee list, roster/mark-paid grid (teacher/admin), parent's own payment status view.
- [ ] Expo screens (Stage 5, not started).
- [ ] Open, not blocking: CSV "Download Statement" export (manuscript Fig. 19), GWA computation decision.

**System Settings Management (Admin)** — API done, no screens yet.
- [ ] Admin web screen: settings form (school info, academic year, current quarter, logo).

**Backup & Restore (Admin, web only)** — API done (both Backup and Restore), no screens yet.
- [ ] Admin web screens: backup list/history (file size, "Completed" status, download, delete), create-backup button, restore flow (step-up password + type-the-filename confirmation, clear warning that all sessions end).
- [ ] One deliberate manual end-to-end restore test, together, with `db:setup` ready — not yet scheduled.

**Excuse Letter Submission & Management** — CRUD half done (submit/mine/list/view/edit), no screens yet, approve/decline partially unblocked.
- [ ] `approve`/`decline` (`PATCH /:id/review`) — **resolved:** record-only, must not touch `attendance` rows. **Still open:** who can approve — `sections.adviser_id` is the likely mechanism (adviser-only) but that specific answer wasn't confirmed, and every section's `adviser_id` is currently `NULL` regardless.
- [ ] Web pages: submit form (parent), letter list + status (parent), review queue (teacher/admin) — the review queue can't do anything until approve/decline exists.
- [ ] Expo screens (Stage 5, not started).

Everything else in the 10 core features has a schema table and nothing
else — no route file, no queries, no pages, no screens. See the Notes
column above for the concrete next step per module.

---

## Before the parent demo (not blockers now — required before real parents see this)

- [ ] Replace seed data — `seed.sql` uses the team's own names (Marwin
      Conde, Jea Mae Bargaso, Ashley Geguiera). Fictional demo data, or
      clear the seed if real records get loaded instead.
- [ ] Change every default password (`Admin@2026`, `Teacher@2026`,
      `Parent@2026`) — they're in `seed.sql`, in the public repo, and a
      parent's login id is their child's LRN, so anyone who knows the LRN
      knows the password too.
- [ ] RA 10173 (Data Privacy Act, cited in the manuscript) — confirm with
      the school whether loading real names/LRNs needs a consent process
      and whether they already have a form. Two questions added for the
      school visit, below.
- [ ] `GET /api/messages/contacts` must exist before the demo — without
      it a parent can't find their child's teacher to message (would
      need to already know a numeric `user_id`). This is currently
      planned as "build alongside the Stage 4 Messages page" — if the
      demo lands before Stage 4 is underway, pull this one endpoint
      forward. See CLAUDE.md's "GET /api/messages/contacts" section.

**Two new school-visit questions:**
- Do we need to load real student names and LRNs for the parent demo? If
  so, is there a consent form already, or is permission needed per parent?
- How many parents can attend, and when — is there a PTA meeting we could
  join?

---

## Excluded (not in scope)

QR attendance · online payment · enrollment/transcript · schedule grid · college grading
