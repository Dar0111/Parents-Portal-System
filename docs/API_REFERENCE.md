# API Reference — Parent's Portal System

Generated 2026-09-06 by reading every file in `server/routes/` and
`server/middleware/auth.js` directly — not from CLAUDE.md's summaries.
**86 handlers** across 15 route files, documented as **18 endpoint tables
in §8** (more tables than files, because `content.js` holds three separate
resources and `assignments.js` holds two), plus `GET /api/health` in
`server.js` = **87 endpoints**. That 18 counts MARKDOWN TABLES IN THIS
FILE — it is not a database-table count, and the database has 22. Recounted
from the code on 2026-09-19; see Verification at the bottom for the
per-file arithmetic and for which number to quote. If this document and the
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
  `term_grade`.
  Coerce with `Number()` before doing math or comparisons. See the
  Gotchas section for the one place this is *not* true.
- **No pagination anywhere.** All 76 endpoints return their complete
  filtered result set. There is no `?page=`, `?limit=`, or cursor param
  on any list endpoint in this API.
- **Numeric path params** (`:id`, `:studentId`, `:componentId`,
  `:userId`) are validated by `parseId()` — a positive integer, or the
  request is rejected with `400` before any query runs. One exception:
  see Gotchas.
- **Error shape** is `{ success: false, message: "..." }` on essentially
  every 4xx/5xx across the whole API — this is uniform enough that you
  can assume it by default. The two places it isn't are in the Gotchas
  section below; there is no third. **Since 2026-09-18 a refusal may also
  carry an optional `field`** naming the input the message belongs under.
  Where: `"current_password"` on change-password's `403` and
  `"new_password"` on its rule `400`; `"password"` on the rule `400` of
  `POST /users/teachers` and `POST /users/parents`; `"contact_number"` on
  every write of a contact number (`PUT /auth/contact`, both user creates,
  `PUT /users/:id`, `POST` and `PUT /students`); `"lrn"`, `"birthday"` and
  `"gender"` on `POST /students` (`"birthday"`/`"gender"` on `PUT` too);
  `"password"` and `"confirm_filename"` on the restore pre-flight refusals.
  Additive: `success` and `message` are unchanged, and a client that
  ignores `field` sees exactly what it saw before.
- **`401` means the session is dead; a live session is never `401`.**
  `middleware/auth.js` answers `401` for a missing/invalid/expired token, a
  token older than the restore cutoff, an unknown user and — since
  2026-09-18 — `"Account is not active."` for a deactivated, pending or
  rejected account (was `403`). The web client logs out and redirects on
  `401` only. `POST /auth/login` is the deliberate other half: the same
  inactive accounts get `403` + `status` there, because the credentials
  were right and the refusal carries a reason. A wrong password typed
  INSIDE a session (change-password, restore step-up) is `403`, never
  `401`.

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
- **Teacher scope width silently differs by module.** Events scope a
  teacher by **grade alone** — any section within that grade — because the
  table has no section column (`teacherHasGradeAssignment`). Students,
  grades, excuse-letters, and announcements scope a teacher by **exact
  grade + section** (`teacherHasAssignment` / the `EXISTS`-on-
  `teacher_assignments` pattern with both `grade_level` and `section`
  matched). Concretely: a teacher assigned to only Grade 6 - Malikhain can
  post an event visible to Grade 6 - Masigasig too, but cannot see, edit,
  or view a *student* in Grade 6 - Masigasig. It only shows up by reading
  `resolveEventTarget` next to `teacherHasAssignment` in
  `students.js`/`content.js`. (Contributions had the same grade-only scope
  until the module was removed on 2026-09-13.)
- **`PUT` for approve/reject, `PATCH` everywhere else.**
  `PUT /api/users/parents/:id/approve` and
  `PUT /api/users/parents/:id/reject` are the only status-transition
  endpoints in the whole API using `PUT`. Every other status flip —
  `PATCH /api/students/:id/status`, `PATCH /api/users/:id/status`,
  `PATCH /api/sections/:id/adviser`, `PATCH /api/grades/:id/lock`,
  `PATCH /api/excuse-letters/:id/review` — uses `PATCH`.
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
  come back as strings. But `final_grade`, `term_averages` and
  `general_average` on `GET /api/grades/student/:studentId` are computed
  in JavaScript at
  read time (`utils/gradeComputation.js`) and come back as
  **real numbers already** — no coercion needed, and coercing them again
  is harmless but pointless. Same grades module, two different wire
  types depending on whether the field is stored or derived.
- **TWO PRECISIONS, ONE LEVEL APART, AND BOTH ARE DELIBERATE**
  (2026-09-22). **`final_grade` is a WHOLE NUMBER** —
  `roundToWhole((t1+t2+t3)/3)`, half-up — because the school's Summary
  of Grades and DO 015 both print it as an integer, and its three inputs
  are already whole (a `term_grade` comes out of `transmutation_table`,
  an INT column). **`general_average` and `term_averages` are TWO
  DECIMALS, half-up, computed over the ALREADY-ROUNDED subject grades**:
  the school's own sheet adds eight whole finals and prints
  721 / 8 = 90.125 as **90.13**, so the average of whole numbers is
  itself not whole. Averaging unrounded finals would disagree with the
  sheet, because the sheet adds up the numbers a parent can see.
  `final_grade_descriptor` is computed from the ROUNDED value, so the
  band always matches the number printed beside it — which means 89.5
  becomes 90 and reads *Advancing*, not *Benchmarking*.
