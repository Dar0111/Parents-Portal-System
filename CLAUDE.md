> This file is maintained by Claude Code and Cursor. It describes the ACTUAL
> state of the code, not the plan. If this file and the code disagree, the
> code is correct and this file must be fixed.

# Parent's Portal System

Capstone project for **Captain H. Francisco Elementary School** (Grades 1–6),
187 P. Rosales Street, Barangay Sta. Ana-Kaliwa, Pateros City.

| | |
|---|---|
| Institution | Pateros Technological College — Institute of Information and Computing Technology |
| Developer | Candilada, Darryl — sole developer |
| Team | Conde, Marwin R. · Bargaso, Jea Mae T. · Bobis, Joan B. · Geguiera, Ashley T. |
| Repo path | `C:\Users\Win10 User\Parents_Portal` |
| Database | `parents_portal` — 18 tables |
| Sept 7, 2026 | System proposal checkpoint — **not** the final defense |
| Final defense | Expected around November 2026 |

The four other team members handle the manuscript and data gathering.
**Darryl codes.** Do not assign manuscript work to Darryl or coding tasks
to the team.

---

## CURRENT STATE

**Last verified:** 2026-08-27 (audited against the code, not the docs)

### Working endpoints — this is the entire API

| Method | Path | Role |
|--------|------|------|
| GET | `/api/health` | Public |
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Authenticated |
| PUT | `/api/auth/change-password` | Authenticated |
| POST | `/api/users/teachers` | admin |
| POST | `/api/users/parents` | teacher |
| GET | `/api/users/parents/pending` | admin |
| PUT | `/api/users/parents/:id/approve` | admin |
| PUT | `/api/users/parents/:id/reject` | admin |
| GET | `/api/users` | admin — filter by role, status, search on name/login_id |
| GET | `/api/users/:id` | admin |
| PUT | `/api/users/:id` | admin — name/email/contact_number only, forbidden fields rejected with 400 |
| PATCH | `/api/users/:id/status` | admin — active/inactive only, self and last-active-admin blocked |
| GET | `/api/students` | teacher, admin |
| GET | `/api/students/:id` | teacher, admin, parent (own child only) |
| POST | `/api/students` | teacher (own assignment only), admin |
| PUT | `/api/students/:id` | teacher (own assignment only), admin |
| PATCH | `/api/students/:id/status` | admin |
| GET | `/api/attendance` | teacher, admin |
| GET | `/api/attendance/student/:studentId` | teacher, admin, parent (own child only) |
| GET | `/api/attendance/summary/:studentId` | teacher, admin, parent (own child only) — raw counts, no rate |
| POST | `/api/attendance` | teacher (own subject+grade+section), admin (unscoped) |
| POST | `/api/attendance/bulk` | teacher (own subject+grade+section), admin (unscoped) — all-or-nothing |
| PUT | `/api/attendance/:id` | teacher (own subject+grade+section), admin (unscoped) |
| GET | `/api/announcements` | all roles — scoped by audience (target_grade/target_section) |
| POST | `/api/announcements` | teacher (own assignment only), admin |
| PUT | `/api/announcements/:id` | author or admin |
| DELETE | `/api/announcements/:id` | author or admin — hard delete |
| GET | `/api/memos` | all roles — no targeting, school-wide by schema design |
| POST | `/api/memos` | admin |
| PUT | `/api/memos/:id` | admin |
| DELETE | `/api/memos/:id` | admin — hard delete |
| GET | `/api/events` | all roles — scoped by audience (target_grade only, no target_section column) |
| POST | `/api/events` | teacher (own grade only), admin |
| PUT | `/api/events/:id` | author or admin |
| DELETE | `/api/events/:id` | author or admin — hard delete |
| GET | `/api/contributions` | all roles — scoped by grade_level (no section column on this table) |
| GET | `/api/contributions/my-records` | parent only — own child's rows only, no aggregate/other-student data |
| GET | `/api/contributions/:id` | all roles — scoped, `404` on violation |
| GET | `/api/contributions/:id/records` | teacher, admin — live roster (LEFT JOIN), Pending default |
| POST | `/api/contributions` | teacher (own grade only), admin |
| PUT | `/api/contributions/:id` | author or admin |
| DELETE | `/api/contributions/:id` | author or admin — `409` if any `contribution_records` exist (see below) |
| PATCH | `/api/contributions/:id/records/:studentId` | teacher, admin — mark Paid/Pending, optional amount override |
| GET | `/api/settings` | authenticated — all settings, flat key-value object |
| GET | `/api/settings/:key` | authenticated — `404` if not one of the 5 allow-listed keys |
| PUT | `/api/settings/:key` | admin — per-key validation, unknown key rejected naming the allow-list |
| PATCH | `/api/settings` | admin — bulk update, all-or-nothing in a transaction |

