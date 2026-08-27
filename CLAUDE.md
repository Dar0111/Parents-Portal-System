> This file is maintained by Claude Code and Cursor. It describes the ACTUAL
> state of the code, not the plan. If this file and the code disagree, the
> code is correct and this file must be fixed.

# Parent's Portal System

Capstone project for **Captain H. Francisco Elementary School** (Grades 1–6),
187 P. Rosales Street, Barangay Sta. Ana-Kaliwa, Pateros City.

| | |
|---|---|
| Institution | Pateros Technological College — Institute of Information and Computing Technology |
| Developer | Candilada, Darryl — sole developer |
| Team | Conde, Marwin R. · Bargaso, Jea Mae T. · Bobis, Joan B. · Geguiera, Ashley T. |
| Repo path | `C:\Users\Win10 User\Parents_Portal` |
| Database | `parents_portal` — 18 tables |
| Sept 7, 2026 | System proposal checkpoint — **not** the final defense |
| Final defense | Expected around November 2026 |

The four other team members handle the manuscript and data gathering.
**Darryl codes.** Do not assign manuscript work to Darryl or coding tasks
to the team.

---

## CURRENT STATE

**Last verified:** 2026-08-26 (audited against the code, not the docs)

### Working endpoints — this is the entire API

| Method | Path | Role |
|--------|------|------|
| GET | `/api/health` | Public |
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Authenticated |
| PUT | `/api/auth/change-password` | Authenticated |
| POST | `/api/users/teachers` | admin |
| POST | `/api/users/parents` | teacher |
| GET | `/api/users/parents/pending` | admin |
| PUT | `/api/users/parents/:id/approve` | admin |
| PUT | `/api/users/parents/:id/reject` | admin |

**Tests:** 24 passing — `npm run test:auth`

### Files that exist

```
server/
  server.js                    Express app; mounts /api/auth and /api/users only
  package.json
  .env.example
  config/db.js                 MySQL connection pool
  middleware/auth.js           authenticate + authorize
  routes/auth.js               login, me, change-password
  routes/users.js              create teacher/parent, pending, approve/reject
  utils/jwt.js                 sign/verify
  utils/password.js            bcrypt hash/compare
  utils/activity.js            insert into activity_logs
  scripts/setup-db.js          runs schema + seed, hashes seed passwords
  scripts/test-auth-flows.js   HTTP tests
database/
  schema.sql                   18 tables
  seed.sql                     subjects, students, settings
scripts/
  create-backup-zip.js         folder copy, NOT a DB backup — see Known Issues
```

### Not started — zero handlers

Grades · Attendance · Student Records · Announcements · Memos · Messages ·
Excuse Letters · Contributions · System Settings · Backup/Restore

**No React web app. No Expo app. No Socket.io.**

Nine modules have tables in `schema.sql` but no route files and no queries.
Roughly **15–20% of the backend.**

---

## THE AUTH PATTERN IS THE TEMPLATE

The auth module was security-audited and came back clean. **Every new module
must follow this exact pattern. Do not invent a new structure.**

- `role` comes from the database row, never from `req.body`
- `authenticate` re-reads the user from the DB on every request, so
  deactivation takes effect immediately — the JWT claims are not trusted
- `student_id` comes from `users.student_id`, never from a URL param or body
- approve/reject filter on `role = 'parent'` so a teacher cannot be approved
  through the parent route
- `sanitizeUser()` strips the password hash from every response
- `logActivity()` writes to `activity_logs` on every write operation

When starting a new module, say this:

> Follow the exact same pattern as `routes/users.js`: `authenticate` +
> `authorize()`, `sanitizeUser` on any response containing a user row, and
> `logActivity` for any write. Do not invent a new structure.

**Known caveat:** `sanitizeUser` only deletes the key named `password`. If a
JOIN ever aliases the hash to another name, it leaks. Watch for this when
writing joins against `users`.

---

## LOCKED DECISIONS — do not re-litigate

**Architecture:** 3-tier — Presentation → Application → Data

**Stack**

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, MySQL, JWT, bcrypt, Socket.io |
| Web | React, Tailwind CSS, Font Awesome — no other UI library |
| Mobile | React Native (Expo). Not PWA. Not Flutter. |

**Repo layout:** `server/` and `client/` as separate folders, separate
`package.json`, two terminals. **No monorepo tooling** — no workspaces,
no Turborepo, no nx.

**Mobile scope:** all 10 features, all 3 roles. Backup/Restore is the one
web-only exception.

**Authentication — implemented and tested**

- `login_id` + password only. **No role dropdown.**
- Parent logs in with the child's **LRN**. Teacher and Admin use assigned IDs.
- **No self-registration.** Teacher creates parent (`pending`) → Admin
  approves (`active`). Admin creates teacher (`active` immediately).
