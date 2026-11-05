# CAPSTONE — Parent's Portal System

> **A state-only snapshot of CLAUDE.md, for switching tools.** CLAUDE.md is
> authoritative; if the two disagree, CLAUDE.md wins and this file is wrong.
> **This file carries no history.** What happened and when is in
> `docs/CHANGELOG.md`, newest first. The narrative this file used to
> accumulate is verbatim in `docs/ARCHIVE.md` → "docs/PROJECT_PROGRESS.md as
> it stood until 2026-09-26". Refresh the snapshot at the end of a session;
> never append to it.

**Captain H. Francisco Elementary School – Main (Grades 1–6)** · Pateros
Technological College, IICT · Final defense expected around November 2026.

**Snapshot, 2026-11-05: the VPS runs `main` `3d2e7bb` (M18, deployed 2026-11-05
20:13: `JWT_SECRET` rotated in place, one `pm2 reload`; the laptop has its own value),
and the D-122 reset ran on production on 2026-11-03 at 22:20**
(`docs/ACTIVITY_RESET.md` → The run). Backup H, `parents_portal_2026-11-03_222242.zip`,
is the restore point: restore only H. Its hash is checked and its Drive copy made.
`https://chfes-main-parents-portal.online` serves beside
`https://srv2110222.hstgr.cloud`, and the phone uses the domain since 2026-11-05
15:37 (D-246). The Nov 4 school demo is done (2026-11-04); its writes stay on
production until the demo undo (`docs/KNOWN_ISSUES.md`). The SMSGate pair is not
rotated. `main` adds after `3d2e7bb` docs only.

**Previous snapshot, 2026-11-03: the VPS ran `main` `68b5ce9`; Module 13's sitting
was done and Module 14 deployed, its check on production passed.** `portal_app`,
`portal_migrate`, `SMTP_PASS` and the SMS
passphrase are rotated, and `CORS_ORIGIN` lists `srv2110222` and the domain.
`SMS_GATEWAY_USER` and `SMS_GATEWAY_PASS` stay as they are; `JWT_SECRET` is rotated by M18, after
Nov 4 (`docs/KNOWN_ISSUES.md`). Users 2, 3, 4, 5, 6, 7 and 647 hold temporary
passwords, and user 3 is kept for the Nov 4 first sign-in. Backup F,
`parents_portal_2026-11-03_044104.zip`, was the restore point until the reset; no
older backup may be restored. Both the Data Privacy Notice and the Terms of Use are
version 1.0, on no screen, so every account accepts once at its next sign-in. The
phone stays on `https://srv2110222.hstgr.cloud` until after Nov 4.

**Previous snapshot, 2026-11-03: `main` was at `4463a52`, with Module 13's two tools
merged.** Module 14 (the DO 72 sentence and F2) is on `feat/m14-do72-f2`, gated on
loopback, not merged and not deployed. Both the Data Privacy Notice and the Terms
of Use are version 1.0 there, on no screen, so every account accepts once at its
next sign-in after that deploy. A subject name that repeats in a teacher's Grades
list carries its grade, web and phone. The deploy order is Module 13's sitting,
then Module 14, then the owner's check. The phone stays on
`https://srv2110222.hstgr.cloud` until after Nov 4.

**Previous snapshot, 2026-11-03: `main` and the VPS were at `92970c4`.** The running API was
Module 10's code and the client build is Module 11's; only scripts and docs came
after. `https://chfes-main-parents-portal.online` serves beside
`https://srv2110222.hstgr.cloud`, and the phone stays on the second until after
Nov 4. Module 13's two tools are on `ops/m13-rotation`, gated on loopback and not
merged. No credential has been rotated yet, and `CORS_ORIGIN` does not list the
domain yet: both are the owner's sitting.

**Previous snapshot, 2026-11-02: Module 11 is merged to `main`.** Admin → Assignments &
advisers (web only) writes `teacher_assignments` and `sections.adviser_id`
through the existing endpoints; no route, schema or migration changed. It was
gated on `c1ad541` and the owner's check passed all 30 rows. It is not yet on the
VPS: the deploy steps are on its `docs/CHANGELOG.md` row. No live database was
touched.

**Previous snapshot, 2026-10-28 (history): `main` at the start of that docs pass was `8a90789`.**
The app runs on PostgreSQL (schema `portal`, Supabase, 26 tables). MySQL
`parents_portal` is the disconnected fallback. D-168/D-170 are done: the
policy version is not shown; `versions.json` stays `draft-2`; nobody
re-accepts. Ahead: hosting on Friday 2026-10-30, then the D-122 activity-log
reset after a backup through the app. D-169 is after Friday and before
2026-11-04. Learner transfer stays on hold (D-160). No suite was re-run
for this snapshot.

