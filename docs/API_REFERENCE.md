# API Reference — Parent's Portal System

Generated 2026-09-06 by reading every file in `server/routes/` and
`server/middleware/auth.js` directly — not from CLAUDE.md's summaries.
**84 endpoints** across 14 route files (17 feature tables below, since
`content.js` holds three separate resources and `assignments.js` holds
two). If this document and the
code disagree, the code is correct and this file needs fixing — same
rule as CLAUDE.md.

Built for Stage 4 web screens: every screen calls 2-4 endpoints, and the
one thing you cannot guess correctly from a route's name is its response
wrapper key. That's why section 7 exists and why every table row repeats
it.

---

## 1. Front matter

- **Base URL**: `http://localhost:5000` in dev (`VITE_API_BASE_URL` on
  the client side). Every route below is relative to `/api`.
- **Auth header**: `Authorization: Bearer <token>` on every endpoint
  except `POST /api/auth/login` and `GET /api/health`. `<token>` is the
  bare `token` field `POST /api/auth/login` returns at the top level of
  its response — not nested under `user`.
- **`GET /api/health`** — public, no auth. `{ success: true, message: "Parents Portal API is running." }`. Not in any table below; it isn't a feature, it's a liveness check. Defined directly in `server.js`, not in `server/routes/`.
- **Unmatched route** — any path under `/api` that hits nothing above
  returns `404` with `{ success: false, message: "Route not found." }`.
- **Uncaught error** — any unhandled exception anywhere returns `500`
  with `{ success: false, message: "Internal server error." }`. No stack
  trace or internal detail ever reaches the client.

---

## 2. Conventions

- **Dates** (`birthday`, `date`, `due_date`, `absence_date`,
  `event_date`) are DATE columns and always come back as plain
  `"YYYY-MM-DD"` strings — never a JS `Date`, never a time component.
  This is `dateStrings: ['DATE']` on the connection pool, applied
  pool-wide, not per-query.
- **Timestamps** (`created_at`, `updated_at`) are TIMESTAMP columns and
  are *not* covered by the setting above — they come back as full ISO
  8601 strings. Two different column types, two different string shapes.
  Don't assume one date-parsing strategy covers both.
- **DECIMAL columns come back as strings**, not numbers — a mysql2
  behavior, not a choice made here. `"90.00"`, not `90`. Affects:
  `grades.ww_percentage` / `pt_percentage` / `ex_percentage` /
  `ww_weighted` / `pt_weighted` / `ex_weighted` / `initial_grade` /
  `term_grade`, and `contributions.amount` / `contribution_records.amount`.
  Coerce with `Number()` before doing math or comparisons. See the
  Gotchas section for the one place this is *not* true.
- **No pagination anywhere.** All 84 endpoints return their complete
  filtered result set. There is no `?page=`, `?limit=`, or cursor param
  on any list endpoint in this API.
- **Numeric path params** (`:id`, `:studentId`, `:componentId`,
  `:userId`) are validated by `parseId()` — a positive integer, or the
  request is rejected with `400` before any query runs. One exception:
  see Gotchas.
- **Error shape** is `{ success: false, message: "..." }` on essentially
  every 4xx/5xx across the whole API — this is uniform enough that you
  can assume it by default. The two places it isn't are in the Gotchas
  section below; there is no third.

---

## 3. Gotchas — things you will otherwise find by debugging

These are the specific findings from reading all fourteen route files side
by side. Nothing here is guessed — every line traces to a specific file.