- **A `term_grade` is whole today but will not always be.** The
  transmutation table is seeded for SY 2026-2027 only; from
  SY 2027-2028 a year with no rows means "use the Initial Grade
  directly" (the data's absence drives it, by design), and Initial
  Grades carry two decimals. A client must therefore render a term
  grade as stored rather than forcing it to an integer — see
  `docs/KNOWN_ISSUES.md`.
- **`term_averages` keys are STRINGS, and all three are always present**
  (DV3, 2026-09-20). `{"1": 87.5, "2": null, "3": null}` — JSON has no
  numeric keys, so a caller indexing with a number works only because
  JavaScript coerces the property name; a language that does not will
  need the string. A key is never absent, so a caller can render three
  cells without checking, which is the opposite of `terms` on a subject,
  where a missing term is `null` because the grade ROW does not exist.
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
signal (attendance, students, most of excuse-letters).
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

### 5b. Two whole-session refusals every endpoint can return (R1, 2026-09-19)

Both come from `middleware/auth.js`, before any handler runs, so they are
not listed per row.

- **`401` "Your password was changed. Please log in again."** — the token's
  `v` claim does not equal the account's `users.token_version`. **That
  counter is the revocation mechanism**, bumped by a password change, a
  reset and an admin temporary password. A token with no `v` reads as 0, so
  tokens predating the column keep working until that account next changes
  its password. It is **not** `password_changed_at`, which is audit only: a
  timestamp cannot do this job, because `iat` has one-second resolution and
  every step of a scripted flow lands inside the same second. Two attempts
  failed that way before the counter; the long note is in
  `middleware/auth.js`.
- **`403` `{ message: "You must change your password before continuing.",
  code: "MUST_CHANGE_PASSWORD" }`** — `users.must_change_password` is set.
  Only `PUT /api/auth/change-password` and `GET /api/auth/me` are allowed
  through. **This 403 is a backstop for direct API callers, not a redirect
  signal**: §2 of CLAUDE.md's frontend conventions says a 403 never
  redirects, and the web client routes on the `must_change_password` field
  it already has from `/auth/me`. Do not add a client branch on this code.

The **global** cutoff (`auth_security_state.token_valid_after`, set only by
a restore) is unchanged and still a timestamp — it revokes everything at
once, where whole seconds are precise enough.

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
- **Two events** (`new_message` since Messages shipped, `notification_counts`
  since N1 on 2026-09-19). Both are emitted only AFTER the row they describe
  is persisted — REST is the source of truth and the socket emit happens
  after, never instead of — and both go to one room, never a broadcast.

| Event | Payload | Emitted by | Means |
|---|---|---|---|
| `new_message` | the full `messages` row: `{ id, sender_id, receiver_id, body, read_status, created_at }` | `POST /api/messages` | a message arrived, here it is |
| `notification_counts` | **NONE — deliberately** | `server/utils/notify.js`, after any fan-out commits | *your notifications changed; re-read them* |

- **`notification_counts` carries no payload on purpose, and a client must
  not invent one.** The count and the rows come from
  `GET /api/notifications/unread-counts` and `GET /api/notifications`; a
  client that incremented a local number on the event would be holding a
  second copy of a fact the server owns, which is the defect CLAUDE.md
  convention 5b describes one component further out. The client contract is:
  hear the event, refetch.
- For the grades hooks the emit happens **after `conn.commit()`**, never
  inside the transaction — a socket event for a row that rolled back would
  be the fake liveness convention 5g forbids.

---

## 6b. Pagination — every list endpoint (2026-09-19)

One contract, `server/utils/pagination.js`, on **16 list handlers**:
`GET /users`, `/users/parents/pending`, `/students`, `/grades`,
`/attendance`, `/attendance/student/:id`, `/excuse-letters`,
`/excuse-letters/mine`, `/announcements`, `/memos`, `/events`,
`/assignments`, `/backups`, `/messages/conversations`, `/messages/contacts`
and — on a cursor, see below — `/messages/with/:userId`. Not paginated, by
design: `/sections` (23 rows), `/subjects` (40), `/settings`,
`/grading-modes`, `/grades/student/:id` (a bounded report card),
`/attendance/summary/:id` (counts), and `backups`' `orphaned_files` (the
disk minus EVERY row — the same list on every page).

**Request** — all optional:

| Param | Meaning | Refusal |
|---|---|---|
| `limit` | rows per page, default **50**, max **200** | `400` "limit must be an integer between 1 and 200." |
| `offset` | rows to skip, default 0 | `400` "offset must be an integer of 0 or more." |
| `sort` | one key from that endpoint's allow-list (the row's table below names them) | `400` "sort must be one of: …" naming every allowed key |
| `order` | `asc` (default) or `desc`; requires `sort` | `400` "order must be 'asc' or 'desc'." / "order requires sort." |

**Response** — the endpoint's existing array key is unchanged (so `unwrap`
and every page keep working) and a sibling object is added:

```json
{ "success": true, "students": [ ... ], "page": { "limit": 50, "offset": 0, "total": 812, "has_more": true } }
```

