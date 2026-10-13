# CLAUDE.md ARCHIVE — full narratives moved out on 2026-09-18

> Verbatim copies, in their original order, of the CLAUDE.md sections that were condensed. Nothing here was rewritten. Read the condensed section in `CLAUDE.md` first; come here for the reasoning, the worked examples and the history.
> Moved out of `CLAUDE.md` on 2026-09-18 verbatim so that file fits Claude Code's 150k-char limit. `CLAUDE.md` holds the condensed version and wins on any present-tense claim; if the two disagree, the code is correct and both must be fixed.
> Dated entries record what was true on their date and are never back-edited.


## BLOCKED / RESOLVED → Grade 1's computed letter — CLOSED and moved 2026-09-22

> Moved here under CLAUDE.md's REFILL RULE: *a closed BLOCKED / RESOLVED item
> leaves CLAUDE.md permanently, in the dispatch that closes it.* The item was
> open for one day — the school answered on 2026-09-22 and it was built the
> same day. CLAUDE.md keeps the one-line rule and the pointer.
>
> **The live record is `docs/GRADING_SPEC.md` §6a**, which is marked BUILT and
> carries the arithmetic, the bands, the rounding note and what the build
> actually touched. Below is the CLAUDE.md paragraph as it stood while the
> item was open, kept because it is the only place the *interim* state is
> written down — the day when the rule was known and the code still did the
> opposite.

Verbatim, as it stood in CLAUDE.md → BLOCKED / RESOLVED → Grades module from
2026-09-22 until this dispatch:

> **Grade 1's letter: the school answered on 2026-09-22 — it is COMPUTED**, from
> WW 30 / PT 50 / Summative 20, banded on the raw weighted score. **The rule is
> `docs/GRADING_SPEC.md` §6a and NOTHING IMPLEMENTS IT YET** — today
> `PATCH /:id/descriptive` takes a hand-picked letter and every Grade 1 component
> write is a `400`. Do not read the built behaviour as the school's rule.

**What closed it**, in one place so the shape of the change survives without
re-reading two commits: `PATCH /:id/descriptive` was **retired** rather than
kept alongside the computed path — one write path for every grade level, and a
stored legacy letter keeps its value but can no longer be edited through the
API. `preflightGradeWrite` began accepting a *score-bearing* mode and
returning it, so `recomputeGrade` forks on what preflight already read;
`grade_components.type` stayed `ENUM('WW','PT')` with Summative reusing the
`ex_*` columns; the seed dropped its
`JOIN grading_mode_configs WHERE mode = 'numerical'` so every grade level gets
a weight row; and `scripts/migrate-grade1-weights.js` does the same to a live
database, aborting rather than overwriting a row with different weights.

**The one behaviour worth carrying forward**, because it looks like a bug and
is not: a legacy Grade 1 row shows all three term letters and **no Final
letter**, since the Final averages the three Initial Grades and a typed letter
has none. On the seeded demo card, Nino's Mathematics reads A / B / C with a
blank Final while Makabansa (encoded from scores) reads A / B / C with a
Final. Both are correct.


## CURRENT STATE → Files that exist

> Originally under CLAUDE.md → CURRENT STATE. Lines below are verbatim as of 2026-09-18.

### Files that exist

```
server/
  server.js                    Express app + explicit http.createServer wrapping it (so Socket.io
                                shares the same server, not a second one — app.listen() replaced
                                with httpServer.listen()); mounts /api/auth, /api/users,
                                /api/students, /api/sections, /api/subjects, /api/assignments,
                                /api/grades, /api/grading-modes, /api/attendance, /api/announcements, /api/memos,
                                /api/events, /api/settings, /api/backups,
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
  routes/auth.js               login, me, change-password, contact.
                             fetchUserByLoginId LEFT JOINs student names /
                             grade / section; does not SELECT s.lrn.
                             login_id is the one LRN copy on the session.
  routes/users.js              create teacher/parent, pending, approve/reject, list/view/edit/status
  routes/students.js           list/view/create/update, teacher scoped to own assignments.
                                POST / writes section_id (resolve sections by name +
                                grade_level + academic_year, same shape as POST
                                /assignments — a write, not a fifth reader). Duplicate
                                LRN 409 before that resolve. PUT refuses a
                                class change (400) and writes section_id only
                                when the stored FK is NULL (same resolve as
                                POST; a miss leaves NULL).
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
                                DELETE /:id (2026-09-08): admin-only, unscoped, same authority as
                                PATCH /:id/lock. 403 when locked ("cannot be deleted", not the
                                write-path "can no longer be edited" wording). logActivity
                                'delete_grade'. grade_components cascade via
                                fk_grade_components_grade. Nino's five seeded rows are not a
                                write target — tests use a throwaway student + shell.
  routes/gradingModes.js       GET /api/grading-modes (2026-09-08). Separate router so the
                                path is not eaten by GET /api/grades/:id. Any authenticated
                                role. grade_level required 1–6; school_year optional,
                                defaults to system_settings.academic_year (500 if that
                                setting is missing — same as the report card). Missing
                                grading_mode_configs row is 409 with the write-preflight
                                wording copied exactly, not 404 and not an empty success.
                                Not a system_settings key. Wrapper grading_mode is an
                                OBJECT { grade_level, school_year, mode } — the report card
                                uses the same key as a STRING; do not flatten. Third copy
                                of the YYYY-YYYY check (settings + grades); extract on a
                                fourth place, not here.
  routes/attendance.js         record/bulk/correct/list/summary — per DAY (Stage B1), not per subject.
                                No subject_id anywhere in this file. Scoped by section adviser
                                (sections.adviser_id via students.section_id), not teacher_assignments —
                                subject teachers don't record attendance under this model.
                                teacherIsAdviserOfSection() replaces the old teacherHasAssignment().
                                POST /bulk is the primary path: { section_id, date, entries }
  routes/content.js            announcements/memos/events — 3 routers, one file.
                                Nine returning SELECTs (3 list + 3 POST + 3 PUT)
                                INNER JOIN users for posted_by_name alongside the
                                bare posted_by id. PUT/DELETE load-existing stay
                                SELECT *. No GET /:id.
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
  routes/messages.js           canMessage() boundary on send, participant-scoped reads, emits on send;
                                GET /contacts LEFT JOINs students for student_name +
                                student_grade_level + student_section (child's class;
                                null on teacher/admin rows). Conversations and
                                GET /with/:userId still have no class. Teacher →
                                Messages thread is the one client reading the class
                                columns (2026-09-13)
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
  utils/dateFormat.js          isValidDateFormat() + todayLocalDateString() — extracted
                                from 3 duplicated copies (attendance/content/contributions;
                                contributions removed 2026-09-13); used by attendance,
                                content, excuses, grades, gradingModes
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
  scripts/test-student-flows.js HTTP tests — scoping, validation, lifecycle.
                                Duplicate LRN still posts fictional Mabini
                                (409 must fire before section resolve). Admin
                                "any section" is Masigasig, not Rizal. In-scope
                                Malikhain create asserts non-null section_id.
                                43/43.
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
  scripts/test-grading-modes-flows.js HTTP tests — GET /api/grading-modes. Read-only
                                against seeded configs (Grade 1 descriptive, Grades 5/6
                                numerical). Missing-config 409 asserted against
                                2027-2028, which the seed has no rows for — does not
                                mutate grading_mode_configs. 13/13, confirmed twice.
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
                                requireFixture() (2026-09-13): counts like assert(), then
                                STOPS the run with "STOPPED — <label> — got <status>:
                                <message>" and the partial tally; finally still cleans
                                up. Used only where later work depends on a row
                                existing (10 sites). Value checks (pre-patch 883/893/906/910
                                "Fixture:" asserts on computed percentages) stay plain
                                assert() — a wrong number is a finding, not a stop.
                                Local to this file; the other 16 scripts are an open
                                audit (KNOWN ISSUES). GA fixture section is Masikap.
  scripts/test-attendance-flows.js HTTP tests — per-day model (Stage B1): adviser scoping via
                                sections.adviser_id, bulk section_id validation, all-or-nothing
  scripts/test-content-flows.js HTTP tests — audience scoping, named 403 reasons, author-or-admin.
                                posted_by + posted_by_name on list/POST/PUT, scoped
                                to rows the run created. 62/62.
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
  schema.sql                   20 tables (contributions + contribution_records dropped
                                2026-09-13 with Feature 7). users.status ENUM now includes 'inactive'.
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
  src/auth/AuthContext.jsx     login/logout/refresh/user/loading — see note below
  src/auth/ProtectedRoute.jsx  role-gated route wrapper
  src/pages/Login.jsx          Login ID + password, no role dropdown
  src/pages/dashboards/        All three derive "Open now" from navForRole
  src/layout/Shell.jsx         sidebar, header, logout
```


## CURRENT STATE → sections table

> Originally under CLAUDE.md → CURRENT STATE. Lines below are verbatim as of 2026-09-18.

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

**`POST /api/students` writes `section_id` on insert (2026-09-10)** — same
shape as `POST /assignments`: resolve `sections` by name + grade_level +
`system_settings.academic_year`, store the id. Duplicate-LRN `409` runs
before that resolve (the suite posts Marwin's LRN with fictional `Mabini`;
resolving first would turn that `409` into a `400`). Missing year is `409`
(same wording family as assignments). Unmatched section is `400` naming it.
**Do not insert with NULL `section_id`.** This is not a fifth reader for
scoping and it is not a VARCHAR→FK cutover — attendance and the three
teacher READ scopes still read it; this write exists so those readers stay
honest for a newly enrolled student. `PUT /api/students/:id` writes
`section_id` only when the stored FK is NULL (same resolve as POST). A
class change is `400` — refused, not applied. Never overwrites a
non-null FK.

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


## CURRENT STATE → Class Board

> Originally under CLAUDE.md → CURRENT STATE. Lines below are verbatim as of 2026-09-18.

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

**"Post to class" FROM MESSAGES OPENS THIS FORM. Built 2026-09-13. Do not
build a second composer.** The thread (`MessageThreadPage`) navigates to
Announcements with `location.state.compose = { content, target? }` —
`content` is the unsent draft (never the last incoming message), and
consume-once `replace` stops refresh reopening the form. **The class is
named and preselected on a parent thread (2026-09-13, second half).** The
thread fetches `GET /messages/contacts` once, in its own effect keyed on
`otherId` — **not inside `load()`**, which re-runs on every socket
message for the thread. A parent row with `student_name` and a class
gives **Announce to Grade 6 - Malikhain** and `target: '6|Malikhain'`
(keyOf format). Every other case is **Announce to a class** with no
target: contacts not loaded, contacts failed, a teacher/admin thread
(class null), or **no row at all** — a deactivated parent, or scope
changed with history still readable. Do not preselect a class for a
parent you can no longer reach. **The client preselects; it does not
authorize** — Announcements re-validates `target` against its own list
(unknown target → blank picker + stale notice, never another section),
and the server decides on POST. Trust is by construction: contacts'
parent rows and `useTeacherTargets` derive from the same
`teacher_assignments` grade+section and `sections.adviser_id`, and
`PUT /students` refuses the class change that would split them. The
hint is **visible text under the button row**, not only a `title` —
"This conversation will not" is the sentence that stops a teacher
believing they replied to the parent, and a tooltip does not exist on
touch. If the target list comes back empty on arrival, compose does not
open and the draft is **shown, not discarded** (both causes named;
`useTeacherTargets` cannot tell them apart). `GET /conversations` and
`GET /with/:userId` still carry no class. Reconstructing by matching
`student_name` to `GET /students` is still refused — two students can
share a name.


## CURRENT STATE → React web app

> Originally under CLAUDE.md → CURRENT STATE. Lines below are verbatim as of 2026-09-18.

### React web app — Stage 4 foundation built, primitives frozen

`client/` builds clean (`npm run build`) and lints clean (`oxlint`, two
pre-existing `AuthContext.jsx` warnings aside). The auth slice still holds;
on top of it the Stage 4 foundation now exists: role-aware `Shell` with
nested layout routes, seven shared UI primitives, and a dev-only component
gallery at `/dev/ui`. **Teacher and Parent feature pages now exist** —
Teacher: Attendance, Attendance records, Students (+ detail), Excuse Letters, Announcements,
Memos, Events, Messages (+ thread; Announce to a class 2026-09-13), Grades (view + encode),
Settings (password + contact; identity locked).
Parent: Grades (report card + term breakdown modal), Excuse Letters (submit + edit while Pending), Announcements,
Memos, Events, Messages (+ thread),
Attendance (counts + day list + "Present on recorded days", 2026-09-13), Settings (password + contact;
identity locked). **Admin → Users is the first
admin feature page; Admin → Students (+ detail), Settings, Attendance, Announcements (with memos), Grades and Backup & Restore followed (2026-09-14) — Stage 4 complete.** See STAGE 4 FRONTEND CONVENTIONS below
for what every one of them inherits. (This line used to read "no feature page
has been built yet" and stayed that way through five dispatches; corrected
2026-09-07.)

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
  components/             DataTable, Modal, FormField, PasswordField, StatusBadge,
                          EmptyState, ErrorAlert, LoadingSpinner
  pages/dev/UiGallery.jsx every primitive in every state — DEV builds only
  pages/teacher/          **11 nav items** — Attendance, Attendance records
                          (2026-09-12, add not flip), Students (+ detail, enroll wizard + create parent 2026-09-10, Edit 2026-09-12), Excuse Letters, Announcements,
                          Memos, Events, Messages (+ thread; Announce to a class 2026-09-13), Grades (view +
                          encode, one page),
                          Settings (2026-09-10 — copy of Parent Settings; locked
                          identity + contact + password; password confirm Modal;
                          nav was add, not flip)
  pages/parent/           8 pages (Settings added 2026-09-09; Contributions
                          removed 2026-09-13). Content
                          (Announcements/Memos/Events) and Grades stay
                          read-only. Parent content modals render
                          posted_by_name (2026-09-12). Teacher → Memos
                          renders it as a column (2026-09-12);
                          Announcements and Events deliberately do not.
                          Grades term breakdown modal 2026-09-11.
                          Excuse Letters submits and edits while
                          Pending (no confirmation — PUT while Pending is the
                          correction; no DELETE/withdraw). Messages copies
                          Teacher's fetch: table = GET /conversations,
                          contacts = New-message picker only, no merge.
                          Attendance
                          is read-only counts + day list + "Present on
                          recorded days" = (Present + Late) / total, one
                          decimal (2026-09-13; not Class Days, not the SF9
                          rate); Month vs All; same from/to on summary and
                          student list. Settings is password + contact only
                          — child name, LRN/login_id, grade, section, guardian
                          name, and email are locked. Password confirm Modal,
                          per-field show/hide, grey until Confirm (matched
                          Teacher 2026-09-10). Contact stays no-confirm.
                          Never GET /api/settings (school key-value) or
                          PUT /api/users/:id (admin).
                          Grades and Attendance
                          skip their request when `user.student_id` is null;
                          Excuse Letters skips POST then (an unlinked POST is
                          a 500, flagged not fixed) and still GETs /mine.
                          Settings still allows password + contact when
                          unlinked. ParentDashboard is derived from nav — no edit.
  pages/admin/            Users (2026-09-09) — first admin feature page.
                          Pending queue from GET /users/parents/pending;
                          directory from GET /users. Never POST /users/parents
                          (teacher-only, 403 Access denied.). No :id route
                          (§5c). Approve/reject confirm and name the decision
                          (§5e); deactivate does not. AdminDashboard derives
                          from nav like the other two.
                          Students + detail (2026-09-14) — Figure 5 1.23.
                          Unscoped: no GET /assignments, no useTeacherTargets.
                          List sends status=all by default (Active/Inactive
                          options); grade select; section select from
                          GET /sections, disabled until a grade is picked
                          (server matches section by name only); search is
                          name or exact LRN. Deactivate/Activate on the list
                          row, no confirm (§5e — same endpoint reverses it);
                          after PATCH the list reloads — load() is the only
                          writer, and a replaced row would contradict the
                          Status filter. Detail: Edit (six fields, LRN/grade/
                          section locked, Teacher copy word for word), no
                          status control, no Create parent (POST
                          /users/parents is teacher-only), 404 = "Student not
                          found". Deactivate copy claims only what the server
                          enforces: hidden from teacher lists, no new
                          attendance (attendance.js), no new grade record
                          (grades.js POST /). Not claimed: parent loses access
                          (auth checks users.status), grades frozen (components
                          on existing rows still write).
                          Settings (2026-09-14) — Figure 5 1.25. SCHOOL
                          settings, not account settings: header "School
                          settings" plus a first line saying so. Two sections,
                          two saves (an address typo fix can never change the
                          term), both PATCH /settings with only changed keys;
                          load() re-reads after save — the PATCH response is
                          not rendered (unfiltered, see KNOWN ISSUES). School
                          year LOCKED ON THIS PAGE ONLY — the API still
                          accepts it; see KNOWN ISSUES for why it is locked.
                          current_term only sets which term Teacher → Grades
                          opens on (GradesPage loadStudents); teachers can pick
                          another and no server route reads it. Nothing in the
                          client displays school_name, school_address or
                          logo_url — saving them changes no other screen, and
                          that is expected. Logo URL is text; no upload exists.
                          No confirm (§5e).
                          Attendance (2026-09-14) — Figure 5 1.15. VIEW ONLY:
                          no encode, no correction, no PUT /attendance/:id
                          (the admin write paths exist in the API and are not
                          surfaced). Grade-then-section pair copied from
                          Students (server matches section by name only);
                          sections flagged "(no adviser)" in the picker; From/
                          To (never `date`); status. NOTHING FETCHED until a
                          grade or a date range is applied — GET /attendance
                          has no limit. Columns: date, student (links to
                          /admin/students/:student_id), class, status. NO
                          RATE — a percentage across students and dates means
                          nothing; a count line instead ("N records · Present
                          · Late · Absent · Excused"). Five §5f branches incl.
                          "Grade X - Name has no adviser". The teacher page's
                          "open Attendance and pick that date" line is NOT
                          carried over (dead link for admin); this page says
                          the adviser corrects a mark by re-saving that date.
                          Announcements (2026-09-14) — Figure 5 1.18, WITH
                          MEMOS on the same route (Darryl, 2026-09-14; see
                          the Memos decision under the Figure 5 scope
                          decision). Header "Announcements & memos"; two
                          stacked sections, not tabs. Announcement audience:
                          Everyone at the school / One whole grade / One
                          class — body always sends BOTH target_grade and
                          target_section (null when absent), because PUT
                          keeps an omitted key's old value. Class comes from
                          GET /sections (the server does not check an admin's
                          target_section). Each option's hint says who reads
                          it (GET /announcements parent/teacher branches);
                          a class with student_count 0 warns that no parent
                          will see it. EDIT ONLY YOUR OWN, DELETE ANY: an
                          admin PUT keeps posted_by as the teacher, so editing
                          a teacher's post would put new words and audience
                          under their name. Delete confirms and names title,
                          poster and audience, ending "and <poster> is not
                          told" — nothing notifies anyone; that clause is
                          deliberate. Posted by column on both lists. Memo
                          form: title + message, "every memo goes to every
                          teacher and every parent". Filter grade→class; the
                          empty copy says school-wide posts are not in it.
                          Each list reloads after a write (load() only
                          writer).
                          Grades (2026-09-14) — Figure 5 1.9. VIEW + LOCK,
                          NOT DELETE (Darryl, 2026-09-14; the delete omission
                          is a KNOWN ISSUES row so it is not "fixed"). Pick
                          grade → section → student (status=all), then the
                          Parent → Grades report card (GET /grades/student/:id,
                          six-key unwrap); GET / is not called (no class
                          filter, no limit). A term cell with a grade_id opens
                          a modal with Lock/Unlock — no buttons in the grid (a
                          stray click would lock a grade under a teacher's
                          hands); no GET /:id, no breakdown. Copy says exactly
                          what preflightGradeWrite + DELETE enforce: no change
                          to scores or letter by teachers OR admins, no
                          delete, until unlocked; still visible to parents and
                          teachers. Never "frozen"/"final". A term with no
                          grade row has no id — not a button. All-Pending card
                          gets a line above it, not an empty state. No
                          verdicts (no remarks, no band colour, no rank).
                          TermValue (format/TermValue.jsx) extracted here as
                          the third copy — Parent and Teacher → Grades now
                          import it; their SSR output is byte-identical.
                          Backup & Restore (2026-09-14) — Figure 5 1.27/1.28,
                          Stage 4's last page. List (Kind from the filename
                          prefix: Manual backup / Safety copy before a
                          restore), orphaned .sql files shown read-only (no
                          row id → no action; no adopt affordance). Create
                          disables every action while any request runs.
                          Download: raw + responseType 'blob', filename from
                          the row (CORS does not expose Content-Disposition);
                          a blob error is read back to its JSON message.
                          Delete manual backups only, confirm names file +
                          date; SAFETY COPIES HAVE NO DELETE. Restore: modal
                          in the server's own order (safety copy first; what
                          is replaced incl. accounts and passwords; partial
                          restore not undone automatically; every session
                          ends "with the password that was valid when this
                          backup was taken"), password + typed file name, all
                          server messages verbatim. A wrong step-up password
                          is 403, a missing one 400 (2026-09-15; it was 401 on
                          a live session and needed a per-call opt-out, now
                          removed). On success the page makes NO further
                          request (any would 401 and the interceptor would
                          jump away); the result panel shows the message, the
                          safety copy's file name and the lost activity_logs
                          count, and "Log in again" logs out deliberately.
