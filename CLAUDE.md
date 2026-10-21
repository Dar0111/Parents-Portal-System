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
| Database | `parents_portal` — 26 tables |
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
> different things: **`docs/API_REFERENCE.md` counts 100** handlers defined in
> `server/routes/`, and the API answers **101 endpoints** because
> `GET /api/health` is mounted directly in `server.js`. State which you mean.
> Count history: `docs/ARCHIVE.md` → "Moved from CLAUDE.md on 2026-10-02",
> and the CHANGELOG rows.
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
| `docs/FRONTEND_CONVENTIONS.md` | the full text of STAGE 4 FRONTEND CONVENTIONS §1–§10 and §13–§25 (§11 and §12 live here), with the reasoning, the worked examples and the browser-found defects behind each | frozen rules |
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

**Last verified:** 2026-10-22, `feat/grade-acknowledgement` `2525215` plus this docs commit — B1 device-checked 2026-10-22 (Sections 1–6, one finding fixed in `2525215` and re-checked), cleaned up by id after backup 346, READY TO MERGE on the owner's word; `main` is `f9b3a68` (the post-merge docs of `2b85331`) — `feat/password-alert` merged fast-forward from `bba67bd` (five commits: B5 `1e43b6a`, B6 `9f3cc6d`, the two email fixes `b34f354` and `e78c635`, the merge-ready docs `2b85331`): account creation and the password alert, device-checked together on 2026-10-21, Sections 1–10, no findings, cleaned up by id after backup 338; before it `9d3b430` — `feat/first-signin` merged fast-forward from `bae0800`: the first sign-in device-checked 2026-10-20/21 on the web, the Tecno phone and SMSGate, every section passed, no fix round, data cleaned up (backup 324) (**Stage 4 is COMPLETE, and
every role has its phone screens.** Admin → Backup & Restore was the last
web page: every Figure 5 admin process has a page. **Admin
nav is 10 items, all built** — Sections, Excuse Letters, Memos, Events and
Messages were **removed** on 2026-09-18 rather than left `built: false`, by
the scope decision under ADMIN SCOPE AUDIT; **Messages came back on
2026-10-05** (that section's SCOPE DECISION 2026-10-05), and **About is last on every
role since 2026-09-26** (10 / 13 / 10); **no role has a `built: false`
item**. **26 tables, 101 handlers + `/api/health`** (feat/grade-acknowledgement,
2026-10-21 — device-checked 2026-10-22, not merged; 25 / 100 since feat/first-signin, 2026-10-18).
20 of 23 sections have no adviser and
no screen can assign one — see KNOWN ISSUES.)

### Seeded baseline

**This is the one place these counts live.** Present-tense claims elsewhere
point here; they do not repeat the figures. Dated CHANGELOG entries are
exempt — they record what was true on their date.

After a clean `npm run db:setup`:

| Table / fact | Count |
|---|---|
| `users` | 8 — ADMIN001, TCH-001, TCH-002 (adviser-only), TCH-003 (Grade 1 - Mabait, all five subjects), Marwin's parent (active), Jea's parent (pending), Nino's parent (active) — each parent's login id is the learner's LRN, in `seed.sql` — and **Ligaya Halimbawa** (active, Tala's parent — since 2026-09-25) |
| `students` | 4 — Marwin Conde G6 Malikhain, Jea Mae Bargaso G5 Masigasig, Nino Alcantara G1 Mabait, and **Tala Halimbawa G6 Malikhain — the browser-fixture learner, nobody's test target** (pre-Stage-5 #3b, 2026-09-25): every suite stays on Marwin, every browser fixture goes on Tala, so the two protocols no longer exclude each other. On a live database she arrives by `npm run db:migrate:fixture-learner`, not `db:setup` |
| `teacher_assignments` | 8 — 3 for TCH-001 (G6 Mathematics/English/Filipino in Malikhain) and 5 for TCH-003 (every Grade 1 subject in Mabait). TCH-002 still has zero; that is the point of the account. |
| `sections` with a real `adviser_id` | 3 of 23 — Malikhain → TCH-001, Masigasig → TCH-002, Mabait → TCH-003. The other 20 stay NULL until an admin assigns them. |
| `grades` | 5 — Nino's partial descriptive card (Mathematics terms 1–3 A/B/C, Reading and Literacy terms 1–2 D/E). `grade_components` and `assessment_slots` are both 0. **These five are LEGACY rows** — letters typed before the rule, with no scores behind them, so they keep their letter and show no Final. Correct, not stale; do not "fix" them. |
| `attendance`, `announcements`, `memos`, `events`, `excuse_letters`, `messages`, `policy_acceptances`, `login_attempts`, `grade_acknowledgements` (since feat/grade-acknowledgement) | 0 (no parent has accepted, §29; no term is locked) |

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
`scripts/` (setup, **nine migrations**, `verify-grading-seed`, `probe-sms-gateway`, `proof-backup-loop`, the twenty-nine test files, `policyFixture.js`); `utils/profilePhoto.js` + `uploads/avatars/` (git-ignored) hold the profile photos; `policy/` holds the notice, the terms and their versions (§29); `database/`
is `schema.sql` + `seed.sql`; `client/src/` is under React web app below.
**`mobile/` (since 2026-09-27, Stage 5)** is its own Expo SDK 57 package:
`src/api/` + `src/auth/` + `src/navigation/` + `src/screens/` +
`src/components/` + `src/format/` (copies) + `src/drafts/` + `src/theme/` (generated tokens)
+ `scripts/` (three checks and the proofs, counted in `docs/TESTING.md`) — STAGE 5 MOBILE CONVENTIONS below.

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
- **`utils/corsOrigins.js` — `CORS_ORIGIN` is a comma-separated LIST, read
  once for the API and Socket.io; a `*` is never accepted.** The client's
  API base is `client/src/api/apiBase.js` alone: `VITE_API_BASE_URL` if set,
  else the page's own host on port 5000.
- **`seed.sql` — adviser assignments are keyed by a `login_id` subquery,
  never a numeric id.**

Full per-file text: `docs/ARCHIVE.md` → CURRENT STATE → Files that exist,
and the 2026-09-19 section-trim block.

### Mobile — every role's screens built

**The Expo app has every role's screens** (Backup & Restore stays web
only). Stage 5 adds no endpoint. No module is "not started".

### Grades — fully built (write path + viewing), Stage 3's last backend module

