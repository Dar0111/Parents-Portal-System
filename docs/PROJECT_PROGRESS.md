# CAPSTONE — Parent's Portal System

> Mirror of CLAUDE.md for reference when switching between tools.
> CLAUDE.md is authoritative. If the two disagree, CLAUDE.md wins.

**Captain H. Francisco Elementary School (Gr 1–6)**
**Sept 7, 2026** — system proposal checkpoint, **not** the final defense.
**Final defense** — expected around November 2026.

**Last updated:** 2026-08-29

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
Contributions, System Settings, User Management, and Messages + Socket.io
are fully built. Backup/Restore is partial — Backup is done, Restore is
deliberately not built (see CLAUDE.md's "RESTORE — required before
building"). Excuse Letters is partially blocked — only its CRUD shape
(submit/list/view) is safe to build now, approve/decline is not. Grades
is fully blocked. Both wait on the same school visit. See table below.

---

## Per-module breakdown

Schema = table exists in `schema.sql`. API = working endpoints exist in a
route file. Web = pages exist in `client/src`. Mobile = screens exist in an
Expo app (no Expo app exists yet, so this column is ❌ everywhere).

| Module | Schema | API | Web | Mobile | Notes |
|--------|--------|-----|-----|--------|-------|
| Authentication | ✅ `users` (status ENUM now `pending`/`active`/`rejected`/`inactive`) | ✅ 3 endpoints — login, me, change-password | ✅ Login page, `ProtectedRoute`, axios JWT interceptor | ❌ | 25/25 auth tests pass (`npm run test:auth`), idempotent — no `db:setup` needed between runs. Login round-trip verified in browser — admin → `/admin`, wrong password → inline error, pending account → inline message, refresh → spinner with no flash. `authenticate` and login both already had a generic `status !== 'active'` fallback, so adding `'inactive'` (for User Management) needed zero changes there — deactivation takes effect immediately, even on an already-issued JWT. `sanitizeUser()` hardened and moved to `utils/sanitizeUser.js` (was duplicated in `routes/auth.js` and `routes/users.js`) — now strips any key containing `password`, case-insensitive, not just the exact key; closes the aliased-JOIN gap Messages was about to trigger. 9/9 direct-call unit tests (`npm run test:sanitize`). Mobile: Expo project doesn't exist. |
| User Management (Admin) | ✅ `users` | ✅ 9 endpoints — create teacher, create parent, list pending, approve, reject, list, view, edit, status | ❌ Dashboards are empty placeholders | ❌ | 39/39 tests pass (`npm run test:users`), idempotent. `PUT` rejects `role`/`login_id`/`student_id`/`password`/`status` with `400` naming them rather than silently ignoring. `PATCH .../status` (active/inactive only): blocks self-deactivation unconditionally, blocks deactivating the last active admin via an independent count check, and requires the account's *current* status already be active/inactive — a pending/rejected account must go through approve/reject first. Schema change: `users.status` ENUM gained `'inactive'` (see Authentication row). Next: web screens. |
| Grade Management & Viewing | ✅ `grades`, `grade_components`, `grade_weight_configs` | ❌ | ❌ | ❌ | Blocked: school must confirm quarters vs. terms, 3 vs. 5 grade components, and whether weights key on subject or grade level. See CLAUDE.md "Blocked." |
| Attendance Monitoring | ✅ `attendance` | ✅ 6 endpoints — list, per-student, summary, record, bulk record, correct | ❌ | ❌ | 28/28 tests pass (`npm run test:attendance`), idempotent. Teacher scoping checks `teacher_assignments` on subject **and** grade/section together — not just grade/section. Bulk record is all-or-nothing in a transaction. Same `(student, subject, date)` recorded twice updates, doesn't error. Summary returns raw counts only, no rate (undefined formula) — API is not blocked by this, but the parent-facing attendance page (Stage 4) is: showing a percentage needs the school to confirm whether Late counts toward "present" and whether Excused counts in the denominator. Admin unscoped on all writes. Next: web screens and Expo screens. |
| Student Records Management | ✅ `students` | ✅ 5 endpoints — list, view, create, update, status | ❌ | ❌ | 28/28 tests pass (`npm run test:students`), idempotent — no `db:setup` needed between runs. Parents see only their own child; teachers see only their assigned grade/section, both via `404` (not `403`) to avoid enumeration. Teacher creates outside their assignment get `403`. Next: web screens (list, view, create, edit) and Expo screens. |
| Announcements & Memo Dissemination | ✅ `announcements`, `memos`, `events` | ✅ 12 endpoints — 4 each for announcements/memos/events | ❌ | ❌ | 45/45 tests pass (`npm run test:content`), idempotent. `routes/content.js`, one file, three routers. **Schema correction:** `events` has no `target_section` column (only `announcements` does) — event audience scoping is grade-only. Teacher writes require an exact grade+section (announcements) or grade (events) they're assigned to; a school-wide/whole-grade attempt gets a `403` naming the specific reason, not a bare "forbidden." Memos have no targeting/category columns at all — school-wide by schema design, admin-only writes. Hard delete on all three (no status column); title logged to `activity_logs` before deletion. Next: web screens and Expo screens. |
| Parent-Teacher Messaging | ✅ `messages` | ✅ 5 endpoints — conversations, thread, send, mark-read, mark-thread-read | ❌ | ❌ | 39/39 tests pass (`npm run test:messages`), idempotent. `canMessage()` (parent↔child's assigned teachers + admin; teacher↔own students' parents + other teachers + admin) runs only on send — reads are participant-scoped instead (`WHERE sender_id = you OR receiver_id = you`), deliberately not re-checked against current eligibility, so a thread survives a teacher's later reassignment. Conversations list uses a window function (`ROW_NUMBER() OVER PARTITION BY` the other party, computed via `CASE`), not `GROUP BY` + `MAX(created_at)` — the latter doesn't guarantee the other selected columns come from the actual max row. `server.js` now wraps Express in an explicit `http.createServer` so Socket.io shares it. Socket auth is connection-time only (JWT + live `status` re-check, same as HTTP), verified against a user deactivated after their token was issued. Delivery is `io.to(user-room).emit(...)`, never a broadcast — tested via connection-auth (deterministic) plus a source check for the room-scoped emit pattern, not via a two-socket delivery test (would need a timeout-based "nothing arrived" assertion, rejected as not real proof). No queries here select `u.*`/`SELECT *` on `users`, so `sanitizeUser` isn't called despite the double sender/receiver JOIN — the fix is not fetching the password column, not scrubbing it after. Next: web screens. |
| Excuse Letter Submission & Management | ✅ `excuse_letters` | ❌ | ❌ | ❌ | **Partially blocked**, same school visit as Grades. Submit/list/view don't depend on the answers; approve/decline does: (1) who can approve — class adviser only (no `adviser` column on `students`, needs a schema change) or any teacher assigned to the grade/section? (2) does approving change attendance — attendance is per subject, excuse letters are per day, so one approval would touch multiple `attendance` rows. Do not build approve/decline until answered. |
| Contribution/Fees Monitoring | ✅ `contributions`, `contribution_records` | ✅ 8 endpoints — list, detail, roster, my-records, create, update, delete, mark paid/pending | ❌ | ❌ | 35/35 tests pass (`npm run test:contributions`), idempotent. `grade_level` is `NOT NULL` — no school-wide option, unlike announcements/events. Roster is a live LEFT JOIN against active students, not a snapshot — a late enrollee shows up automatically as Pending. Amount override on a payment can go below the fee (discount) but never above it (`400`, names the cap). `DELETE` blocked with `409` naming the exact record count when `contribution_records` exist — that FK is `ON DELETE CASCADE`, so an unguarded delete would silently destroy payment history. `my-records` (parent) never touches another student's row, individually or in aggregate. Also open: no CSV export (manuscript Fig. 19), GWA computation undecided — unrelated to this API. Next: web screens and Expo screens. |
| System Settings Management (Admin) | ✅ `system_settings` | ✅ 4 endpoints — get all, get one, update one, bulk update | ❌ | ❌ | 26/26 tests pass (`npm run test:settings`), idempotent (restores original values). 5-key allow-list (`school_name`, `school_address`, `academic_year`, `current_quarter`, `logo_url`) — unknown key rejected with `400` naming the allowed ones. `current_quarter`'s valid values read live from `grades.quarter`'s ENUM via `INFORMATION_SCHEMA` rather than hardcoded, since that ENUM is still provisional (school hasn't confirmed quarters vs. terms). `academic_year` seed typo fixed to `'2026-2027'` as part of this. `PATCH` (bulk) is all-or-nothing. Next: web screens (admin settings form). |
| Backup & Restore (Admin, web only) | ✅ `backups` (`file_size` added) | 🔨 4 endpoints — list, create, download, delete. **Restore not built, deliberately.** | ❌ | — (web-only by design, mobile excluded) | 33/33 tests pass (`npm run test:backups`), idempotent, against a real `mysqldump` — not mocked. Password via `MYSQL_PWD` on the spawned process's own env, never on argv. Row inserted only after the dump succeeds and the file is confirmed non-empty. Caught and fixed before shipping: the filename format is second-granularity with no uniqueness constraint, so two backups in the same second would have silently overwritten each other's file — added a collision-safe filename reservation, verified in tests. Known residual gap: closes the sequential case, not two truly concurrent requests in the same tick — accepted for a single-admin deployment. `download_backup` is logged alongside create/delete — the most sensitive action the API permits (a full copy of every student's data leaving in one file). `scripts/create-backup-zip.js` is a separate, legitimate source-code archiver (zips the codebase to the Desktop) — not the DB backup and not touched by this work. See CLAUDE.md's "RESTORE — required before building" for what Restore needs before it can be built: validate source is a tracked backup, auto safety dump first, step-up auth, dedicated DB connection outside the pool, async job tracking, and an undecided JWT-invalidation question. |

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
- [ ] Web pages: conversation list, thread view, compose (live via Socket.io).
- [ ] Expo screens (Stage 5, not started).
- [ ] Open, not blocking: no "who can I message" contacts endpoint — a parent has no way to discover their child's teachers' user ids to start a first conversation. See CLAUDE.md Open Questions.

**Contribution/Fees Monitoring** — API done, no screens yet.
- [ ] Web pages: fee list, roster/mark-paid grid (teacher/admin), parent's own payment status view.
- [ ] Expo screens (Stage 5, not started).
- [ ] Open, not blocking: CSV "Download Statement" export (manuscript Fig. 19), GWA computation decision.

**System Settings Management (Admin)** — API done, no screens yet.
- [ ] Admin web screen: settings form (school info, academic year, current quarter, logo).

**Backup & Restore (Admin, web only)** — Backup API done, Restore not started, no screens yet.
- [ ] Restore — needs its own design pass first. See CLAUDE.md's "RESTORE — required before building": validate source is a tracked backup, automatic safety dump before restoring, step-up auth, a dedicated DB connection outside the shared pool, async job tracking (not a blocking request), and a decision on what happens to active JWTs after a restore.
- [ ] Admin web screens: backup list/history (file size, "Completed" status, download, delete), create-backup button.

Everything else in the 10 core features has a schema table and nothing
else — no route file, no queries, no pages, no screens. See the Notes
column above for the concrete next step per module.

---

## Excluded (not in scope)

QR attendance · online payment · enrollment/transcript · schedule grid · college grading