```

`/dev/ui` is registered behind `import.meta.env.DEV` and is **verified
absent from the production bundle** (grepped for strings unique to it after
a real `npm run build`) — checked, not asserted.

---


## STAGE 4 FRONTEND CONVENTIONS → MEASURED BUILD TIME

> Originally under CLAUDE.md → STAGE 4 FRONTEND CONVENTIONS. Lines below are verbatim as of 2026-09-18.

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

**Ninth data point — Teacher → Contributions, 2026-09-08: ~40 minutes**
(10:58 PLAN APPROVED → 11:38 verified). **Almost all agent work; no
browser-review wait in this window.** Split recorded because Parent → Grades
made idle a real cost: here idle is ~0. Same four caveats; still not a rate.
Last Teacher page.

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
| **Teacher** Contributions | **~40m** (~40m agent, ~0m idle) | **1 page**, last Teacher. List + compose + roster modal, assignments-only (not `useTeacherTargets`), dashboard derived from nav, consequence 5 + removal list recorded. Live HTTP on three accounts + SSR |

**Tenth data point — Parent → Excuse Letters, Messages, Contributions, 2026-09-09:
~35 minutes** (12:01 PLAN APPROVED → ~12:36 verified). **~23m agent, ~12m idle
waiting for MYSQL80** (service was Stopped; UAC to start it). Same four
caveats; still not a rate. Compare to the sixth point onward (5h inside the
clock), not to Teacher Messages' 4m4s. Three page files, not one component;
Messages copies the Teacher list fetch (conversations for the table, contacts
for the picker — no merge). `ParentDashboard` needed no edit (derived from
nav). `Shell.jsx` untouched — the Messages `built` flag closes the 5g inverse.

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
| **Teacher** Contributions | **~40m** (~40m agent, ~0m idle) | **1 page**, last Teacher. List + compose + roster modal |
| **Parent** Excuse Letters / Messages / Contributions | **~35m** (~23m agent, ~12m idle MySQL) | **3 pages** (4 files: excuse + messages list + thread + contributions). Submit/edit, Teacher-shaped fetch, my-records only. 5g inverse closed by the built flag |

**Eleventh data point — Parent → Attendance, 2026-09-09: ~75 minutes**
(~50m agent, ~25m idle sandbox/oxlint). Same four caveats; compare to the
sixth point onward. Unblocked by never rendering a rate.

**Twelfth data point — Admin → Users, 2026-09-09: ~50 minutes.** Almost
all agent work; browser 5h inside the clock (typed a full word in Search
and in Create teacher Login ID / Name). Same four caveats; still not a
rate. First admin page. `AdminDashboard` derived from nav (the Stage 2
placeholder would have been its first impression). Two lists, two
payloads; never `POST /users/parents`.

**Thirteenth data point — Parent → Settings, 2026-09-09.** New
`PUT /api/auth/contact` plus the page. Identity locked; password and
contact only. `AuthContext.refresh()` added. SSR + negative control +
`test:auth` 35/35 inside the clock. No Cursor browser — type a full word
in contact and in the password fields as `13567454` to finish 5h. Same
four caveats; compare to the sixth point onward.

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
| **Teacher** Contributions | **~40m** (~40m agent, ~0m idle) | **1 page**, last Teacher. List + compose + roster modal |
| **Parent** Excuse Letters / Messages / Contributions | **~35m** (~23m agent, ~12m idle MySQL) | **3 pages** |
| **Parent** Attendance | **~75m** (~50m agent, ~25m idle sandbox) | **1 page.** Raw counts, no rate. Month vs All |
| **Admin** Users | **~50m** | **1 page**, first admin. Pending queue + directory + create/edit/status. Dashboard derived from nav |
| **Parent** Settings | **this dispatch** | **1 page** + `PUT /api/auth/contact`. Identity locked; password + contact. `refresh()` on AuthContext |
| **Teacher** Settings | **~20m** (~18m agent, ~2m idle oxlint) | **1 page**, copy of Parent Settings. Nav add, not flip. Stay logged in after password |

**Fourteenth data point — Teacher → Settings, 2026-09-10: ~20 minutes**
(~18m agent, ~2m idle oxlint). Same four caveats; compare to the sixth
point onward. Copy of Parent Settings, not a new page. Present-tense
"Teacher web role is complete" was stale from Contributions until this
page; dated Contributions CHANGELOG stays. `TeacherDashboard.jsx`'s
"last Teacher page" comment is the same stale claim and is out of
whitelist — left. After this lands every teacher nav entry is built, so
the remaining-pages sentence drops on its own.

**Fifteenth data point — Teacher enroll + pending parent, 2026-09-10.**
Same four caveats; compare to the sixth point onward. Not a new page and
not a nav flip — a hole on Teacher → Students. Server `section_id` on
`POST /students`, PasswordField extract at the third copy, enroll wizard
+ detail create-parent. Verification inside the clock: `test:students`
43/43 twice, live HTTP 21/21, SSR + negative control, `npm run build`.

| Dispatch | Time | What it involved |
|---|---|---|
| **Teacher** Settings | **~20m** | **1 page**, copy of Parent Settings. Nav add, not flip |
| **Teacher** Students enroll | **this dispatch** | Hole on an existing page. `section_id` on POST, PasswordField extract, wizard + detail create-parent |

**Do not replace the void estimate with a projection derived from these.**
The old estimate is void, these dispatches have differed in kind more than
in size, and a range would need several more that differ less from each
other than these do.

---


## BLOCKED / RESOLVED → Grades module

> Originally under CLAUDE.md → BLOCKED / RESOLVED. Lines below are verbatim as of 2026-09-18.

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


## NOW POSSIBLE → client consumers, and Parent grade breakdown

> Originally under CLAUDE.md → NOW POSSIBLE. Lines below are verbatim as of 2026-09-18.

## NOW POSSIBLE — client consumers (API exists; pages have not switched)

The next **client** dispatch should pick these up rather than inheriting a
workaround whose reason has expired. Landing Teacher → Contributions did
**not** switch any of them.

- **Teacher `posted_by_name` — DECISION, not leftover (2026-09-12).** Teacher → Memos renders it as a sortable DataTable column (header `Posted by`, cell is the name alone). Sortable needs no extra null handling: `posted_by_name` is never null (INNER JOIN on `posted_by` NOT NULL + `ON DELETE RESTRICT`), so DataTable's nulls-last path has no case here. Teacher → Announcements and Events deliberately do not: Actions already says mine/theirs (`row.posted_by === user.id`), and those pages already carry four columns. Parent content modals already render it (2026-09-12). The payload still carries the field on all three. Do not close this bullet as though all three teacher pages shipped, and do not open a T2 to "finish" Announcements and Events. Do not read the closed KNOWN ISSUES row as "every page shows who posted it."
- **Teacher → Grades encode-scope and mode — closed 2026-09-12.** `GET /assignments` predicts encode scope (grade+section+subject) before any click. `GET /grading-modes` supplies `mode` from `grade_level`. The report card remains the subject list and term grid. The POST 403 probe, session `(not yours)`, and existing-row `ensureShell` hole are gone. `ensureShell` still creates the shell.
- **`useTeacherTargets` — closed 2026-09-13.** Assigned leg is `GET /assignments` (`unwrap: 'assignments'`), reduced to distinct `{ grade_level, name }`. Advisory `GET /sections` stays. The union is still assigned OR adviser — not a switch to assignments-only. Empty and all-inactive assigned sections now appear (old `GET /students` was active-only). Announcements compose hint names the empty-audience case as a **general** sentence — the hook returns no enrollment count. Events cannot show that proof (grade-wide; TCH-001 already has Grade 6 via Malikhain). Do not reuse this hook for Grades or Contributions.
- **Teacher → Contributions compose built from `GET /students` — closed 2026-09-13 by removal.** The page is gone with Feature 7 (SCOPE DECISION). This was the last expired 2026-09-08 workaround.
- **Teacher → Messages "Announce to" names the section — closed 2026-09-13.** The thread reads `student_grade_level` / `student_section` from `GET /contacts` and Announcements opens with that section selected. All three recorded constraints held, plus a fourth: no contacts row at all (deactivated parent, or scope changed with history readable) falls back to unnamed. See the Class Board section. Do not write that NOW POSSIBLE is empty — Contributions compose is still open.

**Every item above is closed except `posted_by_name`, and that one is a
recorded DECISION** (Announcements and Events deliberately do not render the
name), not outstanding work. This section is not a backlog of one; do not
"finish" it.

**Not on this list:** the contacts empty-cause. `GET /assignments` does not
tell "no parents exist" from "all parents pending." That stays in KNOWN
ISSUES.

### Parent grade breakdown — BUILT 2026-09-11

Manuscript Figure 17 called this "Student Record." It is **Grades**, not
Feature 3. There is no Parent → Students nav. One account = one child.

**Answered 2026-09-11 (team conversation, not a school visit or a
written reply).** Parents should see WW / PT / Exam raw scores under
a term so they can tell *where* a mark came from, not only the SF9
number. That closes the 2026-09-07 deferral. **The modal is
approved** — do not remove it as an unapproved feature.
`GET /api/grades/:id` stays. Not a documented policy letter; do not
cite it in the manuscript as one. Do not re-ask it.

`GET /:id` is `parent(own)`, `404` out of scope. Tap a term with
`grade_id` → Modal. Unwrap `['grade', 'grade_components', 'descriptor']`.
`GET /` is still not called (no subject overlay). No new endpoint. No
new nav (convention 6 N/A).

| Label | Source |
|---|---|
| Written Works | `grade_components` `type === 'WW'` — `label`, `score`/`max_score`, `date_recorded` |
| Performance Tasks | same, `type === 'PT'` |
| Examinations | `grade.ex_st1`/`ex_st1_max`, `ex_st2`/`ex_st2_max`, `ex_te`/`ex_te_max` |

**Term grade stays. Initial Grade is not on the parent card and is not
in the modal** — putting it there would introduce a number the parent
has never seen, and it is the number that raises "why isn't this 90?"
(transmutation). Weights omitted for the same reason.

Numerical empty is **three per-section copies**, not one: "No written
works recorded yet" / performance tasks / examination scores. A single
"nothing recorded" becomes a lie the moment any one of the three exists
(§5f).

**Grade 1:** letter is the term grade. Still `GET /:id` (hedge — if
informational scores ever land, they surface). **No empty WW/PT/Exam
sections** — the write path `400`s numerical encodes on descriptive
mode, so empty tables would say "scores missing" about something that
cannot have scores (§5f / §5i). **The judgment sentence is gone
(2026-09-12).** It stated an unconfirmed assumption as fact. Silence
is the honest state until the school answers how the letter is
produced; do not fill the gap with format restatement. The comment
next to the letter records the removal so a future session does not
re-add it (including a hedge or tooltip).

§5b: clear `detail` before every `GET /:id`. Header comes from the card
tap (`selected`), so a failed open cannot show another term's scores
under this subject. Pending / null cell: not a button, no request.

**Do not show:** rank, class average, "Passing", "Need attention",
`descriptor.remarks` (`Passed`), IG, weights.

---


## GET /api/messages/contacts → BUILT 2026-09-07

> Originally under CLAUDE.md → GET /api/messages/contacts. Lines below are verbatim as of 2026-09-18.

## GET /api/messages/contacts — BUILT 2026-09-07

Was an open question (no way for a parent to discover their child's teachers'
user ids to start a first conversation), then a recorded design, and is now
**built** — `routes/messages.js`, wrapper key `contacts` (array), the sixth
endpoint in that module. It was the only designed-but-unbuilt endpoint in the
system; the endpoint audit run the same day confirmed nothing else was in that
state.

**Response row:** `{ id, name, role, subject | null, student_name | null,
student_grade_level | null, student_section | null,
last_message | null, last_message_at | null, unread_count }`.
`student_*` fields are the linked child's, not the contact user's — null
on teacher/admin rows (LEFT JOIN). Teacher → Messages thread reads the
class columns to name and preselect the class (2026-09-13). Ordering puts existing conversations first (most recent), then
everyone else alphabetically, so the page renders a combined
contacts-and-conversations view from one call.

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


## BUILD ORDER → Stage 3 and Stage 4

> Originally under CLAUDE.md → BUILD ORDER. Lines below are verbatim as of 2026-09-18.

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
- [x] ~~Contributions API — create, record payment, view status~~ — **REMOVED 2026-09-13** (SCOPE DECISION)
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
      feature page. Encode only — history is a separate page (see the
      next checkbox). Adviser-scoped via `sections.adviser_id`; roster
      fetched with `?status=active` so the bulk endpoint's inactive-student
      `400` is unreachable rather than handled; pre-fill plus in-place
      update via `ON DUPLICATE KEY`; unset rows omitted rather than
      defaulted to Present. See MEASURED BUILD TIME above — this is the
      page the void estimate was to be re-measured from, and that
      measurement needs reading with its caveats before being used for
      anything.
- [x] **Teacher → Attendance records — DONE 2026-09-12.** Separate page,
      sibling route `/teacher/attendance-records`, not a tab on encode.
      Nav is **add, not flip** — no unbuilt history row existed; item
      born `built: true` with the route (convention 6). Read only.
      `GET /attendance` with `grade_level` + `section.name` + optional
      `from`/`to`. Never send `date`. Section list copies encode
      (`GET /sections` filtered on `adviser_id`). Do not use
      `GET /assignments` or `useTeacherTargets`. Correction path is
      the encode screen (`POST /bulk` ON DUPLICATE KEY). Encode-page
      comment left untouched.
- [x] **Teacher → Students — DONE 2026-09-07.** List plus a detail route
      (`/teacher/students/:id`). Originally read only. **Enroll + pending
      parent 2026-09-10 — same checkbox, not a new one, no new nav item
      (convention 6 does not apply).** Wizard on the list: `POST /students`
      then optional `POST /users/parents` (`unwrap: ['user', 'message']`).
      Class picker is `GET /assignments`, not `useTeacherTargets`. TCH-002
      (`[]`) gets muted copy that advising is not enough, not an Enroll
      button. After enroll `201` there is no back-to-step-1. Create parent
      is always shown on detail; LRN locked from `student.lrn`; `409` is
      "already has a parent." **Edit 2026-09-12 — same checkbox, no new
      nav (convention 6 N/A).** Shown only when the student's
      `grade_level` + `section` (never `section_id`) appears in
      `GET /assignments`. No PUT probe. Adviser-only: muted copy, not a
      dead-end button. Two Modals (create parent stays two-phase). PUT
      body omits class. `POST /users/parents` still has no assignment
      check. `PUT /api/students/:id` refuses a class change (`400`) and
      writes `section_id` only when NULL (closed 2026-09-12).
      Present-tense Teacher web role complete as nav stays.
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
      middleware every time; the page says who posts them instead.
      **`posted_by_name` column on Memos only — DONE 2026-09-12.**
      Announcements and Events deliberately do not (Actions already says
      mine/theirs; four columns already). Events
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
- [x] **Teacher → Messages "Announce to a class" — DONE 2026-09-13.**
      Thread control, not the list. Opens the existing Announcements
      compose with the unsent draft via `location.state`. **Names and
      preselects the class on a parent thread (same day, second
      dispatch)** — the thread reads class from `GET /contacts` in its
      own effect (not `load()`); Announcements re-validates. Teacher/
      admin thread, no contacts row, or contacts failing → unnamed "Announce
      to a class", no target. Hint is visible text, not only a tooltip.
      No new endpoint, no second composer, no nav change. Never copies
      the incoming message.
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
      **posted_by_name in the modal — DONE 2026-09-12.** Same three pages, no
      new nav (convention 6 N/A). Copy is `Posted by {name}` as its own
      segment — Events' first span is `event_date`, so "Posted {date} by
      {name}" cannot be consistent across the three. No `"Unknown"` fallback
      (a broken JOIN must show itself). Teacher → Memos renders it as a
      column (2026-09-12); Announcements and Events deliberately do not
      — DECISION, not leftover. See NOW POSSIBLE.
- [x] **Parent → Grades — DONE 2026-09-07.** The report card, and **the first
      feature page to consume `GradeValue`** (convention 3 existed for four
      dispatches with no caller). One request to
      `GET /api/grades/student/:studentId`, six-key unwrap, no filters, no
      writes. **Both other grades GETs are deliberately not called:** `GET /`
      returns bare grade rows with no subject-coverage overlay, so a subject
      with zero grade rows would silently vanish — the exact confusion the
      report-card endpoint was built to remove; `GET /:id` exists and is
      correctly parent-scoped but would add the WW/PT component breakdown.
      **That deferral closed 2026-09-11 (team, not a school visit) and the
      modal landed the same day** — see NOW POSSIBLE → Parent grade
      breakdown (BUILT). Same page, no new nav. **This page SKIPS the request when
      `student_id` is null**, the opposite of the parent content pages, and the
      difference is structural rather than drift: those endpoints take no
      student id, so the server derives the child and skipping would hide real
      posts behind a stale `AuthContext`; here the id goes IN the path and
      `parseId(null)` answers `400 "Invalid student id."`, a developer-facing
      string with no request that could ever succeed. **Convention 5c is
      enforced by SOURCING, not by discipline** — the header comes from the
      report payload's own `student` object, which is exactly
      `{ id, first_name, last_name, grade_level, section }` with no `lrn` in it
      to leak, while `/auth/me` (which returns `login_id`, not `lrn`) is read
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
      — the teacher does not choose a mode. **Encode-scope + mode switched
      2026-09-12:** `GET /assignments` (own rows, no `teacher_id`) marks
      unassigned subjects `(not yours)` before any click; `GET /grading-modes`
      supplies `mode` from `grade_level` (object wrapper; do not flatten; no
      `?? 'numerical'`). Report card still supplies the subject list and
      term grid. **Do not reuse `useTeacherTargets`** — assigned-OR-adviser;
      this page is assignments-only. **No client-side IG preview.**
      **`TermCell` copied locally.** **No lock control.** **§5e: no
      confirmation** — `DELETE /api/grades/:id` is admin-only. `ensureShell`
      still creates the shell; it no longer discovers scope. **Alert XOR.**
      **No unsaved-changes warning.** Dated 2026-09-07 verification (throwaway
      `student_id=14`/`15`) stays; that dispatch predicted scope by POST 403.
- [x] **Teacher → Contributions — DONE 2026-09-08, REMOVED 2026-09-13 with Feature 7 (SCOPE DECISION).** Was the last Teacher Stage 4 page:
      list, compose, edit, delete, payment roster in a Modal (not a `:id`
      route). Seven of eight endpoints are teacher-reachable (`GET /my-records`
      is parent only). Scope is grade-level `teacher_assignments` only — the
      adviser is not included (consequence 5; do not widen; school question).
      Amount override skipped. Roster review: Section dropped, one action
      control (in-flight button stays visible and disabled). Modal `lg` is
      the ceiling — first Stage 4 content to hit it; a second page is the
      trigger to widen the scale. **Teacher web role is complete.** Remaining
      Stage 4 work after Parent → Attendance is admin pages.
- [x] **Parent → Excuse Letters, Messages, Contributions — DONE 2026-09-09.**
      Three page files, not one component. Excuse Letters: submit + edit
      while Pending, no confirmation (§5e — PUT is the correction; no
      DELETE/withdraw), skip POST when unlinked (API is 409 as of
      2026-09-11; the page still hides Submit). Messages: copies Teacher's fetch — table is
      `GET /conversations`, contacts are the New-message picker only, no
      merge. Thread is a copy with `/parent/messages` back link; extract
      at Admin. Flipping `built: true` closes the 5g LiveStatus inverse
      with no `Shell.jsx` change. Contributions (REMOVED 2026-09-13 with Feature 7): `GET /my-records` only,
      skip fetch when unlinked, no Pay button. ParentDashboard derived
      from nav, no edit. Attendance was still blocked on the rate formula
      at this landing — unblocked the same day by the next checkbox.
- [x] **Parent → Attendance — DONE 2026-09-09.** Unblocked then by
      showing counts only. Route `/parent/attendance`, `blocked` dropped,
      `built: true` with the route (convention 6). Two calls, same
      `from`/`to`: `GET /attendance/summary/:studentId` and
      `GET /attendance/student/:studentId`. Skip both when unlinked.
      Month vs All (Events pattern). Four counts + recorded days;
      `StatusBadge` on day rows. **"Present on recorded days" added
      2026-09-13** once the school answered (Late = present, Excused =
      absent) — no new request. Teacher history is Attendance records
      (2026-09-12), not this page.
- [x] **Admin → Users — DONE 2026-09-09.** First admin feature page.
      Route `/admin/users`, `built: false → true` with the route.
      Pending queue + directory + create teacher + edit +
      activate/deactivate. Never `POST /users/parents`. No `:id` route.
      `AdminDashboard` derives from nav. Remaining admin screens below.
- [x] **Parent → Settings — DONE 2026-09-09.** Route `/parent/settings`,
      `built: true` with the route (convention 6). Locked child name, LRN
      (login_id), grade/section, guardian name, email. Writes:
      `PUT /api/auth/change-password` and `PUT /api/auth/contact` only.
      Never `GET /api/settings` or `PUT /api/users/:id`. Unlinked accounts
      still change password and contact. `AuthContext.refresh()` after
      contact save. Password UX matched Teacher Settings 2026-09-10:
      confirm Modal, per-field show/hide, Change password grey until
      Confirm. Contact stays no-confirm. Locked identity unchanged.
      ParentDashboard needed no edit. **Parent web role is
      complete.** Remaining Stage 4 work is admin screens.
- [x] **Teacher → Settings — DONE 2026-09-10.** Copy of Parent Settings,
      not a new page. Nav is **add, not flip** — teacher nav ended at
      Messages; `{ to: '/teacher/settings', label: 'Settings', icon:
      'fa-gear', built: true }` lands with the route (convention 6).
      Three sections: locked identity (name, Teacher ID = `login_id` —
      this is TCH-001, not an LRN, email) + contact + password. Confirm
      new password kept. Stay logged in after password — Parent does not
      `logout()`; `PUT /auth/change-password` does not invalidate JWTs.
      Never `GET /api/settings` or `PUT /api/users/:id`. Password confirm
      Modal after browser review (contact stays no-confirm). Parent
      Settings password UX matched the same day. No server files.
      `TeacherDashboard` needed no edit — Open now comes from nav, and
      the remaining-pages sentence drops because every non-dashboard
      item is now `built`. **Teacher web role is complete.** Remaining
      Stage 4 work is admin screens. `TeacherDashboard.jsx`'s header
      comment still says this was the last Teacher page — out of
      whitelist, left.
- [x] **Parent → Grades breakdown — DONE 2026-09-11.** Same page, no new
      nav. Tap term with `grade_id` → Modal, `GET /:id`. Grade 1: letter,
      no empty WW/PT/Exam sections (judgment copy removed 2026-09-12).
      IG not shown (not on the card). Parents-see-raw-scores answered
      2026-09-11 in conversation; the modal is approved. Spec: NOW
      POSSIBLE → Parent grade breakdown (BUILT).
- [x] **Admin → Students — DONE 2026-09-14.** Figure 5 1.23. Routes
      `/admin/students` and `/admin/students/:id` (keyed on `students.id`,
      never the LRN — §5c); nav `built: false → true` with the route
      (convention 6). Unscoped. Status defaults to All (`status=all`).
      Deactivate/Activate on the list, no confirm, list reloads after.
      Detail has Edit only. No Enroll, no Create parent. See the
      `pages/admin/` entry in CURRENT STATE.
- [x] **Admin → Settings — DONE 2026-09-14.** Figure 5 1.25. Route
      `/admin/settings`, nav `built: false → true` with the route
      (convention 6). School settings, not account settings. School year
      locked on this page only (the API still accepts it — KNOWN ISSUES);
      current term and school details editable, two saves, PATCH, no
      confirm. See the `pages/admin/` entry in CURRENT STATE.
- [x] **Admin → Attendance — DONE 2026-09-14.** Figure 5 1.15. Route
      `/admin/attendance`, nav `built: false → true` with the route
      (convention 6). View only. No fetch until a grade or date range is
      applied; counts, no rate. See the `pages/admin/` entry in CURRENT
      STATE, and KNOWN ISSUES for the 20 sections with no adviser.
- [x] **Admin → Announcements (with memos) — DONE 2026-09-14.** Figure 5
      1.18 + Feature 4. Route `/admin/announcements`, nav line 58
      `built: false → true` with the route (convention 6). The unbuilt
      "Memos" item (line 59) stays `built: false` — this page covers it.
      Three audience shapes, edit own / delete any, memos compose/edit/
      delete. See the `pages/admin/` entry in CURRENT STATE.
- [x] **Admin → Grades — DONE 2026-09-14.** Figure 5 1.9. Route
      `/admin/grades`, nav line 55 `built: false → true` with the route
      (convention 6). View + lock, NOT delete (KNOWN ISSUES records why).
      Student-first report card; lock in a modal. `TermValue` extracted to
      `client/src/format/TermValue.jsx` (third copy); Parent and Teacher →
      Grades import it. See the `pages/admin/` entry in CURRENT STATE.
- [x] **Admin → Backup & Restore — DONE 2026-09-14.** Figure 5 1.27,
      1.28. Route `/admin/backups`, nav line 63 `built: false → true` with
      the route (convention 6). List + orphaned files (read-only), create,
      download, delete manual backups only, restore with step-up password
      and typed file name. A wrong step-up password is 403 (it was 401,
      with a per-call opt-out removed 2026-09-15). See the `pages/admin/` entry in
      CURRENT STATE and KNOWN ISSUES.

**Stage 4 — CLOSED 2026-09-14.** Every Figure 5 admin process now has a
page. Sections, Excuse Letters, Events and Messages stay `built: false` by
the scope decision (ADMIN SCOPE AUDIT → SCOPE DECISION) — not unfinished
work, not removed. Next in BUILD ORDER is Stage 5 (Expo).

**Backend work interleaved with Stage 4:**

- [x] Assignments + Subjects API — **DONE 2026-09-08.** `GET /api/subjects`,
      `GET`/`POST`/`DELETE /api/assignments`. 41/41.
- [x] `GET /api/grading-modes` — **DONE 2026-09-08.** Item 2. Missing config
      is `409`. Not a settings key. 13/13, confirmed twice. Wrapper
      `grading_mode` is an object; the report card uses the same key as a
      string.
- [x] `DELETE /api/grades/:id` — **DONE 2026-09-08.** Item 3. Admin-only,
      `403` when locked, `404` when missing, `logActivity` `'delete_grade'`.
      `test:grades` 165/165. Nino's five seeded rows untouched.
- [x] `GET /api/messages/contacts` **plus the endpoint audit** — done 2026-09-07.


## END OF EVERY SESSION → the prompt as it read before the split

> Originally under CLAUDE.md → END OF EVERY SESSION. Lines below are verbatim as of 2026-09-18.

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


## ADMIN SCOPE AUDIT → nav vs. DFD, and the SCOPE DECISION

> Originally under CLAUDE.md → ADMIN SCOPE AUDIT. Lines below are verbatim as of 2026-09-18.

## ADMIN SCOPE AUDIT — nav vs. DFD (2026-09-13). A finding, not a decision.

**Why this exists.** Before more admin screens are built, the record needs to
say which admin nav items have a basis in the approved design. **This section
removes nothing and recommends removing nothing.** Keeping or dropping an item
without a basis is a scope decision for the team, and it gets the treatment
Feature 7 got: a consultation, a date, a name (see SCOPE DECISION).

**Four sources, four different answers:**

| Source | Admin items |
|---|---|
| `client/src/layout/nav.js` (lines 51–63) | 13: Dashboard, Users, Students, Sections, Grades, Attendance, Excuse Letters, Announcements, Memos, Events, Messages, Settings, Backup & Restore |
| Manuscript admin dashboard mockup, p. 70 | 5: Dashboard, Manage Users, Manage System Settings, Post Announcement, Backup / Restore Data |
| Figure 5, DFD Level 1 (pp. 30–33) | 11 admin-facing processes: 1.1, 1.3, 1.9, 1.10, 1.12, 1.15, 1.18, 1.23, 1.25, 1.27, 1.28 |
| `docs/SYSTEM_ARCHITECTURE.md` §4 "API Modules (DFD Figure 5)" | 3: Manage User, System Setting, Backup & Restore. It also puts "Enrolled Student List" under Teacher, while Figure 5's 1.23 is admin-facing |

**The p. 70 mockup is an incomplete drawing, not a narrower approved scope.**
All five of its items map to Figure 5 processes (Users → 1.1/1.3, Settings →
1.25, Post Announcement → 1.18, Backup / Restore → 1.27/1.28; Dashboard is
navigation). What it leaves out is Students, Grades and Attendance — three
items that DO have a Figure 5 basis. Do not read "the mockup shows five" as
the answer.

**`docs/SYSTEM_ARCHITECTURE.md` §4 cites Figure 5 in its heading and does not
match it — do not trust that heading.** Three admin modules against Figure 5's
eleven processes, and 1.23 moved to Teacher. A document that cites a source
and then contradicts it is worse than one that cites nothing, because a reader
takes the heading at its word. **Recorded, not corrected here:** correcting it
means deciding what the admin module list should be, which is the team's
decision. The correction belongs to whichever dispatch implements that
decision.

**Which source governs: precedent, not yet a general rule.** The build already
followed Figure 5 over Figures 11–13 on self-registration (MANUSCRIPT section:
"The build followed the DFD"). That is **one recorded decision about the auth
flow**, not an agreed rule that Figure 5 governs every figure. This audit
applies the same principle to admin scope as precedent, which is why Figure 5
is the column items are mapped against. If the team wants "Figure 5 governs
over the screen mockups" as a general rule, that is its own decision, recorded
on its own. When citing, say **Figure 5**, never Figure 4.

**Item-by-item (strict: a plausible connection is not a mapping):**

| Nav item | Built | Figure 5 process | Basis |
|---|---|---|---|
| Dashboard | ✅ | — | navigation, not a process |
| Users | ✅ | 1.1, 1.3 | **yes** |
| Students | ✗ | 1.23 (+ candidate for 1.10/1.12) | **yes** |
| Sections | ✗ | none | **no.** Supports attendance adviser-scoping; not one of the nine features |
| Grades | ✗ | 1.9 (+ candidate for 1.10/1.12) | **yes** (view) |
| Attendance | ✗ | 1.15 | **yes for viewing.** Admin record/correct, which the API allows, has no Figure 5 basis |
| Excuse Letters | ✗ | none (admin absent from 1.16/1.17) | **no.** The API authorizes admin anyway |
| Announcements | ✗ | 1.18 | **yes** |
| Memos | ✗ | 1.18, partial | **partial.** 1.18 names announcements; memos are a separate table and a separate word in Feature 4's name |
| Events | ✗ | none | **no.** Also not named in Feature 4 |
| Messages | ✗ | none (1.22 is Teacher and Parent only) | **no.** `canMessage()` lets admin message anyone |
| Settings | ✗ | 1.25 | **yes.** `system_settings` also holds academic year and current term, operational but about the school |
| Backup & Restore | ✗ | 1.27, 1.28 | **yes** |

**No Figure 5 basis:** Sections, Excuse Letters, Events, Messages.
**Partial:** Memos.

**One finding, three instances — the API already authorizes admin beyond
Figure 5.** Excuse Letters (`routes/excuses.js` list / view / review allow
admin), Messages (`canMessage()` lets admin message and be messaged by
anyone), and admin writes on Attendance (`POST /`, `POST /bulk`, `PUT /:id`
are admin-unscoped). Same shape each time: a handler authorizes admin for
something no Figure 5 process describes. **This is not a defect and not a
bug** — no one has decided whether it should be so, and nothing here asks for
the handlers to change. It is recorded as one pattern because a reader who
meets it one table row at a time will not see it.

**Figure 5 processes with no nav item:** none clearly unrepresented.
**1.28 Show Backup Logs** belongs inside Backup & Restore (`GET /api/backups`
returns the history). **1.10 / 1.12 "Academic Records" are ambiguous between
Students and Grades — both candidates recorded, neither chosen.** The
manuscript already used "Student Record" to mean Grades once (Figure 17), so
picking one would be the quiet assumption this audit exists to surface.

**Against the nine features:** every admin item maps onto one except
**Sections**, which maps onto none. The feature list is role-neutral and
Figure 5 is role-specific, which is why Excuse Letters, Messages, Events and
Memos fit a feature but not an admin process.

**Safe to build now — the items with a Figure 5 basis:** Admin → **Students**
(1.23), **Grades** (1.9, view), **Attendance** (1.15, view), **Announcements**
(1.18), **Settings** (1.25), **Backup & Restore** (1.27, 1.28). Users (1.1,
1.3) is already built. ~~Waiting on a team decision, not blocked by code:
Sections, Excuse Letters, Events, Messages, and Memos (partial).~~ **Decided
2026-09-13 — see the next section.** Sections, Excuse Letters, Events and
Messages stay `built: false` in `nav.js` exactly as they are — do not remove
them in a build dispatch.

### SCOPE DECISION — admin screens follow Figure 5 (Darryl, 2026-09-13)

**Figure 5 is the basis for admin scope. Darryl decided this on 2026-09-13,
after the audit above.** The audit was a finding; this is the decision that
acts on it. **It is Darryl's decision, not a team consultation** — the audit
said the call would go to the team with a consultation, a date and a name,
and that is not what happened. The two are different things and this record
must not blur them. If a team consultation happens later, add it here.

- **Build — six admin screens, each with a Figure 5 process:** Students
  (1.23, built 2026-09-14), Grades (1.9, view + lock, built 2026-09-14),
  Attendance (1.15, view, built 2026-09-14), Announcements (1.18, built
  2026-09-14, with memos),
  Settings (1.25, built 2026-09-14), Backup & Restore
  (1.27, 1.28, built 2026-09-14). Users (1.1, 1.3) was already built.
  **All six are built — Stage 4 is complete.**
- **Do not build:** Sections, Excuse Letters, Events, Messages. They stay
  `built: false` in `nav.js` and appear in no plan. Removing them from the
  nav is a separate decision, not taken here.
- **Memos — DECIDED 2026-09-14 (Darryl): memos live on Admin →
  Announcements, not on their own route.** Reasons: Figure 5 1.18 is one
  process and the only content process it gives the admin; manuscript
  Feature 4 is "Announcements & Memo Dissemination" — one approved feature
  naming both; and `memosRouter` POST/PUT/DELETE are all `authorize('admin')`
  while Teacher → Memos and Parent → Memos are read-only, so this page is the
  ONLY place a memo can ever be written — without it half of Feature 4 has
  no write path and both reader pages stay permanently empty. The admin
  "Memos" nav item (line 59) is **not** flipped and **not** removed; it stays
  `built: false` like the four above, and Admin → Announcements covers it.
- **Defence answer** to "why is there no Admin → Messages": it has no
  Figure 5 process. Same answer for Sections, Excuse Letters and Events.
- **Not changed by this decision:** the API still authorizes admin on excuse
  letters, messages and attendance writes (the audit's one-finding-three-
  instances). No handler moves.
- **Consequence with no owner:** STAGE 4 FRONTEND CONVENTIONS §5g says the
  admin `LiveStatus` inverse (an ungated "live updates paused" strip naming a
  channel nothing on an admin screen consumes) closes when Admin → Messages
  lands. That page will now never exist, so the inverse has no owner. It
  needs its own dispatch; nothing in this decision gates `LiveStatus`.

---


## OPEN QUESTIONS

> Originally under CLAUDE.md → OPEN QUESTIONS. Lines below are verbatim as of 2026-09-18.

## OPEN QUESTIONS

School questions and engineering questions are different. A school
conversation does not answer an engineering row. **Do not trim them
the same way.**

### School questions — still open (two)

- **Grade 1 descriptive grading — how is the A–E letter produced?**
  Manual teacher judgment, or computed? Still unanswered. The write
  path proceeds as a manual pick (`PATCH /api/grades/:id/descriptive`)
  because DO 015 defines no Initial-Grade-to-letter formula — that is
  an assumption, not a confirmation. The parent modal is silent on
  why the letter is a letter (judgment copy removed 2026-09-12). If
  the school later says a computation feeds the letter, that endpoint
  changes, not the schema.

- **Who owns old attendance after a mid-year section transfer?**
  Still unanswered. PUT `/api/students/:id` refuses a class change
  (`400`). That is a gate, not a transfer. Attendance *rows* key on
  `student_id` (history would follow the child); *who may record*
  keys on `students.section_id`. Rewriting the FK without an answer
  would move that authority — the exact write the gate exists to
  refuse. Do not add a transfer endpoint until this is answered.

### School questions — answered 2026-09-01 (recorded 2026-09-13)

- **Contributions — may the school collect them? → No.** Principal Bajar,
  consultation at Captain H. Francisco Elementary School, 2026-09-01: the
  school is not permitted to collect contributions from parents. The team
  decided to remove Feature 7; removed in code 2026-09-13. See SCOPE
  DECISION. This replaces the "reportedly, not confirmed in writing" entry
  that sat here as unconfirmed, and closes the KNOWN ISSUES row where the
  adviser had not decided.

### School questions — answered 2026-09-13

Answered by the **principal** on 2026-09-13, **in conversation — not a
written policy.** Do not cite it in the manuscript as documented school
policy. Do not re-ask it.

- **Attendance rate — Late counts as present; Excused counts as absent.**
  Built the same day: Parent → Attendance shows "Present on recorded days"
  = `(Present + Late) / total`, one decimal, over recorded days (not SF9
  Class Days). Excused is in the denominator, so an excused day lowers it.
  See BLOCKED / RESOLVED → Attendance rate formula.
- **Separately, from the source itself (not the principal): DO 015 s. 2026
  prescribes no attendance rate formula and no attendance component in any
  grade.** Para 71 is its only attendance rule — intervention at roughly
  twelve absences, and attendance information appears on the term report.
  Table 9's components are WWs, PTs, EXs; attendance is not among them.
  That is what makes the rate a school decision rather than a DepEd
  computation. Read directly (60pp, scanned) on 2026-09-13.
- **Still open, and NOT answered in the same conversation:** who owns old
  attendance after a mid-year section transfer (above).

### School questions — answered 2026-09-11

These seven were answered by the team on 2026-09-11, **in conversation,
not from a school visit or a written reply.** Do not cite them in the
manuscript as documented school policy. Do not re-ask them.

- **Four quarters vs three terms → three terms.** Already built:
  `grades.term` is `TINYINT CHECK (term BETWEEN 1 AND 3)`;
  `system_settings.current_term` allow-listed `['1','2','3']`
  (Stage G1a / DO 009 s. 2026).

- **Numerical vs descriptive for Grades 1–3 → both modes.** Already
  built: `grading_mode_configs` — Grade 1 `descriptive`, Grades 2–6
  `numerical` for SY 2026-2027. Numerical writes are G2c
  (`POST /:id/components`, `PATCH /:id/exam`); Grade 1 letter is
  `PATCH /:id/descriptive` (G2d). How the letter is *produced* is
  still open (the bullet above).

- **Three vs five grade components → three.** Already built: Written
  Works, Performance Tasks, Examinations. `grade_components.type` is
  `ENUM('WW','PT')`; EX is three raw-score columns on `grades`
  (`ex_st1`/`ex_st2`/`ex_te` plus maxes), not a third enum value.

- **Grade weights and their key → by learning area, not grade band.**
  Already built: `grade_weight_configs` keyed `(subject_id, school_year)`
  with `ww_weight`/`pt_weight`/`ex_weight` (CHECK sums to 100.00).
  35 rows for numerical-mode subjects (core 20/50/30, MAPEH/EPP
  20/60/20). Grade 1 has zero weight rows because the seed JOINs
  `grading_mode_configs` where `mode = 'numerical'`. **Not keyed by
  grade band** — that was the old, wrong shape.

- **Who may lock a grade → admin only.** Already built:
  `PATCH /api/grades/:id/lock` is `authorize('admin')` (Stage G2e).
  Do not widen `authorize()` on that endpoint.

- **Do all parents know the child's LRN? → yes.** The LRN is on the
  child's old school id and does not change from Grade 1 to Grade 6.
  Login design stays: parent `login_id` IS the child's LRN.

- **Should parents see raw scores (WW / PT / Exam)? → yes, for
  transparency.** Already built: Parent → Grades term modal,
  `GET /api/grades/:id`. The modal is approved — do not remove it
  as an unapproved feature. The endpoint stays either way.

### Engineering, manuscript, and logistics

These are not answered by a school conversation. Do not trim them
alongside the seven above.

- Adviser response to the 5 revision requests
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
     **(a) Unvalidated — CLOSED 2026-09-15.** Now: absent means
     active-only; `active`, `inactive` and `all` are accepted; anything
     else (a typo, an empty value) is `400` naming the three. No client
     relied on the fall-through (every caller sends `active` or `all`, or
     nothing). What it was: the logic was `if (status === 'inactive') ...
     else if (status !== 'all') -> active`, so only `'inactive'` and
     `'all'` are matched literals. Everything else — including
     `'active'` itself, a typo like `'activ'`, or omitting the param —
     falls to the active-only default. Confirmed live. A bad value
     therefore returns the default instead of `400`, inconsistent with
     `grade_level` in the same handler, which validates and rejects.
     Low severity (the failure mode is "you get the default"), but it is
     an inconsistency.
     **(b) `?status=all` — VERIFIED at the API, 2026-09-14. And this
     entry was wrong from the day it was written.** It said the fixtures
     could not test `'all'` because the seed has zero inactive students.
     True of the seed, but `test:students` has deactivated a throwaway
     student and asserted `'status=all includes inactive students'` since
     `a654413`, the commit that built the endpoint — the fixture existed in
     the suite the whole time; the audit looked at the seed, not the suite.
     Live on 2026-09-14 against Marwin (id 1): PATCH inactive, then
     `?status=active` and no param returned 3, 2; `?status=all` returned
     3, 2, 1 (inactive); `?status=inactive` returned 1; PATCH active
     restored him. Admin → Students sends `status=all` by default. The
     page's browser check is still pending. The original warning stands in
     reverse: **an audit entry claiming "unverified" when a test already
     proved it is its own stale fact.**
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

---

---

## ADMIN SCOPE AUDIT — the condensed section as it stood in CLAUDE.md until 2026-09-19

Moved from `CLAUDE.md` on 2026-09-19 verbatim (the condensed text that replaced the
original full section on 2026-09-18; that original is above under ADMIN SCOPE AUDIT).
`CLAUDE.md` keeps a shorter finding + decision and the 2026-09-18 nav-trim decision.

Before more admin screens were built, the record needed to say which admin
nav items have a basis in the approved design. Four sources give four
answers: `client/src/layout/nav.js` lists 13 admin items; the manuscript's
p. 70 admin dashboard mockup shows 5 (**an incomplete drawing, not a narrower
approved scope** — all five map to Figure 5, and it omits Students, Grades
and Attendance, which also have a basis); Figure 5, DFD Level 1, has 11
admin-facing processes (1.1, 1.3, 1.9, 1.10, 1.12, 1.15, 1.18, 1.23, 1.25,
1.27, 1.28); `docs/SYSTEM_ARCHITECTURE.md` §4 cites Figure 5 in its heading
and lists 3, with 1.23 filed under Teacher — **do not trust that heading; it
is recorded, not corrected, because correcting it is the team's decision.**
Figure 5 governs by precedent (the auth flow followed it over Figures 11–13),
not by an agreed general rule. When citing, say **Figure 5**, never Figure 4.

| Nav item | Figure 5 process | Basis |
|---|---|---|
| Dashboard | — | navigation, not a process |
| Users | 1.1, 1.3 | **yes** |
| Students | 1.23 (+ candidate for 1.10/1.12) | **yes** |
| Sections | none | **no** — supports attendance adviser-scoping; not one of the nine features |
| Grades | 1.9 (+ candidate for 1.10/1.12) | **yes** (view) |
| Attendance | 1.15 | **yes for viewing.** Admin record/correct, which the API allows, has no basis |
| Excuse Letters | none (admin absent from 1.16/1.17) | **no** — the API authorizes admin anyway |
| Announcements | 1.18 | **yes** |
| Memos | 1.18, partial | **partial** — a separate table and a separate word in Feature 4's name |
| Events | none | **no** — also not named in Feature 4 |
| Messages | none (1.22 is Teacher and Parent only) | **no** — `canMessage()` lets admin message anyone |
| Settings | 1.25 | **yes** |
| Backup & Restore | 1.27, 1.28 | **yes** — 1.28 Show Backup Logs is `GET /api/backups` |

**One finding, three instances — the API already authorizes admin beyond
Figure 5:** excuse letters (list / view / review), messages (`canMessage()`),
attendance writes (`POST /`, `POST /bulk`, `PUT /:id`). Not a defect; recorded
as one pattern. **1.10 / 1.12 "Academic Records" are ambiguous between
Students and Grades — both candidates recorded, neither chosen** (Figure 17
already used "Student Record" to mean Grades).

### SCOPE DECISION — admin screens follow Figure 5 (Darryl, 2026-09-13)

**Darryl's decision, not a team consultation** — the audit said the call would
go to the team with a date and a name, and that is not what happened; the two
must not be blurred. If a consultation happens later, add it here.

- **Build — the six with a Figure 5 process, all built 2026-09-14:** Students
  (1.23), Grades (1.9, view + lock), Attendance (1.15, view), Announcements
  (1.18, with memos), Settings (1.25), Backup & Restore (1.27, 1.28). Users
  (1.1, 1.3) was already built. **Stage 4 is complete.**
- **Do not build:** Sections, Excuse Letters, Events, Messages. They stay
  `built: false` in `nav.js` and appear in no plan. Removing them from the nav
  is a separate decision, not taken here.
- **Memos — DECIDED 2026-09-14 (Darryl): memos live on Admin → Announcements,
  not on their own route.** 1.18 is one process and the only content process
  the admin has; Feature 4 names both; `memosRouter` writes are all
  `authorize('admin')` while both reader pages are read-only, so that page is
  the ONLY place a memo can ever be written. The admin "Memos" nav item stays
  `built: false`, not flipped and not removed.
- **Defence answer** to "why is there no Admin → Messages": it has no Figure 5
  process. Same answer for Sections, Excuse Letters and Events.
- **Not changed by this decision:** the API still authorizes admin on excuse
  letters, messages and attendance writes. No handler moves.
- **Consequence with no owner:** §5g's admin `LiveStatus` inverse was owned by
  Admin → Messages, which will now never exist. Needs its own dispatch;
  nothing here gates `LiveStatus`.

Full text: `docs/ARCHIVE.md` → ADMIN SCOPE AUDIT.

---

## OPEN QUESTIONS — answered bullets as they stood in CLAUDE.md until 2026-09-19

Moved from `CLAUDE.md` on 2026-09-19 verbatim; `CLAUDE.md` keeps one line each.

- **2026-09-01 — Principal Bajar, consultation at the school:** the school
  is not permitted to collect contributions from parents → Feature 7 removed
  in code 2026-09-13 (SCOPE DECISION).
- **2026-09-13 — the principal, in conversation:** attendance rate — **Late
  counts as present; Excused counts as absent** → Parent → Attendance shows
  "Present on recorded days" = `(Present + Late) / total` over recorded days,
  not SF9 Class Days; Excused is in the denominator. **DO 015 s. 2026 itself
  prescribes no attendance rate formula and no attendance grade component**
  (para 71 — intervention at roughly twelve absences — is its only attendance
  rule; Table 9's components are WW / PT / EX), so this is a school decision,
  not DepEd's — never attribute it to DepEd in parent-facing copy. Mid-year
  transfer ownership was NOT answered in the same conversation.
- **2026-09-11 — the team, in conversation, seven answers, all already
  built:** three terms, not four quarters (`grades.term` 1–3,
  `system_settings.current_term`); both grading modes (`grading_mode_configs`:
  Grade 1 descriptive, Grades 2–6 numerical); three components (WW/PT rows +
  EX columns); weights by learning area keyed `(subject_id, school_year)`,
  not grade band; lock is admin only — do not widen `authorize()` on
  `PATCH /api/grades/:id/lock`; every parent knows the child's LRN (it is on
  the old school id and never changes — login design stays); parents see raw
  WW / PT / Exam scores — the modal is approved.

---

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-19

The one-line stubs that stood in `CLAUDE.md` → CHANGELOG until 2026-09-19 (it keeps
the newest five). Every full row is in `docs/CHANGELOG.md`.

| Date | Change |
|------|--------|
| 2026-09-18 | Settings redesign: one `pages/settings/SettingsLayout` for all roles, tabs as sub-routes, live `PasswordChecklist` in all four password-setting forms, Text size (this device only), the admin's first account screen; the three `SettingsPage.jsx` files deleted (the `client/src/` tree above still names them — next CLAUDE.md pass). Branch `feat/settings-redesign`. |
| 2026-09-18 | Password rule: at least 8 characters and one number, one server module (`utils/passwordRule.js`) at the three set-points with `field` on each refusal, one client module (`format/passwordRule.js`) in the three create forms; never at login. Branch `feat/password-rule`; `test:auth` 51, `test:users` 42. |
| 2026-09-18 | Teacher → Grades locked-grade copy: both occurrences now say only an admin can unlock it; server `403` unchanged; KNOWN ISSUES row closed. Branch `fix/locked-grade-copy`; fixture grade 336 left locked for the browser check. |
| 2026-09-18 | Browser check PASSED on Branch 3 (through `1ceff55`); the two teacher filter bars fixed under an approved scope expansion; the check's fixtures (student 154, parent user 115) removed by recorded SQL after backup 26 — Darryl's choice, no delete endpoint exists by design; four findings added to `docs/KNOWN_ISSUES.md`. |
| 2026-09-18 | Browser check failed on the filter widths — the fix had been scoped from a remembered list, not a search. Full audit of all 41 selects under `client/src/pages`: 22 are filter/toolbar selects and all 22 now carry the token; two more bars are outside the branch whitelist and were declared, not edited. |
| 2026-09-18 | `FormStatus` — a write’s result renders under the control that caused it, not in a shared slot at the top; 13 pages, keyed status, XOR now structural. One `filterSelectClass` (`w-full sm:w-72`) stops filter selects resizing with the selection. |
| 2026-09-18 | Admin nav trimmed 13 → 8 (the five page-less entries removed, not dimmed); Parent dashboard stops promising pages that already landed; §5g inverse closed — LiveStatus gated on the same test as the badge. |
| 2026-09-18 | Browser check passed (restore 403, change-password inline); the six queued fixtures were already gone, removed outside the API; admin nav trim + admin-only lock/unlock decided. |
| 2026-09-18 | **CLAUDE.md split** — it had grown to 712k chars against Claude Code's 150k limit and was being truncated. Verbatim history moved to `docs/CHANGELOG.md`, `docs/KNOWN_ISSUES.md`, `docs/FRONTEND_CONVENTIONS.md`, `docs/RESTORE.md` and `docs/ARCHIVE.md`; this file condensed to rules + facts, every `##` heading kept. Docs only. |
| 2026-09-15 | Server cleanup — seven recorded flags closed; change-password's live `401` → `403`; `skipAuthRedirect` removed; five suites grew. |
| 2026-09-15 | Docs only — Admin → Backup & Restore browser check passed; the first real restore through the UI recorded, with four restore findings. |
| 2026-09-14 | Admin → Backup & Restore — Stage 4's last page. **Stage 4 complete.** |
| 2026-09-14 | Admin → Grades — view plus the lock, NOT delete; `TermValue` extracted at the third copy. |
| 2026-09-14 | Admin → Announcements, with memos on the same page. |

---

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-19 (second batch, N3)

These 14 one-line stubs stood in `CLAUDE.md`’s CHANGELOG table until
N3 took that file past 145,000 chars. Moved here verbatim, byte for byte, in
their original order. **Every full row is in `docs/CHANGELOG.md`** — these are
only the one-line summaries.
| 2026-09-19 | `fix/copy-nits`: Teacher → Attendance footer verb follows the unset count ("1 student has"); the "N students" line under both Students pagers removed; the three decorative px sizes (DataTable sort icon + chevrons, thread timestamps) converted to rem so Large text scales them — KNOWN ISSUES row added and closed. `textSize.js`'s comment still calls them out of scope: stale, not edited. |
| 2026-09-19 | CLAUDE.md trim (D0): 147,145 → 134,157 chars. Four blocks moved verbatim by script with a byte-identical check (129/129 lines): 30 compact KNOWN ISSUES rows → `docs/KNOWN_ISSUES.md`, 14 older CHANGELOG stubs, the ADMIN SCOPE AUDIT block and the answered OPEN QUESTIONS bullets → `docs/ARCHIVE.md`. Every `##` heading kept, each condensed section ends with a pointer. Docs only. |
| 2026-09-19 | Server hardening C (`feat/pagination`): every list endpoint pages (`limit` 50/200, `offset`, `sort`/`order` allow-list, sibling `page { limit, offset, total, has_more }` over the filtered set; the thread on `?before=`), 16 handlers in 9 route files, `utils/pagination.js`; DataTable paged mode (server sort, footer, C7 step-back), `fetchAll` (200/page, de-dupe, hard cap) for every complete-set caller, 24 client files. Nine suites grew (users 61, students 94, grades 182, attendance 60, excuses 92, content 96, assignments 56, backups 47, messages 80). FRONTEND_CONVENTIONS §5 and two KNOWN ISSUES rows here are now stale — listed on the full row, not edited. |
| 2026-09-19 | B3: the `401` redirect now carries its reason — `axios.js` stores it in `sessionStorage` (never the URL), Login shows it once in the sign-in error slot and clears it; `Account is not active.` and the restore message verbatim, the token-shaped 401s become "Your session has ended. Please log in again."; a manual Logout shows nothing. Same-browser second-login identity swap recorded in KNOWN ISSUES, not fixed. |
| 2026-09-19 | Branch B amended (B1, B2): `POST /api/users/parents` resolves LRN + scope in one query BEFORE the duplicate `409`s — unknown LRN, out-of-scope LRN and out-of-scope LRN of a child with a parent are byte-identical `403`s, the `404` is gone; the six stale present-tense claims from the row below corrected (CLAUDE.md, `docs/FRONTEND_CONVENTIONS.md`, `StudentsPage.jsx`). `test:auth` 56. |
| 2026-09-18 | Server hardening B (`feat/authorization`): `POST /api/users/parents` is `403` unless the teacher is assigned to OR advises the student's section (the shared `TEACHER_VIEW_SCOPE_SQL`); `middleware/auth.js` answers `401`, not `403`, for `Account is not active.` on a live session — login keeps `403` + `status`. `test:auth` 54, `test:users` 47, `test:excuses` 70. Six sentences in this file and one `StudentsPage.jsx` comment are now stale — listed on the full row, not edited. |
| 2026-09-18 | Server hardening A (`feat/validation`): 12-digit LRN on create (`utils/lrnRule.js`), one contact-number rule at all six writes (`utils/contactRule.js`, digits-only storage), birthday/gender validated as `400`s, `parent_account` on `GET /students/:id`, ids instead of LRNs in new audit rows, `field` keys on restore, Login uses `extractError`. students 79, auth 52, users 47, restore 29. |

