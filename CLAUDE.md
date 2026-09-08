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
| Database | `parents_portal` — 22 tables |
| Sept 7, 2026 | System proposal checkpoint — **not** the final defense |
| Final defense | Expected around November 2026 |

The four other team members handle the manuscript and data gathering.
**Darryl codes.** Do not assign manuscript work to Darryl or coding tasks
to the team.

> **One number, one place.** The table count above was wrong for weeks while
> two other places in this same file said something different — the front
> matter said 20, the `schema.sql` entry said 22 (correct), and BUILD ORDER
> still said 18. **This document is the source of truth, so a figure repeated
> in more than one part of it is a liability, not redundancy.** That is exactly
> the failure the "endpoints, not percentages" rule at the bottom exists to
> prevent, and it happened here anyway, inside the file that records the rule.
>
> Same applies to endpoint counts. Two numbers are both correct and mean
> different things: **`docs/API_REFERENCE.md` counts 81** handlers defined in
> `server/routes/`, and **the endpoints table below has 82 rows** because
> `GET /api/health` is mounted directly in `server.js`. State which you mean.
>
> Dated CHANGELOG entries are exempt — they record what was true on their date
> and must not be back-edited. It is present-tense claims that have to agree.

---

## CURRENT STATE

**Last verified:** 2026-09-08 (Assignments + Subjects API; audited against the code)

### Seeded baseline

**This is the one place these counts live.** Present-tense claims elsewhere
point here; they do not repeat the figures. Dated CHANGELOG entries are
exempt — they record what was true on their date.

After a clean `npm run db:setup`:

| Table / fact | Count |
|---|---|
| `users` | 7 — ADMIN001, TCH-001, TCH-002 (adviser-only), TCH-003 (Grade 1 - Mabait, all five subjects), parent 13567454 (active, Marwin), parent 1234567 (pending, Jea), parent 1090001 (active, Nino) |
| `students` | 3 — Marwin Conde G6 Malikhain, Jea Mae Bargaso G5 Masigasig, Nino Alcantara G1 Mabait |
| `teacher_assignments` | 8 — 3 for TCH-001 (G6 Mathematics/English/Filipino in Malikhain) and 5 for TCH-003 (every Grade 1 subject in Mabait). TCH-002 still has zero; that is the point of the account. |
| `sections` with a real `adviser_id` | 3 of 23 — Malikhain → TCH-001, Masigasig → TCH-002, Mabait → TCH-003. The other 20 stay NULL until an admin assigns them. |
| `grades` | 5 — Nino's partial descriptive card (Mathematics terms 1–3 A/B/C, Reading terms 1–2 D/E). `grade_components` is 0. Letters are illustrative fixture data, not a computed result. |
| `attendance`, `announcements`, `memos`, `events`, `contributions`, `contribution_records`, `excuse_letters`, `messages` | 0 |