**Previous snapshot, 2026-10-25 (history): `main` was the post-merge docs of `3d1521b` —
`feat/privacy-text` merged fast-forward from `6beae15` by the ref move (five
commits: the texts `c3d2330`, the docs `68b2137`, the gate `a613e1a`, the
merge-ready docs `b9a28d4`, the withdrawn finding `3d1521b`): the owner's
draft-2 Data Privacy Notice and Terms of Use, both versions `draft-2`, so
every account accepts them once after the restart; gated after backup 383,
device-checked 2026-10-25 on the web (`docs/PRIVACY_TEXT_DEVICE_CHECK.md`
§5), cleaned up by id after backup 389. Before it, `6beae15`, the post-merge
docs of `5eb2127` — `feat/sms-e2e-code-purge` merged fast-forward from
`5426b70` by the ref move (four commits: P-19 `e8236ac`, the SMS end-to-end
encryption `fe53aad`, the gate `82b8cf8`, the device check and the probe's
fix round `5eb2127`): a code row older than 24 hours goes with the next code,
and every text and number is encrypted before it leaves the server; gated
after backup 377, device-checked 2026-10-25 (`encryption: on`, a real code
arrived in plain words), cleaned up by id after backup 382. Before it,
`5426b70`, the post-merge docs of
`4b8be36` — B7 `chore/pre-migration` merged fast-forward from `01495e5` by the ref move (eight
commits: the docs pass `50ab559`, the probe's exit fix `ff426bb`, D-102
`bff57b6`, the seed fix `a882711`, the gate `7c3f558`, the run sheet
`6611af3`, finding #1's fix `415064c`, the merge-ready docs `4b8be36`): the
docs before the migration and D-102's demo data, gated after backup 370,
device-checked 2026-10-24 on the web — §1–§2, one finding fixed and
re-checked — nothing to clean up, and the new restore point, backup 376.
Before it, `01495e5`, the post-merge docs of `f4cc8c4` —
`feat/activity-log` (B2) merged fast-forward from `9c2c34b` (five commits:
trim-11 `00235a0`, the three writers' ids `04258c8`, the build `d516c61`, the
gate `774b98c`, the merge-ready docs `f4cc8c4`): Admin → Activity log, gated
after backup 363, device-checked 2026-10-24 on the web — §1–§5, no findings —
and cleaned up by id after backup 369. Before it, `9c2c34b`, the post-merge
docs of `47be373` — `feat/excuse-attendance` (B8) merged fast-forward from
`613c73e` (three commits: B8 `b4c8e11`, the class-day fix `7c24e5c`, the
merge-ready docs `47be373`): an excuse decision sets that day's attendance,
device-checked 2026-10-23 — §1–§3, no findings — and cleaned up by id after
backup 362. Before it, `613c73e`, the post-merge docs of
`96a1776` —
`fix/f3-badges` (B3) merged fast-forward from `1b43150` (four commits: B3
`b9268e2`, the fix round `c248c51` + `ce9f111`, the merge-ready docs
`96a1776`): a visit clears a badge's information rows (the smoke gate's F3),
device-checked 2026-10-22/23 — §1–§5, one finding fixed and re-checked — and
cleaned up by id after backup 354; the restore point is backup 376 since B7
(317 the previous one).
Before it on `main`: `feat/grade-acknowledgement` (B1, `6c39f9c`,
2026-10-22 — device-checked, one finding fixed in `2525215`, cleaned up after
backup 346; its post-merge docs `1b43150`), `feat/password-alert` (`2b85331`, 2026-10-21, with B5
`feat/account-create` `1e43b6a` — account creation and the password alert,
device-checked together, Sections 1–10, no findings, cleaned up after backup
338; its post-merge docs `f9b3a68`), `feat/first-signin` (`9d3b430`,
2026-10-21 — device-checked 2026-10-20/21, cleaned up after backup 324),
trim-9 (`bba67bd`), the grade locks and
the smoke gate's F4–F7 (2026-10-13), the web load races (2026-10-12),
skeleton tier 2, staff acceptance, the socket handshake, skeleton option 1,
shared Messages and privacy.
Table and endpoint
counts: CLAUDE.md front
matter, their one home. Suite, proof and lint baselines: `docs/TESTING.md`,
and only there.

---

## Where the build is

