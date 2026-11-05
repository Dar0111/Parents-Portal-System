# Parent's Portal System — System Architecture (v2.0)

**School:** Captain H. Francisco Elementary School (Grades 1–6)  
**Aligned with:** FINAL-PARENTS-PORTAL-SYSTEM specification

---

## 1. Overview

> Pre-build design text (2026-11-06); the built behaviour is in `CLAUDE.md:574` (messaging over Socket.io, built) and `CLAUDE.md:1676` (notifications in-app only, via Socket.io; no push).

Web + mobile (React Native Expo) portal for parents, teachers, and the school principal (admin). Single REST API backed by PostgreSQL on Supabase (since 2026-10-27). Real-time messaging via Socket.io (planned). Push notifications on Expo (planned).

**Build order:** Database → Auth → Backend → Web → Expo

---

## 2. Authentication (Locked)

| Role    | Login ID        | Password set by        | Initial status |
|---------|-----------------|------------------------|----------------|
| Parent  | Child LRN       | Teacher                | `pending` → Admin approves → `active` |
| Teacher | Teacher ID      | Admin                  | `active` immediately |
| Admin   | Admin ID        | Seeded (single principal) | `active` |

- **No** open self-registration
- **No** grade-level selection after login
- Email + phone collected; login uses `login_id` only
- Password change optional via profile

**Example:** Same guardian (Ashley), two accounts — one logs in with Marwin's LRN, the other with Jea's.

---

## 3. Tech Stack

| Layer   | Technology |
|---------|------------|
| Backend | Node.js, Express, PostgreSQL on Supabase (`pg`; Singapore, `ap-southeast-1`), JWT, bcrypt, Socket.io |
| Hosting | The API and the web build on the Hostinger VPS (Ubuntu 24.04), behind Nginx, the API run by PM2; two hostnames, `srv2110222.hstgr.cloud` and `chfes-main-parents-portal.online` (`deploy/README.md`) |
| Web     | React, Tailwind CSS, Font Awesome |
| Mobile  | React Native Expo (all roles) |

---

## 4. API Modules (DFD Figure 5)

| Module | Roles |
|--------|-------|
| Login, Change Password | All |
| Student Grades, Attendance, Announcements, Messages, Memos, Events, Excuse Letter | Parent (+ teacher/admin as applicable) |
| Enrolled Student List, Create Account | Teacher |
| Manage User, System Setting, Backup & Restore | Admin (Backup & Restore web only; the Activity log and Assignments & advisers, outside Figure 5, are web only too) |

**Excluded:** QR attendance, online payment, enrollment/transcript, schedule grid, college grading.

---

## 5. Grading Rules

> Pre-build design text (2026-11-06); the built behaviour is in `docs/GRADING_SPEC.md:534` (three terms), `docs/GRADING_SPEC.md:51` and `:230` (the weights; Grade 1's letter) and `CLAUDE.md:1395` (attendance per day, not per subject).

- Quarters: Q1–Q4
- **G1–G3 weights:** Quiz 30% · Activity 50% · Exam 20%
- **G4–G6 weights:** Quiz 40% · Activity 40% · Exam 20%
- `grade_components` stores individual quiz/activity scores for transparency
- Attendance: per day, per subject — Present / Absent / Late / Excused

---

## 6. Account Lifecycle

```
Teacher creates parent (LRN + password) → status: pending
Admin approves → status: active → parent can login
Admin rejects → status: rejected (with reason)

Admin creates teacher → status: active → teacher can login immediately
```

---

## 7. REST Endpoints (Auth — implemented)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | Public | Login with `login_id` + password |
| GET | `/api/auth/me` | Authenticated | Current user profile |
| PUT | `/api/auth/change-password` | Authenticated | Change password |
| POST | `/api/users/teachers` | Admin | Create teacher |
| POST | `/api/users/parents` | Teacher | Create parent (pending) |
| GET | `/api/users/parents/pending` | Admin | List pending parents |
| PUT | `/api/users/parents/:id/approve` | Admin | Approve parent |
| PUT | `/api/users/parents/:id/reject` | Admin | Reject parent |

---

## 8. JWT Payload

```json
{
  "id": 1,
  "role": "parent|teacher|admin",
  "login_id": "<the child's LRN>",
  "student_id": 1
}
```

---

## 9. Database Schema

> Pre-build design text (2026-11-06); the built schema is `migration/schema/001_portal_schema.sql:1` (PostgreSQL, schema `portal`; the table count is `CLAUDE.md:32`).

See `database/schema.sql`. Tables:

| Table | Purpose |
|-------|---------|
| `users` | All accounts (parent/teacher/admin) |
| `students` | Enrolled learners (LRN unique) |
| `subjects` | DepEd subjects per grade (G1–G6) |
| `teacher_assignments` | Teacher ↔ subject ↔ section |
| `grade_weight_configs` | Quiz/activity/exam weights by grade band |
| `grades` | Quarterly grades per student/subject |
| `grade_components` | Individual quiz/activity entries |
| `attendance` | Daily per-subject attendance |
| `excuse_letters` | Parent-submitted absence excuses |
| `messages` | Direct messaging |
| `announcements` | School/grade announcements |
| `memos` | Admin memos |
| `events` | Calendar events |
| `activity_logs` | Audit trail |
| `system_settings` | School name, year, quarter, etc. |
| `backups` | Backup metadata (web admin) |

---

## 10. Seed Data

See `database/seed.sql` + `server/scripts/setup-db.js`.

| Account | Login ID | Password | Status |
|---------|----------|----------|--------|
| Admin | ADMIN001 | the seeded default (set by the seed script, `server/scripts/setup-db.js`; never written in docs) | active |
| Teacher | TCH-001 | the seeded default | active |
| Parent (Marwin) | the child's LRN | the seeded default | active |
| Parent (Jea) | the child's LRN | the seeded default | pending |

---

## 11. Setup & Test

```bash
cd server
cp .env.example .env    # configure the PG_* keys + JWT_SECRET
npm install
npm run db:setup
npm start
npm run test:auth       # in another terminal
```

---

## 12. Timeline

> Pre-build design text (2026-11-06); September 7, 2026 was the proposal checkpoint, not the defense (`CLAUDE.md:33`), and the final defense is 2026-11-11 through 2026-11-13 (`AGENTS.md:58`).

**Deadline:** September 7, 2026 | Solo developer
