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
- `npm run test:assignments` — **62/62**
- `npm run test:grading-modes` — 13/13
- `npm run test:grades` — **247/247** (was 212. This line has been stale four times over: 167 → pagination 182 → DV3 188 → 189 → rounding 197 → Grade 1 letters 212 → CR0/CR1 239)
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
- `npm run test:class-summary` — **59/59** (CR3). Two assertions are the dispatch: **TCH-002, adviser with zero assignments, gets 200 on the summary AND on a learner's report card.** Its cleanup is a **WATERMARK, not an id list** — `PUT /class-record` creates a shell row for every learner in the class, so deleting only its own learners' grades left eight behind on a SEEDED one (KNOWN ISSUES)
- `npm run test:recovery` — **62/62, but ONLY against a server started with `MAIL_TRANSPORT=file`.** Otherwise it stops at 11/1 with a fixture failure — the variable belongs to the process that sends the mail, so prefixing the test script does nothing. Run-book in KNOWN ISSUES

`node scripts/verify-grading-seed.js` is not one of the suites above — it's a
direct-DB verification script (no server, no HTTP, no `assert()` harness),
checking the Grades seed (transmutation table, weights, modes, Grade 1
descriptive fixture) is internally consistent. Run it after `db:setup`, before
trusting the seed. **44/44 as of 2026-09-23** — the descriptive-exclusion
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

## The two known-count exceptions

Both are **run-book problems, not failing code**, and both have their full
row in `docs/KNOWN_ISSUES.md`. They are listed here because a clean run does
**not** print a clean number, and a session that does not know that will
report a regression that is not one.

| Suite | What you will actually see | Where the run-book is |
|---|---|---|
| `test:restore` | **28 passed, 1 FAILED** — *"A token issued after the cutoff still works"*. A JWT `iat` has one-second resolution and the scripted flow fits inside one second on a fast machine. The production behaviour is correct. **Fix the TEST, never the comparison.** | `docs/KNOWN_ISSUES.md` → *`test:restore` fails one assertion on a fast machine* |
| `test:recovery` | **11 passed, 1 FAILED** against a normally-started server, and the fixture stop is correct behaviour rather than a flake — the suite reads the emailed code off disk. **`MAIL_TRANSPORT=file` belongs to the process that SENDS the mail, so it goes on the SERVER**; prefixing the npm script does nothing. With it: **62/62**. | `docs/KNOWN_ISSUES.md` → *`test:recovery` needs `MAIL_TRANSPORT=file` on the SERVER* |

**Report these as their known figures, not as failures** — and if either
number changes, something really did move.

---

## Render proofs — the client's four, and their baselines

They are not suites: no server, no database, no `test:*` script. Each is an
SSR build plus a node run, and each is **kept** rather than thrown away
after its dispatch. All four live in `client/scripts/` because
`.oxlintrc.json` gives `env.node` only there (§17a).

Run from `client/`:

```bash
npx vite build --ssr scripts/<name>.jsx --outDir .ssr-tmp && node .ssr-tmp/<name>.js
```