- No grade-level selection after login.
- **One account per student.** A guardian with three children has three
  accounts. This is deliberate, for data isolation. **Do not suggest a
  bridge table.**

---

## THE 10 CORE FEATURES

1. Grade Management & Viewing
2. Attendance Monitoring
3. Student Records Management
4. Announcements & Memo Dissemination
5. Parent-Teacher Messaging (Socket.io)
6. Excuse Letter Submission & Management
7. Contribution/Fees Monitoring — view and track only, no payment gateway
8. User Management (Admin)
9. System Settings Management (Admin)
10. Backup & Restore (Admin, web only)

**Excluded from scope:** QR attendance, online payment, enrollment,
transcript requests, schedule grid, college grading.

---

## BLOCKED — do not build until answered

### Grades module — waiting on the school visit

- Four quarters or three terms for SY 2026–2027?
- Numerical or descriptive grading for Grades 1–3?
- Three grade components or five? The manuscript (Figures 17 and 25) lists
  five — quizzes, recitation, participation, projects, examinations. The
  schema supports three.
- What weights, and keyed by **subject** or by **grade level**?

**Do not build grade computation logic until these are answered.** Building
on a guess means rewriting the module.

### Known schema issue

`grade_weight_configs` is keyed by grade band:

```sql
grade_level_min TINYINT,
grade_level_max TINYINT
```

Seeded as G1–3: 30/50/20 and G4–6: 40/40/20. **This basis is wrong.** DepEd
weights vary by **learning area**, not grade level — Math is 40/40/20 while
Filipino is 30/50/20 for the *same* student in the *same* quarter. Must be
re-keyed to `subject_id` once the school confirms actual practice.

---

## KNOWN ISSUES — fix when you reach them

| Issue | Where | Note |
|---|---|---|
| `academic_year` is `'2025-2026'` | `seed.sql` | Should be `'2026-2027'`. One line. Visible to the panel during the demo. |
| `users.email` has no UNIQUE constraint | `schema.sql` | Only matters if email login is added later. Duplicate emails would break the lookup. |
| `create-backup-zip.js` copies folders | `scripts/` | Not a database backup. The Backup/Restore module needs `mysqldump`, not a folder copy. |
| `grade_components.type` is `ENUM('quiz','activity')` | `schema.sql` | Manuscript promises five components. Blocked on the school. |
| No `Download Statement` export | — | Promised in manuscript Figure 19. Build a CSV export from `contribution_records`, or remove it from the paper. |
| No GWA computation | — | Defined in the manuscript's Definition of Terms but implemented nowhere. Keep or drop — undecided. |

---

## SAFE TO BUILD NOW

**React web auth frontend.** Nothing external affects it.

- Login page — Login ID + password, no role dropdown
- `ProtectedRoute` component reading role from the JWT
- Three role dashboards: `/admin`, `/teacher`, `/parent`
- Axios client with JWT interceptor and 401 handling

Watch for the refresh flash: before the token loads from storage, `user` is
briefly `null`. Without a `loading` state the login page flashes even when
the user is authenticated.

---

## BUILD ORDER — tick these off as you go

Work top to bottom. Do not jump ahead. Update the checkboxes in this file
at the end of each session.

### Stage 1 — Foundation ✅ DONE

- [x] Database schema — 18 tables
- [x] Seed data
- [x] Auth backend — login, JWT, RBAC, approve/reject
- [x] Auth tests

### Stage 2 — Auth frontend ← YOU ARE HERE

Do this before any other backend module. It is the only work with zero
external dependencies, and it turns a terminal-only project into something
you can actually see on screen.

- [ ] `client/` folder + React + Tailwind + Font Awesome setup
- [ ] Axios client with JWT interceptor and 401 handling
- [ ] Login page — Login ID + password, no role dropdown
- [ ] `ProtectedRoute` with a loading state (prevents the refresh flash)
- [ ] `/admin` `/teacher` `/parent` empty dashboards
- [ ] Shared layout — sidebar, header, logout

### Stage 3 — Backend modules

Order matters. Student Records first because everything references students.
Grades is last in this stage because it is blocked.

- [ ] Student Records API — list, view, create, update
- [ ] Attendance API — per day, per subject
- [ ] Announcements + Memos + Events API
- [ ] Excuse Letters API — submit, review, approve/decline
- [ ] Contributions API — create, record payment, view status
- [ ] Messages API + Socket.io
- [ ] System Settings API (admin)
- [ ] User Management API — extend the existing `routes/users.js`
- [ ] Backup/Restore API (admin, `mysqldump` — not a folder copy)
- [ ] **Grades API — BLOCKED**, see the Blocked section above