Grades, Backup/Restore and Excuse Letters are fully built — rules in
BLOCKED / RESOLVED and RESTORE below. Grade 4's subject list is recorded as
inferred, not confirmed. Narrative: `docs/ARCHIVE.md` → "Moved from
CLAUDE.md on 2026-10-02".

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
- **Loading (build 2, 2026-10-07): a SKELETON only when nothing is on
  screen** (after 300 ms, height reserved, no minimum, the `edge` fill, a
  three-pass light SWEEP — none under reduced motion — `role="status"` +
  `aria-busy`; an avatar circle where the page passes `skeletonAvatar`); **rows on
  screen while loading STAY, `aria-busy` + `inert`, greyed after 300 ms** —
  and a list whose query can change passes `queryKey`, its load's
  dependencies (option 1, `hooks/useSkeleton.js`): a new key shows the
  skeleton, never the old rows; `skeletonAvatar="cards"` circles the cards
  only. The phone's
  `DataList`, the dashboard `Card` and the report card follow; the `Card`
  tells a same-query re-read (`refreshing`, kept) from a new query
  (`loading`, skeleton) through `useCard`. §5a-vii, MOBILE M11 / M23.
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
  a page body from 607px to 351px** (since 2026-09-30 it appears at `md`; 256px
  or a 64px rail since feat/ui-refresh — §9). **A browser check must measure the CARD,
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

A sentence of warning text is not a confirmation step. **The four bulk-entry
screens guard unsaved work** — web Grades (§13d) and Attendance (§17c), phone
Attendance and the Grades slot — only while something is unsaved, never a
blanket `beforeunload`. **Since `fix/leave-guard` (2026-10-01) EVERY
user-initiated exit asks "Leave without saving?"** (Stay on this page / Leave
and discard): links, Back, reloading selects, and the BUTTON exits — Log out,
a bell row, phone drawer items — through `layout/leaveGuard.js` (a mirror).
Every other form stays unguarded.

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

`SocketProvider` exposes `connected` and `paused`; `LiveStatus` renders a persistent
*"Live updates paused — new updates will not appear on their own"* strip
with a Refresh action **on `paused` — a failed attempt, a lost connection,
or no first connect within 3 s** (`realtime/liveState.js`, mirrored; R4,
2026-10-11) — and nothing while healthy or still connecting. **No polling fallback.**
The socket is a latency optimisation, not the delivery path —
`POST /api/messages` persists before it emits, and an emit into an empty room
is a no-op. **The notice must appear wherever anything depending on the
channel is shown**: `LiveStatus` renders in `Shell`, above the routed page,
because the unread badge is on every page; its Refresh is a full reload.
`UnreadProvider` is gated on `messagesBuilt`; **`LiveStatus` is UNGATED for
every role, since N2 on 2026-09-19** — and the copy says "new updates", not
"new messages", because the strip is no longer only about Messages and was
shown to a role that had none (the admin, until 2026-10-05). The 2026-09-18 gate on `messagesBuilt` is
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
unless that role's Messages item is built (live for every role — Admin →
Messages since 2026-10-05, an ADD, not a flip). **Flipping `built: false` to `true` is
part of whichever dispatch adds that page's route — never a follow-up.** A
page with no unbuilt row is an add, not a flip.

