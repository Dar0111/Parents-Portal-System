> This file is maintained by Claude Code and Cursor. It describes the ACTUAL
> state of the code, not the plan. If this file and the code disagree, the
> code is correct and this file must be fixed.

# Parent's Portal System

Capstone project for **Captain H. Francisco Elementary School – Main**
(Grades 1–6), P. Rosales St., Sta. Ana, Pateros, Metro Manila.

**The school's own details, confirmed 2026-09-22 — this is the one place they
live.** All six are `system_settings` rows, updated through Admin → Settings
and read by the About page (`docs/FRONTEND_CONVENTIONS.md` §23): the name and
address, **DepEd School ID 136893**, **136893@deped.gov.ph**, the phone and
the Facebook page. **Phone (02) 8350-6114 — that is a PHONE number and NOT
the School ID**; the mistake was made once and corrected. **A settings value
that renders on a page gets a smoke before merge** (the Facebook URL clipped
`/about` at 390px).

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
> different things: **`docs/API_REFERENCE.md` counts 91** handlers defined in
> `server/routes/`, and the API answers **92 endpoints** because
> `GET /api/health` is mounted directly in `server.js`. State which you mean.
> Both +2 on 2026-09-29 (the `verify-contact` pair); +1 on 2026-09-26.
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
| `docs/TESTING.md` | every suite, proof and lint baseline; the one suite whose clean run is not a clean number; and **the read-only browser smoke run** — **a re-measured figure is updated there, in the same commit** | yes |
| `docs/FRONTEND_CONVENTIONS.md` | the full text of STAGE 4 FRONTEND CONVENTIONS §1–§10 and §13–§24 (§11 and §12 live here), with the reasoning, the worked examples and the browser-found defects behind each | frozen rules |
| `docs/RESTORE.md` | the full RESTORE design record — the text `server/routes/backups.js` and `test-restore-flows.js` mean by "CLAUDE.md's RESTORE section" | reference |
| `docs/ARCHIVE.md` | verbatim narratives moved out of this file, in original order: per-file notes, the sections-table and Class Board investigations, the React web app history, MEASURED BUILD TIME, the Grades stage history, NOW POSSIBLE, the contacts design, BUILD ORDER write-ups, the admin scope audit, OPEN QUESTIONS history | history |
| `docs/MOBILE_CONVENTIONS.md` | the full text of STAGE 5 MOBILE CONVENTIONS — only where the phone DIFFERS from the web, and why; frozen per section as each Stage 5 branch lands (since 2026-09-27) | frozen rules |

`docs/API_REFERENCE.md` (request/response detail), `docs/GRADING_SPEC.md`
(DepEd policy) and `docs/PROJECT_PROGRESS.md` (a state-only snapshot since
2026-09-26; its history is in ARCHIVE) predate the split.

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
nav is 9 items, all built** — Sections, Excuse Letters, Memos, Events and
Messages were **removed** on 2026-09-18 rather than left `built: false`, by
the scope decision under ADMIN SCOPE AUDIT, and **About is last on every
role since 2026-09-26** (9 / 13 / 10); **no role has a `built: false`
item**. **23 tables, 91 handlers + `/api/health`**
(2026-09-29). 20 of 23 sections have no adviser and
no screen can assign one — see KNOWN ISSUES.)

### Seeded baseline

**This is the one place these counts live.** Present-tense claims elsewhere
point here; they do not repeat the figures. Dated CHANGELOG entries are
exempt — they record what was true on their date.

After a clean `npm run db:setup`:

| Table / fact | Count |
|---|---|
| `users` | 8 — ADMIN001, TCH-001, TCH-002 (adviser-only), TCH-003 (Grade 1 - Mabait, all five subjects), parent 13567454 (active, Marwin), parent 1234567 (pending, Jea), parent 1090001 (active, Nino), and **Ligaya Halimbawa** (active, Tala's parent — since 2026-09-25) |
| `students` | 4 — Marwin Conde G6 Malikhain, Jea Mae Bargaso G5 Masigasig, Nino Alcantara G1 Mabait, and **Tala Halimbawa G6 Malikhain — the browser-fixture learner, nobody's test target** (pre-Stage-5 #3b, 2026-09-25): every suite stays on Marwin, every browser fixture goes on Tala, so the two protocols no longer exclude each other. On a live database she arrives by `npm run db:migrate:fixture-learner`, not `db:setup` |
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

**The two counts live in the front matter above — one place, not two;
state which you mean.**
`PATCH /grades/:id/descriptive` is still the only endpoint ever removed
besides Contributions' eight.

**A scope change removes future authority, never past records.** Three places,
one principle: deleting a `teacher_assignments` row does not touch `grades`
(no FK, and mid-year reassignment **must not** wipe SF9 data); message history
stays readable after `canMessage()` would refuse a new send; and the
subjects-reseed CASCADE is the **opposite** case — destroying `subjects.id`
wiped assignments *and* grades. **Do not add a grades-exist guard on
`DELETE /api/assignments/:id`.**

**Tests — every baseline lives in `docs/TESTING.md`**: each suite's figure,
the four lint baselines, and **the one suite whose clean run is not a clean
number** (`test:recovery` without `MAIL_TRANSPORT=file SMS_TRANSPORT=file` on the SERVER;
`test:restore` is 29/29 since #3a). **A dispatch that re-measures a baseline updates it THERE, in
the same commit** — a figure corrected in a report and nowhere else is how
eight counts went stale at once. **The Seeded baseline above is DATA and
stays here**; it is what the suites assert against, not a count of them.
**The read-only browser smoke run is there too** (`npm run smoke`, five
roles × two themes × two widths) — including why it writes one login row
per TEST and why it must never run during a server suite.

### Files that exist

Purpose per file, the long narratives and the one rule each carries moved to
`docs/ARCHIVE.md` on 2026-09-19 ("Moved from CLAUDE.md … section trim");
the per-file *narratives* were already there under CURRENT STATE → Files
that exist. **Shape:** `server/` is `routes/` (one file per module) +
`utils/` (shared helpers) + `middleware/auth.js` + `config/db.js` +
`scripts/` (setup, **eight migrations**, `verify-grading-seed`, `probe-sms-gateway`, the twenty-four test files); `database/`
is `schema.sql` + `seed.sql`; `client/src/` is under React web app below.
**`mobile/` (since 2026-09-27, Stage 5)** is its own Expo SDK 57 package:
`src/api/` + `src/auth/` + `src/navigation/` + `src/screens/` +
`src/components/` + `src/format/` (copies) + `src/theme/` (generated tokens)
+ `scripts/` (three checks, fourteen proofs) — STAGE 5 MOBILE CONVENTIONS below.

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

**The Expo app has every role's screens** (Backup & Restore stays web
only). Stage 5 adds no endpoint.

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
- **A database outage is `503`, never `401` (fix/auth-503, 2026-09-26).**
  `middleware/auth.js` verifies the token in one try (401) and reads the
  database in another (`503`, the health body, via
  `utils/dbUnavailable.js`); `/me` likewise on a connection-level error.
  The client keeps the token on anything but 401 (§22). Proved by
  `test:auth-middleware` on a stubbed pool.
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
  wrapping breaks at spaces **and hyphens** — a backup filename broke after
  `2026-09-` at 1280 — so an identifier or a value that must read as one sets
  `nowrap`. Header cells are always `nowrap`. Detail: §5a-ii.
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
- **TWO pages leave DataTable and both exemptions are narrow.**
  `parent/ReportCard.jsx` is a **fixed-order printed document** — sorting it
  produces a different document, not a filtered one — and its emphasised
  general-average row must sit INSIDE a table that does not sort.
  `teacher/AttendancePage.jsx` is a **bespoke card list below `sm`** whose row
  is four buttons where a card allows one (DV1b-b, §17c).
  **Anything that is a list of records still uses `DataTable`.**
  **"Has a Final" and "has a General Average" are TWO
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
  `Shell` revealed its 240px sidebar at that same `sm` and **crossing 640px cut
  a page body from 607px to 351px** (since 2026-09-30 it appears at `md`, 240px
  or a 64px rail — §9). **A browser check must measure the CARD,
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

A sentence of warning text is not a confirmation step. **The two bulk-submit
pages guard unsaved work** — Teacher → Grades' class record (§13d) and, since
2026-09-30, Teacher → Attendance (§17c) — only while something is unsaved;
never a blanket `beforeunload`.

### 5f. Empty-state copy is derived from the filter state, never from a flag

One branch per cause, keyed on the actual applied values. A Reset action
appears only when resetting would change the result. "Nothing is waiting"
must be structurally impossible outside its own filter. Whether the form
differs from its default is its own value (`canReset`), never reused as the
copy flag — that conflation produced wrong copy twice. The branch count
differs per endpoint (Events three, Announcements two, Memos one, Admin →
Attendance five, Teacher → Attendance records three since #6) and that is a
finding, not an inconsistency. **An empty
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
`scripts/**` `env.node`, or it reports 52 globals and no real bugs; with those
it reports 0 and leaves the oxlint total alone (`docs/TESTING.md`).
**Run lint AFTER the last file of the dispatch is written and say WHEN it
ran** — §17a. Where a browser is unavailable, an SSR render via `renderToStaticMarkup` **with a
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
dispatch**, next to oxlint's. `page`/`surface-subtle` and
`primary`/`bubble-mine` share a light value on purpose — do not merge them.
**Dark (2026-09-19):** the same variables under `[data-theme="dark"]` — the
block is the theme, no page changed for it. Light / Dark / System live in
Settings → Personalization, stored on the device (`pp.theme`, default Light),
applied by `pages/settings/theme.js` and by an inline script in `index.html`
before the bundle (keep the two in step by hand); `initTheme()` in `main.jsx`
keeps System live. **`npm run lint:contrast` must report 0 unwaived** on every
client dispatch, next to `lint:tokens` and oxlint (all four baselines:
`docs/TESTING.md`); a failing pair is waived
only by an allow-list entry whose marker sits on a KNOWN ISSUES row. Full
text, the proof method, the six accepted light-mode changes (E1–E6) and the
dark values: `docs/FRONTEND_CONVENTIONS.md` §8.

### 9. Shell chrome is sticky, and the seal is always on its white disc

**Frozen 2026-09-19 (D3).** `layout/Header.jsx` is `sticky top-0 z-30`; the
sidebar is `sticky top-0 h-screen self-start` with its nav box
`min-h-0 flex-1 overflow-y-auto`. **The document is the only scroller** —
one scrollbar, no layout shift. **Do not add a second scroll container to
`<main>`.** z-order: header 30, mobile drawer 40, the notification panel 40
(closed when the drawer opens), rail tooltip 45 (on `<body>`), Modal backdrop 50. **Since 2026-09-30:** a
drawer below `md`, above it 240px or a 64px rail, grouped by the web-only
`layout/navGroups.js`; the user card holds the ONE Logout and **never a
parent's login id** (§5c); `<main>` has no width cap.

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
  re-checks visibility against live rows. **Deleting an item deletes its
  notifications in the same transaction and signals their recipients**
  (2026-09-30). Adding a page for something
  currently excluded means changing BOTH places; flipping a nav flag will
  not do it. **A call to act SELF-HEALS**: a pending parent once decided, an
  adviser's `excuse_submitted` once the letter is no longer Pending — the
  row stays, unread — and a review also signals the REVIEWER to refetch.

### 11. Account recovery — what may be said, and what revokes a session

**Frozen 2026-09-19 (R1 server, R2 client).** Four rules. **This file is the
only present-tense home for §11 and §12 — `docs/FRONTEND_CONVENTIONS.md`
has neither; it resumes at §13.** The reasoning and the endpoint detail are
`docs/API_REFERENCE.md` → Auth (the trimmed clauses are verbatim in
`docs/ARCHIVE.md`); the dump exclusion is in `docs/RESTORE.md`.

- **`POST /api/auth/forgot-password` answers the same sentence, always** —
  verified, unverified, inactive, unknown `login_id`, rate-limited, internal
  failure: one `202`, one message. A parent's `login_id` IS their child's LRN
  (§5c), so anything else is an LRN oracle. **Since SMS (2026-09-29) one code
  goes to EVERY confirmed channel, and the sentence names no channel and shows
  no masked number** — either would be the same oracle. **The client advances its step on
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
  refetches that card alone. `allSettled` INSIDE one card is fine. **The
  whole card is its link; no "Open →"** (§15e).
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

**The PARENT dashboard adds four rules (DV4, 2026-09-23). Reasoning and the
worked failures: `docs/FRONTEND_CONVENTIONS.md` §15.**

- **One term, and it is today's term from the school calendar
  (`format/schoolCalendar.js`, since #7) — never "the latest term that has
  data."** One screen showing two terms is worse than showing none.
- **Key Stage 1 lists EVERY subject with Pending; the numerical card lists
  only what is recorded** — that card's caption already says "N of M", and
  KS1 has none because §12 refuses one.
- **The weekly strip has THREE states** — recorded · weekend · **not
  recorded** — told apart by **shape, glyph and accessible name, never colour
  alone**; "not recorded" must never read as absent, and **a legend separator
  is never one of the glyphs it separates.**
- **`Stat` must not format** — it also renders counts. A grade-bearing value
  passes `GradeValue` in, at the call site.
- **The word beside the term average is the server's** (2026-09-25):
  `term_average_descriptors[current_term].descriptor`, flattened in
  `heroGrades` — **`.descriptor` only, never the object, never `remarks`**.
  The caption is `Term N` alone when it is null.

**`GradeValue` hardcodes `text-fg`; on a coloured surface pass `className`,
and it wins only by stylesheet ORDER** — §3a.

**Recent activity is deliberately absent from the admin dashboard.** There
is no read endpoint for `activity_logs`, and building one needs a redaction
rule for free text written by twenty-odd call sites. It belongs to a future
Admin Activity Log page. Do not fake it from another source.

### Corrections — three claims retired here

Circulated in planning, **wrong**, recorded so they cannot be re-derived:
*"the first screen builds the shared components"* and its ~5h estimate; *"backend
is 100% complete"*; *"36 screens"* and the ~13-day estimate derived from it.
**All three estimates are void and are not replaced with a guess.** Say what
the endpoints table says — **endpoints, not percentages** (UPDATING THIS FILE).
The real screen figure is stated once, in BUILD ORDER → Stage 4. Full text and
the counting rule: `docs/FRONTEND_CONVENTIONS.md` → Corrections.

### MEASURED BUILD TIME — data points, not a rate

Every dispatch since Teacher → Attendance has a dated data point, and none of
them is a rate: each is agent execution time, not developer-hours; excludes
planning and review; and everything before the sixth point was measured
without §5h's render proof inside the clock, so the first five are not
comparable to anything after. **Do not derive a projection from them.** The
tables and caveats are verbatim in `docs/ARCHIVE.md` → MEASURED BUILD TIME;
each dispatch's number is also on its CHANGELOG row.

---

## STAGE 5 MOBILE CONVENTIONS — M1–M8 frozen 2026-09-27; M9–M12 parent, M13–M15 teacher, M16–M18 admin

The phone inherits every STAGE 4 rule; this section states only where it
differs and why. Rule statements here, reasoning and mechanism in
`docs/MOBILE_CONVENTIONS.md` (M1–M8 below; **M9 the shell and the pure route
map, M10 the socket on a phone, M11 lists without DataTable, M12 writes and
cleanup, M13 Grades one slot at a time, M14 the roster and where
`beforeRemove` can fire, M15 the teacher's lists, M16 the admin shell and
`popTo` back to the drawer, M17 sensitive actions and the shown-once
password, M18 the admin's lists — stated only there**). Darryl's decisions of 2026-09-27
that fix them: Expo SDK 57 in Expo Go; in-app notifications via Socket.io
only; text size dropped for the OS scale; notifications as a screen; FA 7
SVG icons; React Navigation drawer; the seal as icon and splash; a
15 000 ms axios timeout; `beforeRemove` on Teacher → Attendance.

- **`mobile/` is its own package and imports nothing from `client/` or
  `server/`.** A module the web owns is COPIED byte for byte and
  `npm run lint:mirrors` proves each copy equal; a divergence is a new file,
  never an edit to a mirror. Renderers (`grade.jsx`, `TermValue.jsx`) are
  rewritten over the copied logic. (M1)
- **Tokens are GENERATED from `client/src/index.css`** — `npm run
  lint:tokens` regenerates `src/theme/tokens.js` and `global.css` in memory
  and fails on any difference; `npm run tokens:write` refreshes them. RN
  reads no `oklch()`, so the values are converted (OKLab reference, probed
  against seven Tailwind hexes). `tailwind.config.js` REPLACES the palette:
  `bg-slate-500` does not compile. `npm run lint:colors` also refuses a hex /
  rgb / hsl literal outside `tokens.js`. (M2)
- **The theme is NativeWind's colour scheme**, key `pp.theme` in
  AsyncStorage, **Light by default**, System live only while stored. **Text
  size is a declared deviation: dropped for the OS font scale.** (M3)
- **Auth parity is §22 with three named differences**: the token in
  expo-secure-store behind an injected provider (`api/client.js` imports
  nothing native, so a proof can load it); a 401 clears the store and
  signals `AuthContext`, the reason in memory, never a navigation param; a
  15 s timeout, filed as "keep the token". The root navigator IS
  `ProtectedRoute`: an unmounted `Stack.Screen` cannot be reached. **The
  native splash is released when the theme is ready, never held for
  `/auth/me`** — held, a stuck request leaves the phone on Expo Go's overlay
  with no way out; our own spinner covers the read. (M4)
- **The network proof order is fixed:** phone Chrome reaches
  `/api/health` with `"db":"ok"` before `npx expo start`.
  `EXPO_PUBLIC_API_URL` is inlined at bundle time (restart Metro to change
  it). **What opened 5000 and 8081 is the program rule for `node.exe`, not
  a port rule.** (M5)
- **Dev-only code is excluded at Metro's resolver (`context.dev`), never by
  `__DEV__`** — a `__DEV__ ?` JSX branch left its strings in the first
  production bundle (measured), and a static import keeps a module in the
  graph whatever any branch says; what the toolchain folds is not a rule to
  build on. `src/screens/dev/` is an empty module in production and is
  grepped absent, with a positive control, before each mobile commit.
  (M5, TESTING → Mobile proofs)
- **The template's `CLAUDE.md`, `AGENTS.md` and `.claude/` do not survive
  the scaffold** — a nested instruction file is a second source of truth.
  (M6)
- **There is no render proof on mobile; every screen is proved on the
  phone**, both themes, every field typed, the error path seen once, and a
  check that writes cleans up by id, backup first. **Reload by cold boot
  (force-close, reopen), never by `r` in Metro** — it stuck twice on the
  hotspot and a result read off it is not a result. Four lint figures per
  dispatch: oxlint, mirrors, tokens, colors. (M7)
- **Icons are the web's `fa-*` names resolved by `src/icons.js`; an
  unmapped name throws in DEV.** (M8)

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

**The class summary is BUILT (CR3a + CR3, 2026-09-22/23)** — the grades track
is complete. `GET /api/grades/class-summary`, `subjects.display_order`, and
Teacher → Class summary with a read-only drill-through to `ReportCard`.
**Four rules stated nowhere else here:**

- **Grades READ scope is assigned-OR-adviser; ENCODE is unchanged.** The
  adviser of a section could not read one grade in it until CR3 — TCH-002 is
  that account. **Widening encode to advisers would invent school policy.**
- **`TEACHER_ADVISES_CLASS_SQL` sits beside `TEACHER_VIEW_SCOPE_SQL` in
  `utils/teacherScope.js` and THE TWO MOVE TOGETHER.** Two forms of one rule:
  the original needs a `students` row, the new one a class key. **Routing the
  grades callers through `students` would make an EMPTY class invisible to an
  assigned teacher** — that is why both exist.
- **The printed order is `subjects.display_order`, not a client constant.**
  Every reader sorts `display_order IS NULL, display_order, name` (null-last —
  MySQL sorts NULL first). **Every grade level carries an order since
  2026-09-26** (all six confirmed by the school on 2026-09-23); nothing
  falls back to `name ASC`, and the leading `IS NULL` term stays for the
  idiom.
- **A descriptive letter is NOT a `GradeValue`.** Cells go through
  `format/TermValue.jsx`, or `Number('A') → NaN → null` renders every Grade 1
  letter as "— N/A". **An unrecorded letter is Pending, not N/A.**

Full contract: `docs/API_REFERENCE.md` → The class summary. The page:
`docs/FRONTEND_CONVENTIONS.md` **§14**. The order: `docs/GRADING_SPEC.md`
**§6d-i**.

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
  matching `gradeComputation.js`, and **the school confirmed on 2026-09-23
  that it DOES award bonus points** (event participation), added to PT. The
  behaviour was already right; what changes is that copy may now say so.
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

### Excuse Letters — both blockers RESOLVED and BUILT; moved out 2026-09-22

**Approval is record-only: the learner stays `Absent` and approval MUST NOT
modify `attendance` rows** — enforced, not just documented (`PATCH /:id/review`
writes `status`, `teacher_remarks`, `reviewed_by` and names no `attendance`
query). **Review authority is the class adviser only**, via
`sections.adviser_id`, and is narrower than the read scope (any assigned
teacher) — which is why a non-adviser gets `403` naming the reason, not `404`.
Both narratives are verbatim in `docs/ARCHIVE.md` → BLOCKED / RESOLVED →
Excuse Letters.

**The decline-reason nudge is BUILT; "never built" was stale and was removed
2026-09-23 after checking the code.** The review form's Remarks `hint` says
*"Optional — but a declined letter with no reason sends the parent to Messages
to ask why."* — the prompt and the exact reasoning the item asked for.
Optional remarks stay deliberate at the API layer. **Do not add a
confirmation step**: §5e reserves those for writes that cannot be undone.

**The Stage G1a schema fix also left this file** (`grade_weight_configs`
re-keyed off grade bands, `grade_components.type` → `ENUM('WW','PT')`). Live
text: `docs/GRADING_SPEC.md` → "Known schema defect — FIXED in Stage G1a",
which carries the warning this file's copy lacked — **the discarded
`G1–3: 30/50/20` band scheme is NOT the Grade 1 rule**, despite the numbers
coinciding with §6a.

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
| **`academic_year` is locked on Admin → Settings — on that page only. Deliberate; do not "fix" it** | `settings/SchoolSettingsSection.jsx` (lock) + `routes/settings.js` (still writable) | Sections, mode configs, weights and the transmutation table are keyed on `school_year`; changing the setting moves none of them and four handlers 409. Starting a new school year is a process, not a field. Say "not editable from this page" |
| **20 of 23 sections have no adviser and no screen can assign one** — attendance can never be recorded in them through the UI | `sections.adviser_id` + the Figure 5 scope decision | `PATCH /api/sections/:id/adviser` exists; Admin → Sections will not be built. Admin → Attendance names it: "Grade X - Name has no adviser…". No fix proposed — reversing the decision needs a date and a name |
| **`DELETE /api/grades/:id` is deliberately NOT surfaced on Admin → Grades. Do not add a Delete button as an "obvious" omission** | `admin/GradesPage.jsx` + `routes/grades.js` | Darryl, 2026-09-14: the lock, not delete. Irreversible, reaches the SF9, no need named — a wrong grade is EDITED by the teacher |
| **Ten `.sql` files on disk have no `backups` row and cannot be restored through the API** | `server/backups/` + Admin → Backup & Restore | Rows went with the 2026-09-07 `db:setup`. Listed read-only under "Files with no record", no adopt affordance. Do not delete them; recovery is by hand (the 2026-08-29 adoption method) |
| **Safety copies (`pre_restore_*`) have no Delete in the UI — one accumulates per restore** | `admin/BackupsPage.jsx` | Deleting one removes the only undo for the restore that made it. Revisit trigger: a retention rule from the school, or disk space. Deleting one today is a direct API call |
| **The restore's lost-entries count undercounts by the source backup's own `create_backup` row** | `routes/backups.js` (`created_at > ?`) | Measured 2026-09-15: real loss 3, shown 2. `>=` would over-count rows the dump did contain; a correct count compares against what the dump holds. Restore also rewinds `activity_logs` AUTO_INCREMENT, so ids are reused. A server change |
| **HAZARD — if the only admin loses its password and has no confirmed email, nobody can restore access through the app** | `routes/users.js` `POST /:id/temp-password` + forgot-password | The fallback is admin-only AND refuses your own id; self-service needs a CONFIRMED email or mobile number. The seed ships one admin, never verified, so both paths can be shut at once and the remedy is a direct DB write. **Before the pilot: confirm ADMIN001's email** — that is the ONLY in-app remedy: no endpoint creates an admin (both create routes hardcode their role), so a second admin is a direct DB insert. Do not let an admin set their own temporary password, and do not link to a Create-admin screen that does not exist |
| **A broken mailer or SMS gateway is invisible — forgot-password answers the same `202` either way** | `utils/mailer.js` + `utils/smsTransport.js` + `routes/auth.js` | The uniform reply must not change (LRN oracle). **Check `activity_logs` for `password_reset_email_failed` / `password_reset_sms_failed` before believing a user typed their login id wrong**; `npm run sms:probe` for the gateway. Fix is a health probe, never a different response body |
| **Restoring a backup taken before `feat/sms-transport` (2026-09-29) brings back the old `users` / `auth_codes` shape** | `server/backups/*.sql` | Re-run `npm run db:migrate:contact-verification` afterwards (idempotent) |
| **A truncated dump from the 2026-09-15 browser check is on disk as an orphan, and nothing on screen says it is incomplete** | `server/backups/parents_portal_2026-09-15_003822.sql` + `createBackupRecord` | No `-- Dump completed on` footer; `createBackupRecord`'s cleanup runs only in a live process. **Check any orphan for the footer before adopting it.** Not deleted (no backup file is ever deleted). **Cause named 2026-09-30:** `node --watch` restarting on access-time events in `node_modules`; the `dev` script now watches our code only, and the demo runs `npm start` |
| **Expo Go on the Play Store moves to SDK 58 in October 2026, and an auto-updated Expo Go stops loading this SDK 57 project** — added 2026-09-27 | `mobile/package.json` + Darryl's phone | Auto-update is OFF on the phone (2026-09-27). Fallbacks: the SDK 57 APK from expo.dev/go, or Expo CLI installing it over USB. **The November defense needs one of those or an SDK 58 upgrade first.** Not a code defect; a date to watch |
| **A standalone or development build refuses plain `http://` in release** — added 2026-09-27 | `mobile/app.json` | Expo Go allows cleartext to a LAN IP. A release build needs `expo-build-properties` with `android.usesCleartextTraffic: true` or a network security config naming the IP. Nothing to do while Expo Go is the device |

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
a written reply; **do not cite it in the manuscript as policy, do not
re-ask.** **The modal is approved — do not remove it as an unapproved
feature.** No new endpoint, no new nav; `GET /` is still not called.

- **Term grade stays. Initial Grade and weights are NOT shown** — a number the
  parent has never seen, and the one that raises "why isn't this 90?"
  (transmutation).
- **Numerical empty is three per-section copies, never one "nothing
  recorded"** (§5f). **A Pending / null cell is not a button.** §5b: clear
  `detail` before every fetch.
- **Grade 1: no empty WW/PT/Exam sections** — the write path `400`s a
  numerical encode on a descriptive row.
- **Do not show:** rank, class average, "Passing", "Need attention",
  `descriptor.remarks`, IG, weights.

**One rule here rested on a reason that has since expired, so it needs a
deliberate answer rather than an assumption (2026-09-22).** The modal carries
**no sentence about how the Grade 1 letter is produced** — removed 2026-09-12
on the grounds that it stated an unconfirmed assumption as fact, with
"silence is the honest state until the school answers". **The school answered
on 2026-09-22 and it is built** (§6a), so that justification is gone. The copy
is still absent, which is fine as a default — but it is now a choice, not the
only honest option. Do not re-add a hedge or a tooltip; if anything goes back
it is the confirmed rule, and that is Darryl's call.

Row sources, the modal's wiring and the full text: `docs/ARCHIVE.md` → NOW
POSSIBLE, and `docs/API_REFERENCE.md` → Grades.

---

## SAFE TO BUILD NOW — done

Empty by design. Every item it held is built, and the section carried **no
rule** — each sentence restated CURRENT STATE, BLOCKED / RESOLVED or
`docs/API_REFERENCE.md`, which is the one-number-one-place liability rather
than redundancy. The heading stays so the map keeps its shape; the text is in
`docs/ARCHIVE.md` → SAFE TO BUILD NOW. **Do not repopulate it** — what is
buildable next is BUILD ORDER's job.

---

## GET /api/messages/contacts — BUILT 2026-09-07

Scoped by the **inverse of `canMessage()`**. Two rules, stated nowhere else:

- **`?search=` filters within scope only — NEVER an unscoped user search**,
  which would expose the whole school.
- **ACTIVE accounts only.** Consequence: TCH-002 sees zero parent contacts
  (Jea's parent is seeded `pending`), and `test:messages` asserts that as
  **correct** — not as the adviser-scope bug returning.

Row shape, per-role contents and ordering: `docs/API_REFERENCE.md` → Messages.
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
not the 36 that was estimated. This is the ONE place that figure lives**;
the counting rule behind it is `docs/FRONTEND_CONVENTIONS.md` →
Corrections. Every checkbox's full write-up — what it built,
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
      reliability (merged) → UI polish (`feat/ui-polish`, a–f built) →
      `docs/stage5` → full phone test / smoke gate →
      manuscript delta list. SMS moved before server reliability by
      Darryl's decision.
- [ ] ~~Push notifications~~ → **In-app notifications only, via Socket.io
      (Darryl, 2026-09-27).** The bell, badges and `LiveStatus` on the same
      socket as the web; no `expo-notifications`, no `push_token` column.
      Remote push is unavailable in Expo Go on Android since SDK 53 and would
      need a development build, Firebase and a server-side send — a separate
      decision if ever wanted. Built on the Parent branch.

### Stage 6 — Integration

- [ ] End-to-end testing across web and mobile
- [ ] Deployment decision: localhost or Railway + Vercel + Cloudinary. **The
      demo API runs `npm start`, never `--watch`** (decided 2026-09-30)
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
4. Refresh the docs/PROJECT_PROGRESS.md snapshot (state only;
   history goes to docs/CHANGELOG.md — never append narrative)

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

### School questions — still open (ONE)

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
- **Never pipe a heredoc to an interpreter (`python -`, `node -`): it HANGS
  on stdin instead of failing. A kill is confirmed by LISTING processes, not
  by the kill's own output.**
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
- **A whitelist includes every PROOF that renders a touched module**, so a
  PLAN ONLY greps `client/scripts/` for them and lists them up front. Missed
  twice running — `ssr-cards.jsx` in UI-C1b, `ssr-ui-a.jsx` in UI-D-1 — each
  costing a mid-dispatch stop. A proof is coupled to what it renders.
- When you stop, name the reason with one of: BASELINE MISMATCH, SCOPE
  EXPANSION, CONTENT DRIFT, or a specific behavioral reason. "Something is
  wrong" is not a stop reason.
- **Every dispatch report ENDS with `Shell content writes: N`.** N should be
  **0**; any non-zero lists the file and the commit. Added 2026-09-23 after a
  `node -e` append put a block header through the shell and bash ate the
  backticks in `` `activity_logs` ``, writing the sentence with the token
  missing. A count that must be stated is harder to forget than a rule that
  must be remembered.
- **Before any live-DB write outside a suite — a migration, a by-hand
  cleanup delete — `GET /api/health` must answer, then `POST /api/backups`
  must return `201`, then write. If the backup call fails, the `--watch` API
  is most likely mid-restart from a server-file edit: wait and retry; never
  proceed without it.** Added 2026-09-26 after #5a's migration ran behind
  two failed backup calls (`docs/CHANGELOG.md`).
- **Set HPS → Done on Teacher → Grades is a DRY RUN; "Save all" writes**
  slots, components and a grade row for each learner scored — for EVERY
  learner (shell rows) only when it carries Summative maxima (measured
  2026-09-26 and 2026-09-28). A browser check that saves
  ends with cleanup by id, backup first — twice (#5b, #7) a later suite's
  baseline found the rows instead.
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

### Sub-agents — read-only exploration only (2026-09-23; no protocol file)

- **Read-only exploration, inside a PLAN ONLY or an audit. Never for writes,
  git, the database, fixtures, backups or suites.**
- **Restate the dispatch's rules in the prompt — a sub-agent does NOT read
  this file**, so a rule not in the prompt does not exist for it.
- **Verify what one returns; the report names which answers came from one.**

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
| 2026-09-30 | **`feat/ui-polish`** (a–f built, not merged): the web sidebar grouped, collapsible to a rail (`pp.sidebar`), a drawer below `md`, the user card with the one Logout; the new teacher's login id in the banner; Records' dates stacked; the admin dashboard fetches once; f: whole-card dashboard links, the login sentence; the parent dashboard back to its 69bae24 layout. Full rows: `docs/CHANGELOG.md`. |
| 2026-09-30 | **`fix/server-reliability`** (merged): the backup reset NAMED — `--watch` restarting on `node_modules` access-time events; `dev` watches our code only; `.partial` safeguard; deletes remove their notifications and signal recipients (A2); web Attendance leave prompt. Full row: `docs/CHANGELOG.md`. |
| 2026-09-29 | **`feat/sms-transport`** (merged): reset codes by text beside email through a phone-hosted gateway; the `verify-contact` pair; one code to every confirmed channel, one sentence; F1/F2 copy. `test:recovery` 110, `test:users` 73, `test:sms-transport` 62; phone check and re-check passed, cleaned up by id. Full row: `docs/CHANGELOG.md`. |
| 2026-09-29 | **`fix/mobile-popto`**: every modal returns with `popTo` — no second drawer or Login (M16); B1, the auth stack's `screenLayout` rendered as an element (a layout is CALLED inside the navigator's render, so a hook there broke its hook order; pre-existing since `7c7530c`); P1, the parent and teacher dashboards re-fetch on focus (M14), the mount fetching once. `proof:routes` 33/33; phone re-check passed, cleaned up by id. Full rows: `docs/CHANGELOG.md`. |
| 2026-09-29 | **Stage 5, branch 4 — `feat/mobile-admin`**: every admin screen; the temporary password shown once, capture-blocked, cleared on background; modal screens return with `popTo`. Proofs 10 / 14 / 6 / 12; mirrors 22. Full rows: `docs/CHANGELOG.md`. |
| 2026-09-28 | **Stage 5, branch 3 — `feat/mobile-teacher`**: every teacher screen; Grades one slot at a time; the attendance prompt on a date or section change (a drawer screen is never removed). Proofs 20 / 11 / 11 / 13; mirrors 22. Full rows: `docs/CHANGELOG.md`. |
| 2026-09-27 | **Stage 5, branch 2 — `feat/mobile-parent`** (seven commits, merged fast-forward after the checkpoint check, the second-half check and three re-check rounds): the drawer shell and pure route map, the socket, bell and Notifications screen, Settings, About, and every parent screen. Proofs 15 / 21 / 21 / 15; mirrors 12. Full row: `docs/CHANGELOG.md`. |
| 2026-09-27 | **Stage 5, branch 1 — `feat/mobile-scaffold`** (five commits, merged fast-forward the same day after Darryl's seven-item phone check passed, one re-check round for the 503 path): `mobile/` on Expo SDK 57, the hotspot proved phone → `/api/health` first, sign-in + session rules + theme + root navigator, tokens generated from the web's stylesheet, dev-only code excluded at Metro's resolver because the Hermes export does not inline `__DEV__`. Proofs 21/21 and 8/8; four lint figures in `docs/TESTING.md`. Full row: `docs/CHANGELOG.md`. |
| 2026-09-26 | **Smoke gate + fix/smoke-gate** (to `12a3495`, 12 commits): suites, proofs, lint, smoke all green; twelve write flows and a same-backup restore proved in a browser, cleaned by id. Twelve browser-found defects fixed — the full list is the `docs/CHANGELOG.md` row. |

**trim-7's own stub was removed from this table on 2026-09-23**, not archived:
its full row was already in `docs/CHANGELOG.md`, so a stub here was a third
copy of one dispatch. **That is the exception, not a new habit** — a stub
whose full row exists in `docs/CHANGELOG.md` may be dropped when this table is
the only duplicate; every other stub still leaves in a dated ARCHIVE batch and
is never deleted.

Older stub lines are verbatim in `docs/ARCHIVE.md`, in **eighteen dated
batches** (2026-09-19 → 2026-09-26), each headed "CHANGELOG stubs moved from
CLAUDE.md on <date> (<nth> batch, <the pass that spent it>)" — grep that;
the per-batch counts once listed here were a third copy of a number the
headings carry. **Every full row is in `docs/CHANGELOG.md` with one
exception: the Notifications N1 server dispatch has no row there**, so its
stub in the third batch is the only surviving summary. A stub is moved out
when this file approaches its size limit, never deleted.