| Stage | Backend | Web | Mobile |
|---|---|---|---|
| 1 — Foundation: schema, seed, auth API, auth tests | ✅ | — | — |
| 2 — Auth frontend: login, `ProtectedRoute`, three dashboards | — | ✅ | — |
| 3 — Backend modules, all ten (Contributions removed 2026-09-13) | ✅ | — | — |
| 4 — Web pages, all three roles | — | ✅ closed 2026-09-14 | — |
| After Stage 4 — hardening, notifications, recovery, dashboards, data views, grades track, pre-Stage-5, polish, smoke gate | ✅ | ✅ closed 2026-09-26 | — |
| 5 — Mobile (Expo) | — | — | ✅ every role's screens (three admin pages web only by design: Backup & Restore, the Activity log, Assignments & advisers) |
| During Stage 5 — SMS reset codes, server reliability, UI polish (merged 2026-09-29 → 09-30) | ✅ | ✅ | ✅ |
| After Stage 5 — docs pass, drawer groups, profile photos, the web on a phone's Chrome, palette C, the leave guard (merged 2026-09-30 → 10-01); the message toast (merged 2026-10-02) | ✅ | ✅ | ✅ |
| The UI refresh — `feat/ui-refresh` (built 2026-10-03, fix rounds and device checks 2026-10-04) | — | ✅ merged 2026-10-04 | ✅ merged 2026-10-04 |
| Form drafts, Phase 1 — `feat/form-drafts` (built and device-checked 2026-10-04) | — | ✅ merged 2026-10-05 | ✅ merged 2026-10-05 |
| Build 1 — `feat/look-fixes`: the flagged screens, the button and chip shapes, four small fixes (built and device-checked 2026-10-05) | — | ✅ merged 2026-10-06 | ✅ merged 2026-10-06 |
| Admin Messages — `feat/admin-messages`: teacher ↔ admin only, the Enter page-jump fix, the sidebar's toggle place and pinned Messages, threads opening at the newest message, the adviser label (built and device-checked 2026-10-06) | ✅ merged 2026-10-06 | ✅ merged 2026-10-06 | ✅ merged 2026-10-06 |
| The source-code zip — `fix/source-zip`: `git archive` of HEAD, tracked files only (the owner's first run 2026-10-07) | ✅ merged 2026-10-07 (a root script, not the server) | — | — |
| Build 2 — `feat/dashboards-look`: skeleton loading tier 1, re-reads that keep what is on screen, the drawer as a dialog, the dashboards' Part C (built 2026-10-07, device-checked 2026-10-08), and its fix round F1–F8 (built and re-checked 2026-10-09) | — | ✅ merged 2026-10-09 | ✅ merged 2026-10-09 |
| The privacy build — `feat/privacy`: consent before use (parents), your own first password, sign-in limits, four learner fields no longer collected (built, device-checked, fix round PF1–PF5 and re-checked 2026-10-10) | ✅ merged 2026-10-11 | ✅ merged 2026-10-11 | ✅ merged 2026-10-11 |
| Shared Messages — `feat/shared-messages`: one thread and one conversations page for every role (web), the browser test for where a thread opens, the phone thread's positioning fix (built 2026-10-11); two fix rounds — the top bar's ← as the way back (the page's own link removed), a whole row opens a conversation; device-checked and re-checked 2026-10-11, data cleaned up (backup 291) | — (untouched) | ✅ merged 2026-10-11 | ✅ merged 2026-10-11 (the thread screen) |
| Skeleton option 1 — `feat/skeleton-querykey`: the `queryKey` rule (a new query shows the skeleton, the same query keeps the rows), the keys on every list whose query can change, the avatar circle on the nine lists that lacked it (built and device-checked on the web 2026-10-11) | — (untouched) | ✅ merged 2026-10-11 | ✅ merged 2026-10-11 (not device-checked: the LAN is too fast to see a skeleton; the proofs cover it) |
| The socket handshake and the picker copy — `fix/socket-handshake`: the handshake asks what the REST API asks (the restore cutoff, the token's version) and says "Database unreachable." for a database error; the phone teacher picker's empty groups follow the web; fix round R4 — the strip waits for a real failure (a 3 s grace), the admin dashboards' "Live connection" row says "Connecting…" (built, device-checked and re-checked 2026-10-11; data cleaned up, backup 292) | ✅ merged 2026-10-11 | ✅ merged 2026-10-11 (the strip, the dashboard row) | ✅ merged 2026-10-11 (the picker, the strip, the dashboard row) |
| Staff acceptance — `feat/staff-acceptance`: teachers and the admin accept the Notice and the Terms at sign-in (two ticks, the parent's first two word for word, no child tick, "Declining ends portal use only."), their dates in Security & policy; every suite accepts after each staff sign-in and cleans up last; the smoke harness accepts for the three staff accounts (built, gated and device-checked 2026-10-11; data cleaned up, backup 302) | ✅ merged 2026-10-11 | ✅ merged 2026-10-11 | ✅ merged 2026-10-11 |
| Skeleton tier 2, web — `feat/skeleton-tier2-web`: the thirteen spinners left on eleven web pages become skeletons shaped like their content, a re-read keeps what is on screen, the way back stays on screen while one shows (built and gated 2026-10-11; device-checked with four findings, the fix round — T1, T2, P1, and P2, a month-load race already on `main`, fixed with the tickets helper — re-checked the same day; data cleaned up, backup 303) | — (untouched) | ✅ merged 2026-10-11 | — (untouched) |
| Skeleton tier 2, phone — `feat/skeleton-tier2-phone`: seventeen spinners on thirteen screens — sixteen become skeletons shaped like the screen, the slot screen's pull keeps its column; the web's fix round applied (the register's card shape, no old counts while a new day loads, the month card while it loads, tickets on the loads a pick can supersede) and the same gaps on teacher Grades, Class summary and admin Grades; `QuietSkeleton` for pieces beside an announced region (built, gated and device-checked on the Tecno 2026-10-11; data cleaned up, backup 304) | — (untouched) | — (untouched) | ✅ merged 2026-10-12 |
| The web load races — `fix/web-load-races`: tickets on the roster, admin Grades' report and the class summary (Try again included); the class record, the class summary and admin Grades show only the current pick's data until it arrives — the grid not editable, no lock (built, gated and device-checked on 3G 2026-10-12; data cleaned up, backup 305) | — (untouched) | ✅ merged 2026-10-12 | — (untouched) |
| Grade locks — `fix/grade-locks`: a locked learner freezes the class's highest possible scores (`409` naming every locked learner, a dry run too); "Lock or unlock a term" on Admin → Grades — preview first, active learners only, a lock only for learners graded in every subject, the rest listed (built, gated and suites run 2026-10-13; carried by `fix/smoke-round`, device-checked 2026-10-13; data cleaned up, backup 316) | ✅ merged 2026-10-13 | ✅ merged 2026-10-13 | ✅ merged 2026-10-13 |
| The smoke gate's fix round — `fix/smoke-round` (on `fix/grade-locks`): F4 the class record's Summative block without a raw total and a line saying how ST PS is made; F5 the parent breakdown's rows named "Written Work 1" or the column's own name, as the class record's helper promises; F6 sign-in confirming a password reset; F7 a per-row lock or unlock closing its dialog and keeping its line (built and gated 2026-10-13; device-checked the same night on the web and the Android emulator, every section passed, the bulk dialog's 390px / dark pass not done; data cleaned up, backup 316; F3 cut — KNOWN ISSUES) | — (untouched) | ✅ merged 2026-10-13 | ✅ merged 2026-10-13 |
| The first sign-in — `feat/first-signin` (pre-Oct-21 build, branch 1 of 6 in the owner's order): consent → a confirmed Gmail or mobile number → your own password (no temporary-password field, `PUT /auth/first-password`; a temporary password on a confirmed account confirms it again); your own email (`PUT /auth/email`, web and phone Settings); the 60-second resend cooldown on every code, forgot-password included, counted down on both clients (built and gated 2026-10-18; device-checked 2026-10-20/21 on the web, the Tecno phone and SMSGate, every section passed, no fix round; cleaned up by id, backup 324; merged 2026-10-21, `9d3b430`) | ✅ merged 2026-10-21 | ✅ merged 2026-10-21 | ✅ merged 2026-10-21 |
| Account creation — `feat/account-create` (pre-Oct-21 build, branch 2 of 6): Create teacher and Create parent drop the Email and Contact number fields on the web's three forms and the phone's two screens, and `POST /users/teachers` / `POST /users/parents` refuse a value with `400` "no longer collected" naming the field (the owner's decision of 2026-10-16); the holder confirms a contact at the first sign-in; Admin → Users → Edit, Settings and the contact gate unchanged (built and gated 2026-10-21, `1e43b6a`; device-checked 2026-10-21 in the combined check with `feat/password-alert` — Sections 1–10, no findings — and cleaned up by id after backup 338; merged 2026-10-21, `2b85331`) | ✅ merged 2026-10-21 | ✅ merged 2026-10-21 | ✅ merged 2026-10-21 |
| The password alert — `feat/password-alert` (pre-Oct-21 build, branch 3 of 6, on `feat/account-create`): after any password change — Settings → Change password, Forgot password's reset, the first sign-in's own password, the admin's temporary password — the holder gets a "was this you?" email and/or text on every confirmed channel, no code and no link, sent after the reply and never blocking the change; nothing confirmed is logged; the office's temporary password has its own words (the owner's decision of 2026-10-14/16; built and gated 2026-10-21; the two email hard-wrap fixes `b34f354` and `e78c635` during the check; device-checked 2026-10-21 in the combined check — every alert arrived on the confirmed channel, none on an unconfirmed one — and cleaned up after backup 338; merged 2026-10-21, `2b85331`) | ✅ merged 2026-10-21 | — (untouched) | — (untouched) |
| Grade acknowledgement — `feat/grade-acknowledgement` (pre-Oct-21 build, branch 4 of 6, rebased onto `main`): a parent confirms a TERM of the report card once every subject is locked ("I have seen these grades", a §5e dialog / system Alert naming the term back), the adviser's bell is told and the class summary gains a Confirmed column, Admin → Grades lists the confirmed terms and the lock dialog says an unlock clears one; `POST /api/grades/acknowledgements`, the 26th table `grade_acknowledgements`, two bell-only notification types, `acknowledgements_cleared` on the bulk unlock (the owner's Q1–Q12 of 2026-10-21; built and DB-free gated 2026-10-21; rebased onto `main` `f9b3a68` and its database part run the same night — the migration twice after backup 339, the 23 HTTP suites, every proof, `smoke:isolated` 20/20, the new suite's cleanup fixed after backup 344 — committed and pushed; device-checked 2026-10-22 on the web and the Tecno — Sections 1–6, one finding: "Grades confirmed" opened Class summary on today's term, fixed in `2525215` (the link names the term; on the phone a link's query reaches its screen) and re-checked — and cleaned up by id after backup 346; merged 2026-10-22, `6c39f9c`) | ✅ merged 2026-10-22 | ✅ merged 2026-10-22 | ✅ merged 2026-10-22 |
| F3 badges — `fix/f3-badges` (B3, the owner's label): a visit clears a badge's INFORMATION rows — Announcements, Memos and Events for a teacher and a parent, a parent's Excuse Letters, the admin's Announcements (announcements + memos) — through `PATCH /api/notifications/read-all { section }` (no new handler; the server's per-role `VISIT_CLEAR` decides what a section covers), the web once per mount and the phone on every focus and pull (the seven phone list screens re-read on focus since); the calls to act — Teacher → Excuse Letters, Admin → Users — still clear only on the decision (the owner's decision of 2026-10-22; built and gated 2026-10-22 in its own worktree after backup 348; device-checked 2026-10-22/23 on the web and the Tecno — §1–§5, one finding: the Upcoming events card's name at a figure's size, fixed in `c248c51` (parent) and `ce9f111` (teacher) and re-checked — and cleaned up by id after backup 354; merged 2026-10-23, `96a1776`) | ✅ merged 2026-10-23 | ✅ merged 2026-10-23 | ✅ merged 2026-10-23 |
| Excuse attendance — `feat/excuse-attendance` (B8): an excuse letter's decision SETS that day's attendance in the review's own transaction — approved: an unrecorded class day becomes Excused, Absent becomes Excused; declined: an unrecorded class day becomes Absent; a Present, Late or Excused mark stays; a day that is not a class day — a weekend, the break between terms or a day outside the school year; a class day is a weekday inside one of the three terms (the owner's answer of 2026-10-23) — gets no write; the reviewer recorded, an `excuse_attendance` activity row when the day changes, a `409` "try again" when another write wins the moment; the review says before and after exactly what happens, the parent's four places carry the owner's sentence, the phone register and the parent's Attendance re-read on focus (the owner's Q1–Q11 of 2026-10-22/23; built and gated 2026-10-23 in its own worktree after backup 355; the class-day fix gated the same day after backup 360; device-checked the same day, no findings, cleaned up by id after backup 362; merged `47be373`) | ✅ merged 2026-10-23 | ✅ merged 2026-10-23 | ✅ merged 2026-10-23 |
| The Activity log — `feat/activity-log` (B2, the owner's decision D-21 of 2026-10-16): trim-11 of CLAUDE.md (`00235a0`); `create_teacher`, `update_user` and `update_user_status` write ids only (`04258c8`); Admin → Activity log — `activity_logs` newest first by Manila day, account role and action, 50 a page, a CSV of exactly that set (BOM, RFC 4180, every cell formula-guarded, at most 50,000), the description never selected, each code's label the server's; a download logs `export_activity_log`; three admin-only handlers; web only (built 2026-10-23/24 and gated 2026-10-24 in its own worktree after backup 363; device-checked 2026-10-24 on the web, §1–§5, no findings, cleaned up by id after backup 369; merged 2026-10-24, `f4cc8c4`) | ✅ merged 2026-10-24 | ✅ merged 2026-10-24 | — (web only: the mirrored nav hides it, `WEB_ONLY`) |
| Teaching assignments and advisers — Module 11, `feat/admin-assignments` (the owner's SCOPE DECISION of 2026-10-31): Admin → Assignments & advisers adds and removes `teacher_assignments` (one form, every subject × section pair; a removal keeps every grade) and sets or clears `sections.adviser_id` (a warning about Pending letters, never a block); the Attendance sentences for a class with no adviser now point to it (gated 2026-11-01 on `c1ad541`; the owner's check 2026-11-02, all 30 rows; merged 2026-11-02) | — (no route changed) | ✅ merged 2026-11-02 | — (web only: the mirrored nav hides it, `WEB_ONLY`; two sentences changed) |
| 6 — Integration, deployment decision, demo | ❌ | ❌ | ❌ (the standalone APK is a ready plan, not built) |

**Nine features ship** (Feature 7, Contribution/Fees Monitoring, was built
and then removed on 2026-09-13 because the school may not collect
contributions — CLAUDE.md → SCOPE DECISION).

**Navigation today:** teacher 13 items, parent 10, admin 12 (the Activity log
since B2, merged 2026-10-24; Assignments since Module 11, merged 2026-11-02),
every one built; About is last on every role. Admin has no Excuse Letters,
Memos or Events page by the Figure 5 scope decision — memos are written on
Admin → Announcements — and Admin → Assignments & advisers replaced the Sections
page that decision ruled out (the owner, 2026-10-31).
**Admin → Messages came back on 2026-10-05** by the
owner's decision (teacher ↔ admin only; merged 2026-10-06).

---

## Per module — what exists

Handlers are `docs/API_REFERENCE.md` §8's per-module counts. **Every module
also has its phone screens**, except Backup & Restore, the Activity log and
Assignments (web only by design).
A module with tables and no handlers is not started; there are none.

| Module | Tables | Handlers | Suites | Web |
|---|---|---|---|---|
| Auth + account recovery + own profile photo + sign-in limits | `users`, `auth_codes`, `auth_security_state`, `login_attempts` | 14 (`PUT /email` and `PUT /first-password` since `feat/first-signin`, merged 2026-10-21) | `test:auth`, `test:recovery`, `test:auth-middleware`, `test:sanitize`, `test:sms-transport`, `test:profile-photo`, `test:privacy` | Login, Forgot password, forced password change (also for every new teacher and parent), Settings (Account — with the profile photo —, Password, Personalization) for all roles |
| Privacy — consent (feat/privacy, merged 2026-10-11) | `policy_acceptances` | 3 | `test:privacy` | the consent screen (every role since feat/staff-acceptance — staff with two ticks — FIRST, before the contact step and the password, since feat/first-signin); Settings → Security & policy (every role). The notice and terms are version 1.0: the owner's draft-2 plus the DO 72 sentence (Module 14) |
| User management | `users` | 11 | `test:users`, `test:profile-photo` | Admin → Users (remove a photo; never upload one for someone else) |
| Student records | `students` | 5 | `test:students` | Teacher → Students + detail (enrol, create parent account); Admin → Students + detail |
| Sections | `sections` | 3 | `test:sections` | Admin → Assignments & advisers sets or clears an adviser (web only, Module 11); read by pickers |
| Subjects + assignments | `subjects`, `teacher_assignments` | 1 + 3 | `test:assignments` | Admin → Assignments & advisers adds and removes assignments (web only, Module 11); read by pickers |
| Grades | `grades`, `grade_components`, `assessment_slots`, `grade_weight_configs`, `transmutation_table`, `grading_mode_configs`, `grade_acknowledgements` (since `feat/grade-acknowledgement`, merged 2026-10-22) | 15 + 1 (`/grading-modes`; `POST /acknowledgements` since 2026-10-22) | `test:grades`, `test:class-record`, `test:class-summary`, `test:grade-locks`, `test:grade-acknowledgements`, `test:grading-modes`, `test:grade-computation`, `verify:grading-seed` | Teacher → Grades (the class record), Teacher → Class summary + learner card (a Confirmed column); Parent → Grades (report card + term breakdown; "I have seen these grades" per locked term); Admin → Grades (lock one grade; lock or unlock a whole term — `fix/grade-locks`; the confirmed terms and what an unlock clears) |
| Attendance | `attendance` | 6 | `test:attendance` | Teacher → Attendance, Attendance records; Parent → Attendance (calendar); Admin → Attendance |
| Announcements, memos, events | `announcements`, `memos`, `events` | 12 | `test:content` | Teacher ×3; Parent ×3; Admin → Announcements (with memos) |
| Excuse letters | `excuse_letters` | 6 | `test:excuses` | Teacher → Excuse Letters (review); Parent → Excuse Letters |
| Messages + Socket.io | `messages` | 6 | `test:messages`, `test:socket-auth` | Teacher and Parent → Messages + thread (Enter sends on the web); Admin → Messages (teachers only); the new-message toast on every screen of a role with Messages, web and phone. On `feat/shared-messages` every web surface is one of two shared components (`pages/messages/`), and `scripts/loop-messages-thread.mjs` drives the thread in Chromium |
| Notifications | `notifications` | 4 | `test:notifications` | the bell and the sidebar badges, every role |
| Settings + school calendar | `system_settings` | 5 | `test:settings`, `test:school-calendar` | Admin → Settings; About (every role, and public from the login page) |
| Dashboard | — | 1 | `test:dashboard` | one dashboard per role |
| Backup & restore | `backups` | 5 | `test:backups`, `test:restore` | Admin → Backup & Restore (web only, by design) |
| Audit log | `activity_logs` | 3 since `feat/activity-log`, merged 2026-10-24 (written by every write; read by `GET /api/activity-logs`, `/actions`, `/export` — never the description) | `test:activity-log` | Admin → Activity log (web only) |

**Across every screen, web and phone:**

- **Palette C** — zinc neutrals and one blue accent on every screen,
  Login and Forgot password included, Light and Dark; the status tones are
  unchanged (CLAUDE.md §8).
- **The UI refresh** (merged 2026-10-04) — Merriweather
  titles and Source Sans 3 text at Tailwind's own sizes, one `Button` and one
  `SectionHeader`, motion for entrances only, no Reload control (the
  browser's reload on the web, pull-to-refresh on the phone), a painted
  status bar and one "Live updates paused" strip on the phone (CLAUDE.md §27,
  MOBILE M23–M24).
- **The leave guard** — on the four bulk-entry screens (web Grades and
  Attendance, phone Attendance and the Grades slot), every user-initiated
  exit with unsaved work asks "Leave without saving?" (CLAUDE.md §5e).
- **The new-message toast** — "New message from <name>" / "<n> new messages
  from <name>", never the body, View + Dismiss, 5 s, never for your own
  message or the conversation you are in; the admin gets it too
  (CLAUDE.md §26).
  On a show or update it plays the "two-note rise" tone (web and phone) and
  vibrates 150 ms on the phone. **The phone plays no tone in silent or
  vibrate-only mode; during Do Not Disturb the tone still plays and the
  vibration ignores DND and the ringer** — Expo Go limits, fixed with the
  APK (KNOWN_ISSUES). Enter sends on the web, Shift+Enter is a new line.
- **One shape language** (merged 2026-10-06) — cards
  `rounded-xl`, every control `rounded-lg`, badges and chips `rounded-md`
  tags, circles only for avatars, the seal, dots and counts; every button has
  a border in its own colour and no shadow (CLAUDE.md §27, FRONTEND §27f).
- **Form drafts** (merged 2026-10-05) — the excuse
  letter, the teacher's announcement and event, the admin's announcement
  and memo, and each Messages thread keep what was typed until a confirmed
  submit, Discard draft or logout: in the browser tab on the web (a reload
  reopens the form), on the device on the phone (back when the form
  reopens). "Close", not "Cancel", on those forms (CLAUDE.md §28, MOBILE M25).

**Client render proofs** (`client/scripts/ssr-*.jsx`) and **mobile proofs**
(`mobile/scripts/proof-*.mjs`) back the screens above; the list, run-books
and counts are in `docs/TESTING.md`. Build and lint prove the code
compiles; a page is done when it has been opened in a browser (CLAUDE.md
§5h), and a phone screen when it has been used on the phone (M7).

---

## What is next

**Merged (2026-10-21):** `feat/first-signin` (`9d3b430`, device-checked
and cleaned up — `docs/FIRST_SIGNIN_DEVICE_CHECK.md` §9), then
`feat/account-create` (`1e43b6a`) and `feat/password-alert` together
(`2b85331` — the combined device check PASSED, Sections 1–10, no findings;
the §11 cleanup done and verified after backup 338,
`docs/ACCOUNT_CREATE_PASSWORD_ALERT_DEVICE_CHECK.md` §11–§12; `main`
fast-forwarded from `bba67bd` by the ref move). **Merged (2026-10-22):**
`feat/grade-acknowledgement`, B1 (`6c39f9c` — its database part 2026-10-21
after backups 339 and 344; the device check PASSED 2026-10-22, Sections 1–6,
one finding — "Grades confirmed" opened today's term — fixed in `2525215`
and re-checked; the §7 cleanup verified after backup 346,
`docs/GRADE_ACKNOWLEDGEMENT_DEVICE_CHECK.md` §7–§8; `main` fast-forwarded
from `f9b3a68` by the ref move). **Merged (2026-10-23):** B3
`fix/f3-badges` (`96a1776` — a visit clears a badge's information rows; gated
after backup 348, the owner's demo records of the day cleaned up by id after
backup 347 first; the device check PASSED 2026-10-22/23, §1–§5, one finding
fixed in `c248c51` + `ce9f111` and re-checked; the §6 cleanup verified after
backup 354, `docs/F3_BADGES_DEVICE_CHECK.md` §6–§7; `main` fast-forwarded
from `1b43150` by the ref move). **Merged (2026-10-23):** B8
`feat/excuse-attendance` (`47be373` — an excuse decision sets that day's
attendance; gated after backups 355 and 360; the device check PASSED the
same day, §1–§3, no findings, the phone part reordered by the owner; the §4
cleanup verified after backup 362, `docs/EXCUSE_ATTENDANCE_DEVICE_CHECK.md`
§4–§5; `main` fast-forwarded from `613c73e` by the ref move). **Merged
(2026-10-24):** B2 `feat/activity-log` (`f4cc8c4` — Admin → Activity log;
built in its own worktree, gated after backup 363; the device check PASSED
2026-10-24, §1–§5 on the web, no findings; the cleanup after the owner's SMS
test verified after backup 369, `docs/ACTIVITY_LOG_DEVICE_CHECK.md` §7–§8;
`main` fast-forwarded from `9c2c34b` by the ref move; the B2 worktree left
detached at `774b98c`). **Merged (2026-10-24):** B7 `chore/pre-migration`
(`4b8be36` — the docs before the migration and D-102's demo data; the restore
point backup 376). **Merged (2026-10-25):** `feat/sms-e2e-code-purge`
(`5eb2127` — P-19 and the SMS end-to-end encryption; the device check PASSED,
`docs/SMS_E2E_DEVICE_CHECK.md` §4; the probe's exit-time abort guarded, the
Node ≥ 24.20.0 upgrade the owner's decision; `main` fast-forwarded from
`5426b70` by the ref move). **Merged (2026-10-25):** `feat/privacy-text`
(`3d1521b` — the owner's draft-2 notice and terms, both `draft-2`; D-124
changed by the owner — in now, without waiting for the principal's approval;
the web device check PASSED, `docs/PRIVACY_TEXT_DEVICE_CHECK.md` §5, the phone
joining the D-67 phone pass; a reported contact clearing was withdrawn —
KNOWN_ISSUES, CLOSED; `main` fast-forwarded from `6beae15` by the ref move;
the worktree `Parents_Portal-privacy-text` left detached at `a613e1a`). #3
(Marwin's parent) stays as the demo's first-sign-in account — no confirmed
contact, no acceptance.
**Next, as of 2026-10-25 (history; all done):**
(1) the independent verification; (2) then Session A's half of
the Phase 3 split; (3) Session B (`migrate/postgres-prep`), beside it — the
sync with `main` (its next sync carries the two `server/policy/` texts and
`versions.json`, `draft-2`, with no SQL; P-19's DELETE in both forms; and the
SMS change), then the D-65 fix round, then Phase 3 (the owner writes
`supabase.env` after Session A), copying everything; the sync adds B1's 26th table `grade_acknowledgements`
and the two `notifications.type` values `grades_locked` and
`grades_acknowledged` (B1's build CHANGELOG row, 2026-10-21); B2 adds no
schema change, and its new SQL to port is MIGRATION_INVENTORY B16; B7 adds
none either — port its seed Grade 1 block, the demo-grade1 migration and
`verify-grading-seed`'s new SQL (CLAUDE.md NEXT); (4) the reset of the old
activity rows at the end, after the last gate and before the demo, on
Supabase (D-122; B7's survey for it: `docs/ACTIVITY_RESET.md`); (5) hosting
last, once the whole system is complete — before going online, the seeded
accounts' default passwords changed or removed.
The owner's own target is everything finished, the Supabase migration
included, by Mon 2026-10-26; the next system check is Wed 2026-10-28. The
restore point is backup 376, `parents_portal_2026-10-24_150020.sql` (after
B7's demo data; it still holds the old activity rows — D-122; 317,
`parents_portal_2026-10-13_233314.sql`, the previous one). 324, 338, 346, 354,
362, 369, 382 and 389 are the eight checks' pre-cleanup dumps, 361, 368, 375
and 388 B8's, B2's, B7's and the privacy text's pre-check dumps, 347 the demo
records', and 339, 344, 345, 348, 353, 355, 360, 363, 370, 377 and 383
pre-write dumps, not restore points.

The manuscript delta list stays with the team (it includes Chapter 5's
admin Messages text). **Add to it, for Chapter 5 (the team applies it):** Admin →
Assignments & advisers was built on the owner's decision of 2026-10-31, reversing
"Admin → Sections will not be built", because the panel asked at the professor's
check on 2026-10-30 for departmentalized subject teachers. Figure 5 has no such
process. It covers subject assignments and section advisers only; attendance,
excuse review and enrolment stay adviser-only. An assignment also gives the
teacher that class's existing read, learner-name edit, parent messaging and class
announcement scope. It is web only.
The badged-pages pass (`fix/f3-badges`) is merged.
The PostgreSQL cutover landed 2026-10-27. Hosting is live on the Hostinger VPS,
with the domain beside it since 2026-11-03 (`deploy/README.md` section 14).

Then Stage 6: end-to-end testing and the standalone APK
(`docs/APK_READY_PLAN.md`); the deployment, the demo data and the rehearsal are
done. Notifications
on the phone are in-app over Socket.io only — there is no push (CLAUDE.md →
BUILD ORDER → Stage 5).

**Open, not queued** (each a `docs/KNOWN_ISSUES.md` row): can an exam score
be stored with no denominator (INVESTIGATE); Admin → Users filter-tab counts
and a "Linked to" column, both needing server fields first; Teacher →
Excuse Letters does not refetch its list on the counts signal (low); the
phone's tone during Do Not Disturb and its vibration ignoring DND and the
ringer (the APK fix); the phone status bar's colour under enforced
edge-to-edge (re-check on Android 15+ and in the APK); native dialogs not
following the app's theme (accepted); the seeded admin password (change it
before the pilot); form drafts stored unencrypted in the tab or on the
device, the phone not reopening a form after a kill, and a draft's free text
holding anything typed (all three accepted); the parent calendar's faint
"Today" ring (the `focus-ring` token, under 3:1); a visit's clear marking
read a row not on the first view (accepted, B3); the Upcoming events card's
loading shape drawing a figure-sized first row (accepted, B3). Closed on
`feat/staff-acceptance` (merged 2026-10-11): staff acceptance of the notice
and terms. Closed by the privacy fix round: the handshake's forced-change and
consent gates, and a restore re-running the privacy step itself. Closed on
`fix/socket-handshake`: the handshake's restore cutoff and version check,
and the phone teacher picker's empty groups.

---

## Before the parent demo — required before real parents see this

- [ ] **Replace the seed data.** `seed.sql` uses the team's own names.
      Fictional demo data, or clear the seed if real records are loaded.
      The load, its undo and the check: `docs/DEMO_DATA.md` (Module 12).
      The demo passwords, one per role: `npm run demo:passwords`, same file.
      The seed itself does not change; it stays what the suites assert.
- [ ] **Change every default password**, one per role. The values are in
      `server/scripts/setup-db.js` (it hashes and inserts them; `seed.sql`
      holds only a placeholder) and are deliberately not repeated in any
      doc. A parent's login id is their child's LRN, so a public default
      password is half a credential already published.
- [ ] **RA 10173 (Data Privacy Act).** Ask the school whether loading real
      names and LRNs needs a consent process, and whether a form exists.
      **The in-app consent step exists since the privacy build
      (2026-10-10)**. The Data Privacy Notice and Terms of Use it shows are
      version 1.0: the owner's draft-2, which the principal approved with no
      change on 2026-10-26, plus the DO 72 sentence. **A later change is a new
      version** (`server/policy/`, a bump that asks every account again).
- [ ] **Confirm ADMIN001's email or mobile number** — a confirmed one is the
      only in-app way back in if the one admin loses its password (CLAUDE.md
      KNOWN ISSUES hazard).

School-visit questions still open: real data for the demo and consent; how
many parents can attend and when; whether make-up classes exist, and on
which days (Saturday is answered: no Saturday classes in SY 2026-2027).

---

## Excluded (not in scope)

QR attendance · online payment · enrollment and transcript requests ·
schedule grid · college grading · contribution/fee collection (removed
2026-09-13).