| 2026-09-19 | Brand chrome (D3, `feat/brand-chrome`): `primary` is the school's navy (`#08027C` / `#ABA8F7` dark) — buttons, badges, segmented controls; `brand`, `brand-soft`, `seal-bg` added (63 tokens) for the active nav, seven content links and the seal's disc; the seal (192 px, 49 KB, from the school's JPG — a JPG with a white field, not the named transparent PNG) in the sidebar, drawer and Login, favicon set generated, `favicon.svg` gone; header extracted to `layout/Header.jsx` and sticky, sidebar sticky, one scrollbar, no bell slot. Two extra content links declared as scope expansion, not edited. |
| 2026-09-19 | `fix/empty-state-duplicates`: Parent → Excuse Letters' empty state no longer repeats the header's Submit letter and names it instead; §5f gains the rule (an empty state never repeats an always-visible header action; filter/range resets may stay). Audit: this and the D2 Messages case were the only two duplicates. |
| 2026-09-19 | Dark mode (D2, `feat/dark-mode`): Light / Dark / System in Settings → Personalization (`pp.theme`, default Light, `data-theme` on `<html>` set by `theme.js` and an `index.html` inline script before the bundle, one `prefers-color-scheme` listener); the 60 tokens' dark values under `[data-theme="dark"]`; light AA fixes (table header, placeholders, Approve buttons, 41 faint labels); Messages empty-state button removed; `/dev/ui` theme preview + token strip; `npm run lint:contrast` = 0 with nine waived pairs each on a KNOWN ISSUES row. |
| 2026-09-19 | Design tokens (D1, `feat/design-tokens`): 60 semantic color tokens in `client/src/index.css` (`@theme inline`), 1,029 raw utilities in 51 files replaced by codemod (75 class strings, 33 line overrides, six accepted light-mode exceptions E1–E6), `npm run lint:tokens` = 0 enforced by `client/scripts/check-color-tokens.mjs`; SSR snapshot 38/38 identical with classes stripped; new §8 above. No dark values yet — D2. |

| 2026-09-19 | Login defect fixes (same branch): the leading icons were not centred because Font Awesome ships `.fa-solid { display: inline-block }` UNLAYERED and beats Tailwind’s layered `.flex` — the flex now sits on a wrapping span, never on the `<i>`; and the band painted over the card below `lg` because `.brand-panel-art` is `position: relative` and a positioned element covers a static sibling whatever the DOM order — the card’s `<main>` takes `relative z-10`. Both found in browser review; three SSR controls prove the new assertions actually fail on the old code. |
| 2026-09-19 | Login addendum (same branch): card copy is "Welcome back" / "Sign in to continue."; `fa-user` and `fa-lock` inside the inputs (Login ID via `FormField` shape 4, Password via one new optional `leadingIcon` prop — declared scope expansion) and `fa-arrow-right` on the button; a decorative glow, dot pattern, two corner rings, a seal halo and a dot grid behind the card, all defined in `index.css` off five new tokens (palette 66 → 71) including `brand-panel-lit`, the precomputed panel-plus-glow composite that `lint:contrast` checks the text against. |
| 2026-09-19 | Login redesign (`feat/login-redesign`): a brand split panel at `lg` and a band below it with the card overlapping (`-mt-12` against `pb-16`, not absolute); three new tokens `brand-panel` / `-fg` / `-muted` because `primary` is a LIGHT indigo in dark and `brand-soft` is near-white in light (palette 63 → 66, two stale counts corrected); Login ID becomes a `FormField` and Password a `PasswordField`, so the page has a reveal toggle and `PasswordField` no longer says Login is not its consumer; `role="alert"` on the error box. |

---

## Moved from CLAUDE.md on 2026-09-19 (section trim)

CLAUDE.md had reached 144,967 bytes against a 145,000-byte working limit, so
no dispatch could write to it. These five blocks moved here **verbatim**, in
their original order; each left its `##`/`###` heading and a pointer behind.
**Nothing was deleted.** The endpoint table is a DATED SNAPSHOT — the live
record of every endpoint is `docs/API_REFERENCE.md` §8, which was verified to
contain all 81 rows before this move.

### Working endpoints — the full 81-row table

| Method | Path | Role |
|--------|------|------|
| GET | `/api/health` | Public |
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Authenticated |
| PUT | `/api/auth/change-password` | Authenticated |
| PUT | `/api/auth/contact` | Authenticated — own `contact_number` only; identity fields in the body rejected with 400 |
| POST | `/api/users/teachers` | admin |
| POST | `/api/users/parents` | teacher — assigned to the student's class OR adviser of its section; one query resolves LRN + scope, so unknown LRN and out-of-scope are the same `403`, checked BEFORE the duplicate `409`s |
| GET | `/api/users/parents/pending` | admin |
| PUT | `/api/users/parents/:id/approve` | admin |
| PUT | `/api/users/parents/:id/reject` | admin |
| GET | `/api/users` | admin — filter by role, status, search on name/login_id |
| GET | `/api/users/:id` | admin |
| PUT | `/api/users/:id` | admin — name/email/contact_number only, forbidden fields rejected with 400 |
| PATCH | `/api/users/:id/status` | admin — active/inactive only, self and last-active-admin blocked |
| GET | `/api/students` | teacher (assigned OR adviser of the student's section), admin |
| GET | `/api/students/:id` | teacher (assigned OR adviser), admin, parent (own child only) |
| POST | `/api/students` | teacher (own assignment only), admin — stores `section_id`; duplicate LRN `409` before section resolve; missing year `409`; unmatched section `400` |
| PUT | `/api/students/:id` | teacher (own assignment only — `403` naming the reason if adviser-visible but unassigned, `404` if outside both), admin — class change `400`; matching PUT writes `section_id` only when NULL |
| PATCH | `/api/students/:id/status` | admin |
| GET | `/api/sections` | all roles — unscoped reference data, no per-role filtering |
| GET | `/api/sections/:id` | all roles — `404` only for a genuinely nonexistent id |
| PATCH | `/api/sections/:id/adviser` | admin — assigns/clears a section's adviser, one teacher may advise more than one section |
| GET | `/api/subjects` | all roles — unscoped reference data (the 40-row curriculum), optional `?grade_level=` |
| GET | `/api/assignments` | teacher (own rows only), admin (anyone) — teacher naming another `teacher_id` is `403`, not `404` (anti-enumeration does not apply; `/api/messages/contacts` already lists teachers by name) |
| POST | `/api/assignments` | admin — `grade_level` from the subject row, never the body; `section_id` resolved against `sections` for the current `academic_year`; duplicate is `409` |
| DELETE | `/api/assignments/:id` | admin — does **not** refuse when grades exist; a scope change removes future authority, never past records |
| GET | `/api/grading-modes` | authenticated — `grade_level` required (1–6); `school_year` optional, defaults to `system_settings.academic_year`; missing config is `409` (same status both `grades.js` readers already use). Not a `system_settings` key. Wrapper `grading_mode` is an **object** here; the report card uses the same key as a **string** |
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
| DELETE | `/api/grades/:id` | admin only, unscoped — hard delete; `403` when locked (`This grade is locked and cannot be deleted.`), `404` when missing; `logActivity` `'delete_grade'`; `grade_components` cascade |
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
| POST | `/api/excuse-letters` | parent — status always Pending, forbidden fields in body ignored; unlinked (`users.student_id` NULL) is 409 |
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
| GET | `/api/messages/contacts` | authenticated — who this user may start a conversation with; inverse of `canMessage()`; parent sees their own child's teachers + admin, teacher sees parents of their own students + teachers + admin, admin sees everyone; ACTIVE accounts only; `?search=` filters within scope, never widens it; parent rows carry `student_name` + `student_grade_level` + `student_section` (the child's class); teacher/admin rows null for all three. Teacher → Messages thread reads them to name and preselect the class (2026-09-13) — the only client that does |
| GET | `/api/messages/conversations` | authenticated — one row per person messaged, last message + unread count |
| GET | `/api/messages/with/:userId` | authenticated — full thread, participant-scoped (no re-check of `canMessage` on read) |
| POST | `/api/messages` | authenticated — `canMessage()` boundary, `403` naming the reason on violation |
| PATCH | `/api/messages/:id/read` | recipient only — sender or a third party gets `403` |
| PATCH | `/api/messages/read-all/:userId` | recipient only — marks a whole thread read |
| GET | `/api/notifications` | authenticated — the caller’s own rows only, newest first; paginated; `?unread_only=`. Text is composed from the LIVE item and every row is re-checked for visibility on read, so a notification whose item was deleted (or whose audience no longer includes the caller) is not returned |
| GET | `/api/notifications/unread-counts` | authenticated — `{ total, announcements, memos, events, excuse_letters, users, grades }`, keyed by nav section. `total` may EXCEED the sum of the badged sections: grades count here and are deliberately never badged |
| PATCH | `/api/notifications/:id/read` | authenticated — own row only; another user’s is `404`, not `403`; an already-read row is absorbed |
| PATCH | `/api/notifications/read-all` | authenticated — **no `:userId`**, unlike the messages equivalent: the caller is the only possible subject |


### CURRENT STATE → Files that exist (the condensed per-file list)

### Files that exist

Purpose per file plus the one rule each carries. The long per-file
narratives — the Grades stage history, every suite's fixture design — are
verbatim in `docs/ARCHIVE.md` → Files that exist.

```
server/
  server.js                    Express app + explicit http.createServer wrapping it (Socket.io shares
                                the same server; app.listen() replaced with httpServer.listen()).
                                Mounts /api/auth, /api/users, /api/students, /api/sections,
                                /api/subjects, /api/assignments, /api/grades, /api/grading-modes,
                                /api/attendance, /api/announcements, /api/memos, /api/events,
                                /api/settings, /api/backups, /api/messages
  socket.js                    initSocket(httpServer) — JWT auth at connection time, one room per user
  package.json                 socket.io (dependency), socket.io-client (devDependency, test-only)
  .env.example                 documents optional MYSQLDUMP_PATH override
  config/db.js                 MySQL pool behind a proxy object — resetPool() swaps in a fresh pool
                                after a restore (a plain module.exports reassignment could not reach
                                existing requires). dateStrings: ['DATE'] — DATE columns come back as
                                raw 'YYYY-MM-DD' strings, never JS Date objects, so no UTC round-trip
                                bug is possible; TIMESTAMP/DATETIME unaffected
  middleware/auth.js           authenticate + authorize; authenticate also checks
                                auth_security_state.token_valid_after against the JWT's iat
  routes/auth.js               login, me, change-password, contact. fetchUserByLoginId LEFT JOINs
                                student names / grade / section; does not SELECT s.lrn — login_id is
                                the one LRN copy on the session
  routes/users.js              create teacher/parent, pending, approve/reject, list/view/edit/status
  routes/students.js           list/view/create/update. Teacher READ scope = assigned OR adviser
                                (utils/teacherScope.js); writes stay teacher_assignments-only. POST
                                resolves and writes section_id (duplicate-LRN 409 runs BEFORE that
                                resolve); PUT refuses a class change (400) and writes section_id only
                                when NULL. Never inserts NULL section_id
  routes/sections.js           GET /, GET /:id (all roles, unscoped reference data), PATCH /:id/adviser
                                (admin only, the one mutable field). No POST/DELETE — the 23 sections
                                are fixed for the year. student_count via a correlated subquery, not
                                JOIN + GROUP BY
  routes/assignments.js        GET /api/subjects (unscoped 40-row curriculum, ?grade_level=) plus
                                GET/POST/DELETE /api/assignments. grade_level comes from the subject
                                row, never the body; section_id resolved and stored on this row.
                                Teacher naming another teacher_id is 403, not 404. DELETE never
                                refuses when grades exist
  routes/grades.js             Grades write path + reads (G2b–G3); scope, preflight order and the
                                NULL-until-complete rule are under BLOCKED / RESOLVED → Grades. The
                                subject/student grade-level mismatch check runs AFTER scope on
                                purpose — an out-of-scope teacher must not learn a grade level by
                                probing with a wrong subject_id; do not reorder it. A nonexistent
                                student is 404 for admin but 403 for a teacher (anti-enumeration).
                                preflightGradeWrite(expectedMode) is shared by every write; a write
                                and its recomputeGrade() run in one transaction, always recomputing
                                from source. POST /:id/components returns component + grade;
                                PATCH /:id/exam returns grade only (deliberate). A no-op lock/unlock
                                is 200 with no log entry. school_year defaults to the academic year
                                on GET /student/:studentId alone
  routes/gradingModes.js       GET /api/grading-modes — its own router so /api/grades/:id does not eat
                                the path. Missing config is 409 (write-preflight wording). Wrapper
                                grading_mode is an OBJECT here and a STRING on the report card; do not
                                flatten. Third copy of the YYYY-YYYY check — extract on a fourth
  routes/attendance.js         per DAY (Stage B1), no subject_id anywhere. Scoped by sections.adviser_id
                                via students.section_id, never teacher_assignments. POST /bulk
                                { section_id, date, entries } is the primary path, all-or-nothing,
                                ON DUPLICATE KEY UPDATE. GET /summary returns raw counts, no rate
  routes/content.js            announcements/memos/events — 3 routers, one file. Nine returning
                                SELECTs INNER JOIN users for posted_by_name. No GET /:id on any of
                                the three. Adviser write/read clause matches sections by grade+name
                                (NOT a section_id reader)
  routes/settings.js           allow-listed key-value store. readAllowedSettings() shared by GET / and
                                the PATCH response; normalizeValue() trims once on entry; current_term
                                validated against ['1','2','3']
  routes/backups.js            real mysqldump via spawn (MYSQL_PWD on the child env only), collision-safe
                                filenames; dumpDatabase() runs mysqldump twice so backups' rows are
                                never in a file; stripBackupsTableDdl() removes backups' DROP/CREATE
                                from the SQL a restore executes (the file keeps them for bare-metal
                                recovery); GET / reports orphaned_files, never adopts them;
                                POST /:id/restore — see RESTORE. logRestoreRefusal() on every
                                step-up / confirm_filename refusal
  routes/messages.js           canMessage() boundary on send only; reads are participant-scoped; emits
                                new_message to the recipient's room after persisting. GET /contacts
                                LEFT JOINs students for student_name + student_grade_level +
                                student_section (null on teacher/admin rows); Teacher → Messages
                                thread is the only client reading the class columns
  routes/excuses.js            submit/mine/list/view/edit/review. parent_id/student_id/status always from
                                req.user, never req.body. Read scope = assigned OR adviser (the shared
                                predicate, applied INCLUDING the existence query inside review); review
                                authority = adviser only (403 naming it, not 404); review writes only
                                status/teacher_remarks/reviewed_by — never attendance. Unlinked
                                parent POST is 409 naming the school office
  backups/                     .sql dump files land here — gitignored except .gitkeep
  routes/notifications.js      the bell: list, unread-counts, mark one read, mark all read. NO user id
                                is accepted from a request in any form — every statement filters on
                                req.user.id. Another user’s row is 404, not 403. Two argued departures
                                from the auth template, both in the file header: no sanitizeUser (every
                                query names its columns) and NO logActivity on mark-read (a row per
                                notification opened would drown the audit trail the restore machinery
                                counts). Text is composed from the LIVE item; every read re-checks
                                visibility through the matching list endpoint’s own WHERE
  utils/notify.js              the fan-out, one place, seven event types. THE RULE: a recipient set is
                                the matching list endpoint’s own WHERE, or a DECLARED NARROWING of it,
                                never a widening. Three narrowings are in force and each is named at
                                its query: active accounts only; excuse_submitted to the section
                                ADVISER alone (review authority is narrower than read scope); and NO
                                events to admin, who has no Events page. The actor is never a recipient
                                (Amendment A1) — applied once, in insertNotifications, not in seven
                                queries. Insert inside the caller’s transaction, emit AFTER it commits
  utils/jwt.js                 sign/verify
  utils/password.js            bcrypt hash/compare
  utils/activity.js            insert into activity_logs
  utils/validateId.js          parseId() — validates :id route params before any query
  utils/sanitizeUser.js        strips any key containing "password", case-insensitive
  utils/dateFormat.js          isValidDateFormat() + todayLocalDateString() — never toISOString()
  utils/teacherScope.js        TEACHER_VIEW_SCOPE_SQL + teacherViewScopeParams(userId) — the shared
                                assigned-OR-adviser predicate (students, excuses, messages). The
                                helper exists because the hazard is the parameter COUNT (two)
  utils/gradeComputation.js    pure functions, no DB/HTTP: componentPercentage, subTestPercentage,
                                exPercentage (ST1×0.30 + ST2×0.30 + TE×0.40), weighted, initialGrade,
                                roundTo2 (half-up, Number.EPSILON nudge), qualitativeDescriptor
                                (Table 11), descriptiveGradeMeaning (Table 8). Every function returns
                                null on a missing input — never a partial number. Percentages over
                                100 are deliberately NOT clamped
  scripts/setup-db.js          runs schema + seed, hashes seed passwords. backfillSectionIds() fills
                                section_id from the VARCHAR values and REPORTS any row left NULL —
                                do not remove the reporting step. buildUserSeedSql() also creates
                                TCH-002 (adviser-only) and TCH-003 (Grade 1 adviser + all five
                                subjects). Counts: Seeded baseline. NEVER run with a non-default
                                DB_NAME (KNOWN ISSUES hazard)
  scripts/migrate-notifications.js THE MIGRATION TEMPLATE, and the first one this repo ever had.
                                Before it the only schema tool was setup-db.js, which opens with
                                DROP DATABASE and is therefore never run against anything that
                                matters. Copy its four rules for the next migration: NEVER drop;
                                be idempotent and PRINT the evidence (--print-state, so two runs
                                are compared by diff rather than by reading the code); announce
                                created / already present per object; and mirror the change into
                                database/schema.sql so a clean db:setup matches. MySQL 8 has no
                                ADD CONSTRAINT IF NOT EXISTS — guard each FK with an
                                information_schema lookup
  scripts/verify-grading-seed.js direct-DB check of the Grades seed (41-row transmutation table with
                                no gaps/overlaps, 40 subjects, 35 weight rows, modes, Grade 1 fixture)
                                — not one of the fifteen suites; run after db:setup
  scripts/test-*-flows.js      the fourteen HTTP suites (counts under Tests, above). BASE falls back
                                to http://127.0.0.1:${PORT}; API_BASE wins. Every row a run creates is
                                deleted in finally. test-grades-flows.js has a local requireFixture()
                                that STOPS the run when a fixture fails; the other scripts share a
                                record-only assert() (KNOWN ISSUES). test-attendance-flows.js's
                                cleanup deletes every attendance row on three dates, not only its
                                own (KNOWN ISSUES). test-restore-flows.js never triggers a real
                                restore and puts back the cutoff it finds
  scripts/test-sanitize-user.js, scripts/test-grade-computation.js
                                direct-call unit tests — no server, no DB
database/
  schema.sql                   21 tables (contributions + contribution_records dropped 2026-09-13;
                                notifications added 2026-09-19 — see the migration note below).
                                sections — UNIQUE (grade_level, name, school_year), adviser FK
                                ON DELETE SET NULL; nullable section_id FK on students (RESTRICT),
                                teacher_assignments (CASCADE), announcements (CASCADE). attendance —
                                no subject_id; UNIQUE (student_id, date). grades — term TINYINT CHECK
                                1–3; dual-mode term_grade / descriptive_grade (exactly one populated;
                                do not drop or merge them); ex_st1/ex_st2/ex_te hold RAW scores with
                                ex_*_max columns; grade_components ENUM('WW','PT') only, no
                                'formative'; transmutation_table (41 rows, school_year-scoped — a
                                year with no rows means "use the Initial Grade directly", no code
                                change); grading_mode_configs per (grade_level, school_year);
                                grade_weight_configs keyed (subject_id, school_year), CHECK sums to
                                100.00; auth_security_state — single row, set only by restore;
                                users.status includes 'inactive'; backups.file_size
  seed.sql                     23 sections for SY 2026-2027 (the school's real names — 'Mabini' and
                                'Rizal' were fictional and are gone); academic_year '2026-2027';
                                current_term '1'; 40 subjects (5/5/6/8/8/8; Grade 4 INFERRED, flagged
                                in-file; Grade 6 under the SF9's names GMRC/EPP); 35 weight rows via
                                SELECT ... JOIN grading_mode_configs WHERE mode = 'numerical' (not a
                                hardcoded grade comparison — Grade 1 gets zero rows and the exclusion
                                follows the mode table automatically); transmutation table verbatim
                                from GRADING_SPEC §5; Nino's five descriptive rows are illustrative
                                fixture data, not a computed result. Adviser assignments keyed by
                                login_id subquery, never a numeric id
scripts/
  create-backup-zip.js         source-code archiver — NOT the DB backup (that is routes/backups.js)
client/
  package.json                 Vite + React 19 + Tailwind v4 + Font Awesome; socket.io-client pinned to
                                the server's socket.io version
  vite.config.js               dev server pinned to port 3000 (matches the server's CORS_ORIGIN default)
  src/                         see "React web app" below
```

Full text: `docs/ARCHIVE.md` → CURRENT STATE → Files that exist.



### CURRENT STATE → React web app (the client/src tree)

### React web app — Stage 4 foundation built, primitives frozen

`client/` builds clean (`npm run build`) and lints clean (`oxlint`, two
pre-existing `AuthContext.jsx` warnings aside; the running oxlint baseline is
**44 as of 2026-09-19**, measured and recorded on each dispatch's CHANGELOG row). On top of the auth
slice: role-aware `Shell` with nested layout routes, seven shared UI
primitives, and a dev-only component gallery at `/dev/ui` — registered behind
`import.meta.env.DEV` and **verified absent from the production bundle**
(grepped, not asserted). **Every Teacher page, every Parent page and every
Figure 5 admin page exists — Stage 4 is complete (2026-09-14).** See STAGE 4
FRONTEND CONVENTIONS for what every one of them inherits.

Auth round-trip verified in the browser: admin login (`ADMIN001` /
`Admin@2026`) redirects to `/admin`; a wrong password shows an inline error
without leaving the login page; a pending parent account shows the
approval-pending message inline; refreshing a logged-in session shows the
loading spinner with no login-page flash.

```
client/src/
  App.jsx                 /login, then nested layout routes per role under ProtectedRoute + Shell
  api/axios.js            Bearer interceptor; mandatory unwrap on success; 401-only redirect, storing
                          the server's reason in sessionStorage (never the URL) for Login to show once —
                          "Account is not active." and the restore message verbatim, token-shaped 401s
                          as "Your session has ended. Please log in again." No per-call opt-out exists —
                          if an endpoint answers a live session with 401, fix its status code, never
                          add an interceptor exception
  api/extractError.js     { success:false, message } -> string, with an offline case
  auth/AuthContext.jsx    login/logout/refresh/user/loading — awaits GET /auth/me on load
  auth/ProtectedRoute.jsx role-gated route wrapper
  pages/Login.jsx         Login ID + password, no role dropdown; extractError for sign-in failures; shows
                          the 401 logout reason once (takeLogoutReason in its error initialiser), never
                          after a refresh or a manual Logout
  format/grade.jsx        GradeValue + GradeLegend — the NULL-grade rule (§3). No branch for a
                          descriptive A–E letter (KNOWN ISSUES)
  format/TermValue.jsx    the shared term cell — extracted at the third copy (2026-09-14); Parent,
                          Teacher and Admin → Grades import it
  format/date.js          todayLocalDateString() — never toISOString()
  assets/school-seal.png  the school seal, 192 px / 49,256 bytes, from the school's 447 px JPG (white
                          field, no alpha) — rendered on a bg-seal-bg disc, never bare (§9)
  layout/Shell.jsx        role-aware STICKY sidebar (top-0 h-screen; the nav scrolls inside itself) with
                          the seal + "Parent's Portal / Capt. H. Francisco ES", <Outlet/>, page title,
                          the LiveStatus strip above the routed page, the unread badge (only on a BUILT
                          Messages item); exports NavItem. The document is the only scroller
  layout/Header.jsx       the sticky (top-0 z-30) header: title, the notification bell, user,
                          Logout, hamburger below sm. The bell sits BEFORE the user block so the
                          rightmost control stays Logout at every width.
                          Extracted on D3 so the Notifications dispatch has a file to put the bell in —
                          no bell slot yet
  layout/nav.js           NAV_BY_ROLE — built / blocked / unbuilt flags; the single source of nav
  layout/usePageTitle.js  detail pages override the nav-derived title
  realtime/               SocketProvider (connected; subscribe -> new_message, subscribeNotifications
                          -> notification_counts — TWO separate listener sets, because one carries a
                          message and the other carries nothing and means "refetch"), LiveStatus
                          (ungated for every role since N2), UnreadProvider ({ unread, refresh },
                          request skipped unless that role's Messages item is built),
                          NotificationProvider ({ counts, refresh }; a SIBLING of UnreadProvider, never
                          summed with it — CLAUDE.md §9)
  hooks/useTeacherTargets.js  assigned (GET /assignments, distinct grade+section) OR adviser
                          (GET /sections). Announcements and Events only — never Grades
  components/             NotificationBell (the header bell + its dropdown: real button with
                          aria-expanded/-controls/-haspopup, the count also as words, Escape closes
                          AND returns focus, outside click on mousedown, role="menu" with focus NOT
                          trapped, z-40 over the z-30 header, full-bleed below sm, pages in place —
                          there is deliberately no /notifications route),
                          DataTable, Modal, FormField, PasswordField, StatusBadge, EmptyState,
                          ErrorAlert, LoadingSpinner, FormStatus. FormStatus (2026-09-18) is the
                          outcome of ONE write, rendered under the control that caused it — under
                          that form's submit button, or inside the Modal whose action produced it;
                          a message that outlives its modal goes above the list it describes.
                          ONE value ({ tone, text }), so a success and a failure cannot both be on
                          screen — the XOR is structural, not re-derived per page. An error
                          delegates to ErrorAlert (§2 wording untouched); a success carries
                          role="status". Pages hold one `status` object keyed by form, and writing
                          one key replaces the object, which clears the others.
                          FormField also exports `filterSelectClass` — the fixed width every
                          filter-bar select takes (`w-full sm:w-72`, sized to the longest real
                          option, 30 chars). A bare flex item with no width is content-sized, so
                          without it a select resizes as you pick
  pages/dev/UiGallery.jsx every primitive in every state — DEV builds only
  pages/dashboards/       all three derive "Open now" from navForRole — no edit when a page lands
  pages/teacher/          11 nav items. Attendance (encode; adviser-scoped; ?status=active roster;
                          unset rows omitted). Attendance records (read-only; never sends `date`).
                          Students + detail (enroll wizard + create parent; Edit only for classes in
                          GET /assignments). Excuse Letters (review; adviser-only predicted before
                          the click; confirmation names the decision). Announcements (the Class
                          Board). Memos (read-only; posted_by_name column). Events. Messages + thread
                          (Announce to a class). Grades (view + encode, one page; encode scope from
                          GET /assignments, mode from GET /grading-modes; no client IG preview; no
                          lock control). Settings (password + contact; identity locked)
  pages/parent/           8 pages. Grades (report card + term breakdown modal via GET /grades/:id —
                          no IG, no weights, no remarks, no rank). Attendance (counts + day list +
                          "Present on recorded days" = (Present + Late) / total over recorded days;
                          Month vs All). Excuse Letters (submit + edit while Pending; no withdraw).
                          Announcements, Memos, Events (read-only; modal, not a route). Messages +
                          thread (table = GET /conversations; contacts = picker only). Settings
                          (password + contact; identity locked — the one parent screen that shows
                          the LRN). Grades and Attendance skip their request when user.student_id
                          is null; Excuse Letters hides Submit then. Never GET /api/settings or
                          PUT /api/users/:id
  pages/admin/            Users (pending queue + directory + create teacher + edit + status; never
                          POST /users/parents; no :id route). Students + detail (unscoped;
                          status=all default; deactivate/activate no confirm, list reloads; Edit
                          only). Settings (SCHOOL settings; two saves via PATCH; school year locked
                          on this page only). Attendance (VIEW ONLY; nothing fetched until a grade
                          or date range is applied; counts, no rate). Announcements & memos (one
                          route; body always sends BOTH target keys; edit own / delete any).
                          Grades (student-first report card; LOCK/unlock in a modal, NOT delete).
                          Backup & Restore (orphans read-only, no adopt; delete manual backups
                          only; restore with step-up password + typed file name; NO request after
                          a successful restore)
```

Full text, including each page's dated verification: `docs/ARCHIVE.md` →
CURRENT STATE → React web app, and each page's CHANGELOG row.

---



### CURRENT STATE → sections table (the condensed investigation)

### sections table — one route reads it (attendance), one route manages it (sections), Class Board investigated and found to need nothing from it

**The thing a fresh session will get wrong.** `sections` exists in
`schema.sql`, is seeded with the school's 23 real section names, and has a
nullable `section_id` FK on `students`, `teacher_assignments`, and
`announcements`. `routes/attendance.js` scopes entirely through
`sections.adviser_id` via `students.section_id`, and `POST /bulk`'s body is
keyed on `section_id` directly. **Every other route still scopes on the
VARCHAR columns** (`students.section`, `teacher_assignments.section`,
`announcements.target_section`) — attendance is the one deliberate exception,
not the start of a silent migration. A full VARCHAR → FK cutover changes the
API contract for no user-facing gain and is deliberately deferred.

**`section_id` is read in exactly FOUR places: attendance scoping, and the
teacher READ scope in `routes/students.js`, `routes/excuses.js` and
`routes/messages.js`** — the last three via the one shared constant in
`utils/teacherScope.js`. Each was checked against this note first, and the
note is the gate working, not a rule repeatedly overridden. The cause was the
same each time: attendance and excuse-letter review scope on
`sections.adviser_id` while those files' read scopes were
`teacher_assignments`-only, so an adviser with no assignment rows (TCH-002 is
exactly that account) could record attendance for a student they could not
list, and was the sole permitted reviewer of a queue they could not see. The
adviser leg matches `s.section_id` — the same column attendance uses — so the
two sets coincide by construction. `routes/content.js` was widened for
advisers in the same dispatch and did NOT become a reader: its scoping runs on
`target_grade`/`target_section`, so it has its own clause matching `sections`
by `grade_level` + `name`. **Write authority did not move in `students.js`
(`PUT`/`POST` stay `teacher_assignments`-only) or `excuses.js` (review stays
the adviser check after the visibility query).** Do not migrate a fifth route
without checking here first.

**Writes of `section_id`, which are not readers:** `POST /api/students`
(2026-09-10) resolves `sections` by name + grade_level +
`system_settings.academic_year` and stores the id — duplicate-LRN `409` runs
before that resolve, missing year is `409`, unmatched section is `400` naming
it. **Do not insert with NULL `section_id`.** `PUT /api/students/:id` writes
`section_id` only when the stored FK is NULL and refuses a class change with
`400`; it never overwrites a non-null FK. `POST /api/assignments` stores it on
its own row the same way. These writes exist so the readers stay honest for a
newly enrolled student; they are not a cutover.

**The Class Board needs nothing from `section_id`.** `target_grade` +
`target_section` already does the identical scoping job, and
`POST /api/announcements` never sets `section_id` — `backfillSectionIds()`
runs once at `db:setup` — so every announcement created in normal operation
has it NULL and any reader would silently return nothing.

**`routes/sections.js` is a different thing from that migration.** It is the
CRUD-minus-create management interface for the `sections` table itself, and
what makes an unassigned section usable by attendance — before it, setting
`adviser_id` meant a direct DB write. Which sections have an adviser: Seeded
baseline. TCH-002 remains the assignment-less adviser fixture. There is no
admin UI page for `PATCH /api/sections/:id/adviser` (Admin → Sections is out
by the Figure 5 scope decision), so attendance for an unassigned section has
no valid adviser until a direct API call lands — see KNOWN ISSUES.

Full text: `docs/ARCHIVE.md` → CURRENT STATE → sections table.



### CURRENT STATE → Class Board (the condensed investigation)

### Class Board — investigated, zero code needed (extension of Feature 4)

**2026-09-06.** The school asked for a group chat so teachers would stop
answering the same question in twenty private messages. A group chat was
rejected deliberately: thirty parents in one thread see each other's names and
messages, the teacher becomes a moderator, and minors are involved. The Class
Board is a section-scoped announcement instead — teacher posts, every parent
in the section reads, no parent sees another parent. **It is NOT an eleventh
feature.** It is Feature 4 with school-wide as admin-only and section-level as
teacher-capable — no change to the IPO framework or the manuscript's feature
count.

The existing `announcements` endpoints in `routes/content.js` already deliver
every stated behaviour, unchanged: a teacher must name an exact `target_grade`
+ `target_section` they are connected to (`403` naming it otherwise); the
parent branch of `GET /api/announcements` returns school-wide posts plus the
child's own section; `authorize('teacher', 'admin')` excludes parents from
posting; and **no endpoint anywhere exposes a section roster to a parent**.
Zero new endpoints, zero changes to `content.js`.

**Three decisions, recorded so they are not re-argued:**

- **Parents never reply — permanently, not "not yet."** A reply visible to the
  section recreates the rejected group chat; a reply visible only to the
  teacher is a private message arriving through a second inbox. Messages is
  the channel for a question about a post.
- **No new column or flag.** A Class Board post is identified by its shape
  alone — teacher-posted, both `target_grade` and `target_section` set. Visual
  distinction is a rendering decision, not a schema one.
- **No link back to the originating message.** A `source_message_id` would be
  a provenance feature nobody asked for.

**BUILT 2026-09-07 — with deliberately no "Class Board" affordance in the
UI.** `client/src/pages/teacher/AnnouncementsPage.jsx` is the Class Board: a
teacher's ONLY legal target is an exact section, so every announcement a
teacher posts is already a Class Board post and a separate control would offer
a choice that does not exist. The compose form names the audience — *"Parents
of this section will see this post."* — and the term appears nowhere on screen.

**"Announce to a class" from Messages opens this form (built 2026-09-13). Do
not build a second composer.** `MessageThreadPage` navigates to Announcements
with `location.state.compose = { content, target? }` — `content` is the unsent
draft, never the incoming message; consume-once `replace` stops a refresh
reopening the form. On a parent thread the class is named and preselected
(**Announce to Grade 6 - Malikhain**, `target: '6|Malikhain'`) from
`GET /messages/contacts`, fetched once in its own effect keyed on `otherId` —
**not inside `load()`**, which re-runs on every socket message. Every other
case is an unnamed **Announce to a class** with no target: contacts not
loaded or failed, a teacher/admin thread, or **no contacts row at all** (a
deactivated parent, or scope changed with history still readable) — do not
preselect a class for a parent you can no longer reach. **The client
preselects; it does not authorize** — Announcements re-validates `target`
against its own list (unknown target → blank picker + stale notice, never
another section) and the server decides on POST. The hint is visible text
under the button row, not only a `title`; "This conversation will not" is the
sentence that stops a teacher believing they replied to the parent. An empty
target list on arrival does not open compose and shows the draft instead of
discarding it. `GET /conversations` and `GET /with/:userId` carry no class;
reconstructing it by matching `student_name` to `GET /students` is refused —
two students can share a name.

Full text: `docs/ARCHIVE.md` → CURRENT STATE → Class Board.

---

## BUILD ORDER → Stages 1 and 2, moved from CLAUDE.md on 2026-09-22 (third trim)

> Verbatim. Stage 3 and Stage 4 were already archived on 2026-09-18 under
> "BUILD ORDER → Stage 3 and Stage 4" above; Stages 1 and 2 had never been,
> so these are a MOVE, not a duplicate. CLAUDE.md keeps a one-line ticked
> summary per stage and a pointer here.

### Stage 1 — Foundation ✅ DONE

- [x] Database schema — 22 tables (was 18 when Stage 1 closed; the Grades
      rebuild and `auth_security_state` added four, `notifications` and
      `auth_codes` added one each, and Feature 7's two
      tables were dropped 2026-09-13)
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

---

## AGENT SKILLS → the rationale, moved from CLAUDE.md on 2026-09-22 (third trim)

> Verbatim. CLAUDE.md keeps the skill table, the auto-invoke warning, the
> one-line "deliberately NOT installed" list, "do not install more without a
> specific reason", and the no-`CONTEXT.md` rule — every live do-not. What
> moved here is the reasoning behind them.

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

### No CONTEXT.md — the reasoning

A second root-level context document would be a third thing to keep in sync
with the code alongside this file and `docs/PROJECT_PROGRESS.md` — and the
warning at the top of this file exists precisely because that sync failed once
already.

---

## SCOPE DECISION → Feature 7, the two narrative paragraphs, moved from CLAUDE.md on 2026-09-22 (third trim)

> Verbatim. CLAUDE.md keeps the consultation date and Principal Bajar's
> statement, the Chapter 5 instruction, "Why not a flag", and "What stays,
> deliberately" in full — the last of those carries the live do-not about the
> 40 `activity_logs` rows.

**What went:** 8 endpoints (`routes/contributions.js`), the
`contributions` and `contribution_records` tables with their four FKs,
Teacher → Contributions and Parent → Contributions, three nav items (teacher,
parent, and the unbuilt admin one), `test:contributions` and its suite,
and StatusBadge's `paid` tone (`pending` stays — users and excuse letters
share it).

**What the removal also closed:** consequence 5 (the adviser could not post a
fee — a school question), the DELETE 409 that named a remedy which did not
exist, the Download Statement KNOWN ISSUE (Figure 19's CSV export), the last
expired NOW POSSIBLE workaround (Contributions compose built from
`GET /students`), the DO 19 KNOWN ISSUES row, the unconfirmed OPEN QUESTION,
and in API_REFERENCE the `records` two-shape wrapper gotcha, the `mine` vs
`my-records` gotcha, and the contributions half of the scope-width gotcha.

---

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-26 (eighteenth batch, the smoke-gate docs pass)

> Verbatim, exactly as it stood in CLAUDE.md's CHANGELOG table. Dated rows
> are never edited; the full row is in `docs/CHANGELOG.md`. Moved as the
> documented overflow valve — the smoke-gate docs pass adds its own stub, a
> self-healing clause in §10 and two reworded rules, and must land at net ≤ 0.
> One row; the table keeps the smoke gate alone.

| 2026-09-26 | **Docs pass** (`100c560` + commit 2): **PROJECT_PROGRESS is a state-only snapshot**; its 156 KB of narrative moved to ARCHIVE verbatim (diffed identical, 154,288 bytes). README and SETUP_NOTES carry no counts or passwords; `.cursorrules` lost "Grades is blocked"; the API scope legend matches the code (`wide` is assigned-OR-adviser, new `recorder`); seven dead pointers fixed; **23 test scripts (19 HTTP + 4 unit), 7 migrations, 12 proofs** — CLAUDE.md and TESTING had 22, 5 and four. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-26 (seventeenth batch, the docs pass)

> Verbatim, exactly as they stood in CLAUDE.md's CHANGELOG table. Dated rows
> are never edited; the full rows are in `docs/CHANGELOG.md`. Moved as the
> documented overflow valve — the docs pass adds its own stub, the ticked
> item, the end-of-session rule and six pointer and count fixes, and
> measured +154 before its stub.
> Two rows; the table keeps the docs pass alone.

| 2026-09-26 | **Polish** (`1408b81`, `70b30b0`): five of six — class-record group headers left-aligned; **the class summary measured at 1280 (scroller 990, table 998), `min-w-max` dropped**, headers wrap, 990/990 after; Enroll neutral beside the filled Apply; Settings `max-w-2xl` with paired rows; Login's school name from `/settings/public`, "– Main" fallback. **Item 4 reverted by decision.** Smoke 20/20 twice. |
| 2026-09-26 | **fix/auth-503** (`1d2b228`): with MySQL stopped every request was `401 "Invalid or expired token."` and the client logged out. **Token in one try, database in another; a database error is `503` with the health body**; `/me` the same. `test:auth-middleware` **23** on a stubbed pool. Seen by hand: panel, token kept, Try again resumes. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-26 (sixteenth batch, the polish docs pass)

> Verbatim, exactly as they stood in CLAUDE.md's CHANGELOG table. Dated rows
> are never edited; the full rows are in `docs/CHANGELOG.md`. Moved as the
> documented overflow valve — this pass adds the fix/auth-503 and polish
> stubs, the §2 outage rule and the "Set HPS" bullet, and the first measure
> came in at +2,399 bytes. Two rows.

| 2026-09-26 | **About at 390px** (`eae36e4`): the Facebook URL from `chore/school-contacts` — 66 characters, no space, **no smoke run** — held a detail tile open at 522px; every `/about` route scrolled sideways. `break-words` does not reduce a grid item's min-content width; **`[overflow-wrap:anywhere]` on the `<a>` itself** plus `min-w-0` on the tile does. `smoke:isolated` 10/20 → 20/20. |
| 2026-09-26 | **Pre-Stage-5 #7 — CAL** (`2decc74`): **the term follows the school calendar and `current_term` is not a setting.** One pure module (server decides, client mirrors, strings only, a `Date` throws), the latest-start-≤-today rule, the two teacher pages pin `?term=` by `replace` before the sentinel arms, Attendance opens inside the school year, Settings shows the term read-only. `test:school-calendar` **34** (new), `ssr-school-calendar` **28/28** in both zones, `test:settings` 35 with two cases swapped; every neighbour unchanged. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-26 (fifteenth batch, the pre-Stage-5 #7 docs pass)

> Verbatim, exactly as it stood in CLAUDE.md's CHANGELOG table. Dated rows
> are never edited; the full row is in `docs/CHANGELOG.md`. Moved as the
> documented overflow valve — this pass adds the #7 stub, the About-at-390
> stub, the #7 rule and the POLISH queue, and the first measure came in at
> +2,076 bytes. One row; the same pass also condensed CLAUDE.md's
> per-batch count list into a pointer at these headings.

| 2026-09-26 | **Pre-Stage-5 #6** (`2ae7639`): **the adviser who leaves keeps the days they recorded** — teacher attendance reads are `recorded_by = me` OR adviser of the learner's current section, per row, no assigned leg, no schema; writes stay with the current adviser. Attendance records gains **"Everything I recorded"** (a row carries the learner's CURRENT class, so no section filter could show a moved learner's days). `test:attendance` 64 → **73** with a transfer case moved by SQL on its own fixture. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-26 (fourteenth batch, the pre-Stage-5 #6 docs pass)

> Verbatim, exactly as they stood in CLAUDE.md's CHANGELOG table. Dated rows
> are never edited; the full rows are in `docs/CHANGELOG.md`. Moved as the
> documented overflow valve — this pass adds the #6 stub, the #6 rule and the
> CAL dates that #7 needs, and the first measure came in at +845 bytes. Two
> rows; the table keeps #6 alone until the next pass.

| 2026-09-26 | **Pre-Stage-5 #5b** (`4b092ee`): **the Back button asks too** — a `pushState` sentinel, `classRecord/backGuard.js` a pure machine (`ssr-back-guard` 12), one effect keyed on `dirty` that touches history only, `'BACK'` through the existing leave modal. One accepted quirk: an in-app leave keeps the sentinel behind. Smoke 19/20 on `--watch` (the known first-test row), `smoke:isolated` 20/20. |
| 2026-09-26 | **Pre-Stage-5 #5a** (`fe67803`, `5df33f2`): **nine settings keys, `GET /settings/public`, the About page** (redesigned per the board; every DepEd quotation checked against deped.gov.ph — three of the board's spellings corrected), **Grades 2–3 `display_order`** (46 seed checks). **The migration ran without a prior backup** — two calls failed in a `--watch` restart; the rule is health → backup → write now. Smoke caught a key collision the browser had not. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-26 (thirteenth batch, the pre-Stage-5 #5 docs pass)

> Verbatim, exactly as they stood in CLAUDE.md's CHANGELOG table. Dated rows
> are never edited; the full rows are in `docs/CHANGELOG.md`. Moved as the
> documented overflow valve — this pass adds two stubs (#5a, #5b) and closes
> five pre-Stage-5 items with their rules kept. Three rows, the oldest —
> the third (#4) moved after the first measure came in at +945 bytes.

| 2026-09-25 | **Pre-Stage-5 #4** (`9c413f4`): **only a 401 ends a session** — `AuthContext` used to drop the token on any `/auth/me` failure; now `AuthUnavailable` + Try again, the interceptor alone logs out (§22, `ssr-auth-failure` 14). `utils/emailRule.js` at three write sites. **Only the adviser of the target section enrols and creates the parent**; edit is assigned OR adviser; **admin kept — 20 adviser-less sections**. Two fixture corrections the gate exposed (a NULL `section_id`, a fictional section). Suites 68 / 60 / 98. |
| 2026-09-25 | **Pre-Stage-5 #3b** (`642ccb2`): **Tala Halimbawa**, G6 Malikhain, active parent Ligaya — the browser-fixture learner; seed + `db:migrate:fixture-learner` (a live DB never gets a seed row by `db:setup`); two watermarks captured at start. **`smoke:isolated`** owns an API without `--watch` on 5001 and lists the ports after. Full suite set green, no count shifted; 20/20. |
| 2026-09-25 | **Pre-Stage-5 #3a** (`85c5d8f`): the shared notifications cleanup by `(item_type, item_id)` pairs, every suite asserting zero left — **the writer list was wrong** (content ×3, excuses ×2, users ×1, grades ×1; messages/backups/user-management never could leave a row) and **the first run left one row** (content's spliced event). Attendance cleans by its own ids, proved by a sentinel. **`test:restore` was the missing `v` claim, not `iat`** — red-first printed the body. 29/29. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-26 (twelfth batch, the pre-Stage-5 #4 docs pass)

> Verbatim, exactly as they stood in CLAUDE.md's CHANGELOG table. Dated rows
> are never edited; the full rows are in `docs/CHANGELOG.md`. Moved as the
> documented overflow valve — this pass adds the #4 stub and closes four
> pre-Stage-5 items with their rules kept. Two rows, the oldest.

| 2026-09-25 | **Pre-Stage-5 #2** (`819e892`): five server fixes — attendance `date`+range → `400`; a class filter and `sort=class` on `GET /grades`; users sort by letters for **role AND status** (both ENUMs — the second had no header to show it); `/api/health` pings the pool, **503 path stated untested**; `term_average_descriptors` and the hero's `Term N · <word>`. **Fixture captured from the suite** (§19f), and the first negative control matched `· Adviser:` instead of the caption. Suites 62 / 255 / 64, `ssr-ui-d` **86**. Three orphan notifications after `test:grades` — the 2026-09-19 figure, again. |
| 2026-09-25 | **Item 5b** (`84739bc`): the code review's seven findings on item 5. **The live region was mounted only while dirty — an accessibility defect, and the proof had CEMENTED it** by asserting the region absent when clean; a screen reader announces changes *inside* an existing region. `ScrollCue` already had the rule (§19d); `FilterActions` contradicted it. Also: Reset restores the staged Section; `isDirty` trims every string; `canResetFilters` removed; `buttonNeutralClass`; Events gets a real Reset. `ssr-item5` **39**. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-25 (eleventh batch, the pre-Stage-5 #3 docs pass)

> Verbatim, exactly as they stood in CLAUDE.md's CHANGELOG table. Dated rows
> are never edited; the full rows are in `docs/CHANGELOG.md`. Moved as the
> documented overflow valve — this pass adds two stubs (#3a, #3b) and must
> land the file BELOW where it started, because #3b's baseline rows had to
> go in with the seed. Four rows, the oldest.

| 2026-09-25 | **Item 5** (`2000499`): nine pages staged their filter values and **none admitted it** — a select could read "Approved" over a Pending list. **Filed as §5f, corrected to §5b one level out.** Staging KEPT (three pages filter free text with no debounce); one bounded control auto-applies, eight gain a quiet↔filled Apply and a `role="status"` note. **`parent/EventsPage` already carried the auto-apply rule in its own words** — "no precedent for the affordance" was true of the cue only. **`isDirty` is key-by-key over the UNION, never `JSON.stringify`** (key order), search trimmed both sides, compared against DEFAULTS not falsiness. **A live defect fixed on the way:** T·Attendance records' Section bypassed `applied` and never reset the offset. §21. **The UI-polish queue is COMPLETE.** |
| 2026-09-25 | **UI-E** (`3086086`): a teacher can read back a reviewed letter. **The remarks rendered only inside the review modal, which opens only for a PENDING letter** — so the teacher who wrote them lost them on save, at every width, and **nothing was broken enough for a check to see it.** Renders the list row, never `GET /:id` (which returns strictly LESS). **Two of the four omitted fields do not exist:** no `reviewed_at` column, and `reviewed_by` is an unresolved user id. **The card's own comment argued against moving its gate** — on a fact, not a principle, and the fact is what changed (§20b). `ssr-ui-e` 23, `ssr-cards` 31 → **32**. **Both my mistakes were in test code:** a regex that matched its own fixture's prose, and a probe that reported clean twice while `name: 'View'` was matching **"Review"**. |
| 2026-09-25 | **UI-D-2+3** (`9d0c1cb`→`a6be0d2`, five commits): `ScrollCue` on both grids, the parent hero on `--brand-panel`. **UI-D is complete.** **The thresholds were the whole story and I got them wrong twice** — 1px fired on a **2px** overflow and flapped between 1279 and 1281px; 24px on BOTH tests then dropped "Performance Tasks" from the hint while its column was visibly cut. **Two constants: gate 24px, per-cell strict — legibility decides WHETHER to speak, not WHAT to say** (§19b). KS1's "A  D" was a hover-only `title`, which **does not exist on touch**; the average follows `current_term` now. **Two defects of mine, neither found by reasoning:** `ScrollCue.jsx` beside `scrollCue.js` (**Windows is case-insensitive**), and a fixture that invented a string where the API sends an object — **`/parent` rendered blank while build, oxlint and 71/71 were green** (§19f). `ssr-ui-d` **82**, contrast **74 pairs**, smoke 20/20. |
| 2026-09-25 | **UI-D-1** (`7513457`): the app could not print and could not be read in the dark. **Zero print CSS existed** — the Summary of Grades printed the sidebar, the top bar and the Term select, and `overflow-x-auto` **clipped five of eight subjects and the Average column**. A scroller is a guillotine on paper, and **`min-w-max` is the other half**, so landscape alone would not have fixed it. **Landscape is scoped per page** by a `<style>` mounted with the route (`@page` cannot be nested; named pages fail in Firefox; **Safari ignores `size`** and is survivable only because `min-w-max` is released). The report card is **forced** to its table branch — a container query at print width is unprovable, and the narrow branch is **a different document**, not a broken layout. **Dark print is fixed in `theme.js`, not `@media print`** — the latter means a verbatim second copy of ~71 tokens; restoring **re-reads storage**, so System stays System. **`body { color: var(--color-fg) }`** — until it existed, uncoloured text inherited BLACK, ~1.06:1 on the dark page; `GradeValue` returns to pure inheritance and one DataTable call site moves to `fg-secondary`, accepted. `ssr-ui-d` **32/32**, and it states that **print layout is proved on paper, never by SSR** (§18). oxlint caught `Date.now()` in a render body — **impure, so the same props could produce two documents**. Smoke 20/20. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-25 (tenth batch, the pre-Stage-5 #2 docs pass)

> Verbatim, exactly as they stood in CLAUDE.md's CHANGELOG table. Dated rows
> are never edited; the full rows are in `docs/CHANGELOG.md`. Moved as the
> documented overflow valve — this pass adds the #2 stub, a §12 rule and an
> open school question, none of which may be trimmed. Three rows, the
> oldest — the third moved after the first measure came in at +141 bytes.

| 2026-09-25 | **UI-C1b** (`388bf9d`): 14 DATE sites, two Birthday fields, `sectionOptions` → `{ value, label }`, `backupAge`. **The DATE work was consistency only as filed; `backupAge` was a live defect** — elapsed 24h blocks called a 23:00 backup read at 01:00 "today". **`new Date(null)` is the EPOCH**, caught by a proof assertion no render could have made. **A date sweep starts from the SCHEMA** — a client grep missed `birthday`. `ssr-dates` 25 → **46** (both zones, 48 DEV), `ssr-ui-c2` **39**. Smoke 19/20; **the flake's diagnostic fired at last** — `/auth/me` on `localhost`, and `netstat` says both stacks are bound, so the lead is `node --watch` restarts. |
| 2026-09-23 | **DV1b-a** (`4b7508e`): 14 consumers → `renderCard`, four families (§16); `admin/GradesPage` carries JSX as a **declared exception — §3 outranks data-only**. Proof 87/87. **Three findings, none fixed**, incl. a regression I introduced: **at 390px a parent cannot reach the decline reason**. |
| 2026-09-23 | **DV4** (`feat/dv4-dashboards`, `6d5034e` + `8adebc3`): parent dashboard elevation and the dark amber. **The rust cast was a HUE shift, not a lightness one** (`#461901`, hue 46, against light amber at ~95); five asserted pairs re-measured, light mode untouched, and the other two dashboards follow **through the token alone**. **Browser check FAILED first pass, four findings** — the hero average **invisible in light mode**; the KS1 hero showing **"Term 3 · C"** from a latest-term-with-data walk; weekend and not-recorded near-identical; an orphan caption. Rules in §12 and `docs/FRONTEND_CONVENTIONS.md` §15/§3a. Proofs 23/23 then 26/26, oxlint 43, `test:dashboard` 77/77. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-25 (ninth batch, the UI-E docs pass)

> Verbatim, exactly as it stood in CLAUDE.md's CHANGELOG table. Dated rows
> are never edited; the full row is in `docs/CHANGELOG.md`. Moved as the
> documented overflow valve — this pass adds a §20 pointer and closes UI-E,
> and the pointer may not be trimmed. One row, 1,435 bytes.

| 2026-09-23 | CR3a + CR3 **docs pass** (`docs/class-summary`), covering three build dispatches. API_REFERENCE: `subjects.display_order` and the **null-last idiom** (MySQL sorts NULL first — without the leading term a MIXED grade level puts its unordered rows first); **`GET /assignments`' default follows the order, `sort=subject` stays A-Z**; the class summary's three-way scope (**a nonexistent section is the SAME 404 as "not yours"**), **two flags**, `general_average` **absent not null** in KS1, **no pagination — a document, not a list**; and **`TEACHER_ADVISES_CLASS_SQL` beside `TEACHER_VIEW_SCOPE_SQL`**, because routing grades through `students` would hide an EMPTY class from an assigned teacher. Counts **88 handlers / 89 endpoints**. GRADING_SPEC **§6d-i** — where each order came from, and a correction: **Grade 5 never fell back to alphabetical**. FRONTEND_CONVENTIONS **§14** — **a letter is not a number** (`TermValue`, never `GradeValue`, or every Grade 1 letter reads "— N/A"), **Pending ≠ N/A**, and **a self-fetching page cannot be SSR-proved**, so what must be proved is extracted and exported. KNOWN_ISSUES: the **shell-row trap**. Baselines 44 / 247 / 62 / 59, oxlint **43**. **CR3a and CR3 ticked — the grades track is complete**; pre-Stage-5 gains the `test:restore` sub-second fix and the Back-button decision. **The stub reserve was spent as designed** — four rows to ARCHIVE after this file hit 137,804. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-25 (eighth batch, the UI-D-2+3 docs pass)

> Verbatim, exactly as it stood in CLAUDE.md's CHANGELOG table. Dated rows
> are never edited; the full row is in `docs/CHANGELOG.md`. Moved as the
> documented overflow valve — this pass adds a §19 pointer, a queue
> re-ordering and a pre-Stage-5 item, none of which may be trimmed. One row,
> 1,326 bytes.

| 2026-09-22 | CLAUDE.md trim, sixth batch: **136,830 → 135,119 on disk (−1,711)**. Six blocks measured and guard-grepped first; **the guard cleared more of this batch than any previous one, because these were duplicates rather than condensed rules.** `### Corrections` → rule-plus-pointer (both its live rules already live elsewhere in this file); **the "75 role-facing views" figure now appears ONCE**, in BUILD ORDER → Stage 4. `## SAFE TO BUILD NOW` (**zero guard hits**) emptied, heading kept with a **do-not-repopulate** note. `## GET /api/messages/contacts` keeps its two rules (**`?search=` is scoped, never an unscoped user search**; ACTIVE-only) and loses the archived detail. **Two closed BLOCKED items left permanently under the REFILL RULE** — the Stage G1a schema issue (zero hits; live text is GRADING_SPEC) and Excuse Letters (keeping **approval must not modify `attendance`**). **TWO STALE CLAIMS corrected:** the seeded weights were still called "provisional until G1b lands" (**G1b landed 2026-09-05**), and the parent modal's silence about the Grade 1 letter still rested on "until the school answers" (**answered and built 2026-09-22**) — recorded as a choice now needing a deliberate answer, not flipped. **Not taken:** the CHANGELOG stub table, the next trim's overflow valve. No `##` heading changed. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-25 (seventh batch, the UI-D-1 docs pass)

> Verbatim, newest first, exactly as they stood in CLAUDE.md's CHANGELOG
> table. Dated rows are never edited; every full row is in
> `docs/CHANGELOG.md`. Moved as the documented overflow valve — the UI-D-1
> docs pass had a net ≤ 0 budget, and what it adds is a new §18 pointer plus
> two live queue entries, neither of which may be trimmed. Two rows,
> 2,585 bytes.

| 2026-09-22 | CLAUDE.md trim, fifth batch: **135,967 → 134,080 on disk (−1,887)** — the blocks gave up 3,112 and this row costs about 1,200 of it back. Candidates 5, 6 and 7 — ~11,708 bytes offered, **the live-rule guard released about a quarter**. **§11 and §12 barely moved, and the reason is new: `docs/FRONTEND_CONVENTIONS.md` STOPS AT §10**, so this file is their only present-tense home and all eleven rules stayed; §12's per-card isolation, no-red, fraction-only, check-the-handler and recent-activity rules returned **zero** hits anywhere. The two attendance BLOCKED / RESOLVED subsections **left permanently under the REFILL RULE** (fully covered — GRADING_SPEC, ARCHIVE 512/2142/2638, and "Late counts as present" was **already in this file at line 1902**). The 2026-09-18 admin SCOPE DECISION had **no archived home** and moved out verbatim; **`Grade lock AND unlock are admin only` had zero hits** and stays word for word. **One STALE CLAIM corrected:** Parent → Attendance was still described as showing a percentage — **DV2 deleted it on 2026-09-20**. Trim-6 candidate found and left alone: `### Corrections` is duplicated in this file and `docs/FRONTEND_CONVENTIONS.md`, with no pointer. |
| 2026-09-22 | Class record CR0–CR2 **docs pass** (`docs/class-record`): API_REFERENCE gains the two endpoints — slot addressing by `slot_id` **or** `type` + `slot_no`, `dry_run`, `group_hps`, `can_encode`, **locked is `409` and all-or-nothing**; **route order is load-bearing** (both registered before `GET /:id`). GRADING_SPEC **§6e** — **USED is the HPS, not the row**, and a used slot with no score makes that learner's group **Pending, never left out and never zero** (leaving it out silently RAISED an absent learner's grade). FRONTEND_CONVENTIONS **§13** — Teacher → Grades IS the grid, the client never computes a grade, the **sticky learner COLUMN** as DV1b's precedent, the pure `buildPayload.js`, and **a failed build can run the PREVIOUS bundle**. Counts recounted: **23 tables, 87 handlers / 88 endpoints**, oxlint **41**. **Every suite re-run — EIGHT baselines were stale** (students 94, grades 239, attendance 60, content 96, users 61, backups 47, messages 80, excuses 92); `test:class-record` **117**. Three KNOWN_ISSUES rows (**Back button escapes the unsaved guard**; `test:restore`'s `iat` failure — **fix the test, not the comparison**; `test:recovery` needs `MAIL_TRANSPORT=file` **on the server**), decimal-scores row CLOSED. REFILL RULE applied to three closed items. **Item 6 corrected: the guess that the grid would take the `ScorePair` fix was wrong.** |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-24 (sixth batch, the SMOKE-1 docs pass)

> Verbatim, newest first, exactly as they stood in CLAUDE.md's CHANGELOG
> table. Dated rows are never edited; every full row is in
> `docs/CHANGELOG.md`. Moved as the documented overflow valve — the
> SMOKE-1 docs pass had a net ≤ 0 budget and the queue entries it adds are
> live plan, which is never trimmed. Three rows, 2,752 bytes.

| 2026-09-22 | Grade 1 docs: GRADING_SPEC §6a **DECIDED → BUILT**, its five predictions replaced by what each resolved to, plus a rounding note that is **not Grade 1-specific** (weighted parts round to 2 decimals before summing, so 89.99 → **90.00 → A** at every grade level). API_REFERENCE: `/descriptive` struck through as RETIRED, Grade 1 score writes documented, `initial_grade` on every report-card term **with the rule a parent client must not render it**, `final_grade` is **two types by mode**; counts **recounted from the code — 85 handlers / 86 endpoints**, the first endpoint removal since Contributions'. FRONTEND_CONVENTIONS §5a-v gains the **two-flags rule** and the render-time guard; §5h gains a fifth defect and the finding that **SSR cannot catch an undefined identifier inside an effect or callback body** (measured, 32/32 with the bug in place). The closed Grade 1 BLOCKED item **left to ARCHIVE under the REFILL RULE**. Suite preamble corrected **"fifteen/fourteen" → nineteen scripts / seventeen HTTP**. Class-record grid promoted to NEXT with **WHOLE NUMBERS ONLY — the server must refuse decimals at all four score writes**. Two KNOWN_ISSUES rows. |
| 2026-09-22 | Grade 1 computed letters, **client** (`05a9a68` → `39821dd`): the letter picker deleted, Grade 1 encodes like Grades 2-6 (Summative, not Examinations), a **Final letter** column and 390px segment, `showFinal`/`showGeneralAverage` split in two, the modal's legacy-row copy corrected. SSR 29/29 with a **renderer guard** proving no Initial Grade reaches a parent. **Browser check FAILED first pass — blank page for every teacher**, a call to a deleted setter that build, oxlint AND an SSR render all miss; **`no-undef` enabled** as the guard that works (needs `env.browser` + `scripts/**` `env.node`, then 0 findings and oxlint stays 44). Fixtures on Nino's EMPTY subjects only, whole-number scores; cleanup asserted every count and left the Seeded baseline exact. |
| 2026-09-22 | Grade 1 computed letters, **server** (`4f362aa`): one shared `BANDS` table so the letter and descriptor ladders cannot drift (verified at every score 0-100); `preflightGradeWrite` returns the mode it read; `recomputeGrade` bands the RAW Initial Grade and **throws** if the dual-mode invariant breaks; **`PATCH /:id/descriptive` RETIRED**; a Final letter from the three terms' Initial Grades, null for legacy rows; weights seeded for **every** grade level + a migration that aborts rather than overwrite. `test:grades` 197 → **212**, grade-computation 51 → **68**, verify-seed 33 → **34**. Two weak assertions of my own caught by failures — `DECIMAL(5,2)` stored 44.995 as 45.00, and a numeric STRING must band, since mysql2 returns every DECIMAL as one. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-22 (fourth batch, the Grade 1 docs dispatch)

> Verbatim, newest first, exactly as they stood in CLAUDE.md's CHANGELOG
> table. Dated rows are never edited; every full row is in
> `docs/CHANGELOG.md`. Moved because that dispatch added three stubs of its
> own and pushed CLAUDE.md past the 138,000-byte trim trigger — this is the
> documented mechanism, not a trim of its own. CLAUDE.md keeps the newest six.

| Date | Change |
|------|--------|
| 2026-09-21 | DV3 docs: `term_averages` in `docs/API_REFERENCE.md`; **§5a-v** (the ONE page that leaves DataTable, and why the exemption is narrow) and **§5a-vi** (its crossover is a CONTAINER query at 36rem — the **607px → 351px sidebar cliff** is why no viewport breakpoint can work; browser checks must measure the card, not the window). Four KNOWN_ISSUES rows; three OPEN QUESTIONS (sticky first COLUMN deferred to DV1b — **§5a-i does not close it**; the card's mixed units; Grade 1's printed order, now a school question). Pre-Stage-5 gains `subjects.display_order`, the 401-vs-network fix, CAL and a neutral fixture learner. `test:grades` corrected **167 → 189** (three dispatches stale). **One flag WITHDRAWN as false — `DELETE /grades/:id` does not orphan its components** (`schema.sql:487` cascades, proved during cleanup). |
| 2026-09-21 | DV3 review fixes (`fix/dv3-review`): **the GA row read "Pending" in all four columns because `term_averages` was never named in the unwrap list** — the interceptor copies only named keys, so a FORGOTTEN key is silently `undefined` while the guard protects only a RENAMED one. The card now measures itself (`@container`, `@min-[36rem]`) after the table rendered at 200% zoom in a 394px container. F5 proved NOT a defect (88% → IG 88.00 → transmuted 90); one sentence names the transmutation table, IG stays hidden. SSR 62/62 with a control that reproduces the defect verbatim and **caught a weak assertion of my own**. |
| 2026-09-20 | DV3 (`feat/dv3-grades`): Parent → Grades is the school's Learner's Performance Report — SF9 order from a client constant (`subjects` has **no display-order column**), no LRN, term status counted, the GA row INSIDE the table, legend, "Reading this report", term segments below the crossover. `GET /grades/student/:studentId` gained **`term_averages`**. `test:grades` 182 → 188, `test:dashboard` 75, SSR 50/50, one new contrast pair. |
| 2026-09-20 | DV2 docs: BUILD ORDER ticks DV2 and marks the "percentage copy" item CLOSED (the percentage is gone); the 390px Status select moves to DV1b. `docs/FRONTEND_CONVENTIONS.md` §5a-iv — **`format/date.js` is the only home for date maths**: identity is a `YYYY-MM-DD` string, a `Date` is for placement only, never `new Date(string)` or `toISOString()`. New KNOWN_ISSUES row and a **third OPEN QUESTION**: `POST /attendance/bulk` accepts weekend dates — are there Saturday classes? UI polish gains Settings → Personalization at 200% zoom. |
| 2026-09-20 | DV2 (client, `feat/dv2-attendance`): Parent → Attendance is a month calendar — `format/date.js` month maths, `AttendanceCalendar.jsx`, a summary panel, and a school-year table whose months are derived from data. **The percentage is gone; the fraction replaced it** and `presentOnRecordedDays` was deleted. A weekend record shows in an "Also recorded" strip and still counts. Browser check found five things, all fixed (summary position, pills overflowing at 200% zoom → word gated at `xl`, truncated excuse line → icon, copy, zero pills). oxlint 44, SSR 60/60. |

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-22 (third batch, the DV3 trim)

> Verbatim, newest first, exactly as they stood in CLAUDE.md's CHANGELOG
> table. Dated rows are never edited. **Every full row is in
> `docs/CHANGELOG.md`** — with ONE exception worth recording: the
> **Notifications N1 (server)** dispatch has no row of its own there (only N2
> and N3 do), so the stub below is its only surviving summary. CLAUDE.md keeps
> the newest five stubs.

| Date | Change |
|------|--------|
| 2026-09-20 | DV1 docs: `docs/FRONTEND_CONVENTIONS.md` §5 gains §5a-i (**the sticky table header is a CLOSED QUESTION**, with all three failure modes named so nobody retries it), §5a-ii (`nowrap`; never wrap an identifier) and §5a-iii (`renderCard`); short form in §5 here. BUILD ORDER: Data views split into DV1 (done) → DV2 → DV3 → DV4 → **DV1b last**, since DV2/DV3 replace the two parent pages outright. New UI polish list. Working agreement: never `git checkout --` on uncommitted work. |
| 2026-09-20 | DV1 (client, `feat/dv1-datatable`): DataTable restyle, `Avatar`/`PersonCell`, the `renderCard` card layout below `sm` (data not JSX; one interactive element per card), the `nowrap` column option, masked parent login ids in Admin → Users, six pages converted. **The sticky header broke three different ways across three browser checks and was dropped** — it cannot coexist with the in-table horizontal scroller. oxlint 44, SSR 58/58, all 22 consumers audited. |
| 2026-09-20 | Teacher attendance banner verified and DB2's one open check closed: Darryl moved the Windows clock to Monday 2026-09-21 09:00 (PH and UTC both Monday), saw amber "Not recorded" then green "Recorded — 1 present, 0 absent", and restored the clock. **This overrides his own "do not fake the date" line in DB2's entry — his call, recorded, not quietly done.** No code changed; the banner was unseen, not broken. Cleanup removed the one attendance row; the three `activity_logs` rows dated 2026-09-21 stay. |
| 2026-09-20 | Dashboards DB3 (docs): a Dashboard section in `docs/API_REFERENCE.md` (per-role payload, the thin-endpoint rule, the scope rule, and why the dashboards ask `GET /api/events` for ascending dates while the endpoint default stays DESC); counts move to **86 handlers / 87 endpoints**; new **§12** here; BUILD ORDER ticks Dashboards and keeps the Monday teacher-banner check open; two items added to Data views redesign (the Attendance intro naming an absent percentage, and Dark’s amber reading as rust); the single-admin lockout row corrected — **the app cannot create an admin**, so confirming the email is the only in-app remedy; new row on direct-insert fixtures firing no fan-out. |
| 2026-09-20 | Dashboards DB2 (client, `feat/dashboards`): three real dashboards, `Card.jsx` + `useCard.js`, each card owning its own loading/error/empty state with no bare `Promise.all`. Browser check passed with **one defect** — upcoming events were DESC, so a "next three" card returned the three furthest-away events backwards — plus four review corrections (hazard card red → amber, its impossible "create a second admin" link removed, the locks label now names its term, the hook moved to its own file). oxlint 44, SSR 36/36. Fixtures cleaned up; Seeded baseline confirmed. |
| 2026-09-20 | Dashboards DB1 (server, `feat/dashboard-api`): `GET /api/dashboard`, deliberately thin — only the teacher class-encoding progress, the admin counts and lock count, and the parent grades summary (A1: computed server-side with the report card’s own `roundTo2`). Recent activity dropped — no `activity_logs` read endpoint exists. `test:dashboard` 75/75 ×3. |
| 2026-09-19 | Account recovery R3 (docs): the five endpoints and the recovery flow's four deliberate silences in `docs/API_REFERENCE.md`, plus a new §5b for the two whole-session refusals; its Verification table **recounted from the code — 85 handlers, 86 endpoints** (it had drifted three ways at once, none from this dispatch, and Darryl's dispatch figure of 84 was an estimate); `auth_codes`' dump exclusion in `docs/RESTORE.md`; here, 21 → 22 tables and 80 → 85 handlers everywhere, new §11, the recovery line moved to done, and a queued **Data views redesign — mockup first**. One code file, comment only: `routes/auth.js` still described the abandoned timestamp mechanism. |
| 2026-09-19 | Account recovery R2 (client, `feat/account-recovery-ui`): `applyToken()`, routing on `must_change_password` and never on the 403, `/forgot-password` (two steps one route — the login id is an LRN, §5c), the forced-change screen outside `Shell`, Verify email in Settings, admin Reset password shown once. Browser check passed over real Gmail SMTP; **two defects found and fixed** — a stale own-email after editing your own row in Users, and three branches telling an admin to ask an office they ARE. oxlint 44, SSR 37/37 with a negative control. |
| 2026-09-19 | Account recovery R1 (server, `feat/account-recovery-api`): the 22nd table `auth_codes` via the repo's second migration, five endpoints, bcrypt-hashed 6-digit codes with DB-side rate limits, nodemailer, two timing mitigations, `auth_codes` rows excluded from every dump. **Amendment A1 landed on the third mechanism — a `token_version` counter**; both timestamp attempts are recorded in `middleware/auth.js`. `test:recovery` 62; every suite run because middleware changed; `test:auth` fixed to 56 under a declared scope expansion. |
| 2026-09-19 | CLAUDE.md section trim: 144,967 → 108,102 bytes. Five blocks moved verbatim to `docs/ARCHIVE.md` (the 81-row endpoint table as a dated snapshot — `docs/API_REFERENCE.md` §8 is the live record and was verified to hold all 81; `Files that exist`; the `client/src` tree; `sections table`; `Class Board`), each leaving its heading, a pointer and its conclusion. Ten per-file rules stated nowhere else stayed as "File rules that bite". §7c added to the companion and §9 to this file, closing two mirror gaps. |
| 2026-09-19 | Notifications N1 (server) + N2 (client): the 21st table via the repo’s first migration script, 4 endpoints, 7 fan-out hooks, `notification_counts`; the header bell, sidebar badges, LiveStatus ungated again. oxlint 42 → 44. |
| 2026-09-19 | Notifications N3 (docs only): the four endpoints, the two socket events and the text table in `docs/API_REFERENCE.md`; CLAUDE.md gains §10, the migration template pointer and the tree lines; tables 20 → 21, handlers 76 → 80, oxlint 42 → 44; six stale present-tense claims fixed, including §5g/§6, where `LiveStatus` is ungated for every role again; new §10 in `docs/FRONTEND_CONVENTIONS.md`, a restore-rewinds-read-state paragraph in `docs/RESTORE.md`, three dated KNOWN_ISSUES rows, and Notifications marked done in the progress mirror. |

---

## BLOCKED / RESOLVED → Attendance, the two subsections as they stood in CLAUDE.md until 2026-09-22

> Moved out under the REFILL RULE — a closed BLOCKED / RESOLVED item leaves
> CLAUDE.md permanently, in the dispatch that closes it. Both questions were
> answered and built long before the move; CLAUDE.md keeps the rules and a
> pointer here.
>
> **One sentence below is STALE and is preserved only because this is a
> record of what the file said.** The second subsection describes Parent →
> Attendance as showing "Present on recorded days" as a percentage, one
> decimal, half-up. **DV2 deleted that percentage on 2026-09-20** — the page
> shows the fraction, `presentOnRecordedDays` was deleted rather than
> exported, and §12 says the dashboard card shows the fraction only. The
> school's underlying rule (Late counts as present, Excused as absent) is
> unchanged and is still live.

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

### Attendance rate formula — RESOLVED 2026-09-13 (principal, in conversation) and BUILT

Not a Stage 3 blocker — `routes/attendance.js` stays counts-only by design
(see CHANGELOG, 2026-08-27); **the rate is a client computation over numbers
the server already returns.** The principal answered on 2026-09-13: **Late
counts as present; Excused counts as absent.** Parent → Attendance
(`/parent/attendance`) now shows **"Present on recorded days"** =
`(Present + Late) / total`, one decimal, half-up, beside the exact fraction.
`summary.total` is every recorded status row, so an excused day lowers the
percentage. **It is recorded days, not SF9 Class Days** — unmarked school
days are not in the table — which is why the label is not "attendance rate"
(§5i). Not rendered when `total` is 0. No verdict: no colour, badge,
threshold, or comparison to DO 015 para 71's ~12-absence intervention point
(§4). **DO 015 s. 2026 prescribes no attendance rate formula and no
attendance grade component** (para 71 is its only attendance rule;
Table 9's components are WW / PT / EX), so this is a school decision, not
a compliance question — never attribute the rule to DepEd in parent-facing
copy. Teacher attendance history is `/teacher/attendance-records`
(2026-09-12), not this parent page.

---

## ADMIN SCOPE AUDIT → the 2026-09-18 SCOPE DECISION, as it stood in CLAUDE.md until 2026-09-22

> The 2026-09-13 finding and its nav-item table are already above, under
> "ADMIN SCOPE AUDIT → nav vs. DFD, and the SCOPE DECISION" (verbatim as of
> 2026-09-18). **That copy still contains the line this decision supersedes**
> — "they stay `built: false` in `nav.js` exactly as they are" — because an
> archived record is not back-edited. The superseding text is below.
> CLAUDE.md keeps the decision's rules and a pointer here.

### SCOPE DECISION — admin nav trimmed to what exists (Darryl, 2026-09-18)

**Supersedes one line of the 2026-09-13 decision above** — "they stay
`built: false` in `nav.js` exactly as they are — do not remove them in a build
dispatch." Which admin screens get built is unchanged; what the sidebar shows
for the ones ruled out is what changes. The 2026-09-13 entry is not edited.

- **The five admin nav entries with no page are removed, not dimmed:**
  Sections, Excuse Letters, Memos, Events, Messages. A permanently dimmed row
  is not "not yet" — it advertises a page that was decided against, and
  `built: false` is defined as *unwritten*, not *refused* (§6). Memos is in
  the list because Admin → Announcements is the only place a memo can ever be
  written, and that page's own copy already says memos have no page of their
  own.
- **This reverses no build decision.** Nothing becomes buildable, no route
  appears or disappears, and no handler moves — the API still authorizes admin
  on excuse letters, messages and attendance writes.
- **Grade lock AND unlock are admin only.** Recorded as a decision, and it was
  **already true in code** before this dispatch: `PATCH /api/grades/:id/lock`
  (`routes/grades.js:1286`) is `authorize('admin')` and is the only route
  reaching the server's sole `UPDATE grades SET is_locked` (`:1334`). There is
  no separate unlock path — direction is the request's `is_locked` boolean —
  and Admin → Grades already renders both labels from one toggle. Nothing was
  widened or narrowed to satisfy this; it is written down so a later dispatch
  does not add a teacher-side lock as a convenience.
- **Defence answer unchanged** for Sections, Excuse Letters, Events and
  Messages: no Figure 5 process. Memos is covered by 1.18 on Admin →
  Announcements.

---

## STAGE 4 FRONTEND CONVENTIONS §11 and §12 — the reasoning clauses, as they stood in CLAUDE.md until 2026-09-22

> **The RULES did not move — they are still in CLAUDE.md, and they are still
> live.** `docs/FRONTEND_CONVENTIONS.md` stops at §10 and has no §11 or §12,
> so CLAUDE.md remains the only present-tense home for both sections. Only
> the reasoning sentences already recorded in `docs/API_REFERENCE.md` →
> Auth / Dashboard are below, kept verbatim so the argument is not lost.

**§11, rule 1 — the two timing mitigations.** "Two timing mitigations hold
the line the message draws: a miss burns a bcrypt, and the response goes out
before the SMTP call." (`docs/API_REFERENCE.md` → Auth carries both.)

**§11, rule 2 — why the timestamp failed.** "…because `iat` has one-second
resolution and a scripted flow fits inside one second."

**§11, rule 3 — why the order matters.** "…in that order, because the
interceptor reads storage per request."

**§11, rule 4 — the two exclusions spelled out.** "The server refuses every
other route with `code: 'MUST_CHANGE_PASSWORD'`, and that is a backstop for
direct API callers: §2 says a 403 never redirects, and the client already has
`user.must_change_password` from `/auth/me`. `/change-password` sits outside
`Shell` (a nav of pages the server will refuse is an interface that lies) and
outside `ProtectedRoute` (which is what redirects there)."

**§11, the office rule — where it was checked.** "All three email branches on
Settings → Account information…" (§5i, browser check 2026-09-19).

**§12, rule 4 — what A1 returns.** "…the latest term, 'N of M subjects
recorded', and an average returned ONLY when the term is complete."
(`docs/API_REFERENCE.md` → Dashboard, line 867.)

**§12, rule 6 — the worked failure.** "`GET /api/events` defaults to DESC for
the Events page, so a `limit=3` card without this returns the three
FURTHEST-AWAY events, backwards." (`docs/API_REFERENCE.md` → Dashboard, line
888.)

---

## BUILD ORDER → Grade 1 computed letters, the write-up as it stood in CLAUDE.md until 2026-09-22

> Moved under the REFILL RULE in the class-record docs dispatch. The rules it
> produced stayed in CLAUDE.md, under BLOCKED / RESOLVED → Grades and in
> `docs/FRONTEND_CONVENTIONS.md` §5a-v and §5h.

- [x] **Grade 1 computed letters — DONE 2026-09-22** (`feat/grade1-computed`,
      server + client, both browser-checked). The rule is
      `docs/GRADING_SPEC.md` **§6a**, now marked BUILT. **`PATCH
      /:id/descriptive` is RETIRED** — one write path for every grade level,
      and a letter cannot be set by hand; handlers 86 → 85. Grade 1 encodes
      WW / PT / three Summative parts through the same endpoints Grades 2–6
      use, and the server bands the raw Initial Grade with no transmutation.
      A **Final letter** averages the three terms' Initial Grades; a **legacy
      row keeps its letter and shows no Final**, which is correct. Teachers
      see the Initial Grade, **parents never do** — enforced by a render-time
      guard, not a review. Also: the seed now writes weights for every grade
      level, `scripts/migrate-grade1-weights.js` does the same to a live DB,
      and **`no-undef` was enabled** after the client half shipped a blank
      page an SSR render provably could not catch (§5h).

## BUILD ORDER → Grading fixes, the write-up as it stood in CLAUDE.md until 2026-09-22

> Moved under the REFILL RULE in the same dispatch. The rules are in
> `docs/GRADING_SPEC.md` §4a and CLAUDE.md §3.

- [x] **Grading fixes — DONE 2026-09-22** (`fix/grading-rounding`). **(a) A
      Final Grade is a WHOLE number** (`roundToWhole`, half-up); it was
      `roundTo2`, so a correct 89 displayed as 89.33. The **General Average
      keeps two decimals over the rounded finals** — 721/8 = 90.13 on the
      school's sheet — and the two precisions are a real distinction, not a
      bug (`docs/GRADING_SPEC.md` §4a). **(b) Display follows storage:**
      `GradeValue` gained an opt-in `whole`, `String(Number(x))` and **never
      `toFixed(0)`**, because from SY 2027-2028 a term grade inherits the
      Initial Grade's decimals (§3, KNOWN ISSUES). **(c) Grade 1's "Reading"
      → "Reading and Literacy"**, the only naming mismatch in 40 subjects,
      **renamed by a migration that UPDATEs rather than replaces** —
      `subject_id` cascades, so a delete would have taken Nino's two seeded
      letters with it. `test:grades` 189 → **197**.

  **CLOSED by DV2 (2026-09-20):** Parent → Attendance's intro used to say
  "The percentage counts Late as present…" **even when no percentage was on
  screen**, which was every account with zero recorded days. The percentage
  itself is gone — the page shows the fraction — so the copy had nothing
  left to overstate (§5i). Recorded here rather than deleted so the item is
  visibly answered.

## UI POLISH → item 1, the full entry as it stood in CLAUDE.md until 2026-09-22

> Closed by CR2. CLAUDE.md keeps a one-line struck-through entry and the
> pointer to `docs/FRONTEND_CONVENTIONS.md` §13a.

  1. **Teacher → Grades opens on a subject the teacher is not assigned, so
     the page loads with a red error** — "Araling Panlipunan (not yours)".
     **This is a defect, not cosmetic**, and it is first here for that
     reason: a normal page load showing an error trains people to ignore
     errors. The default should be the teacher's FIRST ASSIGNED subject
     from `GET /assignments`, which the page already fetches for its encode
     scope. Also a `docs/KNOWN_ISSUES.md` row.

**How it was actually closed, which is not what the entry proposed:** CR2 did
not change a default. The picker is built from the caller's own
`GET /assignments`, so a subject they cannot encode is **not in the list at
all** — not defaulted past, not disabled, because a disabled option still asks
the user to work out why.

---

## BLOCKED / RESOLVED → Known schema issue (Stage G1a), as it stood in CLAUDE.md until 2026-09-22

> Moved under the REFILL RULE in trim-6. A closed RESOLVED item leaves
> CLAUDE.md permanently. **The live text is `docs/GRADING_SPEC.md` → "Known
> schema defect — FIXED in Stage G1a"**, which carries everything below plus
> a warning this copy never had: the discarded `G1–3: 30/50/20` band scheme
> is **NOT** the Grade 1 rule, even though the numbers coincide with the
> weights confirmed on 2026-09-22 (§6a). That coincidence has already invited
> one misreading.
>
> **One sentence below is STALE and is preserved only as the record.** It says
> the seeded weight values are "still provisional … not the final state until
> G1b lands". **G1b landed on 2026-09-05**, the 40-row real curriculum is
> seeded, the 2026-09-22 Grade 1 work added weights for every grade level, and
> `verify-grading-seed.js` asserts all of it (34/34). Nothing about those
> values is provisional now.

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

---

## BLOCKED / RESOLVED → Excuse Letters module, as it stood in CLAUDE.md until 2026-09-22

> Moved under the REFILL RULE in trim-6 — both blockers were answered and
> built on 2026-09-05. **One rule stayed behind in CLAUDE.md** because it is
> stated nowhere else: approval is record-only and **must not modify
> `attendance` rows**.

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

> **Still open, and it did NOT move with this block:** that Stage 4 UI note
> was never built. Teacher → Excuse Letters has no "add a reason?" nudge on a
> decline. It is a UI-polish candidate, not a closed item, and is recorded
> here so the move does not read as completion.

---

## SAFE TO BUILD NOW — the section as it stood in CLAUDE.md until 2026-09-22

> Moved in trim-6. **Zero live-rule hits**: every sentence was a present-tense
> "X is built" restating CURRENT STATE, BLOCKED / RESOLVED or the endpoint
> record, which is exactly the one-number-one-place liability. CLAUDE.md keeps
> the heading and a pointer.

## SAFE TO BUILD NOW — done

Excuse Letters is fully built — `submit`, `mine`, `list`, `view`, `edit`,
and `review` (`PATCH /:id/review`, approve/decline) — see the endpoints
table and `routes/excuses.js` in Files that exist. Grades API is fully
built — write path plus `GET /`, `GET /:id`, `GET /student/:studentId`
(Stage G3, 2026-09-06). **Parent grade breakdown is built** (2026-09-11;
parents-see-raw-scores answered 2026-09-11 in conversation — see OPEN
QUESTIONS). Remaining Grades *policy* items that used to sit here
(three terms, both modes, three components, weights keyed by
`(subject_id, school_year)`, admin-only lock) are answered and already
built — see OPEN QUESTIONS. Admin screens wait.



---

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-23 (fifth batch, the CR3 docs pass)

> Four rows (2026-09-22), moved because CLAUDE.md reached its 138,000 trim
> trigger while the CR3 docs pass still needed a row of its own. The stub
> table is the designated reserve for exactly this; a stub is moved out when
> the file approaches its limit, never deleted. **Every full row is in
> `docs/CHANGELOG.md`.**

| Date | Change |
|------|--------|
| 2026-09-22 | CLAUDE.md trim, fourth batch: **135,687 → 130,947 on disk**. Four blocks COMPRESSED, none moved — the detail already lived in ARCHIVE, API_REFERENCE, RESTORE and FRONTEND_CONVENTIONS, proved by 18 greps first. **The ~124,000 target was NOT reached, and the live-rule guard is why:** the blocks held 38 keyword hits and **37 were rules with no other home here**, so they stayed verbatim and only the prose went. **Two STALE CLAIMS corrected rather than trimmed around** — the Grade 1 letter was still called "a MANUAL teacher judgment — an ASSUMPTION" and still listed as an open school question, both superseded by GRADING_SPEC §6a; open school questions four → three. New **REFILL RULE**: a completed stage or closed BLOCKED item leaves this file permanently in the dispatch that closes it. |
| 2026-09-22 | Grading docs: GRADING_SPEC gains **§4a (rounding)** and **§6a (the Grade 1 letter — DECIDED, NOT BUILT)**; its line-70 `G1–3: 30/50/20` is labelled **DISCARDED**, not the Grade 1 rule. API_REFERENCE gains the whole-vs-2-decimal contract; §3 gains `whole`. **Three KNOWN_ISSUES rows** — 14 backups carry the old `Reading` name; term grades go 2-decimal from SY 2027-2028; **the mid-year transfer attendance scope is INVERTED against the school's rule**, unreachable only because of a `400`. School facts in the front matter (**3506114 is the PHONE, not the School ID**). BUILD ORDER: grading fix ticked, Grade 1 letters and the class-record grid queued ahead of DV4, pre-Stage-5 gains four. Baselines 197 / 56 / 33. |
| 2026-09-22 | Grading fixes (`fix/grading-rounding`): **a Final Grade is a WHOLE number** (`roundToWhole`) — the card printed 89.33 where the school prints 89 — while the **General Average keeps two decimals over the rounded finals** (721/8 = 90.13). Display split at the CALL SITE, since one `toFixed(2)` served four kinds of value: `GradeValue` gained `whole`, set once in `TermValue`. **`String(Number(x))`, never `toFixed(0)`** — a stored 89.5 must not show as 90. **"Reading" → "Reading and Literacy"** by a migration that UPDATEs, because a delete would cascade Nino's letters away. `test:grades` 189 → **197**; the negative control caught **two weak assertions of my own**. |
| 2026-09-22 | CLAUDE.md trim, third batch: **141,099 → 128,050 bytes on disk.** Twelve CHANGELOG stubs, BUILD ORDER Stages 1–2, the AGENT SKILLS rationale and two Feature 7 narrative paragraphs moved verbatim to `docs/ARCHIVE.md`; Stage 4's 22 checkboxes, Stage 3 and the completed After-Stage-4 bullets compressed to ticked lists plus pointers. **Every moved block was grepped for a live rule first** — four Stage 4 page rules stated nowhere else were kept here, and §1 gained the DV3 lesson (**unwrap protects a RENAMED key, never a FORGOTTEN one**), which had lived only in a stub. **The Notifications N1 dispatch has no `docs/CHANGELOG.md` row of its own**, so its stub is its only record and was moved rather than dropped. New standing size rule at the top: report the delta every dispatch, justify over 2,000 bytes, trim at 138,000, never start above 142,000. |

---

## BUILD ORDER → After Stage 4, the COMPLETED items as they stood in CLAUDE.md until 2026-09-23

> Moved under the REFILL RULE in trim-7. Every item below is ticked and
> finished; CLAUDE.md keeps a one-line ticked summary per item plus a pointer
> here. **The QUEUED items were NOT moved** — DV1b, the UI-polish list, the
> pre-Stage-5 server fixes, the docs pass and Stage 5 are live plan and stay
> in CLAUDE.md in full. A live plan is never trimmed.

> **One rule did NOT come here with its item.** The Dashboards entry carries
> the only statement in the file that the three `activity_logs` rows dated
> 2026-09-21 — from Darryl moving the machine clock to verify the
> weekend-hidden teacher banner — are deliberate and **must not be
> "fixed"**. It has no other home, so it stayed behind in CLAUDE.md.

> **One claim here is STALE and is preserved only as the record.** The Data
> views preamble says Grade 1's A–E "stays as it is until the school
> answers" how the letter is produced. **The school answered on 2026-09-22
> and it shipped the same day** (GRADING_SPEC §6a); the report card renders
> a computed letter now. CLAUDE.md's copy was corrected rather than moved.

**Done (all 2026-09-18 / 2026-09-19):**

- [x] **Server hardening A, B, C** — validation · authorization · pagination.
- [x] **D1 design tokens · D2 dark mode · D3 brand + sticky chrome** — §8, §9.
- [x] **Empty-state duplicate fix** (§5f gained the rule).
- [x] **Login redesign** — brand split panel, moved onto `FormField`.
- [x] **Notifications, N1 server + N2 client + N3 docs** — the 21st table, four
      endpoints, seven fan-out hooks, the bell and the badges. §10.
- [x] **Account recovery, R1 server + R2 client + R3 docs** — the 22nd table
      (`auth_codes`), five endpoints, the `token_version` counter, the
      screens. §11. **The school question that used to block this was answered
      by Darryl, not the school** — self-service by email code with an
      admin-only temporary password as the fallback; answered, not dropped.


**Queued before Stage 5, in this order:**

- [x] **Dashboards, all three roles — DONE 2026-09-20** (DB1 server, DB2
      client, DB3 docs). `GET /api/dashboard`, the deliberately thin one, plus
      `pages/dashboards/Card.jsx` and `useCard.js`. The three pages no longer
      derive their content from `navForRole`. See §12.
      **The weekend-hidden teacher banner was verified by moving the machine's
      clock to Monday 2026-09-21 09:00 — Darryl's deliberate override of his
      own "do not fake the date" rule**, both states seen, clock restored.
      The three `activity_logs` rows it produced are dated 2026-09-21 and
      stay — **do not "fix" those timestamps.**
- **Data views redesign — MOCKUP FIRST, no code until it is approved.**
      Mockups exist and are approved (Darryl, 2026-09-20). Two rules every
      piece inherits and cannot bend: **no verdict badges anywhere** (§4 —
      the system counts and displays, it never concludes), and **Grade 1's
      A–E stays as it is until the school answers** how the letter is
      produced (OPEN QUESTIONS), so the report card must render both modes
      without implying the letter is computed.

  - [x] **DV1 — DataTable restyle + card layout below `sm`. DONE
        2026-09-20.** `Avatar.jsx`, `renderCard`, the `nowrap` option, masked
        parent login ids, six pages converted. **The sticky table header was
        dropped — do not reopen it** (§5, `docs/FRONTEND_CONVENTIONS.md`
        §5a-i). **Users filter tabs were NOT built:** the Role dropdown
        already does that job, and tabs with counts need a server change.
  - [x] **DV2 — monthly Attendance calendar. DONE 2026-09-20.** Parent →
        Attendance is a month grid; `format/date.js` gained the month maths
        (§5a-iv). **The percentage is gone — the fraction replaced it.**
        **The 390px Status select on Teacher → Attendance did NOT come with
        it** — a teacher ENCODE row is a form control, a different design
        problem from a display card; it stays with DV1b.
  - [x] **DV3 — SF9-style Grades report card. DONE 2026-09-21.** Parent →
        Grades is the school's printed Learner's Performance Report, and
        `GET /grades/student/:studentId` gained **`term_averages`** because
        the client may not compute a grade. **The one page that leaves
        DataTable** (§5a-v), and the one whose crossover is a container query
        (§5a-vi).
- [x] **Grade 1 computed letters — DONE 2026-09-22** (`feat/grade1-computed`).
      The rule is `docs/GRADING_SPEC.md` **§6a**; every live rule it produced
      is already under BLOCKED / RESOLVED → Grades above and in §5a-v / §5h.
      Write-up: `docs/ARCHIVE.md` → BUILD ORDER → Grade 1 computed letters.
- [x] **Class-record grid — DONE 2026-09-22** (`feat/class-record`, three
      dispatches). **CR0** the whole-number gate (`utils/validateScore.js`).
      **CR1** the 23rd table `assessment_slots`, `GET`/`PUT
      /api/grades/class-record`, `slot_id` on `grade_components`, the
      `dry_run` that rolls back. **CR2** the web grid — Teacher → Grades IS
      the class record now, and the per-learner `GradesPage.jsx` was
      **deleted**, not flagged. Four browser-check rounds, eight defects, the
      last two found only in review. Rules and pointers under Grades above;
      full record on the CHANGELOG rows.

      **The two that cost the most, kept because they generalise:**
      **defect 7** — a used slot with no score was being left out instead of
      making the learner Pending, which silently raised the grade of a learner
      who missed an assessment; I built it against the plan's explicit rule
      and then wrote a test asserting my wrong behaviour. **Defect 8** — the
      grid sent a payload no suite could produce, because every suite built
      its bodies by hand; closed by extracting `buildPayload.js` as a pure
      module the server suite imports (§13e).

- [x] **CR3a — `subjects.display_order`. DONE 2026-09-22** (`feat/subject-order`).
      The printed order left the client constant for the database; migration,
      schema, seed, `ORDER BY` everywhere. Rules under Grades above;
      `docs/GRADING_SPEC.md` §6d-i.
- [x] **CR3 — the adviser's class summary. DONE 2026-09-22/23** (server
      `feat/class-summary`, client `feat/class-summary-ui`). **The grades
      track is complete.** Read-only, adviser-scoped, drill-through to
      `ReportCard` reused unchanged. Rules under Grades above; the page is
      `docs/FRONTEND_CONVENTIONS.md` §14. **It needed a server change first**
      — the adviser could not read their own section's grades at all.

- [x] **Grading fixes — DONE 2026-09-22** (`fix/grading-rounding`): the
      whole-vs-two-decimal split (`docs/GRADING_SPEC.md` §4a, §3 here) and
      Grade 1's "Reading" → "Reading and Literacy" by a migration that
      UPDATEs. Write-up: `docs/ARCHIVE.md` → BUILD ORDER → Grading fixes.
      **CLOSED by DV2 the same way:** Parent → Attendance's percentage copy —
      the percentage itself is gone, so there was nothing left to overstate.

  - [x] **DV4 — dashboards + the dark amber.** In Dark the amber card fill
        reads as rust/brown and edges toward "danger", undoing §12's
        amber-is-not-a-verdict rule exactly where it matters. Tune the dark
        amber surface token toward a clearer amber — **mockup first**, and
        re-run `lint:contrast`, since that token has passing pairs today.
        **Also takes the `Stat` precision inconsistency (2026-09-22):**
        `Card.jsx`'s `Stat` prints `{value}` with no formatter, so a general
        average of 87.5 reads **`87.5`** on the dashboard against the report
        card's **`87.50`** — same number, two spellings, two screens.

---

## OPEN QUESTIONS → two school questions ANSWERED 2026-09-23, as they stood in CLAUDE.md

> Moved under the REFILL RULE in the DV4 docs addendum. Both were answered by
> the school on 2026-09-23 and each now holds one line in CLAUDE.md's answered
> list. The text below is the question as it stood while open — it records
> what was unknown and why, which is the part a later reader cannot
> reconstruct from the answer.
>
> **Neither answer is a written policy.** Do not cite either in the manuscript
> as documented school policy, and do not re-ask them.

### What order do the learning areas print in on a Grade 1 report card?

Asked 2026-09-21, because DV3 had to pick one. The SF9's eight
intermediate rows are recorded for Grades 4–6 (`docs/GRADING_SPEC.md` §6c),
but **no printed order exists anywhere for Key Stage 1**. Grade 1 uses
Makabansa, Mathematics, GMRC, Reading and Literacy, Language — the **class
program**, a timetable, not the report card. **Only Grades 2 and 3 fall
back to alphabetical** (`display_order` NULL); an earlier version of this
line also named Grade 5, which was wrong — 5 has the Key Stage 2 order like
4 and 6, and always did. **Since CR3a the order lives in
`subjects.display_order`, not in a client constant**, so the school's answer
is an UPDATE, not a code change. A one-line answer settles Grades 1, 2 and 3.

> **Answered 2026-09-23.** Grade 1's order and the Key Stage 2 order for
> Grades 4-6 are **confirmed, no longer provisional** — the values already
> seeded were right. Grades 2 and 3 were given for the first time: **G2**
> Makabansa, Mathematics, GMRC, English, Filipino; **G3** English,
> Mathematics, Science, Filipino, Makabansa, GMRC. Setting their
> `display_order` is a SEED change and is queued with the pre-Stage-5 fixes,
> not done here — until then those two grade levels keep the `name ASC`
> fallback, which is correct rather than broken.

### Who owns old attendance after a mid-year section transfer?

Still unanswered. PUT `/api/students/:id` refuses a class change
(`400`). That is a gate, not a transfer. Attendance *rows* key on
`student_id` (history would follow the child); *who may record*
keys on `students.section_id`. Rewriting the FK without an answer
would move that authority — the exact write the gate exists to
refuse. Do not add a transfer endpoint until this is answered.

> **Answered 2026-09-23, and it confirms the code is INVERTED.** The **old**
> adviser owns attendance recorded before the transfer; the **new** adviser
> owns it from the transfer date; the **parent sees the whole school year**
> either way. Today's scoping keys "who may record" on the learner's CURRENT
> `section_id`, which hands the old adviser's records to the new one — the
> defect `docs/KNOWN_ISSUES.md` already records, unreachable only because the
> `400` gate refuses the transfer at all.
>
> **Handover is OUTSIDE the system.** The old adviser prints the learner's
> pre-transfer attendance and hands it over; there is no in-app share, and
> none should be built. **The requirement this places on the pre-Stage-5 fix:
> the old adviser must still be able to VIEW and PRINT that learner's
> pre-transfer records after the move** — so the fix cannot simply re-point
> scope at the new section and drop the old adviser's access.

---

## UI polish — the eight CLOSED items, moved from CLAUDE.md on 2026-09-23

Under the REFILL RULE. These are items 1, 3, 6, 7, 8, 9, 10 and 13 of the
UI-polish list opened 2026-09-20, verbatim as they stood in `CLAUDE.md` when
each was closed, with the closing dispatch named. The list that remains in
`CLAUDE.md` holds only what is still open.

**1 and 3 were already struck through in place** before this move; 6, 7, 8,
9, 10 and 13 were closed by **UI-A** (`7beef97` + `13eebea`, 2026-09-23,
browser check passed).

```
  1. ~~Teacher → Grades opens on an unassigned subject and loads with a red
     error~~ — **CLOSED by CR2 (2026-09-22)**, at the root: the picker is
     built from the caller's own `GET /assignments` (§13a).
  3. ~~Teacher → Attendance's Status select is narrow and off-screen at
     390px~~ — **CLOSED by DV1b-b**: the select is gone at both breakpoints.
  6. **The parent breakdown modal still prints raw scores as "46.00/50.00"**
     (2026-09-22, re-confirmed after CR2). **The grid did NOT take this** —
     the guess that it would was wrong: the grid has its own cell renderer and
     never imports `ScorePair`. Every stored score is a whole number now
     (CR0), so every one of them prints with two dead decimals on the one
     screen parents read. `ScorePair` in `parent/GradesPage.jsx` needs the
     same `String(Number(x))` treatment as `GradeValue`'s `whole` — **never a
     rounding one**, because a legacy row may still hold `42.5`.
  7. **`GradeValue` should INHERIT its colour, not hardcode `text-fg`**
     (2026-09-23). On the navy parent hero the average was invisible in light
     mode until DV4 passed `className="text-primary-fg"`, and **that works
     only because of stylesheet order** — the proof asserts it, but a
     component that sets no colour would need no assertion at all. The fix is
     in `format/grade.jsx` and touches every caller, so it is its own small
     dispatch. §3a.
  8. **Raw ISO dates on the dashboards** (2026-09-23). The parent hero prints
     "Absence on 2026-09-21" and the teacher events card shows the bare
     `event_date`. `format/date.js`'s `longDate()` exists for this and the
     parent events card already uses a tile. **Format only — never compute**
     (§5a-iv).
  9. **The admin System card wraps "(Term 1)" onto its own line**
     (2026-09-23), so "Grade records locked" and its term read as two
     statements. A `nowrap` on the term fragment, not a narrower label.
  10. **The class-record Save confirmation may now name bonus points**
     (2026-09-23): *"Scores above the highest possible score are saved as
     typed. Check that each is a bonus, not a typing mistake."* The over-HPS
     listing stays; behaviour does not change.
  13. **"Recorded" is a COLUMN header AND another column's VALUE on
     Teacher → Attendance** (2026-09-23). Rename the column ("Saved as");
     keep both — §5b is why.
```

**Three of them did not close the way they were written, and the difference
is the part worth keeping:**

- **Item 7 was not implemented as stated.** "Drop `text-fg` and inherit"
  regresses dark mode: nothing in the app sets a base text colour — no rule
  on `body`, `#root` or in `@layer base` — so *inherit* resolves to the
  browser default, black. `DataTable` survives it because its `<td>` sets
  `text-fg-secondary`, but the three grade-heavy screens build their own
  tables and set none at all. What shipped is `className || 'text-fg'`: the
  default is unchanged everywhere, and when a caller names a colour the
  default is **not emitted at all**, so the stylesheet-order race the item was
  actually about is gone. **Pure inheritance is queued behind a base colour,
  in UI-D.**
- **Item 8 named two spots; there were three**, plus the week strip's
  `aria-label`s, which a screen reader otherwise reads as a run of digits and
  dashes. The parent dashboard stated the same absence fact **twice**, which
  is why the fix became one `AbsenceLine` component rather than two edits.
- **Item 6 cannot be seen on the seeded data.** All five of Nino's grade rows
  are legacy — a letter with no scores behind it — so the breakdown modal has
  nothing to print and there is no `46.00/50.00` on screen to watch change.
  It is covered by the proof's thirteen assertions instead. Creating a real
  breakdown needs `PUT /class-record`, which is the shell-row trap.

---

## UI polish — item 2, and UI-B's two planner items, moved from CLAUDE.md on 2026-09-23

Under the REFILL RULE, closed by **UI-B** (`8bb2632` + `2ef4da8`, browser
check passed). Item 2 is verbatim as it stood after UI-A's docs pass
corrected it; **P1 and P2 never had CLAUDE.md text** — they were planner
additions to the UI-B dispatch and are recorded here so the pair is not
re-derived from the code later.

```
  2. **A person cell's secondary line repeating a column already on screen.**
     **CORRECTED 2026-09-23: the old note said DV1b-a closed this and
     `admin/StudentsPage` was the last. DV1b-a added CARDS and never touched a
     table cell.** Three table spots remain — `admin/StudentsPage` and
     `teacher/StudentsPage` (class, beside Grade & section) and
     `admin/UsersPage`'s all-users table (email, beside Email — **keep the
     `'You'` case, drop only the email**). Its parents table is NOT one: no
     Email column there. **Cards keep their subtitle** (§16). UI-C.
```

**P1 — delete the dead `actions` block on the parent excuse-letter card.**
DV1b-b moved Edit to `actions`, reported it as done, and it never rendered:
`DataTable`'s `Card` renders `actions` only on its static branch — no `to`,
no `onSelect` — because a button beside a primary action would be a button
inside one (§5a-iii). The prop was inert for a whole dispatch. Edit lives
inside the reading view, Pending only, which is where it already was.

**P2 — harden card proofs so they render through the real `Card` rather than
asserting source text or a returned object.** `scripts/ssr-cards.jsx`, 31/31.
The scope was argued down deliberately and the reasoning is the part to keep:
**thirteen of the fifteen card definitions are inline props on self-fetching
pages**, so extracting all of them would have been a dispatch of its own for
little gain — the defect class is a property of `Card`, provable once. What
shipped instead is that single proof plus a **DEV guard in `Card`** that
fires at runtime on the same mistake, covering the thirteen the proof cannot
reach. `ssr-dv1b-b`'s five source-text letter assertions were deleted rather
than relabelled (35 → 30), and `ssr-dv1b-a` dropped the two letter pages from
its status loop (87 → 83, four assertions, two per page).

**The audit P2 was given returned zero**, as expected: after P1, no card
passes `actions` together with `to` or `onSelect`. Six cards carry `actions`
— `admin/AnnouncementsPage` (×2), `admin/BackupsPage`, `admin/UsersPage`,
`teacher/AnnouncementsPage`, `teacher/EventsPage` — and every one of them is
a static card with peer actions, which is the sanctioned shape.

### UI-C1's entry — moved from CLAUDE.md on 2026-09-25

Under the REFILL RULE, closed by **UI-C1a** (`5125b07`, browser check
passed). What remains of it is **UI-C1b**, which is consistency only; the
part that was a live bug is done.

```
  - [ ] **UI-C1 — every date the app renders.** Item 14 is one symptom:
    UI-A converted the dashboards to `longDate()`, so **one letter now shows
    two formats** depending which screen names it. **Audit every list, card,
    table cell and modal**, all roles — the dashboards were not the whole
    set, and item 14 exists because nobody checked. Format only, never
    compute (§5a-iv). Table cells get a new `shortDate()` — **"22 Sep 2026",
    approved** — and **sorting cannot be affected**: `DataTable` sorts on the
    row value (`:219`), never the rendered output.
    **INVESTIGATE FIRST:** the exact wire format of `created_at` and of DATE
    columns. `shortDate`/`longDate` must render the **Philippine calendar
    date** — prove a 07:00 PH post shows that day, not the day before.
    **Then** the two message threads join, with a `dateTime()` helper.
    **Also carries:** the smoke warm-up (`client/e2e/auth.js`) for the
    first-call failure, and `.ssr-tmp` in oxlint's ignore list so a lint run
    never depends on someone remembering to delete build output.
```

**The INVESTIGATE-FIRST line earned its place and is the reason this landed
correctly.** The investigation measured the wire format instead of assuming
it — writing a known 07:00 PH timestamp, reading it back, and watching
`.slice(0, 10)` return the previous day — which is how a "formatting
inconsistency" turned out to be a live defect affecting a third of every day.

**The warm-up it also carried was a dead end, and that is recorded rather
than quietly dropped:** `globalSetup` runs in Node and the failure is in
Chromium, so Node cannot warm a browser that has not started. Reverted; a
`requestfailed` diagnostic replaces it. `docs/KNOWN_ISSUES.md` has the row.

### UI-C1b's entry — moved from CLAUDE.md on 2026-09-25

Under the REFILL RULE, closed by **UI-C1b** (`388bf9d`, browser check passed
1-9). **UI-C is complete with it**, and item 14 closes with it.

```
  - [ ] **UI-C1b — DATE-column formatting, plus two leftovers.** No bug:
    `dateStrings: ['DATE']` protects these, so it is consistency only.
    **Item 14** — `shortDate()` on every column still printing raw
    `YYYY-MM-DD`, `longDate()` in cards and modals. **Sorting is safe**:
    `DataTable` sorts the row value (`:219`), not the render. **Plus** the
    Section options reading `Grade 6 - Malikhain` (value stays the bare
    name — the server scopes on that VARCHAR), and **`backupAge()`**
    (`AdminDashboard.jsx:34-39`), which counts elapsed 24h blocks and calls
    it "today": a 23:00 backup seen at 01:00 is 2 hours old and reads
    "today" when it was yesterday. **Manila calendar days, not subtraction.**
```

**"Consistency only" held for fourteen of the sixteen sites and was wrong
about the third leftover.** The DATE columns really were safe —
`dateStrings: ['DATE']` had been doing its job — but **`backupAge` was a
live defect of the same family as C1a's**, one level up: it answered a
question about dates by measuring a duration, so every backup taken after
16:00 and read the next morning reported itself as today's. The lesson is
that a queue item's own framing is a prediction, not a finding, and the two
non-DATE leftovers were bundled in precisely because nobody had looked yet.

**A second defect surfaced only because the proof was written to drive the
helper directly.** `manilaDayKey` tested `Number.isNaN(new Date(value))` and
nothing else, but **`new Date(null)` is the epoch** — a missing `created_at`
would have become 1 January 1970 and reported itself twenty thousand days
old. The page never reached it (`backupAge` guards `!createdAt` first), so
no render and no browser check could have found it; the assertion
`calendarDaysAgo(null) === null` did. §5a-iv carries the rule.

**Three things the entry did not predict, all recorded on their own:**

- **The date sweep's source was wrong.** A client grep of known field names
  missed `birthday`, a DATE column on both StudentDetailPages. The rule is
  now §5a-iv: **start from the schema's DATE and TIMESTAMP columns.**
- **`sectionOptions` had to change shape, not just wording.** Returning
  `{ value, label }` was the only way to give the label the grade while the
  value stayed the bare section name the server scopes on. Uniqueness across
  the 23 sections makes a bare name a correct KEY; it never made it a
  readable LABEL.
- **`ssr-cards.jsx` fell outside the whitelist and had to be asked for** —
  it asserts the parent letter card's title, which this dispatch changed. A
  proof that renders a component is coupled to that component, and a
  whitelist drawn from the pages alone will keep missing one.

### UI-D (a) and (b) — moved from CLAUDE.md on 2026-09-25

Under the REFILL RULE, closed by **UI-D-1** (`7513457`, paper check passed
1-9). (c) and (d) stay open in the queue and need a mockup first.

```
  **(a) There is NO print CSS in the client** — not one `print:` variant, not
  one `@media print`. On paper, 2026-09-23: Teacher → Class summary printed
  the **sidebar, top bar and Term select**, and **`overflow-x-auto` CLIPPED —
  5 of 8 subjects and the Average column missing, scrollbar printed.** The
  school accepts a printout as the Summary of Grades. **The clipped scroller
  first:** chrome on the page is ugly, a missing column is wrong.

  **(b) Nothing sets a base text colour** (no `body`, `#root` or `@layer
  base` rule), so an element that sets none inherits black — invisible in
  dark. `DataTable`'s `<td>` hides this; the three screens with their own
  tables do not. **With a base colour, `GradeValue` returns to pure
  inheritance** and UI-A's `className || 'text-fg'` comes back out (§3a).
```

**"The clipped scroller first" was the right instinct and an incomplete
diagnosis.** Releasing `overflow-x-auto` alone would have changed nothing,
because the table is also `min-w-max` — it never compresses, so it would have
overflowed the sheet instead of being clipped by the wrapper. Both halves,
plus wrapping the headers, are what make the columns fit. Every rule is
`docs/FRONTEND_CONVENTIONS.md` §18.

**Three things the entry did not anticipate:**

- **`@page` cannot be scoped by a selector**, so "landscape for this page
  only" is not a CSS question but a mounting one — a `<style>` that lives as
  long as the route. The named-page alternative fails in Firefox, and
  **Safari ignores `size` entirely**, which only became acceptable once
  `min-w-max` was released and a portrait sheet came out cramped rather than
  cut.
- **The report card's container query could not be trusted at print width.**
  The arithmetic said its table branch would win; nothing could prove it, and
  the failure mode was not a broken layout but a DIFFERENT DOCUMENT. Forced
  with `!important` rather than a `print:block` utility, because those two
  variants have equal specificity and stylesheet order would have decided it
  — §3a's lesson arriving in a new place.
- **Dark print belonged in `theme.js`, not in `@media print`.** The media
  query route means a verbatim second copy of ~71 custom properties; the
  attribute swap means one. The part worth keeping is that restoring
  **re-reads storage** instead of remembering, so System comes back as System
  and re-resolves against the OS.

**And one defect found by lint rather than by review:** `Date.now()` in a
render body is impure, so the same props could produce two documents. §18i.

**A second whitelist miss in as many dispatches** — `ssr-ui-a.jsx` this time,
whose line-51 assertion was the exact inverse of what UI-D shipped. That is
now a working-agreement rule in CLAUDE.md: a whitelist includes every proof
that renders a touched module, and a PLAN ONLY greps for them.

### Item 5's entry, and the UI-polish queue's header — moved from CLAUDE.md on 2026-09-25

Under the REFILL RULE, closed by **item 5** (`2000499`, browser check
passed). **The queue is complete with it**, fourteen items across UI-A, UI-B,
UI-C, UI-D, UI-E and this. Rules: `docs/FRONTEND_CONVENTIONS.md` §21.

```
  - [ ] **Item 5 — a Pending result set while the Status select reads
    Approved. MOCKUP FIRST, which is why UI-E now goes BEFORE it** (Darryl,
    2026-09-25): UI-E needs no mockup, so it proceeds while item 5's is
    designed in parallel.
    **DIAGNOSIS CORRECTED 2026-09-23: not the §5f violation it was filed as** —
    that page's empty copy already has one branch per applied value. The
    filter is **submit-gated**: the select writes form state, the list and the
    copy read `applied`, and nothing says they differ until Apply. **§5b one
    level out, and NINE pages do it** (teacher Announcements / Attendance
    records / Events / Excuse Letters / Students, admin Announcements /
    Attendance / Students / Users). No precedent for the affordance.
```

**This entry was re-diagnosed once and re-scoped once, and both corrections
are the reason it landed cleanly.** Filed as a §5f empty-state violation;
that was wrong, and the 2026-09-23 correction is preserved above. Then
scheduled ahead of UI-E and moved behind it, because UI-E needed no mockup
and this did.

**"No precedent for the affordance" was accurate and incomplete.** There was
no precedent for the CUE — and there was a strong one for the other half of
the answer: `parent/EventsPage` already carried the rule in its own words,
*"one control that refetches on change has no state worth staging"*, with
`parent/ExcuseLettersPage` and `admin/GradesPage` following it. The
inventory found that before any code was written, which is what let
`teacher/AnnouncementsPage` lose its Apply rather than gain a cue it did not
need.

**Three things the entry did not foresee, all found by the inventory:**

- **The nine were not alike.** One bounded select, five with a date range,
  three with free text — so a single rule ("auto-apply selects") would have
  been wrong on at least three pages. The mockup covered three shapes.
- **`teacher/AttendanceRecordsPage` had a live defect underneath.** Its
  Section select bypassed `applied` while being a `load` dependency and never
  reset the offset, so switching section on page 3 refetched the new section
  at offset 100 — against that page's own C6 note.
- **No page could tell whether its draft was dirty.** All nine `canReset`
  flags read `applied`, never `draft !== applied`, so the value the cue needs
  did not exist anywhere and had to be built.

**And one thing that could not be checked on screen:** the Seeded baseline
has zero announcements and zero attendance rows, so the `setOffset(0)` paths
this dispatch added have no second page to be on. Recorded in
`docs/KNOWN_ISSUES.md` rather than claimed.

### UI-E's entry — moved from CLAUDE.md on 2026-09-25

Under the REFILL RULE, closed by **UI-E** (`3086086`, browser check passed).
Rules: `docs/FRONTEND_CONVENTIONS.md` §20.

```
- [ ] **UI-E — a teacher's read-only letter view, after UI-D, BEFORE Stage 5.**
      `details` and `teacher_remarks` render only inside the review modal,
      which opens only for a Pending letter in a section the teacher advises,
      so **once a letter is reviewed the teacher who wrote the remarks cannot
      read them back at ANY width.** Not the DV1b-a card bug: symmetrical and
      pre-existing. **The card's `canReview` gate is correct** — the fix is
      the missing view. Reuse the parent's reading-view pattern (**no mockup:
      pattern reuse, not a redesign**); `GET /:id` returns strictly less than
      a list row and is not needed. `docs/KNOWN_ISSUES.md`.
```

**Two of its three predictions held exactly.** `GET /:id` really does return
less than a list row — `el.*` with no `students` join, so no learner name and
no class — and the parent's reading view really was reusable as a PATTERN and
not as code: it is inline markup whose footer offers Edit, and the two views
differ on four of six rows.

**The third was wrong, and instructively so. "The card's `canReview` gate is
correct" was true only while the entry itself was open.** That gate existed
because a reviewed letter had nowhere to go; UI-E built the somewhere, and the
card's own comment had argued against ever moving it — on the grounds that
"this page has no read-only view of a letter at ANY width", which was a
statement of fact rather than of principle. **The rule survived and the fact
did not** (§20b), and one dead end remains: a Pending letter in a section the
teacher does not advise.

**What the entry could not have known** is that "no mockup, pattern reuse"
still left four content decisions, each of which had to be made rather than
copied — no reviewer name, no reviewed date, no "Submitted", no attachment —
because **two of those fields do not exist in the database at all**
(`reviewed_at` is not a column; `reviewed_by` is an unresolved user id).

### Pre-Stage-5 #2's five items — moved from CLAUDE.md on 2026-09-25

Under the REFILL RULE, closed by **pre-Stage-5 #2** (`819e892`, browser check
passed). The pre-Stage-5 block in CLAUDE.md carried them as one queued item
(m) and four clauses of "the originals"; this is how they stood.

```
      **(m) `term_average_descriptors` on
      `GET /grades/student/:id`** (UI-D-3, 2026-09-25) — computed server-side
      from the same `BANDS` ladder. `general_average_descriptor` describes the
      YEAR's average, so the parent hero's term figure has no word to go with
      it and deriving one in the client is what §12 forbids; the caption
      becomes `"Term N · <descriptor>"` in a one-line client follow-up. Then
      the originals: `GET /api/attendance` where
      `date` silently drops `from`/`to`; a class filter on `GET /api/grades`;
      Admin → Users role sort in A–Z rather than ENUM order; email validation;
      `test:attendance`’s cleanup deleting every row on three dates rather than
      only its own; `GET /api/health` returning a static 200 with no DB check;
      and the shared helper that clears the orphan `notifications` rows the six
      older suites leave behind. Every one is a `docs/KNOWN_ISSUES.md` row.
```

Of the seven "originals", #2 took four — the attendance `400`, the grades
class filter, the users sort, the health check — and (m). **Email validation,
`test:attendance`'s cleanup and the orphan-notifications helper stay queued**
(#4, #3 and #3). Two things the entry could not have known: **the users sort
defect was two defects** (`status` is an ENUM as well, with no header to show
it), and **(m)'s "one-line client follow-up" was one line of data and three of
proof** — the fixture had to be the server's `{ descriptor, remarks }` object,
captured from the suite, with the object-as-child refusal asserted (§19f),
because the previous hero fixture had invented a string and blanked `/parent`.

### Pre-Stage-5 #6's item (l) — moved from CLAUDE.md on 2026-09-26

Under the REFILL RULE, closed by **#6** (`2ae7639`, browser check passed).
The fragment as it stood:

```
      **From the 2026-09-23 school answers: (l) the
      mid-year transfer scope fix must
      leave the OLD adviser able to VIEW AND PRINT the learner's pre-transfer
      attendance** — handover is outside the system, so re-pointing scope at
      the new section and dropping the old adviser's access would strand the
      records.
```

**What it became:** `recorded_by` as the first leg of a per-row teacher
predicate, the adviser of the learner's current section as the second, no
third — the plan's "assigned" leg was cut by Darryl so attendance stays
adviser-only — and no schema. The entry said "view and print"; the print half
needed a client change the entry had not named: a row carries the learner's
CURRENT class, so a section filter on Attendance records could never show a
moved learner's days, and "Everything I recorded" exists for that. **The
school's answer went further than the build** — the new adviser "from the
transfer date" — and the row does not hold a date to cut on; the new adviser
sees every row of a current learner, and that superset was accepted rather
than bought with a column. The transfer itself stays a SQL job for the admin,
recorded as a KNOWN ISSUES decision the same day.

### The docs pass item, and a closed KNOWN ISSUES compact row — moved from CLAUDE.md on 2026-09-26 (smoke-gate docs pass)

Under the REFILL RULE: the docs pass is done, and the smoke gate that it
named as NEXT is done too (`fix/smoke-gate`, to `12a3495`). The BUILD ORDER
entry as it stood:

- [x] **Docs pass — DONE 2026-09-26.** PROJECT_PROGRESS is a snapshot (its
      old text verbatim in ARCHIVE); README and SETUP_NOTES carry no counts
      or passwords; the API scope legend matches the code. **NEXT: the smoke
      gate, then Stage 5.**

And the compact row from CLAUDE.md's open KNOWN ISSUES table, which had
stayed there after its full row in `docs/KNOWN_ISSUES.md` was CLOSED on
2026-09-25 (pre-Stage-5 #3a, `85c5d8f`) — found stale by the smoke gate:

| **`test:attendance` deletes every attendance row on three dates, not just its own** | `test-attendance-flows.js` `cleanup()` | `daysAgo(2)`, `daysAgo(3)` and today, for ALL students; `daysAgo(4)` likewise. Do not run it against data you want to keep on those dates. A test-file dispatch |

### POLISH's five items — moved from CLAUDE.md on 2026-09-26

Under the REFILL RULE, closed by **fix/polish** (`1408b81`, `70b30b0`,
browser check five of six). The entry as it stood:

```
- [ ] **POLISH — NEXT, five items, one dispatch, PLAN ONLY first**, all
      browser-found: (1) the class-record group header at 390px; (2) the 2px
      class-summary overflow at 1280px (under the 24px `ScrollCue` gate,
      §19b — the cue is rightly silent, the table still clips); (3) Teacher →
      Students' two identical primaries (KNOWN ISSUES, 2026-09-25); (4) the
      About Vision card's dead space; (5) the Settings page width.
```

**What each became.** (1) Not a sticky column, not an initial scroll, not a
repeated header — `text-center` → `text-left` on the four colgroup headers,
because the name was centred in a group wider than the viewport. (2) The
"2px" was measured before it was fixed: 8px in a headless browser at 1280,
the table's max-content (nine nowrap headers, "Araling Panlipunan" the
widest) against the scroller; `min-w-max` went and subject headers wrap,
and the same measurement afterwards read 990/990 there and 356/937 at 390.
(3) The plan's recommendation held over the first lean: Enroll went neutral
and the shared Apply stayed the item-5 signal, on Students only. (4) Built
as `lg:items-start` and **reverted on the browser check** — the equal-height
pair is preferred, recorded in KNOWN_ISSUES as accepted. (5) Width plus two
paired rows, no redesign, no board. A sixth item rode along: the Login
panel's school name became the setting with a "– Main" fallback. The
dispatch also carried fix/auth-503 (its own CHANGELOG row), found by the
by-hand 503 check the polish plan was written beside.

### Pre-Stage-5 #7's item (c), and the block's header — moved from CLAUDE.md on 2026-09-26

Under the REFILL RULE, closed by **#7** (`2decc74`, browser check passed),
which also closed the pre-Stage-5 list. The fragments as they stood — the
list's header with its (a), which CR3a and #5a had already closed in place,
and the (c) pointer #7 answered:

```
- [ ] **Pre-Stage-5 server fixes**, one dispatch. **NEXT — start with
      PLAN ONLY.** **Four added by DV3
      (2026-09-21); the first two are what Expo hits first.**
      **(a) `subjects.display_order`** — the printed order is a client
      constant because the table has no ordering column, and Expo cannot
      import a constant (migration + `schema.sql` + `seed.sql` + `ORDER BY`
      in `routes/grades.js` and `routes/subjects.js`). **Grade 1's order is
      PROVISIONAL** — ask the school before seeding it as fact.
      **(c) the school-calendar work (CAL)** — term dates, school-year range,
      a real `current_term`; nothing in the schema holds a term boundary,
      which is why Parent → Attendance derives its months from data. DV3 does
      not depend on it.
      …
      **NEXT is #7, CAL — its own PLAN ONLY** (a
      real `current_term`; the school's dates are LOCKED: classes 2026-06-08
      → 2027-04-08, Term 1 Jun 8–Sep 15, Term 2 Sep 16–Dec 18, Term 3
      Jan 4–Apr 8, no Saturday classes).
```

**What it became:** not "a real `current_term`" but no `current_term` at
all. The plan offered two homes — a pure module, or admin-editable date
settings — and Darryl took the module and retired the setting, because two
sources of "the term" is what put "Term 3 · C" on a Term 1 hero (DV4). The
schema still holds no term boundary; the module does, and the term is
derived from the date on every screen from one rule. Parent → Attendance
still derives its month LIST from data — the entry's reason survives — and
the calendar decides only which month the page opens on. Two things the
fragment did not foresee and the build had to: a grid open across a term
boundary would have re-keyed itself, so the two teacher pages pin the term
in the URL; and a settings value with no smoke behind it clipped the About
page at 390px, which #7's own smoke caught.

### Deferred polish hygiene — three items DROPPED 2026-09-26

Item 5 and 5b left three hygiene notes in KNOWN_ISSUES: a `useStagedFilters`
hook the nine filter pages might share, the seven hand-written `canReset`
expressions, and eight empty-state Clear/Reset buttons still carrying the
`px-3 py-1.5` literal `buttonNeutralClass` replaced elsewhere. **All three are
dropped, not deferred** (Darryl, 2026-09-26): none is user-visible, each is
a refactor of working code, and Stage 5 brings its own component model. The
KNOWN_ISSUES rows are marked DROPPED and stay so they are not re-filed.

### Pre-Stage-5 #5's items — moved from CLAUDE.md on 2026-09-26

Under the REFILL RULE, closed by **#5a** (`fe67803`, `5df33f2`) and **#5b**
(`4b092ee`), browser checks passed. The four fragments as they stood in the
pre-Stage-5 block; o9 was never a fragment there (three doc passages, now
corrected in place). Rules: `docs/FRONTEND_CONVENTIONS.md` §13d and §23,
`docs/API_REFERENCE.md` → Settings.

```
      **(j) decide the Back-button guard BEFORE Expo** —
      `createBrowserRouter` vs a `pushState` sentinel. Stage 5 brings its own
      navigation model, so choosing the router late is expensive.
```
```
      **(f) School ID and email settings fields** — `routes/settings.js`
      allow-lists five keys, so 136893 and 136893@deped.gov.ph have nowhere to
      live (the keys, their validators, the seed, and the Admin → Settings
      inputs); **(g) an About page** for the DepEd Vision, Mission and Core
      Values the school adopts — a new route, a nav item and a page, none of
      which exist. **Two more from the 2026-09-23 school answers: (k) seed
      `display_order` for Grades 2 and 3** (G2 Makabansa · Mathematics · GMRC ·
      English · Filipino; G3 English · Mathematics · Science · Filipino ·
      Makabansa · GMRC) — migration + `seed.sql`, the last grade levels on the
      `name ASC` fallback;
```

**(j) was decided for the sentinel, not the router** — local to one screen,
proved by a pure state machine, and it leaves one quirk (an in-app leave
keeps the sentinel behind) that a data router would not; recorded, accepted.
**(k) needed no new migration**: the existing `migrate-subject-display-order`
map gained two entries and set eleven values on the live database — and did
so without a prior backup, because both backup calls before it landed in a
`--watch` restart; the standing rule (health → backup, retried → write) dates
from that. **(g) grew a public endpoint** the entry did not foresee: a
signed-out About page cannot call an authenticated `GET /settings`, so
`GET /settings/public` exists and the handler count moved for the first time
since CR3. **(f)'s "School ID and email" became four keys**, because a phone
and a Facebook page were on the same list the school gave.

### Pre-Stage-5 #4's items — moved from CLAUDE.md on 2026-09-26

Under the REFILL RULE, closed by **#4** (`9c413f4`, browser check passed).
The two pre-Stage-5 fragments as they stood, plus the closing paragraph
that named #4 next. Rules: `docs/FRONTEND_CONVENTIONS.md` §22.

```
      **(b) `AuthContext` must tell a 401 from a network error or 5xx** —
      today any `/auth/me` failure clears the token, so a refresh during an
      outage discards a valid session; frequent on a school LAN.
```
```
      **Four more added 2026-09-22: (e) ADVISER ENROLMENT** —
      advisers enrol learners and create parent accounts, so confirm the
      enrolment path matches that and not only the teacher-assignment one;
```

**(e) was confirmed, and the confirmation cut the other way from the
2026-09-18 widening.** That change had let a subject teacher OR the adviser
create a parent account so that "can create" equalled "can list"; the school
says only the adviser does either, so both gates now key on
`sections.adviser_id`, and the read scope stays wider than both. **(b)'s
one-line fix grew a decision the line did not anticipate**: with admin kept
out of enrolment as the school also said, twenty sections would have been
unenrollable by anyone — so admin stayed, and the consequence (a learner in
an adviser-less section can have no parent account) is a KNOWN ISSUES row,
not a surprise for the defence.

### Pre-Stage-5 #3's items — moved from CLAUDE.md on 2026-09-25

Under the REFILL RULE, closed by **#3a** (`85c5d8f`) and **#3b** (`642ccb2`,
browser check passed). Four fragments of the pre-Stage-5 block, as they stood
after #2's docs pass; the (i) fragment is kept because it is WRONG and the
record of why matters more than the line itself.

```
      **(i) `test:restore`'s "token issued after the cutoff" assertion needs a
      SUB-SECOND boundary** — it fails on a fast machine because the scripted
      flow fits inside one `iat` second. **Fix the TEST, never the
      comparison**; the production behaviour is correct.
```
```
      **(d) a fixture learner who is nobody's test target**
      (KNOWN_ISSUES).
```
```
      **(h) the npm alias** `db:migrate:reading-and-literacy`,
      deferred twice now because `package.json` keeps falling outside a
      whitelist.
```
```
      **Still queued from the originals:** email
      validation; `test:attendance`'s cleanup deleting every row on three
      dates rather than only its own; and the shared helper that clears the
      orphan `notifications` rows the older suites leave behind — **seen again
      after #2's `test:grades` run, 3 rows, the 2026-09-19 figure exactly.**
      Every one is a `docs/KNOWN_ISSUES.md` row. **NEXT is #3, test hygiene:**
      that cleanup and that helper, (i), (d), the `verify-grading-seed` alias,
      and the no-watch smoke rule.
```

**Two of the four were not what they said.** (i) was never a timing
problem: the crafted token carried no `v` claim, and the red-first run
printed *"Your password was changed"* — the version check, on an account
whose counter another suite had bumped. "Fix the test, never the comparison"
was still the right instruction, for a reason the line did not know. (h) was
**already done** — `db:migrate:reading-and-literacy` had sat at
`server/package.json:12` since the Grade 1 rename; "deferred twice" was a
sentence nobody re-checked against the file. (d) became Tala Halimbawa, and
the item that closed it also cost a migration script the entry never
mentioned, because a seed row that must reach a LIVE database cannot arrive
by `db:setup`. The originals' third item — email validation — is #4's.

### UI-D (c) and (d) — moved from CLAUDE.md on 2026-09-25

Under the REFILL RULE, closed by **UI-D-2+3** (`9d0c1cb` → `183d516` →
`00f16f8` → `123cf60` → `a6be0d2`, browser check passed). UI-D is complete
with them, and the rules are `docs/FRONTEND_CONVENTIONS.md` §19.

```
  - [ ] **(c) The class-summary scroller clips ON SCREEN with no cue** —
    SMOKE-1 finding 11. **Do not remove the scroller** (§5a-i): the fix is a
    cue, and **it goes on the CLASS RECORD too** — more columns, same
    silence, nothing like it anywhere to reuse. Carries three smaller items:
    `LiveStatus` gains `data-print="hide"` (it still prints when the socket
    is down), `ReportCard`'s "Select any grade…" line gets `print:hidden`,
    and **INVESTIGATE** removing the browser's own print header and footer
    via `@page` margins — **only if it survives a paper check**, otherwise a
    print tip rather than code.

  - [ ] **(d) MOCKUP FIRST — the parent hero.** In dark it inverts to a
    **bright lavender panel** against the Dark option's own "easier on the
    eyes at night": **`--primary` is the token**, and **`--brand-panel`
    already exists for exactly this** — a solid brand field in both themes,
    used by Login and not by the hero. A KS1 hero shows **"A D" with no
    subject** — the name is **present and unrendered**, bound as a hover-only
    `title`. **Two more ship with it:** the average column follows *"the
    greatest term with any grade"* while the letters follow `current_term`,
    so **one panel keys off two notions of term** (§12 says `current_term`);
    and **badge-on-primary has no `check-contrast` pair**.
```

**Every prediction in (d) held**, which is unusual enough to record: the
token, the already-existing `brand-panel` pair, the hover-only `title`, the
two notions of term, and the missing contrast pair were all exactly as
written. (d)'s mockup requirement was met and the entry needed no correction.

**(c) was right about the diagnosis and silent about the hard part.** It said
what to build and where, and both were correct — including that the cue
belonged on the class record too. What it could not have known is that **a
cue is entirely a question of thresholds**, and that the obvious single
threshold is wrong:

- With a 1px slack the desktop class summary fired on a **2px** overflow —
  "Swipe for the Average →" for a column two pixels short of visible — and
  **flapped**, present at 1279px and gone at 1281px.
- Widening that slack to 24px and applying it to BOTH tests was the
  overcorrection, and it cost the hint its accuracy: at 390px on the class
  record, **"Performance Tasks" dropped out of the sentence while its last
  column was visibly cut and its highest-possible-score sat behind the
  button** — the group the teacher most needed pointed at.

The answer is two constants, `GATE_SLACK` 24px and `CELL_SLACK` 1px, because
**legibility decides whether to speak and not what to say** (§19b). Both
errors were found in the browser, neither by a proof.

**The print header/footer INVESTIGATE was NOT attempted**, and that was the
brief: it required being able to state the per-browser behaviour, which could
not be done from here. It is a print tip in `docs/KNOWN_ISSUES.md` — Chrome →
More settings → uncheck "Headers and footers" — rather than code.

**Two defects of my own, both caught by something other than reasoning:**
a filename collision (`ScrollCue.jsx` beside `scrollCue.js` — Windows is
case-insensitive, §19g) that failed the build with "Missing export"; and a
proof fixture that invented a string where the API sends an object, which
**blanked `/parent` while build, oxlint and 71/71 were all green** (§19f).

### UI-C2's closed items — moved from CLAUDE.md on 2026-09-24

Under the REFILL RULE, closed by **UI-C2** (`d1e7850` + `cc1ecbc`, browser
check passed 1-10). Items 4 and 12, SMOKE-1's findings 1, 2, 5, 6, 7 and 12,
and the Remarks hint. **Item 14 (dates) did NOT close and stays as UI-C1.**

```
  - [ ] **UI-C — items 4, 12 and 14, plus a date audit, plus SMOKE-1's.**
    **From the smoke sweep (2026-09-24):** `/teacher/grades` and
    `/teacher/class-summary` each render **TWO `<h1>`** — Shell's and their
    own — **which is the whole of the eight smoke failures**; the Students
    section placeholder names a Grade 6 section to the Grade 1 adviser; the
    grade filter reads "All I can read"; Parent → Settings uses an em dash
    for the class where everywhere else uses a hyphen; and the report card's
    **transmutation sentence should show only when a term grade exists**.
    **(4) Settings → Personalization at 200% zoom** squeezes its panel into a
    narrow column: the nav is `sm:w-[14.5rem] sm:shrink-0` and cannot give
    width back, and 200% halves the CSS viewport so a 1280px window lands at
    `sm` exactly. **A real 640–767px tablet has the same squeeze**, so it is
    not only a zoom bug; the fix is the breakpoint.
    **(12) One audience, three labels.** One label per audience for STAFF,
    **the parent wording stays**, being written to its reader. Seven render
    sites in four files, and `teacher/EventsPage`'s card is a fourth variant
    that **drops the section entirely**.
```

**THE LAST SENTENCE OF (12) IS FALSE AND IS KEPT AS WRITTEN**, because that
is the point of an archive. `teacher/EventsPage`'s card did not drop a
section: **the `events` table has no `target_section` column at all**
(`schema.sql`; `routes/content.js` :147, :562, :591). An event is
school-wide or a whole grade and nothing else. The claim went from my plan
into a commit message and a code comment before the API refused a posted
`target_section` and returned it null. `staffAudienceLabel` now takes
`{ hasSections }` so the two content types differ out loud.

**Item 4 closed differently from how it reads, too.** The 200% squeeze is
real but the fix is `md:`, and Darryl's check added the fact that made it
worth knowing: **on a 1920px screen, 200% zoom leaves ~960px**, which is
above `md`, so side-by-side is correct there and nothing is squeezed. The
bug bites at 1280px and on a genuine small tablet, not at every zoom level.

### The Data views redesign preamble — moved from CLAUDE.md on 2026-09-24

The block that introduced DV1–DV4 and DV1b. **Every piece it queued is
done**, so it left under the REFILL RULE; the one rule it carried —
*no verdict badges anywhere* — is §4's and is stated there. The note about
Grade 1's letter had already expired in place.

```
- **Data views redesign — MOCKUP FIRST, no code until it is approved.**
      Mockups exist and are approved (Darryl, 2026-09-20). **The rule every
      piece inherits and cannot bend: no verdict badges anywhere** (§4 — the
      system counts and displays, it never concludes). *A second rule stood
      here — that Grade 1's A–E "stays as it is until the school answers" how
      the letter is produced. It is spent: the school answered on 2026-09-22
      and it shipped the same day (`docs/GRADING_SPEC.md` §6a), so the card
      renders a computed letter now.* **DV1 through DV4 and DV1b are all DONE**
      (2026-09-20 → 2026-09-23); the ticked write-ups left under the REFILL
      RULE and are verbatim in `docs/ARCHIVE.md`. The rules they carried are
      §16 (card families), §5a-v (the bespoke exemption), §17c (the roster)
      and §17e (the letter card).
```

**MOCKUP FIRST was the rule of that whole track and it is not retired with
it** — it still governs the two queued pieces that redesign anything: item 5
(the unapplied-filter affordance, nine pages) and UI-D (d) (the parent hero
in dark). Both say so where they stand.

### DV1b-a and DV1b-b — the ticked entries, moved from CLAUDE.md on 2026-09-23

Under the REFILL RULE, which they should have obeyed on the day each closed.
Verbatim; **the data-views block in `CLAUDE.md` now says only that DV1b is
done and points here.** Every rule they carried is stated in its own one
place — §16 for the card families, §5a-v for the bespoke exemption, §17c for
the roster, §17e for the letter card — and one of them, DV1b-b's last
sentence, was **already wrong when it was written**: Edit as an `actions`
button never rendered, and UI-B removed the prop (§17d).

```
  - [x] **DV1b-a — 14 DataTable consumers → `renderCard`. DONE 2026-09-23.**
        **The queue said 16; it is 15** (CR2 deleted `teacher/GradesPage.jsx`);
        the fifteenth is DV1b-b. Four families; `admin/GradesPage` carries
        JSX. §16.
  - [x] **DV1b-b — Teacher → Attendance + the parent letter card. DONE
        2026-09-23.** A **bespoke card list below `sm`** (the §5a-v exemption —
        `renderCard` allows one `<Link>` or `<button>`, and this row is four
        buttons), four full-word 44px `aria-pressed` buttons **replacing the
        `<select>` on BOTH breakpoints**, and the LRN `nowrap` — **the last
        queued nowrap item.** **A recorded mark can be changed but NOT
        cleared**, because `/attendance/bulk` omits unmarked rows so a clear
        would leave the screen claiming a state the database lacks. Logic in
        `pages/teacher/attendance/roster.js` so the proof can drive it.
        **Also fixes DV1b-a's regression: every parent letter card now opens
        the READING view**, so a declined letter's adviser remarks are
        reachable on a phone; Edit is an `actions` button, Pending only.
```

## docs/PROJECT_PROGRESS.md as it stood until 2026-09-26 — moved by the docs pass

> Verbatim, the whole file exactly as it stood at `7f6ad7b` (1,722 lines,
> 154,288 bytes in git). Moved, not deleted, when the docs pass rewrote
> PROJECT_PROGRESS as a state-only snapshot (decision (a), Darryl,
> 2026-09-26). It had become a second changelog — dated narrative, newest
> first, stopping at CR3 on 2026-09-23 — whose present-tense tables
> contradicted the code row by row. Fenced with four backticks so its
> headings stay out of this file's outline. Dated text; never edit it.

````markdown
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
be written. **23 tables, 88 handlers** in `server/routes/` + `GET /api/health`
= **89 endpoints** — recounted from the code 2026-09-23.)

