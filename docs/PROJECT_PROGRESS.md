# CAPSTONE — Parent's Portal System

> Mirror of CLAUDE.md for reference when switching between tools.
> CLAUDE.md is authoritative. If the two disagree, CLAUDE.md wins.

**Captain H. Francisco Elementary School (Gr 1–6)**
**Sept 7, 2026** — system proposal checkpoint, **not** the final defense.
**Final defense** — expected around November 2026.

**Last updated:** 2026-09-18 (**Stage 4 is COMPLETE** — Admin → Backup &
Restore landed last; every Figure 5 admin process now has a page. Admin scope
follows Figure 5 — Darryl's decision, 2026-09-13, acting on the ADMIN SCOPE
AUDIT; not a team consultation. Admin → Grades surfaces the lock and
deliberately not delete (Darryl, 2026-09-14). School year is not editable from Admin → Settings (the API still
accepts it). 20 of 23 sections have no adviser and, with Admin → Sections not
being built, no screen can assign one — so attendance cannot be recorded in
them. Sections, Excuse Letters, Events and Messages will not be built. Memos
live on Admin → Announcements (Darryl, 2026-09-14) — the only place a memo can
be written. 20 tables.)

**Decided and applied 2026-09-18 (Darryl):** the five admin nav entries with
no page — Sections, Excuse Letters, Memos, Events, Messages — are **removed**
from `nav.js` rather than left `built: false`, because `built: false` means
*unwritten*, not *refused* (§6). **Admin nav is now 8 items, all built;**
teacher (11) and parent (9) are unchanged and **no role has a `built: false`
item** — the state is still supported and is demonstrated in `/dev/ui`.
Separately, and already true in code, grade **lock and unlock are admin only** —
`PATCH /api/grades/:id/lock` (`routes/grades.js:1286`) is `authorize('admin')`
and is the only route reaching the sole `UPDATE grades SET is_locked` (`:1334`);
there is no separate unlock path, and Admin → Grades already renders both
labels from one toggle. See CLAUDE.md → ADMIN SCOPE AUDIT → SCOPE DECISION
(2026-09-18).

**Filter widths, corrected 2026-09-18.** The first pass at this scoped its
file list from the phrase “the five filter bars” and missed four of them;
the browser check caught Admin → Announcements still resizing. Every
`<select>` and `as="select"` under `client/src/pages` was then audited — 41
occurrences, 20 files. **22 are filter-bar or toolbar selects and all 22 now
carry `filterSelectClass`**; the remaining 19 sit inside a Modal’s
`space-y-4` or a `grid` cell, where the parent already fixes the width. One
deliberate exception: the per-row attendance select on Teacher → Attendance
lives in an `11rem` DataTable column and keeps `controlClass`. Two bars —
Teacher → Announcements and Teacher → Events — were outside that dispatch's
whitelist and were declared as SCOPE EXPANSION rather than edited; **Darryl
approved the expansion the same day and both now carry the token (`1ceff55`)**,
so every filter-bar select under `client/src/pages` has it. Token unchanged at
`w-full sm:w-72`; 30 characters is still the longest real option. See
`docs/CHANGELOG.md`, 2026-09-18.

**UI pass, 2026-09-18.** A write’s result now renders under the control that
caused it — `client/src/components/FormStatus.jsx`, applied across 13 pages.
One `status` object per page keyed by form; writing a key replaces the object,
clearing the others. One value per status, so a success and a failure cannot
both be on screen: the XOR each page used to re-derive by hand is structural.
A message that outlives its modal renders above the list it describes (Admin →
Users has two keys for its two tables). Nothing in `Shell` is sticky, which is
why a shared slot at the top of the page put a confirmation off-screen on
Teacher → Settings. Errors still go through `ErrorAlert` (§2 wording kept);
successes gained `role="status"`. Separately, every filter-bar select now
takes one shared `filterSelectClass` (`w-full sm:w-72`, sized to the longest
real option — 30 characters) so the control no longer resizes with the
selection. See CLAUDE.md §7c and `docs/CHANGELOG.md`, 2026-09-18.

**Verified 2026-09-18 (Darryl, browser):** the 2026-09-15 status-code fixes
behave on screen — a wrong restore step-up password shows "Incorrect password."
inline with a **403** and the admin stays logged in; a wrong current password on
Teacher → Settings shows the error inline and the teacher stays logged in. The
six fixtures queued for deletion (announcements 33/34/35, memo 13, grades
285/286) were found **already gone**, removed by direct SQL outside the API
before 2026-09-14 16:38 UTC — no `delete_*` log entries, AUTO_INCREMENT never
reset, and absent from both the restored dump and its safety copy. Nino's five
descriptive grade rows are intact. Full evidence: `docs/CHANGELOG.md`,
2026-09-18.

**Browser check PASSED on Branch 3 (Darryl, 2026-09-18, through `1ceff55`),
and its fixtures were removed by recorded SQL.** Passed on screen: Teacher →
Settings messages under their own control; the restore wrong-password inline in
the modal, still logged in; the filter bars on Teacher → Events / Announcements
and the admin bars; a parent account created for student 154 from Student
detail, approved and edited on Admin → Users, and the student edited on
Student detail — each message rendering above the table or card it describes.
Grades lock deferred to Branch 4. **Cleanup:** no delete endpoint exists for a
student or a user, by design, so Darryl chose a recorded SQL removal — backup
26 (`parents_portal_2026-09-18_163801.sql`) taken first through the API; every
FK onto `students.id` and `users.id` listed with its row count (only
`users.student_id` pointed at 154, and that was user 115 itself); then one
transaction deleting user 115 and student 154, nothing else. After: users 7,
students 3, Jea's account still `pending`, Nino's five grade rows unchanged,
`activity_logs` kept in full. **Four findings recorded in
`docs/KNOWN_ISSUES.md`, none fixed:** `POST /students` accepts any text as an
LRN (154 was `Test Student`); Student detail always offers "Create parent
account" although the server refuses a second one with a `409`; the restore
modal's "Incorrect password." renders above the password field; five
`activity_logs` descriptions embed the LRN. Full row: `docs/CHANGELOG.md`,
2026-09-18.

**Seeded baseline lives in one place:** CLAUDE.md → CURRENT STATE → Seeded
baseline. Do not repeat the live counts here. After a clean `db:setup` the
demo Grade 1 path exists: Nino Alcantara (LRN `1090001`, Grade 1 - Mabait),
parent Rosa (`1090001` / `Parent@2026`, active), teacher TCH-003 (Lito
Bautista — adviser of Mabait AND assigned all five Grade 1 subjects).
TCH-002 stays assignment-less. Letters on the card are illustrative fixture
data, not a computed result.

> **Build order:** Database → Auth → Backend APIs → React Web → Expo

---

## Milestone tracker (roadmap — status, not percentages)

| Stage | Backend | Web | Mobile |
|-------|---------|-----|--------|
| Stage 1 — Foundation (schema, seed, auth API, auth tests) | ✅ | — | — |
| Stage 2 — Auth frontend (login, ProtectedRoute, 3 dashboards) | — | ✅ | — |
| Stage 3 — Backend modules (Student Records → … → Grades) | ✅ | — | — |
| Stage 4 — Web pages (parent / teacher / admin) | — | ✅ **COMPLETE 2026-09-14.** Teacher and Parent web roles complete · Admin → Users, Students, Settings, Attendance, Announcements with memos, Grades and Backup & Restore — every Figure 5 admin process has a page; Sections, Excuse Letters, Events and Messages stay `built: false` by the scope decision | — |
| Stage 5 — Mobile (Expo) | — | — | ❌ |
| Stage 6 — Integration, deployment, demo polish | ❌ | ❌ | ❌ |

