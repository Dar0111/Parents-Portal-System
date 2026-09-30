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

**Snapshot of `main` at `c610bd8`, 2026-09-30** (after `feat/ui-polish`;
refreshed by `docs/stage5`). Table and endpoint counts: CLAUDE.md front
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
| 6 — Integration, deployment decision, demo | ❌ | ❌ | ❌ |

**Nine features ship** (Feature 7, Contribution/Fees Monitoring, was built
and then removed on 2026-09-13 because the school may not collect
contributions — CLAUDE.md → SCOPE DECISION).

**Navigation today:** teacher 13 items, parent 10, admin 9, every one
built; About is last on every role. Admin has no Sections, Excuse Letters,
Memos, Events or Messages page by the Figure 5 scope decision — memos are
written on Admin → Announcements.

---

## Per module — what exists

Handlers are `docs/API_REFERENCE.md` §8's per-module counts. **Every module
also has its phone screens**, except Backup & Restore (web only by design).
A module with tables and no handlers is not started; there are none.

| Module | Tables | Handlers | Suites | Web |
|---|---|---|---|---|
| Auth + account recovery + own profile photo | `users`, `auth_codes`, `auth_security_state` | 12 | `test:auth`, `test:recovery`, `test:auth-middleware`, `test:sanitize`, `test:sms-transport`, `test:profile-photo` | Login, Forgot password, forced password change, Settings (Account — with the profile photo —, Password, Personalization) for all roles |
| User management | `users` | 11 | `test:users`, `test:profile-photo` | Admin → Users (remove a photo; never upload one for someone else) |
| Student records | `students` | 5 | `test:students` | Teacher → Students + detail (enrol, create parent account); Admin → Students + detail |
| Sections | `sections` | 3 | `test:sections` | none by decision; read by pickers |
| Subjects + assignments | `subjects`, `teacher_assignments` | 1 + 3 | `test:assignments` | none by decision; read by pickers |
| Grades | `grades`, `grade_components`, `assessment_slots`, `grade_weight_configs`, `transmutation_table`, `grading_mode_configs` | 13 + 1 (`/grading-modes`) | `test:grades`, `test:class-record`, `test:class-summary`, `test:grading-modes`, `test:grade-computation`, `verify:grading-seed` | Teacher → Grades (the class record), Teacher → Class summary + learner card; Parent → Grades (report card + term breakdown); Admin → Grades (lock) |
| Attendance | `attendance` | 6 | `test:attendance` | Teacher → Attendance, Attendance records; Parent → Attendance (calendar); Admin → Attendance |
| Announcements, memos, events | `announcements`, `memos`, `events` | 12 | `test:content` | Teacher ×3; Parent ×3; Admin → Announcements (with memos) |
| Excuse letters | `excuse_letters` | 6 | `test:excuses` | Teacher → Excuse Letters (review); Parent → Excuse Letters |
| Messages + Socket.io | `messages` | 6 | `test:messages` | Teacher and Parent → Messages + thread |
| Notifications | `notifications` | 4 | `test:notifications` | the bell and the sidebar badges, every role |
| Settings + school calendar | `system_settings` | 5 | `test:settings`, `test:school-calendar` | Admin → Settings; About (every role, and public from the login page) |
| Dashboard | — | 1 | `test:dashboard` | one dashboard per role |
| Backup & restore | `backups` | 5 | `test:backups`, `test:restore` | Admin → Backup & Restore (web only, by design) |
| Audit log | `activity_logs` | — (written by every write) | — | none; no read endpoint exists |

**Client render proofs** (`client/scripts/ssr-*.jsx`) and **mobile proofs**
(`mobile/scripts/proof-*.mjs`) back the screens above; the list, run-books
and counts are in `docs/TESTING.md`. Build and lint prove the code
compiles; a page is done when it has been opened in a browser (CLAUDE.md
§5h), and a phone screen when it has been used on the phone (M7).

---

## What is next

1. **`docs/stage5`** — the docs pass and a CLAUDE.md trim.
2. **Full phone test / smoke gate** across web and mobile.
3. **Manuscript delta list** for the team.

Then Stage 6 (integration, the deployment decision, demo data and
rehearsal). Notifications on the phone are in-app over Socket.io only —
there is no push (CLAUDE.md → BUILD ORDER → Stage 5).

**Open, not queued** (each a `docs/KNOWN_ISSUES.md` row): can an exam score
be stored with no denominator (INVESTIGATE); Admin → Users filter-tab counts
and a "Linked to" column, both needing server fields first; Teacher →
Excuse Letters does not refetch its list on the counts signal (low).

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
- [ ] **Confirm ADMIN001's email or mobile number** — a confirmed one is the
      only in-app way back in if the one admin loses its password (CLAUDE.md
      KNOWN ISSUES hazard).

School-visit questions still open: real data for the demo and consent; how
many parents can attend and when; whether Saturday or make-up classes exist.

---

## Excluded (not in scope)

QR attendance · online payment · enrollment and transcript requests ·
schedule grid · college grading · contribution/fee collection (removed
2026-09-13).
