# CAPSTONE — Parent's Portal System

> Mirror of CLAUDE.md for reference when switching between tools.
> CLAUDE.md is authoritative. If the two disagree, CLAUDE.md wins.

**Captain H. Francisco Elementary School (Gr 1–6)**
**Sept 7, 2026** — system proposal checkpoint, **not** the final defense.
**Final defense** — expected around November 2026.

**Last updated:** 2026-08-27

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

Stage 3 is 🔨: Student Records, Attendance, and Announcements/Memos/Events
are fully built. User Management is partial (5 of a larger set). Grades,
Messaging, Excuse Letters, Contributions, System Settings, and
Backup/Restore are still ❌. See table below.

---

## Per-module breakdown

Schema = table exists in `schema.sql`. API = working endpoints exist in a
route file. Web = pages exist in `client/src`. Mobile = screens exist in an
Expo app (no Expo app exists yet, so this column is ❌ everywhere).

| Module | Schema | API | Web | Mobile | Notes |
|--------|--------|-----|-----|--------|-------|
| Authentication | ✅ `users` | ✅ 3 endpoints — login, me, change-password | ✅ Login page, `ProtectedRoute`, axios JWT interceptor | ❌ | 25/25 auth tests pass (`npm run test:auth`), idempotent — no `db:setup` needed between runs. Login round-trip verified in browser — admin → `/admin`, wrong password → inline error, pending account → inline message, refresh → spinner with no flash. Mobile: Expo project doesn't exist. |
| User Management (Admin) | ✅ `users` | 🔨 5 endpoints — create teacher, create parent, list pending, approve, reject | ❌ Dashboards are empty placeholders | ❌ | Next: `GET /api/users` (list all), edit, deactivate. Web screens come after. |
| Grade Management & Viewing | ✅ `grades`, `grade_components`, `grade_weight_configs` | ❌ | ❌ | ❌ | Blocked: school must confirm quarters vs. terms, 3 vs. 5 grade components, and whether weights key on subject or grade level. See CLAUDE.md "Blocked." |
| Attendance Monitoring | ✅ `attendance` | ✅ 6 endpoints — list, per-student, summary, record, bulk record, correct | ❌ | ❌ | 28/28 tests pass (`npm run test:attendance`), idempotent. Teacher scoping checks `teacher_assignments` on subject **and** grade/section together — not just grade/section. Bulk record is all-or-nothing in a transaction. Same `(student, subject, date)` recorded twice updates, doesn't error. Summary returns raw counts only, no rate (undefined formula). Admin unscoped on all writes. Next: web screens and Expo screens. |
| Student Records Management | ✅ `students` | ✅ 5 endpoints — list, view, create, update, status | ❌ | ❌ | 28/28 tests pass (`npm run test:students`), idempotent — no `db:setup` needed between runs. Parents see only their own child; teachers see only their assigned grade/section, both via `404` (not `403`) to avoid enumeration. Teacher creates outside their assignment get `403`. Next: web screens (list, view, create, edit) and Expo screens. |
| Announcements & Memo Dissemination | ✅ `announcements`, `memos`, `events` | ✅ 12 endpoints — 4 each for announcements/memos/events | ❌ | ❌ | 45/45 tests pass (`npm run test:content`), idempotent. `routes/content.js`, one file, three routers. **Schema correction:** `events` has no `target_section` column (only `announcements` does) — event audience scoping is grade-only. Teacher writes require an exact grade+section (announcements) or grade (events) they're assigned to; a school-wide/whole-grade attempt gets a `403` naming the specific reason, not a bare "forbidden." Memos have no targeting/category columns at all — school-wide by schema design, admin-only writes. Hard delete on all three (no status column); title logged to `activity_logs` before deletion. Next: web screens and Expo screens. |
| Parent-Teacher Messaging | ✅ `messages` | ❌ | ❌ | ❌ | Next: Socket.io isn't wired into `server.js` yet. No handlers at all. |
| Excuse Letter Submission & Management | ✅ `excuse_letters` | ❌ | ❌ | ❌ | Next: `routes/excuse-letters.js` — submit, review, approve/decline. |
| Contribution/Fees Monitoring | ✅ `contributions`, `contribution_records` | ❌ | ❌ | ❌ | Next: `routes/contributions.js` — create, record payment, view status. Also open: no CSV export (manuscript Fig. 19), GWA computation undecided. |
| System Settings Management (Admin) | ✅ `system_settings` | ❌ | ❌ | ❌ | Next: `routes/settings.js`, admin-only. |
| Backup & Restore (Admin, web only) | ✅ `backups` | ❌ | ❌ | — (web-only by design, mobile excluded) | `scripts/create-backup-zip.js` exists but copies folders — not a DB backup. Needs a `mysqldump`-based rewrite. |

---

## What's left, module by module

**Authentication** — done except mobile.
- [ ] Expo login screen (Stage 5, not started).

**User Management (Admin)** — API partial, no screens yet.
- [ ] `GET /api/users` — list all users (currently only pending parents are listable).
- [ ] Edit user endpoint.
- [ ] Deactivate/reactivate user endpoint.
- [ ] Admin web screens: pending-approvals list, user list, create-teacher form.

**Student Records Management** — API done, no screens yet.
- [ ] Web pages: student list, student detail, create/edit forms.
- [ ] Expo screens (Stage 5, not started).

**Attendance Monitoring** — API done, no screens yet.
- [ ] Web pages: per-class recording grid, per-student history, summary view.
- [ ] Expo screens (Stage 5, not started).

**Announcements & Memo Dissemination** — API done, no screens yet.
- [ ] Web pages: feed view (parent/teacher), post/edit forms (teacher/admin), memo management (admin).
- [ ] Expo screens (Stage 5, not started).

Everything else in the 10 core features has a schema table and nothing
else — no route file, no queries, no pages, no screens. See the Notes
column above for the concrete next step per module.

---

## Excluded (not in scope)

QR attendance · online payment · enrollment/transcript · schedule grid · college grading
