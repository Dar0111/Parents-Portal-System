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

## Lint baselines

Every client dispatch reports all four. **They are one set: three of them
being zero says nothing about the fourth**, which is why they are listed
together rather than remembered separately.

| Command | Baseline | Note |
|---|---|---|
| `npm run lint` (oxlint) | **43 warnings, 0 errors** | Was 44; **41** briefly after CR2 deleted `teacher/GradesPage.jsx`, then 43 as pages were added back. A new advisory is **stated in the report, never absorbed into the total.** |
| `no-undef` (inside oxlint) | **0** | Enabled 2026-09-22. Needs `env.browser` plus an `overrides` giving `scripts/**` `env.node`, or it reports 52 globals and no real bugs. |
| `npm run lint:tokens` | **0** | `client/scripts/check-color-tokens.mjs` — §8. |
| `npm run lint:contrast` | **0 unwaived** | 70 pairs × 2 themes, **9 waived** as of 2026-09-22. A waiver needs an allow-list entry whose marker sits on a `docs/KNOWN_ISSUES.md` row. |

**Run them AFTER the last file of the dispatch is written, and say in the
report WHEN they ran** — not only that they passed. DV1b-a ran oxlint before
writing its proof script and never again, reported "43 unchanged", and left
two `no-undef` errors on `main` for a dispatch. `docs/FRONTEND_CONVENTIONS.md`
§17a.

**A build's exit code is part of the result.** A failed build can leave the
PREVIOUS bundle in place, so a proof harness can report success for code that
no longer compiles — §13f.