**The grades track is COMPLETE — CR3a and CR3, 2026-09-22/23.**

**CR3a moved the printed order of learning areas out of a client constant and
into `subjects.display_order`.** Expo cannot import a constant, and the class
record and the class summary needed the same order without the parent report
card owning it. Grades 4-6 carry one Key Stage 2 SF9 transcription applied to
all three levels (confirm at the next visit); Grade 1's is provisional — its
class program, a timetable; Grades 2 and 3 are NULL, which is the honest value
for an order nobody has recorded, not a gap.

**CR3 is the adviser's Summary of Grades** — `GET /api/grades/class-summary`
and Teacher → Class summary: one learner per row, every subject across the
row, the General Average at the end, read-only, with a drill-through to the
same `ReportCard` a parent sees, reused unchanged.

**It needed a server change first, and that is the finding worth keeping:**
grades' read scope was assignments-only, so **the adviser of a section could
not read a single grade in it** — TCH-002 advises Masigasig and holds zero
assignment rows, and got 404 on every report card in their own section while
being the one person expected to compile that section's summary. Read scope is
now assigned-OR-adviser. **Encode scope is unchanged and must stay that way:**
encoding is the subject teacher's authority, and widening it would invent
school policy.

Suite baselines: `verify-grading-seed` **44**, `test:grades` **247**,
`test:assignments` **62**, `test:class-summary` **59** (new), oxlint **43**.

