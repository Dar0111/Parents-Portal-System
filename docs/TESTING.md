# TESTING — baselines, and what each number means

> **The ONE home for every test and lint baseline.** `CLAUDE.md` holds a
> pointer and the rule, not the figures. A dispatch that re-measures a
> baseline updates it **here, in the same commit** — a number changed in a
> report and not in this file is how eight suite counts went stale at once.
> Split out of `CLAUDE.md` on 2026-09-23 (trim-8).
>
> `CLAUDE.md` is still authoritative on everything else and wins on any
> present-tense claim; if the two disagree, the code is correct and both must
> be fixed. **The Seeded baseline — the DATA a clean `db:setup` produces —
> stays in `CLAUDE.md` → CURRENT STATE.** It is what the suites assert
> against, not a count of them.

---

## Suites and their baselines

Moved verbatim from `CLAUDE.md` → CURRENT STATE → Tests on 2026-09-23.
**No figure below was re-measured in that move; every one was copied.**

**Tests:** twenty-three `test:*` scripts — **nineteen HTTP suites** plus four
direct-call unit tests (`sanitize`, `grade-computation`, since #7
`school-calendar`, and since fix/auth-503 `auth-middleware`). Counted from
`server/package.json` on 2026-09-26 (docs pass): the "twenty-two … eighteen"
that stood here was wrong by one HTTP suite, because `test:grade-computation`
is described in a paragraph below rather than a bullet and the bullets alone
number twenty-two. **Also in `package.json`:** `verify:grading-seed` and seven
`db:migrate:*` scripts. **Every count below
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
**All 23 re-run 2026-09-26 at the smoke gate** (Part 1, one at a time, the
19 HTTP suites on one plain `MAIL_TRANSPORT=file PORT=5001 node server.js`
with `API_BASE` pointed at it): every figure below held, `test:recovery`
62/62 on that server, and the live database matched its before-snapshot on
every table but `activity_logs`.

