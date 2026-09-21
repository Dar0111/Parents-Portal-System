# STAGE 4 FRONTEND CONVENTIONS — frozen 2026-09-06 (full text)

> The complete text of every Stage 4 frontend convention (§1–§7b) and the three retired planning claims, with the reasoning and worked examples. `CLAUDE.md` → STAGE 4 FRONTEND CONVENTIONS carries the rule statements.
> Moved out of `CLAUDE.md` on 2026-09-18 verbatim so that file fits Claude Code's 150k-char limit. `CLAUDE.md` holds the condensed version and wins on any present-tense claim; if the two disagree, the code is correct and both must be fixed.
> Dated entries record what was true on their date and are never back-edited. MEASURED BUILD TIME lives in `docs/ARCHIVE.md`.

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
  the spinner and asks for the last page that exists, in one effect inside
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

**Default wrapping already breaks at SPACES ONLY**, so with `wrap-anywhere`
gone an LRN, a grade or a date — none of which contain a space — cannot be
broken at all. `nowrap` is the stronger promise, for values that DO contain
spaces and still must not break:

| Use `nowrap` for | Why |
|---|---|
| LRN, login id | an identifier that reflows is a wrong value (§5c) |
| grades, dates, times | `Sep 20, 2026, 1:30 AM` has spaces and must read as one value |
| an actions column | the icon cluster keeps one row and claims its own width — without it the buttons wrap under the text beside them and the neighbouring column appears to run into them |

Let names and free text wrap normally, at spaces. Only a genuinely
unbreakable long string in its own cell (an email, a backup filename) may
use `break-words`.

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

**Frozen 2026-09-20 (DV2).** A page may format a date for display; it may
not compute one. `monthBounds` had lived in `parent/AttendancePage.jsx`
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
monotonic in the viewport.** `Shell` reveals its 240px sidebar at the **same
`sm`**, and `<main>` goes from `p-4` to `sm:p-6` there:

| Viewport | Sidebar | `<main>` padding | **Card width** |
|---|---|---|---|
| 639px | hidden | 32px | **607px** |
| 640px | 240px + 1px | 48px | **351px** |
| 683px (200% on 1366) | shown | 48px | **~394px** |
| 768px | shown | 48px | **479px** |

Crossing `sm` **upward cuts the card from 607px to 351px**, so the table
switched on at the one width where its container was narrowest it would ever
be. Raising the breakpoint moves that cliff; it does not remove it.

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

**A FUTURE BROWSER CHECK MUST MEASURE THE CARD, NOT THE WINDOW.** A container
query does not move with the responsive-mode width readout, and a tester
reading the window width will conclude the breakpoint is broken when it is
working. Tailwind v4 ships container queries in core — no plugin — and the
generated rule should be grepped out of the built CSS (`container-type:
inline-size` plus `@container (width>=36rem)`), because **a variant that
generates nothing fails silently**, exactly as `h-9.5` did in DV1.

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

**THE INVERSE IS CLOSED FOR PARENT (2026-09-09) — by flipping the Messages
`built` flag, not by touching `Shell.jsx`.** 5g's fix moved `LiveStatus` into
`Shell`, above the routed page, so the notice reaches every page the badge
does. `UnreadProvider` is gated (`enabled={messagesBuilt}`); `LiveStatus` is
not. Parent → Messages landing with `built: true` turns the badge request on
for that role, so the strip now names a channel something on their screen
consumes. Gating `LiveStatus` was never done — it would have been the
flip-the-flag-later failure convention 6 forbids. **Admin still has the
inverse** (pages unbuilt, Messages `built: false`, ungated strip) and that
belongs to Admin → Messages, the same way this belonged here.

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

**Live today for TEACHER and PARENT.** Admin has no Messages item at all
since 2026-09-18, so there is nothing to badge and `UnreadProvider` never
fetches for that role. The wiring is unchanged and still flag-driven: a role
that gains a built Messages item gets the badge with no edit to `Shell.jsx`,
and that dispatch should not build its own badge. (This paragraph previously
said admin would get the badge "the day its Messages page lands" — that page
will not land; see CLAUDE.md → ADMIN SCOPE AUDIT.)

**§5g's inverse is closed, 2026-09-18.** `LiveStatus` is now gated on the
same "does this role have a built Messages item" test as the badge, so the
"Live updates paused" strip no longer renders for a role where nothing on
screen is channel-fed. It had been ungated, and the 2026-09-13 scope decision
left that ownerless when Admin → Messages was ruled out. `SocketProvider`
still connects for every role.

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