**The class record is BUILT — CR0–CR2, 2026-09-22.** `GET` and
`PUT /api/grades/class-record`, the 23rd table `assessment_slots`, and
**Teacher → Grades rebuilt as the DepEd E-Class Record grid**: learners as
rows, WW 1-5 / PT 1-3 / Summative as columns, one highest-possible-score row,
Initial and Term Grade live, one Save. The per-learner `GradesPage.jsx` was
**deleted**, not left behind a flag. A teacher encoding one quiz for 40
learners went from up to 80 requests to one.

Three rules it settled, each stated nowhere else: **a slot is USED once it has
a highest possible score** — an unused slot is left out entirely, but a used
slot where a learner has no score makes that learner's whole group **Pending,
never left out and never zero** (leaving it out silently raised the grade of a
learner who missed an assessment); **every score and every maximum is a whole
number**, refused on the server, though computed values keep two decimals; and
**a score above its maximum is allowed and flagged, never clamped**, and the
school confirmed on 2026-09-23 that it awards bonus points (event
participation, added to PT). **The client computes no
grade** — live totals come from a `dry_run` that runs the save in the
transaction and rolls back. Detail: `docs/API_REFERENCE.md` → The class
record, `docs/GRADING_SPEC.md` §6e, `docs/FRONTEND_CONVENTIONS.md` §13.