### Stage 4 — Web pages

- [ ] Parent pages — grades, attendance, records, announcements, messages,
      excuse letters, contributions
- [ ] Teacher pages — same set plus management views
- [ ] Admin pages — user management, settings, backup/restore

### Stage 5 — Mobile (Expo)

- [ ] Expo project setup + navigation
- [ ] Login + role routing
- [ ] Parent screens
- [ ] Teacher screens
- [ ] Admin screens (Backup/Restore excluded — web only)
- [ ] Push notifications

### Stage 6 — Integration

- [ ] End-to-end testing across web and mobile
- [ ] Deployment decision: localhost or Railway + Vercel + Cloudinary
- [ ] Demo data and rehearsal

**Why auth frontend comes before the other backend modules:** finishing all
ten backend APIs first means reaching roughly 65% of the work with nothing
visible on screen. If time runs short at that point, there is a collection of
endpoints and no demo. One complete vertical slice first means there is
always something to show.

---

## END OF EVERY SESSION

Paste this before you stop working:

```
Update CLAUDE.md:
1. Add today's changes to the CHANGELOG with the date
2. Update CURRENT STATE to match the actual code
3. Tick off any completed items in BUILD ORDER

Only list what is verifiably working. If a module has tables but no
handlers, it is NOT started. Endpoints, not percentages.
```

Skipping this is how `PROJECT_PROGRESS.md` drifted out of sync with the code.

---

## MANUSCRIPT — audit complete, do not re-audit

All 81 pages read. **113 items found.** Two documents exist for the team:
a Correction Sheet with ready-to-paste replacement text, and a Revision
Request covering the 5 items awaiting adviser approval.

**Key finding: the manuscript contradicts itself.** Figure 5 (DFD Level 1)
and Figure 9.1 state that the admin creates teacher accounts and teachers
create parent accounts — which is exactly what was built. Figures 11, 12,
and 13 show open self-registration. **The build followed the DFD.** Do not
flag the auth flow as a deviation.

**Caution:** Figure 4 (DFD Level 0) lists "registration details" as a parent
input, contradicting Figure 5. When citing the DFD in any explanation,
always say **Figure 5** specifically.

---

## PHASE SEQUENCING — no skipping

1. **NOW** — system build + data gathering (206 respondents, locked by the
   professor; never suggest reducing it)
2. Professor meeting → request Chapter 4–5 format guidelines
3. Write Chapters 4–5
4. Defense preparation

If asked to start Chapters 4–5: *Chapters 4–5 cannot begin until the system
is functionally complete and the professor provides format guidelines.*

Data gathering distribution is solved — Google Form plus printed copies,
handled by the team. Do not re-raise it.

---

## OPEN QUESTIONS

- Adviser response to the 5 revision requests
- School answers on grading (see Blocked, above)
- Do all parents actually know their child's LRN? If not, the login design
  needs rethinking.
- Deployment for the demo: localhost or cloud (Railway + Vercel + Cloudinary)?
  Undecided. Blocks the Figure 1 hardware requirements in the manuscript.
- `Manage Templates` (Figure 23) — undefined in the manuscript. Likely means
  the grade weight configuration display. Confirm or remove.
- `activity_logs` exists in the schema but appears nowhere in the manuscript.
  Document it as a security feature, or drop the table.

---

## HOW TO WORK WITH DARRYL

**Prefers**

- Direct, action-oriented language
- Technical specificity — exact endpoints, column names, field types
- Structured formatting with clear hierarchy
- Open questions surfaced explicitly at the end
- Taglish is natural and fine

**Avoid**

- Vague suggestions, or repeating advice already given
- Lecturing after a decision has been made
- Drifting to code when he asks for something else
- Manufacturing urgency around September 7 — it is a checkpoint, not the
  final defense
- Long responses when a short one answers the question

When Darryl corrects a wrong assumption, accept it and move on. The `.md`
and `.sql` files describe the real system; the manuscript describes the
approved design. **When they conflict, say so plainly** rather than assuming
either one is wrong.

---

## UPDATING THIS FILE

See **End of Every Session** above for the exact prompt to paste.

List **endpoints, not percentages.** A percentage is an opinion; an endpoint
is a fact. `PROJECT_PROGRESS.md` drifted because it listed planned modules as
progress — do not let this file do the same.

---

## CHANGELOG

| Date | Change |
|------|--------|
| 2026-08-26 | Login now asserts `status === 'active'` before `signToken`. Test added. |
| 2026-08-13 | Auth backend complete — login, JWT, RBAC, approve/reject. 23 tests. |
| 2026-08-12 | Database schema + seed, 18 tables. `.gitignore` added. |
| 2026-08-15 | Build restarted from zero. No legacy code. |