**No role has a `built: false` item as of 2026-09-18** — admin's five were
**removed, not dimmed** (ADMIN SCOPE AUDIT → SCOPE DECISION 2026-09-18), on
the rule that `built: false` means *unwritten*, never *refused*. **The state
is not retired and its branch is not dead:** `Shell.jsx` still implements
unbuilt and blocked, `/dev/ui` still renders both, and Stage 5 was
expected to reintroduce them. **The `LiveStatus` gate that landed the same day is gone
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
tone sets, the six `bubble-*`, and `primary` = blue-600 `#2563EB`
plus `brand` / `brand-soft` / `seal-bg`) — never `bg-white`,
`text-slate-500`, an arbitrary color, or a `dark:` variant. **One palette,
every screen incl. Login, web and phone: zinc neutrals + ONE blue accent
(owner's option C, `feat/ui-palette` 2026-10-01, replacing B before
merge)**; the status tones are unchanged. The seal's green, gold and red
are never tokens (they collide with the tones); the seal always sits on a
`bg-seal-bg` disc (§9). `:root` holds the raw values, each line naming the
palette color it equals; `@theme inline` maps them so a
`[data-theme]` block can swap values at runtime. **`npm run lint:tokens`
(`client/scripts/check-color-tokens.mjs`) must report 0 on every client
dispatch**, next to oxlint's. `page`/`surface-subtle`, `brand`/`bubble-mine`
and (light) `brand-panel`/`surface-muted` share a value on purpose — do not
merge them. **`brand-panel-lit` is a contrast probe, never a paint.**
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
drawer below `md`, above it 256px (`w-64`, since feat/ui-refresh) or a 64px
rail (`pp.sidebar`), grouped by
`layout/navGroups.js` (a mirror: the phone groups the same, M20); the user
card holds the ONE Logout, its avatar and name open Account information, and
it **never shows a parent's login id** (§5c); `<main>` has no width cap.
**Since the 2026-10-06 fix round:** the collapse toggle has ONE place, a row
under the brand block 14px from the left, in both states; and **Messages is
`sticky bottom-0` in the nav** (`data-nav-pinned`), so it and its badge stay
on screen at short heights — which is why the groups are FLAT in `<nav>` (a
per-group box traps a sticky row), `revealActive` keeps the active item clear
of it, and the nav box carries `scroll-pb-12`. Do not re-box the groups.
**Every nav block is one 3rem slot** (a row and its gap; a group label or
the rail's divider too), the box shows whole slots and rests at slot
starts, so no row shows cut — `docs/FRONTEND_CONVENTIONS.md` §9.
**The drawer is a modal dialog since build 2** (`<div role="dialog"
aria-modal="true" aria-label="Menu">`, `print:hidden` — not an `<aside>`);
the menu button carries `aria-haspopup="dialog"` + `aria-expanded`; Log out
from it closes it before the leave guard asks, and it closes on reaching `md`.
**Since the fix round (2026-10-08):** a PUSH or REPLACE to another pathname
scrolls the window to the top — never on Back/Forward or a query-only
change (`layout/scrollOnNavigate.js`); nav rows draw their focus ring
INSIDE the row (`-outline-offset-2`), so the nav box cannot cut it.

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
  per-item read state. **The message toast (§26) keeps it that way**: no
  `notifications` row, no bell, its count the conversations row's
  `unread_count`.
- **Bell vs badge is a decision.** Everything rings the bell. Badged:
  Excuse Letters / Announcements / Memos / Events for teacher and parent,
  Users and Announcements (carrying **announcements + memos**, since admin
  has no Memos page) for admin. Messages carries its own unread count for
  every role, the admin's since 2026-10-05. **Grades is never badged** — bell only:
  `grade_available`, and since 2026-10-21 `grades_locked` (the parent's ask)
  and `grades_acknowledged` (the adviser's), §33. So a
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
  store it.** `PUT /auth/change-password` and `PUT /auth/first-password`
  return `token`; `AuthContext.applyToken()` stores it and re-reads
  `/auth/me`, in that order. A caller that drops it signs its own user out.
- **The forced change is routed on the FIELD, never on the 403.**
  `code: 'MUST_CHANGE_PASSWORD'` is a backstop for direct API callers; §2
  says a 403 never redirects, and the client already has
  `user.must_change_password` from `/auth/me`. `/change-password` sits
  outside `Shell` and outside `ProtectedRoute`. **Since feat/first-signin it
  is the LAST of the three steps (§29) and writes `PUT /auth/first-password`
  — no current password; change-password passes no gate.**
- **A password change is announced to its holder (feat/password-alert,
  2026-10-21).** After the four writes — change-password, first-password,
  the reset, the admin's temporary password — `utils/passwordAlert.js` sends
  the "was this you?" note to every confirmed channel AFTER the reply, never
  awaited: a failed send changes nothing, no reply waits, nothing confirmed
  logs `password_alert_not_sent`. No code, no link; not an `auth_codes` row,
  so no limit counts it. A restore sends nothing. FRONTEND §29h.

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
  whole card is its link; no "Open →"** (§15e) — **one exception, the
  admin's Users card (build 2): its three counts are each a link**, and
  Teachers / Parents open Admin → Users already filtered to what they count
  (role teacher; role parent + active). Part C (2026-10-07) is the look and
  the lead cards: §15e, M23. The admin lockout notice is compact and holds
  its space while the dashboard loads (`HazardSlot.jsx`, fix round F1).
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

### 25. Profile photos — the file name is the key, and never a login id

**feat/profile-photos, 2026-09-30.** Your own photo in Settings → Account
information (web and phone); an admin may only REMOVE someone else's.
`users.profile_pic` holds **32 random hex + `.jpg`**, a new name per upload —
**no login id, no user id**, not in `activity_logs` either; clients build the
address with the mirrored `format/photoUrl.js`, which refuses any other
shape. Served without a token at `/uploads/avatars/`; every upload is
**re-encoded by sharp (512 × 512 JPEG, EXIF and GPS gone)**. A photo that
fails to load shows the initials. **Learners have no photo.** Remove asks
first; upload does not. Full text: `docs/FRONTEND_CONVENTIONS.md` §25.

### 26. The new-message toast — who, never what

**feat/message-toast, 2026-10-02.** "New message from <name>" / "<n> new
messages from <name>", View + Dismiss, **never the body**; 5 s (web pauses on
hover/focus); one at a time, the newest sender replaces; never my own, never
in that conversation (the OTHER user's id: web `:userId`, phone focused
`MessageThread` `otherId`). **Name and n come from the conversations row the
Unread provider already re-reads** (`subscribeConversations`) — the server's
`unread_count`, no server change, no bell. View = `requestLeave`. **The
admin gets the toast and the tone too since 2026-10-05** (its Messages is
built; `/admin/messages/:userId` is a thread). Pure decisions mirrored (`realtime/messageToast.js`). **On a show or
update only: the "two-note rise" `TONE`** (web Web Audio, phone a bundled
WAV) **and a 150 ms phone vibration.** Enter sends on the web, Shift+Enter is
a new line, **a plain Enter never types a new line** (it sends or does
nothing; a held one sends once); **one send at a time is a REF**
(`sendingRef`), never only the `sending` state. Full text:
`docs/FRONTEND_CONVENTIONS.md` §26, MOBILE M22.

### 27. The UI refresh — one type, one button, entrances only, no Reload

**feat/ui-refresh, 2026-10-02 → 10-04.** Titles in **Merriweather 700**
(`font-serif`), everything else **Source Sans 3** 400/600/700 (+400 italic on
the web), `font-medium` = 600; the sizes are **Tailwind's own** (the branch's
larger scale was reverted, FR5) and titles step up by class. **One `Button`**
(`buttonClass.js` / phone `buttonStyles.js`; min-heights — web 44px, phone
48dp) and **one `SectionHeader`** (an `<h2>`, never an `<h1>`). **Motion is
for ENTRANCES only** — GSAP on the web, `Animated` on the phone, none under
reduced motion (unknown counts as reduced on the phone) — and **never on
attendance marking, grade entry, the toast or the leave-guard dialogs**
(`Modal` never animates); **the one loop is the skeleton's sweep — three
passes, then still, never under reduced motion** (build 2, §5). **No Reload control:** the browser's reload on the
web; on the phone pull-to-refresh, OFF on Attendance and the Grades slot
while anything is unsaved (Attendance also blocks taps and Save during a
pull); the LiveStatus strip's Refresh is the only refresh button (web: a full
reload; phone: reconnect + both counts). The leave-guard sentence says
"discards it" for one mark, "them" for more. **On the phone a weight class is
a font FAMILY, `theme.fontWeight` is `{}`, and every `<Text>` is
`components/Text.jsx`.** **One radius scale by role (§27f, `feat/look-fixes`):
container `rounded-xl` (`cardClass`, Modal), control `rounded-lg` (every
button, input, tab, segment), tag `rounded-md` (badges, chips), circles for
avatars, the seal, dots and counts; every button variant has a 1px border in
its own colour and no shadow; inner corners of a card move with `cardClass`;
input focus is the `focus-accent` border.** Full text:
`docs/FRONTEND_CONVENTIONS.md` §27, MOBILE M23–M24.

### 28. Form drafts — kept until submit, discard or logout; keyed by numbers

**feat/form-drafts, 2026-10-04.** The excuse letter, teacher announcement and
event, admin announcement and memo, and each Messages thread keep what was
typed: the web in the tab's `sessionStorage` (a reload REOPENS a create
modal; an edit draft when its row loads), the phone in AsyncStorage (back
when the form or thread reopens; nothing reopens after a kill). **The key is
`pp.draft.v1.<numeric user id>.<form>.<new | edit-<id> | thread-<id>>` — a
login id, an LRN or a name THROWS (§5c)**; only allow-listed fields, capped,
under 32 000 characters; the pure core `drafts/draftCore.js` is mirrored.
**Removed only by a server-confirmed write, a confirmed Discard draft, or a
deliberate logout (every `pp.draft.*` key) — never by a 401 or a 403.**
**Text that is empty after trimming is not a draft** — never saved, cleared,
not restored (`isBlankDraft`, both hooks). **Close**, not Cancel, on those five modals and four phone screens. An edit
draft keeps its snapshot and says when the item changed. A thread hand-off
over a saved announcement draft asks first, and the posted announcement
clears that thread's draft. Full text: `docs/FRONTEND_CONVENTIONS.md` §28,
MOBILE M25.

### 29. Privacy — consent first, your own first password, sign-in limits, four fields gone

