> This file is maintained by Claude Code and Cursor. It describes the ACTUAL
> state of the code, not the plan. If this file and the code disagree, the
> code is correct and this file must be fixed.

# Parent's Portal System

Capstone project for **Captain H. Francisco Elementary School – Main**
(Grades 1–6), P. Rosales St., Sta. Ana, Pateros, Metro Manila.

**The school's own details, confirmed 2026-09-22 — this is the one place they
live.** `school_name` and `school_address` are `system_settings` rows, updated
through Admin → Settings. The rest have **no field yet** (`routes/settings.js`
allow-lists five keys) and are queued with the pre-Stage-5 fixes: **DepEd
School ID 136893**, **136893@deped.gov.ph**, and the **DepEd Vision, Mission
and Core Values, which the school adopts** (no About page exists to put them
on). **Phone 3506114 — that is a PHONE number and NOT the School ID**; the
mistake was made once and corrected.

**Two process facts the code must keep matching.** **Advisers enrol learners
and create parent accounts; an admin approves parent accounts and does not
create them** (LOCKED DECISIONS; Admin → Users has no create-parent control).
**Memos are school-wide and reach parents**, per the manuscript — `memos` has
no audience column and `memoAudience()` notifies every active account, which
matches `GET /api/memos` having no scope clause.

| | |
|---|---|
| Institution | Pateros Technological College — Institute of Information and Computing Technology |
| Developer | Candilada, Darryl — sole developer |
| Team | Conde, Marwin R. · Bargaso, Jea Mae T. · Bobis, Joan B. · Geguiera, Ashley T. |
| Repo path | `C:\Users\Win10 User\Parents_Portal` |
| Database | `parents_portal` — 23 tables |
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
> different things: **`docs/API_REFERENCE.md` counts 87** handlers defined in
> `server/routes/`, and the API answers **88 endpoints** because
> `GET /api/health` is mounted directly in `server.js`. State which you mean.
> Both recounted from the code on 2026-09-22, which moved them twice in one
> day: `PATCH /grades/:id/descriptive` retired (−1) and the class record's
> `GET` and `PUT` landed (+2). The archived endpoint table's 81 rows are a
> dated 2026-09-19 snapshot, not a third figure.
>
> Dated CHANGELOG entries are exempt — they record what was true on their date
> and must not be back-edited. It is present-tense claims that have to agree.

---

## COMPANION DOCUMENTS — split out 2026-09-18 to stay under Claude Code's 150k-char limit

This file is still the source of truth and the map. It keeps every rule,
every present-tense fact and every `##` heading it always had; the long text
behind each condensed section is **verbatim** in one of the files below, and
a condensed section ends with a pointer to it. Nothing was deleted in the
split — if a fact seems missing here, it is in one of these.

| File | Holds | Living? |
|---|---|---|
| `docs/CHANGELOG.md` | the full dated change table — **new rows go here**, newest first | yes |
| `docs/KNOWN_ISSUES.md` | every known-issue row, open and closed — **new rows go here**; the KNOWN ISSUES section here lists only the open ones | yes |
| `docs/FRONTEND_CONVENTIONS.md` | the full text of STAGE 4 FRONTEND CONVENTIONS §1–§7b, with the reasoning, the worked examples and the browser-found defects behind each | frozen rules |
| `docs/RESTORE.md` | the full RESTORE design record — the text `server/routes/backups.js` and `test-restore-flows.js` mean by "CLAUDE.md's RESTORE section" | reference |
| `docs/ARCHIVE.md` | verbatim narratives moved out of this file, in original order: per-file notes, the sections-table and Class Board investigations, the React web app history, MEASURED BUILD TIME, the Grades stage history, NOW POSSIBLE, the contacts design, BUILD ORDER write-ups, the admin scope audit, OPEN QUESTIONS history | history |

`docs/API_REFERENCE.md` (request/response detail), `docs/GRADING_SPEC.md`
(DepEd policy) and `docs/PROJECT_PROGRESS.md` (the mirror updated at the end
of every session) predate the split and are unchanged by it.

**Keeping this file under the limit is part of every dispatch that edits it:**
a new narrative goes to `docs/ARCHIVE.md` (or the living file it belongs to)
and this file gets the rule and the pointer. Never delete to make room.

**THE SIZE RULE (2026-09-22).** Two trims in three days — 144,967 → 108,102
on 2026-09-19, and back to 141,099 by 2026-09-21 — because growth was never
measured per dispatch, only when it hurt. So: **every dispatch report states
this file's delta, on-disk bytes, before → after.** A single dispatch adding
more than **2,000 net bytes must say why** in its report. **Measure the
ON-DISK (CRLF) size** — that is what a session actually reads — and quote
`git cat-file -s HEAD:CLAUDE.md` alongside it, which runs ~2,200 lower
because git stores LF. **Trigger a trim at 138,000 on-disk; never start a
dispatch above 142,000.**

**AND THE REFILL RULE (2026-09-22, after the fourth trim in a fortnight).**
**A completed BUILD ORDER stage and a closed BLOCKED / RESOLVED item leave
this file permanently — to `docs/ARCHIVE.md`, in the dispatch that closes
them.** They are never re-condensed in place, because condensing the same
finished work every few days is what has made every trim so far. What stays
behind is the rule and the pointer, nothing else.

---

## CURRENT STATE

**Last verified:** 2026-09-18 (**Stage 4 is COMPLETE.** Admin → Backup &
Restore was the last page: every Figure 5 admin process has a page. **Admin
nav is 8 items, all built** — Sections, Excuse Letters, Memos, Events and
Messages were **removed** on 2026-09-18 rather than left `built: false`, by
the scope decision under ADMIN SCOPE AUDIT; teacher (11) and parent (9) are
unchanged, and **no role now has a `built: false` item**. **23 tables, 87
handlers + `/api/health`** (2026-09-22). 20 of 23 sections have no adviser and
no screen can assign one — see KNOWN ISSUES.)

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
| `grades` | 5 — Nino's partial descriptive card (Mathematics terms 1–3 A/B/C, Reading and Literacy terms 1–2 D/E). `grade_components` and `assessment_slots` are both 0. **These five are LEGACY rows** — letters typed before the rule, with no scores behind them, so they keep their letter and show no Final. Correct, not stale; do not "fix" them. |
| `attendance`, `announcements`, `memos`, `events`, `excuse_letters`, `messages` | 0 |

HTTP suites that create rows delete them in a `finally` block and must
return the database to this table, not to a remembered older snapshot.

### Working endpoints — this is the entire API