**Suite and lint baselines live in `docs/TESTING.md` — that is the one home,
and this file no longer carries a copy** (trim-8, 2026-09-23). It held two
separate baseline blocks that disagreed with each other and with CLAUDE.md,
which is exactly the drift a mirror file is most prone to. A dispatch that
re-measures updates `docs/TESTING.md`, in the same commit.

**Grade 1's letter is COMPUTED and BUILT — 2026-09-22.** The school answered
and it shipped the same day, server and client, both browser-checked. WW 30 /
PT 50 / Summative 20, banded on the **raw** weighted score with no
transmutation, a **Final letter** once all three terms are recorded, and **no
General Average in Key Stage 1**. **`PATCH /api/grades/:id/descriptive` is
RETIRED** — one write path for every grade level, a letter cannot be set by
hand, and handlers went 86 → 85. A teacher encodes Written Works, Performance
Tasks and three Summative parts exactly as for Grades 2–6 and sees the Initial
Grade; **a parent sees letters only**, enforced by a render-time guard rather
than a code review. **A legacy Grade 1 row — a letter typed before the rule,
with no scores behind it — keeps its letter and shows no Final**, which is
correct and visible on Nino's seeded card; do not "fix" it. Full rule:
`docs/GRADING_SPEC.md` §6a.

**`no-undef` is enabled (2026-09-22).** The client half shipped a blank page
for every teacher — a call to a deleted setter that `npm run build`, oxlint
and an SSR render all missed, because the call sat inside a `useCallback`
invoked from a `useEffect` and neither body runs under
`renderToStaticMarkup`. The rule needed `env.browser` plus an `overrides`
giving `scripts/**` `env.node`; with those it reports 0 and leaves the oxlint
total alone. **Baselines: `docs/TESTING.md`.**

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

**CLAUDE.md trimmed, 2026-09-19.** The file had reached 33 bytes of headroom
against its working limit, which meant no dispatch could write to it at all.
Five blocks moved verbatim to `docs/ARCHIVE.md` — the 81-row endpoint table
(a dated snapshot; `docs/API_REFERENCE.md` §8 is the live record and was
verified to hold every row), the per-file list, the `client/src` tree, and
the `sections table` and `Class Board` investigations — each leaving its
heading, a pointer, and, for the two investigations, its conclusion. Ten
per-file rules that are stated nowhere else stayed behind as "File rules
that bite". Nothing was deleted: all 1,611 substantial lines of the previous
version still exist, and all 23 `##` headings are present. Two mirror gaps
between CLAUDE.md and `docs/FRONTEND_CONVENTIONS.md` were found while
measuring and closed. **144,967 → 108,102 bytes.**

**Grading fixes — DONE 2026-09-22 (server + client + docs).** Three things,
all found by reading the school's own records against what the system does.

**A final grade is a whole number again.** The report card was showing
89.33 where the school's Summary of Grades shows 89. The value was right —
(87 + 91 + 90) ÷ 3 — but it was being kept to two decimals at a step where
the school keeps none. The general average still carries two decimals, and
that is not an inconsistency: the school's own sheet adds up eight whole
subject grades and prints 721 ÷ 8 as 90.13. Two precisions, one step apart,
exactly as the paper does it.

**The same numbers now print the way the school prints them.** Term and
final grades read "87" and "89" instead of "87.00" and "89.00", on the
parent's card, on a phone, in the breakdown, and on the teacher and admin
screens. General averages and initial grades still show two decimals.

**Careful about one thing that has not happened yet.** The DepEd
transmutation table applies to this school year only; from 2027–2028 a term
grade will carry decimals of its own. The display shows a grade exactly as
it is stored rather than rounding it for looks, so that change will not
quietly turn an 89.5 into a 90 on a parent's screen.

**Grade 1's "Reading" is now "Reading and Literacy"** — the school's own name
for the learning area, and the only naming mismatch among all forty subjects.
It was renamed rather than replaced, deliberately: the two grade records the
system holds for that subject hang off it, and replacing the row would have
deleted them. They were checked before and after and are unchanged.

**Also decided, and written down before any code exists: how a Grade 1 letter
is produced.** The school computes it from Written Works 30%, Performance
Tasks 50% and a Summative 20%, then bands the result — 90 and above is A,
down to below 65 for E. That is the school's practice, not a DepEd rule, and
it is recorded in the grading spec as a decision with nothing built yet.

**Data views redesign, DV3 — DONE 2026-09-21 (server + client + docs).**
Parent → Grades is now laid out like the report card the school actually
prints, instead of a sortable list of subjects.

