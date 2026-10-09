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

**Tests:** twenty-six `test:*` scripts — **twenty HTTP suites** plus six
direct-call unit tests (`sanitize`, `grade-computation`, since #7
`school-calendar`, since fix/auth-503 `auth-middleware`, since
feat/sms-transport `sms-transport`, and since feat/lan-web `cors-origins`).
Recounted from `server/package.json` on 2026-10-01 (`feat/lan-web` added
`test:cors-origins`, a unit test; on 2026-09-30 `feat/profile-photos` added `test:profile-photo`, an HTTP suite;
twenty-four at `docs/stage5` the same day); on 2026-09-26 it was twenty-three with four unit
tests, and the "twenty-two … eighteen" before that was wrong by one HTTP
suite, because `test:grade-computation` is described in a paragraph below
rather than a bullet. **Also in `package.json`:** `verify:grading-seed`,
eight `db:migrate:*` scripts, `sms:probe` and `proof:backups`. Scripts that
are not tests and have no baseline here — client `build` / `preview`,
mobile `start` / `android` / `tokens:write` — are in README → NPM scripts. **Every count below
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
- `npm run test:users` — **73/73** (was 68; feat/sms-transport — `+63…` stored as `09…`, a same-number re-type in `639…` form keeps the confirmation and the pending code, a new number clears `contact_verified_at` and burns the pending text code, and **Q4: an admin email change burns the code already mailed to the old address, which then cannot confirm the new one** — codes planted in the DB, so this suite never sends real mail or text; negative control: the email burn disabled → 71/73 on exactly the two Q4 asserts. Was 64 before #4; #4 — the email rule on POST /teachers ("not an email", `user@localhost`) and PUT (two `@`, and `""` clears to NULL). #2 added `sort=role` and `sort=status` alphabetical invariants plus admin-before-parent). **The script is `test:users`** — the file is `test-user-management-flows.js`, and a dispatch that types `test:user-management` gets a silent no-op from npm, not a failure
- `npm run test:backups` — **52/52** (was 47; fix/server-reliability, the `.partial` safeguard — no `.partial` left after the suite's own backups; a SECOND API on `FAIL_PORT` (5002) with a `MYSQLDUMP_PATH` that does not exist starts, its startup sweep removes a stale `.partial` planted before it, and its forced dump failure answers 500 leaving **neither a `.sql` nor a `.partial`**. The first run of this assert FAILED — `runMysqldump` rejected before the async write stream had created its file, so a 0-byte `.partial` appeared after the cleanup — and that red is what `runMysqldump` now waits out. Was 39 before that)
- `npm run proof:backups` — **not a suite; the backup-reset loop** (`scripts/proof-backup-loop.js`, run by hand, never beside a server suite). Starts its own API on 5001 (`--arm watch` = the old `node --watch server.js`, `dev` = the `dev` script now, `plain` = `npm start`) or measures the running one (`--target-existing`), records every file event under `server/` and the listener pid around each backup, deletes only its own backups and orphans. **Recorded 2026-09-30:** 0/30 on fresh 5001 servers; 1/1 against the 5000 dev API (the named trigger); with `--touch node_modules/iconv-lite/encodings/index.js` — old dev 3/3 resets, **new dev 0/20, `npm start` 0/20**, and `--touch routes/auth.js` still restarts the new dev 3/3 (positive control)
- `npm run test:cors-origins` — **44/44** (new, feat/lan-web, 2026-10-01; a unit test — no running API, no database; it starts its own throwaway servers on a random 127.0.0.1 port). `utils/corsOrigins.js`: unset / empty / commas-only → the `http://localhost:3000` default; the old single value unchanged; a list trimmed, empties ignored, a duplicate dropped; **`*` and every URL-shaped wildcard (`http://*.example.com`, `https://*`) never accepted and each reported**, `*` alone → the default, never "allow all"; a path, a trailing slash, no scheme, another scheme, credentials → dropped with the good entry kept; one startup warning per ignored entry. Then the REAL `cors` middleware and the REAL `socket.js` `initSocket` with a parsed list: localhost and a LAN origin echoed with credentials (GET and preflight, and the Socket.io polling handshake), a stray origin gets no `Access-Control-Allow-Origin` from either, and the header is never `*`. **Negative controls:** a naive split-on-comma parser is caught by the same wildcard check; and live, the explicit wildcard refusal removed with Edit → **36/44** (the URL-shaped wildcards parse as valid origins — the check is load-bearing), restored → 44/44
- `npm run test:sanitize` — 9/9
- `npm run test:sms-transport` — **62/62** (new, feat/sms-transport; a unit test, no server, no DB, **no real text**) — the contact rule's three accepted forms and eight refusals, `toE164`; both texts ≤ 160 and ASCII; the gateway request's exact shape through a fake `fetch` (`POST <url>/message`, Basic auth, `textMessage.text`, `phoneNumbers: [E.164]`, `ttl`); every failure a fixed reason (`http_401`, `http_500`, `unreachable`, `timeout`, `bad_config`) with no `cause`; **A1 against a REAL refused port: no IP, no port, no credential and no number in the error, its full `util.inspect` cause chain or anything printed** — negative control: a `cause` attached → 59/62 on exactly those three asserts; `health()` is a GET that sends nothing and never returns the URL; file mode; the mode chosen once from a const
- `npm run test:messages` — **86/86** (2026-10-06, +2: the admin's contacts label the seeded adviser-only teacher "Adviser of Grade 5 - Masigasig" where the subject list would be, and a teacher with subjects — teacher1, who also advises — keeps the subject list. 84/84 before that, was 80; feat/admin-messages, 2026-10-06, +4: teacher → admin `201` and admin → teacher `201`, cleaned up by id; admin → parent `403` "The admin may only message teachers."; admin → a second admin, inserted for the run and removed by its login id, `403`. Rewritten in place, same count: parent → admin is now `403` "Parents may only message their child's teachers." (was `201`); the parent's contacts hold NO admin (was "sees admin"); the admin's contacts are active teachers only (was "everyone"); the `?search=` check searches a teacher's name (the old parent-name term would have passed on zero rows). **The conversations page check runs on teacher1's token** — the parent now holds one conversation, so its `offset=1` assertion would have stopped running (80 → 83 measured before the move, 84 after). 59 before that)
- `npm run test:restore` — **29/29** (was 28 passed / 1 FAILED for three days). **The failure was never `iat` resolution** — the crafted "after the cutoff" token carried no `v` claim and ADMIN001's `token_version` had been bumped to 2 by other suites, so the middleware's version check refused it with a 401 the assertion could not tell from the restore one. The token carries the live `v` now (#3a); `middleware/auth.js` is untouched. KNOWN ISSUES has the corrected row
- `npm run test:excuses` — **93/93** (was 92; #3a — letter notifications cleaned by pairs, resolved BEFORE the user/student cascades, and asserted gone)
- `npm run test:notifications` — **157/157** (was 151; fix/server-reliability — a DELETE removes its notifications and signals the recipients: on an announcement delete and on a grade delete the recipient's socket receives `notification_counts`, and 0 rows are left for the item; this REPLACES the old assertion that the row stayed in the table. Before that, 151 since fix/smoke-gate `12a3495` — an adviser's `excuse_submitted` SELF-HEALS: the badge and the bell are +1 while the letter is Pending and back to the start after approve AND after decline, each asserted as a delta from counts read just before the letter; a `socket.io-client` socket proves the reviewer receives `notification_counts` on both reviews; the approved letter's row is no longer listed, still EXISTS and was NOT marked read; the parent is still told a declined letter was reviewed. The old "both events coexist" assertion, which asserted the adviser still SAW the submitted row after approval — the defect itself — is replaced by its table-level half. Was 124 before that). Since #3b its users/students watermark is **captured at start and printed** (`i watermark at start: users 8, students 4`), not the literal 7/3 — a seed change must not fail a suite that has no defect. `test:recovery` does the same
- `npm run test:dashboard` — 77/77
- `npm run test:class-record` — **118/118** (CR1 105 → CR2 117 → #3a 118: it asserts NO notification row for its grades — measured zero before the helper existed, because its fixture learners have no parent; asserted rather than deleted). **It is the only suite that imports a CLIENT module** — `buildPayload.js` — so the grid's real payload is exercised against the real API; see §13e
- `npm run test:class-summary` — **59/59** (CR3). Two assertions are the dispatch: **TCH-002, adviser with zero assignments, gets 200 on the summary AND on a learner's report card.** Its cleanup is a **WATERMARK, not an id list** — `PUT /class-record` creates a shell row for every learner in the class, so deleting only its own learners' grades left eight behind on a SEEDED one (KNOWN ISSUES)
- `npm run test:recovery` — **110/110 since feat/sms-transport (was 62), but ONLY against a server started with `MAIL_TRANSPORT=file SMS_TRANSPORT=file`** (`PORT=5001`, `API_BASE=http://127.0.0.1:5001`). The SMS half: a second throwaway teacher with a fictional number; unconfirmed gets nothing; the request, a wrong code, a same-number re-type that keeps the pending code, confirm; forgot by text only, then by both channels with **the same code in both files and one live row**, reset with the texted code; a number change burns the code sent to the previous one; an admin number change clears the confirmation; the 4th request in an hour is `429`; no number is `400`; a smuggled `SMS_TRANSPORT` flag writes nothing. Otherwise it stops at 11/1 with a fixture failure — the variable belongs to the process that sends the mail, so prefixing the test script does nothing. Run-book in KNOWN ISSUES
- `npm run test:profile-photo` — **70/70** (new, feat/profile-photos, 2026-09-30; an HTTP suite, against the normal 5000 API). **Stays on Marwin's parent** (login id read from the DB, never printed) plus TCH-001 for one own upload and a one-message conversation. Fixtures are built IN MEMORY with sharp — a PNG, a WebP, a GIF, and a JPEG carrying a GPS block **proved present before upload (the control)**. Proves: the 32-hex `.jpg` name with no login id; the `/me` reply; the file served without a token as a 512 × 512 JPEG with **no EXIF and no GPS**, `nosniff` and a private cache; replace → a new name, the old address 404 and its file gone; the six refusals (a text file as `.png`, a real GIF as `.jpg`, 5 MB + 1 → 413, two files, another field, no file) change nothing and write no file; `/uploads/`, `/uploads/avatars/` and a dotfile are refused; the name on `GET /users/:id`, the pending list and the conversation row; one account's upload never touches another's; admin remove-only (teacher / parent 403, bad id 400, unknown 404, no admin upload route, a no-op on repeat); own removal and its no-op; `activity_logs` counts per action and **no description carrying a login id, an id or a file name**. **Cleans up in `finally` and asserts it:** both `profile_pic` back to NULL, every file it wrote unlinked (the directory exactly as it was), the message deleted by id. `activity_logs` rows stay, as for every suite

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
| `test:recovery` | **11 passed, 1 FAILED** against a normally-started server, and the fixture stop is correct behaviour rather than a flake — the suite reads the emailed code off disk. **`MAIL_TRANSPORT=file` belongs to the process that SENDS the mail, so it goes on the SERVER**; prefixing the npm script does nothing. With it: **62/62** — and since 2026-09-29 it needs `SMS_TRANSPORT=file` on the server as well, then **110/110**. | `docs/KNOWN_ISSUES.md` → *`test:recovery` needs `MAIL_TRANSPORT=file` on the SERVER* |

**Report these as their known figures, not as failures** — and if either
number changes, something really did move.

---

## Render proofs — the client's twenty-three, and their baselines

They are not suites: no server, no database, no `test:*` script. Each is an
SSR build plus a node run, and each is **kept** rather than thrown away
after its dispatch. **Twenty-three** `client/scripts/ssr-*.jsx` files as of
2026-10-08 (`ssr-build2-fixes` joined with the build 2 fix round; on 2026-10-07 `ssr-skeletons` and `ssr-dashboards` joined with build 2, `feat/dashboards-look`; on 2026-10-05 `ssr-look-fixes` joined with feat/look-fixes; on 2026-10-04 `ssr-form-drafts` joined with feat/form-drafts; on 2026-10-02 `ssr-enter-to-send` joined with the feat/message-toast fix round, `ssr-message-toast` with feat/message-toast; on 2026-10-01 `ssr-leave-guard` joined with fix/leave-guard and `ssr-api-base` with feat/lan-web; on 2026-09-30 `ssr-avatar` joined with feat/profile-photos, `ssr-nav-scroll`
earlier that day; twelve on 2026-09-26, and the heading
said "four" from the day there were four). All live
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
| `ssr-build2-fixes.jsx` | **43/43** (new, the build 2 fix round, 2026-10-08; **runs AFTER `npm run build`** — its F6 checks read `dist/assets`; negative controls inside it: a DataTable without `skeletonAvatar` draws no circle; the phone's old `Lines` keyed by width over widths that repeat `w-1/2`) | The owner's device-check findings on the web, FRONTEND_CONVENTIONS §5a-vii / §9 / §15e: **F1** `HazardSlot` RENDERED in its three states — the compact notice (the title, "Why this matters" with `aria-expanded` naming a `hidden` panel that holds the explanation word for word, "Confirm your email" a link to Account information, `basis-64` + wrap at 390px), the space HELD while loading with the email unconfirmed (`invisible`, `aria-hidden`, `inert`, and byte-identical to the notice apart from those attributes, so the height cannot differ), nothing when the email is confirmed or the answer has no hazard; **F2** the card titled "Users" (source); **F3** the count links carrying `?role=teacher` and `?role=parent&status=active`, and Admin → Users RENDERED inside the real `AuthProvider` at those addresses — the Role and Status selects open on the preset, nothing reads "Changes not applied", a forged address (unknown role, status, a search) is ignored; **F4** DataTable's skeleton with `skeletonAvatar` — a 2.375rem circle on each of three card placeholders and in the first cell of each of five rows — and without it none; the three pages that pass it (source); **F5** `shouldScrollToTop` IMPORTED from `layout/scrollOnNavigate.js`, never read as text (the owner's rule): PUSH and REPLACE to another pathname scroll, POP and a query-only change never; **F6** the BUILT stylesheet — the `skeleton-sweep` keyframes moving only the background, every sweep rule inside `prefers-reduced-motion: no-preference` (the block matched brace for brace), `1.5s ease-in-out 3`, `background-attachment: fixed`, the `surface` band and the dark theme's `edge-strong` band — and the rendered region and bars carrying no pulse; **F7** `NavItem` RENDERED expanded and as a rail icon with the ring drawn inside (`-outline-offset-2`); **F8** the web Card's skeleton lists keyed by position (source). **Cannot prove** the jump on a real load, the sweep moving, a real Tab, a real scroll — the owner's re-check |
| `ssr-dashboards.jsx` | **29/29** (the build 2 fix round, 2026-10-08, two checks changed in place, same count: the counts card is "Users" (F2), and Teachers / Parents link with their presets (F3). New on build 2 commit 2, `feat/dashboards-look`, 2026-10-07; a negative control inside it: build 1's card classes — 16px, shadow, lift — fail every look check) | FRONTEND_CONVENTIONS §15e, Part C: the dashboard Card RENDERED — `rounded-xl`, no shadow at rest or on hover, `hover:border-edge-strong` with `transition-colors` on a linked card and none on an unlinked one, the icon INLINE before the title (`fa-fw`, `text-fg-muted`, `aria-hidden`) in one header row, no chip, the stretched link's `after:rounded-xl`, the amber frame on the same corner, the People card's `counts` skeleton; the staff ProfileHero — `rounded-xl`, no shadow, the facts as ONE `text-sm text-brand-panel-muted` line joined by " · " with a missing fact left out, no pills, a parent's login id never shown; the parent ChildHero — `rounded-xl`, no shadow, "Your child" and the three figure labels as plain `text-sm` words, nothing uppercase; the admin's `CountLinks` — Students → `/admin/students`, Teachers and Parents → `/admin/users`, each link carrying its label, number and caption, 44px, `rounded-lg`, the shared focus outline. **Source text, said plainly:** the three grids — admin's Waiting `sm:col-span-2`, the People card with NO `to`, System `sm:col-span-2 lg:col-span-4`, no `compact` left; teacher's letters `sm:col-span-2`; the parent order (Grades, Attendance, Messages, Excuse letters, Upcoming events, Announcements & memos), Grades `sm:col-span-2`, Announcements `sm:col-span-2 lg:col-span-3` as a `divide-y` list. **Cannot prove** the look at each width, the hover, or the fill — the owner check |
| `ssr-skeletons.jsx` | **55/55** (the build 2 fix round, 2026-10-08, three checks changed in place, same count: the painted region switches the index.css sweep on by `data-skeleton="painted"` with no pulse class or inline count, every bar is a `skeleton-bone`, and the component carries no animation class at all (F6). New on build 2 commit 1, `feat/dashboards-look`, 2026-10-07; negative controls inside it: the old one-flag card view swaps a kept answer for a placeholder; the source checks find the spinner branch gone) | FRONTEND_CONVENTIONS §5a-vii: `hooks/useSkeleton.js`'s pure `skeletonPhase` (wait under 300 ms, the skeleton from 300 ms, off the moment loading ends — no minimum); `useCard.js`'s pure `startRead` / `cardView` (the same query keeps its answer as `refreshing`, a new query never shows the old one — not even before the read starts — a null answer is an answer, Retry after an error is `loading`); `Skeleton` rendered in both phases (`role="status"`, `aria-live`, `aria-busy`, the sr-only "Loading…", hidden shapes `invisible` during the wait, `data-skeleton="painted"` and `skeleton-bone` bars once painted (the index.css sweep since the fix round; its pulse and inline count before), the `edge` fill); DataTable rendered with nothing on screen (the real headers over five rows, cards below `sm`, the pager strip, C7's stale page, an error first) and with rows on screen while loading (the same rows, the frame `aria-busy` and `inert`, not greyed before 300 ms; idle carries neither); the dashboard Card's four skeleton shapes, a re-read's busy and inert content, an idle card; the report card loading (its title band over six rows, the general-average band only when not Key Stage 1). **Source text, said plainly:** the hook's state set only from its timer and reset during render, one timer; the newest-ticket guard on the answer and the error; `[key, skip, refresh]`; DataTable's `kept` grey after 300 ms; the phone's `useSkeleton.js` byte-equal. **Cannot prove** the 300 ms on a device, the pulse, the fill's look, what a screen reader says — the owner check |
| `ssr-look-fixes.jsx` | **113/113** (build 2 commit 1, 2026-10-07, +9 — the drawer is `<div role="dialog" aria-modal="true" aria-label="Menu">` with `tabIndex={-1}` and `print:hidden`, no `<aside>` in it, its wrapper `print:hidden`, with a negative control without `aria-modal`; it closes on `(min-width: 48rem)` through a ref'd close, the listener removed; Log out from the drawer closes it first, with a negative control; the drawer's user card uses it and the sidebar's does not; the menu button's `aria-haspopup="dialog"` and `aria-expanded`. Changed in place: the drawer's slice now runs to `export default function Shell(`, and the `<aside>` check became the dialog check. 104/104 before that — fix round follow-up, 2026-10-06, +14 — F1: per thread page, the newest-message effect waits for the list (mounted, not loading, this thread's messages) before it records anything, with a negative control putting the old shape back; F2: a thread is "opening" until positioned once; F3: `gridHeight` and `snapToSlot` driven with the 1366×600 geometry, the pinned row meeting a row boundary at a slot start with a negative control at a row top, and the slot-sized group headers, the nav padding and the grid wiring as source. Changed in place: the end-of-list check reads `list.scrollTop = list.scrollHeight;` in its new place, and the only-`scrollIntoView` check names `keepBoxInView`, called on open and after MY send. 90/90 before that — the fix round, 2026-10-06, +2 and three lines changed by the approved SCOPE EXPANSION: only `scrollIntoView({ block: 'end' })` is forbidden, and the page's one `scrollIntoView` is the box's `nearest`. 88/88 before that — feat/admin-messages, 2026-10-06, +28: the admin's nav item and Communicate group DRIVEN through `nav.js` / `navGroups.js` with a control on the other roles' icon; the admin routes, the role-based base path on all three thread links, the single Teachers group, the back link, no hand-off on the parent/admin thread; the teacher hand-off and its hint only when `(other?.role \|\| contactRow?.role) === 'parent'`, with a negative control; the five copy changes, the two refusals read from `server/routes/messages.js`; finding #11 on both thread pages — no `scrollIntoView` in code, the list's own `scrollTop`, the composer's two `preventScroll` focus calls and no other, the refocus keyed on my own send — each with a negative control that puts the old `scrollIntoView` back. One check rewritten in place: the parent picker navigates to `${base}/<id>`. 60/60 before that, build 1 fix round, 2026-10-05, +17: FilterActions RENDERED as one group and the eight filter rows `items-start`, C1's text, the picked-name fallback in both thread headings, the send REF guard in both thread pages with a negative control each, the guard's mechanism as a model with a negative control, a held Enter and its control, the admin Grades sections and learner Retries. 43/43 new, feat/look-fixes, 2026-10-05; negative control with Edit, restored: `onEscape` added to the trap effect's dependencies → **42/43**) | FRONTEND_CONVENTIONS §27f and the build-1 fixes: `focusTrap.js`'s pure `nextFocusIndex` (Tab and Shift+Tab wrap, the middle left to the browser, the container's first focus, nothing focusable); `api/tickets.js` with two fake loads resolving out of order — the newer stays — and a **negative control that applies every reply and shows the older one**; `buttonClass` (every variant `rounded-lg` with a border in its own colour, hover included, ghost transparent, no shadow), `cardClass` (`rounded-xl`, no shadow), the input's `focus-accent` border, `StatusBadge` rendered as a `rounded-md` tag; `TermValue` printing a Grade 1 Final letter, with the control that `GradeValue` prints it as "— N/A". **Source text, said plainly:** the trap effect depends on `[ref, active]` only, takes the opener before focusing and gives focus back; `Modal` calls it with `open` and no longer focuses the panel itself; the drawer calls it with Escape and is named "Menu" on its `role="dialog"` div (an `<aside>` until build 2); UnreadProvider and the class record's load apply only their latest reply; both thread pages set the spinner only on a first load or while empty, keep the list on a failed re-read, take the other person only from a row with a name, and title a new thread with the picked name, which both pickers pass in router state; admin Grades' descriptive Final (table and card) and hidden General Average; DataTable's inner corners at `-xl`. **Cannot prove** a real Tab or Escape, focus returning to the opener, the thread not blinking, the badge after a real race, or the look — the owner check |
| `ssr-form-drafts.jsx` | **61/61** (build 1 follow-up, 2026-10-05, +11: `isBlankDraft` driven on all five forms — a blank message, an announcement / excuse letter / event with only pickers, a word making a draft — the five forms named, the storage layer alone keeping blank lines as the NEGATIVE CONTROL, the hook's flush and Close, both thread pages' restore. 50/50 new, feat/form-drafts, 2026-10-04; negative control with Edit, restored: the allow-list check on a stored record's `values` removed from the client `decodeDraft` → **49/50**, and `lint:mirrors` red) | FRONTEND_CONVENTIONS §28: the mirrored `drafts/draftCore.js` — the key `pp.draft.v1.<user id>.<form>.<context>`, and a login-id-shaped user id, an LRN as a user id, an LRN-shaped or a name context and an unknown form each THROW; a password, login id and LRN field dropped on save, a stored record with one (in `values` or `base`) read as none; the 200-character title cap; a 10 000-character message kept, a record above 32 000 encoded characters not written; another version, another form, corrupt JSON, `null` read as none; values equal to the opening values not a draft. Then `drafts/sessionDrafts.js` over a FAKE `sessionStorage`: save, restore with the `open` flag a reload reopens on, Close keeping the draft but no longer open, emptied back to the opening values removed, Discard / submit removing it, other keys untouched; `itemChangedSince` (unchanged, changed, a create draft never "changed"); `fromThread` kept as a number and never as a login id; user 7 never reading user 8's draft; logout's `clearAllDrafts` removing every `pp.draft.*` key (every account, an older version) and leaving `pp.theme` / `pp.navGroups`; a throwing storage and an unreachable one keeping nothing and throwing nothing. The approved copy word for word; `DraftNotice` rendered — `role="status"`, the tab notice, Discard draft, the message and item-changed variants. **Source text, said plainly**: `AuthContext.logout()` calls `clearAllDrafts()` and nothing else there does; `api/axios.js`, the 401 path, never touches a draft. **Cannot prove** the debounce, `pagehide`, a real reload reopening a modal, the hand-off question — the owner check |
| `ssr-enter-to-send.jsx` | **25/25** (build 1 follow-up, 2026-10-05, +10: `enterKeyAction`'s three answers — send, block (a repeat, a blank box, in flight), null (Shift+Enter held or not, a modifier, an IME, another key) — and both key handlers on a fake event recording preventDefault, the OLD one as the NEGATIVE CONTROL (its held repeat typed a new line); the wiring regex follows the new onKeyDown. 15/15 new, the feat/message-toast fix round, 2026-10-02; negative control with Edit, restored: the IME-composition check removed → **12/15**) | FRONTEND_CONVENTIONS §26, web only: `components/enterToSend.js` — plain Enter with text sends; Shift+Enter, Ctrl / Alt / Meta+Enter and another key do not; `isComposing`, the native event's `isComposing` and `keyCode 229` do not; an empty or whitespace-only draft and a send in flight do not; and across every state Enter sends exactly when the Send button is enabled (`sending \|\| !draft.trim()`). **Source text, said plainly**: both thread pages wire the textarea's `onKeyDown` through the helper to `form.requestSubmit()` (the Send button's own `onSubmit={send}`), and `send()` refuses while a send is in flight. **Cannot prove** a real key press or a real IME — the owner check |
| `ssr-message-toast.jsx` | **40/40** (feat/admin-messages, 2026-10-06, +1: `otherIdFromPath('/admin/messages/3') === 3` — FLIPPED from `null`, the admin has a thread now — and the list-page assertion keeps `/admin/messages` as not a conversation; the Shell mount check relabelled "every role, the admin included". 39/39 before that, tone change, 2026-10-02, +1 — "two-tone down": the TONE values, both voices' frequencies and ramps, and their start / stop times; negative control with Edit, restored: voice 2 set to 880 Hz in the client `TONE` → **37/39**, and `lint:mirrors` red. 38/38 on the fix round, +14 — the tone and the store; negative control then: a new `AudioContext` on every tone → **37/38**. New at 24/24 on feat/message-toast; negative controls then: the body put into the label → **19/24**; the own-message skip removed → **23/24**) | FRONTEND_CONVENTIONS §26: `realtime/messageToast.js` (mirrored to the phone) — the words for one and for several, five seconds, `rowFor` by id, `otherIdFromPath` for the teacher and parent thread URLs (the list page, admin and other pages are not a conversation), `otherIdFromRoute` on a focused vs an unfocused thread; the decisions — a first message shows, never my own (the toast on screen untouched), never in that conversation but yes in someone else's, the same person updates to the SERVER's count, a different person replaces, unread 0 / no row / no name skip; **no part of the body in any toast though every fixture row carries `last_message_body`**; then `MessageToastView` rendered — the `role="status"` / `aria-live` box mounted while empty, the label, View as a button, the close button named Dismiss, no body, tokens only. **Fix round, values since feat/ui-refresh:** `TONE` is "two-note rise" (587 Hz 0–140 ms, 880 Hz 80–360 ms, each with its octave — 1174 Hz 0–60 ms, 1760 Hz 80–170 ms — peak 0.125, 6 ms attack, floor 0.0001; `ssr-message-toast.jsx:155–160`); with a fake `AudioContext` (`realtime/messageTone.js`) — no context until the first tone, a tone on the show, the update and the replace (three tones of four voices: **12 oscillator starts**, none for my own message or the open conversation, `:180`), **ONE context reused**, `resume()` before each, 587 Hz then 880 Hz, each a linear rise to 0.125 over 6 ms and an exponential decay to 0.0001, stopped 20 ms after its end; a refused `resume()`, a throwing constructor and no Web Audio never throw and the toast still shows; `createToastStore` after × and after the expiry shows the next message again ("New message from …", then the server count) — never stale; and, source text, `Shell` mounts the toast only where Messages is built (no admin tone). **Cannot prove** the socket, the timer, hover / focus pausing, the sound itself or View through the leave guard — the owner check |
| `ssr-leave-guard.jsx` | **15/15** (new, fix/leave-guard, 2026-10-01; negative control: `requestLeave` made to always proceed with Edit → **9/15**, restored → 15/15) | FRONTEND_CONVENTIONS §5e/§13d: `layout/leaveGuard.js` (mirrored to the phone) — with no page registered an exit runs at once, exactly once (Log out logs out as before); a dirty page's dialog is asked instead and nothing runs while it is open; Stay runs nothing; Leave and discard runs the exit exactly once even if called twice; the cleanup unregisters; StrictMode's register / clean up / register leaves one guard that asks once; a second registration replaces the first; a STALE cleanup does not clear the newer guard; `null` is no guard. **Cannot prove** a click on Log out or a bell row — the owner check |
| `ssr-back-guard.jsx` | **12/12** (new, pre-Stage-5 #5b) | §13d: `classRecord/backGuard.js` driven through the six transitions (dirty → push; pop while armed → ask; stay → push; leave → back; clean → back; pop while clean → none) plus the one-sentinel negative control (a second dirty pushes nothing — StrictMode), clean-with-no-sentinel never backs, Stay/Leave outside a question are no-ops, the pop after Leave is the router's, and the input state is never mutated. The real Back press is the browser check |
| `ssr-auth-failure.jsx` | **14/14** (new, pre-Stage-5 #4) | §22: `classifyAuthFailure` driven with the four shapes axios produces (401 → logout; 503, `ERR_NETWORK`, `ECONNABORTED` → keep) plus three negative controls (a 401 never "keep", a 403 never a logout, `undefined` keeps); `AuthUnavailable` rendered — the condition, "Your session is kept", the reason as `role="alert"`, a real Try again, **no "log in"/"sign in" wording, no link away**. The effect (the token still stored after a failed boot) is the browser check |
| `ssr-cards.jsx` | **32/32** (was 31; UI-E redrew the teacher card's gate) | the card contract, by RENDERING — `actions` beside a primary action, the DEV guard, both excuse-letter cards. Its teacher-card block asserted **"exactly ONE of the two is tappable"**, which was correct until a reviewed letter had somewhere to go; it now asserts both are tappable **plus the one dead end that survives** — a Pending letter in a section the teacher does not advise. **Needs `NODE_ENV=development`, see below** |
| `ssr-item5.jsx` | **39/39** (was 37; item 5b) | the filter cue (§21): `isDirty` driven directly — **key order irrelevant** (with a control showing `JSON.stringify` would have called the same values different), **every string trimmed both sides** (a key named `query` too, with a control that an inner space is still a difference), type coercion, the four dependent Grade→Section transitions, and a non-empty `'all'` default; plus `FilterActions` **rendered** in both states — **the live region PRESENT and EMPTY when clean** (item 5b inverted item 5's assertion, which had cemented an accessibility defect: a region that first appears with its text already in it is never announced), `role="status"`, `aria-hidden` glyph, quiet vs filled, never disabled, Reset only when `canReset`. **Its header states what it cannot prove:** the change EVENT (no events under `renderToStaticMarkup`) and the 390px layout — both the browser check |
| `ssr-nav-scroll.jsx` | **15/15** (build 1 fix round, 2026-10-05: `revealActive` rounds a downward scroll UP to the next item's top, so the "below" case expects **350** where it expected 340, on a stand-in nav that now lists its links; +1 CONTROL — with no links to round to, 340 stands. 14/14 new, `feat/ui-polish` fix round, 2026-09-30; negative control 10/14 — `watchDismiss` without `capture`, and "below" aligning the top) | `layout/navScroll.js`: `nearestScrollTop` (visible → no move; above → top; below → bottom; half-hidden → least move; taller than the box → top), `revealActive` on a stand-in nav box (one write to the right `scrollTop`, none when visible, none for a box with no layout or no `aria-current` item), `watchDismiss` (scroll on the CAPTURE phase, scroll and resize each hide, nothing after unsubscribe). What it cannot — a real browser delivering the nav box's scroll, the tooltip painting on top — is the re-check's |
| `ssr-ui-e.jsx` | **23/23** | the teacher's read-only letter view (§20): remarks reachable on an Approved AND a Declined letter, the learner and class named, **the `<dt>` set asserted exactly and in order** rather than by regex (§20f), NULL remarks and NULL details rendering no heading, no Edit, no identifier — and the card's three-way gate rendered through the real `DataTable`, with a negative control proving `canReview` still refuses. **Every fixture is a real `GET /api/excuse-letters` row captured from the running server**, not written from memory (§19f) |
| `ssr-dates.jsx` | **46/46, and it must be run TWICE** — see below (**48/48 under `NODE_ENV=development`**, where the two DEV-guard assertions replace the one production-silence assertion). Was 25; UI-C1b added the DATE-bearing cards and `calendarDaysAgo` | the date helpers: the 08:00 PH rollover, both day boundaries, a New Year, the DEV guard and its production fallback, a real card rendering a morning timestamp, the three converted DATE cards, and the calendar-day-vs-elapsed-hours boundary at midnight, a month end and a year end |
| `ssr-ui-c2.jsx` | **39/39** (was 32; UI-C1b added the `{ value, label }` section options. 33 before that — UI-C1a removed the four lines asserting the announcement card still sliced its date; `ssr-dates` owns that claim now, and makes a stronger one) | the one staff audience wording and its `hasSections` split, the Section filter's option logic **and its labels**, and the report card's conditional copy. **It does NOT cover the Remarks hint** — that is behind a click inside a Modal, said in its own header so a green run is not over-read |
| `ssr-ui-a.jsx` | **38/38** | `GradeValue`'s colour, score pairs, `longDate` at the dashboard spots, the Attendance header. **Its no-colour assertion (`ssr-ui-a.jsx:58`; it sat at line 51 then) was INVERTED by UI-D** — it asserted that a caller passing no `className` still got `text-fg`, which was UI-A's whole point; UI-D removed that default once a base colour existed, so the line now asserts that **no** colour is emitted. The four assertions beside it were correct before and after and did not move |
| `ssr-ui-d.jsx` | **86/86** (was 82; pre-Stage-5 #2 (m) added the hero caption — `Term 1 · Benchmarking` from a string `descriptor`, `>Term 1</p>` on null, `Passed` never in the markup, and the server's `{ descriptor, remarks }` object handed through whole **refused** by the render, fixture captured from `test:grades`' complete-term response per §19f) | `ScrollCue`'s arithmetic driven directly — an SSR render has no layout, so `scrollWidth`, `clientWidth` and every cell geometry come back zero and the component renders with none of its logic exercised (§14e) — including **the two slacks asserted as a PAIR** so a later tidy-up cannot merge them: a group cut by 10px on a table 810px over IS named, and the same 10px cut names nothing when the table itself is only 10px over. Plus `ChildHero` for Key Stage 1 and Grade 6, **with a negative control asserting the raw `{descriptor, filipino}` object is refused** — that shape blanked `/parent` while this proof was green at 71/71 (§19f). And the NON-PRINT half of UI-D-1: `GradeValue` emitting no colour, the base colour and every print rule reaching the **built** stylesheet (grepped — a Tailwind variant that generates no CSS fails silently), and the print theme switch restoring light / dark / System including an OS flip mid-print. **It cannot prove the printed layout and says so in its own header** — `@media print` does not apply to an SSR render, so there is no page box, no `@page` and no paper width. **Print is checked on paper** (FRONTEND_CONVENTIONS §18h) |
| `ssr-dv1b-a.jsx` | **83/83** | the fourteen `renderCard` consumers. **Source-text assertions** — it reads files and regexes them; that is what it is, and §17d is why nothing new should be written this way. Was 87; UI-B dropped the two excuse-letter pages, whose cards are modules now and are covered by `ssr-cards.jsx` |
| `ssr-api-base.jsx` | **15/15** (new, feat/lan-web, 2026-10-01; negative controls: two mutant resolvers inside it — the replaced `env || localhost` and one ignoring the env — each caught; and live, the page-derivation branch disabled with Edit → **11/15**, restored → 15/15) | `api/apiBase.js`: `VITE_API_BASE_URL` set → it wins (trimmed); blank → falls through; no env and a `localhost:3000` page → **exactly** `http://localhost:5000/api` (as before); `127.0.0.1`, a LAN IP and an https page each keep their host and protocol on port 5000; no page (Node) or a `file:` page → the old default. The consumers: the axios instance's `baseURL` IS `API_BASE_URL`, the socket origin is it without `/api`, and a rendered `Avatar`'s photo address is built from it. **Prints no base value** — an SSR build reads `client/.env`. A real browser check backs it (CHANGELOG, feat/lan-web): from the laptop's LAN IP every API call went to `<IP>:5000/api`, from localhost to `localhost:5000/api` |
| `ssr-avatar.jsx` | **32/32** (new, feat/profile-photos, 2026-09-30; negative control: the name guard in `format/photoUrl.js` loosened to `/.+/` with Edit → **23/32**, restored → 32/32) | FRONTEND_CONVENTIONS §25: `photoUrl` builds `<origin>/uploads/avatars/<name>` from four base shapes and refuses nine bad values (a path, a login-id-shaped name, a query, upper-case, 31 characters, another extension …); `Avatar` renders `<img alt="" aria-hidden>` for a good name and the initials for none or a bad one — the bad value nowhere in the markup; `size="lg"` without the row size; `PersonCell` and a real `DataTable` card carry `photo` / `avatarPhoto`, with controls that the good name IS in the markup and a card without one shows initials. **Cannot prove** the fallback on a load error — `onError` is an event, and SSR fires none; that is the browser check |
| `ssr-dv1b-b.jsx` | **30/30** | the attendance roster's behaviour, driven directly through `attendance/roster.js`. Was 35; UI-B deleted its five source-text letter assertions for the same reason |

**Not yet proved — feat/ui-refresh (a list, not a plan; each needs its own
dispatch):** SSR renders of Login, Forgot password, About, Settings, `Modal`,
`NotificationBell` and `ClassRecordPage`; a font-loading guard (the four
phone files and the web's Fontsource imports present, the splash's 2.5 s
clock); and the leave-guard sentence's "discards it" / "discards them" —
nothing in `client/scripts/` or `mobile/scripts/` pins that sentence today.

**Device-check gaps — build 2 (the owner's check, 2026-10-08):** two things
the owner could not see on the device and no proof can show, kept here
until they are seen. **The phone's kept rows greying** (DataList, MOBILE
M11): the local network answers inside the 300 ms, so a re-read never
lasted long enough to grey — a slower network (the hotspot at a distance,
or the API under load) is the way to see it. **Tabular figures** (the
phone `Stat`, the web's `tabular-nums`): the seeded data has only
single-digit counts, so a changing width was never on screen — any figure
that crosses 9 → 10 shows it. **The pulse's stop is moot** (F6): the pulse
was replaced by the sweep; the sweep's three passes are the new check.

**Re-check — the build 2 fix round (the owner, 2026-10-09): PASS on the
device, web and phone** — F1 (the compact notice; no jump at desktop width,
at 390px, or on the phone), F2, F3 (the web presets; the phone presets,
including a re-tap after a manual filter change), F4 (the circles, web), F5
(a new page opens at the top; Back restores the scroll), F6 (the sweep,
web), F7 (the Messages focus ring), F8 (no LogBox). **Not device-checked,
kept here until seen:** the kept rows' `inert` (the web's ~2 s throttled
hold was too short to time a click in; the phone's LAN is too fast); the
phone's skeleton circle and sweep (the LAN is too fast); and Messages
opening at the newest message after F5 (the database holds 0 messages; the
smoke gate covers it). **The proof behind the kept rows' `inert`:**
`ssr-skeletons.jsx` renders a kept `DataTable` and asserts its frame carries
`aria-busy="true"` AND `inert`, and that an idle one carries neither
(rendered); `proof-skeletons.mjs` asserts `DataList`'s keep props —
`pointerEvents: 'none'`, `importantForAccessibility: 'no-hide-descendants'`,
`accessibilityElementsHidden` — and that every card sits inside the keep
wrapper, with a negative control (source). The phone has no `inert`;
`pointerEvents: 'none'` is its equivalent. Neither proof can press a row
during a real hold — that stays the device gap above.

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
(`ssr-dates.jsx:111`), so a DEV bundle run without it fires the guard twice
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
five roles × two themes × two widths, 40 URLs, 268 screenshots** (since feat/admin-messages, 2026-10-06: `/admin/messages` joined the admin list, recounted by loading `e2e/pages.js` — **40 UNIQUE URLs**, admin 13, teacher 15, parent 12, and **67 account-URL visits** (13 + 15 + 12 + 15 + 12), 67 × 2 × 2 = **268**. Before that, recounted 2026-09-26: **39 UNIQUE URLs** — admin 12, teacher 15, parent 12, About last in each; the two teacher accounts and the two parent accounts each share their role's list, so the five accounts made **66 account-URL visits** (12 + 15 + 12 + 15 + 12), and 66 × 2 themes × 2 widths = **264** screenshot files; the "61 / 244" that stood here was never a recount)**.** It is not
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
M7). Run from `mobile/`. **Paths in the table:** a short path is under
`mobile/src/screens/` (`attendance/…` and `classRecord/…` under
`screens/teacher/`); `src/…` is `mobile/src/…` and `format/…` is
`mobile/src/format/`.

| Proof | Baseline | What it covers |
|---|---|---|
| `npm run proof:api-unwrap` | **21/21** | `src/api/client.js`'s pure parts: `readBody` (string unwrap, array unwrap copying ONLY the named keys — the `term_averages` lesson — `raw`, and the three refusals naming what was missing and what came back, including a null body), `endsSession` (401 off `/auth/login` only; 403, 503 and no-response never), `logoutReasonFor` (the two human-readable 401s pass through, token-shaped and missing messages become the one sentence), `listParams`, and the socket origin derivation. **Cannot prove:** the interceptors firing, SecureStore — the phone check |
| `npm run proof:auth-failure` | **8/8** | §22 on the mobile copy of `classifyAuthFailure`: 401 → logout; 503, `ERR_NETWORK`, `ECONNABORTED` (the 15 s timeout) → keep; four negative controls (a 401 never "keep", a 403 never a logout, `undefined` and a status-less response keep). **Cannot render `AuthUnavailable`** — its copy is the phone check |
| `npm run proof:routes` | **34/34** (feat/admin-messages, 2026-10-06, +1: `/admin/messages` routes to `AdminMessages`, which joins the known screens; the admin's visible count moves 8 → 9. 33/33 before that, feat/ui-polish: the dashboard assertion TIGHTENED, same count — all three dashboards must skip the mount's focus, admin included; negative control: admin's old one-line `useFocusEffect(reloadAll)` put back → 32/33 naming admin, restored → 33/33. `fix/mobile-popto` P1: +1 — the parent, teacher and admin dashboards each register `useFocusEffect`, and parent and teacher skip the first focus (the mount `useCard` has already fetched); negative control: the parent's `useFocusEffect(` call removed with Edit → 32/33 naming the parent, restored → 33/33. B1: 32, +1 — every `screenLayout={…}` in `mobile/src` names a module-level function whose body calls no hook, because React Navigation CALLS a layout inside the navigator's render and a hook there changes the navigator's hook count on every push / pop; negative control: `screenLayout={ScreenFrame}` put back in `RootNavigator.jsx` with Edit → 31/32 naming it, restored → 32/32. `fix/mobile-popto`: 31, +5 — the real `StackRouter` showing `navigate('Main', …)` from a modal pushing a SECOND drawer, `popTo('Main', …)` keeping one with its original key, `popTo('Login')` from Forgot password keeping one Login, and source scans finding **0** `navigate('Main'` and **0** `navigate('Login'` in `mobile/src`; negative control: one call put back → 30/31 naming the file. 26 on branch 4, both halves: admin shows eight items with Backup & Restore web-only and hidden, every one of the eight built — at the checkpoint the second half's four were asserted unbuilt — `/admin/users` opens itself and `/admin/backups` falls back to the admin home; 21 on branch 3, 15 on branch 2, 13 at its checkpoint) | `navigation/routes.js` against the verbatim `nav.js`: every nav path resolves to a known screen name or to unbuilt, every routed name is one `AppShell` knows, each role's home / Settings / About built, **every parent and every teacher item built (at the branch-3 checkpoint the second half's four were asserted still unbuilt); admin at exactly three**; the parent's five and the teacher's four notification link shapes resolve to their own drawer path; **another role's link opens THIS role's home — the assertion that caught the branch-3 defect: once `/teacher/...` was built, `linkToRoute` handed it to a parent, so a link must now carry the viewer's own role prefix**; a missing or malformed link never throws. **Cannot prove** `AppShell` has a component per name — a missing one renders the row dimmed, by construction |
| `npm run proof:roster` | **11/11** (branch 3) | the verbatim `attendance/roster.js`: the reading order, the three row states (stored vs typed, §5b), **a saved mark is never cleared** (the same object back), an unsaved one is, a different button replaces, `markRestPresent` never overwrites, counts with no rate, `unsavedCount` |
| `npm run proof:back-guard` | **11/11** (branch 3) | the verbatim `classRecord/backGuard.js` through dirty → Back → Stay → Back → Leave, a second `dirty` is `none`, Stay / Leave with no question open do nothing, clean after a save, clean while asking; plus **the phone's action map** (`push` / `back` do nothing, `ask` is the prompt, `usePreventRemove` armed exactly while `armed`) |
| `npm run proof:admin-dashboard` | **15/15** (the build 2 fix round, 2026-10-08, same count: two labels say "Users"; the presets are proved in `proof:build2-fixes`. Build 2 commit 2, 2026-10-07, +4: the People card's `countRows` — Students, Teachers, Parents in the web's order and words; Students → Students, Teachers and Parents → Users; the server's totals as text with the web's captions; a missing or unreadable total reads 0. One label reworded in place: "five cards" → every link. 11/11 before that — branch 4; +1 `feat/ui-polish` f2, `pendingLead`) | `admin/dashboard/logic.js` with the clock PINNED: the backup card by calendar day in Manila (none → amber "No backup yet"; 23:00 read at 01:00 is "yesterday"; seven days green; eight amber; an unreadable stamp amber, never red), every link an admin route and none the web-only Backup & Restore, the lockout hazard only on the server's `true`, the waiting card's tone, and since build 2 the People card's three counts (`countRows`) |
| `npm run proof:admin-users` | **15/15** (feat/ui-polish, +1: `teacherCreatedNotice` names the server-returned login id and still reads without one. 14 on branch 4; the plan said 12) | `admin/users/logic.js`: the login-id mask (a parent's last four, a short one hidden, staff whole — §5c), filter params and the two empty branches, the row's actions (your own active account: no Reset, no Deactivate, the note; the toggle only between active and inactive), create teacher in the web's order (required, password, contact; blank optionals left out), the review's refusal and words |
| `npm run proof:admin-posts` | **12/12** (branch 4; the plan said 10) | `admin/posts/logic.js`: school-wide / one grade / one class bodies with BOTH target keys on every write, null when absent — a leftover section is not sent for a whole-grade post (the PUT-keeps-old-value trap); refusals in the web's order; a memo has no audience keys; edit only your own announcement; the delete sentence naming a teacher poster who is not told, and the memo's; a row read back into its audience; filter params |
| `npm run proof:school-settings` | **6/6** (branch 4) | `settings/schoolSettings.js`: the school year never in the form, a null stored value is an empty field, an untouched form sends nothing, one changed key trimmed and nothing else, trailing spaces are no change, name and address may not be emptied |
| `npm run proof:one-slot` | **13/13** (branch 3) | the verbatim `classRecord/buildPayload.js` with one-slot drafts: HPS only (one slot by type + number, no entries), a score into a column made in the same save (type + slot_no; **only the learner typed into gets an entry**; 22/20 sent as typed), an existing column by `slot_id`, typed back to stored is `null`, a cleared cell is an explicit null, a rename, invalid keystrokes and a locked learner never sent, a Summative part with its class-wide maximum |
| `npm run proof:teacher-dashboard` | **24/24** (branch 3 checkpoint; +4 `feat/ui-polish` f2, the lead lines) | `teacher/dashboard/logic.js`: `bannerFor` (not recorded / "1 of 2 recorded" with Late counted present / green only at full coverage / a roster count of 0 never claims partial), `advisedSections` (`Number()` on both ids); the verbatim `sectionOptions` (bare name as value, grade in the label, hidden at one option, TCH-002's section from the loaded rows alone), `isDirty` (trailing space, a changed status, `6` vs `'6'`), `staffAudienceLabel` (class, whole-grade event, School-wide); the three verbatim teacher cards, loaded as `data:` modules because Node will not load `.jsx`: **the letter card's three tap outcomes** (Pending + adviser opens, Pending + not adviser is static, Declined opens the reading view), the content cards carry `actions` with no `onSelect`, and a 07:00 PH post is dated in Manila |
| `npm run proof:parent-dashboard` | **28/28** (branch 2; +7 `feat/ui-polish` f2, the lead lines — negative control 27/28; two assertions rewritten, count unchanged, when the phone began following the web parent dashboard, 2026-09-30 — each helper broken → 27/28) | `parent/dashboard/logic.js`: `recordedDays` (null at total 0, Late counts present, string counts coerce), `weekStrip` (seven days; recorded / weekend / unrecorded, a recorded Saturday is recorded), `letterTerm` (pills + the missing count, null when none), `heroGrades` (the current term's average and its band word as a STRING, never the object, never `remarks`, **negative control: an object is refused**), the three labels; the lead helpers — `gradesLead` is the web's one line ("1 of 8 subjects recorded · Term 2") or the average, `letterLead` the badge's status and absence date or null, `attendanceLead`, `unreadLead`, `postsLead`, `nextEventLead` |
| `npm run proof:report-card` | **21/21** (branch 2) | `parent/reportCard/logic.js` + `format/gradeText.js`: `termStatuses` full / partial / none, `statusLine` and its missing list, `initialSegment`, `joinTerms` three shapes, the Final cell as letter / number by mode, no General Average in descriptive mode; `gradeText` two decimals, `whole` as `String(Number(x))`, Pending vs N/A by mode, **a letter through the number path is a null (why TermValue exists)**, a real 0 is "0.00"; the reading-note lines; score pairs |
| `npm run proof:drawer` | **66/66** (feat/admin-messages, 2026-10-06, same count: the admin's expected Communicate group is now Announcements + Messages. fix/leave-guard, 2026-10-01, +6 — **SOURCE TEXT, said plainly**: `DrawerContent.jsx` read as a file — it imports `requestLeave`, a drawer item goes through `openItem` → `requestLeave`, the account card and Logout through `requestLeave`, no exit calls `logout` or `navigate` directly; **negative control inside it: the pre-fix wiring is caught**. 60 on the fix round, +15 — 58/60 on the unfixed 6980e06 drawer, the two card-width checks red; 45/45 new on `feat/nav-drawer-groups`, 2026-09-30; four negative controls inside it) | **Fix round:** the card fed the real 22-key `/auth/me` user the phone stores (keys captured from the running API, values made up) — both lines for parent, teacher and admin, a nameless parent shows no name and never the LRN; then the card's `style` expression read out of `DrawerContent.jsx`, evaluated and rendered through the REAL `react-native-css-interop` runtime (`react-native` stubbed, a minimal React hook dispatcher) must arrive with `flex: 1` and `minWidth: 0`, and no drawer `Pressable` may take a style FUNCTION (the interop spreads it to `{}`); **negative control: 6980e06's card, verbatim, fails both**. Originally: | the verbatim `navigation/navGroups.js` against `nav.js` and `routes.js`, plus `navigation/drawerFold.js` (M20): per role, every phone item placed exactly once, Dashboard on top, Settings then About at the bottom, the groups' labels, order and items equal the web's, no unlabelled group; admin's System group and `/admin/backups` absent on the phone, with a control that the same file still groups them for the web list; an unnamed item lands in an unlabelled, never-folded group — **negative control: a grouping that drops it fails the placed-once check**; `pp.navGroups` parsing (bad JSON, an array, `null`, non-string labels), toggle, per-role independence, the active group open even when folded and deciding it writes nothing; the card lines — a parent's is "Parent" alone and a nameless parent shows no name, never the login id — **negative control: a card that fell back to the login id is caught by the same check**; staff role · login id. **Cannot prove:** the look, the tap, the fold surviving a cold boot — the phone check |
| `npm run proof:photo-url` | **26/26** (new, feat/profile-photos, 2026-09-30; two negative controls inside it) | MOBILE_CONVENTIONS M21: the verbatim `format/photoUrl.js` against the phone's own `API_BASE_URL` — the address, a hotspot LAN base, a trailing slash, eight refusals (a path, a login-id-shaped name, a fragment …) and no base; **no camera call anywhere in `mobile/src`** (every `.js`/`.jsx` scanned) — **negative control: a camera call IS caught**; the library call is images-only with a 1:1 crop; the uploaded part's name is a fixed `photo.*` word — **negative control: a name built from the account or the picked file is caught**; which avatars carry a photo (the drawer card, `RecordCard`, Account information, both Messages lists, both admin Users lists) and that the learner cards never do. **Cannot prove:** a photo drawing, the picker, the upload over the hotspot, the fallback on a load error — the phone |
| `npm run proof:leave-guard` | **19/19** (new, fix/leave-guard, 2026-10-01; two negative controls, each with Edit and restored: `requestLeave` made to always proceed in the phone copy → **15/19**; the screen's `proceed()` moved before `setMarks(` → **18/19**) | MOBILE_CONVENTIONS M14: the mirrored `navigation/leaveGuard.js` driven as the phone's exits use it — on a clean screen a drawer item, the account card, the bell and Logout each proceed once; on the focused, dirty Attendance screen a drawer item asks, Stay runs nothing, Leave runs it once and **the marks are reset BEFORE the exit**, a second Leave does not run it twice, the release clears it; `requestLeave(logout)` asks and only Leave logs out. Then **SOURCE TEXT, said plainly** — `AttendanceScreen.jsx` read as a file: the title "Leave without saving?", it registers only while FOCUSED and dirty (`useFocusEffect`), `setLeaveGuard(ask)`, Leave and discard calls `setMarks(` before `proceed()`, hardware Back asks then goes back, an open drawer is left to close itself. **Cannot prove** the Alert or the press — the phone |
| `npm run proof:message-toast` | **40/40** (feat/admin-messages, 2026-10-06, same count: the disabled-host check relabelled "a role with no Messages screen" — none since the admin's landed. Silent-mode gate B9, 2026-10-02, +11 — no tone while the audio mode is pending and the vibration not waiting, the tone once it resolves, one mode call for many alerts, a rejected mode reported and retried once by the next alert, a mode that keeps failing tried twice and never a third time with every alert still vibrating, a throwing mode / report / player never throwing or rejecting, no unhandled rejection, the source's ONE module-level gate and one `console.warn` inside `if (__DEV__)`; negative controls with Edit, each restored: the `await` in `createGatedPlay` removed → **38/40**; the retry removed → **38/40**. 29/29 on the tone change, +2 — the WAV is 400 ms / 8 820 samples / 17 684 bytes, its loudest sample 0.2171 ≤ 0.44 with no clipping, the TONE values, and its bytes against what the script builds from TONE; negative control with Edit, restored, no regeneration: one voice's peak changed in the phone `TONE` → **27/29**. 27/27 on the fix round, +16 — the tone and vibration, the WAV, the audio mode, `app.json` without the expo-audio plugin; negative controls with Edit, each restored: the `try/catch` around the tone removed → **26/27**; the plugin added to `app.json` → **26/27**. New at 11/11 on feat/message-toast; negative control then: the route walk stopped at the top-level route → **9/11**) | MOBILE_CONVENTIONS M22: the mirrored `realtime/messageToast.js` — `otherIdFromRoute` on the real nested shape (root stack → `Home` → AppShell's stack → the drawer or `MessageThread { otherId }`): the focused thread is the other person, the Messages list and a thread lower in the stack are not, no state is null; the decisions through the mirror — the words, never my own, never in the focused thread, the server's count for the same person, another person replaces, no body though every row carries one. **Fix round:** `realtime/toastAlert.js` with fake play and vibrate — one tone and one 150 ms vibration on a show, a same-sender update and a replace, neither for my own message, the open conversation or admin, a failing tone still vibrating with the toast shown; the WAV (`assets/sounds/message-tone.wav`) is RIFF/WAVE mono 16-bit 22 050 Hz, **15 920 bytes** (360 ms, 7 938 samples, loudest 0.2156 ≤ 0.26, no clipping — "two-note rise" since feat/ui-refresh; `proof-message-toast.mjs:223–242`), byte for byte what `make-message-tone.mjs` builds from the mirrored `TONE`; **source text**: expo-audio's `useAudioPlayer`, the local asset import and no URL, `setAudioModeAsync` with `interruptionMode: 'duckOthers'` and no deprecated `interruptionModeAndroid`; and `app.json` has no expo-audio plugin. **Cannot prove** the toast on screen, the timer, the sound, the vibration, the announcement or View — the phone |
| `npm run proof:look-fixes` | **51/51** (feat/admin-messages, 2026-10-06, +8: AppShell's `AdminMessages: MessagesScreen`; the picker's one Teachers group, "Teacher name" and both roles' empty copy; "Announce to a class" only for a teacher on a parent's thread, with a negative control that gates it on the role alone. 43/43 before that, build 1 follow-up, 2026-10-05, +6: admin Grades never restarts a load in flight — the pull re-reads only a failed learner list, the report's same-learner guard, the error path, the reconnect re-read — and the mechanism as a model with a NEGATIVE CONTROL (pulls that restart every 5 s never settle); the learner and sections Retry assertions follow `retryStudents` / `retrySections`. 37/37 on the build 1 fix round, 2026-10-05, +8: C1 through `readingNoteLines`, C2's text, the thread's send REF guard and its negative control, the admin Grades sections Retry and its pull / refocus re-read, the mirrored tickets and their use in `UnreadProvider`. 29/29 new, feat/look-fixes, 2026-10-05; negative control with Edit, restored: the Apply Pressable's `key` removed → **28/29**) | MOBILE_CONVENTIONS M23 and the build-1 fixes: the pure `navigation/drawerOpen.js` on the nested state React Navigation builds (no drawer entry closed, an open entry open, the newest entry winning, the navigator default, a screen pushed over Main not counting, no state never throwing) and `buttonStyles()` (every variant `rounded-lg` with a 1dp border in its colour, ghost transparent, heights 48 / 44 / 52dp unchanged, `cardClass` `rounded-xl`). **Source text, said plainly:** the toast renders nothing while the drawer is open and its 5 s timer is unchanged; Apply is keyed by its state; `DataList` is one FlatList with the states as its empty content and an error with rows in the footer; Users' pending empty state not over a failed read and its one-page-at-a-time "Show more"; Attendance's stacked From / To and "N of T records"; Students without the second title; Announcements clearing rows on a switch; admin Grades' descriptive Final, hidden General Average and the learner list's retry; Login's Next; StatusBadge, Segmented and FormField's corners. **Cannot prove** the toast hidden on the device, the Apply label in Dark, Search keeping focus, Next moving the caret — the phone |
| `npm run proof:form-drafts` | **40/40** (build 1 follow-up, 2026-10-05, +4: the phone hook's blank rule held byte-equal to the web's, its flush and its restore read as source, the storage alone keeping blank lines as the NEGATIVE CONTROL. 36/36 new, feat/form-drafts, 2026-10-04; negative control with Edit, restored: `clearAll` narrowed to `pp.draft.v1.` keys in `deviceDrafts.js` → **35/36**) | MOBILE_CONVENTIONS M25: the mirrored `drafts/draftCore.js` (the key, and a login id, an LRN-shaped or a name context THROWING) and the pure `drafts/deviceDrafts.js` over a FAKE AsyncStorage — save, a password and an LRN field dropped, restore, **no `open` flag on the phone**, emptied back to the opening values removed, Discard / submit removing it, other keys untouched; an edit draft keeping its base and `itemChangedSince`; the size limit (a 10 000-character memo kept, above 32 000 not written and the older one removed); another version / form / a field outside the list read as none; user 7 reading only their own draft; `clearAll` removing every `pp.draft.*` key (every account, an older version) and leaving `pp.theme` / `pp.navGroups`; a rejecting storage keeping nothing and throwing nothing; the phone copy. Then **SOURCE TEXT, said plainly**: `DraftNotice.jsx` shows the phone notices and never the tab ones, and Discard asks with an `Alert` whose destructive button alone discards; `AuthContext.logout()` awaits `deviceDrafts.clearAll()` and nothing else there clears; `api/client.js` (the 401) never touches a draft; the four compose screens say Close, never Cancel, and remove their draft only through `draft.submitted(`; Announcement compose clears `thread-<fromThread>` after a post; the thread passes `fromThread: otherId` and writes nothing while blocked. **Cannot prove** the debounce, AppState, a killed app or the Alerts — the phone |
| `npm run proof:build2-fixes` | **34/34** (new, the build 2 fix round, 2026-10-08; negative control inside it: the code the owner's phone ran — `Lines` keyed by width over the System widths that repeat `w-1/2` — is RED, two siblings with one key) | The owner's device-check findings on the phone, MOBILE_CONVENTIONS M11 / M23: **F1** `hazardSlot` driven — the notice on the server's flag (which always wins), the held space while loading with the email unconfirmed, nothing when the email is confirmed or there is no hazard — and, source, the held notice being the same notice at opacity 0, untouchable and hidden from the screen reader, the explanation behind "Why this matters" with `expanded`, "Confirm your email" one tap away; **F2** "Users" (source); **F3** `countRows`' presets (Students none, Teachers role teacher any status, Parents parent + active — the server's WHEREs) and `presetFilters` (only a role and a status Users offers, never a search), and, source, the press carrying the preset with the moment of the press as its key and Users taking a NEW preset during render into the draft AND the applied filters; **F4** DataList's 38dp circle behind `skeletonAvatar` and its three screens (source); **F6** the sweep in `Skeleton.jsx` (source): react-native-svg's gradient (no new package), each bar's slice of one band through `measureLayout` and `Animated.subtract`, clipped to the bar, three passes of 1.5 s on the native driver, none without motion, the band from the theme's tokens with no colour literal; **F8** every skeleton list in the Card and DataList keyed by position, with the negative control above. **Cannot prove** the jump on a real load, the sweep moving, a real tap into Users, LogBox staying quiet — the phone |
| `npm run proof:skeletons` | **34/34** (the build 2 fix round, 2026-10-08, five checks changed in place, same count: the sweep's `sweeping`, `PASSES = 3` and the region's opacity line, the hidden-shapes props now on two lines, and `ListSkeleton`'s new `avatar` prop. New on build 2 commit 1, `feat/dashboards-look`, 2026-10-07; commit 2 widened one check in place, same count — the Card's skeleton shapes are five with the admin's `counts`; negative controls inside it: the old one-flag card view, and DataList's wrapper without the keep props) | MOBILE_CONVENTIONS M11 / M23: the mirrored `hooks/useSkeleton.js` (`skeletonPhase` — nothing under 300 ms, no minimum) and useCard's pure `startRead` / `cardView` (a re-read keeps the answer as `refreshing`, a new query never shows the old one, Retry after an error is `loading`). **Source text, said plainly:** `Skeleton.jsx` — a `progressbar` with the spinner's label, the shapes hidden from the screen reader and at opacity 0 during the wait, the motion only when it is allowed (unknown means no) — the sweep, three passes, since the fix round; a pulse twice before — on the native driver, the `edge` fill; `DataList` — the skeleton only with nothing on screen, rows kept while loading, every card and the footer inside the keep wrapper (no touches, hidden from the screen reader, greyed after 300 ms), the header never made inert, `extraData`; the Card's skeleton shapes and its re-read's no-touch busy content; all three dashboards' `refreshing={pulled && rereading}` with a quiet focus re-read; the teacher banners' `refresh: tick`; the report card's skeleton without a general-average box on Key Stage 1. **Cannot prove** the 300 ms, the pulse, the fill, TalkBack or a real pull — the phone |
| `npm run proof:attendance` | **15/15** (branch 2) | `parent/attendance/logic.js`: `recordedDays`, `monthsCovered` including an empty month, `yearRows` buckets (Late → present, Excused → absent) and `yearTotals`, `letterByDate` (latest `created_at` wins), `alsoRecorded` (this month's weekend rows only, sorted), `dayLabel` ("not recorded" never reads as absent) |

**Proofs that import the app's modules register a Node resolve hook** (from
a `data:` URL, inside the proof) that appends `.js` to a relative,
extensionless specifier — Metro resolves `'../format/date'`, Node's ESM
loader does not. MOBILE_CONVENTIONS M12.

All twenty-two proofs (and `lint:mirrors`) run with `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`: the modules
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

**Since feat/ui-refresh the export also checks the assets:** run it with
`--dump-assetmap`, and `dist/assetmap.json` must list `message-tone` and the
four font files — `Merriweather_700Bold`, `SourceSans3_400Regular`,
`SourceSans3_600SemiBold`, `SourceSans3_700Bold` (MOBILE M7, M23). The file
is one line, so check presence per name with `grep -c -F`. The DEV strings
used on this branch: "Connection check (dev)", "Read from EXPO_PUBLIC_API_URL
at bundle time", "Socket origin" (0 files); the controls: "Leave without
saving?", "Posted announcements" (1 file each).

### Lint baselines (mobile)

Five figures, one set, run from `mobile/` AFTER the last file is written:

| Command | Baseline | Note |
|---|---|---|
| `npm run lint` (oxlint 1.85) | **0 errors, 46 warnings** (branch 4: +1 `set-state-in-effect`, admin Grades clearing its learner list when the section changes — the web page's own effect; 45 at its checkpoint and on branch 3 after F1 — Attendance records moved its load from `useEffect` to `useFocusEffect`, which the rule does not flag; 46 before it, 39 at its checkpoint, 28 on branch 2, 18 at its checkpoint, 8 at the scaffold) | 19 × `react(only-export-components)` for the same structural reason the web accepts (hooks, builders, `badgeFor`, the audience labels beside their components; **branch 3: +2 `DateField`'s `dateFromParts` / `dateToLocal`, +1 `ReportCardView`'s `REPORT_UNWRAP`**), 27 × `react(set-state-in-effect)` — every screen's `load()` on mount and the providers' `refresh()` on mount, the web's own shape under a rule oxlint 1.79 on the web does not have (**branch 3: +9 at the checkpoint, +6 in the second half — the two attendance screens, the class summary, its learner, the slot hook's load and preview reset — and parent Grades moved its one to a new line**). One `react-hooks(exhaustive-deps)` in the slot list was a real new-array-per-render and was fixed, not stated. **Stated, never absorbed.** |
| `no-undef` (inside oxlint) | **0** | `__DEV__` and `process` as globals; `scripts/**`, the config files and the generated `src/theme/tokens.js` (CommonJS by design) under `env.node` |
| `npm run lint:mirrors` | **29 identical, and the calendar equals the server's by value** (build 2, `feat/dashboards-look`, 2026-10-07, +1 `hooks/useSkeleton.js`; 28 on the build 1 fix round, 2026-10-05, +1 `api/tickets.js`; 27 on `feat/form-drafts`, +1 `drafts/draftCore.js`; 26 on `feat/message-toast`, +1 `realtime/messageToast.js`; 25 on `fix/leave-guard`, +1 `layout/leaveGuard.js` → `navigation/leaveGuard.js`; 24 on `feat/profile-photos`, +1 `format/photoUrl.js`; 23 on `feat/nav-drawer-groups`, +1 `navigation/navGroups.js`; 22 on branch 3; 19 at its checkpoint — the second half added `attendance/roster`, `classRecord/buildPayload`, `classRecord/backGuard`; the plan said 21 and missed `lrnRule`; 12 on branch 2, 7 at its checkpoint, 6 at the scaffold) | `scripts/check-mirrors.mjs` — every copied module byte-equal to its `client/src` source: `extractError`, `authFailure`, `roles`, `nav`, `passwordRule`, `contactRule`, `settings/tabs`, `date`, `schoolCalendar`, `scorePair`, `dashboards/useCard`, `parent/excuseLetters/card`, and on branch 3 `teacher/students/sectionOptions`, `components/filterState`, `format/audience`, `format/lrnRule`, and the three teacher cards (`excuseLetters`, `announcements`, `events`), `attendance/roster`, `classRecord/buildPayload` and `classRecord/backGuard`, and since `feat/nav-drawer-groups` `layout/navGroups.js`, since `feat/profile-photos` `format/photoUrl.js`, since `fix/leave-guard` `layout/leaveGuard.js`, since `feat/message-toast` `realtime/messageToast.js`, since `feat/form-drafts` `drafts/draftCore.js`, since build 2 `hooks/useSkeleton.js`; plus `SCHOOL_YEAR`, the class dates and the `TERMS` table compared by value against `server/utils/schoolCalendar.js` (the three-way copy) |
| `npm run lint:tokens` | **71 tokens × 2 themes, both files match** | `scripts/check-tokens.mjs` — `src/theme/tokens.js` and `global.css` regenerate equal from `client/src/index.css` |
| `npm run lint:colors` | **0** | the web's token lint plus a hex / rgb / hsl literal rule outside `theme/tokens.js` |

## The source-zip proof — `scripts/`, the repository root

`node scripts/proof-source-zip.mjs`, from the repository root — plain Node,
no `npm` script (the root has no `package.json`), no database, no server.
**24/24** (new, fix/source-zip, 2026-10-06). It proves
`scripts/create-backup-zip.js` against a THROWAWAY git repository it builds
in a temp folder (paths with spaces), through `SOURCE_ZIP_ROOT` /
`SOURCE_ZIP_OUT_DIR`, reading each zip's central directory itself; it writes
nothing outside that folder and removes it. It shows: only the allowed
top-level entries under `Parents_Portal/` (README.md, .gitignore, client,
database, docs, mobile, scripts, server), each of them present; a tracked
file outside the list left out; no `.env` (a `.env.example` template kept),
no `node_modules`, nothing untracked; the name
`Parents_Portal_source_<local date>_<short sha>.zip`; REFUSAL when that file
exists (the old one untouched), on an unstaged and on a staged change to a
tracked file, and on a tracked `.env`; only a WARNING for an untracked file.
**Three negative controls**: a whole-repository zip fails the top-level
check, the `.env` check catches a force-tracked `.env`, the `node_modules`
check catches a `node_modules` path. It then READS the real repository with
`git ls-files` (464 tracked files under the allowed paths at `2f2dbb7`; no
`node_modules`, no `.env`, 4 `.env.example` templates) — it never runs the
script on it: the owner makes the first real zip. **No lint covers the root
`scripts/`** (each package's oxlint runs inside its own folder);
`node --check scripts/create-backup-zip.js` is the syntax check.

## Lint baselines

Every client dispatch reports all four. **They are one set: three of them
being zero says nothing about the fourth**, which is why they are listed
together rather than remembered separately.

| Command | Baseline | Note |
|---|---|---|
| `npm run lint` (oxlint) | **41 warnings, 0 errors** (feat/look-fixes, 2026-10-05: −2, both `react(set-state-in-effect)` on the two web thread pages' `useEffect(() => load())` — `load()` still sets state there, but its first `setLoading` now takes a value computed from refs instead of `true`, and the rule no longer reports it; no warning was added) | Was 43; 44 before that; **41** briefly after CR2 deleted `teacher/GradesPage.jsx`, then 43 as pages were added back. A new advisory is **stated in the report, never absorbed into the total.** |
| `no-undef` (inside oxlint) | **0** | Enabled 2026-09-22. Needs `env.browser` plus an `overrides` giving `scripts/**` `env.node`, or it reports 52 globals and no real bugs. |
| `npm run lint:tokens` | **0** | `client/scripts/check-color-tokens.mjs` — §8. |
| `npm run lint:contrast` | **0 unwaived** | **75 pairs** × 2 themes, **9 waived** (74 until `feat/ui-polish` UI-5, 2026-09-30, added `brand`/`page` as `ui` — the dashboard card's focus outline; UI-D-3 on 2026-09-25 added the three badge-on-`brand-panel` boundaries and the hero's muted foreground). A waiver needs an allow-list entry whose marker sits on a `docs/KNOWN_ISSUES.md` row. **A `boundary` pair never fails** — threshold 0, reported only — so it is a way of making a separation visible to review, not of enforcing one; the dark badge pair reports ~1.0 and is an accepted decision, not a waiver. |

**Run them AFTER the last file of the dispatch is written, and say in the
report WHEN they ran** — not only that they passed. DV1b-a ran oxlint before
writing its proof script and never again, reported "43 unchanged", and left
two `no-undef` errors on `main` for a dispatch. `docs/FRONTEND_CONVENTIONS.md`
§17a.

**A build's exit code is part of the result.** A failed build can leave the
PREVIOUS bundle in place, so a proof harness can report success for code that
no longer compiles — §13f.