**`docs/API_REFERENCE.md` is the live record — read it for any endpoint
question.** Body fields, wrapper keys, role-scope codes and the 404-vs-403
convention are all there and were never in this file. A dated 81-row snapshot
sits in `docs/ARCHIVE.md` (2026-09-19, before Notifications' 4 and account
recovery's 5 landed); **it is not the live record.**

**The arithmetic stays here because two numbers are both correct and mean
different things: 87 handlers** are defined in `server/routes/`, and the API
answers **88 endpoints** because `GET /api/health` is mounted in `server.js`.
**State which you mean.** Both moved twice on 2026-09-22 —
`PATCH /grades/:id/descriptive` retired (still the only endpoint ever removed
besides Contributions' eight) and the class record's `GET` and `PUT` landed.

**A scope change removes future authority, never past records.** Three places,
one principle: deleting a `teacher_assignments` row does not touch `grades`
(no FK, and mid-year reassignment **must not** wipe SF9 data); message history
stays readable after `canMessage()` would refuse a new send; and the
subjects-reseed CASCADE is the **opposite** case — destroying `subjects.id`
wiped assignments *and* grades. **Do not add a grades-exist guard on
`DELETE /api/assignments/:id`.**

**Tests:** twenty `test:*` scripts — **eighteen HTTP suites** plus two
direct-call unit tests (`sanitize`, `grade-computation`). **Every count below
was re-run on 2026-09-22 and EIGHT were stale** — students, grades,
attendance, content, users, backups, messages and excuses had all drifted
upward, most since pagination (2026-09-19) touched every list endpoint and no
dispatch re-ran the ones it did not edit. **The lesson is already in the
working agreement** ("a dispatch that changes a WRITE path runs every suite
that WRITES through it"); this is the same failure on the READ side. Do not
trust a baseline here that has no dated dispatch behind it. **The HTTP suites default `BASE` to
`http://127.0.0.1:${PORT}`, not `localhost`** — Node `fetch` on Windows
resolves `localhost` to IPv6 `::1` first while the server listens on IPv4, and
that mismatch was ECONNRESET mid-run. `process.env.API_BASE` still wins.
**They are idempotent: every row a suite creates is deleted in a `finally`
block** (Settings restores its original value; Sections resets the two
NULL-adviser rows by a direct DB write, not a remembered API call), **so no
`db:setup` is needed between runs** — verified by running each twice with no
reset and confirming the Seeded baseline after. `test:sanitize` is a
direct-call unit test, no server or DB. **`test:restore` never triggers an
actual restore** — see RESTORE.
All re-run 2026-09-22; **stale ones marked with their old figure.**

- `npm run test:students` — **94/94** (was 65)
- `npm run test:sections` — 30/30
- `npm run test:assignments` — 56/56
- `npm run test:grading-modes` — 13/13
- `npm run test:grades` — **239/239** (was 212. This line has been stale four times over: 167 → pagination 182 → DV3 188 → 189 → rounding 197 → Grade 1 letters 212 → CR0/CR1 239)
- `npm run test:auth` — 56/56
- `npm run test:attendance` — **60/60** (was 38)
- `npm run test:content` — **96/96** (was 62)
- `npm run test:settings` — 29/29
- `npm run test:users` — **61/61** (was 47)
- `npm run test:backups` — **47/47** (was 39)
- `npm run test:sanitize` — 9/9
- `npm run test:messages` — **80/80** (was 59)
- `npm run test:restore` — **28 passed, 1 FAILED** — "A token issued after the cutoff still works". **A test-timing defect, not a code one**, and the same `iat` one-second resolution §11 already records; the production behaviour is correct. **Fix the test, never the comparison.** KNOWN ISSUES
- `npm run test:excuses` — **92/92** (was 70)
- `npm run test:notifications` — **136/136** (was 124)
- `npm run test:dashboard` — 77/77
- `npm run test:class-record` — **117/117** (CR1 105 → CR2 117). **It is the only suite that imports a CLIENT module** — `buildPayload.js` — so the grid's real payload is exercised against the real API; see §13e
- `npm run test:recovery` — **62/62, but ONLY against a server started with `MAIL_TRANSPORT=file`.** Otherwise it stops at 11/1 with a fixture failure — the variable belongs to the process that sends the mail, so prefixing the test script does nothing. Run-book in KNOWN ISSUES

`node scripts/verify-grading-seed.js` is not one of the suites above — it's a
direct-DB verification script (no server, no HTTP, no `assert()` harness),
checking the Grades seed (transmutation table, weights, modes, Grade 1
descriptive fixture) is internally consistent. Run it after `db:setup`, before
trusting the seed. **34/34 as of 2026-09-22** — the descriptive-exclusion
check **inverted** to "every grade level has weights" when Grade 1 gained its
own, plus one asserting Grade 1 is exactly 30/50/20. **There is now a second
reason to run it: after restoring any backup**, because every dump taken
before 2026-09-22 carries the old subject name (KNOWN ISSUES).

`npm run test:grade-computation` (Stage G2a, extended in G3 with the
qualitative/letter descriptor lookups and in 2026-09-22's Grade 1 work with
`bandForScore`) is a direct-call unit test of `utils/gradeComputation.js`, no
server, no DB, matching `test:sanitize`'s shape. **77/77** (2026-09-22; CR1
added `componentPercentage`'s `requiredSlotIds` cases), deterministic
(pure functions). **One of those assertions is the anti-drift check:** the
letter ladder and the descriptor ladder are one `BANDS` table, and it is
verified to hold at every whole score 0–100, so a one-sided edit cannot land
silently.

### Files that exist

Purpose per file, the long narratives and the one rule each carries moved to
`docs/ARCHIVE.md` on 2026-09-19 ("Moved from CLAUDE.md … section trim");
the per-file *narratives* were already there under CURRENT STATE → Files
that exist. **Shape:** `server/` is `routes/` (one file per module) +
`utils/` (shared helpers) + `middleware/auth.js` + `config/db.js` +
`scripts/` (setup, **five migrations**, the twenty test files); `database/`
is `schema.sql` + `seed.sql`; `client/src/` is under React web app below.

#### File rules that bite

Stated nowhere else in this file; each costs a dispatch when forgotten.

- **`config/db.js` — two.** `dateStrings: ['DATE']`: DATE columns come back
  as raw `YYYY-MM-DD` strings, never JS `Date`, or `res.json()` calls
  `toISOString()` and a DATE is a full calendar day off at UTC+8 — wrong
  every time, not an edge case (TIMESTAMP/DATETIME unaffected). And the pool
  is a **proxy**, so `resetPool()` can swap it after a restore; a plain
  `module.exports` reassignment could not reach existing `require`s.
- **`utils/teacherScope.js` — the hazard is the parameter COUNT (two).**
  Use `teacherViewScopeParams()`; passing one where two are needed shifts
  every later placeholder, and a swap is undetectable because both values
  are the same id.
- **`routes/grades.js` — the subject/student grade-level mismatch check runs
  AFTER the scope check on purpose. Do not reorder it:** an out-of-scope
  teacher must not learn a grade level by probing with a wrong `subject_id`.
- **`routes/gradingModes.js` — the `grading_mode` wrapper is an OBJECT here
  and a STRING on the report card. Do not flatten either to match.**
- **`routes/auth.js` — `fetchUserByLoginId` does not SELECT `s.lrn`.**
  `login_id` is the one LRN copy on the session (§5c).
- **`utils/gradeComputation.js` — every function returns `null` on a missing
  input, never a partial number; percentages over 100 are deliberately NOT
  clamped.** A cap belongs in route validation as explicit policy, if ever.
- **`scripts/setup-db.js` — `backfillSectionIds()` REPORTS every row left
  NULL. Do not remove the reporting step.**
- **`scripts/migrate-notifications.js` is THE MIGRATION TEMPLATE** — the
  first this repo ever had. Never drop; be idempotent and PRINT the evidence;
  announce created / already present per object; mirror into `schema.sql`.
- **`seed.sql` — adviser assignments are keyed by a `login_id` subquery,
  never a numeric id.**

Full per-file text: `docs/ARCHIVE.md` → CURRENT STATE → Files that exist,
and the 2026-09-19 section-trim block.

### Not started — zero handlers

**No Expo app.**

Grades is no longer in this section — see below.

### Grades — fully built (write path + viewing), Stage 3's last backend module

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

### sections table — one route reads it (attendance), one route manages it (sections), Class Board investigated and found to need nothing from it

**The rule, kept because a fresh session gets it wrong:** `section_id` is
READ in exactly FOUR places — attendance scoping, and the teacher read scope
in `routes/students.js`, `routes/excuses.js` and `routes/messages.js` (the
last three via the one shared constant in `utils/teacherScope.js`).
**Everything else scopes on the VARCHAR columns**, and that is deliberate,
not a half-finished migration — do not migrate a fifth route without
checking here first. Writes are not readers: `POST /api/students` resolves
and stores `section_id` and **never inserts NULL**, and `PUT` writes it only
when the stored FK is NULL and refuses a class change with `400`.
`routes/content.js` is NOT a reader — it matches `sections` by
`grade_level` + `name`. `routes/sections.js` is the management interface for
the table itself, not part of any migration; there is no admin UI for
`PATCH /:id/adviser` (KNOWN ISSUES).

The full investigation moved to `docs/ARCHIVE.md` on 2026-09-19 ("Moved from
CLAUDE.md … section trim"); the original long text is there under CURRENT
STATE → sections table.

### Class Board — investigated, zero code needed (extension of Feature 4)

**The conclusion, which is the whole point: the Class Board is Feature 4,
not an eleventh feature, and it needed ZERO new code.** A teacher’s only
legal announcement target is an exact `target_grade` + `target_section` they
are connected to, so `teacher/AnnouncementsPage.jsx` already IS the Class
Board — and it carries no "Class Board" affordance, because a separate
control would offer a choice that does not exist. **Parents never reply —
permanently, not "not yet"** (a section-visible reply recreates the group
chat that was rejected; a teacher-only reply is a private message arriving
through a second inbox). No new column, no flag, no link back to an
originating message. "Announce to a class" from Messages opens this same
form — **do not build a second composer.**

The full investigation and the Messages hand-off detail moved to
`docs/ARCHIVE.md` on 2026-09-19 ("Moved from CLAUDE.md … section trim");
the original long text is there under CURRENT STATE → Class Board.

### React web app — Stage 4 foundation built, primitives frozen

`client/` builds clean (`npm run build`) and lints to the recorded oxlint
baseline. **Every Teacher page, every Parent page and every Figure 5 admin
page exists — Stage 4 is complete (2026-09-14).** Two claims worth keeping
here because they are checked, not assumed: the dev-only gallery at
`/dev/ui` is registered behind `import.meta.env.DEV` and **verified absent
from the production bundle** (grepped, not asserted), and the auth
round-trip is browser-verified (admin login redirects, a wrong password
shows inline, a pending account shows the approval message, a refresh shows
the spinner with no login flash).

**The `client/src/` tree moved to `docs/ARCHIVE.md` on 2026-09-19** ("Moved
from CLAUDE.md … section trim"); each page’s dated verification was already
there under CURRENT STATE → React web app. Every page inherits STAGE 4
FRONTEND CONVENTIONS — read those before building any screen.

## STAGE 4 FRONTEND CONVENTIONS — frozen 2026-09-06

The frontend counterpart to THE AUTH PATTERN IS THE TEMPLATE below. Settled
in the foundation dispatch, against the real API, before any feature page
existed — a convention invented by the first page gets bent by the second.
**Every Stage 4 page inherits all of these. Do not invent a new structure.**
Rule statements are here; the reasoning, the worked examples and the
browser-found defect behind each are verbatim in
`docs/FRONTEND_CONVENTIONS.md`.

### 1. Unwrap — every call declares how to read the response

```js
api.get('/students', { unwrap: 'students' })              // -> the array
api.get('/grades/7', { unwrap: ['grade', 'descriptor'] }) // -> { grade, descriptor }
api.post('/backups/3/restore', body, { raw: true })       // -> the axios response
```

- **Mandatory.** A success response with neither `unwrap` nor `raw` throws.
  No inference, no "take the only key".
- **Throws when the named key is absent**, naming what was missing and what
  came back. It never returns `undefined` — a backend rename must fail loudly
  at the call site, not render an empty table.
- **But it protects a RENAMED key, never a FORGOTTEN one.** The array form
  copies only the keys you name, so a key the call site never asks for is
  silently missing and renders as a plausible empty value, not as an error.
  DV3 shipped that way: the report card's general-average row read
  "— Pending" in all four columns for a week because `term_averages` was
  not in the list, while the API had been returning it correctly all along.
  **When an endpoint gains a field, the unwrap list is the line to change.**
- **Array form** for multi-key responses (`GET /backups` + `orphaned_files`,
  `GET /grades/:id` + `grade_components` + `descriptor`).
- **`raw` is for exactly two endpoints** — `POST /api/backups/:id/restore`
  (`success: true` does not mean full success) and the binary download —
  and it returns the FULL axios response, not the body.
- **A path-to-key map cannot work:** `GET /api/attendance` returns
  `attendance` as an array and `POST /api/attendance` returns it as an
  object; paths carry `:id`; ~30 wrapper keys have no derivable rule. The call
  site is the only honest place.

### 2. Errors — 401 redirects, 403 never does

- **`401`** clears the token and redirects to `/login`.
- **`403` does NOT redirect, and never should.** A 403 in this API is an
  *informative refusal* with a reason (scope, a locked grade, a failed step-up
  or current password, an `authorize()` role violation) that must reach the
  user through `extractError`. There is no exception: `middleware/auth.js`'s
  `Account is not active.` — the one 403 that meant a dead session — is
  `401` since 2026-09-18, so a deactivated user is logged out on their next
  request. Not string-matched. No count of 403 origins — it cannot be
  checked mechanically.
- **Reads out of scope return `404`** (anti-enumeration); **writes return
  `403`**. Two exceptions return `403` where a read would 404, because a
  broader `GET` already exposes the resource: excuse-letter review and the
  five `:id`-keyed grades writes.
- **Error bodies are uniform** `{ success: false, message }` across every
  error response in `server/routes/`; that is why `extractError` is reliable.
  The success wrappers are not uniform.

### 3. NULL grades — never a bare dash

`NULL` in Initial Grade, Final Grade or General Average means **"not yet
computable"** — not missing, not zero. `format/grade.jsx` is the single
renderer for grade-bearing values:

| State | Renders |
|---|---|
| a number, **default** (General Average, Initial Grade) | `0.00` / `88.05` / `87.50` |
| a number, **`whole`** (Term Grade, Final Grade) | `87` / `89` / `89.5` |
| `null`, numerical mode | `— Pending` |
| `null`, descriptive mode | `— N/A` |
| failed request | never reaches here — `DataTable`'s error state owns the frame |

**TWO PRECISIONS (2026-09-22).** A Term Grade and a Final Grade print as
**whole numbers** — DO 015 and the school's Summary of Grades both do — while
the **General Average and Initial Grade keep two decimals**, because that
same sheet computes 721/8 = 90.125 and prints **90.13**. `whole` is opt-in, so
untouched call sites keep two decimals; `TermValue` sets it once for all seven
term cells. **It is `String(Number(x))`, never `toFixed(0)` or `Math.round`:**
`"87.00"` → `87`, but **`89.5` → `89.5`**, because from SY 2027-2028 a term
grade inherits the Initial Grade's decimals and rounding one for display would
show a number the database does not hold. Detail:
`docs/FRONTEND_CONVENTIONS.md` §3.

The label is inline text, not only a tooltip — touch has no hover and parents
read the card on a phone. The pending-vs-N/A split comes from the API's own
`grading_mode`, never inferred from the null. A real `0.00` stays visually
distinct from both null states. **Grade-specific:** attendance's "not
recorded" belongs to §5's empty handling, not `GradeValue`.

### 4. StatusBadge — four vocabularies, one tone map, NO VERDICTS

`users` · `attendance` · `excuse_letters` · grades `is_locked` share one
central status→tone map; unknown values fall back to neutral; a `tone` prop
overrides. **No `PASSED`, no `FAILED`, no `AT RISK`, no `FOR RETENTION` — not
now, not as a convenience later.** The school stated absence-based failure is
at teacher discretion, so **the system counts and displays, it never
concludes.** Adding one requires the school to have said otherwise first.

### 5. DataTable — presentational, unpaginated, nulls last

- **Never fetches.** The page owns `rows`/`loading`/`error`; loading, error
  and empty render inside the frame.
- **Two modes, decided by the `page` prop.** Without it the whole list is on
  screen and sorts locally. With it — the API's
  `{ limit, offset, total, has_more }` — the rows are ONE page: **sorting is
  controlled and nothing is sorted locally**, and an empty page of a non-empty
  set steps back on its own (C7). A filter or sort change resets offset to 0
  (C6) — **in the page, not here.** Every list endpoint pages; **a caller that
  needs a complete set uses `fetchAll`, never the first 50** (C2/C5).
- **Nulls sort last in BOTH directions, and the rule sits OUTSIDE the
  direction multiplier.** Two empties compare equal; `Array#sort` is stable.
  mysql2 returns `DECIMAL` as strings, so the comparator coerces numerically
  before `localeCompare`. **The gallery fixture carries `87.50` AND `100.00` —
  only `100.00` catches a lexicographic regression. Do not tidy either away.**
- **NO STICKY TABLE HEADER — a closed question, not a gap.** Sticky resolves
  against the nearest scrollport and containing a too-wide table REQUIRES one,
  so a sticky header and the in-table horizontal scroller **cannot coexist**.
  Three attempts each broke differently; lists page at 50 rows, so the cost is
  small. **Do not reopen it.** The full account, and the sticky-first-COLUMN
  question it does NOT close, are §5a-i and OPEN QUESTIONS.
- **`nowrap: true` on a column, and NEVER wrap an identifier.** Default
  wrapping breaks at spaces only, so an LRN, a grade or a date cannot break at
  all; `nowrap` is for values that DO contain spaces and still must not.
  Header cells are always `nowrap`. Detail: §5a-ii.
- **`format/date.js` is the ONLY home for date maths.** A page formats a date;
  **it never computes one. Identity is a `YYYY-MM-DD` STRING compared with
  `===`** — nothing is parsed, so nothing can shift. A `Date` is for PLACEMENT
  only, always via the local constructor. **Never `new Date(string)`** (it
  parses as UTC midnight, a day early west of Greenwich) **and never
  `toISOString()`.** Detail: §5a-iv.
- **`renderCard` — the card layout below `sm`, opt-in per page. It returns
  DATA, never JSX**, which makes a button-inside-a-link unrepresentable:
  **exactly one interactive element per card**, a real `<Link>` or `<button>`.
  A page with no single primary action passes neither and gets a static card.
  Detail: §5a-iii.
- **ONE page leaves DataTable and the exemption is narrow:**
  `parent/ReportCard.jsx` is a **fixed-order printed document** — sorting it
  produces a different document, not a filtered one — and its emphasised
  general-average row must sit INSIDE a table that does not sort. **Anything
  that is a list of records still uses `DataTable`.** Its printed order is a
  client constant (`subjects` has **no display-order column**) and **Grade 1's
  order is PROVISIONAL**. **"Has a Final" and "has a General Average" are TWO
  flags (2026-09-22)** — a descriptive card has a Final LETTER and no general
  average at all, so the one boolean they used to share would put a GA row on
  a Key Stage 1 card. `final_grade` holds a **number or a letter** by mode, so
  the Final cell needs two renderers; `GradeValue` prints a real `A` as
  "— N/A". Detail: §5a-v.
- **A value the payload carries but the page may not show needs a RENDER-TIME
  guard.** A Grade 1 term now carries a real `initial_grade` (the server needs
  it for the Final letter) and parents may never see it. "We did not render
  it" is not checkable by reading the file — the SSR proof asserts no spelling
  of the number reaches the markup, with a control that prints it. §5a-v.
- **That card's crossover is measured on the CONTAINER (`@min-[36rem]`), every
  DataTable page on `sm:` viewport width — deliberately inconsistent**, because
  `Shell` reveals its 240px sidebar at that same `sm` and **crossing 640px cuts
  a page body from 607px to 351px**. **A browser check must measure the CARD,
  not the window**, and a container variant that generates no CSS fails
  silently — **grep the built stylesheet** (the `h-9.5` lesson). Detail: §5a-vi.

### 5b. A column showing DATABASE state must never derive from form state

If a column claims to show stored state, its value comes from the last
successful read, in its own piece of state, with the fetch function as the
only writer — never from the object an input handler mutates. The failure
path is where it damages: on a rejected save the page would show the unsaved
value as stored, contradicted by the error beside it. **The mechanical tell:**
search the render for the same state object the inputs write to. Applies to
grades encode, status transitions, excuse review, and every list that reloads
after a write.

### 5c. The LRN is half a credential, not an ordinary identifier

A parent's `login_id` IS their child's LRN. **No screen displays an LRN
except to a teacher or admin acting on that student. No LRN goes in a URL, a
query string, or an error message — route on `students.id`, never the LRN.**
Searching *by* LRN is fine. **Exception — Parent → Settings** shows the
parent's own `login_id` locked; do not copy that onto Grades, Attendance,
Excuse Letters, or Messages.

### 5d. Display casing is presentation only

A value may be re-cased for display and never for storage, comparison,
transmission or matching. `StatusBadge` capitalises its text while
`toneForStatus()` keys on the lowercased value; casing is applied at the
value, not inside a generic field renderer (an address or an LRN must not be
capitalised). The stored vocabularies disagree two to two, and that is
**deliberately NOT normalised** — a migration touching real rows so a label
looks right is the wrong trade:

| Vocabulary | Stored form | Capitalised? |
|---|---|---|
| `attendance.status` | `Present, Absent, Late, Excused` | yes |
| `excuse_letters.status` | `Pending, Approved, Declined` | yes |
| `users.status` | `pending, active, rejected, inactive` | **no** |
| `students.status` | `active, inactive` | **no** |
| grades `is_locked` | a boolean; `locked`/`unlocked` invented at the call site | **no** |

### 5e. Confirmation follows reversibility

Whether a write needs a confirmation step is decided by whether the API lets
it be undone — not by how important it feels. **Check the handler first.**

| API behaviour | UI |
|---|---|
| Absorbs a repeat — attendance `POST /bulk` (ON DUPLICATE KEY), student status, settings, memo/announcement edit, contact | no confirmation |
| Rejects a second attempt or has no undo — excuse review (`403` once reviewed), parent approve/reject, hard DELETE of a post or a manual backup, restore, password change | explicit confirmation **naming the specific decision back** |

A sentence of warning text is not a confirmation step. **No unsaved-changes
guard on Teacher → Grades** (every score is its own request); whether
Teacher → Attendance, a bulk submit, warrants one is an OPEN QUESTION — do not
add a blanket `beforeunload`.

### 5f. Empty-state copy is derived from the filter state, never from a flag

One branch per cause, keyed on the actual applied values. A Reset action
appears only when resetting would change the result. "Nothing is waiting"
must be structurally impossible outside its own filter. Whether the form
differs from its default is its own value (`canReset`), never reused as the
copy flag — that conflation produced wrong copy twice. The branch count
differs per endpoint (Events three, Announcements two, Memos one, Admin →
Attendance five) and that is a finding, not an inconsistency. **An empty
state never repeats an action that is always visible in the page header
(2026-09-19); its message names the header button instead. A filter or range
reset may sit in the empty state.**

### 5g. When a live channel fails, say so — never fake liveness

`SocketProvider` exposes `connected`; `LiveStatus` renders a persistent
*"Live updates paused — new updates will not appear on their own"* strip
with a Refresh action, and nothing while healthy. **No polling fallback.**
The socket is a latency optimisation, not the delivery path —
`POST /api/messages` persists before it emits, and an emit into an empty room
is a no-op. **The notice must appear wherever anything depending on the
channel is shown**: `LiveStatus` renders in `Shell`, above the routed page,
because the unread badge is on every page; its Refresh is a full reload.
`UnreadProvider` is gated on `messagesBuilt`; **`LiveStatus` is UNGATED for
every role, since N2 on 2026-09-19** — and the copy says "new updates", not
"new messages", because the strip is no longer only about Messages and is
shown to a role that has none. The 2026-09-18 gate on `messagesBuilt` is
gone: it was sound when written (nothing on an admin's screen was
channel-fed, so the strip announced a failure they could do nothing about),
but N1 changed the fact it rested on. Every role now has a bell and sidebar
badges on the SAME socket, and admin receives `parent_pending` live, so an
admin whose channel dies has a silently frozen bell — the thing this
convention exists to prevent. §5g's inverse is therefore not "closed"; it
no longer exists, because no role is channel-less.

### 5h. Build and lint prove the code compiles, not that the page renders

**A page is not done until it has been opened in a browser — and opening is
not using: type a full word into every text field.** `npm run build`
resolves imports, not identifiers; the server suites never load the client.
**`no-undef` is ENABLED since 2026-09-22** — it was off by default in oxlint's
`correctness` set, which is how the same undefined-identifier defect shipped
twice. It needed `env.browser` beside it plus an `overrides` giving
`scripts/**` `env.node`, or it reports 52 globals and no real bugs; with those,
it reports **0** and the oxlint total is unchanged by it (**41** since CR2
deleted `teacher/GradesPage.jsx`; it was 44). Where a
browser is unavailable, an SSR render via `renderToStaticMarkup` **with a
negative control** is the backstop, not the proof: it cannot catch effect bugs
(the Modal focus-steal), **and it cannot catch an undefined identifier inside
a `useEffect` or `useCallback` body either** — measured on 2026-09-22, when an
SSR proof rendering Teacher → Grades scored 32/32 with the blank-page defect
in place. For that shape the guard is `no-undef`, not a render. Say what
was rendered and by whom. The dev-only console error `WebSocket is closed
before the connection is established` is React StrictMode double-invoking
`SocketProvider`'s effect: not a transport problem, not worked around, absent
in a production build.

### 5i. Explanatory copy is a claim about behaviour

If a sentence tells the user what will happen, the handler behind that
control must actually do it. Tightening copy is the fix when the behaviour is
already honest; do not add a probe write to make copy true. Copy that
overstates the code sends a reviewer chasing a bug that does not exist.

### 6. Nav — three states, and flipping the flag is not a follow-up

`layout/nav.js` is the single source of per-role navigation: **built** (a
live `NavLink`), **blocked** (`blocked: '<reason>'`, muted, reason as tooltip
— the page cannot be designed until an external question is answered;
currently none), **unbuilt** (`built: false`, dimmed, non-clickable). **A
badge renders only on a BUILT item**; `UnreadProvider` skips the request
unless that role's Messages item is built (live for Teacher and Parent;
Admin → Messages will not be built). **Flipping `built: false` to `true` is
part of whichever dispatch adds that page's route — never a follow-up.** A
page with no unbuilt row is an add, not a flip.

**No role has a `built: false` item as of 2026-09-18** — admin's five were
**removed, not dimmed** (ADMIN SCOPE AUDIT → SCOPE DECISION 2026-09-18), on
the rule that `built: false` means *unwritten*, never *refused*. **The state
is not retired and its branch is not dead:** `Shell.jsx` still implements
unbuilt and blocked, `/dev/ui` still renders both, and Stage 5 will
reintroduce them. **The `LiveStatus` gate that landed the same day is gone
again (N2, 2026-09-19)** — every role is channel-fed now, so the strip is
unconditional; see §5g. `SocketProvider` still connects for every role, and
an admin socket now feeds something.

### 7. FormField — four shapes, and only four

```
1. <FormField label="Name" placeholder="…" />                      -> <input>
2. <FormField label="Remarks" as="textarea" rows={3} />             -> <textarea>
3. <FormField label="Status" as="select">{options}</FormField>      -> <select>
4. <FormField label="Range" render={({ id, describedBy }) => …} />  -> custom
```

`children` are the children *of the rendered control*, forwarded only when
`as !== 'input'`. Shape 4 receives a **single object**, not positional
arguments.

### 7b. Modal sizes — three, and `lg` is the ceiling

`sm` / `md` / `lg` (`max-w-sm` / `max-w-lg` / `max-w-2xl`). No `xl`. No
current page reaches `lg`'s width; a page that cannot fit `lg` is the trigger
to reconsider the scale, never to add a size for one caller. `Modal` focuses
the panel on `open` only and keeps `onClose` current via a ref — an effect
that mixes a one-time action with a frequently-changing dependency re-fires on
every keystroke (found in browser review 2026-09-08, fixed in the primitive).

### 7c. A write's result renders next to the control that caused it

**Frozen 2026-09-18, after Teacher → Settings.** `FormStatus` is the only
renderer for the outcome of a write. Three rules:

- **Placement.** Under that form's submit button; **inside the Modal**, under
  its action row, for a modal write; **above the list it describes** when the
  message outlives its modal ("Parent approved." after the dialog closes). A
  page with two lists gets two keys. **Never a single slot at the top of the
  page** — nothing in `Shell` is sticky, so on a long page the confirmation for
  a button near the bottom renders off-screen and the write looks like it did
  nothing.
- **One value, not two.** `{ tone, text }`, so a success and a failure cannot
  both be on screen. The XOR that each page used to re-derive by hand — and
  got wrong twice — is now unrepresentable.
- **One object per page, keyed by form.** Writing a key REPLACES the object,
  clearing every other form's message: a message describes the action just
  taken, and a stale success next to a fresh one gets read as the new result.

An error still goes through `ErrorAlert`, so §2's rule that the API's own
wording reaches the user is untouched; a success carries `role="status"` to
`ErrorAlert`'s `role="alert"`. An error slot already rendered inside its own
modal is already correct — do not convert it for uniformity.

### 8. Colors are tokens — no raw palette utility, no `dark:`, outside `index.css`

**Frozen 2026-09-19.** Every color a page uses is one of the 71 semantic
tokens in `client/src/index.css` (`bg-surface`, `text-fg-muted`,
`border-edge`, `ring-focus-ring`, the `neutral/success/warning/danger/info-*`
tone sets, the six `bubble-*`, and since D3 `primary` = the school's navy
plus `brand` / `brand-soft` / `seal-bg`) — never `bg-white`,
`text-slate-500`, an arbitrary color, or a `dark:` variant. The seal's green,
gold and red are never tokens (they collide with the tones); the seal always
sits on a `bg-seal-bg` disc (§9). `:root` holds the raw values, each
line naming the palette color it equals; `@theme inline` maps them so a
`[data-theme]` block can swap values at runtime. **`npm run lint:tokens`
(`client/scripts/check-color-tokens.mjs`) must report 0 on every client
dispatch**, next to oxlint's **41** (was 44 until CR2). `page`/`surface-subtle` and
`primary`/`bubble-mine` share a light value on purpose — do not merge them.
**Dark (2026-09-19):** the same variables under `[data-theme="dark"]` — the
block is the theme, no page changed for it. Light / Dark / System live in
Settings → Personalization, stored on the device (`pp.theme`, default Light),
applied by `pages/settings/theme.js` and by an inline script in `index.html`
before the bundle (keep the two in step by hand); `initTheme()` in `main.jsx`
keeps System live. **`npm run lint:contrast` must report 0** on every client
dispatch (**70 pairs × 2 themes, 9 waived** as of 2026-09-22), next to
`lint:tokens` and oxlint's 41; a failing pair is waived
only by an allow-list entry whose marker sits on a KNOWN ISSUES row. Full
text, the proof method, the six accepted light-mode changes (E1–E6) and the
dark values: `docs/FRONTEND_CONVENTIONS.md` §8.

### 9. Shell chrome is sticky, and the seal is always on its white disc

**Frozen 2026-09-19 (D3).** `layout/Header.jsx` is `sticky top-0 z-30`; the
sidebar is `sticky top-0 h-screen self-start` with its nav box
`min-h-0 flex-1 overflow-y-auto`. **The document is the only scroller** —
one scrollbar, no layout shift. **Do not add a second scroll container to
`<main>`.** z-order: header 30, mobile drawer 40, the notification panel 40
(closed when the drawer opens), Modal backdrop 50.

**The seal always sits on a `bg-seal-bg` disc, with `rounded-full` on the
image** — the source is a JPG with a white field and no alpha, so the disc
is what makes it work on a dark surface, and it is white in BOTH themes on
purpose. Alt text is "Captain H. Francisco Elementary School seal"
everywhere. The favicon set is generated from the same file by a one-off
script, **not a build step** — regenerate by hand if the school supplies a
new seal.

Full text: `docs/FRONTEND_CONVENTIONS.md` §9.

### 10. Notifications — the bell, the badges, and what a count may be

**Frozen 2026-09-19 (N1 server, N2 client).** Four rules; the reasoning, the
audiences and the accessibility contract are in
`docs/FRONTEND_CONVENTIONS.md` §10 and `docs/API_REFERENCE.md`.

- **A count is the server’s answer, never client arithmetic.** The socket
  event `notification_counts` carries no payload and means *refetch*.
  Nothing increments on arrival or decrements on a read. This is §5b one
  component out, and the Messages badge had exactly this defect on
  2026-09-07.
- **Two counts, two sources, never summed.** Messages keep their own
  (`GET /messages/conversations`); the bell counts everything else and
  deliberately excludes messages, because `messages.read_status` already IS
  per-item read state.
- **Bell vs badge is a decision.** Everything rings the bell. Badged:
  Excuse Letters / Announcements / Memos / Events for teacher and parent,
  Users and Announcements (carrying **announcements + memos**, since admin
  has no Memos page) for admin. **Grades is never badged** — bell only. So a
  parent’s bell total EXCEEDS the sum of their badges; that is correct, and
  it must be written down wherever it could read as a bug.
- **A notification must be openable**, and "cannot open" includes having no
  page for it, not only failing an API scope check — admin is authorised by
  `GET /api/events` and is still not notified about events. Enforced twice:
  the fan-out picks the audience with the matching list endpoint’s own
  `WHERE` (or a DECLARED narrowing, never a widening), and every read
  re-checks visibility against live rows. Adding a page for something
  currently excluded means changing BOTH places; flipping a nav flag will
  not do it.

### 11. Account recovery — what may be said, and what revokes a session

**Frozen 2026-09-19 (R1 server, R2 client).** Four rules. **This file is the
only present-tense home for §11 and §12 — `docs/FRONTEND_CONVENTIONS.md`
stops at §10.** The reasoning and the endpoint detail are
`docs/API_REFERENCE.md` → Auth (the trimmed clauses are verbatim in
`docs/ARCHIVE.md`); the dump exclusion is in `docs/RESTORE.md`.

- **`POST /api/auth/forgot-password` answers the same sentence, always** —
  verified, unverified, inactive, unknown `login_id`, rate-limited, internal
  failure: one `202`, one message. A parent's `login_id` IS their child's LRN
  (§5c), so anything else is an LRN oracle. **The client advances its step on
  that reply and must not branch on whether a code was really sent.** The
  reset endpoint has **one** failure message for every cause and **no count
  of tries remaining** — that is the same oracle, slower.
- **`users.token_version` is the revocation mechanism, not a timestamp.**
  Bumped by a password change, a reset and an admin temporary password; the
  token carries it as `v` and `middleware/auth.js` compares for equality.
  **`password_changed_at` is audit only** — two attempts to revoke on it
  failed. Do not reintroduce it as the check.
- **A write that revokes must hand back a replacement, and the client must
  store it.** `PUT /auth/change-password` returns `token`;
  `AuthContext.applyToken()` stores it and re-reads `/auth/me`, in that
  order. A caller that drops it signs its own user out on the success path.
- **The forced change is routed on the FIELD, never on the 403.**
  `code: 'MUST_CHANGE_PASSWORD'` is a backstop for direct API callers; §2
  says a 403 never redirects, and the client already has
  `user.must_change_password` from `/auth/me`. `/change-password` sits
  outside `Shell` and outside `ProtectedRoute`.

**A screen may not tell someone to ask an office they ARE.** Settings →
Account information names Admin → Users for an admin and the school office
for everyone else; an admin's own way back in is *another* admin, because the
temporary-password endpoint is admin-only and refuses your own id (§5i).

### 12. Dashboards — seven rules, and one of them is structural

**Frozen 2026-09-20 (DB1 server, DB2 client).** The endpoint detail is
`docs/API_REFERENCE.md` → Dashboard.

- **Each card owns its own loading, error and empty state, and renders them
  inside its own frame.** A dashboard is the one screen where several
  independent failures are normal, so **no bare `Promise.all` across cards**
  — it rejects as a unit, and one timed-out request would blank every card
  that worked. `pages/dashboards/useCard.js` is the hook; `onRetry`
  refetches that card alone. `allSettled` INSIDE one card is fine.
- **No dashboard card is red.** `Card`'s `danger` tone is defined and
  deliberately unused. Red means something HAS failed, and the only thing
  that can fail is a request — which `ErrorAlert` already renders inside the
  card. Amber means "there is something to do". The admin lockout hazard
  shipped red and was corrected on review: a state that could strand you
  later is a warning, not an error.
- **"Present on recorded days", never "attendance rate"** (§5i), and the
  card shows the FRACTION only. The percentage and its half-up rounding
  belong to Parent → Attendance; a copy here would be a second
  implementation of a number the two screens must agree on.
- **The parent grades summary is computed server-side** (amendment A1) with
  the same `roundTo2` the report card imports. Do not recompute any of it in
  the client, and do not show a partial average.
- **The teacher banner is one row per advisory section**, hidden on Saturday
  and Sunday, and not rendered at all for a teacher who advises nothing.
  Green requires FULL coverage; anything partial is amber "N of M recorded",
  because the encode screen omits unset rows rather than defaulting them.
  Dates come from `todayLocalDateString()`, never `toISOString()`.
- **An "upcoming" list asks for `sort=event_date&order=asc` explicitly.**
  `GET /api/events` defaults to DESC, so a `limit=3` card without this
  returns the three FURTHEST-AWAY events, backwards. The endpoint default is
  not changing; the caller asks for what it needs.
- **A card never links to an action the app cannot perform** (§5i). The
  hazard card shipped with "Create a second admin →" pointing at Admin →
  Users, which cannot do it — `POST /api/users/teachers` hardcodes role
  `teacher`, `/parents` hardcodes `parent`, and no endpoint anywhere creates
  an admin. Removed. **Before adding a link, check the handler.**

**Recent activity is deliberately absent from the admin dashboard.** There
is no read endpoint for `activity_logs`, and building one needs a redaction
rule for free text written by twenty-odd call sites. It belongs to a future
Admin Activity Log page. Do not fake it from another source.

### Corrections — three claims retired here

Circulated in planning, **wrong**, never in this file, recorded so they cannot
be re-derived: "the first screen builds the shared components" and its ~5h
estimate (the primitives came first; the estimate is void and not replaced
with a guess); "backend is 100% complete" (say what the endpoints table says
— endpoints, not percentages); "36 screens" (the real figure is **75
role-facing views** — 33 nav items plus 42 detail/sub views — behind
**~45–50 distinct implementations**; the counting rule: a substantive form
counts whether route or modal, a bare confirm does not; the old ~13-day
estimate is void).

### MEASURED BUILD TIME — data points, not a rate

Every dispatch since Teacher → Attendance has a dated data point, and none of
them is a rate: each is agent execution time, not developer-hours; excludes
planning and review; and everything before the sixth point was measured
without §5h's render proof inside the clock, so the first five are not
comparable to anything after. **Do not derive a projection from them.** The
tables and caveats are verbatim in `docs/ARCHIVE.md` → MEASURED BUILD TIME;
each dispatch's number is also on its CHANGELOG row.

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

**Mobile scope:** all 9 features (Feature 7 removed 2026-09-13), all 3 roles. Backup/Restore is the one
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

## THE CORE FEATURES — nine (Feature 7 removed 2026-09-13)

1. Grade Management & Viewing
2. Attendance Monitoring
3. Student Records Management
4. Announcements & Memo Dissemination
5. Parent-Teacher Messaging (Socket.io)
6. Excuse Letter Submission & Management
7. ~~Contribution/Fees Monitoring — view and track only, no payment gateway~~ — **REMOVED 2026-09-13.** See SCOPE DECISION below. Numbering kept so it still maps to the manuscript.
8. User Management (Admin)
9. System Settings Management (Admin)
10. Backup & Restore (Admin, web only)

**Excluded from scope:** QR attendance, online payment, enrollment,
transcript requests, schedule grid, college grading, and — since 2026-09-13 —
contribution/fee collection (SCOPE DECISION below).

### SCOPE DECISION — Feature 7 (Contribution/Fees Monitoring) removed

**Consultation at Captain H. Francisco Elementary School, 2026-09-01.
Principal Bajar stated that the school is not permitted to collect
contributions from parents. The team decided to remove Feature 7.** Removed
in code on 2026-09-13 (branch `chore/remove-contributions`). Recorded from
the consultation; if a written memo exists, cite its reference here.

**This is a SCOPE decision, not an engineering one**, and it is the answer
to the November panel. Feature 7 is one of the ten features in the
approved manuscript, and Figure 19 (the fee screen with its Download
Statement export) describes it. **Chapter 5 must explain the removal**: what
the feature was, that the principal said on 2026-09-01 the school may not
collect contributions from parents, and that the system therefore ships
nine features. Do not describe it as unfinished or cut for time — it was
built, tested (38 assertions) and working, and was removed because the
school may not do the thing it tracked.

**Why not a flag, and why not leave the tables:** a removed feature with a
live POST still mounted is a UI lie, and empty unused tables are how this
file's counts drifted before.

**What stays, deliberately:** the 40 `activity_logs` rows recording
contribution actions (`create_contribution` 12, `delete_contribution` 4,
`update_contribution` 4, `update_contribution_record` 20) — audit history,
no FK; deleting them would rewrite what happened, so do not "clean" them.
Dated CHANGELOG entries, build-time data points, and the §5h defect row stay
as the history they are. Pre-removal backups still contain both tables — see
KNOWN ISSUES.

What was deleted, and the nine open items the removal also closed:
`docs/ARCHIVE.md` → SCOPE DECISION → Feature 7.

---

## BLOCKED / RESOLVED

Answers from the school visit and from published DepEd orders land here as
they arrive. An item moves from **BLOCKED** to **RESOLVED** the moment the
question is answered — that is a documentation change, not a build. Do not
read a RESOLVED heading as "built"; check the endpoints table and BUILD
ORDER for that.

### Grades module — fully built: schema, real curriculum, the full write path, and viewing (G1a, G1b, G2a–G2e, G3)

Full policy detail lives in `docs/GRADING_SPEC.md` (DO 015 s. 2026 + DO 009
s. 2026 + school-visit findings). The stage-by-stage build record — every
design question, its answer, and the test that proved it — is verbatim in
`docs/ARCHIVE.md` → BLOCKED / RESOLVED → Grades module. What a session must
know:

**Nine stages, all done 2026-09-05/06** (G1a → G2a → G2b → G2c → G1b → G2d →
G2e → G3), plus `DELETE /:id` and `GET /api/grading-modes` (2026-09-08) and
the rounding fix and Grade 1's computed letters (both 2026-09-22).
**Grades has no remaining backend work.**

**The rules, each stated nowhere else in this file:**

- **Dual mode: exactly one of `term_grade` or `descriptive_grade` is
  populated. Do not drop or merge the two columns** — the KS1 rollout keeps
  both live indefinitely. Final Grade and General Average are **not columns
  anywhere**; both are computed at read time.
- **EX is three raw-score columns on `grades` (`ex_st1`/`ex_st2`/`ex_te`, each
  with `*_max`), NOT `grade_components` rows** — a fixed positional triple,
  locked, not an open-ended list. `ex_percentage` is derived at write time
  (30/30/40). WW/PT retain every raw score via `grade_components`.
- **Every computed value is NULL until every required input exists** — and a
  descriptive subject is `null` because it is *inapplicable*, not incomplete
  (`grading_mode` tells the two apart). **Never a running average:** a partial
  figure reads as settled. **Percentages over 100 are not clamped.**
- **Encode scope = the SUBJECT teacher**, via `teacher_assignments` on all
  four of teacher/subject/grade/section (**VARCHAR, never `section_id`**) — a
  second scoping authority alongside `sections.adviser_id`, because DepEd
  assigns encoding to the subject teacher. View = grade+section, any subject.
  In view-scope but not encode-scope is `403` naming the subject; outside both
  is `404`. **Do not widen grades to advisers** (also OPEN QUESTIONS).
- **`PATCH /:id/lock` is admin-only and unscoped, with no completeness gate** —
  a gate would make every descriptive row permanently unlockable — and no
  extra friction on unlock, which is reversible unlike restore. **`DELETE /:id`
  is admin-only, refuses a locked row, and is deliberately on no screen.**
- **A missing `grading_mode_configs` or `grade_weight_configs` row is `409`
  naming the gap — never a silent default, never `500`.** A transmutation year
  with no rows means "use the Initial Grade directly": **the data's absence
  drives it, never a hardcoded year comparison.**
- `grade_weight_configs` is keyed `(subject_id, school_year)`, `CHECK` sums to
  100.00. `grade_components.type` is `ENUM('WW','PT')`, no `'formative'`.
  `current_quarter` became `current_term`. Item-count caps and `is_locked`'s
  trigger stay documentation-only. Awards are out of scope.

**The class record is BUILT (CR0–CR2, 2026-09-22)** — `GET` and
`PUT /api/grades/class-record`, the 23rd table `assessment_slots`, and
Teacher → Grades rebuilt as the grid. **Five rules stated nowhere else in this
file:**

- **A slot is USED once it has a highest possible score** — not once it has a
  row. **An unused slot is left out entirely; a USED slot where a learner has
  no score makes that learner's whole group Pending — never left out, never
  zero.** Leaving it out silently RAISED the grade of a learner who missed an
  assessment; that was a real defect, found in review twice.
- **Every score and every highest possible score is a WHOLE number**, refused
  on the server at all four per-row write paths and the class record. This
  does not make computed values integers (§4a).
- **A score above its HPS is allowed and flagged, never refused or clamped** —
  matching `gradeComputation.js`. **Nobody has asked the school about bonus
  points, so no screen may claim they are permitted.**
- **Both class-record routes are registered BEFORE `GET /:id`** or
  `class-record` parses as an id. Do not reorder `routes/grades.js`.
- **`slot_id` is REQUIRED on `POST`/`PUT /:id/components`.** Only the
  class-record `PUT` may create a column and its scores in one save, by
  addressing a slot as `type` + `slot_no`.

Full contract: `docs/API_REFERENCE.md` → The class record. The policy behind
it: `docs/GRADING_SPEC.md` **§6e**. The page: `docs/FRONTEND_CONVENTIONS.md`
**§13**.

**Grade 1's letter is COMPUTED and BUILT (2026-09-22), and the rule is
`docs/GRADING_SPEC.md` §6a** — WW 30 / PT 50 / Summative 20, banded on the raw
weighted score, no transmutation, no General Average, a Final letter only when
all three terms are recorded. **`PATCH /:id/descriptive` is RETIRED**: one
write path for every grade level, and a letter cannot be set by hand. **A
legacy Grade 1 row — a letter typed before the rule, with no scores behind it
— keeps its letter and shows NO Final**, which is correct and is visible on
Nino's seeded card; do not "fix" it. The closed BLOCKED item is in
`docs/ARCHIVE.md` → BLOCKED / RESOLVED → Grade 1's computed letter.

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

### Attendance — both questions RESOLVED and BUILT; moved out 2026-09-22

**Per day, not per subject** (Stage B1, 2026-09-04) and **the rate formula**
(the principal, 2026-09-13) are closed, so under the REFILL RULE both
narratives left this file permanently — verbatim in `docs/ARCHIVE.md` →
BLOCKED / RESOLVED → Attendance. Every rule they carried is stated in its own
one place and is deliberately not repeated here: attendance scoping runs
through `sections.adviser_id` (CURRENT STATE → sections table); **attendance
does not feed grade computation** (`docs/GRADING_SPEC.md` → Resolved by the
school visit); and Late counts as present, Excused as absent is the answered
OPEN QUESTION of 2026-09-13 — a school decision, **never attributed to
DepEd**, which prescribes no attendance rate and no attendance grade
component.

**One claim went stale here and is corrected rather than carried out.** This
section said Parent → Attendance shows "Present on recorded days" as a
percentage, one decimal, half-up. **DV2 deleted that percentage on
2026-09-20** — the page shows the fraction, `presentOnRecordedDays` was
deleted rather than exported, and §12 has the dashboard card showing the
fraction only. Teacher attendance history is `/teacher/attendance-records`,
not the parent page.

---

## RESTORE — built

`POST /api/backups/:id/restore`, admin only, `routes/backups.js`. Restoring
drops and recreates the whole database; a bad implementation is unrecoverable
in a way almost nothing else here is. Every guard below is in the shipped
code. The full record — including the two live-restore bugs, how each was
found by hand rather than by the suite, and why a content-inspection test
proves only what it checks for — is verbatim in `docs/RESTORE.md`, the text
`server/routes/backups.js` and `test-restore-flows.js` mean by "CLAUDE.md's
RESTORE section".

- **Source validation is structural** — the only input is `backups.id`, no
  upload path, no filename parameter. Row and file checked before step-up.
- **Step-up auth:** `password` re-verified against the caller's own hash;
  `400` missing, `403` wrong, **never `401`** (the token is valid). Each
  refusal logs `restore_refused` naming the backup and reason, **never the
  typed value**.
- **Type-the-name confirmation:** `confirm_filename` **must** match exactly.
- **Automatic safety dump FIRST.** If it fails the restore aborts and nothing
  is changed — **the single most important line in the module.**
- **`backups`' own rows and `auth_codes`' rows are NEVER in a dump**, via
  `--ignore-table` plus a `--no-data` pass, and `stripBackupsTableDdl()`
  strips `backups`' `DROP`/`CREATE TABLE` from the SQL a restore executes.
  Without both, **every restore wiped the live `backups` table.** **Do not
  remove either flag to "make the dump complete"** — a six-digit code has a
  10⁶ plaintext space, so bcrypt is not enough on a file that is never
  deleted. `auth_codes` needs no strip counterpart: recreating it empty is
  correct.
- **Orphaned `.sql` files are never auto-adopted** — a fabricated
  `created_by` is a guess. Adoption is a by-hand fix logged as
  `manual_backup_adoption`. **Do not recreate lost rows from memory.**
- **`activity_logs` is rewound on purpose** (it is a snapshot restore), with a
  `restore_wiped_activity_logs` marker written afterwards naming the source,
  the boundary and the count lost — **the count is off by one, KNOWN ISSUES.**
- **The restore runs on a dedicated one-off `mysql2` connection**
  (`multipleStatements: true`), **never the shared pool** — safe only because
  the SQL is our own mysqldump output via a tracked row. **If this ever takes
  an uploaded file, that stops being true.** MySQL DDL cannot roll back.
- **Pool reset** after success (`pool.resetPool()`), and **every active JWT
  invalidated** via `auth_security_state.token_valid_after` — one global row,
  no user or role, because a restore can replace every `users` row; **never a
  `system_settings` key.**
- **Synchronous by decision.** Revisit only if a dump ever takes more than a
  few seconds.

**`npm run test:restore` NEVER triggers a real restore** — that would
`DROP DATABASE` under every other suite and the running server. It tests the
pre-flight gates and `token_valid_after` with crafted JWTs, and **no request
in it ever combines the real password with the real `confirm_filename`.** A
real end-to-end restore is a deliberate manual step; **`db:setup` is NOT the
recovery path** (it drops `activity_logs`). **Three things a restore of an old
dump does, all KNOWN ISSUES:** before 2026-09-13 it brings back the two
Contributions tables; before 2026-09-22 it reverts the Grade 1 subject rename;
and **before CR1 the dump has no `assessment_slots` at all**, so a restore
drops the table and every `grade_components.slot_id` with it — the class
record stops loading until the migration is re-run.

---

## KNOWN ISSUES — fix when you reach them

**Open rows only, compactly. The full table — every row with its complete
note, and every CLOSED row kept so it is not reopened — is
`docs/KNOWN_ISSUES.md`. Add new rows there and add a line here.**

**Server cleanup, 2026-09-15** closed seven server flags. **Three server items
stayed open on purpose; two closed 2026-09-18 (`feat/authorization`) and one
is still open, needing its own dispatch:**
- ~~`GET /api/grades` and `GET /api/attendance` have no `LIMIT`~~ — CLOSED
  2026-09-19 (`feat/pagination`): every list endpoint pages — `limit` 50
  default / 200 max, `offset`, `sort`/`order` against an allow-list, a
  sibling `page { limit, offset, total, has_more }` over the filtered set;
  `docs/API_REFERENCE.md` §6b. The three deliberately-open server items are
  all closed.
- ~~`POST /api/users/parents` has no assignment check~~ — CLOSED 2026-09-18:
  assigned OR adviser of the student's section, `403` otherwise; an unknown
  LRN is that same `403` (never `404`), and the scope check runs before the
  duplicate `409`s. Do not hide the button behind assignments — an adviser
  may create it.
- ~~`Account is not active.` is `403`, should be `401`~~ — CLOSED 2026-09-18:
  `401` in `middleware/auth.js`; login keeps `403` + `status`.

| Issue | Where | Note |
|---|---|---|
| **Restoring any backup taken before 2026-09-13 brings back the two Contributions tables** | `server/backups/*.sql` + restore | Afterwards: `DROP TABLE contribution_records;` then `DROP TABLE contributions;` and confirm the table count is back where it was (**23** since `assessment_slots` landed 2026-09-22; it was 22 from `auth_codes` on 2026-09-19). Do not delete or edit the old dumps |
| **HAZARD — `DB_NAME=<other> npm run db:setup` destroys `<other>` and rebuilds `parents_portal` anyway** | `scripts/setup-db.js` + `schema.sql` | `schema.sql` hardcodes `CREATE DATABASE`/`USE parents_portal`. Never run setup-db with a non-default `DB_NAME`; for a scratch proof rewrite the name in memory (the 2026-08-29 method) |
| **`academic_year` is locked on Admin → Settings — on that page only. Deliberate; do not "fix" it** | `admin/SettingsPage.jsx` (lock) + `routes/settings.js` (still writable) | Sections, mode configs, weights and the transmutation table are keyed on `school_year`; changing the setting moves none of them and four handlers 409. Starting a new school year is a process, not a field. Say "not editable from this page" |
| **20 of 23 sections have no adviser and no screen can assign one** — attendance can never be recorded in them through the UI | `sections.adviser_id` + the Figure 5 scope decision | `PATCH /api/sections/:id/adviser` exists; Admin → Sections will not be built. Admin → Attendance names it: "Grade X - Name has no adviser…". No fix proposed — reversing the decision needs a date and a name |
| **`test:attendance` deletes every attendance row on three dates, not just its own** | `test-attendance-flows.js` `cleanup()` | `daysAgo(2)`, `daysAgo(3)` and today, for ALL students; `daysAgo(4)` likewise. Do not run it against data you want to keep on those dates. A test-file dispatch |
| **`DELETE /api/grades/:id` is deliberately NOT surfaced on Admin → Grades. Do not add a Delete button as an "obvious" omission** | `admin/GradesPage.jsx` + `routes/grades.js` | Darryl, 2026-09-14: the lock, not delete. Irreversible, reaches the SF9, no need named — a wrong grade is EDITED by the teacher |
| **Ten `.sql` files on disk have no `backups` row and cannot be restored through the API** | `server/backups/` + Admin → Backup & Restore | Rows went with the 2026-09-07 `db:setup`. Listed read-only under "Files with no record", no adopt affordance. Do not delete them; recovery is by hand (the 2026-08-29 adoption method) |
| **Safety copies (`pre_restore_*`) have no Delete in the UI — one accumulates per restore** | `admin/BackupsPage.jsx` | Deleting one removes the only undo for the restore that made it. Revisit trigger: a retention rule from the school, or disk space. Deleting one today is a direct API call |
| **The restore's lost-entries count undercounts by the source backup's own `create_backup` row** | `routes/backups.js` (`created_at > ?`) | Measured 2026-09-15: real loss 3, shown 2. `>=` would over-count rows the dump did contain; a correct count compares against what the dump holds. Restore also rewinds `activity_logs` AUTO_INCREMENT, so ids are reused. A server change |
| **HAZARD — if the only admin loses its password and has no confirmed email, nobody can restore access through the app** | `routes/users.js` `POST /:id/temp-password` + forgot-password | The fallback is admin-only AND refuses your own id; self-service needs a CONFIRMED email. The seed ships one admin, never verified, so both paths can be shut at once and the remedy is a direct DB write. **Before the pilot: confirm ADMIN001's email** — that is the ONLY in-app remedy: no endpoint creates an admin (both create routes hardcode their role), so a second admin is a direct DB insert. Do not let an admin set their own temporary password, and do not link to a Create-admin screen that does not exist |
| **A broken mailer is invisible — forgot-password answers the same `202` either way** | `utils/mailer.js` + `routes/auth.js` | The uniform reply must not change (LRN oracle). **Check `activity_logs` for `password_reset_email_failed` before believing a user typed their login id wrong.** Fix is a health probe, never a different response body |
| **A truncated dump from the 2026-09-15 browser check is on disk as an orphan, and nothing on screen says it is incomplete** | `server/backups/parents_portal_2026-09-15_003822.sql` + `createBackupRecord` | No `-- Dump completed on` footer; `createBackupRecord`'s cleanup runs only in a live process. **Check any orphan for the footer before adopting it.** Not deleted (no backup file is ever deleted) |

The other 30 compact rows that stood here until 2026-09-19 are verbatim in
`docs/KNOWN_ISSUES.md` → "Compact rows moved from CLAUDE.md on 2026-09-19".
Several were already closed by then; each row's full entry in that file's
main table is the authority, not the compact wording. Only the bold
hazard / do-not rows stay above.

---

## NOW POSSIBLE — client consumers (API exists; pages have not switched)

Every item this section ever held is closed except one recorded DECISION:
**Teacher → Memos renders `posted_by_name` as a sortable column; Teacher →
Announcements and Events deliberately do not** (Actions already says
mine/theirs, and those pages already carry four columns). Parent content
modals render it. Do not open a dispatch to "finish" Announcements and
Events, and do not read the closed KNOWN ISSUES row as "every page shows who
posted it." Closed here, each dated on its CHANGELOG row: Teacher → Grades
encode-scope from `GET /assignments` and mode from `GET /grading-modes`
(2026-09-12); `useTeacherTargets`'s assigned leg from `GET /assignments`
(2026-09-13; the union is still assigned OR adviser — do not reuse the hook
for Grades); Contributions compose (removed with Feature 7, 2026-09-13);
Teacher → Messages "Announce to" naming the section (2026-09-13). **This
section is not a backlog of one; do not "finish" it. Not on this list:** the
contacts empty-cause — it stays in KNOWN ISSUES.

### Parent grade breakdown — BUILT 2026-09-11

Manuscript Figure 17 called this "Student Record." It is **Grades**, not
Feature 3; there is no Parent → Students nav; one account = one child.
**Answered 2026-09-11 by the team in conversation** — not a school visit, not
a written reply; do not cite it in the manuscript as policy, do not re-ask:
parents should see WW / PT / Exam raw scores under a term so they can tell
*where* a mark came from. **The modal is approved — do not remove it as an
unapproved feature.** Tap a term with `grade_id` → Modal → `GET /api/grades/:id`
(`parent(own)`, `404` out of scope), unwrap `['grade', 'grade_components',
'descriptor']`; `GET /` is still not called; no new endpoint, no new nav.

| Label | Source |
|---|---|
| Written Works | `grade_components` `type === 'WW'` — `label`, `score`/`max_score`, `date_recorded` |
| Performance Tasks | same, `type === 'PT'` |
| Examinations | `grade.ex_st1`/`ex_st1_max`, `ex_st2`/`ex_st2_max`, `ex_te`/`ex_te_max` |

**Term grade stays. Initial Grade and weights are not shown** — a number the
parent has never seen, and the one that raises "why isn't this 90?"
(transmutation). Numerical empty is three per-section copies, never one
"nothing recorded" (§5f). **Grade 1:** the letter is the term grade, still
fetched via `GET /:id` (hedge); **no empty WW/PT/Exam sections** (the write
path `400`s numerical encodes on a descriptive row) **and no sentence about
how the letter is produced** — removed 2026-09-12 because it stated an
unconfirmed assumption as fact; silence is the honest state until the school
answers; do not re-add it, a hedge, or a tooltip. §5b: clear `detail` before
every fetch; the header comes from the card tap. A Pending / null cell is not
a button. **Do not show:** rank, class average, "Passing", "Need attention",
`descriptor.remarks`, IG, weights.

Full text: `docs/ARCHIVE.md` → NOW POSSIBLE.

---

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

## GET /api/messages/contacts — BUILT 2026-09-07

Was the only designed-but-unbuilt endpoint in the system (the same-day
endpoint audit confirmed nothing else was). Wrapper key `contacts`, the sixth
endpoint in `routes/messages.js`, scoped by the **inverse of `canMessage()`**.
Row: `{ id, name, role, subject | null, student_name | null,
student_grade_level | null, student_section | null, last_message | null,
last_message_at | null, unread_count }` — the `student_*` fields are the
linked child's, null on teacher/admin rows; `subject` is a comma-joined
string. Parent sees the teachers connected to their child (assigned OR
adviser) with subjects, plus admin; teacher sees the parents of students in
their own scope (student name on the row) plus other teachers and admin; admin
sees everyone. `?search=` filters on contact name and student name **within
scope only — never an unscoped user search**, which would expose the whole
school. Existing conversations first (most recent), then everyone else
alphabetically, so one call renders contacts and conversations. **ACTIVE
accounts only** — a pending parent cannot log in; consequence: TCH-002 sees
zero parent contacts (Jea's parent is seeded `pending`), and the test asserts
that as correct, not as the adviser-scope bug returning.

Full text: `docs/ARCHIVE.md` → GET /api/messages/contacts.

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

### Stages 1–3 ✅ ALL CLOSED — one line each

Full checkbox lists are verbatim in `docs/ARCHIVE.md` → BUILD ORDER (Stage 3
under the 2026-09-18 heading, Stages 1 and 2 under the 2026-09-22 third-trim
heading). Nothing here is outstanding.

- [x] **Stage 1 — Foundation.** Schema, seed, auth backend, auth tests.
- [x] **Stage 2 — Auth frontend.** `client/` set up, the axios client with its
      JWT interceptor, Login, `ProtectedRoute`, three empty dashboards, the
      shared layout. Built before the other backend modules on purpose: one
      complete vertical slice beats ten invisible endpoints (see the note at
      the end of this section).
- [x] **Stage 3 — Backend modules, all ten.** Students · Sections ·
      Attendance (per day, adviser-scoped) · Announcements + Memos + Events
      (the Class Board needed zero new code) · **Excuse Letters — review is
      adviser-only and NEVER touches `attendance`** (BLOCKED / RESOLVED) ·
      ~~Contributions, REMOVED 2026-09-13~~ · Messages + Socket.io · Settings ·
      User Management · Backup/Restore · **Grades, all nine stages** plus
      `DELETE /:id` and `GET /api/grading-modes`.

### Stage 4 — Web pages

**Real size: 75 role-facing views behind ~45–50 distinct implementations —
not the 36 that was estimated** (counting rule under STAGE 4 FRONTEND
CONVENTIONS → Corrections). Every checkbox's full write-up — what it built,
what it deliberately did not, how it was verified — is verbatim in
`docs/ARCHIVE.md` → BUILD ORDER, and on its CHANGELOG row.

**All 22 built and ticked, 2026-09-06 → 2026-09-14.** Foundation · Teacher →
Attendance · Attendance records · Students · Excuse Letters · Announcements,
Memos, Events · Messages · Grades · ~~Contributions (removed)~~ · Settings ·
Parent → Announcements, Memos, Events · Grades · Grades breakdown · Excuse
Letters, Messages · Attendance · Settings · Admin → Users · Students ·
Settings · Attendance · Announcements (with memos) · Grades · Backup &
Restore. **Parent → Attendance and Parent → Grades have since been replaced
by DV2 and DV3** (see below); the dated entries record what shipped then.

**Four page rules from those entries are stated nowhere else, so they stay
here.** The rest of each write-up is verbatim in `docs/ARCHIVE.md` → BUILD
ORDER and on its CHANGELOG row.

- **Teacher → Attendance records never sends `date`** — it is the read-only
  sibling route; the correction path is the encode screen.
- **The Teacher → Students class picker is `GET /assignments`, never
  `useTeacherTargets`** (that hook's union is assigned OR adviser — see NOW
  POSSIBLE for the same warning about Grades).
- **Parent content audience labels come from the target columns' nullness,
  never from `user.grade_level`.**
- **Admin → Users never calls `POST /users/parents`** and has no `:id` route;
  a parent account is created by a teacher and approved by an admin (LOCKED
  DECISIONS).

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

### After Stage 4 — interleaved, before Stage 5

**Stage 4 is closed and stays closed.** Nothing here reopens it; this is the
work that has landed on top of it, and the work that must land before Expo
starts. Full write-ups are on each dispatch’s `docs/CHANGELOG.md` row — this
is the order, not the record.

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
  - [ ] **DV4 — dashboards + the dark amber.** In Dark the amber card fill
        reads as rust/brown and edges toward "danger", undoing §12's
        amber-is-not-a-verdict rule exactly where it matters. Tune the dark
        amber surface token toward a clearer amber — **mockup first**, and
        re-run `lint:contrast`, since that token has passing pairs today.
        **Also takes the `Stat` precision inconsistency (2026-09-22):**
        `Card.jsx`'s `Stat` prints `{value}` with no formatter, so a general
        average of 87.5 reads **`87.5`** on the dashboard against the report
        card's **`87.50`** — same number, two spellings, two screens.
  - [ ] **DV1b — the remaining 16 DataTable consumers → `renderCard`**, plus
        explicit `nowrap` on the LRN columns of Teacher → Attendance and
        Teacher → Grades (both are safe today, because default wrapping
        cannot break a space-free value; the annotation is belt-and-braces).
        **LAST, deliberately:** DV2 and DV3 replace Parent → Attendance and
        Parent → Grades outright, so converting them to cards first would be
        work thrown away.

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

- [ ] **CR3 — the adviser's class summary. NEXT.** Adviser-scoped, READ-ONLY:
      one learner per row, every subject's Term Grade across the row, the
      General Average at the end — the Summary of Grades an adviser compiles
      from the subject teachers' records. **Read-only is the whole point:** an
      adviser is not the encoder (encode scope is the subject teacher, and
      widening it would invent school policy — BLOCKED / RESOLVED). **No
      verdicts** (§4) and **no General Average row for Key Stage 1**
      (GRADING_SPEC §6a). Open: whether it needs a new endpoint or composes
      `GET /grades/student/:studentId` per learner — 40 requests says it
      probably does.

- [x] **Grading fixes — DONE 2026-09-22** (`fix/grading-rounding`): the
      whole-vs-two-decimal split (`docs/GRADING_SPEC.md` §4a, §3 here) and
      Grade 1's "Reading" → "Reading and Literacy" by a migration that
      UPDATEs. Write-up: `docs/ARCHIVE.md` → BUILD ORDER → Grading fixes.
      **CLOSED by DV2 the same way:** Parent → Attendance's percentage copy —
      the percentage itself is gone, so there was nothing left to overstate.

- [ ] **UI polish — small client items, opened 2026-09-20.** A list, not a
      dispatch: fold each into whichever branch is already touching that
      page. Ordered by cost to the user, not by effort.

  1. ~~Teacher → Grades opens on an unassigned subject and loads with a red
     error~~ — **CLOSED by CR2 (2026-09-22)**, at the root: the picker is
     built from the caller's own `GET /assignments` (§13a).
  2. **The person cell's secondary line repeats a column that is already on
     screen** — Admin → Users shows the email under the name AND in the
     Email column; both Students pages show the class under the name AND in
     Grade & section. Harmless but redundant at desktop width, where the
     column is right there. It earns its place on a CARD, where there are no
     columns, so the fix is per-surface rather than deleting it.
  3. **Teacher → Attendance at 390px: the Status select is narrow and partly
     off-screen** inside the horizontal scroller. **Moved to DV1b** — DV2
     turned out to own only the PARENT page, and this is a teacher encode
     screen whose row is a form control, which is a card of a different kind.
     Do not patch the select in isolation first.
  4. **Settings → Personalization at 200% zoom squeezes its content into a
     narrow column** beside the side tabs — one or two words a line. Found
     during the DV2 check (2026-09-20). The tabs keep their full width while
     the panel takes what is left, so the fix is in that layout's
     breakpoints, not in the panel's content.
  5. **Teacher → Excuse Letters says "Nothing waiting for review" when the
     Status filter is Approved** (2026-09-22). **A §5f violation, not a
     wording nit:** an empty state must be derived from the filter that
     produced it, and "nothing is waiting" must be structurally impossible
     outside the Pending filter. One branch per applied value.
  6. **The parent breakdown modal still prints raw scores as "46.00/50.00"**
     (2026-09-22, re-confirmed after CR2). **The grid did NOT take this** —
     the guess that it would was wrong: the grid has its own cell renderer and
     never imports `ScorePair`. Every stored score is a whole number now
     (CR0), so every one of them prints with two dead decimals on the one
     screen parents read. `ScorePair` in `parent/GradesPage.jsx` needs the
     same `String(Number(x))` treatment as `GradeValue`'s `whole` — **never a
     rounding one**, because a legacy row may still hold `42.5`.
- [ ] **Pre-Stage-5 server fixes**, one dispatch. **Four added by DV3
      (2026-09-21); the first two are what Expo hits first.**
      **(a) `subjects.display_order`** — the printed order is a client
      constant because the table has no ordering column, and Expo cannot
      import a constant (migration + `schema.sql` + `seed.sql` + `ORDER BY`
      in `routes/grades.js` and `routes/subjects.js`). **Grade 1's order is
      PROVISIONAL** — ask the school before seeding it as fact.
      **(b) `AuthContext` must tell a 401 from a network error or 5xx** —
      today any `/auth/me` failure clears the token, so a refresh during an
      outage discards a valid session; frequent on a school LAN.
      **(c) the school-calendar work (CAL)** — term dates, school-year range,
      a real `current_term`; nothing in the schema holds a term boundary,
      which is why Parent → Attendance derives its months from data. DV3 does
      not depend on it. **(d) a fixture learner who is nobody's test target**
      (KNOWN_ISSUES). **Four more added 2026-09-22: (e) ADVISER ENROLMENT** —
      advisers enrol learners and create parent accounts, so confirm the
      enrolment path matches that and not only the teacher-assignment one;
      **(f) School ID and email settings fields** — `routes/settings.js`
      allow-lists five keys, so 136893 and 136893@deped.gov.ph have nowhere to
      live (the keys, their validators, the seed, and the Admin → Settings
      inputs); **(g) an About page** for the DepEd Vision, Mission and Core
      Values the school adopts — a new route, a nav item and a page, none of
      which exist; **(h) the npm alias** `db:migrate:reading-and-literacy`,
      deferred twice now because `package.json` keeps falling outside a
      whitelist. Then the originals: `GET /api/attendance` where
      `date` silently drops `from`/`to`; a class filter on `GET /api/grades`;
      Admin → Users role sort in A–Z rather than ENUM order; email validation;
      `test:attendance`’s cleanup deleting every row on three dates rather than
      only its own; `GET /api/health` returning a static 200 with no DB check;
      and the shared helper that clears the orphan `notifications` rows the six
      older suites leave behind. Every one is a `docs/KNOWN_ISSUES.md` row.
      **Plus one INVESTIGATE item, new 2026-09-20 and not yet a known-issue
      row because the cause is unknown:** Teacher → Attendance logged
      `bulk_record_attendance` **twice, one second apart, for a single Save
      click** (seen during the 2026-09-21 banner check; Darryl confirms he
      clicked once). **Find the cause before fixing** — a double submit, an
      effect firing twice, or no `disabled` while saving are three different
      bugs with three different fixes, and guessing would paper over
      whichever one it is. The DATA is correct either way: `POST
      /api/attendance/bulk` is `ON DUPLICATE KEY UPDATE`, so the second call
      overwrote the first with the same values. **The audit trail is not
      correct**, and that is the actual defect — `activity_logs` is what the
      restore machinery counts and what a reviewer reads to reconstruct who
      did what.
      **Two more from DV1 (2026-09-20), both needing a server change the
      client cannot fake:** (a) **counts for the Admin → Users filter tabs**
      — `GET /api/users` returns `page.total` for the filters SENT, so four
      tabs would mean four requests fetched only to read a number; a
      `counts { all, teachers, parents, pending }` sibling computed by one
      grouped query is the fix, and the tabs stay unbuilt until it exists.
      (b) **"Linked to" on the same page** — `linked_student_name` (a
      `LEFT JOIN students` on `users.student_id`) and `advises[]` (a grouped
      subquery on `sections.adviser_id`, because a teacher may advise more
      than one). Neither is in the payload today, which is why the column
      was dropped from DV1.
- [ ] **Docs pass** — the README suite table, the `docs/API_REFERENCE.md` scope
      labels stale for every widened read, and the dead pointers recorded in
      KNOWN ISSUES.

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
1. Add today's changes to docs/CHANGELOG.md with the date (newest first)
2. Update CURRENT STATE in CLAUDE.md to match the actual code. Keep
   CLAUDE.md under 150k chars: a new narrative goes to docs/ARCHIVE.md
   (or docs/KNOWN_ISSUES.md / docs/RESTORE.md / docs/FRONTEND_CONVENTIONS.md
   when it belongs there) and CLAUDE.md gets the rule and the pointer.
   Never delete to make room.
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

## ADMIN SCOPE AUDIT — nav vs. DFD (2026-09-13). A finding, not a decision.

**Finding, 2026-09-13. Cite Figure 5, never Figure 4.** Four sources gave
four answers for which admin nav items have a basis in the approved design
(`nav.js` 13, the p. 70 mockup 5, Figure 5's 11 admin-facing processes,
`docs/SYSTEM_ARCHITECTURE.md` §4 lists 3 — **do not trust that heading**).
Figure 5 governs by precedent. With a Figure 5 process: Users (1.1, 1.3),
Students (1.23), Grades (1.9), Attendance (1.15, view), Announcements (1.18,
memos partial), Settings (1.25), Backup & Restore (1.27, 1.28). Without one:
Sections, Excuse Letters, Events, Messages. The API already authorizes admin
beyond Figure 5 in three places (excuse letters, messages, attendance writes)
— one pattern, not a defect. 1.10 / 1.12 "Academic Records" stay ambiguous
between Students and Grades.

**SCOPE DECISION, Darryl, 2026-09-13 (his decision, not a team consultation —
do not blur the two):** build the six with a Figure 5 process (all built
2026-09-14; Stage 4 complete); do not build Sections, Excuse Letters, Events,
Messages; memos live on Admin → Announcements (decided 2026-09-14), the only
place a memo can be written; the defence answer for the four is "no Figure 5
process"; **no handler moves.**

**SCOPE DECISION, Darryl, 2026-09-18 — the five page-less admin nav entries
are REMOVED, not dimmed** (Sections, Excuse Letters, Memos, Events,
Messages). Supersedes one line of 2026-09-13; that entry is not edited, so
the archived copy still carries the line it replaced. A permanently dimmed
row advertises a page that was decided against, and `built: false` is defined
as *unwritten*, never *refused* (§6). Nothing became buildable and no handler
moved. **Grade lock AND unlock are admin only** — `PATCH /api/grades/:id/lock`
is `authorize('admin')` and is the only route reaching the server's sole
`UPDATE grades SET is_locked`; direction is the request's `is_locked`
boolean and there is no separate unlock path. Written down so a later
dispatch does not add a teacher-side lock as a convenience.

Both decisions' full text, the nav-item table and the 2026-09-13 finding
paragraph are verbatim in `docs/ARCHIVE.md` → ADMIN SCOPE AUDIT (three
blocks: the original, the condensed 2026-09-19 section, and the 2026-09-18
decision moved out 2026-09-22).

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

School questions and engineering questions are different. A school
conversation does not answer an engineering row. **Do not trim them
the same way.**

### School questions — still open (three)

- **What order do the learning areas print in on a Grade 1 report card?**
  Asked 2026-09-21, because DV3 had to pick one. The SF9's eight
  intermediate rows are recorded for Grades 4–6 (`docs/GRADING_SPEC.md` §6c),
  but **no printed order exists anywhere for Key Stage 1**. The card uses
  Makabansa, Mathematics, GMRC, Language, Reading — which is the **class
  program**, a timetable, not the report card — marked provisional in
  `ReportCard.jsx`. Grades 2, 3 and 5 are in the same position and
  deliberately fall back to alphabetical rather than guess. A one-line answer
  from the school settles all four.

- **Who owns old attendance after a mid-year section transfer?**
  Still unanswered. PUT `/api/students/:id` refuses a class change
  (`400`). That is a gate, not a transfer. Attendance *rows* key on
  `student_id` (history would follow the child); *who may record*
  keys on `students.section_id`. Rewriting the FK without an answer
  would move that authority — the exact write the gate exists to
  refuse. Do not add a transfer endpoint until this is answered.

- **Are there Saturday or make-up classes?** Asked because the code
  already permits them and nobody decided that it should:
  `POST /api/attendance/bulk` has **no weekday validation**, so a
  Saturday is accepted, and two fixtures have recorded one. Parent →
  Attendance shows such a day in an "Also recorded" strip beneath the
  Mon–Fri grid and counts it (DV2, 2026-09-20). **If the school holds
  weekend classes, everything is already right.** If it does not, the
  answer is a server-side `400`, never a client filter — hiding a row
  the database holds would make the calendar disagree with its own
  totals. `docs/KNOWN_ISSUES.md` has the full row.

### School questions — answered

None of these is a written policy. **Do not cite them in the manuscript as
documented school policy, and do not re-ask them.** Full entries:
`docs/ARCHIVE.md` → OPEN QUESTIONS.

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

The bullets as they stood here until 2026-09-19 are verbatim in
`docs/ARCHIVE.md` → "OPEN QUESTIONS — answered bullets as they stood in
CLAUDE.md until 2026-09-19".

### Engineering, manuscript, and logistics

Not answered by a school conversation. Do not trim them alongside the school
questions.

- **Should `DataTable` get a sticky first COLUMN? DEFERRED to DV1b
  (2026-09-21) — and §5a-i does NOT close it.** That section closed the
  sticky HEADER on a structural conflict: it needs the page as its
  scrollport while containing a too-wide table needs the wrapper to be one.
  **A sticky column wants its `left` resolved against that same horizontal
  scroller**, the thing §5a-i kept, so the conflict does not arise; §9 is
  about vertical scroll and is unaffected. DV3 did not implement it — its
  container query means the table never renders in a container too narrow
  for it. DV1b inherits it for the other consumers. Cost to weigh: each
  sticky cell needs its own background repainted on hover and on the
  emphasised row, or scrolled content shows through.
- **Should the report card's header, info row and legend move to container
  units too?** DV3 converted only the crossover (§5a-vi), so those three
  still use viewport `sm:` inside a card that now measures itself. The
  re-check found no visible mismatch on a real window and called no action —
  recorded so the mixed basis is known rather than a later surprise.
- Adviser response to the 5 revision requests.
- Deployment for the demo: localhost or cloud (Railway + Vercel + Cloudinary)?
  Undecided; blocks the Figure 1 hardware requirements in the manuscript.
- `Manage Templates` (Figure 23) — undefined in the manuscript; likely the
  grade weight configuration display. Confirm or remove.
- `users.email` UNIQUE — not added, deliberately (sibling parent accounts
  share one guardian email; one account per student is locked). If email
  login is ever built, scope uniqueness to `role IN ('teacher', 'admin')` —
  never a plain table constraint across all roles.
- `activity_logs` appears nowhere in the manuscript. Document it as a
  security feature, or drop the table.
- **Parent demo — data:** real names and LRNs need the school's answer on
  consent (RA 10173 — see BEFORE THE PARENT DEMO). **Parent demo —
  logistics:** how many parents, when, is there a PTA meeting to join?
- **Should Teacher → Attendance warn before leaving with unsaved marks?**
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

- Write or edit file content only with the Write/Edit tools — never through
  `python -c`, `echo`, heredocs or any shell quoting (CLAUDE.md was once
  truncated to 0 bytes this way).
- **Never `git checkout --` (or any restore from HEAD) on uncommitted work.**
  It restores from the last COMMIT, not from where you were, so every
  uncommitted change in that file is gone with no warning. **Before a
  negative control, copy the file** (`cp x x.bak`) and put it back from the
  copy. `DataTable.jsx` lost a whole dispatch's edits this way on
  2026-09-20 and had to be rebuilt from scratch.
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
- **After any merge to `main`, report `git log --oneline -1` and confirm
  that commit is the one this dispatch produced.** `git status` being
  clean does not prove the work landed. Teacher → Contributions (2026-09-08)
  was written, browser-verified, and reported ready to commit; it was
  never committed. The next dispatch needed a clean tree, so the work was
  stashed, admin-prerequisites merged, and the stash was never reapplied.
  Both then believed the Teacher role was complete for two dispatches.
  A stash is how finished work becomes invisible. This is the second time
  state has gone missing between dispatches — the first was leftover DB
  state from a crashed test run. A stash left from a finished page is
  not a WIP parking lot; check it the same way.
- **A dispatch that changes a WRITE path runs every suite that WRITES
  through it — not only the suite named after the file it edited, and not
  only the suites that READ what it writes.** Find them with
  `grep -n "'/api/<path>'" server/scripts/test-*.js` (plus any
  `INSERT INTO <table>` the change depends on). `test:grades` was broken
  2026-09-10 → 2026-09-13 because the POST /students change (d47589b) ran
  `test:students` only, and the next students change (a068d8a) ran the
  three suites that READ `section_id` — attendance, excuses, students —
  but not grades, which WRITES a student through POST. Read versus write is
  the gap.

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

**Deliberately NOT installed:** `grill-me`, `grill-with-docs`, `to-spec`,
`to-tickets`, `implement`, `wayfinder`, `triage`,
`improve-codebase-architecture` and the remaining ~26 — **do not install more
of them without a specific reason.** A future session finding only three
skills present is looking at a decision, not an oversight.

### No CONTEXT.md — deliberate

`diagnosing-bugs/SKILL.md` and `tdd/SKILL.md` both say "read `CONTEXT.md` (if it
exists)". **This repo has no `CONTEXT.md` and should not get one.** This file is
the context document. `docs/agents/domain.md` redirects those skills here, so
they read the real source of truth instead of nothing.

Why these two skills, the setup answers (issue tracker, triage labels, domain
docs) and the reasoning behind both do-nots: `docs/ARCHIVE.md` → AGENT
SKILLS.

---

## UPDATING THIS FILE

See **End of Every Session** above for the exact prompt to paste.

List **endpoints, not percentages.** A percentage is an opinion; an endpoint
is a fact. `PROJECT_PROGRESS.md` drifted because it listed planned modules as
progress — do not let this file do the same.

---

## CHANGELOG

**The full table lives in `docs/CHANGELOG.md` — add new rows there, newest
first, in the same format.** Dated entries record what was true on their date
and are never back-edited; they are exempt from the one-number-one-place rule.
Each row carries its dispatch's whitelist, suite counts, verification and
measured build time — the level of detail this file no longer holds.

Most recent, one line each (the full row is in `docs/CHANGELOG.md`):

| Date | Change |
|------|--------|
| 2026-09-22 | Class record CR0–CR2 **docs pass** (`docs/class-record`): API_REFERENCE gains the two endpoints — slot addressing by `slot_id` **or** `type` + `slot_no`, `dry_run`, `group_hps`, `can_encode`, **locked is `409` and all-or-nothing**; **route order is load-bearing** (both registered before `GET /:id`). GRADING_SPEC **§6e** — **USED is the HPS, not the row**, and a used slot with no score makes that learner's group **Pending, never left out and never zero** (leaving it out silently RAISED an absent learner's grade). FRONTEND_CONVENTIONS **§13** — Teacher → Grades IS the grid, the client never computes a grade, the **sticky learner COLUMN** as DV1b's precedent, the pure `buildPayload.js`, and **a failed build can run the PREVIOUS bundle**. Counts recounted: **23 tables, 87 handlers / 88 endpoints**, oxlint **41**. **Every suite re-run — EIGHT baselines were stale** (students 94, grades 239, attendance 60, content 96, users 61, backups 47, messages 80, excuses 92); `test:class-record` **117**. Three KNOWN_ISSUES rows (**Back button escapes the unsaved guard**; `test:restore`'s `iat` failure — **fix the test, not the comparison**; `test:recovery` needs `MAIL_TRANSPORT=file` **on the server**), decimal-scores row CLOSED. REFILL RULE applied to three closed items. **Item 6 corrected: the guess that the grid would take the `ScorePair` fix was wrong.** |
| 2026-09-22 | CLAUDE.md trim, fifth batch: **135,967 → 134,080 on disk (−1,887)** — the blocks gave up 3,112 and this row costs about 1,200 of it back. Candidates 5, 6 and 7 — ~11,708 bytes offered, **the live-rule guard released about a quarter**. **§11 and §12 barely moved, and the reason is new: `docs/FRONTEND_CONVENTIONS.md` STOPS AT §10**, so this file is their only present-tense home and all eleven rules stayed; §12's per-card isolation, no-red, fraction-only, check-the-handler and recent-activity rules returned **zero** hits anywhere. The two attendance BLOCKED / RESOLVED subsections **left permanently under the REFILL RULE** (fully covered — GRADING_SPEC, ARCHIVE 512/2142/2638, and "Late counts as present" was **already in this file at line 1902**). The 2026-09-18 admin SCOPE DECISION had **no archived home** and moved out verbatim; **`Grade lock AND unlock are admin only` had zero hits** and stays word for word. **One STALE CLAIM corrected:** Parent → Attendance was still described as showing a percentage — **DV2 deleted it on 2026-09-20**. Trim-6 candidate found and left alone: `### Corrections` is duplicated in this file and `docs/FRONTEND_CONVENTIONS.md`, with no pointer. |
| 2026-09-22 | Grade 1 docs: GRADING_SPEC §6a **DECIDED → BUILT**, its five predictions replaced by what each resolved to, plus a rounding note that is **not Grade 1-specific** (weighted parts round to 2 decimals before summing, so 89.99 → **90.00 → A** at every grade level). API_REFERENCE: `/descriptive` struck through as RETIRED, Grade 1 score writes documented, `initial_grade` on every report-card term **with the rule a parent client must not render it**, `final_grade` is **two types by mode**; counts **recounted from the code — 85 handlers / 86 endpoints**, the first endpoint removal since Contributions'. FRONTEND_CONVENTIONS §5a-v gains the **two-flags rule** and the render-time guard; §5h gains a fifth defect and the finding that **SSR cannot catch an undefined identifier inside an effect or callback body** (measured, 32/32 with the bug in place). The closed Grade 1 BLOCKED item **left to ARCHIVE under the REFILL RULE**. Suite preamble corrected **"fifteen/fourteen" → nineteen scripts / seventeen HTTP**. Class-record grid promoted to NEXT with **WHOLE NUMBERS ONLY — the server must refuse decimals at all four score writes**. Two KNOWN_ISSUES rows. |
| 2026-09-22 | Grade 1 computed letters, **client** (`05a9a68` → `39821dd`): the letter picker deleted, Grade 1 encodes like Grades 2-6 (Summative, not Examinations), a **Final letter** column and 390px segment, `showFinal`/`showGeneralAverage` split in two, the modal's legacy-row copy corrected. SSR 29/29 with a **renderer guard** proving no Initial Grade reaches a parent. **Browser check FAILED first pass — blank page for every teacher**, a call to a deleted setter that build, oxlint AND an SSR render all miss; **`no-undef` enabled** as the guard that works (needs `env.browser` + `scripts/**` `env.node`, then 0 findings and oxlint stays 44). Fixtures on Nino's EMPTY subjects only, whole-number scores; cleanup asserted every count and left the Seeded baseline exact. |
| 2026-09-22 | Grade 1 computed letters, **server** (`4f362aa`): one shared `BANDS` table so the letter and descriptor ladders cannot drift (verified at every score 0-100); `preflightGradeWrite` returns the mode it read; `recomputeGrade` bands the RAW Initial Grade and **throws** if the dual-mode invariant breaks; **`PATCH /:id/descriptive` RETIRED**; a Final letter from the three terms' Initial Grades, null for legacy rows; weights seeded for **every** grade level + a migration that aborts rather than overwrite. `test:grades` 197 → **212**, grade-computation 51 → **68**, verify-seed 33 → **34**. Two weak assertions of my own caught by failures — `DECIMAL(5,2)` stored 44.995 as 45.00, and a numeric STRING must band, since mysql2 returns every DECIMAL as one. |
| 2026-09-22 | CLAUDE.md trim, fourth batch: **135,687 → 130,947 on disk**. Four blocks COMPRESSED, none moved — the detail already lived in ARCHIVE, API_REFERENCE, RESTORE and FRONTEND_CONVENTIONS, proved by 18 greps first. **The ~124,000 target was NOT reached, and the live-rule guard is why:** the blocks held 38 keyword hits and **37 were rules with no other home here**, so they stayed verbatim and only the prose went. **Two STALE CLAIMS corrected rather than trimmed around** — the Grade 1 letter was still called "a MANUAL teacher judgment — an ASSUMPTION" and still listed as an open school question, both superseded by GRADING_SPEC §6a; open school questions four → three. New **REFILL RULE**: a completed stage or closed BLOCKED item leaves this file permanently in the dispatch that closes it. |
| 2026-09-22 | Grading docs: GRADING_SPEC gains **§4a (rounding)** and **§6a (the Grade 1 letter — DECIDED, NOT BUILT)**; its line-70 `G1–3: 30/50/20` is labelled **DISCARDED**, not the Grade 1 rule. API_REFERENCE gains the whole-vs-2-decimal contract; §3 gains `whole`. **Three KNOWN_ISSUES rows** — 14 backups carry the old `Reading` name; term grades go 2-decimal from SY 2027-2028; **the mid-year transfer attendance scope is INVERTED against the school's rule**, unreachable only because of a `400`. School facts in the front matter (**3506114 is the PHONE, not the School ID**). BUILD ORDER: grading fix ticked, Grade 1 letters and the class-record grid queued ahead of DV4, pre-Stage-5 gains four. Baselines 197 / 56 / 33. |
| 2026-09-22 | Grading fixes (`fix/grading-rounding`): **a Final Grade is a WHOLE number** (`roundToWhole`) — the card printed 89.33 where the school prints 89 — while the **General Average keeps two decimals over the rounded finals** (721/8 = 90.13). Display split at the CALL SITE, since one `toFixed(2)` served four kinds of value: `GradeValue` gained `whole`, set once in `TermValue`. **`String(Number(x))`, never `toFixed(0)`** — a stored 89.5 must not show as 90. **"Reading" → "Reading and Literacy"** by a migration that UPDATEs, because a delete would cascade Nino's letters away. `test:grades` 189 → **197**; the negative control caught **two weak assertions of my own**. |
| 2026-09-22 | CLAUDE.md trim, third batch: **141,099 → 128,050 bytes on disk.** Twelve CHANGELOG stubs, BUILD ORDER Stages 1–2, the AGENT SKILLS rationale and two Feature 7 narrative paragraphs moved verbatim to `docs/ARCHIVE.md`; Stage 4's 22 checkboxes, Stage 3 and the completed After-Stage-4 bullets compressed to ticked lists plus pointers. **Every moved block was grepped for a live rule first** — four Stage 4 page rules stated nowhere else were kept here, and §1 gained the DV3 lesson (**unwrap protects a RENAMED key, never a FORGOTTEN one**), which had lived only in a stub. **The Notifications N1 dispatch has no `docs/CHANGELOG.md` row of its own**, so its stub is its only record and was moved rather than dropped. New standing size rule at the top: report the delta every dispatch, justify over 2,000 bytes, trim at 138,000, never start above 142,000. |

Older stub lines are verbatim in `docs/ARCHIVE.md`, in four dated batches —
14 (2026-09-14 → 2026-09-18) under "CHANGELOG stubs moved from CLAUDE.md on
2026-09-19", 14 more under the "second batch, N3" heading below it, **12
(2026-09-19 → 2026-09-20) under "third batch, the DV3 trim"**, and **5
(2026-09-20 → 2026-09-21) under "fourth batch, the Grade 1 docs dispatch"**
(both 2026-09-22). **Every full row is in `docs/CHANGELOG.md` with one
exception: the Notifications N1 server dispatch has no row there**, so its
stub in the third batch is the only surviving summary. This table holds only
the newest one-line summaries, and a stub is moved out when this file
approaches its size limit, never deleted.