`total` counts the **filtered, scoped** set — the same WHERE the rows came
from, so `?status=Pending` or `?search=` changes it (C4). `has_more` is
`offset + limit < total`. Without `sort` each handler keeps its own default
order; with it, the allow-listed expression is applied (a two-column key such
as `name` → `last_name, first_name` takes the direction on both columns) and
a row-id tiebreaker is always appended so no row can appear on two pages.

**Allow-lists** (key → what it orders by):

| Endpoint | Keys |
|---|---|
| `/users` | `name`, `login_id`, `role`, `status`, `created_at` |
| `/users/parents/pending` | `name`, `student` (last, first), `class` (grade, section), `created_at` |
| `/students` | `name`, `class`, `lrn`, `status`, `created_at` |
| `/grades` | `student`, `subject`, `term`, `school_year`, `updated_at` |
| `/attendance` | `date`, `student`, `class`, `status` |
| `/attendance/student/:id` | `date`, `status` |
| `/excuse-letters` | `student`, `class`, `absence_date`, `status`, `created_at` |
| `/excuse-letters/mine` | `absence_date`, `reason`, `status`, `created_at` |
| `/announcements` | `title`, `posted_by_name`, `created_at`, `category` |
| `/memos` | `title`, `posted_by_name`, `created_at` |
| `/events` | `title`, `event_date`, `posted_by_name`, `created_at` |
| `/assignments` | `class`, `subject`, `teacher` |
| `/backups` | `filename`, `created_at`, `file_size` |
| `/messages/conversations` | `other_user_name`, `last_message_at`, `unread_count` |
| `/messages/contacts` | `name`, `role`, `student_name`, `last_message_at` |

