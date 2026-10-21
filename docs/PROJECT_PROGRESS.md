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

**Snapshot, 2026-10-21: `main` at `2b85331` plus this docs commit —
`feat/password-alert` merged fast-forward from `bba67bd` (five commits: B5
`feat/account-create` `1e43b6a`, B6 `9f3cc6d`, the two email hard-wrap fixes
`b34f354` and `e78c635`, the merge-ready docs `2b85331`): account creation
and the password alert, device-checked together on 2026-10-21 — Sections
1–10, no findings — and cleaned up by id after backup 338; the restore point
is still backup 317. Before it on `main`: `feat/first-signin` (`9d3b430`,
2026-10-21 — device-checked 2026-10-20/21, cleaned up after backup 324),
trim-9 (`bba67bd`), the grade locks and
the smoke gate's F4–F7 (2026-10-13), the web load races (2026-10-12),
skeleton tier 2, staff acceptance, the socket handshake, skeleton option 1,
shared Messages and privacy. F3 (a visit clearing a page's badge) is a KNOWN
ISSUES row and `fix/f3-badges` in the owner's order.**
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
| 5 — Mobile (Expo) | — | — | ✅ every role's screens (Backup & Restore web only by design) |
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
| 6 — Integration, deployment decision, demo | ❌ | ❌ | ❌ (the standalone APK is a ready plan, not built) |

**Nine features ship** (Feature 7, Contribution/Fees Monitoring, was built
and then removed on 2026-09-13 because the school may not collect
contributions — CLAUDE.md → SCOPE DECISION).

**Navigation today:** teacher 13 items, parent 10, admin 10, every one
built; About is last on every role. Admin has no Sections, Excuse Letters,
Memos or Events page by the Figure 5 scope decision — memos are written on
Admin → Announcements. **Admin → Messages came back on 2026-10-05** by the
owner's decision (teacher ↔ admin only; merged 2026-10-06).

---

## Per module — what exists

Handlers are `docs/API_REFERENCE.md` §8's per-module counts. **Every module
also has its phone screens**, except Backup & Restore (web only by design).
A module with tables and no handlers is not started; there are none.

| Module | Tables | Handlers | Suites | Web |
|---|---|---|---|---|
| Auth + account recovery + own profile photo + sign-in limits | `users`, `auth_codes`, `auth_security_state`, `login_attempts` | 14 (`PUT /email` and `PUT /first-password` since `feat/first-signin`, merged 2026-10-21) | `test:auth`, `test:recovery`, `test:auth-middleware`, `test:sanitize`, `test:sms-transport`, `test:profile-photo`, `test:privacy` | Login, Forgot password, forced password change (also for every new teacher and parent), Settings (Account — with the profile photo —, Password, Personalization) for all roles |
| Privacy — consent (feat/privacy, merged 2026-10-11) | `policy_acceptances` | 3 | `test:privacy` | the consent screen (every role since feat/staff-acceptance — staff with two ticks — FIRST, before the contact step and the password, since feat/first-signin); Settings → Security & policy (every role). The notice and terms are placeholders |
| User management | `users` | 11 | `test:users`, `test:profile-photo` | Admin → Users (remove a photo; never upload one for someone else) |
| Student records | `students` | 5 | `test:students` | Teacher → Students + detail (enrol, create parent account); Admin → Students + detail |
| Sections | `sections` | 3 | `test:sections` | none by decision; read by pickers |
| Subjects + assignments | `subjects`, `teacher_assignments` | 1 + 3 | `test:assignments` | none by decision; read by pickers |
| Grades | `grades`, `grade_components`, `assessment_slots`, `grade_weight_configs`, `transmutation_table`, `grading_mode_configs` | 14 + 1 (`/grading-modes`) | `test:grades`, `test:class-record`, `test:class-summary`, `test:grade-locks`, `test:grading-modes`, `test:grade-computation`, `verify:grading-seed` | Teacher → Grades (the class record), Teacher → Class summary + learner card; Parent → Grades (report card + term breakdown); Admin → Grades (lock one grade; lock or unlock a whole term — `fix/grade-locks`) |
| Attendance | `attendance` | 6 | `test:attendance` | Teacher → Attendance, Attendance records; Parent → Attendance (calendar); Admin → Attendance |
| Announcements, memos, events | `announcements`, `memos`, `events` | 12 | `test:content` | Teacher ×3; Parent ×3; Admin → Announcements (with memos) |
| Excuse letters | `excuse_letters` | 6 | `test:excuses` | Teacher → Excuse Letters (review); Parent → Excuse Letters |
| Messages + Socket.io | `messages` | 6 | `test:messages`, `test:socket-auth` | Teacher and Parent → Messages + thread (Enter sends on the web); Admin → Messages (teachers only); the new-message toast on every screen of a role with Messages, web and phone. On `feat/shared-messages` every web surface is one of two shared components (`pages/messages/`), and `scripts/loop-messages-thread.mjs` drives the thread in Chromium |
| Notifications | `notifications` | 4 | `test:notifications` | the bell and the sidebar badges, every role |
| Settings + school calendar | `system_settings` | 5 | `test:settings`, `test:school-calendar` | Admin → Settings; About (every role, and public from the login page) |
| Dashboard | — | 1 | `test:dashboard` | one dashboard per role |
| Backup & restore | `backups` | 5 | `test:backups`, `test:restore` | Admin → Backup & Restore (web only, by design) |
| Audit log | `activity_logs` | — (written by every write) | — | none; no read endpoint exists |

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
fast-forwarded from `bba67bd` by the ref move). **Next, on the owner's
word:** `feat/grade-acknowledgement` — built and DB-free gated in its own
worktree, waiting — rebases onto this `main` and runs its database part
(the migration after a backup, the 23 HTTP suites, the smoke, its commit),
then its own check. **Then the rest of the pre-Oct-21 order:**
`fix/f3-badges`, `feat/activity-log`, each on its own check; then
`docs/pre-oct21`, the demo data and a new restore point.
The owner's own target is everything finished, the Supabase migration
included, by Mon 2026-10-26; the next system check is Wed 2026-10-28. The
restore point is still backup 317,
`parents_portal_2026-10-13_233314.sql` (324 and 338 are the two checks'
pre-cleanup dumps, not restore points).