**Tests:** all seven suites are idempotent — every row they create is tracked and
deleted in a `finally` block (or, for Settings, restored to its original value), so
no `db:setup` is needed between runs. Verified by running each twice in a row with
no reset: same pass count both times, and the DB confirmed back to the seeded 4
users / 2 students / 0 everywhere else (attendance, announcements, memos, events,
contributions, contribution_records) after.
- `npm run test:students` — 28/28
- `npm run test:auth` — 25/25
- `npm run test:attendance` — 28/28
- `npm run test:content` — 45/45
- `npm run test:contributions` — 35/35
- `npm run test:settings` — 26/26
- `npm run test:users` — 39/39

### Files that exist

```
server/
  server.js                    Express app; mounts /api/auth, /api/users, /api/students,
                                /api/attendance, /api/announcements, /api/memos, /api/events,
                                /api/contributions, /api/settings
  package.json
  .env.example
  config/db.js                 MySQL connection pool
  middleware/auth.js           authenticate + authorize
  routes/auth.js               login, me, change-password
  routes/users.js              create teacher/parent, pending, approve/reject, list/view/edit/status
  routes/students.js           list/view/create/update, teacher scoped to own assignments
  routes/attendance.js         record/bulk/correct/list/summary, teacher scoped by subject+grade+section
  routes/content.js            announcements/memos/events — 3 routers, one file
  routes/contributions.js      fee + per-student payment status, lazy roster, delete guard
  routes/settings.js           key-value store, allow-listed keys, per-key validation
  utils/jwt.js                 sign/verify
  utils/password.js            bcrypt hash/compare
  utils/activity.js            insert into activity_logs
  utils/validateId.js          parseId() — validates :id route params before any query
  scripts/setup-db.js          runs schema + seed, hashes seed passwords
  scripts/test-auth-flows.js   HTTP tests
  scripts/test-student-flows.js HTTP tests — scoping, validation, lifecycle
  scripts/test-attendance-flows.js HTTP tests — scoping, bulk all-or-nothing, admin override
  scripts/test-content-flows.js HTTP tests — audience scoping, named 403 reasons, author-or-admin
  scripts/test-contributions-flows.js HTTP tests — grade scoping, roster, amount cap, delete guard
  scripts/test-settings-flows.js HTTP tests — allow-list, per-key validation, PATCH all-or-nothing
  scripts/test-user-management-flows.js HTTP tests — admin-only, PUT forbidden fields, status guards
database/
  schema.sql                   18 tables. users.status ENUM now includes 'inactive'
                                (added for User Management's activate/deactivate)
  seed.sql                     subjects, students, settings; academic_year fixed to '2026-2027'
scripts/
  create-backup-zip.js         folder copy, NOT a DB backup — see Known Issues
client/
  package.json                 Vite + React 19 + Tailwind v4 + Font Awesome
  vite.config.js                dev server pinned to port 3000 (matches server's CORS_ORIGIN default)
  src/App.jsx                  routes: /login, /admin, /teacher, /parent
  src/api/axios.js             baseURL from VITE_API_BASE_URL, Bearer interceptor, 401/403 handling
  src/auth/AuthContext.jsx     login/logout/user/loading — see note below
  src/auth/ProtectedRoute.jsx  role-gated route wrapper
  src/pages/Login.jsx          Login ID + password, no role dropdown
  src/pages/dashboards/        AdminDashboard, TeacherDashboard, ParentDashboard — empty
  src/layout/Shell.jsx         sidebar, header, logout
```

### Not started — zero handlers

Grades · Messages · Excuse Letters · Backup/Restore

**No Expo app. No Socket.io.**

Four modules have tables in `schema.sql` but no route files and no queries.

### React web app — auth, verified end-to-end

