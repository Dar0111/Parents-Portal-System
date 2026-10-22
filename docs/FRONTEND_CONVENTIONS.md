# STAGE 4 FRONTEND CONVENTIONS — frozen 2026-09-06 (full text)

> The complete text of every Stage 4 frontend convention (§1–§10 and §13–§24; §11 and §12 live only in `CLAUDE.md`) and the three retired planning claims, with the reasoning and worked examples. `CLAUDE.md` → STAGE 4 FRONTEND CONVENTIONS carries the rule statements.
> Moved out of `CLAUDE.md` on 2026-09-18 verbatim so that file fits Claude Code's 150k-char limit. `CLAUDE.md` holds the condensed version and wins on any present-tense claim; if the two disagree, the code is correct and both must be fixed.
> Dated entries record what was true on their date and are never back-edited. MEASURED BUILD TIME lives in `docs/ARCHIVE.md`.

The frontend counterpart to THE AUTH PATTERN IS THE TEMPLATE below. These
were settled in the foundation dispatch, against the real API, before any
feature page existed — which is the point: a convention invented by the
first page gets bent by the second. **Every Stage 4 page inherits all of
them. Do not invent a new structure.**

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
  `orphaned_files`, `GET /grades/:id` + `grade_components` + `descriptor`), so those keep the
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
  reach the user through `extractError`. Every 403 origin is a route-level
  refusal with a reason (scope, a locked grade, a failed re-authentication
  such as restore's step-up password or change-password's current
  password) or an `authorize()` role violation — for all of them, bouncing
  to `/login` throws away the reason and, for the role violation, re-logs
  the user in to the same refusal. There is no exception any more:
  `middleware/auth.js`'s `Account is not active.` — the one 403 that meant a
  dead session — has been `401` since 2026-09-18 (Server hardening B), so the
  interceptor logs that user out on their very next request. **No count, on
  purpose:** this used to say "twenty places"; it cannot be checked
  mechanically, because some 403s come from helpers (e.g.
  `preflightGradeWrite`) rather than literal `status(403)` calls — there
  were 21 literal calls on 2026-09-15 and the real figure is higher.
  **Not string-matched** —
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
| a number, including `0` — **default precision** | `0.00` / `88.05` / `87.50`, normal weight |
| a number with **`whole`** | `87` / `89` / `89.5`, normal weight |
| `null`, numerical mode | `— Pending` |
| `null`, descriptive mode | `— N/A` |
| failed request | never reaches here — `DataTable`'s error state owns the frame |

#### TWO PRECISIONS, AND WHICH VALUE GETS WHICH (2026-09-22)

**`whole` is for a TERM GRADE and a FINAL GRADE, and nothing else.** The
school's Summary of Grades and DO 015 both print those as integers, and since
the same-day server fix they are stored that way too. **The General Average
(final and per-term) and the Initial Grade KEEP two decimals** — the school's
own sheet computes 721 / 8 = 90.125 and prints **90.13**, so the average of
eight whole grades is itself not whole. Two precisions one level apart is a
real distinction in the school's records, not an inconsistency to tidy away.

**`whole` is opt-in and the default is unchanged**, which is the point: the
general averages and Initial Grades stayed correct by *not being touched*,
and that is what proved they were not caught by accident.

**`TermValue` sets it once, for all seven term cells** — the parent card's
table and its 390px segments, the parent breakdown wrapper, Teacher → Grades'
roster and modal, Admin → Grades' table and modal. That is what the component
exists for; setting it per caller is how seven screens drift apart.

**IT IS `String(Number(x))` — NEVER `toFixed(0)`, NEVER `Math.round`.**
`"87.00"` → `"87"`, `89` → `"89"`, **`89.5` → `"89.5"`.** JavaScript's own
number-to-string drops trailing zeros and keeps real decimals, which is
exactly the rule, so there is no `Number.isInteger` branch to get wrong.

**The reason a rounding display would be a defect, not a shortcut:** the
transmutation table is seeded for SY 2026-2027 only. From SY 2027-2028 a
year with no rows means "use the Initial Grade directly", and Initial Grades
carry two decimals — so `toFixed(0)` would render a stored `89.5` as `90`, a
number the database does not hold. **Rounding is the server's job and it has
already happened; the client's job is to not add decimals that are not there,
never to remove ones that are** (§5i).

**The defect this replaced:** a correct Final Grade of 89 displayed as
`89.00` on the parent card, its 390px segments, the breakdown modal header,
and both the teacher and admin Grades screens. One `toFixed(2)` served all
four kinds of value, so the fix had to split at the call site rather than in
the formatter.

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

#### 3a. `GradeValue`'s colour — on a coloured surface, pass `className`

**The rule today (checked 2026-09-30, `docs/stage5`):** `GradeValue` sets NO
colour on a value — it inherits the base colour on `body` (§18g); pass
`className` on a coloured surface; the NULL branch keeps `text-fg-muted`.
Everything below is the history of how it got there, written as it happened:
the `className || 'text-fg'` default it describes as current was UI-A's
intermediate step, and UI-D removed it (`format/grade.jsx`: the value branch
is `tabular-nums ${className}`).

**Rewritten 2026-09-23 (UI-A). The rule is unchanged — pass `className` — but
the reason it works is no longer a coincidence.**

Added after DV4, where it cost a browser round trip. `GradeValue` used to set
`text-fg` unconditionally, which is **dark in light mode**. On the parent
dashboard's navy hero the General Average was therefore **invisible in light
mode**, while the plain figures beside it were fine — they inherit the panel's
colour and this one did not.

**The fix is `className`, not a hand-formatted number.** The prop exists for
exactly this, and using it keeps §3's rule that one renderer draws every
grade-bearing value in the system:

```jsx
<GradeValue value={grades.general_average} mode="numerical" className="text-primary-fg" />
```

**Until UI-A that worked only because of STYLESHEET ORDER.** Both `text-fg`
and `text-primary-fg` landed on the element; neither is more specific, so the
winner was whichever Tailwind emitted **later**. That is a fact about
generated CSS, not a guarantee, and DV4 had to assert the ordering against the
BUILT stylesheet to keep it from silently reversing.

**Now the value branch is `className || 'text-fg'`.** A caller that names a
colour gets **only** that colour — the default is never emitted, so there is
no pair to order and nothing to assert. A caller that names none is
byte-identical to before. The negative control is the proof: restore the old
line and the render produces `class="tabular-nums text-fg text-primary-fg"`,
which is the race itself.

**WHY NOT SIMPLY INHERIT, which is the obvious reading and was the item as
written:** nothing in this app sets a base text colour — no rule on `body`,
`#root` or in `@layer base` — so *inherit* resolves to the browser default,
black. `DataTable` hides that (its `<td>` sets `text-fg-secondary`), but the
three grade-heavy screens build their own tables and set none:
`parent/ReportCard.jsx`, `teacher/ClassSummaryPage.jsx` and
`teacher/ClassRecordPage.jsx`. Black on a dark surface is DV4's F1 pointed the
other way. **A base colour comes first, in UI-D; `GradeValue` returns to pure
inheritance in that same dispatch**, and this section shrinks to one line.

**The NULL branch still sets `text-fg-muted` unconditionally**, and that is
deliberate rather than half a job: "— Pending" is muted because it is a
statement about absence, not because of the surface it sits on. It keeps the
order dependence the value branch just lost — recorded here rather than
hidden, since no caller needs otherwise today.

### 4. StatusBadge — four vocabularies, one tone map, NO VERDICTS

Four status vocabularies (`users` · `attendance` · `excuse_letters` ·
grades `is_locked`) share one central status→tone
map. "Pending" means the same thing in two of them, so mapping it once is
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
- **Two modes, decided by the `page` prop (since 2026-09-19 — this bullet
  used to say "No pagination", and the revisit trigger it named, the admin
  `GET /api/users` list once real accounts exist, was taken up by Server
  hardening C before any real account existed).** Without `page`, the whole
  list is on screen and the table sorts it locally: the two report cards,
  and every set a page fetched whole through `fetchAll`. With `page` — the
  API's `{ limit, offset, total, has_more }` — the rows are ONE page, so
  sorting is controlled: a header click calls `onSortChange` and the page
  re-requests with `sort`/`order` against the endpoint's allow-list; nothing
  is sorted locally, because the top of page 2 is not the top of the set. A
  footer reads "1–50 of 812" with Previous/Next, still rendered when
  everything fits so a list never changes shape as it grows. An empty page
  of a non-empty set (the last pending parent on page 2 approved away) shows
  the skeleton (§5a-vii) and asks for the last page that exists, in one effect inside
  DataTable, so no page re-implements it. A filter or sort change resets the
  offset to 0 — in the page, which owns the request. Every list endpoint
  pages (`docs/API_REFERENCE.md` §6b); a caller that needs a complete set
  uses `fetchAll` (200 a page, de-duplicated by id, a hard cap that throws a
  user-facing error), never the first 50.
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

#### 5a-i. THE STICKY TABLE HEADER IS A CLOSED QUESTION (dropped 2026-09-20)

**Do not add one.** It was built, broke three different ways in three
successive fixes, and was removed by decision (Darryl, DV1). This is written
at length because "the header should stay visible while you scroll" is an
obvious-sounding improvement that a later dispatch will otherwise propose
again and rediscover all of this.

**The reason is structural, not a bug that was left unfixed.** A `sticky`
element resolves its `top` against the nearest ancestor whose `overflow` is
not `visible`. Containing a too-wide table REQUIRES exactly such an ancestor.
So a sticky header and an in-table horizontal scroller cannot both be true of
the same table — and the scroller is the one that cannot be given up, because
without it a wide table widens the page instead.

The three failures, in order, each found in a browser and each fixed into the
next one:

1. **Offset inside the frame.** The table frame carried `overflow-hidden`,
   purely to clip the table's square corners to its rounded ones. That made
   the frame the nearest scrollport, so `top: var(--header-h)` positioned the
   header 61px DOWN INSIDE the card: an empty band above the table and the
   header sitting on top of row 1, on all 22 consumers at once.
2. **The page scrolled sideways.** Releasing the scroller at `sm` fixed the
   offset and, at 200% zoom, let a table wider than `<main>` push the whole
   document sideways — a horizontal scrollbar on the window and a clipped
   Final Grade column. A page body that scrolls sideways is the failure
   WCAG 1.4.10 exists for, and it would equally hit tablets, narrow laptops
   and Large text.
3. **Mangled text.** Making the table unable to overflow, via
   `wrap-anywhere` (`overflow-wrap: anywhere`) on every cell, works by
   shrinking each cell's min-content — which means breaking words
   MID-LETTER. A squeezed table read `S/U/BJ/E/C/T`, `Mathemat/ics`,
   `Aral/ing Panl/ipu/nan`, and split an LRN across four lines
   (`13/56/74/54`). An identifier that wraps is not a styling defect; it is
   a wrong value on screen.

**What was kept from the attempts, because it was right anyway:** the frame
has NO `overflow-hidden` — corners are clipped by rounding the pieces that
actually paint (first/last header cell, the pager, the first card) — and the
horizontal scroller is back at every width, exactly as before DV1.

**Why dropping it costs little:** every list endpoint pages at 50 rows
(§5 above), so a header scrolls out of view only near the bottom of one page.
Weigh that against a nested scroll area, which is what the only remaining
alternative needs, and which §9 rules out by making the document the only
scroller.

#### 5a-ii. `nowrap`, and never wrapping an identifier

A column may set **`nowrap: true`**, which puts `whitespace-nowrap` on its
cells. Header cells are always `nowrap`, so a label like "Grade & section"
cannot stack into a column of single words.

**Default wrapping breaks at spaces AND AT HYPHENS** — corrected at the
2026-09-26 smoke gate. This paragraph used to say "spaces only", so that an
identifier with no space "cannot be broken at all"; Admin → Backups then
showed `parents_portal_2026-09-` / `26_203944.sql` at 1280. An LRN has no
hyphen and still cannot break, but **an ISO date, a login id like
`TCH-001` and a backup filename can**. So `nowrap` is the promise for any
value that must read as one, spaces or hyphens:

| Use `nowrap` for | Why |
|---|---|
| LRN, login id | an identifier that reflows is a wrong value (§5c) |
| grades, dates, times | `Sep 20, 2026, 1:30 AM` has spaces and must read as one value |
| an actions column | the icon cluster keeps one row and claims its own width — without it the buttons wrap under the text beside them and the neighbouring column appears to run into them |

Let names and free text wrap normally, at spaces. Only a genuinely
unbreakable long string in its own cell (an email) may use `break-words`.
**A backup filename is `nowrap`** (fix/smoke-gate `996e697`, both lists on
Admin → Backups): measured on the built page, 0 of 70 file cells on more
than one line at 1280/1024/768, table overflow 0 at 1280, and at 1024 the
table's OWN scroller (which already scrolled 31px) scrolls 137px — the page
never scrolls sideways. The actions and "Created by" there still wrap, at a
space, by decision: holding them on one line cost 40px of scroll at 1280.

#### 5a-iii. `renderCard` — the card layout below `sm`

Opt-in per page. A page that supplies `renderCard` gets stacked cards under
`sm` and the table from `sm` up; a page that does not is unchanged, which is
what let DV1 convert six consumers instead of twenty-two in one review.

**It returns DATA, never JSX** — `{ to?, onSelect?, avatar?, title,
subtitle?, meta?, status?, statusTone?, actions? }`. That is not a style
preference. A column's `render` returns cell JSX full of buttons, and reusing
it inside a card that is itself a link would nest a button in a link;
returning data makes that **unrepresentable** rather than merely discouraged.

**Exactly one interactive element per card**, a real `<Link>` or `<button>` —
focusable, Enter/Space, a visible focus ring, never an `onClick` on a div.
**A page with no single primary action passes neither `to` nor `onSelect`**
and gets a STATIC card: no chevron, actions in their own row beneath, where
they are siblings rather than children of something clickable. The Users
directory (Edit / Reset password / Deactivate are three peers) and Backups
(download / delete / restore, one of them irreversible) are both that case. A
card that looks tappable and is not is worse than one that never claimed to
be.

The table is unchanged by all of this: rows stay non-interactive `<tr>`s and
actions stay real buttons in the Actions cell, each with an `aria-label`
naming its row ("Edit Maria Santos") — a column of buttons all announced as
"Edit" is unusable with a screen reader.

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
management (status transitions) and excuse-letter review.

**The mechanical tell:** search the render for the same state object the
inputs write to. In `AttendancePage.jsx` the fix was to split one `marks`
object into `marks` (selection) and `recorded` (database), with `loadRoster()`
the only writer of the second. Comments at both declarations say so.

#### 5a-iv. `format/date.js` is the ONLY home for date maths

*(Part of §5a — DataTable's family — though it sits after §5b in this file.)*

**Frozen 2026-09-20 (DV2).** A page may format a date for display; it may
not compute one. **One sibling since pre-Stage-5 #7 (2026-09-26):
`format/schoolCalendar.js`**, the term dates of the school year and the
rule that turns today into a term — it follows rule 1 below to the letter
(strings compared with `<`, no `Date` ever built, a `Date` argument
throws), and its header says what its shape is: **it mirrors
`server/utils/schoolCalendar.js`, and the server decides**. The proof
loads both and asserts they agree; §13g has the one pattern built on it. `monthBounds` had lived in `parent/AttendancePage.jsx`
since 2026-09-09 and moved here the moment a second caller appeared, along
with `monthGrid`, `addMonths`, `daysInMonth`, `monthName`, `longDate` and
`weekdayName`. This is the file whose entire purpose is "local dates, never
UTC"; a second implementation anywhere else is how the bug comes back.

**Three rules, and the third is the one that gets forgotten:**

1. **IDENTITY IS A `YYYY-MM-DD` STRING, compared with `===`.** `config/db.js`
   sets `dateStrings: ['DATE']`, so a DATE column arrives from the API as
   exactly that text. Nothing is parsed, so there is no instant to shift and
   no timezone to get wrong. The attendance calendar matches a record to a
   day, and an excuse letter to an absence, by string equality — never by
   comparing two `Date` objects.
2. **A `Date` IS FOR PLACEMENT ONLY** — which weekday column a day falls in,
   how many days a month has — and always through the **local constructor**
   `new Date(y, monthIndex, d)`.
3. **Never `new Date(someString)`, and never `toISOString()`.**
   `new Date("2026-09-14")` parses as UTC midnight, which is 14 September
   08:00 in Manila but **13 September** anywhere west of Greenwich — the same
   class of bug as `toISOString`, and less obvious because it looks like
   ordinary parsing. `toISOString` has already cost this project two
   server-side bugs (a DATE column round-tripping a day backwards at UTC+8,
   and own-day attendance rejected as "in the future" for the first eight
   hours of every day).

The SSR proof for any date-bearing screen should include a **leap February**,
a **month starting on a weekend**, and a **December → January wrap** — three
cases that arithmetic gets wrong in three different ways.

##### TWO KINDS OF VALUE, TWO KINDS OF HELPER (UI-C1a, 2026-09-25)

The three rules above are about DATE columns. **They do not cover a
TIMESTAMP, and treating one as the other shipped a live bug for weeks.**

| The value | What it is | Helper |
|---|---|---|
| `absence_date`, `event_date`, `attendance.date`, `date_recorded` | `DATE` — a calendar day, no time, no zone. `dateStrings: ['DATE']` delivers it as the literal text `"2026-09-25"` | **`shortDate` / `longDate`** — string surgery, no `Date` ever constructed |
| every `created_at`, and **anything aliased from one** | `TIMESTAMP` — an instant, serialised by `res.json()` as UTC | **`timestampDay`** (day) or **`dateTime`** (day + clock), both via `Asia/Manila` |

**NEVER slice or split an ISO instant.** `String(created_at).slice(0, 10)`
was the idiom at seventeen call sites, and it is wrong by a whole day for a
third of every day:

```
stored             2026-09-25 07:00:00   (MySQL, time_zone = SYSTEM = PH)
on the wire        "2026-09-24T23:00:00.000Z"
.slice(0, 10)      "2026-09-24"          <- the PREVIOUS day
```

PH is UTC+8, so the UTC date rolls over at **08:00 local**: everything posted
between midnight and 07:59 displayed as yesterday. School mornings sit inside
that window. The DATE columns were never affected — `dateStrings` already
protected them, which is exactly what that config exists for.

**AN ALIASED TIMESTAMP IS STILL A TIMESTAMP, and this is the part that hides.**
`last_message_at` on `GET /messages/conversations` is `messages.created_at`
under another name. A grep for `created_at` does not find it, and both
Messages lists were still sliced after the first sweep declared the job done.
**Ask what the COLUMN is, not what the field is called.**

**The timezone is hardcoded to the school's**, not taken from the viewer. A
parent abroad and the teacher who posted must see the same day; the date a
school record belongs to is a fact about the school.

**The guard is in the helpers, not in review.** `shortDate`/`longDate` detect
a timestamp, `console.error` in DEV naming the helper, and in production fall
back to the Manila day rather than the raw string — safe first, loud second.

**Prove it under two timezones.** `TZ=UTC` and `TZ=America/New_York` must give
identical output, because a helper that reads the host zone passes on a
Manila laptop and fails everywhere else. `scripts/ssr-dates.jsx` does exactly
that, plus both 08:00 boundaries and a New Year.

##### A DATE SWEEP STARTS FROM THE SCHEMA (UI-C1b, 2026-09-25)

**The list of sites to convert comes from `database/schema.sql`'s DATE and
TIMESTAMP columns, never from a client grep of field names you already know
about.** The rule exists because the same sweep missed a site in each
direction:

- **A grep of the client missed `birthday`** — a DATE column on
  `students`, rendered read-only on both StudentDetailPages. Nobody thinks
  of a birthday as "a date field" while listing absence dates and event
  dates, so it was not in the search.
- **A grep for `created_at` missed `last_message_at`** — the aliased-timestamp
  case above, found only after the first sweep had been declared complete.

A schema column cannot hide from you the way a chosen field name can. Start
there, map each column to its renderers, and the list is closed rather than
remembered.

##### A COUNT OF DAYS IS NOT A COUNT OF HOURS (UI-C1b, 2026-09-25)

`backupAge` on the admin dashboard divided a millisecond difference by
86,400,000 and called `0` **"today"**. That answers a question about
duration with a word about dates, and the two disagree every night: a backup
taken at **23:00** and read at **01:00** the next morning is two hours old,
scored `0`, and reported itself as today's when it was yesterday's.

**`calendarDaysAgo(value, now)` reduces both instants to their Manila
calendar day FIRST**, then subtracts — so the answer depends on the date and
not the hour. It takes `now` as a parameter, which is the only reason the
proof can fix the clock and assert both sides of a midnight.

**`new Date(null)` is the EPOCH, not an invalid date**, so a `Number.isNaN`
check alone does not catch a missing timestamp — it silently becomes
1 January 1970 and reports itself twenty thousand days old. `manilaDayKey`
tests for nullish **before** it constructs the `Date`. Any helper that takes
an optional instant needs the same two checks, in that order.

#### 5a-v. The report card is a DOCUMENT, not a list — the one page that leaves DataTable

**Frozen 2026-09-21 (DV3).** `pages/parent/ReportCard.jsx` is the only
feature screen in the system that renders a table without `DataTable`, and
the exemption is narrow: **a fixed-order printed document with a known
minimum width**. Anything that is a list of records still uses `DataTable`.

**Why it could not be `DataTable`, in the order the reasons matter:**

1. **The printed order IS the content.** The card is read beside the paper
   the school hands out, so re-ordering the learning areas does not filter
   the document, it produces a different and wrong one. A sortable report
   card is not a smaller version of this feature.
2. **The general-average row lives INSIDE the table and is emphasised.**
   `DataTable` sorts every row it is handed, so a summary row sorts
   alongside the subjects it summarises — which is exactly why the old page
   kept the general average in a strip *outside* the table.
3. **The narrow layout is term segments plus a list** — pick a term, see the
   subjects — the opposite shape from §5a-iii's `renderCard`, which is one
   card per subject carrying all three terms.

**What it inherits anyway, because §5 is about the page and not the file:**
it **never fetches** (the page owns `report`/`loading`/`error`), and loading,
error — with `onRetry` — and empty all render **inside its own frame**,
behaving identically to `DataTable`'s. Being presentational is also what
makes the SSR proof possible at all.

**Four rules this card carries that are not `DataTable`'s:**

- **The printed subject order is a client constant.** `subjects` is
  `id, name, grade_level` with **no display-order column**, so the API can
  only sort by name and the card was alphabetical by accident of the query.
  Grades 4–6 use the SF9's own eight rows; **Grade 1 is PROVISIONAL** (the
  only Grade 1 sequence this repo holds is a class program, which is a
  timetable — see OPEN QUESTIONS); Grades 2, 3 and 5 are deliberately absent
  and fall back to the server's order. A subject the constant does not name
  is **appended, never dropped**. **Revisit trigger: Expo**, which cannot
  import a client constant — the order then belongs in
  `subjects.display_order`.
- **No descriptor on a numerical row.** The band word appears **once**, on
  the general average, with the legend below carrying the scale. `remarks`
  (`Passed`/`Failed`) is on the wire inside `descriptor` and reaches nothing
  (§4). Grade 1 keeps letter + descriptor per cell, because a bare letter
  means nothing without its word.
- **"Has a Final" and "has a General Average" are TWO flags, not one
  (2026-09-22).** They used to be the same boolean, spelled
  `mode !== 'descriptive'`, because a Grade 1 card had neither. Once the
  school's rule made the Grade 1 letter computed, a descriptive card gained
  a **Final letter** and still has **no general average at all** — so one
  flag could no longer stand for both, and conflating them would have put a
  General Average row on a Key Stage 1 card the moment the Final column was
  switched on. `showGeneralAverage` is keyed on the **mode**, never on
  whether the values happen to be null: there is no general average in Key
  Stage 1, complete card or not, which is a different statement from
  "pending".
  - **Descriptive mode renders the Final column** (headed *Final letter*,
    not *Final grade*) **and keeps the Final segment in the narrow layout** —
    a phone that silently drops a column the table has is a different report.
  - **Descriptive mode still OMITS the general-average row and strip
    entirely**, rather than filling them with "— N/A". §3 forbids a bare
    dash, and a row of N/A is noise for something inapplicable; one sentence
    in "Reading this report" says it instead.
  - **The Final cell needs TWO renderers, because `final_grade` holds two
    types.** A number in numerical mode, a letter in descriptive mode.
    `GradeValue` has no branch for a string and would print a real `A` as
    "— N/A", so the letter goes through `TermValue` — the same renderer the
    term cells use, which carries the descriptor with it.
- **A COMPUTED grade level may still have rows that compute nothing, and the
  card must not explain that away.** A legacy Grade 1 row (a letter typed
  before the rule existed, with no scores behind it) shows all three terms
  and **no Final**, because the Final averages the three Initial Grades and
  there are none. Two subjects reading A / B / C with different Finals is
  correct. The breakdown modal says the **row** predates kept scores; it must
  not say the grade level has none, which is what it used to say and is now
  false of the write path (§5i).
- **Term status is COUNTED, never computed.** "Term 2 partly recorded (2 of
  8)" comes from counting subjects whose term carries a value — the same
  definition `routes/dashboard.js` uses, so a shell row from
  `POST /api/grades` is correctly not counted. Green only at full coverage.
- **A NUMBER THE PAYLOAD CARRIES BUT THE PAGE MAY NOT SHOW NEEDS A RENDER-TIME
  GUARD, not a review (2026-09-22).** Every term on a descriptive card now
  carries a real `initial_grade`, because the server needs it to compute the
  Final letter — and Key Stage 1 reports letters to parents, not scores. "We
  did not render it" is not checkable by reading the file, so the SSR proof
  renders a descriptive payload holding known Initial Grades and asserts that
  **no spelling of any of them** appears in the markup: plain, `toFixed(2)`,
  `toFixed(1)` and rounded, across both layouts at once. Its negative control
  prints the value into a term cell and must turn those assertions red. The
  same guard belongs on any screen that receives a value it is forbidden to
  display.

#### 5a-vi. This card's layout crossover is measured on the CONTAINER, not the viewport

**Frozen 2026-09-21 (DV3).** The table/segments switch is
`@min-[36rem]` against the card's own `@container`, **not** `sm:`. Every
`DataTable` page still crosses over on `sm:` viewport width. **The
inconsistency is deliberate and this is the reason.**

**Found in the browser check:** at 200% zoom on a 1366px window the full
five-column table rendered — viewport ~683px, so `sm:` (640px) was met —
inside a container of roughly 394px, where it scrolled sideways and the
Learning area column scrolled out with it, leaving rows unlabelled.

**NO VIEWPORT BREAKPOINT CAN BE CORRECT HERE, because the container is not
monotonic in the viewport.** `Shell` revealed its 240px sidebar at the **same
`sm`** (until feat/ui-polish moved it to `md`, 2026-09-30), and `<main>` goes
from `p-4` to `sm:p-6` there — measured then:

| Viewport | Sidebar | `<main>` padding | **Card width** |
|---|---|---|---|
| 639px | hidden | 32px | **607px** |
| 640px | 240px + 1px | 48px | **351px** |
| 683px (200% on 1366) | shown | 48px | **~394px** |
| 768px | shown | 48px | **479px** |

Crossing `sm` **upward cuts the card from 607px to 351px**, so the table
switched on at the one width where its container was narrowest it would ever
be. Raising the breakpoint moves that cliff; it does not remove it.