The manuscript delta list stays with the team (it includes Chapter 5's
admin Messages text). The badged-pages pass is `fix/f3-badges` in the order
above; the cloud (Supabase) migration is planning only.

Then Stage 6 (integration, the deployment decision, demo data and
rehearsal; the standalone APK per `docs/APK_READY_PLAN.md`). Notifications
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
"Today" ring (the `focus-ring` token, under 3:1). Closed on
`feat/staff-acceptance` (merged 2026-10-11): staff acceptance of the notice
and terms. Closed by the privacy fix round: the handshake's forced-change and
consent gates, and a restore re-running the privacy step itself. Closed on
`fix/socket-handshake`: the handshake's restore cutoff and version check,
and the phone teacher picker's empty groups.

---

## Before the parent demo — required before real parents see this

- [ ] **Replace the seed data.** `seed.sql` uses the team's own names.
      Fictional demo data, or clear the seed if real records are loaded.
- [ ] **Change every default password**, one per role. The values are in
      `server/scripts/setup-db.js` (it hashes and inserts them; `seed.sql`
      holds only a placeholder) and are deliberately not repeated in any
      doc. A parent's login id is their child's LRN, so a public default
      password is half a credential already published.
- [ ] **RA 10173 (Data Privacy Act).** Ask the school whether loading real
      names and LRNs needs a consent process, and whether a form exists.
      **The in-app consent step exists since the privacy build
      (2026-10-10)**, but the Data Privacy Notice and Terms of Use it shows
      are placeholders — **the school's approved text replaces them**
      (`server/policy/`, a version bump; KNOWN_ISSUES).
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