`client/` builds clean (`npm run build`) and both dev servers run together
(`server/` on :5000, `client/` on :3000). Verified in the browser: admin
login (`ADMIN001` / `Admin@2026`) redirects to `/admin`; a wrong password
shows an inline error without leaving the login page; a pending parent
account shows the approval-pending message inline; refreshing a logged-in
session shows the loading spinner with no login-page flash.

---

## THE AUTH PATTERN IS THE TEMPLATE

The auth module was security-audited and came back clean. **Every new module
must follow this exact pattern. Do not invent a new structure.**

- `role` comes from the database row, never from `req.body`
- `authenticate` re-reads the user from the DB on every request, so
  deactivation takes effect immediately — the JWT claims are not trusted
- `student_id` comes from `users.student_id`, never from a URL param or body
- approve/reject filter on `role = 'parent'` so a teacher cannot be approved
  through the parent route
- every `:id` route param is validated with `parseId()` from
  `utils/validateId.js` before it touches a query — reject non-numeric or
  non-positive values with `400`. Found in `routes/users.js` approve/reject:
  `Number(req.params.id)` on an unvalidated param becomes `NaN` and reaches
  MySQL as `WHERE id = NaN`. MySQL rejected it, so nothing leaked, but the
  auth pattern audit had missed route params entirely — role and
  `student_id` handling were solid, this wasn't.
- `sanitizeUser()` strips the password hash from every response
- `logActivity()` writes to `activity_logs` on every write operation

When starting a new module, say this:

> Follow the exact same pattern as `routes/users.js` and `routes/students.js`:
> `authenticate` + `authorize()`, `parseId()` on every `:id` param,
> `sanitizeUser` on any response containing a user row, and `logActivity`
> for any write. Do not invent a new structure.

**Known caveat:** `sanitizeUser` only deletes the key named `password`. If a
JOIN ever aliases the hash to another name, it leaks. Watch for this when
writing joins against `users`.

---

## LOCKED DECISIONS — do not re-litigate

**Architecture:** 3-tier — Presentation → Application → Data

**Stack**

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, MySQL, JWT, bcrypt, Socket.io |
| Web | React, Tailwind CSS, Font Awesome — no other UI library |
| Mobile | React Native (Expo). Not PWA. Not Flutter. |

**Repo layout:** `server/` and `client/` as separate folders, separate
`package.json`, two terminals. **No monorepo tooling** — no workspaces,
no Turborepo, no nx.

**Mobile scope:** all 10 features, all 3 roles. Backup/Restore is the one
web-only exception.

**Authentication — implemented and tested**

- `login_id` + password only. **No role dropdown.**
- Parent logs in with the child's **LRN**. Teacher and Admin use assigned IDs.
- **No self-registration.** Teacher creates parent (`pending`) → Admin
  approves (`active`). Admin creates teacher (`active` immediately).
- No grade-level selection after login.
- **One account per student.** A guardian with three children has three
  accounts. This is deliberate, for data isolation. **Do not suggest a
  bridge table.**

---

## THE 10 CORE FEATURES

1. Grade Management & Viewing
2. Attendance Monitoring
3. Student Records Management
4. Announcements & Memo Dissemination
5. Parent-Teacher Messaging (Socket.io)
6. Excuse Letter Submission & Management
7. Contribution/Fees Monitoring — view and track only, no payment gateway
8. User Management (Admin)
9. System Settings Management (Admin)
10. Backup & Restore (Admin, web only)

**Excluded from scope:** QR attendance, online payment, enrollment,
transcript requests, schedule grid, college grading.

---

## BLOCKED — do not build until answered

### Grades module — waiting on the school visit

- Four quarters or three terms for SY 2026–2027?
- Numerical or descriptive grading for Grades 1–3?
- Three grade components or five? The manuscript (Figures 17 and 25) lists
  five — quizzes, recitation, participation, projects, examinations. The
  schema supports three.
- What weights, and keyed by **subject** or by **grade level**?

**Do not build grade computation logic until these are answered.** Building
on a guess means rewriting the module.

### Known schema issue

`grade_weight_configs` is keyed by grade band:

```sql
grade_level_min TINYINT,
grade_level_max TINYINT
```

Seeded as G1–3: 30/50/20 and G4–6: 40/40/20. **This basis is wrong.** DepEd
weights vary by **learning area**, not grade level — Math is 40/40/20 while
Filipino is 30/50/20 for the *same* student in the *same* quarter. Must be
re-keyed to `subject_id` once the school confirms actual practice.

---