**Since feat/ui-polish (2026-09-30) the sidebar appears at `md` (768px), not
`sm`**, and above that it is expanded or a 64px rail by the user's choice
(§9) — expanded was 240px then and is 256px since feat/ui-refresh. The
table above is a dated measurement; the cliff moved to 768px and
now depends on the rail too — which is exactly why this card measures its
CONTAINER and not the window.

**36rem = 576px, against a recounted minimum of ~558px** for the widest
realistic row: the four `nowrap` headers (~144 for "LEARNING AREA" + 80×3 +
120 for "FINAL GRADE", `px-4` either side) against body cells of
"Panlipunan" (~107) and `— Pending` (~98 each, and those cells are
`whitespace-nowrap`). **30rem was considered and is too low** — at 480px the
table still overflows and the defect returns in a narrower window. An
earlier estimate of ~474px in the same review was a rough count and was
superseded by this one. `overflow-x-auto` stays either way, so a wrong
threshold degrades to a scroller rather than to breakage. Confirmed in the
browser by sweeping 1100 / 1000 / 950 / 900 / 850: the table holds with no
horizontal scrollbar down to 900 and flips to segments between 900 and 850.

**Since feat/ui-refresh (2026-10-03) the row is narrower than that recount,
not wider.** The cells are `px-3` with `px-4` kept at the two outer edges
(`ReportCard.jsx:354–360`; every cell was `px-4`) — 32px less across the
five columns — and the type scale is Tailwind's own again (`text-sm` 14px,
FR5, 2026-10-04). The face is Source Sans 3 now and was not measured; the
558px figure was counted in the old face and was not recounted. 36rem only
gains margin. The sidebar is 256px or a 64px rail (§9).

**A FUTURE BROWSER CHECK MUST MEASURE THE CARD, NOT THE WINDOW.** A container
query does not move with the responsive-mode width readout, and a tester
reading the window width will conclude the breakpoint is broken when it is
working. Tailwind v4 ships container queries in core — no plugin — and the
generated rule should be grepped out of the built CSS (`container-type:
inline-size` plus `@container (width>=36rem)`), because **a variant that
generates nothing fails silently**, exactly as `h-9.5` did in DV1.

#### 5a-vii. Loading: a skeleton when nothing is on screen, and a re-read keeps what is (build 2, `feat/dashboards-look`, 2026-10-07)

**Skeleton loading, tier 1** — `DataTable`, the dashboard `Card` and the
report card (`ReportCard.jsx`); the phone's `DataList`, `Card` and
`ReportCardView` are MOBILE M11 / M23. Tier 2 (the class record, the class
summary, the roster, the calendar, the detail pages, the thread, Settings and
About) is deferred until after the Fri 2026-10-16 professor check — web,
then phone; the `queryKey` below is built (option 1, `feat/skeleton-querykey`,
2026-10-11). The owner's decisions of 2026-10-07, decision 1 as narrowed the
same day:

- **A skeleton is a placeholder SHAPED LIKE THE CONTENT** (decision 5) —
  bars where text will be, a circle where an avatar will be, inside the same
  frame (`components/Skeleton.jsx`): DataTable's real column headers over
  five rows (three card-shaped blocks below `sm` for a page with cards, the
  pager's strip when paged); a dashboard card's figure, lead figure, short
  list or the System card's facts (`skeleton` prop); the report card's
  learner row, six learning-area rows and the general-average band (none on
  a Key Stage 1 card once the mode is known). **The fill is `edge`** in both
  themes — about 1.27:1 light, 1.2:1 dark on `surface`, decoration only, so
  WCAG 1.4.11 does not apply, and never on the bare page — passed by the
  owner on the device in both themes (2026-10-08); `edge-strong` stays the
  one-line fallback (`FILL`). **No new token, no new contrast pair.**
- **An avatar circle where the rows have one** (fix round F4, 2026-10-08):
  a page whose FIRST column is a `PersonCell` and whose cards carry `avatar`
  passes `skeletonAvatar`, and the skeleton then draws a circle of Avatar's
  `md` size (2.375rem) beside the first column's bar and at the head of each
  card placeholder — the row is its real height. The table cannot know this
  before a row exists, so it is the page's to say: Admin → Users (both
  tables), both Students pages and Messages say it. **`skeletonAvatar="cards"`**
  (option 1) puts the circle on the card placeholders only, for a list whose
  cards lead with an avatar but whose table does not (its first column is a
  date, or a name with no circle): admin Attendance, teacher Attendance
  records, teacher Excuse Letters.
- **When** (decision 6, `hooks/useSkeleton.js`, mirrored): nothing painted
  for **300 ms** — a fast load never shows one — with the region mounted and
  the **height reserved** from the first frame (`invisible`, laid out); then
  the skeleton; gone **the moment loading ends, with no minimum display
  time**. A failed load shows the existing error and Retry; an empty result
  the existing empty state. The hook sets state only from its timer.