- **`~30` distinct response wrapper keys, plus 4 shapes with no single
  wrapper key at all.** See the full catalog in section 7. This is the
  single biggest source of wrong guesses in this API — there is no
  consistent rule (not "always the singular resource name," not "always
  `data`") to derive a wrapper key from a path.
- **`POST /api/backups/:id/restore` is the ONE endpoint in this entire
  API where `success: true` does not mean the operation fully
  succeeded.** If the post-restore bookkeeping step fails (marking every
  session invalid), the response is still `200`/`success: true`, with a
  message reading "Database restored, but marking sessions invalid
  failed — see server logs...". Everywhere else in this API, checking
  `success` is sufficient. Here, you must also read the message.
- **Teacher scope width silently differs by module.** Contributions and
  events scope a teacher by **grade alone** — any section within that
  grade — because neither table has a section column
  (`teacherHasGradeAssignment`). Students, grades, excuse-letters, and
  announcements scope a teacher by **exact grade + section**
  (`teacherHasAssignment` / the `EXISTS`-on-`teacher_assignments`
  pattern with both `grade_level` and `section` matched). Concretely: a
  teacher assigned to only Grade 6 - Malikhain can post a contribution
  or event visible to Grade 6 - Masigasig too, but cannot see, edit, or
  view a *student* in Grade 6 - Masigasig. This is not documented
  anywhere else in the codebase — it only shows up by reading
  `resolveContributionGrade`/`resolveEventTarget` next to
  `teacherHasAssignment` in `students.js`/`content.js` and noticing one
  checks `grade_level` alone and the other checks both columns.
- **`mine` vs. `my-records`.** `GET /api/excuse-letters/mine` and
  `GET /api/contributions/my-records` are the identical "show me my own
  stuff" concept, spelled two different ways in two different modules.
  Guessing one from the other will be wrong exactly half the time.
- **`PUT` for approve/reject, `PATCH` everywhere else.**
  `PUT /api/users/parents/:id/approve` and
  `PUT /api/users/parents/:id/reject` are the only status-transition
  endpoints in the whole API using `PUT`. Every other status flip —
  `PATCH /api/students/:id/status`, `PATCH /api/users/:id/status`,
  `PATCH /api/sections/:id/adviser`, `PATCH /api/grades/:id/lock`,
  `PATCH /api/excuse-letters/:id/review`,
  `PATCH /api/contributions/:id/records/:studentId` — uses `PATCH`.
  Flagging this as an **apparent inconsistency**, not a documented
  decision: nothing in the code comments justifies the `PUT` choice on
  those two endpoints specifically.
- **`message` / `messages` / `data` collide in `messages.js`.** Every
  endpoint's top-level `message` field is the human-readable status
  string ("Message sent."), following this API's universal envelope —
  but the actual sent/updated message *entity* lives under a separate
  `data` key, the only place in the whole API using that generic name
  instead of a domain-specific one. Meanwhile `GET /with/:userId`'s
  thread array is keyed `messages` (plural, unrelated to the `message`
  status-string field). Three similarly-spelled keys, three different
  meanings, one file.
- **DECIMAL-as-string applies to *stored* grade columns, not *computed*
  ones — same module, two behaviors.** `grades` table columns read
  directly (`ww_percentage`, `term_grade`, etc., see Conventions above)
  come back as strings. But `final_grade` and `general_average` on
  `GET /api/grades/student/:studentId` are computed in JavaScript at
  read time (`utils/gradeComputation.js`'s `roundTo2`) and come back as
  **real numbers already** — no coercion needed, and coercing them again
  is harmless but pointless. Same grades module, two different wire
  types depending on whether the field is stored or derived.
- **`is_locked` is `0`/`1` on the bare row, `true`/`false` inside the
  report card.** Every endpoint that returns a bare `grades` row
  (`POST /`, `POST /:id/components`, `PATCH /:id/exam`, etc., and the
  `grade` key on `GET /:id`) returns `is_locked` as the raw MySQL
  TINYINT — `0` or `1`. `GET /api/grades/student/:studentId`'s per-term
  entries explicitly coerce it (`!!gradeRow.is_locked`) to a real JS
  boolean. Same column, two shapes, depending which endpoint you hit.
- **No pagination anywhere** — repeated from Conventions because it's
  worth confirming explicitly rather than searching for a param that
  isn't there.
- **`:key` in `GET`/`PUT /api/settings/:key` is the only string-typed
  path param in the entire API.** Every other bracketed path segment
  (`:id`, `:studentId`, `:componentId`, `:userId`) is a numeric id
  validated by `parseId()`. A generic "fetch resource by id" client
  helper written against the rest of this API will not work here.
- **`user` on login / `GET /auth/me` / `PUT /auth/contact` has no `lrn`
  key.** All three come from `fetchUserByLoginId()`, which LEFT JOINs
  `students` for `student_first_name`, `student_last_name`,
  `grade_level`, and `section` only. A parent's `login_id` IS the
  child's LRN, so selecting `s.lrn` duplicated the credential. After
  this the key is **absent, not `null`**. Teacher and admin rows used
  to carry `lrn: null` from the LEFT JOIN; `'lrn' in user` is now
  false for every role — a different answer than `user.lrn == null`.
  Parent still has the four JOIN fields populated. `PUT /contact` still
  **rejects** `lrn` in the request body (`400`) — that is a forbidden
  identity field, not a response key. Other user payloads (create
  parent, pending queue, approve) still JOIN `s.lrn`; those are admin
  / teacher acting on a student, not the session.

---

## 4. Role scoping legend

"Teacher" alone is not enough — this codebase has seven distinct scope
shapes, each a genuinely different SQL predicate. Every table below uses
these codes instead of re-explaining the shape on every row.

| Code | Meaning |
|---|---|
| `admin` | Unscoped — every row, no further check |
| `all` | Every authenticated role sees the identical, unfiltered view (no per-role filtering at all) |
| `own` | Parent — their own child / own submitted resource only |
| `grade` | Teacher — any section within an assigned grade (no section column exists on this table to check further) |
| `wide` | Teacher — exact grade + section match, **any** subject (`teacher_assignments`, grade+section only) |
| `subject` | Teacher — exact grade + section **+ subject** match (`teacher_assignments`, all three) |
| `adviser` | Teacher — `sections.adviser_id` match only, independent of `teacher_assignments` |
| `author` | Teacher or admin — `posted_by` ownership on the specific row (edit/delete only) |

`wide` is always broader than `subject` where both exist on the same
resource (Grades: any teacher assigned to the section can **read**
`wide`, only the subject's own teacher can **write** `subject` — see
section 5).

---

## 5. 404 vs. 403 — the rule

A `:id`-keyed write with **no broader `GET` covering the same resource**
defaults to `404` on out-of-scope — a true "you cannot see this at all"
signal (attendance, contributions, students, most of excuse-letters).
Where a **wider `GET` already reveals the resource** to a caller who
still can't act on it, the write answers `403` naming the specific
reason instead — a `404` there would contradict what `GET` just showed
them. This applies to Grades' five `:id`-keyed write endpoints (`wide`
read-scope vs. `subject` write-scope) and Excuse Letters' review endpoint
(`wide` read-scope vs. `adviser` review-scope). Each table below flags
`404`/`403` per row only where it isn't obvious from the Role column
alone.

**One deliberate read-side 403:** `GET /api/assignments?teacher_id=` of
another teacher is `403`, not `404`. Anti-enumeration does not apply —
`GET /api/messages/contacts` already lists every teacher this caller may
see, by name. A 404 would hide nothing and cost clarity. Do not "fix" it.

---

## 6. Socket.io

- Connect with `io(url, { auth: { token } })` — the same JWT as REST.
  Verified once, at connection time, via `io.use()` — not re-checked
  per event. A deactivated account's socket is rejected at the handshake
  and never gets to send or receive anything.
- No client-emitted events exist. This is receive-only from the
  client's perspective.
- On connect, the server automatically joins the socket to a room named
  `user:<your user id>` — nothing for the client to do to "subscribe."
- **One event**: `new_message`, emitted only by `POST /api/messages`
  after the row is persisted (REST is the source of truth; the socket
  emit happens after, never instead of). Payload is the full `messages`
  row: `{ id, sender_id, receiver_id, body, read_status, created_at }`.
  Delivered only to the recipient's room — never a broadcast.

---

## 7. Response wrapper catalog

The full list, one row per concept (singular/plural pairs and
multi-field buckets collapsed into one row — literal key-name count is
higher, this is the concept count referenced above). **Shape** tells you
what to expect on the wire.

| Key(s) | Shape | Used by |
|---|---|---|
| `token` | string | `POST /auth/login` (top-level, alongside `user`) |
| `user` | object | `POST /auth/login`, `GET /auth/me`, `PUT /auth/contact`, `POST /users/teachers`, `POST /users/parents`, `PUT /users/parents/:id/approve`, `GET /users`, `GET /users/:id`, `PUT /users/:id`, `PATCH /users/:id/status` |
| `users` | array | `GET /users` |
| `parents` | array | `GET /users/parents/pending` |
| `student` | object | `GET /students/:id`, `POST /students`, `PUT /students/:id`, `PATCH /students/:id/status` — **note:** a *different*, smaller shape (`{id, first_name, last_name, grade_level, section}`) also appears as `student` inside `GET /grades/student/:studentId`'s response — same key name, two different row shapes, two different modules |
| `students` | array | `GET /students` |
| `section` | object | `GET /sections/:id`, `PATCH /sections/:id/adviser` |
| `sections` | array | `GET /sections` |
| `subjects` | array of `{id, name, grade_level}` | `GET /subjects` — **same key name, different row shape** from the report-card `subjects` array inside `GET /grades/student/:studentId` |
| `assignments` | array | `GET /assignments` |
| `assignment` | object | `POST /assignments` |
| `grading_mode` | object `{ grade_level, school_year, mode }` | `GET /grading-modes` — **same key name, different shape** from the STRING on `GET /grades/student/:studentId` |
| `grade` | object | `GET /grades/:id`, `POST /grades`, `POST /grades/:id/components`, `PUT /grades/:id/components/:componentId`, `DELETE /grades/:id/components/:componentId`, `PATCH /grades/:id/exam`, `PATCH /grades/:id/descriptive`, `PATCH /grades/:id/lock` |
| `grades` | array | `GET /grades` |
| `grade_components` | array | `GET /grades/:id` (secondary key, alongside `grade`) |
| `descriptor` | object or `null` | `GET /grades/:id` (secondary key, alongside `grade`) |
| `component` | object | `POST /grades/:id/components`, `PUT /grades/:id/components/:componentId` (secondary key, alongside `grade`) |
| `student`, `school_year`, `grading_mode`, `subjects`, `general_average`, `general_average_descriptor` | 6 flat top-level keys, no `grade`/`grades` key at all; `grading_mode` here is a **string** (`numerical`\|`descriptive`) | `GET /grades/student/:studentId` only — see `GET /grading-modes` above for the object shape of the same key |
| `attendance` | object (single-record endpoints) **or** array (list endpoints) — same key name, cardinality depends on which endpoint | `GET /attendance`, `GET /attendance/student/:studentId`, `POST /attendance`, `POST /attendance/bulk`, `PUT /attendance/:id` |
| `summary` | object | `GET /attendance/summary/:studentId` |
| `announcement` | object | `POST /announcements`, `PUT /announcements/:id` |
| `announcements` | array | `GET /announcements` |
| `memo` | object | `POST /memos`, `PUT /memos/:id` |
| `memos` | array | `GET /memos` |
| `event` | object | `POST /events`, `PUT /events/:id` |
| `events` | array | `GET /events` |
| `contribution` | object | `GET /contributions/:id`, `GET /contributions/:id/records` (secondary), `POST /contributions`, `PUT /contributions/:id` |
| `contributions` | array | `GET /contributions` |
| `records` | array — **two different row shapes reuse this same key name** | `GET /contributions/my-records` (parent's own summary rows), `GET /contributions/:id/records` (full roster, secondary key alongside `contribution`) |
| `record` | object | `PATCH /contributions/:id/records/:studentId` |
| `excuse_letter` | object | `GET /excuse-letters/:id`, `POST /excuse-letters`, `PUT /excuse-letters/:id`, `PATCH /excuse-letters/:id/review` |
| `excuse_letters` | array | `GET /excuse-letters/mine`, `GET /excuse-letters` |
| `settings` | flat object (`{key: value}`), not an array | `GET /settings`, `PATCH /settings` |
| `key`, `value` | bare strings, no wrapper object | `GET /settings/:key`, `PUT /settings/:key` |
| `backups` | array | `GET /backups` |
| `orphaned_files` | array | `GET /backups` (secondary key, alongside `backups`) |
| `backup` | object | `POST /backups` |
| `restored_from`, `safety_backup`, `activity_logs_wiped` | 3 flat top-level keys, **no `backup` key at all** | `POST /backups/:id/restore` only |
| `conversations` | array | `GET /messages/conversations` |
| `messages` | array | `GET /messages/with/:userId` |
| `data` | object — generic name, the one exception in this whole API | `POST /messages`, `PATCH /messages/:id/read` |
| `count` | bare number, no wrapper object | `PATCH /messages/read-all/:userId` |

**No payload at all** (message only) — the four hard-deletes
(`DELETE /announcements/:id`, `DELETE /memos/:id`, `DELETE /events/:id`,
`DELETE /contributions/:id`), `DELETE /backups/:id`,
`DELETE /assignments/:id`, `DELETE /grades/:id`,
`PUT /users/parents/:id/reject`, `PUT /auth/change-password`.

**Not JSON at all on success** —
`GET /backups/:id/download` streams the file as a binary attachment;
only its error paths (`404`) return the usual JSON shape.

---

## 8. Endpoint tables

Each table's endpoint count is stated in its heading. Running total at
the bottom must equal 82.

### Auth (4) — `/api/auth`

| Method | Path | Roles | Request body | Response key |
|---|---|---|---|---|
| POST | `/login` | public | `login_id`*, `password`* | `token` + `user` (see Gotchas: 403 for pending/rejected/inactive also carries an extra `status` field) |
| GET | `/me` | any authenticated | — | `user` |
| PUT | `/change-password` | any authenticated | `current_password`*, `new_password`* (min 6 chars) | message only |
| PUT | `/contact` | any authenticated | `contact_number`* (non-empty, max 20 chars) — `name`/`email`/`login_id`/`lrn`/`role`/`student_id`/`password`/`status` are rejected with `400` if present | `user` |

### Users (9) — `/api/users`

| Method | Path | Roles | Request body | Response key |
|---|---|---|---|---|
| POST | `/teachers` | `admin` | `login_id`*, `password`*, `name`*, `email`, `contact_number` | `user` |
| POST | `/parents` | `teacher` (`wide` — any assignment, unrelated to the student being enrolled) | `lrn`*, `password`*, `name`*, `email`, `contact_number` | `user` |
| GET | `/parents/pending` | `admin` | — | `parents` |
| PUT | `/parents/:id/approve` | `admin` | — | `user` |
| PUT | `/parents/:id/reject` | `admin` | `reason`* | message only |
| GET | `/` | `admin` | query: `role`, `status`, `search` | `users` |
| GET | `/:id` | `admin` | — | `user` |
| PUT | `/:id` | `admin` | `name`, `email`, `contact_number` (any subset) — `role`/`login_id`/`student_id`/`password`/`status` are rejected with `400` if present | `user` |
| PATCH | `/:id/status` | `admin` | `status`* (`active`\|`inactive`) | `user` |

### Students (5) — `/api/students`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `teacher(wide)`, `admin` | query: `grade_level`, `section`, `status`, `search` | `students` | |
| GET | `/:id` | `teacher(wide)`, `admin`, `parent(own)` | — | `student` | `404` out-of-scope |
| POST | `/` | `teacher(wide)`, `admin` | `lrn`*, `first_name`*, `last_name`*, `grade_level`*, `section`*, `birthday`, `gender`, `address`, `contact_number` | `student` | teacher out-of-scope → `403` |
| PUT | `/:id` | `teacher(wide)`, `admin` | `first_name`, `last_name`, `grade_level`, `section`, `birthday`, `gender`, `address`, `contact_number` (any subset) | `student` | `404` out-of-scope. Differing `grade_level`/`section` → `400` (whole request refused). Matching class may set `section_id` when it is NULL (same resolve as POST); unmatched resolve does not fail the PUT |
| PATCH | `/:id/status` | `admin` | `status`* (`active`\|`inactive`) | `student` | |

### Sections (3) — `/api/sections`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `all` | query: `grade_level`, `school_year` | `sections` | unscoped reference data |
| GET | `/:id` | `all` | — | `section` | `404` only for a genuinely nonexistent id |
| PATCH | `/:id/adviser` | `admin` | `adviser_id`* (positive integer or `null`) | `section` | |

### Subjects (1) — `/api/subjects`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `all` | query: `grade_level` (optional, 1–6) | `subjects` | unscoped reference data; no `GET /:id`; inventory is seeded, not managed through this API |

### Assignments (3) — `/api/assignments`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `teacher` (own rows only), `admin` | query: `teacher_id` (optional; admin anyone, teacher forced to self) | `assignments` | teacher naming another `teacher_id` → `403` (not `404` — contacts already lists teachers; see §5) |
| POST | `/` | `admin` | `teacher_id`*, `subject_id`*, `section`* | `assignment` | `grade_level` from the subject row, never the body; `section_id` resolved against `sections` for current `academic_year`; duplicate → `409`; inactive/non-teacher → `400` |
| DELETE | `/:id` | `admin` | — | message only | does **not** refuse when grades exist; a scope change removes future authority, never past records |

### Grades (11) — `/api/grades`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `teacher(wide)`, `admin`, `parent(own)` | query: `student_id`, `subject_id`, `term`, `school_year` (all optional, no defaults) | `grades` | parent naming a different `student_id` → `403` |
| GET | `/:id` | `teacher(wide)`, `admin`, `parent(own)` | — | `grade` + `grade_components` + `descriptor` | `404` out-of-scope |
| GET | `/student/:studentId` | `teacher(wide)`, `admin`, `parent(own)` | query: `school_year` (optional, defaults to `system_settings.academic_year`) | `student`+`school_year`+`grading_mode`+`subjects`+`general_average`+`general_average_descriptor` (no `grade`/`grades` key) | `404` out-of-scope |
| POST | `/` | `teacher(subject)`, `admin` | `student_id`*, `subject_id`*, `term`*, `school_year`* | `grade` | teacher out-of-scope → `403`; nonexistent `student_id` → `404` admin / `403` teacher |
| POST | `/:id/components` | `teacher(subject)`, `admin` | `type`* (`WW`\|`PT`), `score`*, `max_score`*, `label`*, `date_recorded` | `component` + `grade` | `403` naming the subject if `wide` but not `subject`; `404` if outside `wide` entirely |
| PUT | `/:id/components/:componentId` | `teacher(subject)`, `admin` | `score`, `max_score`, `label`, `date_recorded` (any subset — `type` not editable, `400` if sent differently) | `component` + `grade` | same `403`/`404` split; mismatched `componentId` → `404` |
| DELETE | `/:id/components/:componentId` | `teacher(subject)`, `admin` | — | `grade` | same `403`/`404` split; mismatched `componentId` → `404` |
| PATCH | `/:id/exam` | `teacher(subject)`, `admin` | any subset of `st1_score`/`st1_max`/`st2_score`/`st2_max`/`te_score`/`te_max` (score+max always paired; explicit `null` clears both) | `grade` | same `403`/`404` split |
| PATCH | `/:id/descriptive` | `teacher(subject)`, `admin` | `descriptive_grade`* (`A`-`E` or `null`) | `grade` | same `403`/`404` split |
| PATCH | `/:id/lock` | `admin` only | `is_locked`* (boolean) | `grade` | unscoped, no `403`/`404` split |
| DELETE | `/:id` | `admin` only | — | message only | unscoped; `403` when locked (`This grade is locked and cannot be deleted.`); `404` when missing; `grade_components` cascade |

### Grading modes (1) — `/api/grading-modes`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `all` | query: `grade_level`* (1–6), `school_year` (optional; defaults to `system_settings.academic_year`) | `grading_mode` (**object** `{ grade_level, school_year, mode }`) | missing config → `409` (same status both `grades.js` readers use); not a `system_settings` key; same wrapper key as the report card's **string** `grading_mode` — do not flatten |

### Attendance (6) — `/api/attendance`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `teacher(adviser)`, `admin` | query: `student_id`, `grade_level`, `section`, `date`, `from`, `to`, `status` | `attendance` (array) | |
| GET | `/student/:studentId` | `teacher(adviser)`, `admin`, `parent(own)` | query: `from`, `to`, `status` | `attendance` (array) | `404` out-of-scope |
| GET | `/summary/:studentId` | `teacher(adviser)`, `admin`, `parent(own)` | query: `from`, `to` | `summary` | `404` out-of-scope; raw counts only, no rate |
| POST | `/` | `teacher(adviser)`, `admin` | `student_id`*, `date`*, `status`* (`Present`\|`Absent`\|`Late`\|`Excused`) | `attendance` (single) | teacher out-of-scope → `403` |
| POST | `/bulk` | `teacher(adviser)`, `admin` | `section_id`*, `date`*, `entries`* (array of `{student_id, status}`) | `attendance` (array) | teacher out-of-scope → `403`; this is the **primary** path, not a convenience alias |
| PUT | `/:id` | `teacher(adviser)`, `admin` | `status`* | `attendance` (single) | `404` out-of-scope |

### Announcements (4) — `/api/announcements`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `all` (scoped by audience — school-wide + own grade/section) | query: `category`, `grade_level`, `section` | `announcements` | each row includes `posted_by` (numeric user id) **and** `posted_by_name` (`users.name` string). No `GET /:id`. |
| POST | `/` | `teacher(wide)`, `admin` | `title`*, `content`*, `category`, `target_grade`, `target_section`, `attachment_url` | `announcement` | teacher omitting `target_grade`/`target_section` → `403`. Same `posted_by` + `posted_by_name` as the list. |
| PUT | `/:id` | `author`, `admin` | `title`, `content`, `category`, `target_grade`, `target_section`, `attachment_url` (any subset) | `announcement` | non-author → `403`. Same `posted_by` + `posted_by_name`; edit does not rewrite the poster. |
| DELETE | `/:id` | `author`, `admin` | — | message only | non-author → `403`; hard delete |

### Memos (4) — `/api/memos`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `all` — no targeting, school-wide by schema design | — | `memos` | each row includes `posted_by` (numeric user id) **and** `posted_by_name` (`users.name` string). No `GET /:id`. |
| POST | `/` | `admin` only | `title`*, `content`*, `attachment_url` | `memo` | Same `posted_by` + `posted_by_name` as the list. |
| PUT | `/:id` | `admin` only | `title`, `content`, `attachment_url` (any subset) | `memo` | Same `posted_by` + `posted_by_name`; edit does not rewrite the poster. |
| DELETE | `/:id` | `admin` only | — | message only | hard delete |

### Events (4) — `/api/events`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `all` (scoped by audience — school-wide + own grade; no section column) | query: `grade_level`, `from`, `to` | `events` | each row includes `posted_by` (numeric user id) **and** `posted_by_name` (`users.name` string). No `GET /:id`. |
| POST | `/` | `teacher(grade)`, `admin` | `title`*, `description`, `event_date`*, `target_grade` | `event` | teacher omitting `target_grade` → `403`; `event_date` >1 year ahead → `400`. Same `posted_by` + `posted_by_name` as the list. |
| PUT | `/:id` | `author`, `admin` | `title`, `description`, `event_date`, `target_grade` (any subset) | `event` | non-author → `403`. Same `posted_by` + `posted_by_name`; edit does not rewrite the poster. |
| DELETE | `/:id` | `author`, `admin` | — | message only | non-author → `403`; hard delete |

### Contributions (8) — `/api/contributions`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `teacher(grade)`, `admin`, `parent(own)` | query: `grade_level` | `contributions` | see Gotchas: `grade`-only teacher scope |
| GET | `/my-records` | `parent` only | — | `records` | own child's rows only |
| GET | `/:id` | `teacher(grade)`, `admin`, `parent(own)` | — | `contribution` | `404` out-of-scope |
| GET | `/:id/records` | `teacher(grade)`, `admin` | — | `contribution` + `records` | `404` out-of-scope; live roster, Pending default |
| POST | `/` | `teacher(grade)`, `admin` | `title`*, `amount`* (positive), `grade_level`*, `due_date` | `contribution` | teacher out-of-scope → `403` |
| PUT | `/:id` | `author`, `admin` | `title`, `amount`, `grade_level`, `due_date` (any subset) | `contribution` | non-author → `403` |
| DELETE | `/:id` | `author`, `admin` | — | message only | non-author → `403`; `409` if any `contribution_records` exist |
| PATCH | `/:id/records/:studentId` | `teacher(grade)`, `admin` | `status`* (`Paid`\|`Pending`), `amount` (optional override, capped at the fee) | `record` | |

### Excuse Letters (6) — `/api/excuse-letters`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/mine` | `parent` only | — | `excuse_letters` | own letters only |
| GET | `/` | `teacher(wide)`, `admin` | query: `status`, `student_id`, `from`, `to` | `excuse_letters` | |
| GET | `/:id` | `parent(own)`, `teacher(wide)`, `admin` | — | `excuse_letter` | `404` out-of-scope |
| POST | `/` | `parent` only | `absence_date`*, `reason`*, `details` | `excuse_letter` | `parent_id`/`student_id`/`status` always from `req.user`, never the body. Unlinked parent (`users.student_id` NULL) is **409**, not 400 — the body is valid; `student_id` does not come from it. Same family as `POST /api/students` with no `academic_year` and a missing `grading_mode_configs` row. Message names the school office (parent-facing; matches Parent → Excuse Letters unlinked copy), not "An admin" |
| PUT | `/:id` | `parent(own)` | `absence_date`, `reason`, `details` (any subset) | `excuse_letter` | `404` if not theirs; `403` if already reviewed |
| PATCH | `/:id/review` | `teacher(adviser)`, `admin` | `status`* (`Approved`\|`Declined`), `teacher_remarks` | `excuse_letter` | `404` outside `wide` read-scope; `403` naming the reason if within `wide` but not `adviser`; `403` if already reviewed; never touches `attendance` |

### Settings (4) — `/api/settings`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `all` | — | `settings` (flat object) | only the 5 allow-listed keys |
| GET | `/:key` | `all` | — | `key` + `value` (bare) | `404` if not one of the 5 allow-listed keys; `:key` is a **string**, not `parseId`-validated |
| PUT | `/:key` | `admin` | `value`* | message + `key` + `value` | `400` if unknown key or fails per-key validation |
| PATCH | `/` | `admin` | `settings`* (object of key/value pairs) | `settings` (flat object) | all-or-nothing; `400` naming any unknown key or failing value before anything is written |

### Backups (5) — `/api/backups`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `admin` only | — | `backups` + `orphaned_files` | newest first; each row flags `file_exists` |
| POST | `/` | `admin` only | — | `backup` | real `mysqldump`; row inserted only after success |
| GET | `/:id/download` | `admin` only | — | binary file stream, no JSON on success | `404` if row or file missing |
| DELETE | `/:id` | `admin` only | — | message only | row still removed if file already gone |
| POST | `/:id/restore` | `admin` only | `password`*, `confirm_filename`* | `restored_from` + `safety_backup` + `activity_logs_wiped` | see Gotchas — the one `200`-but-degraded endpoint; `401` on wrong password, `400` on `confirm_filename` mismatch |

### Messages (6) — `/api/messages`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/contacts` | any authenticated | query: `search` (optional) | `contacts` (array) | Who this user may start a conversation with — the inverse of `canMessage()`. **parent** → teachers connected to their own child (assigned to the child's class OR its section adviser) + admins; **teacher** → parents of students in their own scope (assigned OR adviser) + other teachers + admins; **admin** → everyone else. **ACTIVE accounts only** — a pending parent cannot log in, so listing them would offer a conversation that cannot happen. `?search=` filters on contact name and student name **within the already-scoped set**, never an unscoped user search. Row: `{id, name, role, subject, student_name, student_grade_level, student_section, last_message, last_message_at, unread_count}`; `subject` and the three `student_*` fields are `null` where not applicable (teacher/admin rows have no linked student — the prefix marks the **child's** class, not the contact user's). Self always excluded. `GET /conversations` and `GET /with/:userId` do not carry class. |
| GET | `/conversations` | any authenticated | — | `conversations` | one row per person messaged, last message + unread count |
| GET | `/with/:userId` | any authenticated | — | `messages` (thread array) | participant-scoped, not re-checked against current `canMessage()` eligibility |
| POST | `/` | any authenticated | `receiver_id`*, `body`* | `data` | `403` naming the reason on a `canMessage()` violation; `404` if recipient not found/inactive; emits `new_message` over Socket.io |
| PATCH | `/:id/read` | any authenticated (recipient only) | — | `data` | non-recipient → `403` |
| PATCH | `/read-all/:userId` | any authenticated (recipient only, by construction) | — | `count` (bare number) | |

---

## Verification

| Table | Endpoints |
|---|---|
| Auth | 4 |
| Users | 9 |
| Students | 5 |
| Sections | 3 |
| Subjects | 1 |
| Assignments | 3 |
| Grades | 10 |
| Attendance | 6 |
| Announcements | 4 |
| Memos | 4 |
| Events | 4 |
| Contributions | 8 |
| Excuse Letters | 6 |
| Settings | 4 |
| Backups | 5 |
| Messages | 6 |
| **Total** | **82** |

Matches the Auth bump in this dispatch: 4+9+5+3+1+3+10+6+4+4+4+8+6+4+5+6 = 82.
`GET /grading-modes` has its own table above and is not in this sum (pre-existing).
`GET /api/health` is in `server.js`, not a route file.

**Verified by a three-way audit on 2026-09-07** (CLAUDE.md's endpoints table vs. this document vs. the handlers actually registered in `server/routes/` and mounted in `server/server.js`): all three agreed then at 77. Later additions: assignments/subjects (2026-09-08), grading-modes, `DELETE /grades/:id`, and `PUT /auth/contact` (2026-09-09). Re-run the existence diff after a dispatch that adds or removes an endpoint.

**Why CLAUDE.md's table has 85 rows and this verification says 82.**
This verification table is Auth 4 after `PUT /auth/contact`. It still lists Grades as 10 while the Grades table above is **11** (includes `DELETE /:id`), and it still omits `GET /grading-modes` (own table). 82 + those two = **84** handlers in `server/routes/`. Plus `GET /api/health` in `server.js` = **85**. Do not treat 82 as 84.