## KNOWN ISSUES — fix when you reach them

| Issue | Where | Note |
|---|---|---|
| `users.email` has no UNIQUE constraint | `schema.sql` | Only matters if email login is added later. Duplicate emails would break the lookup. |
| `create-backup-zip.js` copies folders | `scripts/` | Not a database backup. The Backup/Restore module needs `mysqldump`, not a folder copy. |
| `grade_components.type` is `ENUM('quiz','activity')` | `schema.sql` | Manuscript promises five components. Blocked on the school. |
| No `Download Statement` export | — | Promised in manuscript Figure 19. Build a CSV export from `contribution_records`, or remove it from the paper. |
| No GWA computation | — | Defined in the manuscript's Definition of Terms but implemented nowhere. Keep or drop — undecided. |

---

## SAFE TO BUILD NOW

**React web auth frontend.** Nothing external affects it.

- Login page — Login ID + password, no role dropdown
- `ProtectedRoute` component reading role from the JWT
- Three role dashboards: `/admin`, `/teacher`, `/parent`
- Axios client with JWT interceptor and 401 handling

Watch for the refresh flash: before the token loads from storage, `user` is
briefly `null`. Without a `loading` state the login page flashes even when
the user is authenticated.

---

## BUILD ORDER — tick these off as you go

Work top to bottom. Do not jump ahead. Update the checkboxes in this file
at the end of each session.

### Stage 1 — Foundation ✅ DONE

- [x] Database schema — 18 tables
- [x] Seed data
- [x] Auth backend — login, JWT, RBAC, approve/reject
- [x] Auth tests

### Stage 2 — Auth frontend ✅ DONE

Do this before any other backend module. It is the only work with zero
external dependencies, and it turns a terminal-only project into something
you can actually see on screen.

- [x] `client/` folder + React + Tailwind + Font Awesome setup
- [x] Axios client with JWT interceptor and 401 handling
- [x] Login page — Login ID + password, no role dropdown
- [x] `ProtectedRoute` with a loading state (prevents the refresh flash)
- [x] `/admin` `/teacher` `/parent` empty dashboards
- [x] Shared layout — sidebar, header, logout

Login round-trip verified in the browser — see "React web app" note under
CURRENT STATE.

### Stage 3 — Backend modules

Order matters. Student Records first because everything references students.
Grades is last in this stage because it is blocked.

- [x] Student Records API — list, view, create, update
- [x] Attendance API — per day, per subject
- [x] Announcements + Memos + Events API
- [ ] Excuse Letters API — submit, review, approve/decline
- [x] Contributions API — create, record payment, view status
- [ ] Messages API + Socket.io
- [x] System Settings API (admin)
- [x] User Management API — extend the existing `routes/users.js`
- [ ] Backup/Restore API (admin, `mysqldump` — not a folder copy)
- [ ] **Grades API — BLOCKED**, see the Blocked section above

### Stage 4 — Web pages

- [ ] Parent pages — grades, attendance, records, announcements, messages,
      excuse letters, contributions
- [ ] Teacher pages — same set plus management views
- [ ] Admin pages — user management, settings, backup/restore

### Stage 5 — Mobile (Expo)

- [ ] Expo project setup + navigation
- [ ] Login + role routing
- [ ] Parent screens
- [ ] Teacher screens
- [ ] Admin screens (Backup/Restore excluded — web only)
- [ ] Push notifications

### Stage 6 — Integration

- [ ] End-to-end testing across web and mobile
- [ ] Deployment decision: localhost or Railway + Vercel + Cloudinary
- [ ] Demo data and rehearsal

**Why auth frontend comes before the other backend modules:** finishing all
ten backend APIs first means reaching roughly 65% of the work with nothing
visible on screen. If time runs short at that point, there is a collection of
endpoints and no demo. One complete vertical slice first means there is
always something to show.

---

## END OF EVERY SESSION

Paste this before you stop working:

```
Update CLAUDE.md AND docs/PROJECT_PROGRESS.md:
1. Add today's changes to the CLAUDE.md CHANGELOG with the date
2. Update CURRENT STATE in CLAUDE.md to match the actual code
3. Tick off completed items in BUILD ORDER
4. Mirror the same state into docs/PROJECT_PROGRESS.md

Both files must agree. Only list what is verifiably working. If a
module has tables but no handlers, it is NOT started. Endpoints, not
percentages.
```