**feat/privacy, 2026-10-10.** **Three steps before the app since
feat/first-signin (2026-10-18), in this order, one module
(`utils/accountGates.js`), full paths, the first pending gate only: the CURRENT
notice and terms (`403 POLICY_ACCEPTANCE_REQUIRED`; staff too); a confirmed
Gmail or mobile number (`CONTACT_VERIFICATION_REQUIRED` — a forced change
confirms one again in that session); then your own password
(`MUST_CHANGE_PASSWORD`, `PUT /auth/first-password`).** Clients route on
`/auth/me`'s fields through the mirrored `nextStep()`, never the 403s (§29f).
Three ticks in the principal's draft words
(§29a), the child by first name, never the LRN; a stale version is 409. **The
socket refuses the same gates, and a restore re-runs the privacy step
itself** (fix round). **The text (`server/policy/`) is a
placeholder; staff tick two boxes, no child tick.** New teachers and parents change
the password someone else typed. **Every password change is announced to its
holder on every confirmed channel — the password alert (feat/password-alert,
2026-10-21; §11).** **Sign-in: 5 failures in a row / 100 per IP
in 15 min → 429, an unknown id the same.** The learner's birthday, gender,
address and contact number are not collected. **Create teacher and Create
parent collect no email or number since feat/account-create (2026-10-21; the
owner's decision of 2026-10-16): the holder confirms one at the contact step,
and the two POSTs refuse a value with `400` naming the field (§29g, M15, M17).**
Full text: FRONTEND §29, MOBILE M26, API_REFERENCE §5b.

### 30. One Messages component — every web surface is one of two shared pages

**feat/shared-messages, 2026-10-11.** The thread is
`pages/messages/MessageThread.jsx`, the list and New-message picker
`pages/messages/ConversationsPage.jsx`; a role's page is a wrapper passing only
what the code made role-specific (the list path, the teacher's Announce row;
the picker's groups, search and copy). **Who may be messaged stays the
server's** (contacts). An empty picker group says why (§5f).
`scripts/loop-messages-thread.mjs` runs the real thread in Chromium, with
controls. The phone thread keeps the same positioning rules (M27). Full text:
FRONTEND §30, MOBILE M27.

### 33. Grade acknowledgement — "I have seen these grades", once per locked term

**feat/grade-acknowledgement, 2026-10-21 (the owner's Q1–Q12; device-checked
2026-10-22, one finding fixed in `2525215`; not merged).** A parent confirms a TERM once it is FULLY
locked — every subject of the learner's grade level locked with a value, the
bulk lock's own test — through `POST /api/grades/acknowledgements` (parent
only, the learner from the session; `409` before that; a repeat `200`,
nothing changed). One row per (learner, school year, term) in
`grade_acknowledgements`, the 26th table; **an unlock of any row of the term
deletes it** (the parent is asked again after a relock) and `activity_logs`
keeps the trail. **Two bell-only notifications:** `grades_locked` to the
parent when a lock — bulk or single — completes the term, self-healing once
confirmed, and `grades_acknowledged` to the ADVISER on confirmation — its
link opens Class summary on the confirmed term (`?term=N`; on the phone a
link's query reaches its screen, M30); nothing for the admin. The report card carries `acknowledgements` (all three terms),
the class summary `term_locked` + `acknowledged` per learner, the bulk
unlock `acknowledgements_cleared`. Every word is the mirrored
`format/acknowledgement.js`; the §5e dialog names the term back; the dormant
`grades.acknowledged` columns stay untouched (Q8). Full text: FRONTEND §33,
MOBILE M30, `docs/API_REFERENCE.md` → Grade acknowledgements.

### Corrections — three claims retired here

*"The first screen builds the shared components"* (~5h), *"backend is 100%
complete"* and *"36 screens"* (~13 days) are **wrong and void, not replaced
with a guess** — endpoints, not percentages. The screen figure is in BUILD
ORDER → Stage 4; the counting rule, `docs/FRONTEND_CONVENTIONS.md` →
Corrections; the paragraph as it stood, `docs/ARCHIVE.md` → "Blocks moved
from CLAUDE.md on 2026-10-21".

### MEASURED BUILD TIME — data points, not a rate

Every dispatch since Teacher → Attendance has a dated data point (on its
CHANGELOG row); none is a rate, and the first five were clocked without §5h's
render proof. **Do not derive a projection from them.** Tables and caveats:
`docs/ARCHIVE.md` → MEASURED BUILD TIME; the paragraph as it stood, "Blocks
moved from CLAUDE.md on 2026-10-21".

---

## STAGE 5 MOBILE CONVENTIONS — M1–M8 frozen 2026-09-27; M9–M12 parent, M13–M15 teacher, M16–M18 admin; M23–M24 the UI refresh; M25 form drafts; M26 privacy

The phone inherits every STAGE 4 rule; this section states only where it
differs and why. Rule statements here, reasoning and mechanism in
`docs/MOBILE_CONVENTIONS.md` (M1–M8 below; **M9 the shell and the pure route
map, M10 the socket on a phone, M11 lists without DataTable, M12 writes and
cleanup, M13 Grades one slot at a time, M14 the roster and where
`beforeRemove` can fire, M15 the teacher's lists, M16 the admin shell and
`popTo` back to the drawer, M17 sensitive actions and the shown-once
password, M18 the admin's lists, M20 the drawer grouped and foldable (`pp.navGroups`, the
active group always open), M21 the photo picker (library only, no camera), M23 the refresh on the phone
(faces, `Text`, `Button`, motion, pull-to-refresh), M24 the status bar, M25 form drafts, M26 privacy — stated only there**). Darryl's decisions of 2026-09-27
that fix them: Expo SDK 57 in Expo Go; in-app notifications via Socket.io
only; text size dropped for the OS scale; notifications as a screen; FA 7
SVG icons; React Navigation drawer; the seal as icon and splash; a
15 000 ms axios timeout; `beforeRemove` on Teacher → Attendance.

- **`mobile/` is its own package and imports nothing from `client/` or `server/`** — a module the web owns is COPIED byte for byte and `npm run lint:mirrors` proves each copy equal; a divergence is a new file, never an edit to a mirror. (M1)
- **Tokens are GENERATED from `client/src/index.css`** — `npm run lint:tokens` fails on any difference and `npm run tokens:write` refreshes them; `tailwind.config.js` REPLACES the palette, and `npm run lint:colors` refuses a colour literal outside `tokens.js`. (M2)
- **The theme is NativeWind's ROOT VARIABLES, set from JS** (`applyTheme`, `pp.theme`, Light by default); **never `colorScheme.set()` or `Appearance.setColorScheme()`** — a process-wide night-mode change on Android; **text size is dropped for the OS font scale.** (M3)
- **Auth parity is §22 with three named differences** — the token in expo-secure-store behind an injected provider, a 401 clears it and signals `AuthContext` in memory, the 15 s timeout "keeps the token"; the root navigator IS `ProtectedRoute`; **the native splash is never held for `/auth/me`.** (M4)
- **The network proof order is fixed:** phone Chrome reaches `/api/health` with `"db":"ok"` before `npx expo start`; `EXPO_PUBLIC_API_URL` is inlined at bundle time; **the firewall rule is for `node.exe`, not a port.** (M5)
- **Dev-only code is excluded at Metro's resolver (`context.dev`), never by `__DEV__`** — `src/screens/dev/` is an empty module in production, grepped absent with a positive control before each mobile commit. (M5, TESTING → Mobile proofs)
- **The template's `CLAUDE.md`, `AGENTS.md` and `.claude/` do not survive the scaffold.** (M6)
- **No render proof on mobile; every screen is proved on the phone**, both themes, every field typed; **reload by cold boot, never by `r` in Metro; after a checkout in the tree Metro serves, `npx expo start --clear` first**; four lint figures per dispatch. (M7)
- **Icons are the web's `fa-*` names resolved by `src/icons.js`; an unmapped name throws in DEV.** (M8)
- **Phone Attendance asks on every exit while FOCUSED and dirty, and Leave and discard resets the marks BEFORE the exit runs.** (M14)
- **The message toast floats over AppShell's stack**, "in that conversation" is the FOCUSED route, **every tone awaits the ONE module-level audio mode**, and DND still plays it (KNOWN ISSUES). (M22)
- **The status bar is PAINTED, never style-only** — React Native's `StatusBar` at the root, `ScreenStatusBar` on a screen whose top is not a header; Android ignores the colour under enforced edge-to-edge (KNOWN ISSUES). (M24)
- **A form draft lives on the device until submit, discard or logout** (`drafts/deviceDrafts.js`); Discard and the hand-off question are system `Alert`s; no "continue draft" after a kill. (M25)
- **Each first-sign-in step is a RootNavigator branch** — consent, ConfirmContact (the Android back button consumed), the new password — **and the realtime providers mount only past all three** (`nextStep()`, mirrored). (M26)
- **One LiveStatus strip per signed-in screen, below the header, and one bottom frame** through `screenLayout`; Home and Main take a bare layout. (M9)

The bullets as they stood, with their reasoning: `docs/ARCHIVE.md` → "Blocks
moved from CLAUDE.md on 2026-10-21 (trim-10)".

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
  approves (`active`). Admin creates teacher (`active` immediately). Neither
  create takes an email or a number (2026-10-21, §29).
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
- **A locked learner freezes the class's highest possible scores, and a whole
  term locks at once (`fix/grade-locks`, 2026-10-13).** The class-record `PUT`
  refuses any HPS set, change or clear with `409` naming every locked learner
  of the class (a dry run too). `POST /api/grades/locks` (admin) locks only
  active learners graded in every subject — the rest are listed, never
  locked — and unlocks with no check; preview first, one audit row. **The
  one notification a lock sends (since 2026-10-21, the owner's Q4): a lock
  that completes a learner's term asks the parent to confirm; an unlock
  clears the confirmation** — §33. FRONTEND §31, MOBILE M28,
  `docs/API_REFERENCE.md`.
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
**Four rules, one line each (the full bullets: `docs/ARCHIVE.md` → "Blocks
moved from CLAUDE.md on 2026-10-21 (trim-10)"):** grades READ scope is
assigned-OR-adviser, ENCODE unchanged — widening encode to advisers would
invent school policy; `TEACHER_ADVISES_CLASS_SQL` and `TEACHER_VIEW_SCOPE_SQL`
in `utils/teacherScope.js` MOVE TOGETHER (an empty class must stay visible to
an assigned teacher); the printed order is `subjects.display_order`, sorted
`display_order IS NULL, display_order, name`, every grade level ordered since
2026-09-26; a descriptive letter is NOT a `GradeValue` — cells go through
`format/TermValue.jsx`, and an unrecorded letter is Pending, not N/A. Full
contract: `docs/API_REFERENCE.md` → The class summary; the page: FRONTEND
**§14**; the order: `docs/GRADING_SPEC.md` **§6d-i**.

**The class record is BUILT (CR0–CR2, 2026-09-22)** — `GET` and
`PUT /api/grades/class-record`, the 23rd table `assessment_slots`, and
Teacher → Grades rebuilt as the grid. **Five rules, one line each (the full
bullets in the same ARCHIVE block):** a slot is USED once it has a highest
possible score, and a used slot where a learner has no score makes that
learner's whole group Pending — never left out, never zero; every score and
every HPS is a WHOLE number, refused on the server at all four per-row write
paths and the class record; a score above its HPS is allowed and flagged,
never refused or clamped (the school awards bonus points, confirmed
2026-09-23); both class-record routes are registered BEFORE `GET /:id` — do
not reorder `routes/grades.js`; `slot_id` is REQUIRED on `POST`/`PUT
/:id/components`, and only the class-record `PUT` may create a column and
its scores in one save. Full contract: `docs/API_REFERENCE.md` → The class
record; the policy: `docs/GRADING_SPEC.md` **§6e**; the page: FRONTEND **§13**.

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

The 2026-09-15 server cleanup and its three later-closed items:
`docs/KNOWN_ISSUES.md` → "Server cleanup, 2026-09-15", with the parents
gate in full on its `POST /api/users/parents` row.

| Issue | Where | Note |
|---|---|---|
| **Restoring any backup taken before 2026-09-13 brings back the two Contributions tables** | `server/backups/*.sql` + restore | Afterwards: `DROP TABLE contribution_records;` then `DROP TABLE contributions;` and confirm the table count is back where it was (**26** since feat/grade-acknowledgement, 2026-10-21; 25 from the privacy build, 2026-10-10 — the restore re-creates its two tables itself since the fix round; 23 from `assessment_slots` on 2026-09-22, 22 from `auth_codes` on 2026-09-19). Do not delete or edit the old dumps |
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
| **Restoring a backup taken before `feat/grade-acknowledgement` (2026-10-21) drops `grade_acknowledgements` and the two newer `notifications.type` values** — the report card and the class summary answer `500` until the migration is re-run | `server/backups/*.sql` | Re-run `npm run db:migrate:grade-acknowledgements` afterwards (idempotent) |
| **DO NOT move a learner to another section by editing the database** — the API refuses a class change, and a hand edit mixes scores | `students` + `routes/grades.js` `recomputeGrade` | Grades follow the learner, slots stay with the old class: the next recompute needs the new class's slots, then SUMS old and new scores. A transfer policy is a separate PLAN ONLY |
| **Profile photos are NOT in any backup** — a restore can point at a deleted photo (initials show) or orphan a newer one | `server/uploads/avatars/` + restore | Deliberate: the restore stays mysqldump-only. Never auto-delete an orphan photo; never add uploads to the dump without its own plan |
| **A truncated dump from the 2026-09-15 browser check is on disk as an orphan, and nothing on screen says it is incomplete** | `server/backups/parents_portal_2026-09-15_003822.sql` + `createBackupRecord` | No `-- Dump completed on` footer; `createBackupRecord`'s cleanup runs only in a live process. **Check any orphan for the footer before adopting it.** Not deleted (no backup file is ever deleted). **Cause named 2026-09-30:** `node --watch` restarting on access-time events in `node_modules`; the `dev` script now watches our code only, and the demo runs `npm start` |
| **Five phone / APK notes, one row (2026-09-27 → 10-04): Expo Go on the Play Store moves to SDK 58 in October 2026 (auto-update is OFF on the phone; the SDK 57 APK or a USB install is the fallback, or an SDK 58 upgrade before November); a release build refuses plain `http://` (a cleartext setting or a network security config); the message tone plays during DND and the 150 ms vibration ignores DND and the ringer (the APK fix); the status bar colour is ignored under enforced edge-to-edge (re-check on every SDK upgrade, on Android 15+ and in the APK)** | `mobile/` | Not code defects — dates and the APK to watch. The five rows in full: `docs/KNOWN_ISSUES.md`, and as they stood here in `docs/ARCHIVE.md` → "Blocks moved from CLAUDE.md on 2026-10-21 (docs/trim-10, the tenth trim)" |
| **BEFORE THE PILOT — change the seeded admin password** — added 2026-10-04 | `server/scripts/setup-db.js` + `server/scripts/proof-backup-loop.js:172` + `server/scripts/test-messages-flows.js:95` (and `:101` / `:106` / `:151` / `:165`, the seeded teacher and parent sign-ins) | It still signs in on the live DB (backups 275, 276 and 278), and the proof and the messages suite hold it in the repo; `test:privacy` READS it from `:172` at run time. After the change all three need another way to sign in (an env var, never a value in a file). **Never print the value** |
| **BEFORE THE PILOT — the notice and terms are PLACEHOLDERS** — added 2026-10-10 | `server/policy/*` | Approved text → replace the file, bump its version, restart the API |
| **Badged pages clear only from the bell; visiting the page does not** — added 2026-10-13 (the smoke gate's F3, cut from `fix/smoke-round`) | `layout/Shell.jsx` + `mobile/src/navigation/DrawerContent.jsx` + `routes/notifications.js` | Every badged page, web and phone. One pass after the professor's check: `PATCH /read-all` with an optional `section`, called by each page after its first load — never client arithmetic (§10) |

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
posted it." The four closed items, each dated on its CHANGELOG row, are
listed in `docs/ARCHIVE.md` → "Blocks moved from CLAUDE.md on 2026-10-21";
the one rule among them: `useTeacherTargets`'s union is still assigned OR
adviser — do not reuse the hook for Grades. **This section is not a backlog
of one; do not "finish" it. Not on this list:** the contacts empty-cause — it
stays in KNOWN ISSUES.

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

**The Grade 1 letter sentence (2026-09-22):** the modal carries no sentence
about how the letter is produced; its 2026-09-12 justification expired when
the school answered (§6a), so the absence is now a choice, not the only honest
option. **Do not re-add a hedge or a tooltip; if anything goes back it is the
confirmed rule, and that is Darryl's call.** The paragraph as it stood:
`docs/ARCHIVE.md` → "Blocks moved from CLAUDE.md on 2026-10-21".

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
- **Default passwords are public.** The three defaults (one per role) are
  hard-coded in `server/scripts/setup-db.js`, which is in the GitHub repo
  (`seed.sql` holds only a placeholder). A parent
  logs in with their child's LRN as the login id — anyone who knows a
  child's LRN would know that account's password too. Change every
  default password before any real account exists. **The admin's is also in
  `server/scripts/proof-backup-loop.js:172` and
  `server/scripts/test-messages-flows.js:95`, and it still signed in on the
  live DB on 2026-10-04 and 2026-10-06** (KNOWN ISSUES). That suite's `:101`,
  `:106`, `:151` and `:165` hold the seeded teacher's and parent's sign-ins.
- **RA 10173 (Data Privacy Act) applies** — the manuscript itself cites
  it. Loading real student names and LRNs needs the school's answer on
  whether a consent process is required, whether they already have a
  form, or whether permission is needed per parent. Two new questions
  added to OPEN QUESTIONS below for the school visit.
- (The contacts item is closed — built 2026-09-07; text in `docs/ARCHIVE.md`
  → "Moved from CLAUDE.md on 2026-10-02".)

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
      complete vertical slice beats ten invisible endpoints (see the pointer
      at the end of this section).
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

All 22 pages built 2026-09-06 → 09-14, four interleaved backend items
2026-09-07/08; **Stage 4 CLOSED 2026-09-14** — lists in `docs/ARCHIVE.md` →
"Moved from CLAUDE.md on 2026-10-02".

**Four page rules from those entries are stated nowhere else, so they stay
here.** The rest of each write-up is verbatim in `docs/ARCHIVE.md` → BUILD
ORDER and on its CHANGELOG row.

- **Teacher → Attendance records never sends `date`** — it is the read-only
  sibling route; the correction path is the encode screen.
- **The Teacher → Students Enrol class picker is `GET /sections` filtered to
  the sections the teacher ADVISES, not `GET /assignments`; only the Section
  FILTER takes the assignments list, and neither uses `useTeacherTargets`**
  (that hook's union is assigned OR adviser — see NOW POSSIBLE for the same
  warning about Grades).
- **Parent content audience labels come from the target columns' nullness,
  never from `user.grade_level`.**
- **Admin → Users never calls `POST /users/parents`** and has no `:id` route;
  a parent account is created by a teacher and approved by an admin (LOCKED
  DECISIONS).

### After Stage 4 — interleaved, before Stage 5

**Every item DONE, 2026-09-18 → 2026-09-26** — server hardening A–C, D1–D3,
notifications, account recovery, dashboards, the data views DV1–DV4, the
grades track CR0–CR3, UI polish and UI-A–E, pre-Stage-5 #2–#7, POLISH and the
smoke gate. The block is verbatim in `docs/ARCHIVE.md` → "Moved from
CLAUDE.md on 2026-10-02"; its rules live in `docs/FRONTEND_CONVENTIONS.md`
§13–§23, `docs/API_REFERENCE.md`, `docs/KNOWN_ISSUES.md` and
`docs/TESTING.md`. **Four rules have no other living home and stay here,
word for word:**

- the **three `activity_logs` rows dated 2026-09-21** are from Darryl
  moving the machine clock forward to verify the weekend-hidden teacher banner —
  his deliberate override of his own "do not fake the date" rule, both states
  seen, clock restored. **Do not "fix" those timestamps.**
- **The Data views redesign is DONE** — DV1–DV4 and DV1b, 2026-09-20 →
  2026-09-23. The block and its ticked write-ups left under the REFILL RULE
  (`docs/ARCHIVE.md`); its rules are §4, §16, §5a-v, §17c and §17e. **MOCKUP
  FIRST outlived it** and still governs item 5 and UI-D (d).
- **`utils/emailRule.js` is the one email rule** for
  every write site, the school-email field included.
- **the term
  is the latest term whose start is ≤ today, else Term 1** (the December
  break is Term 2).

### Stage 5 — Mobile (Expo) ✅ CLOSED 2026-10-09

Every role's screens, then the polish, the UI refresh, form drafts, builds 1
and 2 and admin Messages — each device-checked and merged (build 2 last,
`9ed8793`). Rules: M9–M26. **Notifications stay in-app only, via Socket.io**
(no `expo-notifications`, no `push_token` column; push would be a separate
decision). The block: `docs/ARCHIVE.md` → "BUILD ORDER → Stage 5 moved from
CLAUDE.md on 2026-10-10".

Merged after the close, each device-checked: privacy (`456bba8`), shared
Messages (`ea96ecf`), skeleton option 1 (`450b792`), the socket handshake
(`10e277a`), staff acceptance (`5dc868d`), skeleton tier 2 on the web
(`c8ac275`) and on the phone (`4bfbda0`), the web load races (`afccdd8`),
the grade locks and the smoke-gate fix round (`4d28d7f`), the first sign-in
(`9d3b430`, 2026-10-21) — items: `docs/ARCHIVE.md` → "BUILD ORDER → Stage 5
items moved from CLAUDE.md on 2026-10-11" (two batches), "… item moved … on
2026-10-13" and "… on 2026-10-21"; rules: §5, §5f–§5g, §11, §29–§32, M11,
M26–M29.

**NEXT (the owner's pre-Oct-21 order, 2026-10-18):** `feat/first-signin` is
merged (`9d3b430`, 2026-10-21); `feat/account-create` and
`feat/password-alert` are MERGED (`2b85331`, 2026-10-21 — `main`
fast-forwarded from `bba67bd` by the ref move, no checkout under the running
servers; the combined check `docs/ACCOUNT_CREATE_PASSWORD_ALERT_DEVICE_CHECK.md`
§12, the cleanup §11, backup 338). `feat/grade-acknowledgement` is rebased
onto this `main` (trim-10 `bffd033`) and its database part ran 2026-10-21 —
the migration twice after backup 339, the 23 HTTP suites, `smoke:isolated`
20/20, the survey; the new suite's cleanup fixed after backup 344 — and its
B1 device check PASSED 2026-10-22 (Sections 1–6; one finding, "Grades
confirmed" opening today's term, fixed in `2525215` and re-checked;
`docs/GRADE_ACKNOWLEDGEMENT_DEVICE_CHECK.md` §8), cleaned up by id after
backup 346 (§7): READY TO MERGE, not merged. **On the owner's word
"merge":** `main` fast-forwards to this branch's head by the ref move (never
a checkout under the running servers), then the post-merge docs on `main`,
then B3 (`fix/f3-badges` and `feat/activity-log` remain in the order, each on
its own check), then `docs/pre-oct21`, the demo data and a new restore point. The
owner's target is everything finished, the Supabase migration included, by
Mon 2026-10-26; the next system check is Wed 2026-10-28; the restore point is
still backup 317 (`parents_portal_2026-10-13_233314.sql`) — 324, 338 and 346
are the three checks' pre-cleanup dumps and 339, 344 and 345 this branch's
pre-write dumps, not restore points. The manuscript delta list stays with the team.

### Stage 6 — Integration

- [ ] End-to-end testing across web and mobile
- [ ] Deployment decision: localhost or Railway + Vercel + Cloudinary. **The
      demo API runs `npm start`, never `--watch`** (decided 2026-09-30)
- [ ] Demo data and rehearsal
- [x] **The web in a phone's Chrome** — `feat/lan-web` (2026-10-01): `npm run
      dev:lan`, `CORS_ORIGIN` as a list, a blank `VITE_API_BASE_URL`. README.
- [ ] **A standalone APK — READY PLAN, NOT BUILT:** `docs/APK_READY_PLAN.md`
      (EAS preview, in-app server address, `ph.edu.chfes.parentsportal`).

Why Stage 2 came before Stage 3: `docs/ARCHIVE.md` → "Moved from CLAUDE.md
on 2026-10-02".

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

**Finding, 2026-09-13 — cite Figure 5, never Figure 4** (and never
`docs/SYSTEM_ARCHITECTURE.md` §4's heading): with a Figure 5 process — Users,
Students, Grades, Attendance, Announcements, Settings, Backup & Restore;
without one — Sections, Excuse Letters, Events, Messages. The paragraph as it
stood: `docs/ARCHIVE.md` → "Blocks moved from CLAUDE.md on 2026-10-21".

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
and, since 2026-10-13, the bulk `POST /api/grades/locks` are both
`authorize('admin')` and are the only routes reaching
`UPDATE grades SET is_locked`; direction is the request's `is_locked` /
`lock` boolean and there is no separate unlock path. Written down so a later
dispatch does not add a teacher-side lock as a convenience.

**SCOPE DECISION, the owner (Darryl), 2026-10-05 — Admin → Messages comes
back, teacher ↔ admin only.** It reverses the Messages line of 2026-09-13 and
2026-09-18 for one pairing; both entries stay as written. Teacher ↔ admin is
allowed both ways and the admin's picker lists ACTIVE teachers only;
**parent ↔ admin and admin ↔ admin are refused with `403`** ("Parents may only
message their child's teachers." / "The admin may only message teachers.");
teacher ↔ teacher and teacher ↔ parent are unchanged. An existing parent ↔
admin thread stays readable and its composer shows the refusal (a scope
change removes future authority, never past records). The web reuses the
parent pages by role and the phone the parent's screens; a shared component
comes after the Fri 9 Oct 2026 check. The admin gets the unread badge, the
toast and the tone; "Announce to a class" shows on a parent's thread only.
Figure 5 has no admin Messages process: **this is the owner's decision, and
Chapter 5 must say so** (manuscript delta list).

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

- **Are there make-up classes — and on which days?** Saturday is
  answered: the SY 2026-2027 calendar has no Saturday class days
  (`client/src/format/schoolCalendar.js:7–10`). Make-up classes stay open;
  the team will ask. It matters because `POST /api/attendance/bulk` has
  **no weekday validation**, so a Saturday is accepted, and two fixtures
  have recorded one. Parent → Attendance shows such a day in an "Also
  recorded" strip beneath the Mon–Fri grid and counts it (DV2,
  2026-09-20). **If make-up classes fall on weekends, everything is
  already right.** If they never do, the answer is a server-side `400`,
  never a client filter — hiding a row the database holds would make the
  calendar disagree with its own totals. `docs/KNOWN_ISSUES.md` has the
  full row.

### School questions — answered

None of these is a written policy. **Do not cite them in the manuscript as
documented school policy, and do not re-ask them.** One line each; the full
bullets are verbatim in `docs/ARCHIVE.md` → "OPEN QUESTIONS — answered school
bullets and closed engineering bullets as they stood in CLAUDE.md until
2026-09-30" (and the older "… until 2026-09-19").

- **2026-09-26** — no Saturday classes in SY 2026-2027 (the school's calendar); make-up classes are still open above. Do not re-ask.
- **2026-09-26** — "Quiz up to 10" = FIVE written-work slots (`WW_SLOTS = 5`). Do not re-ask.
- **2026-09-23** — mid-year transfer: old adviser before, new adviser from the transfer date; built as `recorded_by` OR current adviser. Do not re-ask.
- **2026-09-23** — the printed subject order is confirmed for every grade. Do not re-ask.
- **2026-09-23** — bonus points are awarded (added to PT); over-HPS is flagged, never blocked. Do not re-ask.
- **2026-09-22** — the Grade 1 letter is COMPUTED (`docs/GRADING_SPEC.md` §6a) — the school's practice, never cite it as DepEd's. Do not re-ask.
- **2026-09-01** — no contributions from parents → Feature 7 removed. Do not re-ask.
- **2026-09-13** — Late counts as present, Excused as absent — a school decision, never DepEd's. Do not re-ask.
- **2026-09-11** — the team's seven answers (terms, modes, components, weights, lock, LRN login, the parent modal), all built. Do not re-ask.

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
- Adviser response to the 5 revision requests.
- Deployment for the demo: localhost or cloud (Railway + Vercel + Cloudinary)?
  Undecided; blocks the Figure 1 hardware requirements in the manuscript.
- `users.email` UNIQUE — not added, deliberately (sibling parent accounts
  share one guardian email; one account per student is locked). If email
  login is ever built, scope uniqueness to `role IN ('teacher', 'admin')` —
  never a plain table constraint across all roles.
- `activity_logs` appears nowhere in the manuscript. Document it as a
  security feature, or drop the table.
- **Parent demo — data:** real names and LRNs need the school's answer on
  consent (RA 10173 — see BEFORE THE PARENT DEMO). **Parent demo —
  logistics:** how many parents, when, is there a PTA meeting to join?
**Closed — one line each, full text in the same ARCHIVE block as the answered
school questions:**

- **2026-10-03** — the report card's header, info row and legend moved to container units with feat/ui-refresh (`ReportCard.jsx:712–718`); nothing in it reads the viewport. Full text: `docs/ARCHIVE.md` → "Closed engineering bullet moved from CLAUDE.md on 2026-10-04". Do not re-ask.
- **2026-09-30** — Teacher → Attendance DOES warn before leaving with unsaved marks (§17c). Do not re-ask.
- **2026-09-26** — `Manage Templates` (Figure 23, undefined in the manuscript; likely the grade weight display): not built, and the manuscript drops it. This line is its full text. Do not re-ask.
- **2026-09-06/07** — read scopes widened to assigned OR adviser (TCH-002 is that account); **`routes/grades.js` is deliberately NOT widened** — encoding is the subject teacher's. Do not re-ask.
- **2026-09-18** — `Account is not active.` is `401` (login keeps `403` + `status`). Do not re-derive.
- **2026-09-07** — endpoint audit, all three buckets empty; **re-run it after any dispatch that adds or removes an endpoint.**

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

- Write or edit file content only with the Write/Edit tools — never through `python -c`, `echo`, heredocs or any shell quoting.
- **Never pipe a heredoc to an interpreter (`python -`, `node -`): it HANGS on stdin. A kill is confirmed by LISTING processes, not by the kill's own output.**
- **Never `git checkout --` (or any restore from HEAD) on uncommitted work.** Before a negative control, copy the file and put it back from the copy.
- Before writing code for a new module, state the exact list of files you will create or modify; a file outside it is "SCOPE EXPANSION — need `<path>` because `<reason>`", never a quiet addition.
- **A whitelist includes every PROOF that renders a touched module** — a PLAN ONLY greps `client/scripts/` for them and lists them up front.
- When you stop, name the reason: BASELINE MISMATCH, SCOPE EXPANSION, CONTENT DRIFT, or a specific behavioral reason.
- **Any view of a seed, suite or proof is MASKED from the FIRST view, and since 2026-10-10 any view of suites, seeds or scripts masks EVERY string literal except API paths.** Never print a login id, LRN, password, email, phone or `.env` value, in tool output too.
- **Every dispatch report ENDS with `Shell content writes: N`.** N should be **0**; any non-zero lists the file and the commit.
- **Before any live-DB write outside a suite — a migration, a by-hand cleanup delete — `GET /api/health` must answer, then `POST /api/backups` must return `201`, then write; a failed backup call means wait and retry, never proceed without it.**
- **Set HPS → Done on Teacher → Grades is a DRY RUN; "Save all" writes.** A browser check that saves ends with cleanup by id, backup first.
- Test assertions against shared tables must be scoped to rows the run itself created, or written as invariants (`.every(...)`) that additional real rows still satisfy — never an exact row count or exact list contents on a table the application also writes to.
- Before any module dispatch, confirm the current branch; new module work starts on `feature/<module>`, never on `main`.
- **After any merge to `main`, report `git log --oneline -1` and confirm that commit is the one this dispatch produced.** `git status` being clean does not prove the work landed; a stash is how finished work becomes invisible.
- **A dispatch that changes a WRITE path runs every suite that WRITES through it** — find them with `grep -n "'/api/<path>'" server/scripts/test-*.js` plus any `INSERT INTO <table>` the change depends on. Read versus write is the gap.

The bullets with the incident behind each one: `docs/ARCHIVE.md` → "Blocks
moved from CLAUDE.md on 2026-10-21 (docs/trim-10, the tenth trim)".

When Darryl corrects a wrong assumption, accept it and move on. The `.md`
and `.sql` files describe the real system; the manuscript describes the
approved design. **When they conflict, say so plainly** rather than assuming
either one is wrong.

---

## AGENT SKILLS — three installed, deliberately not the rest

Three of `mattpocock/skills`' 37 are installed in `.claude/skills/` (copied,
not symlinked — editable files this repo owns, nothing auto-updates them):
`diagnosing-bugs` and `tdd`, which Claude may invoke on its own the moment
something is reported broken or asked for test-first, and `handoff`
(`/handoff`, a doc in the OS temp dir), plus the required
`setup-matt-pocock-skills` (run once, 2026-08-30); the last two run only on
the slash command (`disable-model-invocation: true` in a `SKILL.md`
frontmatter makes any of them opt-in). **Do not install more without a
specific reason** — three present is a decision, not an oversight. The table
and the text as they stood: `docs/ARCHIVE.md` → "Blocks moved from CLAUDE.md
on 2026-10-21".

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

No stubs stand here since the twentieth batch (2026-10-02). Older stubs are
verbatim in `docs/ARCHIVE.md` in twenty dated batches headed "CHANGELOG stubs
moved from CLAUDE.md on <date> (<nth> batch, …)" — grep that. **Every full
row is in `docs/CHANGELOG.md` except the Notifications N1 server dispatch**,
whose stub in the third batch is its only summary. A stub leaves in a dated
batch, never deleted (the one exception — trim-7's stub, dropped on
2026-09-23 because its full row already existed — is not a habit). The
paragraphs as they stood: `docs/ARCHIVE.md` → "Blocks moved from CLAUDE.md on
2026-10-21".