**Added to this file on 2026-09-19.** It was frozen on 2026-09-18 and
recorded in `CLAUDE.md` only; the mirror gap was found while measuring for
the section trim, not caused by it. This is the CLAUDE.md text verbatim —
the worked examples behind it are on the 2026-09-18 `docs/CHANGELOG.md`
row and in `client/src/components/FormStatus.jsx`’s own header.

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
color it equals, and `@theme inline` maps the Tailwind names to `var(--…)` —
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

**Same-shade splits are deliberate.** `page` and `surface-subtle` are both
slate-50 in light (the page background vs. a band inside a white card);
`primary` and `bubble-mine` are both slate-900 (the button will invert in
dark, the bubble will not). Do not merge them because the light values match.

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
depends on a shadow being visible.

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
pair that occurs (55 pairs) in both themes from `index.css` itself: text
must reach 4.5, icons and UI parts 3.0; a failing pair is allowed only by an
in-script allow-list whose entries must each carry a marker in
`docs/KNOWN_ISSUES.md` — a pair can only be waived by writing it down. Add a
pair to the script when a page puts a token on a background it was not on
before. **Brand (D3, 2026-09-19, `feat/brand-chrome`).** `primary` IS the
school's color: the seal's navy `#08027C` in light (hover `#1C15A3`, disabled
`#B5B3E6`, white text) and a lighter indigo `#ABA8F7` in dark (hover
`#C4C2FA`, disabled `#4B4890`, slate-950 text) — every primary button, unread
badge and segmented control took it with no page edit. Three tokens joined
(63): `brand` (text and icons in the school color: the seven content links,
the active nav item and Settings tab), `brand-soft` (the active-nav tint,
`#ECEBFC` / `#23204F`) and `seal-bg` (white in BOTH themes — the seal's disc
is artwork, not a surface, and `bg-white` is banned). The seal's green, gold
and red are never tokens; they would collide with the success, warning and
danger tones. `focus-accent` stays sky so a focus ring never reads as
"selected" beside brand links. Which links are brand: the in-content
link-styled controls (`text-brand … hover:underline`); the "← All …" back
links stay `fg-muted`, the ErrorAlert retry stays `danger-fg`. Numbers:
brand on surface 16.03 / 8.22, on `brand-soft` 13.63 / 6.96, button text
16.03 / 9.29 — all in `lint:contrast`, nothing waived for it. Light-mode AA fixes taken on D2 as named light changes: the table
header text (`fg-body`, 7.23), placeholders (`fg-muted`, 4.77), the Approve
buttons (`success-solid` emerald-700, 5.37; hover 800), and the 41 `fg-faint`
TEXT labels moved to `fg-muted` at their call sites (`fg-faint` is now icons,
the spinner, close buttons and `disabled:` states only). The nine waived pairs
are the KNOWN ISSUES rows marked `[contrast: …]`.

### 9. Shell chrome is sticky, and the seal is always on its white disc

**Frozen 2026-09-19 (D3).** The header (`layout/Header.jsx`, extracted from
Shell so a later dispatch can put a bell in it — there is no bell slot yet)
is `sticky top-0 z-30`; the sidebar is `sticky top-0 h-screen self-start`
with its nav box `min-h-0 flex-1 overflow-y-auto`, so the nav scrolls inside
itself only when taller than the viewport. **The document is the only
scroller**: one scrollbar, no layout shift, content scrolls under the header.
z-order: header 30, mobile drawer 40, Modal backdrop 50 — the drawer and any
modal cover the header. Below `sm` the sidebar is hidden and the drawer takes
over, unchanged. Do not add a second scroll container to `<main>`.

**The seal** (`client/src/assets/school-seal.png`, 192 px, 24-bit, under 50
KB — rendered from the school's 447 px JPG, which has a white field and no
alpha) appears at the top of the sidebar and the drawer (40 px) beside
"Parent's Portal" / "Capt. H. Francisco ES", and above the Login title
(96 px). It always sits on a `bg-seal-bg` disc with `rounded-full` on the
image: the JPG's white field and the seal's blue ring need the white disc on
a dark surface, and the disc is white in both themes on purpose. Alt text is
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
from the same endpoint — not to add two providers together.

**BELL VS BADGE IS A DECISION, NOT A DEFAULT.** Every unread notification
rings the bell. Only some badge a nav item:

| | badged |
|---|---|
| Teacher, Parent | Excuse Letters, Announcements, Memos, Events |
| Admin | Users, and Announcements carrying **announcements + memos** |
| every role | Grades — **never**, bell only (Darryl, 2026-09-19) |

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