Skipping this is how `PROJECT_PROGRESS.md` drifted out of sync with the code
before.

---

## MANUSCRIPT — audit complete, do not re-audit

All 81 pages read. **113 items found.** Two documents exist for the team:
a Correction Sheet with ready-to-paste replacement text, and a Revision
Request covering the 5 items awaiting adviser approval.

**Key finding: the manuscript contradicts itself.** Figure 5 (DFD Level 1)
and Figure 9.1 state that the admin creates teacher accounts and teachers
create parent accounts — which is exactly what was built. Figures 11, 12,
and 13 show open self-registration. **The build followed the DFD.** Do not
flag the auth flow as a deviation.

**Caution:** Figure 4 (DFD Level 0) lists "registration details" as a parent
input, contradicting Figure 5. When citing the DFD in any explanation,
always say **Figure 5** specifically.

---

## PHASE SEQUENCING — no skipping

1. **NOW** — system build + data gathering (206 respondents, locked by the
   professor; never suggest reducing it)
2. Professor meeting → request Chapter 4–5 format guidelines
3. Write Chapters 4–5
4. Defense preparation

If asked to start Chapters 4–5: *Chapters 4–5 cannot begin until the system
is functionally complete and the professor provides format guidelines.*

Data gathering distribution is solved — Google Form plus printed copies,
handled by the team. Do not re-raise it.

---

## OPEN QUESTIONS

- Adviser response to the 5 revision requests
- School answers on grading (see Blocked, above)
- Do all parents actually know their child's LRN? If not, the login design
  needs rethinking.
- Deployment for the demo: localhost or cloud (Railway + Vercel + Cloudinary)?
  Undecided. Blocks the Figure 1 hardware requirements in the manuscript.
- `Manage Templates` (Figure 23) — undefined in the manuscript. Likely means
  the grade weight configuration display. Confirm or remove.
- `activity_logs` exists in the schema but appears nowhere in the manuscript.
  Document it as a security feature, or drop the table.

---

## HOW TO WORK WITH DARRYL

**Prefers**

- Direct, action-oriented language
- Technical specificity — exact endpoints, column names, field types
- Structured formatting with clear hierarchy
- Open questions surfaced explicitly at the end
- Taglish is natural and fine

**Avoid**

- Vague suggestions, or repeating advice already given
- Lecturing after a decision has been made
- Drifting to code when he asks for something else
- Manufacturing urgency around September 7 — it is a checkpoint, not the
  final defense
- Long responses when a short one answers the question

When Darryl corrects a wrong assumption, accept it and move on. The `.md`
and `.sql` files describe the real system; the manuscript describes the
approved design. **When they conflict, say so plainly** rather than assuming
either one is wrong.

---

## UPDATING THIS FILE

See **End of Every Session** above for the exact prompt to paste.

List **endpoints, not percentages.** A percentage is an opinion; an endpoint
is a fact. `PROJECT_PROGRESS.md` drifted because it listed planned modules as
progress — do not let this file do the same.

---

## CHANGELOG

