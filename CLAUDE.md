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
> different things: **`docs/API_REFERENCE.md` counts 86** handlers defined in
> `server/routes/`, and the API answers **87 endpoints** because
> `GET /api/health` is mounted directly in `server.js`. State which you mean.
> Both were recounted from the code on 2026-09-19; the archived endpoint
> table's 81 rows are a dated snapshot of that day, not a third figure.
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

---

## CURRENT STATE

**Last verified:** 2026-09-18 (**Stage 4 is COMPLETE.** Admin → Backup &
Restore was the last page: every Figure 5 admin process has a page. **Admin
nav is 8 items, all built** — Sections, Excuse Letters, Memos, Events and
Messages were **removed** on 2026-09-18 rather than left `built: false`, by
the scope decision under ADMIN SCOPE AUDIT; teacher (11) and parent (9) are
unchanged, and **no role now has a `built: false` item**. 22 tables, 86
handlers + `/api/health`. 20 of 23 sections have no adviser and no screen can
assign one — see KNOWN ISSUES.)

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
| `attendance`, `announcements`, `memos`, `events`, `excuse_letters`, `messages` | 0 |

HTTP suites that create rows delete them in a `finally` block and must
return the database to this table, not to a remembered older snapshot.

### Working endpoints — this is the entire API

**The full 81-row table moved to `docs/ARCHIVE.md` on 2026-09-19** ("Moved
from CLAUDE.md … section trim") as a dated snapshot. **The live record is
`docs/API_REFERENCE.md` §8** — every one of the 81 rows was verified present
there before the move, with request/response detail this table never had.

**Read `docs/API_REFERENCE.md` for any endpoint question.** What still
belongs here is only the arithmetic, because two numbers are both correct
and mean different things: **86 handlers** are defined in `server/routes/`,
and the API answers **87 endpoints** because `GET /api/health` is mounted
directly in `server.js`. State which you mean. The archived table's **81
rows** are neither — it is a snapshot dated 2026-09-19, taken before
Notifications' 4 and account recovery's 5 landed, and it is not the live
record.


**A scope change removes future authority, never past records.** Three
places, one principle: deleting a `teacher_assignments` row does not
touch `grades` (no FK, and mid-year reassignment must not wipe SF9
data); message history stays readable after `canMessage()` would refuse
a new send; and the subjects-reseed CASCADE is the **opposite** case
(destroying `subjects.id` wiped assignments *and* grades). Do not add a
grades-exist guard on `DELETE /api/assignments/:id`.

**Full request/response detail for all 87 endpoints — every body field,
the exact response wrapper key, role-scope codes, and the 404-vs-403
convention — lives in `docs/API_REFERENCE.md`, not here.** This table is
the quick list; that document is what Stage 4 screen work should
actually be read against.

**Backup and Restore both built.** See "RESTORE" below for what shipped and
what the automated suite deliberately does not cover.

**Tests:** fifteen suites. The fourteen HTTP suites default `BASE` to
`http://127.0.0.1:${PORT}` — Node `fetch` on Windows resolves `localhost`
to IPv6 `::1` first and the server listens on IPv4; that mismatch was
ECONNRESET mid-run. `process.env.API_BASE` still wins. They are idempotent — every row they
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
- `npm run test:students` — 65/65
- `npm run test:sections` — 30/30
- `npm run test:assignments` — 41/41
- `npm run test:grading-modes` — 13/13
- `npm run test:grades` — 167/167 (confirmed twice 2026-09-15; was broken 2026-09-10 → 2026-09-13 — see CHANGELOG)
- `npm run test:auth` — 56/56
- `npm run test:attendance` — 38/38
- `npm run test:content` — 62/62
- `npm run test:settings` — 29/29
- `npm run test:users` — 47/47
- `npm run test:backups` — 39/39
- `npm run test:sanitize` — 9/9
- `npm run test:messages` — 59/59
- `npm run test:restore` — 26/26 (safe to run after a real restore since 2026-09-15 — it puts back the cutoff it finds)
- `npm run test:excuses` — 70/70

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

Purpose per file, the long narratives and the one rule each carries moved to
`docs/ARCHIVE.md` on 2026-09-19 ("Moved from CLAUDE.md … section trim");
the per-file *narratives* were already there under CURRENT STATE → Files
that exist. **Shape:** `server/` is `routes/` (one file per module) +
`utils/` (shared helpers) + `middleware/auth.js` + `config/db.js` +
`scripts/` (setup, the one migration, the sixteen test files); `database/`
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
| a number, including `0` | `0.00` / `88.05`, normal weight |
| `null`, numerical mode | `— Pending` |
| `null`, descriptive mode | `— N/A` |
| failed request | never reaches here — `DataTable`'s error state owns the frame |

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
- **Two modes, decided by the `page` prop (2026-09-19).** Without it, the
  whole list is on screen and the table sorts it locally (report cards, and
  every set fetched whole through `fetchAll`). With it — the API's
  `{ limit, offset, total, has_more }` — the rows are ONE page: sorting is
  controlled (`onSortChange` re-requests with `sort`/`order` against the
  endpoint's allow-list, nothing is sorted locally), a footer reads
  "1–50 of 812" with Previous/Next, and an empty page of a non-empty set
  steps back to the last real page on its own (C7). A filter or sort change
  resets the page's offset to 0 (C6) — in the page, not here. Every list
  endpoint pages (`docs/API_REFERENCE.md` §6b); a caller that needs a
  complete set uses `fetchAll`, never the first 50 (C2/C5).
- **Nulls sort last in BOTH directions, and the rule sits OUTSIDE the
  direction multiplier.** Two empties compare equal; `Array#sort` is stable.
- mysql2 returns `DECIMAL` as strings, so the comparator coerces numerically
  before `localeCompare`. The gallery fixture carries `87.50` **and**
  `100.00` — only `100.00` catches a lexicographic regression. Do not tidy
  either away.

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
resolves imports, not identifiers; oxlint's default `correctness` set has
`no-unused-vars` on and **`no-undef` OFF** (deliberately not enabled
project-wide yet); the server suites never load the client. Where a browser
is unavailable, an SSR render via `renderToStaticMarkup` **with a negative
control** (remove a hook import, see the `ReferenceError`) is the backstop,
not the proof — it cannot catch effect bugs (the Modal focus-steal). Say what
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
dispatch**, next to oxlint's 44. `page`/`surface-subtle` and
`primary`/`bubble-mine` share a light value on purpose — do not merge them.
**Dark (2026-09-19):** the same variables under `[data-theme="dark"]` — the
block is the theme, no page changed for it. Light / Dark / System live in
Settings → Personalization, stored on the device (`pp.theme`, default Light),
applied by `pages/settings/theme.js` and by an inline script in `index.html`
before the bundle (keep the two in step by hand); `initTheme()` in `main.jsx`
keeps System live. **`npm run lint:contrast` must report 0** on every client
dispatch, next to `lint:tokens` and oxlint's 44; a failing pair is waived
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

**Frozen 2026-09-19 (R1 server, R2 client).** Four rules; the endpoint
detail is `docs/API_REFERENCE.md` → Auth, and the dump exclusion is in
`docs/RESTORE.md`.

- **`POST /api/auth/forgot-password` answers the same sentence, always.**
  Verified account, unverified, inactive, unknown `login_id`, rate-limited,
  internal failure — one `202` and one message. A parent's `login_id` IS
  their child's LRN (§5c), so anything else is an LRN oracle. The client
  advances its step on that reply and **must not branch on whether a code
  was really sent**. Two timing mitigations hold the line the message draws:
  a miss burns a bcrypt, and the response goes out before the SMTP call. The
  reset endpoint has **one** failure message for every cause and **no count
  of tries remaining** — that is the same oracle, slower.
- **`users.token_version` is the revocation mechanism, not a timestamp.**
  Bumped by a password change, a reset and an admin temporary password; the
  token carries it as `v` and `middleware/auth.js` compares for equality.
  **`password_changed_at` is audit only** — two attempts to revoke on it
  failed, because `iat` has one-second resolution and a scripted flow fits
  inside one second. Do not reintroduce it as the check.
- **A write that revokes must hand back a replacement, and the client must
  store it.** `PUT /auth/change-password` returns `token`;
  `AuthContext.applyToken()` stores it and re-reads `/auth/me`, in that
  order, because the interceptor reads storage per request. A caller that
  drops it signs its own user out on the success path.
- **The forced change is routed on the FIELD, never on the 403.** The server
  refuses every other route with `code: 'MUST_CHANGE_PASSWORD'`, and that is
  a backstop for direct API callers: §2 says a 403 never redirects, and the
  client already has `user.must_change_password` from `/auth/me`.
  `/change-password` sits outside `Shell` (a nav of pages the server will
  refuse is an interface that lies) and outside `ProtectedRoute` (which is
  what redirects there).

**A screen may not tell someone to ask an office they ARE.** All three email
branches on Settings → Account information name Admin → Users for an admin
and the school office for everyone else; an admin's own way back in is
*another* admin, because the temporary-password endpoint is admin-only and
refuses your own id (§5i, browser check 2026-09-19).

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
  the same `roundTo2` the report card imports — the latest term, "N of M
  subjects recorded", and an average returned ONLY when the term is
  complete. Do not recompute any of it in the client, and do not show a
  partial average.
- **The teacher banner is one row per advisory section**, hidden on Saturday
  and Sunday, and not rendered at all for a teacher who advises nothing.
  Green requires FULL coverage; anything partial is amber "N of M recorded",
  because the encode screen omits unset rows rather than defaulting them.
  Dates come from `todayLocalDateString()`, never `toISOString()`.
- **An "upcoming" list asks for `sort=event_date&order=asc` explicitly.**
  `GET /api/events` defaults to DESC for the Events page, so a `limit=3`
  card without this returns the three FURTHEST-AWAY events, backwards. The
  endpoint default is not changing; the caller asks for what it needs.
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

**What went:** 8 endpoints (`routes/contributions.js`), the
`contributions` and `contribution_records` tables with their four FKs,
Teacher → Contributions and Parent → Contributions, three nav items (teacher,
parent, and the unbuilt admin one), `test:contributions` and its suite,
and StatusBadge's `paid` tone (`pending` stays — users and excuse letters
share it).

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

**What the removal also closed:** consequence 5 (the adviser could not post a
fee — a school question), the DELETE 409 that named a remedy which did not
exist, the Download Statement KNOWN ISSUE (Figure 19's CSV export), the last
expired NOW POSSIBLE workaround (Contributions compose built from
`GET /students`), the DO 19 KNOWN ISSUES row, the unconfirmed OPEN QUESTION,
and in API_REFERENCE the `records` two-shape wrapper gotcha, the `mine` vs
`my-records` gotcha, and the contributions half of the scope-width gotcha.

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

- **Nine stages, all done 2026-09-05/06** (G1a → G2a → G2b → G2c → G1b →
  G2d → G2e → G3), plus `DELETE /:id` and `GET /api/grading-modes` on
  2026-09-08. Schema shaped for DO 015 / DO 009 (G1a); the real 40-row
  curriculum (G1b — Grade 4 recorded as INFERRED); pure arithmetic in
  `utils/gradeComputation.js` (G2a); shell-row creation (G2b); WW/PT/exam
  writes with full recompute (G2c); Grade 1's manual A–E letter (G2d);
  component edit/delete and the admin lock (G2e); the three reads including
  the report card (G3). **Grades has no remaining backend work.**
- **Dual mode by design.** Exactly one of `term_grade` (numerical) or
  `descriptive_grade` (Grade 1 letter) is populated on a row, decided by
  `grading_mode_configs` at write time and self-describing at read time. Do
  not drop or merge the two columns — the KS1 rollout keeps both live
  indefinitely. Final Grade and General Average are not columns anywhere;
  both are computed at read time.
- **Grade 1's letter is a MANUAL teacher judgment — an ASSUMPTION, not a
  school-confirmed answer.** DO 015 defines no Initial-Grade-to-letter
  formula, and descriptive grading exists to avoid numerical labeling in KS1.
  If the school says a computation feeds the letter, `PATCH /:id/descriptive`
  changes, not the schema. Still an OPEN QUESTION. WW/PT/EX stay
  informational for Grade 1 (numerical writes on a descriptive row are `400`).
- **EX is three raw-score columns on `grades` (`ex_st1`/`ex_st2`/`ex_te`,
  each with `*_max`), not `grade_components` rows.** `ex_percentage` is
  derived at write time (30/30/40). Locked — a fixed positional triple, not an
  open-ended list. WW/PT retain every raw score via `grade_components`.
- **Every computed value is NULL until every required input exists** —
  Initial Grade, Final Grade (three terms) and General Average (every
  subject) alike, and a descriptive subject is `null` at both levels because
  it is inapplicable, not incomplete (`grading_mode` tells the two apart).
  Never a running average: a partial figure reads as settled. Rounding is
  half-up to 2 decimals at every stored step (`roundTo2`, `Number.EPSILON`
  nudge). Percentages over 100 are not clamped; a cap belongs in route
  validation as an explicit policy, if ever.
- **Scope.** Encode = the subject teacher via `teacher_assignments` on all
  four of teacher/subject/grade/section (VARCHAR, never `section_id`) — a
  second scoping authority alongside `sections.adviser_id`, deliberate,
  because DepEd assigns encoding to the subject teacher. View = grade+section,
  any subject (matching `students.js`). A teacher inside view-scope but not
  encode-scope gets `403` naming the subject on the five `:id`-keyed writes;
  outside both is `404`. **Do not widen grades to advisers** — that is school
  policy, not a patch. A missing `subject_id` is `400` for both roles.
- **`PATCH /:id/lock` is admin-only, unscoped, with no completeness gate**
  (a gate would make every descriptive row permanently unlockable) and no
  extra friction on unlock (reversible, unlike restore). Locking is a
  school-wide finalization boundary, not teacher discretion; whether a teacher
  may lock their own encoding is an OPEN QUESTION. **`DELETE /:id` is
  admin-only, refuses a locked row, and is deliberately on no screen.**
- **A missing `grading_mode_configs` or `grade_weight_configs` row is `409`
  naming the gap — never a silent default, never `500`.** A transmutation
  year with no rows means "use the Initial Grade directly" — the data's
  absence drives it, never a hardcoded year comparison.
- `grade_weight_configs` is keyed `(subject_id, school_year)`, `CHECK` sums to
  100.00, seeded via a JOIN on `grading_mode_configs WHERE mode = 'numerical'`.
  `grade_components.type` is `ENUM('WW','PT')` with no `'formative'`.
  `current_quarter` became `current_term` (`['1','2','3']`). Item-count caps
  and `is_locked`'s trigger stay documentation-only. Awards are out of scope.

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

## RESTORE — built

`POST /api/backups/:id/restore`, admin only, `routes/backups.js`. Restoring
drops and recreates the whole database; a bad implementation is unrecoverable
in a way almost nothing else here is. Every guard below is in the shipped
code. The full record — including the two live-restore bugs, how each was
found by hand rather than by the suite, and why a content-inspection test
proves only what it checks for — is verbatim in `docs/RESTORE.md`, the text
`server/routes/backups.js` and `test-restore-flows.js` mean by "CLAUDE.md's
RESTORE section".

- **Source validation is structural.** The only input is `backups.id` — no
  upload path, no filename parameter. The row (`404`) and the file on disk
  (its own `404`) are checked first, before step-up: any admin can already
  see every filename via `GET /api/backups`, so nothing leaks.
- **Step-up auth.** `password` re-verified against the caller's own hash —
  `400` if missing, `403` "Incorrect password." if wrong; never `401`, the
  token is valid. Each refusal is logged as `restore_refused` naming the
  backup and the reason, never the typed value (best effort; a failed log
  write cannot turn the refusal into a `500`).
- **Type-the-name confirmation.** `confirm_filename` must match exactly —
  `400` naming both the value sent and the real one.
- **Automatic safety dump first**, `pre_restore_<timestamp>.sql`, via the
  same `createBackupRecord()` as a manual backup. If it fails, the restore
  aborts and nothing is changed — the single most important line.
- **`auth_codes`' ROWS are never in a dump either** (R1, 2026-09-19) — a
  second `--ignore-table` plus the table on the `--no-data` pass, and
  **no** `stripBackupsTableDdl()` counterpart is needed, because a restore
  recreating it empty is the correct state. A six-digit code is a
  credential with a 10⁶ plaintext space, so bcrypt is not enough on a file
  that is never deleted. Full reasoning: `docs/RESTORE.md`. Do not remove
  either flag to "make the dump complete".
- **`backups`' own data is never in a dump** (`--ignore-table` on the main
  pass, a `--no-data` pass appended for its structure), and
  `stripBackupsTableDdl()` removes its `DROP`/`CREATE TABLE` from the SQL the
  restore executes — matched on mysqldump's own comment convention so old
  files are protected too. Without both, every restore wiped the live table.
  Both are regression-tested in `test:backups` from real dump content.
  `GET /api/backups` reports `.sql` files with no row as `orphaned_files` —
  never auto-adopted (a fabricated `created_by` is a guess); adoption is a
  by-hand data fix recorded as `manual_backup_adoption`. Do not recreate lost
  rows from memory.
- **`activity_logs` is rewound on purpose** (a snapshot restore) — the
  safety dump's own `create_backup` entry is provably wiped — but a
  `restore_wiped_activity_logs` marker is written after the restore naming
  the source backup, the boundary and the count lost, also returned as
  `activity_logs_wiped` (the count is off by one — KNOWN ISSUES).
- **The restore runs on a dedicated one-off `mysql2` connection**
  (`multipleStatements: true`), never the shared pool. Safe only because the
  SQL is our own mysqldump output via a tracked row — if this ever takes an
  uploaded file, that stops being safe. MySQL DDL cannot roll back; the
  partial-failure message names the safety dump's filename and says manual
  recovery may be needed.
- **Pool reset** after success (`pool.resetPool()`, the proxy in
  `config/db.js`).
- **Every active JWT invalidated** via `auth_security_state.token_valid_after`
  (one global row, no user or role — force-logout-everyone is the intended
  design, because a restore can replace every `users` row; never a
  `system_settings` key). `authenticate` rejects any JWT whose `iat` predates
  it. Two log entries in sequence: `create_backup` then `restore_backup`.
- **Synchronous, by decision.** Revisit as an async job with a status
  endpoint only if a dump ever takes more than a few seconds.

**`npm run test:restore` never triggers a real restore** — that would
`DROP DATABASE` under every other suite and the running server. It tests
every pre-flight gate over HTTP (nothing created after each refusal, one
`restore_refused` per refusal without the typed value) and `token_valid_after`
with crafted JWTs (`noTimestamp`, chosen `iat`), and since 2026-09-15 it
records the cutoff it finds and puts exactly that back, so it is safe after a
real restore. No request in it ever combines the real password with the real
`confirm_filename`. A real end-to-end restore is a deliberate manual step;
**`db:setup` is not the recovery path** (it drops `activity_logs`). One ran
through the UI on 2026-09-15 (CHANGELOG). Restoring any backup taken before
2026-09-13 brings back the two Contributions tables — drop them by hand
afterwards (KNOWN ISSUES).

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
| **Restoring any backup taken before 2026-09-13 brings back the two Contributions tables** | `server/backups/*.sql` + restore | Afterwards: `DROP TABLE contribution_records;` then `DROP TABLE contributions;` and confirm the table count is back where it was (22 since `auth_codes` landed 2026-09-19). Do not delete or edit the old dumps |
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

### Stage 3 — Backend modules

Order mattered: Student Records first because everything references
students; Grades last because it was blocked.

- [x] Student Records API — list, view, create, update
- [x] Sections API — `GET /`, `GET /:id` (unscoped), `PATCH /:id/adviser`
      (admin). Not one of the core features; built so attendance's
      adviser-scoping can assign still-NULL sections without a direct DB write
- [x] Attendance API — per day, adviser-scoped (Stage B1 rebuild, 2026-09-04)
- [x] Announcements + Memos + Events API. **Class Board (2026-09-06):
      investigated, complete, zero new code** — Feature 4, not an eleventh
- [x] Excuse Letters API — submit, mine, list, view, edit, review
      (adviser-only, never touches attendance)
- [x] ~~Contributions API~~ — **REMOVED 2026-09-13** (SCOPE DECISION)
- [x] Messages API + Socket.io
- [x] System Settings API (admin)
- [x] User Management API — extended `routes/users.js`
- [x] Backup/Restore API (admin, `mysqldump`, not a folder copy) — 5
      endpoints; see RESTORE
- [x] **Grades API — all nine stages (G1a, G1b, G2a–G2e, G3; 2026-09-05/06)**,
      plus `DELETE /:id` and `GET /api/grading-modes` (2026-09-08). See
      BLOCKED / RESOLVED → Grades module

### Stage 4 — Web pages

**Real size: 75 role-facing views behind ~45–50 distinct implementations —
not the 36 that was estimated** (counting rule under STAGE 4 FRONTEND
CONVENTIONS → Corrections). Every checkbox's full write-up — what it built,
what it deliberately did not, how it was verified — is verbatim in
`docs/ARCHIVE.md` → BUILD ORDER, and on its CHANGELOG row.

- [x] **Foundation — 2026-09-06.** Role-aware `Shell`, `layout/nav.js`, seven
      primitives, `format/grade.jsx`, mandatory unwrapping, `/dev/ui`. The
      conventions are frozen — read them before building any screen.
- [x] **Teacher → Attendance — 2026-09-06.** Encode only; adviser-scoped;
      roster fetched with `?status=active`; pre-fill + in-place update; unset
      rows omitted, never defaulted to Present.
- [x] **Teacher → Attendance records — 2026-09-12.** Sibling route
      `/teacher/attendance-records`, read only, never sends `date`; nav was
      add, not flip. Correction path is the encode screen.
- [x] **Teacher → Students — 2026-09-07.** List + detail on `students.id`.
      Enroll wizard + create parent (2026-09-10; class picker is
      `GET /assignments`, never `useTeacherTargets`). Edit (2026-09-12) only
      for classes in `GET /assignments`; adviser-only gets muted copy; PUT
      body omits class.
- [x] **Teacher → Excuse Letters — 2026-09-07.** Queue + review; predicts
      adviser-only before the click; review is irreversible so the modal
      confirms naming the decision (§5e). Modal, not a detail route.
- [x] **Teacher → Announcements, Memos, Events — 2026-09-07.** Three page
      files. Announcements IS the Class Board. Memos is read-only for a
      teacher; `posted_by_name` column on Memos only (2026-09-12). Events
      target a grade with a required date. Delete confirms, edit does not.
- [x] **Teacher → Messages — 2026-09-07.** List + thread, the first Socket.io
      client. No optimistic append; unread is server-derived and cleared by a
      request; badge only on a built nav item. **"Announce to a class" —
      2026-09-13**, naming and preselecting the class from `GET /contacts`.
- [x] **Parent → Announcements, Memos, Events — 2026-09-07.** No write
      affordance; modal, not a route (no `GET /:id` exists); audience labels
      from the target columns' nullness, never from `user.grade_level`; Events
      has one filter (Upcoming vs All on `from`). `posted_by_name` in the modal
      (2026-09-12).
- [x] **Parent → Grades — 2026-09-07.** Report card from
      `GET /grades/student/:studentId`, six-key unwrap, the first `GradeValue`
      consumer; skips the request when `student_id` is null; renders
      `descriptor`, never `remarks`. **Breakdown modal — 2026-09-11.**
- [x] **Teacher → Grades — 2026-09-07.** View + encode, both modes, one page.
      Encode scope from `GET /assignments`, mode from `GET /grading-modes`
      (2026-09-12). No client IG preview, no lock control, no confirmation,
      no unsaved-changes warning.
- [x] ~~**Teacher → Contributions — 2026-09-08**~~ — **REMOVED 2026-09-13**
      with Feature 7.
- [x] **Parent → Excuse Letters, Messages, Contributions — 2026-09-09.**
      Submit + edit while Pending, no withdraw; Messages copies the Teacher
      fetch; Contributions later removed. Flipping Messages `built: true`
      closed the 5g inverse for Parent with no `Shell.jsx` change.
- [x] **Parent → Attendance — 2026-09-09.** Counts + day list, Month vs All;
      skips when unlinked. **"Present on recorded days" — 2026-09-13** once
      the school answered.
- [x] **Admin → Users — 2026-09-09.** First admin page. Pending queue +
      directory + create teacher + edit + status. Never `POST /users/parents`.
      No `:id` route. `AdminDashboard` derives from nav.
- [x] **Parent → Settings — 2026-09-09.** New `PUT /api/auth/contact`;
      identity locked; password + contact only; `AuthContext.refresh()`.
- [x] **Teacher → Settings — 2026-09-10.** Copy of Parent Settings; nav add,
      not flip; stays logged in after a password change. **Teacher web role
      complete.**
- [x] **Parent → Grades breakdown — 2026-09-11.** Same page, no new nav.
- [x] **Admin → Students — 2026-09-14.** Figure 5 1.23. Unscoped; `status=all`
      default; deactivate/activate no confirm; Edit only.
- [x] **Admin → Settings — 2026-09-14.** Figure 5 1.25. School settings; school
      year locked on this page only; two saves via PATCH; no confirm.
- [x] **Admin → Attendance — 2026-09-14.** Figure 5 1.15. View only; no fetch
      until a grade or date range is applied; counts, no rate.
- [x] **Admin → Announcements (with memos) — 2026-09-14.** Figure 5 1.18 +
      Feature 4. This page is the only place a memo can be written; the admin
      "Memos" nav item was `built: false` alongside it and was removed
      2026-09-18.
- [x] **Admin → Grades — 2026-09-14.** Figure 5 1.9. View + lock, NOT delete.
      `TermValue` extracted at the third copy.
- [x] **Admin → Backup & Restore — 2026-09-14.** Figure 5 1.27/1.28, Stage 4's
      last page.

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

- [x] **Server hardening A, B, C** — validation (12-digit LRN, one contact
      rule at six writes); authorization (`POST /users/parents` scope-gated,
      `Account is not active.` now `401`); pagination on every list endpoint.
- [x] **D1 design tokens** · **D2 dark mode** · **D3 brand + sticky chrome** —
      71 semantic tokens, `lint:tokens` and `lint:contrast` both enforced at 0.
- [x] **Empty-state duplicate fix** (§5f gained the rule).
- [x] **Login redesign** — brand split panel, the page moved onto `FormField` /
      `PasswordField`.
- [x] **Notifications, N1 server + N2 client + N3 docs** — the 21st table, four
      endpoints, seven fan-out hooks, the bell and the badges. §10.
- [x] **Account recovery, R1 server + R2 client + R3 docs (2026-09-19)** — the
      22nd table (`auth_codes`), five endpoints, the `token_version`
      revocation counter, and the screens: a Forgot password link that now
      leads somewhere, `/forgot-password`, the forced-change screen and the
      admin temporary password. §11. **The school question that used to block
      this was answered by Darryl, not the school** — self-service by email
      code, with an admin-only temporary password as the fallback — so the
      line that stood here asking who may reset whom is answered, not
      dropped.

**Queued before Stage 5, in this order:**

- [x] **Dashboards, all three roles — DONE 2026-09-20** (DB1 server, DB2
      client, DB3 docs). `GET /api/dashboard`, the deliberately thin one, plus
      `pages/dashboards/Card.jsx` and `useCard.js`. The three pages no longer
      derive their content from `navForRole`. See §12.
      **The teacher attendance banner is now checked too (2026-09-20).** It
      could not be seen during DB2's check — that fell on Saturday and the
      banner is weekend-hidden by design — so Darryl moved the Windows clock
      to Monday 2026-09-21 09:00 and verified both states: amber "Grade 6 -
      Malikhain — Not recorded" with a Record attendance button that opens
      Attendance with the section and date preselected, then green
      "Recorded — 1 present, 0 absent" after saving. **He overrode his own
      "do not fake the date" rule for this one check, deliberately** — the
      alternative was carrying an unverified page for a day. 09:00 so that
      PH and UTC were both Monday, since the banner reads a local weekday
      and the server stores a DATE. Clock restored to automatic; the one
      attendance row was removed and the three `activity_logs` rows it
      produced stay, dated 2026-09-21 — **do not "fix" those timestamps.**
- [ ] **Data views redesign — MOCKUP FIRST, no code until it is approved.**
      Three pieces: a `DataTable` restyle for every list, with a **card
      layout below `sm`** (a row of six columns on a 390px phone is the
      parent's normal case, not an edge one); an **SF9-style Grades report
      card**; and a **monthly Attendance calendar**. Two rules it inherits
      and cannot bend: **no verdict badges anywhere** (§4 — the system counts
      and displays, it never concludes), and **Grade 1's A–E stays as it is
      until the school answers** how the letter is produced (OPEN QUESTIONS),
      so the report card must render both modes without implying the letter
      is computed.
      **Two items found during the dashboards check (2026-09-19/20), both
      deferred here on purpose:** (a) Parent → Attendance's intro says "The
      percentage counts Late as present…" **even when no percentage is on
      screen**, which is every account with zero recorded days — §5i, copy
      describing something that is not there; (b) **in Dark, the amber card
      fill reads as rust/brown** and edges toward "danger", which undoes the
      amber-is-not-a-verdict rule (§12) exactly where it matters. Tune the
      dark amber surface token toward a clearer amber — **mockup first**, and
      re-run `lint:contrast`, since that token has passing pairs today.
- [ ] **Pre-Stage-5 server fixes**, one dispatch: `GET /api/attendance` where
      `date` silently drops `from`/`to`; a class filter on `GET /api/grades`;
      Admin → Users role sort in A–Z rather than ENUM order; email validation;
      `test:attendance`’s cleanup deleting every row on three dates rather than
      only its own; `GET /api/health` returning a static 200 with no DB check;
      and the shared helper that clears the orphan `notifications` rows the six
      older suites leave behind. Every one is a `docs/KNOWN_ISSUES.md` row.
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

**Finding, 2026-09-13.** Four sources gave four answers for which admin nav
items have a basis in the approved design (`nav.js` 13, the p. 70 mockup 5,
Figure 5 has 11 admin-facing processes, `docs/SYSTEM_ARCHITECTURE.md` §4
lists 3 — do not trust that heading). Figure 5 governs by precedent; cite
**Figure 5**, never Figure 4. With a Figure 5 process: Users (1.1, 1.3),
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
process"; no handler moves — the API still authorizes admin on excuse
letters, messages and attendance writes.

The nav-item table, the finding paragraph and the decision bullets as they
stood here until 2026-09-19 are verbatim in `docs/ARCHIVE.md` → "ADMIN SCOPE
AUDIT — the condensed section as it stood in CLAUDE.md until 2026-09-19";
the original full text is `docs/ARCHIVE.md` → ADMIN SCOPE AUDIT.

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

### School questions — answered

None of these is a written policy. **Do not cite them in the manuscript as
documented school policy, and do not re-ask them.** Full entries:
`docs/ARCHIVE.md` → OPEN QUESTIONS.

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

**The full table lives in `docs/CHANGELOG.md` — add new rows there, newest
first, in the same format.** Dated entries record what was true on their date
and are never back-edited; they are exempt from the one-number-one-place rule.
Each row carries its dispatch's whitelist, suite counts, verification and
measured build time — the level of detail this file no longer holds.

Most recent, one line each (the full row is in `docs/CHANGELOG.md`):

| Date | Change |
|------|--------|
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

Older stub lines are verbatim in `docs/ARCHIVE.md` — 14 (2026-09-14 →
2026-09-18) under "CHANGELOG stubs moved from CLAUDE.md on 2026-09-19", and
14 more (all 2026-09-18 and 2026-09-19) under the "second batch, N3"
heading below it. **Every full row is in `docs/CHANGELOG.md`**; this table
holds only the newest one-line summaries, and a stub is moved out when this
file approaches its size limit, never deleted.
