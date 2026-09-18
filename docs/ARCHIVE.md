# CLAUDE.md ARCHIVE — full narratives moved out on 2026-09-18

> Verbatim copies, in their original order, of the CLAUDE.md sections that were condensed. Nothing here was rewritten. Read the condensed section in `CLAUDE.md` first; come here for the reasoning, the worked examples and the history.
> Moved out of `CLAUDE.md` on 2026-09-18 verbatim so that file fits Claude Code's 150k-char limit. `CLAUDE.md` holds the condensed version and wins on any present-tense claim; if the two disagree, the code is correct and both must be fixed.
> Dated entries record what was true on their date and are never back-edited.


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