HTTP suites that create rows delete them in a `finally` block and must
return the database to this table, not to a remembered older snapshot.

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
| GET | `/api/students` | teacher (assigned OR adviser of the student's section), admin |
| GET | `/api/students/:id` | teacher (assigned OR adviser), admin, parent (own child only) |
| POST | `/api/students` | teacher (own assignment only), admin |
| PUT | `/api/students/:id` | teacher (own assignment only — `403` naming the reason if adviser-visible but unassigned, `404` if outside both), admin |
| PATCH | `/api/students/:id/status` | admin |
| GET | `/api/sections` | all roles — unscoped reference data, no per-role filtering |
| GET | `/api/sections/:id` | all roles — `404` only for a genuinely nonexistent id |
| PATCH | `/api/sections/:id/adviser` | admin — assigns/clears a section's adviser, one teacher may advise more than one section |
| GET | `/api/subjects` | all roles — unscoped reference data (the 40-row curriculum), optional `?grade_level=` |
| GET | `/api/assignments` | teacher (own rows only), admin (anyone) — teacher naming another `teacher_id` is `403`, not `404` (anti-enumeration does not apply; `/api/messages/contacts` already lists teachers by name) |
| POST | `/api/assignments` | admin — `grade_level` from the subject row, never the body; `section_id` resolved against `sections` for the current `academic_year`; duplicate is `409` |
| DELETE | `/api/assignments/:id` | admin — does **not** refuse when grades exist; a scope change removes future authority, never past records |
| GET | `/api/grades` | teacher (wide view-scope: grade+section, any subject), admin (unscoped), parent (own child only) — filters `student_id`/`subject_id`/`term`/`school_year`, all optional, no hidden defaults; never includes `grade_components` |
| GET | `/api/grades/:id` | teacher (wide view-scope), admin, parent (own child) — includes `grade_components` and a qualitative/letter `descriptor`; `404` on out-of-scope or nonexistent |
| GET | `/api/grades/student/:studentId` | teacher (wide view-scope), admin, parent (own child) — full report card: every subject at the grade level (including ones with zero grade rows), all three terms, computed Final Grade and General Average; `school_year` defaults to `system_settings.academic_year` when omitted |
| POST | `/api/grades` | teacher (subject teacher via `teacher_assignments`), admin (unscoped) — creates a shell row, no computation |
| POST | `/api/grades/:id/components` | teacher (subject teacher), admin — adds one WW/PT raw score, full recompute; `403` naming the subject if within view-scope but not the encoding teacher, `404` if outside view-scope entirely |
| PATCH | `/api/grades/:id/exam` | teacher (subject teacher), admin — sets any subset of ST1/ST2/TE, full recompute; `403`/`404` same distinction as above |
| PATCH | `/api/grades/:id/descriptive` | teacher (subject teacher), admin — Grade 1 only, manual A-E letter, no computation; `403`/`404` same distinction as above |
| PUT | `/api/grades/:id/components/:componentId` | teacher (subject teacher), admin — corrects score/max_score/label/date_recorded, full recompute; `type` not editable; `403`/`404` same distinction as above, or `404` for a mismatched componentId |
| DELETE | `/api/grades/:id/components/:componentId` | teacher (subject teacher), admin — removes a component, full recompute; `403`/`404` same distinction as above, or `404` for a mismatched componentId |
| PATCH | `/api/grades/:id/lock` | admin only, unscoped — toggles `is_locked`; no completeness gate, no extra friction on unlock |
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
| GET | `/api/excuse-letters` | teacher (assigned OR adviser of the student's section), admin (all) — filters: status, student_id, from, to |
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
| GET | `/api/messages/contacts` | authenticated — who this user may start a conversation with; inverse of `canMessage()`; parent sees their own child's teachers + admin, teacher sees parents of their own students + teachers + admin, admin sees everyone; ACTIVE accounts only; `?search=` filters within scope, never widens it |
| GET | `/api/messages/conversations` | authenticated — one row per person messaged, last message + unread count |
| GET | `/api/messages/with/:userId` | authenticated — full thread, participant-scoped (no re-check of `canMessage` on read) |
| POST | `/api/messages` | authenticated — `canMessage()` boundary, `403` naming the reason on violation |
| PATCH | `/api/messages/:id/read` | recipient only — sender or a third party gets `403` |
| PATCH | `/api/messages/read-all/:userId` | recipient only — marks a whole thread read |

**A scope change removes future authority, never past records.** Three
places, one principle: deleting a `teacher_assignments` row does not
touch `grades` (no FK, and mid-year reassignment must not wipe SF9
data); message history stays readable after `canMessage()` would refuse
a new send; and the subjects-reseed CASCADE is the **opposite** case
(destroying `subjects.id` wiped assignments *and* grades). Do not add a
grades-exist guard on `DELETE /api/assignments/:id`.

**Full request/response detail for all 81 endpoints — every body field,
the exact response wrapper key, role-scope codes, and the 404-vs-403
convention — lives in `docs/API_REFERENCE.md`, not here.** This table is
the quick list; that document is what Stage 4 screen work should
actually be read against.

**Backup and Restore both built.** See "RESTORE" below for what shipped and
what the automated suite deliberately does not cover.

**Tests:** fifteen suites. The fourteen HTTP suites are idempotent — every row they
create is tracked and deleted in a `finally` block (or, for Settings, restored to
its original value; for Sections, the two NULL-adviser test sections are reset to
NULL and the throwaway teacher fixture deleted, via a direct DB write, not a
remembered API call), so no `db:setup` is needed between runs. Verified by running
each twice in a row with no reset: same pass count both times, and the DB
confirmed back to the Seeded baseline (above) after — including TCH-002's
zero assignment rows, and the 5 descriptive grade rows on Nino left
untouched by `test:grades` (that suite's throwaway Grade 1 student is a
different row, deleted in `finally`). `test:sanitize` is a direct-call unit test — no server or DB
involved. `test:restore` is the one exception to "runs a real flow end to end":
it tests every pre-flight gate and the `token_valid_after` mechanism, but
never triggers an actual restore — see the RESTORE section.
- `npm run test:students` — 39/39
- `npm run test:sections` — 30/30
- `npm run test:assignments` — 41/41
- `npm run test:grades` — 149/149
- `npm run test:auth` — 25/25
- `npm run test:attendance` — 38/38
- `npm run test:content` — 53/53
- `npm run test:contributions` — 38/38
- `npm run test:settings` — 26/26
- `npm run test:users` — 39/39
- `npm run test:backups` — 39/39
- `npm run test:sanitize` — 9/9
- `npm run test:messages` — 56/56
- `npm run test:restore` — 22/22
- `npm run test:excuses` — 67/67

`node scripts/verify-grading-seed.js` is not one of the fifteen suites
above — it's a direct-DB verification script (no server, no HTTP, no
`assert()` harness), checking the Grades seed (transmutation table,
weights, modes, Grade 1 descriptive fixture) is internally consistent.
Run it after `db:setup`, before trusting the seed. Pass count lives in
the script's own output, not here.

`npm run test:grade-computation` (Stage G2a, extended in G3 with the
qualitative/letter descriptor lookups) is also not one of the fifteen
suites above — it's a direct-call unit test of `utils/gradeComputation.js`,
no server, no DB, matching `test:sanitize`'s shape. 51/51 passing,
deterministic (pure functions).

### Files that exist

```
server/
  server.js                    Express app + explicit http.createServer wrapping it (so Socket.io
                                shares the same server, not a second one — app.listen() replaced
                                with httpServer.listen()); mounts /api/auth, /api/users,
                                /api/students, /api/sections, /api/subjects, /api/assignments,
                                /api/grades, /api/attendance, /api/announcements, /api/memos,
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
  routes/assignments.js         GET /api/subjects (all roles, unscoped 40-row curriculum,
                                optional ?grade_level=) plus GET/POST/DELETE /api/assignments.
                                Teacher GET is own-rows only; naming another teacher_id is
                                403 not 404 (contacts already lists teachers — nothing to
                                enumerate). POST is admin-only; grade_level comes from the
                                subject row, never the body; section_id is resolved against
                                sections for academic_year and stored on this row (a write
                                on this table, not a new section_id reader elsewhere).
                                DELETE does not refuse when grades exist — no FK from
                                grades to teacher_assignments; a scope change removes
                                future authority, never past records
  routes/grades.js              Stage G2b (2026-09-05): POST / only — creates a shell row, every
                                score/computed column NULL, is_locked 0. No computation — does not
                                import utils/gradeComputation.js at all. Scoped via
                                teacher_assignments (teacher_id + subject_id + grade_level +
                                section, all four — narrower than students.js/content.js, which
                                don't check subject_id), using the VARCHAR grade_level/section
                                columns, never section_id (reserved for attendance + the unbuilt
                                Class Board only). Validation order is security-motivated, not
                                incidental: the subject/student-grade-level mismatch check runs
                                AFTER scope is resolved, specifically so an out-of-scope teacher
                                can't learn a real student's grade level by probing with a wrong
                                subject_id — see the file's own comment at that check.
                                grading_mode_configs is deliberately not consulted here; a Grade 1
                                row and a Grade 5 row are structurally identical at creation.
                                Stage G2c (same day): POST /:id/components (WW/PT) and
                                PATCH /:id/exam (ST1/ST2/TE, any subset, score+max always paired,
                                explicit null clears both) — the first writes that actually
                                compute anything. Preflight order: scope (404) -> grading_mode_configs
                                (numerical only, else 400; missing row is 409, not 500) ->
                                is_locked (403) -> grade_weight_configs presence (409) -> THEN the
                                write, all inside one transaction with recomputeGrade() so a
                                failure after the insert rolls back the insert too.
                                recomputeGrade() is the one DB-touching function in this file —
                                deliberately NOT added to gradeComputation.js, which stays pure by
                                design; it fetches what the pure functions need (grade_components
                                rows, the weight row, the transmutation lookup) and calls
                                gradeComputation.js for every actual calculation. Always full
                                recompute from source, never incremental. POST /:id/components
                                returns both `component` and `grade`; PATCH /:id/exam returns only
                                `grade` — a deliberate asymmetry (the first creates a child
                                resource, the second only updates columns on the parent), commented
                                at both handlers so it isn't misread as an oversight.
                                Stage G2d (2026-09-06): PATCH /:id/descriptive — Grade 1's manual
                                A-E letter, no computation, no transaction (a single UPDATE on one
                                column with nothing to make atomic with it). preflightGradeWrite()
                                refactored to take an expectedMode ('numerical' | 'descriptive')
                                parameter instead of being duplicated — shared scope/mode/lock logic
                                across all three write endpoints now, so a future fix can't be
                                applied to one copy and silently miss another; the two G2c call sites
                                were updated to pass 'numerical' explicitly, and the full grades
                                suite was re-run immediately after that refactor, before writing the
                                new endpoint, specifically so a regression would be attributable to
                                the refactor and not confused with new code. is_locked's gate is
                                inherited for free by reusing the shared function — no separate
                                decision needed, same as it can't fire yet for G2c either.
                                descriptive_grade: null clears the column, mirroring G2c's sub-test-
                                clearing convention rather than inventing a second one. Grade 1 as a
                                MANUAL judgment call is stated in-code as an explicit ASSUMPTION, not
                                a school-confirmed answer — see the handler's own comment and the
                                Grades module note below.
                                Stage G2e (2026-09-06): PUT/DELETE /:id/components/:componentId
                                (correct or remove a WW/PT entry, full recompute, both transaction-
                                wrapped the same as POST /:id/components) and PATCH /:id/lock (admin
                                only, unscoped). type is NOT editable via PUT — a differing type is
                                400, correcting a miscategorized entry is delete+recreate.
                                componentId not belonging to the given grade id (or not existing)
                                is 404, undifferentiated — matched via a single WHERE id = ? AND
                                grade_id = ? query, the same collapsing loadAuthorizedGrade already
                                does for the parent id. Deleting the last component of a type needs
                                no special-casing: componentPercentage([]) already returns null (see
                                gradeComputation.js), so ww_percentage/pt_percentage — and
                                initial_grade/term_grade with them, if that was the last of the
                                three required inputs — revert to NULL automatically on the next
                                recompute. PATCH /:id/lock is deliberately NOT gated on completeness
                                (e.g. initial_grade IS NOT NULL) — commented explicitly at the
                                handler: that check would make every Grade 1 (descriptive-mode) row
                                PERMANENTLY unlockable, since descriptive rows never populate
                                initial_grade at all by design. Unlock carries no extra friction
                                versus lock (no step-up auth, no required reason) — unlike Restore,
                                an unlock is reversible by re-locking, so matching friction would be
                                theatre. Whether a teacher should be able to lock their OWN encoding
                                is recorded as an open school question, not decided — see the Grades
                                module note and OPEN QUESTIONS below.
                                Stage G3 (2026-09-06): GET /, GET /:id, GET /student/:studentId — the
                                first reads this module has ever had. loadAuthorizedGrade() split
                                into two tiers: a new WIDE view-scope (teacherCanViewGrade —
                                grade+section, any subject, matching students.js's own EXISTS
                                pattern) determines 404 (cannot see this at all); the existing NARROW
                                encode-scope (teacherCanEncodeGrade — subject-specific) now only
                                gates writes via a new encodeScopeError() check added to all five
                                :id-keyed write endpoints, returning 403 naming the subject when a
                                teacher is inside view-scope but outside encode-scope. THIS RESOLVES
                                G2b's provisional 404 — see the Grades module note below for the full
                                reasoning. GET / lists, scoped by role in the WHERE clause itself
                                (parent forced to their own child, 403 if they explicitly name a
                                different one; teacher via the wide view-scope; admin unscoped);
                                filters student_id/subject_id/term/school_year, all optional, no
                                hidden defaults — all four together resolve to at most one row,
                                matching uq_grade_record's own unique key, closing a lookup gap that
                                existed since G2b. GET / never includes grade_components. GET /:id
                                does, plus a computed `descriptor` (Table 11 for a numerical
                                term_grade, Table 8 for a descriptive letter) inferred from whichever
                                of the two dual-mode columns is populated. GET /student/:studentId
                                builds the full report card: every subject at the grade level
                                (including ones with zero grade rows — queried from `subjects`
                                directly, then overlaid with whatever grades exist, so a missing
                                subject and an unencoded one are never confused), all three terms,
                                a computed Final Grade and General Average. Both FG and GA follow the
                                SAME null-until-complete rule as Initial Grade (utils/gradeComputation.js's
                                header comment) — deliberately not a running average; a partial FG
                                carries real weight (SF9, promotion), so a caller who sees one early
                                would reasonably treat it as settled, which no later caveat can undo.
                                Both are `null`, not merely unpopulated, for a descriptive-mode
                                subject/student — genuinely inapplicable, not incomplete;
                                `grading_mode` at both levels is how a caller tells the two apart.
                                `school_year` on this endpoint alone defaults to
                                system_settings.academic_year when omitted — a deliberate asymmetry
                                with GET /'s no-default filters, commented at the handler: a report
                                card is bounded to one year by what it IS, a search tool is not.
  routes/attendance.js         record/bulk/correct/list/summary — per DAY (Stage B1), not per subject.
                                No subject_id anywhere in this file. Scoped by section adviser
                                (sections.adviser_id via students.section_id), not teacher_assignments —
                                subject teachers don't record attendance under this model.
                                teacherIsAdviserOfSection() replaces the old teacherHasAssignment().
                                POST /bulk is the primary path: { section_id, date, entries }
  routes/content.js            announcements/memos/events — 3 routers, one file
  routes/contributions.js      fee + per-student payment status, lazy roster, delete guard
  routes/settings.js           key-value store, allow-listed keys, per-key validation.
                                current_term (was current_quarter) validated against a hardcoded
                                ['1','2','3'] — the old live INFORMATION_SCHEMA ENUM introspection
                                on grades.quarter was removed once DO 009 s.2026 made the term
                                count a settled fact, not a placeholder; grades.term is a
                                TINYINT+CHECK now anyway, nothing left to introspect
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
  utils/gradeComputation.js    Stage G2a (2026-09-05). Pure functions, no DB/HTTP:
                                componentPercentage() (WW/PT — sum(score)/sum(max)x100),
                                subTestPercentage() (one EX sub-test), exPercentage() (ST1x0.30 +
                                ST2x0.30 + TEx0.40), weighted(), initialGrade(), roundTo2().
                                Every function returns null on a missing required input — never a
                                partial/guessed number. roundTo2() rounds half-up (not half-to-
                                even) with a Number.EPSILON nudge against floating-point
                                representation error. Percentages over 100 (bonus points) are
                                deliberately NOT clamped — see the file's own comment for why.
                                Stage G3 (2026-09-06) adds two more pure lookups:
                                qualitativeDescriptor() (GRADING_SPEC Table 11 — numeric band to
                                {descriptor, remarks}, e.g. 90-100 -> Advancing/Passed) and
                                descriptiveGradeMeaning() (Table 8 — letter to {descriptor,
                                filipino}, e.g. A -> Advancing/Namumukod-tangi). Both null on
                                missing/invalid input, same contract as every function above. Note
                                Table 8's English words are the same words as Table 11's bands —
                                DepEd's own letters are named after the qualitative descriptors, not
                                an independent vocabulary; a unit test asserts this directly rather
                                than trusting it by eye
  scripts/setup-db.js          runs schema + seed, hashes seed passwords; backfillSectionIds()
                                runs after seeding — populates section_id from the matching VARCHAR
                                value (name+grade_level+school_year), then reports any row left
                                NULL with the unmatched value. Deliberate, not incidental — this is
                                what caught 'Mabini'/'Rizal' as fictional; do not remove the
                                reporting step even once every value matches cleanly.
                                buildUserSeedSql() also creates TCH-002 (Ana Reyes, fictional,
                                adviser of Grade 5 - Masigasig, zero assignments) and TCH-003
                                (Lito Bautista, Grade 1 - Mabait adviser + all five subjects).
                                Counts: Seeded baseline.
  scripts/test-auth-flows.js   HTTP tests
  scripts/test-student-flows.js HTTP tests — scoping, validation, lifecycle
  scripts/test-sections-flows.js HTTP tests — 23-row fixed inventory, admin-only PATCH, role/status
                                validation on adviser_id, one teacher advising two sections. Every
                                mutation runs against 2 currently-NULL-adviser sections (resolved
                                by id, never the seeded-adviser sections), reset to NULL via a
                                direct DB write in a finally block — never a remembered "restore
                                the seeded value" step. How many sections are still NULL: Seeded
                                baseline.
  scripts/test-assignments-flows.js HTTP tests — GET /subjects (40 rows, Grade 1 names,
                                unscoped parent read), GET /assignments (TCH-002 empty is
                                correct; TCH-001 three Malikhain; TCH-003 five Mabait never
                                deleted), teacher naming another teacher_id is 403 not 404,
                                admin POST Grade 5 Science/Masigasig for TCH-002, duplicate
                                409, inactive/non-teacher 400, DELETE assignment leaves a
                                Jea Science grade row intact. Seeded assignment rows are
                                never deleted. 41/41, confirmed twice, no db:setup between
  scripts/test-grades-flows.js  HTTP tests — Stage G2b (POST /api/grades). Subject-teacher
                                scoping (assigned-to-section-but-not-subject is a distinct 403 from
                                fully-out-of-scope), the admin-404/teacher-403 asymmetry for a
                                nonexistent student (the anti-enumeration property, asserted
                                explicitly), subject/grade-level mismatch, term/school_year
                                validation, inactive student, duplicate (409).
                                Stage G2c (same day): a full worked example driven step-by-step
                                through the real HTTP endpoints, reusing test-grade-computation.js's
                                EXACT numbers (WW 87%, PT 90%, EX 85.50% -> IG 88.05 core weights,
                                IG 88.50 MAPEH weights, both transmuting to TG 90 per the seeded
                                table, verified against transmutation_table live, not hardcoded) —
                                asserting the NULL boundary at every intermediate step, and proving
                                recompute-from-source across two SEPARATE POST calls (not collapsed
                                into one), which is the one property a pure unit test structurally
                                cannot exercise. Also: descriptive-mode rejection (400) on both
                                endpoints, out-of-scope 404 (no GET exists yet), score/max_score
                                validation (negative, zero max, over-100% unclamped), PATCH /:id/exam
                                pairing rules (score+max together, explicit null clears both,
                                conflicting explicit null+number rejected, empty body rejected), and
                                transaction-atomicity (a rejected write leaves zero grade_components
                                rows — asserted by row count, not just status code). Found and fixed
                                a real test-writing gotcha, not a production bug: mysql2 returns
                                DECIMAL columns as strings ("90.00"), so strict === against a number
                                literal failed even on correct values — gradeComputation.js's own
                                Number() coercions already protect the actual computation, so this
                                was purely a test-assertion fix (a local num() null-safe coercion
                                helper), not a code change.
                                Stage G2d (2026-09-06): subject teacher sets A-E on the same Grade 1
                                fixture row G2c already used for the descriptive-mode-rejects-
                                numerical-writes tests — asserting every numerical column stays
                                NULL afterward (the property that matters), all five letters
                                accepted, null clears the column, lowercase/invalid-letter/missing-
                                field all 400 (lowercase asserted to name "uppercase" in the
                                message), the same endpoint against a numerical (Grade 5) grade is
                                400, POST /:id/components against the Grade 1 row is still 400
                                (the other side of the gate, re-checked here), out-of-scope teacher
                                404, parent 403, admin unscoped success. One new fixture: a real
                                teacher_assignments row giving TCH-001 Grade 1 Mathematics in the
                                fixture student's section, so "subject teacher succeeds" tests an
                                actual subject teacher, not just admin — deleted in the finally
                                block. `npm run test:grades` grew from 56 to 71 assertions, run
                                three times given the new fixture. Every created grade row, the two
                                throwaway student fixtures (inactive Grade 6, descriptive-mode
                                Grade 1), and the one throwaway teacher_assignments row are deleted
                                in a finally block.
                                Stage G2e (2026-09-06): a dedicated grade row built up to FULL
                                completion first (WW+PT+EX all present, a real non-null Initial
                                Grade 83.30 and looked-up Term Grade) specifically so deleting the
                                last WW component afterward demonstrates a genuine reversion to
                                NULL, not a trivial already-null case. Edit a score by hand-checked
                                amount (ww_percentage 70.00 -> 75.00, Initial Grade 83.30 -> 84.30),
                                edit label/date only (computation unchanged), reject a type change,
                                componentId/grade-id mismatch and nonexistent componentId both 404,
                                delete one of two WW (recomputes to the remaining one alone, 90.00),
                                delete the last WW (ww_percentage/initial_grade/term_grade ALL
                                revert to NULL, asserted together). Lock: teacher/parent 403, admin
                                200 against a grade with initial_grade NULL, all three numerical/
                                exam/component write endpoints then 403, unlock restores writes,
                                locking a Grade 1 descriptive row (initial_grade always NULL)
                                succeeds — the exact case a naive completeness gate would have
                                permanently broken — and PATCH /:id/descriptive on a locked
                                descriptive row is 403 too. `npm run test:grades` grew from 71 to 96
                                assertions, run three times. No new fixtures beyond the one
                                dedicated grade row, already tracked for cleanup.
                                Stage G3 (2026-09-06), built as three isolated passes so a break
                                would be attributable to one of them: PASS 1 — the loadAuthorizedGrade
                                two-tier refactor. The old "Jea/Grade 5, no assignment at all" 404
                                tests were kept (still 404 — fails the wide view-scope too) and
                                relabeled; new coverage adds a Science grade row for Marwin (TCH-001's
                                own section, a subject TCH-001 doesn't teach) and asserts all FIVE
                                :id-keyed write endpoints now return 403 naming "Science" instead of
                                the old 404, including confirming the scope check fires BEFORE
                                PATCH /:id/descriptive's mode check (403, not 400, even though the
                                target is numerical-mode). PASS 2 — qualitativeDescriptor()/
                                descriptiveGradeMeaning() unit tests, all 8 requested band boundaries
                                (90/89/80/79/75/74/65/64) plus range edges and a direct check that
                                Table 8's five letters resolve to the same words as Table 11's five
                                bands. PASS 3 — the three GET endpoints: all four list filters
                                individually and combined, list/detail component-inclusion asymmetry,
                                view-scope-but-not-encode-scope returning grade data via GET /:id
                                where the old code would have 404'd, parent/teacher/admin scope on
                                all three endpoints, a Grade 1 report card showing letters with
                                final_grade/general_average both null (not "pending"), and a
                                dedicated Grade 2 fixture (5 subjects, the smallest numerical-mode
                                grade level) built via DIRECT SQL inserts of term_grade values
                                (bypassing the WW/PT/EX write path on purpose — that arithmetic is
                                already proven elsewhere; only the FG/GA AGGREGATION is under test)
                                proving Final Grade is null with 1 term, null with 2, populated with
                                3 (hand-checked: (80+85+90)/3 = 85.00), and General Average stays
                                null until the LAST subject's Final Grade appears, then populates
                                (hand-checked: (87.00x4 + 85.00)/5 = 86.60). `npm run test:grades`
                                grew from 96 to 141 assertions (run three times); `npm run
                                test:grade-computation` grew from 29 to 51. Full 15-suite regression
                                afterward: every other suite unchanged from its prior count. DB
                                confirmed back to the then-current baseline after. Present-tense
                                counts: Seeded baseline, not this G3 write-up.
  scripts/test-attendance-flows.js HTTP tests — per-day model (Stage B1): adviser scoping via
                                sections.adviser_id, bulk section_id validation, all-or-nothing
  scripts/test-content-flows.js HTTP tests — audience scoping, named 403 reasons, author-or-admin
  scripts/test-contributions-flows.js HTTP tests — grade scoping, roster, amount cap, delete guard
  scripts/test-settings-flows.js HTTP tests — allow-list, per-key validation, PATCH all-or-nothing;
                                current_term validated 1-3, no longer a source-inspection mechanism
                                check now that the ENUM-sniffing it verified is gone
  scripts/verify-grading-seed.js Verification script, not a test suite — no server/HTTP, direct DB
                                only. Checks the transmutation_table has 41 rows for 2026-2027 with
                                no gaps/overlaps at 0.01 precision across the full range (walks
                                ig_min/ig_max pairs in order), the exact boundary case (IG 70.00 ->
                                75, IG 69.99 -> 74) via the real lookup query, and grading_mode_configs
                                has exactly 6 rows for 2026-2027 with Grade 1 descriptive and
                                Grades 2-6 numerical. Stage G1b (2026-09-06) additions: subjects
                                totals exactly 40 rows with the correct per-grade count (5/5/6/8/8/8);
                                grade_weight_configs totals exactly 35 rows (still every row summing
                                to 100.00); zero weight rows exist for any subject at a
                                descriptive-mode grade level (proven from the output side, not by
                                re-reading the seed SQL's own stated intent); and every MAPEH/EPP
                                row carries 20/60/20 while everything else carries 20/50/30. Run
                                after npm run db:setup, before trusting the seed — this is the one
                                place a single hand-transcription typo, across either the 41-row
                                transmutation table or the 40 subject names, would otherwise go
                                undetected
  scripts/test-user-management-flows.js HTTP tests — admin-only, PUT forbidden fields, status guards
  scripts/test-backups-flows.js HTTP tests — real dump execution, collision guard, missing-file handling
  scripts/test-sanitize-user.js Direct-call unit test — no server/DB, tests the aliased-JOIN password gap
  scripts/test-grade-computation.js Direct-call unit test — no server/DB. Worked examples (core
                                20/50/30 and MAPEH/EPP 20/60/20 weights against the same raw
                                scores, exact Initial Grade checked by hand), every partial-state
                                null case, rounding boundaries (half-up vs half-to-even, and a
                                floating-point representation-error case), division by zero, and
                                the over-100% bonus-points decision (not clamped). Stage G3
                                (2026-09-06) added qualitativeDescriptor()/descriptiveGradeMeaning()
                                coverage: all 8 Table 11 band boundaries (90/89/80/79/75/74/65/64),
                                range edges (0, 100, -1, 100.01), all 5 Table 8 letters with their
                                Filipino translations, invalid-letter/null handling, and a direct
                                assertion that Table 8's English words match Table 11's band names
  scripts/test-messages-flows.js HTTP + Socket.io tests — canMessage boundary, connection auth, source check
  scripts/test-restore-flows.js HTTP tests — every pre-flight gate, token_valid_after via crafted JWTs;
                                deliberately never triggers a real restore, see CURRENT STATE
  scripts/test-excuses-flows.js HTTP tests — forbidden-body-fields ignored, absence_date round-trip,
                                cross-parent 404, teacher scoping, Pending-only edit guard, and
                                review: adviser-only 403 (not 404, deliberately — see the comment
                                in routes/excuses.js), already-reviewed 403, attendance-row-count
                                unchanged before/after an approval, admin-unscoped review
database/
  schema.sql                   22 tables. users.status ENUM now includes 'inactive'.
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
                                Grades module, Stage G1a (2026-09-05): grade_weight_configs
                                dropped + recreated, keyed (subject_id, school_year), ww/pt/ex
                                naming, CHECK sums to 100.00 — see Grades module note for why
                                subjects itself is untouched and this seed is provisional; grades
                                dropped + recreated — term TINYINT+CHECK (was quarter ENUM),
                                ww/pt/ex percentage+weighted, initial_grade, term_grade,
                                descriptive_grade (dual-mode, see table comment); ex_st1/ex_st2/
                                ex_te hold the RAW score (Stage G2a correction, 2026-09-05 — see
                                Grades module note), each with its own ex_st1_max/ex_st2_max/
                                ex_te_max column, so the percentage stays re-derivable exactly
                                like WW/PT retain every raw score via grade_components;
                                grade_components dropped + recreated — ENUM('WW','PT') only, no
                                'formative'; transmutation_table (new) — 41 rows, school_year-
                                scoped, disappears without a code change once a year has no rows;
                                grading_mode_configs (new) — per (grade_level, school_year)
  seed.sql                     subjects, students, settings; academic_year fixed to '2026-2027'.
                                23 sections seeded for SY 2026-2027 (school's official teacher
                                list). Marwin/Jea's sample sections were fictional ('Mabini',
                                'Rizal') and are now real seeded names ('Malikhain', 'Masigasig').
                                Which sections have an adviser_id, how many students/users/grades
                                exist after setup, and the Grade 1 descriptive card (Nino,
                                LRN 1090001, Mabait) — see Seeded baseline, not here.
                                system_settings.current_quarter renamed to current_term ('1').
                                transmutation_table seeded with the 41-row table from
                                docs/GRADING_SPEC.md §5 verbatim; grading_mode_configs seeded
                                per Table 12 (Grade 1 descriptive, Grades 2-6 numerical, SY
                                2026-2027) — moved AHEAD of grade_weight_configs in file order as
                                of Stage G1b, since the weight seed now JOINs against it.
                                subjects — Stage G1b (2026-09-06) real per-grade lists replacing
                                G1a's uniform 8-subject placeholder: 40 rows total (5/5/6/8/8/8 per
                                grade 1-6). Grade 4's list is INFERRED (not photographed — matches
                                the SF9's 8 intermediate rows and Grade 5's photographed program),
                                flagged in-file, not treated as equally solid as the other five.
                                Grade 6 seeded under the SF9's names (GMRC, EPP), not the class
                                program's (ESP, TLE) — same learning areas, parent-facing naming;
                                alternates recorded in-comment. Homeroom Guidance/ARAL Program
                                excluded (not graded). grade_weight_configs reseeded to match — 35
                                rows via SELECT ... JOIN grading_mode_configs ... WHERE mode =
                                'numerical', not a hardcoded grade_level comparison — Grade 1 gets
                                zero rows this way, and the exclusion still holds automatically the
                                day Grade 2 also goes descriptive, with no code change. Cascades
                                (subjects.id has ON DELETE CASCADE from teacher_assignments,
                                grade_weight_configs, and grades) destroyed TCH-001's 3 seeded
                                Grade 6 assignment rows and all 48 old placeholder weight rows —
                                both expected and both fully replaced; setup-db.js's own
                                teacher_assignments INSERT needed zero changes, since it already
                                resolves by name (Mathematics/English/Filipino, all three still
                                real Grade 6 subjects), not a hardcoded id
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

**No Expo app.**

Grades is no longer in this section — see below.

### Grades — fully built (write path + viewing), Stage 3's last backend module

Nine stages (G1a → G2a → G2b → G2c → G1b → G2d → G2e → G3): the schema is
correctly shaped for DO 009/DO 015 s. 2026, `subjects` holds the school's
real 40-row per-grade curriculum (Stage G1b — Grade 4's list is recorded
as inferred, not confirmed), the write-path arithmetic exists as pure,
unit-tested functions (`utils/gradeComputation.js`), a teacher can create,
encode (numerical WW/PT/exam or Grade 1's manual A-E letter — G2d states
plainly this is an assumption, not a school-confirmed answer for how a
teacher arrives at a letter; DO 015 defines no formula), correct, delete,
and an admin can finalize (lock/unlock) a grade row against the real
curriculum. **Stage G3 (2026-09-06) closes the loop — a parent can now see
grades.** `GET /`, `GET /:id`, and `GET /student/:studentId` (the full
report card: every subject, all three terms, computed Final Grade and
General Average) are built. G3 also resolved a decision G2b had left
provisional: teacher read-scope is wider than encode-scope (grade+section,
any subject — matching `students.js`'s own pattern, not the narrower
subject-specific scope Grades' writes use), so the five `:id`-keyed write
endpoints now answer 403 (naming the subject), not 404, when a teacher can
see a row via `GET` but isn't the subject's assigned teacher — see the
`routes/grades.js` file entry above and the 2026-09-06 CHANGELOG entry for
the full mechanism. See BLOCKED / RESOLVED → Grades module below for
policy detail not yet reflected in code (the ST1/ST2/TE composite column
gap, `grade_weight_configs`' grade-band-vs-learning-area keying, the term
vs quarter naming). Backup/Restore is fully built — 5 endpoints, see
"RESTORE" below. **Excuse Letters is fully built** — both original
blockers (who approves, does approval touch attendance) are resolved and
`PATCH /:id/review` is implemented; see BLOCKED / RESOLVED and the
2026-09-05 CHANGELOG entry.

### sections table — one route reads it (attendance), one route manages it (sections), Class Board investigated and found to need nothing from it

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
own. **`section_id` is read in exactly FOUR places: attendance scoping, and
the teacher READ scope in `routes/students.js`, `routes/excuses.js` and
`routes/messages.js` — the last three all via the one shared constant in
`utils/teacherScope.js`.**

The note has now forced this check four times, and the fourth is the one where
it earned its keep by producing a *distinction* rather than a rubber stamp:
**`routes/content.js` was widened for advisers in the same dispatch and did NOT
become a `section_id` reader.** Its scoping runs on `announcements.target_grade`
/ `events.target_grade` — columns on the content tables — with no student row in
the query to resolve a `section_id` from, so it needed its own adviser clause
matching `sections` by `grade_level` + `name` instead. Subject matter suggested
it would be a fourth copy of the shared predicate; shape decided otherwise.
Still do not migrate a fifth route without checking here first.

This note is why each of those was checked against it first, and it has now
done that job three times — it is not a rule being repeatedly overridden, it
is the gate working. The two additions share one cause: every attendance
endpoint, and excuse-letter REVIEW authority, scope on `sections.adviser_id`,
while both files' read scopes were `teacher_assignments`-only. That gap is
what let an adviser record attendance for a student they could not list, and
made an adviser the sole permitted reviewer of an excuse-letter queue they
could not see. Both read scopes are now `teacher_assignments` OR
`sections.adviser_id`, with the adviser leg matching `s.section_id` — the same
column attendance and the review check use — so the sets coincide by
construction rather than by agreement.

**Write authority did not move in either file.** `students.js` keeps
`PUT`/`POST` on `teacher_assignments` alone; `excuses.js` keeps review on the
adviser check that runs after the visibility query. Still do not migrate a
fourth route without checking here first — `content.js` is next and is
scheduled, not open.

That second reader is a deliberate, reasoned addition, not the start of the
migration this note exists to prevent — and this note is what it was checked
against first. `routes/students.js` scoped teachers through
`teacher_assignments` alone while every attendance endpoint scoped through
`sections.adviser_id`, so an adviser with no assignment rows could record
attendance for a student that file would not list (TCH-002 was exactly that
account). The read scope is now `teacher_assignments` OR `sections.adviser_id`,
and the adviser leg matches `s.section_id` — the same column attendance uses —
so "students I can list" and "students I can record attendance for" are the
same set BY CONSTRUCTION rather than two definitions that happen to agree. A
VARCHAR match would have re-introduced a subtler mismatch. **Write scope did
not move: `PUT`/`POST` remain `teacher_assignments`-only.** Still do not
migrate a third route without checking here first.
It was once expected to be read in a second place too — the Class Board —
but that expectation did not pan out and is corrected here, not left
standing as a plan. The Class Board was investigated (2026-09-06, see the
Class Board section below) and found to need nothing from `section_id`:
the read side gains nothing (`target_grade` + `target_section` already
does the identical scoping job as a two-column match, `section_id` would
only make the same query a one-column match), and the write side was
never wired to begin with — `POST /api/announcements` does not set
`section_id`, and `backfillSectionIds()` only runs once, at `db:setup`
time, against whatever rows already exist. Every announcement created in
normal operation therefore has `section_id` **NULL** — had anything
started reading it, that read would have silently returned nothing. Do
not start migrating a third route to `section_id` without checking here
first — that would be exactly the scope creep this note exists to
prevent.

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
a `NULL` section meant a direct DB write, not an admin action.

Which sections currently have an `adviser_id` (and how many still do
not) is in Seeded baseline, not here. TCH-002 remains the assignment-less
adviser fixture — that property did not change when TCH-003 was added.
`PATCH /api/sections/:id/adviser` is how an admin assigns the rest (via
a direct API call; there is still no admin *UI* page for it, that's
Stage 4), and attendance for an unassigned section has no valid adviser
until that call lands.

### Class Board — investigated, zero code needed (extension of Feature 4)

**2026-09-06.** The school asked for a group chat so teachers would stop
answering the same question in twenty separate private messages. A group
chat was rejected deliberately: thirty parents in one thread see each
other's names and messages, the teacher becomes a moderator, and minors
are involved.

The Class Board is a section-scoped announcement instead — teacher
posts, every parent in the section reads, no parent sees another parent.
**It is NOT an eleventh feature.** It is Feature 4 (Announcements & Memo
Dissemination) with school-wide as admin-only and section-level as
teacher-capable — no change to the IPO framework or the manuscript's
feature count.

**That framing is literally true of the code, not a documentation
convenience — investigation found the existing `announcements` endpoints
in `routes/content.js` already deliver every stated behaviour, unchanged:**

- `POST /api/announcements` already requires a teacher to name an exact
  `target_grade` + `target_section`, checked against `teacher_assignments`
  via `resolveAnnouncementTarget()`/`teacherHasAssignment()` — a teacher
  with no assignment there gets `403` naming it.
- `GET /api/announcements`' parent branch already returns school-wide
  posts (`target_grade IS NULL`) plus posts targeting the child's own
  section, resolved via `getStudentClass(req.user.student_id)`.
- `authorize('teacher', 'admin')` on `POST /` already excludes parents
  from posting.
- **No endpoint anywhere exposes a section roster to a parent** —
  `GET /api/students` is `authorize('teacher', 'admin')` only, so there
  is no roster to leak. This isn't a Class-Board-specific guard; it holds
  system-wide, which is why it costs nothing to satisfy.

**Net result: zero new endpoints, zero changes to `routes/content.js`,
zero changes to its 47 passing tests.** See the "sections table" note
above for the one thing this investigation corrected (the `section_id`
reservation) and BUILD ORDER for how this is recorded there.

**Three decisions recorded from this investigation, not left implicit:**

- **Parents never reply — permanently, not "not yet."** A reply visible
  to the section recreates the group chat that was rejected in the first
  place. A reply visible only to the teacher is structurally identical to
  a private message — same volume, same moderation burden — just arriving
  through a second, parallel inbox, which fragments "where do I talk to
  the teacher" into two systems instead of one. The Messages module is
  already the correct, existing channel for a question about a post.
  Class Board's entire value is that it is one-way; preserving that is
  the point, not a limitation to revisit later.
- **No new column or flag.** A Class Board post is identified by its
  shape alone — teacher-posted, with both `target_grade` and
  `target_section` set — not by a dedicated marker. Distinguishing it
  visually from other teacher announcements is a Stage 4 rendering
  decision, not a schema one.
- **No link back to the originating message.** A `source_message_id`
  column would turn "reduce repeated private messages" into "build a
  provenance trail" — a different, larger feature nobody asked for.
  Deliberately omitted.

**BUILT 2026-09-07 — and there is deliberately no "Class Board" affordance in
the UI.** `client/src/pages/teacher/AnnouncementsPage.jsx` is the Class Board.
The reasoning that settled it: a Class Board post is defined by its SHAPE
alone (teacher-posted, both `target_grade` and `target_section` set), and a
teacher's ONLY legal target is an exact section — school-wide and whole-grade
are both admin-only, `403`. **So every announcement a teacher posts is already
a Class Board post**, and a separate control would offer a choice that does not
exist. The compose form names the audience instead of a feature: *"Parents of
this section will see this post."* Consequence: the term "Class Board" appears
nowhere on screen, which is intended — inventing a UI concept for something
mechanically identical to "your announcement" would recreate the
eleventh-feature framing this project avoided.

**THE LATER "Post to class" FROM MESSAGES PRE-FILLS THIS FORM. Do not build a
second composer.** That dispatch needs no new endpoint, no new field and no new
page — it navigates to the announcements page with `content` populated and the
section preselected. Recorded here and in the page's own header comment so the
Messages dispatch finds the decision already made.

**"Post to class" is a Stage 4 UI note, not a backend item.** A teacher
answering a private message who notices the question repeats needs
nothing new from the API: the UI pre-fills the announcement composer
from the reply's text and calls the existing `POST /api/announcements`,
scoped exactly like any other announcement. No endpoint, no field, no
linkage — see Stage 4 in BUILD ORDER.

### React web app — Stage 4 foundation built, primitives frozen

`client/` builds clean (`npm run build`) and lints clean (`oxlint`, two
pre-existing `AuthContext.jsx` warnings aside). The auth slice still holds;
on top of it the Stage 4 foundation now exists: role-aware `Shell` with
nested layout routes, seven shared UI primitives, and a dev-only component
gallery at `/dev/ui`. **Teacher and Parent feature pages now exist** —
Teacher: Attendance, Students (+ detail), Excuse Letters, Announcements,
Memos, Events, Messages (+ thread), Grades (view + encode). Parent:
Grades, Announcements, Memos, Events (all read-only). See STAGE 4 FRONTEND
CONVENTIONS below for what every one of them inherits. (This line used to
read "no feature page has been built yet" and stayed that way through five
dispatches; corrected 2026-09-07.)

Auth round-trip re-verified after the foundation landed: admin login
(`ADMIN001` / `Admin@2026`) redirects to `/admin`; a wrong password shows
an inline error without leaving the login page; a pending parent account
shows the approval-pending message inline; refreshing a logged-in session
shows the loading spinner with no login-page flash.

```
client/src/
  api/axios.js            Bearer interceptor; mandatory unwrap on success; 401-only redirect
  api/extractError.js     { success:false, message } -> string, with an offline case
  format/grade.jsx        GradeValue + GradeLegend — the NULL-grade rule. First
                          consumed by a feature page on 2026-09-07 (Parent →
                          Grades); see Finding C there for the one state it has
                          no branch for (a descriptive A–E letter)
  layout/Shell.jsx        role-aware sidebar, <Outlet/>, page title; exports NavItem
  layout/nav.js           NAV_BY_ROLE — the built / blocked / unbuilt flags
  layout/usePageTitle.js  detail pages override the nav-derived title
  components/             DataTable, Modal, FormField, StatusBadge, EmptyState,
                          ErrorAlert, LoadingSpinner
  pages/dev/UiGallery.jsx every primitive in every state — DEV builds only
  pages/teacher/          8 pages: Attendance, Students (+ detail), Excuse Letters,
                          Announcements, Memos, Events, Messages (+ thread),
                          Grades (view + encode, one page)
  pages/parent/           4 pages, all READ ONLY: Grades, Announcements, Memos,
                          Events. Every write on all four routers is
                          teacher/admin-only, so a parent gets
                          `403 "Access denied."` from the middleware — no
                          compose/edit/delete affordance exists on any of them.
                          Content: full text opens in a Modal, NOT a detail
                          route, because no `GET /:id` exists on any of the
                          three routers. Grades: one call to
                          GET /api/grades/student/:studentId, no filters, and
                          the only page in the client that skips its request
                          entirely when `user.student_id` is null
```

`/dev/ui` is registered behind `import.meta.env.DEV` and is **verified
absent from the production bundle** (grepped for strings unique to it after
a real `npm run build`) — checked, not asserted.

---

## STAGE 4 FRONTEND CONVENTIONS — frozen 2026-09-06

The frontend counterpart to THE AUTH PATTERN IS THE TEMPLATE below. These
were settled in the foundation dispatch, against the real API, before any
feature page existed — which is the point: a convention invented by the
first page gets bent by the second. **Every Stage 4 page inherits all
seven. Do not invent a new structure.**

### 1. Unwrap — every call declares how to read the response

```js
api.get('/students', { unwrap: 'students' })              // -> the array
api.get('/grades/7', { unwrap: ['grade', 'descriptor'] }) // -> { grade, descriptor }
api.post('/backups/3/restore', body, { raw: true })       // -> the axios response
```

- **Mandatory.** A success response with neither `unwrap` nor `raw` throws.
  No inference, no "take the only key", no "singular of the path".
- **Throws when the named key is absent**, naming what was missing and what
  did come back. It never returns `undefined` — a backend rename must fail
  loudly at the call site, not render an empty table. That throw surfaces
  developer-facing text through `extractError` into an `ErrorAlert`: if a
  key is missing the page is already broken, and loud beats silent.
- **Array form** for the multi-key responses (`GET /backups` +
  `orphaned_files`, `GET /contributions/:id/records` + `contribution`,
  `GET /grades/:id` + `grade_components` + `descriptor`), so those keep the
  missing-key guard instead of dropping to `raw`.
- **`raw` is for exactly two endpoints** — `POST /api/backups/:id/restore`
  (the one place `success: true` does not mean full success; its caller
  must read `message`) and the binary `GET /api/backups/:id/download`.
  **`raw` returns the FULL axios response** — status, headers, data — not
  the body, unlike `unwrap`, which returns a value from inside the body.
  The download needs the headers for the filename. This is the one place
  the two modes hand back different levels of the response.

**Why a path-to-key map cannot work, recorded so it is not re-proposed:**
`GET /api/attendance` returns `attendance` as an **array** while
`POST /api/attendance` returns `attendance` as an **object** — same key,
cardinality varying by method. No path matcher can tell a caller which
shape arrived. Add that this API has ~30 distinct wrapper keys with no
derivable rule (`docs/API_REFERENCE.md` section 7), that paths contain
`:id` so a map needs a route matcher rather than a lookup, and that a map
duplicates API_REFERENCE.md as a second hand-maintained source of truth —
and the call site is the only honest place for this knowledge.

### 2. Errors — 401 redirects, 403 never does

- **`401`** clears the token and redirects to `/login`. Correct: the
  credential or token is genuinely dead.
- **`403` does NOT redirect, and never should.** In this API a 403 is an
  *informative refusal* carrying a reason in the body, and that reason must
  reach the user through `extractError`. Of the twenty places a 403
  originates, eighteen are route-level scope refusals and one is an
  `authorize()` role violation — for all nineteen, bouncing to `/login`
  throws away the reason and, for the role violation, re-logs the user in
  to the same refusal. The twentieth, `middleware/auth.js`'s `Account is
  not active.`, is a genuinely dead session and resolves on the next
  refresh via `AuthContext`'s `/auth/me` check. **Not string-matched** —
  matching on a message is fragile; the real fix is server-side, see OPEN
  QUESTIONS.
- **Reads out of scope return `404`** by design (anti-enumeration);
  **writes return `403`**. Two documented exceptions return `403` where a
  read would have 404'd, because a broader `GET` already exposes the
  resource: excuse-letter review (`PATCH /api/excuse-letters/:id/review`)
  and the five `:id`-keyed grades writes. A `404` there would contradict
  what `GET` already shows the same teacher.
- **Error bodies are uniform**: `{ success: false, message }` — verified
  across all **342** error responses in `server/routes/`, zero deviations.
  That is why `extractError` is reliable, and it is the one part of this
  API's response shape that *is* consistent. The success wrappers are not.

### 3. NULL grades — never a bare dash

`NULL` in Initial Grade, Final Grade or General Average means **"not yet
computable"** — not missing, not zero. Rendered as a blank, a parent reads
it as their child's grade having disappeared.

`format/grade.jsx` is the single renderer for every grade-bearing value:

| State | Renders |
|---|---|
| a number, including `0` | `0.00` / `88.05`, normal weight |
| `null`, numerical mode | `— Pending` |
| `null`, descriptive mode | `— N/A` |
| failed request | never reaches here — `DataTable`'s error state owns the frame |

**This convention is grade-specific — it does not apply to every page.**
`GradeValue` is for grade-bearing values only (Initial/Final Grade, General
Average, term grades). Other modules have their own "no value yet" concepts
that are NOT this: attendance's is "not recorded", which means nobody has
marked the student, and belongs to §5's empty/blank handling. Do not reach for
`GradeValue` to render an unmarked attendance cell.

**The label is inline text, not only a tooltip.** Tooltips are hover-only
and do not exist on touch, and the report card is the screen parents are
most likely to read on a phone — exactly the audience most likely to
misread a bare dash. The tooltip is kept for the longer explanation on
desktop; it is never the sole carrier. A real `0.00` is a real grade and
must stay visually distinct from both null states. The pending-vs-N/A split
comes from the API's own `grading_mode`, never inferred from the null
itself. Trade-off accepted knowingly: an inline word costs ~55–70px of
column width in a dense table; a bare dash plus one legend line was
rejected because it breaks the moment one table holds both reasons, which a
teacher's cross-grade-level list can.

### 4. StatusBadge — five vocabularies, one tone map, NO VERDICTS

Five status vocabularies (`users` · `attendance` · `excuse_letters` ·
`contribution_records` · grades `is_locked`) share one central status→tone
map. "Pending" means the same thing in three of them, so mapping it once is
honest. Unknown values fall back to neutral rather than throwing; a `tone`
prop overrides.

**NO VERDICT VARIANTS. No `PASSED`, no `FAILED`, no `AT RISK`, no `FOR
RETENTION` — not now, not as a convenience later.** The school stated that
absence-based failure is at teacher discretion ("possible pang makapasa"),
so **the system counts and displays, it never concludes.** A badge that
renders a verdict turns a teacher's judgment call into a system-issued fact
that a parent will read as final. This is a hard rule, not a default —
adding one requires the school to have said otherwise first.

### 5. DataTable — presentational, unpaginated, nulls last

- **Never fetches.** The page owns the request and passes
  `rows`/`loading`/`error`. Loading, error and empty render *inside* the
  table frame so no page re-implements the three-state dance.
- **No pagination.** No endpoint in this API accepts `limit`/`offset`/
  `page` — checked across every route file, zero of them read those params
  — so every list arrives whole. **Revisit trigger:** the admin
  `GET /api/users` list once real accounts exist; that is the first list
  here that could plausibly reach the hundreds.
- **Nulls sort last in BOTH directions, and the rule sits OUTSIDE the
  direction multiplier.** Handling emptiness inside the comparator and then
  multiplying by `-1` flips it to nulls-first on descending — which is the
  case that matters, since sorting a grades column descending to find top
  marks would put every ungraded row at the top. Two empties compare equal;
  `Array#sort` is stable, so they hold their incoming order.
- mysql2 returns `DECIMAL` as strings (`"90.00"`), so the comparator
  coerces numerically before falling back to `localeCompare`. The gallery
  fixture carries `87.50` **and** `100.00` for this: `0.00/87.50/90.00`
  sort identically under numeric and lexicographic comparison, so they
  cannot catch a regression — `100.00` can, being numerically largest but
  lexicographically second-smallest. Do not "tidy" either row away.

### 5b. A column showing DATABASE state must never derive from form state

**Found in browser review of Teacher → Attendance, the first Stage 4 page,
2026-09-06.** The roster had a Recorded column (what the database holds) and a
Status dropdown (what the teacher has picked). Both read the same `marks`
object — the one the dropdown writes on every change — so changing the
dropdown instantly changed the Recorded badge with nothing submitted.

**The rule:** if a column claims to show stored state, its value must come
from the last successful read, in its own piece of state, with the fetch
function as the only writer. Never from the object an input handler mutates.

**Two reasons, and the second is the serious one:**

1. Two columns that cannot disagree are one column. The Recorded column only
   earns its place if it can differ from the pending selection — that is the
   entire information it carries.
2. **The failure path is where it does damage, and the happy path hides it.**
   When a save is rejected (403, server down, network), a page wired this way
   shows the unsaved value as stored while the database still holds the old
   one. The teacher cannot see what is actually saved, cannot see what they
   are about to overwrite, and gets an error message contradicted by the very
   row it refers to. Every normal-path test passes the whole time.

**Pages this will apply to next, called out because the shape recurs:** the
grades encode screen most obviously — the stored grade and a pending edit sit
side by side there, and the stakes are higher than attendance, since a grade
that appears saved and is not affects the SF9 and promotion. Also user
management (status transitions), excuse-letter review, and contribution
payment marking.

**The mechanical tell:** search the render for the same state object the
inputs write to. In `AttendancePage.jsx` the fix was to split one `marks`
object into `marks` (selection) and `recorded` (database), with `loadRoster()`
the only writer of the second. Comments at both declarations say so.

### 5c. The LRN is half a credential, not an ordinary identifier

**A parent's `login_id` IS their child's LRN** (locked decision: parents log in
with the child's LRN, one account per student). So an LRN on screen is not just
a student identifier — it is one of the two factors of a real account.

**The rule, for every Stage 4 screen:**

- **No screen displays an LRN except to a teacher or admin acting on that
  student.** A teacher needs it to identify a learner and is authorized; nobody
  else has a reason to see it rendered.
- **No LRN goes in a URL, a query string, or an error message.** Route on
  `students.id`, never on the LRN. URLs end up in browser history, screenshots,
  shared links, and server logs; error strings end up in screenshots and bug
  reports. `/teacher/students/1` is correct; `/teacher/students/13567454` would
  put a live credential in the address bar.
- Searching *by* LRN is fine — the value is typed by an authorized user into a
  field and sent as a body/query the page controls, not published by us into a
  location that persists.

This is also why `GET /api/students` returning the full personal row on a LIST
matters more than it first appears (see the finding recorded below): it is not
only home addresses being broadcast to a roster view, it is a column that
doubles as a login id.

### 5d. Display casing is presentation only

A value may be re-cased **for display** and must never be re-cased for
storage, comparison, transmission, or matching.

- `StatusBadge` capitalises its rendered text; `toneForStatus()` keeps keying
  on `status.trim().toLowerCase()`, and the `status` prop the caller passed —
  which came straight from the API and may go straight back to it — is never
  mutated.
- `StudentDetailPage` capitalises `gender` at the point of render. The stored
  value stays `male`.
- Casing is applied **at the value, not inside a generic field renderer** —
  capitalising an address or an LRN would be wrong, so only fields whose
  stored form is lowercase by schema get it.

**Trade-off, accepted:** once rendered capitalised, a reader can no longer tell
from the screen what the literal database value is. The audience is teachers
and parents, not developers — and a developer has the API response, the schema,
and this note.

**Why this convention exists at all — a schema inconsistency deliberately NOT
normalised.** The five status vocabularies do not agree with each other in the
database, and the split is three to two:

| Vocabulary | Stored form | Capitalised? |
|---|---|---|
| `attendance.status` | `Present, Absent, Late, Excused` | yes |
| `excuse_letters.status` | `Pending, Approved, Declined` | yes |
| `contribution_records.status` | `Paid, Pending` | yes |
| `users.status` | `pending, active, rejected, inactive` | **no** |
| `students.status` | `active, inactive` | **no** |
| grades `is_locked` | not an ENUM — a boolean; `locked`/`unlocked` are invented at the call site | **no** |

**This is a decision, not an oversight.** Normalising the two lowercase ENUMs
would be a migration touching real rows — plus every route, every test fixture
and every comparison that comes with them — purely so a label looks right, and
it is the wrong trade for a cosmetic problem. §5d is how the project stops
paying for that mismatch on every screen instead: capitalise once, in the one
component that renders these values, and leave the data alone.

Practical consequence worth knowing when reading a diff: capitalising is a
**no-op for three of the six** vocabularies, and visibly changes only
`users.status`, `students.status`, and the grades lock pair.

### 5e. Confirmation follows reversibility

**Whether a write needs a confirmation step is decided by whether the API lets
it be undone — not by how important the action feels.**

Two pages already sit at opposite ends of this, and they look inconsistent
until the rule is stated:

| Page | API behaviour | UI |
|---|---|---|
| Teacher → Attendance | `POST /bulk` uses `ON DUPLICATE KEY UPDATE` — re-submitting the same section+date is a routine correction | **No confirmation.** The button reads "Update attendance" and saves immediately |
| Teacher → Excuse Letters | `PATCH /:id/review` answers `403` "already been reviewed" once the letter leaves `Pending`, and there is no un-review endpoint | **Explicit confirmation step**, naming the chosen decision back |

Opposite constraints, opposite answers. A confirmation on attendance would be
friction on a correction the system treats as normal; its absence on review
would let one misclick become permanent through the UI, undoable only by a
direct DB write.

**Confirm the specific decision, not a generic "are you sure".** The excuse
review says *"Approve this letter? This cannot be changed afterward."* — the
outcome stated back, so a teacher who selected the wrong button sees the wrong
word rather than a dialog that looks identical either way.

**A sentence of warning text is not a confirmation step.** That was considered
and rejected here: a line above the buttons is what every dismissible warning
looks like, and a teacher reviewing their fifth letter stops reading it. If the
action is genuinely irreversible, the interaction has to change, not just the
copy.

**When adding a write to any page, check the handler first**: does it reject a
second attempt, or absorb it? That answer decides the UI, and it is worth
finding in the route file rather than assuming.

**Navigation warnings follow the same family of rule: do not add ceremony
that trains people to ignore warnings.** Teacher → Grades has no
unsaved-changes guard. Every score is its own request (Add score writes
immediately; exam scores save on their own button), so there is no
accumulated draft — only unsubmitted keystrokes, which is seconds. A
warning that fires on every logout regardless of form state is one a
teacher stops reading, and then a real warning elsewhere goes unread too.
**If any page warrants this it is Teacher → Attendance**, which is a bulk
submit: a whole roster of marks can be lost in one navigation. Recorded as
an open question against that page, not work on Grades.

### 5f. Empty-state copy is derived from the filter state, never from a flag

**An empty list has several different causes, and the copy must name the right
one. Derive it from the specific filter state that produced the empty result —
never from a single boolean meaning "something is set."**

Two pages hit this in three, which is why it is a rule rather than a note.

The failure both times was one variable carrying two meanings. Teacher →
Excuse Letters had:

```js
const filtered = applied.status !== 'Pending' || applied.from || applied.to;
```

That is `true` when a narrow filter matched nothing **and** when the status is
`All` — which is the *least* narrowed state there is. So "All returned nothing
because no letters exist" and "your filter is too tight" rendered the same
message, telling a teacher to try a different filter when no filter would ever
reveal anything. The same flag also let *"Nothing waiting for review"* — a
claim about `Pending` specifically — surface under other filters.

**The shape that works:** one branch per cause, keyed on the actual applied
values.

```js
if (hasDateRange || (status !== 'All' && status !== 'Pending'))
  -> "No letters match these filters"   + a Reset action
if (status === 'Pending')
  -> "Nothing waiting for review"       (only ever here)
otherwise (status === 'All', no dates)
  -> "No excuse letters yet"            (nothing exists; no Reset offered)
```

Two properties worth keeping: **a Reset action appears only when resetting
would actually change the result** — offering it on "nothing exists" is a
dead end — and *"nothing is waiting"* becomes **structurally impossible**
outside its own filter rather than merely unlikely.

**Whether the form differs from its default is a separate question** from
which empty copy applies, so it gets its own value (`canReset`) rather than
reusing one flag for both. That conflation is what caused this.

> **Trade-off:** explicit branches mean a fourth filter requires revisiting
> them, where a flag would silently absorb it. That is the point — silently
> absorbing it is what produced wrong copy twice.

### 5g. When a live channel fails, say so — never fake liveness

**A real-time surface that dies quietly is worse than one that was never
live.** If a socket, stream or subscription drops, the UI must say so and fall
back to explicit refresh. It must not poll to disguise the gap, and it must
never keep rendering as though updates are still arriving.

Applied first in Teacher → Messages, and the rule is general: any future
real-time surface inherits it.

- `SocketProvider` exposes `connected`; `LiveStatus` renders a persistent
  *"Live updates paused — new messages will not appear on their own"* strip with
  a Refresh action, and renders **nothing** while healthy (a permanent
  "connected" badge is noise; the exception is the signal).
- **No polling fallback.** Polling every few seconds would burn requests to hide
  a state the user should simply know about, and it converts an honest "this is
  paused" into a dishonest "this is live".
- The data is never wrong, only late: the socket is a latency optimisation, not
  the delivery path. `POST /api/messages` persists before it emits, and an emit
  into an empty room is a no-op — so an offline recipient loses nothing and
  sees the message on their next fetch.

**Why this matters more here than in most apps:** a parent-teacher channel that
looks delivered and is not is the specific failure this module cannot afford. A
teacher who believes a parent has seen a message about their child, because the
UI never said otherwise, has been misled by the interface into a wrong belief
about a real conversation.

> **Trade-off:** without polling, a disconnected user sees nothing new until
> they refresh or refocus. Accepted — they are TOLD the channel is down, which
> is the difference between stale-and-honest and stale-and-lying.

**AND WHERE THE NOTICE APPEARS IS PART OF THE RULE — this was missing, and it
was missing in the same dispatch that wrote the convention.** 5g originally
said only "when a live channel fails, say so." It did not say where, so the
notice was put on the two Messages pages — the pages that own the feature —
while the unread badge that depends on the same channel sits in `Shell` and is
visible on **every** page. A teacher on Students or Grades therefore had a
badge that had silently stopped updating, with nothing to tell them: 5g's own
failure mode, one level out from where it was applied.

**The notice must appear wherever anything depending on the channel is shown,
not only on the page that owns the feature.** `LiveStatus` now renders in
`Shell`, above the routed page, so it is visible anywhere the badge is. Its
Refresh does a full reload rather than a per-page refetch, because Shell cannot
know what the routed page fetches and a Refresh that silently refreshed only
the badge would be its own small lie.

**When adding a real-time surface, ask two questions, not one:** does the UI
say the channel is down, and is it saying so everywhere something channel-fed
is rendered.

**THE INVERSE IS NOW LIVE AND IS DELIBERATELY LEFT ALONE — read this before
"fixing" it.** 5g's fix moved `LiveStatus` into `Shell`, above the routed page,
so the notice reaches every page the badge does. `Shell` renders for all three
roles and `LiveStatus` is **not** gated on anything, while `UnreadProvider` is
(`enabled={messagesBuilt}`). So as of Parent → Announcements/Memos/Events
(2026-09-07) there is a role with pages, no Messages page, no badge — and a
"Live updates paused" strip that would refer to a channel **nothing on their
screen consumes**. Verified: parent Messages is still `built: false`, so the
badge request is genuinely skipped and no count renders; only the strip is
over-broad.

**Not fixed in that dispatch, on purpose, and the reason is the convention
itself.** Gating the strip on `messagesBuilt` is a one-line change that would
be correct today and wrong the day Parent → Messages lands — at which point
somebody has to remember to ungate it, which is the same
flip-the-flag-later failure convention 6 exists to forbid. **So it belongs to
the Parent → Messages dispatch, which needs the gate removed anyway**, not to a
cleanup pass. Until then a parent may see one strip that overstates what is
paused. That is the harmless direction of this error: 5g's whole argument is
that a channel dying silently is worse than one saying so, and an over-broad
notice fails safe where an absent one does not.

### 5h. Build and lint prove the code compiles, not that the page renders

**A Stage 4 page is not done until it has been opened in a browser.** This is a
stated limit of the verification chain, not a preference.

**Two of the seven teacher pages shipped with a defect that every automated
step passed**, and both were in code that ran — so there was nothing for a
build, a lint, or a server test suite to fail on:

| Page | Defect | Why nothing caught it |
|---|---|---|
| Attendance | The Recorded column derived its value from form state, so it tracked the dropdown instead of the database (§5b) | Every request and response was correct. The bug was entirely in what was rendered |
| Messages | `useEffect` used in `Shell.jsx` without importing it — **every route for every role rendered blank** | A bundler resolves *imports*, not undefined identifiers; the reference only throws when the component renders |

**What each step actually proves:**

- `npm run build` — modules resolve and the bundle emits. It does **no** scope
  analysis of identifiers and **no** type checking, so an undefined identifier
  is invisible to it. This is not a misconfiguration; it is out of scope for a
  bundler.
- `oxlint` — the rules that are **on**. Its default category is `correctness`,
  and **`eslint(no-undef)` is available but not in it** — while
  `eslint(no-unused-vars)` IS on by default, so the linter will tell you about
  an import you stopped using but not about one you never made. That asymmetry
  is worth knowing: it caught the now-dead `useEffect` import the moment the
  hook was removed, having said nothing when the same identifier was undefined. Verified: running
  `npx oxlint -D no-undef` against the broken file reports
  `'useEffect' is not defined` at the exact line. **Not enabled in this
  dispatch, deliberately** — turning on a new rule across the whole client is
  its own change with its own fallout, and it belongs to a dispatch that can
  absorb whatever else it surfaces.
- The server test suites — the API. They never load the client.

**So the only step that proves a page renders is opening it.** Where a browser
is not available, an SSR render of the component reaches the same failure: hooks
are *called* during render even though their callbacks are skipped, so a missing
hook import throws under `renderToStaticMarkup` exactly as it does in a browser.
That is how this bug was confirmed fixed, with a negative control reproducing
the original `ReferenceError` before restoring the import.

**Practical consequence for a dispatch:** "build clean, lint clean" is a
necessary report, never a sufficient one. Say what was rendered and by whom.

**A recurring console error you can ignore — and why it is recorded rather than
fixed.** In development you will see, once per page load:

```
WebSocket connection to 'ws://localhost:5000/socket.io/?EIO=4&transport=websocket'
failed: WebSocket is closed before the connection is established.
```

**This is React StrictMode, it is dev-only, and the channel is fine.**
`main.jsx` wraps the app in `<StrictMode>`, which in development deliberately
double-invokes effects: mount → effect → cleanup → effect. `SocketProvider`'s
effect opens a socket and its cleanup disconnects it, so the first socket is
closed while its WebSocket is still in CONNECTING state — which is exactly what
the browser is reporting — and the second attempt connects normally. The
Network tab shows the signature: a first row finishing at 0 ms, then a second
at status `101` and Pending.

**Not a transport problem.** Changing `transports: ['websocket', 'polling']` to
the socket.io default would not remove it, because the cause is the aborted
first attempt, not the order transports are tried in. Verified from node that
all three orderings connect over websocket against this server.

**Not worked around either.** The provider's cleanup is correct — it must
disconnect — and StrictMode exists precisely to surface double-mount fragility.
Suppressing the message would mean fighting the tool that is doing its job.
**Falsifiable prediction, if anyone doubts it later:** it should not appear in a
production build (`npm run build && npm run preview`), because React only
double-invokes effects in development.

Recorded because an unexplained recurring console error trains people to ignore
the console — and the console is where the blank-page `useEffect` bug above
surfaced.

### 5i. Explanatory copy is a claim about behaviour

**Copy that overstates what the code does will send a reviewer chasing a bug
that does not exist.** Build and lint prove the code compiles (§5h); opening
the page proves it renders. Copy is a third claim, and it is checked the
same way: against the code, not against the intention.

Found in browser review of Teacher → Grades (2026-09-07). The page said
*"picking a subject you do not teach will mark it here."* The code marks
the subject only after Record/Edit fires a `POST /` 403. Selecting Science
loaded the roster (view-scope GET, 200) with Record still enabled, which
read as a defect. It was not — the interface had described a behaviour it
did not have.

**The rule:** if a sentence tells the user what will happen, the handler
behind that control must actually do it. Tightening copy is the fix when
the behaviour is already the honest one. Do not add a probe write to make
the copy true.

### 6. Nav — three states, and flipping the flag is not a follow-up

`layout/nav.js` is the single source of per-role navigation. Three states:

- **built** — a live `NavLink`.
- **blocked** — `blocked: '<reason>'`, rendered muted with the reason as
  its tooltip. A stronger claim than unbuilt: the page *cannot be designed
  yet* because an external question is unanswered. Takes precedence over
  `built`. Currently exactly one: **Parent → Attendance**, blocked on the
  attendance rate formula. Teacher attendance encoding is **not** blocked.
- **unbuilt** — `built: false`, dimmed and non-clickable so it cannot drop
  the user into the catch-all redirect.

**A badge renders only on a BUILT item.** The Messages unread count lives on
the nav item in `Shell.jsx`, which renders for all three roles — so once it
existed it would have appeared on Parent and Admin too, both of which are
`built: false` today. A count on a dimmed, unclickable entry is worse than no
count: it announces something the user cannot go and read. `useUnreadMessages`
therefore skips the request entirely unless that role's Messages item is built.

**Live today for TEACHER only.** Parent and Admin get the badge automatically
the day their Messages pages land and their `built` flags flip — no change to
`Shell.jsx` is needed, and neither dispatch should build its own badge or
wonder why one is missing.

**FLIPPING `built: false` TO `true` IS PART OF WHICHEVER DISPATCH ADDS THAT
PAGE'S ROUTE — never a follow-up, never a cleanup pass.** A live route
behind a dimmed nav item is invisible; a flipped flag with no route is a
dead link. They land together or not at all.

### 7. FormField — four shapes, and only four

```
1. <FormField label="Name" placeholder="…" />                      -> <input>
2. <FormField label="Remarks" as="textarea" rows={3} />             -> <textarea>
3. <FormField label="Status" as="select">{options}</FormField>      -> <select>
4. <FormField label="Range" render={({ id, describedBy }) => …} />  -> custom
```

`children` are the children *of the rendered control*, which is what makes
shape 3 work — a `<select>` needs both `as` and children. They are
forwarded only when `as !== 'input'`, because `<input>` is a void element
and React throws if given children. Shape 4 is the escape hatch and
receives a **single object**, not positional arguments, so adding a third
piece of wiring later is not a breaking change at twenty call sites.

### Corrections — three claims retired here

These circulated in planning and are **wrong**. None of them ever appeared
in this file or `docs/PROJECT_PROGRESS.md` — searched, zero hits — so there
was nothing to delete. They are recorded here so they cannot be re-derived
from memory.

- **"The first screen builds the shared components," and the ~5h / 2–3h
  estimate derived from it.** Wrong sequence. **The primitives were built
  in the foundation dispatch, before any feature page**, precisely so they
  are shaped by the design system rather than by one page's needs. The
  estimate that depended on the old sequence is **void, and is not being
  replaced with another guess — it is pending real measurement from the
  first feature page (Teacher → Attendance).**
- **"Backend is 100% complete."** Replace with: *"Ten backend modules
  complete, 76 endpoints, tests passing. One gap identified
  (`GET /api/messages/contacts`) and an audit scheduled."*
- **"36 screens."** Always an estimate, never a count. The real figure is
  **75 role-facing views** — 33 nav items plus 42 detail/sub views (Teacher
  23, Parent 19, Admin 33) — behind **~45–50 distinct implementations**,
  since the report card, the message thread and announcement/memo/event
  detail are one screen serving three roles, and grade encode,
  excuse-letter review, contribution roster, student detail and attendance
  history are each shared between teacher and admin. **The counting rule,
  recorded so the figures are reproducible:** a substantive form counts as
  a view whether it ends up a route or a modal; a bare "are you sure?"
  confirm does not. Without the rule the next session produces a third
  number. The old ~13-day web estimate derived from 36 is **void**.

### MEASURED BUILD TIME — one data point, and read the caveats first

**Teacher → Attendance, 2026-09-06: 3 minutes 14 seconds** wall-clock from
PLAN APPROVED (21:48:20) to the implementation verified working (21:51:34).

**This number is one data point, not a rate — and it does not measure the
same thing the void ~13-day estimate measured.** Cite all four caveats with
it or do not cite it:

1. **It is agent execution time, not developer-hours.** The void estimate
   was human working days. The two are not convertible, and dividing 75
   views by this figure would be meaningless.
2. **It excludes all planning and review.** Two full PLAN ONLY rounds, the
   scope-gap investigation this page triggered (which became two separate
   backend dispatches), and Darryl's review time all sit outside the clock.
   On this page, planning and review substantially exceeded implementation.
3. **It excludes browser verification — and browser review then found a
   real bug.** The flow was verified by driving the page's exact API call
   sequence end to end for both adviser accounts (sections, roster,
   pre-fill, bulk submit, re-submit-as-update, future-date rejection), not
   by clicking through the UI. **That agent verification passed. Darryl's
   browser review afterward found the Recorded-column defect now recorded
   as convention §5b** — a defect no API-level check could have caught,
   because every request and response involved was correct; the bug was
   entirely in what the page rendered. **So the 3m14s figure must not be
   read as "verified working" — it is time-to-agent-verified, and the step
   that caught the actual bug happened after the clock stopped.** Fixing it
   took a further round of plan, fix and re-verify that is not in the
   number.
4. **It is the most favourable possible case.** All seven primitives, the
   unwrap convention, the date helper's precedent and the error handling
   already existed, and the API was already proven end to end. A page that
   needs a new primitive, or runs into an unanswered school question, will
   not look like this.

**Second data point — Teacher → Students, 2026-09-07: 1 minute 24 seconds**
(00:48:38 → 00:50:02), same four caveats.

**Two points are still not a rate, and these two are not even comparable to
each other — which is the more useful observation than the numbers.**
Attendance introduced a shared date helper, a write path, bulk submission and
pre-fill-plus-update semantics. Students is read-only against two endpoints
already exercised by other work, with no new helper and no state to reconcile.
The second page being faster says almost nothing about a trend and everything
about the two pages differing in kind. Recording them side by side, not as a
series.

**Third data point — Teacher → Excuse Letters, 2026-09-07: 2 minutes 28
seconds** (01:15:17 → 01:17:45), same four caveats.

All three, with what each actually involved — the composition matters more
than the number:

| Page | Time | What it involved |
|---|---|---|
| Attendance | 3m14s | New shared date helper, a write path, bulk submit, pre-fill + in-place update |
| Students | 1m24s | Read-only, two endpoints already exercised, no new helper |
| Excuse Letters | 2m28s | First write **form**, a modal with a confirmation step, client-side permission prediction, three fixtures created and cleaned up |

**Three points are still not a rate.** They do not even trend: the pages differ
in kind more than they differ in size, and the ordering (3m14s, 1m24s, 2m28s)
tracks what each page had to build rather than any learning curve. Recording
what each involved alongside the number is the only way these stay honest —
a bare series would invite exactly the projection they cannot support.

**Fourth data point — Teacher → Announcements, Memos and Events, 2026-09-07:
3 minutes 36 seconds** (06:42:46 → 06:46:22), same four caveats — **and this
one is not comparable to the other three at all, because it is three pages.**

| Dispatch | Time | What it involved |
|---|---|---|
| Attendance | 3m14s | 1 page. New date helper, write path, bulk submit, pre-fill + in-place update |
| Students | 1m24s | 2 views. Read-only, endpoints already exercised, no new helper |
| Excuse Letters | 2m28s | 1 page. First write form, modal with confirmation, permission prediction, 3 fixtures |
| Announcements/Memos/Events | 3m36s | **3 pages** + a new shared hook. Two compose forms with different targeting models, one read-only page, two delete confirmations |

**Four points, and dividing by page count would be the wrong move** — the
dispatch that produced three pages did so because two of them shared a hook and
the third had no form at all, not because pages got cheaper. The composition
column is the part worth reading; the minutes are close to noise.

**Fifth data point — Teacher → Messages, 2026-09-07: 4 minutes 4 seconds**
(12:49:13 → 12:53:17), same four caveats, and again not comparable: this is the
first dispatch to add a **transport** rather than another CRUD surface.

| Dispatch | Time | What it involved |
|---|---|---|
| Attendance | 3m14s | 1 page. New date helper, write path, bulk submit, pre-fill + in-place update |
| Students | 1m24s | 2 views. Read-only, endpoints already exercised, no new helper |
| Excuse Letters | 2m28s | 1 page. First write form, modal with confirmation, permission prediction, 3 fixtures |
| Announcements/Memos/Events | 3m36s | 3 pages + a shared hook. Two compose forms, one read-only page |
| Messages | 4m4s | 2 views + **the first Socket.io client, the first new runtime dependency, and the first shared-layout change** |

**Five points, and still not a rate.** Every dispatch has differed in kind from
the ones before it — read-only, then a write form, then three pages, then a
transport. The composition column is the part worth reading; the minutes track
what each dispatch had to build, not any learning curve.

**Sixth data point — Parent → Announcements, Memos, Events, 2026-09-07:
13 minutes 14 seconds** (15:40:35 → 15:53:49). **The jump is real and it is
not about the pages — it is the first dispatch measured with convention 5h's
render proof inside the clock.**

5h ("build and lint prove the code compiles, not that the page renders") was
written at the END of the Messages dispatch, after its 4m4s had already been
recorded. So all five earlier points were measured under a verification
standard that did not yet include an SSR render check, a negative control for
it, or the discipline of proving the check could fail. This one is.

| Dispatch | Time | What it involved |
|---|---|---|
| Attendance | 3m14s | 1 page. New date helper, write path, bulk submit, pre-fill + in-place update |
| Students | 1m24s | 2 views. Read-only, endpoints already exercised, no new helper |
| Excuse Letters | 2m28s | 1 page. First write form, modal with confirmation, permission prediction, 3 fixtures |
| Announcements/Memos/Events | 3m36s | 3 pages + a shared hook. Two compose forms, one read-only page |
| Messages | 4m4s | 2 views + the first Socket.io client, first new runtime dependency, first shared-layout change |
| **Parent** Announcements/Memos/Events | **13m14s** | 3 pages, all read-only, zero new primitives or helpers — **and the first 5h render proof, its negative control, 35 live API checks across 9 fixtures, and a DB-mutating unlinked-parent test with restore** |

**The composition column has now stopped being optional reading.** Judged on
what was BUILT, this is the cheapest dispatch of the six: three read-only
pages, no new primitive, no new helper, no new dependency, no write path, no
shared-layout change. Judged on the clock it is the most expensive by a factor
of three. Both are true, and the gap is entirely verification.

**Do not read this as "pages got slower."** The honest reading is that the
earlier numbers measured less work than the same convention now requires, so
**the five points before this one are not comparable to anything measured from
here on** — which is a stronger statement than the "not a rate" caveat that has
accompanied every point so far. If a seventh point is wanted for comparison,
this is the baseline, not Messages.

**Seventh data point — Parent → Grades, 2026-09-07: 37 minutes 26 seconds**
(18:18:19 → 18:55:45). **Read the split before reading the number: roughly 24
minutes was agent work and roughly 13 minutes was the clock running while the
dispatch sat idle waiting for browser-review replies.**

That idle time is not padding to be excused away — 5h says a page is not done
until it has been opened, this page was opened three times in three different
data states, and each round trip is real elapsed time the dispatch cannot
proceed through. But it is a **different cost** from either building or
verifying, and it scales with how many states need a human eye rather than with
how much code was written. The sixth point had one browser state; this one had
three, because the interesting states are data states (populated card, partial
card with `Pending` cells, unlinked account) and only a DB mutation between
reloads can produce them.

| Dispatch | Time | What it involved |
|---|---|---|
| Attendance | 3m14s | 1 page. New date helper, write path, bulk submit, pre-fill + in-place update |
| Students | 1m24s | 2 views. Read-only, endpoints already exercised, no new helper |
| Excuse Letters | 2m28s | 1 page. First write form, modal with confirmation, permission prediction, 3 fixtures |
| Announcements/Memos/Events | 3m36s | 3 pages + a shared hook. Two compose forms, one read-only page |
| Messages | 4m4s | 2 views + the first Socket.io client, first new runtime dependency, first shared-layout change |
| **Parent** Announcements/Memos/Events | **13m14s** | 3 pages, all read-only, zero new primitives or helpers — and the first 5h render proof, its negative control, 35 live API checks across 9 fixtures, and a DB-mutating unlinked-parent test with restore |
| **Parent** Grades | **37m26s** (~24m agent, ~13m review wait) | **1 page.** First `GradeValue` consumer, no new primitive, no new helper, no write path — and a 24-row fixture chain built through the real write API, 32 live API checks, SSR + negative control, **three browser states with two DB flips between them**, and direct-SQL teardown |

**Judged on what was BUILT this is the smallest dispatch since Students: one
read-only page consuming primitives that already existed.** Judged on the clock
it is the most expensive of the seven by a wide margin. Both are true, and none
of the gap is code.

**The thing worth carrying forward is not the minutes, it is why a report card
costs three browser states when an announcements list cost one.** Every
interesting state of this page is a state of the DATA, not of the form: an
all-`Pending` card, a card mixing real numbers with `Pending`, a populated
General Average, and an unlinked account are four different database
configurations of the same component with no input to drive them. A page with a
compose form can be walked through its states by typing; this one can only be
walked through by writing rows and deleting them. **Every remaining Parent page
has this shape** — Grades, Attendance, Contributions and Excuse Letters are all
read-only views of teacher-authored data — so expect the fixture-and-flip cost
to recur rather than treating this as an outlier.

**Eighth data point — Teacher → Grades, 2026-09-07: 20 minutes**
(22:04 PLAN APPROVED → 22:24 verified). **Almost all agent work; no
browser-review wait in this window.** Same four caveats, and still not a
rate: this is the first Stage 4 page that both views and writes grades,
against nine endpoints, with dual-mode encoding and no client-side
computation.

| Dispatch | Time | What it involved |
|---|---|---|
| Attendance | 3m14s | 1 page. New date helper, write path, bulk submit, pre-fill + in-place update |
| Students | 1m24s | 2 views. Read-only, endpoints already exercised, no new helper |
| Excuse Letters | 2m28s | 1 page. First write form, modal with confirmation, permission prediction, 3 fixtures |
| Announcements/Memos/Events | 3m36s | 3 pages + a shared hook. Two compose forms, one read-only page |
| Messages | 4m4s | 2 views + the first Socket.io client, first new runtime dependency, first shared-layout change |
| **Parent** Announcements/Memos/Events | **13m14s** | 3 pages, all read-only — first 5h render proof inside the clock |
| **Parent** Grades | **37m26s** (~24m agent, ~13m review wait) | **1 page.** First `GradeValue` consumer, 24-row fixture chain, three browser states |
| **Teacher** Grades | **20m** | **1 page.** View + encode, numerical and descriptive, no client IG preview, session-memory for encode 403s, two throwaway students SQL-torn down |

**Do not replace the void estimate with a projection derived from these.**
The old estimate is void, these dispatches have differed in kind more than
in size, and a range would need several more that differ less from each
other than these do.

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

### Grades module — fully built: schema, real curriculum, the full write path, and viewing (G1a, G1b, G2a–G2e, G3)

Full policy detail lives in `docs/GRADING_SPEC.md` (DO 015 s. 2026 +
DO 009 s. 2026 + school-visit findings). This section tracks build state
only — read that file for the actual grading rules.

**Stage G1a is done (2026-09-05): the schema is now correctly shaped.**
This was a plan-then-approve dispatch (7 design questions answered before
any file was touched) followed by a second approval that **split the
original single-stage plan in two**, specifically because two parts of
it had a real problem the rest didn't: re-seeding `subjects` cascades
(`ON DELETE CASCADE`) through `teacher_assignments` and would destroy
TCH-001's three seeded assignment rows, and Grade 4's learning areas are
still unconfirmed with the school. Everything else had neither problem,
so it shipped without waiting on either:

- **`grade_weight_configs`** dropped and recreated, re-keyed to
  `(subject_id, school_year)` — not grade band — with `ww_weight` /
  `pt_weight` / `ex_weight` (renamed from `quiz`/`activity`/`exam` to
  match DO 015's actual terms) and a `CHECK` that the three sum to
  100.00. **Seeded against the CURRENT `subjects` rows, which are
  themselves still the old uniform placeholder list — this weight seed
  is provisional until G1b re-seeds `subjects` and this table together.**
  `subjects` and `teacher_assignments` were **not touched** in this
  stage — see G1b below.
- **`grades`** dropped and recreated: `quarter ENUM('Q1'-'Q4')` →
  `term TINYINT CHECK (term BETWEEN 1 AND 3)` (matches this schema's own
  convention for small bounded integers elsewhere — `grade_level` uses
  the same shape — rather than continuing the one ENUM outlier). Gained
  `ww_percentage`/`ww_weighted`, `pt_percentage`/`pt_weighted`,
  `ex_st1`/`ex_st2`/`ex_te`/`ex_percentage`/`ex_weighted`,
  `initial_grade`, `term_grade`, and `descriptive_grade`. **Dual-mode by
  design**: exactly one of `term_grade` (numerical) or
  `descriptive_grade` (Grade 1, letter) is ever populated on a row —
  which one is decided by `grading_mode_configs` at *write* time, but at
  *read* time no lookup is needed at all, since whichever column is
  non-NULL already tells you the mode the row was written under. This is
  stated as a comment directly on the table for exactly one reason: a
  future session seeing two mutually-exclusive nullable columns might
  "clean up" by dropping one or merging them — don't; the KS1 rollout
  (see `grading_mode_configs` below) means both shapes stay live
  indefinitely, not as a transitional oddity. Final Grade (3-term
  average) and General Average (average across subjects) are **not
  columns anywhere** — both are pure aggregates of already-stored
  `term_grade` values, computed at read time when Stage G3 is built, not
  materialized.
- **`grade_components`** dropped and recreated: `type ENUM('quiz',
  'activity')` → `ENUM('WW', 'PT')` only. **Deliberately no `'formative'`
  value** — DO 015 is explicit that formative assessments never feed
  computation; if they're ever tracked at all, that's a separate,
  unlinked table, not a third enum value here. EX's three sub-scores
  (ST1/ST2/TE) do **not** live here as child rows — see the next point.
- **EX composite — decided as three dedicated columns on `grades`
  (`ex_st1`/`ex_st2`/`ex_te`), not child rows in `grade_components`.**
  This was one of two genuinely open design questions in the whole
  dispatch (posed directly by `docs/GRADING_SPEC.md` §3: "decide before
  building"). WW/PT are "N raw scores → one average," which is exactly
  what a child table + aggregation is for. EX is a fixed, positional,
  government-formula triple that never grows a fourth part — "is this
  exam complete" is a `NOT NULL` check on the row itself with dedicated
  columns, versus a child-table query with the enum approach. Confirmed
  and locked — do not revisit without a reason.
- **`transmutation_table`** (new) — seeded with all 41 rows from
  GRADING_SPEC §5, `school_year = '2026-2027'` only. Verified gap/overlap-
  free across the full 0.00–100.00 range at 0.01 precision by
  `scripts/verify-grading-seed.js` (see Files that exist), including the
  exact boundary case the spec calls out explicitly: IG 70.00 → TG 75,
  IG 69.99 → TG 74. **Disappears without a code change**: the lookup is
  `WHERE school_year = ? AND ig_min <= ? AND ig_max >= ?`; when SY
  2027–2028 has no seeded rows, the query returns nothing, and the
  application (once G2 is built) reads "no row" as "use the Initial
  Grade directly, zero-based grading" — the *data's* absence drives the
  behavior change, never a hardcoded year comparison in code.
- **`grading_mode_configs`** (new) — one row per `(grade_level,
  school_year)`, seeded for SY 2026-2027 per Table 12: Grade 1
  `descriptive`, Grades 2–6 `numerical`. A dedicated table, not a
  `system_settings` key — that table's flat allow-listed key-value shape
  can't express a per-grade-per-year lookup cleanly without inventing
  composite key strings.
- **The other genuinely open design question — how Grade 1 computes a
  letter grade — turned out to have no answer anywhere in
  `docs/GRADING_SPEC.md` at all**, not even implicitly: there is a full
  41-row numeric transmutation table, but zero threshold mapping an
  Initial Grade to a letter. **Resolved as: Grade 1 is a manual teacher
  judgment call.** The teacher picks A–E directly; WW/PT/EX stay
  informational for Grade 1 and do not compute into a letter. Reasoning
  confirmed by the school: DO 015 introduces descriptive grading
  specifically to avoid numerical labeling in KS1 — computing an IG and
  then transmuting it to a letter would be numerical grading wearing a
  letter costume. The school's own Grade 1 Oral Reading Progress Chart
  is purely observational (no percentages), and no academic awards exist
  in KS1 (see GRADING_SPEC §7), so nothing needs a rankable number
  either. **The school has been asked to confirm this directly — if the
  answer comes back different, it changes one write handler in Stage G2,
  not the schema.** Designed for manual now; do not build automatic
  IG→letter computation without a confirmed threshold table.
- **`current_quarter` → `current_term`, `routes/settings.js`.** The old
  validator read `grades.quarter`'s ENUM live via `INFORMATION_SCHEMA`,
  specifically because the quarter-vs-term question was provisional when
  it was written. DO 009 s. 2026 has since settled that as a DepEd fact,
  not a placeholder — and `grades.term` is a `TINYINT + CHECK` now, not
  an ENUM, so there's nothing left to introspect. Replaced with a
  hardcoded `['1', '2', '3']`. This touched code outside the Grades
  tables themselves (`routes/settings.js`,
  `scripts/test-settings-flows.js`) but was folded into G1a rather than
  a separate dispatch, since the rename would have broken `test:settings`
  the moment `grades.term` replaced `grades.quarter` regardless.
- **GA (General Average) — deprioritized, not decided against.** The
  computation chain names it as a defined step, but Awards (its only
  consumer so far) are out of scope for the current build. Compute it at
  read time in Stage G3 if time allows; do not build for it as a
  priority.
- Item-count caps (Summative Tests: 20 items max for Grades 4–6) and
  `is_locked`'s trigger/actor are both **documentation-only for now** —
  not validated in code, not automated. Confirmed acceptable scope for
  this stage.

**Stage G2a is done (2026-09-05): the arithmetic itself, in isolation,
before any route existed to call it.** Also a plan-then-approve dispatch
(9 questions covering row creation, the exact recompute logic, scoping,
the descriptive-mode gate, edit/delete/lock behavior, staging, and
ambiguities) — one finding from that plan pass fed back into the schema
before any G2 code was written:

- **Schema correction to `grades`, folded into G2a rather than shipped
  as G2a's own bug:** the G1a design stored only `ex_percentage` for the
  Examinations composite, derived from `ex_st1`/`ex_st2`/`ex_te` treated
  as already-computed percentages. That silently broke the symmetry
  G1a's own reasoning was built on — WW and PT retain every raw score via
  `grade_components`, but EX would have retained nothing: a parent asking
  "what did my child score on ST1" could never be told the raw number,
  and a wrong `max_score` could never be corrected once the source was
  gone. Fixed before Stage G2a wrote anything against the old shape:
  `ex_st1`/`ex_st2`/`ex_te` now hold the **raw score**, with three new
  columns — `ex_st1_max`/`ex_st2_max`/`ex_te_max` — holding each
  sub-test's max. `ex_percentage` stays a *derived* value, computed at
  write time from these six raw columns, not the source of truth. Still
  0 rows in `grades` at the time of this fix, so this was a plain
  in-place `CREATE TABLE` edit via the next `db:setup`, not a live
  migration.
- **`utils/gradeComputation.js`** — pure functions only, no DB or HTTP:
  `componentPercentage()` (WW/PT), `subTestPercentage()` (one EX
  sub-test), `exPercentage()` (the 30/30/40 composite), `weighted()`,
  `initialGrade()`, `roundTo2()`. Every function returns `null` on any
  missing required input — confirmed as "the single most important
  decision in the module": an Initial Grade computed from only WW, with
  PT and EX still empty, would look like a real (likely failing) grade
  to a parent, so it must never be a partial number.
- **Rounding: half-up, to 2 decimals, at every stored step — not
  half-to-even, and not carried at higher precision between steps.**
  Confirmed reasoning: a parent must be able to check the math by hand
  and have it come out; displayed math that doesn't add up destroys
  trust faster than a hundredth of a point of precision ever would.
  `roundTo2()` uses a `Number.EPSILON` nudge specifically to correct
  IEEE 754 representation error at exact `.005`-style boundaries (e.g.
  `1.005` is stored fractionally below that value in binary floating
  point; the naive `Math.round(1.005 * 100) / 100` gives `1.00`, not the
  mathematically correct `1.01`).
- **Percentages over 100% (bonus points) are deliberately NOT clamped**
  anywhere in `gradeComputation.js`. Neither `GRADING_SPEC.md` nor DO 015
  mentions a bonus-points cap, and the pure computation layer has no way
  to distinguish a genuine bonus score from a data-entry mistake (e.g.
  `105`/`100` meant to be `10.5`/`100`) — clamping would be inventing a
  grading policy that doesn't exist. If a cap is ever wanted, it belongs
  in route-level validation (`score <= max_score`) as an explicit policy
  decision, not silently buried in the arithmetic.
- **Scoping decided for G2, not yet built:** grade encoding is
  authorized via `teacher_assignments` (`teacher_id` + `subject_id` +
  `grade_level` + `section`), matching `students.section`/
  `teacher_assignments.section` (VARCHAR) — confirmed against CLAUDE.md's
  own "sections table" rule that `section_id` is reserved for exactly two
  routes (attendance, the not-yet-built Class Board), neither of which is
  Grades. This is a **second, separate scoping authority** from
  `sections.adviser_id` (attendance, excuse-letter review) — deliberate,
  not an inconsistency, since DepEd assigns grade encoding to the subject
  teacher, not the adviser.
- **`404` on `:id`-keyed writes (components/exam/descriptive), `403` on
  `POST /api/grades`** — decided, not yet built (no route exists yet).
  This deliberately differs from Excuse Letters' `PATCH /:id/review`,
  which chose `403` for an out-of-scope-but-can-read teacher specifically
  because an existing `GET` endpoint already showed them the letter. G2
  has no `GET /api/grades` at all yet — nothing else in the system lets a
  teacher see a grade row they can't encode, so `404` is a true "cannot
  see this" signal here, same as `PUT /api/attendance/:id`. **Marked
  explicitly provisional**: if Stage G3 ever gives teachers broader read
  access to grades than their subject-specific encode-scope, this needs
  the exact same reconsideration Excuse Letters got.
- **A missing `grading_mode_configs` row is a hard error, not a silent
  default** — decided as `409` naming the gap, not `500`, so it reads as
  a configuration problem an admin can fix, not a crash.
- **Two endpoints added to G2's scope that weren't in the original
  intended list**, both confirmed rather than silently built or silently
  declined: component edit/delete, and `PATCH /:id/lock` (admin-only) —
  without a lock toggle, `is_locked` is a guard that can never fire.
  Deferred to sub-stage **G2e**, not built in G2a.
- `npm run test:grade-computation` — 29 passing, direct-call, no
  server/DB, confirmed twice (deterministic — pure functions, nothing to
  re-run for idempotency in the usual sense). Full regression across the
  other thirteen suites afterward: all unchanged from their prior counts
  (auth 25, students 30, sections 30, attendance 38, content 47,
  contributions 38, settings 26, users 39, backups 39, sanitize 9,
  messages 39, restore 22, excuses 56), plus `verify-grading-seed.js`
  still 11/11 — confirms the `grades` schema correction didn't leak
  outside the Grades tables.
- **No routes, no `server.js` change, no HTTP anywhere in G2a** — by
  design. `routes/grades.js` still does not exist. Stages G2b (creation)
  through G2e (edit/delete/lock) remain.

**Stage G2b is done (2026-09-05): `routes/grades.js` exists for the first
time — `POST /api/grades` only, creating a shell row (every score/
computed column `NULL`, `is_locked 0`). No computation runs here at all;
`utils/gradeComputation.js` is not imported by this file.** Another
plan-then-approve dispatch (8 questions: validation order, whether a
grading-mode check belongs here, response shape, the subject-vs-section
403 distinction, whether `subjects`' still-wrong seed data complicates
anything). One finding became the load-bearing design decision, not
mine to skip past:

- **Scoping is the subject teacher's, via `teacher_assignments`
  (`teacher_id` + `subject_id` + `grade_level` + `section`, all four) —
  a second, deliberate scoping authority alongside `sections.adviser_id`
  (attendance, excuse-letter review).** Narrower than `students.js`/
  `content.js`'s own `EXISTS` pattern, which only checks grade+section:
  a teacher assigned to teach Math for a section cannot encode a Science
  grade for the same section's students. Uses `students.section`/
  `teacher_assignments.section` (VARCHAR), never `section_id` — checked
  directly against CLAUDE.md's own "sections table" rule rather than
  assumed.
- **Validation order is security-motivated, not just "does it work":**
  the subject/student-grade-level mismatch check (`subjects.grade_level
  !== students.grade_level`) runs *after* scope is resolved for a
  teacher, never before. Checking it earlier would let an unauthorized,
  out-of-scope teacher learn a real student's actual grade level just by
  probing with a deliberately wrong `subject_id` and reading the
  resulting `400` message — exactly the enumeration the collapsed `403`
  below exists to prevent. Stated as an explicit comment at the check
  itself in `routes/grades.js`, specifically so a future session
  reordering it "for efficiency" doesn't silently reopen the leak.
- **Admin/teacher status-code asymmetry, read from `attendance.js`'s
  actual precedent rather than a flatter "POST → 403" rule:** a
  nonexistent `student_id` is `404` for admin (a plain lookup failure)
  but `403` for a teacher, collapsed with "exists but out of scope" into
  one message — a teacher probing student ids can't tell which failed.
  Tested explicitly as its own named property (`test-grades-flows.js`:
  "Teacher with a nonexistent student_id gets 403, NOT 404"), not just
  incidentally covered, since a careless refactor could silently
  reintroduce the leak by "simplifying" both roles to the same status.
- **`subject_id` nonexistent → `400`, not `404`**, checked before the
  student is even loaded, identically for both roles — subjects are
  unscoped reference data, so this leaks nothing role-sensitive.
- **The out-of-scope message names the subject specifically** (the
  teacher supplied it themselves, so echoing `subject.name` back leaks
  nothing) **but stays generic about grade/section** (a real student's
  grade and section are not that teacher's to learn just by probing).
- **No `grading_mode_configs` consultation anywhere in this endpoint** —
  confirmed, not just assumed: a Grade 1 shell row and a Grade 5 shell
  row are structurally identical at creation, since nothing mode-specific
  is written until G2c/G2d.
- **Response is the bare `grades` row, no join** to student/subject
  names — matching every other create-endpoint in this codebase
  (`students.js`, `attendance.js`, `excuses.js` all return the bare row
  they just wrote).
- `school_year` validated with the same regex + consecutive-year check
  as `routes/settings.js`'s `validateAcademicYear`, **duplicated locally
  in `routes/grades.js`, not extracted into a shared util** — this is
  only the second place the check exists; extraction is deferred to a
  third occurrence, matching `utils/dateFormat.js`'s own precedent.
- **`subjects`' still-wrong placeholder seed data (G1b not done) neither
  breaks nor complicates this endpoint or its tests** — every placeholder
  row still carries a real, correct `grade_level` per row, which is all
  this endpoint's logic depends on; the wrong part (names/composition)
  is invisible to the scoping and mismatch checks. Confirmed, not
  assumed, before building test fixtures against it.
- Tests: `scripts/test-grades-flows.js`, 26 assertions, idempotent
  (every created grade row plus one throwaway inactive-student fixture
  deleted in a `finally` block). `npm run test:grades` — 26 passing,
  confirmed twice in a row with no `db:setup` between runs. Full
  regression across the other thirteen suites afterward: all unchanged
  from their prior counts (auth 25, students 30, sections 30, attendance
  38, content 47, contributions 38, settings 26, users 39, backups 39,
  sanitize 9, messages 39, restore 22, excuses 56), plus
  `test:grade-computation` still 29/29 — confirms this stage didn't leak
  outside `routes/grades.js` and its own mount line. `git status` after
  implementation showed exactly the four whitelisted files changed
  (`server/routes/grades.js`, `server/scripts/test-grades-flows.js`,
  `server/server.js`, `server/package.json`) — no scope expansion.
- Mounted at `/api/grades`, between `/api/sections` and
  `/api/attendance`.

**Stage G2c is done (2026-09-06): `POST /:id/components` and
`PATCH /:id/exam` — the first writes that actually compute anything, and
the first place `utils/gradeComputation.js`'s pure functions get called
from real HTTP traffic.** Same plan-then-approve shape as every prior
Grades stage, 10 questions this time. Both confirmations from the plan
that mattered most in practice:

- **The missing-`grade_weight_configs` question resolved as a pre-flight
  gate (`409`), not a "save the raw score anyway and degrade quietly"
  alternative** — confirmed with an added reason beyond the one in the
  plan itself: saving the raw score while leaving the computed columns
  blank would show a teacher their score went in with no grade appearing
  and no explanation on the row — indistinguishable from the system being
  broken. A `409` naming the missing config says what's wrong and who
  fixes it. Order locked: scope -> `grading_mode_configs` -> `is_locked`
  -> `grade_weight_configs` -> *then* the write -> recompute -> commit,
  all pre-flight checks running before the transaction opens, so a
  rejection costs the caller nothing (nothing was ever accepted).
- **`recomputeGrade()` lives in `routes/grades.js`, not
  `utils/gradeComputation.js`** — confirmed as the only viable answer,
  since that module is pure by design (no DB, no HTTP) and recompute
  needs four DB reads (`grades`, `grade_components` split by type,
  `grade_weight_configs`, `transmutation_table`). It's the glue: fetch
  what the pure functions need, call them for every actual calculation,
  write the result back. Runs on the same transaction connection as the
  write that triggered it (`pool.getConnection()` -> `beginTransaction()`
  -> insert/update -> `recomputeGrade(conn, ...)` -> `commit()`, rollback
  in `catch`, release in `finally`), matching `attendance.js`'s
  `POST /bulk` shape exactly — a failure after the insert lands rolls
  back the insert too.
- **`PATCH /:id/exam` accepts any subset of ST1/ST2/TE.** Score and max
  are always a pair for a given sub-test: omitting one carries the
  other forward from the existing row, but ending up with exactly one of
  the two set is `400`. An explicit `null` on either field clears *both*
  for that sub-test (a legitimate undo — a wrong exam score entered
  against the wrong student needs to be undoable). Sending one field as
  explicit `null` and the other as an explicit non-null number in the
  *same* request is a genuine contradiction, rejected as its own `400`,
  never silently resolved by guessing which side the caller meant.
- **Response shape is a deliberate asymmetry, commented at both
  handlers so it doesn't read as an oversight**: `POST /:id/components`
  returns both the new `component` row and the recomputed `grade` row
  (it creates a real child resource, matching this codebase's
  create-returns-the-row convention, plus the parent the caller needs to
  update a live display); `PATCH /:id/exam` returns only `grade` (it
  creates no child resource, only sets columns on the parent). This is
  the first endpoint pair in the codebase with the
  child-create-triggers-parent-recompute shape — a synthesis of two
  existing precedents, not a copy of one.
- Out-of-scope on both `:id`-keyed endpoints is `404`, matching G2b's
  own already-provisional call (no `GET /api/grades` exists yet, so
  nothing else in the system lets a teacher see a grade row they can't
  encode) — not re-litigated here, just carried forward.
- Item-count caps stay documentation-only; `score > max_score` (bonus
  points) stays unclamped — both G1a/G2a decisions carried forward
  unchanged, not reconsidered.
- **Real finding, not a production bug: mysql2 returns `DECIMAL` columns
  as strings** (`"90.00"`, not `90`). `gradeComputation.js`'s own
  functions already call `Number(...)` on every input specifically for
  this reason, so the actual computation was never affected — but the
  *test suite's* first attempt at strict `===` comparisons against the
  raw API response failed on type mismatches even where the values were
  exactly correct (confirmed by the failure output showing "got 90.00"
  against an expected `90.0`). Fixed with a local, null-safe `num()`
  coercion helper in `test-grades-flows.js` — a test-assertion fix, not
  a production-code change. Worth remembering for every future Grades
  test: any DECIMAL-typed field returned from this API needs the same
  treatment, or a correct value will read as a failure.
- Tests: `scripts/test-grades-flows.js` grew from 26 to 56 assertions.
  Centerpiece: the full worked example driven step-by-step through the
  real endpoints, reusing `test-grade-computation.js`'s exact numbers —
  WW 45/50 then 42/50 (asserting `ww_percentage` correct *after each
  call independently*, the one property a pure unit test cannot exercise
  at all, since it requires real persistence across two separate
  requests), PT 88/100 + 92/100, then ST1/ST2/TE one at a time with
  `initial_grade` asserted `NULL` at every intermediate step and exactly
  `88.05` only once all three components are complete — then the same
  raw scores repeated against a MAPEH-subject grade row to get `88.50`
  instead, proving the weight lookup (not the raw scores) is what
  changed. `term_grade` checked against a live query of
  `transmutation_table`, never a hardcoded guess. `npm run test:grades`
  — 56 passing, confirmed three times in a row with no `db:setup`
  between runs (the extra run given the fixture complexity this stage
  added). Full regression across the other thirteen suites afterward:
  all unchanged from their prior counts (auth 25, students 30, sections
  30, attendance 38, content 47, contributions 38, settings 26, users 39,
  backups 39, sanitize 9, messages 39, restore 22, excuses 56), plus
  `test:grade-computation` still 29/29. `git status` after implementation
  showed exactly the two whitelisted files changed (`server/routes/
  grades.js`, `server/scripts/test-grades-flows.js`) — no scope
  expansion, no `server.js` or `package.json` change needed since G2b
  already mounted the route and registered the alias.

**Stage G1b is done (2026-09-06): `subjects` now holds the school's real
per-grade learning areas, not the uniform placeholder list.** 40 rows
total (5/5/6/8/8/8 for Grades 1–6), transcribed from GRADING_SPEC §6c.
**Grade 4 is recorded as INFERRED, not confirmed** — it was never
photographed during the school visit; the seed comment states the basis
explicitly (matches the SF9's 8 intermediate-level rows and Grade 5's
photographed program exactly) so it's findable if the school later says
otherwise. Grade 6 is seeded under the SF9's names (GMRC, EPP) rather
than the class program's (ESP, TLE) for the same two learning areas — the
SF9 is what the parent actually holds — with the alternates recorded in
a comment, not silently dropped. `Homeroom Guidance`/`ARAL Program` are
excluded (not graded).

The cascade this was deferred for landed exactly as anticipated:
`subjects.id` has `ON DELETE CASCADE` from `teacher_assignments`,
`grade_weight_configs`, AND `grades` — reseeding destroyed TCH-001's 3
seeded Grade 6 assignment rows and all 48 old placeholder
`grade_weight_configs` rows. Both were expected and both are fully
replaced: `setup-db.js`'s own `teacher_assignments` INSERT needed **zero
code changes**, since it already resolves `teacher_id`/`subject_id` by
name (`WHERE s.grade_level = 6 AND s.name IN ('Mathematics', 'English',
'Filipino')`) rather than a hardcoded id, and all three names survive
unchanged into the new Grade 6 list — confirmed by tracing the actual SQL
before assuming it, not taken on faith. `grade_weight_configs` is
reseeded fresh: 35 rows (Grades 2–6 only), via `SELECT ... FROM subjects
JOIN grading_mode_configs ... WHERE mode = 'numerical'` — **the exclusion
of Grade 1 is enforced by that JOIN, not a hardcoded `grade_level >= 2`
comparison.** This was a deliberate correction mid-plan: the simpler
grade-level form would work today but wouldn't fail loudly in SY
2027-2028, when Grade 2 also goes descriptive per the KS1 rollout — it
would quietly reseed weight rows for a now-descriptive grade with nothing
to catch it. The JOIN form means changing one row in
`grading_mode_configs` is what drives the exclusion, the same "data
absence drives behavior, not a hardcoded year" principle the
transmutation table already uses — using two different approaches to the
same problem in one seed file would have been exactly the inconsistency
a future session tries to "fix," undoing the correctness this stage was
built to add. `grading_mode_configs`'s own seed block moved earlier in
`seed.sql`'s file order (before `grade_weight_configs`, not after) purely
because the weight seed now needs it to already exist.

**Every existing test fixture needed zero code changes** — confirmed by
grep across the whole `server/` tree, not assumed: `test-grades-flows.js`
and `test-excuses-flows.js` are the only files referencing `subjects` at
all, and both resolve dynamically (by name+grade_level, or "any row at
that grade"), never a hardcoded numeric id — every specific name either
file happens to reference (`Mathematics`, `Science`, `Filipino`,
`English`, `MAPEH` at various grades) survives unchanged into the new
curriculum. `verify-grading-seed.js` extended with new checks proving the
reseeded shape directly (exact subject/weight counts, zero weight rows on
descriptive grades, correct MAPEH/EPP bucketing) — 20/20 passing. A live
precondition check (`SELECT COUNT(*) FROM grades`) confirmed 0 rows
before the reseed ran, so the `grades`-cascade risk this stage carried
never actually destroyed real data.

`routes/grades.js` is unaffected by this stage — it was already built
through Stage G2c (`POST /`, `POST /:id/components`, `PATCH /:id/exam`)
before G1b ran; none of those handlers hardcode a subject id or name.
`npm run test:grades` and `npm run test:excuses` both re-confirmed at
56/56 after the reseed, unchanged from before it.

**Stage G2d is done (2026-09-06): `PATCH /:id/descriptive` — Grade 1's
manual A-E letter, the other side of the numerical/descriptive gate G2c
built.**

**Grade 1 as a MANUAL teacher judgment call is an ASSUMPTION, not a
school-confirmed answer, and is recorded as one deliberately, in both
code and here.** The school has not answered how a teacher arrives at
A-E. DO 015 s.2026 defines no Initial-Grade-to-letter mapping at all,
and descriptive grading exists specifically to avoid numerical labeling
in Key Stage 1 — that reasoning, not a school confirmation, is the basis
for proceeding this way. `routes/grades.js`'s own handler comment states
this in the same terms: if the school later says a computation *does*
feed the letter, **this endpoint changes, not the schema** — a single
nullable `descriptive_grade` column already accommodates either answer.
Do not read this stage as having resolved that open question; it only
proceeded on it.

- **No transaction** — a plain `pool.query()` `UPDATE` touching exactly
  one column, matching `POST /`'s own single-statement precedent. Unlike
  `POST /:id/components`/`PATCH /:id/exam`, nothing derives from this
  write, so there is no follow-up computation to make atomic with it.
- **`descriptive_grade: null` clears the column** — deliberately mirrors
  G2c's sub-test-clearing convention (a wrong exam score, or here a wrong
  letter, must be undoable) rather than inventing a second clearing rule
  for the same module.
- **`preflightGradeWrite()` refactored to take an `expectedMode`
  parameter (`'numerical'` | `'descriptive'`) instead of being
  duplicated** — confirmed explicitly rather than left as an open
  question: two copies of scope/mode/lock logic would drift silently,
  since a fix applied to only one copy still passes that copy's own
  tests. G2c's two existing call sites (`POST /:id/components`,
  `PATCH /:id/exam`) were updated to pass `'numerical'` explicitly — a
  one-line change each. **The full 56-assertion grades suite was re-run
  immediately after this refactor and before writing the new endpoint**,
  specifically so any regression would be attributable to the refactor
  alone, not confused with the new code; it passed unchanged.
- **`is_locked`'s gate is inherited for free** by reusing the shared
  function — not a separate decision, the same way it already couldn't
  fire for G2c's two endpoints either (no toggle exists until Stage G2e).
- **`POST /api/grades` is untouched** — a Grade 1 shell row was already
  creatable before this stage, deliberately, per G2b's own mode-agnostic
  creation design; G2d doesn't change that.
- Response returns only `grade` (no child resource created), matching
  `PATCH /:id/exam`'s exact shape, not a new synthesis this time.
- Tests: `scripts/test-grades-flows.js` grew from 56 to 71 assertions,
  reusing the exact Grade 1 fixture row G2c already built for its own
  descriptive-mode-rejection tests. One new fixture: a real
  `teacher_assignments` row giving TCH-001 Grade 1 Mathematics in the
  fixture student's section, specifically so "subject teacher succeeds"
  tests an actual subject teacher rather than only admin — deleted in
  the `finally` block. `npm run test:grades` — 71 passing, confirmed
  three times given the new fixture. Full regression across the other
  thirteen suites afterward: all unchanged from their prior counts (auth
  25, students 30, sections 30, attendance 38, content 47, contributions
  38, settings 26, users 39, backups 39, sanitize 9, messages 39, restore
  22, excuses 56), plus `test:grade-computation` still 29/29. `git
  status` after implementation showed exactly the two whitelisted files
  changed (`server/routes/grades.js`, `server/scripts/
  test-grades-flows.js`) — no scope expansion.

**Stage G2e is done (2026-09-06): `PUT`/`DELETE /:id/components/:componentId`
and `PATCH /:id/lock` — the toggle that finally lets the `is_locked` gate
already built into all three write endpoints since G2c actually fire.**

- **Component edit stays nested under `/:id/components/:componentId`**,
  not a flat `/components/:componentId`, even though `grade_components.id`
  is already a unique PK on its own — matching the two sibling endpoints
  already nested this way, and matching the DB's own ownership model
  (`grade_components.grade_id` is a required FK). A `componentId` that
  doesn't belong to the given grade id (or doesn't exist at all) is `404`,
  undifferentiated — matched by a single `WHERE id = ? AND grade_id = ?`
  query, the exact same collapsing `loadAuthorizedGrade` already does for
  the parent grade id.
- **`type` is NOT editable via `PUT`.** Changing WW to PT moves a score
  between two separately-weighted averages — a re-categorization, not a
  correction. A differing `type` in the body is `400` ("delete this
  component and add a new one with the correct type instead."), not
  silently ignored — correcting a genuine miscategorization is delete +
  recreate, two explicit, separately-logged actions, not one edit whose
  log entry has to explain a bucket change.
- **Deleting the last component of a type needed zero new code.**
  `componentPercentage([])` already returns `null` (from G2a), so
  `ww_percentage`/`pt_percentage` — and `initial_grade`/`term_grade` with
  them, if that was the last of the three required inputs —
  automatically revert to `NULL` on the next `recomputeGrade()` call,
  the same code path as "nothing was ever entered." Confirmed live, not
  just traced: a dedicated test fixture was built to FULL completion
  (Initial Grade 83.30, a real Term Grade) before its last WW component
  was deleted, specifically to prove a genuine reversion from a real
  computed value, not a trivial already-null case.
- **`PATCH /:id/lock` is admin-only, unscoped — confirmed, not extended
  to let a teacher lock their own encoding.** Locking is a school-wide
  finalization boundary tied to the End-of-Term Block (DO 009 s.2026),
  not individual teacher discretion, and nothing the school has said
  describes teacher self-finalization — inventing that now would be
  exactly the unconfirmed-policy guessing this project refuses to do.
  **"Should a teacher be able to lock their own encoding?" is recorded as
  an open school question** — see OPEN QUESTIONS below, alongside the
  Grade 1 manual-judgment assumption it sits next to in spirit.
- **Deliberately NOT gated on completeness — the best-reasoned finding
  in this stage, stated as a comment at the handler itself so nobody adds
  the check back as an "obvious" safety improvement.** A literal
  `initial_grade IS NOT NULL` check would make every Grade 1
  (descriptive-mode) row **permanently** unlockable, since a descriptive
  row never populates `initial_grade` at all by design — a bug that
  would only surface weeks later, on one grade level, the first time
  someone tried to lock a perfectly complete Grade 1 row. Whether an
  incomplete *numerical* grade should be lockable is an administrative-
  process question the school hasn't answered either; the system doesn't
  second-guess it. A mistaken lock is always reversible via the same
  endpoint. Verified directly: the test suite locks both a Grade 1
  descriptive row and a numerical row with `initial_grade` still `NULL`,
  both succeeding.
- **Unlock carries no extra friction versus lock** — no step-up auth, no
  required reason, the same admin-only `PATCH` in both directions.
  Restore's step-up auth exists because a restore is irreversible; an
  unlock is reversible by re-locking, so matching that friction here
  would be theatre, not safety. The admin-only gate plus full old/new
  `logActivity` on every toggle (`'update_grade_lock'`, copying
  `sections.js`'s adviser-PATCH precedent exactly) is the real safety
  rail.
- Both `PUT` and `DELETE` are transaction-wrapped with `recomputeGrade()`,
  identical shape to `POST /:id/components` — no new transaction design,
  direct reuse of the established pattern.
- Tests: `scripts/test-grades-flows.js` grew from 71 to 96 assertions.
  `npm run test:grades` — 96 passing, confirmed three times in a row with
  no `db:setup` between runs. Full regression across the other thirteen
  suites afterward: all unchanged from their prior counts (auth 25,
  students 30, sections 30, attendance 38, content 47, contributions 38,
  settings 26, users 39, backups 39, sanitize 9, messages 39, restore 22,
  excuses 56), plus `test:grade-computation` still 29/29. `git status`
  after implementation showed exactly the two whitelisted files changed
  (`server/routes/grades.js`, `server/scripts/test-grades-flows.js`) — no
  scope expansion.

**Stage G3 (2026-09-06) is done — `GET /`, `GET /:id`,
`GET /student/:studentId`.** A parent can now see grades. The full
report card returns every subject at the grade level (including
zero-grade-row ones, never silently missing), all three terms, a
computed Final Grade, and a computed General Average — both follow the
same NULL-until-complete rule as Initial Grade, deliberately not a
running average, since a partial Final Grade carries real weight (SF9,
promotion) a caller could reasonably mistake for settled. G3 also
resolved the provisional decision G2b left open: teacher read-scope is
wider than encode-scope (grade+section, any subject — matching
`students.js`'s own pattern), so the five `:id`-keyed write endpoints now
answer `403` naming the subject, not `404`, when a teacher can see a
grade via `GET` but isn't its encoding teacher — the same reasoning
Excuse Letters' review endpoint already applied. See the endpoints table,
the `routes/grades.js` file entry, and the 2026-09-06 CHANGELOG entry for
the full mechanism. **Grades has no remaining build work** — what's left
is policy detail (`grade_weight_configs`, `grades.term`/quarter naming,
the ST1/ST2/TE composite — see below) and Stage 4 web pages, not backend
endpoints.

### Known schema issue — RESOLVED (Stage G1a, 2026-09-05)

`grade_weight_configs` was keyed by grade band (`grade_level_min`/
`grade_level_max`, seeded G1–3: 30/50/20, G4–6: 40/40/20) — confirmed
wrong, since weights actually vary by learning area, not grade level.
Re-keyed to `(subject_id, school_year)` in Stage G1a above. **The values
seeded are still provisional**, though — they're seeded against the old
placeholder `subjects` rows, not the school's real per-grade subject
list, so this isn't the final state until G1b lands.

`grade_components.type` was `ENUM('quiz', 'activity')` with exams living
separately as a single `grades.exam_score` scalar — DO 015's three
components (Written Works, Performance Tasks, Examinations) mapped
loosely but not exactly, and Examinations' real internal structure
(ST1/ST2/TE) wasn't represented at all. Fixed in Stage G1a: `type` is now
`ENUM('WW', 'PT')`, and EX's three sub-scores live as dedicated columns
on `grades` (`ex_st1`/`ex_st2`/`ex_te`) — see above for why columns, not
child rows.

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
| No `Download Statement` export | — | Promised in manuscript Figure 19. Build a CSV export from `contribution_records`, or remove it from the paper. |
| No GWA computation | — | Defined in the manuscript's Definition of Terms but implemented nowhere. Keep or drop — undecided. |
| A new page file arriving via HMR can leave a stale module in an open tab | Vite dev server | **Try a hard reload (Ctrl+Shift+R) before treating a browser-review symptom as a code defect.** Cost a full round trip on 2026-09-07: Teacher → Excuse Letters' "All statuses" filter appeared to return nothing, and the investigation proved the request, the endpoint contract, the empty-state branches and `FormField`'s controlled select were all correct — the running tab was serving a stale module. A hard reload cleared it and there was no data bug. The analysis was not wasted (it found a real copy defect alongside), but the reload should have come first. |
| **`teacher_assignments` is now readable and writable (2026-09-08) — consequences 1–2 closed; 3–4 and the client consumers remain.** | `server/routes/assignments.js` | **Closed:** `GET /api/subjects`, `GET`/`POST`/`DELETE /api/assignments`. An admin can assign and unassign; a teacher can read their own rows. `useTeacherTargets` still reconstructs from sections+students until a client dispatch switches it — the hole (empty section invisible) is now optional, not the only path. **DELETE does not refuse when grades exist.** No `grades` → `teacher_assignments` FK; a scope change removes future authority, never past records — same as message history surviving a `canMessage()` change, opposite of the subjects-reseed CASCADE. **Still open, consumers or later items, not a second assignments endpoint:** Consequence 3 — `GET /api/messages/contacts` still cannot distinguish "no students" from "every parent pending"; the assignments read is the signal, Messages has not consumed it. Consequence 4 — no `GET /api/grading-modes` yet (admin-prerequisites item 2, not started; not a settings key). Teacher → Grades encode-scope prediction and the existing-row `ensureShell` hole are now closable via `GET /assignments`; that page has not been switched. `DELETE /api/grades/:id` is still missing (item 3, not started). |
| `GET /api/excuse-letters/:id` returns strictly LESS than its own list endpoint | `server/routes/excuses.js` | The list runs `SELECT el.*, s.first_name, s.last_name, s.grade_level, s.section`; the detail runs `SELECT el.*` with **no student join at all**. So a detail route would render `student_id: 2` and need a second call to `/students/:id` just to show a name, while a list row already carries everything the detail has plus the student. Teacher → Excuse Letters therefore uses a modal from the list and never calls `GET /:id` — but the oddity is worth knowing before someone builds a detail route on it later and wonders why the name is missing. Flagged, not fixed. |
| `excuse_letters.attachment_url` exists but nothing can write it | `database/schema.sql` + `server/routes/excuses.js` | The column is in the schema, but `POST /api/excuse-letters` accepts only `absence_date`, `reason` and `details`, and there is no upload endpoint anywhere in the API. The value is always `NULL` in practice. **No screen should render an attachment affordance for it** — that would promise a feature that does not exist. Either build upload or drop the column; until then it is dead schema. |
| `GET /api/students` returns the full personal row on a LIST | `server/routes/students.js` | The list `SELECT` includes `birthday`, `gender`, `address`, `contact_number` for every student in scope — verified live against the real payload. Not an authorization hole (the teacher may open each of those students individually), but a roster has no reason to carry home addresses, and **the `LRN` in that payload doubles as the parent's `login_id`** — see convention §5c. Consequence for the client: the list page renders only name / LRN / class / status and leaves the rest to the detail view. Consequence if this is ever narrowed server-side: `GET /:id` adds only `section_id`, `created_by`, `updated_at` over the list, so a slimmer list response would cost the detail view nothing it does not already fetch. Flagged from a client dispatch, not fixed. |
| `docs/API_REFERENCE.md` scope labels are stale for every widened read | `docs/API_REFERENCE.md` §4 + the Students/Excuse-Letters/Announcements/Events/Messages tables | The 2026-09-06 students fix and the 2026-09-07 content/messages fixes widened teacher READ scope to "assigned OR section adviser", but those dispatch whitelists did not include API_REFERENCE. Its rows still say `teacher(wide)`, and the legend defines `wide` as "exact grade + section match, any subject (`teacher_assignments`, grade+section only)" — narrower than what those endpoints now do. **There is no legend code for "assigned OR adviser", which is why four modules are mislabelled with one that means something else.** Needs its own backend-docs dispatch: add the code, then relabel. **Note on why the 2026-09-07 audit did not catch this and was not wrong to miss it:** that audit was a three-way diff of endpoint EXISTENCE, and a presence diff structurally cannot see a scope column drifting stale. "All three buckets empty" was true and remains true. Recorded as a stated limitation of that audit, not a correction to it. |
| `Login.jsx` does not use `extractError` | `client/src/pages/Login.jsx:31` | Falls back to `'Login failed. Please try again.'` when there is no `err.response` — **the same message a wrong password produces**. `extractError` already returns a distinct offline message for exactly that case; this file predates it. **Why it matters beyond tidiness: a dead server and a wrong password are indistinguishable to the user**, so someone hitting it during the parent demo would go hunting for a credentials problem that does not exist, in front of an audience, while the real fault is that the API is down. Small fix, fold into a later client dispatch. |
| **No `GET /:id` on announcements, memos or events — all three routers have list/create/update/delete and no read-one** | `server/routes/content.js` | Verified live from a parent session: `GET /api/announcements/52`, `/api/memos/13` and `/api/events/47` all answer `404 "Route not found."` — `server.js`'s app-level fallback, not a scope refusal, because no handler is registered at that path. Consequence for the client: a detail ROUTE is impossible without fetching the whole collection and filtering in JS, so Parent → Announcements/Memos/Events open full text in a Modal from the row instead. That costs nothing today (each list row is `SELECT a.*` / `SELECT *` / `SELECT e.*`, so it already carries every column a detail view would show) — which is the stronger version of the Excuse Letters oddity, where `GET /:id` exists and returns strictly LESS than its list. **The trigger to build these: a shareable link to one post.** A parent forwarding "have you seen this announcement" has no URL to send, and no modal can give them one. Flagged from a client dispatch, not fixed. |
| `GET /api/memos` accepts no query parameters and silently ignores unknown ones | `server/routes/content.js` | Verified live: `GET /api/memos?grade_level=1` returns `200` with the full, unfiltered list, while the same param on `/api/announcements` and `/api/events` is validated and `400`s on a bad value. So the three sibling routers in one file disagree about whether an unrecognised filter is an error or a no-op. Low severity — memos are school-wide by schema design, so there is genuinely nothing to filter — but a client that assumes "same file, same conventions" will guess wrong, and the parent Memos page's single empty-state branch (convention 5f) is a direct consequence. Flagged, not fixed. |
| `posted_by` is a bare integer on all three content tables, unresolvable by any non-admin client | `server/routes/content.js` | None of the three list queries joins `users`, so a row carries `posted_by: 2` and nothing else — and `GET /api/users/:id` is `authorize('admin')`, so a teacher or parent cannot turn that integer into a name even with a second request. Consequence: **no parent-facing page can say who posted an announcement**, which is the one attribution a parent would plausibly want ("is this from the school or from my child's teacher?"). The parent pages answer that question indirectly, via the audience label derived from the target columns, and deliberately do not render the integer. The fix is a `LEFT JOIN users` on the three list queries, same shape `excuse_letters`' list already uses for student names — a backend dispatch, not a client one. |
| `/auth/me` returns `lrn` AND `login_id` for a parent — the same credential, twice | `server/routes/auth.js` | For a parent these two fields hold the identical value (the child's LRN **is** the parent's login id — a locked decision), so the payload every client page holds in `AuthContext` carries a live credential under two names. Not a leak in itself: it is the account's own session reading its own row. But it doubles the surface convention 5c has to police, and 5c's rule ("no screen displays an LRN except to a teacher or admin acting on that student") has to be applied to both keys, not just the obviously-named one — which is exactly the aliased-name failure mode `sanitizeUser` was hardened for on the password column. The three parent pages render neither. Consider returning one, or neither, since no client needs it. Flagged, not fixed. |
| `backups` has no `status` column | `schema.sql` | Deliberate, not missing: a row is only ever inserted after the dump succeeds, so every row is definitionally "Completed" — the UI hardcodes that string. Revisit only if backup generation becomes asynchronous (a pending/failed state visible before the job finishes) — that's the trigger, not before. |
| **There is no `DELETE /api/grades/:id`** — a grade row cannot be removed through the API at all | `server/routes/grades.js` | The module has eight write endpoints and none of them deletes a `grades` row. `DELETE /:id/components/:componentId` removes a *component*, and deleting the last one correctly reverts the computed columns to `NULL` (Stage G2e) — but the shell row itself is permanent once created. **Consequence for anyone testing Grades: teardown is direct SQL.** `DELETE FROM grades WHERE student_id = ?` is what the Parent → Grades verification used; `grade_components` cascades via `fk_grade_components_grade`. **Whether this SHOULD exist is a real question, not an oversight to patch:** a grade row created against the wrong student or the wrong term is currently uncorrectable except by hand, while `is_locked` exists precisely to make finalised grades immutable — so an unrestricted delete would undercut it. The likely shape is admin-only and refused once `is_locked` is set, mirroring `PATCH /:id/lock`'s own authority. Flagged, not fixed. |
| `GradeValue` has no branch for a descriptive A–E letter | `client/src/format/grade.jsx` | Its header names four states — a number, `null` in numerical mode, `null` in descriptive mode, and a failed request — and **a letter is not one of them**. `formatGrade('A')` is `Number('A') → NaN → null`, so a real Grade 1 term grade of `A` renders as `"— N/A"`, the string meaning "this does not apply", on the one value that does. This is outside the primitive's stated contract rather than a bug inside it. **Two local `TermCell` copies now exist** (Parent → Grades and Teacher → Grades); extract at three. Teacher → Grades was instructed not to add a fifth state to the primitive inside the largest encode screen in Stage 4 — that is the "shaped by one page" failure the foundation dispatch existed to prevent. **The trigger to fix the primitive is the third copy**, not a rushed fifth state. Parent letter rendering as `1090001` / `Parent@2026` is still the browser pass that retires Finding C on the parent card. |

---

## SAFE TO BUILD NOW — done

Excuse Letters is fully built — `submit`, `mine`, `list`, `view`, `edit`,
and `review` (`PATCH /:id/review`, approve/decline) — see the endpoints
table and `routes/excuses.js` in Files that exist. Grades is also fully
built — write path plus `GET /`, `GET /:id`, `GET /student/:studentId`
(Stage G3, 2026-09-06) — see the Grades module note below. Nothing in the
system is currently in the "unblocked but unbuilt" state this section
used to track; the next backend work waits on Stage 4 web pages, or
further school-visit answers for the still-open Grades policy gaps
(`grade_weight_configs` re-keying, the ST1/ST2/TE composite column,
`grades.quarter` naming — see BLOCKED / RESOLVED).

---

## GET /api/messages/contacts — BUILT 2026-09-07

Was an open question (no way for a parent to discover their child's teachers'
user ids to start a first conversation), then a recorded design, and is now
**built** — `routes/messages.js`, wrapper key `contacts` (array), the sixth
endpoint in that module. It was the only designed-but-unbuilt endpoint in the
system; the endpoint audit run the same day confirmed nothing else was in that
state.

**Response row:** `{ id, name, role, subject | null, student_name | null,
last_message | null, last_message_at | null, unread_count }`. Ordering puts
existing conversations first (most recent), then everyone else alphabetically,
so the page renders a combined contacts-and-conversations view from one call.

**ACTIVE ACCOUNTS ONLY — decided, and it has a visible consequence.** A pending
parent cannot log in, so listing them would offer a conversation that cannot
happen and show a teacher a contact who will never reply, with no way to tell
why. Consequence: `TCH-002` (adviser of Grade 5 - Masigasig, whose only
student's parent account is deliberately seeded `pending`) sees **zero parent
contacts**, and that is correct. The test asserts it as correct with a comment
saying so, specifically so a future session reading "adviser sees no parents"
does not diagnose it as the adviser-scope bug returning.

The design below is what was built, unchanged.

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

- [x] Database schema — 22 tables (was 18 when Stage 1 closed; the Grades
      rebuild and `auth_security_state` added the rest)
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
      attendance's adviser-scoping needs a way to assign still-NULL
      sections without a direct DB write (how many are still NULL: Seeded
      baseline)
- [x] Attendance API — per day, adviser-scoped (Stage B1 rebuild; was per
      subject, see BLOCKED / RESOLVED and the 2026-09-04 CHANGELOG entry)
- [x] Announcements + Memos + Events API. **Class Board (2026-09-06):
      investigated, complete, zero new code** — the school's group-chat
      request is delivered entirely by this existing API (section-scoped
      `POST`/`GET /api/announcements`, already teacher-capable and
      already parent-read-scoped); see the "Class Board" section above.
      Not an eleventh feature — Feature 4 with school-wide as admin-only
      and section-level as teacher-capable.
- [x] Excuse Letters API — **fully built**: submit, mine, list, view, edit, and review (approve/decline, adviser-only, never touches attendance), see BLOCKED / RESOLVED
- [x] Contributions API — create, record payment, view status
- [x] Messages API + Socket.io
- [x] System Settings API (admin)
- [x] User Management API — extend the existing `routes/users.js`
- [x] Backup/Restore API (admin, `mysqldump` — not a folder copy) — both built, 5 endpoints; see "RESTORE" below
- [x] **Grades API — all nine stages done (G1a, G1b, G2a–G2e, G3;
      2026-09-05/06).** `grade_weight_configs`/`grades`/`grade_components`
      rebuilt, `transmutation_table`/`grading_mode_configs` added (G1a);
      `utils/gradeComputation.js` (pure functions) plus a G1a schema
      correction for EX raw-score retention (G2a); `POST /api/grades`
      creates a scoped shell row (G2b); `POST /:id/components` and
      `PATCH /:id/exam` record WW/PT/exam scores with full recompute
      through the transmutation table (G2c); `subjects` reseeded with the
      school's real 40-subject curriculum, replacing the placeholder list
      (G1b, `verify-grading-seed.js` — 20/20 checks); `PATCH /:id/descriptive`
      records Grade 1's manual A-E letter, no computation (G2d, **an
      assumption pending school confirmation, not a confirmed answer** —
      see BLOCKED / RESOLVED); `PUT`/`DELETE /:id/components/:componentId`
      correct or remove a component, `PATCH /:id/lock` (admin-only)
      finalizes a grade — no completeness gate, deliberately (G2e);
      `GET /`, `GET /:id`, `GET /student/:studentId` (full report card
      with computed Final Grade/General Average, both NULL-until-complete
      like Initial Grade) close the loop — a parent can now see grades
      (G3), which also resolved G2b's provisional 404 into a 403/404
      split once teacher read-scope became wider than encode-scope.
      `routes/grades.js` HTTP suite was 141 at G3 close; later grew to 149
      with the Grade 1 fixture (read-only assertions against the seeded
      student — see Seeded baseline + Tests). `utils/gradeComputation.js`
      51/51 unit tests

### Stage 4 — Web pages

**Real size: 75 role-facing views behind ~45–50 distinct implementations
— not the 36 that was estimated.** See STAGE 4 FRONTEND CONVENTIONS
above for both figures, the counting rule that produced them, and why
the old ~13-day estimate derived from 36 is void and is not being
replaced with a new guess.

- [x] **Foundation — done 2026-09-06.** Role-aware `Shell` with nested
      layout routes, `layout/nav.js` (built/blocked/unbuilt), seven
      shared primitives (`DataTable`, `Modal`, `FormField`,
      `StatusBadge`, `EmptyState`, `ErrorAlert`, `LoadingSpinner`),
      `format/grade.jsx`, mandatory response unwrapping, and a DEV-only
      component gallery at `/dev/ui`. The seven conventions every page
      below inherits are frozen — read them before building any screen.
- [x] **Teacher → Attendance — DONE 2026-09-06.** The first Stage 4
      feature page. **Encode only** — the attendance HISTORY view is a
      separate later dispatch and was deliberately kept out of scope.
      Adviser-scoped via `sections.adviser_id`; roster fetched with
      `?status=active` so the bulk endpoint's inactive-student `400` is
      unreachable rather than handled; pre-fill plus in-place update via
      `ON DUPLICATE KEY`; unset rows omitted rather than defaulted to
      Present. See MEASURED BUILD TIME above — this is the page the void
      estimate was to be re-measured from, and that measurement needs
      reading with its caveats before being used for anything.
- [x] **Teacher → Students — DONE 2026-09-07.** List plus a detail route
      (`/teacher/students/:id`), **read only** — no create, no edit, no
      embedded attendance history, all deliberately out of scope. Proves the
      widened read scope in the UI: `TCH-002`, an adviser with zero subject
      assignments, sees and opens its advisory section's student. No Edit
      affordance anywhere, because `PUT` is `teacher_assignments`-only and a
      button an adviser-only teacher cannot honour is a dead end the UI would
      have invented.
- [x] **Teacher → Excuse Letters — DONE 2026-09-07.** Queue plus review
      action. **Where the codebase's sharpest 403/404 split first reaches a
      user**: read scope is assigned OR adviser, review authority is adviser
      only, so a teacher can see a letter they may not act on. The page
      predicts that case before the click (no dead-end button) while the
      server stays the authority and the `403` is still handled. Review is
      **irreversible** by API design, so the modal carries an explicit
      confirmation naming the decision — see convention §5e. Modal, not a
      detail route, because `GET /:id` returns strictly less than a list row.
- [x] **Teacher → Announcements, Memos, Events — DONE 2026-09-07.** Three
      page files, not one component: they share a shape only at a distance.
      **Announcements is the Class Board** — see that section above; no
      separate affordance, because a teacher's only legal target IS an exact
      section. **Memos is READ-ONLY for a teacher** — every write on that
      router is `authorize('admin')`, so a compose control would `403` at the
      middleware every time; the page says who posts them instead. Events
      target a grade, not a section, and carry a required date. Delete
      confirms (hard `DELETE`, no undo); edit does not (freely repeatable).
- [x] **Teacher → Messages — DONE 2026-09-07.** Conversation list plus a
      thread route, and the first Stage 4 page using Socket.io. The socket is
      a **latency optimisation, not the delivery path** — REST persists before
      it emits, and an emit into an empty room is a no-op, so an offline
      recipient loses nothing. When the channel drops the UI **says so and
      offers refresh rather than polling** (convention 5g). No optimistic
      append: a sent message appears only after the server confirms, using the
      row the API returned. Unread is server-derived and cleared by a request,
      never decremented locally. The nav badge lives in `Shell` and renders
      **only on a built item**, so it is live for Teacher today and becomes
      live for Parent and Admin the day those pages land.
- [x] **Parent → Announcements, Memos, Events — DONE 2026-09-07.** The first
      parent-facing feature pages, and the first dispatch with **no write
      affordance anywhere**: every write on all three routers is
      teacher/admin-only, so a parent gets `403 "Access denied."` from
      `authorize()` before any handler runs — a generic refusal with no reason
      in it, which is why the control must not exist rather than be shown and
      handled. Full text opens in a **Modal, not a detail route**, because
      **no `GET /:id` exists on any of the three routers** (a direct request
      is `404 "Route not found."` from `server.js`'s fallback) — the stronger
      form of the Excuse Letters modal decision, where `GET /:id` existed and
      merely returned less. Announcements and Events carry **audience labels
      derived from the target columns' nullness**, never from
      `user.grade_level`/`user.section`, which `/auth/me` does return —
      declining to use them is the deliberate half. Announcements has three
      audience cases (school-wide / whole-grade / own section), Events has two
      (the table has no `target_section` column at all). **Events has exactly
      one filter — Upcoming vs All, built on `from` alone**; `grade_level` is
      AND-ed onto `target_grade`, so for a parent it could only hide the
      school's own posts. `from` is inclusive (`e.event_date >= ?`), so today
      counts, and the value comes from `todayLocalDateString()`, never
      `toISOString()`. **Convention 5f's branch count differs per endpoint and
      that is a finding, not an inconsistency**: Events has three branches,
      Announcements two, Memos one — because the memos handler has no parent
      branch at all and accepts no filters, so it has exactly one cause of an
      empty list.
- [x] **Parent → Grades — DONE 2026-09-07.** The report card, and **the first
      feature page to consume `GradeValue`** (convention 3 existed for four
      dispatches with no caller). One request to
      `GET /api/grades/student/:studentId`, six-key unwrap, no filters, no
      writes. **Both other grades GETs are deliberately not called:** `GET /`
      returns bare grade rows with no subject-coverage overlay, so a subject
      with zero grade rows would silently vanish — the exact confusion the
      report-card endpoint was built to remove; `GET /:id` exists and is
      correctly parent-scoped but would add the WW/PT component breakdown,
      **deferred because whether a parent should see individual raw assessment
      scores is a school policy question nobody has asked** and building it
      would answer it by shipping. **This page SKIPS the request when
      `student_id` is null**, the opposite of the parent content pages, and the
      difference is structural rather than drift: those endpoints take no
      student id, so the server derives the child and skipping would hide real
      posts behind a stale `AuthContext`; here the id goes IN the path and
      `parseId(null)` answers `400 "Invalid student id."`, a developer-facing
      string with no request that could ever succeed. **Convention 5c is
      enforced by SOURCING, not by discipline** — the header comes from the
      report payload's own `student` object, which is exactly
      `{ id, first_name, last_name, grade_level, section }` with no `lrn` in it
      to leak, while `/auth/me` (which does carry `lrn` and `login_id`) is read
      for the path id and nothing else. **Convention 4 held against a live
      temptation:** the API returns
      `{ descriptor: 'Advancing', remarks: 'Passed' }` on every populated Final
      Grade and General Average, and only `descriptor` is rendered — never
      `remarks`, never through `StatusBadge`, never as a colour keyed on the
      band. **`GradeValue` cannot render a descriptive letter** (Finding C —
      `formatGrade('A')` is `NaN → null → "— N/A"`, the string meaning "does
      not apply" on the one value that does), so the letter is handled in a
      local branch and `format/grade.jsx` is untouched; **that branch is
      recorded UNVERIFIED** — no Grade 1 student exists in the seed, so it was
      written from the handler's shape and never exercised. (A Grade 1 student
      was seeded later the same day — Nino — so a parent browser pass can now
      retire that; Teacher → Grades copied the same `TermCell` rather than
      extending `GradeValue`. Extract at three.)
- [x] **Teacher → Grades — DONE 2026-09-07.** Viewing + encoding, both
      numerical (G2–6) and descriptive (G1), **one page** at `/teacher/grades`
      — the teacher does not choose a mode. `grading_mode` comes from
      `GET /api/grades/student/:id` on one roster student after a class is
      picked (option 1 of consequence 4), never from a Grade-1 hardcoded
      check and never by parsing a 400. **Do not reuse `useTeacherTargets`**
      — that hook is assigned-OR-adviser; grades is assignments-only;
      reusing it would offer TCH-002 a class it cannot grade (comment now
      lives in the hook). **No client-side IG preview** — trust the
      round-trip. **`TermCell` copied locally, `GradeValue` untouched**
      (second copy; extract at three). **No lock control** — admin-only,
      would 403 at middleware. **§5e: no confirmation** — encoding is
      repeatable; confirmation would not undo a wrongly-created shell (no
      `DELETE /api/grades/:id`). **Science dead-end:** copy names Record/Edit
      as the discovery click (not picking the subject). Session-memory after
      the first encode 403, marking the picker "(not yours)" before any
      score input is shown. Encode-scope cannot be predicted because
      **no endpoint reads `teacher_assignments`**. **Hole, not fixed:**
      discovery works only when the student has no existing grade row for
      that subject. **Alert XOR** after browser review. **No unsaved-changes
      warning** — every score is its own request. Verified live on throwaways
      `student_id=14` (G6 Malikhain,
      `grade_id=31`, IG 88.05 / TG 90) and `student_id=15` (G1 Mabait,
      `grade_id=32`, letter B); Science POST 403 before scores; Nino's 5
      rows and Marwin's 0 untouched; SQL teardown restored the seeded
      baseline. **No Cursor browser in this dispatch** — SSR + negative
      control + live HTTP; open `/teacher/grades` as TCH-001 / TCH-002 /
      TCH-003 to finish 5h.
- [ ] Remaining teacher pages — contributions
- [ ] Remaining parent pages — records, messages, excuse
      letters, contributions. **Parent → Attendance is BLOCKED**, not
      merely unbuilt: the attendance rate formula is an unanswered
      school question, so the page cannot be designed yet. Parent → Messages
      is the page that closes the `LiveStatus` inverse defect recorded in
      convention 5g
- [ ] Admin pages — user management, sections/adviser assignment,
      settings, backup/restore. **No longer blocked on a missing
      assignments write** — `POST`/`DELETE /api/assignments` shipped
      2026-09-08. Still waiting on items 2–3 (`GET /api/grading-modes`,
      `DELETE /api/grades/:id`) before some admin grade screens.

**Backend work interleaved with Stage 4:**

- [x] Assignments + Subjects API — **DONE 2026-09-08.** `GET /api/subjects`,
      `GET`/`POST`/`DELETE /api/assignments`. 41/41. Items 2
      (`GET /api/grading-modes`) and 3 (`DELETE /api/grades/:id`) are
      **not started** — stop rule: do not begin them until this suite
      is green, which it now is; report before starting either.
- [ ] `GET /api/messages/contacts` **plus the endpoint audit**, together,
      after Teacher → Attendance. Small, and better finished while the
      backend is still fresh than midway through frontend work. The audit
      already has two confirmed items waiting — see OPEN QUESTIONS.

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
- **Should Teacher → Attendance warn before leaving with unsaved marks?**
  Attendance is a bulk submit (`POST /bulk`): a whole roster of picks can
  be lost in one navigation. Teacher → Grades does not warn, because every
  score is its own request and only unsubmitted keystrokes go. A warning
  that fires on every logout regardless of form state is one a teacher
  stops reading. Decide on Attendance specifically; do not copy a blanket
  `beforeunload` onto every encode screen.
- **Grade 1 descriptive grading — is a manual teacher judgment call the
  right model?** Proceeding on this as an assumption (see BLOCKED /
  RESOLVED → Grades module), not a school confirmation: DO 015 defines
  no Initial-Grade-to-letter formula, and the reasoning (descriptive
  grading exists to avoid numerical labeling in KS1) is what justifies
  it, not a school reply. If the school later says a computation feeds
  the letter, `PATCH /:id/descriptive` changes, not the schema.
- **Should a teacher be able to lock their own grade encoding?**
  `PATCH /api/grades/:id/lock` is admin-only as built (Stage G2e) —
  locking is treated as a school-wide finalization boundary tied to the
  End-of-Term Block, not individual teacher discretion, but nothing the
  school has actually said confirms or rules out teacher self-locking.
  Confirm before ever widening `authorize()` on that endpoint.
- **Class Board: an adviser with no subject assignment in their own
  section — NO LONGER THEORETICAL. This entry previously described it as
  theoretical; that description was wrong and is corrected here.**
  `TCH-002` (adviser of Grade 5 - Masigasig, zero `teacher_assignments`
  rows) is exactly this account in the seeded data, and the same root
  cause has now been confirmed to bite for real in `routes/students.js`
  — fixed there 2026-09-06 — and in `routes/excuses.js`, scheduled next.
  The reasoning below about the school's own photographed class programs
  still holds for *production* data; what changed is that the system's
  own fixtures contain the case, so any page built against these
  accounts hits it. Everything from here down is the original entry:
  `teacherHasAssignment()` (the Class Board's posting scope, via
  `content.js`) checks `teacher_assignments` by `grade_level` + `section`
  only, never `sections.adviser_id`. An adviser holding zero subject
  assignments in their own advisory section would be locked out of
  posting there, while a subject teacher with no advisory role at all
  could post freely. Every adviser visible in the school's photographed
  class programs also teaches at least one subject in their own
  section — Jenny Ann B. Dulce teaches TLE and English in VI-Malikhain,
  Girly V. Lacuna teaches GMRC, English and Math in III-Malinis, Maric D.
  Carlos teaches everything in I-Maagap — so the gap appears not to exist
  at this school. **Do not add an adviser-based OR clause pre-emptively.**
  If it ever turns out to be real, the fix is one line
  (`sections.adviser_id = teacherId OR EXISTS(...)`).

- **`teacher_assignments` vs `sections.adviser_id` — the same scope gap in
  three more files. `excuses.js` is SCHEDULED NEXT, not open-ended.**
  Fixed in `routes/students.js` on 2026-09-06 (read scope widened to
  `teacher_assignments` OR adviser; write scope unchanged). The identical
  shape remains in three other files, listed here in severity order so
  none of them reads as unowned:
  1. **`routes/excuses.js` — DONE 2026-09-06.** Was the sharpest instance
     in the system: read scope was `teacher_assignments` while review
     authority is adviser-only, so the adviser was the *only* person
     permitted to review a letter and an adviser without assignment rows
     could not see the queue they alone may act on. All three read sites
     now use the widened clause — **including the existence query inside
     `PATCH /:id/review`**, which is the opposite of the rule in
     `students.js` and the single most important detail of that fix:
     there the equivalent clause *was* the write gate and had to stay
     narrow; here it is only a visibility filter, and the authority is
     the separate adviser query that runs after it. Leaving it narrow is
     what would have kept the bug. The `403`-vs-`404` convention on
     review is unchanged — the widening strengthened its rationale
     rather than disturbing it.
  2. **`routes/content.js` — DONE 2026-09-07.** The Class Board posting
     scope. **This is the one place a WRITE gate was deliberately
     widened**, unlike `students.js` and `excuses.js` which left writes
     alone: the Class Board is a stated school requirement, and an
     adviser who cannot post to their own advisory section cannot
     deliver it. Both widenings stay inside the existing grant — an
     adviser still cannot post school-wide, whole-grade, or to a section
     they neither teach nor advise, all three verified live and asserted
     in `test:content`. It also turned out NOT to use the shared
     predicate: its scoping runs on `target_grade`/`target_section`, so
     it needed its own `sections`-by-grade-and-name clause. The reasoning
     is recorded at the change site in the file, not only here, because a
     future session comparing this against the students fix will see
     writes moving in one and not the other.
  3. **`routes/messages.js` — DONE 2026-09-07.** `canMessage()`, both
     directions. This was the real third occurrence of the shared
     predicate (see `utils/teacherScope.js`). Both refusal messages were
     reworded: "not assigned to your child's class" stated something
     false once an adviser qualified.
  **Known, dated, and owned — not a defect:** between 2026-09-06 and
  whenever `content.js` and `messages.js` land, an adviser can review
  excuse letters and list students for a section they still cannot post
  announcements to or message the parents of. Anyone testing across
  modules in that window is seeing scheduled work in progress, not a
  bug. The inconsistency closes when those two dispatches land.

  **`routes/grades.js` is deliberately NOT on this list.** Its wide view
  scope is also `teacher_assignments`-based, but grade encoding is the
  subject teacher's authority by design, and an adviser is not
  automatically entitled to a section's grades. Widening it would be
  inventing school policy — that needs the school, not a patch.

- **Server-side `401` cleanup — `Account is not active.` should be a
  `401`, not a `403`.** `middleware/auth.js` returns `403` when an
  authenticated token belongs to a deactivated account. That is the one
  403 in the whole API which genuinely means "this session is dead", and
  it is the reason the client interceptor used to redirect on 403 at all
  — a blanket rule that was wrong for the other nineteen origins (see
  STAGE 4 FRONTEND CONVENTIONS §2, now fixed client-side). A token that
  no longer identifies a usable session **is** an authentication failure,
  so the honest status is `401`. Not fixed in the Stage 4 foundation
  dispatch: it is a server file, and the client fix stands on its own.
  Until it lands, a mid-session deactivation shows `Account is not
  active.` in an `ErrorAlert` until the next refresh, at which point
  `AuthContext`'s `/auth/me` check logs the user out. No data renders in
  the meantime — every call is already 403 — and the backend remains the
  enforcement point.
- **Endpoint audit — scheduled, two confirmed items already waiting.**
  Not a vague "review the API someday"; there are two known findings it
  must resolve, both surfaced while building the Stage 4 foundation:
  0. **AUDIT RUN 2026-09-07 — three-way diff, ALL BUCKETS EMPTY.**
     Recorded as a check that ran and came back clean, not as a task
     quietly ticked off: a future session should be able to see it
     happened rather than wonder. Method: every endpoint in CLAUDE.md's
     table, every endpoint in `docs/API_REFERENCE.md`'s tables, and every
     handler actually registered in `server/routes/` and mounted in
     `server/server.js`, diffed three ways.
     **Result — 77 endpoints, all three sources agreeing** (78 with
     `contacts`, built the same day):
       - Bucket A (documented, no handler): **empty**
       - Bucket B (handler, undocumented): **empty**
       - Bucket C (mount/handler orphans): **empty** — all 12 route files
         mounted, all 14 mounted names resolve, no router with zero
         handlers
     The only cross-source difference is `GET /api/health`, which lives in
     `server.js` rather than a route file and is documented in
     API_REFERENCE's prose rather than an endpoint table — a counting
     convention already noted there, not a gap. **Re-runnable:** the diff
     is mechanical and should be repeated after any dispatch that adds or
     removes an endpoint.
  1. **`GET /api/messages/contacts` — was designed but unbuilt, BUILT
     2026-09-07.** It was the only endpoint in that state; the audit
     above confirms nothing else is. Original note follows.
     **`GET /api/messages/contacts` was designed but unbuilt** — the full
     design is recorded in its own section above. It is the only
     designed-but-unbuilt endpoint in the system: every other row in the
     endpoints table was verified to map to real code (76 handlers in
     `server/routes/` plus `/api/health` in `server.js` = the 77 rows
     that table carries).
  2. **`GET /api/students`'s `?status` filter — two problems, one of them
     UNVERIFIED.** Found while building Teacher -> Attendance
     (2026-09-06); not fixed there, that was a client dispatch.
     **(a) Unvalidated.** The logic is `if (status === 'inactive') ...
     else if (status !== 'all') -> active`, so only `'inactive'` and
     `'all'` are matched literals. Everything else — including
     `'active'` itself, a typo like `'activ'`, or omitting the param —
     falls to the active-only default. Confirmed live. A bad value
     therefore returns the default instead of `400`, inconsistent with
     `grade_level` in the same handler, which validates and rejects.
     Low severity (the failure mode is "you get the default"), but it is
     an inconsistency.
     **(b) `?status=all` is UNVERIFIED — the fixtures cannot currently
     test it.** By reading, `'all'` should skip the status filter
     entirely and return active AND inactive rows. A live check returned
     only active rows, which proves nothing: the seed has **zero
     inactive students**, so "all works" and "all is broken" produce an
     identical result. That test could not have failed. Do not record
     this as verified until a fixture with an inactive student exists to
     distinguish the two. **An audit entry claiming "verified fine" when
     the fixture could not fail is worse than no entry.**
  3. **Contacts shows nothing when every candidate parent is pending —
     a STAGE 4 question, not a backend one.** `GET /api/messages/contacts`
     lists active accounts only (correct — a pending parent cannot log
     in). But a teacher whose section's only parent is pending gets an
     empty list with no explanation, and cannot tell "nobody to message"
     from "something is broken". The Messages page will need to say so —
     probably by naming that a parent's account is awaiting approval.
     Recorded here so the backend behaviour is not "fixed" into listing
     unreachable accounts.
  4. **`docs/API_REFERENCE.md`'s `user` row lists `GET /api/users`, and
     that is a doc slip.** Verified live this session: the endpoint
     returns `success, users` only — there is no `user` key alongside the
     array. The reference doc was not corrected at the time because it
     was outside that dispatch's whitelist; the correction is the audit's
     to make, and it now arrives with the answer already in hand.
- **The four school questions remain unanswered**, gathered here because
  they are the standing blockers rather than one-off notes: Grade 1's
  A–E derivation (see the Grades module assumption above), Grade 4's
  learning areas (seeded as inferred, not confirmed), who may lock a
  grade (built admin-only), and the attendance rate formula. **Only the
  last one blocks a screen** — Parent → Attendance, marked `blocked` in
  `layout/nav.js` with that reason as its tooltip. The other three are
  answered-by-assumption in code that works today and would change one
  handler each, not the schema.

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
| 2026-09-08 | **Assignments + Subjects API — item 1 of the admin-prerequisites plan, shipped alone.** Four handlers in `routes/assignments.js`: `GET /api/subjects` (any authenticated, unscoped 40-row curriculum, optional `?grade_level=`), `GET /api/assignments` (teacher own-only, admin anyone), `POST /api/assignments` (admin), `DELETE /api/assignments/:id` (admin). **`grade_level` comes from the subject row, never `req.body`** — same rule as `role` and `student_id`. POST resolves `section` against `sections` (name + subject's grade + `academic_year`) and stores `section_id` on this row only; that is a write on `teacher_assignments`, not a new `section_id` reader elsewhere. Duplicate is `409`. Teacher/inactive/non-teacher targets are `400` naming the check. **DELETE does not refuse when grades exist** — there is no `grades` → `teacher_assignments` FK, so the delete cannot touch grade rows, and mid-year reassignment must not wipe SF9 data. Recorded as one principle with two siblings: message history survives a `canMessage()` change; the subjects-reseed CASCADE is the opposite (destroying `subjects.id` wiped assignments *and* grades). A scope change removes future authority, never past records. **Teacher naming another `teacher_id` on GET is `403`, not `404`** — stated in the file: anti-enumeration does not apply because `GET /api/messages/contacts` already lists every teacher this caller may see, by name. A 404 would hide nothing and cost clarity. Wrapper keys `subjects` / `assignments` / `assignment`. `npm run test:assignments` — 41/41, confirmed twice, no `db:setup` between; TCH-003's five Mabait rows and Nino's five Grade 1 grades untouched; TCH-002 empty-list invariant restored after the mid-suite POST. No client files. **Items 2 (`GET /api/grading-modes`) and 3 (`DELETE /api/grades/:id`) not started** — stop rule. |
| 2026-09-07 | **Teacher → Grades browser review — two defects, one hole recorded not fixed.** (1) `saveError` and `saveMessage` were independent slots; a successful exam save left the green strip, then a client-side "Label is required." on Add score set the red without clearing it — both visible, two operations, no way to tell which landed. Fixed: XOR render (error wins), every writer including validation early-returns clears the other, `closePanel` clears both. Splitting them under exam vs add-score was rejected as the same bug in a different shape. (2) Copy said "picking a subject you do not teach will mark it here"; the code marks only after Record/Edit `POST /` 403. Selecting Science loaded the roster (view-scope GET) with Record still enabled — not a missed 403, a claim the code did not honour. Copy now names Record/Edit. **New convention 5i** next to 5h: explanatory copy is a claim about behaviour; overstating it costs a review round chasing a bug that does not exist. **Existing-row hole recorded, not fixed:** `ensureShell` skips POST when a grade row already exists, so discovery works only for students with no row for that subject — most of a real mid-term class. Do not probe on subject change (no `DELETE /api/grades/:id`). Assignments endpoint retires it. **No unsaved-changes warning** on this page (every score is its own request); Attendance bulk-submit recorded as the open question that would warrant one. Browser re-test passed (Science + Araling Panlipunan marked, alert XOR, IG Pending without WW). **Carlo Fixture torn down** (`student_id=16` LRN `61990001`, `grade_id=33` + PT component) — students back to 3, `grade_components` 0. No server files. |
| 2026-09-07 | **Teacher -> Grades — viewing + encoding, one page.** Route `/teacher/grades`, `built: false -> true` with the route. The teacher does not choose a mode: after a class is picked, `GET /api/grades/student/:id` on one roster student supplies `grading_mode` and the subject list (consequence 4 option 1). Empty roster copy names the empty class ("no students, nothing to grade"), not undiscoverable mode. **Do not reuse `useTeacherTargets`** — assigned-OR-adviser vs assignments-only; comment now lives in the hook because TCH-002 would be offered Masigasig. **No client-side IG preview** — a copy of `gradeComputation.js` would drift; IG/TG come from the server after save. **`TermCell` copied from Parent → Grades, `GradeValue` untouched** (second copy; extract at three). **No lock button** — admin-only, 403 at middleware. **§5e: no confirmation** — encoding is repeatable; confirmation would not undo a wrongly-created shell (no `DELETE /api/grades/:id`). **Science dead-end:** copy next to the subject selector plus session-memory after the first `POST /` 403, marking the picker "(not yours)" before any score input is shown. Encode-scope cannot be predicted because no endpoint reads `teacher_assignments` — that endpoint is what retires this, not a client filter. Verified live: throwaway `student_id=14` LRN `61001990` G6 Malikhain, `grade_id=31`, IG **88.05** / TG **90** from the real write path; Science POST 403 *before* scores; throwaway `student_id=15` LRN `11001990` G1 Mabait, `grade_id=32`, letter B, numerical columns null; Nino's 5 rows and Marwin's 0 untouched. SQL teardown: `DELETE FROM grades WHERE student_id IN (14, 15)` then those student rows; baseline restored (7 users / 3 students / 5 grades / 0 components / 8 assignments). SSR + negative control (`useEffect` not defined). `npm run build` clean; `oxlint` 18 → 21, three fetch-effect advisories. **No Cursor browser** — open `/teacher/grades` as TCH-001 / TCH-002 / TCH-003. No server files. |
| 2026-09-07 | **Grade 1 descriptive fixture seeded — persistence was the gap, not coverage.** The demo on 2026-09-18 needs a Grade 1 student; Parent → Grades' local letter branch was recorded UNVERIFIED because nothing in the seed could produce a descriptive report card a parent can log in and see. **The write path was already covered** (`test:grades` G2d + a throwaway Matipid student deleted in `finally`; `test:grade-computation` Table 8). What evaporated was the fixture. **TCH-003 (Lito Bautista), not TCH-002:** TCH-002's whole value is being assignment-less — `test:messages` asserts it sees zero parent contacts because Jea's parent is pending, and adding an active Grade 1 parent under that account would flip the assertion and send the next reader hunting a scope bug. Grades encode-scope is `teacher_assignments` only, so an adviser with no assignments cannot encode a letter. TCH-003 therefore advises Grade 1 - Mabait AND is assigned all five Grade 1 subjects there. **Mabait, not Matipid:** the grades suite raw-inserts `(TCH-001, Grade 1 Mathematics, Matipid)` every run; a seeded row on that tuple would die on `uq_teacher_assignment`, and the demo student must not share a section with fixtures that are created and destroyed. **Partial card, letters chosen by hand:** Mathematics A/B/C (all three terms), Reading D/E (term 3 blank), GMRC/Language/Makabansa untouched. That puts letters, Pending, and N/A on one screen. The seed comment states they are illustrative fixture data, not a computed result — if the school later says a computation feeds the letter, `PATCH /:id/descriptive` changes, not this seed and not the schema. **`schema.sql` unchanged** — the ENUM, the mode row, the five subjects, and four Grade 1 sections already existed. **`test:grades` keeps its throwaway write fixture** and adds read-only assertions against 1090001; a suite that writes on the demo student is a suite that can break the demo — that reasoning is in the test file, not only here. **Seeded baseline is now stated once** in CURRENT STATE (this file's first real test of the one-number-one-place rule). **KNOWN ISSUES: grading_mode discovery recorded as consequence 4 of the same shape as the `teacher_assignments` finding** — no endpoint exposes `grading_mode` for a grade level, so a Teacher → Grades encode screen has three bad options (report-card endpoint, parse a 400, hardcode Grade 1). Not solved here. Finding C's fixture chain is gone; the UI letter branch is still unverified in a browser (this dispatch touched no client file). Open `/parent/grades` as `1090001` / `Parent@2026` to retire it. |
| 2026-09-07 | **Parent -> Grades — the report card, and the FIRST FEATURE PAGE TO CONSUME `GradeValue`.** Convention 3 was written into the Stage 4 foundation on 2026-09-06 and sat with no caller through five feature dispatches; this is the page it was written for. One page file, one route, one `built: false -> true` nav flip landing with its route per convention 6, plus the `ParentDashboard` copy fix folded in. **ONE REQUEST, and the two endpoints NOT called are the more interesting half.** `GET /api/grades/student/:studentId` with a six-key unwrap (`student`, `school_year`, `grading_mode`, `subjects`, `general_average`, `general_average_descriptor` — this endpoint has no `grade`/`grades` wrapper at all, which was verified live rather than read off API_REFERENCE, and `general_average_descriptor` is included specifically so the missing-key guard still covers a field the page renders; the array form's guard uses `hasOwnProperty`, so `general_average: null` — the state for most of the school year — passes rather than throwing). **`GET /` is deliberately not called**: it returns bare grade rows with no subject-coverage overlay, so a subject with zero grade rows would simply not appear, which is the exact confusion the report-card endpoint exists to remove — it selects from `subjects` by `grade_level` and overlays whatever grades exist, so a missing subject and an unencoded one are never confused. **`GET /:id` is not called either, and that one is a deferral rather than a rejection**: it exists, it is correctly parent-scoped, and it would supply the WW/PT component breakdown — but whether a parent should see individual raw assessment scores rather than the term grade the SF9 prints is **a school policy question nobody has asked**, and building it would answer that question by shipping. The follow-up stays cheap: `grade_id` is already on every term entry in this payload, so it needs no new endpoint and no lookup. **THIS PAGE SKIPS ITS REQUEST WHEN `user.student_id` IS NULL — the opposite of the parent content pages, and the difference is structural, not drift.** Announcements/Memos/Events always fetch because their endpoints take no student id at all: the server derives the child from the DB row, so skipping would hide real posts behind a stale `AuthContext`. Here the child id goes IN the path the client constructs, and `parseId(null)` answers `400 "Invalid student id."` — verified live — a developer-facing string that would surface to a parent in an `ErrorAlert` as though the app were broken. There is no request that could succeed, so skipping hides nothing. `loading` is cleared in the SAME turn as the skip; leaving the initial `loading=true` hanging would park the page on a spinner forever. **Proven in the browser two ways: the link-slash copy rendered (not a spinner, not an error), and the error branch and the empty branch are mutually exclusive — so seeing the empty copy is itself proof the request never left, independent of the Network tab.** **CONVENTION 5c IS ENFORCED BY SOURCING RATHER THAN BY DISCIPLINE, which is the stronger form.** The header renders from the report payload's own `student` object, asserted live to be exactly `{ id, first_name, last_name, grade_level, section }` — **there is no `lrn` key in it to leak**. `/auth/me` DOES carry `lrn` and `login_id` (the same credential: a parent's `login_id` IS their child's LRN), and `useAuth()` is read for the path id and nothing else. The route is `/parent/grades` with no `:id` at all, since a parent has exactly one child. **CONVENTION 4 HELD AGAINST A LIVE TEMPTATION, not a hypothetical one.** `qualitativeDescriptor()` returns `{ descriptor, remarks }` and the API sends `remarks: 'Passed'` on every populated Final Grade and General Average — asserted in verification precisely to record that the data is right there. Only `descriptor` is rendered: never `remarks`, not as text, not through `StatusBadge` (the page does not import it), and **never as a colour keyed on the band**, since tinting "Emerging" red is a verdict expressed in CSS rather than in words. The band word itself is DepEd's own SF9 vocabulary and a deterministic restatement of the number — `routes/grades.js` quotes GRADING_SPEC §6b directly ("the parent dashboard should show the numeric grade AND the descriptor"). **The browser review produced better proof of this than any assertion did:** with all eight subjects populated, seven read `Advancing` and Mathematics read `Benchmarking`, because 89.67 falls in the 80-89 band and 90.00+ falls in 90-100 — the descriptor is genuinely looked up per subject from the value, and "Passed" appeared nowhere on a screen where the API had sent it eight times. `is_locked` is on every term entry and is deliberately NOT rendered: a parent cannot act on it, and it reads either as "final" (a promise the system should not make, since an admin can unlock) or as "hidden from you" (false). **FINDING C — `GradeValue` HAS NO BRANCH FOR A DESCRIPTIVE LETTER, recorded and NOT fixed.** Its own header names four states (a number, null-numerical, null-descriptive, error) and a letter is not one of them: `formatGrade('A')` is `Number('A') -> NaN -> null`, so a real Grade 1 term grade of `A` would render as `"— N/A"` — the string meaning "this does not apply" — on the one value that does. That is outside `GradeValue`'s stated contract rather than a bug inside it, so the letter is handled in a local branch and **`format/grade.jsx` was not touched**; close the gap in the primitive the day a descriptive page is actually built. **THAT BRANCH IS RECORDED UNVERIFIED AND MUST NOT BE READ AS TESTED.** No Grade 1 student exists in the seed, so producing a descriptive report card needs a fixture chain of student + parent user + approval + descriptive grade rows; the branch was written from the handler's shape and never exercised. An entry claiming "verified" when the fixture could not fail is worse than no entry — same discipline as the `?status=all` audit item. One sub-decision inside it worth recording: an unrecorded descriptive letter renders via `GradeValue`'s **Pending** state, not its N/A state, because `mode` names the REASON a null renders rather than the grade level a student sits at, and "not yet recorded" is Pending — calling it N/A would tell a Grade 1 parent their child's term grade is inapplicable when it merely is not in yet. **CONVENTION 5f, and the finding is that the OBVIOUS EMPTY STATE IS STRUCTURALLY UNREACHABLE.** `subjects` is selected from the `subjects` table by `grade_level`, and the seeded curriculum is 5/5/6/8/8/8 for Grades 1-6, so for any linked parent at any seeded grade level the table always has rows. **A "no grades yet" empty state would therefore be dead code that, if it ever DID fire, would hide a real all-`Pending` report card** — the worst possible failure for the one screen this module exists to produce. Verified live before any fixture existed: with `grades` at 0 rows the endpoint returns 8 subjects, every term `null`, every Final Grade `null`, `general_average` `null` — **that is the normal state today and it renders as eight rows of "— Pending", NOT as an empty state.** Four causes, one branch each: unlinked account, request failed (`DataTable`'s error frame, which also covers the `409` naming a missing `grading_mode_configs` row), loaded with every term null (the table), and loaded with zero subjects (copy names curriculum configuration, the only thing that could produce it). No reset offered in either empty branch — there is no filter for a reset to change. **NO FILTERS, each declined for its own reason rather than as a blanket call:** `student_id` is fixed and naming another child is `403`, so a control whose only other value is a refusal is not a filter; `subject_id` and `term` would filter eight visible rows, which is what the eye already does, and this endpoint does not accept `term` anyway; `school_year` IS accepted and defaults to `system_settings.academic_year`, but the seed holds exactly one year and **no endpoint anywhere lists the years that exist**, so a picker is either a free-text box that mostly generates 400s or a hardcoded list that invents data. Revisit trigger recorded: a second `school_year` in `grades`, or an endpoint exposing the available years. **General Average appears ONCE, outside the table — and the reason is mechanical rather than aesthetic:** `DataTable` sorts every row it is given, so a "General Average" row would sort alongside the subjects it summarises, landing under G alphabetically or drifting into the middle of a grade sort. **`sortValue` on Final Grade reads `row.final_grade`** so `DataTable`'s nulls-last rule runs on the real value rather than on rendered markup — worth knowing that nulls-FIRST-on-descending was a real bug in that comparator, and sorting Final Grade descending to find best marks is the exact case it broke. `keyField="subject_id"`. Only Subject and Final Grade are sortable: "sort by Term 2" is not a question a parent has, and the inconsistency is deliberate. **Conventions that do not apply, stated as findings:** 5b (no input writes record state — this page has no inputs at all, only two sort headers), 5e (nothing to confirm, no writes), 5d (the descriptors arrive already capitalised from DepEd's own vocabulary, so there is nothing to re-case). **5g confirmed unchanged:** flipping `/parent/grades` to `built: true` does NOT produce a Messages badge — `UnreadProvider` is gated on `enabled={messagesBuilt}` and parent Messages is still `built: false`, verified on screen. The `LiveStatus` inverse (strip visible to a role with no Messages page) is **still deliberately left alone** and still belongs to the Parent → Messages dispatch, which needs the gate removed anyway; fixing it here would be the flip-the-flag-later failure convention 6 forbids. **`ParentDashboard` copy DERIVED from `navForRole('parent')`, not written out.** "No modules built yet." was true when written and silently became false the moment Announcements shipped — a hardcoded list would just move that failure one dispatch later, since the next page to land flips a `built` flag and forgets the sentence. Filtered on `built && !blocked && to !== '/parent'`: the path filter drops Dashboard (the page would otherwise list itself) and `!blocked` drops Attendance, which is wrong to advertise even after its flag flips. Renders "Open now: Grades, Announcements, Memos, Events." **Verified: 32 live API checks, every one passing**, covering the baseline all-null card, the six-key shape, the absent `lrn`, the `403`/`404` split (`GET /grades?student_id=2` is `403` — an explicit contradiction, not silently overridden — while `GET /grades/student/2` is `404`, anti-enumeration), `parseId`'s `400`, and the parent write refusal. **A 24-row fixture chain built through the real write API**, not direct inserts: admin `POST /api/grades` for the shell rows, then WW + PT components and the ST1/ST2/TE exam as **TCH-001, the genuine subject teacher, for Mathematics/English/Filipino** and as admin for the five subjects no `teacher_assignments` row covers. Arithmetic hand-checked at both aggregation levels: Mathematics term grades 89/91/89 -> Final Grade **89.67**, and the General Average of all eight Final Grades -> **90.21**. The NULL-until-complete rule was proven at both levels rather than assumed — English with 2 of 3 terms kept `final_grade: null` (not a running average), and `general_average` stayed `null` with 7 of 8 subjects complete and populated only when the eighth landed. **Three browser states reviewed, with a DB flip between each**, because every interesting state of this page is a state of the DATA and no input can drive them: fully populated (numbers, per-subject descriptors, populated GA), one term deleted (real numbers and `— Pending` side by side, a null Final Grade, a null GA, the legend line visible), and unlinked. **5h satisfied by opening the page as `13567454`; SSR plus a negative control is recorded as the backstop, not the proof** — the SSR run rendered both `GradesPage` and `ParentDashboard` without throwing, and reinstating a deliberately missing `useMemo` import reproduced `ReferenceError: useMemo is not defined`, the same defect class as the `Shell.jsx` blank-page bug, proving the check was not vacuous before restoring. **Teardown by direct SQL, because there is NO `DELETE /api/grades/:id` anywhere in the API** — flagged as a backend finding, not fixed. `DELETE FROM grades WHERE student_id = 1` removed all 23 remaining rows and `grade_components` cascaded to 0 via `fk_grade_components_grade`; both tables confirmed back at 0, users 5, students 2, `teacher_assignments` 3, and the parent's `student_id` restored to 1. `activity_logs` deliberately left. `npm run build` clean; `oxlint` 17 -> 18, the single addition being the same `set-state-in-effect` fetch advisory every other page carries. Both throwaway harnesses deleted. **MEASURED BUILD TIME, seventh data point: 37 minutes 26 seconds — roughly 24 minutes agent work and roughly 13 minutes of the clock running idle waiting for browser-review replies, and that split must be read with the number.** The idle time is not padding to excuse away (5h says a page is not done until it is opened, and this one was opened in three data states) but it is a different cost from building or verifying, and it scales with how many states need a human eye. **The carry-forward is not the minutes but why a report card costs three browser states where an announcements list cost one:** every interesting state here is a database configuration of the same component with no input to drive it, so it can only be walked through by writing rows and deleting them — and **every remaining Parent page has that shape**, being read-only views of teacher-authored data. `git status` matched the whitelist exactly: one new page file, `App.jsx`, `layout/nav.js`, `ParentDashboard.jsx`, `CLAUDE.md`, `docs/PROJECT_PROGRESS.md`. **No server files, `format/grade.jsx` untouched, `Shell.jsx` untouched, `API_REFERENCE.md` untouched** (its grades parent rows were checked against the live responses and found accurate — unlike the content/students scope labels, no correction was owed). |
| 2026-09-07 | **Parent -> Announcements, Memos and Events — the first parent-facing feature pages, and the first Stage 4 dispatch with NO WRITE AFFORDANCE ANYWHERE.** Three page files under a new `client/src/pages/parent/`, three route registrations, three `built: false -> true` nav flips landing with their routes per convention 6. **Every write on all three routers is teacher/admin-only, so a parent never reaches a handler — `authorize()` answers `403 "Access denied."` first, verified live for all nine combinations (POST/PUT/DELETE x announcements/memos/events).** That generic refusal is precisely why the control must not exist rather than be shown and handled: a scope refusal at least explains itself, `"Access denied."` does not, so a parent clicking a compose button would get a dead end with no reason in it. Same anti-dead-end rule as the Students page's absent Edit. **FULL TEXT OPENS IN A MODAL, NOT A DETAIL ROUTE, and the reason is a backend finding: there is no `GET /:id` on any of the three routers.** Verified live — `/announcements/52`, `/memos/13`, `/events/47` all answer `404 "Route not found."` from `server.js`'s app-level fallback, not a scope refusal, because no handler is registered at that path. This is the stronger form of the Excuse Letters modal decision: there `GET /:id` existed and returned strictly LESS than a list row, here it does not exist at all, so a detail ROUTE would have to fetch the whole collection and filter in JS. The modal costs no request either way, since each list row is already `SELECT a.*` / `SELECT *` / `SELECT e.*` and carries every column the modal renders — asserted directly rather than assumed. Recorded in KNOWN ISSUES with the trigger to build them: a shareable link to one post, which no modal can provide. **AUDIENCE LABELS ARE DERIVED FROM THE TARGET COLUMNS' NULLNESS, and declining the alternative is the deliberate half.** `/auth/me` does return `grade_level` and `section` for a parent — confirmed from the live payload — so labelling "Grade 6 - Malikhain" was available and was not used: it teaches a parent the routing model in exchange for nothing they can act on. **Announcements has THREE cases, not two** (`target_grade IS NULL` -> "For everyone at the school", `target_section IS NULL` -> "For your child's year level", both set -> "For your child's class") — collapsing whole-grade into "your child's class" would be wrong for an admin's whole-grade post, which the API explicitly permits and which the verification fixtures included specifically to prove the third case exists. **Events has TWO**, because the `events` table has no `target_section` column at all — the schema correction first recorded on 2026-08-27, surfacing in the UI for the first time. **ONE FILTER ACROSS THREE PAGES, and each absence is a decision.** Announcements: none — `grade_level` and `section` are AND-ed straight onto the target columns, so `a.target_grade = 6` is FALSE for a school-wide post and the filter could only ever HIDE the school's own announcements, which is not a question anyone has; `category` is unvalidated free text with no allow-list, so a dropdown would mean inventing an enum. Memos: none available — `GET /api/memos` accepts no query parameters, and **verified live that `?grade_level=1` returns `200` with the full unfiltered list where the same param `400`s on the other two routers**, now recorded as its own KNOWN ISSUES row: three sibling routers in one file disagreeing about whether an unrecognised filter is an error or a no-op. Events: **Upcoming vs All, built on `from` alone.** `from` is inclusive (`e.event_date >= ?`), so today's event counts as upcoming — verified with a fixture dated exactly today, which is the behaviour a parent expects on the morning of the event. The value comes from `todayLocalDateString()`, never `toISOString()`, per `client/src/format/date.js`'s record of the two UTC bugs this project has already paid for. **When the range is All, `from` is OMITTED ENTIRELY rather than sent empty** — `content.js` gates on `if (from)` so an empty string would be skipped anyway, but sending a parameter that means nothing is how a filter starts lying about what it asked for. The select IS the applied value: no draft, no Apply button, unlike the teacher events page whose three controls only make sense committed together. **CONVENTION 5f's BRANCH COUNT DIFFERS PER PAGE — three, two, and one — and that is a finding about the endpoints rather than an inconsistency in the pages.** Events has three (unlinked account / Upcoming empty / All empty), Announcements two, Memos exactly ONE. The cause was verified live by nulling the parent's `student_id` and re-reading all three endpoints: **announcements and events return `200` with zero rows** (the handlers call `getStudentClass()` and short-circuit on null — not an error, which is why the page must not render one) **while memos STILL returns every row**, because that handler has no parent branch at all. So a parent whose account is not linked to a student sees all memos and no announcements or events, which is why one page has a single honest branch and another has three. A reset action appears only in the branch where resetting would change the result — never on "nothing exists at all", which is a dead end. `student_id` was restored to `1` and confirmed. **`user.student_id` chooses the empty COPY; it never gates the request.** Skipping the fetch because an account "looks unlinked" would hide real posts behind a stale `AuthContext`, which only re-reads `/auth/me` on mount. **Conventions applied, including the three that DO NOT and why that is a finding rather than permission to skip:** 5b does not apply — it bites when a column showing stored state sits beside an input mutating the same object, and these pages have no input that writes content at all (the Events select is query state, not record state); 5e does not apply — it decides whether a WRITE needs confirmation, and there is no write; 5g does not apply to the pages themselves, since nothing on them is channel-fed. 5c does apply and is the sharpest: **`/auth/me` returns `lrn` AND `login_id`, which for a parent are the SAME credential under two names** — the child's LRN is the parent's login id — and neither is rendered anywhere, nor is any id in a URL. Recorded as its own KNOWN ISSUES row, because 5c's rule now has to be policed on two keys rather than the obviously-named one, which is the same aliased-name failure mode `sanitizeUser` was hardened for on the password column. 5d applies as a no-op with one deliberate exception noted in-file: `category` is free text and is rendered exactly as stored, since 5d's casing permission covers only values whose stored form is lowercase BY SCHEMA. 5h applies and drove the verification — see below. **`posted_by` is deliberately not rendered, and this is the third finding:** none of the three list queries joins `users`, so a row carries a bare `posted_by: 2`, and `GET /api/users/:id` is `authorize('admin')` — so no teacher or parent client can turn that integer into a name even with a second request. Consequence stated rather than papered over: **no parent-facing page can currently say who posted an announcement**, which is the one attribution a parent would plausibly want; these pages answer it indirectly through the audience label. `attachment_url` is not rendered either — the column exists on `announcements` and `memos`, nothing uploads, same call as the excuse-letter attachment. **`DataTable` and `Modal` were consumed exactly as built — no primitive gained a prop.** Two candidate extensions were declined and both are recorded so they are not re-argued: `onRowClick` (the title cell is a `<button type="button">`, the Students-page pattern — adding whole-row clicking for the first pages that want it would shape a shared primitive around its callers) and `defaultSort` (the API returns `event_date DESC`, which puts the most distant future event ABOVE today's — wrong for Upcoming, so the **page** sorts the array it owns before handing it down; `DataTable` copies before sorting and never mutates, and its sort starts `null`, so the page order holds until a header click and the third click clears back to it). Modal scrolling is a wrapper in the page (`max-h-[70vh] overflow-y-auto`, `size="lg"`), not a new Modal prop — without it a long announcement pushes the panel past the viewport and takes its close button with it. **VERIFIED IN THREE LAYERS, and the middle one is new.** (1) `npm run build` clean; **`oxlint` 14 -> 17, the three additions being the same `set-state-in-effect` fetch advisory every other page carries, one per page** — confirmed by listing every finding by file, not by trusting the total: exactly three come from `src/pages/parent/`. **The baseline was 14, not the 13 the Messages entry recorded** — that count was taken before the same dispatch's browser-review round added `realtime/UnreadProvider.jsx`, which carries two findings of its own (`only-export-components`, the same shape `AuthContext` has, plus one `set-state-in-effect`). Corrected here rather than left as an off-by-one that the next dispatch would inherit and re-derive. (2) **Convention 5h's render proof, run INSIDE the clock for the first time:** all three pages SSR-rendered inside `MemoryRouter` + `AuthProvider` via a throwaway Vite `ssrLoadModule` harness, **with a negative control** — `useState` was removed from the Announcements import, which reproduced `ReferenceError: useState is not defined` while `npm run build` STILL SUCCEEDED, demonstrating 5h's exact claim again rather than restating it — then restored and re-confirmed. A targeted `npx oxlint -D no-undef src/pages/parent` also came back clean, the rule that would have caught the previous dispatch's blank-page bug; **the rule is still not enabled project-wide, deliberately, for the reason already recorded — that is its own dispatch.** Harness deleted. (3) **35 live API checks against 9 fixtures**, all passing: four announcements (school-wide from ADMIN001, section-targeted from TCH-001, whole-grade from ADMIN001, and a Grade 5 - Masigasig **isolation** fixture), one memo, and four events (school-wide future, Grade 6 dated exactly today, a Grade 6 past event with a NULL description to exercise the modal's "No further details.", and a Grade 5 isolation fixture). **The isolation property was asserted in both directions on both endpoints** — the Grade 5 posts are absent from the parent's announcements, absent from Upcoming events, and absent from All events, so widening the range does not widen the scope. All nine deleted afterward; `announcements`, `memos` and `events` confirmed back to 0 rows, users 5, students 2. **MEASURED BUILD TIME, sixth data point: 13 minutes 14 seconds (15:40:35 -> 15:53:49) — and the jump is not about the pages.** Judged on what was BUILT this is the cheapest of the six dispatches: three read-only pages, zero new primitives, zero new helpers, zero new dependencies, no write path, no shared-layout change. Judged on the clock it is the most expensive by a factor of three, and the entire gap is verification. **This is the first point measured with 5h's render proof inside the window** — 5h was written at the END of the Messages dispatch, after its 4m4s was already recorded — so **the five earlier points are not comparable to anything measured from here on**, which is a stronger statement than the "not a rate" caveat every point has carried so far. Recorded with the full composition column, and with the instruction that a seventh point should be compared to this baseline, not to Messages. **One client finding recorded and DELIBERATELY NOT FIXED: convention 5g's inverse is now live.** `LiveStatus` renders in `Shell` ungated while `UnreadProvider` is gated (`enabled={messagesBuilt}`), so Parent — a role that now has pages, no Messages page, and correctly no badge (verified: the request is genuinely skipped) — could see a "Live updates paused" strip referring to a channel nothing on their screen consumes. Gating it on `messagesBuilt` is one line and would be correct today and wrong the day Parent -> Messages lands, at which point somebody has to remember to ungate it — the same flip-the-flag-later failure convention 6 forbids. **So it belongs to the Parent -> Messages dispatch, which must remove the gate anyway, not to a cleanup pass.** Noted that this is the harmless direction of the error: 5g's own argument is that a channel dying silently is worse than one saying so, so an over-broad notice fails safe where an absent one does not. **Six backend findings flagged, none fixed — no server file was touched, confirmed by `git status`.** Four are new KNOWN ISSUES rows (no `GET /:id` on the three routers; memos ignoring unrecognised params where its siblings `400`; `posted_by` unresolvable by any non-admin client; `/auth/me` returning the same credential as both `lrn` and `login_id`); the other two are the already-recorded `attachment_url` dead schema and `docs/API_REFERENCE.md`'s stale scope labels, which stay untouched — that is a backend-docs dispatch. Also corrected while in CURRENT STATE: the React web app section still read **"No feature page has been built yet"**, which had survived five dispatches and seven teacher pages — exactly the drift the warning at the top of this file exists to catch. `git status` matched the whitelist: `client/src/pages/parent/` (three new files), `client/src/App.jsx`, `client/src/layout/nav.js`, `CLAUDE.md`, `docs/PROJECT_PROGRESS.md`. Branch `feature/parent-content`, off `main`. |
| 2026-09-07 | **Teacher -> Messages — the seventh Stage 4 page, and the first to use Socket.io.** Conversation list at `/teacher/messages` plus a thread route at `/teacher/messages/:userId`; "Post to class" deliberately NOT built (a later dispatch, and it pre-fills the ANNOUNCEMENTS composer rather than adding one here). **First new runtime dependency since the foundation: `socket.io-client`, pinned exactly to `4.8.3` to match the server's socket.io** — flagged before adding rather than slipped in. **First feature dispatch to touch `Shell.jsx`**, because the unread badge belongs on the nav item, which lives there. **What the server actually does, read from the files rather than the design note:** `server/socket.js` authenticates the CONNECTION once from `handshake.auth.token` and re-reads `users.status` from the DB (a deactivated account never gets a live socket), auto-joins room `user:<id>` with no join event to call, and `routes/messages.js` emits exactly one event — `new_message`, the full persisted row, to the RECIPIENT's room only, never the sender, never a broadcast, and no socket event accepts a write. **So the socket is a latency optimisation, not the delivery mechanism**: REST persists before emitting, and an emit into an empty room is a no-op, so a message to an offline recipient is not lost — it simply arrives on their next fetch. **New convention 5g — when a live channel fails, say so; never fake liveness.** The provider exposes `connected` and `LiveStatus` renders a persistent "Live updates paused" strip with a Refresh action, rendering nothing while healthy. **No polling fallback, and the reasoning is the load-bearing part:** polling every few seconds would burn requests to disguise a state the user should simply know about, converting an honest "this is paused" into a dishonest "this is live" — and a parent-teacher channel that looks delivered and is not is the specific failure this module cannot afford, because a teacher who believes a parent has seen a message about their child has been misled by the interface into a wrong belief about a real conversation. Recorded as a general convention rather than a page detail, so any future real-time surface inherits it. **No optimistic append (convention 5b in its messaging shape):** the composer holds an unsent draft in its own state, the thread array holds ONLY server-returned rows, and a sent message appears after the POST resolves using the row the API returned. An optimistic append would put an unsent message into the list that renders stored messages, and a failed POST would leave a message on screen that does not exist. The visible round-trip is the correct cost. **Unread is server-derived and cleared by a request, never decremented locally** — opening a thread issues `PATCH /read-all/:userId` and then refetches, because a badge maintained in client state while the server still holds those rows unread is the same defect family as the attendance RECORDED column. **The badge renders ONLY on a built nav item**, which is the addition this dispatch needed beyond the plan: `Shell` renders for all three roles, so once the badge existed it would have appeared on Parent and Admin too, both `built: false` today — and a count on a dimmed, unclickable entry is worse than no count, since it announces something the user cannot go and read. `useUnreadMessages` skips the request entirely for a role whose Messages page is unbuilt. **Live for TEACHER only today, and it becomes live for Parent and Admin automatically when their pages land and their flags flip** — recorded in `Shell.jsx` and in convention 6 so neither dispatch duplicates it or wonders why it is missing. **History survives a scope change; new messages do not.** `GET /with/:userId` is participant-scoped and deliberately not re-checked against `canMessage()`, so a thread stays readable after a teacher's assignment changes, while `POST` would `403` — the page disables the composer with the server's own reason and keeps the history readable. That asymmetry is intentional in the API and is now stated in the page. **Contacts' live shape differs from the design note in two ways worth recording:** `subject` is a comma-joined STRING ("English, Filipino, Mathematics"), not an array, and `unread_count` is already on the contact row, so contacts and conversations carry overlapping state. Parent rows LEAD with the student name ("Marwin Conde — parent: Ashley Geguiera"), because a guardian's own name may mean nothing to a teacher looking for "Marwin's parent". **A third consequence of the same missing endpoint was folded into the existing `teacher_assignments` finding rather than logged separately:** `GET /contacts` cannot distinguish "this teacher has no students" from "every parent of their students is still pending", so the UI's "No parents yet — a parent appears here once an admin approves their account" is a **known imprecision** — a teacher with genuinely no students is told to wait for an approval that is not coming. Saying nothing would be worse (an unexplained empty group reads as broken), and the honest fix needs a backend signal about a teacher's own scope that does not exist. Recorded as the THIRD symptom of one root cause, to be closed by whatever finally exposes teacher scope rather than patched alone. **`docs/API_REFERENCE.md`'s Messages block is NOT stale** — unlike students/excuses/content, its rows correctly say "any authenticated", because `canMessage()` is a per-recipient check rather than a role scope. Stated explicitly so the known-stale note is not assumed to apply here. **Verified end to end headlessly, including the realtime path**, with a throwaway script run from `server/` and deleted after: both accounts' handshakes accepted; a REST POST from the teacher delivered `new_message` #46 to the PARENT's socket; **the SENDER did not receive its own emit** (proving the room-scoped delivery, and exactly why the browser verify steps need two windows); an invalid token was rejected at the handshake. REST side: the parent's conversation showed `unread: 1`, `PATCH /read-all/2` returned `count: 1` and the count went to 0; teacher-to-teacher send succeeded (`201`); and TCH-002 messaging a parent outside its scope returned `403 "This parent's child is not in one of your classes."` All messages deleted afterward; `messages` back to 0 and every other table at baseline. `npm run build` clean; `oxlint` 9 -> 13 — three of the four additions are the same `set-state-in-effect` fetch advisory every page carries, and the fourth is `only-export-components` on `SocketProvider`, the identical shape `AuthContext.jsx` already has for the identical reason (a provider exporting its own hook). **MEASURED BUILD TIME, fifth data point: 4 minutes 4 seconds — again not comparable**, being the first dispatch to add a transport rather than another CRUD surface. Recorded in the table with all five and what each involved; five points still are not a rate, because every dispatch has differed in kind from the ones before it. `git status` matched the whitelist: three new files (`realtime/SocketProvider.jsx`, `realtime/LiveStatus.jsx`, and the two pages), `client/package.json`, `App.jsx`, `layout/Shell.jsx`, `layout/nav.js`, `CLAUDE.md`, `docs/PROJECT_PROGRESS.md`. No server files. **BROWSER-REVIEW DEFECT, found immediately after and fixed before commit: `Shell.jsx` used `useEffect` in the new `useUnreadMessages` hook without importing it, so Shell threw and EVERY ROUTE FOR ALL THREE ROLES rendered blank** — not just Messages. A one-word import fix, but the interesting part is that the whole automated chain passed: `npm run build` succeeded, `oxlint` reported only the usual advisories, and the server suites never load the client. **Reported rather than just fixed, as asked.** (1) The build genuinely cannot see it — a bundler resolves imports, not undefined identifiers, and does no type checking, so a `ReferenceError` that only occurs when the component renders is out of its scope. (2) **`oxlint` DOES have the rule and it is simply not on**: its default category is `correctness`, and `eslint(no-undef)` is not in it. Verified by running `npx oxlint -D no-undef` against a scratch copy with the bug reinstated — it reports `'useEffect' is not defined` at the exact line. **Deliberately not enabled here**: turning on a new rule across the whole client is its own change with its own fallout and belongs to a dispatch that can absorb it. Confirmed fixed by SSR-rendering Shell inside MemoryRouter + AuthProvider (hooks are CALLED during render even though their callbacks are skipped, so a missing hook import throws there exactly as in a browser), **with a negative control** — reinstating the missing import reproduced Darryl's exact console error, `ReferenceError: useEffect is not defined`, proving the check was not vacuous — then restoring and re-confirming. Both the harness and the temp files were deleted. **Recorded as new convention 5h: build and lint prove the code compiles, not that the page renders — a page is not done until it has been opened.** This is the SECOND browser-review defect in seven pages that no automated step caught (the attendance Recorded column was the first), and both were in code that ran, so there was nothing to fail on. "Build clean, lint clean" is now stated as a necessary but never sufficient report. **TWO MORE BROWSER-REVIEW FINDINGS, fixed before commit — and one of them was convention 5g failing in the same dispatch that wrote it.** (1) **The unread badge never cleared.** Opening a thread issued `PATCH /read-all/:userId` and the server was correct, but the badge still showed the old count until a full page reload. Cause, confirmed by reading rather than guessing: `useUnreadMessages` lived in `Shell` and refetched on exactly two triggers — mount and a `new_message` socket event — while `MessageThreadPage` contained no reference to Shell, no context, and no signal of any kind. **The link was simply never built**, so the badge could only ever be right on a full load. Fixed by BUILDING THE SIGNAL, not by decrementing: the count moved into a new `realtime/UnreadProvider.jsx` exposing `{ unread, refresh }`, and the thread page calls `refresh()` after the PATCH resolves. It re-reads the server's own count; nothing anywhere subtracts from it, so convention 5b holds — a locally maintained badge while the server still holds those rows unread is the attendance RECORDED defect one component further out. Refetching on route change was considered and rejected: it would race the PATCH (navigation completes before `read-all` resolves) and fire on every navigation in the app to fix one case. (2) **The 'Live updates paused' strip lived only on the two Messages pages, while the badge that depends on the same channel lives in `Shell` on EVERY page.** So a teacher on Students or Grades with a dead channel had a badge that had silently stopped updating and nothing to tell them — **which is 5g's own failure mode, one level out from where it was applied.** The convention said "when a live channel fails, say so" and never said WHERE. **5g now carries that clause: the notice must appear wherever anything depending on the channel is shown, not only on the page that owns the feature.** `LiveStatus` moved into `Shell` above the routed page; its Refresh does a full reload rather than a per-page refetch, because Shell cannot know what the routed page fetches and a Refresh that silently refreshed only the badge would be its own small lie. **The reported WebSocket console error turned out not to be a defect at all, and the investigation corrected two wrong inferences — one of them mine.** Darryl's Network tab showed a first attempt finishing at 0 ms and a second at status `101` still Pending: **websocket IS connected and real-time delivery was working**, so the strip was correctly hidden rather than unreachable. Neither of the two hypotheses in the report was right; the third case was. **The actual cause is React StrictMode**, which in development double-invokes effects (mount -> effect -> cleanup -> effect): `SocketProvider`'s cleanup disconnects the first socket while its WebSocket is still CONNECTING, which is precisely what the browser reports, and the second attempt succeeds. **Not a transport problem** — verified from node that `['websocket','polling']`, the default `['polling','websocket']`, and websocket-only all connect over websocket against this server, so switching to the default would not remove it. **Deliberately not worked around**: the cleanup is correct and must disconnect, and StrictMode exists to surface exactly this kind of double-mount fragility, so suppressing the message would mean fighting the tool doing its job. Recorded in convention 5h with a falsifiable prediction (it should not appear in a production build, since React only double-invokes effects in development), because an unexplained recurring console error trains people to ignore the console — and the console is where the blank-page `useEffect` bug surfaced an hour earlier. **A small lint asymmetry recorded alongside it:** `eslint(no-unused-vars)` IS in oxlint's default `correctness` category while `eslint(no-undef)` is not, so the linter flagged the now-dead `useEffect` import the moment the hook was removed — having said nothing when that same identifier was undefined and blanking every page. All three views (dashboard, Messages list, Message thread) were confirmed to RENDER, not merely build, via SSR, with the strip present on the dashboard proving the 5g placement fix reaches pages that do not own the feature. |
| 2026-09-07 | **Teacher -> Announcements, Memos and Events — three pages, one dispatch, and the plan's premise was wrong in a way worth recording.** The dispatch asked for three near-identical pages (list + compose + target selection) with an instruction to say so if they turned out not to be. **They are not, and the sharpest reason is that MEMOS ARE ADMIN-ONLY FOR EVERY WRITE** — `POST`, `PUT` and `DELETE` on that router all carry `authorize('admin')`, so a teacher never reaches the handlers; the middleware answers `403 "Access denied."` first. A teacher Memos page therefore has no compose form, no edit and no delete: it is a read-only list, which is a different page rather than a variation on one. The other two diverge further — announcements' body column is `content` (TEXT NOT NULL) while events' is `description` (TEXT NULLABLE); events carry a required `event_date` and announcements do not; targeting is grade+section vs grade-only vs none at all; write scope is exact-section (`teacherHasAssignment`) vs grade-level (`teacherHasGradeAssignment`) vs nothing; and the list filters differ in every case. **Three page files, not one component:** a shared one needed a configuration axis per difference — body field name, body nullability, date field presence, targeting model, whether compose exists at all, filters, wrapper keys — which is the "three pages wearing a costume" the dispatch warned against. **One thing genuinely worth sharing WAS extracted: `client/src/hooks/useTeacherTargets.js`** (new `client/src/hooks/` directory, flagged before creating). It answers "where may this teacher post", which announcements needs as section pairs and events as distinct grades. **Extracted at TWO occurrences, which looks like a violation of the codebase's extract-at-three precedent and is not** — that precedent (`utils/dateFormat.js` at three; `school_year` and `titleCase` still duplicated at two) is about copying a VALUE. This makes network calls and derives state; two duplicated fetch-and-derive implementations drift in a way a duplicated one-line `titleCase` structurally cannot, because one page can add a request or fix an edge case while the other silently keeps offering a stale target set. The distinction is recorded in the hook itself so the rule is not read as broken. **The hook exists only because `teacher_assignments` is invisible to the API**, which is now recorded as ONE finding with TWO consequences rather than two separate notes: no endpoint CREATES an assignment (so an admin cannot assign a teacher to a subject at all — blocking Admin -> Users and Admin -> Sections) and no endpoint READS one (so a client must reconstruct a teacher's valid targets from `GET /api/sections` unioned with the distinct grade+section pairs in `GET /api/students`). One endpoint closes both holes; fixing only the write side would leave every client still guessing. **The reconstruction has a known hole, recorded with WHY it is acceptable rather than only that it exists:** a section with zero students is invisible to it, so a teacher assigned to an empty section is never offered it even though `POST` would accept the post — acceptable because a section with no learners has no parents to announce to, so the post would have no audience. A gap with no victim. **Announcements IS the Class Board, with deliberately no Class Board affordance.** A Class Board post is defined by its shape alone (teacher-posted, both targets set) and a teacher's only legal target IS an exact section — school-wide and whole-grade are both admin-only `403` — so every announcement a teacher posts is already one, and a separate control would present a choice that does not exist. The compose form names the audience ("Parents of this section will see this post") rather than a feature, so the term never appears on screen; inventing a UI concept for something mechanically identical to "your announcement" would recreate the eleventh-feature framing this project avoided. **Recorded explicitly that this form is what the later "Post to class" from Messages will pre-fill** — no new endpoint, no new field, no second composer — both in CLAUDE.md's Class Board section and in the page's own header comment, so that dispatch finds the decision already made. **Conventions applied and stated:** 5b — the compose/edit modal owns a draft created on open and discarded on close, the list row renders the stored post and is never written from form state, and success refetches rather than patching; 5e — **delete confirms, edit does not**, because delete is a hard `DELETE FROM` with no status column and no restore path (more irreversible than an excuse-letter review, which at least leaves the row) while `PUT` is freely repeatable, and the confirmation names the post title back; 5f — empty-state copy derived from the applied filter state with no boolean flag, and on Memos that means exactly one branch because the endpoint accepts no filters at all. **No attachment field on either compose form** — `attachment_url` exists on both tables but nothing uploads, so offering it would promise a feature that does not exist; same call as the excuse-letter attachment. **Anti-dead-end rule applied three ways:** a teacher with no valid targets gets no compose button and a muted explanation rather than a form that can only fail; edit/delete controls appear only on the teacher's own posts, since another author's returns `403`; and school-wide/whole-grade are simply not offered as options. Verified live for both accounts: target derivation (TCH-001 -> Grade 6 - Malikhain, TCH-002 -> Grade 5 - Masigasig, each from the union of advisory sections and visible students); **TCH-002, the adviser with zero assignments, successfully posted an announcement to its own section** — the case that could not work before the 2026-09-07 scope widening; TCH-001 posted a Grade 6 event; all three refusals returned their real messages (school-wide admin-only, whole-grade admin-only, "not connected to Grade 6 - Malikhain"); a teacher editing and deleting another teacher's post both returned `403` naming the reason; a teacher `POST` to `/api/memos` returned `403 Access denied.`; and read scoping proved tight — TCH-001 saw none of TCH-002's Masigasig announcement and TCH-002 saw none of TCH-001's Grade 6 event. All created rows cleaned up; `announcements`, `memos` and `events` back to 0, users 5, students 2. `npm run build` clean; `oxlint` 6 -> 9, the three additions being the same `set-state-in-effect` fetch advisory every other page carries, one per new page. **MEASURED BUILD TIME, fourth data point: 3 minutes 36 seconds — and explicitly NOT comparable to the previous three, because it is three pages.** Recorded in a table with the other three and what each involved, with the note that dividing by page count would be the wrong move: this dispatch produced three pages because two shared a hook and the third had no form, not because pages got cheaper. `git status` matched the whitelist: four new files (three pages plus the hook), `App.jsx`, `layout/nav.js` (three `built` flips landing with their routes, per convention 6), `CLAUDE.md`, `docs/PROJECT_PROGRESS.md`. No server files. |
| 2026-09-07 | **Teacher -> Excuse Letters — the third Stage 4 feature page, and the first with a write FORM.** Queue plus review action; no parent submission flow (a Parent page, separate dispatch). **This is where the sharpest 403/404 split in the codebase first reaches a user:** read scope is assigned OR adviser, review authority is adviser ONLY (`sections.adviser_id`), so a teacher can legitimately see a letter they may not act on and gets `403` naming the reason rather than a `404`. **The page predicts that case before the click** — it fetches the teacher's advisory sections (same source the attendance page uses) and shows "Adviser only" instead of a Review button, so the control is never a dead end, the precedent the Students page set by omitting Edit. **The caveat is kept in the file rather than hidden:** the client predicts on grade+section NAMES while the server decides on `students.section_id`, and a student with a NULL `section_id` would diverge — so the `403` is still handled as a real path, not treated as unreachable. Prediction removes the dead end; it is not authority. **Review is irreversible and that drove the whole interaction.** `PATCH /:id/review` answers `403` once a letter leaves `Pending` and there is no un-review endpoint — verified by reading the handler, then confirmed live by approving a letter and failing to decline it afterward. **A warning sentence was rejected as insufficient**: a line above the buttons is what every dismissible warning looks like, and a teacher reviewing their fifth letter stops reading it. The modal instead requires an explicit confirmation step naming the chosen outcome back — "Approve this letter? This cannot be changed afterward." — so selecting the wrong button shows the wrong word rather than an identical dialog. **Recorded as new convention 5e (confirmation follows reversibility), stated together with Attendance's deliberate ABSENCE of a confirmation so the two pages read as one rule rather than two inconsistent decisions**: attendance's `POST /bulk` uses `ON DUPLICATE KEY UPDATE` and treats re-submission as routine correction, so a confirmation there would be friction on a normal action; review refuses correction entirely, so its absence would let one misclick become permanent through the UI. Opposite constraints, opposite answers, and the rule is to check the handler before deciding. **Convention 5b honoured:** the modal's decision/remarks live in state created when it opens and discarded when it closes, so the row's stored status — which renders from the fetched letter and is never written by the form — cannot share state with the pending decision. On success the list REFETCHES rather than patching locally, because the server is the authority and a client-side merge is the exact shape 5b exists to prevent; on failure the modal stays open with values preserved and the row behind it untouched. Mid-flight dismissal is disabled (backdrop and Escape), since a teacher who closes during the request cannot tell whether the decision landed. **The school's record-only rule is stated at the moment of decision, not in a page header** — approving records the reason but does not change the attendance record, the student stays marked Absent ("excuse lang yung bata pero absent pa rin"). In the modal because that is where the misconception would cause action: a teacher who approves believing the absence clears has been misled into a wrong model of their own records. Verified live that an approval leaves the attendance row count unchanged. **Modal, not a detail route, and the reason is a backend finding:** `GET /api/excuse-letters/:id` runs `SELECT el.*` with no student join, while the LIST runs `SELECT el.*` plus first_name/last_name/grade_level/section — **the detail endpoint returns strictly LESS than its own list endpoint**, so a detail page would need a second call to `/students/:id` just to render a name. Recorded as a known oddity so nobody builds a detail route on it later and wonders where the name went. Consequence stated plainly rather than papered over: with no detail route, the "letter opened directly while out of scope" 404 state cannot occur on this page — inventing a route to have that state would be backwards. **No attachment affordance:** `excuse_letters.attachment_url` exists in the schema but `POST /` accepts only absence_date/reason/details and there is no upload endpoint anywhere, so the column is always NULL; rendering a download link would promise a feature that does not exist. Recorded as dead schema — build upload or drop the column. Filters expose `status` (defaulting to **Pending**, the actionable set, shown as an active selection rather than an invisible default) plus a from/to date range; `student_id` is not exposed, needing an id rather than a name. Unlike the Students page, `status` here IS safe to build on — these are the letter's own three ENUM values, validated server-side with a `400` on anything else, a different mechanism from students.js's unvalidated fall-through. **The most consequential finding is unrelated to this page: NO API CREATES A `teacher_assignments` ROW.** Confirmed by grep — the only INSERT statements are in `setup-db.js` and two test suites; no route file has one. An admin cannot assign a teacher to a subject or section through the API at all, which **blocks Admin -> Users and Admin -> Sections**, whichever is built first. `sections.adviser_id` IS assignable via `PATCH /api/sections/:id/adviser`, so advisory scope is manageable while subject scope is not — an asymmetry now recorded with the pages it blocks named, so it surfaces before that dispatch rather than during it. Surfaced here because the read-scope-but-not-adviser fixture could only be built by a direct DB insert. **Fixtures: the seed covered none of the three cases** (`excuse_letters` was 0 rows). Marwin's letter was created through the real parent API (13567454 is active); Jea's by direct insert, because her parent 1234567 is deliberately `pending` and **must not be approved** — `test:auth` depends on that row and a crashed run corrupted it once before, confirmed still `pending` afterward; and the 403 case needed a throwaway teacher assigned to Malikhain but not its adviser, since TCH-001 is both and TCH-002 is adviser-only, so neither seeded account can occupy that state. All three cleaned up: `excuse_letters` back to 0, users back to 5, `teacher_assignments` back to 3 (the throwaway's row removed by `fk_assignments_teacher ON DELETE CASCADE` with its user). The throwaway was deliberately NOT left seeded — TCH-002 earns permanence by distinguishing two scoping authorities forever, while a read-scope-but-not-adviser account is needed for one assertion and would otherwise be a fourth fixture to reason about indefinitely. Verified live: all three accounts see exactly the letters they should (TCH-001 -> Marwin's, TCH-002 -> Jea's, the throwaway -> Marwin's with no Review control), the `403` and its exact string, the adviser's `200`, the irreversibility `403` on a second attempt, and attendance unchanged by an approval. `npm run build` clean; `oxlint` findings 5 -> 6, the one addition being the same set-state-in-effect fetch advisory as every other page. **MEASURED BUILD TIME, third data point: 2 minutes 28 seconds** — recorded beside Attendance's 3m14s and Students' 1m24s **with what each page actually involved**, because the composition explains the ordering and a bare series would invite a projection these cannot support. Three points still are not a rate and do not trend. `git status` matched the whitelist: one new page file, `App.jsx`, `layout/nav.js` (the built flip landing with the route, per convention 6), `CLAUDE.md`, `docs/PROJECT_PROGRESS.md`. No server files. **Empty-state restructure after browser review, folded in before commit — plus a false alarm worth recording.** The reported symptom was that "All statuses" showed nothing after a letter was approved. Investigation before touching anything proved every part correct: the page omits `status` entirely for `All` (the endpoint 400s on `?status=All` and on an empty string — only omission means "no filter"), a live check confirmed the omitted-param request returns the approved letter, the empty-state branches would not have produced the copy that was seen, and `FormField` rendered as a controlled select was verified by server-rendering it (all four options, `selected` correctly on `All`). **No data bug existed — the open tab was serving a stale module after HMR, and a hard reload cleared it.** Recorded in KNOWN ISSUES as a practice note: **try a hard reload before treating a browser-review symptom as a code defect**, since this cost a round trip. The analysis was not wasted, because it surfaced a real defect next to the phantom one. **`filtered` carried two distinct meanings in one boolean:** `applied.status !== 'Pending' || from || to` is true both when a narrow filter matched nothing AND when the status is `All`, which is the LEAST narrowed state there is. So "All returned nothing because no letters exist" and "your filter is too tight" rendered the same message — telling a teacher to try a different filter when no filter would ever reveal anything — and the same flag let "Nothing waiting for review", a claim about `Pending` specifically, surface under other filters. Replaced with three explicit branches keyed on the actual applied values, so that copy is now **structurally impossible** outside its own filter rather than merely unlikely. A Reset action is offered only where resetting would change the result, never on "nothing exists", and whether the form differs from its default became its own value (`canReset`) rather than reusing one flag for two questions — that conflation was the cause. **Recorded as convention 5f (empty-state copy is derived from the filter state, never from a flag), because this was the second empty-state copy bug in three pages** — a future page with filters reads the rule instead of inventing its own boolean. The named trade-off stands: explicit branches must be revisited if a fourth filter arrives, where a flag would silently absorb it — and silently absorbing it is exactly what produced wrong copy twice. Verified: `npm run build` clean, `oxlint` findings unchanged at 6. |
| 2026-09-07 | **Teacher -> Students — the second Stage 4 feature page.** List plus a detail route (`/teacher/students/:id`), **read only**: no create, no edit, no embedded attendance history, all held out of scope deliberately. **It is the first screen where the widened read scope is visible to a user** — `TCH-002`, an adviser with zero subject assignments, lists and opens its advisory section's student, which returned nothing at all before 2026-09-06. **Detail is a route, not a modal:** a student record is a destination — deep-linkable, back-buttonable, and reachable later from the attendance and grades pages — so it fetches `GET /:id` itself rather than reusing a row from the list, and a direct URL load works with no list in memory. Cost accepted: a full page transition where a modal would have kept the list's scroll position. **No Edit affordance anywhere, and the reason is recorded in the file rather than only here:** read scope is assigned OR adviser, but `PUT /api/students/:id` is `teacher_assignments`-only and answers `403` to a teacher who can view but not write, so an Edit button shown to an adviser-only teacher would be a dead end the UI invented. The file also records what editing will need when it is built — the button's visibility must key on the assigned-vs-adviser distinction, which is the same 403-vs-404 split from `routes/students.js` surfacing in the UI for the first time. **`?status` is deliberately never sent**, so the endpoint's active-only default applies — the one branch of that filter which is actually verified. The page will not build on `?status=all`, recorded as UNVERIFIED because the seed has zero inactive students and its live check could not have failed. The cost is real and recorded as a known gap tied to that verification rather than dressed up as a design choice: a transferred-out student disappears from the list with no explanation. **Two empty states, deliberately distinct** — "no students assigned to you yet" (empty scope) versus "no students match that search" with a Clear action (filter too narrow); collapsing them would tell a teacher their roster is empty when it is their own filter. **The out-of-scope detail case renders neither "access denied" nor "not found":** `routes/students.js` collapses nonexistent and out-of-scope into one `404` specifically so a teacher cannot enumerate student ids, and copy saying "access denied" would confirm the record exists while "not found" would deny it — so it reads "This student is not in your classes," with the reasoning commented at the catch. **`DataTable` needed no change**, and that is the finding: it has no `onRowClick` or row-link support, so the student name renders a `<Link>` in its cell. Adding `onRowClick` for the first page that wants it would shape a shared primitive around a single caller — precisely what building the primitives before any feature page was meant to prevent. **A second page wanting whole-row clicking is the trigger**, recorded so the next page does not re-argue it. **Convention §5b (a column showing database state must never derive from form state) genuinely does not apply here, which is an answer rather than a skip:** it bites when a column showing stored state sits beside an input mutating the same object, and this page has no inputs that write student data at all — filters are query state, not record state. It will bite again on grades encode. **Two findings recorded, neither fixed (no server files in this dispatch).** (1) **`GET /api/students` returns the full personal row on a LIST** — `birthday`, `gender`, `address`, `contact_number` for every student in scope, verified against the live payload. Not an authorization hole, but a roster has no reason to carry home addresses, **and the LRN in that payload doubles as the parent's `login_id`**. Also measured while there: `GET /:id` adds only `section_id`, `created_by`, `updated_at` over the list, so narrowing the list response later would cost the detail view nothing. (2) **`docs/API_REFERENCE.md`'s scope labels are stale for every read widened on 2026-09-06/07** — its rows still say `teacher(wide)`, and the legend defines `wide` as `teacher_assignments` grade+section only, narrower than those endpoints now are; there is **no legend code for "assigned OR adviser"**, which is why four modules are mislabelled with one meaning something else. Needs its own backend-docs dispatch: add the code, then relabel. **Recorded with why the 2026-09-07 audit did not catch it and was not wrong to miss it** — that audit diffed endpoint EXISTENCE three ways, and a presence diff structurally cannot see a scope column drifting stale; "all three buckets empty" was true and remains true, so this is a stated limitation of the audit, not a correction to it. **New convention §5c — the LRN is half a credential, not an ordinary identifier.** A parent's `login_id` IS the child's LRN (a locked decision), so an LRN on screen is one of two factors of a real account. The rule, recorded while it was fresh: no screen displays an LRN except to a teacher or admin acting on that student; **no LRN goes in a URL, a query string, or an error message** — route on `students.id`, never the LRN, because URLs reach history, screenshots, shared links and server logs while error strings reach screenshots and bug reports. Searching *by* LRN stays fine — that is an authorized user typing a value into a field, not us publishing one into a location that persists. This page routes `/teacher/students/1`, never `/teacher/students/13567454`. Verified live for both accounts: `TCH-001` lists Marwin (G6-Malikhain), `TCH-002` lists Jea Mae (G5-Masigasig); `?search=Marwin` returns 1 row and `?search=zzz` returns 0 (the filter empty state, not the scope one); `TCH-002` opens `/students/2` with `200` and `/students/1` with `404`. `npm run build` and `oxlint` clean apart from two advisory `set-state-in-effect` warnings on the data-fetch effects — the same class as the existing ones, flagged rather than contorted around. **MEASURED BUILD TIME, second data point: 1 minute 24 seconds** (00:48:38 -> 00:50:02) against Attendance's 3m14s — recorded side by side, explicitly **not** as a series. Two points are not a rate, and these two are not comparable to each other: Attendance introduced a shared date helper, a write path, bulk submission and pre-fill-plus-update semantics, while this page is read-only against endpoints other work had already exercised. That the second was faster says almost nothing about a trend and everything about the pages differing in kind. `git status` matched the whitelist exactly: two new page files, `App.jsx`, `layout/nav.js` (the `built: false -> true` flip landing in this dispatch alongside the route, per convention 6), `CLAUDE.md`, `docs/PROJECT_PROGRESS.md`. No server files; `docs/API_REFERENCE.md` deliberately left out, since its stale labels are a backend-docs fix and folding them into a client dispatch would have widened this one. **Display-casing pass after browser review, folded in before commit.** `StatusBadge` now capitalises its rendered text while `toneForStatus()` keeps keying on the lowercased value — matching, comparison and what is sent to the API are all unchanged, and the caller's `status` prop is never mutated. **The more useful half of this was the finding, not the change:** the five status vocabularies disagree in the SCHEMA, three to two — `attendance`, `excuse_letters` and `contribution_records` ENUMs are already capitalised, `users.status` and `students.status` are not, and grades' `locked`/`unlocked` are strings a caller invents from a boolean. So capitalising is a **no-op for three of the six** and visibly changes only two ENUMs plus the lock pair. **That mismatch is now recorded as a decision, not an oversight: it is deliberately NOT normalised**, because a migration touching real rows — plus every route, fixture and comparison around them — purely so a label reads right is the wrong trade for a cosmetic problem. New convention **§5d (display casing is presentation only)** is how the project stops paying for it on every screen instead. `StudentDetailPage` capitalises `gender` at the point of render, not inside the generic `Field` component, since capitalising an address or an LRN would be wrong. **Two call sites in the gallery passed `label="Locked"`/`label="Unlocked"`, which became redundant rather than conflicting** — the default now produces exactly that text — and both were dropped: a gallery that misrepresents a primitive's default teaches the wrong thing to every page built against it. Its caption now records `label`'s real purpose (display text differing from the stored value, which `is_locked` genuinely needs, being a boolean). **The duplicated Status row was dropped from the detail view's definition list** — once capitalised, the header badge and the `<dl>` row rendered the same word twice ~200px apart, reading as duplication rather than two facts; the badge is the better carrier, being scannable and consistent with the list. Reported rather than removed unilaterally, then removed on Darryl's call. `titleCase` is duplicated in `StatusBadge.jsx` and `StudentDetailPage.jsx` with twin comments, matching the codebase's extract-at-three precedent (`utils/dateFormat.js`); the third occurrence moves both to `client/src/format/text.js`, decided now so it is not re-argued then. Verified: `npm run build` clean, `oxlint` finding count unchanged at 5 (all pre-existing fetch-effect and fast-refresh advisories, none new), and the DEV-only gallery still confirmed absent from the production bundle. |
| 2026-09-07 | **Adviser scope finished across the remaining modules, the shared predicate extracted, `GET /api/messages/contacts` built, and the endpoint audit run — one dispatch, six items, because they share files and context.** **ITEM 1 — extraction, and the recorded trigger turned out to name the wrong file.** `students.js` and `excuses.js` each carried a byte-identical local `TEACHER_VIEW_SCOPE_SQL` (md5-confirmed) with twin comments naming `routes/content.js` as the third occurrence that would trigger extraction. **content.js is not a third copy at all**: its scoping runs on `announcements.target_grade` / `events.target_grade`, columns on the content tables, with no students row in the query to alias `s` against — so the fragment cannot reach it, and it needed its own differently shaped adviser clause. The real third occurrence was `messages.js`'s `canMessage()`, whose two direction checks both reduce to "is this teacher connected to this student", which is exactly what the fragment expresses. Extraction executed as decided, trigger met by a different file; the lesson is recorded in `utils/teacherScope.js` itself: a predicted extraction trigger is a guess about a file's SHAPE, and shape is what decides reuse, not subject matter. New `server/utils/teacherScope.js` exports the constant plus `teacherViewScopeParams(userId)` — a helper specifically because the hazard at the six call sites is the parameter COUNT (two, not one; passing one shifts every later placeholder), not the order: both bound values are the same user id, so a swap is undetectable and harmless. **The refactor was verified behaviour-preserving BEFORE anything else moved** — `test:students` 39 and `test:excuses` 67, unchanged — so any later regression would be attributable to the widenings, not the extraction. **ITEM 2 — `content.js`, and the one place a WRITE gate was deliberately widened.** Four sites, and reported as a third distinct shape before touching them: two are helper functions behind write gates (`teacherHasAssignment` → `POST`/`PUT /api/announcements`, `teacherHasGradeAssignment` → `POST`/`PUT /api/events`) and two are inline read filters on the list endpoints — so posting scope and reading scope were already separate clauses, meaning neither of the earlier traps applied (students' shared text that must not widen writes, excuses' existence query that must). All four widened. **Widening the writes is not a rule being broken and the reasoning is recorded at the change site in the file, not only here**, because a future session comparing this against the students fix will see writes moving in one and not the other: the Class Board is a stated school requirement, it is delivered as a section-scoped announcement, and an adviser who cannot post to their own advisory section cannot deliver it. Both widenings stay inside the existing grant — announcements stay section-only, and for events an adviser is no broader than the teacher-with-any-one-assignment-in-that-grade the helper already permitted. Verified live that it delivers exactly the Class Board and nothing wider: `TCH-002` posting to its own Grade 5 - Masigasig now returns `201` (was `403`), while a section it neither teaches nor advises, school-wide, and whole-grade all remain `403`. **ITEM 3 — `messages.js` `canMessage()`**, both directions (it gates parent→teacher and teacher→parent symmetrically, and has exactly one caller, `POST /api/messages`; both read endpoints are participant-scoped and deliberately never re-check it). Both legs now use the shared predicate. **Both refusal messages were reworded, which is not cosmetic**: "This teacher is not assigned to your child's class" stated something false the moment an adviser qualified. The replacements are true for both legs without naming the mechanism to the user. Four existing assertions across two suites pinned the old wording and were updated — the right kind of test catching a real change, not noise. **ITEM 4 — `GET /api/messages/contacts` built**, wrapper key `contacts`, the sixth endpoint in the module and the last designed-but-unbuilt endpoint in the system. Behaviour was fully documented in CLAUDE.md; the response SHAPE was not and was designed here. Scope: parent → teachers connected to their own child via the shared predicate, plus admins; teacher → parents of students in their own scope, plus other teachers and admins; admin → everyone else. `?search=` filters on contact name AND student name **within the already-scoped set** — never an unscoped user search, which would expose the whole school and defeat the point of `canMessage` existing. Conversation state (last message, unread count) joins inline so the page renders contacts and conversations from one call. **ACTIVE ACCOUNTS ONLY, decided, with a visible consequence asserted as correct:** a pending parent cannot log in, so listing them would offer a conversation that cannot happen and show a teacher a contact who will never reply with no way to tell why. `TCH-002`'s section's only parent (`1234567`) is deliberately seeded `pending`, so that adviser sees **zero parent contacts** — the test asserts this as correct with a comment saying why, so a future session reading "adviser sees no parents" does not diagnose the scope bug returning. Verified live across all four accounts: the parent sees only their own child's teacher (with subjects) plus admin and **not** the unrelated adviser — the privacy property this endpoint exists to protect. **ITEM 5 — endpoint audit, three-way diff, ALL THREE BUCKETS EMPTY.** CLAUDE.md's table vs. `docs/API_REFERENCE.md` vs. handlers actually registered and mounted: **77 endpoints, all three sources agreeing** — nothing documented without a handler, nothing implemented without documentation, no mount/handler orphans (all 12 route files mounted, all 14 mounted names resolving). The only cross-source difference is `GET /api/health`, which lives in `server.js` and is documented in prose rather than an endpoint table — a counting convention already noted. **Recorded as a dated audit that ran and found nothing, not as a task quietly completed**, so a future session can see the check happened rather than wonder. Count is 78 with `contacts`; API_REFERENCE updated from 76 to 77 (it excludes `/api/health`). The two queued `?status` items are carried forward **verbatim and still unrepaired**: the filter is not a validated enum (`?status=activ` silently returns the default instead of `400`, unlike `grade_level` in the same handler), and **`?status=all` remains UNVERIFIED** — it should skip the filter, but the seed has zero inactive students so the live check could not have failed. **ITEM 6 — one client finding recorded, not fixed** (this dispatch touched no client files): `client/src/pages/Login.jsx:31` does not use `extractError` and falls back to `'Login failed. Please try again.'` when there is no `err.response` — **the same message a wrong password produces**. It predates `extractError`, which already returns a distinct offline message for that case. Recorded with why it matters rather than just logged: a dead server and a wrong password become indistinguishable, so someone hitting it during the parent demo would hunt for a credentials problem that does not exist, in front of an audience, while the real fault is that the API is down. **`section_id` note THREE → FOUR** (attendance, students, excuses, messages — the last three via the shared constant), and the fourth pass is where the note earned its keep by producing a distinction rather than a rubber stamp: `content.js` was widened in the same dispatch and deliberately did NOT become a reader, because its clause matches `sections` by grade+name instead. **Tests: `test:content` 47 → 53, `test:messages` 39 → 56**, both confirmed twice with no `db:setup` between runs. Zero pre-existing assertions flipped in either suite — predicted beforehand and confirmed, since every teacher fixture in both is `TCH-001`, which is both assigned to and adviser of Grade 6 - Malikhain and so satisfies either leg. That is also precisely why neither suite could ever have caught these gaps, and why `TCH-002` coverage is the actual deliverable. Full 15-suite regression, every other suite matching its prior count exactly (auth 25, students 39, sections 30, attendance 38, contributions 38, settings 26, users 39, backups 39, sanitize 9, restore 22, excuses 67, grades 141, grade-computation 51). `routes/grades.js` untouched, confirmed by `git diff` — an adviser is not automatically entitled to a section's grades, and that needs the school, not a patch. One `attendance` row was found in the database during the final baseline check and **deliberately left in place**: dated 2026-09-06 23:58 local with `recorded_by` TCH-001, i.e. real data from Darryl's browser review of the attendance page, not test residue — deleting a teacher's actually-recorded attendance because it resembles leftovers would have been exactly the wrong call. |
| 2026-09-06 | **Teacher -> Attendance — the first Stage 4 feature page.** Encode screen only: section context, date, roster, per-row status, one bulk submit. **The attendance HISTORY view was deliberately kept out** and remains a separate dispatch — the scope was held honest specifically because this is the page the void web estimate was to be re-measured from. Adviser-scoped throughout: the section list comes from `GET /api/sections` filtered on `adviser_id` (that endpoint is unscoped reference data with no `?adviser_id` filter, so the narrowing is client-side — free at 23 rows), matching the Stage B1 finding that attendance is the ADVISER's job, recorded once daily during Homeroom Guidance, not the subject teacher's. Four call sites, every one declaring its unwrap key per the frozen convention, and every one an array — `sections`, `students`, `attendance` (GET), `attendance` (POST bulk); this page never calls `POST /api/attendance`, which is the endpoint that returns the same key as an OBJECT, so the cardinality trap that makes a path-to-key map impossible never arises here. **The roster is fetched with `?status=active`** — a review amendment, and the reasoning is worth keeping: `POST /bulk` rejects an inactive student with a `400`, so an inactive row on the roster would be one a teacher could mark and then lose on submit. Filtering at fetch time makes that error **unreachable rather than handled**. **Two `?status` findings recorded in the audit list, one of them explicitly UNVERIFIED** — flagged, not fixed, since this was a client dispatch: (a) the filter is unvalidated — only `'inactive'` and `'all'` are matched literals, so `'active'`, a typo like `'activ'`, and omitting the param all fall to the same active-only default, inconsistent with `grade_level` in the same handler which validates and rejects; (b) **`?status=all` is UNVERIFIED and must not be recorded as working.** By reading it should skip the status filter and return active AND inactive rows; a live check returned only active rows, which proves nothing, because the seed contains **zero inactive students** — that test could not have failed. Darryl caught that the first framing treated a vacuous pass as evidence. The entry says so in those terms: an audit entry claiming "verified fine" when the fixture could not fail is worse than no entry. **The scope-mismatch diagnostic from the original plan was REMOVED**, not implemented: `GET /api/students` now accepts the adviser (fixed earlier the same day), so the state it described — a roster empty against a non-zero `student_count` — cannot occur. Verified live before relying on it: `TCH-002` now returns `Jea Mae [active]` where it previously returned zero students. Had it been shipped it would have put developer-facing text ("Report this; it is a known gap") in front of a teacher who can do nothing with it. Two legitimate empty states remain — no advisory section, and a section with zero students. **Date handling follows the rule the project has been bitten by twice**: no `toISOString()` anywhere; `<input type="date">`'s value is already a local `YYYY-MM-DD` string and is sent verbatim, never parsed into a `Date` and re-serialized; `max` is today; "today" comes from a new `client/src/format/date.js` whose `todayLocalDateString()` mirrors the server's own helper rather than inventing a second approach, with both historical bugs written into the file header. Verified live: the date round-trips as the plain string `"2026-09-06"`, matching local date, with no shift. Pre-fill plus in-place update via `ON DUPLICATE KEY UPDATE` (button reads "Update attendance" once any record exists, no confirmation dialog — the API treats a correction as routine); unset rows are **omitted from `entries`, never defaulted to Present**, since defaulting would invent attendance nobody entered, with a visible "N of M students have no status and will not be submitted" count instead. Status state is keyed by `student_id`, not row index, so sorting the table cannot scramble half-entered work. Conventions exercised: unwrap (four sites), errors (**this page is the first real consumer of the 403 fix — an out-of-scope refusal now renders in an `ErrorAlert` with the API's own wording instead of bouncing the teacher to `/login`**), `StatusBadge` (attendance vocabulary, no verdicts), `DataTable` (unpaginated), the nav flip, and `FormField` shapes 1 and 3. **Convention 3 (NULL grades) did not apply, and that produced a correction to the convention itself** rather than a silent skip: it was written as a universal page rule but is grade-specific — attendance's "not recorded" is a different concept and belongs to the empty-state handling, so CLAUDE.md now says `GradeValue` is for grade-bearing values only. No primitive needed a new prop. Per convention 6 the `built: false -> true` flip in `layout/nav.js` landed in **this** dispatch alongside the route registration, not as a follow-up; a now-stale comment in that file claiming teacher attendance was "plain `built: false`" was corrected in the same edit. Verified by driving the page's exact call sequence end to end for both adviser accounts rather than by clicking: `TCH-002` (the account that could not do this at all before the scope fix) resolves one advisory section, fetches a one-student active roster, gets an empty pre-fill, submits `Present` (`201`, date `"2026-09-06"`), re-reads it, and re-submits as `Late` (`201`, updated in place, no duplicate error); `TCH-001` resolves Grade 6 - Malikhain with Marwin; a future date is rejected by the API with "date cannot be in the future." The verification row was deleted afterward and `attendance` confirmed back to 0. `npm run build` and `oxlint` clean apart from one new advisory `set-state-in-effect` warning on the data-fetch effect — the same class as the pre-existing `AuthContext` one, for the same reason (a fetch-on-mount that sets a loading flag), flagged rather than contorted around. **MEASURED BUILD TIME recorded as this dispatch's own output: 3 minutes 14 seconds** wall-clock from PLAN APPROVED to verified-working — recorded with four caveats stating plainly that it is agent execution time and not developer-hours, that it excludes all planning and review (which on this page exceeded the implementation), that it excludes browser verification, and that it is the most favourable possible case since every primitive already existed. **It explicitly does not replace the void ~13-day estimate**, and the docs say a projection must not be derived from a single measurement taken under conditions that will not generalise. `git status` matched the whitelist exactly: `client/src/pages/teacher/AttendancePage.jsx` and `client/src/format/date.js` (new), `client/src/App.jsx`, `client/src/layout/nav.js`, `CLAUDE.md`, `docs/PROJECT_PROGRESS.md`. No server files. **BROWSER-REVIEW BUG, found by Darryl after the above was recorded as verified, and fixed the same day — the Recorded column tracked the dropdown.** The roster's Recorded column (what the database holds) and Status dropdown (what the teacher has picked) both read the same `marks` object, the one the dropdown writes on every change — so selecting `Late` immediately re-rendered the Recorded badge as `Late` with nothing submitted. Cause reported before touching anything, as instructed: `alreadyRecorded` was a `Set` of student ids, correct and `GET`-derived, so it gated *whether* the badge rendered honestly — but a `Set` holds no statuses, so when the badge needed a *value* it reached for the only place one existed, `marks`. Result: `whether` came from the database and `what` came from the form, in the same JSX expression. **The happy path hid it completely, and the failure path is where it did damage:** on a rejected save (403, server down, network) `loadRoster()` is never reached — it sits inside the `try`, after the `await`, while the `catch` only sets the error — so the page displayed the unsaved value as recorded while the database still held the old one. The teacher would see an error alert directly above a row asserting the new value was stored, with no way to see what was actually saved or what they were about to overwrite, at exactly the moment that information matters most. **Fix: `alreadyRecorded` (a `Set` of ids) became `recorded` (a `Map` of student_id -> status), giving the column its own value source rather than patching the symptom.** `loadRoster()` is now the only writer — it runs on mount, on section/date change, and after a SUCCESSFUL post, never from an input handler; `existingByStudent`, the map already built from the `GET`, is handed to it directly. Renamed deliberately: the name is what stops the next person reaching for `marks` there, and comments at both state declarations plus the column's own `render` say which side each belongs to. The no-record branch needed no change and was confirmed already correct — grey plain-text "Not recorded", visibly distinct from all four ENUM badge values and not borrowing the dropdown's empty default. **Verified the failure case specifically rather than settling for the happy path**, since that is the case that was silently broken: structurally, `setRecorded` has exactly three occurrences (the `useState` initialiser and two inside `loadRoster`) and the submit handler's `catch` provably cannot reach it; live, a real forced 403 (`TCH-001` posting to section 17, which it does not advise) returned "You are not the adviser of this section." — the message `ErrorAlert` renders, and which no longer redirects thanks to the earlier 403 fix — with the database confirmed still holding the prior `Present` value afterward. So on failure `recorded` keeps the stored value while `marks` holds the attempted one, and the two columns can finally disagree, which is the only reason the Recorded column exists. Verification rows deleted; `attendance` back to 0. **Recorded as a general convention, not just a fixed bug — new §5b in STAGE 4 FRONTEND CONVENTIONS: a column showing database state must never derive its value from form state.** This page is the first of ~75 and the shape recurs: the grades encode screen most obviously, where a stored grade and a pending edit sit side by side and the stakes are higher (a grade that appears saved and is not affects the SF9 and promotion), plus user-management status transitions, excuse-letter review, and contribution payment marking. The convention records the mechanical tell — search the render for the same state object the inputs write to. **The MEASURED BUILD TIME note was corrected in the same pass**, because leaving it reading as "verified working" is exactly the kind of stale claim this project keeps getting bitten by: agent verification passed, browser review then found a real bug that no API-level check could have caught (every request and response involved was correct — the defect was entirely in what the page rendered), so 3m14s is time-to-agent-verified, and the step that caught the actual bug happened after the clock stopped. The additional plan/fix/re-verify round is not in the number. A changed/unsaved row highlight was considered and **deliberately left out** — now genuinely possible once the two columns can differ, but it is polish beyond this fix; recorded as a candidate follow-up to revisit only if it surfaces again on a real 40-row roster, since one row proves nothing either way. |
| 2026-09-06 | **`routes/excuses.js` teacher read scope widened to include the section adviser — same root cause as the students fix earlier the same day, sharper consequence.** Read scope was `teacher_assignments`-only while **review authority is adviser-only**, so the adviser was the ONLY person permitted to review an excuse letter and an adviser without assignment rows could not see the queue they alone may act on. Not "sees less than they should" — structurally unable to perform the one job the module assigns exclusively to them. `TCH-002` (adviser of Grade 5 - Masigasig, zero assignments) was that account. **The load-bearing finding, and the opposite of the rule that governed the students fix: the widened clause is applied at ALL THREE read sites, INCLUDING the existence query inside `PATCH /:id/review`.** In `students.js` the equivalent clause *was* the write gate, so widening it by search-and-replace would have wrongly made records editable — the trap recorded in that entry. Here the same textual clause is only an existence/visibility filter; the actual authority is the separate adviser query (`SELECT 1 FROM sections WHERE id = ? AND adviser_id = ?`) that runs AFTER it and did not move. So the `students.js` reflex of "leave the write site alone" would have been exactly wrong: leaving that site narrow is what keeps the bug, since an adviser would `404` out before ever reaching the check they would pass. Verified after implementation by grep, as planned: the adviser authority query is unchanged, and `OR EXISTS` appears zero times inside the parent-only `POST /` and `PUT /:id` handlers. Consequences, each confirmed by test: an assigned non-adviser teacher passes the assignment leg as before and still gets `403` from the adviser check (unchanged); an adviser without assignments now passes the adviser leg and can review (fixed); a teacher who is neither still gets `404` (unchanged). **The `403`-vs-`404` convention on review needed no adjustment — the widening strengthens its rationale rather than disturbing it.** That `403` predates this work and is documented in a long comment at the handler: read scope is broader than review authority, so a teacher who can `GET` the letter must not be told it does not exist. Before, "broader" meant assigned non-advisers; now it also means adviser-only teachers, who reach the same code path and pass it. No new `403` was introduced anywhere in the file, and unlike the students fix no status-code split was needed — the split already existed and had been built for this exact reason. **The constant is deliberately duplicated between `students.js` and `excuses.js` rather than extracted**, following this codebase's own precedent: `utils/dateFormat.js` was extracted on the THIRD occurrence, and the `school_year` validator is still duplicated at two. A cross-reference comment now sits in **both** files naming its twin and stating that `routes/content.js` is the extraction trigger — so the third occurrence arrives with the decision already made instead of being re-argued. Each comment also records that the two files *use* the constant differently (read gate here, existence filter there) and that this is not an inconsistency. **Tests: `npm run test:excuses` 56 -> 67** (11 new), confirmed twice with no `db:setup` between runs. **All 56 pre-existing assertions were left unchanged and still pass — the same design check that validated the students change.** Predicted flip-by-flip beforehand and confirmed after: the assigned-non-adviser `403` fixture still passes read scope via the assignment leg and still fails the adviser check; the out-of-scope `404` fixture is a Grade 3 - Aguinaldo student TCH-001 neither teaches nor advises. New coverage proves both halves of the property — the adviser-only account now lists AND reviews a letter from its advisory section (`200`, `reviewed_by` set to that adviser), and still does not see the Aguinaldo letter (widening must not become "sees everything"), with `404` on both `GET /:id` and `PATCH /:id/review` for it. **An attendance-row-count invariant was added across the adviser's approval** — not requested, but excuse approval is record-only by the school's own words ("excuse lang yung bata pero absent pa rin"), so the property deserves an assertion that holds regardless of *who* approves, not only when TCH-001 does. **The fixture letter is inserted with direct SQL and tracked cleanup rather than submitted through the parent API**: Jea's seeded parent account (`1234567`) sits at status `pending` deliberately — `test:auth` depends on that row being pending, and a crashed run corrupted that exact row once before — so approving it to submit a letter would have traded one fixture for another. Confirmed after the run that it is still `pending`. Full 15-suite regression, every other suite matching its prior count exactly (auth 25, students 39, sections 30, attendance 38, content 47, contributions 38, settings 26, users 39, backups 39, sanitize 9, messages 39, restore 22, grades 141, grade-computation 51), and the DB confirmed back to the seeded baseline (5 users, 2 students, 0 excuse_letters/attendance/grades) after. **`section_id` now has THREE readers** — attendance scoping plus these two read scopes — and CLAUDE.md's note is updated from TWO to THREE with the reason, restating the warning; that note is what forced the check each time, so it is recorded as the gate working rather than a rule being repeatedly overridden. **One temporary cross-module inconsistency is recorded as dated and owned, not as an open bug:** until `content.js` and `messages.js` land, an adviser can review excuse letters and list students for a section they cannot yet post announcements to or message the parents of. Anyone testing across modules in that window is seeing scheduled work, not a defect. `git status` matched the whitelist plus one approved addition — `server/routes/excuses.js`, `server/scripts/test-excuses-flows.js`, `CLAUDE.md`, `docs/PROJECT_PROGRESS.md`, and `server/routes/students.js` for the twin cross-reference comment only (no logic change there). No client files, no schema, no seed. |
| 2026-09-06 | **`GET /api/students` read scope widened to include the section adviser — applying Stage G3's already-settled decision, not making a new one.** Surfaced by the Teacher -> Attendance planning pass as a real gap, not a theoretical one: `routes/students.js` scoped teachers through `teacher_assignments` while **every** attendance endpoint scopes through `sections.adviser_id`, so `TCH-002` (adviser of Grade 5 - Masigasig, zero assignment rows) could record attendance for a student the students endpoint would not list. Confirmed live before any code was written — `GET /api/students` returned **0 students** for `TCH-002` while `GET /api/sections` reported `student_count: 1` for that same section. The principle was already settled for Grades in Stage G3 (read scope wider than encode scope, because a teacher needs the full picture for their section, not only the subjects they teach); it had simply never been applied here. **The change:** a single exported `TEACHER_VIEW_SCOPE_SQL` constant — `EXISTS(teacher_assignments match) OR EXISTS(sections sec WHERE sec.id = s.section_id AND sec.adviser_id = ?)` — replacing the inline clause at the **two read sites only** (`GET /`, `GET /:id`). One definition rather than two copies, the same single-source reasoning G2d applied to `preflightGradeWrite()`. **The adviser leg matches `s.section_id`, not the VARCHAR grade_level/section pair** — deliberately the same column attendance scopes on, so "students I can list" and "students I can record attendance for" are the same set BY CONSTRUCTION rather than two definitions that agree today; a VARCHAR match would additionally catch students whose `section_id` is `NULL`, but those are unreachable by attendance anyway, so listing one the teacher then cannot record for would have traded this mismatch for a subtler one. That accepted blind spot mirrors one attendance already has. **This makes `students.js` the SECOND reader of `section_id`, and CLAUDE.md's "read in exactly ONE place" note is updated to say two, with the reason recorded** — that note existing is what caused the check to happen at all, which is the note working as designed, not being overridden. **Write scope did not move, and the trap that would have moved it is worth recording:** `PUT /:id` used the *identical inline EXISTS text* as the two reads, so the obvious implementation — search-and-replace across all three occurrences — would have silently let an adviser edit LRNs and birthdays for students they were never given authority over. `POST /` was safe only by accident, going through the separate `teacherHasAssignment()` helper. Both writes remain `teacher_assignments`-only, verified after implementation by grepping that the narrow clause still appears at the `PUT` site and in the helper, and nowhere else. **One consequence deliberately included rather than deferred: `PUT /:id` now answers `403`, not `404`, when a teacher is inside the new view scope but outside write scope.** Leaving it at `404` would have recreated exactly the contradiction Stage G3 refactored `grades.js` to remove — a write denying the existence of a record the sibling `GET` had just returned `200` for to the same account. Nothing new became editable; the refusal simply became honest, and it names the reason ("you can view this student as the adviser of their section, but editing student records is limited to teachers assigned to teach that class") rather than a bare "Access denied." Outside both scopes stays `404`, indistinguishable from a nonexistent id. **`TCH-002` deliberately keeps its zero `teacher_assignments` rows.** Seeding around the gap would have hidden it rather than closed it — and, the stronger reason, `TCH-002` is the **only fixture in the system that can distinguish the two scoping authorities at all**: every other teacher fixture satisfies both rules simultaneously, so no test written against them can tell "scoped by assignment" from "scoped by adviser". It was created in Stage B1 as a real non-adviser for attendance's tests and now does the mirror-image job; a comment in the test file says so, so a future session does not add assignment rows for convenience and silently delete the only account capable of failing these checks. **Tests: `npm run test:students` 30 -> 39** (9 new), confirmed twice with no `db:setup` between runs. Notably **all five pre-existing teacher-scoping assertions were left completely unchanged, and that was a check on the design rather than a convenience**: every one of them uses `TCH-001` against Jea, and `TCH-001` is neither assigned to nor adviser of Grade 5 - Masigasig, so Jea correctly stays out of scope under the widened rule — had any of the five flipped, the widening would have been wrong. New coverage proves both halves of the property: the adviser-only account now sees the student in its advisory section AND still does not see a student it neither teaches nor advises (widening must not become "sees everything"); `GET /:id` `200` inside the advisory section, `404` outside both; `PUT` `403` with the message asserted to name the reason, and `404` outside both. Full 15-suite regression afterward, every suite matching its prior count exactly (auth 25, sections 30, attendance 38, content 47, contributions 38, settings 26, users 39, backups 39, sanitize 9, messages 39, restore 22, excuses 56, grades 141, grade-computation 51), and the DB confirmed back to the seeded baseline (5 users, 2 students, 0 attendance/grades/grade_components/excuse_letters) after. Also corrected in the test file while there: stale `Grade 6 - Mabini` / `Grade 5 - Rizal` comments left over from before the sections rename, now `Malikhain` / `Masigasig` — the same stale-comment cleanup already done once in `excuses.js`. **Three more files carry the identical gap and are now recorded in OPEN QUESTIONS with owners rather than as loose observations: `routes/excuses.js` is SCHEDULED AS THE NEXT BACKEND DISPATCH** — sharper than this one, since read scope is `teacher_assignments` while review authority is adviser-only, meaning the adviser is the sole permitted reviewer of a queue they cannot see — followed by `routes/content.js` (the Class Board posting scope) and `routes/messages.js` (`canMessage`). **`routes/grades.js` is deliberately excluded**: its wide view scope is also assignment-based, but grade encoding is the subject teacher's authority by design and an adviser is not automatically entitled to a section's grades — widening it would be inventing school policy. **CLAUDE.md's Class Board OPEN QUESTIONS entry, which described this edge case as "theoretical here," is corrected — that description is now wrong**: `TCH-002` is the case, in the seeded data, and the same root cause has now been confirmed to bite twice for real. `git status` matched the whitelist exactly: `server/routes/students.js`, `server/scripts/test-student-flows.js`, `CLAUDE.md`, `docs/PROJECT_PROGRESS.md` — no client files, no schema, no seed. |
| 2026-09-06 | **Stage 4 foundation — the first frontend work since Stage 2, and the seven conventions every web page now inherits (frozen in CLAUDE.md's new STAGE 4 FRONTEND CONVENTIONS section).** Built foundation-first on purpose, against the real API, before any feature page existed: a convention invented by the first screen gets bent by the second, and the shared primitives would have been shaped by one page's needs instead of the design system's. Plan-then-approve dispatch as usual, then four rounds of review-driven amendment — three real defects were found by Darryl reviewing the rendered gallery, none of which any build or lint step catches, which is the argument for the gallery existing at all. **Routing/layout:** `App.jsx` converted from three flat routes to nested LAYOUT routes — `ProtectedRoute` gates each role, `Shell` renders the chrome once, pages are plain components in its `<Outlet />`. Pages no longer import `Shell` themselves; that pattern would have meant ~36 copies of the layout decision by the end of Stage 4. `Shell` became role-aware, reading `layout/nav.js` (the single source of per-role navigation) and deriving its header title by longest-prefix path match, with a `usePageTitle()` hook for detail views the nav cannot name. Stayed on `<BrowserRouter><Routes>` rather than migrating to `createBrowserRouter` for `useMatches()`/`handle` — same result, real churn. **Seven shared primitives** (`DataTable`, `Modal`, `FormField`, `StatusBadge`, `EmptyState`, `ErrorAlert`, `LoadingSpinner`) plus `format/grade.jsx`, all reviewable in a DEV-only gallery at `/dev/ui` — registered behind `import.meta.env.DEV`, **verified absent from the production bundle** by grepping a real build for strings unique to it, not asserted. **Response unwrapping (§1)** — the biggest thing this dispatch settled and the one the plan originally missed entirely: the foundation shipped `extractError` for the error path while the SUCCESS path (~30 inconsistent wrapper keys, `docs/API_REFERENCE.md` §7) was left undecided, which would have meant the first feature page inventing it. Now mandatory per-call `{ unwrap: 'key' }` / `{ unwrap: ['a','b'] }` / `{ raw: true }`, throwing both when neither is given and when a named key is absent — never `undefined`, so a backend rename fails loudly at the call site instead of rendering an empty table. A path-to-key map was rejected with reasons recorded in-file so it is not re-proposed: paths contain `:id` so it needs a route matcher not a lookup, it duplicates API_REFERENCE.md as a second hand-maintained source of truth, it moves the failure away from the file you have open — and, decisively, `GET /api/attendance` returns `attendance` as an ARRAY while `POST /api/attendance` returns it as an OBJECT, same key, cardinality varying by method, which no path matcher can disambiguate. `raw` is exactly two endpoints (`POST /backups/:id/restore`, the binary `GET /backups/:id/download`) and returns the FULL axios response, not the body — the download needs headers for the filename; noted in-file as the one place the two modes return different levels. Blast radius was two lines: `AuthContext.jsx` holds the only two `api.*` call sites in the client. `/auth/login` uses multi-key unwrap rather than `raw` specifically so it keeps the missing-key guard on the one screen every user starts from. **Both unwrap keys verified against the live API, not trusted from the reference doc** — `POST /auth/login` -> `success, token, user`; `GET /auth/me` -> `success, user`. That check incidentally settled a catalog discrepancy: `GET /api/users` returns `success, users` only, so API_REFERENCE.md's `user` row listing that endpoint is a doc slip — recorded for the scheduled audit, deliberately not fixed here (outside the whitelist). **The 403 redirect (§2) — a real pre-existing bug, found by questioning a claim in my own plan.** The Stage 2 interceptor cleared the token and redirected on `401` **and** `403`. Counting every origin: 18 route-level scope refusals, 1 `authorize()` role violation, 1 genuine dead session (`middleware/auth.js`'s `Account is not active.`) — so the redirect was wrong for **19 of 20**, and in this API a 403 is an *informative refusal* carrying a specific reason (which subject a teacher may not encode, why an excuse letter cannot be reviewed) that was being thrown away, with the user bounced instead of told why. Fixed to `401` alone. No string-matching on the message — fragile, and named as such; the real fix is server-side and is now recorded in OPEN QUESTIONS. Consequences stated rather than papered over: role violations now render an `ErrorAlert` (an improvement — re-login landed the user at the same refusal, a loop with extra steps), and a mid-session deactivation shows its message until the next refresh, when `AuthContext`'s `/auth/me` logs them out; no data renders meanwhile since every call is already 403. Also confirmed while here: **all 342 error responses across `server/routes/` are uniformly `{ success: false, message }`**, zero deviations — which is why `extractError` is a one-liner, and worth stating because the *success* wrappers are the opposite of uniform. **NULL grades (§3)** — `format/grade.jsx` replaces what started as a per-column inline hack in the gallery. `NULL` in Initial/Final Grade or General Average means "not yet computable", never missing and never zero; rendered as a blank a parent reads it as their child's grade having vanished. First version carried the pending-vs-not-applicable distinction in a `title` tooltip, which Darryl correctly rejected: **tooltips are hover-only and do not exist on touch, and the report card is the screen parents are most likely to read on a phone** — the two states would have collapsed into an identical bare dash for the audience most likely to misread it. Now inline text (`— Pending`, `— N/A`) with the tooltip retained for desktop but never the sole carrier; the split comes from the API's own `grading_mode`, never inferred from the null. Trade-off recorded knowingly: ~55-70px of column width per cell in a dense table, accepted because the cheaper bare-dash-plus-legend breaks the moment one table holds both reasons, which a teacher's cross-grade-level list can. **StatusBadge (§4)** — five status vocabularies, one central tone map ("Pending" means the same thing in three of them, so mapping it once is honest), unknown values falling back to neutral. **Recorded as a hard rule: NO VERDICT VARIANTS** — no `PASSED`, `FAILED`, `AT RISK`, `FOR RETENTION`. The school stated absence-based failure is at teacher discretion ("possible pang makapasa"), so the system counts and displays but never concludes; a verdict badge turns a teacher's judgment call into a system-issued fact a parent reads as final. **DataTable (§5)** — presentational, never fetches, owns its own loading/error/empty states so no page re-implements the three-state dance. **No pagination**, because no endpoint in this API accepts `limit`/`offset`/`page` (checked across every route file, zero hits) — building controls for a contract that does not exist; revisit trigger recorded as admin `GET /api/users` once real accounts exist. **Second review-found bug: nulls sorted FIRST in descending.** Emptiness was handled inside `compare()`, whose result was then multiplied by the direction factor, flipping `1` to `-1` — so sorting a grades column descending to find top marks put every ungraded row at the top. Fixed by resolving emptiness in the sort callback, outside the multiplier, with both-empty comparing equal (and `Array#sort` being stable, so they hold their incoming order). **Verified by extracting the real `isEmpty`/`compare`/sort-callback text out of `DataTable.jsx` and running them** — not a retyped copy — plus a negative control confirming the pre-fix logic fails those same assertions, so the test is not vacuous. **Third review-found item, and one where the stated mechanism did not hold:** the gallery had lost its DECIMAL-string discriminator when a fixture row changed to `0.00`, and the proposed fix (add `87.50` alongside `90.00`) would not have discriminated — lexicographic and numeric ordering agree on `0.00/87.50/90.00`, since `'8' < '9'`. Flagged rather than implemented as-asked, and fixed properly by adding `100.00`: numerically the largest value present, lexicographically the second-smallest, so a regression to `localeCompare` visibly moves it from last to second. Both rows are commented in-file with the two orderings written out so neither is tidied away. **Nav (§6)** — three states, not two: `built`, `blocked` (a stronger claim, carrying its reason as a tooltip, taking precedence), `unbuilt` (dimmed and non-clickable so it cannot drop the user into the catch-all redirect). Exactly one blocked item today: **Parent -> Attendance**, on the unanswered attendance rate formula — deliberately distinguished from merely-unbuilt, since teacher attendance encoding is not blocked at all. Recorded as a rule: **flipping `built: false` is part of whichever dispatch adds that page's route, never a follow-up.** **FormField (§7)** — the gallery's `<select>` rendered its `<option>` elements as bare stacked text, because `children` short-circuited the control entirely (`children ?? <Control/>`), making `as` and `children` accidentally mutually exclusive when a `<select>` is precisely the case needing both. Fixed: children are now children *of* the rendered control (forwarded only when `as !== 'input'`, since `<input>` is void and React throws), and a custom control moves to an explicit `render` prop taking a **single object** (`{ id, describedBy }`) rather than positional arguments, so a third piece of wiring later is not a breaking change at twenty call sites. **Three planning claims retired in the freeze**, none of which existed in CLAUDE.md or PROJECT_PROGRESS.md (searched, zero hits) — recorded so they cannot be re-derived from memory: "the first screen builds the shared components" and its ~5h/2-3h estimate (wrong sequence — primitives came first, and the estimate is void, explicitly not replaced with a new guess but marked pending measurement from Teacher -> Attendance); "backend is 100% complete" (replaced with "ten backend modules complete, 76 endpoints, tests passing, one gap identified and an audit scheduled"); and "36 screens" (the real figure is **75 role-facing views** — 33 nav items plus 42 detail/sub views, Teacher 23 / Parent 19 / Admin 33 — behind **~45-50 distinct implementations**, since several screens serve multiple roles; **the counting rule is recorded with the numbers** — a substantive form counts whether route or modal, a bare confirm does not — because without it the next session produces a third figure). Two speculative exports were removed during the dispatch rather than kept "just in case" (`toneForStatus`, `formatGrade`), each noted in-file as exportable the day something actually needs it — the same discipline that kept pagination out of `DataTable`. Verified: `npm run build` clean, `oxlint` clean apart from two pre-existing `AuthContext.jsx` warnings (flagged, not fixed — Stage 2 code, outside this dispatch), gallery confirmed stripped from the production bundle, sort behaviour re-checked in the browser by Darryl (ascending `0.00, 87.50, 90.00, 100.00, Pending, N/A`; descending `100.00, 90.00, 87.50, 0.00, Pending, N/A`). **No server files touched in any round** — this was frontend and docs only, and the one backend defect found (the `Account is not active.` status code) was flagged into OPEN QUESTIONS rather than fixed inline. `git status` matched the agreed whitelist at every checkpoint. **Next: Teacher -> Attendance as the first feature slice, then `GET /api/messages/contacts` plus the endpoint audit as one backend dispatch.** |
| 2026-09-06 | Class Board — investigated, zero code needed. Docs-only session (no code, no test changes) closing out the school's group-chat request: a group chat was rejected deliberately (thirty parents in one thread see each other's names and messages, the teacher becomes a moderator, minors are involved), and the alternative — a section-scoped announcement, teacher posts, every parent in the section reads, no parent sees another parent — was framed from the start as an extension of Feature 4 (Announcements & Memo Dissemination), not an eleventh feature, specifically so the manuscript's IPO framework and feature count wouldn't need to change. **The investigation (plan-then-approve, 8 questions) found that framing is literally true of the code, not just a documentation convenience: `routes/content.js`'s existing `announcements` endpoints already deliver every stated behaviour, unchanged.** `POST /api/announcements` already requires a teacher to name an exact `target_grade`+`target_section`, checked against `teacher_assignments` via `resolveAnnouncementTarget()`/`teacherHasAssignment()`; `GET /api/announcements`'s parent branch already returns school-wide posts plus the child's own section; `authorize('teacher', 'admin')` already excludes parents from posting; and no endpoint anywhere exposes a section roster to a parent — `GET /api/students` is `authorize('teacher', 'admin')` only, a system-wide guard, not a Class-Board-specific one. Net result: zero new endpoints, zero changes to `routes/content.js`, zero risk to its 47 passing tests, since nothing about it changes. **This correctness of "no code needed" is what this session's docs actually record — the deliverable is the finding, not a build.** Two things the investigation invalidated were corrected rather than left standing: (1) CLAUDE.md's "sections table" note had reserved `announcements.section_id` for the Class Board specifically — that reservation did not pan out and is now stated as "investigated and found unnecessary," not "not built" (still pending). Reasoning recorded: the read side gains nothing (`target_grade`+`target_section` already does the identical scoping job as a two-column match), and the write side was never wired regardless (`POST /api/announcements` never set `section_id`, and `backfillSectionIds()` only runs once at `db:setup` against whatever rows already exist) — so reading it would have silently returned nothing for any announcement created in normal operation. `section_id` is now documented as read in exactly ONE place: attendance scoping. (2) A new "Class Board" section was added recording the finding plus three decisions made explicit rather than left implicit: **parents never reply, permanently** (a visible reply recreates the rejected group chat; a teacher-only-visible reply is structurally identical to a private message — same volume, same burden, just a second parallel inbox — and the Messages module is already the correct channel for a question about a post); **no new column or flag** (a Class Board post is identified by its shape alone — teacher-posted, both `target_grade` and `target_section` set — distinguishing it visually is a Stage 4 rendering decision, not a schema one); and **no link back to the originating message** (a `source_message_id` would turn "reduce repeated PMs" into "build a provenance trail," a different and larger feature nobody asked for). The "Post to class" flow (a teacher publishing a private-message answer to the whole section) is recorded as a pure Stage 4 UI action — pre-fill the composer, call the existing `POST` — not a backend item. **One theoretical edge case recorded in OPEN QUESTIONS, deliberately not fixed pre-emptively:** `teacherHasAssignment()` (the Class Board's posting scope) checks `teacher_assignments` by grade+section only, never `sections.adviser_id` — an adviser with zero subject assignments in their own advisory section would be locked out of posting there. Checked against the school's photographed class programs (Jenny Ann B. Dulce — TLE/English in VI-Malikhain; Girly V. Lacuna — GMRC/English/Math in III-Malinis; Maric D. Carlos — everything in I-Maagap) and found not to occur at this school; the fix, if it ever does, is a one-line `OR` onto the existing check. BUILD ORDER's Announcements line updated to record Class Board as complete under the existing checkbox, not a new one — matching the "extension of Feature 4, not an eleventh feature" framing structurally, not just in prose. Files touched: `CLAUDE.md`, `docs/PROJECT_PROGRESS.md` only. |
| 2026-09-06 | Grades module Stage G3 — `GET /api/grades`, `GET /api/grades/:id`, `GET /api/grades/student/:studentId`. This is the last Grades stage: a parent can now see a single grade for the first time in the module's history, and the module moves out of CURRENT STATE's "not started" heading entirely. Plan-then-approve dispatch, 11 questions, explicitly required to **resolve** (not merely discuss) a decision G2b had left provisional: whether teacher read-scope should match encode-scope exactly, or be broader — and what that implies for the `404` every `:id`-keyed write endpoint has returned on out-of-scope since G2c. **Resolved as broader — grade+section, any subject, matching `students.js`/`content.js`/`excuse_letters.js`'s own `EXISTS` pattern — not the narrower subject-specific scope Grades' writes use.** Reasoning confirmed on review: Grades' subject-specific write-scope was always the exception in this codebase, not the norm, and a teacher can already see a student's full profile via `students.js` regardless of which specific subject they teach that student — extending the same trust to a read of that student's OTHER grades is not a new grant, it's consistency with what's already visible. **Direct, confirmed consequence: the five `:id`-keyed write endpoints (`POST /:id/components`, `PUT`/`DELETE /:id/components/:componentId`, `PATCH /:id/exam`, `PATCH /:id/descriptive`) now return `403` naming the subject, not `404`, when a teacher is within the new wide view-scope but outside the narrow encode-scope** — the exact reasoning Excuse Letters' `PATCH /:id/review` already applied (a `GET` that already shows the teacher the row makes a `404` on a sibling write self-contradictory, not protective), now met for Grades for the first time since G3 is what finally builds a `GET`. Implemented in three isolated passes specifically so a break would be attributable to one of them, not the combined diff — each passed on its own, then verified together. **PASS 1 — the `loadAuthorizedGrade()` refactor**, touching four already-shipped, already-tested endpoints (five call sites, since `PUT` and `DELETE` on components are separate handlers). Split into two tiers: `teacherCanViewGrade(teacherId, gradeLevel, section)` (new — the wide check) determines `404` (nonexistent id, or outside view-scope entirely — a true "cannot see this" signal, unchanged in spirit from before); the existing `teacherCanEncodeGrade` (subject-specific) now only populates a `canEncode` flag on the return value, checked by a new shared `encodeScopeError(loaded)` called by all five write endpoints immediately after `loadAuthorizedGrade`, answering `403` when `canEncode` is `false`. Admin gets `canEncode: true` unconditionally from `loadAuthorizedGrade` itself, so the new check is a no-op for admin — no behavior change there. Test-writing consequence, not a production concern: the existing "out-of-scope teacher" tests (Jea, Grade 5 — TCH-001 has no `teacher_assignments` row there at all, any subject) were kept as-is and relabeled "different section entirely," since that case fails the wide view-scope check too and correctly stays `404` — proving the refactor didn't accidentally loosen the fully-out-of-scope case while fixing the partially-out-of-scope one. New coverage: a Science grade row for Marwin (TCH-001's own section, Grade 6 - Malikhain, but a subject TCH-001 doesn't teach) exercises all five write endpoints and confirms each now answers `403` naming "Science" — including a check that the scope check fires *before* `PATCH /:id/descriptive`'s mode-mismatch check (`403`, not `400`, even though Science is numerical-mode), proving the new check was inserted at the right point in each handler, not appended after existing logic that might short-circuit first. `npm run test:grades` grew from 96 to 102 (6 new assertions), full 14-suite regression afterward matched every prior count exactly. `git status` showed only the two files this pass touched (`server/routes/grades.js`, `server/scripts/test-grades-flows.js`). **PASS 2 — two new pure lookups in `utils/gradeComputation.js`**, isolated from the routing change entirely: `qualitativeDescriptor(grade)` (GRADING_SPEC Table 11 — a numerical band, checked top-down so a boundary value like exactly 90 lands in the higher band, returning `{descriptor, remarks}`; `null` for missing/undefined/out-of-0-100-range input, the same "never guess a partial result" contract as every function already in this module) and `descriptiveGradeMeaning(letter)` (Table 8 — a lookup object keyed A-E, returning `{descriptor, filipino}`; `null` for anything else). Noted directly in code and tested explicitly, not just observed: Table 8's five English words are the *same words* as Table 11's five numerical bands (A/Advancing through E/Emerging) — DepEd's own letters are named after the qualitative descriptors, not an independent vocabulary, and a dedicated assertion confirms this by calling both functions and comparing, rather than trusting it by eye. `scripts/test-grade-computation.js` grew from 29 to 51 assertions: all 8 explicitly requested band boundaries (90/89/80/79/75/74/65/64), the full-range ends (0, 100) and just-outside them (-1, 100.01), all 5 letters with their Filipino translations, and invalid-letter/null/lowercase rejection. `git status` showed only `server/utils/gradeComputation.js` and `server/scripts/test-grade-computation.js` for this pass. **PASS 3 — the three `GET` endpoints**, built last so both prior passes were already proven independently. `GET /` lists, scoped in the `WHERE` clause itself rather than filtered in JS after the fact: parent forced to `req.user.student_id` (an explicit `?student_id=` for a *different* child is `403`, not silently ignored or silently overridden); teacher via an `EXISTS (... teacher_assignments ... grade_level = s.grade_level AND section = s.section ...)` clause — the SQL expression of the same wide view-scope PASS 1 introduced; admin unscoped. Filters `student_id`/`subject_id`/`term`/`school_year` are all optional with no hidden defaults — providing all four together deterministically resolves to at most one row, the same fields as `uq_grade_record`'s own unique key, closing a lookup gap that has existed since `POST /api/grades` first shipped in G2b with no way to find an existing `grade_id` afterward. Never includes `grade_components` — a list response returning full raw-score history on every row would bloat a payload whose purpose is finding a row, not inspecting one. `GET /:id` does include `grade_components`, plus a new `descriptor` field inferred directly from which of the grades table's own two dual-mode columns (`term_grade`/`descriptive_grade`) is populated — no separate `grading_mode_configs` lookup needed, since the table's own design already guarantees at most one is non-null at a time. Teacher/admin scope reuses `loadAuthorizedGrade` directly (ignoring `canEncode`, irrelevant to a read); parent access is written as a direct, explicit `WHERE g.id = ? AND g.student_id = ?` rather than piggybacked on the teacher-shaped helper, specifically to avoid an accidental-coincidence correctness (a parent's user id happening to return `false` from a `teacher_assignments` lookup for the right *symptom* but the wrong *reason*). `GET /student/:studentId` builds the full report card the dispatch asked for: every subject at the student's grade level, including ones with **zero grade rows at all** — queried from `subjects` directly by `grade_level`, then overlaid with whatever `grades` rows actually exist, so a genuinely missing subject and a not-yet-encoded one are never confused (a dedicated test confirms GMRC, untouched by any Grade 6 fixture in this suite, still appears with `terms: {1: null, 2: null, 3: null}`). Final Grade (average of the three term grades) and General Average (average of Final Grades across subjects) **both follow the identical NULL-until-complete rule Initial Grade already uses (`utils/gradeComputation.js`'s own header comment) — deliberately not a running average, confirmed with a second reason beyond G2a's original one.** Final Grade carries real weight beyond a confusing UI: it determines promotion and is what prints on the SF9, so a parent who sees a number in October would reasonably treat it as settled — by the time the real figure lands in March, the earlier partial number was already a mistake no caveat text can undo. One rule at all three levels of the computation chain (component → IG, term → FG, subject → GA) is also simply more defensible than three separate variations that all solve the same shape of problem differently. General Average was deprioritized in G1a/G2a ("if time allows") and **built now**, not deferred further — it's the direct extension of a computation that already exists at read time, and GRADING_SPEC §4 lists it as the literal last step of the same chain; stopping one step short would have been an arbitrary place to draw the line. For a descriptive-mode student (Grade 1), both FG and GA are genuinely `null` — not "pending," not "incomplete" — since GRADING_SPEC §7 gives KS1 no GA-based awards at all (Character Traits Awards instead); a `grading_mode` field at both the per-subject and top level is how a caller tells "null, still in progress" (numerical, incomplete) apart from "null, does not apply" (descriptive) without guessing from the null alone. `school_year` on this one endpoint defaults to `system_settings.academic_year` when omitted — a deliberate asymmetry with `GET /`'s no-default filters, commented at the handler: a report card is bounded to one school year by what it fundamentally *is*, a search tool is not, and nobody should have to pass the current year explicitly just to see their child's report card. Tests: a dedicated Grade 2 fixture (the smallest numerical-mode grade level, 5 subjects) built via **direct SQL inserts of `term_grade` values, bypassing the WW/PT/EX write path on purpose** — that arithmetic is already proven by the worked examples in earlier stages, so only the FG/GA *aggregation* needed new coverage. Four of five subjects got all three terms inserted at once (`term_grade` 84/90/87 → FG 87.00 each, verified as the exact average by hand); the fifth was built up one term at a time, doubling as both the FG null-with-one/null-with-two/populated-with-three progression AND the exact trigger that flips General Average from `null` to populated once every OTHER subject already has an FG — hand-checked: FG 85.00 = (80+85+90)/3, GA 86.60 = (87.00×4 + 85.00)/5. `npm run test:grades` grew from 102 to 141 (39 new assertions across all three endpoints — role scoping, filter validation, the view/encode disagreement surfacing correctly through `GET` too, the Grade 1 report card, and the FG/GA fixture), confirmed three times in a row with no `db:setup` between runs. `npm run test:grade-computation` — 51 passing (unchanged from PASS 2, confirmed again as part of the full regression). Full regression across the other thirteen suites afterward: all unchanged from their prior counts (auth 25, students 30, sections 30, attendance 38, content 47, contributions 38, settings 26, users 39, backups 39, sanitize 9, messages 39, restore 22, excuses 56). DB confirmed back to the seeded baseline (0 `grades`, 0 `grade_components`, 2 `students`) after — checked directly, not assumed from the suite's own `finally` block existing. `git status` after all three passes combined showed exactly the four whitelisted files changed (`server/routes/grades.js`, `server/utils/gradeComputation.js`, `server/scripts/test-grades-flows.js`, `server/scripts/test-grade-computation.js`) — no scope expansion across any of the three passes. **Grades is now fully built** — all ten core features have at least their backend API complete except Grades' own frontend (Stage 4) and Mobile (Stage 5); see BUILD ORDER. |
| 2026-09-06 | Grades module Stage G2e — `PUT`/`DELETE /api/grades/:id/components/:componentId` and `PATCH /api/grades/:id/lock`, the toggle that finally lets the `is_locked` gate every write endpoint has checked since G2c actually fire. Plan-then-approve dispatch, 10 questions, two confirmed findings the report itself called out as its strongest: the completeness-gate rejection (below) and the reversion trace (below). Component edit stays nested under `/:id/components/:componentId`, not a flat `/components/:componentId`, despite `grade_components.id` already being a unique PK on its own — matching the two sibling endpoints already nested this way and the DB's own ownership model (`grade_id` is a required FK). A `componentId` not belonging to the given grade id (or not existing at all) is `404`, undifferentiated — one `WHERE id = ? AND grade_id = ?` query, the exact collapsing `loadAuthorizedGrade` already does for the parent id. `type` is **not** editable via `PUT` — changing WW to PT moves a score between two separately-weighted averages, a re-categorization rather than a correction; a differing `type` in the body is `400` naming the constraint explicitly ("delete this component and add a new one with the correct type instead"), not silently ignored, since a caller sending a different type almost certainly expects it to take effect. **Deleting the last component of a type required zero new code**: `componentPercentage([])` already returns `null` (from G2a), so `ww_percentage`/`pt_percentage` — and `initial_grade`/`term_grade` with them, if that was the last of the three required inputs — revert to `NULL` automatically on the next `recomputeGrade()` call, the identical code path as "nothing was ever entered." Verified as a genuine reversion, not just traced: the test suite builds a dedicated fixture to **full completion** first (WW 40/50+30/50, PT 90/100, EX 80/100+70/100+90/100 → Initial Grade **83.30**, a real looked-up Term Grade) specifically so deleting its last WW component afterward demonstrates dropping from a real computed value back to `NULL`, not a trivial already-null case — by that point the row had passed through 84.30 (after an edited score) and 90.00%-`ww_percentage`-alone (after deleting one of two WW rows) first. **`PATCH /:id/lock` is admin-only, unscoped — confirmed explicitly, not extended to teacher self-locking.** Locking is a school-wide finalization boundary tied to the End-of-Term Block (DO 009 s.2026), not individual teacher discretion, and nothing the school has said describes a teacher finalizing their own encoding — inventing that now would be exactly the unconfirmed-policy guessing this project has refused to do everywhere else in this module (item-count caps, bonus-point clamping, Grade 1's letter formula). **Recorded as an open school question in OPEN QUESTIONS, explicitly alongside the Grade 1 manual-judgment assumption** — the two sit together in spirit, both proceeding on reasoning rather than a school reply. **Deliberately not gated on completeness — the strongest finding in this stage, and stated as a comment directly on the handler so a future session doesn't add the check back as an "obvious" safety improvement.** A literal `initial_grade IS NOT NULL` check would make every Grade 1 (descriptive-mode) row **permanently** unlockable, since a descriptive row never populates `initial_grade` at all by design (see the `grades` table's own dual-mode comment in `schema.sql`) — a bug that would only surface weeks later, on one grade level, the first time anyone tried to lock a perfectly complete Grade 1 row. Whether an incomplete *numerical* grade should be lockable is a separate administrative-process question the school hasn't answered either; the system doesn't second-guess it — a mistaken lock is always reversible via the same endpoint. Verified directly, not just reasoned: the test suite locks both a Grade 1 descriptive row and a numerical row with `initial_grade` still `NULL`, both succeeding with `200`. **Unlock carries no extra friction versus lock** — no step-up auth, no required reason, the identical admin-only `PATCH` in both directions. Restore's step-up auth exists specifically because a restore is irreversible; an unlock is reversible by re-locking, so matching that friction here would be theatre, not safety — the admin-only gate plus full old-value/new-value `logActivity` on every toggle (`'update_grade_lock'`, a direct copy of `sections.js`'s adviser-PATCH logging shape) is the real safety rail. Both `PUT` and `DELETE` are transaction-wrapped with `recomputeGrade()`, identical shape to `POST /:id/components` — no new transaction design, direct reuse of the pattern established in G2c. Tests: `scripts/test-grades-flows.js` grew from 71 to 96 assertions: edit a component's score with the recomputed `ww_percentage` and `initial_grade` asserted by hand (70.00→75.00, 83.30→84.30), edit label/`date_recorded` only with computation confirmed unchanged, a type-change attempt rejected, componentId/grade-id mismatch and a nonexistent componentId both `404`, delete-one-of-two recomputing to the remaining component alone (90.00%), delete-the-last reverting all three of `ww_percentage`/`initial_grade`/`term_grade` to `NULL` together, teacher/parent locked out of locking, admin succeeding against a `NULL`-`initial_grade` row, all three write endpoints (`components`, `exam`, `descriptive`) confirmed `403` while locked, unlock restoring writes, and the Grade 1-descriptive-lock case explicitly proven not broken. `npm run test:grades` — 96 passing, confirmed three times in a row with no `db:setup` between runs. Full regression across the other thirteen suites afterward: all unchanged from their prior counts (auth 25, students 30, sections 30, attendance 38, content 47, contributions 38, settings 26, users 39, backups 39, sanitize 9, messages 39, restore 22, excuses 56), plus `test:grade-computation` still 29/29. `git status` after implementation showed exactly the two whitelisted files changed (`server/routes/grades.js`, `server/scripts/test-grades-flows.js`) — no scope expansion. **Stage G3 (viewing, GA at read time) is the only Grades work remaining** — a parent still cannot see a single grade anywhere in this system. |
| 2026-09-06 | Grades module Stage G2d — `PATCH /api/grades/:id/descriptive`, Grade 1's manual A-E letter, the other side of the numerical/descriptive gate G2c built. **Grade 1 as a manual teacher judgment call is recorded explicitly as an assumption the module proceeds on, not a school-confirmed answer** — both in a comment on the handler itself and here: the school has not said how a teacher arrives at A-E, DO 015 s.2026 defines no Initial-Grade-to-letter formula at all, and the reasoning that justifies proceeding (descriptive grading exists specifically to avoid numerical labeling in Key Stage 1) is not the same thing as a school reply. If the school later says a computation feeds the letter, this endpoint changes — the schema (one nullable `descriptive_grade` column) already accommodates either answer without a migration. Plan-then-approve dispatch, 10 questions, one confirmed refactor to already-shipped code: **`preflightGradeWrite()` was changed to take an `expectedMode` parameter (`'numerical'` | `'descriptive'`) instead of being duplicated for the new endpoint** — confirmed explicitly rather than left as a choice: two copies of scope/mode/lock logic would drift silently over time, since a fix applied to only one copy still passes that copy's own tests, and the divergence would surface as a real bug, not a test failure. G2c's two existing call sites (`POST /:id/components`, `PATCH /:id/exam`) were updated to pass `'numerical'` explicitly as part of this — a one-line change each. **The full 56-assertion grades suite was re-run immediately after the refactor and before any new endpoint code was written**, specifically so a regression would be attributable to the refactor alone rather than confused with the new code; it passed unchanged, confirming the refactor was behavior-preserving before building on top of it. No transaction for the new endpoint — a plain `pool.query()` `UPDATE` touching exactly one column, matching `POST /api/grades`'s own single-statement precedent; unlike the two G2c endpoints, nothing derives from this write, so there is no follow-up computation to make atomic with it. `descriptive_grade: null` clears the column, deliberately mirroring G2c's sub-test-clearing convention (a wrong letter must be as undoable as a wrong exam score) rather than inventing a second clearing rule in the same module. `is_locked`'s gate is inherited for free by reusing the shared `preflightGradeWrite()` — not a separate decision, and it still can't fire for any of the three write endpoints until Stage G2e builds the toggle. `POST /api/grades` is untouched: a Grade 1 shell row was already creatable before this stage, deliberately, per G2b's own mode-agnostic creation design confirmed by tracing the actual code, not assumed. Response returns only `grade` — no child resource is created, so this matches `PATCH /:id/exam`'s exact shape rather than needing a new synthesis the way `POST /:id/components` did. Validation: `descriptive_grade` must be exactly one of `'A'`–`'E'` (uppercase) or explicit `null`; the rejection message names the case requirement directly ("...(uppercase), or null to clear") rather than just listing the valid letters, so a teacher sending lowercase can tell the letter was right and the case was wrong. Tests: `scripts/test-grades-flows.js` grew from 56 to 71 assertions, reusing the exact Grade 1 fixture row G2c already built for its own descriptive-mode-rejection tests rather than creating a new one. One new fixture: a real `teacher_assignments` row giving TCH-001 Grade 1 Mathematics in the fixture student's section, specifically so "subject teacher succeeds" exercises an actual subject teacher rather than only admin — deleted in the `finally` block. Covered: subject teacher sets A (200); every numerical column asserted still `NULL` afterward — the property that actually matters, not just the status code; B/C/D/E each accepted; `null` clears; lowercase `'a'` rejected with the message asserted to mention "uppercase"; invalid letter `'F'` rejected; missing field rejected; the same endpoint against a numerical (Grade 5) grade rejected with `400`; `POST /:id/components` against the Grade 1 row re-asserted still `400` (the other side of the gate, checked again here, not just trusted from G2c); out-of-scope teacher `404`; parent `403`; admin unscoped success. `npm run test:grades` — 71 passing, confirmed three times in a row given the new fixture, no `db:setup` needed between runs. Full regression across the other thirteen suites afterward: all unchanged from their prior counts (auth 25, students 30, sections 30, attendance 38, content 47, contributions 38, settings 26, users 39, backups 39, sanitize 9, messages 39, restore 22, excuses 56), plus `test:grade-computation` still 29/29. `git status` after implementation showed exactly the two whitelisted files changed (`server/routes/grades.js`, `server/scripts/test-grades-flows.js`) — no scope expansion. Stage G2e (component edit/delete, `is_locked`/lock-toggle — what finally lets the lock gate already built into all three write endpoints actually fire) and Stage G3 (viewing, GA at read time) remain. |
| 2026-09-06 | Grades module Stage G1b — `subjects` reseeded with the school's real per-grade learning areas, closing the deferral G1a opened. Plan-then-approve dispatch, 9 questions, two decisions carried the most weight. **Grade 1 gets zero `grade_weight_configs` rows, enforced by a JOIN against `grading_mode_configs` (`WHERE mode = 'numerical'`), not a hardcoded `grade_level >= 2` comparison** — confirmed as a mid-plan correction, not the original proposal: the simpler grade-level form would work for SY 2026-2027 but wouldn't fail loudly in SY 2027-2028, when Grade 2 also goes descriptive per the KS1 rollout — it would quietly reseed weight rows for a now-descriptive grade with nothing to catch it. The JOIN form means changing one row in `grading_mode_configs` is what drives the exclusion automatically, the same "data absence drives behavior, not a hardcoded year" principle the transmutation table already uses in this same file — using two different approaches to an identical problem in one seed file would have been exactly the inconsistency a future session tries to "fix," undoing the correctness this stage exists to add. `grading_mode_configs`'s seed block moved earlier in `seed.sql`'s file order (now before `grade_weight_configs`, was after) purely because the weight seed needs it to already exist. **40 subjects seeded** (5/5/6/8/8/8 for Grades 1–6), transcribed from `docs/GRADING_SPEC.md` §6c, which already carried the exact list, the Grade 4 inference, and the naming-alternate note before this dispatch — no spec changes needed, only acting on what was already recorded there. Grade 1: Makabansa, Mathematics, GMRC, Language, Reading. Grade 2: English, GMRC, Makabansa, Mathematics, Filipino. Grade 3: GMRC, English, Science, Mathematics, Filipino, Makabansa. Grade 4 (**recorded as INFERRED, not confirmed** — never photographed during the school visit; basis stated in the seed comment: matches the SF9's 8 intermediate-level rows and Grade 5's photographed program exactly): English, Mathematics, Filipino, Araling Panlipunan, GMRC, Science, MAPEH, EPP. Grade 5: English, Filipino, Araling Panlipunan, Science, GMRC, EPP, Mathematics, MAPEH. Grade 6 (seeded under the SF9's names — GMRC, EPP — not the class program's ESP/TLE for the same two learning areas, since the SF9 is what the parent actually holds; alternates recorded in a comment, not silently dropped): English, Filipino, Araling Panlipunan, Science, GMRC, Mathematics, MAPEH, EPP. `Homeroom Guidance`/`ARAL Program` excluded — not graded. GMRC and Makabansa were **not** treated as ambiguous despite not appearing verbatim in DO 015's own table: GRADING_SPEC §2 names GMRC directly ("GMRC / Values Education") and resolves Makabansa explicitly ("Makabansa uses 20% / 50% / 30%") — both textually explicit in the source, not judgment calls. `grade_weight_configs` reseeded fresh: 35 rows (Grades 2–6 only; core subjects 20/50/30, MAPEH/EPP 20/60/20), replacing all 48 of G1a's placeholder-keyed rows. The cascade this stage was deferred for landed exactly as anticipated in the G1 planning pass: `subjects.id` has `ON DELETE CASCADE` from `teacher_assignments`, `grade_weight_configs`, **and** `grades` — reseeding destroyed TCH-001's 3 seeded Grade 6 assignment rows and every old weight row. Both were expected; **a live precondition check (`SELECT COUNT(*) FROM grades`) confirmed 0 rows before the reseed ran**, so the `grades` cascade risk this stage carried never destroyed real data — checked, not assumed. `setup-db.js`'s `teacher_assignments` INSERT needed **zero code changes**: it already resolves `teacher_id`/`subject_id` by `WHERE s.grade_level = 6 AND s.name IN ('Mathematics', 'English', 'Filipino')`, not a hardcoded id, and all three names survive unchanged into the new Grade 6 list — confirmed by tracing the actual SQL before the dispatch even started, not assumed and found working by luck. **Every existing test fixture needed zero code changes too** — confirmed by grep across the whole `server/` tree: only `test-grades-flows.js` and `test-excuses-flows.js` reference `subjects` at all, and both resolve dynamically (by name+grade_level, or "any row at that grade"), never a hardcoded numeric id; every specific name either file references (`Mathematics`, `Science`, `Filipino`, `English`, `MAPEH` at various grades) survives unchanged into the new curriculum. `scripts/verify-grading-seed.js` extended with checks proving the reseeded shape from the output side, not by re-reading the seed SQL's own stated intent: exactly 40 subjects with the correct per-grade count, exactly 35 weight rows, zero weight rows for any subject at a descriptive-mode grade level, and correct MAPEH/EPP vs. everything-else bucketing — 20/20 passing (was 11/11). `npm run db:setup` ran clean against the new seed on the first try — the unchanged `teacher_assignments` INSERT resolving correctly was direct confirmation the name-based design worked as reasoned, not just as hoped. Full regression across all fourteen other suites afterward, matching every specified count exactly: auth 25, students 30, sections 30, attendance 38, content 47, contributions 38, settings 26, users 39, backups 39, sanitize 9, messages 39, restore 22, excuses 56, grades 56, grade-computation 29 — `test:grades` and `test:excuses` (the two suites actually touching `subjects`) each re-confirmed a second time for extra certainty given the scale of this reseed. `routes/grades.js` (already built through Stage G2c) required no changes — none of its handlers hardcode a subject id or name. `git status` after implementation showed exactly the two whitelisted files changed (`database/seed.sql`, `server/scripts/verify-grading-seed.js`) — `setup-db.js`, `schema.sql`, and every route file untouched, confirming the "zero code changes needed" findings above held in practice, not just in the plan. Stages G2d (Grade 1's descriptive write) through G2e (component edit/delete, `is_locked`/lock-toggle) and G3 (viewing, GA at read time) remain — none of them were blocked by this stage, and none of them are affected by which specific subjects now exist. |
| 2026-09-06 | Grades module Stage G2c — `POST /api/grades/:id/components` and `PATCH /api/grades/:id/exam`, the first writes that actually compute anything and the first place `utils/gradeComputation.js`'s pure functions run against real HTTP traffic. Plan-then-approve dispatch, 10 questions, two confirmations mattered most: (1) a missing `grade_weight_configs` row is a **pre-flight `409`**, checked before any write, not a "save the raw score anyway and degrade quietly" alternative — confirmed with an added reason: a grade row holding a real raw score with blank computed columns and no explanation reads to a teacher as "the system is broken," not "an admin needs to configure something," so rejecting up front with a named reason is strictly better. Preflight order locked: scope (`404`) → `grading_mode_configs` (`400` if descriptive, `409` if unconfigured) → `is_locked` (`403`) → `grade_weight_configs` presence (`409`) → *then* the write → recompute → commit — all checks before the transaction opens, so a rejection costs the caller nothing. (2) `recomputeGrade()` lives in `routes/grades.js`, not `utils/gradeComputation.js` — that module stays pure by design (no DB, no HTTP, per its own header comment), and recompute needs four DB reads (`grades`, `grade_components` split by type, `grade_weight_configs`, `transmutation_table`); `recomputeGrade()` is the glue, fetching what the pure functions need and calling them for every actual calculation, then writing the result back — full recompute from source on every call, never an incremental running total, so an edit or delete in G2e recomputes correctly with no special-casing. Runs on the same transaction connection as the write that triggered it (`pool.getConnection()` → `beginTransaction()` → insert/update → `recomputeGrade(conn, ...)` → `commit()`, rollback in `catch`, release in `finally`), matching `attendance.js`'s `POST /bulk` shape exactly — a failure after the insert lands rolls back the insert too. `PATCH /:id/exam` accepts any subset of ST1/ST2/TE: score and max are always a pair per sub-test (omitting one carries the other forward from the existing row; ending up with exactly one of the two set is `400`); an explicit `null` on either field clears *both* for that sub-test (a legitimate undo); sending one field as explicit `null` and the other as an explicit non-null number in the same request is a genuine contradiction, rejected as its own `400` rather than silently guessed at. Response shape is a deliberate, explicitly-commented asymmetry: `POST /:id/components` returns both the new `component` row and the recomputed `grade` row (it creates a real child resource, matching this codebase's create-returns-the-row convention, plus the parent a caller needs to update a live display); `PATCH /:id/exam` returns only `grade` (no child resource created) — the first endpoint pair in the codebase with the child-create-triggers-parent-recompute shape, a synthesis of two existing precedents rather than a copy of one. Out-of-scope on both endpoints is `404`, carrying forward G2b's already-provisional call (no `GET /api/grades` exists yet). Item-count caps stay documentation-only; `score > max_score` (bonus points) stays unclamped — both carried forward from G1a/G2a, not reconsidered. **Real finding surfaced during testing, confirmed to be a test-writing gotcha and not a production bug:** mysql2 returns `DECIMAL` columns as strings (`"90.00"`, not `90`) — the first 12 HTTP assertions written against computed values all failed on strict `===` against a number literal even though the actual values were exactly correct (the failure output itself showed "got 90.00" against an expected `90.0`). `utils/gradeComputation.js`'s own functions already call `Number(...)` on every input specifically to guard against exactly this, confirmed by tracing the full pipeline — `initialGrade()` sums already-`weighted()`-computed numbers (genuine JS numbers by the time they reach it, never raw DB strings), so the computation itself was never at risk. Fixed with a local, null-safe `num()` coercion helper added to `test-grades-flows.js` — a test-assertion fix, not a route or `gradeComputation.js` change. Tests: `scripts/test-grades-flows.js` grew from 26 to 56 assertions. Centerpiece is a full worked example driven step-by-step through the real endpoints, reusing `test-grade-computation.js`'s exact numbers so any mismatch between the trusted pure math and the wired-up HTTP result would surface as a wiring bug, not a new unverified expectation: WW 45/50 then 42/50 added (asserting `ww_percentage` correct *after each call independently* — 90.00% then 87.00% — the one property a pure unit test structurally cannot exercise, since it requires real persistence across two separate requests, not one collapsed call), PT 88/100 + 92/100 (90.00%), then ST1 17/20, ST2 16/20, TE 45/50 set one at a time via three separate `PATCH` calls with `initial_grade` asserted `NULL` at every intermediate step and appearing as exactly `88.05` only once all three are complete (`ex_percentage` 85.50% = 85×0.30+80×0.30+90×0.40; `initial_grade` 88.05 = 17.40+45.00+25.65). The identical raw scores were then repeated against a fresh MAPEH-subject grade row (admin-only — TCH-001 isn't assigned MAPEH) to get `initial_grade` 88.50 instead (17.40+54.00+17.10), proving the weight lookup — not the raw scores — is what changed. Both `88.05` and `88.50` transmute to `TG 90` per the seeded table (coincidentally, both fall in the 87.70–88.87 band) — checked by a live query against `transmutation_table` in the test itself, never a hardcoded guess, per the explicit instruction to verify this way. Also covered: descriptive-mode rejection (`400`) on both endpoints against a fresh Grade 1 fixture student; out-of-scope teacher `404` on both endpoints against the existing Grade 5 fixture from G2b; negative score and `max_score` of 0 rejected (`400`); `score > max_score` accepted unclamped (110.00%, not capped to 100); empty `PATCH /:id/exam` body rejected; `st1_score` without `st1_max` rejected when no existing max is on the row; explicit `null` clearing both columns; the explicit-null-plus-number conflict rejected; and transaction atomicity — a rejected write (the descriptive-mode case) leaves `grade_components` at a `COUNT(*)` of exactly 0 both before and after, asserted by row count directly, not inferred from the status code alone. Worth noting honestly: because every expected-failure path in this design is a pre-flight check that runs *before* the transaction opens, there is no normal-path scenario that reaches an actual insert-then-rollback — the atomicity test therefore proves "a rejected write never writes," which is the property that matters, rather than literally exercising a mid-transaction rollback, which the pre-flight design makes structurally unreachable through ordinary validation failures. `npm run test:grades` — 56 passing, confirmed three times in a row (one more than usual, given this stage's fixture complexity) with no `db:setup` between runs. Full regression across the other thirteen suites afterward: all unchanged from their prior counts (auth 25, students 30, sections 30, attendance 38, content 47, contributions 38, settings 26, users 39, backups 39, sanitize 9, messages 39, restore 22, excuses 56), plus `test:grade-computation` still 29/29. `git status` after implementation showed exactly the two whitelisted files changed (`server/routes/grades.js`, `server/scripts/test-grades-flows.js`) — no scope expansion, and no `server.js`/`package.json` change needed since G2b already mounted the route and registered the `test:grades` alias. Stages G2d (Grade 1's descriptive write, `PATCH /:id/descriptive`) through G2e (component edit/delete, `is_locked`/lock-toggle) and G3 (viewing, GA at read time) remain. |
| 2026-09-05 | Grades module Stage G2b — `routes/grades.js` exists for the first time, `POST /api/grades` only, mounted between `/api/sections` and `/api/attendance`. Creates a shell row: every score/computed column `NULL`, `is_locked 0`. No computation runs here — `utils/gradeComputation.js` is not imported by this file at all, confirmed at the end by grep, not just by intent. Plan-then-approve dispatch, 8 questions, one finding load-bearing: **scoping is the subject teacher's, via `teacher_assignments` (`teacher_id`+`subject_id`+`grade_level`+`section`, all four)** — a second, deliberate scoping authority alongside `sections.adviser_id` (attendance, excuse-letter review), narrower than `students.js`/`content.js`'s own `EXISTS` pattern (which never checks `subject_id`, since grade/section-level access is enough for those modules but not for grade encoding). Uses `students.section`/`teacher_assignments.section` (VARCHAR), never `section_id` — checked against CLAUDE.md's own "sections table" rule (`section_id` reserved for attendance + the unbuilt Class Board) rather than assumed. **Validation order is security-motivated, stated as an explicit in-code comment so a future session doesn't "optimize" it away:** the `subjects.grade_level !== students.grade_level` mismatch check runs strictly *after* a teacher's scope is resolved — checking it earlier would let an out-of-scope teacher learn a real student's actual grade level just by probing with a deliberately wrong `subject_id` and reading the `400` message, exactly the enumeration the collapsed `403` exists to prevent. **Admin/teacher status-code asymmetry read from `attendance.js`'s actual precedent, not the flatter "POST → 403" phrasing the dispatch used to describe it:** a nonexistent `student_id` is `404` for admin (plain lookup failure) but `403` for a teacher, collapsed together with "exists but out of scope" into one message, since a teacher probing ids shouldn't be able to tell which — this asymmetry was surfaced by reading `attendance.js`'s `POST /` directly rather than taking the dispatch's shorthand literally, and confirmed correct on review. Tested as its own named property, not incidentally: `test-grades-flows.js` explicitly asserts "Teacher with a nonexistent student_id gets 403, NOT 404" so a careless refactor collapsing both roles to the same status can't pass silently. `subject_id` nonexistent → `400` (not `404`), checked before the student is loaded at all, identically for both roles — subjects are unscoped reference data, no role-sensitive leak either way. The out-of-scope `403` message names the subject specifically (`subject.name`, echoed back — the teacher supplied it themselves, so this leaks nothing) but stays generic about grade/section (a real student's grade and section are not that teacher's to learn just by probing). No `grading_mode_configs` consultation anywhere in this endpoint — confirmed, not assumed: a Grade 1 shell row and a Grade 5 shell row are structurally identical at creation, since nothing mode-specific is written until G2c/G2d. Response is the bare `grades` row, no join to student/subject names, matching every other create-endpoint in this codebase (`students.js`, `attendance.js`, `excuses.js` all do the same). `school_year` validated with the same regex + consecutive-year check as `routes/settings.js`'s `validateAcademicYear`, duplicated locally rather than extracted — this is only the second occurrence, extraction deferred to a third, matching `utils/dateFormat.js`'s own precedent. Confirmed before building test fixtures, not assumed: `subjects`' still-wrong placeholder seed data (48 uniform rows, real per-grade lists deferred to G1b) neither breaks nor complicates this endpoint — every placeholder row still carries a real, correct `grade_level`, which is all this endpoint's logic depends on. Tests: `scripts/test-grades-flows.js`, 26 assertions — subject-teacher creates own assignment (201, every score/computed column `NULL`, `is_locked 0`); admin creates unscoped; assigned-to-section-but-not-subject vs. fully-out-of-scope as two distinct `403` cases (the former asserted to name the subject); the admin-404/teacher-403 nonexistent-student asymmetry asserted explicitly; nonexistent `subject_id` → `400`; wrong-grade-level subject → `400` naming both grades (via admin, deliberately — a teacher can't even reach this check without first clearing scope, since `teacher_assignments` requires the *correct* grade_level to match); `term` 0 and 4 → `400`; malformed and non-consecutive `school_year` → `400`; inactive student → `400`; duplicate `(student_id, subject_id, term, school_year)` → `409`; unauthenticated → `401`; parent → `403`. One throwaway fixture (an inactive Grade 6 student, created via the real `POST /api/students` → `PATCH /api/students/:id/status` flow) and every created grade row deleted in a `finally` block. `npm run test:grades` — 26 passing, confirmed twice in a row with no `db:setup` between runs. Full regression across the other thirteen suites afterward: all unchanged from their prior counts (auth 25, students 30, sections 30, attendance 38, content 47, contributions 38, settings 26, users 39, backups 39, sanitize 9, messages 39, restore 22, excuses 56), plus `test:grade-computation` still 29/29 — confirms this stage didn't leak outside `routes/grades.js` and its own mount line. `git status` after implementation showed exactly the four whitelisted files changed (`server/routes/grades.js`, `server/scripts/test-grades-flows.js`, `server/server.js`, `server/package.json`) — no scope expansion. Stages G2c (WW/PT/EX writes, full recompute wiring through `utils/gradeComputation.js` and the transmutation lookup) through G2e (component edit/delete, `is_locked`/lock-toggle) and G3 (viewing, GA at read time) remain. |
| 2026-09-05 | Grades module Stage G2a — the write-path arithmetic, built and unit-tested in complete isolation before any route or HTTP code exists. Two-round dispatch, same shape as G1a: a PLAN ONLY pass answered 9 questions (row creation, exact recompute logic, teacher-assignment scoping, the descriptive-mode gate, edit/delete/lock behavior, staging, ambiguities), and one finding from that plan — not from this dispatch's own build — fed back into the schema before any G2 file was touched. **Schema correction to `grades` (folded into G2a's whitelist, not a separate dispatch):** G1a's original design stored only a derived `ex_percentage` for the Examinations composite, breaking the symmetry its own reasoning depended on — WW/PT retain every raw score via `grade_components`, but EX would have retained nothing, meaning a parent asking "what did my child score on ST1" could never be told the raw number, and a wrong `max_score` entered by a teacher could never be corrected once the source was gone. Fixed while `grades` still held 0 rows (plain `CREATE TABLE` edit via the next `db:setup`, not a live migration): `ex_st1`/`ex_st2`/`ex_te` now hold the **raw score**, with three new columns (`ex_st1_max`/`ex_st2_max`/`ex_te_max`) holding each sub-test's max; `ex_percentage` stays a derived cache computed at write time, never the source of truth. `verify-grading-seed.js` needed no change — it only ever asserted against `transmutation_table`/`grade_weight_configs`/`grading_mode_configs`, never `grades`. New `server/utils/gradeComputation.js` — pure functions only, no DB or HTTP dependency: `componentPercentage()` (WW/PT — `sum(score)/sum(max_score)×100`, well-defined from a single row, `null` only when there are zero rows or every `max_score` sums to 0), `subTestPercentage()` (one EX sub-test), `exPercentage()` (ST1×0.30 + ST2×0.30 + TE×0.40, requiring all three), `weighted()`, `initialGrade()` (sum of the three weighted components, requiring all three), and `roundTo2()`. Every function returns `null` on any missing required input rather than computing a partial number — confirmed on review as "the single most important decision in the module": an Initial Grade computed from only WW, with PT and EX still empty, would read as a real (and likely failing) grade to a parent, so it must never be a number until every required input actually exists. Rounding: half-up (not half-to-even/banker's), to 2 decimals, at **every** stored step — and each step's formula consumes the *already-rounded* prior value, never a hidden higher-precision intermediate — confirmed reasoning: a parent must be able to check the math by hand and have it come out; displayed math that doesn't add up destroys trust faster than a hundredth of a point of theoretical precision loss ever would. `roundTo2()` adds a `Number.EPSILON` nudge before rounding specifically to correct IEEE 754 representation error at exact `.005`-style boundaries — `1.005` is stored in binary floating point very slightly *below* that value, so a naive `Math.round(1.005 * 100) / 100` silently gives `1.00` instead of the mathematically correct `1.01`; verified directly in the test suite, not just reasoned about. A percentage over 100% (bonus points, or a data-entry error indistinguishable from one at this layer) is **deliberately not clamped** anywhere in this module — neither `GRADING_SPEC.md` nor DO 015 mentions a bonus-points cap, and inventing a clamp here would be inventing a grading policy that doesn't exist; if a cap is ever wanted, it belongs in route-level validation (`score <= max_score`) as an explicit, separate policy decision. Scoping decided (not yet built, no route exists): grade encoding is authorized via `teacher_assignments` (`teacher_id`+`subject_id`+`grade_level`+`section`), using `students.section`/`teacher_assignments.section` (VARCHAR) — checked directly against CLAUDE.md's own "sections table" rule that `section_id` is reserved for exactly two routes (attendance, the unbuilt Class Board) rather than assumed — confirming Grades is a **second, deliberate scoping authority** alongside `sections.adviser_id` (attendance, excuse-letter review), not an inconsistency, since DepEd assigns grade encoding to the subject teacher specifically. `404` decided for out-of-scope `:id`-keyed writes (components/exam/descriptive) and `403` for `POST /api/grades` — deliberately the *opposite* choice from Excuse Letters' `PATCH /:id/review`, and the reason is structural, not arbitrary: Excuse Letters chose `403` because an existing `GET` endpoint already showed that teacher the letter, so `404` would have contradicted it; G2 has no `GET /api/grades` at all yet, so nothing else in the system lets a teacher see a grade row they can't encode, making `404` a true "cannot see this" signal here, same as `PUT /api/attendance/:id`. Marked explicitly provisional pending Stage G3, same as Excuse Letters' equivalent note. A missing `grading_mode_configs` row for a given grade/year is decided as a hard `409` naming the gap, not a silent default and not a `500` — a `500` would read as a crash rather than a fixable configuration problem. Two endpoints were added to G2's scope that weren't in the original intended list, both confirmed explicitly rather than built silently or the question silently declined: component edit/delete, and `PATCH /:id/lock` (admin-only) — without a lock toggle, `is_locked` can never fire as a real guard. Deferred to sub-stage G2e, not built here. Tests: `scripts/test-grade-computation.js`, direct-call, no server/DB, matching `test-sanitize-user.js`'s shape exactly. Includes two full worked examples with numbers checkable by hand — the same raw scores (WW: 45/50 + 42/50 → 87.00%; PT: 88/100 + 92/100 → 90.00%; EX: ST1 17/20 → 85.00%, ST2 16/20 → 80.00%, TE 45/50 → 90.00% → EX 85.50%) computed against core weights (20/50/30 → IG **88.05**) and MAPEH/EPP weights (20/60/20 → IG **88.50**) — same inputs, confirmed different outputs under different weights. Every partial-state null case tested explicitly (no components at all, WW only, WW+PT without EX, ST1+ST2 without TE). Rounding boundary tested two ways: `roundTo2(0.125) === 0.13` (half-up; half-to-even would give `0.12` — both `0.125` and `12.5` are exactly representable in binary floating point, isolating the rounding *rule* itself from any representation-error artifact) and `roundTo2(1.005) === 1.01` (the representation-error case the `Number.EPSILON` nudge exists for). Division by zero covered (`max_score` of 0 → `null`, not `Infinity`/`NaN`, both for a single sub-test and for a component list whose `max_score`s all sum to 0). Over-100% covered and asserted as unclamped, flowing through `weighted()` unclamped too. `npm run test:grade-computation` — 29 passing, confirmed twice (deterministic — pure functions, nothing to re-run for in the usual idempotency sense). `npm run db:setup` re-run against the corrected schema; `node scripts/verify-grading-seed.js` — still 11/11, unaffected by the `grades`-table-only correction. Full regression across the other thirteen suites afterward: all unchanged from their prior counts (auth 25, students 30, sections 30, attendance 38, content 47, contributions 38, settings 26, users 39, backups 39, sanitize 9, messages 39, restore 22, excuses 56) — confirms the schema correction didn't leak outside the Grades tables. `git status` after implementation showed exactly the two whitelisted new files (`server/utils/gradeComputation.js`, `server/scripts/test-grade-computation.js`) plus the two whitelisted edits (`database/schema.sql`, `server/package.json`) — `verify-grading-seed.js` needed no change, confirmed rather than assumed, and no route file, no `server.js` change, and no HTTP anywhere in this stage, exactly as scoped. Stages G2b (`POST /api/grades` row creation + scoping) through G2e (component edit/delete + `is_locked`/lock-toggle) and G3 (viewing, GA at read time) remain. |
| 2026-09-05 | Grades module Stage G1a — schema rebuilt for DO 015 s. 2026 / DO 009 s. 2026, no `routes/grades.js` yet. This was a two-round dispatch: a PLAN ONLY pass covering the full module (9 questions: table-by-table defects, proposed DDL, EX sub-component storage, dual-mode grading storage, transmutation lookup mechanics, data-destruction check, endpoint/staging estimate, spec ambiguities, unconfirmed assumptions) was answered in full before a second approval **split the originally single-stage plan in two** — G1a (this entry) and G1b (deferred) — specifically because the plan's own Q6/Q7 finding surfaced two problems (`subjects` reseed cascades through `teacher_assignments`; Grade 4's learning areas are unconfirmed) that applied to only *part* of the work, and bundling them with the rest would have made one commit both mechanical and blocked. `grade_weight_configs` dropped and recreated: re-keyed `(subject_id, school_year)` — not grade band — with `ww_weight`/`pt_weight`/`ex_weight` (renamed from `quiz`/`activity`/`exam` to match DO 015's actual terms) and `CHECK (ww_weight + pt_weight + ex_weight = 100.00)`. **Seeded against the CURRENT `subjects` rows on purpose** — `subjects` itself was explicitly kept out of scope for this stage, so the weight seed is provisional until G1b reseeds both together; `20.00/60.00/20.00` for subjects named `MAPEH`/`EPP`, `20.00/50.00/30.00` for everything else, via one `INSERT ... SELECT` over `subjects` rather than 48 hand-written rows. `grades` dropped and recreated: `quarter ENUM('Q1'-'Q4')` → `term TINYINT CHECK (term BETWEEN 1 AND 3)` — matches this schema's own established convention for small bounded integers (`grade_level` uses the identical shape) rather than continuing the one ENUM outlier the old column was. Gained `ww_percentage`/`ww_weighted`, `pt_percentage`/`pt_weighted`, `ex_st1`/`ex_st2`/`ex_te`/`ex_percentage`/`ex_weighted`, `initial_grade`, `term_grade`, `descriptive_grade` — a comment directly on the table states the dual-mode design explicitly (exactly one of `term_grade`/`descriptive_grade` is ever populated, decided by `grading_mode_configs` at write time, self-describing at read time with no lookup needed) specifically so a future session doesn't "clean up" the nullable pair by dropping or merging them — the KS1 rollout means both columns stay live indefinitely, not as a transitional artifact. Final Grade and General Average are deliberately not columns anywhere — both are pure aggregates of `term_grade` values, to be computed at read time whenever Stage G3 is built, not materialized now. `grade_components` dropped and recreated: `type ENUM('quiz','activity')` → `ENUM('WW','PT')` only, with a comment stating the absence of a `'formative'` value is deliberate (DO 015: formative assessments never feed computation) rather than an oversight. EX's three sub-scores were the plan's first genuinely open design question (`docs/GRADING_SPEC.md` §3 poses it directly: "decide before building") — resolved as three dedicated columns on `grades` (`ex_st1`/`ex_st2`/`ex_te`), not child rows in `grade_components`, reasoning: WW/PT are "N raw scores → one average" (exactly what a child table + aggregation is for), EX is a fixed, positional, government-formula triple that never grows a fourth part, so "is this exam complete" is a `NOT NULL` check on the row itself rather than a child-table query. New `transmutation_table` — 41 rows transcribed verbatim from `docs/GRADING_SPEC.md` §5, `school_year = '2026-2027'` only, verified by the new `scripts/verify-grading-seed.js` to have no gaps or overlaps across the full 0.00–100.00 range at 0.01 precision (walked as consecutive `ig_min = previous ig_max + 0.01` pairs) and to resolve the spec's own explicit boundary case correctly via the real lookup query, not just the raw seed values (IG 70.00 → TG 75, IG 69.99 → TG 74). Lookup is `WHERE school_year = ? AND ig_min <= ? AND ig_max >= ?`; disappearing for SY 2027-2028 needs no code change — a school year with no seeded rows returns nothing from that query, and the application (once Stage G2 exists) reads a missing row as "use the Initial Grade directly," so the data's absence drives the behavior change, never a hardcoded year comparison. New `grading_mode_configs` — one row per `(grade_level, school_year)`, seeded for SY 2026-2027 per Table 12 (Grade 1 `descriptive`, Grades 2–6 `numerical`); a dedicated table rather than a `system_settings` key, since that table's flat allow-listed shape can't express a per-grade-per-year lookup without inventing composite key strings. The plan's *second* genuinely open design question — how Grade 1 computes a letter grade — turned out to have **no answer anywhere in `docs/GRADING_SPEC.md` at all**: a full 41-row numeric transmutation table exists, but zero IG-to-letter threshold mapping. Resolved (confirmed on review, not assumed silently) as a manual teacher judgment call — the teacher picks A–E directly, WW/PT/EX stay informational for Grade 1 and never compute into a letter — reasoning: DO 015 introduces descriptive grading specifically to avoid numerical labeling in KS1, so computing an IG and transmuting it to a letter would be numerical grading wearing a letter costume; the school's own Grade 1 Oral Reading Progress Chart is purely observational; and no KS1 academic awards exist (GRADING_SPEC §7) to need a rankable number. The school has been asked to confirm this directly — if the answer differs, it changes one Stage G2 write handler, not the schema. Real, working code outside the Grades tables also had to change: `routes/settings.js`'s `current_quarter` validator read `grades.quarter`'s ENUM live via `INFORMATION_SCHEMA`, specifically because the quarter-vs-term question was provisional when that code was written (see the 2026-08-27 entry). DO 009 s. 2026 has since settled that as a confirmed DepEd fact, and `grades.term` is a `TINYINT + CHECK` now anyway — nothing left to introspect — so the live-introspection function was deleted outright and replaced with a hardcoded `['1', '2', '3']`; the `system_settings` key itself renamed `current_quarter` → `current_term` (seeded value `'1'`). Folded into this stage rather than dispatched separately, since renaming `grades.quarter` would have broken `test:settings`'s ENUM-sniffing assertion regardless of when the settings fix landed. `scripts/test-settings-flows.js` updated to match — every `Q1`-`Q4` literal replaced with `'1'`-`'3'`, and the source-inspection "does it really read the live ENUM" mechanism test removed outright (there's no mechanism left to verify) rather than left as dead weight. `npm run test:settings` — **26 passing, was 27** — the one-assertion drop is the removed mechanism check, not a regression; confirmed twice in a row with no `db:setup` between runs. Two design decisions explicitly deprioritized rather than built: General Average (computation-chain step, but its only current consumer — Awards — is out of scope) and item-count caps / `is_locked`'s trigger (both documentation-only, not validated in code, for this stage). `npm run db:setup` run clean against the new schema+seed; `node scripts/verify-grading-seed.js` — 11/11 checks passing (41-row count, full-range coverage, zero gaps/overlaps, both explicit boundary values, every weight row summing to 100.00, exactly 6 grading-mode rows with Grade 1 descriptive and Grades 2–6 numerical). Full regression across the other twelve suites afterward: all unchanged from their prior counts (auth 25, students 30, sections 30, attendance 38, content 47, contributions 38, users 39, backups 39, sanitize 9, messages 39, restore 22, excuses 56) — confirms the schema rebuild didn't leak outside the Grades tables and `system_settings`. `git status` after implementation showed exactly the five whitelisted files changed (`database/schema.sql`, `database/seed.sql`, `server/routes/settings.js`, `server/scripts/test-settings-flows.js`) plus the one new file (`server/scripts/verify-grading-seed.js`) — `subjects`, `teacher_assignments`, and `routes/grades.js` untouched, confirming Stage G1b's scope boundary held. Stage G1b (subjects reseed + teacher_assignments replacement, blocked on Grade 4 confirmation with the school) and Stages G2 (grade encoding) / G3 (grade viewing, GA at read time) remain — see BUILD ORDER. |
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