- **The shimmer is a SWEEP, finite, and none under reduced motion** (fix
  round F6, 2026-10-08 — the owner picked it over build 2's opacity pulse).
  One light band crosses the region left to right: every bar and circle is
  a `.skeleton-bone`, and `index.css` gives them, only inside a region whose
  `data-skeleton` is `painted`, a gradient band with `background-attachment:
  fixed` — so each bar shows its slice of the SAME band and the gaps between
  bars never show it (a browser that ignores `fixed` falls back to a band
  per bar). The band is `surface` in the light theme and `edge-strong` in the
  dark one — a light band in both, no new token. **Three passes of 1.5 s**
  (4.5 s, under WCAG 2.2.2's five seconds), then the bars stand still; the
  whole rule sits inside `prefers-reduced-motion: no-preference`. Only the
  background moves. It is the ONE loop in the app (§27c).
- **Accessibility** (decision 7): the region is `role="status"` +
  `aria-live="polite"` + `aria-busy="true"` with the spinner's own words
  ("Loading…" unless the caller names the wait) in an sr-only span; the
  shapes are `aria-hidden`.
- **A re-read keeps what is on screen, and makes it safe** (decision 1). The
  dashboard `Card` follows the rule exactly: `useCard` knows its query (its
  `deps`), so **the same query read again** (`reload`, the phone's focus
  re-read and pull, a parent's `refresh` counter) keeps the answer —
  `refreshing`, the content `aria-busy` and `inert` — while **a new query**
  never shows the old answer, not even for the render before the read starts
  (`cardView`), and gets the skeleton. The card's own link is not stale and
  stays live. **`DataTable` cannot tell a same-query re-read from a new
  query** — it is handed rows and `loading`, never the filters, the learner,
  the class or the day — so it keeps WHATEVER rows are on screen while it
  loads: the frame `aria-busy` and `inert` (no stale lock, mark or approve
  button can be pressed or tabbed to), greyed (`opacity-60`) once the
  re-read has taken the same 300 ms, and the skeleton only when nothing is
  on screen (a first load, a page the page itself cleared, C7's stale page).
  **A page whose query can change passes `queryKey`** (option 1,
  `feat/skeleton-querykey`, 2026-10-11) — its load's dependency array:
  filters, sort, offset, learner, class, day — and the rows then belong to
  the key they arrived under (`hooks/useSkeleton.js` `useQueryRows`,
  mirrored): the same key loading again keeps them as above (a socket
  re-read, a Retry); **a new key shows the skeleton from the render the key
  changes in, and never the old rows**; a load that ends with the SAME array
  (an empty result after an empty one) still counts as this query's answer,
  so the skeleton never stays on. No key: exactly as before, and the hook
  sets no state. 17 web pages (19 tables) pass one; parent Excuse Letters
  filters on the client and needs none; Admin → Users reads its two tables
  in one load and keys each by its own part of it. A keyed page passes a
  stable rows array (its state or a memo). It used to swap the rows for a
  spinner, which jumped the page on every re-read.
- **Proved by** `ssr-skeletons` (55: the phase table, `startRead` /
  `cardView` with a negative control that is the old one-flag view, the
  region in both phases, DataTable / Card / ReportCard rendered loading,
  kept, idle and failed) and `proof-skeletons` on the phone; the avatar
  circle and the sweep's built rules by `ssr-build2-fixes` (fix round); the
  `queryKey` rule, the cards-only circle and every consumer's key by
  `ssr-query-key` (20) and `proof-query-key` (16). The 300 ms, the sweep
  moving, the fill's look, a real filter change and what a screen reader
  says are the owner's check.

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

**Exception — Parent → Settings (2026-09-09).** The parent's `login_id` IS the
LRN, and this is the account screen, so the value is shown **locked** (not in
a URL, not as a second `lrn` field). It is their own credential on their own
account, not a third-party roster leak. Do not copy this onto Grades,
Attendance, Excuse Letters, or Messages.

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
- `StudentDetailPage` capitalised `gender` at the point of render (the stored
  value stayed `male`) until the privacy build removed the field
  (2026-10-10, §29e); the admin page's parent-account status is the example
  now — `pending` stored, "Pending" shown.
- Casing is applied **at the value, not inside a generic field renderer** —
  capitalising an address or an LRN would be wrong, so only fields whose
  stored form is lowercase by schema get it.

**Trade-off, accepted:** once rendered capitalised, a reader can no longer tell
from the screen what the literal database value is. The audience is teachers
and parents, not developers — and a developer has the API response, the schema,
and this note.

**Why this convention exists at all — a schema inconsistency deliberately NOT
normalised.** The four status vocabularies do not agree with each other in the
database, and the split is two to two:

| Vocabulary | Stored form | Capitalised? |
|---|---|---|
| `attendance.status` | `Present, Absent, Late, Excused` | yes |
| `excuse_letters.status` | `Pending, Approved, Declined` | yes |
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
**no-op for two of the five** vocabularies, and visibly changes only
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
that trains people to ignore warnings.** **Today both bulk pages guard, and
only while something is unsaved:** Teacher → Grades' class record since CR2
(§13d) and Teacher → Attendance since fix/server-reliability (§17c), each
with a dirty-only `beforeunload` — never a blanket one. **Since
`fix/leave-guard` (2026-10-01) ONE RULE covers every user-initiated exit on
the four bulk-entry screens** (web Grades and Attendance, phone Attendance
and the phone's Grades slot): a link, Back, a select that reloads, and the
exits that are BUTTONS — Log out, a notification row, and on the phone every
drawer item and the account card — all ask **"Leave without saving?"** with
**Stay on this page / Leave and discard**; the body sentence stays
page-specific. The buttons ask through `layout/leaveGuard.js` (mirrored to
the phone): a dirty page registers its dialog, `requestLeave(proceed)` runs
the exit at once when none is registered. **Every other form stays
unguarded** — this rule, not a blanket one. Session expiry is not
user-initiated and gets no prompt of ours. The rest of this
paragraph is how it read before either existed. Teacher → Grades had no
unsaved-changes guard then. Every score is its own request (Add score writes
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

**An empty state never repeats an action that is always visible in the page
header (added 2026-09-19).** Its message names the header button instead —
*"Use New message to start a conversation."*, *"Use Submit letter when your
child is absent…"* — so the one button stays the one place to look. A filter
or range reset MAY sit in the empty state, because it changes what the empty
state is describing, and it is not a header action. Audit of every
`emptyAction` on 2026-09-19: two primary actions were duplicated (both
Messages pages' "New message", fixed on D2; Parent → Excuse Letters'
"Submit letter", fixed on `fix/empty-state-duplicates`); the other twelve are
all filter or range resets and stay.

**Teacher → Attendance records has THREE branches since pre-Stage-5 #6
(2026-09-26), where it had two.** The page's Section picker gained
**"Everything I recorded"** — the value is the `MINE` sentinel (a string, so
it can never collide with a section id and `Number()` is never called on
it); applying it sends **no `grade_level` and no `section`**, so the server's
per-row teacher scope (`recorded_by = me` OR adviser of the learner's
current section) is the whole filter, and the table adds a sortable **Class**
column because the rows now span classes. It is the **default when the
teacher advises nothing** — the old "You have no advisory section" early
return is gone, since a former adviser with rows to read is exactly that
teacher. The three empty branches: a date range applied → *"No records match
these dates"* (reset offered); "Everything I recorded" with nothing → *"You
have not recorded any attendance yet"*; a section with nothing → *"No
attendance recorded for this section yet"*. Why the option exists at all: an
attendance row carries the learner's CURRENT class, so a section filter can
never surface the days a former adviser recorded for a learner who has since
moved — the print half of the school's "view and print" needed this view.

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
- **The strip waits for a real failure (the fix/socket-handshake fix round,
  R4, 2026-10-11).** `SocketProvider` also exposes `paused`, from the pure
  `realtime/liveState.js` (mirrored to the phone): the channel starts
  CONNECTING, and is PAUSED only after a failed attempt (`connect_error`), a
  lost connection (`disconnect`), or a first connect that has not arrived
  within `FIRST_CONNECT_GRACE_MS` (3 s). `LiveStatus` shows the strip on
  `paused` alone. Before this, `connected` started false and the strip showed
  from the first render until the first connect — on every reload, web and
  phone, with nothing failed (the owner's device check; the handshake
  admitted every attempt). The grace keeps an unreachable server honest: a
  refused port fails at once, but a host that does not answer would
  otherwise wait for socket.io's 20 s connect timeout. The words and Refresh
  are unchanged.
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

**THE INVERSE IS CLOSED FOR PARENT (2026-09-09) — by flipping the Messages
`built` flag, not by touching `Shell.jsx`.** 5g's fix moved `LiveStatus` into
`Shell`, above the routed page, so the notice reaches every page the badge
does. `UnreadProvider` is gated (`enabled={messagesBuilt}`); `LiveStatus` is
not. Parent → Messages landing with `built: true` turns the badge request on
for that role, so the strip now names a channel something on their screen
consumes. Gating `LiveStatus` was never done — it would have been the
flip-the-flag-later failure convention 6 forbids. **Admin had the inverse
then** (pages unbuilt, Messages `built: false`, ungated strip). **Closed
since 2026-09-19 (N2):** the strip is unconditional for every role because
every role's bell and badges ride the same socket — `Shell.jsx` carries the
note at its render; only `UnreadProvider` is gated (`enabled={messagesBuilt}`).

### 5h. Build and lint prove the code compiles, not that the page renders

**A Stage 4 page is not done until it has been opened in a browser.** This is a
stated limit of the verification chain, not a preference.

**Opening it is not the same as using it.** A render proves the component
mounts. Typing a full word proves the input works. That is the same rule
finding its own limit, not a separate convention.

**Five browser-only defects**, all in code that ran — so there was nothing for
a build, a lint, or a server test suite to fail on:

| Page | Defect | Why nothing caught it |
|---|---|---|
| Attendance | The Recorded column derived its value from form state, so it tracked the dropdown instead of the database (§5b) | Every request and response was correct. The bug was entirely in what was rendered |
| Messages | `useEffect` used in `Shell.jsx` without importing it — **every route for every role rendered blank** | A bundler resolves *imports*, not undefined identifiers; the reference only throws when the component renders |
| Contributions | Alert pair — success and error strips both visible after sequential actions | Each write was correct in isolation. Opening the page does not sequence two writes |
| Every Modal compose | Title/Amount (and Announcements Title, Events Title, Excuse Letters remarks, Messages search) lose focus after one or two characters | `Modal` re-focused the dialog panel whenever `onClose` changed identity. SSR does not run effects. **The 2026-09-07 reviews of Announcements, Events, Excuse Letters and Messages were not wrong — they were shallow in the same place: nobody typed more than two characters into those fields.** |
| Teacher → Grades (2026-09-22) | `closePanel()` still called `setLetterDraft('')` after the Grade 1 letter picker was deleted — **blank page for every teacher, not only Grade 1** | The same undefined-identifier shape as the Messages row above, but **one level worse: the call sits in a `useCallback` invoked from a `useEffect`, so SSR does not reach it either.** Measured, not assumed — an SSR proof rendering the page scored 32/32 with the defect in place |

**What each step actually proves:**

- `npm run build` — modules resolve and the bundle emits. It does **no** scope
  analysis of identifiers and **no** type checking, so an undefined identifier
  is invisible to it. This is not a misconfiguration; it is out of scope for a
  bundler.
- `oxlint` — the rules that are **on**. Its default category is `correctness`,
  and `eslint(no-undef)` is **not** in it, while `eslint(no-unused-vars)` IS —
  so out of the box the linter tells you about an import you stopped using but
  not about one you never made. That asymmetry is what let the same defect ship
  twice (Messages 2026-09-08, Teacher → Grades 2026-09-22).
  **`no-undef` IS ENABLED since 2026-09-22** and the asymmetry is closed. It
  took two config lines, not one, and the second is the reason it stayed off
  for so long:

  ```jsonc
  "env": { "browser": true, "es2024": true },
  "rules": { "no-undef": "error" },
  "overrides": [{ "files": ["scripts/**"], "env": { "node": true } }]
  ```

  The config declared no environment, so the rule alone reported **46 findings
  in `src/` and 6 more in `scripts/`** — every one a global (`window`,
  `document`, `localStorage`, `console`, `setTimeout`, `navigator`, `Blob`,
  `URL`, `sessionStorage`, and `process` in the two Node lint scripts), and
  **not one a real bug.** With the environments declared, `no-undef` reports
  **0** across the client and the oxlint total stays at the recorded **44**
  baseline: nothing to fix first, no waivers. Control: putting the
  `setLetterDraft` call back makes `npm run lint` name the exact line and exit
  `1`. **Check the survey scope when measuring this kind of thing** — the first
  survey ran against `src` only and reported 0 where the true figure was 6.
- The server test suites — the API. They never load the client.

**So the only step that proves a page renders is opening it.** Where a browser
is not available, an SSR render of the component reaches *some* of the same
failures: hooks are *called* during render even though their callbacks are
skipped, so a missing hook import throws under `renderToStaticMarkup` exactly
as it does in a browser. That is how the Messages blank-page bug was confirmed
fixed, with a negative control reproducing the original `ReferenceError`
before restoring the import.

**SSR cannot catch an undefined identifier inside a callback (2026-09-22).**
That is the harder half of the same shape and it is worth stating separately,
because the Messages row above makes SSR look like a general answer to blank
pages. It is not. An SSR render executes the **render path only** — a
`useEffect` body never runs, and neither does a `useCallback` body, so a
reference inside either is never evaluated. Teacher → Grades died on
`setLetterDraft` inside a `useCallback` called from a `useEffect`, and an SSR
proof extended to render that very page scored **32/32 with the defect in
place**. The negative control failed to fail. **For this shape the guard is
`no-undef`, not a render** — which is why it was enabled the same day.

**SSR also cannot catch the Modal defect.** `renderToStaticMarkup` does not run
effects. The Modal focus steal lived in an effect: it bundled two concerns
with different lifetimes — "focus the panel when the dialog opens" (a one-time
event) and "respond to the current `onClose`" (a value that changes freely).
Every Stage 4 compose page passes a function declared in the page body, so
`onClose` is a new reference on every keystroke, and putting it in that
effect's dependency array re-triggered the focus. **This shape is not
Modal-specific.** Any effect that mixes a one-time action with a
frequently-changing dependency will misfire the same way. Stabilising
`onClose` at one call site would hide it for that page and leave it for the
next four. The fix is in `Modal`: focus on `open` only; keep `onClose`
current via a ref for Escape.

**Practical consequence for a dispatch:** "build clean, lint clean" is a
necessary report, never a sufficient one. Say what was rendered and by whom.
If the page has a text field, say that a full word was typed into it.

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
  `built`. Currently none. Parent → Attendance was the only blocked item;
  it was unblocked 2026-09-09 by showing raw counts only, and the school
  answered the rate question 2026-09-13, so it now also shows a rate over
  recorded days. Teacher attendance encoding was never blocked.
- **unbuilt** — `built: false`, dimmed and non-clickable so it cannot drop
  the user into the catch-all redirect.

**A badge renders only on a BUILT item.** The Messages unread count lives on
the nav item in `Shell.jsx`, which renders for all three roles — so once it
existed it would have appeared on Parent and Admin too. A count on a dimmed,
unclickable entry is worse than no count: it announces something the user
cannot go and read. `UnreadProvider` therefore skips the request entirely
unless that role's Messages item is built.

**Live today for EVERY ROLE — the admin since 2026-10-05.** Admin had no
Messages item from 2026-09-18, so there was nothing to badge and
`UnreadProvider` never fetched for that role. The owner's SCOPE DECISION of
2026-10-05 (CLAUDE.md → ADMIN SCOPE AUDIT) brought it back, teacher ↔ admin
only, and the wiring proved itself flag-driven: the admin's built Messages
item gave the badge with **no edit to `Shell.jsx`**, and that dispatch built
no badge of its own. Admin → Messages was an ADD to `nav.js`, not a flip — no
`built: false` row stood for it. (This paragraph said, on 2026-09-18, that
the page "will not land"; it landed, by a later decision.)

**§5g's inverse was closed on 2026-09-18 and the gate removed on
2026-09-19.** For one day `LiveStatus` was gated on the same "does this role
have a built Messages item" test as the badge, so the strip did not render
for a role where nothing on screen was channel-fed. N1 made every role's
bell channel-fed, and N2 removed the gate: **`LiveStatus` renders for every
role** (`Shell.jsx`, the note at its render); only `UnreadProvider` is gated.
`SocketProvider` still connects for every role.

**NO ROLE HAS A `built: false` ITEM AS OF 2026-09-18** — the last five were
admin's, removed rather than left dimmed (see the SCOPE DECISION of that
date). **The state is not retired and the rendering branch is not dead:**
`Shell.jsx` still implements unbuilt and blocked, `/dev/ui` still renders
both so they stay reviewable, and Stage 5 or any future page will reintroduce
them. Do not delete the branch because production nav happens not to exercise
it today.

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

### 7b. Modal sizes — three, and `lg` is the ceiling

`sm` / `md` / `lg` (`max-w-sm` / `max-w-lg` / `max-w-2xl`). There is no
`xl`. **Teacher → Contributions' roster (2026-09-08) was the first Stage 4
content to hit that ceiling** — the page dropped a column and a second action
button rather than adding a size for one caller, the same "primitive shaped by
one page" failure the foundation dispatch existed to prevent. That page was
removed with Feature 7 on 2026-09-13, so **no current page reaches `lg`'s
width. A page that cannot fit `lg` is the trigger to reconsider the scale.**

### 7c. A write's result renders next to the control that caused it

**Frozen 2026-09-18, after Teacher → Settings.** `FormStatus` is the only
renderer for the outcome of a write. Three rules:

- **Placement.** Under that form's submit button; **inside the Modal**, under
  its action row, for a modal write; **above the list it describes** when the
  message outlives its modal ("Parent approved." after the dialog closes). A
  page with two lists gets two keys. **Never a single slot at the top of the
  page** — the page body scrolls and only the header stays (§9), so on a long page the confirmation for
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

**Added to this file on 2026-09-19.** It was frozen on 2026-09-18 and
recorded in `CLAUDE.md` only; the mirror gap was found while measuring for
the section trim, not caused by it. This is the CLAUDE.md text verbatim —
the worked examples behind it are on the 2026-09-18 `docs/CHANGELOG.md`
row and in `client/src/components/FormStatus.jsx`’s own header.

**Four pages had NO success message at all until 2026-09-26** (smoke gate,
fix/smoke-gate `7a9ff2b`): Parent → Excuse Letters (submit, edit), Teacher
→ Excuse Letters (review), Teacher → Announcements and Teacher → Events
(post, edit, delete). Each closed its modal and reloaded, and a changed row
was the only sign. They now follow Admin → Announcements: one keyed object,
set **after** the reload, `FormStatus` directly above the list, cleared when
any modal opens. Two conventions from that dispatch:

- **Where the page's `status` is already the FILTER, the write result is
  `writeStatus`** — both excuse-letter pages. Do not rename the filter.
- **Set the message AFTER any re-read that clears status.** Teacher →
  Attendance set "Attendance saved for N students." and then awaited a
  `loadRoster()` that opens with `setStatus({})`; React batched the two
  and the message was measured at **0 appearances** across a real save
  (`962b226` swapped the order). A success that is set and cleared in one
  batch never paints, and no build, lint or SSR proof can see it — only a
  DOM observer across a real write can.
- **A review message names what left the list.** A reviewed letter drops
  out of the default Pending view on reload, so "Letter from Last, First
  approved." says where it went.

### 8. Colors are tokens — no raw palette utility, no `dark:`, outside `index.css`

**Frozen 2026-09-19, `feat/design-tokens` (D1 of the Dark mode plan).** Every
color a page uses is one of the 71 semantic tokens defined once in
`client/src/index.css`: `page` / `surface` / `surface-muted` /
`surface-subtle` / `backdrop`; `edge` / `edge-soft` / `edge-strong` /
`focus-edge` / `focus-ring` / `focus-accent`; `fg` / `fg-secondary` /
`fg-body` / `fg-muted` / `fg-faint` / `fg-ghost`; `primary` /
`primary-hover` / `primary-fg` / `primary-disabled` / `solid-fg`; the tone
sets `neutral-*`, `success-*`, `warning-*`, `danger-*`, `info-*` (`-soft`,
`-edge`, `-fg`, `-strong`, `-icon`, `-solid`… only the slots something uses);
and the six `bubble-*` tokens for message threads. A page writes
`bg-surface`, `text-fg-muted`, `border-edge`, `ring-focus-ring`,
`hover:bg-surface-muted` — never `bg-white`, `text-slate-500`,
`border-slate-200`, and never a `dark:` variant.

**Why tokens and not `dark:`.** 1,029 raw utilities stood in 51 files before
this rule; a theme done with `dark:` would have been 1,029 second guesses
scattered through pages, each one a place for light and dark to drift. With
tokens a theme is a second block of values for the SAME variables in one
file, and a page cannot be half-themed. The two layers in `index.css` matter:
`:root` holds the raw values (light), each line naming the Tailwind palette
color it equals (since `feat/ui-palette`, the v3 hex of zinc and blue; the
status tones keep v4 oklch) or saying why it is hand-picked — and
`@theme inline` maps the Tailwind names to `var(--…)` —
`inline` is what makes `bg-surface` resolve at RUNTIME so a `[data-theme]`
block can swap the value; a plain `@theme` would bake the light value in.

**Enforced by `npm run lint:tokens`** (`client/scripts/check-color-tokens.mjs`):
it fails on any `(variant:)*prefix-family(-shade)?(/alpha)?` for every
Tailwind palette family across `bg`/`text`/`border`/`ring`/`divide`/
`placeholder`/`decoration`/`outline`/`from`/`to`/`via`/`shadow`/`fill`/
`stroke`/`accent`/`caret`, on any arbitrary color (`-[#…]`, `-[rgb…]`,
`-[hsl…]`, `-[oklch…]`), and on any `dark:` — anywhere under `src/` except
`src/index.css`. Zero matches is a done-condition of every client dispatch,
reported next to oxlint's 42.

**Same-value splits are deliberate.** Since `feat/ui-palette` (2026-10-01):
`page` and `surface-subtle` are both zinc-50 `#FAFAFA` in light (the page
background vs. a band inside a white card); `brand` and `bubble-mine` are
both blue-700 `#1D4ED8` in light (link text vs. your own message; dark gives
them different values); and `brand-panel` equals `surface-muted`, zinc-100
`#F4F4F5`, in light (the Login panel and parent hero vs. a hovered row). Do
not merge a pair because the light values match. (Until then the pairs were
`page` / `surface-subtle`, both slate-50, and `primary` / `bubble-mine`, both
slate-900; `primary` and `bubble-mine` now differ.)

**How light mode was proven identical after the codemod** — the record for
the next mechanical change of this size: (1) a token-equality script compared
every `:root` value to the palette color named in its comment (60/60);
(2) the codemod stopped on any unmapped class and any context-sensitive class
without a file:line override (75 class strings, 33 overrides, 1,029
replacements, zero errors); (3) an SSR snapshot of 38 renders taken before and
after, compared with `class` attributes stripped, was byte-identical, and the
number of class attributes per render was unchanged; (4) Darryl's six
baseline screenshots. Six accepted, named light-mode changes rode along:
E1 the two `hover:bg-slate-800` primary buttons now hover to `primary-hover`
(slate-700); E2 seven `text-slate-800` labels are `fg-secondary` (slate-700);
E3 Login's inputs focus with the shared `focus-ring`/`focus-edge` instead of
slate-500; E4 one `emerald-900` note is `success-strong` (800); E5 Login's
error box is `danger-soft`/`danger-strong` (rose) instead of red; E6 the
ErrorAlert retry link hovers to `danger-strong` (800) instead of rose-900.

**Dark theme (D2, 2026-09-19, `feat/dark-mode`).** The same 60 variables get a
second block of values under `[data-theme="dark"]` in `index.css` — that block
IS the theme; no page changed for it. Base: page slate-950, surface slate-900,
surface-muted slate-800, and `surface-subtle` a value BETWEEN slate-900 and
slate-800 (`oklch(24.3% 0.041 262)`, the one non-palette value) so a table
band and a hovered row stay distinguishable from an active nav item; text
slate-100 / 200 / 300 / 400; the primary button INVERTS (slate-100 with
slate-900 text, hover slate-300); tones use X-950 soft, X-800 edge, X-300
fg, X-200 strong, X-400 icon; the own bubble is slate-700 and theirs
slate-800 on the slate-900 card. Two dark-only collapses, accepted: `fg-faint`
= `fg-muted` = slate-400 (faint was used as text; slate-500 on slate-900 is
3.74), and `fg-ghost` = slate-500 (icons need 3.0). `backdrop` is slate-950 at
60% in dark (40% of slate-900 in light). `:root { color-scheme: light }` and
`[data-theme="dark"] { color-scheme: dark }` make date pickers, select
lists, scrollbars and radios follow; a dark-only `input:-webkit-autofill`
rule (inset box-shadow, the only thing Chrome honors) stops autofilled Login
fields lighting up pale blue. Shadows are kept as they are — cards and
controls carry a border, the modal and drawer sit on the backdrop — so nothing
depends on a shadow being visible. **The slate values above are D2's; since
`feat/ui-palette` (2026-10-01) the dark neutrals are zinc and the accent blue
— see the option C paragraph below.** The structure is unchanged: an
inverting primary, a between-value `surface-subtle`, the same two collapses.

**How the theme is chosen.** Light / Dark / System in Settings →
Personalization, stored on the device only under `pp.theme` (like text size,
same reasons), applied as `data-theme` on `<html>` by `pages/settings/theme.js`
(`readTheme` / `resolveTheme` / `applyTheme` / `saveTheme` / `initTheme`). A
fresh device is **Light**, not System. An invalid stored value reads as Light
and is left alone until the user picks. An inline script in `index.html`
mirrors the rules and sets the attribute BEFORE the bundle so the first paint
is right — it also paints `<html>` dark (background + color-scheme) because in
dev the stylesheet arrives from JS; `applyTheme` clears those two inline
styles on every apply so a runtime switch to Light leaves nothing behind (A2).
`initTheme()` in `main.jsx` registers the ONE `prefers-color-scheme` listener
that keeps System live. Login needs no code: the attribute is on `<html>`.
Any element with `data-theme="dark"` re-scopes its subtree — `/dev/ui` uses
that for a side-by-side token strip next to a page-only preview toggle.

**Contrast is checked, not eyeballed.** `npm run lint:contrast`
(`client/scripts/check-contrast.mjs`) computes every text / background token
pair that occurs (55 pairs then; 75 since `feat/ui-polish` — the count lives in `docs/TESTING.md`) in both themes from `index.css` itself: text
must reach 4.5, icons and UI parts 3.0; a failing pair is allowed only by an
in-script allow-list whose entries must each carry a marker in
`docs/KNOWN_ISSUES.md` — a pair can only be waived by writing it down. Add a
pair to the script when a page puts a token on a background it was not on
before. **Brand (D3, 2026-09-19, `feat/brand-chrome`).** `primary` WAS the
school's color from D3 until `feat/ui-palette` (2026-10-01) replaced it with
the option C blue (below): the seal's navy `#08027C` in light (hover
`#1C15A3`, disabled `#B5B3E6`, white text) and a lighter indigo `#ABA8F7` in
dark (hover `#C4C2FA`, disabled `#4B4890`, slate-950 text) — every primary
button, unread badge and segmented control took it with no page edit, which
is also how the blue arrived. Three tokens joined
(63): `brand` (text and icons in the school color: the seven content links,
the active nav item and Settings tab), `brand-soft` (the active-nav tint,
`#ECEBFC` / `#23204F`) and `seal-bg` (white in BOTH themes — the seal's disc
is artwork, not a surface, and `bg-white` is banned). The seal's green, gold
and red are never tokens; they would collide with the success, warning and
danger tones. `focus-accent` stayed sky under D3 so a focus ring never read
as "selected" beside navy brand links; since `feat/ui-palette` it is the
accent blue (the sky ring was a waived 2.71 pair). Which links are brand: the
in-content link-styled controls (`text-brand … hover:underline`); the
"← All …" back links stay `fg-muted`, the ErrorAlert retry stays
`danger-fg`. D3's numbers: brand on surface 16.03 / 8.22, on `brand-soft`
13.63 / 6.96, button text 16.03 / 9.29 — all in `lint:contrast`, nothing
waived for it (option C's are in the paragraph below). Light-mode AA fixes taken on D2 as named light changes: the table
header text (`fg-body`, 7.23), placeholders (`fg-muted`, 4.77), the Approve
buttons (`success-solid` emerald-700, 5.37; hover 800), and the 41 `fg-faint`
TEXT labels moved to `fg-muted` at their call sites (`fg-faint` is now icons,
the spinner, close buttons and `disabled:` states only). The nine waived pairs
are the KNOWN ISSUES rows marked `[contrast: …]`.

**Minimal neutral + one accent (`feat/ui-palette`, 2026-10-01) — the
owner's option C, web and phone, Light and Dark, every screen including
Login and Forgot password.** The owner found the UI too dark; the heavy
areas in Light were all tokens (the solid navy panel, navy buttons,
slate-900 own bubbles, near-black text). The branch first shipped option B
(navy-tinted neutrals, the seal navy, gold decoration) and the owner replaced
it with C before merge. New values for 39 of the 42 non-status tokens
against `main` (36 in light, 36 in dark; `solid-fg`, `seal-bg` and
`brand-panel-glow` are unchanged), same 71 names, no page or component
changed for it:
- **Neutrals are zinc**, not slate (no blue tint): light page `#FAFAFA`,
  surfaces `#FFFFFF` / `#F4F4F5` / `#FAFAFA`, text `#18181B` → `#D4D4D8`
  (`fg-muted` is the hand-picked `#66666E`, because zinc-500 is 4.44 on
  `surface-muted`); dark page `#09090B`, surface `#18181B`, text `#F4F4F5` →
  `#71717A`. The dark page is also painted on `<html>` by `index.html` and
  `theme.js` — keep the three equal by hand.
- **The ONE accent is blue**: `primary` blue-600 `#2563EB` (hover blue-700,
  white text 5.17), `brand` (links, the active nav text) blue-700 `#1D4ED8`
  (6.70 on white), `brand-soft` `#EFF4FF`; dark `primary` / `brand` blue-400
  `#60A5FA` with `#09090B` text. This replaces D3's school navy `#08027C` as
  `primary` by the owner's decision. **`focus-accent` is the accent too**
  (`#2563EB` / `#60A5FA`), no longer sky — the sky ring was the waived 2.71
  pair; blue is 5.17 / 6.97.
- **The brand panel is LIGHT in light** — a plain zinc-100 band `#F4F4F5`
  with zinc-900 text (16.12) and zinc-600 captions (7.03) on Login, the parent
  hero and the About header; dark is a zinc-800 field `#27272A` with white
  text (14.89). `brand-panel-lit` is recomputed (`#F6F6F6` / `#454548`). In
  light the panel's dots and rings are zinc-900 at low alpha (a white wash
  would vanish on it); in dark they stay white. A badge on the light panel
  is 1.00–1.06:1 against it, so its own ring edge is what separates it.
- **No gold, no navy, no green or red as tokens.** The seal's colours appear
  only in the seal itself; they would collide with the tones. (Option B's
  gold-as-decoration amendment was withdrawn with B.)
- **The four status tones are unchanged**, and Present / Late / Absent /
  Excused keep success / warning / danger / info. **The green Approve
  (`success-solid` emerald-700) now sits next to a BLUE primary** — distinct
  hues, both white-text fills.
- **`brand-panel-lit` is a probe, never a paint — no page paints it** (only
  the dev-only `/dev/ui` token strip shows it, as a swatch). The
  About pills (the phone chip and, since the fix round of 2026-10-01, the
  web pill) painted it and vanished on a light panel; both are `bg-surface`
  now (1.10:1 against the light panel, 1.19:1 dark; their text 17.72 in
  both themes).

Three waived pairs now pass and their KNOWN ISSUES rows are closed
(`fg-muted`/`surface-muted` 5.18, `bubble-theirs-meta` 5.18, `focus-accent`
5.17); `lint:contrast` is 0 unwaived, 75 pairs × 2 themes.

### 9. Shell chrome is sticky, and the seal is always on its white disc

**Frozen 2026-09-19 (D3).** The header (`layout/Header.jsx`, extracted from
Shell so a later dispatch could put a bell in it — N2 did: `NotificationBell`)
is `sticky top-0 z-30`; the sidebar is `sticky top-0 h-screen self-start`
with its nav box `min-h-0 flex-1 overflow-y-auto`, so the nav scrolls inside
itself only when taller than the viewport. **The document is the only
scroller**: one scrollbar, no layout shift, content scrolls under the header.
z-order: header 30, mobile drawer 40, Modal backdrop 50 — the drawer and any
modal cover the header. Below `md` the sidebar is hidden and the drawer takes
over (it was `sm` until feat/ui-polish). Do not add a second scroll container to `<main>`.

**The sidebar since feat/ui-polish (2026-09-30).**
- **Below `md` (768px) it is hidden and the menu button opens the drawer**,
  as the phone does (the breakpoint moved from `sm`; §5a-vi says why).
- **At `md` and up it is expanded (256px, `w-64`, since feat/ui-refresh —
  it was `w-60` before) or a 64px rail (`w-16`)** (`layout/Shell.jsx:568–569`),
  toggled from its own row under the brand block (below) and remembered per browser under
  **`pp.sidebar`** (`layout/sidebarPref.js`, read in the `useState`
  initializer — no flash, no `index.html` script). Default: expanded.
- **Grouped** (`layout/navGroups.js`, a separate file from `nav.js`, and a
  mirror itself since `feat/nav-drawer-groups` — the phone's drawer groups
  the same way, MOBILE_CONVENTIONS M20): Dashboard on top; the role's groups with small labels
  (admin Manage / Communicate / System, teacher My class / Communicate,
  parent My child / School) — a thin divider in the rail; **Settings and
  About pinned at the bottom**, then the **user card** with the ONE Logout.
  An item no group names still shows, in an unlabelled group.
- **The header lost its user block and Logout**; the bell is its rightmost
  control.
- **The user card never shows a parent's login id** — it is the child's
  LRN (§5c), and the card is on every page — nor does its name fall back to
  it. Staff cards show role · login id. **The avatar and name are a link to
  Settings → Account information** (`feat/nav-drawer-groups`), a sibling of
  the Logout button, never around it; in the rail the avatar is the link,
  labelled by `RailTooltip`.
  **Its Logout is an icon button** (UI-2): an `sr-only` "Logout" and a
  `RailTooltip`, so the name gets the width a worded button took.
- **The nav box shows no scrollbar** (UI-1): `[scrollbar-width:none]` plus
  `[&::-webkit-scrollbar]:hidden`. It still scrolls by wheel, trackpad and
  touch, and Tab scrolls a focused link into view.
- **The rail's labels:** each icon keeps an `sr-only` label, and
  `components/RailTooltip.jsx` shows it on hover and on **`:focus-visible`**
  only (never the browser's `title`, which focus never triggers). A
  pointer-down hides it until the pointer leaves (UI-11 — a mouse click left
  focus on the toggle and "Expand sidebar" over the page). **Portalled to
  `<body>` at z-45** (UI-8): as a child of the `sticky` sidebar — its own
  stacking context — its z-35 was painted over by the cards and the class
  record's sticky cells. z-45 is above the header (30) and the drawer and
  bell panel (40), below Modal (50). **Detached from its icon, it is hidden
  by any scroll or resize (`navScroll.js` `watchDismiss`, capture phase) and
  by a route change** (Condition B). It measures the wrapped control, not its
  wrapper. Escape dismisses it. A badge becomes a count on the icon's corner.
- **The active item is scrolled into view** (UI-10) on load, on each route
  change, on collapse/expand and when the drawer opens — nearest, no
  animation, by setting the nav box's `scrollTop` (`revealActive`), never
  `scrollIntoView`, which may scroll the page too.
- **The collapse toggle has ONE place** (fix round, 2026-10-06): a row of its
  own directly under the brand block, its 36px box 14px from the sidebar's
  left edge, in BOTH states — the same spot on the screen at 256px and in the
  rail, where it already was (centred under the seal, in line with the rail's
  icons). Until then it sat at the end of the brand row while wide and
  dropped under the seal in the rail. Its accessible names, the rail's
  "Expand sidebar" tooltip and its place in the tab order are unchanged.
  Since the F3 follow-up the row has 8px under it (`pb-2`), so the nav below
  can start on its grid (next bullet but one).
- **Messages is pinned** (fix round, 2026-10-06): its row is `sticky
  bottom-0` on an opaque `bg-surface` (`data-nav-pinned`, `Shell.jsx`). While
  its own place is below the fold it holds the bottom of the nav box, badge
  and all; scrolled to, it is back in its own place — never duplicated, and
  the groups, items and order are unchanged. Measured for a 1366×600 window
  since F3: the nav box is 288px wide / 240px in the rail (whole slots), and
  Messages' natural bottom is 432 / 480 / 624px (admin / parent / teacher)
  in both states, so without the pin it is below the fold for every role.
  **The groups are FLAT in `<nav>`**: each group's label (or the rail's
  divider) is a block of its own and its items are siblings after it,
  because a sticky row cannot leave its parent box and a per-group box would
  trap Messages inside a group that, on the teacher's list, itself starts
  below the fold. **Do not re-box the groups.** `revealActive` shortens the
  view by the pinned row and its gap (48px) for an active item ABOVE it, and
  never snaps to the stuck row; the nav box's `scroll-pb-12` does the same
  for a link reached by Tab.
- **No row shows cut in half** (fix round follow-up F3, 2026-10-06): the
  sidebar's nav is a grid of 3rem slots (48px; 54px at Large). Every block
  is one slot — a 44px row and its 4px gap — and **a group's label or the
  rail's divider takes a whole 44px block too** (`h-11`: the label at its
  foot, the divider across its middle); the `<nav>` has 4px on top (the
  first slot's gap) and nothing below, so the list is a whole number of
  slots; the pinned row and its gap are exactly one. The box is the largest
  whole number of slots that fits between the toggle row and Settings
  (`navScroll.js` `gridHeight`, measured by a ResizeObserver on the slot
  that holds it and on the `<nav>`; the leftover, under one slot, is blank
  below it), and `revealActive(box, pitch)` rests at slot starts
  (`snapToSlot`) — again when the grid's height lands after the first
  paint. So the top, the bottom, the pinned row's top and the end of the
  list all fall between rows wherever the app places the list; a scroll the
  user leaves mid-row is theirs. **Keep every nav block one slot tall.** The
  drawer below `md` is not gridded and keeps its 12px / 16px padding.
- **A stable scrollbar gutter on the app's pages only** (UI-6):
  `html:has([data-app-shell])` in `index.css`, so the bell no longer shifts
  between short and long pages. **Not on every `html`** (Condition A): the
  Login page would gain a gutter strip — its right edge measured
  pixel-identical before and after at 1366 wide in both themes, and a global
  rule changed it (the negative control).
- **A new page starts at the top** (fix round F5, 2026-10-08). The document
  is the only scroller and React Router leaves it alone, so a page opened
  from the sidebar or a link kept the previous page's scroll (the dashboard
  scrolled down, then Students opened at its bottom). `Shell` now asks
  `layout/scrollOnNavigate.js` `shouldScrollToTop` in a layout effect on
  every location change and scrolls the window to the top (`behavior:
  'instant'`) only when **the pathname changed on a `PUSH` or `REPLACE`**.
  **Back / Forward (`POP`) keep the browser's restore; a query-only change
  never scrolls** (a filter, a pinned `?term=`, Admin → Users' preset
  leaving the address). Messages keeps its own positioning — a thread opens
  at its newest message and brings the box into view after its messages
  load, later than this; since feat/shared-messages that is ONE component,
  `pages/messages/MessageThread.jsx` (§30), and
  `scripts/loop-messages-thread.mjs` drives it in Chromium. Proved by
  `ssr-build2-fixes`, which imports the rule and never reads source; a real
  scroll is the browser check.
- **A nav row draws its focus ring inside the row** (fix round F7,
  2026-10-08). The sidebar links used the shared 2px-offset ring, 4px
  OUTSIDE the row, and the nav box is a scroller with no bottom padding
  since the slot grid (F3) — so the pinned Messages row, stuck at the box's
  bottom edge, had the bottom of its ring cut off, expanded and in the rail
  (the same for any row at the very end of the list). Nav rows now use
  `-outline-offset-2` (`NAV_FOCUS`, as DataTable's cards draw theirs): same
  colour and width, the whole ring inside the row wherever it sits, the
  grid untouched. The user card's links sit outside the box and keep the
  outside ring.
- **The drawer is a modal dialog** (build 2, `feat/dashboards-look`,
  2026-10-07, the owner's decision 2): `<div role="dialog" aria-modal="true"
  aria-label="Menu" tabIndex={-1}>`, because it sits over the page, holds the
  focus and closes on Escape. It was an `<aside>`, which the print rules hide
  by element name, and `role="dialog"` is not allowed on an `<aside>` — so
  the div and its wrapper are `print:hidden`. The menu button says
  `aria-haspopup="dialog"` and `aria-expanded` (`Header.jsx`). **Two defects
  fixed with it** (decision 4): **Log out from the open drawer closes the
  drawer first** (`handleDrawerLogout`), so with unsaved work only the
  "Leave without saving?" dialog's focus trap is active — the drawer's and
  the dialog's both wrapped Tab, and Escape closed both; and **the drawer
  closes when the window reaches `md`** (`(min-width: 48rem)`, Tailwind's
  `md` in the browser's rem), where it was hidden but still mounted and its
  trap kept every Tab inside a panel nobody could see. Proved in
  `ssr-look-fixes` (source, each defect with a negative control); a real Tab
  and a real resize are the owner's browser check.
- **Width:** `<main>` is `flex-1 min-w-0`, so every page gets the window
  minus 256 or 64px; nothing else sets a width for it (its padding is
  `p-4 sm:p-6 lg:p-8`, `Shell.jsx:619`; the drawer below `md` is `w-72`,
  at most 85vw, `:350–354`). **No width cap** — f3's
  80rem centred cap (2026-09-30) was removed the same day by Darryl's decision.

**The seal** (`client/src/assets/school-seal.png`, 192 px, 24-bit, under 50
KB — rendered from the school's 447 px JPG, which has a white field and no
alpha) appears at the top of the sidebar and the drawer (40 px) beside
"Parent's Portal" / "Capt. H. Francisco ES", and above the Login title
(96 px). It always sits on a `bg-seal-bg` disc with `rounded-full` on the
image: the JPG's white field and the seal's blue ring need the white disc on
a dark surface, and the disc is white in both themes on purpose. **On the
light brand panel (since `feat/ui-palette`, 2026-10-01: zinc-100 `#F4F4F5`)
the white disc is only 1.10:1 against the panel**, so there the edge is
carried by the seal's own blue outer ring and, on Login (web and phone), the
faint zinc halo (`brand-panel-ring`, zinc-900 at 10%); the About header (web
and phone) has no halo and relies on the seal's ring alone — an eye check,
not a lint pair. On the dark panel (`#27272A`) the disc is 14.89:1. Alt text is
"Captain H. Francisco Elementary School seal" everywhere. The favicon set
(`public/favicon.ico` with 16/32/48 PNG entries, `favicon-32.png`,
`apple-touch-icon.png`) is generated from the same JPG on a white disc, by a
one-off System.Drawing script — not a build step; regenerate by hand if the
school ever supplies a new seal. `favicon.svg` is gone.

### 10. Notifications — the bell, the badges, and what a count is allowed to be

**Frozen 2026-09-19, after N1 (server) and N2 (client).** Four rules. The
first two are about correctness and the last two about honesty.

**A COUNT IS ALWAYS THE SERVER’S ANSWER, NEVER CLIENT ARITHMETIC.** The
socket event `notification_counts` carries no payload; it means *refetch*.
Nothing increments when a notification arrives and nothing decrements when
one is read — marking a row read calls `refresh()`, which re-reads
`GET /api/notifications/unread-counts`. This is convention 5b (a display of
DATABASE state never derives from local state) applied one component out,
and it is not hypothetical: the Messages badge had exactly this defect on
2026-09-07, when a locally-maintained number disagreed with the rows the
server still held unread. `UnreadProvider`’s header records that; this rule
exists so the second provider did not repeat it.

**TWO COUNTS, TWO SOURCES, NEVER SUMMED.** Messages keep their own count
(`GET /api/messages/conversations`, feeding the Messages nav badge);
everything else comes from the bell’s counts. They are joined only at the
point of rendering one number on one nav item. Messages are deliberately NOT
in the bell: `messages.read_status` already IS per-item read state, and a
second store for one fact means two places to mark read and two chances to
disagree. If the bell should ever mention messages, the fix is to read them
from the same endpoint — not to add two providers together. **The
new-message toast (§26, `feat/message-toast`) does not change this:** it
writes no `notifications` row, never touches the bell, and takes its count
from the same `GET /api/messages/conversations` rows the Messages badge
reads (`unread_count` for that sender) — the server's answer, not a tally of
socket events.

**BELL VS BADGE IS A DECISION, NOT A DEFAULT.** Every unread notification
rings the bell. Only some badge a nav item:

| | badged |
|---|---|
| Teacher, Parent | Excuse Letters, Announcements, Memos, Events |
| Admin | Users, and Announcements carrying **announcements + memos** |
| every role | Grades — **never**, bell only (Darryl, 2026-09-19) |

The Messages badge is not in this table on purpose — it is the other source
above, and since 2026-10-05 the admin has it too (Admin → Messages,
teacher ↔ admin; CLAUDE.md → ADMIN SCOPE AUDIT → SCOPE DECISION 2026-10-05).
A message still rings no bell, for the admin as for everyone.

Admin’s Announcements badge carries memos too because admin has no Memos
page — memos live on Admin → Announcements, the only place one can be
written — so a posted memo would otherwise ring a bell with no badge leading
anywhere. The visible consequence of excluding grades is that a parent’s
bell total EXCEEDS the sum of their badges. That is correct. Write it down
wherever it could read as a bug, because it will.

**A NOTIFICATION MUST BE OPENABLE.** Nobody is notified about an item they
cannot open, and "cannot open" includes having no page for it — not just
failing an API scope check. Admin is authorised by `GET /api/events` and is
still not notified about events, because admin’s nav has no Events page. The
rule is enforced twice, at different times: the fan-out picks the audience
with the matching list endpoint’s own `WHERE` (or a DECLARED narrowing,
never a widening), and every read re-checks visibility against live rows. If
a page is ever added for something currently excluded, BOTH places change —
flipping a nav flag alone will not do it.

**A VISIT CLEARS A BADGE'S INFORMATION ROWS (since `fix/f3-badges`,
2026-10-22).** Opening a badged page marks read the information rows that
badge counted — never a call to act, which still clears only on the decision.
The page sends its section; the server decides what it covers; the count is
re-read, never adjusted. §34 has the rules.

**Where the reasoning lives:** `server/utils/notify.js` (the audiences and
the three declared narrowings), `server/routes/notifications.js` (the
read-time re-check and the text), `client/src/realtime/NotificationProvider.jsx`
(the counts), `client/src/components/NotificationBell.jsx` (the panel and its
accessibility contract).

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

---

## 13. The class record — Teacher → Grades IS the grid (CR2, frozen 2026-09-22)

**§11 and §12 live in CLAUDE.md, not here** (this file stops at §10 for those
two). §13 is here because it is a page convention with room for the reasoning.
CLAUDE.md carries the rule statements and points at this section.

### 13a. Teacher → Grades IS the class record — the per-learner page is gone

`/teacher/grades` renders `ClassRecordPage`. `teacher/GradesPage.jsx` was
**deleted**, not left behind a flag: a second screen writing the same rows
through a different payload is two implementations of one contract, and the
one nobody opens is the one that rots.

**The picker is Subject → Class → Term, and every option comes from the
caller's own `GET /assignments`.** This closes UI-polish item 1 at its root:
Teacher → Grades used to default to whatever subject sorted first and load
with a red *"Araling Panlipunan (not yours)"* error on a perfectly normal page
visit. **A page must not open on an error.** An option the caller cannot
encode is not disabled or annotated — **it is not in the list**, because a
disabled option still asks the user to work out why. Subjects sort A–Z.

Grades 4-6 are **departmentalized** (the school, 2026-09-22): a teacher owns
one subject across several sections, so Class is the second axis, not the
first.

### 13b. The client never computes a grade — live values come from `dry_run`

The oldest rule in the Grades module, now under the most pressure: a grid
showing PS, WS, Initial Grade and Term Grade *as the teacher types* is exactly
where a client-side formula feels unavoidable. It is not, and it stays
forbidden.

**`PUT /class-record` with `dry_run: true` runs the whole save in the
transaction and rolls back**, returning what every row would hold. The grid
renders that. A second implementation of the computation would drift the first
time DepEd changed anything, and the two screens would disagree in the last
digit with no way to tell which was right.

**The header follows the same rule, and that took a second pass to get
right.** The first build returned only learner rows from the dry run, so
opening a column left the Highest-possible line reading 30 while the learners
beneath were already computed against 40. `group_hps` and the slot list now
come back from the dry run too, computed before the rollback, and the page
prefers them over the stored values exactly as it already does for learner
values. **The unwrap list names all three** (`['results', 'group_hps',
'slots']`) — §1: a FORGOTTEN key is silently `undefined`, and this is the
second time that has bitten (DV3 was the first).

A monotonic `previewTicket` ref drops a stale dry-run response that arrives
after a newer one. Without it, fast typing renders an older total last.

### 13c. The sticky learner column — decided here, and DV1b may cite it

**The learner name column is sticky; the table header is not.** These are not
the same question, and §5a-i does not close this one. A sticky HEADER needs
the page as its scrollport while containing a too-wide table needs the wrapper
to be one — a genuine conflict. A sticky COLUMN wants its `left` resolved
against that same horizontal scroller, which §5a-i deliberately kept, so no
conflict arises.

The cost §5 warned about is real and is paid here: **each sticky cell needs
its own background repainted**, on hover and on the emphasised row, or
scrolled content shows through it. That is why this is a decision per page and
not a `DataTable` default. **DV1b may cite this page as the precedent** for
the other consumers; it does not inherit it automatically.

A class record without it is unusable in a way a 50-row list is not — at
column 6 of 9 the teacher has lost track of whose row they are typing in, and
a wrong learner's mark is a worse failure than a wrong column's.

### 13d. The unsaved-changes guard is a capture-phase click interceptor

**`useBlocker` is not available: the app uses `BrowserRouter`, not a data
router**, and calling it throws *"useBlocker must be used within a data
router"*. That was caught by the SSR proof before a browser ever saw it.

The guard is a **capture-phase click listener** that intercepts in-app
navigation while the grid holds unsaved edits. What it does NOT cover on its
own, and how each of those paths is covered now:

- **The browser Back button is covered since pre-Stage-5 #5b (2026-09-26)
  by a `pushState` SENTINEL, not a data router.** A history pop is not a
  click, so the interceptor never saw it. `classRecord/backGuard.js` is a
  pure state machine — `transition(state, event) → { state, action }` — and
  the page performs only the action: `'dirty'` pushes ONE entry on the page's
  own URL (idempotent, so StrictMode's double effect cannot push two); a
  `popstate` while armed is `'ask'`, which opens the SAME leave modal with
  `pendingHref = 'BACK'`; Stay re-pushes; Leave backs once more, past the
  real previous entry; `'clean'` (a save, or the drafts discarded) consumes
  the sentinel with one silent `back()`, so a clean page needs a single Back
  press like any other; a pop on a clean page is `'none'`. **One effect keyed
  on `record.dirty` touches history only** (never state — the
  set-state-in-effect rule), one `popstate` listener lives for the page.
  `scripts/ssr-back-guard.jsx` drives every transition plus the one-sentinel
  negative control; the real Back press is the browser check. **Leaving
  through an in-app link while armed leaves the sentinel behind** (one extra
  Back from the next page) — accepted, `docs/KNOWN_ISSUES.md`.
- A reload or tab close is covered by a dirty-only `beforeunload`
  (`ClassRecordPage.jsx`) — never a blanket one (§5e).
- **The exits that are BUTTONS are covered since `fix/leave-guard`
  (2026-10-01).** The interceptor only hears `<a href>`, so Log out on the
  user card (`Shell.jsx` `handleLogout`) and a notification row
  (`NotificationBell.jsx` `openRow`) left at once and the drafts went with
  them (owner check). Both now call `requestLeave()` in
  `layout/leaveGuard.js`; while dirty the page registers
  `setLeaveGuard((proceed) => setPendingHref(() => proceed))`, so the SAME
  modal opens with the exit held as a function (the updater form, or React
  would call it). **The Subject, Class and Term selects ask too**: a class
  change reloads the record and `useClassRecord` clears every draft, which
  was a silent discard. A bell row whose link is this page does not ask.
  `scripts/ssr-leave-guard.jsx` drives the module; a real click is the
  owner check.

This is a real §5e exception and it is narrow: Teacher → Grades used to need
no guard because **every score was its own request**. The grid changed that —
one Save carries up to 40 learners × 9 columns, so one navigation can lose the
lot.

### 13e. The payload builder is a pure module, and why that is a test rule

`client/src/pages/teacher/classRecord/buildPayload.js` has **no React import
and no axios import**, so `test:class-record` — a server suite — can
`require()` it and send its real output to the real API.

**This closed a contract gap that every other suite still has.** Every other
suite builds its request bodies by hand, so none of them can produce what a
page actually produces. Defect 8 fell exactly through that gap: the grid sent
`{ type, slot_no, score }` for a column being created in the same save, the
server required `slot_id`, and the suites all passed because every one of them
wrote `slot_id` by hand. The browser said *"Each score needs a valid
`slot_id`"*; nothing in CI did.

**The negative control is the proof:** reverting the builder's slot lookup to
the defect-8 shape fails the new tests. Closed by construction, not by care.

**When a page's request body has non-trivial rules, extract the builder.** The
rule is not "extract everything" — it is that a payload shape the server
validates and the client constructs is a contract, and a contract needs one
test that exercises both ends.

### 13f. A failed build can leave the PREVIOUS bundle in place

Measured during CR2, and it cost real time: a JSX comment inside a ternary
branch broke the SSR build, and **the runner executed the stale bundle from
the previous run** — reporting failures that had already been fixed, and
success for code that no longer compiled.

**A build step's exit code is part of the test result.** If a proof harness
builds and then runs, the run is meaningless when the build failed. Check the
build exited 0 before believing anything the run printed. This generalises
past SSR to any two-step verification.

### 13g. The term is pinned in the URL, once, by `replace`, before the sentinel arms

**Frozen 2026-09-26 (pre-Stage-5 #7).** The class record and the class
summary open on today's term from the school calendar (§5a-iv), and a term
derived on every render is a hazard on one night a year: a grid open across
midnight on 15 September would re-key its `classKey` to Term 2 and reload
with a class's worth of drafts orphaned. So:

- **Derived ONCE**, in a lazy `useState` initializer (`pinnedTerm`), never in
  the render body — the same purity reason as §18i.
- **`term` is the URL's `?term=` when valid, else the pinned value**, and a
  mount effect writes the pinned value into the URL with
  `setParams(next, { replace: true })` whenever the URL carries no valid
  term. `replace`, not `push`: the page's own default must not cost the
  teacher a Back press. The effect's deps are complete (`params`,
  `setParams`, `pinnedTerm`), so it re-runs on every URL change and acts
  only when the term is missing — no exhaustive-deps warning, no loop.
- **Before the Back sentinel arms.** §13d's sentinel pushes
  `window.location.href` on the first edit; by then the replace has landed,
  so the pushed entry already carries `?term=` and a Stay after a Back lands
  on the same term. Nothing here is a `setState` in an effect — `setParams`
  is a router navigation.
- **A save at 00:01 still writes Term 1 rows**: the term is in the payload,
  not re-read. The parent dashboard re-derives freely; it is read-only.
- **The summary's `'final'` stays URL-only.** Nothing defaults to it.

**Parent → Attendance takes the clamp, not the pin.** Its initial month is
`clampMonthToSchoolYear(monthBounds(today))` — May opens on June, the summer
after on April — and its month LIST is still derived from data (DV2 Q6):
the calendar decides only where the page opens, never adds an empty month.

### 13h. Every column carries its group code

**Added 2026-09-26 (fix/smoke-gate `3162495`).** A group's name ("Written /
Oral Works · 20%") is ONE header cell over the whole group, and scrolling
puts it under the pinned Learner column (§13c) for most of the group's
width — measured at the smoke gate: fully hidden from 200 to 624px of
scroll with up to 429px of the group's own columns on screen. A bare "3" or
"PS" then says nothing about whose. So:

- **Slot headers show the CODE** — WW1…WW5, PT1…PT3 — the same shape as
  the exam columns' ST1 / ST2 / TE. A NAMED slot shows the code, then its
  name on a second truncated line (same 72px header row as the old two-line
  clamp; full name in the title and the Modal).
- **The summary columns are prefixed**: WW Total / WW PS / WW WS, PT …,
  ST … ("ST" by decision — the group's own codes are ST1 / ST2 / TE).
- **The code is built client-side from `type` + `slot_no`.** The API's
  `short_label` stays the bare number or the name — `test:class-record`
  asserts that contract and `buildPayload.js` mirrors it. Do not "fix" the
  server to match.
- Measured after, G6 and G1, 390 and 1280: 0 bare headers on screen at any
  16px scroll step; header row 59px unchanged; table 1845 → 1850px inside
  its own scroller (only "WW TOTAL" widens, 76 → 82px). **The sticky group
  label stays parked** — no longer needed.

**Set HPS → Done is a dry run** (the grid's `dry_run: true` PUT writes
nothing); **"Save all" writes** a grade row for EVERY learner in the section
— shell rows included — plus slots and components. A browser check that
saves ends with cleanup by id, backup first (CLAUDE.md working agreement).

---

## 14. The class summary — the adviser's sheet (CR3, frozen 2026-09-22)

Teacher → Class summary: one learner per row, every subject across the row in
the school's printed order, the General Average at the end. **Read-only** —
the adviser is not the encoder.

### 14a. A LETTER IS NOT A NUMBER — `TermValue`, never `GradeValue` directly

**The rule:** any cell that may hold a Grade 1 descriptive letter goes through
`format/TermValue.jsx`. `format/grade.jsx`'s `GradeValue` is for **numeric**
grade-bearing values only.

**The defect this is written from, because it shipped into a render and was
caught by the SSR proof rather than a browser:** the summary's cells were
passed straight to `GradeValue`. Its `formatGrade` does
`Number('A') → NaN → null`, and a null in descriptive mode renders **"— N/A"**.
So **every Grade 1 letter rendered as "not applicable"** — the one value that
*does* apply, displayed as the statement that it does not.

`TermValue` exists for exactly this and its own header says so. It also sets
`whole` once for every term cell in the system, so they cannot drift.

### 14b. Pending and N/A are different statements, and the difference is real

| Cell | Renders | Means |
|---|---|---|
| A recorded value | the number, or the letter | — |
| `null`, numerical class | **— Pending** | not yet computable |
| `null`, **descriptive** class | **— Pending**, not N/A | **not yet recorded** |
| a numerical value asked of a descriptive learner | — N/A | does not apply at this grade level |

**An unrecorded Grade 1 letter is Pending.** "Not yet recorded" and "does not
apply to this grade level" are different things to tell a teacher, and only
the second is N/A. `TermValue` encodes this by passing `'numerical'` to
`GradeValue` for an empty descriptive cell — the argument names **the reason a
null renders**, not the grade level the learner is at. I asserted this wrong
in the first SSR proof and corrected the assertion rather than weakening it.

### 14c. The General Average column is absent, not empty, in Key Stage 1

`show_final` and `show_general_average` are **two flags** (§5a-v). On a
descriptive class the server omits `general_average` from each learner row
entirely — **the key is absent, not `null`** — because the school computes no
such figure (`docs/GRADING_SPEC.md` §6a). A client that rendered a column of
"— Pending" would be claiming a number is coming that never will.

The SSR negative control for this forces `show_general_average: true` on a
Grade 1 payload and confirms the column **does** appear; without it, the
"no column" assertion would pass on any markup, including an empty render.

### 14d. The sticky learner column, and why this page is not a card list

Cites §13c's precedent. Same cost, paid the same way: **every sticky cell
carries its own opaque background and repaints it on hover**, or scrolled
columns show through it.

**No `renderCard` below `sm`.** Like the report card and the class record,
this is a **matrix**, not a list of records — one card per learner destroys
the cross-subject comparison that is the entire reason the sheet exists. It
scrolls sideways with the learner column pinned.

**Completeness under each column header** is `recorded / total` rendered as
"Complete" or "N pending". **Counted, never concluded** (§4) — never "behind",
never a colour.

### 14e. A page that fetches its own data cannot be SSR-proved

`renderToStaticMarkup` runs no effects, so a self-fetching page renders its
spinner and nothing else. **Extract the part that must be proved into a
presentational component and export it** — `ClassSummaryTable` and
`NoAdvisoryState` in `ClassSummaryPage.jsx`, exactly as `ReportCard` is
presentational for the same reason.

This is not "extract everything". It is: **if a state has to be proved, it has
to be reachable by passing props.**

### 14f. Nav has three states, and none of them means "not for you"

The Class summary item is `built` for **every** teacher, not only advisers.
`layout/nav.js` has built / blocked / unbuilt (§6); inventing a fourth state
for one page would be a real convention change. **A teacher who advises
nothing gets a page that explains itself** — "Class summary is for class
advisers. You are not assigned as an adviser of any section." — which is
better than a dimmed row with a tooltip, and better than a 403 they must
interpret.

### 14g. `ReportCard` is reused unchanged; what differs is what is passed

The adviser's drill-through renders the same component the parent sees. A
second card for a second role would be a second implementation of one
document, and if the two can disagree, the conversation those people have is
about the software rather than the learner.

**`onOpenTerm` is omitted**, so no term cell is a button and the parent's
raw-score breakdown modal does not exist on this view. An adviser who wants
the scores behind a mark opens the class record, which is the screen that owns
them.

**The Grade 1 breakdown stays silent about how the letter is produced.** That
was once justified by "silence is honest until the school answers"; the school
answered on 2026-09-22 and it is built, so that justification has expired.
**The silence is now a deliberate choice** (Darryl, 2026-09-23), consistent
with parents never seeing weights or Initial Grades. Do not re-add a sentence,
a hedge or a tooltip.

**The drill-through routes on `students.id`, never the LRN** (§5c), even
though this is a teacher surface — the rule is about what goes in a URL.

---

## 15. The parent dashboard — the hero, the term, and the strip (DV4, frozen 2026-09-23)

§12 (in `CLAUDE.md` only) owns what a dashboard *card* may do. This section owns the parent page,
which is the only dashboard with a hero panel and the only one that shows a
learner's own grades.

### 15a. ONE term, and it is today's term from the school calendar

**The hero and every subject list on the page use today's term from the
school calendar (`format/schoolCalendar.js`) — the `current_term` setting
until pre-Stage-5 #7 retired it on 2026-09-26. Never "the latest term that
has data."**

The first build walked terms 3 → 2 → 1 and used the newest that carried a
letter. On the seeded Grade 1 learner that surfaced **"Term 3 · C"** — one
stale letter from a term the school has not reached — while the Grades card
directly beside it, and the numerical learner's card, both said Term 1.

**One screen showing two different terms is worse than showing nothing**,
because a parent has no way to tell which is current and no reason to suspect
the question. The calendar's term is one pure call on today's date — the same
rule the server's dashboard, the class record and the class summary use — and
it makes cross-term mixing structurally impossible rather than merely
unlikely.

There is no settings read here any more, so nothing to fall back from: the
card and the **Term 1 fallback** that guarded a failed `current_term` read
went with the setting (#7, `ParentDashboard.jsx`).

### 15b. Key Stage 1 lists EVERY subject; the numerical card does not

Deliberate asymmetry, and the reason is the caption above each list.

| Card | List | Why |
|---|---|---|
| Numerical | only subjects with a term grade | the `Stat` caption already says **"N of M subjects recorded"**, so nothing is hidden |
| **Key Stage 1** | **every subject, `Pending` where there is no letter** | there is **no such caption** — §12 refuses a count or a progress bar for KS1 — so the list is the only place a parent can see what is still to come |

Both cap at four rows plus "+N more"; a card is a doorway, not the report card.
Values render through `TermValue`, never `GradeValue` directly (§14a) — a
letter is not a number.

**If §12's no-count rule for Key Stage 1 is ever revisited, this asymmetry is
what should be revisited with it.** It exists to compensate for that rule, not
independently of it.

### 15c. The weekly attendance strip — three states, told apart three ways

`attendance` holds only days someone **marked**. A date with no row is a
weekend, a holiday, a suspension, or an adviser who has not marked it yet, and
nothing in the schema can separate those — there is no school calendar (the
pre-Stage-5 CAL item). **Only "weekend" is derivable**, from the date itself.

| State | Tile | Glyph |
|---|---|---|
| Recorded | toned fill, solid edge | `P` `L` `A` `E` |
| Weekend | plain muted fill, **solid** edge | `·` |
| **Not recorded** | **dashed edge, empty centre** | *(none)* |

**"Not recorded" must never read as absent.** A parent seeing a gap where
Friday should be must not read it as their child missing school. The first
build gave weekend and not-recorded the same muted fill and differed only by
glyph — `·` against `–` at 12px, which in the browser were near-identical.

**The dash must also be unmistakable from Absent**, which stays a solid
red-edged tile carrying `A`. So the three differ by **shape, glyph and
accessible name**, and none of them depends on colour alone.

**A real weekend RECORD wins over the derived weekend.** `POST
/api/attendance/bulk` has no weekday validation, two fixtures have recorded a
Saturday, and whether the school holds weekend classes is an open question.
Deriving "weekend" from the date and then hiding a row the database holds would
make the strip disagree with the totals beside it.

**A legend separator is never one of the glyphs it separates.** The legend used
middots as separators *and* `·` as the weekend symbol, so that entry rendered
"· · weekend" — two identical marks where one is the thing being explained.
Separators are `|`.

### 15d. `Stat` takes a formatted value; it does not format

`pages/dashboards/Card.jsx`'s `Stat` renders `{value}` verbatim, and that is
the fix rather than the bug. It also renders `"3 of 5"`, an unread **count**
and `"Pending"`, none of which may gain decimals.

So a caller with a grade-bearing value passes the renderer in:

```jsx
<Stat value={<GradeValue value={average} mode="numerical" />} caption="General average" />
```

The dashboard printed `87.5` against the report card's `87.50` until DV4 — one
number, two spellings, two screens. **Split at the call site**, exactly as the
2026-09-22 rounding fix split `GradeValue`'s `whole`.

### 15e. The whole card is the link, and every card leads (`feat/ui-polish` f2, 2026-09-30; the layouts rewritten by build 2's Part C, 2026-10-07)

All three roles, web and phone. **No "Open →" row.**

- **Web: the TITLE is the link, its `::after` stretched over the card**
  (`after:absolute after:inset-0`), so a click anywhere opens it and the
  keyboard meets ONE tab stop, named by the title, ringed on the whole card.
  **The card is never an `<a>`**: Retry, and the System card's backups link,
  would be interactive content inside a link. Anything interactive inside a
  card is `relative z-10`. **An error card does not link** — its one action
  is Retry.
- **Phone: the card is a `Pressable`, `accessibilityRole="link"`**, press
  feedback a plain style function on a Pressable with no `className` (the
  frame sits on the View inside). Not pressable in error, as on the web.
- **THE ONE EXCEPTION: the admin's Users card** (build 2, the owner's
  decision 3, 2026-10-07; titled "People" until the fix round, F2,
  2026-10-08). Students, Teachers and Parents share one card and open
  DIFFERENT lists, so the card has no `to` (phone: no `onOpen`) and **each
  count is its own link** — a real `<Link>` (phone: a `Pressable`,
  `accessibilityRole="link"`) named by its label, number and caption, a
  44px / 48dp target with the control radius, a hover tint and the shared
  focus outline, a chevron. Students opens Admin → Students. **Since the fix
  round (F3) Teachers and Parents open Admin → Users already filtered to
  what each counts** — `server/routes/dashboard.js` counts every teacher
  account, any status, and active parents — so Teachers is
  `?role=teacher` and Parents `?role=parent&status=active` (phone: a
  `preset` navigation param with the press's moment as its key). Users
  opens on the preset APPLIED — the first read filtered, the controls
  showing it, no "Changes not applied" — reads only a role and a status it
  offers (never a search, a login id or an LRN, §5c), and the preset leaves
  the address on Apply or Reset. `AdminDashboard.jsx` `CountLinks`; phone
  `countRows` / `presetFilters` in `admin/dashboard/logic.js`. Any other
  card that wants several destinations is a new decision, not this
  exception.
- **Every card opens on a number or the next action, as `Stat`.** A count is
  printed at 0 once there is anything to count; none keeps the card's empty
  copy. Key Stage 1 still has no count (§12), and there is still no partial
  average. **One exception, both dashboards' Upcoming events (`fix/f3-badges`,
  the B3 device check's finding #1, 2026-10-23):** the next event's NAME
  leads, and a name is a line, not a figure — so the card writes its own two
  lines instead of `Stat`: the name at the parent Messages card's sender line
  (`text-sm font-semibold text-fg`, `break-words`), then "Next event ·
  <date>" in `Stat`'s own caption classes. `Stat` itself is unchanged. Its
  shared `list` skeleton still draws a figure-sized first row (an OPEN,
  accepted KNOWN_ISSUES row).
- **THE LOOK (Part C, 2026-10-07):** one blue accent (palette C) and no new
  token. **Cards:** the container corner `rounded-xl` (§27f), the hairline
  edge, **no shadow at rest**; a card that links darkens its edge
  (`hover:border-edge-strong`, `transition-colors`) instead of lifting; **the
  icon inline before the title in `text-fg-muted`, no tinted chip** — one
  header row; the serif title stays (§27); the amber frame stays (§12).
  **Heroes:** `rounded-xl`, no shadow; **the staff hero's facts are ONE line**
  of `text-sm text-brand-panel-muted` joined by " · " (the role line's own
  pair, 7.03:1 light / 10.08:1 dark) — no pills, no fact icons — and the
  hero is staff only; **the parent hero's labels lose their uppercase
  tracking** (the same words, `text-sm font-semibold text-brand-panel-muted`).
  The phone's `Stat` takes tabular figures, as the web's always had.
- **LEAD CARDS (Part C) — the 69bae24 parent layout, recorded here as final
  on 2026-09-30, is superseded by the owner's decision of 2026-10-07:**
  - **Admin** (`sm:2 / lg:4`): **"Waiting for approval" leads, two columns**
    (amber while something waits, `Stat large`), then **the Users card, two
    columns** — the two share the first row at `lg` — then **System across
    the page** (`sm:col-span-2 lg:col-span-4`). No `compact` tiles. **The
    lockout notice stays above the grid, COMPACT since the fix round (F1,
    2026-10-08)** — `pages/dashboards/HazardSlot.jsx`, on the teacher
    banner's pattern: the warning on one line with "Why this matters" (the
    long explanation, word for word, behind a button with `aria-expanded`)
    and "Confirm your email" on the right, wrapping under the text at
    390px. **Its space is held from the first frame:** while the dashboard
    loads and the session's `email_verified_at` is empty, the same notice is
    laid out invisible (`aria-hidden`, `inert`), so the server's flag shows
    it in place instead of pushing the cards down; a confirmed email holds
    nothing (the warning cannot be true). The one jump left is a second
    active admin inserted straight into the database. Still shown only on
    `hazard.single_unverified_admin`, not dismissible, naming no account.
  - **Teacher** (`sm:2 / lg:3`): unchanged — **"Excuse letters to review"
    leads**, first, `sm:col-span-2`, `Stat large`; no width leaves a hole.
    Upcoming events leads with the event's name as a line (above), as on the
    parent's.
  - **Parent** (`sm:2 / lg:3`): **Grades leads, two columns, beside
    Attendance**; then Messages, Excuse letters and Upcoming events; then
    **Announcements & memos across the page** (`sm:col-span-2 lg:col-span-3`)
    **as a list** — the unread count, then one row per post, its title and
    its kind, a hairline between. Grades is one normal-size line ("1 of 8
    subjects recorded · Term 2") or the average, then the recorded subjects;
    Excuse letters is the small `StatusBadge` then "Absence on …", or "No
    excuse letters."; Upcoming events is the next event's name as a line,
    then "Next event · <date>" and the rest of the list; Attendance keeps its
    large absences number.
  - **The phone stays one column**, in the web's DOM order — so the parent's
    Announcements & memos moved to the end there too — with the same cards,
    wording and emphasis (`gradesLead`, `letterLead`).
- **Row height:** every dashboard row stretches to its tallest card (the
  grid default) — the admin grid's `items-start` went with its tiles.
- **The keyboard focus outline is `brand`, 2px, offset 2px, on the
  `<section>`** (UI-5), keyed on `.card-link:focus-visible` so an inner link
  does not light the card. It sits on the page, where `brand` is 15.31:1
  (Light) and 9.29:1 (Dark) — `lint:contrast` asserts the `ui` pair. The
  `focus-ring` ring it replaced was 1.18:1 and 1.95:1.
- **The phone's lead words are pure helpers in each role's
  `dashboard/logic.js`**, asserted by its proof; the web builds the same words
  inline, except the parent's Grades and Excuse letters (above). The announcements & memos count is the bell's `announcements + memos`
  (§10), because posts carry no read state of their own.

---

## 16. `renderCard` at scale — four families, and two declared exceptions (DV1b-a, frozen 2026-09-23)

§5a-iii froze the contract. This section is what it looked like applied to
every remaining consumer at once, which is where the shapes became visible.

### 16a. FOUR FAMILIES, not one card per page

Fourteen pages, four shapes. **Copy the family, not the neighbour** — a card
invented per page is how fourteen slightly different lists happen.

| Family | Pages | Shape | Precedent |
|---|---|---|---|
| **Content list** | teacher / parent / admin Announcements, Memos, Events (7 tables) | title = headline · subtitle = body preview · meta = audience + date | `admin/StudentsPage` |
| **Conversation** | teacher + parent Messages | `to` the thread · avatar + title = the other person · subtitle = last message · meta = date + unread | `admin/UsersPage` |
| **Record** | teacher + parent Excuse Letters, teacher Attendance records, admin Attendance | the person or the date leads · the rest in meta · `status` = the badge | `admin/StudentsPage` |
| **Grade row** | `admin/GradesPage` | subject = title · terms = subtitle · Final = meta | none — see §16c |

**Every fact appears once.** A field in `title` may not reappear in `subtitle`
or `meta`. That is the card-side form of UI-polish 2, and it is checkable
mechanically: no `row.x` in two slots. `client/scripts/ssr-dv1b-a.jsx` asserts
it for all 15 card definitions, with a control that feeds a duplicate and
confirms the rule fires. (It was written at `client/` root and **moved in
DV1b-b** — §17a.)

**Several cards deliberately carry NO interactive element**, and that is the
contract working rather than a gap. An excuse letter is tappable only while
the viewer may actually act on it — Pending, and for a teacher only in a
section they advise — because the API answers `403` otherwise and a tap that
403s is a dead end. Announcements and events carry Edit and Delete as two
peers underneath, no chevron.

### 16b. A page with TWO lists keeps TWO labelled groups

`admin/AnnouncementsPage` renders announcements and memos as separate tables,
and below `sm` they stay **two labelled card groups, never interleaved**
(Darryl, 2026-09-23). A memo has no audience and an announcement always does —
that distinction is the reason the page has two lists at all, and a merged
stream destroys it.

### 16c. DECLARED EXCEPTION — `admin/GradesPage`'s card carries JSX

The contract says a card returns **data, never JSX**. This one does not, and
the reason is a rule collision rather than convenience.

**Why the data-only rule exists:** to make a button-inside-a-link
unrepresentable. `GradeValue` and `TermValue` are read-only renderers with no
interactive element, so they cannot create that hazard.

**Why the alternative is worse:** formatting a grade as a string here would be
a second implementation of §3's rule that **one renderer draws every
grade-bearing value**, and it would quietly reintroduce the "87.5 against
87.50" defect DV4 had just fixed one component away (§15d).

**§3 outranks data-only when they collide.** A card may carry a read-only
renderer; it may still never carry an interactive element. If a second page
ever needs this, it is the same exception, not a new one.

### 16d. Copy that differs by role for the same fact is a defect, not a nuance

Found while converting, recorded rather than fixed. The same audience renders
three ways: teacher **"School-wide"** / **"Grade 6 (whole grade)"**, admin
**"Everyone at the school"** / **"All of Grade 6"**, parent **"For everyone at
the school"** / **"For your child's year level"**.

**The parent wording is right and stays** — it is deliberately written to the
reader, and §5c-style audience labels come from the target columns' nullness,
never from `user.grade_level`. **The staff wording should be ONE label per
audience**, because a teacher and an admin discussing the same post should not
be reading different words for it. `docs/KNOWN_ISSUES.md` has the row.

---

## 17. The encode roster, and where a proof lives (DV1b-b, frozen 2026-09-23)

The fifteenth and last DataTable consumer, and the one `renderCard` could not
express. Five rules; the first two are about the proof rather than the page,
and they are here because both were learned by shipping the defect.

### 17a. A proof script lives in `client/scripts/`, and it is a LINT boundary

`.oxlintrc.json` gives `env.node` to `scripts/**` **only**. A proof at
`client/` root therefore has no `process` global, and `no-undef` — enabled
2026-09-22 for exactly this class of defect — reports it as **two errors**.

DV1b-a shipped that way and **reported "oxlint 43, unchanged"**, because it
ran lint BEFORE writing the proof and never again after. The errors sat on
`main` for a dispatch. Nothing else caught them: the proof itself ran fine
(node has `process`), the build never touches `scripts/`, and the suites
never load the client.

**So: run lint AFTER the last file of the dispatch is written, and say so in
the report.** Not "lint passes" — *when* it ran. A check that ran before the
file it was meant to check is not a check, and "43 unchanged" reads
identically whether or not it was.

### 17b. Pure logic a proof must DRIVE lives in a helpers module

`renderToStaticMarkup` cannot click a button. Every rule in 17c below is a
state transition, so none of it is reachable through a render — which is
§14e's finding ("a self-fetching page cannot be SSR-proved") arriving from
the other direction: there the data could not get *in*, here the behaviour
cannot be triggered at all.

`client/src/pages/teacher/attendance/roster.js` holds it — `rowState`,
`pickStatus`, `markRestPresent`, `rosterCounts`, `unsavedCount` — with **no
React import**, so the proof calls the functions directly. Same reason as
`buildPayload.js` (§13e), different consumer: that one is imported by a
server suite, this one by an SSR proof.

It also keeps lint quiet. Exporting non-components beside components trips
`react(only-export-components)` — five times over here, which would have
moved the oxlint baseline for a reason nobody would remember in six weeks.
**The page still exports its two components** (`StatusButtons`,
`RosterCards`) so the proof can render them; markup stays on the page,
behaviour moves out.

### 17c. The encode roster — bespoke exemption #2

`parent/ReportCard.jsx` was the first (§5a-v). This is the second and they
are unrelated: that one is a fixed-order printed document, this one is a row
whose interactive element is **four choices**, where `renderCard` allows
exactly one `<Link>` or `<button>` (§5a-iii). **Below `sm` the roster is its
own card list; the table is unchanged above it.**

- **Four buttons, and the `<select>` is gone at BOTH breakpoints** — not
  widened, not restyled. A select on a touch device costs two interactions
  and a system sheet per learner; a forty-learner roster is eighty.
- **Full words — `Present`, not `P`.** An initial is unreadable to anyone who
  has not been told the legend, and there is no legend.
- **`h-11` (44px) minimum, and `aria-pressed`**, so the state is announced
  rather than only drawn.
- **Selected is NEVER colour alone** — a tone fill **plus** a 2px border
  **plus** bold. The four tones are Present/Late/Absent/Excused, and the two
  a colour-blind reader is likeliest to confuse are the two that matter most.
- **A SAVED mark can be CHANGED but never CLEARED.** Tapping the selected
  button clears an unsaved mark and is a **no-op** on a recorded one. This is
  the API's shape, not a preference: `POST /api/attendance/bulk` takes only
  the rows in `entries`, and the page omits unmarked rows entirely — so a
  "clear" would send nothing for that learner, leave the stored row exactly as
  it was, and leave the screen claiming a state the database does not hold.
  **Deleting a recorded mark needs a server change. Until there is one, this
  refuses rather than lies.**
- **Mark all / rest Present fills only UNMARKED rows.** It never overwrites,
  so a teacher who has already marked the three absences can fill the rest in
  one tap without undoing that work. Nothing is saved until Save.
- **Three row states, and §5b is the whole reason they exist.** `recorded` is
  the last successful read; `marks` is what the teacher typed; `Recorded` /
  `Changed · not saved` / `Not marked yet` is the comparison. The two must be
  able to disagree, or the stored-state column is decoration.
- **Counts only, never a rate.** Parent → Attendance owns the percentage and
  its rounding (§12); a second implementation on an encode screen is a number
  the two could disagree on.
- **Unsaved marks are guarded on every path, with the PHONE's words
  (`fix/server-reliability`, 2026-09-30 — this answers the old OPEN
  QUESTION).** The Modal "Leave without saving?" (since `fix/leave-guard`
  the one title on every bulk screen; it read "Leave without saving
  attendance?" until then) says "You have N
  unsaved mark(s) for Grade X - Section on <date>. Changing the date or
  section / Leaving now discards them — nothing has been sent to the server
  yet." with **Stay on this page** and **Leave and discard**, exactly as
  `mobile/…/teacher/AttendanceScreen.jsx`. Four paths, the Grades page's
  pattern (§13d), not a new one: a date or section change (asked BEFORE the
  roster reloads), a capture-phase click on an in-app link, the Back button
  through the shared `classRecord/backGuard.js` machine, and `beforeunload`
  **only while something is unsaved** — §5e's "no blanket `beforeunload`"
  still stands. **A fifth path since `fix/leave-guard`:** Log out and a
  notification row ask through `layout/leaveGuard.js`, held as
  `{ kind: 'exit', run }` on the same modal (§13d says why buttons needed
  it).

### 17d. `actions` beside `onSelect` is SILENTLY DROPPED

**Found by the browser check, contradicting my own report — record the
behaviour, not the intent.** DV1b-b's report said a parent's Edit button
"moves to `actions`, Pending only". It does not render there at all.

`DataTable`'s `Card` has three branches: `to` renders a `<Link>`, `onSelect`
renders a `<button>`, and **only the third — neither — renders `actions`.**
That is §5a-iii enforced by construction: a card with a primary action is one
interactive element, so a button beside it would be a button inside a button.
Passing both is not an error, it is a no-op.

**What is actually true on a phone:** every letter card opens the reading
view, and **Edit is the button inside that modal** — which was already there
before DV1b-a and is unchanged. The card's `actions` block WAS dead code,
and `parent/ExcuseLettersPage.jsx` was then the only card in the system that
passed both. **Removed since (UI-B):** the card is now
`parent/excuseLetters/card.jsx`, it passes only `onSelect`, and its header
says Edit is not there; `DataTable` warns in DEV when a card carries both.

**The proof missed it because it asserted the SOURCE TEXT**, not the render:
`/actions:[\s\S]*status === 'Pending'/` proves the prop was written, never
that anything draws it. **A source-text assertion proves authorship, not
behaviour** — worth knowing, since the whole DV1b-a proof is built that way
and its other 87 assertions are about data that has no render branch to fall
through.

### 17e. Every parent letter card opens the READING view, whatever its status

DV1b-a gated `onSelect` on `Pending`, which made a **Declined** letter a
static card — and the decline reason lives in the reading view. At 390px the
adviser's remarks became unreachable on the one screen a parent actually
uses, for the one status where they matter.

**A card is tappable when there is something to READ, not when there is
something to DO.** The teacher page's gate is different and stays: a teacher
outside the section gets `403`, so a tap really is a dead end (§16a). A
parent is never out of scope on their own child's letter.

**The two gates look identical and are not (UI-B, 2026-09-23).** The parent
card opens a **reading** view, which exists for every letter, so gating it hid
the decline reason. The teacher card opens the **review** modal, which is that
page's only modal, so a letter they may not review has nothing to open. Both
cards are modules now — `parent/excuseLetters/card.jsx` and
`teacher/excuseLetters/card.jsx` — precisely because a CONDITIONAL card is
what a source-text assertion cannot check.

**A gap this made visible, and it is not the card's:** the teacher page has
no read-only view of a letter at **any** width. `details` and
`teacher_remarks` render only inside the review modal, so an Approved or
Declined letter cannot be re-read, on a phone or on a desktop.
`docs/KNOWN_ISSUES.md` has the row; UI-E builds the view. **Built in UI-E
(2026-09-25): `teacher/excuseLetters/readingView.jsx` — see §20.**

### 17f. A DEV-only guard is INVISIBLE to a production-mode proof

**Measured 2026-09-23, and it cost a false failure before it was understood.**

`DataTable`'s `Card` gained a guard for §17d's defect — `console.error` in DEV
when a card passes `actions` together with `to` or `onSelect`, because the
prop is silently dropped and the dispatch that did it reported the opposite in
good faith. The guard works. The proof asserting it failed all four of its
assertions with **zero errors logged**, which looks exactly like a broken
guard.

**`vite build` is a PRODUCTION build.** `import.meta.env.DEV` is replaced by
`false`, so the whole block is **tree-shaken out of the bundle** — `grep
"DataTable card"` in the built file finds nothing at all. **`--mode
development` does not change it; `NODE_ENV=development` does.**

**The rule: anything behind `import.meta.env.DEV` has to be kept alive
deliberately before a proof can see it, and the run command is part of that
file's contract** — written in the proof's own header, not remembered. This
is the same family as §5h's other blind spots: the harness does not fail, it
reports a clean pass on code that is not there.

**And the inverse is worth stating once:** a guard that a proof cannot reach
is still worth having. This one fires in the browser, which is where the
defect was actually found both times.

## 18. Print, and the base text colour

**Frozen 2026-09-25 (UI-D-1).** Two things that live above every page and
neither had ever been set. Before this dispatch the client contained **no
print CSS at all** — not one `print:` variant, not one `@media print`, not
one `@page` — and **no base text colour** — no rule on `body`, `#root` or in
`@layer base`.

### 18a. Only three surfaces print, and two of them are one component

The school accepts a printout as the Summary of Grades. That is the whole
requirement, and it lands on:

| Surface | Component |
|---|---|
| Teacher → Class summary | `ClassSummaryPage.jsx` |
| Teacher → a learner's report card | **`parent/ReportCard.jsx`** |
| Parent → Grades | **`parent/ReportCard.jsx`** |

`ClassSummaryLearnerPage.jsx` imports the parent's `ReportCard` unchanged, so
**print work on that one file lands on a teacher screen and a parent screen at
once.** Nothing else is in scope: Parent → Attendance is a month grid that
would plausibly print, and **no school requirement is recorded for it**, so it
was deliberately left out rather than added on a guess.

### 18b. Where print CSS lives, and where it does not

**The global block is in `client/src/index.css`.** It hides the SHELL — the
chrome every page carries — and it can do that **by landmark**, because
`Shell` uses real ones: `<aside>` for the sidebar and its drawer, `<header>`
for the top bar (which owns the notification panel), `<main>` for the routed
page.

**Bare element selectors, never depth-specific ones.** The first version was
`body > * > aside`, which matches nothing: the Shell nests its landmarks below
`#root`, and a selector that is wrong about depth **fails silently** — the
sidebar would simply have printed. The only other `<aside>` and `<header>` in
the client are on Login and the dev gallery, neither of them printable.

**Which controls are noise is a PER-PAGE judgment, so that is `print:hidden`
at the call site.** A blanket `button { display: none }` in the global block
would also delete the report card's own term links. What the pages hide:
filters and selects, a standing description of the screen, a duplicate of a
fact the masthead already carries, a statement about who may EDIT (paper
cannot be edited), and the parent breakdown `Modal` — which renders **inline,
not through a portal**, behind a `fixed inset-0 z-50` backdrop, so a print
started while it is open would put the dialog over the report card and paper
has no way to dismiss it.

### 18c. A scroller is a guillotine on paper

`overflow-x-auto` clips at the element's width, and **paper has no scrollbar
to reveal the rest.** Measured on the class summary, 2026-09-23: **five of
eight subjects and the Average column were missing from the printout**, with a
scrollbar printed where they should have been.

**`min-w-max` is the other half of it.** It stops the table compressing, so
releasing the overflow alone changes nothing and **landscape alone would not
have been enough either.** Both are released under print, via two hooks —
`print-sheet-scroller` and `print-sheet-table` — together with letting headers
wrap ("Araling Panlipunan" is the column that decides the fit) and making
sticky cells static, since a sticky column has nothing to stick to on paper
and can overlap.

**On screen too, since fix/polish (2026-09-26): the class summary has NO
`min-w-max` and its subject headers wrap.** Measured before the change at
1280px: the scroller was 990px and the table's max-content 998 — nine
nowrap headers, "Araling Panlipunan" 169px — an 8px overflow under
ScrollCue's 24px gate, so the cue was rightly silent and a native scrollbar
showed for eight pixels. With `w-full` alone the table fits its container
and a learning-area name breaks onto two lines, the call SlotHeader already
makes. **Learner names, the Average header and every value cell stay
nowrap**, so at 390 the table still overflows (356 vs 937 measured) and the
cue still speaks; print is unchanged. The class record keeps its own
widths. **And its four colgroup headers are `text-left`**: a group spans up
to eight 4.5rem columns, so a centred name sat ~288px in and at 390 no
group name was on screen at scroll start.

### 18d. Landscape is scoped per page, and Safari ignores it

**`@page` is a DOCUMENT-level rule.** It cannot be nested under a class or an
ancestor selector, so there is no way to scope one from `index.css`. Two
options exist and only one is portable:

- a **named page** (`@page summary` + `page: summary`) — **not supported in
  Firefox**;
- **inserting the rule only while that route is mounted** — a
  `<style media="print">` rendered by the page, which React mounts and
  unmounts with it. **This is the one used.** The report card at
  `/teacher/class-summary/:id` stays portrait with nothing to clean up.

**Coverage, stated rather than assumed: `size` in `@page` works in Chrome and
Edge, and in Firefox from 122. SAFARI IGNORES IT** — the reader picks
orientation in the print dialog. **That is acceptable only because §18c
releases `min-w-max`:** a portrait sheet comes out cramped, never clipped.

### 18e. A container query cannot be trusted at print width

`ReportCard` switches between a table and per-term cards on a **container**
query (`@min-[36rem]`, §5a-vi). **What that container measures during a print
is a render-time fact**, and §5h already says a build and an SSR render cannot
settle one. The arithmetic says the table wins (A4 portrait ≈ 718px against a
576px threshold) but **does not prove it**, and printing the narrow branch
would not be a broken layout — it would be **a different document**, which
nobody notices until a parent is holding it.

So print **forces** the table branch. **With `!important`, not with a
`print:block` utility:** a print variant and a container variant have **equal
specificity**, so the winner would be decided by stylesheet ORDER — the same
order dependence §3a exists to remove.

### 18f. Dark printing is fixed in `theme.js`, NOT in `@media print`

**Browsers do not print backgrounds by default**, so a dark theme's `--fg`
(slate-100) lands on an unprinted white sheet. That is not "hard to read", it
is **invisible** — on the one output the school actually keeps.

**The obvious fix is the wrong one.** Re-declaring the light values inside a
print media query means a **verbatim second copy of ~71 custom properties**,
and the next person to change a token would have to change it twice with
nothing to catch them missing one — the "one number, one place" liability
CLAUDE.md's front matter exists to prevent.

`pages/settings/theme.js` already owns the `data-theme` attribute that IS the
theme, so it **swaps the attribute for the duration of the print** and leaves
one copy of the values. Three rules:

- **`beforeprint`/`afterprint` cover Chrome, Edge and Firefox. SAFARI FIRES
  NEITHER** — it changes `matchMedia('print')` instead — so both are
  registered. On a browser with both, each calls `applyTheme` with the same
  argument, which is idempotent.
- **Restoring RE-READS storage rather than remembering.** `endPrintTheme()`
  calls `applyTheme(readTheme())`, the exact line `initTheme` uses at startup,
  so **System comes back as System and re-resolves live** rather than being
  frozen to whichever side it was on when the dialog opened. Proved by
  flipping the OS mid-print.
- **Nothing is written to storage.** Printing is not a settings change.

It registers from inside `initTheme()`, so `main.jsx` needs no second call —
this module owns the attribute's whole lifecycle.

### 18g. The base text colour, and the one call site it moves

`body { color: var(--color-fg) }` in `index.css`. Until that line existed,
**any element setting no colour inherited the browser default, black** —
about **1.06:1** on the dark `--page`, which is invisible. `DataTable`'s
`<td>` hid this (it sets `text-fg-secondary`); the screens that build their
own tables did not.

In light this moves untouched text from `#000` to slate-900 — 21:1 to 17.6:1
on white, both still AAA. **`lint:contrast` is unchanged**, because a body
colour adds no token PAIR: `fg` on `surface` and `fg` on `page` are already
asserted.

**`GradeValue` therefore returns to pure inheritance**, and the `className ||
'text-fg'` default UI-A shipped comes back out. **One call site changes colour
and it is an accepted trade, not an oversight:** inheritance resolves against
the nearest COLOURED ancestor, which is not always `body` — inside `DataTable`
it is the `<td>`, so `admin/GradesPage`'s Final Grade moves from `fg` to
`fg-secondary`. Kept, because every other cell in that table is
`fg-secondary` and a grade disagreeing with the cells beside it would be the
odder result.

### 18h. Print layout is proved ON PAPER, and by nothing else

**`@media print` does not apply to a `renderToStaticMarkup` render.** There is
no page box, no `@page`, no orientation and no paper width. §5h says a build
and a lint prove the code compiles rather than that the page renders; **print
is the case where even the SSR backstop cannot stand in.**

What a proof *can* assert, and `scripts/ssr-ui-d.jsx` does:

- the component emits no colour of its own, and a caller's class still wins;
- **the base colour and every print rule reached the BUILT stylesheet** —
  grepped, not trusted. **A Tailwind variant that generates no CSS fails
  silently** (the `h-9.5` lesson, §5a-vi), so `print:hidden` being inert would
  mean every "hidden" control printed, with nothing to say so;
- the theme switch restores light, dark and System, including an OS flip
  mid-print.

**A proof that cannot reach the thing must say so in its own header**, rather
than reporting a green run that reads as broader than it is.

### 18i. `Date.now()` in a render body is impure

Found by oxlint's `react(purity)` rule on the printed-on date, not by review.
An impure read during render means **the same props can produce two different
documents**. It is state with a lazy initialiser instead, **refreshed on
`beforeprint`** — which is not belt-and-braces but what makes the line true: a
tab left open overnight would otherwise print yesterday's date on a record the
school keeps. Safari fires no `beforeprint`, which is exactly why the lazy
initialiser supplies a real value rather than an empty string.

## 19. ScrollCue, the parent hero, and two rules that are not about either

**Frozen 2026-09-25 (UI-D-2, UI-D-3).**

### 19a. A scroller must say that it scrolls

`components/ScrollCue.jsx` wraps the class summary's and the class record's
horizontal scrollers. **The defect it fixes is an affordance one, not a layout
one** (SMOKE-1 finding 11): at 390px the summary cuts inside a word and
nothing says six more subjects and the Average exist to the right — no visible
scrollbar on a touch device, no fade, no control. A teacher would reasonably
read the class as having three subjects. The table was always scrollable;
nobody was told.

**Do not remove the scroller to fix it.** §5a-i kept it deliberately and that
question is closed.

**Four signals, because one is not enough for every reader:** a sentence above
the table, a right-edge fade, a 44px button, and a shadow on the pinned column
once something is underneath it. **Every one is conditional on the table
actually overflowing, and all stand down at the end.** The native scrollbar
stays — it is the one real affordance here that is not a reimplementation.

**The hint is the only signal that says WHAT is off-screen**, and the only one
that survives a screen reader. The other three say merely that something is.

### 19b. Two slacks, because they answer two different questions

This is the rule the section exists for, and it was learned by getting it
wrong twice in a row.

| Constant | Value | Question |
|---|---|---|
| `GATE_SLACK` | **24px** | is there anything worth scrolling to *at all* |
| `CELL_SLACK` | **1px** | which columns has the reader *not seen* |

**Why the gate is not 1px.** It was, and the desktop class summary overflowed
by exactly **2px** — `scrollWidth` 992 against `clientWidth` 990 — so it told
the teacher to "Swipe for the Average →" about a column two pixels short of
fully visible. It also **flapped**: present at 1279px, gone at 1281px. A cue on
a table with nothing worth scrolling to is worse than no cue.

**Why the cells are not 24px.** Widening both was the overcorrection. At 390px
on the class record, with Performance Tasks clipped — its last column cut, its
highest-possible-score hidden behind the button — the hint read *"Swipe for
Summative and Grade"*. **The group the teacher most needed pointed at was the
one silently dropped**, because its last column was a few pixels short.

**Once a cue is shown at all, a column cut AT ALL is a column the reader has
not read.** Legibility decides whether to speak; it does not decide what to
say. Measured after the split: Performance Tasks is named while cut by 40, 20,
10 and 5px, and drops out only at 0.

### 19c. The hint's wording belongs to the page, not the component

The summary **counts** ("Scroll for 6 more subjects and the Average →"); the
class record **names its groups** ("Scroll for Performance Tasks, Summative and
Grade →"). **The web says "Scroll" since UI-7 (2026-09-30)** — it is read with
a mouse too; the quotes above record what it said when measured, and the
phone app keeps "Swipe". Same module, because `cueState` takes the cells either way and
whether the caller passes labels is what decides the answer.

**Why they differ:** the summary's columns are learning areas, so a number is
the useful answer. The record's are assessment slots inside ONE subject, where
"7 more assessments" says nothing — the group names are what tell a teacher
what they have not seen. The record's labels come from a `data-group`
attribute, because the visible header carries a weight ("Performance Tasks ·
50%") and a sentence built from that is not a sentence.

**Which cells to measure is also the page's** (`measureCells`): the summary has
one header row, the record has two and the leaf row is not the one worth
naming.

### 19d. A live region stays mounted; the space it takes does not

The hint is `aria-live="polite"`, so it must exist in the DOM **before** its
content changes or the first announcement is missed — it cannot be
`{hint ? <p/> : null}`. But it must not reserve a line on a desktop table that
does not overflow: it shipped with `min-h-5` and put a **blank strip** above
every wide class summary. **`sr-only` while empty** keeps the region alive at
zero layout cost, and the visible classes come back with the text.

**And the frame goes on the whole cue, not the scroller.** It started on the
scroller, which put the class record's card border *between* the hint and the
table while the summary's border — coming from a wrapper in the page —
contained both. The hint describes the table, so it belongs in the same box.

### 19e. The parent hero uses `brand-panel`, not `primary`

`--primary` is a **button** fill. Its dark value was `#ABA8F7` then (a light
indigo; blue-400 `#60A5FA` since `feat/ui-palette`), which made a full-width
panel the brightest thing on a dark screen — against the Dark option's own
*"easier on the eyes at night"*. **`--brand-panel` already existed for exactly
this** and the Login split panel already used it: then a solid navy field in
BOTH themes (`#08027C` light, `#23204F` dark) with white text. **Since
`feat/ui-palette` (2026-10-01) it is a plain zinc-100 band `#F4F4F5` with
zinc-900 text in light and a zinc-800 field `#27272A` with white text in
dark**, with `--brand-panel-muted` for lower emphasis in both.

Reusing it meant **no new token and no new foreground pair** — both were
already asserted. Only the badge-on-panel boundaries are new, because the
hero is the first place a `StatusBadge` sits anywhere but `surface`. **Those
measure ~1.0 in dark — and, since `feat/ui-palette`, 1.00–1.06 in light too —
and were ACCEPTED by eye** (Darryl, 2026-09-25; the light panel re-checked by
the owner on 2026-10-01): the pill
keeps its inset ring and reads clearly. `docs/KNOWN_ISSUES.md` carries it as a
decision, not a defect.

**Key Stage 1 names each letter's subject.** It rendered "A  D" — two letters
with nothing to say what either was about — because the subject was bound as a
hover-only `title`, **which does not exist on touch**, the device a parent
reads this on. The name was in scope on the element printing the letter the
whole time. The descriptor comes with it, from the same payload and equally
unused before. **What is NOT recorded is stated too**, so two letters of five
cannot look complete — that is not the "N of M" progress figure §12 refuses
for KS1, because it names subjects rather than implying a denominator.

**The numerical average follows `current_term`** (§12), not the dashboard's
"greatest term with any grade" — one panel was keying off two notions of term.
`term_averages` is the same computation, checked rather than assumed.
**The descriptor on that caption is the server's:** `general_average_descriptor`
describes the YEAR's average and deriving a band client-side is what §12
forbids, so UI-D-3 shipped the caption as "Term N" alone. Pre-Stage-5 #2
(2026-09-25) added `term_average_descriptors` to the report card, and the
caption reads "Term N · <word>" from `[current_term].descriptor` — the string,
never the object, never `remarks` (§19f, §4).

### 19f. A proof fixture must mirror the server's shape

**`descriptor` is an OBJECT** — `{ descriptor, filipino }`, from
`gradeComputation.js`'s Table 8 — and a proof fixture that invented a **string**
let a **blank page** ship: React refuses an object as a child, there is no
error boundary above the dashboard, and `/parent` rendered nothing at all.

**It passed `npm run build`, oxlint, and 71/71 of its own assertions.** Only
the browser sweep caught it. §5h already says a build and a lint prove the code
compiles rather than that the page renders; this is the same lesson one level
in — **a proof proves the code against the fixture, so a fixture that is wrong
about the API proves nothing about the app.** Every other screen already did
`descriptor.descriptor` (`TermValue.jsx:31`, `parent/GradesPage.jsx:290`).

Read the server's response shape before writing a fixture for it.

### 19g. Never two module names differing only by case

`ScrollCue.jsx` and `scrollCue.js` coexisted for one commit. **Windows
filesystems are case-insensitive**, so an extensionless
`'../../components/ScrollCue'` resolved `.js` first, found the helper module,
and failed with **"Missing export"** — a message that names an export and says
nothing about the filename, so it does not read as a naming problem.

Spelling the extension at each call site fixed the build and left the trap.
The helper is `scrollCueState.js` now. **A pure-logic sibling of a component
gets a name that is a different WORD, not a different case.**

### 19h. The arrow is desktop-only, and an `aria-hidden` control never takes focus

**Added 2026-09-26 (fix/smoke-gate `e33f7ae`).** Two findings from the
smoke gate's browser check. **Below `sm` the round arrow is hidden**
(`hidden sm:flex`): a phone swipes, the "Scroll for …" line (§19a) is the
cue, and the button sat over the last visible header ("MATHEMATICS",
"FI…"). The edge fade stays at every width. **And a MOUSE CLICK FOCUSED
IT** — measured: `document.activeElement` was the button after every click,
which is an `aria-hidden` element holding focus, Chrome's "Blocked
aria-hidden on an element because its descendant retained focus".
`tabIndex={-1}` keeps a control out of the TAB order; it does not stop a
click from focusing it. **`onMouseDown={(e) => e.preventDefault()}`** does:
after the fix a click still scrolls (792px on the class record at 1280) and
focus stays on `body`. **The rule for any `aria-hidden` control: it must not
be focusable by any route**, or the hiding is a lie the browser reports.

## 20. The teacher's read-only letter view

**Frozen 2026-09-25 (UI-E).** `pages/teacher/excuseLetters/readingView.jsx`.

### 20a. What it fixes, and why nothing caught it

`details` and `teacher_remarks` rendered in exactly ONE place — inside the
review Modal — and that modal opens only for a **Pending** letter in a section
the teacher **advises**. So the moment a letter was reviewed, **the teacher who
wrote the remarks could not read them back at any width.**

**No automated check could have found it**, because nothing was broken: a view
simply did not exist. It is also **not** the DV1b-a card regression it
resembles — that was the parent side, introduced and fixed in one dispatch.
This one was **symmetrical and pre-existing**.

### 20b. Two open points, one entry function

| Where | Approved / Declined | Pending, adviser | Pending, not adviser |
|---|---|---|---|
| Desktop Actions cell | **View** (outline) | **Review** (filled) | "Adviser only" |
| Card, below `sm` | tappable | tappable | **static** |

**The View button is secondary, not primary.** Reviewing is an action, reading
is not, and two identically-filled buttons in one column would make the
difference invisible at a glance.

**One function decides what a row opens** (`openLetter`), so the card and the
Actions cell cannot disagree. Pending → the review form; anything reviewed →
the reading view.

**The card's gate MOVED, and the old reasoning is why.** Its note said a card
is tappable when there is something to READ, not something to do — and that
the teacher's gate was correct because this page had no read-only view at any
width. **That premise is now false.** The rule is unchanged; the fact
underneath it is not. **One dead end survives and it is the whole remaining
gate:** a Pending letter in a section the teacher does not advise, where there
is nothing to read and `PATCH /:id/review` would answer 403.

### 20c. It renders the LIST ROW — never `GET /:id`

`GET /api/excuse-letters` selects `el.*, s.first_name, s.last_name,
s.grade_level, s.section`, so the page already holds every field the view
shows. **No second fetch means no scope to get wrong**, and the read scope
(`TEACHER_VIEW_SCOPE_SQL`) is untouched.

**`GET /:id` is scoped identically for teachers and still must not be called:**
it selects `el.*` with no `students` join, so it returns **strictly less** than
a list row — no learner name, no class.

### 20d. Four omissions, each decided rather than overlooked

| Not shown | Why |
|---|---|
| the reviewer's name | `reviewed_by` is a **user id** and nothing resolves it; a JOIN is a server change |
| a reviewed date | **there is no `reviewed_at` column.** `updated_at` changes on review AND on anything else, so printing it as one is a claim the data cannot support (§5i) |
| "Submitted" | `created_at` is available, but the parent's view omits it and parity matters more than the extra row |
| the attachment | `attachment_url` exists and **nothing uploads**, on any screen in the app. A row that is always empty is noise |

**"Adviser remarks", not "Your remarks."** The read scope is wider than the
review scope — any assigned teacher may read this, only the adviser wrote it —
so the possessive would be false for exactly the reader who most needs the view
to be accurate. It is also the parent's wording, so one letter reads the same
to both sides.

**NULL remarks render nothing**, not an empty heading, which would read as a
failed fetch. Remarks are optional at the API layer by decision, so a decline
with no reason is a real row — **confirmed live in the browser check**, and the
view drops to six headings.

**The learner and class ARE shown** where the parent's view omits them: a
parent has one child, a teacher has a list. No LRN reaches it (§5c) — there is
none in the payload.

### 20e. The parent's view is the PATTERN, not the code

`parent/ExcuseLettersPage`'s reading modal is **inline `<dl>` markup** whose
footer offers Edit, and the two views differ on **four of six rows**. Copying
the layout keeps them recognisably one document; sharing the component would
have meant parameterising that footer away on the first call.

**The teacher's view is its own module** because it is a CONDITIONAL view, and
a conditional view is what a source-text assertion cannot check (§17d).

### 20f. Assert STRUCTURE, never a regex over fixture prose

`ssr-ui-e` first asserted `!/attach/i` over the whole markup to prove no
attachment row — and **failed on its own fixture**, whose details read
*"certificate **attached** to the clinic record"*. The assertion was testing
the learner's prose, not the app.

**It extracts the `<dt>` set and asserts the exact seven, in order.** Stricter
than the regex, and immune to fixture wording. **The general rule: when a
proof means "this field is absent", assert the absence of its STRUCTURE — a
heading, an element, a prop — not the absence of a word.**

**And a Playwright note from the same dispatch**, because it cost a probe
round: `getByRole('button', { name: 'View' })` matches by **case-insensitive
substring**, so it also matches **"Review"**. Use `exact: true`. The same probe
also passed `?status=Approved` in the URL, which does nothing — that page's
filter is local `useState`, driven through the form and Apply.

## 21. Filters — when to stage, and how to say so

**Frozen 2026-09-25 (item 5).**

### 21a. The rule: one bounded control auto-applies, several stage

**One control that refetches on change has no state worth staging.**
`parent/EventsPage`, `parent/ExcuseLettersPage` and `admin/GradesPage` had
already settled this; item 5 made `teacher/AnnouncementsPage` the fourth and
left the other eight staged.

**Staging is kept where it is earned, and the reason is not caution.** Three
pages filter on **free text with no debounce anywhere in the client**, so
applying on change is one request per keystroke. Two more commit a **date
range**, where "From" without "To" is an unbounded query. One
(`admin/UsersPage`) fires **two** requests per apply, refetching the pending
queue alongside the directory. Those are the pages where several controls
"only make sense committed together" — `parent/EventsPage`'s own words.

### 21b. A staged filter must SAY it is staged

The defect: a Status select reading "Approved" above a list still showing
Pending, **with nothing on screen admitting the gap**. Filed as a §5f
violation and **corrected on 2026-09-23** — the empty-state copy was always
fine, one branch per applied value. **It is §5b one level out:** a control
showing form state beside a list showing database state.

`components/FilterActions.jsx` renders all three parts:

- **Apply is QUIET when clean and FILLED when dirty**, and **never disabled**.
  Disabling gives no reason, and re-applying an unchanged filter is a
  legitimate refetch — quiet says *"nothing is waiting"*, disabled would say
  *"you may not"*, which is false. Clean and Reset both read
  **`buttonNeutralClass`** (`FormField.jsx`, beside `filterFieldClass` — item
  5b), so the two are a matched pair by construction rather than by two
  strings kept in step. The pages' empty-state "Clear" buttons still carry
  their own `px-3 py-1.5` literal; that is a `docs/KNOWN_ISSUES.md` row.
- **The note is `text-brand`, `role="status"`, and its `<p>` is ALWAYS
  mounted — `sr-only` while empty, text toggled.** Not `alert` — nothing has
  failed. **Item 5 got this backwards and item 5b corrected it after code
  review:** it rendered the `<p>` only while dirty, on the theory that an
  empty live region "claims a state that is not true". A screen reader
  announces *changes inside* an existing live region, not a node that appears
  with its text already in it — so the sighted cue worked and the assistive
  one never spoke, **and the proof had cemented the defect** by asserting the
  region was absent when clean. **§19d already states the rule; this is the
  same rule, and the two components must not disagree again.** **The `●` is
  `aria-hidden`:** the sentence carries the meaning, and a glyph that is the
  only carrier fails the way a colour-only one does.
- **`resetLabel` exists for one caller.** `teacher/StudentsPage` says
  "Clear". **The component owns the behaviour; the page owns the words** —
  renaming a page's button to match a shared component is backwards.

**One component, not nine copies**, and not only for deduplication: the
quiet↔filled swap is one conditional in one file, `role="status"` is written
once, and **it renders**, so a proof can drive both states instead of
regexing nine page bodies (§17d).

It also settled an inconsistency: `admin/AnnouncementsPage` styled Apply
**identically to its Reset**. Under this component neutral *means* "nothing
staged", so that page was already saying the wrong thing — it had no
vocabulary to be wrong in.

### 21c. `isDirty` — key by key, never `JSON.stringify`

`components/filterState.js`. Four rules, each with a page behind it:

- **Key by key over the UNION of keys.** Stringify compares key *order*, and
  the nine pages assemble drafts in whatever order each was written in;
  `{status, from, to}` must equal `{from, to, status}`. The union also means
  a **missing** key compares against the other side's value rather than being
  skipped.
- **Every string is trimmed on BOTH sides** (item 5b; item 5 trimmed only a
  key literally named `search`). Commit trims, so without this one trailing
  space claims there are changes and then applies nothing — and a rule keyed
  on a field name is one a future page naming its box `query` would silently
  miss. A select never carries whitespace, so trimming everything costs
  nothing; an *inner* space is still a real difference.
- **Values compare as strings.** A grade level is `6` from one source and
  `'6'` from a `<select>`; `null`, `undefined` and `''` are one filter.
- **Compare against the page's DEFAULTS, never falsiness.**
  `admin/StudentsPage` defaults `status` to the string **`'all'`** and sends
  it on every request, so a truthiness test offers Reset on an unfiltered
  page.

**Dependent Grade→Section pairs need no special handling**, and the case to
keep is this one: with a section applied, going Grade 6 → 5 → **6** stays
**dirty**, because the section really was cleared and the list would differ.

**Each page assembles its draft ONCE** into a `const` that both `isDirty` and
the submit handler read. Two derivations of one truth is how a cue and a
commit drift apart — §5b in miniature.

### 21d. `filterFieldClass`, and two searches that keep their own width

`filterSelectClass` fixed this for selects and `FormField.jsx` documents why.
**Nine controls were never fixed** — eight date inputs and
`admin/UsersPage`'s search carried **no width class at all**, so each was a
content-sized flex item rendering at the browser's ~180px default beside the
buttons instead of stacking. `filterFieldClass = 'w-full sm:w-44'`, narrower
than a select because a date's content is fixed and two at `w-72` push Apply
off a 640px row.

**Both Students pages keep `min-w-56 flex-1` on their search**, deliberately:
it is each page's primary control and was sized that way on purpose.
**Flattening a considered choice into a shared constant is the wrong kind of
consistency** — stated here so the exception is not later "tidied".

### 21e. A page's action never sits in the filter card, and the cue stays with Apply

**Added 2026-09-26 (fix/smoke-gate `b84694c`, `8cac83d`).** Two rules the
smoke gate measured into existence.

**The page's primary action lives OUTSIDE the filter card, outlined.**
Inside the card beside Apply, a staged filter showed two identical filled
buttons — and Apply's fill is §21b's signal — and the cue's 140px pushed the
row past its card (1009px of 958 on Teacher → Events, 993 of 958 on Admin →
Announcements at 1280), so "New event" jumped to a new line the moment a
filter was touched. Students' `flex-1` form (§21d) stops the sideways jump
but NOT a 32px downward one, because the row is `items-end` and the form
grows a line. Out of the card, the button holds identical coordinates clean
and dirty, 1280 and 390. **Where it goes:** its own right-aligned row above
the card (Events — Teacher → Messages' shape), or the section heading row
(Admin → Announcements — the Memos shape). **Class:** `buttonNeutralClass`,
as Enroll student — and "New memo" too, so a page's two "New …" actions do
not read as different weights. **Admin → Announcements does NOT auto-apply**
(it has Apply); only Teacher → Announcements does.

**SUPERSEDED on 2026-10-05 by the placement rule at the end of this
section; kept as the record.** "● Changes not applied" is centred on Apply by
`-translate-y-2`. Every
filter row is `items-end` (so buttons line up with inputs under labels), and
that sat the 1.25rem cue on Apply's 2.25rem bottom edge — its centre **8px
low**, measured on all eight `FilterActions` pages at 1280 and 390 wherever
it shares Apply's row. The 0.5rem lift scales with the Large text size, and
**a transform moves nothing else**: the clean→dirty movement counts were
identical before and after on all 16 page/width cases. A wrapper around
Apply + cue was rejected — it wraps as a unit and would move Apply on the
three rows where the cue alone wraps today (Admin → Users 1280, both
Students pages 390); there the cue sits on its own line, 4px under Apply
instead of 12px (accepted). The clean state — `sr-only`, empty, the §21b /
item-5b live region — is untouched, and `ssr-item5` still asserts it
exactly.

**Since feat/ui-refresh Apply is the shared `Button` at `min-h-11`
(2.75rem, `components/buttonClass.js:34`), so the lift is
(2.75 − 1.25) / 2 = 0.75rem — `-translate-y-3`**
(`components/FilterActions.jsx:106–119`). Same rule, new arithmetic.

**THE CUE STAYS WITH APPLY — beside it when the line has room, directly
under it when it has not, never on a line of its own under the first filter
(build 1 fix round, 2026-10-05; the owner's rule).** The owner's device check
found it under Role on Admin → Users at 1366 with the sidebar open (beside
Apply with the rail): the cue was its own item of the wrapping row, so it
wrapped to the row's left edge. The "wrapper wraps as a unit" objection above
was right about a plain wrapper and is answered by two pieces:

- **One group, `flex grow basis-0 flex-col`** (`components/FilterActions.jsx`):
  Apply, Reset and the cue in one wrapping row inside it. `basis-0` + `grow`
  keep the group on the filters' line and let it fill the rest; it moves down
  as a unit only when even its narrowest piece — the cue, `whitespace-nowrap`
  — no longer fits there. Inside, the cue sits beside Reset or wraps to
  start at Apply's left edge, centred on the buttons by `items-center` (no
  transform).
- **The eight filter rows are `items-start`, and the group opens with a
  label-height spacer** carrying FormField's own label classes (`mb-1.5 block
  text-sm font-semibold`; hidden below `sm`, where every filter is full width
  and the group has its own line). `items-end` aligned the BOTTOMS, so a cue
  under Apply would have lifted Apply above the inputs; with `items-start`
  Apply sits level with the controls whatever wraps below it.

The clean state is untouched (`sr-only`, empty — `ssr-item5` still asserts it
exactly); `ssr-look-fixes` renders the dirty group and checks the eight rows.
Where the cue actually wraps at a given width is the owner's browser check.

## 22. A failed session read — only a 401 logs out

**Frozen 2026-09-25 (pre-Stage-5 #4).** The companion to §2, one layer up:
§2 says what a status code means for a request; this says what it means for
the SESSION when the request is the one that establishes it.

### 22a. The rule

`/auth/me` is read once at boot (`auth/AuthContext.jsx`). **A 401 ends the
session — and the axios interceptor is the ONE place that acts on it**
(removes the token, stores the reason, redirects). **Every other failure
keeps the token**: no response at all (offline, the API down, CORS, a hung
request), a 5xx, or any status the server did not send as 401. The context
exposes `authError` and `retry()`; `ProtectedRoute` and `RootRedirect`
render `auth/AuthUnavailable.jsx` in the spinner's frame — *"Can't reach the
school server. Your session is kept. Try again when you're connected."* with
the reason through `ErrorAlert` and its Try again — **instead of
`<Navigate to="/login">`**. The URL is untouched; a successful retry renders
the page the user was on.

### 22b. Why the "keep" bucket is that wide

Until #4, `AuthContext`'s catch removed the token on **any** failure, so a
refresh during a LAN outage — frequent on a school network — discarded a
valid session and landed the user on `/login` with no reason shown. The only
signal that a session is dead is a 401. A 403 on `/auth/me` cannot come from
a live session (a forced password change is a **flag on the row**,
`must_change_password`, routed by `ProtectedRoute`, never a 403 — §2 and
§11), and a 404 or a 5xx says the server is broken, not that the session is.
So `classifyAuthFailure(err)` (`auth/authFailure.js`, pure) answers
`'unauthenticated'` for `response.status === 401` and `'unavailable'` for
everything else, `undefined` included — treating an unknown shape as a
logout is the mistake this section exists to prevent.

### 22c. What is proved, and what is checked in a browser

An SSR proof cannot fire a request. `scripts/ssr-auth-failure.jsx` (14)
drives `classifyAuthFailure` with the four shapes axios produces — a 401, a
503, `{ request }` with no response (`ERR_NETWORK`), a timeout
(`ECONNABORTED`) — with three negative controls (a 401 is never "keep"; a 403
is never a logout; `undefined` keeps), and renders the panel asserting the
condition, "Your session is kept", the API's own wording as a `role="alert"`,
a real Try again button, **and no "log in" / "sign in" wording and no link
away** — copy that sends the user to `/login` would undo the fix in prose.
**The effect path is the browser check:** DevTools → Network → Offline →
refresh → the panel, with `pp_token` still in Local Storage; Online → Try
again → the same page. `retry()` is guarded by `loading`, so a second click
cannot stack a request behind the first.

### 22d. Enrolment and the two gates a teacher page must not guess

Same dispatch, same rule shape — a page shows a control only when the handler
behind it will succeed (§5i), and the handler's gate is read from the same
source the server reads, never reconstructed:

- **Enrol** (`POST /students`): the adviser of the TARGET section. The
  picker on Teacher → Students is the sections the signed-in teacher
  advises — `GET /sections` (every row carries `adviser_id`) filtered on
  `user.id` — **not `GET /assignments`**. `canEnroll` follows the same list.
- **Edit** (`PUT /students/:id`): assigned OR adviser — `GET /assignments`
  matched on grade + section, OR the student's `section_id` in the advised
  list.
- **Create parent** (`POST /users/parents`): the adviser of the learner's
  section — the advised list only; otherwise muted copy, not a button that
  403s. **Since `feat/account-create` (2026-10-21) the parent form is
  Guardian name, Password and Confirm password — no Email, no Contact
  number (§29g).**
- **The Section FILTER's union (`students/sectionOptions.js`) still takes
  the assignments list** — a filter narrows what is visible and is not a
  write scope. Do not make it read the advised list "for consistency".

## 23. The About page — settings for the school, constants for DepEd

**Frozen 2026-09-26 (pre-Stage-5 #5a).** `pages/AboutPage.jsx`, one
component, four mounts: `/admin/about`, `/teacher/about`, `/parent/about`
(the last sidebar item of every role) and the public `/about` outside Shell,
linked below the login card.

- **Every school value comes from settings, nothing is hardcoded** — name,
  address, DepEd School ID, email, phone, Facebook page — through
  `GET /settings` when signed in and **`GET /settings/public`** when not (the
  one unauthenticated settings read; exactly six keys — the five `school_*`
  keys and `facebook_page`, `PUBLIC_KEYS` in `server/routes/settings.js`). The
  hero's school-year and section-count pills need a signed-in read, so **the
  public view shows the School ID pill alone** rather than guessing. A blank
  Facebook page reads "Not yet recorded"; no "School head" tile — there is no
  `principal_name` setting (`docs/KNOWN_ISSUES.md`).
- **The Vision, Mission, Core Values and Mandate are DepEd's, so they are
  constants**, citing DepEd Order No. 36, s. 2013 (the VMV) and Republic Act
  9155 (the Mandate), checked word for word against
  deped.gov.ph/about-deped/vision-mission-core-values-and-mandate/ on
  2026-09-26 — the 2013 enclosure is a scan with no text layer. Where the
  design board's transcription differed, the Department's wording won. The
  English glosses under the Core Values are the board's and are styled as
  glosses. **Static lists take index keys** — two Mandate paragraphs share a
  24-character prefix, and prefix keys collided (caught by the smoke, not by
  build or lint — §5h again).
- **Tokens only, and no new contrast pair**: the hero is `brand-panel` with
  its two checked foregrounds, the pills sit on `bg-surface` (as the phone
  chip does; `brand-panel-lit` is a contrast probe that no page paints), every card
  pair is one Settings and DataTable already use. The seal is the bundled
  image on its white disc (§9); `logo_url` is read by nothing.
- **A detail tile must shrink below its longest word (2026-09-26).** The
  Facebook page is one 66-character URL with no space, and `break-words`
  (`overflow-wrap: break-word`) was not enough: it wraps a long word only
  after the box is sized and **does not reduce the min-content width a grid
  or flex item claims**, so the tile held itself open at 522px inside a
  390px viewport and every `/about` route scrolled sideways — found by the
  smoke, ten tests at once. **`[overflow-wrap:anywhere]` is the value that
  counts the break in min-content, and it goes on the element whose text it
  is** — the `<a>` for a link, the `<p>` otherwise; a class on the container
  does not reach an inline anchor — with `min-w-0` on BOTH the tile (the grid
  item) and the text column, or `min-width: auto` still holds the tile open.
  The value arrived by a settings write with no smoke behind it; **any
  settings value that renders on a page gets a smoke before merge.**
- **The Vision and Mission cards are equal height, by decision (2026-09-26).**
  `lg:items-start` — each card ending at its own text — was built and
  reverted on the browser check; the matched pair is preferred. The space
  under the shorter Vision paragraph is not a defect.
- **The Login panel reads `school_name` from `/settings/public`, with a
  "– Main" fallback** (fix/polish, 2026-09-26). The line was a static string
  without "– Main", and mastheads carry it (LOCKED). `useState` holds the
  fallback; one effect's `.then` replaces it when the setting is non-empty;
  `.catch` does nothing — the fallback IS the copy, so there is no error
  state and nothing to retry. The class-summary print masthead's fallback
  carries "– Main" for the same reason.
- **The School settings section is `max-w-2xl`, with short pairs in
  `sm:grid-cols-2` rows** (fix/polish; the Account and Password sections
  stay `max-w-md`). `SettingsLayout` gives a tab a 42.5rem panel; a
  `max-w-md` section inside it left the right third of a desktop empty. Two
  short fields share a row from `sm` (School ID + phone, email + Facebook)
  and stack below it — width and one paired row, not a redesign.

---

## 24. The type scale — figures one step down, nothing else (`feat/ui-polish`, 2026-09-30)

Darryl found the dashboards' text too big on a laptop, a desktop and the
phone. Measured first (Playwright, 1366×768 and 1920×1080 — identical, no
text class is responsive): body, card titles and nav are 14px, the page title
16px; what read as big were the **figures** — `Stat` 24px, `Stat large` 30px,
the parent hero's figures 24px.

- **A figure is `text-xl`; an emphasised (`large`) figure is `text-2xl`; the
  parent hero's figures are `text-xl`.** Web: 20 / 24 / 20px. Phone (rem 14,
  M19): 17.5 / 21 / 17.5dp, and the phone hero's NAME `text-lg` (15.75dp).
  Proved on the web by computed font-size, Light and Dark, all three
  dashboards.
- **Nothing else moved then.** No `html` base-size change — body, titles, nav,
  spacing and the sidebar were as they were — so the parent calendar kept
  97.0 / 77.0px (re-measured). The phone's rem stays 14.
- **Since feat/ui-refresh (2026-10-04) titles are a step up, by CLASS, in the
  title face** — the sizes are still Tailwind's own (the branch's larger scale
  was reverted, FR5): the page `<h1>` is `text-lg sm:text-xl`
  (`layout/Header.jsx:41`, was `text-base`), a dashboard card title
  `text-base` (`pages/dashboards/Card.jsx:122`, was `text-sm`), a section
  heading `text-lg` (`components/SectionHeader.jsx:30`). Body and nav stay
  14px (`layout/Shell.jsx:185`); the figures above are unchanged in size and
  now `font-bold` (`Card.jsx:182`). §27.
- **A new figure uses `Stat`** (or states why not). A size picked at a call
  site is how the scale drifts. **A name is not a figure:** a title in a
  card's lead (the Upcoming events cards, since the B3 device check's finding
  #1) is a `text-sm` line, never `Stat`'s `text-xl` (§15e).

## 25. Profile photos — the file name is the key, and never a login id (`feat/profile-photos`, 2026-09-30)

Owner decision: build now, every role, web and phone. Decisions 3–6 of the
plan: the photo library only on the phone, admin remove-only on both, no
migration (`users.profile_pic` has been in `schema.sql` since the initial
commit), multer ^2 + sharp, and uploads kept out of backups.

- **Your own photo, in Settings → Account information** — Upload / Change
  and Remove beside a large (`size="lg"`, 5rem) avatar. **Choosing a photo
  uploads it; removing asks first**, naming what happens (the file is
  deleted, no undo — §5e). An admin may only **remove** someone else's
  (Admin → Users, a row action shown only on a row that has a photo, with a
  confirmation naming the person). There is no upload for someone else.
- **`users.profile_pic` is 32 random lowercase hex + `.jpg`** — a new name on
  every upload — and nothing else: **no login id (a parent's is the child's
  LRN, §5c), no user id, no timestamp**, in the name, the address or
  `activity_logs`. It is a FILE NAME, never a URL; `format/photoUrl.js`
  (mirrored to the phone) builds `<origin>/uploads/avatars/<name>` from the
  API base and **refuses any other shape**, so a stray value never becomes a
  request.
- **The name is the access key.** `/uploads` is served without a token (an
  `<img>` cannot send one; per-image authenticated fetches would be 50 on a
  50-row list), hardened with `index: false`, `dotfiles: 'deny'`, `nosniff`
  and a private cache. A copied address works until the photo is replaced or
  removed — a KNOWN_ISSUES row, accepted.
- **Every upload is re-encoded by sharp** — decoded (the real type check),
  turned upright, 512 × 512, a fresh JPEG — so **no EXIF survives, a phone's
  GPS position included**. The client's own type and size checks only save a
  pointless upload; the server's sentences are the authority.
- **Where a photo replaces the initials — USER rows only:** the sidebar /
  drawer user card, Settings → Account information, Admin → Users (both
  tables, both card lists), the Messages conversation cards
  (`other_user_profile_pic`), and the new-message toast (the sender, a USER
  row; §26, web and phone). **Learner avatars stay initials** — Students,
  Attendance, Attendance records, Excuse Letters, the parent dashboard's
  child — because `students` has no photo. `Avatar` takes `photo`, a card
  takes `avatarPhoto` (data, §5a-iii), `PersonCell` takes `photo`.
- **A photo that fails to load shows the initials**, keyed on the failed
  address so a new photo gets its own try — the answer to a restore of an
  older backup pointing at a deleted file (KNOWN_ISSUES). `alt=""` +
  `aria-hidden`: the name is always beside it as text.
- **Proved by** `ssr-avatar` (32; negative control — the name guard loosened
  → 23/32) and the server's `test:profile-photo` (70). The load-error
  fallback is an event SSR cannot fire — the browser check.

## 26. The new-message toast — who, never what (`feat/message-toast`, 2026-10-02)

**One toast for a chat message that arrives while you are elsewhere in the
app**, web and phone, built to the owner's ten rules. The decisions are a
pure module, `realtime/messageToast.js`, mirrored to the phone (the 26th
mirror); `realtime/MessageToast.jsx` renders them on each platform.

- **The words, and nothing else:** "New message from <name>", or
  "<n> new messages from <name>", with **View** and a close (×) button named
  "Dismiss". **Never any part of the body** — the host passes the module the
  sender's id only, and the proof feeds rows that carry a body and asserts
  none of it reaches the toast or the markup.
- **The name and the count come from the server, not the event.** The live
  `new_message` event is a bare `messages` row with no name, so the toast
  remembers who sent it and waits for the Unread provider's re-read of
  `GET /api/messages/conversations` — which every `new_message` already
  triggers — then reads that person's row: `other_user_name` and
  `unread_count`. **n is the server's "unread from this person"** (§10), so it
  can include one that arrived before the toast. `UnreadProvider` hands the
  rows on through `subscribeConversations(fn)`: **no second request, no server
  change, no `notifications` row, the bell untouched.**
- **One at a time:** the same person again updates the count; a different
  person **replaces** it — never a stack. **Skipped:** my own message, the
  conversation I am in, a person with nothing unread (read elsewhere), a row
  with no name. A skip leaves the toast on screen as it was.
- **"In that conversation"** is decided on the OTHER person's id: the web's
  `/teacher|parent/messages/:userId` (the :userId is the other user, not a
  conversation id) and the phone's focused `MessageThread` with
  `params.otherId`. The Messages LIST and someone else's thread still show it.
- **5 seconds**, started again by every new toast; on the web **paused while
  hovered or focused**.
- **A short tone on a toast SHOW or UPDATE — never on a skip, never twice**
  (fix round, 2026-10-02; the owner reversed "no sound"). One definition for
  both platforms, `TONE` in the mirrored `messageToast.js`: **"two-note rise"
  (feat/ui-refresh) — D5 then A5, a fifth up: four sine voices, summed —
  587 Hz from 0 ms for 140 ms, 880 Hz from 80 ms for 280 ms, and their
  octaves 1174 Hz (0–60 ms) and 1760 Hz (80–170 ms); peak 0.125 each, 360 ms
  in all; per voice a LINEAR rise from 0.0001 to the peak over 6 ms, then an
  EXPONENTIAL decay to 0.0001 at its end, the oscillator stopped 20 ms
  later** (`messageToast.js:24–59`). It replaced "two-tone down" (1047 Hz
  falling to 784 Hz), which the owner found clinical (`messageToast.js:30–32`);
  that had replaced a flat 880 Hz beep. The web generates it with the Web
  Audio API (`realtime/messageTone.js`): no file, no install, no URL, **ONE
  `AudioContext` created lazily and reused**, `resume()` before each tone, and
  silent — never a throw — if the browser refuses (autoplay policy, no Web
  Audio, a failing constructor). The phone plays the same tone from a
  bundled WAV and also vibrates (MOBILE M22). The decision runs OUTSIDE a
  setState updater (React may call an updater twice) and sounds only when
  `createToastStore().receive()` returns `changed`. No mute setting, no new
  UI text.
- **The toast lives in `createToastStore`** (mirrored `messageToast.js`): every
  change — show, update, replace, ×, the 5 s expiry, View — goes through it,
  so the toast each decision reads is never stale; the host's state only
  mirrors it for rendering.
- **ENTER SENDS, SHIFT+ENTER IS A NEW LINE — web only** (the two Messages
  thread pages; the phone keeps its Send button). The textarea's `onKeyDown`
  asks `components/enterToSend.js` and, on yes, calls `form.requestSubmit()`,
  which fires the SAME `onSubmit={send}` as Send: the same empty / whitespace
  guard, the same error handling, the same blocked state. It refuses exactly
  when the Send button is disabled (`sending || !draft.trim()`), during an IME
  composition (`isComposing`, `keyCode 229`), and for Ctrl / Alt / Meta+Enter;
  `send()` itself now refuses while a send is in flight, so neither path can
  send twice. **ONE SEND AT A TIME IS A REF (build 1 fix round,
  2026-10-05):** `sendingRef` is checked first, set before the POST and
  cleared in `finally` (both web thread pages; the phone's thread, M22) —
  `sending` is state and still drives the button, but two submits before the
  next render both read it as false. A held Enter's auto-repeats
  (`event.repeat`) never send; the first press does. The owner's double
  "Test 1" / "Test 4" rows were 7 s and 19 s apart, which no double submit
  explains — KNOWN_ISSUES keeps that open. **A PLAIN ENTER NEVER TYPES A NEW
  LINE (build 1 follow-up, 2026-10-05):** `enterKeyAction` answers `'send'`
  (prevent the newline, submit), `'block'` (prevent the newline, nothing
  else — a repeat, a blank box, a send in flight) or `null` (left to the
  browser — Shift+Enter, held or not, a modifier, an IME composition). The
  owner held Enter on "Test 8": the repeats, refused as sends but not
  prevented, typed blank lines into the emptied box, and a reload announced
  them as "Draft restored". `shouldSendOnEnter` stays as the `'send'` case.
- **Where:** web, fixed top-right just under the sticky header (`top-16`,
  `z-[35]` — under the bell's panel at 40 and the modal at 50); phone, M22.
- **Accessible:** `role="status"` + `aria-live="polite"` on a box that is
  **always mounted** and empty without a toast — a region that appears
  already holding its text is not announced (§21).
- **View goes through the leave guard** (`requestLeave`, §5e): on Grades or
  Attendance with unsaved work it asks "Leave without saving?" first.
- **The host mounts only where Messages is built** — a notification must be
  openable (§10). That is every role since 2026-10-05: **the admin gets the
  toast and the tone too** (teacher ↔ admin), its thread at
  `/admin/messages/:userId`, which `otherIdFromPath` accepts. (Until then the
  admin got none, having no Messages page.)
- **Tokens and existing pieces only** — `bg-surface`, `border-edge`,
  `text-fg`, the primary small button, `Avatar` (with the sender's photo,
  a USER row, §25) — so a later restyle reaches it with no edit.
- **If the socket is down there is no toast** — `LiveStatus` already says
  updates are paused (§5g); nothing polls.
- **`MessageToast.jsx` is imported WITH ITS EXTENSION** (`Shell.jsx`, and
  `AppShell.jsx` on the phone). It and the pure `messageToast.js` differ only
  by case; on a case-insensitive disk (Windows, a default macOS volume) an
  extensionless import tries `.js` first and got the pure module, which has
  no default export — the production build failed on exactly that, and
  `ssr-ui-d` (which reads the built stylesheet) dropped with it. A new pair of
  names differing only by case needs the same care.
- **Proved by** `ssr-message-toast` (39; negative controls with Edit: the
  body put into the label → 19/24 and the own-message skip removed → 23/24
  at 24 checks; a new `AudioContext` on every tone → 37/38 at 38; voice 2
  set to 880 Hz in the client `TONE` → 37/39, and `lint:mirrors` red) — the
  words, the row lookup, both "in that conversation" readings, every skip,
  the server's count, the replacement, no body anywhere, the rendered toast,
  the tone on show / update / replace only (three tones of four voices, 12
  oscillator starts), the voices' frequencies, ramps and start / stop times,
  ONE context, a refused or missing Web Audio
  never throwing, and the store after × and expiry; and by
  `ssr-enter-to-send` (15; negative control: the composition check removed
  → 12/15). The socket, the timer, the pausing, the sound itself, a real key
  press and View are the owner check with two accounts.

## 27. The UI refresh — one type, one button, entrances only, no Reload (`feat/ui-refresh`, 2026-10-02 → 10-04)

Built 2026-10-02/03 (`e46168f`), corrected on the owner's checks (`03c6238`,
`1b7a298`, `0ac7fec`), device-checked on the web, in a phone's Chrome and in
Expo Go. The phone's side is MOBILE_CONVENTIONS M23–M24.

### 27a. Two faces, and the sizes are Tailwind's own

- **Merriweather 700 for titles** (`font-serif`) **and Source Sans 3 for
  everything else** (`font-sans`: 400, 400 italic, 600, 700), bundled from
  `@fontsource` — no CDN, `font-display: swap` (`client/src/main.jsx:8–12`;
  `client/src/index.css:384–415`). **`font-medium` is 600** (`index.css:417`):
  only 400, 600 and 700 ship, and a 500 would be drawn with the 400 file
  (`index.css:409–411`).
- **The sizes are Tailwind's own** (12 / 14 / 16 / 18 / 20 / 24 / 30 / 36px)
  — the branch's one-step-larger scale was reverted on the owner's check
  (FR5). Titles step up by class (§24).

### 27b. One Button, one SectionHeader

- **`components/buttonClass.js` is the only button style; `Button.jsx` is the
  element over it**, and a `<Link>` that must look like a button takes
  `buttonClass()`. Variants `primary`, `secondary` (the default), `ghost`,
  `danger`, `danger-outline`. Sizes are MIN-heights, never fixed: `md` 44px
  (every form and page action), `sm` 44px below `sm` and 36px above (a row
  action), `lg` 48px (auth submits), `icon` / `icon-sm` square
  (`buttonClass.js:13–51`). `type` defaults to `"button"`; `loading`
  disables it and swaps the icon for a spinner while the label stays
  (`Button.jsx:11–20`).
- **`components/SectionHeader.jsx`:** the section's title in the title face —
  an `<h2>` (`as="h3"` inside a section), **never an `<h1>`**, which is the
  top bar's and the smoke fails a page with two — an optional sentence, and
  the section's own actions on the right. The page's primary action goes in
  `actions`, and an empty state never repeats it (§5f). **No Reload control**
  (`SectionHeader.jsx:1–14`).

### 27c. Motion is for entrances, and never where work is done

- **GSAP, from `motion/motion.js`:** a page or section arriving, cards
  staggering in, a figure counting up, the drawer sliding in — transform and
  opacity only, never a layout property; nothing waits on a tween; every
  entrance clears its inline styles (`motion.js:4–22`).
- **Reduced motion is the default path:** a tween exists only inside
  `gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', …)`, so
  with `reduce`, in an SSR render and with no JavaScript the markup IS its
  final state (`motion.js:13–17`, `:29`).
- **No motion on attendance marking, grade entry, the new-message toast or
  the "Leave without saving?" dialogs — so `Modal` is never animated**
  (`motion.js:24–26`; `components/Modal.jsx:31`; `realtime/MessageToast.jsx:47–48`).
- **The one loop: the skeleton's sweep** (build 2, the owner's decision 5,
  2026-10-07; a pulse until the fix round, F6, 2026-10-08) — one light band
  across the bars, the background only, never under reduced motion, three
  passes and then still, only while a region has nothing of its content on
  screen (§5a-vii). No other element may loop.

### 27d. No in-app Reload

- **The browser's reload is the web's reload** — no page or section carries a
  Reload control (`SectionHeader.jsx:9–11`). The one refresh button is the
  LiveStatus strip's, and on the web it is a full page reload
  (`layout/Shell.jsx:642–647`; §5g).

### 27e. The leave-guard sentence counts

- "You have N unsaved mark(s) … discards **it**" for one mark and
  "discards **them**" for more — `pages/teacher/AttendancePage.jsx:701–702`,
  and the phone's two sentences (`AttendanceScreen.jsx:176`, `:208`). No
  proof pins the sentence (TESTING → Not yet proved).

### 27f. One radius scale by role, constant borders (`feat/look-fixes`, 2026-10-05)

The owner found the buttons and chips tacky: soft pills and 12–16px corners
on everything. Planned with the `redesign-existing-projects` skill (its
"uniform border-radius" and "pill badges" findings), approved, built in build 1.

| Role | Corner (web / phone) | What takes it |
|---|---|---|
| Container | `rounded-xl` — 12px / 10.5dp | `cardClass` (`components/buttonClass.js`, phone `buttonStyles.js`), `Modal`'s panel |
| Control | `rounded-lg` — 8px / 7dp | every `Button` and `buttonClass()`, inputs (`FormField`), the phone's date field, segments and bell, the settings tabs, the report card's term track, the attendance marks, ScrollCue's button |
| Segment inside a track | `rounded-md` — 6px | the report card's term segments |
| Tag | `rounded-md` — 6px / 5.25dp | `StatusBadge`, the audience and category chips, the verified chips, the waiting count, the backup tag |
| Circle | `rounded-full` | avatars, the seal, dots, the unread and bell counts — unchanged |

- **Every button variant has a 1px border**, the filled ones in their own
  fill colour with hover (`border-primary hover:border-primary-hover`, likewise
  danger and success), ghost `border-transparent`; **no button shadow**. A
  button that changes variant in place keeps its size, and a primary beside a
  secondary is the same box (`buttonClass.js:28–68`).
- **`cardClass` is `rounded-xl border border-edge bg-surface`** — no shadow at
  rest. Anything that paints a card's corner from inside (DataTable's header
  cells, first card, last row and pager; the class record, the class summary,
  the parent attendance table, the report card's title band) uses the same
  `rounded-*-xl`. **Move them together** (`DataTable.jsx:139–142`).
- **Input focus is the accent border** (`FormField.jsx`,
  `focus:border-focus-accent`, 5.17:1 Light / 6.97:1 Dark); the `focus-ring`
  halo stays as decoration.
- **Heights, padding and touch areas are unchanged** (44 / 36 / 48px web;
  48 / 44 / 52dp phone). **No press motion** (§27c).
- **Not reshaped:** the web sidebar and rail and the phone drawer (locked —
  they keep `rounded-xl`); one-off inner rectangles. The dashboards' own
  card, hero and chips followed in build 2's Part C (2026-10-07, §15e): the
  container corner, no shadow, the icon inline, the facts as one line.
- **The focus trap** (`components/focusTrap.js`): `Modal` and the web drawer
  take focus once per opening (the effect depends on the open state only),
  wrap Tab, and give focus back to the opener; the drawer closes on Escape and
  is named "Menu" — on its `<aside>` until build 2, on its `role="dialog"`
  div since (§9).

## 28. Form drafts — kept in the tab, keyed by numbers, gone on logout (`feat/form-drafts`, 2026-10-04)

Phase 1 covers five forms and the message box: the parent's excuse letter,
the teacher's announcement and event, the admin's announcement and memo, and
both Messages threads. The phone's side is MOBILE_CONVENTIONS M25. Plan
approved by the owner on 2026-10-04 with eleven decisions; each is cited
below where it lives. **Device-checked 2026-10-04** by the owner: web in
laptop Chrome (parent in a normal window, teacher in Incognito); the phone
side in Expo Go (Tecno, Android 14).

### 28a. One pure core, mirrored

- **`drafts/draftCore.js` decides everything** — the key, the fields kept,
  the size limit, the copy — and is mirrored byte for byte to the phone
  (`npm run lint:mirrors`, 27 pairs). The storage is the platform's:
  `drafts/sessionDrafts.js` here, `mobile/src/drafts/deviceDrafts.js` there.
- **The key is `pp.draft.v1.<numeric user id>.<form>.<context>`**, the
  context `new`, `edit-<row id>` or `thread-<other user's numeric id>`
  (`draftCore.js:103–108`). **A login id, an LRN or a name THROWS** — the
  context pattern takes at most ten digits and an INT UNSIGNED, a 12-digit
  LRN does not fit (`:33–35`, `:79–87`). §5c, extended to storage keys.
- **Only allow-listed fields are kept, each cut to its cap**
  (`DRAFT_FORMS`, `:41–48`); a stored record with any other field, another
  version or another form reads as none (`:177–198`). **Above 32 000
  encoded characters nothing is written** (`:31`, `:170–171`) — and nothing
  claims it was, because the notice only appears on a restore.
- **Values equal to what the form opened with are not a draft**
  (`:159–160`): opening a form and closing it never leaves one behind.

### 28b. Where it lives and when it goes

- **`sessionStorage`** — a reload or a navigation inside the tab keeps it;
  closing the tab ends it. Every access is wrapped: a private window, blocked
  site data or a full quota THROWS, and then nothing is kept
  (`sessionDrafts.js:13–65`).
- **Written 500 ms after the last change** (`SAVE_DELAY_MS`), and flushed at
  once on `pagehide`, `visibilitychange` and unmount (`drafts/useDraft.js:22–64`).
- **Removed only on:** a write the server confirmed (`draft.submitted(form)`,
  e.g. `pages/parent/ExcuseLettersPage.jsx:271`), a confirmed **Discard
  draft**, and a **deliberate logout**, which removes every `pp.draft.*` key in
  the tab — every account's, every version (`auth/AuthContext.jsx:81–82`;
  decision 4). **A 401 does not** — `api/axios.js` sends the tab to /login
  without passing through `logout()`, so an expired session keeps its drafts
  for the same account to sign back in to. Another account signing in on the
  same tab never reads them: the key carries the user id.
- **Close keeps the draft** — the button is **Close**, not Cancel, in the five
  Phase 1 modals and nowhere else (decision 1): Cancel would promise the text
  is thrown away.
- **TEXT THAT IS EMPTY AFTER TRIMMING IS NOT A DRAFT (build 1 follow-up,
  2026-10-05).** A form whose every TEXT field is blank — message `body`;
  excuse `reason`, `details`; announcement `title`, `content`, `category`;
  memo `title`, `content`; event `title`, `description` — is never saved:
  the hook's flush clears the key instead (`drafts/useDraft.js`,
  `isBlankDraft` / `DRAFT_TEXT_FIELDS`), and Close removes a blank one kept
  from before rather than keeping it closed. A picker or a date is not typed
  text, so a picked date alone is not a draft. Both thread pages' restore
  (`keptMessage`) treats a blank kept message as none — no text, no "Draft
  restored". It reaches every Phase 1 form: the excuse letter, the two
  thread pages, teacher and admin announcements, the memo, the event. **One
  gap, on the web only:** the four modal forms restore through
  `sessionDrafts.loadDraft` / `findOpenDrafts`, which this rule does not
  touch, so a blank draft saved BEFORE the rule in a tab still open can
  reopen once; the next save or Close clears it, and a new one is never
  written. The phone has no such gap (M25).

### 28c. A reload reopens

- **A create draft reopens its modal after a reload; an edit draft reopens
  when its row is loaded** (decision 2). The draft is saved with an `open`
  flag while its modal is open; Close clears the flag (`closeDraft`). Each
  page restores ONCE, inside its existing `load()` after the rows arrive
  (`ExcuseLettersPage.jsx:135–150`, `teacher/EventsPage.jsx:139–147`,
  `teacher/AnnouncementsPage.jsx:180–189`), so no effect sets state and a
  later page change does not reopen anything. Admin → Announcements reopens at
  most one of its two forms (`admin/AnnouncementsPage.jsx:182`, `:210–248`).
- **An excuse-letter edit draft reopens only while the letter is still
  Pending** — a reviewed letter can no longer be edited.
- **Edit drafts keep the snapshot they began on, and say when the item has
  changed since** (decision 5): "Draft restored. This item was changed after
  your draft was saved — submitting replaces those changes."
  (`itemChangedSince`, `draftCore.js:203–206`).

### 28d. The notice, and Discard asks first

- **`components/DraftNotice.jsx`** — `role="status"`, the info tokens, one
  **Discard draft** button. It says where the draft is kept and until when
  (§5i): "Draft restored. It is kept in this browser tab until you submit it,
  discard it or log out, or close the tab." (a message: "…until you send
  it…").
- **Discard draft asks first (§5e — typed text has no undo), INLINE:** the
  question replaces the notice in the same box ("Discard this draft?" / "The
  text you typed will be deleted. This cannot be undone." / Keep draft /
  Discard draft). Not a second `Modal`: the notice sits inside a compose
  Modal, and two open Modals would both answer one Escape.

### 28e. Messages and the hand-off

- **Each thread keeps its own draft** (`thread-<otherId>`). The thread page
  is reused across `:userId`, so the draft switches during render when the id
  changes, never in an effect (`teacher/MessageThreadPage.jsx:104–121`).
- **A blocked thread (403) keeps its draft** (decision 10): writes stop while
  `blockedReason` is set (`active: … && !blockedReason`, `:121`) and the
  notice is hidden (`:416`); the text is still there if the thread opens
  again.
- **"Announce to a class" over a saved new-announcement draft ASKS**
  (decision 6): "Replace your saved announcement draft with this message?" —
  **Keep saved draft** / **Use this message**, the hand-off's text as the
  question's body (`teacher/AnnouncementsPage.jsx:739–753`). A hand-off with
  no text opens the saved draft without asking.
- **The announcement clears the thread's draft once it posts** (decision 7):
  the hand-off carries `fromThread`, the announcement draft keeps it, and a
  confirmed post clears `thread-<fromThread>` (`:374–375`) — the same words
  are not later sent to the parent by mistake. Until then the text is in
  both places, and the could-not-open notice says so: "Your message draft is
  below. It is also still in the conversation's message box." (`:507`).
- **Free text can hold anything typed**, an LRN included — the allow-list
  stops a FIELD, not what a person types into one (decision 8; KNOWN_ISSUES).

**Proof:** `client/scripts/ssr-form-drafts.jsx` (TESTING). **Not in this
branch:** the web spinner's focus loss (decision 11).

---

## 29. Privacy — consent before use, your own first password, sign-in limits, four fields not collected (`feat/privacy`, 2026-10-10; the first sign-in's three steps since `feat/first-signin`, 2026-10-18 — §29f)

The owner's answers 1–7 to the privacy PLAN (2026-10-07/10). The learner's
grades and LRN are sensitive personal information under the Data Privacy Act,
and consent for a minor's data comes from the parent or guardian. Four parts;
the server enforces every one of them, and the clients route on fields, never
on a 403 (§2).

### 29a. The consent gate — server-enforced, the FIRST of the three steps

- **An account** — a parent, and since feat/staff-acceptance (2026-10-11) a
  teacher or the admin — that has not accepted the CURRENT Data Privacy Notice
  AND Terms of Use can read itself (`/auth/me`) and reach `/api/policy/*` —
  nothing else (`403 POLICY_ACCEPTANCE_REQUIRED`, API_REFERENCE §5b).
  **Consent comes FIRST since feat/first-signin (2026-10-18)** — before the
  contact step and the new password (§29f); until then the forced password
  change came first, and change-password passed this gate.
- **`policy_pending` on `/auth/me` is what the client routes on.**
  `ProtectedRoute` sends a pending parent to **`/consent`**, a top-level route
  outside Shell and outside every ProtectedRoute — the forced-change screen's
  shape, for its reasons (a sidebar of refused pages lies; wrapping it loops).
  The page does its own guard: signed out → `/login`, consent not the next
  step → `entryPath(user)` (the next step's page, or home — §29f).
- **Three ticks, all required, in the words of the draft the principal will
  approve** (the fix round, PF4, 2026-10-10): "I have read and accept the Data
  Privacy Notice." · "I have read and agree to the Terms of Use." · **"As the
  parent or legal guardian of <first name>, I consent, on my child's behalf,
  to the processing of my child's personal data for the purposes in the
  notice."** — the child's FIRST NAME from `/auth/me` (`student_first_name`;
  "my child" when there is none), **never the LRN** (§5c). The button is
  **"I agree and continue"**, disabled until all three are ticked; the server
  checks the third again (`on_behalf_of_child: true`). **"Sign out" is always
  there**, under the line "Declining ends portal use only; your child's school
  records stay as they are." — and changes nothing. The apostrophes render as
  the app's typographic ’ (as in "school’s" above them); the words are the
  owner's. The phone says the same, word for word (MOBILE M26).
- **Staff: two ticks, no child tick** (feat/staff-acceptance, 2026-10-11; the
  owner's decisions). A teacher or the admin sees the same screen with the
  first two ticks above, word for word, an intro without "for your child",
  and the same button; the accept sends `{ versions }` only (the server
  neither requires nor reads `on_behalf_of_child` for staff, and their rows
  carry no `student_id`). The line above Sign out is **"Declining ends portal
  use only."** (`DeclineLine`). A parent's screen, ticks and words are
  unchanged; the phone does the same (MOBILE M26).
- **The socket refuses the same gates** (the fix round, PF2; three since
  feat/first-signin, from the one `utils/accountGates.js` call):
  `server/socket.js` answers the first pending gate, in `middleware/auth.js`'s
  order, with the 403's sentence and `data.code` on `connect_error`. No client
  connects before all of them are past — the socket lives in Shell — so this
  is the backstop for a direct client.
- **A restore brings the gate's tables back** (the fix round, PF1): the
  restore route runs the same step as `npm run db:migrate:privacy` after the
  pool reset, so restoring a backup from before this build no longer leaves
  every signed-in request a 503 (KNOWN_ISSUES, closed).
- **The accept sends the versions the screen SHOWED.** A version that changed
  while the screen was open is a `409`; the page shows the message, reloads
  the documents and clears the ticks. Never a silent acceptance of words the
  parent did not see.
- **The exit is the re-read**: `refresh()` brings `policy_pending` back false
  from the server and the page goes to `entryPath(me)` — the contact step, the
  new password, or home. A new version of either document sets it true again
  for every account — accepting is per version.

### 29b. The text ships with the app — and is a placeholder

`server/policy/privacy-notice.md`, `terms-of-use.md` and `versions.json`
(the owner's answer 2): git keeps every version's exact wording, a new
version is a deliberate release (edit, bump, restart the API), and nothing can
change quietly without a bump. **Both documents are "Draft — awaiting the
school's approval"** and hold no legal text; the owner supplies the approved
text (KNOWN_ISSUES). The client renders the text as paragraphs split on blank
lines, inside a focusable, labelled scroll region (`role="region"`,
`tabIndex=0`) so a keyboard can scroll it.

### 29c. Settings → Security & policy — every role

A tab after Change password (`settings/tabs.js`, mirrored; `fa-shield-halved`):
both documents and their versions, and **the date each was accepted** — every
role since feat/staff-acceptance, because the server's `required` is true for
staff too — the server's `accepted_at` shown as the MANILA calendar day
(`timestampDay`, never computed here). The `required: false` branch (the
documents, and that parents accept them — never a "Not accepted" that reads as
something owed) stays for a role that ever accepts nothing.
`SettingsLayout`'s old "DO NOT add Security & policy" note is replaced.

### 29d. Your own first password, and the sign-in limits

- **New teachers (`POST /users/teachers`) and new parents
  (`POST /users/parents`) are created with `must_change_password = 1`** (the
  owner's answer 4): whoever typed the password, the account holder picks
  their own at the first sign-in — since feat/first-signin after confirming a
  contact, with no temporary-password field (§29f).
- **Sign-in limits** (the owner's answers 5 and 2, `utils/loginThrottle.js`):
  5 failures **in a row** per account within 15 minutes, 100 per IP (a whole
  school network can share one address in the cloud); a correct password
  clears the account's count, never the IP's. **An unknown login id locks the
  same way, with the same bodies** — a 429 must not become the LRN oracle the
  one "Invalid login credentials." reply refuses to be. `login_attempts` holds
  an HMAC of the typed id, never the id; failures are `login_failed` with the
  user id only. The Login page shows the server's 429 sentence through
  `extractError` — no client change.

### 29e. Four learner fields are no longer collected (decision 6)

The learner's **birthday, gender, address and contact number** — stored, shown
on the student record, used by no feature. Gone from the enrol wizard
(`teacher/StudentsPage`) and both student records (admin and teacher): the
record is one card, LRN (and the parent account's status for the admin); the
Contact details card is gone. The server refuses a value (400 by field) and
ignores a null or empty key; `db:migrate:privacy` cleared what was stored;
the columns stay. **The PARENT's own contact number is not one of them** — it
belongs to the guardian's account, not the learner's record. It is not
collected in the wizard either, since `feat/account-create` (2026-10-21,
§29g): the Create parent account step is Guardian name, Password and Confirm
password (`teacher/StudentsPage.jsx`), `POST /users/parents` refuses an
email or a number with `400`, and the parent confirms a Gmail or a mobile
number at the first sign-in (§29f); an admin may set one on Admin → Users →
Edit.

### 29f. The first sign-in — consent, a confirmed contact, your own password (`feat/first-signin`, 2026-10-18)

The owner's scope item 2. Every account's way into the app, in the server's
order (`server/utils/accountGates.js`, API_REFERENCE §5b):

1. **Consent** (§29a) → `/consent`.
2. **A confirmed Gmail or mobile number** → `/confirm-contact`
   (`pages/ConfirmContact.jsx`): every account with neither confirmed, and a
   forced change that has not confirmed one in THIS session — decision D2,
   "Confirm it’s you".
3. **The new password** → `/change-password` (`ForcedPasswordChange.jsx`):
   "Set a new password", New and Confirm only — **no "Temporary password"
   field** — and "Save password" writes `PUT /auth/first-password`, which the
   server refuses unless the account is in the forced state AND confirmed a
   contact since this sign-in.

- **One `nextStep(user)`**, in the mirrored `auth/accountSteps.js`
  (`policy_pending` → `contact_pending` → `must_change_password`).
  `ProtectedRoute` redirects to `STEP_PATH[step]` before the role check, and
  each step page sends anyone not on its step to `entryPath(user)`
  (`auth/stepPath.js`, web only). The fields, never the 403s (§2).
- **The contact step's words are the mirror's `CONTACT_COPY`**: "Confirm your
  contact" / "Choose your Gmail or your mobile number. We’ll send a 6-digit
  code to it. One is enough — you can add the other later in Settings."; the
  reconfirm face "Confirm it’s you" / "Before you set a new password, we’ll
  send a 6-digit code to your confirmed Gmail or mobile number." Gmail and
  Mobile number are two native radios (the control radius; the choice filled
  AND heavier, never colour alone). A value on file shows read-only with
  **Change**, so nobody sends a code to an address they cannot open; a new
  value is saved first (`PUT /auth/email` or `PUT /auth/contact`, each
  unconfirming what it changed), then the verify request. "Send code" → "We
  sent a 6-digit code to <value>." with Change, the 6-digit field, Confirm,
  and **"Resend code in 0:59"**. **No Back and no Skip** — only Sign out,
  which changes nothing. "Gmail" is the label; any valid address is accepted
  (decision D5).
- **The resend clock is the server's** (60 s: a `429` with `retry_after` on
  the verify requests, silent on forgot-password). `hooks/useCooldown.js`
  (mirrored) counts a DEADLINE, so a throttled timer never stretches the wait;
  `components/ContactCodeForm.jsx` is the code half for the step and Settings
  alike. Forgot password counts the same minute after EVERY 202 — it must not
  branch on whether a code went out (§11).
- **Your own email, Settings → Account information**: "Update email"
  (`PUT /auth/email`) beside the number. A change is unconfirmed until its
  code is typed, an admin edit unconfirms it too, and the same address may be
  on several accounts. Changing the ONLY confirmed contact sends the account
  back to the step, and the field says so first: "You’ll confirm the new
  address before you can use the app again." The email is no longer a school
  record, and no sentence on the page tells you to ask the office for it.
- **The temporary-password dialog says what happens next** (Admin → Users):
  "When they next sign in, they confirm their Gmail or mobile number with a
  code, then choose their own password."

**Proof:** `client/scripts/ssr-privacy.jsx` (TESTING) — rendered: the consent
body in every state and the Security & policy view for a parent and for staff;
source, with controls, only where a render cannot reach: the gate's order (the
mirrored `nextStep()` as plain data since feat/first-signin), the routes, the
retired fields — and `ssr-first-signin.jsx` for §29f. **The browser check
owns** a real redirect, a real accept, a real code, the countdown and the
300 ms clock.

**Device-checked 2026-10-20/21 on the web — PASSED**
(`docs/FIRST_SIGNIN_DEVICE_CHECK.md` §9): the three steps on a new teacher;
"Confirm it’s you" on a temporary password, Change kept on the step (the
owner's D2 follow-up, 2026-10-21); Update email's three cases — (c) adding
on the check parent (the Verify email path seen; the Save sentence read
from the code), (b) seen verbatim on the same parent, (a) the gate on the
check teacher; the admin edit's both halves — "Not confirmed" on the
parent, the gate with an empty Gmail field on the teacher after the admin
cleared the address; Forgot password's one reply and clock — the minute
rule itself rests on the phone run with one account, the web's
inside-the-minute press having used a second Login ID.

### 29g. Account creation collects no contact (`feat/account-create`, 2026-10-21; the owner's decision of 2026-10-16)

**Create teacher (Admin → Users), the enrol wizard's parent step and Create
parent account (Teacher → Student detail) carry no Email and no Contact
number field, hold neither key, and send neither.** The holder confirms their
own Gmail or mobile number at the first sign-in's contact step (§29f), the
one place an address is proved to be theirs; an office that must fix one does
it through Admin → Users → Edit, which keeps both fields and unconfirms a
changed value (B4 §7). **The server is the rule:** `POST /users/teachers` and
`POST /users/parents` refuse a non-empty `email` or `contact_number` with
`400` naming the field — "The email address is no longer collected here — the
account holder confirms one at the first sign-in." — the way decision 6
refuses the learner's four fields (§29e), and ignore null or empty
(API_REFERENCE §8); for a parent the refusal runs BEFORE the scope query,
like the password rule, so it reveals nothing about the LRN. Settings →
Account information and the contact gate are unchanged, and so is the
mirrored `format/contactRule.js`, which the Edit dialog and Settings still
use.

**Proof:** `client/scripts/ssr-account-create.jsx` (source, with controls:
the three forms hold neither key and neither label; Login ID / Password /
Name and Guardian name / Password / Confirm password stay; the Edit dialog
still has both fields and is the only caller of the contact rule on that
page; the old body line and the old field are caught by the patterns);
`ssr-privacy` keeps the parent lines gone instead of "stays". The phone:
MOBILE M15, M17 and `proof-privacy`, `proof-admin-users`. **The device check
owns** the three dialogs on screen and a new account's first sign-in landing
on an EMPTY contact field (`docs/ACCOUNT_CREATE_DEVICE_CHECK.md`).

### 29h. The password alert — "was this you?" on every confirmed channel (`feat/password-alert`, 2026-10-21; the owner's decision of 2026-10-14/16)

**After a password has changed, the account holder is told — by email, by
text, or both, whichever they have confirmed — with no code and no link.**
One rule, no branch, on all four paths: Settings → Change password, Forgot
password's reset, the first sign-in's own password (a brand-new account too —
the owner's answer Q1) and the admin's temporary password, which has its own
words ("the school office set a temporary password", Q2). A restore sends
nothing (Q6). **Server-only (Q4):** `server/utils/passwordAlert.js`, called by
the four handlers AFTER the reply and never awaited — a failed send changes
nothing and undoes nothing, and no reply waits for SMTP or the gateway. The
channels are forgot-password's own: the email when `email_verified_at` is
set, the number when `contact_verified_at` is set and this server can send
texts; nothing confirmed → no message and one `password_alert_not_sent` row
(Q8). Logged on the HOLDER's id, never a value: `password_alert_sent` with the
channel names, `password_alert_email_failed`, `password_alert_sms_failed` with
the transport's fixed reason; the admin's `admin_temp_password` row stays on
the admin. **Not a code:** no `auth_codes` row, so an alert never counts toward
the hourly limits or the resend cooldown, and no cap of its own (Q3) — every
send has a real password change behind it. **The texts** (`utils/mailer.js`,
`utils/smsTransport.js`, approved as written) carry no code, no link (what a
phishing message would copy), no login id, no LRN, no learner name and no run
of six digits — a code's shape, which the recovery suite reads codes by; the
two SMS are ASCII and one GSM-7 part. In file mode both transports mark an
alert `kind: 'password_alert'`, so a suite reading codes off disk skips it.
**Nothing on either client changes**: the pages that change a password say
what they said. **Proof:** `test:recovery` (all four paths, both channels, the
no-contact case, the words, the row on the holder and not the admin) and
`test:sms-transport` (the two texts' shape); the device check owns the real
inbox and the real phone (`docs/ACCOUNT_CREATE_PASSWORD_ALERT_DEVICE_CHECK.md`,
one sheet for `feat/account-create` and this branch — D-79).

## 30. One Messages component — the thread and the list, every role (`feat/shared-messages`, 2026-10-11)

**The rule: every web Messages surface is one of two shared components, and a
role's page is a small wrapper that passes only what the code already made
role-specific.** Before this branch the admin's and the parent's pages were
one pair of files and the teacher's another, kept equal by hand — every fix
(#11, the send guard, F1, F2) was written twice and proved twice. A third
copy was the trigger the parent thread's own header named.

### 30a. `pages/messages/MessageThread.jsx` — the conversation

Owns, once: the reads on a cursor (C3), read-all and the unread refresh
(§10), the socket, **where the list and the page scroll** (below), Load
earlier, the one-send-at-a-time ref, Enter to send (§26), the draft (§28),
the 403 that replaces the composer, the header and the bubbles.

| Prop | What the wrappers pass |
|---|---|
| `listPath` | where the top bar's ← goes — parent page: `/admin/messages` for the admin, `/parent/messages` for a parent; teacher page: `/teacher/messages` |
| `renderTop` | optional, `({ otherId, other, draft }) => node \| null` — the row above the card (no `back` since fix round 2). Only the teacher passes it: "Announce to a class" with its hint, on a PARENT's thread only — null on any other, so no row and no gap; the button right from `sm` like its hint, left below. Its `GET /messages/contacts` read stays in the teacher's page and starts with the page, beside the thread's own read |

**The positioning rules it carries, unchanged** (§9 and the 2026-10-06
follow-up): nothing is consumed until the list is mounted, not loading and
holding THIS thread's messages; the first positioning of a thread puts the
list at its newest message and brings the box in by the smallest page scroll
(`keepBoxInView`); after that only a NEW newest message moves the list, and
only my own send may move the page. Shell's new-page scroll runs at the
navigation, before the thread has loaded, so the thread has the last word.

**The way back never scrolls away (fix round W1, 2026-10-11, the owner's
device check).** Opening at the newest message with the box in view leaves
"All conversations" above the window on a long thread, so the thread also
hands the top bar its `listPath` through `usePageBack`
(`layout/usePageBack.js`, provided by Shell like the title), and
`Header.jsx` shows a **←** before the title, as the phone's thread
header does: a real link, the shared ghost icon button (44px), named "All
conversations". Only a page that calls the hook gets one — today the thread
alone — so every other bar is unchanged and keeps its 4rem. A layout effect
sets and clears it, so it never shows for a frame on the next page.
**Since fix round 2 (the owner's re-check) the ← is THE way back:** the
thread's own "← All conversations" above the card was a duplicate and is
gone, every role and width; the hook is called before the loading return,
so the ← is there while the thread loads and after a 403.

### 30b. `pages/messages/ConversationsPage.jsx` — the list and the picker

Owns: `GET /messages/conversations` paged and sorted (C1/C6), the socket
re-read, DataTable with its conversation card (§16), the New-message picker
(`fetchAll` over contacts, C2) and its search.

| Prop | Parent page (admin and parent) | Teacher page |
|---|---|---|
| `base` | `/admin/messages` or `/parent/messages` by role | `/teacher/messages` |
| `groups` | Teachers | Parents, Teachers, Admin |
| `searchPlaceholder` / `searchFields` | "Teacher name" / name + subject | "Contact name or student name" / name + learner |
| `noContactsMessage` | the admin's or the parent's sentence, by role | the teacher's |
| `renderContact` | — (name and subject; the adviser label rides in `subject`) | parent rows lead with the learner |

**Who may be messaged stays the server's** — `GET /messages/contacts` is
the inverse of `canMessage()`; the page only GROUPS what came back. The
locked pairings (teacher ↔ admin, admin → teachers only, no parent ↔ admin)
are therefore unchanged by construction.

**An empty picker group says why (§5f; the owner's decision of
2026-10-11):** with a search applied, "No <group> match that search."; with
none, the group's own sentence — Parents' "No parents yet. A parent appears
here once an admin approves their account.", otherwise "No <group> to
message.". Before, the teacher's Teachers and Admin groups said "match that
search" with no search, and its Parents group said "No parents yet" during
one. **The look is the existing one, chosen per difference:** picker rows
`text-sm`, the picker's `space-y-4` (both phone pickers' look), and the
title's `[&_h2]:break-words` (the parent page's guard).

**The whole row opens the conversation (fix round W2, 2026-10-11).**
`DataTable`'s `onRowClick(row)` — opt-in, off by default, passed by this page
alone — sends a click anywhere on a table row where Open goes, with the
pointer cursor. **Open is unchanged** and stays the keyboard and
screen-reader path: the row gets no tabindex, role or name. A click on a link
or button inside the row is that control's (`openRowOnClick` ignores it), so
Open navigates once; a drag that selected text in the row does not open it.
Below `sm` the card was already one link (§5a-iii).

### 30c. What proves it

- `scripts/loop-messages-thread.mjs` — **the REAL thread pages in headless
  Chromium**, 1366×600, inside a stand-in for Shell's frame (its class lists
  checked against `Shell.jsx` and `Header.jsx`), the api / auth / socket /
  unread modules swapped for fixtures by a Vite plugin, served by
  Playwright's request interception: no server, no database, no sign-in.
  Per role: (a) opens at the newest message with 6 unread and with none, (b)
  the box in the window, read-all once or never, and "Load earlier" keeping
  the place. Controls A (the pre-fix effect), B (no `keepBoxInView` on open)
  and C (the newest-id check removed), made in memory and required to change
  the shared file exactly once, must each turn their check red. TESTING has
  the run-book.
- The source-text proofs read **the wrapper and the shared file together**:
  `ssr-look-fixes`, `ssr-form-drafts`, `ssr-enter-to-send`, `ssr-dv1b-a`.
- `scripts/ssr-messages-nav.jsx` (the fix rounds, 20 checks, each with a
  negative control): the bar rendered with and without `back`, only the
  thread handing one over (before its loading return), and the thread page
  with no "All conversations" link of its own; the rows with and without `onRowClick`, the row's
  handler RUN on fake clicks (a cell, Open, the icon inside Open, a link, a
  text drag), and only this page passing it, to Open's own path. It cannot
  run the effect that sets the ←, or a real click — the device check.
- **Not proved here:** a real socket, a real send, the picker's Modal in a
  browser — the owner's device check (TESTING).

The phone's one thread screen already served every role; it follows the
same three positioning rules since this branch (MOBILE M27).

## 31. Grade locks — a whole term at once, and a lock freezes the class's HPS (`fix/grade-locks`, 2026-10-13)

**The owner's Finding 1.** Locking one learner × subject × term at a time is
impractical across Grades 1–6 (1b), and an HPS change on Teacher → Grades
rewrote a LOCKED grade's maximum and recomputed it (1a). The server rules
are `docs/API_REFERENCE.md` → "Lock or unlock a whole term" and the class
record's refusals; this section is the screens.

### 31a. Admin → Grades — "Lock or unlock a term"

- **One button on the "Report card" header** (`SectionHeader` `actions`)
  opens `pages/admin/GradeLocksModal.jsx`; its result line renders under that
  header (`FormStatus`, the page's `status.bulk` key, §7c) after the dialog
  closes, and the report card on screen re-reads. The one-grade lock modal is
  unchanged beside it.
- **The controls:** Action (Lock grades / Unlock grades), Term (today's term
  from `format/schoolCalendar.js`), Grade ("Whole school" by default, the
  owner's D2), Section ("Pick a grade first", then "All sections in Grade
  N"). The sentence under the title says what the server does (§5i): a lock
  takes only learners with a grade in every subject and lists the rest; an
  unlock takes every locked grade, complete or not.
- **Preview, then one write.** Preview is a dry run. **Changing any control
  clears the preview**, so the primary button can never act on a scope the
  admin is no longer looking at; the button appears only when the preview
  has something to do and **names the count** ("Lock 8 grade records");
  the controls are disabled while a request is out. No further confirmation:
  the action is reversible by unlock, and the preview IS the deliberate step
  (§5e).
- **The result line comes from the APPLIED answer**, not the preview, which
  can be stale by then; zero changed reads "No grade record changed — the
  grades changed since the preview. Preview again."
- **The skipped learners are a plain list, not a `DataTable`** (the owner's
  D4) — a read-only summary inside a dialog, nothing to sort or open: "Last,
  First · Grade G - Section · P of S subjects still Pending". **Never an LRN**
  (§5c) — the server sends none, and the SSR proof renders a control that
  would.
- **One status slot inside the dialog** (§7c) — a failed preview, a failed
  write and the result line share it. **The dialog resets as it CLOSES**,
  not in an effect on open (oxlint's `set-state-in-effect` would count one).
- **Every word is `format/gradeLocks.js`**, pure and MIRRORED byte for byte
  to the phone (`lint:mirrors`): the heading, the preview lines, the skipped
  row, the button, the result line, the request body and the unwrap list.

### 31b. Teacher → Grades — the HPS freeze needs no client change

A dry run that changes a column's HPS while a learner of the class is locked
answers `409`; the grid's existing line shows it — "Live totals are out of
date — Tala Halimbawa has a locked grade for this subject and term — ask an
admin to unlock before changing a highest possible score." — and Save all
shows the real save's sentence, which starts "Nothing was saved.". The locked
learner's row was already disabled (§13). Nothing in `ClassRecordPage.jsx`
changed; the phone's slot screen behaves the same (MOBILE M28).

### 31c. What proves it

`scripts/ssr-grade-locks.jsx` (TESTING): the mirrored words driven, the
request body, the unwrap list against the handler's response keys, the
preview RENDERED with no LRN (a control prints one), the dialog rendered open
and closed, and the page's wiring as source — with the three report-card
lines `fix/web-load-races` added (`main`'s `GradesPage.jsx:247`, `:539`,
`:570`) still verbatim. **Cannot prove** a real preview, a real lock or
the header line after a close — the owner's device check
(`docs/GRADE_LOCKS_DEVICE_CHECK.md` — PASSED 2026-10-13, §5).

## 32. The smoke gate's fix round — four findings, words and wiring only (`fix/smoke-round`, 2026-10-13)

The owner's smoke-gate findings F4–F7, built on `fix/grade-locks` so one
merge brings both. No server change: every value below was already in the
API's reply. F3 (a visit should clear a page's badge) was cut for the
professor's check and is a KNOWN ISSUES row for every badged page.

### 32a. The class record prints no Summative raw total (F4)

ST PS is **ST1 30% + ST2 30% + TE 40%, each part out of its own highest
possible score** (DO 015 s. 2026; `gradeComputation.exPercentage`). The grid
used to print "ST Total" (59) under a Highest possible total (80), which
reads as the basis of a PS it is not — 73.50, not 59/80 = 73.75. Now
`ClassRecordPage.jsx` has **no ST Total column** (the group spans its three
fields + 2), the Highest possible row prints nothing under it, ST PS carries
`title="ST1 30% + ST2 30% + TE 40%"`, and **a line under the grid says it in
words** — touch has no hover:

- Grades 2–6: "ST PS = ST1 30% + ST2 30% + TE 40%, each part out of its own
  highest possible score (DO 015 s. 2026) — not the three scores added
  together."
- Grade 1: the same **without the citation** — its Summative uses the same
  weights, but that is the school's rule (GRADING_SPEC §6a), never DepEd's.

Display only: the computation is unchanged, and the server still sends
`ex_total`, `ex_total_max` and `group_hps.ex` (`test:class-record` asserts
them) — nothing on screen reads them. WW and PT keep their Total columns.

### 32b. A parent's breakdown names each score as the class record promises (F5)

`format/componentLabel.js` (mirrored) keeps the promise the class record's
own helper makes the teacher — "Left blank, this column is called “Written
Work 1” here and on the parent's grade breakdown" (`SlotHeader.jsx`, the
phone's `SlotScreen`): an unnamed column is **"Written Work N" /
"Performance Task N"**, a named column is **its name alone** ("Group
project"), a legacy row (no slot) keeps the server's `display_label`. That is
the server's own `slotDisplayLabel`, and the proof checks the two agree. The
breakdown printed `row.label`, which is NULL for every score written from the
grid, so its rows had scores and no names. **The teacher's grid keeps its
codes** ("PT1", the name under it), and the Examinations rows (ST1, ST2, TE)
were already right. (The branch first shipped the grid's codes, "WW1" /
"PT1 · Group project"; the owner changed it after the device check's section
3, so the helper's sentence stays true.)

### 32c. Sign-in confirms a password reset (F6)

`ForgotPassword` keeps the server's own sentence — "Password updated. You can
sign in now." — and passes it to `/login` in the **router's state, never the
URL** (§5c). `Login` reads it once in a state initialiser, shows it as a
success `FormStatus` first in the card, replaces the history entry without it
(a reload or Back shows nothing), and a sign-in attempt clears it, so it never
sits beside a refusal. The reset accepts the current password as the new one
(the server checks the rule only).

### 32d. A per-row lock or unlock closes its dialog and keeps the line (F7)

Admin → Grades' lock dialog used to stay open after a lock or an unlock with
"<Subject>, Term N locked." / "… unlocked." set BEHIND it, and every way out
ran `closeCell`, which clears the status — so neither direction left a word
on screen. Now `toggleLock`'s success path calls `setSelected(null)` (never
`closeCell`) and then sets the line above the report card — the same for
both directions, as the phone's lock sheet and the bulk dialog already
behaved. A failure still shows inside the dialog.

### 32e. What proves it

`scripts/ssr-smoke-round.jsx` (TESTING): F4 as source (the class record needs
a live API), F5 driven and RENDERED from `GET /api/grades/:id`'s shape, F6
RENDERED with and without the router state, F7 as source — each with a
control. **Cannot prove** a real save, a real reset, a real lock or the dialog
closing on screen — the device check (`docs/GRADE_LOCKS_DEVICE_CHECK.md`).

## 33. Grade acknowledgement — "I have seen these grades", once per locked term (`feat/grade-acknowledgement`, 2026-10-21)

The owner's Q1–Q12 (2026-10-21). A parent confirms a TERM of their child's
report card once the school has locked it; the adviser is told; an unlock
clears it. The server rules are `docs/API_REFERENCE.md` → "Grade
acknowledgements"; this section is the screens. **Every word on every
screen is `format/acknowledgement.js`** — pure, mirrored byte for byte to
the phone (`lint:mirrors`) — so the parent's card, the adviser's sheet and
Admin → Grades cannot drift.

### 33a. Parent → Grades — the block on the report card

- **One block per LOCKED term, between the info row and the grades**
  (`ReportCard.jsx` `TermConfirmations`, exported for the proof): "Term N
  grades are final." over "The school has locked them. Please confirm that
  you have seen them." and the one button, **"I have seen these grades"**.
  A term is locked when the server says so — `acknowledgements[term].locked`
  is "every subject of the term locked with a value", the bulk lock's own
  test; a term that is not shows no block at all. **No lock date:** nothing
  records when a term was locked, so the sentence names none (§5i).
- **The button opens a §5e dialog; the card never writes.** The write cannot
  be undone by the parent (only an admin's unlock clears it), so the dialog
  names the term back — "Confirm Term N grades?", "This tells the adviser
  and the school that you have seen your child's Term N grades. It cannot
  be undone.", **Go back** / **Yes, I have seen them** — and only the second
  step posts `POST /api/grades/acknowledgements { term }`. A failure renders
  INSIDE the dialog (`FormStatus`, §7c); a success closes it and re-reads
  the card, whose block then says **"You confirmed Term N on 21 October
  2026."** — the result next to the control that caused it, from the
  server's own row (§5b), the Manila day (`timestampDay`, §5a-iv), never
  this page's state. `print:hidden` on the button only: the confirmed line
  is a fact worth printing.
- **The unwrap list gained its eighth key** — `acknowledgements` — on the
  parent page, the adviser's learner page and admin Grades (§1).
- **The parent's bell** carries `grades_locked` ("Term N grades are final" /
  "Please confirm you have seen your child's Term N grades.", link
  `/parent/grades`), bell only like every grade type (§10); it stops being
  listed and counted once the confirmation exists (the self-heal, §10),
  and the row stays unread as history.

### 33b. Teacher → Class summary and the learner's card

- **A "Confirmed" column on a TERM sheet only** (`ClassSummaryTable`): the
  header "Confirmed" over "N of M learners" (counted, never concluded —
  §4); per learner the date (`timestampDay` short), **"Not yet"** while the
  term is locked and unconfirmed, and **"—"** while it is not locked —
  not a grade value, so §3's rule does not apply, and the cell carries the
  accessible name "Not locked yet". Never on the Final sheet: there is no
  term to confirm. `ScrollCue`'s sentence names the hidden trailing columns
  — "Scroll for 3 more subjects, the Average and Confirmed →".
- **The learner's drill-through** renders the same `ReportCard` with NO
  `onConfirmTerm`, so the block says "Confirmed by the parent on <date>." or
  "The parent has not confirmed yet." and nothing in it is a button.
- **The adviser's bell** carries `grades_acknowledged` ("Grades confirmed" /
  "<Learner>'s parent has seen the Term N grades.", link
  `/teacher/class-summary?term=N`) — **Class summary opens on the confirmed
  term**, because the page reads `?term=` and falls back to today's term only
  without one (the B1 fix round, 2026-10-22: the bare link opened Term 2 and
  "0 of N learners"; no client change) — the adviser of the learner's section only
  (`excuseAdviserAudience`, the review authority), re-checked live, so a
  teacher who stops advising the section stops seeing it.

### 33c. Admin → Grades — what an unlock clears

- **One line per confirmed term under the learner's header card** — "Term N
  · Confirmed 21 October 2026" with the check icon — from the card (§5b).
- **The lock dialog says what an unlock does** (§5i), only while the
  parent's confirmation of that cell's term exists: "The parent confirmed
  these grades on <date>. Unlocking clears that confirmation, and the parent
  is asked again after a relock." The bulk dialog's unlock preview adds
  **"Confirmations to clear: N."** after its count (`format/gradeLocks.js`,
  `LOCKS_UNWRAP` + `acknowledgements_cleared`); a lock never shows it.
- **Nothing for the admin's bell** (the owner's Q5).

### 33d. What proves it

`scripts/ssr-grade-acknowledgement.jsx` (TESTING): the words exactly; the
block RENDERED in the parent's three states and the reader's, and nothing
for an unlocked term; the whole report card with the block in its place and
no `initial_grade` leaking; the summary's column on a term sheet and absent
on the Final; the unwrap lists against the handlers' keys; the parent page,
admin Grades, the two route files, `schema.sql` and the migration as source —
each with a control. `ssr-grade-locks` gained the unlock preview's clear
line. **Cannot prove** a real confirm, the dialog's focus or the bell — the
owner's device check (`docs/GRADE_ACKNOWLEDGEMENT_DEVICE_CHECK.md`).

## 34. A visit clears a badge — its information rows only (`fix/f3-badges`, 2026-10-22)

The smoke gate's F3 (2026-10-13, KNOWN_ISSUES): visiting a badged page left
its badge; only opening each notification from the bell cleared it. The
owner's decision (2026-10-22): **a visit clears only the INFORMATION
notifications a badge counts; a call to act keeps clearing only on the
decision**, as built (§10's self-heal). The server rules are
`docs/API_REFERENCE.md` → Notifications (`PATCH /read-all { section }`).

### 34a. Which pages clear, and what

| Role | Page | Section | Clears on a visit |
|---|---|---|---|
| Teacher, Parent | Announcements / Memos / Events | `announcements` / `memos` / `events` | the announcement / memo / event rows |
| Parent | Excuse Letters | `excuse_letters` | the reviewed-letter rows (approved and declined — information, the owner's Q1) |
| Admin | Announcements | `announcements` | announcement AND memo rows — the badge carries both |
| Teacher | Excuse Letters | — | **nothing**: "letter submitted" is a call to act, cleared when the letter is reviewed |
| Admin | Users | — | **nothing**: "parent pending" is a call to act, cleared when the account is decided |

**The server decides what a section covers** (`VISIT_CLEAR` in
`routes/notifications.js`, per role); the page sends only its section's
name. No grade type is in any section — Grades is never badged and the two
grade-acknowledgement types are bell-only (§33) — and messages are not
notifications.

### 34b. What a visit is on the web

`realtime/useVisitClear.js` — `useVisitClear(section, loaded)`, one call per
page beside its load effect. **Once per mount**: a navigation to the page, a
browser reload, or a Retry that succeeds after a failed first load. A filter,
sort or page change on the same mount is not a visit. **A failed load clears
nothing**: `loaded` is `!loading && !error && page !== null` (Excuse
Letters, unpaged: `!loading && !error`; Admin → Announcements: both of its
lists). **Sent on every visit, even at 0** (the owner's Q7) — simpler than
reading the count first, and right on a reload, when the counts may not have
arrived yet. After it, `refresh()` re-reads `/unread-counts` (§10: nothing
subtracted); the bell re-reads its list whenever it opens, so the cleared
rows show read there. A failed clear is silent — the badge stays and the bell
still clears each row. The section clear also signals the caller's other
devices and tabs, which refetch.

### 34c. The gaps, accepted

The clear covers the badge's whole section, not the rows on screen
(KNOWN_ISSUES, the owner's Q3, Q5, Q6): a row created between the list's
reply and the clear, an item past page 1, a past-dated event on parent
Events (it opens on Upcoming). Each row stays in the bell, read. The browser
smoke now declares the badged pages writers (`client/e2e/pages.js`); on the
Seeded baseline the clear changes 0 rows.

### 34d. What proves it

`scripts/ssr-visit-clear.jsx` (TESTING), all as source because the clear is
an effect and SSR runs none (§5h): the helper's request, once-per-mount and
loaded gates, refresh and silent failure; the eight pages' calls with their
sections and a `loaded` a failed load cannot make true; the two call-to-act
pages calling nothing; the server's `VISIT_CLEAR`, the old no-section path,
the 400, the empty section, the skipped `UPDATE` and the one signal — each
with a control. `test:notifications` drives the endpoint on rows the run
creates. **Cannot prove** a real visit or a badge falling — the owner's device
check (`docs/F3_BADGES_DEVICE_CHECK.md`).