- `npm run test:students` — **98/98** (was 94; pre-Stage-5 #4 — an adviser-only teacher enrols into their own section (+ `section_id`), a minted assigned-not-adviser teacher is refused with the class named, and the adviser PUT that used to be a 403 is a 200 re-read on the run's own fixture. The out-of-scope create targets a REAL Grade 3 section now — a fictional one is the 400 "no section named" since the resolve precedes the gate)
- `npm run test:sections` — 30/30
- `npm run test:assignments` — **62/62** (count unchanged by #5a, but its two Grade 2 assertions flipped from "NULL, falls back to name ASC" to the school's confirmed order — the guard against a GUESSED order did its job on the day the school's answer arrived)
- `npm run test:grading-modes` — 13/13
- `npm run test:grades` — **256/256** (was 255; #3a added the notifications rows-for-this-run = 0 assertion. #2 added the class filter's two `400`s and invariant, `sort=class`, the nine-key report card and `term_average_descriptors` on a KS1, a one-term and a complete card. Before that: 167 → pagination 182 → DV3 188 → 189 → rounding 197 → Grade 1 letters 212 → CR0/CR1 239 → 247)
- `npm run test:auth` — **60/60** (was 57; #4 — a bad email on an OUT-OF-SCOPE LRN is the email 400, not the scope 403 (order proved), a valid email is stored as sent, and a minted teacher assigned to Malikhain but not its adviser gets the same 403 as an unknown LRN. #3a — the two parent accounts it creates fan out `parent_pending`, cleaned by the shared helper and asserted gone). **Its SQL fixtures resolve `section_id` since #4** — the parents gate keys on it
- `npm run test:attendance` — **73/73** (was 64; pre-Stage-5 #6 — TCH-003's login and **the mid-year transfer case**: TCH-001 enrols a fixture learner into Malikhain and records two days; the learner is moved to Masigasig by a direct `UPDATE` on that fixture row (no transfer endpoint exists, by design); TCH-002 records a third day; the OLD adviser's list and summary hold exactly their two days and `GET /student/:id` is 200 with two; the NEW adviser sees three; the old adviser's `PUT` on their own row is 404; TCH-003 — neither adviser nor recorder — is 404. Cleanup by tracked attendance id, learner by id. #3a — cleanup by its own ids, proved by an untracked sentinel row on a shared date that must survive. #2 added `?date=&from=` and `?date=&to=` → `400`)
- `npm run test:content` — **97/97** (was 96; #3a — its posts' notifications cleaned by pairs and asserted gone: "**32** deleted over 10 items" on a clean run (it was 25 when #3a measured it; Ligaya Halimbawa's account, active since #3b, is one more recipient — measured at the 2026-09-26 smoke gate, pass count unchanged). **The count of items is 10, not 9**: the API-deleted event is spliced out of the post cleanup list but stays in `notifiedEventIds`)
- `npm run test:settings` — **35/35** (count unchanged by pre-Stage-5 #7, two cases swapped: OUT "current_term outside 1-3 rejected, naming the allowed values" and "Valid current_term accepted"; IN "PUT current_term is the unknown-key 400, and the allowed list no longer names it" and "GET /api/settings carries no current_term" — the latter reads the row directly and says whether a dead row EXISTS on this database. The bad-value PATCH now uses `school_id: '12'`, the all-valid PATCH `logo_url`. Was 29 before #5a — the four `school_*` rules, the four-key PATCH, `GET /settings/public` without a token carrying exactly six keys, `GET /settings` still 401 without one)
- `npm run test:auth-middleware` — **23/23** (new, fix/auth-503, 2026-09-26; direct calls on `middleware/auth.js` with **a stubbed pool planted in `require.cache` before the middleware is required** — no server, no DB, scripted per call to return rows or throw a mysql2-shaped error). An outage on the first or the second query → `503` with the health body key for key; any throw inside the database block → 503; **the 503 body never says "token" or "log in"**; no token, a garbage token and an expired token → 401 with **zero pool calls** (verify runs before any database work, so an outage cannot mask a bad token or vice versa); the restore cutoff, a missing user, an inactive account and a `token_version` mismatch → 401; the forced-change 403 off `/me` and `next()` on `/me`; a live session → `next()` in exactly two pool calls; `isDbUnavailable` accepts connection codes and refuses a SQL error, a plain Error and null. **This is how the outage path is proved without stopping MySQL under every other suite**; the by-hand check (KNOWN ISSUES) is the browser half
- `npm run test:school-calendar` — **34/34** (new, pre-Stage-5 #7; a direct-call unit test like `grade-computation`, no server, no DB) — the ten boundary days both sides of each line (Jun 7/8, Sep 15/16, Dec 18/19, Jan 3/4, Apr 8/9), three far dates, six month clamps, the table's own consistency (three terms, each start before its end, in order and non-overlapping, `CLASSES_START`/`END` on the first and last term, frozen, `termDates` by number or string), **the seed's `academic_year` equals `SCHOOL_YEAR` and the seed writes no `current_term` row**, and five refusals — a `Date`, another format, no argument, a number, `termDates(4)`
- `npm run test:users` — **68/68** (was 64; #4 — the email rule on POST /teachers ("not an email", `user@localhost`) and PUT (two `@`, and `""` clears to NULL). #2 added `sort=role` and `sort=status` alphabetical invariants plus admin-before-parent). **The script is `test:users`** — the file is `test-user-management-flows.js`, and a dispatch that types `test:user-management` gets a silent no-op from npm, not a failure
- `npm run test:backups` — **47/47** (was 39)
- `npm run test:sanitize` — 9/9
- `npm run test:messages` — **80/80** (was 59)
- `npm run test:restore` — **29/29** (was 28 passed / 1 FAILED for three days). **The failure was never `iat` resolution** — the crafted "after the cutoff" token carried no `v` claim and ADMIN001's `token_version` had been bumped to 2 by other suites, so the middleware's version check refused it with a 401 the assertion could not tell from the restore one. The token carries the live `v` now (#3a); `middleware/auth.js` is untouched. KNOWN ISSUES has the corrected row
- `npm run test:excuses` — **93/93** (was 92; #3a — letter notifications cleaned by pairs, resolved BEFORE the user/student cascades, and asserted gone)
- `npm run test:notifications` — **151/151** (was 136; fix/smoke-gate `12a3495` — an adviser's `excuse_submitted` SELF-HEALS: the badge and the bell are +1 while the letter is Pending and back to the start after approve AND after decline, each asserted as a delta from counts read just before the letter; a `socket.io-client` socket proves the reviewer receives `notification_counts` on both reviews; the approved letter's row is no longer listed, still EXISTS and was NOT marked read; the parent is still told a declined letter was reviewed. The old "both events coexist" assertion, which asserted the adviser still SAW the submitted row after approval — the defect itself — is replaced by its table-level half. Was 124 before that). Since #3b its users/students watermark is **captured at start and printed** (`i watermark at start: users 8, students 4`), not the literal 7/3 — a seed change must not fail a suite that has no defect. `test:recovery` does the same
- `npm run test:dashboard` — 77/77
- `npm run test:class-record` — **118/118** (CR1 105 → CR2 117 → #3a 118: it asserts NO notification row for its grades — measured zero before the helper existed, because its fixture learners have no parent; asserted rather than deleted). **It is the only suite that imports a CLIENT module** — `buildPayload.js` — so the grid's real payload is exercised against the real API; see §13e
- `npm run test:class-summary` — **59/59** (CR3). Two assertions are the dispatch: **TCH-002, adviser with zero assignments, gets 200 on the summary AND on a learner's report card.** Its cleanup is a **WATERMARK, not an id list** — `PUT /class-record` creates a shell row for every learner in the class, so deleting only its own learners' grades left eight behind on a SEEDED one (KNOWN ISSUES)
- `npm run test:recovery` — **62/62, but ONLY against a server started with `MAIL_TRANSPORT=file`.** Otherwise it stops at 11/1 with a fixture failure — the variable belongs to the process that sends the mail, so prefixing the test script does nothing. Run-book in KNOWN ISSUES

`npm run verify:grading-seed` (alias since #3a; `node scripts/verify-grading-seed.js`) is not one of the suites above — it's a
direct-DB verification script (no server, no HTTP, no `assert()` harness),
checking the Grades seed (transmutation table, weights, modes, Grade 1
descriptive fixture) is internally consistent. Run it after `db:setup`, before
trusting the seed. **46/46 as of 2026-09-26** (was 44: Grades 2 and 3 now assert their confirmed order — +4 — and the two "NULL on purpose" checks are gone — −2) — the descriptive-exclusion
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

---

## The one known-count exception (two until #3a corrected `test:restore`)

Both were **run-book problems, not failing code**, and both have their full
row in `docs/KNOWN_ISSUES.md`. They are listed here because a clean run does
**not** print a clean number, and a session that does not know that will
report a regression that is not one.

| Suite | What you will actually see | Where the run-book is |
|---|---|---|
| `test:recovery` | **11 passed, 1 FAILED** against a normally-started server, and the fixture stop is correct behaviour rather than a flake — the suite reads the emailed code off disk. **`MAIL_TRANSPORT=file` belongs to the process that SENDS the mail, so it goes on the SERVER**; prefixing the npm script does nothing. With it: **62/62**. | `docs/KNOWN_ISSUES.md` → *`test:recovery` needs `MAIL_TRANSPORT=file` on the SERVER* |

**Report these as their known figures, not as failures** — and if either
number changes, something really did move.

---

## Render proofs — the client's twelve, and their baselines

They are not suites: no server, no database, no `test:*` script. Each is an
SSR build plus a node run, and each is **kept** rather than thrown away
after its dispatch. **Twelve** `client/scripts/ssr-*.jsx` files as of
2026-09-26 (the heading said "four" from the day there were four). All live
in `client/scripts/` because
`.oxlintrc.json` gives `env.node` only there (§17a).

Run from `client/`:

```bash
npx vite build --ssr scripts/<name>.jsx --outDir .ssr-tmp && node .ssr-tmp/<name>.js
```

**Two proofs have their own run-book, and a loop that ignores it reads a
regression that is not one (pre-Stage-5 #4, measured):** `ssr-cards.jsx` is
**32 only under `NODE_ENV=development`** (the DEV-guard assertions; a
production build reports 28/4), and `ssr-dates.jsx` is **46 under a
production build, run TWICE — `TZ=UTC` and `TZ=America/New_York`** (a DEV
build of it is a different count again). Both run-books are below; check
them before calling either number stale.

| Proof | Baseline | What it covers |
|---|---|---|
| `ssr-school-calendar.jsx` | **28/28, run TWICE** — `TZ=UTC` and `TZ=America/New_York`, identical (new, pre-Stage-5 #7) | the client copy of the school calendar: the ten boundary days, three far dates, five clamps; **six mirror-agreement assertions against the server's CJS module**, loaded through `createRequire` from `../server/utils/` (which is why it runs from `client/`) — `SCHOOL_YEAR`, the class dates, the `TERMS` table entry for entry, `currentTerm` on every date, the clamp, `termDates`; four negative controls (a `Date` throws, an unpadded string throws, no "today" default, the table is frozen). Two zones for the same reason as `ssr-dates`: the module builds no `Date`, so a differing count means one crept in |
| `ssr-back-guard.jsx` | **12/12** (new, pre-Stage-5 #5b) | §13d: `classRecord/backGuard.js` driven through the six transitions (dirty → push; pop while armed → ask; stay → push; leave → back; clean → back; pop while clean → none) plus the one-sentinel negative control (a second dirty pushes nothing — StrictMode), clean-with-no-sentinel never backs, Stay/Leave outside a question are no-ops, the pop after Leave is the router's, and the input state is never mutated. The real Back press is the browser check |
| `ssr-auth-failure.jsx` | **14/14** (new, pre-Stage-5 #4) | §22: `classifyAuthFailure` driven with the four shapes axios produces (401 → logout; 503, `ERR_NETWORK`, `ECONNABORTED` → keep) plus three negative controls (a 401 never "keep", a 403 never a logout, `undefined` keeps); `AuthUnavailable` rendered — the condition, "Your session is kept", the reason as `role="alert"`, a real Try again, **no "log in"/"sign in" wording, no link away**. The effect (the token still stored after a failed boot) is the browser check |
| `ssr-cards.jsx` | **32/32** (was 31; UI-E redrew the teacher card's gate) | the card contract, by RENDERING — `actions` beside a primary action, the DEV guard, both excuse-letter cards. Its teacher-card block asserted **"exactly ONE of the two is tappable"**, which was correct until a reviewed letter had somewhere to go; it now asserts both are tappable **plus the one dead end that survives** — a Pending letter in a section the teacher does not advise. **Needs `NODE_ENV=development`, see below** |
| `ssr-item5.jsx` | **39/39** (was 37; item 5b) | the filter cue (§21): `isDirty` driven directly — **key order irrelevant** (with a control showing `JSON.stringify` would have called the same values different), **every string trimmed both sides** (a key named `query` too, with a control that an inner space is still a difference), type coercion, the four dependent Grade→Section transitions, and a non-empty `'all'` default; plus `FilterActions` **rendered** in both states — **the live region PRESENT and EMPTY when clean** (item 5b inverted item 5's assertion, which had cemented an accessibility defect: a region that first appears with its text already in it is never announced), `role="status"`, `aria-hidden` glyph, quiet vs filled, never disabled, Reset only when `canReset`. **Its header states what it cannot prove:** the change EVENT (no events under `renderToStaticMarkup`) and the 390px layout — both the browser check |
| `ssr-ui-e.jsx` | **23/23** | the teacher's read-only letter view (§20): remarks reachable on an Approved AND a Declined letter, the learner and class named, **the `<dt>` set asserted exactly and in order** rather than by regex (§20f), NULL remarks and NULL details rendering no heading, no Edit, no identifier — and the card's three-way gate rendered through the real `DataTable`, with a negative control proving `canReview` still refuses. **Every fixture is a real `GET /api/excuse-letters` row captured from the running server**, not written from memory (§19f) |
| `ssr-dates.jsx` | **46/46, and it must be run TWICE** — see below (**48/48 under `NODE_ENV=development`**, where the two DEV-guard assertions replace the one production-silence assertion). Was 25; UI-C1b added the DATE-bearing cards and `calendarDaysAgo` | the date helpers: the 08:00 PH rollover, both day boundaries, a New Year, the DEV guard and its production fallback, a real card rendering a morning timestamp, the three converted DATE cards, and the calendar-day-vs-elapsed-hours boundary at midnight, a month end and a year end |
| `ssr-ui-c2.jsx` | **39/39** (was 32; UI-C1b added the `{ value, label }` section options. 33 before that — UI-C1a removed the four lines asserting the announcement card still sliced its date; `ssr-dates` owns that claim now, and makes a stronger one) | the one staff audience wording and its `hasSections` split, the Section filter's option logic **and its labels**, and the report card's conditional copy. **It does NOT cover the Remarks hint** — that is behind a click inside a Modal, said in its own header so a green run is not over-read |
| `ssr-ui-a.jsx` | **38/38** | `GradeValue`'s colour, score pairs, `longDate` at the dashboard spots, the Attendance header. **Its line-51 assertion was INVERTED by UI-D** — it asserted that a caller passing no `className` still got `text-fg`, which was UI-A's whole point; UI-D removed that default once a base colour existed, so the line now asserts that **no** colour is emitted. The four assertions beside it were correct before and after and did not move |
| `ssr-ui-d.jsx` | **86/86** (was 82; pre-Stage-5 #2 (m) added the hero caption — `Term 1 · Benchmarking` from a string `descriptor`, `>Term 1</p>` on null, `Passed` never in the markup, and the server's `{ descriptor, remarks }` object handed through whole **refused** by the render, fixture captured from `test:grades`' complete-term response per §19f) | `ScrollCue`'s arithmetic driven directly — an SSR render has no layout, so `scrollWidth`, `clientWidth` and every cell geometry come back zero and the component renders with none of its logic exercised (§14e) — including **the two slacks asserted as a PAIR** so a later tidy-up cannot merge them: a group cut by 10px on a table 810px over IS named, and the same 10px cut names nothing when the table itself is only 10px over. Plus `ChildHero` for Key Stage 1 and Grade 6, **with a negative control asserting the raw `{descriptor, filipino}` object is refused** — that shape blanked `/parent` while this proof was green at 71/71 (§19f). And the NON-PRINT half of UI-D-1: `GradeValue` emitting no colour, the base colour and every print rule reaching the **built** stylesheet (grepped — a Tailwind variant that generates no CSS fails silently), and the print theme switch restoring light / dark / System including an OS flip mid-print. **It cannot prove the printed layout and says so in its own header** — `@media print` does not apply to an SSR render, so there is no page box, no `@page` and no paper width. **Print is checked on paper** (FRONTEND_CONVENTIONS §18h) |
| `ssr-dv1b-a.jsx` | **83/83** | the fourteen `renderCard` consumers. **Source-text assertions** — it reads files and regexes them; that is what it is, and §17d is why nothing new should be written this way. Was 87; UI-B dropped the two excuse-letter pages, whose cards are modules now and are covered by `ssr-cards.jsx` |
| `ssr-dv1b-b.jsx` | **30/30** | the attendance roster's behaviour, driven directly through `attendance/roster.js`. Was 35; UI-B deleted its five source-text letter assertions for the same reason |

### `ssr-dates.jsx` runs TWICE, under two timezones

```bash
npx vite build --ssr scripts/ssr-dates.jsx --outDir .ssr-tmp
TZ=UTC              node .ssr-tmp/ssr-dates.js     # 46/46
TZ=America/New_York node .ssr-tmp/ssr-dates.js     # 46/46 — IDENTICAL
```

**One run proves nothing.** The helpers convert an instant to the school's
calendar day, and an implementation that reads the *host* zone passes on a
Manila machine and is wrong everywhere else — which is the shape of the bug
this proof exists for, one layer down. Two zones, same answers, or it is not
proved.

Add `NODE_ENV=development` for a third run (**48/48**) to exercise the DEV
guard; the production build tree-shakes it away and asserts the fallback
instead. Both paths are covered, each under the build that can see it.
**Run the DEV build under both zones too** — the guard fires on the value,
not the clock, but the run costs seconds and a one-zone DEV run is the same
half-proof the block above refuses.

**`NODE_ENV=development` goes on BOTH steps — the build AND the `node` run.**
The proof picks its branch from `process.env.NODE_ENV` at RUN time
(`ssr-dates.jsx:110`), so a DEV bundle run without it fires the guard twice
and then asserts the production branch: **45 passed / 1 failed**, which
reads like a broken guard and is a broken harness (measured at the
2026-09-26 smoke gate). `ssr-cards` does not have this trap.

### Git Bash DROPS `TZ=America/New_York` — run the zone legs from PowerShell

Measured at the 2026-09-26 smoke gate: in Git Bash on this machine
`TZ=UTC node …` reaches Node, but **`TZ=America/New_York` does not** —
`process.env.TZ` is `undefined` and the offset is −480, Manila. The run
still prints 46/46, so **a "two-zone" run typed in Git Bash was UTC plus
Manila**, which never exercises a zone west of Greenwich — the case these
proofs exist for. Run the zone legs from PowerShell (build in either shell):

```powershell
$env:TZ = 'America/New_York'; node .ssr-tmp/ssr-dates.js; $env:TZ = ''
```

**The header is the check**: `ssr-dates` prints `under TZ=<zone>` and
`ssr-school-calendar` prints `(TZ=<zone>)`. A header saying `(host
default)` or naming the wrong zone is not a run of that zone, whatever the
count says.

### `ssr-school-calendar.jsx` runs TWICE too

```bash
npx vite build --ssr scripts/ssr-school-calendar.jsx --outDir .ssr-tmp
TZ=UTC              node .ssr-tmp/ssr-school-calendar.js   # 28/28
TZ=America/New_York node .ssr-tmp/ssr-school-calendar.js   # 28/28 — IDENTICAL
```

Same discipline as `ssr-dates`, opposite reason: that proof exists because
its helpers DO touch instants; this one exists to show the calendar never
does. Run from `client/` — the server module is resolved from
`process.cwd()/../server`.

### `ssr-cards.jsx` needs `NODE_ENV=development`, and the reason is a trap

```bash
NODE_ENV=development npx vite build --ssr scripts/ssr-cards.jsx --outDir .ssr-tmp \
  && node .ssr-tmp/ssr-cards.js
```

**Without it the proof does not fail loudly — it fails as four assertions
that log nothing**, which reads like a broken guard rather than a broken
harness. `vite build` is a PRODUCTION build, so `import.meta.env.DEV` is
replaced by `false` and the DEV-only block inside `DataTable`'s `Card` is
**tree-shaken out of the bundle entirely**: `grep "DataTable card"` in the
built file finds nothing. **`--mode development` does NOT help**; only
`NODE_ENV` does. Measured 2026-09-23.

**The general form, which is the part worth carrying: a DEV-only guard is
invisible to a production-mode proof.** Anything wrapped in
`import.meta.env.DEV` has to be kept alive deliberately, or the harness
reports a clean pass on code that is not in the bundle —
`docs/FRONTEND_CONVENTIONS.md` §17f.

## Measuring a layout before fixing it (fix/polish, 2026-09-26)

A "2px overflow" is a number, and a number is measured before it is
fixed. The class-summary overflow at 1280 was measured in a headless
browser: a throwaway Playwright script (scratchpad, never committed) that
logs in through the real form with the `e2e/.env.e2e` credentials — the
same one-`activity_logs`-row cost as the smoke — opens the page at a
`viewport` of the width in question, and reads **`scroller.scrollWidth −
clientWidth`** on `.print-sheet-scroller` plus every header cell's
`getBoundingClientRect().width`. That gave 998 vs 990 and named the widest
column, which is what decided the fix (release `min-w-max`, let subject
headers wrap) over the alternative (`border-separate`); the same script run
again after the change is the proof — 990/990 at 1280, 356/937 at 390.
Measure the element, not the window (§5a-vi), and run it against the dev
server, never during a suite.

## The smoke run — a read-only browser sweep

`client/e2e/smoke.spec.js`, Playwright, headless Chromium. **Twenty tests:
five roles × two themes × two widths, 39 URLs, 264 screenshots** (recounted 2026-09-26 by loading `e2e/pages.js`: **39 UNIQUE URLs** — admin 12, teacher 15, parent 12, About last in each; the two teacher accounts and the two parent accounts each share their role's list, so the five accounts make **66 account-URL visits** (12 + 15 + 12 + 15 + 12), and 66 × 2 themes × 2 widths = **264** screenshot files; the "61 / 244" that stood here was never a recount)**.** It is not
a suite and not a proof; it is the part of §5h a person should not have to
do by hand — opening every sidebar page four times to find out whether any
of them logs an error, requests something that 4xx's, renders no heading, or
scrolls sideways on a phone.

```bash
cd client && npm run smoke              # headless, the default
cd client && npm run smoke -- --headed  # to watch it; COMMAND LINE ONLY
```

**`--headed` never goes in the config.** Headless is the default because
that is how it will normally run; watching it is a thing you ask for on the
day.

### Before you run it

- **Start the API and `npm run dev` yourself.** The suite does NOT start
  them — it polls and fails naming the one that is down. A harness that
  starts the API would eventually kill one you were using, since that
  process owns the dev database, a socket server and whatever
  `MAIL_TRANSPORT` it was launched with.
- **NEVER run it while a server suite is running.** Same rule as fixtures:
  suites before, or after, never during.
- **Prefer `npm run smoke:isolated` for a verification run (pre-Stage-5 #3b).**
  `client/scripts/smoke-isolated.mjs` starts its OWN API (`node server.js`,
  **no `--watch`**, port 5001, `CORS_ORIGIN=http://localhost:3001`) and its
  own Vite (3001, `--strictPort`, `VITE_API_BASE_URL` pointed at 5001),
  polls both, runs the sweep with `E2E_APP_ORIGIN`/`E2E_API_ORIGIN`, kills
  both process trees (`taskkill /T` on Windows) and **lists the two ports
  afterwards** — the listing is the proof, not the kill. It refuses to start
  if either port already answers, and **it never touches 5000 or 3000**, so
  the rule above still holds: the one server somebody may be using is never
  started or stopped by a script. Why: the first-test `ERR_CONNECTION_REFUSED`
  that struck ~5 of ~10 sweeps against the `--watch` API has not occurred in
  5/5 against a plain `node server.js` (`docs/KNOWN_ISSUES.md`). Plain
  `npm run smoke` stays for watching it (`--headed`) against your own servers.
- It runs against the **dev server**, not a production build, so `/dev/ui`
  and the DEV guards exist — a sweep that cannot see a `console.error` guard
  is half a sweep (§17f).

### Credentials

Values live in **`client/e2e/.env.e2e`**, which is gitignored — the rule was
added and proved with `git check-ignore` **before the file existed**, with a
control confirming the template is *not* ignored.
`client/e2e/.env.e2e.example` is committed and **holds variable names only**;
`playwright.config.js` **refuses to run** if it ever holds a value, naming
the variable and never printing it. A missing variable fails the same way.

**That guard exists because the near-miss happened**: on the first use the
credentials went into the committed template, on a branch already pushed
public. Nothing leaked — it was caught before `git add` — but the margin was
one command, and two filenames differing by `.example` are not a control.

**People are named by their child or role, never by login id** — a parent's
`login_id` IS their child's LRN (§5c), and a test title reaches terminals,
logs and screenshots. It is also the only *unambiguous* label: both seeded
parent accounts carry the same person's name.

### Two hosts, two rules — do not generalise either

```
port 5000   0.0.0.0:5000   LISTENING   the API, IPv4 and [::]
port 3000   [::1]:3000     LISTENING   Vite, IPv6 loopback ONLY
```

**There is no IPv4 listener on 3000.** So `127.0.0.1` — the fix the server
suites document, because Node on Windows prefers `::1` while the API listens
on IPv4 — is for the **API poll only**. Applying it to Vite points at an
address nothing is listening on, and the first run failed exactly that way.

**The browser origin stays `http://localhost:3000`**, because `server.js`
allows exactly one CORS origin. `E2E_APP_ORIGIN=http://[::1]:3000` is *not*
a workaround: the poll would pass and every API call would be refused.

### What it writes, and what it must never touch

**One `activity_logs` login row per TEST — 20 per full run**, not one per
role: each test needs its own browser context for viewport and theme, so
each logs in. Nothing else is written; the Seeded baseline is unchanged
after a run, and login rows are audit history kept by rule.

**It never clicks anything that writes.** The only click is the login
button. Visiting Admin → Backup & Restore is a read; touching it is not.
**Both message thread routes (`messages/:userId`) are excluded because they
WRITE ON LOAD** — `PATCH /messages/read-all/:otherId` when anything is
unread. If detail routes are ever added, those stay out or are declared.

### Expected state

**20/20 since UI-C2 (2026-09-24).** It was 12 pass / 8 fail: both adviser
accounts failed on `/teacher/grades` and `/teacher/class-summary`, each of
which rendered a second `<h1>` beside the one Shell renders from `nav.js`.
UI-C2 deleted both — **and a third the sweep could not see**, on the
`:studentId` learner route it excludes.

**A green run is the expectation now, so any failure is news.**

**The 2026-09-26 smoke gate ran it four times, `smoke:isolated`, 20/20 each**
— on `main` at `3c457ab`, and after each round of `fix/smoke-gate`
(`f3b9e28`, `32e441f`, `12a3495`); the flake did not appear. **All 264
screenshots of the first run were reviewed by eye** — 66 four-up sheets
(light and dark desktop, light and dark 390, per account-URL), anything
suspect re-read at full resolution; the flags are `docs/KNOWN_ISSUES.md`
rows or `fix/smoke-gate` commits. **The sweep never interacts, so it cannot
see a staged filter, a save message or a focus warning** — every defect the
gate fixed was found by a write flow or a by-hand check, not by this run.

### The one flake, and what it looks like

**Twice in five full runs**, always the FIRST test, always the admin
dashboard:

```
/admin: console error — Failed to load resource: net::ERR_CONNECTION_REFUSED   (×2)
```

It **passes in isolation** (`npx playwright test -g "admin — light"`) and
both servers answer immediately afterwards. The same signature appears
outside the sweep entirely — cleanup scripts and fixture scripts have failed
their first Node `fetch` with a bare `fetch failed` and worked on the retry,
four or five times now. The admin dashboard is the worst case because each
card fetches independently (§12), so a cold connection hits several requests
at once.

**Closed 2026-09-25 on a correlation, not a traced cause:** every failure
was against the `--watch` dev API, and 5/5 sweeps against a plain
`node server.js` passed — so the working cause is the watcher's restart
window, and the remedy is `npm run smoke:isolated` above. If it fires on a
plain `npm run smoke` against the `--watch` API, that is this finding, not
auth; re-run isolated and report both. **Playwright retries are deliberately
off** — a retry would hide it. `docs/KNOWN_ISSUES.md` keeps the full history.

**A negative control never touches a tracked template.** Use a temp copy or
Write with full contents — this file's own guard was proved by appending a
placeholder to the committed example, which broke the Write/Edit-only rule
for one line.

## Mobile proofs — `mobile/scripts/`, plain Node, no render

**Added 2026-09-27 (`feat/mobile-scaffold`).** Not suites: no server, no
database. Each is a Node script that drives a pure module and prints a
count. **There is no render proof on mobile** — React Native does not render
under Node, so every screen is proved on the phone (docs/MOBILE_CONVENTIONS.md
M7). Run from `mobile/`:

| Proof | Baseline | What it covers |
|---|---|---|
| `npm run proof:api-unwrap` | **21/21** | `src/api/client.js`'s pure parts: `readBody` (string unwrap, array unwrap copying ONLY the named keys — the `term_averages` lesson — `raw`, and the three refusals naming what was missing and what came back, including a null body), `endsSession` (401 off `/auth/login` only; 403, 503 and no-response never), `logoutReasonFor` (the two human-readable 401s pass through, token-shaped and missing messages become the one sentence), `listParams`, and the socket origin derivation. **Cannot prove:** the interceptors firing, SecureStore — the phone check |
| `npm run proof:auth-failure` | **8/8** | §22 on the mobile copy of `classifyAuthFailure`: 401 → logout; 503, `ERR_NETWORK`, `ECONNABORTED` (the 15 s timeout) → keep; four negative controls (a 401 never "keep", a 403 never a logout, `undefined` and a status-less response keep). **Cannot render `AuthUnavailable`** — its copy is the phone check |
| `npm run proof:routes` | **33/33** (`fix/mobile-popto` P1: +1 — the parent, teacher and admin dashboards each register `useFocusEffect`, and parent and teacher skip the first focus (the mount `useCard` has already fetched); negative control: the parent's `useFocusEffect(` call removed with Edit → 32/33 naming the parent, restored → 33/33. B1: 32, +1 — every `screenLayout={…}` in `mobile/src` names a module-level function whose body calls no hook, because React Navigation CALLS a layout inside the navigator's render and a hook there changes the navigator's hook count on every push / pop; negative control: `screenLayout={ScreenFrame}` put back in `RootNavigator.jsx` with Edit → 31/32 naming it, restored → 32/32. `fix/mobile-popto`: 31, +5 — the real `StackRouter` showing `navigate('Main', …)` from a modal pushing a SECOND drawer, `popTo('Main', …)` keeping one with its original key, `popTo('Login')` from Forgot password keeping one Login, and source scans finding **0** `navigate('Main'` and **0** `navigate('Login'` in `mobile/src`; negative control: one call put back → 30/31 naming the file. 26 on branch 4, both halves: admin shows eight items with Backup & Restore web-only and hidden, every one of the eight built — at the checkpoint the second half's four were asserted unbuilt — `/admin/users` opens itself and `/admin/backups` falls back to the admin home; 21 on branch 3, 15 on branch 2, 13 at its checkpoint) | `navigation/routes.js` against the verbatim `nav.js`: every nav path resolves to a known screen name or to unbuilt, every routed name is one `AppShell` knows, each role's home / Settings / About built, **every parent and every teacher item built (at the branch-3 checkpoint the second half's four were asserted still unbuilt); admin at exactly three**; the parent's five and the teacher's four notification link shapes resolve to their own drawer path; **another role's link opens THIS role's home — the assertion that caught the branch-3 defect: once `/teacher/...` was built, `linkToRoute` handed it to a parent, so a link must now carry the viewer's own role prefix**; a missing or malformed link never throws. **Cannot prove** `AppShell` has a component per name — a missing one renders the row dimmed, by construction |
| `npm run proof:roster` | **11/11** (branch 3) | the verbatim `attendance/roster.js`: the reading order, the three row states (stored vs typed, §5b), **a saved mark is never cleared** (the same object back), an unsaved one is, a different button replaces, `markRestPresent` never overwrites, counts with no rate, `unsavedCount` |
| `npm run proof:back-guard` | **11/11** (branch 3) | the verbatim `classRecord/backGuard.js` through dirty → Back → Stay → Back → Leave, a second `dirty` is `none`, Stay / Leave with no question open do nothing, clean after a save, clean while asking; plus **the phone's action map** (`push` / `back` do nothing, `ask` is the prompt, `usePreventRemove` armed exactly while `armed`) |
| `npm run proof:admin-dashboard` | **10/10** (branch 4) | `admin/dashboard/logic.js` with the clock PINNED: the backup card by calendar day in Manila (none → amber "No backup yet"; 23:00 read at 01:00 is "yesterday"; seven days green; eight amber; an unreadable stamp amber, never red), every card an admin route and none the web-only Backup & Restore, the lockout hazard only on the server's `true`, the waiting card's tone |
| `npm run proof:admin-users` | **14/14** (branch 4; the plan said 12) | `admin/users/logic.js`: the login-id mask (a parent's last four, a short one hidden, staff whole — §5c), filter params and the two empty branches, the row's actions (your own active account: no Reset, no Deactivate, the note; the toggle only between active and inactive), create teacher in the web's order (required, password, contact; blank optionals left out), the review's refusal and words |
| `npm run proof:admin-posts` | **12/12** (branch 4; the plan said 10) | `admin/posts/logic.js`: school-wide / one grade / one class bodies with BOTH target keys on every write, null when absent — a leftover section is not sent for a whole-grade post (the PUT-keeps-old-value trap); refusals in the web's order; a memo has no audience keys; edit only your own announcement; the delete sentence naming a teacher poster who is not told, and the memo's; a row read back into its audience; filter params |
| `npm run proof:school-settings` | **6/6** (branch 4) | `settings/schoolSettings.js`: the school year never in the form, a null stored value is an empty field, an untouched form sends nothing, one changed key trimmed and nothing else, trailing spaces are no change, name and address may not be emptied |
| `npm run proof:one-slot` | **13/13** (branch 3) | the verbatim `classRecord/buildPayload.js` with one-slot drafts: HPS only (one slot by type + number, no entries), a score into a column made in the same save (type + slot_no; **only the learner typed into gets an entry**; 22/20 sent as typed), an existing column by `slot_id`, typed back to stored is `null`, a cleared cell is an explicit null, a rename, invalid keystrokes and a locked learner never sent, a Summative part with its class-wide maximum |
| `npm run proof:teacher-dashboard` | **20/20** (branch 3 checkpoint) | `teacher/dashboard/logic.js`: `bannerFor` (not recorded / "1 of 2 recorded" with Late counted present / green only at full coverage / a roster count of 0 never claims partial), `advisedSections` (`Number()` on both ids); the verbatim `sectionOptions` (bare name as value, grade in the label, hidden at one option, TCH-002's section from the loaded rows alone), `isDirty` (trailing space, a changed status, `6` vs `'6'`), `staffAudienceLabel` (class, whole-grade event, School-wide); the three verbatim teacher cards, loaded as `data:` modules because Node will not load `.jsx`: **the letter card's three tap outcomes** (Pending + adviser opens, Pending + not adviser is static, Declined opens the reading view), the content cards carry `actions` with no `onSelect`, and a 07:00 PH post is dated in Manila |
| `npm run proof:parent-dashboard` | **21/21** (branch 2) | `parent/dashboard/logic.js`: `recordedDays` (null at total 0, Late counts present, string counts coerce), `weekStrip` (seven days; recorded / weekend / unrecorded, a recorded Saturday is recorded), `letterTerm` (pills + the missing count, null when none), `heroGrades` (the current term's average and its band word as a STRING, never the object, never `remarks`, **negative control: an object is refused**), the three labels |
| `npm run proof:report-card` | **21/21** (branch 2) | `parent/reportCard/logic.js` + `format/gradeText.js`: `termStatuses` full / partial / none, `statusLine` and its missing list, `initialSegment`, `joinTerms` three shapes, the Final cell as letter / number by mode, no General Average in descriptive mode; `gradeText` two decimals, `whole` as `String(Number(x))`, Pending vs N/A by mode, **a letter through the number path is a null (why TermValue exists)**, a real 0 is "0.00"; the reading-note lines; score pairs |
| `npm run proof:attendance` | **15/15** (branch 2) | `parent/attendance/logic.js`: `recordedDays`, `monthsCovered` including an empty month, `yearRows` buckets (Late → present, Excused → absent) and `yearTotals`, `letterByDate` (latest `created_at` wins), `alsoRecorded` (this month's weekend rows only, sorted), `dayLabel` ("not recorded" never reads as absent) |

**Proofs that import the app's modules register a Node resolve hook** (from
a `data:` URL, inside the proof) that appends `.js` to a relative,
extensionless specifier — Metro resolves `'../format/date'`, Node's ESM
loader does not. MOBILE_CONVENTIONS M12.

Both run with `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`: the modules
are ESM `.js` in a package with no `"type"` (Metro does not care; the Expo
config files must stay CommonJS), and Node 24 loads them by syntax
detection with that one warning.

**The production-bundle grep is a proof too, run before each mobile commit:**
`npx expo export --platform android --output-dir dist`, then grep the `.hbc`
for the DEV-only strings (expect 0 files) AND a production string (expect 1,
the positive control), then delete `dist/`. **Measured 2026-09-27: the
first bundle carried every Connection-screen string and the label of a
`__DEV__ ?` JSX branch**, so dev-only code is excluded at Metro's resolver
(`context.dev`), not by a branch. **Grep with ASCII-only strings** (branch 2
checkpoint): Hermes stores a string holding any non-ASCII character — the
strip's em dash — as UTF-16, and an ASCII `grep` reports 0 for it while a
UTF-16LE pattern finds it. A dev-only string that carried an em dash would
be missed the same way, so the DEV set and the control set are both plain
ASCII. A later export dropped `if (__DEV__)
console.log` strings entirely — what the toolchain folds is not a rule to
build on; the grep with its control is the proof each time.

### Lint baselines (mobile)

Four figures, one set, run from `mobile/` AFTER the last file is written:

| Command | Baseline | Note |
|---|---|---|
| `npm run lint` (oxlint 1.85) | **0 errors, 46 warnings** (branch 4: +1 `set-state-in-effect`, admin Grades clearing its learner list when the section changes — the web page's own effect; 45 at its checkpoint and on branch 3 after F1 — Attendance records moved its load from `useEffect` to `useFocusEffect`, which the rule does not flag; 46 before it, 39 at its checkpoint, 28 on branch 2, 18 at its checkpoint, 8 at the scaffold) | 19 × `react(only-export-components)` for the same structural reason the web accepts (hooks, builders, `badgeFor`, the audience labels beside their components; **branch 3: +2 `DateField`'s `dateFromParts` / `dateToLocal`, +1 `ReportCardView`'s `REPORT_UNWRAP`**), 27 × `react(set-state-in-effect)` — every screen's `load()` on mount and the providers' `refresh()` on mount, the web's own shape under a rule oxlint 1.79 on the web does not have (**branch 3: +9 at the checkpoint, +6 in the second half — the two attendance screens, the class summary, its learner, the slot hook's load and preview reset — and parent Grades moved its one to a new line**). One `react-hooks(exhaustive-deps)` in the slot list was a real new-array-per-render and was fixed, not stated. **Stated, never absorbed.** |
| `no-undef` (inside oxlint) | **0** | `__DEV__` and `process` as globals; `scripts/**`, the config files and the generated `src/theme/tokens.js` (CommonJS by design) under `env.node` |
| `npm run lint:mirrors` | **22 identical, and the calendar equals the server's by value** (branch 3; 19 at its checkpoint — the second half added `attendance/roster`, `classRecord/buildPayload`, `classRecord/backGuard`; the plan said 21 and missed `lrnRule`; 12 on branch 2, 7 at its checkpoint, 6 at the scaffold) | `scripts/check-mirrors.mjs` — every copied module byte-equal to its `client/src` source: `extractError`, `authFailure`, `roles`, `nav`, `passwordRule`, `contactRule`, `settings/tabs`, `date`, `schoolCalendar`, `scorePair`, `dashboards/useCard`, `parent/excuseLetters/card`, and on branch 3 `teacher/students/sectionOptions`, `components/filterState`, `format/audience`, `format/lrnRule`, and the three teacher cards (`excuseLetters`, `announcements`, `events`), `attendance/roster`, `classRecord/buildPayload` and `classRecord/backGuard`; plus `SCHOOL_YEAR`, the class dates and the `TERMS` table compared by value against `server/utils/schoolCalendar.js` (the three-way copy) |
| `npm run lint:tokens` | **71 tokens × 2 themes, both files match** | `scripts/check-tokens.mjs` — `src/theme/tokens.js` and `global.css` regenerate equal from `client/src/index.css` |
| `npm run lint:colors` | **0** | the web's token lint plus a hex / rgb / hsl literal rule outside `theme/tokens.js` |

## Lint baselines

Every client dispatch reports all four. **They are one set: three of them
being zero says nothing about the fourth**, which is why they are listed
together rather than remembered separately.

| Command | Baseline | Note |
|---|---|---|
| `npm run lint` (oxlint) | **43 warnings, 0 errors** | Was 44; **41** briefly after CR2 deleted `teacher/GradesPage.jsx`, then 43 as pages were added back. A new advisory is **stated in the report, never absorbed into the total.** |
| `no-undef` (inside oxlint) | **0** | Enabled 2026-09-22. Needs `env.browser` plus an `overrides` giving `scripts/**` `env.node`, or it reports 52 globals and no real bugs. |
| `npm run lint:tokens` | **0** | `client/scripts/check-color-tokens.mjs` — §8. |
| `npm run lint:contrast` | **0 unwaived** | **74 pairs** × 2 themes, **9 waived** as of 2026-09-25 (UI-D-3 added the three badge-on-`brand-panel` boundaries and the hero's muted foreground). A waiver needs an allow-list entry whose marker sits on a `docs/KNOWN_ISSUES.md` row. **A `boundary` pair never fails** — threshold 0, reported only — so it is a way of making a separation visible to review, not of enforcing one; the dark badge pair reports ~1.0 and is an accepted decision, not a waiver. |

**Run them AFTER the last file of the dispatch is written, and say in the
report WHEN they ran** — not only that they passed. DV1b-a ran oxlint before
writing its proof script and never again, reported "43 unchanged", and left
two `no-undef` errors on `main` for a dispatch. `docs/FRONTEND_CONVENTIONS.md`
§17a.

**A build's exit code is part of the result.** A failed build can leave the
PREVIOUS bundle in place, so a proof harness can report success for code that
no longer compiles — §13f.
