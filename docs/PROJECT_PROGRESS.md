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

**Snapshot, 2026-10-11: `main` at `c8ac275` (`feat/skeleton-tier2-web`
merged fast-forward on 2026-10-11 after the owner's device check, fix round
and re-check; staff acceptance, the socket handshake, skeleton option 1,
shared Messages and privacy before it) plus `feat/skeleton-tier2-phone` —
branch 4 of the owner's four before the smoke gate: the phone's tier-2
spinners are skeletons shaped like their screens, with the web's fix round
applied (the register's own card shape; no old counts while a new day
loads; the month card while it loads; a ticket on the month's load) and
the same gaps closed on teacher Grades, Class summary and admin Grades.
Gated; not device-checked, not merged.**
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
| Skeleton tier 2, phone — `feat/skeleton-tier2-phone`: seventeen spinners on thirteen screens — sixteen become skeletons shaped like the screen, the slot screen's pull keeps its column; the web's fix round applied (the register's card shape, no old counts while a new day loads, the month card while it loads, tickets on the loads a pick can supersede) and the same gaps on teacher Grades, Class summary and admin Grades; `QuietSkeleton` for pieces beside an announced region (built and gated 2026-10-11) | — (untouched) | — (untouched) | 🟡 built, not device-checked, not merged |
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
| Auth + account recovery + own profile photo + sign-in limits | `users`, `auth_codes`, `auth_security_state`, `login_attempts` | 12 | `test:auth`, `test:recovery`, `test:auth-middleware`, `test:sanitize`, `test:sms-transport`, `test:profile-photo`, `test:privacy` | Login, Forgot password, forced password change (also for every new teacher and parent), Settings (Account — with the profile photo —, Password, Personalization) for all roles |
| Privacy — consent (feat/privacy, merged 2026-10-11) | `policy_acceptances` | 3 | `test:privacy` | the consent screen (every role since feat/staff-acceptance — staff with two ticks — after the forced change); Settings → Security & policy (every role). The notice and terms are placeholders |
| User management | `users` | 11 | `test:users`, `test:profile-photo` | Admin → Users (remove a photo; never upload one for someone else) |
| Student records | `students` | 5 | `test:students` | Teacher → Students + detail (enrol, create parent account); Admin → Students + detail |
| Sections | `sections` | 3 | `test:sections` | none by decision; read by pickers |
| Subjects + assignments | `subjects`, `teacher_assignments` | 1 + 3 | `test:assignments` | none by decision; read by pickers |
| Grades | `grades`, `grade_components`, `assessment_slots`, `grade_weight_configs`, `transmutation_table`, `grading_mode_configs` | 13 + 1 (`/grading-modes`) | `test:grades`, `test:class-record`, `test:class-summary`, `test:grading-modes`, `test:grade-computation`, `verify:grading-seed` | Teacher → Grades (the class record), Teacher → Class summary + learner card; Parent → Grades (report card + term breakdown); Admin → Grades (lock) |
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

As the owner's dispatches stand (2026-10-11, CLAUDE.md → BUILD ORDER →
NEXT):

1. **The owner's device check of `feat/skeleton-tier2-phone`** on the Tecno
   (no-regression — `docs/TESTING.md`) and its merge on the owner's word.
2. **A small web follow-up after that merge (the owner's Q5):** the web
   roster's load (`client/src/pages/teacher/AttendancePage.jsx` `loadRoster`)
   takes no ticket, so a date or section change made while the last roster
   is in flight can let the older reply land last — on `main` since before
   this work; the phone's fix is the pattern.
3. **Smoke gate** across web and mobile, **by Thu 2026-10-15** — with a real
   restore after a fresh backup, and SMS.
4. **Professor system check, Fri 2026-10-16.**

The manuscript delta list stays with the team (it includes Chapter 5's
admin Messages text). After the check: the cloud (Supabase) migration
planning only.

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
