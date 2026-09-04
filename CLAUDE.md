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
| Database | `parents_portal` — 20 tables |
| Sept 7, 2026 | System proposal checkpoint — **not** the final defense |
| Final defense | Expected around November 2026 |

The four other team members handle the manuscript and data gathering.
**Darryl codes.** Do not assign manuscript work to Darryl or coding tasks
to the team.

---

## CURRENT STATE

**Last verified:** 2026-08-30 (audited against the code, not the docs)

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
| GET | `/api/sections` | all roles — unscoped reference data, no per-role filtering |
| GET | `/api/sections/:id` | all roles — `404` only for a genuinely nonexistent id |
| PATCH | `/api/sections/:id/adviser` | admin — assigns/clears a section's adviser, one teacher may advise more than one section |
| GET | `/api/attendance` | teacher (section adviser), admin |
| GET | `/api/attendance/student/:studentId` | teacher (adviser), admin, parent (own child only) |
| GET | `/api/attendance/summary/:studentId` | teacher (adviser), admin, parent (own child only) — raw counts, no rate |
| POST | `/api/attendance` | teacher (adviser of student's section), admin (unscoped) |
| POST | `/api/attendance/bulk` | teacher (adviser of section_id), admin (unscoped) — primary path, all-or-nothing |
| PUT | `/api/attendance/:id` | teacher (adviser of record's section), admin (unscoped) |
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
| POST | `/api/excuse-letters` | parent — status always Pending, forbidden fields in body ignored |
| GET | `/api/excuse-letters/mine` | parent — own letters only |
| GET | `/api/excuse-letters` | teacher (own assigned students only), admin (all) — filters: status, student_id, from, to |
| GET | `/api/excuse-letters/:id` | all roles, scoped — `404` on violation |
| PUT | `/api/excuse-letters/:id` | parent, own letter, only while `status='Pending'` — `404` if not theirs, `403` naming the reason if already reviewed |
| PATCH | `/api/excuse-letters/:id/review` | teacher (adviser of student's section only), admin — `Approved`/`Declined`, never touches `attendance` |
| GET | `/api/settings` | authenticated — all settings, flat key-value object |
| GET | `/api/settings/:key` | authenticated — `404` if not one of the 5 allow-listed keys |
| PUT | `/api/settings/:key` | admin — per-key validation, unknown key rejected naming the allow-list |
| PATCH | `/api/settings` | admin — bulk update, all-or-nothing in a transaction |
| GET | `/api/backups` | admin — list, newest first, each row flags `file_exists` |
| POST | `/api/backups` | admin — real `mysqldump`, row inserted only after success |
| GET | `/api/backups/:id/download` | admin — streams the `.sql` file, `404` if missing on disk |
| DELETE | `/api/backups/:id` | admin — removes row + file; row still removed if file already gone |
| POST | `/api/backups/:id/restore` | admin — step-up password + `confirm_filename`, automatic safety dump first, invalidates every JWT |
| GET | `/api/messages/conversations` | authenticated — one row per person messaged, last message + unread count |
| GET | `/api/messages/with/:userId` | authenticated — full thread, participant-scoped (no re-check of `canMessage` on read) |
| POST | `/api/messages` | authenticated — `canMessage()` boundary, `403` naming the reason on violation |
| PATCH | `/api/messages/:id/read` | recipient only — sender or a third party gets `403` |
| PATCH | `/api/messages/read-all/:userId` | recipient only — marks a whole thread read |

**Backup and Restore both built.** See "RESTORE" below for what shipped and
what the automated suite deliberately does not cover.

**Tests:** thirteen suites. The twelve HTTP suites are idempotent — every row they
create is tracked and deleted in a `finally` block (or, for Settings, restored to
its original value; for Sections, the two NULL-adviser test sections are reset to
NULL and the throwaway teacher fixture deleted, via a direct DB write, not a
remembered API call), so no `db:setup` is needed between runs. Verified by running
each twice in a row with no reset: same pass count both times, and the DB
confirmed back to the seeded 4 users / 2 students / 0 everywhere else (attendance,
announcements, memos, events, contributions, contribution_records, excuse_letters,
backups, messages) — plus sections back to exactly 2 of 23 rows with a real
adviser_id (Malikhain → TCH-001, Masigasig → TCH-002, both untouched by the
suite) — after. `test:sanitize` is a direct-call unit test — no server or DB
involved. `test:restore` is the one exception to "runs a real flow end to end":
it tests every pre-flight gate and the `token_valid_after` mechanism, but
never triggers an actual restore — see the RESTORE section.
- `npm run test:students` — 30/30
- `npm run test:sections` — 30/30
- `npm run test:auth` — 25/25
- `npm run test:attendance` — 38/38
- `npm run test:content` — 47/47
- `npm run test:contributions` — 38/38
- `npm run test:settings` — 27/27
- `npm run test:users` — 39/39
- `npm run test:backups` — 39/39
- `npm run test:sanitize` — 9/9
- `npm run test:messages` — 39/39
- `npm run test:restore` — 22/22
- `npm run test:excuses` — 56/56

### Files that exist

```
server/
  server.js                    Express app + explicit http.createServer wrapping it (so Socket.io
                                shares the same server, not a second one — app.listen() replaced
                                with httpServer.listen()); mounts /api/auth, /api/users,
                                /api/students, /api/attendance, /api/announcements, /api/memos,
                                /api/events, /api/contributions, /api/settings, /api/backups,
                                /api/messages
  socket.js                    initSocket(httpServer) — JWT auth at connection time, one room per user
  package.json                 socket.io (dependency), socket.io-client (devDependency, test-only)
  .env.example                 documents optional MYSQLDUMP_PATH override
  config/db.js                 MySQL pool behind a proxy object (query/getConnection delegate to the
                                current pool) — resetPool() swaps in a fresh pool after a restore,
                                which a plain module.exports reassignment couldn't do (every existing
                                `require('../config/db')` holds a direct reference, not a live binding);
                                dateStrings: ['DATE'] — DATE columns come back as raw 'YYYY-MM-DD'
                                strings, never JS Date objects, so no UTC-conversion round-trip bug
                                is possible; TIMESTAMP/DATETIME columns unaffected
  middleware/auth.js           authenticate + authorize; authenticate also checks
                                auth_security_state.token_valid_after against the JWT's iat
  routes/auth.js               login, me, change-password
  routes/users.js              create teacher/parent, pending, approve/reject, list/view/edit/status
  routes/students.js           list/view/create/update, teacher scoped to own assignments
  routes/sections.js           GET /, GET /:id (all roles, unscoped reference data — no per-role
                                filtering), PATCH /:id/adviser (admin only, assigns/clears
                                adviser_id — the only mutable field). No POST/DELETE, the 23
                                sections are fixed for the school year. student_count via a
                                correlated subquery, not JOIN + GROUP BY (see file comment) —
                                same GROUP BY-avoidance reasoning as the Messages module's
                                window function
  routes/attendance.js         record/bulk/correct/list/summary — per DAY (Stage B1), not per subject.
                                No subject_id anywhere in this file. Scoped by section adviser
                                (sections.adviser_id via students.section_id), not teacher_assignments —
                                subject teachers don't record attendance under this model.
                                teacherIsAdviserOfSection() replaces the old teacherHasAssignment().
                                POST /bulk is the primary path: { section_id, date, entries }
  routes/content.js            announcements/memos/events — 3 routers, one file
  routes/contributions.js      fee + per-student payment status, lazy roster, delete guard
  routes/settings.js           key-value store, allow-listed keys, per-key validation
  routes/backups.js            real mysqldump via spawn, MYSQL_PWD on child env only, collision-safe
                                filenames; dumpDatabase() runs mysqldump twice — main dump with
                                --ignore-table=<db>.backups, then a --no-data pass appended for
                                backups alone, so its data (self-referential, see RESTORE) is never
                                in the file; stripBackupsTableDdl() removes backups' DROP/CREATE
                                TABLE from the SQL the restore connection executes (exported for
                                direct unit testing) — the dump FILE still has the real CREATE
                                TABLE for bare-metal recovery, only what gets executed is filtered;
                                GET / reconciles server/backups/ against the table and surfaces
                                unmatched files as orphaned_files, never auto-inserted;
                                POST /:id/restore — step-up password, confirm_filename, automatic
                                pre_restore_* safety dump, dedicated one-off mysql2 connection
                                (multipleStatements) outside the shared pool, pool reset,
                                token_valid_after set
  routes/messages.js           canMessage() boundary on send, participant-scoped reads, emits on send
  routes/excuses.js            submit/mine/list/view/edit/review — full module, both blockers
                                resolved (see BLOCKED / RESOLVED); parent_id/student_id/status
                                always from req.user, never req.body; teacher list/view scoped via
                                the exact EXISTS-on-teacher_assignments shape routes/students.js
                                uses (broader than review — any assigned teacher, not just the
                                adviser); PATCH /:id/review is adviser-only (sections.adviser_id),
                                writes only status/teacher_remarks/reviewed_by, never attendance
  backups/                     .sql dump files land here — gitignored except .gitkeep
  utils/jwt.js                 sign/verify
  utils/password.js            bcrypt hash/compare
  utils/activity.js            insert into activity_logs
  utils/validateId.js          parseId() — validates :id route params before any query
  utils/sanitizeUser.js        sanitizeUser() — strips any key containing "password", case-insensitive
  utils/dateFormat.js          isValidDateFormat() + todayLocalDateString() — shared by
                                attendance/content/contributions, replacing 3 duplicated copies
  scripts/setup-db.js          runs schema + seed, hashes seed passwords; backfillSectionIds()
                                runs after seeding — populates section_id from the matching VARCHAR
                                value (name+grade_level+school_year), then reports any row left
                                NULL with the unmatched value. Deliberate, not incidental — this is
                                what caught 'Mabini'/'Rizal' as fictional; do not remove the
                                reporting step even once every value matches cleanly.
                                buildUserSeedSql() also creates TCH-002 (Ana Reyes, fictional,
                                adviser of Grade 5 - Masigasig) alongside TCH-001
  scripts/test-auth-flows.js   HTTP tests
  scripts/test-student-flows.js HTTP tests — scoping, validation, lifecycle
  scripts/test-sections-flows.js HTTP tests — 23-row fixed inventory, admin-only PATCH, role/status
                                validation on adviser_id, one teacher advising two sections. Every
                                mutation runs against 2 of the 21 NULL-adviser sections (resolved
                                by id, never Malikhain/Masigasig), reset to NULL via a direct DB
                                write in a finally block — never a remembered "restore the seeded
                                value" step
  scripts/test-attendance-flows.js HTTP tests — per-day model (Stage B1): adviser scoping via
                                sections.adviser_id, bulk section_id validation, all-or-nothing
  scripts/test-content-flows.js HTTP tests — audience scoping, named 403 reasons, author-or-admin
  scripts/test-contributions-flows.js HTTP tests — grade scoping, roster, amount cap, delete guard
  scripts/test-settings-flows.js HTTP tests — allow-list, per-key validation, PATCH all-or-nothing
  scripts/test-user-management-flows.js HTTP tests — admin-only, PUT forbidden fields, status guards
  scripts/test-backups-flows.js HTTP tests — real dump execution, collision guard, missing-file handling
  scripts/test-sanitize-user.js Direct-call unit test — no server/DB, tests the aliased-JOIN password gap
  scripts/test-messages-flows.js HTTP + Socket.io tests — canMessage boundary, connection auth, source check
  scripts/test-restore-flows.js HTTP tests — every pre-flight gate, token_valid_after via crafted JWTs;
                                deliberately never triggers a real restore, see CURRENT STATE
  scripts/test-excuses-flows.js HTTP tests — forbidden-body-fields ignored, absence_date round-trip,
                                cross-parent 404, teacher scoping, Pending-only edit guard, and
                                review: adviser-only 403 (not 404, deliberately — see the comment
                                in routes/excuses.js), already-reviewed 403, attendance-row-count
                                unchanged before/after an approval, admin-unscoped review
database/
  schema.sql                   20 tables. users.status ENUM now includes 'inactive'.
                                backups.file_size added (bytes, populated after dump succeeds).
                                auth_security_state — single-row (id=1), token_valid_after, set only
                                by POST /api/backups/:id/restore, never exposed through /api/settings.
                                sections — id, name, grade_level, adviser_id, school_year; UNIQUE
                                (grade_level, name, school_year); fk_sections_adviser -> users(id)
                                ON DELETE SET NULL. Nullable section_id + FK added to students
                                (RESTRICT), teacher_assignments (CASCADE), announcements (CASCADE) —
                                see "sections table" below for which routes actually use this.
                                attendance — subject_id column, its FK, and its index DROPPED
                                (Stage B1, not made nullable — table held 0 rows, clean rebuild);
                                UNIQUE KEY uq_attendance now (student_id, date), was
                                (student_id, subject_id, date)
  seed.sql                     subjects, students, settings; academic_year fixed to '2026-2027'.
                                23 sections seeded for SY 2026-2027 (school's official teacher
                                list). Marwin/Jea's sample sections were fictional ('Mabini',
                                'Rizal') and are now real seeded names ('Malikhain', 'Masigasig').
                                2 of 23 sections have an adviser_id seeded (Grade 6 - Malikhain ->
                                TCH-001, Grade 5 - Masigasig -> TCH-002, both keyed by login_id
                                subquery, not a hardcoded numeric id) — the other 21 stay NULL,
                                admin assigns those through the UI, not seed data
scripts/
  create-backup-zip.js         folder copy, source-code archiver — NOT the DB backup (that's routes/backups.js)
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

Grades

**No Expo app.**

Grades has a table in `schema.sql` but no route file and no queries yet.
The school-visit answers that were blocking it have arrived (DO 009/DO 015
s. 2026 — see BLOCKED) — **the module is now answered, not blocked, but
still not built.** Building it is a separate task from documenting the
answers, which is all this entry records. Backup/Restore is fully built —
5 endpoints, see "RESTORE" below. **Excuse Letters is fully built** — both
original blockers (who approves, does approval touch attendance) are
resolved and `PATCH /:id/review` is implemented; see BLOCKED / RESOLVED
and the 2026-09-05 CHANGELOG entry.

### sections table — one route reads it now (attendance), one route manages it (sections), eight still don't

**The thing a fresh session will get wrong.** `sections` exists in
`schema.sql`, is seeded with the school's 23 real section names, and has a
nullable `section_id` FK on `students`, `teacher_assignments`, and
`announcements`. As of Stage B1, **`routes/attendance.js` reads
`section_id`** — every scope check in that file goes through
`sections.adviser_id` via `students.section_id`, and `POST /bulk`'s body is
keyed on `section_id` directly, not a grade+section VARCHAR pair. **Every
other route file still scopes entirely on the VARCHAR columns**
(`students.section`, `teacher_assignments.section`,
`announcements.target_section`) — attendance is the *one* deliberate
exception, not the start of a silent migration.

This is still deliberate, still scoped, still not a migration in progress.
A full VARCHAR → FK cutover touches every remaining route file that scopes
by grade/section and changes the API contract
(`section: "Malikhain"` → `section_id: 13`) for no user-facing gain on its
own. `section_id` was planned to be read in exactly two places:
**attendance (done)** and the Class Board (not built). Do not start
migrating a third route to `section_id` without checking here first — that
would be exactly the scope creep this note exists to prevent.

**`routes/sections.js` (new) is a different thing from that migration —
do not conflate the two.** It doesn't read `section_id` to scope some
*other* resource the way `attendance.js` does; it's the CRUD-minus-create
management interface for the `sections` table itself: `GET /`, `GET /:id`
(both unscoped — sections are reference data every role sees in full, no
per-role filtering, no 404-as-anti-enumeration), and
`PATCH /:id/adviser` (admin only — assigns or clears `adviser_id`, the
only mutable field; no `POST`/`DELETE`, the 23 sections are fixed for the
school year). This is what makes an unassigned section usable by
attendance — before this route existed, setting `adviser_id` on one of
the 21 `NULL` sections meant a direct DB write, not an admin action.

`sections.adviser_id` is seeded for **2 of 23** sections: Grade 6 -
Malikhain → TCH-001, Grade 5 - Masigasig → TCH-002 (a second seeded
teacher account, added specifically so adviser-scoping could be tested
against a real non-adviser, not a fabricated one). The other 21 are
still `NULL` — `PATCH /api/sections/:id/adviser` is now how an admin
assigns them (via a direct API call; there is still no admin *UI* page
for it, that's Stage 4), and attendance for those 21 sections has no
valid adviser until each is assigned, one call at a time or by hand.

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
- `sanitizeUser()` from `utils/sanitizeUser.js` strips every key whose name
  contains `password` (case-insensitive) from every response containing a
  user row — not just the literal `password` key, so an aliased JOIN column
  can't leak it
- `sanitizeUser` is for responses built from `SELECT *` or `u.*` on `users`
  — a query that only selects the columns it needs doesn't need it, and
  calling it there anyway is theatre, not defense. Confirmed in Messages:
  every query selects `name`/`role` explicitly, never a password-shaped
  column, so nothing calls `sanitizeUser` there — the fix is not fetching
  the column, not scrubbing it after
- `logActivity()` writes to `activity_logs` on every write operation

When starting a new module, say this:

> Follow the exact same pattern as `routes/users.js` and `routes/students.js`:
> `authenticate` + `authorize()`, `parseId()` on every `:id` param,
> `sanitizeUser` on any response containing a user row, and `logActivity`
> for any write. Do not invent a new structure.

**Fixed, no longer a caveat:** `sanitizeUser` used to only delete the key
literally named `password` — a JOIN aliasing the hash to another name
(`creator_password`, `sender_password`, `u2_password`, ...) would have
leaked it straight through. Now lives in one place, `utils/sanitizeUser.js`
(was duplicated identically in `routes/auth.js` and `routes/users.js`), and
strips **any** key whose name contains `password`, case-insensitive —
covers every aliased-JOIN shape, not just the exact column name. Directly
relevant to Messages: that module JOINs `users` twice, for sender and
receiver names, which is exactly the shape that used to trigger this.
Unit-tested directly (not through HTTP — no endpoint produces an aliased
row yet) in `scripts/test-sanitize-user.js`.

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

## BLOCKED / RESOLVED

Answers from the school visit and from published DepEd orders land here as
they arrive. An item moves from **BLOCKED** to **RESOLVED** the moment the
question is answered — that is a documentation change, not a build. Do not
read a RESOLVED heading as "built"; check the endpoints table and BUILD
ORDER for that.

### Grades module — RESOLVED (school visit + DO 009/DO 015 s. 2026), not yet built

All four original blocking questions are now answered:

- **Terms, not quarters.** DO 009 s. 2026: three terms for SY 2026–2027,
  not four quarters. Term 1 Jun 8–Sep 15, Term 2 Sep 16–Dec 18, Term 3
  Jan 4–Apr 8. 201 class days total. `system_settings.current_quarter`
  and `grades.quarter ENUM('Q1','Q2','Q3','Q4')` are now both the wrong
  shape — built for a quarter system that isn't the one in use.
- **Grading system — split, not uniform.** Grade 1 uses descriptive
  grading (A/B/C/D/E) for SY 2026–2027. Grades 2–6 stay numerical, with an
  adjusted transmutation table (e.g. IG 70.00 → TG 75). **Both systems run
  simultaneously** — this is not "Grades 1–3 vs. 4–6" as originally
  framed; it's Grade 1 alone vs. everyone else.
- **Three components, not five.** DO 015 s. 2026 (signed Jun 4, 2026,
  repeals DO 8 s. 2015): Written Works, Performance Tasks, Examinations.
  **The manuscript is wrong**, not the schema — Figures 17 and 25's
  five-component model (quizzes, recitation, participation, projects,
  examinations) does not match current DepEd policy. The schema's
  existing three-part shape (`grades.quiz_avg`/`activity_avg`/
  `exam_score`) is structurally close (quiz≈Written Works,
  activity≈Performance Tasks, exam≈Examinations) but not a clean match —
  see the `grade_components.type` note in KNOWN ISSUES below for the gap
  that still needs resolving.
- **Weights are keyed by learning area, not grade level or subject
  generically.** Core subjects: 20/50/30. EPP-TLE and MAPEH: 20/60/20.
  Confirms the known `grade_weight_configs` defect below — it was already
  suspected wrong, this makes it certain.
- **Examinations is itself a composite**, not a single score:
  `(ST1 × 0.30) + (ST2 × 0.30) + (TE × 0.40)`, then the result is scaled
  by the learning area's EX weight. Nothing in `grades` or
  `grade_components` currently stores ST1/ST2/TE as separate values —
  `grades.exam_score` is one scalar. This is a schema gap, not just a
  weighting gap.

**Full grading policy detail is meant to live in `docs/GRADING_SPEC.md`.
That file does not exist yet** — flagging this rather than silently
inventing it or leaving a dead link. Everything given above is preserved
here in the interim; creating the dedicated file (if still wanted) is a
separate task.

**Still not built.** Answered ≠ implemented — `grade_weight_configs`
still needs re-keying to `subject_id`/learning-area, `grades.quarter`
still says `Q1`–`Q4` instead of three terms, and the ST1/ST2/TE composite
has no column to live in yet. None of that happened in this pass —
docs only, per the dispatch that produced this entry.

### Known schema issue

`grade_weight_configs` is keyed by grade band:

```sql
grade_level_min TINYINT,
grade_level_max TINYINT
```

Seeded as G1–3: 30/50/20 and G4–6: 40/40/20. **Confirmed wrong** (was
"suspected wrong" before the school visit) — DepEd weights vary by
**learning area**, not grade level: core subjects are 20/50/30, EPP-TLE
and MAPEH are 20/60/20, for the *same* student in the *same* term. Must be
re-keyed to `subject_id`/learning-area — not done yet.

`grade_components.type` is `ENUM('quiz', 'activity')` — two raw component
types, with exams living separately as `grades.exam_score`. DO 015's three
official components (Written Works, Performance Tasks, Examinations) map
loosely onto this (quiz/activity/exam) but not exactly, and Examinations'
real internal structure (ST1/ST2/TE, weighted 30/30/40) isn't represented
at all. Re-checking this shape is part of the still-not-built work above.

### Excuse Letters module — RESOLVED and BUILT (both blockers)

- **RESOLVED: excuse letter approval is record-only.** The learner stays
  `Absent`; the letter documents the reason. Approval must not modify
  `attendance` rows. This answers the original "does approving change the
  attendance record" question — it does not, by design. Enforced in code,
  not just documentation: `PATCH /:id/review` writes only `status`,
  `teacher_remarks`, and `reviewed_by` — no query in that handler
  references the `attendance` table at all.
- **RESOLVED: who approves — the class adviser only.** Confirmed by the
  school, not "any teacher assigned to the student's grade/section."
  `sections.adviser_id` (via `students.section_id`) is the authority,
  exactly as the previous entry here anticipated. The Sections API
  (2026-09-05) is what made every section's `adviser_id` assignable
  through the API rather than a direct DB write, which is what actually
  unblocked building this.

**Net effect:** `PATCH /:id/review` is built. See the endpoints table and
the 2026-09-05 CHANGELOG entry for the read-scope-vs-review-scope
distinction (existing `GET` scoping is broader — any assigned teacher,
via `teacher_assignments` — than review authority, which is adviser-only
via `sections.adviser_id`) and why an unauthorized non-adviser gets `403`
naming the reason rather than `404`.

**Stage 4 UI note, not API enforcement:** `teacher_remarks` is deliberately
optional on both `Approved` and `Declined` (API-level — see above), but a
`Declined` letter with no remarks gives the parent no reason and pushes
them to message the teacher instead — the exact repeated-PM problem the
Class Board exists to reduce. The fix belongs in the Stage 4 decline form
as a UI prompt (e.g. a soft "add a reason?" nudge before submitting a
decline), not as a backend-enforced required field — see the confirmed
reasoning above for why a status-conditional required field was rejected
at the API layer. Flagging here so it isn't lost before Stage 4 web pages
are built.

### Attendance is per day, not per subject — RESOLVED and DONE (Stage B1)

The school's SF9 performance report records attendance **monthly**, as
Class Days / Days Present / Days Absent — one figure per learner per
month, not per subject. The adviser records it once daily, during
Homeroom Guidance; subject teachers do not record it at all. **The
`attendance` table has been rebuilt to match** — `subject_id` (and its FK
and index) is gone, `UNIQUE KEY uq_attendance` is now `(student_id, date)`,
dropped outright rather than made nullable, since the table held 0 rows —
a clean rebuild, not a data migration. Scoping in `routes/attendance.js`
now runs through `sections.adviser_id`, not `teacher_assignments` — see
CURRENT STATE's "sections table" note for the read-side detail, and the
2026-09-04 CHANGELOG entry for the full endpoint-by-endpoint change.

Separately, but from the same answer: **attendance does not feed grade
computation.** It appears on the report card as its own section, entirely
apart from the grades section. Any future grade-calculation logic must
not read from `attendance` — the two are siblings on the report card, not
inputs to each other. This part is documentation only — there's no grade
computation built yet for it to wrongly feed into.

This was always a different question from the one below (how a
*percentage* is computed for the parent-facing attendance page) —
converting the table to per-day did not answer that one, and still
hasn't.

### Attendance rate formula — still open, blocks the parent attendance page, not the API

Not a Stage 3 blocker — `routes/attendance.js` is built and shipped, raw
counts only, deliberately no computed rate (see CHANGELOG, 2026-08-27).
This blocks Stage 4 instead: any parent-facing attendance page that wants
to show a percentage needs the school to confirm how it's computed — does
Late count toward "present"? Is Excused counted in the denominator at all,
or excluded? Not answered by the per-day/per-subject finding above —
don't guess at either.

---

## RESTORE — built

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
  bcrypt hash — `401` if missing or wrong. An open admin session is not
  authorization for a total, irreversible data wipe on its own.
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
  came to exist. `backups` currently holds 8 rows this way, 0
  `orphaned_files`.
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

**What `npm run test:restore` (22/22) does and does not cover.** Every
pre-flight gate is tested for real over HTTP — admin-only, `parseId`,
missing backup, missing file on disk, missing/wrong password, wrong
`confirm_filename` — with confirmation that nothing was created and
`token_valid_after` stayed unset after each. `token_valid_after` itself is
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

## KNOWN ISSUES — fix when you reach them

| Issue | Where | Note |
|---|---|---|
| `users.email` has no UNIQUE constraint | `schema.sql` | Deliberately not added. A plain `UNIQUE` would conflict with the locked one-account-per-student design: `setup-db.js` seeds Marwin's and Jea's parent accounts with the *same* guardian email on purpose, and any real family with 2+ kids needs that same reuse. Only matters once email login is actually built — see Open Questions. |
| `grade_components.type` is `ENUM('quiz','activity')` | `schema.sql` | No longer blocked — DO 015 s. 2026 confirms three official components (Written Works, Performance Tasks, Examinations), so the manuscript's five (Figures 17, 25) was wrong, not the schema. But the current two-value ENUM plus a separate `grades.exam_score` scalar isn't an exact match either — Examinations is itself a weighted composite (ST1/ST2/TE) with no column to hold the three sub-scores. See BLOCKED / RESOLVED → Grades module. |
| No `Download Statement` export | — | Promised in manuscript Figure 19. Build a CSV export from `contribution_records`, or remove it from the paper. |
| No GWA computation | — | Defined in the manuscript's Definition of Terms but implemented nowhere. Keep or drop — undecided. |
| `backups` has no `status` column | `schema.sql` | Deliberate, not missing: a row is only ever inserted after the dump succeeds, so every row is definitionally "Completed" — the UI hardcodes that string. Revisit only if backup generation becomes asynchronous (a pending/failed state visible before the job finishes) — that's the trigger, not before. |

---

## SAFE TO BUILD NOW — done

Excuse Letters is fully built — `submit`, `mine`, `list`, `view`, `edit`,
and `review` (`PATCH /:id/review`, approve/decline) — see the endpoints
table and `routes/excuses.js` in Files that exist. Nothing in the system
is currently in the "unblocked but unbuilt" state this section used to
track; the next backend work waits on the school visit (Grades) or
Stage 4 web pages.

---

## GET /api/messages/contacts — decided, not built yet

Was an open question (no way for a parent to discover their child's
teachers' user ids to start a first conversation); now resolved. Not
blocked, not built — deliberately deferred to Stage 4, built alongside
the Messages web page, since a contacts list has no reason to exist
before there's a UI that needs it. Recording the design now so it isn't
re-derived later.

Scoped by the **inverse of `canMessage()`** — same boundary, read
direction instead of a permission check:

- Parent sees the teachers assigned to their child's class, plus admin.
  Include each teacher's subject on the row — a bare name isn't enough
  to tell them apart if the child has more than one teacher.
- Teacher sees the parents of students in their own `teacher_assignments`,
  plus other teachers and admin. Include the student's name on each
  parent row — a teacher is looking for "Marwin's parent," not the
  guardian's name alone.
- Admin sees everyone.
- Optional `?search=` filters on both the contact's name and the
  student's name, within scope only. **Never an unscoped user search** —
  that would expose every teacher and parent in the school to anyone who
  asks, defeating the point of `canMessage` existing at all.
- Include each contact's existing conversation state (last message,
  unread count) inline — same shape as `GET /conversations` — so the
  frontend needs one call to render a combined contacts-and-conversations
  view, not two merged client-side.

---

## BEFORE THE PARENT DEMO — not blockers now, required before real parents see this

None of these block Stage 3/4 development. They block the moment real
parents are actually in the room, which happens once the system is
ready — do not let that arrive without these done.

- **Seed data uses the team's own names** (Marwin Conde, Jea Mae Bargaso,
  Ashley Geguiera — see `seed.sql`). Replace with obviously-fictional
  demo data before any real parent sees the system, or clear the seed
  entirely if real student records get loaded instead.
- **Default passwords are public.** `Admin@2026`, `Teacher@2026`,
  `Parent@2026` are in `seed.sql`, which is in the GitHub repo. A parent
  logs in with their child's LRN as the login id — anyone who knows a
  child's LRN would know that account's password too. Change every
  default password before any real account exists.
- **RA 10173 (Data Privacy Act) applies** — the manuscript itself cites
  it. Loading real student names and LRNs needs the school's answer on
  whether a consent process is required, whether they already have a
  form, or whether permission is needed per parent. Two new questions
  added to OPEN QUESTIONS below for the school visit.
- **`GET /api/messages/contacts` must exist before the demo, not after.**
  Without it, a parent has no way to find their child's teacher to
  message them — they'd need to already know a numeric `user_id`, which
  no parent will. Flagging a real scheduling tension this creates: the
  section above deliberately defers this endpoint to "build alongside
  the Stage 4 Messages page." If the parent demo happens before Stage 4
  web pages are underway, this specific endpoint needs to be pulled
  forward ahead of the rest of that page's build — that's a scheduling
  call, not a technical one, and isn't resolved here.

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
- [x] Sections API — `GET /`, `GET /:id` (unscoped), `PATCH /:id/adviser`
      (admin) — not one of the original 10 core features, built because
      attendance's adviser-scoping needs a way to assign the 21 still-NULL
      sections without a direct DB write
- [x] Attendance API — per day, adviser-scoped (Stage B1 rebuild; was per
      subject, see BLOCKED / RESOLVED and the 2026-09-04 CHANGELOG entry)
- [x] Announcements + Memos + Events API
- [x] Excuse Letters API — **fully built**: submit, mine, list, view, edit, and review (approve/decline, adviser-only, never touches attendance), see BLOCKED / RESOLVED
- [x] Contributions API — create, record payment, view status
- [x] Messages API + Socket.io
- [x] System Settings API (admin)
- [x] User Management API — extend the existing `routes/users.js`
- [x] Backup/Restore API (admin, `mysqldump` — not a folder copy) — both built, 5 endpoints; see "RESTORE" below
- [ ] **Grades API — answered, not started.** School-visit/DepEd-order
      questions are resolved (see BLOCKED / RESOLVED), but building was
      out of scope for the docs pass that recorded the answers — `grade_weight_configs`
      still needs re-keying, `grades.quarter` still says `Q1`-`Q4` instead
      of three terms, and Examinations' ST1/ST2/TE composite has no column yet

### Stage 4 — Web pages

- [ ] Parent pages — grades, attendance, records, announcements, messages,
      excuse letters, contributions. Messages needs `GET /api/messages/contacts`
      built first — see that section above, not built yet
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
- `users.email` UNIQUE — not added, deliberately. The tradeoff: email login
  for teachers/admin would need a unique lookup key, but a table-wide
  `UNIQUE` on `users.email` conflicts with shared-guardian emails across
  sibling parent accounts (one account per student is locked — a guardian
  with three children has three accounts and one real email address). If
  email login is ever built, scope the uniqueness to `role IN ('teacher',
  'admin')` only — a partial/filtered index, or a check at the query level
  — never a plain table constraint across all roles.
- `activity_logs` exists in the schema but appears nowhere in the manuscript.
  Document it as a security feature, or drop the table.
- **Parent demo — data:** do we need to load real student names and LRNs
  for it? If so, is there a consent form already, or does permission
  need to be per-parent? RA 10173 applies — see BEFORE THE PARENT DEMO.
- **Parent demo — logistics:** how many parents can attend, and when —
  is there a PTA meeting we could join?

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

**Working agreement**

- Before writing code for a new module, state the exact list of files you
  will create or modify. If you later need a file outside that list, stop
  and say "SCOPE EXPANSION — need `<path>` because `<reason>`" rather than
  quietly adding it.
- When you stop, name the reason with one of: BASELINE MISMATCH, SCOPE
  EXPANSION, CONTENT DRIFT, or a specific behavioral reason. "Something is
  wrong" is not a stop reason.
- Test assertions against shared tables must be scoped to rows the run
  itself created, or written as invariants (`.every(...)`) that additional
  real rows still satisfy. Never assert an exact row count or exact list
  contents on a table the application also writes to. A suite that fails
  when someone uses the feature is not testing the feature.
- Before any module dispatch, confirm the current branch. New module work
  starts on `feature/<module>`, never on `main`. (Missed on 2026-08-31 —
  Excuse Letters was written on `main` and moved to a branch after the
  fact.)

When Darryl corrects a wrong assumption, accept it and move on. The `.md`
and `.sql` files describe the real system; the manuscript describes the
approved design. **When they conflict, say so plainly** rather than assuming
either one is wrong.

---

## AGENT SKILLS — three installed, deliberately not the rest

Installed 2026-08-30 from `mattpocock/skills` via
`npx skills@latest add mattpocock/skills`. Files live in `.claude/skills/`,
**copied, not symlinked** (`--copy`) — they are editable files this repo owns,
not a managed subscription to someone else's repo. Edit them freely; nothing
auto-updates them.

The upstream repo has **37 skills**. Three were installed, plus the setup
skill they require. This was a selection, not a partial install to be
completed later.

| Skill | Invoke with | For |
|---|---|---|
| `diagnosing-bugs` | `/diagnosing-bugs` | Disciplined red-first diagnosis loop for hard bugs and performance regressions |
| `tdd` | `/tdd` | Red-green-refactor, one vertical slice at a time |
| `handoff` | `/handoff` | Compact the current session into a handoff doc (written to the OS temp dir, not this repo) before context runs out |
| `setup-matt-pocock-skills` | `/setup-matt-pocock-skills` | Already run once, 2026-08-30. Re-run only to switch issue tracker |

**Two of them auto-invoke; two do not.** `handoff` and
`setup-matt-pocock-skills` are `disable-model-invocation: true` — they run only
when Darryl types the slash command. `diagnosing-bugs` and `tdd` are **not**
marked that way, so Claude may reach for them on its own the moment something
is reported broken or a feature is asked for test-first. That is intended —
it is why they were chosen — but it means their discipline can start without
being asked for. To make either opt-in only, add
`disable-model-invocation: true` to its `SKILL.md` frontmatter; the files are
copies this repo owns, so that edit sticks.

**Why these two specifically.** Three bugs in the week of 2026-08-29 were found
only by manual end-to-end testing, not by the 336-test suite — including the
`stripBackupsTableDdl` case, where a test asserted the *anticipated symptom*
("no `INSERT INTO backups`") and passed while the system was broken by a
different mechanism sitting next to it (`DROP TABLE`). See the CHANGELOG. That
is a diagnosis-discipline and test-design problem, which is what these two
skills are for.

**Deliberately NOT installed:** `grill-me`, `grill-with-docs`, `to-spec`,
`to-tickets`, `implement`, `wayfinder`, `triage`,
`improve-codebase-architecture`, and the remaining ~26. Reason: they are a
planning and ticketing workflow, and this repo already has one — `CLAUDE.md`'s
**BUILD ORDER**, **BLOCKED**, **LOCKED DECISIONS**, and **OPEN QUESTIONS**
sections, plus the end-of-session update ritual. Two competing planning
disciplines in one repo is how documents drift apart, which has already
happened here once with `PROJECT_PROGRESS.md`. **Do not install more of them
without a specific reason.** A future session finding only three skills present
is looking at a decision, not an oversight.

### Setup answers (recorded so they aren't re-asked)

`/setup-matt-pocock-skills` was run once on 2026-08-30. Its answers:

- **Issue tracker:** local markdown files, not GitHub Issues. See
  `docs/agents/issue-tracker.md`. The repo does have a GitHub remote and the
  skill defaults to GitHub — this was an explicit override, because this is a
  solo capstone with no issues board.
- **Triage labels:** none. Section skipped entirely, because `triage` is not
  installed. There is no `docs/agents/triage-labels.md` and there should not be.
- **Domain docs:** single-context. See `docs/agents/domain.md`.

### No CONTEXT.md — deliberate

`diagnosing-bugs/SKILL.md` and `tdd/SKILL.md` both say "read `CONTEXT.md` (if it
exists)". **This repo has no `CONTEXT.md` and should not get one.** This file is
the context document. `docs/agents/domain.md` redirects those skills here, so
they read the real source of truth instead of nothing.

A second root-level context document would be a third thing to keep in sync
with the code alongside this file and `docs/PROJECT_PROGRESS.md` — and the
warning at the top of this file exists precisely because that sync failed once
already.

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
| 2026-09-05 | `PATCH /api/excuse-letters/:id/review` built — the last piece of Excuse Letters, unblocking the module fully. Both school-visit questions that blocked it for weeks are resolved: the class adviser only may review (not any assigned teacher — confirmed by the school, superseding the earlier "not re-confirmed" flag), and review never touches `attendance` ("excuse lang yung bata pero absent pa rin" — the learner stays Absent, the letter documents the reason). Enforced structurally, not just by convention: the handler's `UPDATE` statement writes only `status`, `teacher_remarks`, and `reviewed_by` — no query anywhere in it references `attendance`, and a comment at the top of the handler says so explicitly so a future session doesn't "helpfully" add one. Built from a plan-then-approve dispatch identical in shape to the Sections one two entries below — 7 questions answered before any file was touched, two of which turned into real design decisions rather than restating the plan: the 403-vs-404 question and the teacher_remarks-required-on-decline question, both below. `authorize('teacher', 'admin')` at the route level already blocks parents. For a teacher, existence/read-scope is checked first, using the *same* `teacher_assignments`-based query `GET /:id` already uses — a teacher who can't even `GET` this letter gets the identical `404` here, never a leak. Review authority is checked second and is narrower: `sections.adviser_id` via the student's `section_id`, not `teacher_assignments` — a teacher who *can* read the letter but isn't the adviser gets **`403`** naming the reason ("Only the adviser of this student's section can review excuse letters."), **not `404`** — a deliberate deviation from `PUT /api/attendance/:id`'s own out-of-scope-returns-404 precedent, called out in a comment at the check itself so a future session reading only `attendance.js` doesn't "fix" it back to `404`. The reasoning: attendance's read-scope and write-scope are both adviser-only already, so `404` there is a true "cannot see this" signal; here read-scope is deliberately broader than review-scope, so a non-adviser teacher already got `200` from `GET /:id` on this exact id — `404` on `PATCH` would contradict `GET` and hide nothing they don't already have. A student whose `section_id` is `NULL` (VARCHAR `section` never matched a seeded row) can't be reviewed by any teacher, adviser or not — only admin; same accepted edge case as `attendance.js`, noted in a comment rather than special-cased. `teacher_remarks` stays optional on both `Approved` and `Declined` — no status-conditional required rule, which would have been the only field in the codebase required conditionally on a sibling field's value. A documentation-only note was added instead: a `Declined` letter with no remarks gives the parent no reason and pushes them toward messaging the teacher directly — the repeated-PM problem the Class Board is meant to reduce — but that belongs in the Stage 4 decline-form UI as a prompt, not backend enforcement; recorded under the Excuse Letters BLOCKED / RESOLVED section so it isn't lost before Stage 4. Already-reviewed guard reuses the same shape as `PUT /:id`'s: `403`, "This excuse letter has already been reviewed." `status` in the body accepts only `'Approved'`/`'Declined'` — `'Pending'` or anything else is `400`. Tests: `scripts/test-excuses-flows.js`, 15 new assertions (41 → 56) plus two stale comment fixes (leftover "Grade 6 - Mabini" references from before the Malikhain/Masigasig section rename, corrected to avoid misleading a future session reading this file). One new fixture: a throwaway teacher given a `teacher_assignments` row for Grade 6 - Malikhain (Marwin's section) but *not* made its adviser — the one account needed to exercise the 403-not-404 case at all, since every other teacher fixture in this file is either the real adviser (TCH-001) or has zero assignment to Marwin's section (TCH-002). Deleted in the `finally` block; `fk_assignments_teacher ON DELETE CASCADE` removes its `teacher_assignments` row automatically, so only the `users` row needed an explicit delete. The "admin reviews any letter" test deliberately targets the pre-existing `outsideLetterId` fixture (Grade 3 - Aguinaldo, `section_id` `NULL`, no teacher assigned to it in this suite at all) rather than an in-scope Malikhain letter — proves admin is unscoped against a letter literally no teacher in this test run could even read, not just one a teacher could read but not review. Attendance-untouched is asserted directly, not assumed: the student's `attendance` row count is snapshotted immediately before and compared immediately after a real approval, rather than trusting the code comment alone. `npm run test:excuses` — 56 passing, confirmed twice in a row with no `db:setup` between runs. Full regression across the other twelve suites afterward: all unchanged from their prior counts (auth 25, students 30, sections 30, attendance 38, content 47, contributions 38, settings 27, users 39, backups 39, sanitize 9, messages 39, restore 22) — confirms nothing leaked outside this module. `git status` after implementation showed exactly the two whitelisted code files changed (`server/routes/excuses.js`, `server/scripts/test-excuses-flows.js`) — no scope expansion. |
| 2026-09-05 | Sections API built — `routes/sections.js`, 3 endpoints (`GET /`, `GET /:id`, `PATCH /:id/adviser`), mounted at `/api/sections` between `/api/students` and `/api/attendance`. This is the admin-facing counterpart to Stage B1's attendance rebuild: attendance scoping has depended on `sections.adviser_id` since 2026-09-04, but until now the only way to set it on any of the 21 still-`NULL` sections was a direct DB write — this route is what makes those 21 sections usable through the API instead of by hand. Built from an explicit plan-then-approve dispatch: a PLAN ONLY pass answered 7 scoping/shape questions before any file was touched, and two of the plan's own original instructions were corrected on review rather than followed as written — see below. No `POST`/`DELETE` — the 23 sections are fixed for the school year; the table's inventory never changes, only `adviser_id` does. `GET /` and `GET /:id` are **unscoped** — sections are reference data every authenticated role sees in full, not filtered per role the way `students` is. This was the plan's own instruction ("reads out of scope → 404, matching routes/users.js") and it was **wrong**, caught during the plan pass, not after: there is no "section belongs to a role" concept, so inventing a scoping rule to satisfy the auth-pattern template would have been scope the template doesn't call for. `GET /:id`'s `404` fires only for a genuinely nonexistent id. `student_count` in both GET responses comes from a correlated subquery (`(SELECT COUNT(*) FROM students st WHERE st.section_id = sec.id)`), not a `JOIN students` + `GROUP BY` — a direct join fans out one-to-many, and adding the `LEFT JOIN users` for `adviser_name` on top of that risks the exact `ONLY_FULL_GROUP_BY` ambiguity the Messages module already worked around once with a window function instead of `GROUP BY + MAX(created_at)`; a subquery has no fan-out and no ambiguity, and at 23 rows total the per-row cost is nothing. `PATCH /:id/adviser` is admin-only, body `{ adviser_id }`: `adviser_id` missing from the body → `400` ("adviser_id is required — provide a teacher's user id, or null to clear the adviser."); non-null but not a positive integer → `400`; section id not found → `404`; `adviser_id` referencing a nonexistent user → `400` ("adviser_id does not reference an existing user."); referencing a non-teacher → `400` naming the found role; referencing an inactive teacher → `400` naming the found status. `adviser_id: null` is explicitly allowed and clears the field — skips the existence/role/status checks entirely, since there's nothing to validate against. One teacher advising two (or more) sections is allowed by design, not merely unblocked by omission — the validation only checks identity/role/status of the target user, never "is this teacher already advising something else." `logActivity()` on every successful PATCH records both the old and new `adviser_id`. Tests: `scripts/test-sections-flows.js`, 30 assertions. The test-fixture-safety design is the other plan correction: the original instruction was "restore the seeded advisers at the end," which was flagged during planning as fragile — a suite that errors before reaching its own restore step would silently leave `Malikhain`/`Masigasig` (or whichever section it touched) corrupted for every other suite's next run, `test-attendance-flows.js` specifically, which resolves those two sections by name and depends on TCH-001/TCH-002 actually being their real advisers. Rebuilt instead so corruption is structurally impossible rather than merely undone on a clean exit: every mutating test runs against two of the 21 currently-`NULL`-adviser sections only (resolved by id, deterministic `ORDER BY`), Malikhain and Masigasig are read in assertions but never written to, and cleanup resets the two test sections to `adviser_id = NULL` via a direct DB `UPDATE` in a `finally` block — not an API call remembered for "later." The "one teacher advising two sections" case reuses this same principle: TCH-001 (already the real adviser of Malikhain) is assigned to one of the two NULL test sections as its second section, rather than fabricating a third throwaway teacher — and a dedicated assertion re-reads Malikhain afterward to confirm its own seeded assignment is untouched. One throwaway user fixture was still necessary — an inactive teacher account, to test the status-check branch — created via the real `POST /api/users/teachers` → `PATCH /api/users/:id/status` flow (not a raw insert), deleted (along with its `activity_logs` rows) in the same `finally` block. `npm run test:sections` — 30 passing, confirmed twice in a row with no `db:setup` between runs. Full regression across the twelve existing suites afterward: all unchanged from their prior counts (auth 25, students 30, attendance 38, content 47, contributions 38, settings 27, users 39, backups 39, sanitize 9, messages 39, restore 22, excuses 41) — confirms nothing leaked outside this module. `git status` after implementation showed exactly the four whitelisted code files changed (`server/routes/sections.js`, `server/scripts/test-sections-flows.js`, `server/server.js`, `server/package.json`) — no scope expansion. |
| 2026-09-04 | Attendance rebuilt per day, not per subject (Stage B1) — the answer recorded as "resolved, not built" in the previous entry is now built. `attendance.subject_id` dropped outright (column, FK, index), not made nullable — the table held 0 rows, so this was a clean rebuild, not a data migration; `UNIQUE KEY uq_attendance` is now `(student_id, date)`, was `(student_id, subject_id, date)`. Scoping in `routes/attendance.js` no longer touches `teacher_assignments` at all — replaced with `teacherIsAdviserOfSection(teacherId, sectionId)`, checking `sections.adviser_id` via `students.section_id`. This is the first (and, per the "sections table" CURRENT STATE note, one of only two planned) route to read `section_id` — every other route still scopes on the VARCHAR columns, unchanged, deliberately. `canViewStudent()`'s teacher branch is the same adviser check via a join. All six endpoints changed: `subject_id` is gone from both POST bodies, both list-filter query params, and every SELECT (no more `subjects` JOIN, no more `subject_name`); `POST /bulk` is now the primary path and takes `{ section_id, date, entries }` instead of a `{ grade_level, section }` VARCHAR pair, validating every entry's student actually belongs to that `section_id`; every out-of-scope write's `403` names the constraint explicitly ("You are not the adviser of this student's section." / "...of this section.") — never a bare "Access denied." Explicitly not built, per instruction: no attendance-rate percentage (formula still unconfirmed, `GET /summary` still returns raw counts only) and no 20%-absence promotion-rule logic anywhere, not even as a stub — the school mentioned it but didn't ask for it, and guessing at pass/fail logic is exactly the kind of thing this project's BLOCKED discipline exists to prevent. Two advisers seeded, not one, specifically so adviser-scoping could be tested against a real non-adviser rather than a fabricated third fixture: Grade 6 - Malikhain → TCH-001 (existing), Grade 5 - Masigasig → TCH-002 (new, `Ana Reyes`, deliberately fictional — not a real name from the school's teacher list, created the same way TCH-001 is, in `setup-db.js`'s `buildUserSeedSql()`). The other 21 sections stay `NULL` — assigning them is an admin UI feature, not seed data. Adviser assignment itself lives in `seed.sql`, keyed by `login_id` subquery (`WHERE login_id = 'TCH-001'`), not a hardcoded numeric id, since exact user ids depend on insert order and TCH-002's insert shifts nothing existing (appended after the parents' rows, so admin/TCH-001/both parents keep their original ids 1–4; TCH-002 lands on 5). `test-attendance-flows.js` fully rewritten for the new shape — `npm run test:attendance` — 38 passing (was 33), idempotent, confirmed twice, DB back to baseline (0 attendance rows, 2 students, 5 users) after. Full regression across the other eleven suites afterward: all unchanged from their prior counts (auth 25, students 30, content 47, contributions 38, settings 27, users 39, backups 39, sanitize 9, messages 39, restore 22, excuses 41) — confirms nothing leaked outside this module. One real deployment hiccup, not a code bug: the dev server had been running via plain `npm start` (no `--watch`) since an earlier session, so it silently kept serving the pre-rewrite `attendance.js` and the first test run failed against stale code with a stale error message ("subject_id... required") that looked like a real regression until traced to the wrong process. Killed it, restarted via `npm run dev`, re-ran clean. Worth remembering next session: confirm which server process is actually listening before trusting a failing test's error message. |
| 2026-09-03 | Docs sync for the `sections` table work (merged to `main`) plus a batch of school-visit/DepEd-order answers — no code in this pass. Table count corrected to 20, not 19: `sections` was added on top of the count this file already had right after Restore shipped (`auth_security_state` had already moved it from 18→19 in an earlier entry) — the dispatch for this update assumed the stale "18," which itself was already wrong; verified against `schema.sql` directly (`grep -c "^CREATE TABLE"`) rather than trusted. New "sections table — schema only, nothing reads it yet" subsection added under CURRENT STATE — the load-bearing fact: `section_id` exists and is backfilled, but every route still scopes on the VARCHAR columns (`students.section`, `teacher_assignments.section`, `announcements.target_section`); the FK cutover is scoped and deliberately deferred, not forgotten. `sections.adviser_id` is `NULL` for all 23 rows — attendance adviser-scoping can't work until advisers are assigned; that's a data gap, not a code gap. **BLOCKED section restructured to BLOCKED / RESOLVED**, since several long-standing questions now have real answers: Grades module's four original blockers are all answered (DO 009 s. 2026 — three terms, not four quarters; DO 015 s. 2026 — three components, not five, repeals DO 8 s. 2015; weights keyed by learning area, not grade level, confirming the known `grade_weight_configs` defect; Grade 1 alone uses descriptive grading, Grades 2–6 stay numerical with an adjusted transmutation table — not "1–3 vs. 4–6" as originally framed) — **answered, not built**; `docs/GRADING_SPEC.md` was referenced in the source material for this update as where full detail lives, but that file does not exist — flagged rather than silently linked or silently created, full detail preserved inline instead. Excuse Letters' approve/decline has one of its two original blockers resolved (record-only, attendance rows untouched) and one still open (who approves — the new `sections.adviser_id` is the right mechanism but wasn't confirmed as the answer, and is NULL everywhere regardless) — do not treat the endpoint as fully unblocked. New finding, not previously documented at all: attendance is per **day** on the school's SF9 report (monthly Class Days/Days Present/Days Absent), not per subject like the current `attendance` table (`UNIQUE (student_id, subject_id, date)`) — needs converting, not extending; and attendance does not feed grade computation, it's a separate report-card section. Neither conversion happened in this pass. KNOWN ISSUES' `grade_components.type` row updated to match — no longer "blocked," DO 015 confirms the schema's three-part shape was closer to right than the manuscript, but Examinations' real internal structure (ST1/ST2/TE composite) still has no column. |
| 2026-08-31 | **UTC in test date helpers.** Found in the same commit as Excuse Letters, but a separate fix, not part of that module's dispatch. `test-attendance-flows.js` and `test-content-flows.js` built dates with local getters (`setDate`/`setFullYear`) but formatted the result via `.toISOString()` — UTC. Between 00:00–08:00 PH, `.toISOString()`'s calendar date is still the previous day, so `tomorrow()` returned *today*, and "Future date rejected" failed even though the app code (already fixed earlier — see the DATE-column entry below) was correct. Affected helpers: `daysAgo`, `tomorrow` (`test-attendance-flows.js`), `daysAgo`, `yearsFromNow` (`test-content-flows.js`). Fixed by formatting from local components (`getFullYear()`/`getMonth()`/`getDate()`) instead, matching the `todayLocal()` pattern already present in `test-attendance-flows.js` — no shared helper module added, each fixture keeps its own local copy, deliberately. **Rule:** test date helpers must never use `.toISOString()`. Run date-sensitive suites at least once between 00:00–08:00 PH — the only window a UTC bug like this can actually surface in; a pass at noon proves nothing. Verified inside that window, not outside it: both suites run at ~00:15 AM PH, confirmed twice each — `npm run test:attendance` 33/33, `npm run test:content` 47/47. `test-contributions-flows.js` and `test-excuses-flows.js` were checked and already correct (their date helpers already used local components) — not touched. |
| 2026-08-31 | Excuse Letters API — CRUD half only, `routes/excuses.js`, 5 endpoints. `PATCH /:id/review` (approve/decline) is deliberately not built, not stubbed, not commented in — still blocked on the school visit answering who can approve and whether approval touches attendance, see BLOCKED. `parent_id`/`student_id` come from `req.user`, never `req.body` or a URL param; `status` is always `'Pending'` on create; `status`/`teacher_remarks`/`reviewed_by`/`parent_id`/`student_id` sent in a POST or PUT body are silently ignored, not rejected with `400` — a deliberate difference from `routes/users.js`'s PUT (which rejects forbidden fields loudly): the spec for this module called for stripping, not rejecting, and the test suite checks for exactly that ("ignored", not "400"). Teacher list/view scoping reuses the exact `EXISTS`-against-`teacher_assignments` shape `routes/students.js` already uses (matched on the letter's student's `grade_level`+`section`, via a join, since neither column lives on `excuse_letters` itself) — no new scoping pattern invented. `GET /mine` is declared before `GET /:id` — Express matches route definitions in declaration order, and `parseId('mine')` would otherwise fire first and return `400` for every request to that path. Reads out of scope return `404` (anti-enumeration); the one write-scope violation (`PUT` on a letter no longer `Pending`) returns `403` naming the reason explicitly ("This excuse letter has already been reviewed and can no longer be edited."), never a bare "Access denied." `absence_date` validated with `isValidDateFormat`/rejected-if-future via the existing `todayLocalDateString()` in `utils/dateFormat.js` — no new date logic, no UTC. No maximum-age check on `absence_date` — the school hasn't set a submission deadline (a locked answer, not an oversight); duplicate letters for the same date are deliberately allowed, since a parent must be able to resubmit after a decline. `PUT` accepts partial updates (`absence_date`, `reason`, `details` only) — an omitted field keeps the existing DB value, never a computed default. Tests: `scripts/test-excuses-flows.js`, 41 assertions, structured like `test-contributions-flows.js`. Every row-count/list-content assertion is scoped to ids this run created or written as a property check on a `.find()`-scoped record — none of the "assert exact content against a shared table" shape the working agreement now forbids. One fixture (a student + approved parent outside TCH-001's assignment, created through the real `POST /api/users/parents` → approve → login flow, not a raw insert with a fake password hash) does double duty as both "the out-of-scope student" for teacher-scoping checks and "a different parent" for the cross-parent 404 check. The "PUT on a non-Pending letter" test moves a letter out of `Pending` via a direct `UPDATE` (approve/decline has no endpoint to do this through) — flagged as the one honest way to test that guard at all: the alternative was not testing it, which is worse than testing it via a path a real reviewer will eventually replace. Confirmed twice, DB verified back to baseline (`excuse_letters`: 0 rows, `students`: 2, `users`: 4) after. `package.json` was outside that dispatch's file whitelist, so `test:excuses` had no `npm run` alias at first — added in a follow-up correction the same day, approved separately. `npm run test:excuses` — 41 passing. **Manually verified 00:25 AM PH** (inside the UTC failing window, not at noon): POST with today's date accepted, not rejected as future; `absence_date` round-trips as `"2026-08-31"` while `created_at` stays ISO, confirming `dateStrings: ['DATE']` applies to DATE columns only, not TIMESTAMP; partial `PUT` with `details` only preserved `absence_date` and `reason`; teacher sees 1 letter via assignment scoping; parent gets `403` on the teacher-only list. All five passed. Response shape note: `login` returns `token`/`user` at the top level, excuse-letter endpoints wrap in `excuse_letter` — no `data` wrapper anywhere. |
| 2026-08-30 | Fixed the `test:messages` failure flagged as its own task in the entry below (root cause found by investigating, not by inspecting `routes/messages.js`, which was correct the whole time). The `messages` table had exactly one stray row — `sender_id=3 (the seeded parent, Marwin), receiver_id=2 (TCH-001), body="Test message from manual check"` — left over from earlier manual testing against the API, outside the automated suite entirely. `test-messages-flows.js` reuses these two **seeded** accounts as its `parent1`/`teacher1` fixtures every run, unlike its own `teacher2`/`parent2`, which are timestamp-suffixed and genuinely fresh each time. That stray row sorted first in the thread's `ORDER BY created_at ASC, id ASC`, so this run's own 3 messages always had an unexpected 4th prepended — the "Thread returns messages in chronological order" assertion compared the full thread verbatim against a hardcoded 3-message string and failed, correctly, against data the test had no way to know about. Fixed in two parts. (1) Data: deleted the stray row, confirmed live — `messages` back to 0 rows, matching what CLAUDE.md's own CURRENT STATE already claimed as the baseline. (2) The test itself, and this is the part that matters going forward: the assertion was rewritten to scope to the 3 message ids *this run created* (filtering the fetched thread down to `[m1.id, m4.id, m5.id]` before checking order) instead of asserting the whole thread's exact content — still catches the actual regression this guards against (a reversed `ORDER BY`), immune to anything else in the thread. Verified this is a real fix, not just "removing the row made it pass again": reinserted a simulated stray message, confirmed the suite failed as before (proving the deletion alone wasn't the fix), applied the scoped assertion, reinserted the simulated row again, ran twice — 39/39 both times. Two more assertions in the same file had the identical shape, on the *same* reused `parent1`/`teacher1` pair, not yet triggered only by luck: `conversations` list's `unread_count` and `last_message_body` were hardcoded to literals (`1`, `'Spoofed sender test'`); `read-all`'s returned `count` was hardcoded to `2`. All three rewritten to compare against ground truth queried from the DB the same way the endpoint computes it (true last message by the same `ORDER BY created_at DESC, id DESC`, true unread count by the same `WHERE ... AND read_status = 0`, true pre-call unread count for the read-all delta) — an endpoint bug (e.g. a `GROUP BY`+`MAX` picking the wrong row, the exact failure mode `routes/messages.js`'s window-function design was built to avoid) still fails these; unrelated real activity through the same accounts does not. `teacherWithParent1?.unread_count === 0` (after read-all) was left as a literal zero — read-all marks every matching row read regardless of source, so zero remaining is a genuine invariant, not exposed to this class of bug. Verified the same way: reinserted a simulated unread `teacher1 → parent1` message (the exact direction that would have broken both the old `unread_count` and `last_message_body` checks), ran twice — 39/39 both times, cleaned up after. Reviewed all ten other suites for the same shape at the requester's request, before changing anything: found one more instance of the identical pattern in this same file (now fixed, above) and one lower-severity instance in `test-attendance-flows.js`'s summary check (scoped to the seeded student plus a rolling `daysAgo(2)` date — a transient, self-healing exposure window, not a permanent one like two reused accounts forever) — left alone deliberately, not worth the churn of rewriting a test that ages out of its own risk on its own. Everything else checked was already either scoped to a specific tracked id, or written as an `.every(...)` invariant that additional real rows still satisfy (`test-user-management-flows.js`'s "no user has a password key," `test-contributions-flows.js`'s key-name check) — structurally immune to this bug class, not merely lucky. New working-agreement line added to CLAUDE.md: test assertions against shared tables must be scoped to rows the run itself created, or written as invariants that additional real rows still satisfy — never an exact row count or exact list content on a table the app also writes to, since a suite that fails when someone uses the feature is not testing the feature. `npm run test:messages` — 39 passing, confirmed clean and confirmed to survive simulated real usage, both re-checked twice. |
| 2026-08-30 | Fixed a real bug found in manual testing, not the automated suite: a DATE column round-tripped a calendar day backward. Posting `date: "2026-08-29"` to attendance came back `"2026-08-28T16:00:00.000Z"` on read — a teacher recording today's attendance would show yesterday to the parent. Root cause: mysql2, without `dateStrings` set, returns a DATE column as a JS `Date` object constructed at local midnight; `res.json()`'s `JSON.stringify` calls `Date#toJSON()` → `toISOString()`, which converts to UTC — at UTC+8 that always lands on the previous calendar day, not an edge case. Fixed with `dateStrings: ['DATE']` on the pool (`config/db.js`) rather than `dateStrings: true` or per-query `DATE_FORMAT()`: scoped to DATE columns only, so `created_at`/`updated_at` (TIMESTAMP) keep returning as JS `Date` objects exactly as before, and it's one change covering every DATE column on every query through the shared pool, not four separate per-query edits easy to miss one of. Checked every DATE column, not just `attendance.date`: `events.event_date`, `contributions.due_date`, `students.birthday` all had the identical bug, all fixed by the same one-line change. `excuse_letters.absence_date` was **not** touched — no route file exists for that module yet (confirmed: no `routes/excuse_letters.js`); the same `dateStrings` fix already covers it structurally, but `isValidDateFormat` still needs to be imported from the new shared file when that module is built. New shared `utils/dateFormat.js` — `isValidDateFormat()` was duplicated identically in `attendance.js`, `content.js`, and `contributions.js`; now one implementation, same pattern as `parseId`/`sanitizeUser`. Also added `todayLocalDateString()` there, because two **adjacent** bugs turned up while in these files, same root cause (naive UTC math at UTC+8) but a different mechanism (write-side comparison, not read-side serialization) — flagged explicitly rather than folded in silently: `attendance.js`'s `isFutureDate()` and `content.js`'s `isMoreThanOneYearAhead()` both computed "today" via `new Date().toISOString().slice(0, 10)` — UTC, not local. Between PH midnight and 8am, UTC's calendar date is still yesterday, so `isFutureDate` would have rejected a teacher's own-day attendance entry as "in the future" for the first 8 hours of every single day. `todayLocalDateString()` uses `getFullYear()`/`getMonth()`/`getDate()` (local wall-clock getters) instead — the same pattern `routes/backups.js`'s `formatBackupFilename()` already used for its own timestamps, not a new approach. Separately, `content.js` and `contributions.js` each had a `toDateString()` helper — converts a fetched value back to a string via `.toISOString().slice(0, 10)` when a PUT omits the date field, falling back to the existing row's value — with the identical UTC-shift bug, but on a **write path**: a PUT to `/events/:id` or `/contributions/:id` that didn't resend `event_date`/`due_date` would silently write back the wrong day, corrupting a date the caller never touched. Removed entirely — once `dateStrings: ['DATE']` is set, `existing.event_date`/`existing.due_date` are already correct strings, so the fallback is just `existing.event_date` directly, no conversion needed or safe to reintroduce. Also fixed, part 2 of this session's request: `attendance.js`'s `GET /` and `GET /student/:studentId` both returned `subject_id` with no `subject_name` — neither joined `subjects`. `GET /summary/:studentId` returns aggregated counts only, no per-record subject, so it doesn't apply. Both fixed with a plain `JOIN subjects sub ON sub.id = a.subject_id`. **Why the existing 336 tests never caught the round-trip bug:** every prior assertion that touched a DATE column compared the API's response against a value derived the *same wrong way* — e.g. a test fixture date built via `daysAgo()`'s own `.toISOString().slice(0, 10)`, then compared against a response that had *also* gone through a UTC-shifting round-trip; both sides were shifted identically, so they agreed with each other while both being wrong. The fix, per file: post a value, read the *exact same field* back on the same response (and again on a separate fresh `GET`), assert the strings are byte-identical to what was sent — never comparing two independently-computed values that could share the same bug. `npm run test:attendance` — 33 passing (was 28; round-trip on POST and a fresh GET, `subject_name` on both read endpoints, a same-day-not-future regression for the `isFutureDate` fix). `npm run test:content` — 47 passing (was 45; round-trip + a PUT-that-omits-`event_date` regression, the actual test for the `toDateString` removal — asserts the date survives an edit that never sent it, not just that the edit "succeeded"). `npm run test:contributions` — 38 passing (was 35; same two shapes for `due_date`, including a new author-edit test path that didn't exist before). `npm run test:students` — 30 passing (was 28; `birthday` round-trip + PUT-omits-it regression, found while checking every DATE column — `students.js` never had a buggy `toDateString` wrapper, it already passed `existing.birthday` straight through, so this is a regression lock, not a new code fix in that file). All four suites confirmed twice each (idempotent, no `db:setup` needed between runs). Full regression across all eleven suites afterward found one unrelated, pre-existing failure in `test:messages` — not caused by this work (confirmed via `git status`: `routes/messages.js`, `socket.js`, and its test file were untouched, and none touch a DATE column) — opened as its own task rather than mixed into this entry; see the entry above for what it turned out to be and how it was fixed. |
| 2026-08-29 | The `stripBackupsTableDdl()` fix (entry below) confirmed by an actual live restore, not just the scratch-database simulation — the real proof this feature needs. Two fresh backups created, then restored from the first: `GET /api/backups` afterward showed **three** rows — both backups and the automatic safety dump, all present. Zero survived before this fix; three survived after. `activity_logs_wiped: 2` also came back in the restore response, confirming the `restore_wiped_activity_logs` marker fires correctly on a real restore, not just in isolation. Five files were orphaned across the two live-restore incidents this feature has now been through — the original all-rows-wiped bug's two (`parents_portal_2026-08-29_200152.sql`, `pre_restore_2026-08-29_200239.sql`) and this DROP-TABLE bug's three (`parents_portal_2026-08-29_221520.sql`, `parents_portal_2026-08-29_221523.sql`, `pre_restore_2026-08-29_221556.sql`) — all adopted by hand, once, the same way as the first two: `created_by` `ADMIN001`, `created_at` from each file's own mtime, each recorded in `activity_logs` as `manual_backup_adoption` (ids 4–8) so the log stays honest that these rows were reconstructed, not created by the normal flow. Deliberately not adopted until after the live restore confirmed the fix — adopting first would have muddied the result by giving the restore rows to inherit from instead of a clean empty-table baseline. `GET /api/backups` — 8 rows tracked, 0 `orphaned_files`, confirmed. `npm run test:backups` (39/39) and `npm run test:restore` (22/22) both still pass after the live write, confirmed twice. |
| 2026-08-29 | Fixed a second, sharper version of the backups-wipe bug in the entry below, found by hand in a second live restore — the `--ignore-table`/`--no-data` fix did not actually fix it. Verified against the real dump file before touching anything: `parents_portal_2026-08-29_221520.sql` had no `INSERT INTO backups` (correct) but did have `DROP TABLE IF EXISTS \`backups\`` immediately followed by an empty `CREATE TABLE \`backups\``. The restore endpoint executes the entire file verbatim — so that DROP+CREATE ran against the LIVE table too, unconditionally wiping it to zero rows on every restore regardless of source backup. Confirmed live: created two backups (ids 1, 2), restored from #1, `GET /api/backups` came back `[]` — not just #1's row (structurally expected either way, per the first fix) but #2's too, created *after* #1's dump and therefore never in #1's file under any version of this fix. The `--no-data` pass exists so a bare-metal restore outside this API still gets a real `backups` table — that requirement doesn't go away — but it means the dump file necessarily contains that DROP+CREATE, and this API's own restore handler must never be the one executing it. Fixed by splitting concerns: the dump FILE is unchanged (still has real `CREATE TABLE backups`, still useful for external recovery); a new `stripBackupsTableDdl()` in `routes/backups.js` removes just the `backups` table's block (matched on mysqldump's own `-- Table structure for table \`backups\`` comment, stopping at the next table's comment or the trailing `-- Dump completed on` footer) from the SQL string the restore CONNECTION actually executes. Name-based, not a marker only new dumps would carry, so it also protects every backup file already on disk from before this fix, including ones from the original (even worse) bug where the block additionally carried stale rows. Verified three ways before calling it fixed: (1) ran the real stripping function against the actual `221520` dump and confirmed `DROP TABLE`/`CREATE TABLE backups` gone from the executed string while neighboring tables (`users`, `auth_security_state`) were untouched; (2) executed the *stripped* SQL for real against a disposable scratch database (name-redirected via a regex on the dump's own `parents_portal` references, dropped immediately after) — 18 tables created (19 minus `backups`, correctly absent rather than present-and-empty), real data restored (4 `users` rows) — proof the stripped SQL is not just missing the risky statements but still valid, executable SQL on its own; (3) `npm run test:backups` now asserts this directly — a real dump DOES contain `backups`' `DROP TABLE` (sanity check the test is testing something real), and `stripBackupsTableDdl()` applied to that same real content removes both `DROP TABLE` and `CREATE TABLE` for `backups` while leaving `users`' structure and data intact. Proving the restore endpoint itself never executes the stripped statements in production would need an actual live restore — deliberately excluded from the suite, same reasoning as everywhere else in this section — so this tests the extraction function directly against real dump content instead, same shape as `test:sanitize`. `npm run test:backups` — 39 passing (was 35; four new assertions), idempotent, confirmed twice. `npm run test:restore` — unaffected, 22/22, confirmed twice (`stripBackupsTableDdl` is only exercised by an actual restore, which that suite never triggers). **Also checked, unprompted, before writing any code: does `auth_security_state` have the same shape?** Mechanically yes — it's not excluded from the dump, so a restore drops and recreates it too, and the `221520` dump's own `auth_security_state` block proved this concretely (`DROP TABLE`/`CREATE TABLE` with zero rows — that table was empty when this backup was taken, before any restore had run). But unlike `backups`, `auth_security_state.token_valid_after` gets unconditionally re-set via `INSERT ... ON DUPLICATE KEY UPDATE token_valid_after = NOW()` immediately after every restore, regardless of what the dump's snapshot contained — no `if` guarding it, unlike the `restore_wiped_activity_logs` marker's nonzero-count gate. If that specific write fails, the handler's `catch` doesn't claim success — it returns `200` with an explicit warning to treat all sessions as suspect, never the normal "sessions invalidated" message. Verified live, not just reasoned through: `auth_security_state.token_valid_after` currently holds a timestamp matching the actual restore, despite that backup's own dump snapshot for the table being empty. No fix needed here — the existing unconditional post-restore write already covers it; this is architecturally different from `backups`, which has no equivalent write in normal operation. |
| 2026-08-29 | Added a `restore_wiped_activity_logs` marker — the follow-up to the `activity_logs` gap flagged in the backups-wipe entry below, and a deliberate choice not to build the fuller fix (reordering both `create_backup`/`restore_backup` log writes to after the restore). The wipe itself still happens — `activity_logs` still correctly reverts to the restored backup's point in time, including losing the safety dump's own `create_backup` entry — this only makes it stop being silent. `routes/backups.js`'s restore handler now counts `activity_logs` entries newer than `backup.created_at` right before the restore SQL runs (as late as possible, so it's exact — not estimated — and naturally includes the safety-dump entry already written by that point), then, if that count is nonzero, writes one `restore_wiped_activity_logs` entry *after* the restore completes, same timing as `restore_backup` and `token_valid_after`, so it isn't wiped by the thing it documents. Its description names the source backup, that backup's own `created_at` as the boundary, and the exact count lost. The response body also carries `activity_logs_wiped: <count>` so the acting admin sees it immediately, not only in the log. Explicitly not tamper-proof — an admin with direct DB access could delete this row same as any other — but not silent is still better than silent. `npm run test:backups` (35/35) and `npm run test:restore` (22/22) both unaffected — the marker only fires on an actual restore, which neither suite triggers; verifying it requires the same deliberate manual restore everything else in this section does. |
| 2026-08-29 | Fixed a real bug found by hand in the first live restore, not by the automated suite: `GET /api/backups` came back completely empty afterward — not just the safety dump's row, the row of the backup actually restored from too, and (in general, though not observed in this specific run) the row of any other backup taken after the source dump. Root cause: the `backups` table itself is self-referential. A row is inserted only after its own file finishes dumping (`createBackupRecord`), so a backup's file can never contain its own row, and restoring rewinds `backups` to a state missing it, plus every row inserted after that dump was taken; the files stay on disk, the table just stops knowing they exist. Considered and rejected a fix that re-inserts the two rows the restore handler happens to hold references to: it only patches what that one operation touched, not backups #6/#7 taken between the source dump and the restore. Fixed at the source instead — `routes/backups.js`'s `dumpDatabase()` now runs `mysqldump` twice: the main dump with `--ignore-table=<db>.backups` (full structure + data for every other table), then a second `--no-data` pass appended for `backups` alone, so the file still creates an empty `backups` table (a bare-metal restore outside this API still gets a real table, not one requiring `schema.sql` reapplied) but never repopulates it with stale rows. `GET /api/backups` now also reconciles the table against `server/backups/` on every read, returning any `.sql` file with no matching row as `orphaned_files` — read-only, never auto-inserted, since fabricating a `created_by` for an unmatched file would be a guess no one could vouch for. The two files this bug actually orphaned (`parents_portal_2026-08-29_200152.sql`, `pre_restore_2026-08-29_200239.sql`) were adopted by hand, once, as a data fix: `created_by` set to `ADMIN001`, `created_at` taken from the file's own mtime, and each recorded in `activity_logs` as `manual_backup_adoption` — a distinct action from `create_backup`, so the log stays honest that these two rows were reconstructed, not created by the normal flow. **What else in the system has this shape** — a table describing the system rather than the school, wrong to restore verbatim: `activity_logs` was the obvious candidate to check, and checking it live confirmed a real but narrower version of the same defect. Reverting `activity_logs` to the backup's point in time is *correct* for a snapshot restore in general — same as any domain table losing rows written after that point, not a bug. But the two log entries the restore operation itself writes have the identical self-referential problem `backups`' row had: verified against the live table, only the `restore_backup` entry survived a restore (logged *after* the restore SQL runs, same timing class as `token_valid_after`); the safety dump's `create_backup` entry was provably wiped by the very restore it documents, since it's logged *before* the restore SQL runs, into a table that operation then overwrites. Not fixed in this round — out of the agreed scope, and it's a much smaller blast radius (one missing log line, not an empty operational table) — flagged here as a known gap. A marker for it was added in a later entry the same day, below. New test: `npm run test:backups` now asserts a real dump contains `CREATE TABLE backups` (structure survives) and contains no `INSERT INTO backups` (no stale rows) — direct regression coverage for the `--ignore-table`/`--no-data` fix; if the flag is ever removed, this fails immediately with no live restore needed. `npm run test:backups` — 35 passing (was 33; two new assertions), idempotent. Fixing this also broke a fixture assumption in `test:restore`: it asserted `pre_restore_` backups count is exactly `0` at baseline and again after every gate-failure test ("clean baseline") — true only because no real restore had ever run yet. Once one genuinely had (see below) and its `pre_restore_*` row was adopted, that absolute-zero assumption became permanently false, failing 2 assertions on every subsequent run. Fixed to a before/after delta (no *new* `pre_restore_` row created by this suite's own requests) instead of an absolute count — the same idempotent-suite pattern used everywhere else in this codebase, just missed here because the suite was written before a real restore was possible to run against. `npm run test:restore` — 22 passing (one assertion converted to a tracked baseline, no longer a standalone check), confirmed twice. **On whether the suite could have caught the original bug without a live restore:** the *consequence* (empty table) genuinely needed one — that's why it surfaced by hand. But the *precondition* (a backup's file can never contain its own row) was checkable from a dump's content alone the whole time, same content-inspection shape already used for the `mysqldump` header/`CREATE DATABASE` checks — that test just hadn't been written. Unlike excluding a live restore from the suite (a deliberate, confirmed tradeoff), this was a gap, and it's fixed now. |
| 2026-08-29 | Fixed a real bug in `scripts/test-messages-flows.js`, found during the full regression pass after Restore — not a bug in the app code, which was correct the whole time. The source-inspection check for "no bare `io.emit(`" strips `//` line comments before checking, specifically so its own explanatory comments (`// Never io.emit()...`) can't false-match the negative check. `stripLineComments` split the file on `\n` only; `socket.js` and `routes/messages.js` have Windows CRLF line endings, so every split "line" kept a trailing `\r`. JS's `.` does not match `\r` (it's a line terminator), so `.*` in `/\/\/.*$/` stopped just short of it — and `$` without the `m` flag only matches true end-of-string, never that position, so the whole regex silently failed to match on every line and stripped nothing. The literal text "io.emit()" inside the comment then survived and tripped the check. This is why the check appeared to pass earlier in the session and then failed later with no code change in between — some tool along the way (not identified precisely; Windows editing/`git` are the suspects) rewrote the file's line endings to CRLF after the check was first written and verified against an LF version. Fixed by dropping the unneeded `$` anchor (`/\/\/.*/`) — `.*` already stops at the end of each single-line string without it, CRLF or not. **Lesson for source-inspection tests on Windows: never anchor a per-line regex on `$` without first normalizing or accounting for `\r` — verify the strip against the file's actual on-disk line endings, not just its content.** `npm run test:messages` — 39 passing, confirmed twice; app code in `socket.js`/`routes/messages.js` required no changes. |
| 2026-08-29 | Restore built — `POST /api/backups/:id/restore`, admin only, `routes/backups.js`. Full guard list and what the test suite deliberately does not cover: see "RESTORE" section, which this entry does not duplicate. Summary: step-up password re-verification, `confirm_filename` exact-match, automatic `pre_restore_*` safety dump before anything is touched (abort with nothing changed if it fails), the actual restore on a dedicated one-off `mysql2` connection with `multipleStatements: true` (never the shared pool), a partial-failure message that names the safety dump by filename and says manual recovery may be needed (MySQL has no transactional DDL — `DROP`/`CREATE DATABASE` auto-commit, so this failure mode can't roll back), shared pool reset after success, and every active JWT invalidated via a new `token_valid_after` cutoff. Three supporting changes: (1) new table `auth_security_state` (single row, `token_valid_after`) — deliberately not a `system_settings` key, since that table is readable by every authenticated role and writable by any admin through a generic form; `middleware/auth.js`'s `authenticate` now rejects any JWT whose `iat` predates the cutoff. (2) `config/db.js` restructured into a proxy object (`query`/`getConnection` delegate to whatever pool is current; `resetPool()` swaps it) — a plain `module.exports` reassignment couldn't work here, since every file that already did `const pool = require('../config/db')` holds a direct reference to the original object, not a live binding; confirmed safe by grepping every pool call site (~130) across the codebase, all of which use only `.query()`/`.getConnection()`. (3) `routes/backups.js` refactored to extract `createBackupRecord({ prefix, createdBy })`, shared by a manual `POST /` backup and the restore endpoint's mandatory safety dump — same machinery, different filename prefix (`parents_portal` vs. `pre_restore`) and log attribution. One spec deviation, flagged and confirmed with no security cost: the original step order checked password/`confirm_filename` before loading the backup row; reordered to load-then-check, since `confirm_filename` can't be verified without knowing the real filename, and any admin can already see every backup's filename via `GET /api/backups` regardless. The synchronous (not async-job-tracking) design is a deliberate call given the current database's actual size — see the RESTORE section for the explicit trigger to revisit it. `npm run test:restore` — 22 passing (see the later CHANGELOG entry for why this number moved from an original 23): every pre-flight gate tested for real over HTTP with confirmation nothing was created after each failure, plus `token_valid_after` tested in isolation via crafted JWTs with a chosen `iat` (deterministic, not a wall-clock race). Deliberately excluded from the suite: an actual end-to-end restore, which would `DROP DATABASE` on the shared dev database, reset the live pool inside the running server process, and invalidate every real session including whichever one is open — planned as one deliberate manual run, together, with `db:setup` ready immediately after. Schema change: `auth_security_state` table added to `schema.sql` and applied live. |
| 2026-08-29 | Fixed a real bug in `routes/settings.js`, found while designing Restore's `token_valid_after` storage — not Restore's bug, a pre-existing one. `GET /api/settings` (list all) had no `WHERE` filter: `SELECT setting_key, setting_value FROM system_settings` returned *every* row in the table regardless of `ALLOWED_KEYS`, even though the allow-list was already enforced on every write and on `GET /:key`. Anything that ever landed in that table by any means — a future internal-only key, a stray row from a bug elsewhere — was readable by every authenticated role, parents included. Added the same `WHERE setting_key IN (?)` filter the writes already use. Added a regression test that inserts a row directly into `system_settings` outside the allow-list (bypassing the API, the only way such a row could exist) and confirms it does not appear in `GET /api/settings`. `npm run test:settings` — 27 passing (was 26; the new test). |
| 2026-08-29 | Messages API + Socket.io built — `routes/messages.js` (5 endpoints) and `socket.js`. `server.js` restructured: `app.listen()` replaced with an explicit `http.createServer(app)` + `httpServer.listen()` so Socket.io attaches to the same HTTP server instead of standing up a second one; `io` stored via `app.set('io', io)` so route handlers can reach it without a circular require. **Read vs. write use two different scoping rules, deliberately.** `canMessage()` — the shared eligibility boundary (parent↔their child's assigned teachers + admin; teacher↔parents of their own students + other teachers + admin) — runs only on `POST /api/messages`. Both read endpoints (`GET /conversations`, `GET /with/:userId`) are participant-scoped instead (`WHERE sender_id = req.user.id OR receiver_id = req.user.id`), never re-checked against current eligibility. Reasoning: a conversation is history, not a live directory entry — if a teacher's assignment changes mid-year, old threads with a parent shouldn't disappear just because that pairing could no longer *start* today; re-running `canMessage` on every read would make message history unstable under routine reassignment. The security property reads actually need — you can't see a thread you're not part of — is enforced structurally by the `WHERE` clause alone. `GET /conversations` uses a window function, not `GROUP BY` + `MAX(created_at)` — the latter doesn't guarantee the other selected columns (body, sender_id) come from the row that actually has that max timestamp, since MySQL is free to pick them from a different row in the group. `ROW_NUMBER() OVER (PARTITION BY <other_user_id via CASE> ORDER BY created_at DESC, id DESC)` avoids that; the `CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END` is the part that matters — messages are directional (sender/receiver) but a conversation is symmetric (you + them regardless of who sent last), so partitioning on raw `sender_id` or `receiver_id` would split one real conversation into two rows. Socket auth happens once, at connection (`io.use()` middleware verifying the JWT and re-reading `status` from the DB, same live-check as HTTP `authenticate`), not per event — a deactivated user's token is rejected at the handshake, verified in tests against a user deactivated after the token was issued. Delivery is a room-scoped `io.to(\`user:${receiverId}\`).emit(...)`, one room per user, never a broadcast; REST persists first, emits after — no socket event accepts a write. **What the test suite does and does not prove about delivery:** proving "emits to the recipient only" over the wire needs two concurrent client connections and a wait-for-an-event-that-should-not-arrive assertion on the second one — an arbitrary timeout dressed up as proof, the same shape of test rejected for the last-active-admin guard's blocked branch. Tested instead: connection-time auth (no token / valid token / deactivated-user token, all deterministic connect-or-connect_error outcomes), and a source-inspection check that `io.to(...).emit(` is present and no bare `io.emit(` exists anywhere — catching a future refactor that turns the room-scoped emit into a broadcast, which is the actual regression risk, without claiming to have tested delivery itself. That source check initially failed on its own explanatory comments (`// Never io.emit()...` matched its own negative regex) — fixed by stripping `//` line comments from the source before checking, so the check reads code, not prose about the code. Two CLAUDE.md additions from this work: a line in the auth pattern section that `sanitizeUser` is for `SELECT *`/`u.*` responses specifically — a query that only selects the columns it needs doesn't need it, and calling it anyway is theatre; and a new Open Questions entry flagging that there's no "who can I message" contacts endpoint, so a parent has no way to discover their child's teachers' user ids to start a first conversation — deliberately not built, surfaced now rather than mid-Stage-4. `npm run test:messages` — 39 passing, idempotent. |
| 2026-08-29 | Hardened `sanitizeUser` before building Messages — that module JOINs `users` twice (sender, receiver), exactly the aliased-JOIN shape the old version couldn't catch. Was `const { password, ...safe } = user`, which only stripped the literal key named `password`; a JOIN aliasing the hash to anything else (`creator_password`, `sender_password`, `u2_password`) would have leaked it straight through. Now strips any key whose name contains `password`, case-insensitive. Moved to `utils/sanitizeUser.js` — was defined identically in both `routes/auth.js` and `routes/users.js`; now one implementation, same pattern as `parseId`. Unit-tested directly in `scripts/test-sanitize-user.js` (9 assertions) rather than through HTTP, since no current endpoint produces an aliased-password row — testing the function itself, not a shape nothing exercises yet. Considered and rejected adding `UNIQUE` to `users.email` (from KNOWN ISSUES): `setup-db.js` seeds Marwin's and Jea's parent accounts with the *same* guardian email on purpose — they're one guardian's two children, and the locked decision is one account per student, a guardian with three children has three accounts. A table-wide `UNIQUE` would block any real family with 2+ kids from reusing that same real email across sibling accounts. Logged in OPEN QUESTIONS instead: if email login is ever built, the uniqueness needs to be scoped to `role IN ('teacher', 'admin')` only, never a plain table constraint. Also added a header comment to `scripts/create-backup-zip.js` clarifying it's a source-code archiver, not the DB backup — that's `routes/backups.js`. `npm run test:sanitize` — 9 passing. |
| 2026-08-29 | Backup API built — `routes/backups.js`, `GET /`, `POST /`, `GET /:id/download`, `DELETE /:id`. Real `mysqldump` via `child_process.spawn` (not the folder-copy `scripts/create-backup-zip.js`, which is a separate source-code archiver and stays untouched), streamed straight to disk rather than buffered in memory. Password passed via `MYSQL_PWD` on the spawned child's own environment only, never on argv — keeps it out of anything that lists command lines (Task Manager, `wmic process get commandline`, `ps`); considered and rejected `--defaults-extra-file` with restrictive ACLs as disproportionate complexity for a single local-admin dev machine. Dump uses `--databases` (not a bare db name) so it's self-contained for whenever Restore gets built. A row is inserted only after the dump exits 0 and the file is confirmed non-empty — a failed dump leaves no row and no stray file. Schema change: `backups.file_size` added (`schema.sql` + live DB) — manuscript Figure 34 promises it in the backup history UI. No `status` column added; see KNOWN ISSUES for why that's deliberate. Found and fixed a real bug before shipping, unprompted: the filename format (`parents_portal_YYYY-MM-DD_HHmmss.sql`) is second-granularity with no uniqueness constraint on `filename` — two backups requested within the same wall-clock second would have collided, with the second `mysqldump` silently overwriting the first backup's file on disk while both rows stayed in the table (the first row's `file_size` then wrong, its actual content replaced). Added `reserveBackupPath()` — appends `-2`, `-3`, etc. before `.sql` until it finds a name nothing has claimed; verified in tests that two backups created back-to-back get distinct filenames and the first file is untouched by the second. One residual gap flagged, not fixed: this closes the *sequential* case but not two truly *concurrent* requests processed in the same event-loop tick, which could both pass the existence check before either has written a file — accepted for a single-admin capstone deployment rather than building file-locking or a DB-based reservation. `download_backup` is logged (filename + requesting admin) alongside `create_backup`/`delete_backup` — the most sensitive action the API permits, since it produces a copy of every student's name, LRN, grades, attendance, and messages in one portable file. `.gitignore` fixed from a blanket `backups/` to `server/backups/*` + `!server/backups/.gitkeep` (the blanket form would have swallowed the `.gitkeep` too, so a fresh clone had no directory until the first backup). `npm run test:backups` — 33 passing, idempotent, against a real dump (verified the file starts with a genuine mysqldump header, contains `CREATE DATABASE`, and its byte size matches exactly what streams back on download). Restore is explicitly out of scope for this entry — see "RESTORE — required before building." |
| 2026-08-27 | User Management completed — `routes/users.js` gains `GET /api/users` (filter by role/status/search), `GET /api/users/:id`, `PUT /api/users/:id` (name/email/contact_number only — `role`/`login_id`/`student_id`/`password`/`status` are rejected with `400` naming them if sent, not silently dropped), and `PATCH /api/users/:id/status` (active/inactive only). Schema change: `users.status` ENUM gained `'inactive'` (`schema.sql` + live DB) — reusing `'rejected'` would have shown a deactivated teacher a false "account was rejected" message on login, since that value is wired to the parent-approval flow's `rejection_reason` column. Zero changes needed in `auth.js`/`middleware/auth.js` — both already had a generic `status !== 'active'` fallback, so deactivation takes effect immediately, including on an already-issued JWT (verified in tests). Found and fixed a real landmine while doing this: `test-auth-flows.js`'s existing "unexpected status" test temporarily widened the ENUM to add `'inactive'` for itself and then narrowed it back to 3 values in its `finally` block — now that `'inactive'` is permanent, that narrowing would have silently deleted it from the schema on every subsequent `test:auth` run, breaking the new status endpoint with no obvious cause. Removed both `ALTER TABLE` statements from that test. `PATCH .../status` blocks self-deactivation unconditionally, and separately blocks deactivating the last active admin via an independent `COUNT(*) WHERE role='admin' AND status='active'` check — tested honestly: the count-check's *blocked* branch can't actually be triggered through the API, because any non-self admin acting is themselves active and always counts toward the total, so `count <= 1` is only ever reachable when actor equals target, which the unconditional self-check already catches first. Tested what's real (the allow branch, self-block, and a source check confirming the count-check's logic and message are actually wired up) instead of writing a test that would only appear to exercise it. `npm run test:users` — 39 passing, idempotent. |
| 2026-08-27 | System Settings API built — `routes/settings.js`, `GET /`, `GET /:key`, `PUT /:key`, `PATCH /` (bulk, all-or-nothing). `system_settings` is key-value with a 5-key allow-list (`school_name`, `school_address`, `academic_year`, `current_quarter`, `logo_url`) — writing an unknown key is rejected with `400` naming the allowed ones, never silently accepted. `parseId` doesn't apply to `:key` (a string, not a numeric id) — corrected before writing code; an unknown key on a read is `404`, on a write is `400`. `current_quarter`'s valid values are read live from `grades.quarter`'s ENUM via `INFORMATION_SCHEMA.COLUMNS` instead of a hardcoded list, specifically because that ENUM is provisional (CLAUDE.md's own Blocked section — 4 quarters vs. 3 terms is still an open question for the school); a hardcoded copy here would be a second place to update that would silently go stale the moment the real answer came in. Fixed the long-standing `academic_year` seed typo as part of this — `seed.sql` and the live DB both now say `'2026-2027'`. `npm run test:settings` — 26 passing, idempotent (restores original values in a `finally`, same pattern as the auth suite's password-cycling test); includes a source-inspection test confirming the `current_quarter` validator actually queries `INFORMATION_SCHEMA` rather than a hardcoded array, since no black-box HTTP test can distinguish the two without mutating `grades.quarter`, which was ruled out. |
| 2026-08-27 | Contributions API built — `routes/contributions.js`, 8 endpoints across `contributions` (the fee) and `contribution_records` (per-student payment status). `grade_level` is `NOT NULL` on `contributions` — unlike announcements/events there is no school-wide option; a teacher just needs the grade to match a `teacher_assignments` row, no NULL-target case to reject. Roster (`GET /:id/records`) is a live `LEFT JOIN` against active students in the contribution's grade, not a snapshot generated at creation — a student who enrolls after the fee is posted shows up automatically, defaulted to `Pending`. Caught a real bug before shipping: an amount-override on `PATCH .../records/:studentId` (a student can owe less than the full fee, never more — enforced with a `400` naming the cap) defaulted to the full fee on every write, which would have silently reset a previously-set discount back to full price on a plain status-only `PATCH`; fixed by defaulting to the existing record's amount instead, tested explicitly. `DELETE` is blocked with a `409` naming the exact count ("Cannot delete. 1 payment record exists for this contribution. Clear the payment records first if you need to remove it.") when any `contribution_records` exist — `contribution_records.contribution_id` is `ON DELETE CASCADE`, so an unguarded delete would have silently destroyed payment history with no recovery; caught from reading the schema's FK constraints before writing the delete handler, not after. `GET /api/contributions/my-records` never touches another student's row, individually or in aggregate — verified in tests by asserting the response carries no count/total-shaped fields, not just checking the query. `npm run test:contributions` — 35 passing, idempotent. |
| 2026-08-27 | Announcements/Memos/Events API built — `routes/content.js`, one file, three routers (`announcementsRouter`, `memosRouter`, `eventsRouter`) mounted at their own prefixes. Schema check caught a spec error before writing code: `events` has no `target_section` column — only `announcements` does — so event audience scoping is grade-only, never section-level. Audience read-scoping: parent sees school-wide items plus their own child's grade(+section for announcements); teacher sees school-wide plus anything matching their `teacher_assignments`; admin sees everything. Write-scoping: a teacher must name an exact grade+section (announcements) or grade (events) they're assigned to — leaving `target_grade` `NULL` (school-wide) or omitting `target_section` (whole-grade) is rejected with a `403` that names the specific reason ("School-wide announcements are admin-only. Specify a target_grade and target_section you are assigned to.") rather than a bare "forbidden" — deliberately, so a teacher hitting this mid-demo sees a rule, not a bug. `PUT`/`DELETE` are author-or-admin. Memos have no targeting or category columns at all — schema confirms they're school-wide by design, matching the manuscript's simpler single-Memo intent; writes are admin-only, reads open to all roles. Hard delete kept as specified (no status column on any of the three tables); `logActivity` captures the title before the row is gone. `npm run test:content` — 45 passing, idempotent. |
| 2026-08-27 | Attendance API built — `routes/attendance.js`: list/record/bulk-record/correct/per-student/summary. Teacher scoping checks `teacher_assignments` on `subject_id` **and** `grade_level`+`section` together, not just grade/section — a teacher assigned to teach Math for Grade 6-Mabini can't see or record Science attendance for the same class. `POST /` and `POST /bulk` collapse "student doesn't exist" and "exists but out of scope" into the same `403` for a teacher (no way to enumerate students by testing which error comes back); admin is unscoped on all writes, covering a teacher being absent or having left. `POST /bulk` is all-or-nothing in a transaction — every entry validated before anything is written, so a bad `student_id` in a 30-student roster fails the whole batch instead of silently dropping one. Recording the same `(student_id, subject_id, date)` twice updates via `ON DUPLICATE KEY UPDATE` rather than erroring. `GET .../summary/:studentId` returns raw counts only (`Present`/`Absent`/`Late`/`Excused`/`total`) — no computed rate, since the school hasn't confirmed how attendance rate should be calculated. `npm run test:attendance` — 28 passing, idempotent. |
| 2026-08-27 | Both test suites made idempotent — `test-auth-flows.js` and `test-student-flows.js` now generate timestamp-suffixed LRNs/login IDs per run and delete everything they create in a `finally` block, so `npm run db:setup` is no longer required between runs. Previously both used fixed values (`9999999`, `8888888`) with no cleanup, so a second run without a reset failed 6 of 25 auth assertions on stale state, not code — this was masking real signal with a false failure and would only get worse as the remaining 8 modules add their own suites. Cleaned the pre-existing polluted rows out of `users`/`students` (DB now byte-for-byte the seeded 4 users / 2 students). Verified by running each suite twice back-to-back with no reset in between: 28/28 and 25/25 both times. |
| 2026-08-27 | Student Records API built — `routes/students.js`: `GET /api/students` (list, filterable), `GET /api/students/:id`, `POST /api/students`, `PUT /api/students/:id`, `PATCH /api/students/:id/status` (admin only, no hard delete). Parents see only their own child (`req.user.student_id`, never the URL param); teachers see only students in their `teacher_assignments` grade/section pairs — both an out-of-scope read and a nonexistent id return the same `404`, so neither role can enumerate students outside their reach. Teacher-initiated creates are the one place scope violations return `403` instead of `404` — there's no id to enumerate on a create, and the teacher needs to know why it failed. LRN is immutable after creation (it doubles as a parent's `login_id`). Found and fixed a real bug while building this: `routes/users.js` approve/reject passed `Number(req.params.id)` straight into a query with no validation — a non-numeric id becomes `NaN` and reaches MySQL as `WHERE id = NaN` (MySQL rejected it, so nothing leaked, but it should never have reached the query layer). Added `utils/validateId.js` (`parseId()`) as the one shared fix, applied to both `routes/users.js` and `routes/students.js`, and folded into the auth pattern template for every future module. `npm run test:students` — 28 passing. |
| 2026-08-27 | React auth frontend built — `client/` (Vite, React 19, Tailwind v4, Font Awesome). `AuthContext` awaits `GET /api/auth/me` on load instead of decoding the JWT client-side, so a deactivated account can't render a dashboard off a still-valid-looking token. Axios interceptor skips its 401/403 redirect when the failing request is the login call itself, so bad credentials and pending/rejected accounts show inline on the login form instead of bouncing away from it. MySQL started, `db:setup` run, all 24 auth tests pass, and the full login round-trip verified in the browser — admin → `/admin`, wrong password → inline error, pending account → inline message, refresh → spinner with no login-page flash. |
| 2026-08-26 | Login now asserts `status === 'active'` before `signToken`. Test added. |
| 2026-08-15 | Build restarted from zero. No legacy code. |
| 2026-08-13 | Auth backend complete — login, JWT, RBAC, approve/reject. 23 tests. |
| 2026-08-12 | Database schema + seed, 18 tables. `.gitignore` added. |