**The thread is the one cursor-paged list (C3).** `GET /messages/with/:userId`
takes `limit` and `before=<message_id>` and refuses `offset`, `sort` and
`order` with `400` ("This thread pages with before=<message_id>, not
offset."). No `before` returns the newest `limit` messages; `before=<id>`
returns the `limit` messages older than that id. Within a page the rows are
in reading order (oldest first), so a client prepends a page unchanged.
`page` here is `{ limit, before, total, has_more }` — `total` is the whole
thread, `has_more` is true when rows older than the oldest returned exist.
Offsets were rejected for the thread because Socket.io appends to it live:
an offset taken before a new message arrived would skip or repeat a row on
"Load earlier".

**Clients.** A table page sends one page (`listParams` in
`client/src/api/axios.js`, page size 50) and sorts server-side — `DataTable`
in paged mode emits the header click instead of sorting one page locally. A
caller that needs a COMPLETE set (a roster, a picker, a recorded-grades map)
uses `fetchAll`, which pages through at 200 until `has_more` is false, de-
duplicates by id across pages, and throws a user-facing error at 25 pages or
5,000 rows rather than looping (C2/C5). No client takes the first 50 of a set
it needs whole.

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
| `student`, `school_year`, `grading_mode`, `subjects`, `term_averages`, `general_average`, `general_average_descriptor` | **7** flat top-level keys, no `grade`/`grades` key at all; `grading_mode` here is a **string** (`numerical`\|`descriptive`). A client that unwraps by naming keys must name all seven — DV3 shipped with `term_averages` missing from the list and the general-average row rendered "Pending" while the API was answering correctly | `GET /grades/student/:studentId` only — see `GET /grading-modes` above for the object shape of the same key |
| `attendance` | object (single-record endpoints) **or** array (list endpoints) — same key name, cardinality depends on which endpoint | `GET /attendance`, `GET /attendance/student/:studentId`, `POST /attendance`, `POST /attendance/bulk`, `PUT /attendance/:id` |
| `summary` | object | `GET /attendance/summary/:studentId` |
| `announcement` | object | `POST /announcements`, `PUT /announcements/:id` |
| `announcements` | array | `GET /announcements` |
| `memo` | object | `POST /memos`, `PUT /memos/:id` |
| `memos` | array | `GET /memos` |
| `event` | object | `POST /events`, `PUT /events/:id` |
| `events` | array | `GET /events` |
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

**No payload at all** (message only) — the three hard-deletes
(`DELETE /announcements/:id`, `DELETE /memos/:id`, `DELETE /events/:id`),
`DELETE /backups/:id`,
`DELETE /assignments/:id`, `DELETE /grades/:id`,
`PUT /users/parents/:id/reject`, `PUT /auth/change-password`.

**Not JSON at all on success** —
`GET /backups/:id/download` streams the file as a binary attachment;
only its error paths (`404`) return the usual JSON shape.

---

## 8. Endpoint tables

Each table's endpoint count is stated in its heading. Running total at
the bottom must equal 86 handlers (87 with `GET /api/health`).

### Auth (8) — `/api/auth`

| Method | Path | Roles | Request body | Response key |
|---|---|---|---|---|
| POST | `/login` | public | `login_id`*, `password`* | `token` + `user` (see Gotchas: 403 for pending/rejected/inactive also carries an extra `status` field) |
| GET | `/me` | any authenticated | — | `user` |
| PUT | `/change-password` | any authenticated | `current_password`*, `new_password`* (the password rule: at least 8 characters AND at least one number — `server/utils/passwordRule.js`, since 2026-09-18; was min 6) | message only — a rule failure is `400` "Password must be at least 8 characters and include at least one number." with `field: "new_password"`; wrong `current_password` is `403` "Current password is incorrect." with `field: "current_password"` (was `401` until 2026-09-15; the session is valid, and a 401 made the client log the user out). The rule never runs at login. |
| PUT | `/contact` | any authenticated | `contact_number`* (non-empty; the contact rule since 2026-09-18 — exactly 11 digits starting with 09 after spaces and dashes are stripped, stored digits-only, `server/utils/contactRule.js`; a refusal is `400` with `field: "contact_number"`) — `name`/`email`/`login_id`/`lrn`/`role`/`student_id`/`password`/`status` are rejected with `400` if present | `user` |
| POST | `/forgot-password` | **public** | `login_id`* | message only — **`202` on every path**, see below |
| POST | `/reset-password` | **public** | `login_id`*, `code`* (6 digits), `new_password`* (the password rule) | message only |
| POST | `/verify-email/request` | any authenticated | — | message only (`202` when a code is sent) |
| POST | `/verify-email/confirm` | any authenticated | `code`* (6 digits) | message only |

**`PUT /change-password` also returns `token`** since R1 (2026-09-19) — a
replacement JWT at the account's new `token_version`. It is **not optional**:
the write revokes every token the account was carrying, including the
caller's, so a client that drops it signs its own user out on the next
request. `client/src/auth/AuthContext.jsx` → `applyToken()` is what stores it.

#### The recovery flow, and the four things it deliberately will not tell you

Added R1 (server) / R2 (client), 2026-09-19. Codes are 6 digits, **bcrypt-
hashed at rest** in `auth_codes`, valid 10 minutes, 5 attempts, single use,
3 per account per hour and 10 per IP per hour, and **only the newest code
for an account+purpose is valid** — issuing one consumes the older ones.

1. **`POST /forgot-password` answers `202` with one sentence, always** —
   *"If this account has a verified email, we sent a code."* — for a verified
   account, an unverified one, an inactive one, an unknown `login_id`, a
   rate-limited account, and its own internal failure. A parent's `login_id`
   IS their child's LRN (§5c in CLAUDE.md), so any other answer is an LRN
   oracle. The **only** `400` describes the request (a blank field), never
   the account. Two timing mitigations back this up: a miss burns a bcrypt it
   would otherwise skip, and the response is sent **before** the SMTP round
   trip.
2. **`POST /reset-password` has one failure message** — *"That code is not
   valid. Request a new one."* — for wrong, expired, already used, out of
   attempts, unknown `login_id` and ineligible account alike. **No count of
   tries remaining**; that is the same oracle, slower. The password rule is
   checked **before** the code, so a weak password does not burn an attempt
   (`400` with `field: "new_password"`).
3. **The verify-email pair is honest, because it is authenticated** — this
   caller already knows their own address. No email on the account is `400`,
   already confirmed is `200` (not an error), rate-limited is `429`, and mail
   that will not send is `503` with the code burned.
4. **A reset bumps `token_version` and returns no token.** The caller is not
   signed in; they go and log in. That is the point of a reset — every
   session the old password left open dies.

**Eligibility is `status = 'active'` AND an email AND `email_verified_at`.**
An admin changing a user's email through `PUT /users/:id` clears
`email_verified_at`, so the address must be confirmed again.

### Users (10) — `/api/users`

| Method | Path | Roles | Request body | Response key |
|---|---|---|---|---|
| POST | `/teachers` | `admin` | `login_id`*, `password`* (the password rule — at least 8 characters AND at least one number — `400` "Password must be at least 8 characters and include at least one number." with `field: "password"`, since 2026-09-18), `name`*, `email`, `contact_number` (optional; the contact rule — 11 digits starting with 09, spaces/dashes stripped, stored digits-only — `400` with `field: "contact_number"`) | `user` |
| POST | `/parents` | `teacher` — `wide` OR `adviser` of the student's section (the shared `TEACHER_VIEW_SCOPE_SQL` predicate, since 2026-09-18). Order: password rule → contact rule → ONE query resolving the LRN and the scope together → the two duplicate `409`s → hash + insert. An unknown LRN and an out-of-scope student are the same `403` "Only a teacher assigned to this student's class, or the adviser of their section, can create the parent account." (no `404` exists on this route since 2026-09-19), and because the scope check runs before the `409`s, an out-of-scope teacher posting the LRN of a child who already has a parent gets that same `403`, never a `409`. Nothing is created on any refusal | `lrn`*, `password`* (the password rule — at least 8 characters AND at least one number — `400` with `field: "password"`, checked before the student lookup so a weak password never reveals whether an LRN exists; since 2026-09-18), `name`*, `email`, `contact_number` (optional; the contact rule — `400` with `field: "contact_number"`, checked before the student lookup too) | `user` |
| GET | `/parents/pending` | `admin` | — | `parents` |
| PUT | `/parents/:id/approve` | `admin` | — | `user` |
| PUT | `/parents/:id/reject` | `admin` | `reason`* | message only |
| GET | `/` | `admin` | query: `role`, `status`, `search` | `users` |
| GET | `/:id` | `admin` | — | `user` |
| PUT | `/:id` | `admin` | `name`, `email`, `contact_number` (any subset; `contact_number` follows the contact rule since 2026-09-18 — `400` with `field: "contact_number"`, an empty string clears it) — `role`/`login_id`/`student_id`/`password`/`status` are rejected with `400` if present | `user` |
| PATCH | `/:id/status` | `admin` | `status`* (`active`\|`inactive`) | `user` |
| POST | `/:id/temp-password` | `admin` | — | message + **`temporary_password`** | The office fallback for an account that cannot use `/forgot-password` (no email, unverified, or an inbox they cannot reach). Generates a rule-satisfying password with `crypto`, bumps `token_version` (every session of that account dies now) and sets `must_change_password = 1`. **The password is in this response and nowhere else** — never stored in plain form, never logged, not retrievable again. Your own id is `400` "Use Change password for your own account.", a nonexistent id is `404`. |

### Students (5) — `/api/students`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `teacher(wide)`, `admin` | query: `grade_level`, `section`, `status`, `search` | `students` | `status`: `active` \| `inactive` \| `all`; absent = active-only; anything else (a typo, an empty value) → `400` "status must be one of: active, inactive, all." (2026-09-15; a typo used to fall through to active-only) |
| GET | `/:id` | `teacher(wide)`, `admin`, `parent(own)` | — | `student` + `parent_account` (teacher and admin only, since 2026-09-18: `{ id, status } \| null` for the one parent account linked to the student; absent on the parent's own read) | `404` out-of-scope |
| POST | `/` | `teacher(wide)`, `admin` | `lrn`* (exactly 12 digits since 2026-09-18 — `server/utils/lrnRule.js`, checked before the duplicate lookup, `400` with `field: "lrn"`; seeded/older rows keep shorter LRNs), `first_name`*, `last_name`*, `grade_level`*, `section`*, `birthday` (a real `YYYY-MM-DD`, not in the future — `400`, `field: "birthday"`), `gender` (`male`/`female` — `400`, `field: "gender"`), `address`, `contact_number` (the contact rule — `400`, `field: "contact_number"`, stored digits-only) | `student` | teacher out-of-scope → `403` |
| PUT | `/:id` | `teacher(wide)`, `admin` | `first_name`, `last_name`, `grade_level`, `section`, `birthday`, `gender`, `address`, `contact_number` (any subset; since 2026-09-18 `birthday`, `gender` and `contact_number` are validated exactly as on POST when present — `400` naming the field, nothing saved; the LRN is never changed here) | `student` | `404` out-of-scope. Differing `grade_level`/`section` → `400` (whole request refused). Matching class may set `section_id` when it is NULL (same resolve as POST); unmatched resolve does not fail the PUT |
| PATCH | `/:id/status` | `admin` | `status`* (`active`\|`inactive`) | `student` | already that status → `200` "Student is already <status>. Nothing was changed.", no log entry (2026-09-15) |

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
| GET | `/student/:studentId` | `teacher(wide)`, `admin`, `parent(own)` | query: `school_year` (optional, defaults to `system_settings.academic_year`) | `student`+`school_year`+`grading_mode`+`subjects`+`term_averages`+`general_average`+`general_average_descriptor` (no `grade`/`grades` key) | `404` out-of-scope |
| POST | `/` | `teacher(subject)`, `admin` | `student_id`*, `subject_id`*, `term`*, `school_year`* | `grade` | teacher out-of-scope → `403`; nonexistent `student_id` → `404` admin / `403` teacher |
| POST | `/:id/components` | `teacher(subject)`, `admin` | `type`* (`WW`\|`PT`), `score`*, `max_score`*, `label`*, `date_recorded` | `component` + `grade` | `403` naming the subject if `wide` but not `subject`; `404` if outside `wide` entirely |
| PUT | `/:id/components/:componentId` | `teacher(subject)`, `admin` | `score`, `max_score`, `label`, `date_recorded` (any subset — `type` not editable, `400` if sent differently) | `component` + `grade` | same `403`/`404` split; mismatched `componentId` → `404` |
| DELETE | `/:id/components/:componentId` | `teacher(subject)`, `admin` | — | `grade` | same `403`/`404` split; mismatched `componentId` → `404` |
| PATCH | `/:id/exam` | `teacher(subject)`, `admin` | any subset of `st1_score`/`st1_max`/`st2_score`/`st2_max`/`te_score`/`te_max` (score+max always paired; explicit `null` clears both) | `grade` | same `403`/`404` split |
| PATCH | `/:id/descriptive` | `teacher(subject)`, `admin` | `descriptive_grade`* (`A`-`E` or `null`) | `grade` | same `403`/`404` split |
| PATCH | `/:id/lock` | `admin` only | `is_locked`* (boolean) | `grade` | unscoped, no `403`/`404` split; already that value → `200` "Grade is already locked/unlocked. Nothing was changed.", no log entry (2026-09-15) |
| DELETE | `/:id` | `admin` only | — | message only | unscoped; `403` when locked (`This grade is locked and cannot be deleted.`); `404` when missing; `grade_components` cascade |

**`term_averages` on the report card (DV3, 2026-09-20).** One average per
term across every learning area at the student's grade level — the general
average computed one level *earlier*, before the three terms collapse into a
Final Grade.

```json
"term_averages": { "1": 87.5, "2": null, "3": null }
```

- **The same NULL-until-complete rule, for the third time in the chain.** A
  term's average is `null` unless **every** subject has that term recorded,
  exactly as `final_grade` needs all three terms and `general_average` needs
  every final grade. Never a running average of whatever exists so far.
- **All three keys are always present, and they are STRINGS** — see the
  gotcha above. Distinct from a subject's `terms`, where a missing entry is
  `null` because the grade row does not exist.
- **Descriptive mode returns three nulls**, for the same reason
  `general_average` is null there: an average of letters is not a number.
- **No descriptor.** The band words (Advancing, Benchmarking…) belong to
  values the school's own report card prints; a per-term average across
  subjects is ours, and attaching a band to it would be a verdict the system
  formed rather than a restatement of a printed number.
- **Why it exists:** the parent report card prints a general-average row per
  term, and the client is not allowed to compute a grade. Without it that row
  could only ever carry the final figure, which is `null` for most of the
  school year.

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
| PUT | `/:key` | `admin` | `value`* | message + `key` + `value` | `400` if unknown key or fails per-key validation; a string value is trimmed before validation and stored, echoed and logged trimmed (2026-09-15) |
| PATCH | `/` | `admin` | `settings`* (object of key/value pairs) | `settings` (flat object) | all-or-nothing; `400` naming any unknown key or failing value before anything is written; values trimmed as in PUT; the response is the 5 allow-listed keys only, same read as `GET /` (2026-09-15) |

### Backups (5) — `/api/backups`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `admin` only | — | `backups` + `orphaned_files` | newest first; each row flags `file_exists` |
| POST | `/` | `admin` only | — | `backup` | real `mysqldump`; row inserted only after success |
| GET | `/:id/download` | `admin` only | — | binary file stream, no JSON on success | `404` if row or file missing |
| DELETE | `/:id` | `admin` only | — | message only | row still removed if file already gone |
| POST | `/:id/restore` | `admin` only | `password`*, `confirm_filename`* | `restored_from` + `safety_backup` + `activity_logs_wiped` | see Gotchas — the one `200`-but-degraded endpoint; `400` on missing password, `403` "Incorrect password." on a wrong one (both were `401` until 2026-09-15 — the session is valid), `400` on `confirm_filename` mismatch; since 2026-09-18 the two password refusals carry `field: "password"` and the mismatch carries `field: "confirm_filename"`; each of those refusals is logged as `restore_refused` |

### Messages (6) — `/api/messages`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/contacts` | any authenticated | query: `search` (optional) | `contacts` (array) | Who this user may start a conversation with — the inverse of `canMessage()`. **parent** → teachers connected to their own child (assigned to the child's class OR its section adviser) + admins; **teacher** → parents of students in their own scope (assigned OR adviser) + other teachers + admins; **admin** → everyone else. **ACTIVE accounts only** — a pending parent cannot log in, so listing them would offer a conversation that cannot happen. `?search=` filters on contact name and student name **within the already-scoped set**, never an unscoped user search. Row: `{id, name, role, subject, student_name, student_grade_level, student_section, last_message, last_message_at, unread_count}`; `subject` and the three `student_*` fields are `null` where not applicable (teacher/admin rows have no linked student — the prefix marks the **child's** class, not the contact user's). Self always excluded. `GET /conversations` and `GET /with/:userId` do not carry class. |
| GET | `/conversations` | any authenticated | — | `conversations` | one row per person messaged, last message + unread count |
| GET | `/with/:userId` | any authenticated | — | `messages` (thread array) | participant-scoped, not re-checked against current `canMessage()` eligibility |
| POST | `/` | any authenticated | `receiver_id`*, `body`* | `data` | `403` naming the reason on a `canMessage()` violation; `404` if recipient not found/inactive; emits `new_message` over Socket.io |
| PATCH | `/:id/read` | any authenticated (recipient only) | — | `data` | non-recipient → `403` |
| PATCH | `/read-all/:userId` | any authenticated (recipient only, by construction) | — | `count` (bare number) | |

### Notifications (4) — `/api/notifications`

**The bell. Added N1, 2026-09-19.** Every route is `authenticate` only — there
is no `authorize()` call in the file, because the resource IS the caller.

**THE AUTH RULE, which is the whole security story here: no endpoint accepts
a user id in any form.** Not in the path, not in a query parameter, not in a
body. Every statement filters on `req.user.id`, the row `authenticate`
re-read from the database on this request. `PATCH /read-all` deliberately
takes **no** `:userId`, unlike `PATCH /api/messages/read-all/:userId`: the
caller is the only possible subject, and an id in the path invites exactly
the mistake that route has to guard against. Acting on a notification that
is not yours is **`404`, not `403`** — a read-shaped failure, so
anti-enumeration applies (§5).

**Rows are re-checked for visibility on every read.** A notification whose
item was deleted, or whose audience no longer includes this user (a deleted
`teacher_assignments` row, an approved pending parent), is simply not
returned — the list joins each row back to its item through that item’s own
list `WHERE`. Nothing deletes the row and there is no cleanup job.

| Method | Path | Roles | Request | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | any authenticated | query: `limit` (1–200, default 50), `offset`, `sort` (`created_at` only), `order`, `unread_only` (`true`/`false`) | `notifications` (array) + `page` | Newest first. Row: `{ id, type, item_type, item_id, title, body, link, actor_name, created_at, read_at }` — `read_at` `null` means unread. `title`/`body` are **composed server-side from the LIVE item**, never stored text (an edited announcement reads as it reads now); `link` is the client route to open, so no client keeps a type→route map. `page.total` counts the filtered AND visibility-checked set (§6b C4). `unread_only` outside `true`/`false` is `400`. |
| GET | `/unread-counts` | any authenticated | — | `counts` | `{ total, announcements, memos, events, excuse_letters, users, grades }`, keyed by **nav section**, unread only. `total` is every unread row; the named keys are what a sidebar badge may show. **`total` can exceed the sum of the named keys a role badges**, because `grades` is counted here and is deliberately never badged — see CLAUDE.md §9. Excludes messages entirely: those have their own count at `GET /api/messages/conversations`. |
| PATCH | `/:id/read` | any authenticated (own rows only) | — | `notification` | Sets `read_at`. Ownership is in the `UPDATE` itself, so there is no window between a check and the write. An already-read row is **absorbed**, not an error (a repeat, not a second decision — §5e). Another user’s row, or a nonexistent one, is `404`. Non-numeric id is `400` (`parseId`). |
| PATCH | `/read-all` | any authenticated (own rows only) | — | `updated` (number) | Marks every unread row of the caller read, including ones currently filtered out by the visibility re-check. A second call returns `updated: 0` and is not an error. |

**No DELETE, and no endpoint that writes a notification.** Rows are created
only by the seven fan-out hooks in `server/routes/`, never by a request.

**No `logActivity` on mark-read — a deliberate exception to "every write
logs".** A row per notification opened is hundreds of `activity_logs` rows a
day against a table with no pruning that the restore machinery counts and
reports on; the thing worth auditing (the announcement, the review, the
approval) is already logged by the handler that caused it. Argued in the
route file’s header.

### Notification text — every type, as it will read

Composed in `routes/notifications.js`. **Nothing here may carry an LRN, a
login id, a score, a letter, an average or a verdict** — a parent’s
`login_id` IS their child’s LRN (§5c), and the system counts and displays
but never concludes (CLAUDE.md §4).

| `type` | Title | Body |
|---|---|---|
| `announcement` | New announcement | `{actor} posted "{live title}".` |
| `memo` | New memo | `{actor} posted "{live title}".` |
| `event` | New event | `{actor} added "{live title}" on {event_date}.` |
| `excuse_submitted` | New excuse letter | `{student first + last} has a new excuse letter for {absence_date}.` — to the adviser, who is already authorised to see that student |
| `excuse_reviewed` (Approved) | Excuse letter approved | `Your excuse letter for {absence_date} was approved.` |
| `excuse_reviewed` (Declined) | Excuse letter declined | `Your excuse letter for {absence_date} was declined. Open it to read the teacher’s remarks.` — the remarks are **not** inlined; they are optional and can be long |
| `parent_pending` | Parent account waiting for approval | `A new parent account for {student first + last} is waiting for approval.` — names the STUDENT, never the login id |
| `grade_available` | A grade is ready to view | `{subject} — Term {n} is now on the report card.` — **no number, no letter, no "passing"** |

---

### Dashboard (1) — `/api/dashboard`

One read-only endpoint, branched by `req.user.role`. No parameters, no
pagination, no writes — every result is a fixed-size summary, so there is
nothing to filter and nothing to page.

| Method | Path | Roles | Request | Response key |
|---|---|---|---|---|
| GET | `/` | any authenticated | — | `dashboard` |

**It is deliberately THIN, and that is the rule for extending it.** Most
dashboard cards are answered by endpoints that already exist and must keep
using them — the parent's attendance counts, recent announcements, upcoming
events, the excuse-letter status, the teacher's today-banner and the unread
badge all fan out to their own list endpoints. This carries only the three
things fan-out cannot do. **Do not move a card here because it would be
tidier**; duplicating a list's filter means two copies of the same scope
rule, and the second one is the one that goes stale.

**SCOPE: every query repeats the `WHERE` of the endpoint its card links to,
never a widening.** Same rule the notification fan-out carries, and the same
failure mode if broken — a summary is the easiest place in the API to leak a
row a caller cannot open, because nothing on screen names where it came
from. The admin totals in particular mirror the page each card opens, so a
card reading 42 cannot lead to a list of 37.

Common to every role: `role`, `school_year`. A missing `academic_year` or
`current_term` in `system_settings` is `500` naming the key — both are
seeded and validated by `PUT /api/settings/:key`, so absence is a real
misconfiguration, not an empty state.

**teacher** — `term`, `classes[]`, `classes_complete`, `classes_total`.

Each `classes[]` row is `{ assignment_id, subject_id, subject_name,
grade_level, section, students, recorded, complete }`, one per
`teacher_assignments` row for this teacher (that endpoint's own `WHERE`).
`students` counts ACTIVE learners matching the class by `grade_level` +
`section`; `recorded` counts distinct learners holding a grade for that
subject and the current term **where EITHER `term_grade` OR
`descriptive_grade` is present** — Grade 1 rows carry a letter and a NULL
number, so counting only the number would report every Grade 1 class as 0
forever, and a shell row from `POST /api/grades` has neither and correctly
does not count. `complete` is `students > 0 && recorded === students`: a
class with no learners is NOT complete, because vacuous truth would let
"fully recorded" reach X of Y with nothing encoded.

**admin** — `term`, `totals { students, teachers, active_parents }`,
`pending_parents`, `grade_locks { term, locked, total }`,
`hazard { single_unverified_admin }`.

`grade_locks` is a COUNT for the current term, not a state: there is no
global lock and no `is_locked` filter on `GET /api/grades`, so the only
meaning available is how many of this term's rows are finalized. `total`
counts every grade row for the current school year AND term, across all
students and both grading modes. `hazard.single_unverified_admin` is true
when there is exactly one ACTIVE admin and their email is unverified —
both routes back in are then closed at once, because a self-service reset
needs a confirmed email and the temporary-password endpoint is admin-only
AND refuses your own id. It is a flag, never a message: the client owns the
wording, and no account is named.

**parent** — `student_id`, `grades`.

`grades` is `null` for an account with no linked learner, and
`{ unavailable: "grading_mode_not_configured" }` when the learner's grade
level has no `grading_mode_configs` row. **That last one is deliberately
NOT the `409` the report card gives**: one unconfigured grade level must not
blank every other card on the page, so the card reports its own gap.

Otherwise `{ descriptive, term, subjects_recorded, subjects_total, complete,
general_average }`, scoped to `users.student_id` exactly as the report card
is — never a query parameter.

**AMENDMENT A1 (Darryl, 2026-09-19): these numbers are computed SERVER-SIDE,
with the same `roundTo2` the report card imports.** A client-side mean would
be a second implementation of a figure parents check against their child's
card, and the two would eventually disagree in the last digit.

- `term` is the greatest term 1–3 in which any subject has a non-null
  `term_grade` — deliberately NOT `system_settings.current_term`, which an
  admin can advance before anyone encodes, leaving the card reading
  "Pending — 0 of 8" for a term nobody has started.
- `complete` means every subject AT THE GRADE LEVEL has a non-null term
  grade for that term, including subjects with no grade row at all.
- `general_average` is returned **only when `complete`**, `null` otherwise —
  so a client cannot render a partial average even by mistake. Same rule as
  Initial Grade, Final Grade and General Average.
- Descriptive (Grade 1) returns `descriptive: true` and **nulls for
  everything else including the counts**: a descriptive subject is
  inapplicable at every computed level, not incomplete, so there is no
  progress to report.

#### The dashboards' own call to `GET /api/events`

Both the parent and teacher dashboards request
`/events?from=<today>&sort=event_date&order=asc&limit=3`. **The `sort` and
`order` are required, not cosmetic.** The endpoint's default is
`event_date DESC`, which is right for the Events page's full list and
exactly wrong for a "next three" card: combined with `limit=3` it returns
the three FURTHEST-AWAY events and lists them backwards, so a parent with
ten things coming up would never see the one that is tomorrow. Found in the
browser on 2026-09-19. **The endpoint default is unchanged** — the Events
page depends on it — and the caller asks for what it needs.

---

## Verification

**Recounted from the code on 2026-09-19 (R3), because this table had drifted
three separate ways at once** — it still said Auth 4 after `/auth/contact`
made it 5, Grades 10 when the Grades table above is 11, it omitted
`GET /grading-modes` and all four Notifications rows, and a paragraph under
it reconciled the gap with arithmetic instead of fixing the rows. The rule
this file states for everyone else applies to it: **one number, one place.**

Every row below is `grep -cE "^[A-Za-z_]+\.(get|post|put|patch|delete)\("`
over the file that serves it, so a sub-router (`announcementsRouter`,
`memosRouter`, `eventsRouter`, `subjectsRouter`, `assignmentsRouter`) counts
the same as `router`.

| Table | Endpoints | Route file |
|---|---|---|
| Auth | 8 | `auth.js` |
| Users | 10 | `users.js` |
| Students | 5 | `students.js` |
| Sections | 3 | `sections.js` |
| Subjects | 1 | `assignments.js` |
| Assignments | 3 | `assignments.js` |
| Grades | 11 | `grades.js` |
| Grading modes | 1 | `gradingModes.js` |
| Attendance | 6 | `attendance.js` |
| Announcements | 4 | `content.js` |
| Memos | 4 | `content.js` |
| Events | 4 | `content.js` |
| Excuse Letters | 6 | `excuses.js` |
| Settings | 4 | `settings.js` |
| Backups | 5 | `backups.js` |
| Messages | 6 | `messages.js` |
| Notifications | 4 | `notifications.js` |
| Dashboard | 1 | `dashboard.js` |
| **Total** | **86** | |

8+10+5+3+1+3+11+1+6+4+4+4+6+4+5+6+4+1 = **86 handlers in `server/routes/`**.
Plus `GET /api/health`, mounted directly in `server.js` = **87** endpoints in
total. Contributions' 8 were removed 2026-09-13 and are not in either figure.

**State which number you mean.** 86 is handlers in route files; 87 is every
endpoint the API answers. CLAUDE.md's archived table is 81 rows — that is a
dated 2026-09-19 snapshot taken before Notifications and account recovery
landed, and it is not the live record. This document is.

**Verified by a three-way audit on 2026-09-07** (CLAUDE.md's endpoints table vs. this document vs. the handlers actually registered in `server/routes/` and mounted in `server/server.js`): all three agreed then at 77. Additions since: assignments/subjects and grading-modes and `DELETE /grades/:id` (2026-09-08), `PUT /auth/contact` (2026-09-09), Notifications' 4 (2026-09-19, N1), and account recovery's 5 — four on `/api/auth` plus `POST /api/users/:id/temp-password` (2026-09-19, R1), and `GET /api/dashboard` (2026-09-19, DB1). Re-run the existence diff after a dispatch that adds or removes an endpoint.