**What a parent sees.** A document: the title, the school's name and the
school year; a line saying how much of the year is recorded ("Term 3 partly
recorded (1 of 8)"); the learner, their class and their adviser; then the
learning areas in **the order the printed card uses**, with the three terms
and a final grade. Underneath, the general average — per term and final —
then the performance descriptors and a short "Reading this report" note. On a
phone the same card becomes four buttons (Term 1, 2, 3, Final) and a list.

**The order is the point, and it is why this page stopped using the shared
table.** Every other list in the system can be sorted by clicking a column.
A report card cannot: re-ordering the learning areas does not filter it, it
produces a different document from the one in the parent's hand. The shared
table also sorts every row it is given, which would have sent the general
average drifting into the middle of the subjects it summarises.

**Three things the card deliberately will not say.** No Passed or Failed
anywhere — the system counts and displays, it never concludes. No Initial
Grade and no component weights, which is a decision from earlier in the year
and is unchanged; instead one sentence now names the DepEd transmutation
table, because a parent who adds up the raw scores in the breakdown gets 88%
and reads 90.00 on the card, and the gap deserved an explanation rather than
a new number. And nothing about how a Grade 1 letter is arrived at, which is
still a question for the school.

**Grade 1 shows the letter and its meaning** ("A Advancing") and **no final
grade or general average at all** — not "N/A" five times over, but one
sentence saying that grade level is graded descriptively.

**Two decisions worth recording.** The printed subject order lives in the
app rather than the database, because the subjects table has no ordering
column of any kind — **and Grade 1's order is a provisional guess**: no
printed Key Stage 1 order exists anywhere in the project, so the card uses
the class timetable and the school needs to confirm it. Second, the card now
decides between the table and the phone layout by measuring **itself**
rather than the browser window — the sidebar appears at the same width the
table used to switch on, which left the table with less room than it had a
pixel earlier.

**Verified in the browser** at desktop, at 390px, at 200% zoom, in both
themes and on both a numerical and a descriptive account. The first check
found five things — one of them the whole point of the feature not working:
the general-average row read "Pending" in every column while the server had
been returning the right numbers all along, because the page never asked for
that field. All five were fixed and re-checked before merge.

**Data views redesign, DV2 — DONE 2026-09-20 (client + docs).** Parent →
Attendance is now a month calendar instead of a list of dates.

**What a parent sees.** The month, with arrows to step back and forward; a
grid of school days where each recorded day carries its status; and beside
it — above it on a phone — the one number they came for: how many of the
recorded days their child was present for. Days nobody marked are drawn as
empty dashed squares, because a school day with no record is **left out of
the count, not treated as an absence**. An absent day that has an excuse
letter says so, with the letter's status. Below all of it, a school-year
table in the shape of the SF9's attendance record.

**The percentage is gone.** The page used to show a figure like 91.3%;
it now shows "21 of 23" and nothing else. A percentage invites comparison
with the SF9 number a parent already knows, and the two are not the same
thing — ours counts only the days that were actually recorded. Removing it
also closed a copy defect found during the dashboards check: the page
explained how "the percentage" was calculated even on accounts that had no
percentage on screen at all.

**Two decisions worth recording.** The school-year table lists the months
that actually have records, earliest to latest, rather than a fixed June to
April — the system has no term-start date anywhere, so a fixed range would
have been a guess printed as fact. And a month with no records shows a dash,
never a zero: nothing recorded is not the same as nothing attended.

**Something the school needs to decide.** The system accepts attendance on a
Saturday — nothing in the code prevents it, and it was recorded twice during
testing. Rather than hide those days, the calendar shows them in a small
"Also recorded" note beneath the grid and counts them, so the figures always
add up. Whether that should be possible at all is a question for the school:
are there Saturday or make-up classes? If yes, this is already right; if no,
the server should refuse the date.

**Verified in the browser** at desktop, at 390px, at 200% zoom and in both
themes. That check found five presentation faults — the summary sitting
below the grid, status pills overflowing their cells when zoomed, a
truncated excuse-letter line, two copy problems, and a row of zeroes on an
empty month — all fixed before merge.

**Data views redesign, DV1 — DONE 2026-09-20 (client + docs).** The first
of five pieces. Every list in the system is drawn by one shared table
component, and it had been built for a desk: six columns side by side, and a
horizontal scrollbar for anyone on a phone. Parents are mostly on phones.

**What changed.** Lists now look deliberate rather than default — a proper
header row, roomier cells, hairline rules, and an initials circle beside
every name so a roster reads as people rather than rows. **Below phone width
a list becomes a stack of cards**, each one a single tap target that opens
the thing it describes; where there is no single obvious action — the admin
user directory, where Edit, Reset password and Deactivate are equals — the
card stays put and shows its buttons instead of pretending to be tappable.
Six pages were converted; the rest keep their old behaviour untouched until
DV1b, which is what made the change reviewable at all.

**Parent login ids are now masked in the admin directory**, showing only the
last four digits, because a parent's login id IS their child's LRN. Teacher
and admin ids are ordinary staff identifiers and stay whole.

**One feature was attempted three times and then deliberately abandoned: a
table header that stays visible while you scroll.** It is worth recording
why, because it sounds like an easy win. Keeping a header pinned and keeping
a too-wide table inside its own frame turn out to be mutually exclusive in
the browser — each needs the opposite thing from the element around the
table. The first attempt pushed the header down over the first row of every
list in the system; the second stopped the table overflowing but made the
whole page scroll sideways at 200% zoom, hiding a column; the third fitted
the table by breaking words in the middle, which turned "Mathematics" into
"Mathemat/ics" and split a learner's LRN across four lines. The feature was
dropped. Lists show 50 rows at a time, so a header that scrolls away costs
very little, and the decision is written into the conventions so it is not
rediscovered later.

**Verified in the browser across three rounds**, at desktop, at 390px, at
200% zoom and in both themes — each round finding a real defect the previous
fix had introduced, which is the honest record of this one.

**Dashboards — DONE 2026-09-20 (DB1 server, DB2 client, DB3 docs).** The
manuscript shows a dashboard for each role (pp. 52, 61, 71); until this
dispatch all three pages said only which sidebar items were open, derived
from `nav.js`. They now show the school's actual state.

**What exists.** One read-only endpoint, `GET /api/dashboard`, branched by
role and **deliberately thin**: most cards keep calling the endpoints that
already existed, and this carries only the three things a client cannot
assemble cheaply — teacher class-encoding progress, the admin counts and
lock count, and the parent grades summary. On the client, three pages built
from one local `Card` component and a `useCard` hook.

Parent sees seven cards: their child with the class adviser, the term
average, attendance this month, unread messages, the latest excuse letter,
recent announcements and memos, and what is coming up. Teacher sees a
per-advisory-section attendance banner for the day, the review queue,
encoding progress, their classes and upcoming events. Admin sees the roll,
the accounts waiting for approval, and the system's own state — school
year, term, how many grade records are locked, whether the live channel is
up, and how old the last backup is.

**The rule that shaped every page: one failing card must never blank the
others.** A dashboard makes seven requests, and seven things can fail
independently, so each card owns its own loading, error and empty state and
renders them inside its own frame. There is no `Promise.all` across cards —
it rejects as a unit. Retrying one card refetches that card alone.

**Three decisions worth recording.** The parent's average is computed on the
server with the same rounding the report card uses, so the two screens
cannot disagree — and it is withheld entirely until every subject for that
term is recorded, because a partial average reads as settled. Nothing on a
dashboard is red: amber means "there is something to do", and red would mean
something had already failed. And no card links to an action the app cannot
perform — the admin hazard card shipped with a "create a second admin" link
and no endpoint in the system creates an admin, so it was removed.

**Verified in the browser by Darryl on 2026-09-19/20** across all five
accounts, at desktop and 390px, in both themes. The check found one real
defect: every "upcoming events" card was ordered newest-first, which for a
three-item card meant showing the three furthest-away events rather than the
next three. One item could not be checked on the day — the teacher's
attendance banner is hidden at weekends by design and the check fell on a
Saturday — so it was recorded as an open check rather than assumed working,
and **closed the next day (2026-09-20)**: Darryl moved the machine's clock
to Monday morning and saw both states, amber "Not recorded" with a button
that opens Attendance on the right section and date, then green "Recorded —
1 present, 0 absent" once he saved. Every dashboard is now verified in a
browser.

**That check also turned up something unrelated to dashboards, and it is
queued rather than guessed at.** Saving the attendance once wrote **two**
`bulk_record_attendance` entries to the audit log, a second apart. The
recorded attendance is right — the endpoint absorbs a repeat by design — so
nothing a teacher or parent sees is wrong. What is wrong is the history: a
single action appears twice to anyone reconstructing who did what, and that
log is also what the restore machinery counts. It is on the pre-Stage-5
server list as an **investigate-first** item, because a double submit, an
effect running twice and a button that stays clickable while saving are
three different faults and only one of them is the real one.

**Account recovery — DONE 2026-09-19 (R1 server, R2 client, R3 docs).**
Manuscript p. 49 promises "Forgot Password"; until this dispatch the Login
page said, in words, that there was no such thing. There is now, and the
BUILD ORDER line that made it wait on a school answer is closed — the
decision was **Darryl's, not the school's**: self-service by emailed code,
with an admin-issued temporary password as the fallback.

**What exists.** A 22nd table, `auth_codes`, created by the repo's second
migration script (the first, `migrate-notifications.js`, is the template it
copied: never drop, be idempotent, print the evidence, mirror into
`schema.sql`). **Five endpoints** — `POST /auth/forgot-password`,
`POST /auth/reset-password`, `POST /auth/verify-email/request`,
`POST /auth/verify-email/confirm`, and `POST /users/:id/temp-password`. Codes
are six digits from `crypto.randomInt`, bcrypt-hashed at rest, good for ten
minutes and one use, five attempts, three per account per hour and ten per
IP per hour, with only the newest code for an account valid at a time. Mail
goes out through nodemailer — the one new dependency — over the school's
Gmail account; a file transport exists for the suite and is chosen ONCE at
module load, so no request can turn it on. On the client: a Forgot password
link that now leads somewhere, `/forgot-password` (two steps, one route,
because the login id typed there is a child's LRN and may not go in a URL),
a forced-change screen outside the app shell, Verify email in Settings, and
Reset password in Admin → Users showing the generated password exactly once.

**Session revocation took three attempts and the two dead ends are written
into `middleware/auth.js`.** Comparing the JWT's `iat` against a
`password_changed_at` timestamp cannot work: `iat` has one-second
resolution, and a temporary password, the login that follows it and the
forced change all land inside the same second. Minting the replacement a
second forward only moved the hole — it then outlived the next change. What
shipped is a `users.token_version` counter carried as the token's `v` claim
and compared for equality, so every earlier token dies the instant it is
bumped. The endpoint that bumps it hands back a replacement, and the client
stores it — which is why changing your password still leaves you signed in
on the device you did it from.

**What the uniform reply costs, and why it stays.** `forgot-password`
answers `202` with one sentence for a verified account, an unverified one,
an unknown login id and its own internal failure alike, because a parent's
`login_id` IS their child's LRN and any other answer would be an oracle for
it. The price is that a broken mailer is invisible from the outside —
recorded in KNOWN ISSUES, along with the sharper hazard that the seed ships
a single admin whose email is never verified, so both routes back in can be
shut at once.

**Verified end to end in the browser by Darryl on 2026-09-19** over real
Gmail SMTP: admin and parent resets both completed, an older code and six
random digits gave the same refusal as each other, a temporary password
drove the forced-change screen and revoked an incognito session, and —
unplanned — the fallback was used for real when the new password was
forgotten. The check found two defects, both fixed before merge: an own-row
email edit in Admin → Users left Settings showing the previous address, and
three copy branches told an admin to ask an office they ARE.

**Notifications — DONE 2026-09-19 (N1 server, N2 client, N3 docs).** The
manuscript promises notifications on pp. 10, 24, 37, 39, 52, 71 and 74; the
system now has them, on the web, for all three roles. Expo will reuse the
same API unchanged.

**What exists.** One `notifications` table (the 21st), created by the
repo’s first migration script — `server/scripts/migrate-notifications.js`,
which is the template for the next one: never drop, be idempotent and PRINT
the evidence, announce per object, mirror into `schema.sql`. Four endpoints
under `/api/notifications` (list, unread-counts, mark one read, mark all
read), seven fan-out hooks in the existing write paths, and a second socket
event, `notification_counts`, which carries no payload and means "refetch".
On the client: a bell in the header with a dropdown that pages in place, and
unread badges on the sidebar.

**Seven events:** an announcement, a memo or an event posted; an excuse
letter submitted (to the section adviser alone) and reviewed (back to the
parent); a pending parent account created (to admin); and a grade becoming
viewable (to the parent, bell only, at most once per subject and term). The
actor is never notified about their own item.

**The two rules worth remembering.** A recipient set is the matching list
endpoint’s own `WHERE`, or a declared narrowing of it, never a widening —
and because those predicates are evaluated against live rows, every READ
re-checks visibility, so a notification whose item was deleted or whose
audience changed simply stops being listed. And a count is always the
server’s answer: nothing on the client ever adds or subtracts one.

**Not built, deliberately:** a full notifications page (the dropdown pages
in place; a page would mean a new nav item for three roles), and messages in
the bell (they keep their own badge, because `messages.read_status` already
is per-item read state). See CLAUDE.md §9 and
`docs/FRONTEND_CONVENTIONS.md` §10.

**Two Login defects, 2026-09-19.** Browser review found the leading icons
sitting at the top-left of their inputs and, at 440px, the brand band
painting over the top of the card. One cause each, both worth remembering.
Font Awesome ships its `display: inline-block` rule UNLAYERED, so it beats
Tailwind’s layered `.flex` and any `flex` written on an element that also
carries `fa-solid` is silently dropped — the flex now goes on a wrapping
span, which is how the reveal button always did it. And `.brand-panel-art`
is `position: relative` for the decoration, so it painted over the static
`<main>` that follows it; the card takes `relative z-10`, which does nothing
at `lg`. See `docs/CHANGELOG.md`, 2026-09-19.

**Login decoration, 2026-09-19 (addendum).** The panel and band gained a
decorative layer — a soft glow from the top-left, a masked dot pattern, two
large thin rings at the bottom-right corner and a halo around the seal — and
the area behind the card gained a faint dot grid. Every layer is a
pseudo-element or an aria-hidden node with no content and no pointer events,
and all of it is defined in `index.css` off five new tokens (palette 66 → 71)
because gradients, patterns and masks have no token-shaped utility and would
otherwise mean raw colors in a page file. One of the five,
`brand-panel-lit`, is not a paint at all: it is the panel composited with the
glow at its strongest point, pinned so the contrast checker can test the
panel text against the worst case rather than the flat colour. The card is
now "Welcome back" / "Sign in to continue." with `fa-user` and `fa-lock`
inside the fields and an arrow on the button. See `docs/CHANGELOG.md`,
2026-09-19.

**Login redesign, 2026-09-19.** The sign-in screen is a two-column grid at
`lg` — a solid brand panel on the left carrying the district line, the seal
on its white disc, the portal and school names and "Est. 1961" (the year on
the seal itself) — with the form card centred on the right. Below `lg` the
same panel becomes a band and the card overlaps its bottom edge; the two
smallest lines are hidden there. Three tokens were added for it
(`brand-panel`, `brand-panel-fg`, `brand-panel-muted`, palette 63 → 66)
because neither `primary` nor `brand-soft` is a brand field in BOTH themes.
The page also stopped hand-rolling its inputs: Login ID is a `FormField`
whose hint carries the parent/staff helper, Password is `PasswordField`, so
Login has a reveal toggle for the first time, and the error box is announced
(`role="alert"`). "Forgot your password?" is text, not a link — there is no
reset endpoint. See CLAUDE.md §8 and `docs/CHANGELOG.md`, 2026-09-19.

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

**Brand chrome, `feat/brand-chrome` (2026-09-19, D3):** `primary` is now
the school's navy (`#08027C` light, `#ABA8F7` dark) so every primary button,
unread badge and segmented control is brand-colored; `brand`, `brand-soft`
and `seal-bg` added (63 tokens) for the seven content links, the active nav
item and Settings tab, and the seal's white disc. The school seal
(`client/src/assets/school-seal.png`, 192 px, 49,256 bytes, from the
school's 447 px JPG) sits at the top of the sidebar and the mobile drawer
beside "Parent's Portal / Capt. H. Francisco ES" and above the Login title,
always on a white disc in both themes; `favicon.ico` (16/32/48),
`favicon-32.png` and `apple-touch-icon.png` are generated from it and
`favicon.svg` is gone. The header is extracted to `layout/Header.jsx` and
sticky (`top-0 z-30`); the sidebar is sticky `h-screen` with its nav
scrolling inside itself; the document stays the only scroller; no bell slot.
Two more content links (`parent/ExcuseLettersPage.jsx:188`,
`settings/AccountInfoSection.jsx:72`) were found after the plan's seven and
left unchanged as a declared scope expansion. Build 0, oxlint 42, lint:tokens
0, lint:contrast 0 unwaived (62 pairs), SSR 12/12 with a negative control.
Full row: `docs/CHANGELOG.md`, 2026-09-19.

**`fix/empty-state-duplicates` (2026-09-19):** Parent → Excuse Letters'
empty state no longer repeats the header's Submit letter; its message names
the button ("Use Submit letter when your child is absent…"). An audit of every
`emptyAction` found this and the Messages case (fixed on D2) to be the only
two; the twelve filter/range resets stay. Rule added to §5f. Build 0, oxlint
42, lint:tokens 0, lint:contrast 0, SSR proof with a negative control; no
server files. Full row: `docs/CHANGELOG.md`, 2026-09-19.

**Dark mode, `feat/dark-mode` (2026-09-19, D2):** the 60 tokens get a second
block of values under `[data-theme="dark"]` in `client/src/index.css` (slate
950 / 900 / 800 base, an in-between `surface-subtle`, inverted primary
button, X-950/300/200 tones, `color-scheme`, a dark-only autofill rule);
Light / Dark / System in Settings → Personalization, stored on the device
under `pp.theme` (default Light), applied as `data-theme` on `<html>` by
`pages/settings/theme.js` and by an inline script in `index.html` before
the bundle, with one `prefers-color-scheme` listener keeping System live.
Light AA fixes as named light changes: table header text, placeholders, the
Approve buttons, 41 faint text labels. Extras: the Messages empty states lose
their duplicate button; `/dev/ui` gains a page-only theme toggle and a
side-by-side token strip. `npm run lint:contrast`
(`client/scripts/check-contrast.mjs`) checks 55 occurring pairs in both
themes and reports 0 unwaived; the nine waived pairs are KNOWN ISSUES rows.
Proofs: theme script 18/18, dark SSR 10/10 (38 renders), build 0, oxlint 42,
lint:tokens 0. Full row: `docs/CHANGELOG.md`, 2026-09-19.

**Design tokens, `feat/design-tokens` (2026-09-19, D1 of the Dark mode
plan):** 60 semantic color tokens defined once in `client/src/index.css`
(`:root` light values equal to the Tailwind palette, `@theme inline` names so
a theme can swap them at runtime); a codemod replaced all 1,029 raw palette
utilities across 51 client files with tokens (75 class strings, 33 file:line
overrides, six accepted light-mode changes E1–E6); `npm run lint:tokens`
(`client/scripts/check-color-tokens.mjs`) now fails on any raw palette
utility, arbitrary color or `dark:` outside `index.css` and reports 0. Light
mode proven identical: token-equality 60/60, SSR snapshot of 38 renders
byte-identical with class attributes stripped, build 0, oxlint 42, negative
control. Convention §8 added. No dark values, no `color-scheme` yet — those
are D2. Full row: `docs/CHANGELOG.md`, 2026-09-19.

**`fix/copy-nits` (2026-09-19):** Teacher → Attendance's footer verb now
follows the unset count ("1 of 1 student has no status"); the "N students"
line under both Students pagers is gone (it repeated the page's row count);
the three decorative pixel sizes (DataTable sort icon and chevrons, both
thread timestamps) are rem so Large text scales them — its KNOWN ISSUES row
added and closed. Build 0, oxlint 42, SSR 14/14 with a negative control; no
server files. Full row: `docs/CHANGELOG.md`, 2026-09-19.

**CLAUDE.md trim, `docs/claude-md-trim` (2026-09-19, D0 of the Dark mode
plan):** 147,145 → 134,157 chars, docs only. Four blocks moved verbatim by
script with a byte-identical check on every moved line (129/129): the 30
non-bold compact KNOWN ISSUES rows to `docs/KNOWN_ISSUES.md` (the 10 bold
hazard rows stay), the 14 older CHANGELOG stubs, the ADMIN SCOPE AUDIT block
and the three answered OPEN QUESTIONS bullets to `docs/ARCHIVE.md`. Every
`##` heading kept; each condensed section ends with a pointer. Full row:
`docs/CHANGELOG.md`, 2026-09-19.

**Server hardening C, `feat/pagination` (2026-09-19):** every list endpoint
now pages — `limit` (default 50, max 200), `offset`, `sort`/`order` against a
per-endpoint allow-list, and a sibling `page { limit, offset, total,
has_more }` counted over the filtered, scoped set — via one module,
`server/utils/pagination.js`, on 16 handlers in 9 route files; the message
thread pages on `?before=<message_id>` instead of an offset so live socket
inserts cannot skip or repeat a row. `DataTable` gained a paged mode (server
sort through `onSortChange`, a "1–50 of 812" footer with Previous/Next, and an
automatic step back when a write empties the current page); `fetchAll` in
`api/axios.js` pages through at 200 with de-duplication and a hard cap (25
pages / 5,000 rows → a user-facing error) for the callers that need a
complete set — the target picker hook, Teacher → Grades' roster and
recorded-grades map, Teacher → Attendance's roster and day rows, both Messages
pickers, and Parent → Excuse Letters (client-side status filter). 18 table
pages carry a pager; filter and sort changes reset to the first page. Suites
twice: users 61, students 94, grades 182, attendance 60, excuses 92, content
96, assignments 56, backups 47, messages 80; build 0, oxlint 42, SSR 44/44
with a negative control. The last open server item in KNOWN ISSUES (no
`LIMIT`) is closed; the `date`-drops-`from`/`to` and no-class-filter halves
of the attendance and grades rows stay open. Full row and allow-lists:
`docs/CHANGELOG.md`, 2026-09-19, and `docs/API_REFERENCE.md` §6b.

**B3 on the same branch (2026-09-19):** the browser check found the `401`
logout landing on Login with no reason. `api/axios.js` now stores the
server's message in `sessionStorage` (never the URL) before the redirect —
"Account is not active." and the restore message verbatim, the three
token-shaped 401s replaced by "Your session has ended. Please log in
again." — and `Login.jsx` shows it once, in the sign-in error slot, then
clears it; a refresh or a manual Logout shows nothing. Build 0, oxlint 42,
SSR 13/13 with a negative control. Recorded, not fixed: a second login in
another tab of the same browser session silently swaps the open tab's
identity (KNOWN ISSUES). Full row: `docs/CHANGELOG.md`, 2026-09-19.

**Server hardening B, `feat/authorization` (2026-09-18):** two closes.
`POST /api/users/parents` now refuses a teacher who is neither assigned to
the student's class nor the adviser of its section (`403` naming the rule;
the shared `TEACHER_VIEW_SCOPE_SQL` predicate — Darryl's decision: assigned
OR adviser, so TCH-002 may create the parent for a child in its advisory
section). B1 amendment (2026-09-19): one query resolves the LRN and the
scope together and runs before the duplicate `409`s, so an unknown LRN, an
out-of-scope LRN, and an out-of-scope LRN of a child who already has a
parent are byte-identical `403`s — the old `404` is gone. And
`middleware/auth.js` answers `401` instead of `403` for `Account is not
active.`, so a deactivated account is logged out on its very next request
rather than after its next refresh; login keeps `403` + `status`. Teacher →
Student detail already shows Create parent only to teachers who can load
the page (the same predicate), so only its comment changed; `axios.js`'s
interceptor comment no longer describes a 403 dead session. Suites twice:
auth 56 (54 before B1's two byte-identical assertions), users 47 (the
stale-token assertion is `401`), excuses 70 (its
out-of-scope guardian is now inserted by SQL with a real hash), messages 59,
sections 30, assignments 41. Two KNOWN ISSUES rows closed. Full row:
`docs/CHANGELOG.md`, 2026-09-18.

**Server hardening A, `feat/validation` (2026-09-18):** one LRN rule
(`server/utils/lrnRule.js`, exactly 12 digits, on `POST /students` only —
seeded and older rows keep their shorter LRNs, logins unaffected) and one
contact-number rule (`server/utils/contactRule.js`, optional; 11 digits
starting with 09 after spaces/dashes are stripped, stored digits-only) at all
six contact writes; `birthday` (a real date, not in the future) and `gender`
validated in the student routes with a `400` naming the field where MySQL
answered `500`; `GET /students/:id` carries `parent_account { id, status } |
null` so Student detail says "Parent account: Active" instead of offering a
button that ends in a 409; new `activity_logs` rows use ids, never an LRN (the
160 existing rows stay, by decision); restore's refusals name their field and
the modal renders them under the password / file-name inputs; `Login.jsx` uses
`extractError`. Client mirrors: `format/lrnRule.js`, `format/contactRule.js`,
field-level errors in the enroll wizard, both Student detail pages, Admin →
Users and Settings → Account information. Suites twice: students 79, auth 52,
users 47, restore 29; excuses, messages, grades, attendance unchanged. Six
KNOWN ISSUES rows closed; two added (email format deliberately not
validated; adviser-only enrolment as a school question). Full row:
`docs/CHANGELOG.md`, 2026-09-18.

**Settings redesign, `feat/settings-redesign` (2026-09-18, Branch B):** one
`SettingsLayout` for all three roles — a left tab card and the active panel,
tabs as sub-routes (`/<role>/settings`, `/password`, `/personalization`, and
`/admin/settings/account`; admin's index is School settings, unchanged in
behaviour). Sections: Account information (parent's Login ID — the child's
LRN — masked with a Show control), Change password (live checklist from the
shared rule, mismatch under Confirm, submit disabled until ready, a refused
current password under its field with a red border and focus), Personalization
(Text size Normal / Large, this device only, applied before first paint).
The admin has an account screen for the first time (KNOWN ISSUES row closed).
`FormField`'s render object gains `invalid`; `PasswordField` gains `error`,
`inputRef`, `disabled`, `below`; new `PasswordChecklist` used by all four
password-setting forms, including Admin → Users' create teacher, which moved
to `PasswordField`. The three old `SettingsPage.jsx` files are deleted. Build
exit 0; **oxlint 42, the new baseline** (39 → 42: `only-export-components`
on the checklist's two helpers and on `FormField`'s `controlClassFor`); SSR
of the real route tree, 26 checks plus a negative control. New
KNOWN ISSUES row: contact number accepts any text (queued for Server
hardening). Full row: `docs/CHANGELOG.md`, 2026-09-18. **Browser check
passed except the red border, fixed on the branch:** an erroring input had
never shown its red border for any `FormField` shape since the foundation —
both the slate and the rose border classes were on the element and Tailwind
v4's stylesheet order let slate win. `controlClassFor(invalid)` now emits one
state, never both; SSR proves the rose border on the `<input>` with `error`
set, with a negative control reproducing the old double-border.

**Password rule, `feat/password-rule` (2026-09-18, Branch A of the Settings
redesign):** at least 8 characters AND at least one number, enforced only
where a password is SET — `PUT /auth/change-password` (`field:
"new_password"`), `POST /users/teachers` and `POST /users/parents` (`field:
"password"`) — from one module, `server/utils/passwordRule.js`, with one
message. The wrong-current `403` on change-password now names `field:
"current_password"`. Never at login or the restore step-up, so every existing
password keeps working; all seven seeded passwords already satisfy it. The
client has its own single source, `client/src/format/passwordRule.js` (labels
+ checks), used by the enroll wizard, Student detail's create parent and Admin
→ Users' create teacher (which had no client rule before); Admin → Users
renders a refusal under the Password field. `test:auth` 51, `test:users` 42;
excuses, messages, sections and assignments unchanged, each twice. Teacher
and Parent Settings still say "at least 6" until Branch B replaces them
(declared, outside this branch). Full row: `docs/CHANGELOG.md`, 2026-09-18.

**Branch 4, `fix/locked-grade-copy` (2026-09-18):** Teacher → Grades' two
locked-grade sentences now read "This grade is locked. Only an admin can
unlock it — ask the school admin if it needs a change." — who can unlock, and
that it is reversible, without naming who locked it (no locker column) and
without claiming a notification. Server and its `403` wording unchanged; the
KNOWN ISSUES row closed. Fixture for the browser check: grade 336 (Marwin,
Grade 6 Mathematics, term 1), created and locked as admin, left locked until
Darryl confirms, then unlocked and deleted through the API. Full row:
`docs/CHANGELOG.md`, 2026-09-18.

**Seeded baseline lives in one place:** CLAUDE.md → CURRENT STATE → Seeded
baseline. Do not repeat the live counts here. After a clean `db:setup` the
demo Grade 1 path exists: Nino Alcantara (LRN `1090001`, Grade 1 - Mabait),
parent Rosa (active — the account is named, never its login id or password;
both are in `seed.sql` and CLAUDE.md's Seeded baseline), teacher TCH-003 (Lito
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
| Authentication | ✅ `users` (status ENUM now `pending`/`active`/`rejected`/`inactive`) | ✅ 4 endpoints — login, me, change-password, contact | ✅ Login page, `ProtectedRoute`, axios JWT interceptor, Parent → Settings (`/parent/settings`, 2026-09-09) and Teacher → Settings (`/teacher/settings`, 2026-09-10). Identity locked; password + contact only. Never school `GET /api/settings` | ❌ | 56/56 auth tests pass (`npm run test:auth`; 2026-09-15: a wrong current password on change-password is `403`, not `401`, so Settings no longer logs a teacher or parent out on a typo; 2026-09-18: `middleware/auth.js` answers `401` "Account is not active." on a live session — login keeps `403` + `status` — and `POST /users/parents` is `403` for a teacher neither assigned to nor advising the student's section), idempotent — no `db:setup` needed between runs. **2026-09-12: `fetchUserByLoginId()` no longer SELECTs `s.lrn`.** Login, `GET /me`, and `PUT /contact` all use that helper. The key is **absent, not `null`** (teacher/admin used to carry `lrn: null` from the LEFT JOIN). Parent still has `login_id` (the LRN) plus the four JOIN columns Settings reads. `PUT /api/auth/contact` (2026-09-09): own `contact_number` only; identity fields in the body are `400`. Login round-trip verified in browser — admin → `/admin`, wrong password → inline error, pending account → inline message, refresh → spinner with no flash. `authenticate` and login both already had a generic `status !== 'active'` fallback, so adding `'inactive'` (for User Management) needed zero changes there — deactivation takes effect immediately, even on an already-issued JWT. `sanitizeUser()` hardened and moved to `utils/sanitizeUser.js` (was duplicated in `routes/auth.js` and `routes/users.js`) — now strips any key containing `password`, case-insensitive, not just the exact key; closes the aliased-JOIN gap Messages was about to trigger. 9/9 direct-call unit tests (`npm run test:sanitize`). Mobile: Expo project doesn't exist. |
| User Management (Admin) | ✅ `users` | ✅ 9 endpoints — create teacher, create parent, list pending, approve, reject, list, view, edit, status | ✅ Admin → Users (`/admin/users`, 2026-09-09). Pending queue, directory, create teacher, edit, activate/deactivate. Never parent-create (teacher-only). AdminDashboard derives from nav | ❌ | 47/47 tests pass (`npm run test:users`), idempotent. Create parent (2026-09-18, B1 2026-09-19): the teacher must be assigned to the student's class OR advise its section — LRN and scope resolved in one query before the two `409`s, so an unknown LRN and an out-of-scope student (with or without a parent already) are the same `403`; no `404` on this route. `PUT` rejects `role`/`login_id`/`student_id`/`password`/`status` with `400` naming them rather than silently ignoring. `PATCH .../status` (active/inactive only): blocks self-deactivation unconditionally, blocks deactivating the last active admin via an independent count check, and requires the account's *current* status already be active/inactive — a pending/rejected account must go through approve/reject first. Schema change: `users.status` ENUM gained `'inactive'` (see Authentication row). Web: do not write on seeded parent `1234567` (Jea) — `test:auth` depends on `pending`. |
| Grade Management & Viewing | ✅ `grades`, `grade_components`, `grade_weight_configs`, `transmutation_table`, `grading_mode_configs` | ✅ **10** grade endpoints plus `GET /grading-modes` (`GET /`, `GET /:id`, `GET /student/:studentId`, `POST /`, `POST /:id/components`, `PATCH /:id/exam`, `PUT`/`DELETE /:id/components/:componentId`, `PATCH /:id/lock`, **`DELETE /:id`**) — **`PATCH /:id/descriptive` was an eleventh until 2026-09-22, when it was RETIRED** | ✅ teacher encode + parent report card + term breakdown | ❌ | **Schema rebuilt (Stage G1a, 2026-09-05).** All original policy questions answered per `docs/GRADING_SPEC.md` (DO 009/DO 015 s. 2026), and the schema now matches: `grade_weight_configs` re-keyed to `(subject_id, school_year)` with `ww_weight`/`pt_weight`/`ex_weight` (was grade-band, `quiz`/`activity`/`exam`) — seeded provisionally against the current placeholder `subjects` rows, since `subjects` itself was deliberately kept out of this stage (see Stage G1b below); `grades` gained `term TINYINT` (was `quarter` ENUM), `ww_`/`pt_`/`ex_` percentage+weighted columns, `initial_grade`, `term_grade`, `descriptive_grade` — dual-mode by design, exactly one of `term_grade`/`descriptive_grade` populated per row, self-describing at read time; `grade_components.type` is now `ENUM('WW','PT')` only (was `quiz`/`activity`), deliberately no `'formative'` value; new `transmutation_table` (41 rows, SY 2026-2027 only, verified gap/overlap-free by `scripts/verify-grading-seed.js`) and `grading_mode_configs` (Grade 1 descriptive, Grades 2-6 numerical for SY 2026-2027). Grade 1's letter grade was believed to be a **manual teacher judgment call** at the time of this Stage G1a entry — no IG-to-letter formula exists in DO 015, and computing one was rejected here as "numerical grading wearing a letter costume". **The SCHOOL overturned that on 2026-09-22: the letter IS computed** (WW 30 / PT 50 / Summative 20, banded on the raw weighted score — `docs/GRADING_SPEC.md` §6a), and it was built the same day. The reasoning below is kept as the record of what was believed then, not as current behaviour." **Same day, Stage G2a adds the write-path arithmetic** — `server/utils/gradeComputation.js`, pure functions only (`componentPercentage`, `subTestPercentage`, `exPercentage`, `weighted`, `initialGrade`, `roundTo2`), every one returning `null` on a missing required input rather than a partial/guessed grade. Rounds half-up (not half-to-even) to 2 decimals at every step, feeding the rounded value forward so displayed math always checks out by hand; a `Number.EPSILON` nudge corrects floating-point representation error at exact `.005` boundaries. Percentages over 100% (bonus points) are deliberately not clamped. **G2a also corrected a G1a schema mistake**, found before any G2 code was written against it: EX's raw sub-test scores were not being retained, unlike WW/PT — fixed by splitting `ex_st1`/`ex_st2`/`ex_te` into raw-score columns plus new `ex_st1_max`/`ex_st2_max`/`ex_te_max` columns, with `ex_percentage` now a derived cache, not the source of truth. `npm run test:grade-computation` — 29/29, including two full worked examples with hand-checkable numbers (same raw scores under core 20/50/30 weights → IG 88.05, vs. MAPEH/EPP 20/60/20 weights → IG 88.50). **Same day, Stage G2b adds `routes/grades.js`** — exactly one endpoint, `POST /`, creating a shell row (every score/computed column `NULL`, `is_locked 0`) with zero computation — `gradeComputation.js` isn't imported here at all. Scoping is the **subject teacher's**, via `teacher_assignments` (`teacher_id`+`subject_id`+`grade_level`+`section`, all four) — a second, deliberate scoping authority alongside `sections.adviser_id` (attendance, excuse-letter review), narrower than `students.js`/`content.js` since it also requires the specific subject to match, not just grade+section. A nonexistent `student_id` is `404` for admin but `403` for a teacher (collapsed with "out of scope" so a teacher can't tell which) — read directly from `attendance.js`'s own precedent and asserted as its own named test property so a future refactor can't silently collapse it. The subject/student-grade-level mismatch check runs strictly *after* scope is resolved, not before — checking it earlier would let an out-of-scope teacher learn a real student's grade level by probing with a wrong subject, which is exactly the enumeration the ordering (documented in a code comment) prevents. `npm run test:grades` — was 26/26. **2026-09-06, Stage G2c adds `POST /:id/components` and `PATCH /:id/exam`** — the first writes that actually compute anything and the first HTTP path through `gradeComputation.js`'s pure functions. `recomputeGrade()` (the DB-touching glue) lives in `routes/grades.js`, not `gradeComputation.js`, which stays pure by design; it re-derives WW/PT percentages from every `grade_components` row every time (never an incremental total), fetches the subject's `grade_weight_configs` row, and looks up `transmutation_table` for the Term Grade — all inside one transaction with the write that triggered it, so a failure after an insert rolls the insert back too. A missing `grade_weight_configs` row is a pre-flight `409` (checked before any write, alongside `grading_mode_configs` and `is_locked`) rather than saving the raw score with blank computed columns, which would look like a broken system to the teacher entering it. `PATCH /:id/exam` takes any subset of ST1/ST2/TE; score and max are always a pair (explicit `null` clears both; a lone value with no existing counterpart is `400`). `POST /:id/components` returns both the new component and the recomputed grade; `PATCH /:id/exam` returns only the grade — deliberate, commented, since only the first creates a child resource. A full worked example was driven step-by-step through the real endpoints, reusing the exact numbers from `test-grade-computation.js`: WW 45/50 then 42/50 (accumulating correctly across two *separate* requests — the one property a pure unit test can't prove), PT 88/100+92/100, then ST1/ST2/TE one at a time with `initial_grade` staying `NULL` until all three land, then landing on exactly **88.05** (core 20/50/30 weights) — repeated against a MAPEH-subject row for **88.50** (20/60/20 weights) with the identical raw scores, proving the weight lookup is what changed. Both transmute to **TG 90**, checked against a live `transmutation_table` query, not hardcoded. Found and fixed a real test-writing gotcha (not a production bug): mysql2 returns `DECIMAL` columns as strings, so the first pass of strict `===` assertions failed on correct values — `gradeComputation.js` already guards against this internally via `Number()`, so this was a test-assertion fix only. `npm run test:grades` — 56/56, confirmed three times. **Same day, Stage G1b reseeds `subjects` with the school's real 40-subject curriculum** (5/5/6/8/8/8 for Grades 1-6, transcribed from `docs/GRADING_SPEC.md` §6c), replacing G1a's uniform 8-subject placeholder. Grade 4's list is recorded as **inferred, not confirmed** — never photographed, matched to the SF9's 8 intermediate-level rows and Grade 5's photographed program. Grade 6 seeded under the SF9's names (GMRC, EPP) rather than the class program's (ESP, TLE) for the same two learning areas, since that's what the parent actually holds; alternates recorded in a comment. `grade_weight_configs` reseeded to 35 rows via `SELECT ... JOIN grading_mode_configs ... WHERE mode = 'numerical'` — a durable exclusion, not a hardcoded `grade_level >= 2`: the JOIN means Grade 1 (and, automatically, whichever grade goes descriptive next per the KS1 rollout) never gets a weight row, without needing a code change when that happens. The anticipated cascade (`subjects.id` `ON DELETE CASCADE` from `teacher_assignments`, `grade_weight_configs`, and `grades`) landed exactly as planned — a live precondition check confirmed `grades` was empty before the reseed ran, so nothing real was destroyed. `setup-db.js`'s `teacher_assignments` INSERT and every existing test fixture needed **zero code changes**, since both already resolve subjects by name/grade_level rather than a hardcoded id, and every name they reference survives into the new curriculum — confirmed by tracing the actual SQL and grepping the whole `server/` tree, not assumed. `scripts/verify-grading-seed.js` extended to prove the reseeded shape from the output side — 20/20 passing (was 11/11). **Same day, Stage G2d adds `PATCH /:id/descriptive`** — Grade 1's manual A-E letter, the other side of the numerical/descriptive gate G2c built. **Recorded explicitly as an assumption the module proceeds on, not a school-confirmed answer**: the school hasn't said how a teacher arrives at A-E, and DO 015 defines no Initial-Grade-to-letter formula — descriptive grading existing to avoid numerical labeling in KS1 is the reasoning that justifies proceeding, not a school reply; if that changes, this endpoint changes, not the schema. `preflightGradeWrite()` was refactored (not duplicated) to take an `expectedMode` parameter shared across all three write endpoints, since two copies of scope/mode/lock logic would drift silently over time — the full 56-assertion grades suite was re-run immediately after that refactor and before the new endpoint was written, so a regression would be attributable to one or the other, not both at once; it passed unchanged. No transaction (a single-column `UPDATE`, nothing derives from it); `descriptive_grade: null` clears the column, mirroring G2c's own clearing convention; `is_locked`'s gate comes for free by reusing the shared preflight function. `npm run test:grades` — was 71/71. **Same day, Stage G2e adds `PUT`/`DELETE /:id/components/:componentId` and `PATCH /:id/lock`** — the toggle that finally lets the `is_locked` gate every write endpoint has checked since G2c actually fire. Component edit stays nested under `/:id/components/:componentId` (not flat) for consistency with its siblings; a `componentId` not belonging to the given grade is `404`, undifferentiated. `type` is not editable — a differing `type` is `400`, correcting a miscategorized entry is delete+recreate. Deleting the last component of a type needed zero new code: `componentPercentage([])` already returns `null`, so `ww_percentage`/`pt_percentage` and, if that was the last required input, `initial_grade`/`term_grade` too, revert to `NULL` automatically — verified against a fixture built to full completion first (Initial Grade **83.30**) so the reversion is from a real value, not a trivial already-null case. `PATCH /:id/lock` stays admin-only, unscoped — confirmed, not extended to teacher self-locking, and recorded as an open school question in OPEN QUESTIONS. **Deliberately not gated on completeness** — an `initial_grade IS NOT NULL` check would make every Grade 1 row permanently unlockable, since descriptive rows never populate that column by design; reasoning stated as a comment directly on the handler. Unlock carries no extra friction versus lock — no step-up auth, unlike Restore, since an unlock is reversible by re-locking. Both `PUT` and `DELETE` are transaction-wrapped with `recomputeGrade()`, identical to `POST /:id/components`. `npm run test:grades` — was 96/96. **2026-09-06, Stage G3 adds `GET /`, `GET /:id`, `GET /student/:studentId` — a parent can finally see a grade.** Built in three isolated passes so a break would be attributable to one of them. PASS 1 refactored `loadAuthorizedGrade()` into two tiers: a new wide view-scope (grade+section, any subject — matching `students.js`'s own pattern) determines `404`; the existing narrow encode-scope (subject-specific) now only gates writes, via a new `encodeScopeError()` check added to all five `:id`-keyed write endpoints — this is the confirmed resolution of G2b's provisional 404: a teacher who can see a grade via the new wide scope but isn't its encoding teacher now gets `403` naming the subject, not `404`, since a `404` there would contradict what `GET` already shows them (the same reasoning Excuse Letters' review endpoint already used). PASS 2 added two pure lookups to `gradeComputation.js`: `qualitativeDescriptor()` (GRADING_SPEC Table 11 — numeric band to descriptor+remarks) and `descriptiveGradeMeaning()` (Table 8 — letter to descriptor+Filipino); a test confirms Table 8's five English words are literally the same words as Table 11's five bands, not independently invented. PASS 3 built the three endpoints: `GET /` lists with role-scope baked into the `WHERE` clause and four optional filters (student_id/subject_id/term/school_year, no hidden defaults — all four together resolve to at most one row, closing a lookup gap that's existed since G2b); `GET /:id` adds `grade_components` plus a computed `descriptor` (list omits both, by design — a list is for finding a row, not inspecting one); `GET /student/:studentId` is the full report card — every subject at the grade level including ones with zero grade rows, all three terms, a computed Final Grade and General Average. **Both Final Grade and General Average follow the exact same NULL-until-complete rule as Initial Grade — deliberately not a running average.** A partial Final Grade determines promotion and prints on the SF9, so a parent seeing one early would reasonably treat it as settled, and no later caveat undoes that. General Average, deprioritized since G1a/G2a, is built now — it's the direct extension of a computation that already exists at read time. For a descriptive-mode student (Grade 1), both are genuinely `null` — not incomplete, not applicable at all — distinguished from "still in progress" via an explicit `grading_mode` field. `school_year` on this one endpoint defaults to `system_settings.academic_year` when omitted, deliberately unlike `GET /`'s no-default filters, since a report card is bounded to one year by what it is. Verified with a dedicated Grade 2 fixture (5 subjects, direct SQL inserts of `term_grade` bypassing the write path on purpose — only the aggregation needed new coverage): Final Grade null with 1 term, null with 2, populated at 85.00 with 3 (hand-checked (80+85+90)/3); General Average stays null until the last subject completes, then populates at 86.60 (hand-checked (87.00×4+85.00)/5). `npm run test:grades` — 141/141, confirmed three times; `npm run test:grade-computation` — 51/51. Full 14-suite regression matched every prior count. **Grades is now fully built, all nine stages.** See CLAUDE.md's Grades module section and the 2026-09-06 CHANGELOG entry. **2026-09-15:** `npm run test:grades` 167/167; locking an already-locked grade is `200` with no log entry. **2026-09-21 (DV3):** `GET /student/:studentId` gained **`term_averages {1,2,3}`** — one average per term across every learning area, same `roundTo2` and the same null-until-EVERY-subject rule as Final Grade and General Average, deliberately carrying no descriptor. `npm run test:grades` **189/189**, confirmed twice (the 167 above was three dispatches stale: pagination took it to 182, DV3's term-average assertions to 188, and a contract assertion on the report card's seven top-level keys to 189). **2026-09-22 (grading fixes):** `computeFinalGrade` now uses a new `roundToWhole()` — **a Final Grade is a WHOLE number**, half-up, because the school's Summary of Grades and DO 015 both print it as one and its three inputs are already whole; the card had been showing 89.33 for (87+91+90)/3. **`general_average` and `term_averages` keep `roundTo2` over the already-rounded finals** — the school's sheet adds eight whole grades and prints 721/8 = 90.125 as 90.13, so averaging unrounded finals would disagree with the paper. `final_grade_descriptor` follows the rounded value, so 89.5 → 90 reads *Advancing*. Grade 1's **"Reading" became "Reading and Literacy"** via `scripts/migrate-reading-and-literacy.js`, which UPDATEs in place because `subject_id` cascades and a delete would have destroyed Nino's two seeded letters. `npm run test:grades` **197/197** (8 rounding assertions: 89.333→89, every final integral, 721/8→90.13, not 90.12, 89.50→90 and its band move); `test:assignments` **56**, `verify-grading-seed` **33**. **Decided but NOT built:** how the Grade 1 letter is computed — `docs/GRADING_SPEC.md` §6a. |
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
`POST /users/parents` had
no assignment check until 2026-09-18 (now assigned OR adviser, `403`
otherwise — `feat/authorization`). `PUT /api/students/:id` refuses a class change (`400`)
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
`/parent/grades` as Nino's parent (Rosa) to retire it. Do not add a fifth
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
as Marwin's parent, then as Nino's (Rosa) — accounts by name, never by
login id or password (§5c; both are in `seed.sql`). Password: type full
words → Change password → modal → **Go back** (no PUT). **Do not confirm a
real change.** Hard reload if HMR looks wrong.

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
TCH-001's password restored to its seeded default after a review
change; Jea still
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
- [x] **Grade 1 computed letters — DONE 2026-09-22** (server + client, both
      browser-checked). The letter is computed from WW 30 / PT 50 /
      Summative 20, banded on the raw weighted score; **`PATCH
      /:id/descriptive` is RETIRED**, so Grade 1 encodes through the same
      four score endpoints as every other grade level. A **Final letter**
      once all three terms are recorded; **no General Average in Key Stage 1**.
      A legacy row (a typed letter, no scores) keeps its letter and shows no
      Final — correct, not a bug.
- [ ] Web pages: admin lock/unlock control (and admin delete of an unlocked
      wrong-student / wrong-term shell — `DELETE /api/grades/:id` exists).
- [ ] **Class-record grid — NEXT, MOCKUP FIRST.** One screen per subject +
      section + term, the DepEd E-Class Record shape. Today a teacher encodes
      one learner at a time through a modal — one quiz for 40 learners is up
      to 80 requests. **Carries a server fix: scores and highest-possible
      scores are WHOLE NUMBERS only** (the school never awards half points),
      and the refusal belongs at all four write endpoints, not on the grid's
      inputs.
- [ ] Expo screens (Stage 5, not started).
- [ ] Open, not blocking: whether a teacher may lock their own encoding is
      still an open school question — see CLAUDE.md's OPEN QUESTIONS.
      **Grade 1's letter is no longer on that list; it was answered and built
      on 2026-09-22.**

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
- [ ] Change every default password — **one per role: admin, teacher,
      parent.** The values are in `seed.sql` and are deliberately not
      repeated here; naming them in a doc is the same publication the
      to-do exists to end. They are in the public repo, and a parent's
      login id is their child's LRN, so anyone who knows the LRN knows
      that account's password too.
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
````

---

## docs/SETUP_NOTES.md — the Phase 1 checklist, moved 2026-09-30 (docs/stage5)

Verbatim as it stood in `docs/SETUP_NOTES.md` until 2026-09-30. The live
state is `CLAUDE.md` → BUILD ORDER and `docs/PROJECT_PROGRESS.md`.

## Ano na ang tapos (Phase 1)

> **SNAPSHOT NG PHASE 1, hindi kasalukuyang estado.** Tama ang mga numero sa
> ibaba noong isinulat sila; matagal nang lumampas ang code. Tapos na ang
> React web (Stage 4) — ang mga unchecked na kahon sa ibaba ay hindi na bukas
> na trabaho. Ang buhay na estado ay nasa `CLAUDE.md` (tables, endpoints) at
> `docs/TESTING.md` (suites); walang bilang dito para hindi ito ma-stale
> ulit. Hindi ito
> ina-update nang paisa-isa: ang pag-aayos ng isang linya lang dito ang
> magpapamukha sa buong seksyon na maintained, na siyang mismong babala sa
> README.

- [x] `database/schema.sql` — 18 tables
- [x] `database/seed.sql` — subjects, students, settings
- [x] `server/` — Auth API (login, users, approve/reject)
- [x] `npm run test:auth` — 23 tests
- [ ] Grades, attendance, announcements, etc.
- [ ] React web
- [ ] Expo mobile

---

## CHANGELOG stubs moved from CLAUDE.md on 2026-09-30 (nineteenth batch, docs/stage5)

Verbatim, oldest last, as they stood in `CLAUDE.md` → CHANGELOG until
2026-09-30. Each full row is in `docs/CHANGELOG.md`.

| Date | Change |
|------|--------|
| 2026-09-29 | **`feat/sms-transport`** (merged): reset codes by text beside email through a phone-hosted gateway; the `verify-contact` pair; one code to every confirmed channel, one sentence; F1/F2 copy. `test:recovery` 110, `test:users` 73, `test:sms-transport` 62; phone check and re-check passed, cleaned up by id. Full row: `docs/CHANGELOG.md`. |
| 2026-09-29 | **`fix/mobile-popto`**: every modal returns with `popTo` — no second drawer or Login (M16); B1, the auth stack's `screenLayout` rendered as an element (a layout is CALLED inside the navigator's render, so a hook there broke its hook order; pre-existing since `7c7530c`); P1, the parent and teacher dashboards re-fetch on focus (M14), the mount fetching once. `proof:routes` 33/33; phone re-check passed, cleaned up by id. Full rows: `docs/CHANGELOG.md`. |
| 2026-09-29 | **Stage 5, branch 4 — `feat/mobile-admin`**: every admin screen; the temporary password shown once, capture-blocked, cleared on background; modal screens return with `popTo`. Proofs 10 / 14 / 6 / 12; mirrors 22. Full rows: `docs/CHANGELOG.md`. |
| 2026-09-28 | **Stage 5, branch 3 — `feat/mobile-teacher`**: every teacher screen; Grades one slot at a time; the attendance prompt on a date or section change (a drawer screen is never removed). Proofs 20 / 11 / 11 / 13; mirrors 22. Full rows: `docs/CHANGELOG.md`. |
| 2026-09-27 | **Stage 5, branch 2 — `feat/mobile-parent`** (seven commits, merged fast-forward after the checkpoint check, the second-half check and three re-check rounds): the drawer shell and pure route map, the socket, bell and Notifications screen, Settings, About, and every parent screen. Proofs 15 / 21 / 21 / 15; mirrors 12. Full row: `docs/CHANGELOG.md`. |
| 2026-09-27 | **Stage 5, branch 1 — `feat/mobile-scaffold`** (five commits, merged fast-forward the same day after Darryl's seven-item phone check passed, one re-check round for the 503 path): `mobile/` on Expo SDK 57, the hotspot proved phone → `/api/health` first, sign-in + session rules + theme + root navigator, tokens generated from the web's stylesheet, dev-only code excluded at Metro's resolver because the Hermes export does not inline `__DEV__`. Proofs 21/21 and 8/8; four lint figures in `docs/TESTING.md`. Full row: `docs/CHANGELOG.md`. |
| 2026-09-26 | **Smoke gate + fix/smoke-gate** (to `12a3495`, 12 commits): suites, proofs, lint, smoke all green; twelve write flows and a same-backup restore proved in a browser, cleaned by id. Twelve browser-found defects fixed — the full list is the `docs/CHANGELOG.md` row. |

---

## OPEN QUESTIONS — answered school bullets and closed engineering bullets as they stood in CLAUDE.md until 2026-09-30 (docs/stage5)

Verbatim. CLAUDE.md keeps one dated "do not re-ask" line for each.

### School questions — answered

- **2026-09-26 — "Quiz up to 10" means FIVE written-work slots, confirmed**;
  `WW_SLOTS = 5` stands as the school's figure, not a client guess.
- **2026-09-23 — mid-year transfer: the OLD adviser owns pre-transfer
  attendance, the NEW adviser from the transfer date, the parent sees the
  whole year.** BUILT 2026-09-26 (#6) as `recorded_by` OR adviser of the
  current section — the new adviser sees pre-transfer rows too, a superset
  of the school's "via the card", accepted; handover is outside the system.
- **2026-09-23 — the printed subject order is CONFIRMED for every grade**;
  Grades 2 and 3 are a seed change, pre-Stage-5 (k).
- **2026-09-23 — the school DOES award bonus points** (event participation,
  added to PT). Over-HPS stays flagged, never blocked.
- **2026-09-22 — how the Grade 1 A–E letter is produced: it is COMPUTED**, not
  a hand-picked judgment. WW 30 / PT 50 / Summative 20, Summative split
  ST1 30 / ST2 30 / TE 40, banded on the **raw** weighted score with no
  transmutation. The full rule is `docs/GRADING_SPEC.md` §6a. **It is the
  school's practice, not DO 015** — that order defines no
  Initial-Grade-to-letter formula — so do not cite it as DepEd policy.
  **BUILT the same day**; `PATCH /:id/descriptive` is retired and a letter
  can no longer be set by hand.
- **2026-09-01 — Principal Bajar, consultation:** no contributions from
  parents → Feature 7 removed 2026-09-13.
- **2026-09-13 — the principal, in conversation:** Late counts as present,
  Excused as absent → "Present on recorded days" on Parent → Attendance; a
  school decision, not DepEd's (DO 015 prescribes no rate); never attribute
  it to DepEd. Mid-year transfer ownership was NOT answered.
- **2026-09-11 — the team, in conversation, seven answers, all built:** three
  terms; both grading modes; three components; weights by learning area; lock
  admin-only; parents know the LRN (login design stays); raw WW / PT / Exam
  scores in the parent modal — approved.

### Engineering — closed bullets

- **ANSWERED 2026-09-30 — yes, built with the phone's words (§17c).** **Should
  Teacher → Attendance warn before leaving with unsaved marks?**
  A bulk submit can lose a whole roster in one navigation; Teacher → Grades
  does not warn because every score is its own request. Decide for Attendance
  specifically; no blanket `beforeunload`.
- **The adviser-with-no-subject-assignment case is NOT theoretical** —
  TCH-002 is that account in the seed. Read scopes were widened to assigned
  OR adviser in `routes/students.js`, `routes/excuses.js` (including the
  existence query inside review), `routes/content.js` (the one WRITE gate
  widened, deliberately — the Class Board is a school requirement) and
  `routes/messages.js` (`canMessage()`, both directions) — all DONE
  2026-09-06/07 via `utils/teacherScope.js`. **`routes/grades.js` is
  deliberately NOT widened** — grade encoding is the subject teacher's
  authority; widening it would invent school policy.
- **`Account is not active.` is `401` since 2026-09-18** (`middleware/auth.js`,
  `feat/authorization`) — it was the one 403 in the API that meant a dead
  session, and the reason the client once redirected on every 403. A
  mid-session deactivation now logs the user out on their next request.
  Login keeps `403` + `status` for the same accounts. Closed; kept here so
  the old row is not re-derived.
- **Endpoint audit — run 2026-09-07, three-way diff (this file's table,
  `docs/API_REFERENCE.md`, the handlers actually mounted), all three buckets
  empty.** Re-run after any dispatch that adds or removes an endpoint. Its
  carried items: `GET /api/students`'s `?status=` is now validated
  (2026-09-15) and `?status=all` is verified (2026-09-14 — the earlier
  "unverified" entry was itself stale; `test:students` had proved it since
  the endpoint was built); the contacts empty-cause is a Stage 4 copy
  question, not a backend fix (KNOWN ISSUES); `docs/API_REFERENCE.md` lists
  `GET /api/users` under a `user` wrapper row — a doc slip, the endpoint
  returns `users` only.

---

## BUILD ORDER → Stage 5 as it stood in CLAUDE.md until 2026-09-30 (docs/stage5)

Verbatim. CLAUDE.md keeps one line per item.

### Stage 5 — Mobile (Expo)

**Plan approved 2026-09-27; order Parent → Teacher → Admin, one branch per
step, the docs pass bundled on Thursday (`docs/stage5`). Target Friday
2026-10-02, a buffer, not a cutoff.**

- [x] **Expo project setup + navigation — `feat/mobile-scaffold`,
      2026-09-27.** SDK 57, NativeWind, the generated tokens, React
      Navigation, the hotspot path proved phone → `/api/health`. **Darryl's
      phone check PASSED 2026-09-27, all seven items** (Connection check,
      each seeded role, Light / Dark / System, the 401 path, the 503 path
      after one re-check round, the forced change); merged fast-forward.
- [x] **Login + role routing — same branch.** Login, Forgot password, Forced
      change, `AuthUnavailable`, the root navigator, three empty role homes.
- [x] **Parent screens — `feat/mobile-parent`, 2026-09-27** (+ drawer, socket,
      bell, badges, `LiveStatus`, Settings, About, Notifications). Phone
      checks passed: the checkpoint (8), the second half (7), three re-check
      rounds (safe areas, the keyboard). Rules: `docs/MOBILE_CONVENTIONS.md`
      M9–M12.
- [x] **Teacher screens — `feat/mobile-teacher`, 2026-09-28.** Phone checks
      passed: first half (8), second half, one fix round (F1). Rules: M13–M15.
- [x] **Admin screens — `feat/mobile-admin`, 2026-09-29** (Backup & Restore
      web only, hidden from the drawer). Phone checks passed: first half
      (12), second half (8), one fix round (A1). Rules: M16–M18. **Every
      role's screens are built.** **NEXT, in order (2026-09-29):**
      `fix/mobile-popto` (merged) → SMS transport (merged) → server
      reliability (merged) → UI polish (`feat/ui-polish`, merge-ready) →
      `docs/stage5` → full phone test / smoke gate →
      manuscript delta list. SMS moved before server reliability by
      Darryl's decision.
- [ ] ~~Push notifications~~ → **In-app notifications only, via Socket.io
      (Darryl, 2026-09-27).** The bell, badges and `LiveStatus` on the same
      socket as the web; no `expo-notifications`, no `push_token` column.
      Remote push is unavailable in Expo Go on Android since SDK 53 and would
      need a development build, Firebase and a server-side send — a separate
      decision if ever wanted. Built on the Parent branch.

---

## CHANGELOG stubs moved from CLAUDE.md on 2026-10-02 (twentieth batch, docs/claude-md-trim)

Verbatim, as they stood in `CLAUDE.md` → CHANGELOG until 2026-10-02. Each
full row is in `docs/CHANGELOG.md`. The "(not merged)" notes record their
date: `feat/nav-drawer-groups` and `docs/stage5` were merged later.

Most recent, one line each (the full row is in `docs/CHANGELOG.md`):

| Date | Change |
|------|--------|
| 2026-09-30 | **`feat/nav-drawer-groups`** (not merged): the phone drawer follows the web sidebar — the same groups (`navGroups.js`, the 23rd mirror), foldable on the phone (`pp.navGroups`), the user card with the one Logout icon; on both, the card opens Account information. Full row: `docs/CHANGELOG.md`. |
| 2026-09-30 | **`docs/stage5`** (not merged): the docs pass — README, PROGRESS, SETUP_NOTES, TESTING, both conventions docs and KNOWN_ISSUES checked against the code; parent login ids and password values out of the docs; the conservative CLAUDE.md trim. Full row: `docs/CHANGELOG.md`. |
| 2026-09-30 | **`feat/ui-polish`** (merged, `c610bd8`; checks passed, cleaned up by id): the web sidebar grouped, collapsible to a rail (`pp.sidebar`), a drawer below `md`, the user card with the one Logout; the new teacher's login id in the banner; Records' dates stacked; the admin dashboard fetches once; f: whole-card dashboard links, the login sentence; the parent dashboard back to its 69bae24 layout; equal calendar cells; figures one size down (§24). Full rows: `docs/CHANGELOG.md`. |
| 2026-09-30 | **`fix/server-reliability`** (merged): the backup reset NAMED — `--watch` restarting on `node_modules` access-time events; `dev` watches our code only; `.partial` safeguard; deletes remove their notifications and signal recipients (A2); web Attendance leave prompt. Full row: `docs/CHANGELOG.md`. |

---

## Moved from CLAUDE.md on 2026-10-02 (docs/claude-md-trim)

Verbatim, in CLAUDE.md's order, as each stood until 2026-10-02. CLAUDE.md
keeps every heading, a one-line pointer here, and — word for word — every
rule these passages carried that has no other living home (the three
`activity_logs` rows of 2026-09-21, MOCKUP FIRST, the one email rule, the
December break, and Stage 4's four page rules). Every other rule is stated
in a living doc: `docs/FRONTEND_CONVENTIONS.md` §3a, §13d, §13g, §15a,
§18–§23; `docs/API_REFERENCE.md` (settings, attendance, students);
`docs/KNOWN_ISSUES.md`; `docs/TESTING.md`; `docs/MOBILE_CONVENTIONS.md`;
README / `docs/SETUP_NOTES.md`.

### Front matter → the endpoint-count history

> Both +3 on 2026-09-30 (the profile-photo three); +2 on 2026-09-29 (the
> `verify-contact` pair); +1 on 2026-09-26.
> Both recounted from the code on 2026-09-22, which moved them twice in one
> day: `PATCH /grades/:id/descriptive` retired (−1) and the class record's
> `GET` and `PUT` landed (+2). The archived endpoint table's 81 rows are a
> dated 2026-09-19 snapshot, not a third figure.

### CURRENT STATE → Grades — fully built (write path + viewing), Stage 3's last backend module

Nine stages (G1a → G2a → G2b → G2c → G1b → G2d → G2e → G3): the schema is
correctly shaped for DO 009/DO 015 s. 2026, `subjects` holds the school's
real 40-row per-grade curriculum (Stage G1b — Grade 4's list is recorded
as inferred, not confirmed), the write-path arithmetic exists as pure,
unit-tested functions (`utils/gradeComputation.js`), a teacher can create,
encode (WW/PT and exam — called Summative in Grade 1 — through the same four
endpoints at every grade level since 2026-09-22; **Grade 1's A–E letter is
COMPUTED from those scores, not typed**, and the hand-picked letter G2d built
is gone with its endpoint), correct, delete, and an admin can finalize
(lock/unlock) a grade row against the real curriculum. **Stage G3 (2026-09-06) closes the loop — a parent can now see
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

### BEFORE THE PARENT DEMO → the contacts-endpoint item (closed: built 2026-09-07)

- **`GET /api/messages/contacts` must exist before the demo, not after.**
  Without it, a parent has no way to find their child's teacher to
  message them — they'd need to already know a numeric `user_id`, which
  no parent will. Flagging a real scheduling tension this creates: the
  section above deliberately defers this endpoint to "build alongside
  the Stage 4 Messages page." If the parent demo happens before Stage 4
  web pages are underway, this specific endpoint needs to be pulled
  forward ahead of the rest of that page's build — that's a scheduling
  call, not a technical one, and isn't resolved here.

### BUILD ORDER → Stage 4 — the built list, the CLOSED note and the interleaved backend checklist

**All 22 built and ticked, 2026-09-06 → 2026-09-14.** Foundation · Teacher →
Attendance · Attendance records · Students · Excuse Letters · Announcements,
Memos, Events · Messages · Grades · ~~Contributions (removed)~~ · Settings ·
Parent → Announcements, Memos, Events · Grades · Grades breakdown · Excuse
Letters, Messages · Attendance · Settings · Admin → Users · Students ·
Settings · Attendance · Announcements (with memos) · Grades · Backup &
Restore. **Parent → Attendance and Parent → Grades have since been replaced
by DV2 and DV3** (see below); the dated entries record what shipped then.

**Stage 4 — CLOSED 2026-09-14.** Every Figure 5 admin process has a page.
Sections, Excuse Letters, Memos, Events and Messages are not built by the
scope decision (ADMIN SCOPE AUDIT → SCOPE DECISION) — not unfinished work.
**They were removed from the admin nav on 2026-09-18** rather than left
dimmed; see that date's SCOPE DECISION. What comes next is the interleaved
block below, then Stage 5 (Expo).

**Backend work interleaved with Stage 4:**

- [x] Assignments + Subjects API — **DONE 2026-09-08.**
- [x] `GET /api/grading-modes` — **DONE 2026-09-08.** Missing config is `409`;
      not a settings key; wrapper is an object.
- [x] `DELETE /api/grades/:id` — **DONE 2026-09-08.** Admin-only, `403` when
      locked.
- [x] `GET /api/messages/contacts` **plus the endpoint audit** — done 2026-09-07.

### BUILD ORDER → After Stage 4 — interleaved, before Stage 5

**Stage 4 is closed and stays closed.** Nothing here reopens it; this is the
work that has landed on top of it, and the work that must land before Expo
starts. Full write-ups are on each dispatch’s `docs/CHANGELOG.md` row — this
is the order, not the record.

**DONE — sixteen items, 2026-09-18 → 2026-09-23.** Each write-up left this
file permanently under the REFILL RULE and is verbatim in `docs/ARCHIVE.md` →
BUILD ORDER → After Stage 4. Every rule they carried is already stated in its
own place; the one exception is kept below.

- [x] **Server hardening A, B, C** — validation · authorization · pagination.
- [x] **D1 tokens · D2 dark mode · D3 brand + sticky chrome** — §8, §9.
- [x] **Empty-state duplicate fix** (§5f gained the rule).
- [x] **Login redesign** — brand split panel, moved onto `FormField`.
- [x] **Notifications** (N1/N2/N3) — the 21st table, four endpoints, the bell
      and the badges. §10.
- [x] **Account recovery** (R1/R2/R3) — the 22nd table `auth_codes`, five
      endpoints, the `token_version` counter. §11.
- [x] **Dashboards, all three roles** (DB1/DB2/DB3, 2026-09-20). §12.
- [x] **DV1 — DataTable restyle + card layout below `sm`** (2026-09-20).
- [x] **DV2 — monthly Attendance calendar** (2026-09-20). The percentage is
      gone; the fraction replaced it.
- [x] **DV3 — SF9-style Grades report card** (2026-09-21). §5a-v, §5a-vi.
- [x] **DV4 — dashboard elevation + the dark amber** (2026-09-23). The rust
      cast was a HUE shift, not a lightness one. §15 for the page rules.
- [x] **Grade 1 computed letters** (2026-09-22). `docs/GRADING_SPEC.md` §6a.
- [x] **Class-record grid, CR0–CR2** (2026-09-22). §13.
- [x] **CR3a — `subjects.display_order`** (2026-09-22).
- [x] **CR3 — the adviser's class summary** (2026-09-22/23). §14. **The grades
      track is complete.**
- [x] **Grading fixes** (2026-09-22) — whole Final Grades, two-decimal General
      Average. `docs/GRADING_SPEC.md` §4a.

**The one rule that did NOT go with its item**, because it is stated nowhere
else: the **three `activity_logs` rows dated 2026-09-21** are from Darryl
moving the machine clock forward to verify the weekend-hidden teacher banner —
his deliberate override of his own "do not fake the date" rule, both states
seen, clock restored. **Do not "fix" those timestamps.**

**Queued before Stage 5, in this order:**

**The Data views redesign is DONE** — DV1–DV4 and DV1b, 2026-09-20 →
2026-09-23. The block and its ticked write-ups left under the REFILL RULE
(`docs/ARCHIVE.md`); its rules are §4, §16, §5a-v, §17c and §17e. **MOCKUP
FIRST outlived it** and still governs item 5 and UI-D (d).

- [x] **UI polish — opened 2026-09-20 as a list, then a QUEUE. COMPLETE
      2026-09-25.** All fourteen items are closed and left permanently for
      `docs/ARCHIVE.md`, with UI-A through UI-E and item 5. **Item 11 was the
      print check, run on paper 2026-09-23; its finding IS UI-D (a).** Three
      did not close as written and the archive keeps why; the one that
      matters here: **item 7 shipped as `className || 'text-fg'`, NOT pure
      inheritance** — and UI-D-1's base text colour later spent that reason,
      so it IS pure inheritance now (§18g).

      **The rules the five dispatches left behind are §18-§21**, and the two
      that generalise beyond their own screens are **print layout is proved
      ON PAPER** (§18h) and **a proof fixture must mirror the server's
      shape** (§19f).

- [x] **UI-D — global CSS. DONE 2026-09-25** (D-1 print + the base text
      colour; D-2 the scroll cue; D-3 the parent hero). All three entries
      left under the REFILL RULE (`docs/ARCHIVE.md`). Their rules are
      **`docs/FRONTEND_CONVENTIONS.md` §18 and §19**; two outlive the work
      and are stated nowhere else: **print layout is proved ON PAPER** —
      `@media print` does not apply to an SSR render, so §5h's backstop does
      not reach it — and **a proof fixture must mirror the server's shape**,
      after one that invented a string where the API sends an object blanked
      `/parent` while build, oxlint and 71/71 were green.

- [x] **UI-E — a teacher's read-only letter view. DONE 2026-09-25**
      (`3086086`). Its entry left under the REFILL RULE
      (`docs/ARCHIVE.md`); the rules are **`docs/FRONTEND_CONVENTIONS.md`
      §20**.
- [x] **Item 5 — the staged-filter cue. DONE 2026-09-25** (`2000499`), and
      with it the UI-polish queue. **Nine pages staged their filter values
      and none admitted it**; one bounded control now auto-applies and eight
      keep Apply beside a "Changes not applied" cue. Entry archived under the
      REFILL RULE; rules are **`docs/FRONTEND_CONVENTIONS.md` §21**.
      **Order from here: pre-Stage-5 → docs pass → Stage 5.**
- [x] **Pre-Stage-5 server fixes — CLOSED 2026-09-26**, #2 → #7. Every
      item's text left under the REFILL RULE (`docs/ARCHIVE.md`); the rules
      that outlive each are below. **#2 (`819e892`) and #3 (`85c5d8f`,
      `642ccb2`) DONE 2026-09-25.**
      Two of #3's lines were wrong as written and the archive keeps why:
      **`test:restore`'s failure was the crafted token's missing `v` claim,
      never a sub-second `iat` boundary**, and **(h) had existed at
      `package.json:12` all along.** Rules that outlive #3, stated nowhere
      else: **a suite cleans its own `notifications` rows by exact
      `(item_type, item_id)` pairs through `scripts/test-helpers/notifications.js`
      and asserts zero left** — the writers are content ×3, excuses ×2,
      users ×1, grades ×1 (`recomputeGrade`, reached by the class-record PUT);
      **Tala Halimbawa (G6 Malikhain, active parent) is the browser-fixture
      learner and nobody's test target — every suite stays on Marwin**; a seed
      row reaches a live database by `db:migrate:*`, never `db:setup`; and
      **a verification smoke run is `npm run smoke:isolated`**, its own API
      without `--watch` on 5001, never 5000. **#4 (`9c413f4`) is DONE
      2026-09-25** — (b), email validation, (e) and the parents gate; its
      text left under the REFILL RULE. Rules that outlive it, stated nowhere
      else here: **only a 401 ends a session, and only the axios interceptor
      acts on it — every other `/auth/me` failure keeps the token and shows
      `AuthUnavailable` with Try again** (`docs/FRONTEND_CONVENTIONS.md`
      §22); **the adviser of the TARGET section enrols and creates the
      parent account** (`sections.adviser_id`, never `teacher_assignments`,
      never the read predicate), **edit is assigned OR adviser**, and **admin
      enrolment is KEPT because 20 of 23 sections have no adviser** — a
      learner there can have no parent account until one is assigned by hand
      (KNOWN ISSUES); **`utils/emailRule.js` is the one email rule** for
      every write site, the school-email field included. The originals are
      all closed. **#5 is DONE 2026-09-26** — #5a (`fe67803`, `5df33f2`: (f),
      (g), (k)) and #5b (`4b092ee`: (j)); text left under the REFILL RULE.
      Rules that outlive it, stated nowhere else: **eight `system_settings`
      keys (#7 retired `current_term`), and `GET /api/settings/public` is the ONE unauthenticated
      settings read** — the six `school_*` keys, registered before `/:key`;
      **the About page hardcodes no school value** — the DepEd VMV and
      Mandate are constants citing DO 36, s. 2013 and RA 9155 (§23);
      **every grade level has a confirmed `display_order`** (2–3 seeded
      2026-09-26); and **the Back button on Teacher → Grades is a
      `pushState` sentinel** (`classRecord/backGuard.js`, §13d), never a
      data-router migration. **#6 (`2ae7639`) is DONE 2026-09-26** — (l),
      text left under the REFILL RULE. The rule, stated nowhere else: **a
      teacher reads an attendance row if THEY RECORDED IT or the learner is
      CURRENTLY in a section they advise** (`recorded_by` OR
      `sections.adviser_id`, two params, no `teacher_assignments` leg, no
      schema); **writes stay with the current adviser**; the new adviser
      sees every row of a current learner, pre-transfer included — accepted;
      Teacher → Attendance records' "Everything I recorded" is how a former
      adviser views and prints. **#7 (`2decc74`, CAL) is DONE 2026-09-26.**
      The rules, stated nowhere else: **the school calendar is a PURE
      MODULE** — `server/utils/schoolCalendar.js` decides,
      `client/src/format/schoolCalendar.js` mirrors it;
      **`YYYY-MM-DD` strings only, a `Date` argument THROWS**; **the term
      is the latest term whose start is ≤ today, else Term 1** (the December
      break is Term 2); **`current_term` is NOT a
      setting** — retired from the allow-list, seed and Settings page; a
      leftover live row is dead data the allow-list hides; **the class record
      and class summary PIN the term ONCE** (lazy `useState`) and write
      `?term=` by `replace` before the Back sentinel can arm; Parent →
      Attendance opens on today's month **clamped to the school year**;
      **a new school year is a new `TERMS` table AND `academic_year`** —
      `GET /dashboard` is `500` naming both when they differ; the server
      runs on Asia/Manila or with `TZ` pinned (KNOWN ISSUES). **Three open
      leftovers are NOT queued and each is a `docs/KNOWN_ISSUES.md` row:**
      the NULL-max INVESTIGATE (can an exam score be stored with no
      denominator), and DV1's two Admin → Users server changes — the filter
      tabs' `counts` sibling and the "Linked to" column's `linked_student_name`
      + `advises[]`. Two INVESTIGATEs are CLOSED there (the double
      `bulk_record_attendance`; the smoke flake's `--watch` lead).
- [x] **POLISH — DONE 2026-09-26** (`1408b81`, `70b30b0`); the pre-Stage-5
      block is fully closed. Five of six landed; the Vision card's dead
      space was **reverted by decision** (equal-height cards). Rules, stated
      nowhere else: **the class summary has no `min-w-max` and its subject
      headers wrap** (measured, §18c); **class-record colgroup headers are
      left-aligned**; **Enroll is neutral beside a filled Apply** (§21b);
      **Login reads `school_name` from `/settings/public` with a "– Main"
      fallback**; **a Settings section is `max-w-2xl` with short pairs in
      `sm:grid-cols-2` rows** (§23). **fix/auth-503** (`1d2b228`): a
      database error in the middleware or `/me` is `503`, never `401` — §2.
- [x] **Smoke gate + fix/smoke-gate — DONE 2026-09-26** (to `12a3495`).
      Docs pass entry left under the REFILL RULE. The rule that outlives the
      gate is the Set HPS / Save all line in the working agreement.
      **NEXT: Stage 5.**

### BUILD ORDER → why the auth frontend came before the other backend modules

**Why auth frontend comes before the other backend modules:** finishing all
ten backend APIs first means reaching roughly 65% of the work with nothing
visible on screen. If time runs short at that point, there is a collection of
endpoints and no demo. One complete vertical slice first means there is
always something to show.

## Closed engineering bullet moved from CLAUDE.md on 2026-10-04 (feat/ui-refresh docs pass)

Closed by the code, not by a decision: feat/ui-refresh (`e46168f`,
2026-10-03) moved the title band, the info row and the legend onto the same
container threshold as the table (`client/src/pages/parent/ReportCard.jsx`,
the note "THE TITLE BAND, THE INFO ROW AND THE LEGEND FOLLOW THE SAME
CONTAINER THRESHOLD NOW" — "nothing in this file reads the viewport any
more"). The bullet as it stood in CLAUDE.md → OPEN QUESTIONS → Engineering:

- **Should the report card's header, info row and legend move to container
  units too?** DV3 converted only the crossover (§5a-vi), so those three
  still use viewport `sm:` inside a card that now measures itself. The
  re-check found no visible mismatch on a real window and called no action —
  recorded so the mixed basis is known rather than a later surprise.

## BUILD ORDER → Stage 5 entries moved from CLAUDE.md on 2026-10-07 (build 2, the REFILL RULE)

CLAUDE.md reached 135,630 bytes on disk in build 2's docs pass
(`feat/dashboards-look`), over the 135,000 the plan named, so the five
finished Stage 5 entries left it under the REFILL RULE, verbatim as they
stood that day (the source-zip entry with that day's merge and first run).
CLAUDE.md keeps one line and this pointer.

- [x] **UI refresh — `feat/ui-refresh`** (`e46168f` → `0ac7fec` + its docs
      pass), device-checked 2026-10-04 (web, phone Chrome, Expo Go on
      Android 14), cleaned up by id (backups 275, 276). **Merged 2026-10-04
      (`ee36b97`, fast-forward).** Rules: §27, M23–M24.
- [x] **Form drafts, Phase 1 — `feat/form-drafts`** (`0df46b3` + its docs
      pass), device-checked 2026-10-04 (web: laptop Chrome, parent in a
      normal window, teacher in Incognito; phone: Expo Go on a Tecno,
      Android 14), cleaned up by id (backup 277). **Merged 2026-10-05
      (fast-forward, `28fee18`).** Rules: §28, M25.
- [x] **Build 1 — `feat/look-fixes`** (`1a31961`, fix round `dc7e9ed`,
      follow-up `942ebb8` + its docs pass), built 2026-10-05: the flagged
      screens and their fixes, the button and chip shapes (§27f), the four
      small KNOWN ISSUES fixes. Device-checked 2026-10-05 (web: laptop Chrome,
      admin and parent in a normal window, teacher in Incognito; phone: Expo
      Go on a Tecno, Android 14; admin, teacher, parent), the fix round and
      the follow-up re-checked the same day, cleaned up by id (backup 278).
      **Merged 2026-10-06 (fast-forward, `1ef3c00`).** Rules: §27f, M23.
- [x] **Admin Messages — `feat/admin-messages`** (`86d93b7`, fix round
      `9141390`, follow-up `4255427`, the adviser label + its docs pass),
      built 2026-10-06: the admin's inbox (teacher ↔ admin only; SCOPE
      DECISION 2026-10-05 under ADMIN SCOPE AUDIT), the parent pages and
      screens reused by role, the hand-off on a parent's thread only, the
      Enter page jump, one toggle place, Messages pinned in the sidebar, no
      half-cut nav rows, threads opening at the newest message, and an
      adviser-only teacher labelled "Adviser of …" in the pickers.
      Device-checked and re-checked 2026-10-06 (web and phone, admin,
      teacher, parent), cleaned up by id (backup 279). **Merged 2026-10-06
      (fast-forward, `2f2dbb7`).** Rules: §6, §9, §10, §26, M9, M22.
- [x] **The source-zip fix — `fix/source-zip`**, 2026-10-06:
      `scripts/create-backup-zip.js` is `git archive` of HEAD (tracked files
      only: README.md, .gitignore, client, database, docs, mobile, scripts,
      server) to the Desktop as `Parents_Portal_source_<date>_<sha>.zip`;
      it refuses on uncommitted tracked changes, a tracked `.env` or an
      existing file. `node scripts/proof-source-zip.mjs` 24/24
      (`docs/TESTING.md`). **The owner's first run, 2026-10-07:
      `Parents_Portal_source_2026-10-07_1692103.zip`; the old Desktop zip
      deleted. Merged 2026-10-07 (fast-forward, `1692103`).**

## BUILD ORDER → Stage 5 moved from CLAUDE.md on 2026-10-10 (feat/privacy, the REFILL RULE)

CLAUDE.md reached 138,247 bytes on disk in the privacy build's docs pass
(`feat/privacy`), over the 135,000 the dispatch named, and Stage 5 was
complete — build 2, its last item, was merged fast-forward on 2026-10-09
(`9ed8793`) after the owner's re-check. So the whole Stage 5 block left under
the REFILL RULE, verbatim as it stood that day (build 2's entry still reads
"MERGE-READY; not merged" — it was written before the merge dispatch, which
edited no docs). CLAUDE.md keeps a closed line, the one standing decision
(notifications in-app only) and this pointer.

### Stage 5 — Mobile (Expo)

**Plan approved 2026-09-27; Parent → Teacher → Admin, one branch per step.**
Each item's full text is verbatim in `docs/ARCHIVE.md` → "BUILD ORDER →
Stage 5 as it stood in CLAUDE.md until 2026-09-30"; each phone check is on
its `docs/CHANGELOG.md` row.

- [x] **Setup, navigation, login + role routing** — `feat/mobile-scaffold`, 2026-09-27.
- [x] **Parent screens** — `feat/mobile-parent`, 2026-09-27. Rules: M9–M12.
- [x] **Teacher screens** — `feat/mobile-teacher`, 2026-09-28. Rules: M13–M15.
- [x] **Admin screens** — `feat/mobile-admin`, 2026-09-29 (Backup & Restore
      web only). Rules: M16–M18. **Every role's screens are built.**
- [x] **`fix/mobile-popto`, SMS transport, server reliability** — merged
      2026-09-29 → 30 (SMS before reliability by Darryl's decision).
- [x] **UI polish — `feat/ui-polish`, merged 2026-09-30 (`c610bd8`).**
- [x] **Docs pass + CLAUDE.md trim — `docs/stage5`** (merged, `5e09c09`).
- [x] **Notifications — in-app only, via Socket.io** (Darryl, 2026-09-27):
      no `expo-notifications`, no `push_token` column; remote push would be
      a separate decision.
- [x] **UI refresh, form drafts, build 1, admin Messages, the source-zip
      fix** — each device-checked or first-run by the owner and merged
      fast-forward, 2026-10-04 → 10-07 (`ee36b97`, `28fee18`, `1ef3c00`,
      `2f2dbb7`, `1692103`; the owner's zip:
      `Parents_Portal_source_2026-10-07_1692103.zip`). Rules: §26–§28,
      §27f, M22–M25. Each entry verbatim: `docs/ARCHIVE.md` → "BUILD ORDER →
      Stage 5 entries moved from CLAUDE.md on 2026-10-07".
- [x] **Build 2 — `feat/dashboards-look`** (two commits), built 2026-10-07:
      skeleton loading tier 1 (DataTable, DataList, the dashboard Card, the
      report card; 300 ms, no minimum, a three-pass sweep), re-reads that
      keep what is on screen (busy and inert; the Card tells a same-query
      re-read from a new query; a phone pull shows its indicator), the web
      drawer as a modal dialog with its two defects fixed, and Part C (the
      dashboards' look and lead cards, the admin's Users card). Decision 1
      narrowed by the owner's scope answer (KNOWN ISSUES: the query-change
      skeleton is option 1, deferred). Rules: §5a-vii, §9, §15e, M11, M23.
      **Device-checked by the owner 2026-10-08; the fix round F1–F8**
      (the compact lockout notice holding its space, "Users", the
      Teachers / Parents presets, avatar circles, a new page at the top,
      the sweep, the inside nav ring, positional keys) **built 2026-10-09
      (two commits), re-checked by the owner the same day: MERGE-READY; not
      merged.** Device gaps: `docs/TESTING.md`.

## BUILD ORDER → Stage 5 items moved from CLAUDE.md on 2026-10-11 (feat/staff-acceptance merge-ready docs, the REFILL RULE)

Four ticked items had gathered under CLAUDE.md's closed Stage 5 heading since
the 2026-10-10 move — each a branch merged after the close, each
device-checked. The owner's merge-ready dispatch for `feat/staff-acceptance`
applied the REFILL RULE ahead of the 138,000-byte trigger (the projection after
skeleton tier 2 was ~137,700). Verbatim as they stood; their rules stay where
they live — §29–§30, §5, §5f–§5g, M11, M26–M27, API_REFERENCE §6 — and
CLAUDE.md keeps one pointer line.

- [x] **The privacy build — `feat/privacy`** (two commits + a fix round),
      2026-10-10: the consent gate, your own first password, sign-in limits,
      four learner fields not collected (§29, M26). **Device-checked, fixed
      (PF1–PF5), re-checked, its data cleaned up; merged 2026-10-11
      (`456bba8`).**
- [x] **Shared Messages — `feat/shared-messages`** (2026-10-11): one thread
      and one conversations page for every role on the web (§30), its browser
      test, and the phone thread's positioning fix (M27); two fix rounds —
      the top bar's ← as the way back, a whole row opens a conversation.
      **Device-checked, re-checked, its data cleaned up; merged 2026-10-11
      (`ea96ecf`).**
- [x] **Skeleton option 1 — `feat/skeleton-querykey`** (2026-10-11): the
      `queryKey` rule on DataTable / DataList, the keys on 19 web tables and
      10 phone lists, nine avatar circles (§5, M11). **Device-checked on
      the web (the phone's LAN too fast); merged 2026-10-11 (`450b792`).**
- [x] **The socket handshake and the picker copy — `fix/socket-handshake`**
      (2026-10-11): the restore cutoff and the token's version as REST
      checks them, "Database unreachable." for a database error
      (API_REFERENCE §6); the phone teacher picker's empty groups follow the
      web (§5f); fix round R4, the strip waits for a real failure (§5g).
      **Device-checked, re-checked, its data cleaned up; merged 2026-10-11
      (`10e277a`).**

## BUILD ORDER → Stage 5 items moved from CLAUDE.md on 2026-10-11, second batch (feat/skeleton-tier2-phone merge-ready docs, the REFILL RULE)

Two more ticked items under CLAUDE.md's closed Stage 5 heading, each a branch
merged after the close and device-checked. Moved by the owner's merge-ready
dispatch for `feat/skeleton-tier2-phone`; that branch's own item follows it
here after it merges. Verbatim as they stood; their rules stay where they
live — §29, §5, M11, M26, `docs/TESTING.md` — and CLAUDE.md's pointer line
names the merges.

- [x] **Staff acceptance — `feat/staff-acceptance`** (2026-10-11): teachers
      and the admin accept the Notice and the Terms (§29) — two ticks, no
      child tick. **Device-checked (web and phone), its data cleaned up;
      merged 2026-10-11 (`5dc868d`).**
- [x] **Skeleton tier 2, web — `feat/skeleton-tier2-web`** (2026-10-11): the
      thirteen spinners left on eleven web pages are skeletons
      (`components/SkeletonShapes.jsx`, §5); a fix round. **Device-checked
      and re-checked (3G), its data cleaned up; merged 2026-10-11 (`c8ac275`).**
- [x] **Skeleton tier 2, phone — `feat/skeleton-tier2-phone`** (2026-10-11):
      sixteen spinners are skeletons, the slot pull keeps its column; the
      web's fix round applied, and tickets and key checks on teacher Grades,
      Class summary and admin Grades (M11). **Device-checked on the Tecno
      (no-regression, no findings), its data cleaned up; merged 2026-10-12
      (`4bfbda0`).** (Moved by `fix/web-load-races`, as this batch's note
      said it would be after the merge.)
- [x] **The web load races — `fix/web-load-races`** (2026-10-12): a ticket on
      the roster's load (a stale date's marks could be saved to the new date)
      and on admin Grades' and the class summary's; the class record, the
      class summary and admin Grades show only the current pick's data — the
      grid not editable, no lock — until it arrives. **Device-checked (3G,
      no findings), its data cleaned up; merged 2026-10-12 (`afccdd8`).**
      (Moved by `fix/grade-locks` on 2026-10-13 — the owner's approval gave
      that branch's docs commit this drift: CLAUDE.md still called the item
      merge-ready and its "Last verified" line named `4bfbda0`.)

## BUILD ORDER → Stage 5 item moved from CLAUDE.md on 2026-10-13 (the `fix/smoke-round` merge, the REFILL RULE)

The ticked item under CLAUDE.md's closed Stage 5 heading, moved by the
owner's merge dispatch the night `fix/smoke-round` merged fast-forward
(`afccdd8` → `4d28d7f`). Verbatim as it stood, with its status line brought
to the merge; its rules stay where they live — FRONTEND §31–§32, MOBILE
M28–M29, `docs/API_REFERENCE.md`, `docs/TESTING.md` — and CLAUDE.md's pointer
line names the merge.

- [x] **Grade locks and the smoke-gate fix round — `fix/smoke-round`**
      (2026-10-13; `fix/grade-locks` plus four findings): 1a — a locked
      learner freezes the class's highest possible scores (`409` naming them);
      1b — Admin → Grades "Lock or unlock a term", web and phone
      (`POST /api/grades/locks`); F4 — the class record prints no Summative
      raw total, ST PS is ST1 30% + ST2 30% + TE 40%; F5 — a parent's
      breakdown names each score "Written Work 1" or the column's own name,
      as the class record's helper promises; F6 — sign-in confirms
      a password reset; F7 — a per-row lock or unlock closes its dialog and
      keeps the line (FRONTEND §32, MOBILE M29). **Device-checked
      2026-10-13, every section passed (the bulk dialog's 390px / dark pass
      not done, the owner's call); data cleaned up (backup 316); merged
      2026-10-13 (`4d28d7f`)** (`docs/GRADE_LOCKS_DEVICE_CHECK.md` §5). F3 was
      cut (KNOWN ISSUES).