Stage 3 is ✅ done: Student Records, Attendance, Announcements/Memos/Events,
System Settings, User Management, Messages + Socket.io,
Backup/Restore, and Excuse Letters (full module, including review) are
fully built (see CLAUDE.md's "RESTORE" section for what the automated
suite deliberately does not cover). `sections` (schema + 23-row seed) is also in — see
CLAUDE.md's "sections table" note; **attendance is now the first route
that reads `section_id`** (Stage B1, 2026-09-04 — rebuilt per day, adviser-
scoped), everything else still scopes on VARCHAR, deliberately. **A
Sections API (2026-09-05) is now the management interface for the table
itself** — `GET /`, `GET /:id` (unscoped, all roles), `PATCH /:id/adviser`
(admin only) — a separate thing from that VARCHAR→`section_id` migration,
not a third route joining it; this is what lets an admin assign still-NULL
sections without a direct DB write (how many are NULL is in CLAUDE.md's
Seeded baseline). Not one of the original
10 core features. **The
school-visit answers have started arriving.** Grades' original four
blockers are all answered (DO 009/DO 015 s. 2026 — see CLAUDE.md's
"BLOCKED / RESOLVED"), and as of **2026-09-05 (Stage G1a) the schema
itself is rebuilt to match** — `grade_weight_configs`/`grades`/
`grade_components` recreated, `transmutation_table`/`grading_mode_configs`
added. **Same day, Stage G2a adds the pure computation layer** —
`utils/gradeComputation.js` (29/29 unit tests, no server/DB) plus a G1a
schema correction so the Examinations composite retains its raw scores
the same way Written Works/Performance Tasks already do. **Same day
again, Stage G2b adds `routes/grades.js`** — one endpoint,
`POST /api/grades`, creating a scoped shell row with zero computation
(the arithmetic from G2a isn't even imported yet). Scoping here is a
second, deliberate authority: the *subject teacher* via
`teacher_assignments`, not `sections.adviser_id`. **2026-09-06, Stage
G2c wires the two together** — `POST /:id/components` (WW/PT) and
`PATCH /:id/exam` (ST1/ST2/TE) are the first writes that actually
compute anything, the first place `gradeComputation.js`'s pure functions
run against real HTTP traffic. Full recompute from source on every
write, transaction-wrapped with the raw write so a failure rolls both
back together. A worked example driven through the real endpoints
confirmed the exact same numbers as the unit tests: raw scores → Initial
Grade **88.05** under core (20/50/30) weights, **88.50** under MAPEH
(20/60/20) weights, both transmuting to Term Grade **90**. **Same day,
Stage G1b reseeds `subjects` with the school's real 40-subject
curriculum** (5/5/6/8/8/8 per Grade 1-6), replacing the uniform
placeholder list — Grade 4's list is recorded as inferred, not
confirmed. `grade_weight_configs` reseeded to 35 rows via a durable JOIN
against `grading_mode_configs` (excluding whichever grade levels are
descriptive, not a hardcoded grade-level cutoff) — Grade 1 gets zero
weight rows, since no code path can ever read one. The cascade this was
deferred for landed exactly as expected and was fully absorbed: zero
code changes needed anywhere outside `seed.sql` and the verification
script. **Same day, Stage G2d adds `PATCH /:id/descriptive`** — Grade 1's
manual A-E letter, the other side of the numerical/descriptive gate.
**This proceeds on an assumption, not a school-confirmed answer**: the
school hasn't said how a teacher arrives at A-E, and DO 015 defines no
formula — the module proceeds because descriptive grading exists to
avoid numerical labeling in KS1, not because the school replied. If that
changes, the endpoint changes, not the schema. `preflightGradeWrite()`
was refactored (not duplicated) to share scope/mode/lock logic across
all three write endpoints now, with the full grades suite re-run
immediately after that refactor and before the new endpoint, so any
regression would be attributable to one or the other, not both at once.
**Same day, Stage G2e adds correction, removal, and finalization** —
`PUT`/`DELETE /:id/components/:componentId` fix or remove a WW/PT entry
(full recompute either way), and `PATCH /:id/lock` (admin-only,
unscoped) is the toggle that finally lets the `is_locked` gate every
write endpoint has checked since G2c actually fire. Deliberately **not**
gated on completeness — an `initial_grade IS NOT NULL` check would make
every Grade 1 row permanently unlockable, since descriptive rows never
populate that column by design. Unlock carries no extra friction versus
lock. Whether a teacher should be able to lock their own encoding is
recorded as an open school question, not decided. **Stage G3
(2026-09-06) closes the loop — `GET /`, `GET /:id`, and
`GET /student/:studentId` mean a parent can finally see a grade.** The
report card endpoint returns every subject at the student's grade level
(including ones with zero grade rows — never silently missing), all
three terms, a computed Final Grade, and a computed General Average.
Both follow the same NULL-until-complete rule as Initial Grade,
deliberately not a running average — a partial Final Grade determines
promotion and prints on the SF9, so a parent seeing one early would
reasonably treat it as settled. General Average, deprioritized since
G1a, is built now too, since it's the direct extension of a computation
that already exists at read time. G3 also **resolved a decision G2b had
left open**: teacher read-scope is wider than encode-scope (any subject
in a section they're assigned to, not just their own subject), so the
five `:id`-keyed write endpoints now answer `403` naming the subject —
not `404` — when a teacher can see a grade via `GET` but isn't its
encoding teacher, the same reasoning Excuse Letters' review endpoint
already used. **Grades is now fully built — schema through viewing, all
nine stages (G1a, G1b, G2a-e, G3).** **Excuse Letters is also fully
resolved and fully built**
(2026-09-05) — both blockers answered: adviser-only review, and review
never touches `attendance`. **Class Board (2026-09-06, docs only, no
code) is investigated and found already complete** — the school's
group-chat request is delivered entirely by the existing `announcements`
API (section-scoped, teacher-capable, parent-read-only), so no eleventh
feature and no new endpoints were needed; see the table below and
CLAUDE.md's "Class Board" section.

---

## Per-module breakdown

Schema = table exists in `schema.sql`. API = working endpoints exist in a
route file. Web = pages exist in `client/src`. Mobile = screens exist in an
Expo app (no Expo app exists yet, so this column is ❌ everywhere).

| Module | Schema | API | Web | Mobile | Notes |
|--------|--------|-----|-----|--------|-------|
| Authentication | ✅ `users` (status ENUM now `pending`/`active`/`rejected`/`inactive`) | ✅ 4 endpoints — login, me, change-password, contact | ✅ Login page, `ProtectedRoute`, axios JWT interceptor, Parent → Settings (`/parent/settings`, 2026-09-09) and Teacher → Settings (`/teacher/settings`, 2026-09-10). Identity locked; password + contact only. Never school `GET /api/settings` | ❌ | 40/40 auth tests pass (`npm run test:auth`; 2026-09-15: a wrong current password on change-password is `403`, not `401`, so Settings no longer logs a teacher or parent out on a typo), idempotent — no `db:setup` needed between runs. **2026-09-12: `fetchUserByLoginId()` no longer SELECTs `s.lrn`.** Login, `GET /me`, and `PUT /contact` all use that helper. The key is **absent, not `null`** (teacher/admin used to carry `lrn: null` from the LEFT JOIN). Parent still has `login_id` (the LRN) plus the four JOIN columns Settings reads. `PUT /api/auth/contact` (2026-09-09): own `contact_number` only; identity fields in the body are `400`. Login round-trip verified in browser — admin → `/admin`, wrong password → inline error, pending account → inline message, refresh → spinner with no flash. `authenticate` and login both already had a generic `status !== 'active'` fallback, so adding `'inactive'` (for User Management) needed zero changes there — deactivation takes effect immediately, even on an already-issued JWT. `sanitizeUser()` hardened and moved to `utils/sanitizeUser.js` (was duplicated in `routes/auth.js` and `routes/users.js`) — now strips any key containing `password`, case-insensitive, not just the exact key; closes the aliased-JOIN gap Messages was about to trigger. 9/9 direct-call unit tests (`npm run test:sanitize`). Mobile: Expo project doesn't exist. |
| User Management (Admin) | ✅ `users` | ✅ 9 endpoints — create teacher, create parent, list pending, approve, reject, list, view, edit, status | ✅ Admin → Users (`/admin/users`, 2026-09-09). Pending queue, directory, create teacher, edit, activate/deactivate. Never parent-create (teacher-only). AdminDashboard derives from nav | ❌ | 39/39 tests pass (`npm run test:users`), idempotent. `PUT` rejects `role`/`login_id`/`student_id`/`password`/`status` with `400` naming them rather than silently ignoring. `PATCH .../status` (active/inactive only): blocks self-deactivation unconditionally, blocks deactivating the last active admin via an independent count check, and requires the account's *current* status already be active/inactive — a pending/rejected account must go through approve/reject first. Schema change: `users.status` ENUM gained `'inactive'` (see Authentication row). Web: do not write on seeded parent `1234567` (Jea) — `test:auth` depends on `pending`. |
| Grade Management & Viewing | ✅ `grades`, `grade_components`, `grade_weight_configs`, `transmutation_table`, `grading_mode_configs` | ✅ 11 grade endpoints plus `GET /grading-modes` (`GET /`, `GET /:id`, `GET /student/:studentId`, `POST /`, `POST /:id/components`, `PATCH /:id/exam`, `PATCH /:id/descriptive`, `PUT`/`DELETE /:id/components/:componentId`, `PATCH /:id/lock`, **`DELETE /:id`**) | ✅ teacher encode + parent report card + term breakdown | ❌ | **Schema rebuilt (Stage G1a, 2026-09-05).** All original policy questions answered per `docs/GRADING_SPEC.md` (DO 009/DO 015 s. 2026), and the schema now matches: `grade_weight_configs` re-keyed to `(subject_id, school_year)` with `ww_weight`/`pt_weight`/`ex_weight` (was grade-band, `quiz`/`activity`/`exam`) — seeded provisionally against the current placeholder `subjects` rows, since `subjects` itself was deliberately kept out of this stage (see Stage G1b below); `grades` gained `term TINYINT` (was `quarter` ENUM), `ww_`/`pt_`/`ex_` percentage+weighted columns, `initial_grade`, `term_grade`, `descriptive_grade` — dual-mode by design, exactly one of `term_grade`/`descriptive_grade` populated per row, self-describing at read time; `grade_components.type` is now `ENUM('WW','PT')` only (was `quiz`/`activity`), deliberately no `'formative'` value; new `transmutation_table` (41 rows, SY 2026-2027 only, verified gap/overlap-free by `scripts/verify-grading-seed.js`) and `grading_mode_configs` (Grade 1 descriptive, Grades 2-6 numerical for SY 2026-2027). Grade 1's letter grade is a confirmed **manual teacher judgment call** — no IG-to-letter formula exists in the spec, and computing one was explicitly rejected as "numerical grading wearing a letter costume." **Same day, Stage G2a adds the write-path arithmetic** — `server/utils/gradeComputation.js`, pure functions only (`componentPercentage`, `subTestPercentage`, `exPercentage`, `weighted`, `initialGrade`, `roundTo2`), every one returning `null` on a missing required input rather than a partial/guessed grade. Rounds half-up (not half-to-even) to 2 decimals at every step, feeding the rounded value forward so displayed math always checks out by hand; a `Number.EPSILON` nudge corrects floating-point representation error at exact `.005` boundaries. Percentages over 100% (bonus points) are deliberately not clamped. **G2a also corrected a G1a schema mistake**, found before any G2 code was written against it: EX's raw sub-test scores were not being retained, unlike WW/PT — fixed by splitting `ex_st1`/`ex_st2`/`ex_te` into raw-score columns plus new `ex_st1_max`/`ex_st2_max`/`ex_te_max` columns, with `ex_percentage` now a derived cache, not the source of truth. `npm run test:grade-computation` — 29/29, including two full worked examples with hand-checkable numbers (same raw scores under core 20/50/30 weights → IG 88.05, vs. MAPEH/EPP 20/60/20 weights → IG 88.50). **Same day, Stage G2b adds `routes/grades.js`** — exactly one endpoint, `POST /`, creating a shell row (every score/computed column `NULL`, `is_locked 0`) with zero computation — `gradeComputation.js` isn't imported here at all. Scoping is the **subject teacher's**, via `teacher_assignments` (`teacher_id`+`subject_id`+`grade_level`+`section`, all four) — a second, deliberate scoping authority alongside `sections.adviser_id` (attendance, excuse-letter review), narrower than `students.js`/`content.js` since it also requires the specific subject to match, not just grade+section. A nonexistent `student_id` is `404` for admin but `403` for a teacher (collapsed with "out of scope" so a teacher can't tell which) — read directly from `attendance.js`'s own precedent and asserted as its own named test property so a future refactor can't silently collapse it. The subject/student-grade-level mismatch check runs strictly *after* scope is resolved, not before — checking it earlier would let an out-of-scope teacher learn a real student's grade level by probing with a wrong subject, which is exactly the enumeration the ordering (documented in a code comment) prevents. `npm run test:grades` — was 26/26. **2026-09-06, Stage G2c adds `POST /:id/components` and `PATCH /:id/exam`** — the first writes that actually compute anything and the first HTTP path through `gradeComputation.js`'s pure functions. `recomputeGrade()` (the DB-touching glue) lives in `routes/grades.js`, not `gradeComputation.js`, which stays pure by design; it re-derives WW/PT percentages from every `grade_components` row every time (never an incremental total), fetches the subject's `grade_weight_configs` row, and looks up `transmutation_table` for the Term Grade — all inside one transaction with the write that triggered it, so a failure after an insert rolls the insert back too. A missing `grade_weight_configs` row is a pre-flight `409` (checked before any write, alongside `grading_mode_configs` and `is_locked`) rather than saving the raw score with blank computed columns, which would look like a broken system to the teacher entering it. `PATCH /:id/exam` takes any subset of ST1/ST2/TE; score and max are always a pair (explicit `null` clears both; a lone value with no existing counterpart is `400`). `POST /:id/components` returns both the new component and the recomputed grade; `PATCH /:id/exam` returns only the grade — deliberate, commented, since only the first creates a child resource. A full worked example was driven step-by-step through the real endpoints, reusing the exact numbers from `test-grade-computation.js`: WW 45/50 then 42/50 (accumulating correctly across two *separate* requests — the one property a pure unit test can't prove), PT 88/100+92/100, then ST1/ST2/TE one at a time with `initial_grade` staying `NULL` until all three land, then landing on exactly **88.05** (core 20/50/30 weights) — repeated against a MAPEH-subject row for **88.50** (20/60/20 weights) with the identical raw scores, proving the weight lookup is what changed. Both transmute to **TG 90**, checked against a live `transmutation_table` query, not hardcoded. Found and fixed a real test-writing gotcha (not a production bug): mysql2 returns `DECIMAL` columns as strings, so the first pass of strict `===` assertions failed on correct values — `gradeComputation.js` already guards against this internally via `Number()`, so this was a test-assertion fix only. `npm run test:grades` — 56/56, confirmed three times. **Same day, Stage G1b reseeds `subjects` with the school's real 40-subject curriculum** (5/5/6/8/8/8 for Grades 1-6, transcribed from `docs/GRADING_SPEC.md` §6c), replacing G1a's uniform 8-subject placeholder. Grade 4's list is recorded as **inferred, not confirmed** — never photographed, matched to the SF9's 8 intermediate-level rows and Grade 5's photographed program. Grade 6 seeded under the SF9's names (GMRC, EPP) rather than the class program's (ESP, TLE) for the same two learning areas, since that's what the parent actually holds; alternates recorded in a comment. `grade_weight_configs` reseeded to 35 rows via `SELECT ... JOIN grading_mode_configs ... WHERE mode = 'numerical'` — a durable exclusion, not a hardcoded `grade_level >= 2`: the JOIN means Grade 1 (and, automatically, whichever grade goes descriptive next per the KS1 rollout) never gets a weight row, without needing a code change when that happens. The anticipated cascade (`subjects.id` `ON DELETE CASCADE` from `teacher_assignments`, `grade_weight_configs`, and `grades`) landed exactly as planned — a live precondition check confirmed `grades` was empty before the reseed ran, so nothing real was destroyed. `setup-db.js`'s `teacher_assignments` INSERT and every existing test fixture needed **zero code changes**, since both already resolve subjects by name/grade_level rather than a hardcoded id, and every name they reference survives into the new curriculum — confirmed by tracing the actual SQL and grepping the whole `server/` tree, not assumed. `scripts/verify-grading-seed.js` extended to prove the reseeded shape from the output side — 20/20 passing (was 11/11). **Same day, Stage G2d adds `PATCH /:id/descriptive`** — Grade 1's manual A-E letter, the other side of the numerical/descriptive gate G2c built. **Recorded explicitly as an assumption the module proceeds on, not a school-confirmed answer**: the school hasn't said how a teacher arrives at A-E, and DO 015 defines no Initial-Grade-to-letter formula — descriptive grading existing to avoid numerical labeling in KS1 is the reasoning that justifies proceeding, not a school reply; if that changes, this endpoint changes, not the schema. `preflightGradeWrite()` was refactored (not duplicated) to take an `expectedMode` parameter shared across all three write endpoints, since two copies of scope/mode/lock logic would drift silently over time — the full 56-assertion grades suite was re-run immediately after that refactor and before the new endpoint was written, so a regression would be attributable to one or the other, not both at once; it passed unchanged. No transaction (a single-column `UPDATE`, nothing derives from it); `descriptive_grade: null` clears the column, mirroring G2c's own clearing convention; `is_locked`'s gate comes for free by reusing the shared preflight function. `npm run test:grades` — was 71/71. **Same day, Stage G2e adds `PUT`/`DELETE /:id/components/:componentId` and `PATCH /:id/lock`** — the toggle that finally lets the `is_locked` gate every write endpoint has checked since G2c actually fire. Component edit stays nested under `/:id/components/:componentId` (not flat) for consistency with its siblings; a `componentId` not belonging to the given grade is `404`, undifferentiated. `type` is not editable — a differing `type` is `400`, correcting a miscategorized entry is delete+recreate. Deleting the last component of a type needed zero new code: `componentPercentage([])` already returns `null`, so `ww_percentage`/`pt_percentage` and, if that was the last required input, `initial_grade`/`term_grade` too, revert to `NULL` automatically — verified against a fixture built to full completion first (Initial Grade **83.30**) so the reversion is from a real value, not a trivial already-null case. `PATCH /:id/lock` stays admin-only, unscoped — confirmed, not extended to teacher self-locking, and recorded as an open school question in OPEN QUESTIONS. **Deliberately not gated on completeness** — an `initial_grade IS NOT NULL` check would make every Grade 1 row permanently unlockable, since descriptive rows never populate that column by design; reasoning stated as a comment directly on the handler. Unlock carries no extra friction versus lock — no step-up auth, unlike Restore, since an unlock is reversible by re-locking. Both `PUT` and `DELETE` are transaction-wrapped with `recomputeGrade()`, identical to `POST /:id/components`. `npm run test:grades` — was 96/96. **2026-09-06, Stage G3 adds `GET /`, `GET /:id`, `GET /student/:studentId` — a parent can finally see a grade.** Built in three isolated passes so a break would be attributable to one of them. PASS 1 refactored `loadAuthorizedGrade()` into two tiers: a new wide view-scope (grade+section, any subject — matching `students.js`'s own pattern) determines `404`; the existing narrow encode-scope (subject-specific) now only gates writes, via a new `encodeScopeError()` check added to all five `:id`-keyed write endpoints — this is the confirmed resolution of G2b's provisional 404: a teacher who can see a grade via the new wide scope but isn't its encoding teacher now gets `403` naming the subject, not `404`, since a `404` there would contradict what `GET` already shows them (the same reasoning Excuse Letters' review endpoint already used). PASS 2 added two pure lookups to `gradeComputation.js`: `qualitativeDescriptor()` (GRADING_SPEC Table 11 — numeric band to descriptor+remarks) and `descriptiveGradeMeaning()` (Table 8 — letter to descriptor+Filipino); a test confirms Table 8's five English words are literally the same words as Table 11's five bands, not independently invented. PASS 3 built the three endpoints: `GET /` lists with role-scope baked into the `WHERE` clause and four optional filters (student_id/subject_id/term/school_year, no hidden defaults — all four together resolve to at most one row, closing a lookup gap that's existed since G2b); `GET /:id` adds `grade_components` plus a computed `descriptor` (list omits both, by design — a list is for finding a row, not inspecting one); `GET /student/:studentId` is the full report card — every subject at the grade level including ones with zero grade rows, all three terms, a computed Final Grade and General Average. **Both Final Grade and General Average follow the exact same NULL-until-complete rule as Initial Grade — deliberately not a running average.** A partial Final Grade determines promotion and prints on the SF9, so a parent seeing one early would reasonably treat it as settled, and no later caveat undoes that. General Average, deprioritized since G1a/G2a, is built now — it's the direct extension of a computation that already exists at read time. For a descriptive-mode student (Grade 1), both are genuinely `null` — not incomplete, not applicable at all — distinguished from "still in progress" via an explicit `grading_mode` field. `school_year` on this one endpoint defaults to `system_settings.academic_year` when omitted, deliberately unlike `GET /`'s no-default filters, since a report card is bounded to one year by what it is. Verified with a dedicated Grade 2 fixture (5 subjects, direct SQL inserts of `term_grade` bypassing the write path on purpose — only the aggregation needed new coverage): Final Grade null with 1 term, null with 2, populated at 85.00 with 3 (hand-checked (80+85+90)/3); General Average stays null until the last subject completes, then populates at 86.60 (hand-checked (87.00×4+85.00)/5). `npm run test:grades` — 141/141, confirmed three times; `npm run test:grade-computation` — 51/51. Full 14-suite regression matched every prior count. **Grades is now fully built, all nine stages.** See CLAUDE.md's Grades module section and the 2026-09-06 CHANGELOG entry. **2026-09-15:** `npm run test:grades` 167/167; locking an already-locked grade is `200` with no log entry. |
| Assignments + Subjects (not a core-10 feature; unblocks Admin pages) | ✅ `teacher_assignments`, `subjects` (seeded) | ✅ 4 endpoints — `GET /subjects`, `GET`/`POST`/`DELETE /assignments` | ❌ | ❌ | 41/41 tests pass (`npm run test:assignments`), idempotent, confirmed twice. Teacher GET is own-rows only (`403` naming another teacher_id, not `404`). `grade_level` from the subject row, never the body. DELETE does not refuse when grades exist — scope change removes future authority, never past records. Seeded TCH-001/TCH-003 rows are never deleted; TCH-002 empty-list invariant holds after. Items 2–3 (`GET /grading-modes` 13/13, `DELETE /grades/:id` in `test:grades` 165/165) shipped the same day after item 1 was committed. See CLAUDE.md 2026-09-08 CHANGELOG. |
| Sections (not a core-10 feature) | ✅ `sections` | ✅ 3 endpoints — list, view, set/clear adviser | ❌ | ❌ | 30/30 tests pass (`npm run test:sections`), idempotent. Admin-facing management interface for the `sections` table — `GET /`/`GET /:id` are unscoped (all roles see the same 23 rows, no per-role filtering, `404` only for a genuinely nonexistent id); `PATCH /:id/adviser` (admin only) is the only mutation, since there's no `POST`/`DELETE` — the 23 sections are fixed for the school year. `adviser_id` must reference an existing, active, `role='teacher'` user, or be `null` to clear it (`400` naming the specific check that failed); one teacher advising more than one section is allowed by design. `student_count` in both GET responses is a correlated subquery, not `JOIN`+`GROUP BY` — avoids the fan-out and the `ONLY_FULL_GROUP_BY` ambiguity a second `LEFT JOIN` for `adviser_name` would risk (same reasoning as Messages' window-function-over-`GROUP BY` precedent). Built via an explicit plan-then-approve pass: two of the dispatch's own instructions were corrected during planning rather than followed as written — "reads out of scope → 404" doesn't apply (sections are unscoped reference data, not per-role), and test fixtures never touch the two real seeded adviser assignments (Malikhain → TCH-001, Masigasig → TCH-002), using two of the 21 `NULL` sections instead, reset via a direct DB write in a `finally` block rather than a remembered "restore at the end" step. See CLAUDE.md's "sections table" note and the 2026-09-05 CHANGELOG entry. |
| Attendance Monitoring | ✅ `attendance` (per day) | ✅ 6 endpoints — list, per-student, summary, record, bulk record, correct | ✅ teacher encode + parent view (counts + "Present on recorded days", 2026-09-13) | ❌ | 38/38 tests pass (`npm run test:attendance`), idempotent. **2026-09-04, Stage B1 rebuild:** attendance is now per **day**, not per subject, matching the school's SF9 report and the confirmed workflow (the section adviser records it once daily during Homeroom Guidance — subject teachers don't). `subject_id` is gone from the table (column, FK, index dropped outright — table held 0 rows, clean rebuild not a migration) and from every endpoint. Scoping is now `sections.adviser_id` via `students.section_id` (`teacherIsAdviserOfSection()`), not `teacher_assignments` — the first of the two routes `section_id` was ever planned to reach (see CLAUDE.md's "sections table" note; every other route still scopes on VARCHAR, unchanged). `POST /bulk` is the primary path now: `{ section_id, date, entries }`, validates every student actually belongs to that section. Out-of-scope writes get `403` naming the constraint ("You are not the adviser of this student's section."). Two advisers seeded (not one) so scoping could be tested against a real non-adviser: TCH-001 → Grade 6 - Malikhain (existing), TCH-002 → Grade 5 - Masigasig (new, fictional name, created the same way as TCH-001). Explicitly not built: attendance-rate percentage (formula still unconfirmed) and the mentioned 20%-absence promotion rule — no stub, not even commented in. Summary still returns raw counts only. Bulk record stays all-or-nothing in a transaction; same `(student, date)` recorded twice still updates in place, doesn't error. Admin unscoped on all writes. **2026-08-30: fixed a real DATE round-trip bug** (posted date came back shifted a day at UTC+8) — fixed pool-wide via `dateStrings: ['DATE']`, still in effect. Attendance does not feed grade computation — confirmed by the school, separate report-card section entirely; documentation only, nothing computes grades yet. **2026-09-09: Parent → Attendance is built** — raw counts + day list, never a percentage. The rate-formula question (Late/Excused handling) is still open; the page does not guess. Teacher history and Expo remain. |
| Student Records Management | ✅ `students` | ✅ 5 endpoints — list, view, create, update, status | ✅ Teacher → Students (list + detail 2026-09-07; enroll + create parent 2026-09-10; Edit 2026-09-12). Admin screens unbuilt | ❌ | 65/65 tests pass (`npm run test:students`; 2026-09-15: `?status=` validated — a typo is `400`; a no-op status PATCH is `200` with no log entry), idempotent — no `db:setup` needed between runs. **2026-09-10: `POST /` stores `section_id`** (resolve against `sections` for academic_year; duplicate LRN stays before that resolve). **2026-09-12: `PUT /:id` is a class-change gate, not a NULL repair.** Live DB had zero `section_id` NULLs; PUT was the one remaining writer that could create a VARCHAR/FK disagreement. Differing `grade_level`/`section` is `400` (whole request refused). Matching PUT writes `section_id` only when NULL; a miss leaves NULL. Never overwrites a non-null FK. Parents see only their own child; teachers see only their assigned grade/section, both via `404` (not `403`) to avoid enumeration. Teacher creates outside their assignment get `403`. **2026-09-06: teacher
READ scope widened to include the section adviser**, applying the decision
Stage G3 already settled for Grades (read scope wider than encode scope). The
gap was real, not theoretical — every attendance endpoint scopes on
`sections.adviser_id` while this file scoped on `teacher_assignments` alone, so
`TCH-002` (adviser of Grade 5 - Masigasig, zero assignment rows) could record
attendance for a student it could not list; `GET /api/students` returned 0
students for it, confirmed live. Reads are now `teacher_assignments` OR
adviser, with the adviser leg matching `s.section_id` — the same column
attendance uses — so the two sets are identical by construction. **Write scope
did not move**: `PUT`/`POST` remain assignment-only, and the near-miss is worth
knowing — `PUT /:id` used the identical inline clause as the reads, so a
search-and-replace would have silently made records editable that were never
meant to be. `PUT /:id` now answers `403` (naming the reason) instead of `404`
when a teacher can view a student but not edit them, because a `404` there
would contradict the `200` the sibling `GET` just returned — the same
contradiction Stage G3 removed from `grades.js`. `TCH-002` deliberately keeps
zero assignment rows: it is the only fixture that can distinguish the two
scoping authorities, since every other teacher fixture satisfies both at once.
All five pre-existing scoping assertions were left unchanged and still pass,
which was the check that the widening was correct rather than merely
convenient. **2026-08-30:** `birthday` (a DATE column) had the same UTC round-trip bug as attendance/events/contributions, fixed by the same pool-wide `dateStrings: ['DATE']` change — no code change needed in this file itself, since it already passed `existing.birthday` straight through with no buggy conversion wrapper; added a regression test locking that in. Teacher list + detail 2026-09-07; enroll + pending parent 2026-09-10. Edit and Expo remain. |
| Announcements & Memo Dissemination | ✅ `announcements`, `memos`, `events` | ✅ 12 endpoints — 4 each for announcements/memos/events | ❌ | ❌ | 62/62 tests pass (`npm run test:content`), idempotent. `routes/content.js`, one file, three routers. **Schema correction:** `events` has no `target_section` column (only `announcements` does) — event audience scoping is grade-only. Teacher writes require an exact grade+section (announcements) or grade (events) they're assigned to; a school-wide/whole-grade attempt gets a `403` naming the specific reason, not a bare "forbidden." Memos have no targeting/category columns at all — school-wide by schema design, admin-only writes. Hard delete on all three (no status column); title logged to `activity_logs` before deletion. **2026-08-30: fixed two real bugs on `events.event_date`.** (1) Same UTC round-trip bug as attendance — fixed pool-wide via `dateStrings: ['DATE']`. (2) A separate `toDateString()` helper, used when `PUT /events/:id` omits `event_date` and falls back to the existing row, had the identical UTC-shift bug on a **write path** — silently corrupting the date on any edit that didn't resend it. Removed; the fallback is just `existing.event_date` directly now, safe since it's already a plain string. Also fixed `isMoreThanOneYearAhead()`, which computed "today" via UTC the same wrong way. New shared `utils/dateFormat.js` replaces this file's local `isValidDateFormat`. **2026-09-06: Class Board investigated, zero code needed.** The school asked for a group chat so teachers would stop answering the same question in twenty private messages; a group chat was rejected (parents would see each other's names/messages, the teacher becomes a moderator, minors are involved) in favor of a section-scoped announcement — teacher posts, every parent in the section reads, no parent sees another parent. Framed from the start as an extension of this feature, not an eleventh one — investigation confirmed that framing is literally true of the code: `POST /api/announcements` already requires an exact `target_grade`+`target_section` a teacher is assigned to, `GET /api/announcements`'s parent branch already returns school-wide + the child's own section, `authorize('teacher','admin')` already excludes parents from posting, and `GET /api/students` (teacher/admin only) means no endpoint anywhere exposes a section roster to a parent. Zero new endpoints, zero changes to this file, zero risk to its 47 tests. Three decisions recorded rather than left implicit: parents never reply (permanently — a visible reply recreates the rejected group chat, a private one is just a second inbox with the same moderation burden Messages already handles); no new column or flag (a Class Board post is identified by its shape — teacher-posted, both targets set — not a marker; visual distinction is Stage 4's job); no link back to the originating message (would turn "reduce repeated PMs" into "build a provenance trail"). "Post to class" (publishing a PM reply to the section) is a Stage 4 UI action against the existing `POST`, not a new endpoint. One theoretical edge case recorded in CLAUDE.md's OPEN QUESTIONS, not fixed pre-emptively: `teacherHasAssignment()` checks grade+section only, never `sections.adviser_id`, so an adviser with zero subject assignments in their own section would be locked out of posting there — checked against the school's photographed class programs and found not to occur here. This also corrected a stale plan: CLAUDE.md's "sections table" note had reserved `announcements.section_id` for this feature — that reservation is now recorded as "investigated and found unnecessary," since the read side gains nothing over `target_grade`+`target_section` and the write side (`POST /api/announcements`, `backfillSectionIds()`) was never wired to populate it anyway. `section_id` is now documented as read in exactly one place: attendance scoping. **2026-09-11: `posted_by_name` on list/POST/PUT.** INNER JOIN `users` for `users.name` alongside the bare `posted_by` id. **Parent content modals render it (2026-09-12).** Teacher pages still do not. No `GET /:id` invented. Next: remaining admin screens and Expo. |
| Parent-Teacher Messaging | ✅ `messages` | ✅ 5 endpoints — conversations, thread, send, mark-read, mark-thread-read | ❌ | ❌ | 39/39 tests pass (`npm run test:messages`), idempotent. **2026-08-30: fixed a real bug found by hand, not the suite** — one stray row in `messages` from earlier manual API testing (outside the suite) broke the thread-order assertion, because the suite reuses the seeded parent/teacher accounts as fixtures every run instead of creating fresh ones. Fixed the data (deleted the row) and, more importantly, the test: `unread_count`, `last_message_body`, and the thread-order and read-all-count checks were all hardcoded to literals scoped to these same permanently-reused accounts — rewritten to compare against ground truth computed the same way the endpoint does, or to only the run's own tracked message ids, so real messages sent through these accounts during the demo or Stage 4 dev won't break the suite again. Verified by simulating real messages and confirming the suite survives them. New working-agreement rule in CLAUDE.md as a result: test assertions against shared tables must be scoped to the run's own rows or written as invariants, never an exact count/exact content on a table the app also writes to. `canMessage()` (parent↔child's assigned teachers + admin; teacher↔own students' parents + other teachers + admin) runs only on send — reads are participant-scoped instead (`WHERE sender_id = you OR receiver_id = you`), deliberately not re-checked against current eligibility, so a thread survives a teacher's later reassignment. Conversations list uses a window function (`ROW_NUMBER() OVER PARTITION BY` the other party, computed via `CASE`), not `GROUP BY` + `MAX(created_at)` — the latter doesn't guarantee the other selected columns come from the actual max row. `server.js` now wraps Express in an explicit `http.createServer` so Socket.io shares it. Socket auth is connection-time only (JWT + live `status` re-check, same as HTTP), verified against a user deactivated after their token was issued. Delivery is `io.to(user-room).emit(...)`, never a broadcast — tested via connection-auth (deterministic) plus a source check for the room-scoped emit pattern, not via a two-socket delivery test (would need a timeout-based "nothing arrived" assertion, rejected as not real proof). No queries here select `u.*`/`SELECT *` on `users`, so `sanitizeUser` isn't called despite the double sender/receiver JOIN — the fix is not fetching the password column, not scrubbing it after. Next: web screens. |
| Excuse Letter Submission & Management | ✅ `excuse_letters` | ✅ 6 endpoints — submit, mine, list, view, edit, **review** | ❌ | ❌ | 70/70 tests pass (`npm run test:excuses`), idempotent, confirmed twice, DB verified back to baseline. `parent_id`/`student_id` always from `req.user`, never the body; `status` always `Pending` on create; forbidden fields (`status`, `teacher_remarks`, `reviewed_by`, `parent_id`, `student_id`) sent in a body are silently ignored, not rejected — a deliberate spec choice for this module, unlike `routes/users.js`'s PUT which rejects loudly. **2026-09-11: unlinked parent POST is 409**, not 500. Guard before the INSERT `try`. **Not a 400** — the body is valid; `student_id` does not come from it. Same family as `POST /api/students` with no `academic_year` and a missing `grading_mode_configs` row. Message names the school office, not "An admin". **API correctness, not a fixed demo defect** — Parent → Excuse Letters already hides Submit; a future session must not read this as "the parent-facing 500 is gone." Teacher read scoping reuses the exact shape `routes/students.js` uses —
**as of 2026-09-06 that is `teacher_assignments` OR `sections.adviser_id`,
widened in both files the same day.** The gap here was the sharpest in the
system: review authority is adviser-only, so the adviser was the ONLY person
permitted to review a letter while an adviser without assignment rows could not
see the queue at all (`TCH-002` was that account). **The widened clause is
applied at all three read sites INCLUDING the existence query inside
`PATCH /:id/review`** — the opposite of the rule in `students.js`, where the
equivalent clause was the write gate and had to stay narrow. Here it is only a
visibility filter; the authority is the separate adviser query that runs after
it and did not move. Leaving that site narrow is what would have kept the bug. `GET /mine` declared before `GET /:id` so `parseId('mine')` can't fire first. Reads out of scope → `404`; the one CRUD write-scope violation (edit after review) → `403` naming the reason. No submission-deadline check (school hasn't set one) and duplicate letters per date are allowed on purpose (resubmission after a decline). **2026-09-05: `PATCH /:id/review` built — both blockers now resolved.** Adviser-only (`sections.adviser_id`, not any assigned teacher — confirmed by the school), and record-only (writes only `status`/`teacher_remarks`/`reviewed_by`, never `attendance` — "excuse lang yung bata pero absent pa rin"). A non-adviser teacher who *can* read the letter (broader `teacher_assignments`-based `GET` scoping) gets `403` naming the reason, not `404` — deliberately deviating from `attendance.js`'s own out-of-scope-returns-404 precedent, because here `GET` and review-authority genuinely disagree, so `404` would contradict what `GET` already showed that teacher. `teacher_remarks` stays optional on `Declined`, not conditionally required — flagged instead as a Stage 4 UI concern (a decline with no remarks pushes the parent to message the teacher directly). Attendance-row-count-unchanged is asserted directly in the test suite, not just claimed. See CLAUDE.md's "Excuse Letters module" and 2026-09-05 CHANGELOG entry for full detail. **Manually verified 00:25 AM PH** (inside the UTC failing window, 2026-08-31): POST with today's date accepted (not rejected as future), `absence_date` round-trips as `"2026-08-31"` while `created_at` stays ISO (confirming `dateStrings: ['DATE']` applies to DATE only), partial `PUT` with `details` only preserved `absence_date`/`reason`, teacher assignment scoping and the parent/teacher-only-list `403` both correct — all five passed. Response shape: `login` returns `token`/`user` at the top level, excuse-letter endpoints wrap in `excuse_letter` — no `data` wrapper anywhere. |
| ~~Contribution/Fees Monitoring~~ | **REMOVED 2026-09-13** — both tables dropped | **REMOVED** — 8 endpoints deleted | **REMOVED** | — | Principal Bajar, consultation 2026-09-01: the school is not permitted to collect contributions from parents; the team removed Feature 7. See CLAUDE.md → SCOPE DECISION. 40 historical `activity_logs` rows kept. |
| System Settings Management (Admin) | ✅ `system_settings` | ✅ 4 endpoints — get all, get one, update one, bulk update | ❌ | ❌ | 29/29 tests pass (`npm run test:settings`; was 27, then 26 — see below; +3 on 2026-09-15: the PATCH response is allow-listed like `GET /`, and PUT/PATCH store the trimmed value), idempotent (restores original values). 5-key allow-list (`school_name`, `school_address`, `academic_year`, `current_term`, `logo_url`) — unknown key rejected with `400` naming the allowed ones. `academic_year` seed typo fixed to `'2026-2027'` as part of an earlier pass. `PATCH` (bulk) is all-or-nothing. **2026-09-05, as part of the Grades module Stage G1a rebuild:** `current_quarter` renamed to `current_term`, validated against a hardcoded `['1','2','3']` — it used to read `grades.quarter`'s ENUM live via `INFORMATION_SCHEMA` specifically because the quarter-vs-term question was provisional; DO 009 s.2026 has since settled that as fact, and `grades.term` is a plain `TINYINT` now anyway, so there's nothing left to introspect. The dropped source-inspection mechanism test accounts for the 27→26 count change — not a regression. Next: web screens (admin settings form). |
| Backup & Restore (Admin, web only) | ✅ `backups`, `auth_security_state` | ✅ 5 endpoints — list, create, download, delete, restore | ❌ | — (web-only by design, mobile excluded) | 39/39 backup tests pass (`npm run test:backups`), 26/26 restore tests pass (`npm run test:restore`; 2026-09-15: refused attempts logged as `restore_refused`, wrong step-up password `403` not `401`, and the suite puts back the cutoff it finds instead of deleting it), both idempotent — a real end-to-end restore, run once manually together, found the backups-table wipe bug below; the automated suite deliberately never runs one, so it could not have caught it. A **second** live restore later found a sharper version of the same bug that the first fix didn't actually fix — see below. Backup: real `mysqldump` — not mocked. Password via `MYSQL_PWD` on the spawned process's own env, never on argv. Row inserted only after the dump succeeds and the file is confirmed non-empty. Caught and fixed before shipping: the filename format is second-granularity with no uniqueness constraint, so two backups in the same second would have silently overwritten each other's file — added a collision-safe filename reservation, verified in tests. Known residual gap: closes the sequential case, not two truly concurrent requests in the same tick — accepted for a single-admin deployment. `download_backup` is logged alongside create/delete — the most sensitive action the API permits (a full copy of every student's data leaving in one file). `scripts/create-backup-zip.js` is a separate, legitimate source-code archiver (zips the codebase to the Desktop) — not the DB backup and not touched by this work. Restore: `POST /:id/restore` — step-up password re-verification, `confirm_filename` exact-match, automatic `pre_restore_*` safety dump before anything is touched (abort with nothing changed if it fails), the actual restore on a dedicated one-off `mysql2` connection (never the shared pool), a partial-failure message naming the safety dump and warning manual recovery may be needed (MySQL has no transactional DDL), shared pool reset via a new proxy pattern in `config/db.js`, and every active JWT invalidated via a new `auth_security_state.token_valid_after` cutoff checked in `middleware/auth.js`. Deliberately synchronous, not async job tracking, given the database's current size — see CLAUDE.md's "RESTORE" section for the explicit trigger to revisit that. Test suite covers every pre-flight gate and `token_valid_after` in isolation (via crafted JWTs) but deliberately never triggers a real restore — that's run once, manually, with `db:setup` ready. **Real bug found in that manual run, since fixed:** `backups` is self-referential (a row is inserted only after its own file finishes dumping, so a backup's file can never contain its own row) — restoring emptied the whole table, not just the safety dump's row. Fixed by excluding `backups`' data from every dump (`--ignore-table` + a `--no-data` pass so the table structure still survives) and adding read-only orphan reconciliation on `GET /api/backups` (`orphaned_files` — never auto-inserted). `activity_logs` was checked for the same shape and found to have a narrower version of it (the safety dump's `create_backup` log entry is wiped by the restore it documents; `restore_backup` itself survives). Not fixed the same way as `backups` (nothing was reordered to stop the loss) — instead a `restore_wiped_activity_logs` marker: counts `activity_logs` rows newer than the restored backup right before the restore runs, then logs one entry after the restore completes (same timing as `restore_backup`, so it survives) naming the source backup and the exact count lost. The wipe still happens; the marker stops it being silent, and isn't tamper-proof against an admin with direct DB access — accepted deliberately. `activity_logs_wiped: <count>` is also in the response body. **The first `backups` fix was incomplete:** the `--no-data` pass still writes `DROP TABLE backups` right before the empty `CREATE TABLE`, and the restore endpoint executed the whole file verbatim — so that DROP ran against the *live* table too, wiping it to zero rows on every restore regardless of source backup (confirmed live: restoring from backup #1 also erased backup #2, taken after #1's dump). The "no `INSERT INTO backups`" test passed the entire time — it checked the anticipated symptom, not this mechanism. Fixed by splitting the concern: the dump file is unchanged (still has a real `CREATE TABLE backups` for bare-metal recovery); a new `stripBackupsTableDdl()` removes just `backups`' block from the SQL the restore *connection* executes — name-based (mysqldump's own `-- Table structure for table` comment), so it protects every backup file already on disk, not just new ones. Verified four ways: against the real dump that exposed the bug, by executing the *stripped* SQL for real against a disposable scratch database (18 tables created, `backups` correctly absent, real data restored), via a permanent `test:backups` regression check, and — the actual proof — a real live restore against the shared dev DB: zero rows survived before this fix, three survived after (both backups + the safety dump), `activity_logs_wiped: 2` in the response confirming that marker fires on a real restore too. `auth_security_state` was checked for the same shape and found *not* to have it — it does get dropped/recreated by a restore too, but an unconditional post-restore write (`token_valid_after = NOW()`, no gating condition) always re-asserts it correctly regardless, verified live. Every orphan across both live-restore bugs (5 files total — the original wipe's 2, this bug's 3) was adopted by hand once each, only after its bug was fixed and confirmed live: `created_by` `ADMIN001`, `created_at` from file mtime, each logged as `manual_backup_adoption`. `backups` now holds 8 rows this way, 0 `orphaned_files`. See CLAUDE.md's RESTORE section and CHANGELOG for the full writeup. |

---

## Stage 4 — foundation done, conventions frozen (2026-09-06)

**CLAUDE.md's STAGE 4 FRONTEND CONVENTIONS section is authoritative — read
it before building any screen; its full text with the reasoning behind each
rule is `docs/FRONTEND_CONVENTIONS.md` (split out 2026-09-18).** This is the
summary.

Built: nested layout routes (`ProtectedRoute` -> `Shell` -> `<Outlet/>`,
so pages no longer wrap themselves in `Shell`), a role-aware sidebar from
`layout/nav.js`, seven shared primitives (`DataTable`, `Modal`,
`FormField`, `StatusBadge`, `EmptyState`, `ErrorAlert`,
`LoadingSpinner`), `format/grade.jsx`, mandatory response unwrapping in
`api/axios.js`, `api/extractError.js`, and a DEV-only component gallery at
`/dev/ui` (verified absent from production builds). **No feature page
exists yet.**

The seven conventions every page inherits:

1. **Unwrap** — every call passes `{ unwrap: 'key' }`, `{ unwrap: [...] }`
   or `{ raw: true }`. Mandatory, throws on a missing key, never returns
   `undefined`. `raw` is only `POST /backups/:id/restore` and the binary
   `GET /backups/:id/download`, and it returns the full axios response.
   A path-to-key map cannot work: `GET /api/attendance` returns
   `attendance` as an array, `POST` returns it as an object.
2. **Errors** — `401` clears the token and redirects; **`403` never
   does**, because a 403 here is an informative refusal carrying a reason
   the user must see. Reads out of scope are `404` (anti-enumeration),
   writes are `403`. All 342 error bodies are `{ success: false, message }`.
3. **NULL grades** — never a bare dash. `— Pending` / `— N/A` as inline
   text, not a tooltip (tooltips do not exist on touch, and the report
   card is a phone screen). A real `0.00` stays distinct from both.
4. **StatusBadge** — five vocabularies, one tone map, and **no verdict
   variants ever** (no PASSED/FAILED/AT RISK). The school stated
   absence-based failure is at teacher discretion, so the system counts
   and displays but never concludes.
5. **DataTable** — presentational, never fetches, no pagination (no
   endpoint accepts `limit`/`offset`/`page`). Nulls sort last in both
   directions, with the rule outside the direction multiplier.
6. **Nav** — three states: built / blocked / unbuilt. Flipping
   `built: false` belongs to the dispatch that adds the route.
7. **FormField** — four shapes: input, textarea, select-with-children,
   and `render={({ id, describedBy }) => …}`.

**Real Stage 4 size: 75 role-facing views** — 33 nav items plus 42
detail/sub views (Teacher 23, Parent 19, Admin 33) — behind **~45–50
distinct implementations**, since several screens serve more than one
role. **Counting rule** (recorded so the figures are reproducible): a
substantive form counts as a view whether it ends up a route or a modal;
a bare "are you sure?" confirm does not. This replaces the old "36
screens" estimate, and **the ~13-day web estimate derived from it is
void — not replaced with a new guess, but pending real measurement from
the first feature page.**

**Known and dated, not a defect:** until `content.js` and `messages.js` get
the same read-scope widening (both scheduled), an adviser can review excuse
letters and list students for a section they cannot yet post announcements to
or message the parents of. Testing across modules in that window shows
scheduled work in progress, not a bug.

**Teacher → Attendance is DONE (2026-09-06)** — encode only; history
landed as its own page 2026-09-12 (`/teacher/attendance-records`, add
not flip, read only). **Measured: 3m14s** wall-clock from PLAN
APPROVED to agent-verified — recorded in CLAUDE.md with four caveats
(agent execution time not developer-hours; excludes planning and review;
excludes browser verification; most-favourable case with every primitive
pre-built). It is one data point and does **not** replace the void
~13-day estimate.

**A browser review after that measurement found a real bug** — the roster's
Recorded column (database state) derived its value from the same object the
Status dropdown writes, so it tracked the dropdown and, on a failed save,
showed the unsaved value as stored while the database held the old one. Fixed
by splitting the state (`marks` = selection, `recorded` = database, with the
fetch as its only writer) and **recorded as a general rule — CLAUDE.md
convention §5b: a column showing database state must never derive from form
state.** The shape recurs on the grades encode screen, where the stakes are
higher. It is also direct evidence for caveat 3: the measurement excluded the
step that caught the bug.

**Backend adviser-scope work is COMPLETE (2026-09-07).** `students.js`,
`excuses.js`, `content.js` and `messages.js` all now scope teachers as
"assigned OR section adviser"; the shared predicate lives in
`server/utils/teacherScope.js`. `content.js` is the one place a WRITE gate
was widened, deliberately — the Class Board requires an adviser to post to
their own section. `grades.js` is deliberately excluded: an adviser is not
automatically entitled to a section's grades, and that needs the school.

**Endpoint audit run 2026-09-07 — all three buckets empty.** CLAUDE.md's
table, `docs/API_REFERENCE.md` and the actual handlers all agree at 77
endpoints (78 with `contacts`). No orphans, nothing undocumented, nothing
documented-but-unbuilt.

**Teacher → Students is DONE (2026-09-07)** — list + detail route. Originally
read only. **Enroll + pending parent 2026-09-10 — same item, not a new nav
entry (convention 6 does not apply).** Wizard on the list: `POST /students`
then optional `POST /users/parents`. Class picker is `GET /assignments`, not
`useTeacherTargets`. TCH-002 (`[]`) gets muted copy that advising is not
enough. After enroll `201` there is no back-to-step-1. Create parent is
always shown on detail; LRN locked from `student.lrn`; `409` is already-has-a-parent.
**Edit 2026-09-12.** Shown only when the student's class appears in
`GET /assignments` (grade_level + section, never `section_id`). No PUT
probe. Adviser-only gets muted copy, not a button that 403s. Two Modals.
`POST /users/parents` still has
no assignment check. `PUT /api/students/:id` refuses a class change (`400`)
and writes `section_id` only when NULL (closed 2026-09-12). First screen
where the widened read scope is visible: TCH-002 lists and opens its advisory
section's student. **Measured originally: 1m24s** against Attendance's 3m14s —
recorded side by side, not as a series. Enroll is a later hole on the same
page, not a comparable rate.

**Two findings recorded, not fixed** (a client dispatch touches no server
files): `GET /api/students` returns the full personal row — address, contact
number, birthday — on a LIST, and the LRN in it doubles as the parent's
login_id; and `docs/API_REFERENCE.md`'s scope labels are stale for every read
widened on 2026-09-06/07, with no legend code existing for "assigned OR
adviser". The latter needs its own backend-docs dispatch. Neither was caught
by the 2026-09-07 audit, which diffed endpoint existence — a presence diff
cannot see a scope column drift stale, a stated limitation rather than a
failure.

**New rule recorded — CLAUDE.md convention §5c:** the LRN is half a
credential (a parent's login_id IS the child's LRN), so no screen shows one
except to a teacher or admin acting on that student, and no LRN goes in a
URL, query string, or error message.

**And convention §5d — display casing is presentation only.** `StatusBadge`
capitalises its rendered label while the tone lookup keeps keying on the
lowercased value; nothing about matching, storage or what is sent to the API
changes. It exists because the schema itself disagrees: `attendance`,
`excuse_letters` ENUMs are capitalised while
`users.status` and `students.status` are not. **That inconsistency is
deliberately NOT normalised** — a migration touching real rows for a cosmetic
reason is the wrong trade — so a future session finding the mismatch is
looking at a decision, not an oversight. Capitalising is a no-op for three of
the six vocabularies and visibly changes only two ENUMs plus grades'
locked/unlocked.

**Teacher → Excuse Letters is DONE (2026-09-07)** — queue + review, the first
Stage 4 write form. Where the sharpest 403/404 split reaches a user: see =
assigned OR adviser, review = adviser only. The page predicts that before the
click so the Review button is never a dead end, while the server stays
authority and the 403 is still handled. **Review is irreversible by API
design** (403 once a letter leaves Pending, no un-review endpoint), so the
modal requires an explicit confirmation naming the decision — recorded as
convention 5e, *confirmation follows reversibility*, stated together with
Attendance's deliberate lack of one so the two read as one rule. **Measured:
2m28s** (Attendance 3m14s, Students 1m24s) — recorded with what each page
involved, since three points neither trend nor form a rate.

**Empty-state copy restructured after review (convention 5f):** a single
`filtered` boolean meant both "a narrow filter matched nothing" and "the
status is All", which is the least narrowed state — so an empty result under
All told the teacher to try a different filter when none would help, and
"Nothing waiting for review" could surface outside Pending. Now three explicit
branches keyed on the applied values, making that copy structurally impossible
elsewhere. Second empty-state copy bug in three pages, hence a rule. Also
recorded: the originally reported symptom was **a stale module in an open tab
after HMR** — a hard reload cleared it, no data bug existed, and a hard reload
is now the first thing to try before treating a browser-review symptom as a
code defect.

**Two backend gaps recorded, neither fixed** (a client dispatch touches no
server files): `GET /api/excuse-letters/:id` returns strictly
less than its own list endpoint (no student join), which is why this page uses
a modal and never calls it; and `excuse_letters.attachment_url` is dead schema
— nothing writes it and there is no upload endpoint, so no screen should offer
an attachment. The third gap here — **no API creates a `teacher_assignments`
row** — closed 2026-09-08 (`POST`/`DELETE /api/assignments`).

**Teacher → Announcements, Memos, Events are DONE (2026-09-07)** — three page
files, not one component. The dispatch premise was that they are
near-identical; they are not, and **Memos is admin-only for every write**, so a
teacher's Memos page is a read-only list with no compose control at all.
Announcements **is the Class Board** — no separate affordance, because a
teacher's only legal target is an exact section, so every announcement they
post already is one; **"Announce to a class" from the message thread
opens this same form (2026-09-13)** and must not build a second composer.
Draft only — never the incoming message. **On a parent thread
the class is named and preselected** (from contacts; Announcements
re-validates, the server decides on POST). Delete confirms (hard DELETE,
no undo), edit does not. **Measured: 3m36s — not comparable to the previous
three, being three pages.**

**`teacher_assignments` is now readable and writable (2026-09-08).**
`GET /api/subjects`, `GET`/`POST`/`DELETE /api/assignments`. Consequences
1–2 closed: an admin can assign/unassign, a teacher can read their own
rows. **DELETE does not refuse when grades exist** — a scope change
removes future authority, never past records. Items 2–3 shipped the same
day after item 1 was committed: `GET /api/grading-modes` (missing config
is 409, not a settings key) and `DELETE /api/grades/:id` (admin-only, 403
when locked). **Teacher → Grades switched 2026-09-12** — encode-scope from
`GET /assignments`, mode from `GET /grading-modes`. **`useTeacherTargets`
switched 2026-09-13** — assigned leg is `GET /assignments` (distinct
grade+section), not `GET /students`; advisory `GET /sections` stays.
Empty / all-inactive assigned sections now appear in the Announcements
picker. Events cannot show that proof (grade-wide; TCH-001 already has
Grade 6). **Teacher → Contributions' compose workaround closed 2026-09-13 by
removal** (Feature 7 removed). NOW POSSIBLE's only remaining entry,
`posted_by_name`, is a recorded decision, not leftover work. **Contacts now carry class (2026-09-13) —
the Teacher → Messages thread reads it** to name and preselect the class;
that NOW POSSIBLE item is closed. **Contacts empty-cause stays open:**
`GET /assignments` does not tell "no parents exist" from "all parents
pending." TCH-002 is adviser of Masigasig with zero assignment rows and a
pending parent. **Consequence 5 closed 2026-09-13 by removal** — it was the
adviser-cannot-post-a-fee gap in `contributions.js`, which no longer exists.

**Teacher → Messages is DONE (2026-09-07)** — conversation list + thread, and
the first Stage 4 page using Socket.io. Added `socket.io-client` pinned to
4.8.3 (first new runtime dependency since the foundation) and touched
`Shell.jsx` for the first time, for the unread badge.

**The socket is a latency optimisation, not the delivery path** — REST persists
before emitting, and an emit into an empty room is a no-op, so an offline
recipient loses nothing. **New convention 5g: when a live channel fails, say so
— never fake liveness.** The UI shows "Live updates paused" with a Refresh
action and deliberately does NOT poll, because polling would disguise a state
the user should know about, and a parent-teacher channel that looks delivered
and is not is the one failure this module cannot afford.

No optimistic append (a sent message appears only after the server confirms);
unread is server-derived and cleared by a request, never decremented locally.
**The nav badge renders only on a BUILT item** — live for Teacher today,
automatically live for Parent and Admin when their pages land, so neither
dispatch should build its own. **Measured: 4m4s**, not comparable to the
previous four — first transport rather than another CRUD surface.

**A browser review caught a blank-page defect before commit** — `Shell.jsx`
used `useEffect` without importing it, so Shell threw and every route for all
three roles rendered blank. Build passed, lint passed, server suites passed.
**Recorded as convention 5h: build and lint prove the code compiles, not that
the page renders — a page is not done until it has been opened.** Second such
defect in seven pages (the attendance Recorded column was the first); both were
in code that ran, so nothing automated had anything to fail on. `oxlint` does
have `eslint(no-undef)` and it would have caught this, but it is not in the
default `correctness` category — noted, deliberately not enabled here.

**Convention 5i (Teacher → Grades browser review, 2026-09-07):** explanatory
copy is a claim about behaviour. Copy that overstates what the code does
sends a reviewer chasing a bug that does not exist. The page said picking
a subject you do not teach would mark it; the code marks only after
Record/Edit `POST /` 403. Tightening the copy is the fix when the behaviour
is already honest.

**Two further browser-review findings, fixed before commit.** The unread badge
never cleared — the thread page issued `read-all` and the server was correct,
but `Shell` had no signal to refetch, so the badge was only right on a full
reload. Fixed by **building the signal** (`realtime/UnreadProvider.jsx`,
`{ unread, refresh }`), never by decrementing locally. And the "Live updates
paused" strip lived only on the Messages pages while the badge it relates to
lives in `Shell` on every page — **convention 5g failing one level out from
where it was written**. 5g now states WHERE the notice belongs: wherever
anything depending on the channel is shown, not only on the page that owns the
feature.

**The reported WebSocket console error was not a defect.** The Network tab
showed websocket connected at `101`; real-time delivery was working and the
strip was correctly hidden. The cause is **React StrictMode's dev-only
double-invoked effects** closing the first socket while it is still connecting —
not a transport problem, and deliberately not worked around, since the cleanup
is correct and StrictMode exists to surface exactly this. Recorded in 5h with a
falsifiable prediction so nobody chases it again.

**Parent → Announcements, Memos, Events are DONE (2026-09-07)** — the first
parent-facing feature pages, and the first Stage 4 dispatch with **no write
affordance anywhere**. Every write on all three routers is teacher/admin-only,
so a parent never reaches a handler: `authorize()` answers `403 "Access
denied."` first — verified live for all nine POST/PUT/DELETE combinations.
That generic refusal is exactly why the control must not exist rather than be
shown and handled; a scope refusal explains itself, `"Access denied."` does not.

**Full text opens in a Modal, not a detail route, because no `GET /:id` exists
on any of the three routers** — verified live, `404 "Route not found."` from
`server.js`'s fallback, not a scope refusal. The stronger form of the Excuse
Letters decision (there `GET /:id` exists and returns strictly less; here it
does not exist). Costs no request either way: each list row is already
`SELECT *` and carries every column the modal renders.

**Audience labels are derived from the target columns' nullness**, never from
`user.grade_level`/`user.section` — which `/auth/me` does return, so the
alternative was available and declined: naming "Grade 6 - Malikhain" teaches a
parent the routing model for nothing they can act on. Announcements has **three**
cases (school-wide / whole-grade / own section — collapsing whole-grade would be
wrong for an admin post the API permits); Events has **two**, because that table
has no `target_section` column.

**One filter across three pages, and each absence is a decision.** Announcements:
none — `grade_level`/`section` are AND-ed onto the target columns, so the filter
could only HIDE the school's own posts. Memos: none available — that endpoint
accepts no query params, and `?grade_level=1` returns `200` unfiltered where the
same param `400`s on its two siblings. Events: **Upcoming vs All on `from`
alone**, inclusive (`event_date >= ?`, so today counts — verified with a fixture
dated today), built from `todayLocalDateString()`, never `toISOString()`, and
**omitted entirely** rather than sent empty when the range is All.

**Convention 5f's branch count differs per page — three, two, one — and that is
a finding about the endpoints, not an inconsistency.** Verified by nulling the
parent's `student_id`: announcements and events return `200` with **zero rows**
(the handlers short-circuit on `getStudentClass()` returning null — not an
error, so the page must not render one) while **memos still returns every row**,
having no parent branch at all. `student_id` restored and confirmed.
`user.student_id` chooses the empty COPY and never gates the request — skipping
a fetch because an account "looks unlinked" would hide real posts behind a
stale `AuthContext`.

**5b, 5e and 5g do not apply to these pages, and saying so is a finding**: 5b
needs an input that writes record state (the Events select is query state), 5e
decides whether a write needs confirmation and there is no write, and nothing on
these pages is channel-fed. **5c applies most sharply** — `/auth/me` returns
`lrn` AND `login_id`, which for a parent are the same credential under two
names; neither is rendered, and no id goes in a URL.

**No primitive gained a prop.** `onRowClick` declined (title cell is a
`<button>`, the Students-page pattern) and `defaultSort` declined (the API
returns `event_date DESC`, wrong for Upcoming, so the page sorts the array it
owns — `DataTable`'s sort starts `null`, so that order holds until a header
click). Modal scrolling is a page-level wrapper, not a Modal prop.

**Verified in three layers.** Build clean, `oxlint` 14 → 17 (three
`set-state-in-effect` fetch advisories, one per page, same as every other page)
— confirmed by listing findings per file rather than trusting the total.
**The baseline was 14, not the 13 the Messages entry recorded**: that count
predated the same dispatch's `UnreadProvider.jsx`, which carries two of its
own. Corrected so the next dispatch does not inherit the off-by-one.
**Convention 5h's render proof run inside the clock for the first time** — all
three pages SSR-rendered in `MemoryRouter` + `AuthProvider`, **with a negative
control**: removing `useState` from an import reproduced `ReferenceError` while
`npm run build` still succeeded, demonstrating 5h's claim again rather than
restating it. Then **35 live API checks against 9 fixtures**, all passing,
including **isolation asserted in both directions** — Grade 5 - Masigasig posts
are absent from the parent's announcements, from Upcoming events, and from All
events, so widening the range does not widen the scope. All fixtures deleted;
all three tables back to 0 rows.

**Measured: 13m14s — sixth data point, and the jump is not about the pages.**
Cheapest dispatch of the six by what was built (three read-only pages, no new
primitive, helper, dependency, write path or layout change); most expensive by
the clock, and the whole gap is verification. **This is the first point measured
with 5h inside the window** — 5h was written after Messages' 4m4s was recorded —
so **the five earlier points are not comparable to anything measured from here
on.** A seventh point compares to this baseline, not to Messages.

**Six backend findings flagged in that dispatch, none fixed then — no server file touched.** Four were new: no `GET /:id` on the three routers; memos ignoring unrecognised params where its siblings `400`; `posted_by` a bare integer no non-admin client could resolve (`GET /api/users/:id` is admin-only); and `/auth/me` returning one credential under two names. The other two — `attachment_url` dead schema and API_REFERENCE's stale
scope labels — stay recorded and untouched.

**Parent content modals render `posted_by_name` (2026-09-12).** Same three
pages, no new nav. Copy is `Posted by {name}` as its own segment — Events'
first span is `event_date`, so combining date and name cannot be consistent
across the three. No `"Unknown"` fallback. **Team product decision, not a
school answer** — if the school later objects, the modal line goes; the API
field stays. **Teacher → Memos renders it as a column (2026-09-12).**
Teacher → Announcements and Events deliberately do not — DECISION, not
leftover (Actions already says mine/theirs; those pages already have four
columns). Do not close the NOW POSSIBLE row as though all three shipped.

**Convention 5g's inverse is closed for Parent (2026-09-09)** by flipping
Messages `built: true`. No `Shell.jsx` change — `UnreadProvider` is already
gated on that flag; `LiveStatus` stays ungated. **Admin still has the inverse**
and that belongs to Admin → Messages.

**Parent → Grades is DONE (2026-09-07)** — the report card, and **the first
feature page to consume `GradeValue`**. Convention 3 was frozen into the Stage 4
foundation on 2026-09-06 and sat with no caller through five feature dispatches;
this is the page it was written for. One page file, one route, one nav flip, plus
the `ParentDashboard` copy fix folded in.

**One request — and the two endpoints NOT called are the more interesting half.**
`GET /api/grades/student/:studentId`, six-key unwrap (this endpoint has no
`grade`/`grades` wrapper at all, verified live rather than read off
API_REFERENCE). `GET /` is declined because it returns bare grade rows with no
subject-coverage overlay, so a subject with zero grade rows would silently
vanish — the exact confusion the report-card endpoint exists to remove.
`GET /:id` was deferred as a school question (2026-09-07). **Answered
2026-09-11 (team conversation, not a school visit or a written reply):**
parents should see raw scores for transparency. **The modal is approved**
— do not remove it as an unapproved feature. The endpoint stays. Not a
documented policy letter; do not cite it in the manuscript as one.
Same Parent → Grades page, no new nav. Tap a term with `grade_id` → Modal.
Initial Grade is not on the parent card and is not in the modal. Grade 1:
letter, no empty WW/PT/Exam sections (write path forbids
components on a descriptive row). Full spec: CLAUDE.md NOW POSSIBLE → Parent
grade breakdown (BUILT). Do not add Parent → Students (Figure 17's name is
Grades, not Feature 3). Rank / "Passing" / "Need attention" stay out
(convention 4).

**This page skips its request when `student_id` is null — the opposite of the
parent content pages, and the difference is structural.** Those endpoints take
no student id, so the server derives the child and skipping would hide real posts
behind a stale `AuthContext`. Here the id goes IN the path the client builds, and
`parseId(null)` answers `400 "Invalid student id."` — verified live — a
developer-facing string that would reach a parent as though the app were broken.
`loading` clears in the same turn as the skip. Proven in the browser, and the
proof does not depend on the Network tab: the error branch and the empty branch
are mutually exclusive, so seeing the link-slash copy at all means the request
never left.

**5c is enforced by SOURCING, not by discipline.** The header renders from the
report payload's own `student` object, asserted live to be exactly
`{ id, first_name, last_name, grade_level, section }` — **no `lrn` key in it to
leak**. `/auth/me` does carry `lrn` and `login_id` (for a parent, the same
credential twice) and is read for the path id and nothing else. Route is
`/parent/grades` with no `:id`, since a parent has one child.

**4 held against a live temptation.** The API sends
`{ descriptor: 'Advancing', remarks: 'Passed' }` on every populated Final Grade
and General Average. Only `descriptor` renders — never `remarks`, never through
`StatusBadge`, and **never as a colour keyed on the band**, since tinting
"Emerging" red is a verdict written in CSS. **Browser review produced better
proof than any assertion did:** seven subjects read `Advancing` and Mathematics
read `Benchmarking`, because 89.67 sits in the 80-89 band — the descriptor is
genuinely looked up per subject, and "Passed" appeared nowhere on a screen the
API had sent it to eight times. `is_locked` is on every term entry and is not
rendered: a parent cannot act on it, and it reads as either "final" (a promise
an admin can undo) or "hidden from you" (false).

**Finding C — `GradeValue` has no branch for a descriptive A–E letter**, and it
is recorded rather than fixed. `formatGrade('A')` is `NaN → null → "— N/A"`, the
string meaning "does not apply", on the one value that does. Outside the
primitive's contract rather than a bug inside it, so the letter is handled
locally and `format/grade.jsx` was not touched — the same rule that kept
`onRowClick` out of `DataTable`. **The seed now has a Grade 1 student** (Nino,
LRN `1090001`, parent active — CLAUDE.md Seeded baseline), so the fixture that
blocked verification is gone. **The local UI branch is still unverified in a
browser** — the fixture dispatch is seed + tests, no client file. Open
`/parent/grades` as `1090001` / `Parent@2026` to retire it. Do not add a fifth
state to `GradeValue` until that pass has been seen on screen.

**5f's obvious empty state is structurally unreachable, and that is the
finding.** `subjects` comes from the `subjects` table by `grade_level`, and the
seeded curriculum is 5/5/6/8/8/8, so a linked parent always has rows. **A "no
grades yet" empty state would be dead code that, if it ever fired, would hide a
real all-`Pending` report card** — the worst failure available on this screen.
Verified before any fixture existed: with `grades` at 0 rows the endpoint returns
8 subjects, all terms null, FG null, GA null — the normal state today, rendering
as eight rows of "— Pending", not as an empty state.

**No filters, each declined for its own reason.** `student_id` is fixed (naming
another child is `403`, so the control's only other value is a refusal);
`subject_id`/`term` would filter eight visible rows and the endpoint does not
accept `term`; `school_year` is accepted and defaults to
`system_settings.academic_year`, but the seed holds one year and **no endpoint
lists the years that exist**, so a picker either generates 400s or invents data.

**Verified: 32 live API checks, all passing**, plus a **24-row fixture chain
built through the real write API** (admin shells, then components and exam as
TCH-001 for the three subjects it actually teaches). Arithmetic hand-checked at
both levels — Mathematics 89/91/89 → FG **89.67**, mean of eight FGs → GA
**90.21** — and NULL-until-complete proven rather than assumed at both: English
with 2 of 3 terms kept `final_grade: null`, and GA stayed null with 7 of 8
subjects done. **Three browser states, with a DB flip between each**, because
every interesting state of this page is a state of the DATA. 5h satisfied by
opening it as `13567454`; SSR plus a negative control (a removed `useMemo`
reproducing `ReferenceError`) is the backstop, not the proof. Teardown by direct
SQL — **`DELETE /api/grades/:id` did not exist yet** (shipped 2026-09-08,
admin-only; this teardown ran before it) —
with both tables confirmed back at 0. Build clean; `oxlint` 17 → 18, the single
addition being the usual fetch advisory.

**Measured: 37m26s — seventh data point, and read the split first: ~24m agent
work, ~13m of the clock running idle waiting for browser-review replies.** That
idle time is real elapsed time a dispatch cannot proceed through, but it is a
different cost from building or verifying and scales with how many states need a
human eye. **The carry-forward is why a report card costs three browser states
where an announcements list cost one:** every interesting state here is a
database configuration of the same component with no input to drive it, so it can
only be walked by writing rows and deleting them — and **every remaining Parent
page has that shape**, being read-only views of teacher-authored data.

**Two findings flagged, neither fixed — no server file touched.** No
`DELETE /api/grades/:id` (so a grade row created against the wrong student or
term is uncorrectable except by hand; the likely shape is admin-only and refused
once `is_locked` is set, but that needs deciding rather than patching), and
`GradeValue`'s missing letter state above. **API_REFERENCE was checked and left
alone** — its grades parent rows match the live responses, so unlike the
content/students scope labels, no correction was owed. **5g's inverse closed
2026-09-09** with Parent → Messages (`built: true`, no Shell change).

**Teacher → Grades is DONE (2026-09-07)** — viewing + encoding, one page
at `/teacher/grades`. The teacher does not choose a mode: after a class is
picked, `GET /api/grades/student/:id` on one roster student supplies the
subject list and term grid. **`grading_mode` and encode-scope switched
2026-09-12:** mode from `GET /grading-modes` (object; no `?? 'numerical'`);
encode-scope from `GET /assignments` before any click. Empty roster copy
names the empty class. **Do not reuse `useTeacherTargets`** —
assigned-OR-adviser vs assignments-only. **No client-side IG preview.**
**`TermCell` copied from Parent → Grades.** **No lock button.** **§5e: no
confirmation** — `DELETE /api/grades/:id` is admin-only. `ensureShell`
still creates the shell; it no longer discovers scope. **Alert XOR**
(error wins; `closePanel` clears both). **No unsaved-changes warning.**

Verified live on throwaways, then SQL-torn down: `student_id=14` LRN
`61001990` Grade 6 - Malikhain, `grade_id=31`, IG **88.05** / TG **90**;
`student_id=15` LRN `11001990` Grade 1 - Mabait, `grade_id=32`, letter B.
Science POST 403 before scores. Nino's 5 rows and Marwin's 0 untouched.
`DELETE FROM grades WHERE student_id IN (14, 15)` then those student rows;
baseline restored. SSR + negative control. `npm run build` clean; `oxlint`
18 → 21, three fetch-effect advisories. **No Cursor browser** — open
`/teacher/grades` as TCH-001 / TCH-002 / TCH-003. Hard reload if HMR looks
wrong.

**Browser review (2026-09-07):** stacked error+success alerts fixed (XOR,
error wins). Copy now names Record/Edit, not picking the subject (new
convention 5i). Existing-row encode-scope hole recorded, not fixed.
Hard reload if HMR looks wrong. Re-test: save exam then Add score with
empty label (only the red should show); pick Science and click Record on
Carlo (picker marks "(not yours)", no form). **Re-test passed.** Carlo
Fixture (`student_id=16` LRN `61990001`) torn down after.

**Measured: 20m — eighth data point.** Almost all agent work; no
browser-review wait in this window. Same four caveats, still not a rate:
first Stage 4 page that both views and writes grades, against nine
endpoints, dual-mode, no client-side computation.

**Teacher → Contributions is DONE (2026-09-08)** — last Teacher Stage 4 page.
Seven of eight endpoints teacher-reachable. Grade-level assignments-only
(adviser not included — consequence 5; school question; do not widen).
Roster in a modal. Amount override skipped. Roster review: Section dropped,
one action control. Modal `lg` is the ceiling (convention 7b). `TeacherDashboard`
now derives from `navForRole`. **Teacher web role is complete.**

**Modal focus steal, fixed 2026-09-08 in the primitive.** Compose fields lost
focus after one or two characters because `Modal`'s effect mixed "focus on
open" with "current onClose". Same shape on Announcements, Events, Excuse
Letters remarks, and Messages search — all passed 2026-09-07 browser review
without anyone typing a full word. §5h: opening a page is not using it.
Call sites untouched.

**Measured: ~40m — ninth data point (~40m agent, ~0m idle).** Same four
caveats, still not a rate. Last Teacher page: list + compose + roster
modal, assignments-only, dashboard derived from nav, consequence 5 and
the removal list recorded.

**Parent → Excuse Letters, Messages, Contributions is DONE (2026-09-09).**
Three page files. Excuse Letters submits and edits while Pending (no
confirmation — PUT is the correction). Messages copies the Teacher list
fetch (conversations for the table, contacts for the picker — no merge).
Contributions is `GET /my-records` only. The Messages `built` flag closes
the 5g LiveStatus inverse; `Shell.jsx` untouched. ParentDashboard needed
no edit. Live HTTP 46/46; SQL teardown restored `excuse_letters` /
`messages` / `contributions` / `contribution_records` to 0; Nino's five
grades untouched. SSR + negative control. `npm run build` clean; `oxlint`
22 → 26. **No Cursor browser** — open the three routes as `13567454` and
`1090001`. Type a full word in Excuse and Messages fields.

**Measured: ~35m — tenth data point (~23m agent, ~12m idle MYSQL80/UAC).**
Same four caveats; compare to the sixth point onward.

**Parent → Attendance is DONE (2026-09-09).** Unblocked by never rendering
a rate. Route `/parent/attendance`. Summary + day list, Month vs All,
skip when unlinked. Teacher history is not this dispatch. ParentDashboard
needed no edit — Open now derives from nav and now includes Attendance.
Browser as `13567454`: month Present 1 / Recorded 1; All Present 1 /
Absent 1 / Recorded 2. No LRN, no percentage. Live HTTP 26/26;
`attendance` torn down to 0; Nino's five grades untouched. SSR +
negative control. `npm run build` clean; `oxlint` 26 → 27.

**Measured: ~75m — eleventh data point (~50m agent, ~25m idle sandbox/oxlint).**
Same four caveats; compare to the sixth point onward.

**Admin → Users is DONE (2026-09-09).** First admin feature page. Route
`/admin/users`. Pending queue from `GET /users/parents/pending`; directory
from `GET /users`. Never `POST /users/parents`. No `:id` route. Approve/reject
confirm and name the decision; deactivate does not. `AdminDashboard` derives
from nav. Did not write on seeded parent `1234567` (Jea). Browser as
`ADMIN001`: dashboard Open now Users; Review on Jea cancelled after named
confirm; Create teacher typed a full Login ID and Name and cancelled. Live
HTTP 29/29; users 7, Jea still pending. SSR + negative control. oxlint 27 → 28.

**Measured: ~50m — twelfth data point.** Same four caveats; compare to the
sixth point onward.

**Parent → Settings is DONE (2026-09-09).** Last Parent Stage 4 page.
Route `/parent/settings`. Locked: child name, LRN/`login_id`, grade/section,
guardian name, email. Writes: `PUT /api/auth/change-password` and
`PUT /api/auth/contact` only. Never `GET /api/settings` (school key-value)
or `PUT /api/users/:id` (admin). Unlinked accounts still change password
and contact. `AuthContext.refresh()` after contact save. Password UX
matched Teacher Settings 2026-09-10 (confirm Modal, per-field show/hide,
grey until Confirm). Contact stays no-confirm. ParentDashboard
needed no edit. **Parent web role is complete.** Open `/parent/settings`
as `13567454` and `1090001`. Password: type full words → Change password
→ modal → **Go back** (no PUT). Do not confirm a real change
(`Parent@2026`). Hard reload if HMR looks wrong.

**Teacher → Settings is DONE (2026-09-10).** Copy of Parent Settings, not
a new page. Route `/teacher/settings`. Nav is add, not flip — teacher nav
ended at Messages. Three sections: locked identity (name, Teacher ID =
`login_id` not an LRN, email) + contact + password. Confirm new password
kept. Stay logged in after password (Parent does not `logout()`). Never
`GET /api/settings` or `PUT /api/users/:id`. Password confirm Modal after
browser review (contact stays no-confirm). Per-field show/hide on
the three password inputs; Change password stays grey until Confirm
has a value. Parent Settings password UX matched the same day
(confirm Modal, per-field show/hide, grey until Confirm). Live HTTP 29/29; TCH-001 contact restored to `09170000002`;
password restored to `Teacher@2026` after a review change; Jea still
pending; Nino's five grades untouched. SSR + negative control. `npm run
build` clean; oxlint 28 unchanged. **Teacher web role is complete.** Open
`/teacher/settings` as TCH-001 / TCH-002 / TCH-003. Type a full word in
contact. Password: type full words → Change password → modal → **Go
back** (no PUT). Do not confirm a real change. Hard reload if HMR looks
wrong.

**Measured: ~20m — fourteenth data point (~18m agent, ~2m idle oxlint).**
Same four caveats; compare to the sixth point onward. Copy of Parent
Settings. Nav add, not flip. Stay logged in after password.

**Next:** Stage 4 is complete (2026-09-14) — Admin → Backup & Restore was the
last page, after Students, Settings, Attendance, Announcements (with memos)
and Grades. Stage 5 (Expo) is next in BUILD ORDER. Sections, Excuse Letters, Events and Messages will not be
built (Darryl, 2026-09-13). Parent and Teacher web are complete. The
attendance rate question was answered 2026-09-13 (principal, in conversation:
Late = present, Excused = absent); the parent page shows "Present on recorded
days" over recorded days, not SF9 Class Days. DO 015 s. 2026 prescribes no
rate and no attendance grade component (para 71).

**Grade 1 descriptive fixture seeded (2026-09-07)** — persistence was the gap,
not coverage. `test:grades` already covered the write path on a throwaway
Matipid student. What the demo needed was a row that survives `db:setup`.
TCH-003 / Mabait / LRN 1090001 / partial letters (A/B/C on Mathematics, D/E
on Reading with term 3 blank, three subjects untouched). Letters are
illustrative, not computed. The grades suite asserts that card read-only and
must not write on it. Live counts: CLAUDE.md Seeded baseline.

---

## What's left, module by module

**Grade Management & Viewing** — API fully done (write path + viewing, all nine stages); Parent report card and Teacher encode are both built.
- [x] **Parent report-card view — DONE 2026-09-07.** Per subject, per term,
      Final Grade, General Average, qualitative descriptor. First consumer of
      `GradeValue`. Read-only.
- [x] **Parent term breakdown — DONE 2026-09-11.** Tap a term with
      `grade_id` → Modal, `GET /:id`. Parents-see-raw-scores answered
      2026-09-11 in conversation; the modal is approved. Grade 1: no empty
      WW/PT/Exam sections. IG not shown.
- [x] **Teacher encode — DONE 2026-09-07.** One page, both modes, no client
      IG preview, no lock button, no confirmation. **Switched 2026-09-12:**
      encode-scope from `GET /assignments` (unassigned marked before click);
      mode from `GET /grading-modes`. Empty class copy names the empty class.
- [ ] Web pages: admin lock/unlock control (and admin delete of an unlocked
      wrong-student / wrong-term shell — `DELETE /api/grades/:id` exists).
- [ ] Expo screens (Stage 5, not started).
- [ ] Open, not blocking: Grade 1's manual-letter model and teacher
      self-locking are both recorded as open school questions, not
      decided — see CLAUDE.md's OPEN QUESTIONS and Grades module note.

**Authentication** — done except mobile.
- [x] **Parent → Settings — DONE 2026-09-09.** Identity locked. Password
      + contact only. `PUT /api/auth/contact` is any authenticated user,
      not parent-only.
- [x] **Teacher → Settings — DONE 2026-09-10.** Copy of Parent Settings.
      Nav add, not flip. Stay logged in after password. Password confirm
      Modal (contact stays no-confirm). Parent Settings password UX
      matched the same day.
- [ ] Expo login screen (Stage 5, not started).

**User Management (Admin)** — API done. Admin web Users page done 2026-09-09.
- [x] Admin web screens: pending-approvals list, user list, edit-user form, activate/deactivate control, create teacher. Never `POST /users/parents` from this page.

**Student Records Management** — API done. Teacher list + detail 2026-09-07;
enroll + create pending parent 2026-09-10. Teacher read scope includes the
section adviser (2026-09-06); write scope unchanged. Teacher Edit built
2026-09-12 (`GET /assignments` match, no probe). Admin student screens still unbuilt.
- [x] Teacher web: student list, student detail (`/teacher/students/:id`).
- [x] Teacher enroll wizard + create parent on detail (2026-09-10). No new nav item.
- [x] Teacher Edit student (2026-09-12). Visibility from `GET /assignments`.
- [ ] Admin list/detail/enroll. Student DELETE.
- [ ] Expo screens (Stage 5, not started).

**Attendance Monitoring** — API done. Teacher encode, Teacher records, and Parent view built.
- [x] **Teacher encode — DONE 2026-09-06.** Per-day, adviser-scoped, bulk submit.
- [x] **Teacher records — DONE 2026-09-12.** Separate page, sibling route,
      add not flip. Read only. `GET /attendance` range, never `date`.
      Correction path is the encode screen.
- [x] **Parent view — DONE 2026-09-09.** Counts + day list; "Present on recorded days" = (Present + Late) / total added 2026-09-13.
      Month vs All. Skip when unlinked.
- [ ] Web pages: admin attendance.
- [ ] Expo screens (Stage 5, not started).

**Announcements & Memo Dissemination** — API done (Class Board included — see Notes above, investigated 2026-09-06, zero new code). Teacher and Parent pages built 2026-09-07.
- [x] **Teacher Announcements, Memos, Events — DONE 2026-09-07.** `posted_by_name` column on Memos only, 2026-09-12. Announcements and Events deliberately do not.
- [x] **Parent Announcements, Memos, Events — DONE 2026-09-07.** `posted_by_name` in the modal 2026-09-12.
- [ ] Web pages: admin content. Teacher Announcements/Events `posted_by_name` is a DECISION not to render, not a leftover.
- [x] **Teacher → Messages "Announce to a class" — DONE 2026-09-13.**
      Thread control. Opens the existing Announcements compose with the
      unsent draft via `location.state`. Never copies the incoming
      message. **Names and preselects the class on a parent thread**
      (same day, second dispatch) from `GET /contacts`, fetched in its
      own effect, not `load()`. Teacher/admin thread, no contacts row, or
      contacts failing → unnamed, no target. Hint is visible text. An
      empty target list on arrival shows the draft instead of dropping
      it. No new endpoint, no second composer, no nav change.
- [ ] Expo screens (Stage 5, not started).

**Parent-Teacher Messaging** — API + Socket.io done. Teacher and Parent web pages built.
- [x] `GET /api/messages/contacts` — **BUILT 2026-09-07.** Wrapper key `contacts`. Active accounts only (a pending parent cannot log in, so listing them offers a conversation that cannot happen — an adviser whose section's only parent is pending therefore sees zero parent contacts, which is correct and asserted as such). Scoped by the
      inverse of `canMessage()`: parent sees their child's teachers (+ subject)
      plus admin; teacher sees their students' parents (+ student name) plus
      other teachers and admin; admin sees everyone. Optional `?search=` within
      scope only — never unscoped. Includes last message + unread count inline
      so the frontend needs one call. **2026-09-13:** parent rows also carry
      `student_grade_level` and `student_section` (the child's class).
      Teacher/admin rows null. The Teacher → Messages thread reads them (2026-09-13). Conversations
      and `GET /with/:userId` still have no class. See CLAUDE.md's
      "GET /api/messages/contacts" section.
- [x] **Teacher conversation list + thread — DONE 2026-09-07.**
      "Announce to a class" on the thread 2026-09-13 (see Announcements
      checkbox above). Names and preselects the class on a parent
      thread, from contacts.
- [x] **Parent conversation list + thread — DONE 2026-09-09.** Copies the
      Teacher fetch: table = `GET /conversations`; contacts = New-message
      picker only, no merge. `built: true` closes the 5g LiveStatus inverse.
- [ ] Web pages: admin.
- [ ] Expo screens (Stage 5, not started).

**~~Contribution/Fees Monitoring~~ — REMOVED 2026-09-13.** Principal Bajar,
consultation 2026-09-01: the school is not permitted to collect contributions
from parents. The team removed Feature 7: 8 endpoints, 2 tables, 2 pages, 3
nav items, 1 suite. Chapter 5 must explain it (Figure 19 describes the
feature). Closed with it: consequence 5, the DELETE 409, Download Statement,
the last NOW POSSIBLE workaround. See CLAUDE.md → SCOPE DECISION.

**System Settings Management (Admin)** — API done, no screens yet.
- [ ] Admin web screen: settings form (school info, academic year, current quarter, logo).

**Backup & Restore (Admin, web only)** — API done (both Backup and Restore); web screen built 2026-09-14.
- [x] **Admin → Backup & Restore — DONE 2026-09-14.** List + orphaned files (read-only), create, download, delete manual backups only (safety copies have none), restore with step-up password + typed file name and a result panel that names the safety copy and the lost `activity_logs` count. A wrong step-up password is `403` (the per-call `skipAuthRedirect` opt-out was removed 2026-09-15).
- [x] **Manual end-to-end restore — DONE 2026-09-15** (Darryl, the Admin → Backup & Restore browser check; all eight steps passed; 2 `activity_logs` entries lost, named on the result panel). Both backup suites ran before it; `test:restore` now records and puts back the cutoff it finds, so it is safe to run after it (fixed 2026-09-15). Not `db:setup` as the recovery path — it drops `activity_logs`.
- Four findings, recorded in CLAUDE.md KNOWN ISSUES. **Fixed 2026-09-15:** failed restore attempts are now logged (`restore_refused`). Still open: `auth_security_state` is one global row with no user or role (intended); the lost-entries count undercounts by the source backup's own `create_backup` row (screen said 2, the pre-restore safety dump shows 3); a truncated dump from the check (`parents_portal_2026-09-15_003822.sql`) sits on disk as an 11th orphan, unmarked as incomplete.

**Excuse Letter Submission & Management** — API fully done
(submit/mine/list/view/edit/review). Teacher read scope now
includes the section adviser (2026-09-06); review authority unchanged
(adviser-only).
- [x] **Teacher review queue — DONE 2026-09-07.**
- [x] **Parent submit + list — DONE 2026-09-09.** Edit while Pending, no
      confirmation (§5e). Skip POST when unlinked (API is 409 as of
      2026-09-11; the page still hides Submit).
- [ ] Web pages: admin review.
- [ ] Expo screens (Stage 5, not started).

**All ten core features now have a complete backend.** Ten backend
modules complete, **85 endpoints** (84 handlers in `server/routes/` plus
`GET /api/health` mounted in `server.js`). The 2026-09-07 existence audit
found all three buckets empty at 77; later additions include
assignments/subjects, `GET /grading-modes`, `DELETE /grades/:id`, and
`PUT /auth/contact` (2026-09-09). What every module still needs is
remaining admin web pages (Stage 4) and Expo screens (Stage 5) — see the
Notes column above for the concrete next step per module. Teacher → Grades encode-scope switched 2026-09-12. **Stage 4 is
complete (2026-09-14)** — Admin → Students, Settings, Attendance,
Announcements (with memos), Grades and Backup & Restore landed that day.
Sections, Excuse Letters, Memos, Events and Messages are not built by the
Figure 5 scope decision, and were **removed from the admin nav on 2026-09-18**
rather than left dimmed — admin nav is 8 items, all built. The Parent
dashboard's "remaining sidebar items…" sentence was removed the same day (it
had been false since Parent → Settings landed on 2026-09-09), and §5g's
LiveStatus inverse was closed by gating the strip on the same test as the
unread badge.

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