| Date | Change |
|------|--------|
| 2026-08-27 | User Management completed — `routes/users.js` gains `GET /api/users` (filter by role/status/search), `GET /api/users/:id`, `PUT /api/users/:id` (name/email/contact_number only — `role`/`login_id`/`student_id`/`password`/`status` are rejected with `400` naming them if sent, not silently dropped), and `PATCH /api/users/:id/status` (active/inactive only). Schema change: `users.status` ENUM gained `'inactive'` (`schema.sql` + live DB) — reusing `'rejected'` would have shown a deactivated teacher a false "account was rejected" message on login, since that value is wired to the parent-approval flow's `rejection_reason` column. Zero changes needed in `auth.js`/`middleware/auth.js` — both already had a generic `status !== 'active'` fallback, so deactivation takes effect immediately, including on an already-issued JWT (verified in tests). Found and fixed a real landmine while doing this: `test-auth-flows.js`'s existing "unexpected status" test temporarily widened the ENUM to add `'inactive'` for itself and then narrowed it back to 3 values in its `finally` block — now that `'inactive'` is permanent, that narrowing would have silently deleted it from the schema on every subsequent `test:auth` run, breaking the new status endpoint with no obvious cause. Removed both `ALTER TABLE` statements from that test. `PATCH .../status` blocks self-deactivation unconditionally, and separately blocks deactivating the last active admin via an independent `COUNT(*) WHERE role='admin' AND status='active'` check — tested honestly: the count-check's *blocked* branch can't actually be triggered through the API, because any non-self admin acting is themselves active and always counts toward the total, so `count <= 1` is only ever reachable when actor equals target, which the unconditional self-check already catches first. Tested what's real (the allow branch, self-block, and a source check confirming the count-check's logic and message are actually wired up) instead of writing a test that would only appear to exercise it. `npm run test:users` — 39 passing, idempotent. |
| 2026-08-27 | System Settings API built — `routes/settings.js`, `GET /`, `GET /:key`, `PUT /:key`, `PATCH /` (bulk, all-or-nothing). `system_settings` is key-value with a 5-key allow-list (`school_name`, `school_address`, `academic_year`, `current_quarter`, `logo_url`) — writing an unknown key is rejected with `400` naming the allowed ones, never silently accepted. `parseId` doesn't apply to `:key` (a string, not a numeric id) — corrected before writing code; an unknown key on a read is `404`, on a write is `400`. `current_quarter`'s valid values are read live from `grades.quarter`'s ENUM via `INFORMATION_SCHEMA.COLUMNS` instead of a hardcoded list, specifically because that ENUM is provisional (CLAUDE.md's own Blocked section — 4 quarters vs. 3 terms is still an open question for the school); a hardcoded copy here would be a second place to update that would silently go stale the moment the real answer came in. Fixed the long-standing `academic_year` seed typo as part of this — `seed.sql` and the live DB both now say `'2026-2027'`. `npm run test:settings` — 26 passing, idempotent (restores original values in a `finally`, same pattern as the auth suite's password-cycling test); includes a source-inspection test confirming the `current_quarter` validator actually queries `INFORMATION_SCHEMA` rather than a hardcoded array, since no black-box HTTP test can distinguish the two without mutating `grades.quarter`, which was ruled out. |
| 2026-08-27 | Contributions API built — `routes/contributions.js`, 8 endpoints across `contributions` (the fee) and `contribution_records` (per-student payment status). `grade_level` is `NOT NULL` on `contributions` — unlike announcements/events there is no school-wide option; a teacher just needs the grade to match a `teacher_assignments` row, no NULL-target case to reject. Roster (`GET /:id/records`) is a live `LEFT JOIN` against active students in the contribution's grade, not a snapshot generated at creation — a student who enrolls after the fee is posted shows up automatically, defaulted to `Pending`. Caught a real bug before shipping: an amount-override on `PATCH .../records/:studentId` (a student can owe less than the full fee, never more — enforced with a `400` naming the cap) defaulted to the full fee on every write, which would have silently reset a previously-set discount back to full price on a plain status-only `PATCH`; fixed by defaulting to the existing record's amount instead, tested explicitly. `DELETE` is blocked with a `409` naming the exact count ("Cannot delete. 1 payment record exists for this contribution. Clear the payment records first if you need to remove it.") when any `contribution_records` exist — `contribution_records.contribution_id` is `ON DELETE CASCADE`, so an unguarded delete would have silently destroyed payment history with no recovery; caught from reading the schema's FK constraints before writing the delete handler, not after. `GET /api/contributions/my-records` never touches another student's row, individually or in aggregate — verified in tests by asserting the response carries no count/total-shaped fields, not just checking the query. `npm run test:contributions` — 35 passing, idempotent. |
| 2026-08-27 | Announcements/Memos/Events API built — `routes/content.js`, one file, three routers (`announcementsRouter`, `memosRouter`, `eventsRouter`) mounted at their own prefixes. Schema check caught a spec error before writing code: `events` has no `target_section` column — only `announcements` does — so event audience scoping is grade-only, never section-level. Audience read-scoping: parent sees school-wide items plus their own child's grade(+section for announcements); teacher sees school-wide plus anything matching their `teacher_assignments`; admin sees everything. Write-scoping: a teacher must name an exact grade+section (announcements) or grade (events) they're assigned to — leaving `target_grade` `NULL` (school-wide) or omitting `target_section` (whole-grade) is rejected with a `403` that names the specific reason ("School-wide announcements are admin-only. Specify a target_grade and target_section you are assigned to.") rather than a bare "forbidden" — deliberately, so a teacher hitting this mid-demo sees a rule, not a bug. `PUT`/`DELETE` are author-or-admin. Memos have no targeting or category columns at all — schema confirms they're school-wide by design, matching the manuscript's simpler single-Memo intent; writes are admin-only, reads open to all roles. Hard delete kept as specified (no status column on any of the three tables); `logActivity` captures the title before the row is gone. `npm run test:content` — 45 passing, idempotent. |
| 2026-08-27 | Attendance API built — `routes/attendance.js`: list/record/bulk-record/correct/per-student/summary. Teacher scoping checks `teacher_assignments` on `subject_id` **and** `grade_level`+`section` together, not just grade/section — a teacher assigned to teach Math for Grade 6-Mabini can't see or record Science attendance for the same class. `POST /` and `POST /bulk` collapse "student doesn't exist" and "exists but out of scope" into the same `403` for a teacher (no way to enumerate students by testing which error comes back); admin is unscoped on all writes, covering a teacher being absent or having left. `POST /bulk` is all-or-nothing in a transaction — every entry validated before anything is written, so a bad `student_id` in a 30-student roster fails the whole batch instead of silently dropping one. Recording the same `(student_id, subject_id, date)` twice updates via `ON DUPLICATE KEY UPDATE` rather than erroring. `GET .../summary/:studentId` returns raw counts only (`Present`/`Absent`/`Late`/`Excused`/`total`) — no computed rate, since the school hasn't confirmed how attendance rate should be calculated. `npm run test:attendance` — 28 passing, idempotent. |
| 2026-08-27 | Both test suites made idempotent — `test-auth-flows.js` and `test-student-flows.js` now generate timestamp-suffixed LRNs/login IDs per run and delete everything they create in a `finally` block, so `npm run db:setup` is no longer required between runs. Previously both used fixed values (`9999999`, `8888888`) with no cleanup, so a second run without a reset failed 6 of 25 auth assertions on stale state, not code — this was masking real signal with a false failure and would only get worse as the remaining 8 modules add their own suites. Cleaned the pre-existing polluted rows out of `users`/`students` (DB now byte-for-byte the seeded 4 users / 2 students). Verified by running each suite twice back-to-back with no reset in between: 28/28 and 25/25 both times. |
| 2026-08-27 | Student Records API built — `routes/students.js`: `GET /api/students` (list, filterable), `GET /api/students/:id`, `POST /api/students`, `PUT /api/students/:id`, `PATCH /api/students/:id/status` (admin only, no hard delete). Parents see only their own child (`req.user.student_id`, never the URL param); teachers see only students in their `teacher_assignments` grade/section pairs — both an out-of-scope read and a nonexistent id return the same `404`, so neither role can enumerate students outside their reach. Teacher-initiated creates are the one place scope violations return `403` instead of `404` — there's no id to enumerate on a create, and the teacher needs to know why it failed. LRN is immutable after creation (it doubles as a parent's `login_id`). Found and fixed a real bug while building this: `routes/users.js` approve/reject passed `Number(req.params.id)` straight into a query with no validation — a non-numeric id becomes `NaN` and reaches MySQL as `WHERE id = NaN` (MySQL rejected it, so nothing leaked, but it should never have reached the query layer). Added `utils/validateId.js` (`parseId()`) as the one shared fix, applied to both `routes/users.js` and `routes/students.js`, and folded into the auth pattern template for every future module. `npm run test:students` — 28 passing. |
| 2026-08-27 | React auth frontend built — `client/` (Vite, React 19, Tailwind v4, Font Awesome). `AuthContext` awaits `GET /api/auth/me` on load instead of decoding the JWT client-side, so a deactivated account can't render a dashboard off a still-valid-looking token. Axios interceptor skips its 401/403 redirect when the failing request is the login call itself, so bad credentials and pending/rejected accounts show inline on the login form instead of bouncing away from it. MySQL started, `db:setup` run, all 24 auth tests pass, and the full login round-trip verified in the browser — admin → `/admin`, wrong password → inline error, pending account → inline message, refresh → spinner with no login-page flash. |
| 2026-08-26 | Login now asserts `status === 'active'` before `signToken`. Test added. |
| 2026-08-13 | Auth backend complete — login, JWT, RBAC, approve/reject. 23 tests. |
| 2026-08-12 | Database schema + seed, 18 tables. `.gitignore` added. |
| 2026-08-15 | Build restarted from zero. No legacy code. |