| Proof | Baseline | What it covers |
|---|---|---|
| `ssr-cards.jsx` | **32/32** (was 31; UI-E redrew the teacher card's gate) | the card contract, by RENDERING — `actions` beside a primary action, the DEV guard, both excuse-letter cards. Its teacher-card block asserted **"exactly ONE of the two is tappable"**, which was correct until a reviewed letter had somewhere to go; it now asserts both are tappable **plus the one dead end that survives** — a Pending letter in a section the teacher does not advise. **Needs `NODE_ENV=development`, see below** |
| `ssr-item5.jsx` | **37/37** | the filter cue (§21): `isDirty` driven directly — **key order irrelevant** (with a control showing `JSON.stringify` would have called the same values different), `search` trimmed both sides, type coercion, the four dependent Grade→Section transitions, and a non-empty `'all'` default; plus `FilterActions` **rendered** in both states — note present only when dirty, `role="status"`, `aria-hidden` glyph, quiet vs filled, never disabled, Reset only when `canReset`. **Its header states what it cannot prove:** the change EVENT (no events under `renderToStaticMarkup`) and the 390px layout — both the browser check |
| `ssr-ui-e.jsx` | **23/23** | the teacher's read-only letter view (§20): remarks reachable on an Approved AND a Declined letter, the learner and class named, **the `<dt>` set asserted exactly and in order** rather than by regex (§20f), NULL remarks and NULL details rendering no heading, no Edit, no identifier — and the card's three-way gate rendered through the real `DataTable`, with a negative control proving `canReview` still refuses. **Every fixture is a real `GET /api/excuse-letters` row captured from the running server**, not written from memory (§19f) |
| `ssr-dates.jsx` | **46/46, and it must be run TWICE** — see below (**48/48 under `NODE_ENV=development`**, where the two DEV-guard assertions replace the one production-silence assertion). Was 25; UI-C1b added the DATE-bearing cards and `calendarDaysAgo` | the date helpers: the 08:00 PH rollover, both day boundaries, a New Year, the DEV guard and its production fallback, a real card rendering a morning timestamp, the three converted DATE cards, and the calendar-day-vs-elapsed-hours boundary at midnight, a month end and a year end |
| `ssr-ui-c2.jsx` | **39/39** (was 32; UI-C1b added the `{ value, label }` section options. 33 before that — UI-C1a removed the four lines asserting the announcement card still sliced its date; `ssr-dates` owns that claim now, and makes a stronger one) | the one staff audience wording and its `hasSections` split, the Section filter's option logic **and its labels**, and the report card's conditional copy. **It does NOT cover the Remarks hint** — that is behind a click inside a Modal, said in its own header so a green run is not over-read |
| `ssr-ui-a.jsx` | **38/38** | `GradeValue`'s colour, score pairs, `longDate` at the dashboard spots, the Attendance header. **Its line-51 assertion was INVERTED by UI-D** — it asserted that a caller passing no `className` still got `text-fg`, which was UI-A's whole point; UI-D removed that default once a base colour existed, so the line now asserts that **no** colour is emitted. The four assertions beside it were correct before and after and did not move |
| `ssr-ui-d.jsx` | **82/82** (was 32; UI-D-2+3 added `ScrollCue`'s state and the parent hero) | `ScrollCue`'s arithmetic driven directly — an SSR render has no layout, so `scrollWidth`, `clientWidth` and every cell geometry come back zero and the component renders with none of its logic exercised (§14e) — including **the two slacks asserted as a PAIR** so a later tidy-up cannot merge them: a group cut by 10px on a table 810px over IS named, and the same 10px cut names nothing when the table itself is only 10px over. Plus `ChildHero` for Key Stage 1 and Grade 6, **with a negative control asserting the raw `{descriptor, filipino}` object is refused** — that shape blanked `/parent` while this proof was green at 71/71 (§19f). And the NON-PRINT half of UI-D-1: `GradeValue` emitting no colour, the base colour and every print rule reaching the **built** stylesheet (grepped — a Tailwind variant that generates no CSS fails silently), and the print theme switch restoring light / dark / System including an OS flip mid-print. **It cannot prove the printed layout and says so in its own header** — `@media print` does not apply to an SSR render, so there is no page box, no `@page` and no paper width. **Print is checked on paper** (FRONTEND_CONVENTIONS §18h) |
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

## The smoke run — a read-only browser sweep

`client/e2e/smoke.spec.js`, Playwright, headless Chromium. **Twenty tests:
five roles × two themes × two widths, 61 URLs, 244 screenshots.** It is not
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

**Not diagnosed, and a re-run is not a fix.** If it fires, re-run that one
test alone and report both results. A warm-up request in the smoke setup is
queued in UI-C1; `docs/KNOWN_ISSUES.md` has the row. **Playwright retries
are deliberately off** — a retry would hide it.

**A negative control never touches a tracked template.** Use a temp copy or
Write with full contents — this file's own guard was proved by appending a
placeholder to the committed example, which broke the Write/Edit-only rule
for one line.

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
