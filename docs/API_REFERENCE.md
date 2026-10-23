# API Reference — Parent's Portal System

Generated 2026-09-06 by reading every file in `server/routes/` and
`server/middleware/auth.js` directly — not from CLAUDE.md's summaries.
**104 handlers** across 17 route files, documented as **20 endpoint tables
in §8** (more tables than files, because `content.js` holds three separate
resources and `assignments.js` holds two), plus `GET /api/health` in
`server.js` = **105 endpoints** (both +3 on 2026-10-23: `GET /api/activity-logs`,
`/actions` and `/export`, feat/activity-log (B2); both +1 on 2026-10-21:
`POST /api/grades/acknowledgements`, feat/grade-acknowledgement — merged
2026-10-22; both +2 on 2026-10-18: `PUT /api/auth/email`
and `PUT /api/auth/first-password`, feat/first-signin; both +1 on 2026-10-13: `POST /api/grades/locks`,
fix/grade-locks; both +3 on 2026-10-10: `GET /api/policy`,
`GET /api/policy/status`, `POST /api/policy/accept`, feat/privacy; both +3 on 2026-09-30: `PUT` and
`DELETE /api/auth/photo`, `DELETE /api/users/:id/photo`, feat/profile-photos;
both +2 on 2026-09-29: `POST /api/auth/verify-contact/request` and `/confirm`, feat/sms-transport; both +1 on 2026-09-26: `GET /api/settings/public`). That 19 counts MARKDOWN TABLES IN THIS
FILE — it is not a database-table count, and the database has **26** (since
2026-10-21: `grade_acknowledgements`, feat/grade-acknowledgement; 25 since
2026-10-10: `policy_acceptances` and `login_attempts`).
Recounted from the code on 2026-09-22 — `PATCH /grades/:id/descriptive` was
retired (−1) and the class record's `GET` and `PUT` landed (+2), so both
figures went 86 → 85 → 87 in one day; see Verification at the bottom for the
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
- **`GET /api/health`** — public, no auth. **Since 2026-09-25 it pings the database** (`SELECT 1` through the Proxy pool, so it follows `resetPool()` after a restore): `200 { success: true, message: "Parents Portal API is running.", db: "ok" }`, or **`503 { success: false, message: "Database unreachable." }`** when the query throws. `success: true` and the message are unchanged on the 200 because sixteen suites preflight on `data.success` and the smoke's `waitFor` polls `res.ok`. **The 503 path has never been exercised** — it would take MySQL stopped under the running API (`docs/KNOWN_ISSUES.md`). Not in any table below; it isn't a feature, it's a health check. Defined directly in `server.js`, not in `server/routes/`.
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
- **Every list endpoint pages** (since 2026-09-19 — §6b, `?limit=` and
  `?offset=`, one thread on a cursor); the few that do not are named there.
  (Until B2's docs this line said "No pagination anywhere" — true of the 76
  endpoints that stood when it was written.)
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
  `PATCH /api/excuse-letters/:id/review` — uses `PATCH`. The bulk
  `POST /api/grades/locks` (2026-10-13) is a `POST` on purpose: it acts on a
  scope, not on one resource, and has a dry run.
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
- **Every list endpoint pages** — repeated from Conventions; §6b names the
  handlers and the deliberate exceptions.
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

"Teacher" alone is not enough — this codebase has eight distinct scope
shapes, each a genuinely different SQL predicate. Every table below uses
these codes instead of re-explaining the shape on every row.

| Code | Meaning |
|---|---|
| `admin` | Unscoped — every row, no further check |
| `all` | Every authenticated role sees the identical, unfiltered view (no per-role filtering at all) |
| `own` | Parent — their own child / own submitted resource only |
| `grade` | Teacher — assigned to any section of that grade, **OR** adviser of any section in it (`content.js` `teacherHasGradeAssignment`; events have no section column to check further) |
| `wide` | Teacher — assigned to that grade + section (**any** subject) **OR** adviser of that section. `utils/teacherScope.js`: `TEACHER_VIEW_SCOPE_SQL` on a student row, `TEACHER_ADVISES_CLASS_SQL` beside the assignment leg on a class key |
| `subject` | Teacher — exact grade + section **+ subject** match (`teacher_assignments`, all three). No adviser leg |
| `adviser` | Teacher — `sections.adviser_id` match only, independent of `teacher_assignments` |
| `recorder` | Teacher — attendance only: rows they recorded (`a.recorded_by`) **OR** learners currently in a section they advise. No assignment leg (pre-Stage-5 #6) |
| `author` | Teacher or admin — `posted_by` ownership on the specific row (edit/delete only) |

**`wide` gained its adviser leg in 2026-09-06/07 (students, excuse letters,
announcements, messages) and in CR3, 2026-09-22 (grades reads).** Until the
docs pass of 2026-09-26 this legend still said "`teacher_assignments`,
grade+section only", which was true of no row labelled `wide`; the rows were
right and the definition was stale. `wide` is always broader than `subject`
where both exist on the same resource (Grades: any teacher assigned to or
advising the section can **read** `wide`, only the subject's own teacher can
**write** `subject` — see section 5).

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

### 5b. Four whole-session refusals every endpoint can return (R1, 2026-09-19; consent since feat/privacy, 2026-10-10; the contact step and the new order since feat/first-signin, 2026-10-18)

All four come from `middleware/auth.js`, before any handler runs, so they
are not listed per row. **The three account gates are one module,
`server/utils/accountGates.js`, in the owner's order — consent, then the
contact, then the password — and only the FIRST pending one answers.** Each
lets through only its own paths, matched on the FULL path
(`req.baseUrl + req.path`) and the method — the forced change used to match
the router-relative path, so any router's `/me` passed it. The socket
handshake refuses with the same module (§6), and `/auth/me` says which step
is next (`policy_pending`, `contact_pending` + `contact_step`,
`must_change_password`). **`PUT /api/auth/change-password` passes NO gate**:
an account in the forced state sets its password through
`PUT /api/auth/first-password`.

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
- **Every password change is announced to its holder — the password alert
  (`feat/password-alert`, 2026-10-21; the owner's decision of 2026-10-14/16).**
  After the four writes that bump the counter — `PUT /auth/change-password`,
  `PUT /auth/first-password`, `POST /auth/reset-password` and
  `POST /users/:id/temp-password` — `server/utils/passwordAlert.js` sends the
  "was this you?" note to every confirmed channel (the email when
  `email_verified_at` is set; the number when `contact_verified_at` is set and
  SMS is on), AFTER the reply and never awaited: no reply waits for SMTP or
  the gateway, a failed send changes nothing and undoes nothing, and no body
  above changes. The temporary password has its own words ("the school office
  set a temporary password"), never the password. Nothing confirmed → no
  message and one `password_alert_not_sent` row. Logged on the HOLDER's id:
  `password_alert_sent` (the channel names), `password_alert_email_failed`,
  `password_alert_sms_failed` (a fixed reason). **Not a code:** no `auth_codes`
  row, so it never counts toward the hourly limits or the cooldown. No code,
  no link, no login id, no LRN, no learner name in any of the four texts
  (`utils/mailer.js`, `utils/smsTransport.js`). A restore sends nothing.
  FRONTEND §29h.
- **1. `403` `{ message: "Please accept the Data Privacy Notice and the Terms of
  Use before continuing.", code: "POLICY_ACCEPTANCE_REQUIRED" }`** (the
  consent gate, feat/privacy, 2026-10-10) — an account that has not accepted
  the CURRENT version of both documents (`server/policy/versions.json`): a
  **parent**, and since feat/staff-acceptance (2026-10-11) **a teacher or the
  admin** too — every role, one count, no role branch. Only `GET /api/auth/me`
  and `/api/policy` / `/api/policy/*` are allowed through. **FIRST since
  feat/first-signin** (it came after the forced change until then). The
  clients route on `/auth/me`'s `policy_pending`, never on this 403. The count
  is a subquery on the users read the middleware already makes — no extra
  round trip.
- **2. `403` `{ message: "Confirm your Gmail or mobile number before
  continuing.", code: "CONTACT_VERIFICATION_REQUIRED" }`** (feat/first-signin,
  2026-10-18) — an account with neither a confirmed email (`email` +
  `email_verified_at`) nor a confirmed number (`contact_number` +
  `contact_verified_at`); and an account in the forced-change state that has
  not confirmed one SINCE THIS SIGN-IN — a confirmation stamp at or after the
  token's `iat` (both whole seconds; both confirm endpoints re-stamp on every
  good code), so a temporary password on a confirmed account is confirmed
  again (decision D2). Allowed through: the two above, plus `PUT /api/auth/email`,
  `PUT /api/auth/contact` and the four `POST /api/auth/verify-email|verify-contact/request|confirm`.
  `/auth/me` carries `contact_pending` and `contact_step` (`'add'`,
  `'reconfirm'`, or null).
- **3. `403` `{ message: "You must change your password before continuing.",
  code: "MUST_CHANGE_PASSWORD" }`** — `users.must_change_password` is set
  (at creation since 2026-10-10 for a teacher the admin creates and a parent
  an adviser creates; by an admin temporary password). LAST since
  feat/first-signin. Only `GET /api/auth/me`, `/api/policy/*` and
  `PUT /api/auth/first-password` are allowed through. **These 403s are a
  backstop for direct API callers, not a redirect signal**: §2 of CLAUDE.md's
  frontend conventions says a 403 never redirects, and both clients route on
  `/auth/me`'s fields through the mirrored `auth/accountSteps.js` `nextStep()`.
  Do not add a client branch on these codes.

The **global** cutoff (`auth_security_state.token_valid_after`, set only by
a restore) is unchanged and still a timestamp — it revokes everything at
once, where whole seconds are precise enough.

### 5c. What `middleware/auth.js` answers, and why an outage is not a verdict (fix/auth-503, 2026-09-26)

Every authenticated endpoint can return these before its handler runs. The
middleware verifies the token in one `try` and reads the database in
another, so a database failure can never be reported as a token failure.

| Status | Body `message` | Cause | Client |
|---|---|---|---|
| `401` | `Authentication required.` | no `Bearer` token | logout + `/login` |
| `401` | `Invalid or expired token.` | `verifyToken` threw — malformed, wrong secret, expired. **The pool is never called for this** | logout + `/login` |
| `401` | `Session invalidated by a database restore. Please log in again.` | `iat` before `auth_security_state.token_valid_after` | logout + `/login` |
| `401` | `User not found.` | the token's `id` has no `users` row | logout + `/login` |
| `401` | `Account is not active.` | `users.status` ≠ `active` | logout + `/login` |
| `401` | `Your password was changed. Please log in again.` | token `v` ≠ `users.token_version` (§5b) | logout + `/login` |
| `403` | `Please accept the Data Privacy Notice and the Terms of Use before continuing.` + `code` | the first of the three account gates, off its paths (§5b) | routed on the field, never the 403 |
| `403` | `Confirm your Gmail or mobile number before continuing.` + `code` | the second gate (feat/first-signin), off its paths (§5b) | routed on the field, never the 403 |
| `403` | `You must change your password before continuing.` + `code` | the third gate, off `/me`, `/api/policy/*` and `PUT /first-password` (§5b) | routed on the field, never the 403 |
| **`503`** | **`Database unreachable.`** | **any throw inside the database block — the pool's error, MySQL down, a connection lost.** The health endpoint's body, verbatim | **keeps the token**; `AuthUnavailable` + Try again (§22); every other page shows the message in its own `ErrorAlert` |

**`GET /auth/me`** adds one row: a connection-level error in its own read is
the same `503`; any other throw stays `500 "Failed to fetch profile."`.
The distinction is `utils/dbUnavailable.js` → `isDbUnavailable(err)`: true
for `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `EHOSTUNREACH`,
`EPIPE`, `PROTOCOL_CONNECTION_LOST`, `PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR`,
`PROTOCOL_ENQUEUE_AFTER_QUIT`, `PROTOCOL_SEQUENCE_TIMEOUT`,
`ER_ACCESS_DENIED_ERROR`, `ER_CON_COUNT_ERROR`; false for every other `ER_*`
(a SQL error is a defect to fix, not an outage to wait out), a plain Error
and null. The same file holds the frozen body and `sendDbUnavailable(res,
context, err)`, which logs the context and sends it. `GET /api/health`
already answers that body from its own catch and is the third place the
shape appears; a fourth should import it. Proved by `test:auth-middleware`
(48 since feat/first-signin, the three gates and their paths included) on a
stubbed pool.

---

## 6. Socket.io

- Connect with `io(url, { auth: { token } })` — the same JWT as REST.
  Verified once, at connection time, via `io.use()` — not re-checked
  per event. A deactivated account's socket is rejected at the handshake
  and never gets to send or receive anything.
- **The handshake's refusals, in order** (`server/socket.js` →
  `authenticateHandshake`; the two gates since the privacy fix round,
  2026-10-10; the restore cutoff, the version and the database refusal since
  fix/socket-handshake, 2026-10-11). It asks what `middleware/auth.js` asks,
  in its order and with its sentences (§5b, §5c), and like it verifies the
  token in one `try` and reads the database in another, so a database
  failure is never reported as a token failure. Each refusal reaches the
  client as `connect_error` with the message below; the two gates and the
  database refusal also carry a code in `err.data.code`:

  | Order | `err.message` | `err.data.code` | Cause |
  |---|---|---|---|
  | 1 | `Authentication required.` | — | no `auth.token` |
  | 2 | `Invalid or expired token.` | — | `verifyToken` threw — malformed, wrong secret, expired. **The pool is never called for this** |
  | 3 | `Session invalidated by a database restore. Please log in again.` | — | `iat` before `auth_security_state.token_valid_after` |
  | 4 | `Account is not active.` | — | no `users` row, or `status` ≠ `active` (for a missing row the HTTP API says `User not found.`; the handshake keeps its sentence) |
  | 5 | `Your password was changed. Please log in again.` | — | token `v` ≠ `users.token_version` (§5b); a missing `v` reads as 0 |
  | 6 | `Please accept the Data Privacy Notice and the Terms of Use before continuing.` | `POLICY_ACCEPTANCE_REQUIRED` | an account without the CURRENT version of both documents accepted — a **parent**, and since feat/staff-acceptance (2026-10-11) **a teacher or the admin** too |
  | 7 | `Confirm your Gmail or mobile number before continuing.` | `CONTACT_VERIFICATION_REQUIRED` | no confirmed email or number, or a forced change not confirmed since this sign-in (§5b; feat/first-signin) |
  | 8 | `You must change your password before continuing.` | `MUST_CHANGE_PASSWORD` | `users.must_change_password` is set |

  Rows 6–8 are ONE call, `gates.pendingGate(user, decoded.iat)`
  (`utils/accountGates.js`), so the first pending gate answers, as over HTTP;
  until feat/first-signin the password came first and consent second.
  | — | **`Database unreachable.`** | **`DB_UNAVAILABLE`** | **any throw inside the database block** — the HTTP API's `503`, in the health body's words (`utils/dbUnavailable.js`) |

  A refused handshake is not retried; both apps connect afresh once
  `/auth/me` says all three steps are done (FRONTEND §29a, MOBILE M26). Neither
  app branches on the message: both set `connected` false and show the
  LiveStatus strip (FRONTEND §5g). `test:socket-auth` (47) proves every row
  on a stubbed pool, beside the HTTP middleware on the same rows, each with a
  control; `test:privacy` proves the gates and the connect after them.
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

One contract, `server/utils/pagination.js`, on **18 list handlers**:
`GET /users`, `/users/parents/pending`, `/students`, `/grades`,
`/attendance`, `/attendance/student/:id`, `/excuse-letters`,
`/excuse-letters/mine`, `/announcements`, `/memos`, `/events`,
`/assignments`, `/backups`, `/messages/conversations`, `/messages/contacts`,
`/notifications`, `/activity-logs` (since B2 — `parsePagination` alone: it
takes no `sort`) and — on a cursor, see below — `/messages/with/:userId`. (This
line said 16 until B2's docs: `/notifications` had been left out.) Not paginated, by
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
| `grade` | object | `GET /grades/:id`, `POST /grades`, `POST /grades/:id/components`, `PUT /grades/:id/components/:componentId`, `DELETE /grades/:id/components/:componentId`, `PATCH /grades/:id/exam`, `PATCH /grades/:id/lock` (`PATCH /grades/:id/descriptive` was an eighth until it was retired on 2026-09-22) |
| `grades` | array | `GET /grades` |
| `grade_components` | array | `GET /grades/:id` (secondary key, alongside `grade`) |
| `descriptor` | object or `null` | `GET /grades/:id` (secondary key, alongside `grade`) |
| `component` | object | `POST /grades/:id/components`, `PUT /grades/:id/components/:componentId` (secondary key, alongside `grade`) |
| `student`, `school_year`, `grading_mode`, `subjects`, `term_averages`, `term_average_descriptors`, `general_average`, `general_average_descriptor`, `acknowledgements` | **9** flat top-level keys, no `grade`/`grades` key at all; `grading_mode` here is a **string** (`numerical`\|`descriptive`); `acknowledgements` (feat/grade-acknowledgement, 2026-10-21) is `{ "1": { locked, acknowledged_at, by_name }, "2": …, "3": … }`, always all three terms. A client that unwraps by naming keys must name every one it reads — DV3 shipped with `term_averages` missing from the list and the general-average row rendered "Pending" while the API was answering correctly | `GET /grades/student/:studentId` only — see `GET /grading-modes` above for the object shape of the same key |
| `dry_run`, `lock`, `scope`, `learners`, `learners_ready`, `learners_changed`, `records_changed`, `records_already`, `acknowledgements_cleared`, `skipped` | **10** flat top-level keys beside `message`, no `grade`/`grades` key; `learners` here is a **count**, not the class record's array; `learners_ready` is `null` for an unlock; `acknowledgements_cleared` (2026-10-21) counts the parent confirmations an unlock clears — a dry run counts them, a lock sends 0 | `POST /grades/locks` only (fix/grade-locks, 2026-10-13) |
| `acknowledgement` | object `{ term, school_year, acknowledged_at, by_name }` — `by_name` is the confirming account's `users.name`, never a login id | `POST /grades/acknowledgements` (feat/grade-acknowledgement, 2026-10-21) |
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
the bottom must equal 104 handlers (105 with `GET /api/health`).

### Auth (14) — `/api/auth`

| Method | Path | Roles | Request body | Response key |
|---|---|---|---|---|
| POST | `/login` | public | `login_id`*, `password`* | `token` + `user` (see Gotchas: 403 for pending/rejected/inactive also carries an extra `status` field). **Sign-in limits since 2026-10-10** (`server/utils/loginThrottle.js`): **5 failures in a row on one typed login id within 15 minutes, or 100 failures from one IP**, then `429` "Too many sign-in attempts. Please wait 15 minutes, then try again." — checked BEFORE the password, so a locked account refuses the right one too; a correct password clears that account's count (never the IP's). **An unknown login id is counted and locked exactly like a real one**, with the same `401` and the same `429` byte for byte. A failure on a real account is logged `login_failed` with the user id only; `login_attempts` stores an HMAC of the typed id (keyed on `JWT_SECRET`), never the id. `user` carries `policy_pending` |
| GET | `/me` | any authenticated | — | `user` — a connection-level database error is `503 "Database unreachable."` (§5c, since 2026-09-26), any other failure `500`. **`policy_pending`** (since 2026-10-10): `true` for a parent who has not accepted the current Data Privacy Notice and Terms of Use — what the clients route on; always `false` for staff. `student_first_name` is what the consent screen names the child by (never the LRN). **`contact_pending` + `contact_step`** (since 2026-10-18, feat/first-signin): the contact gate (§5b) — `contact_step` is `'add'` (nothing confirmed), `'reconfirm'` (a forced change on an account with a confirmed contact it has not used this sign-in) or `null`. The login reply carries the same fields |
| PUT | `/change-password` | any authenticated | `current_password`*, `new_password`* (the password rule: at least 8 characters AND at least one number — `server/utils/passwordRule.js`, since 2026-09-18; was min 6) | message only — a rule failure is `400` "Password must be at least 8 characters and include at least one number." with `field: "new_password"`; wrong `current_password` is `403` "Current password is incorrect." with `field: "current_password"` (was `401` until 2026-09-15; the session is valid, and a 401 made the client log the user out). The rule never runs at login. **No gate lets it through since feat/first-signin** — an account in the forced-change state gets `403 MUST_CHANGE_PASSWORD` (or the earlier gate's 403) and uses `PUT /first-password`. **Sends the password alert after the reply** (§5b, feat/password-alert) |
| PUT | `/first-password` | any authenticated — **in the forced-change state, contact confirmed SINCE THIS SIGN-IN** (feat/first-signin, 2026-10-18) | `new_password`* (the password rule) — **no current password**: the temporary one was typed at sign-in and the code just confirmed is the second proof | `message` "Password saved." + **`token`** (a replacement, like change-password: the version is bumped and read back). The guard, in order: not in the forced state → `409` "Your password is already set. Change it in Settings."; no confirmation since this sign-in → `403` "Confirm your Gmail or mobile number first." + `code: "CONTACT_VERIFICATION_REQUIRED"`; the rule → `400` with `field: "new_password"`; the password it already has → `400` "Choose a new password, not the temporary one." with `field: "new_password"`; the UPDATE repeats the first check (`AND must_change_password = 1`), so a race is the same `409`. Logged `change_password` "Password set at first sign-in". **Sends the password alert after the reply** — a brand-new account too, one rule (§5b, feat/password-alert) |
| PUT | `/email` | any authenticated — your own account (feat/first-signin, 2026-10-18) | `email`* (non-empty; the one email rule, `server/utils/emailRule.js` — `400` "Email must look like name@example.com." with `field: "email"`) | `user` + message "Email address updated." **A CHANGED address clears `email_verified_at` and burns pending email codes**; compared exactly, as `PUT /users/:id` compares it, so a re-cased address is a change. The same address may be on several accounts (a guardian with two children). `name`/`login_id`/`lrn`/`role`/`student_id`/`password`/`status`/`contact_number` are `400` if present. Logged `update_email` with no address |
| PUT | `/contact` | any authenticated | `contact_number`* (non-empty; the contact rule — since 2026-09-29 `09XXXXXXXXX`, `+639XXXXXXXXX` or `639XXXXXXXXX` after spaces and dashes are stripped, always STORED as `09XXXXXXXXX`, `server/utils/contactRule.js`; a refusal is `400` "Contact number must be a Philippine mobile number: 09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX (for example 0917 123 4567)." with `field: "contact_number"`). **A CHANGED number clears `contact_verified_at` and burns pending `contact_verification` codes; the same number re-typed in another form is not a change** — `name`/`email`/`login_id`/`lrn`/`role`/`student_id`/`password`/`status` are rejected with `400` if present (`email` goes through `PUT /email`) | `user` |
| POST | `/forgot-password` | **public** | `login_id`* | message only — **`202` on every path**, see below. **The resend cooldown is SILENT here** (feat/first-signin): within 60 s of the account's last reset code nothing is sent and no row is written, with the same `202`, body and cost |
| POST | `/reset-password` | **public** | `login_id`*, `code`* (6 digits), `new_password`* (the password rule) | message only. **Sends the password alert after the reply, only after a successful reset, to every confirmed channel** — a reset by one inbox or phone is told to the other; the reply is unchanged, so nothing here is an oracle (§5b, feat/password-alert) |
| POST | `/verify-email/request` | any authenticated | — | message only — `202` "We sent a code to your email address."; `200` "This email is already confirmed." (**except a forced-change account not confirmed since this sign-in, which is sent a code anyway** — the reconfirm, feat/first-signin); `400` "There is no email on this account. Add your email first."; `429` "Too many codes requested. Try again in an hour, or use your mobile number instead." (the hour; "…in an hour." alone when SMS is off); **`429` "Wait N seconds, then ask for a new code." with `retry_after` (seconds) — the 60-second resend cooldown, checked after the hour**; `503` when the mail would not send |
| POST | `/verify-email/confirm` | any authenticated | `code`* (6 digits) | message only — `200` "Email confirmed. You can now reset your own password."; `400` "That code is not valid. Request a new one." for every failure, **including a code sent to an address the account no longer holds** (the snapshot check, since feat/first-signin; the stamp is rewritten on every good code) |
| POST | `/verify-contact/request` | any authenticated | — | message only — `202` "We sent a code to your mobile number."; `200` "This number is already confirmed." (the same reconfirm exception as email); `400` "There is no mobile number on this account. Add one first."; `429` "Too many codes requested. Try again in an hour, or use your Gmail instead."; **`429` "Wait N seconds, then ask for a new code." with `retry_after`**; `503` "Could not send the code right now. Try again, or ask the school office." (the text would not send, or SMS is off on this server) |
| POST | `/verify-contact/confirm` | any authenticated | `code`* (6 digits) | message only — `200` "Mobile number confirmed. You can now get reset codes by text message."; `400` "That code is not valid. Request a new one." for every failure, including a code sent to a number the account no longer holds |
| PUT | `/photo` | any authenticated — **your own account only** (no `:id`) | **multipart**, one file in field `photo` — JPEG, PNG or WebP, at most 5 MB | `user` (the `/me` shape) + message "Profile photo updated." — `400` "Choose a photo to upload." (no file), `400` "Choose a JPEG, PNG or WebP image." (anything sharp cannot decode as one of those — the name and declared type are ignored), `413` "The photo must be 5 MB or smaller.", `400` "Send one photo at a time." (a second file or another field). See Profile photos below |
| DELETE | `/photo` | any authenticated — your own account only | — | `user` + message "Profile photo removed.", or "There was no profile photo to remove." (`200`, a no-op) |

#### Profile photos (feat/profile-photos, 2026-09-30)

- **`users.profile_pic` holds the FILE NAME only** — 32 random lowercase hex
  characters + `.jpg`, a new one on every upload — never a URL (the web and
  the phone reach the API at different hosts) and **never a login id, a user
  id or a timestamp**. Clients build the address with `format/photoUrl.js`
  (mirrored), which refuses any other shape.
- **Served unauthenticated at `/uploads/avatars/<name>`** by `server.js`'s
  static mount (`index: false`, `dotfiles: 'deny'`, `nosniff`,
  `Cache-Control: private, max-age=86400`): an `<img>` cannot send the bearer
  token, so the random name is the access key. It only appears in replies
  the viewer is already scoped to. **A copied address works without a login
  until the photo is replaced or removed** — `docs/KNOWN_ISSUES.md`.
- **Every upload is re-encoded** by sharp (`server/utils/profilePhoto.js`):
  EXIF orientation applied, cut to 512 × 512, written as a new JPEG at
  quality 82 — **no EXIF survives, GPS included**. Nothing touches the disk
  until that succeeds (multer memory storage).
- **Replace writes the new file, points the row at it, then deletes the old
  file**; remove clears the row, then deletes. A file written but not
  recorded is removed on the error path.
- **`activity_logs`**: `upload_profile_photo`, `remove_profile_photo`,
  `admin_remove_profile_photo` — descriptions carry **no file name, no login
  id and no id**; the admin row names the target by display name and role.
- **The name also appears on** `GET /users`, `GET /users/:id` (both
  `SELECT *`), `GET /users/parents/pending` (`profile_pic`) and
  `GET /messages/conversations` (`other_user_profile_pic`).
- **Not in any backup** — `docs/KNOWN_ISSUES.md`.

**`PUT /change-password` also returns `token`** since R1 (2026-09-19) — a
replacement JWT at the account's new `token_version`. It is **not optional**:
the write revokes every token the account was carrying, including the
caller's, so a client that drops it signs its own user out on the next
request. `client/src/auth/AuthContext.jsx` → `applyToken()` is what stores it.
**`PUT /first-password` returns one the same way** (feat/first-signin) — the
web's `ForcedPasswordChange.jsx` and the phone's `ForcedPasswordChangeScreen`
store it before re-reading `/auth/me`.

**The resend cooldown (feat/first-signin, 2026-10-18):** a new code of one
purpose for one account only 60 seconds after the newest
(`utils/authCodes.js` `RESEND_COOLDOWN_SECONDS`, `cooldownRemaining()` —
counted from the newest row's `created_at` in the database's own clock, so a
code whose send failed still starts the wait). The verify requests answer it
honestly (`429` + `retry_after`); forgot-password answers it silently (the
uniform `202`). The clients count it down ("Resend code in 0:59") from the
mirrored `hooks/useCooldown.js` and never decide it.

#### The recovery flow, and the four things it deliberately will not tell you

Added R1 (server) / R2 (client), 2026-09-19. Codes are 6 digits, **bcrypt-
hashed at rest** in `auth_codes`, valid 10 minutes, 5 attempts, single use,
3 per account per hour and 10 per IP per hour, and **only the newest code
for an account+purpose is valid** — issuing one consumes the older ones.

1. **`POST /forgot-password` answers `202` with one sentence, always** —
   *"If this account has a confirmed email or mobile number, we sent a code
   to it."* (since 2026-09-29; before that it named email only) — for a verified
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

**Eligibility is `status = 'active'` AND at least one confirmed channel** —
an email with `email_verified_at`, or (since 2026-09-29, and only while
`SMS_TRANSPORT` is set on the server) a `contact_number` with
`contact_verified_at`. An admin changing a user's email through
`PUT /users/:id` clears `email_verified_at` **and burns the email codes
already sent (since 2026-09-29)**, so the address must be confirmed again;
a changed number does the same for `contact_verified_at` there and on
`PUT /auth/contact`.

#### SMS — a second channel beside email (feat/sms-transport, 2026-09-29)

Email, with SMS through "SMS Gateway for Android" (SMSGate), which sends each
text from the demo phone's own SIM — in CLOUD mode since 2026-10-24 (an https
API base; from 2026-09-29 until then LOCAL mode, plain HTTP with Basic auth on
the hotspot LAN, which stays the fallback); `docs/KNOWN_ISSUES.md`.

- **One code, every confirmed channel.** A forgot request writes ONE
  `auth_codes` row and sends that same code by email and by text when both
  are confirmed, so one request counts once toward the hourly limit. If
  every channel fails the code is burned; if any went out it stays valid.
  The reply is the one sentence above in every case — no masked number,
  no channel named.
- **The limits are email's, unchanged**: 3 per account per purpose per
  hour, 10 per IP per hour. **A verify-contact request whose text fails
  still counts** — the row is written before the gateway is called, then
  burned — exactly as a failed verify-email does. A server with SMS off
  answers `503` before writing a code, so that counts for nothing.
- **The number is stored in one form, `09XXXXXXXXX`**; E.164
  (`+639XXXXXXXXX`) exists only at send time (`toE164`, called by
  `server/utils/smsTransport.js` alone). `auth_codes.contact_snapshot`
  records the number a code went to, and confirm refuses a code whose
  snapshot is not the account's number now.
- **A failed send is logged as a FIXED reason** — `unreachable`,
  `timeout`, `http_<status>` or `bad_config` — in `activity_logs`
  (`password_reset_sms_failed`, `contact_verification_sms_failed`) and on
  the console. Never the fetch error's message, which can carry the
  gateway's host and port; never the URL, credentials, number or code.
- **The texts** are ASCII, one GSM-7 part, and carry no LRN, login id or
  student name.

### Users (11) — `/api/users`

| Method | Path | Roles | Request body | Response key |
|---|---|---|---|---|
| POST | `/teachers` | `admin` | `login_id`*, `password`* (the password rule — at least 8 characters AND at least one number — `400` "Password must be at least 8 characters and include at least one number." with `field: "password"`, since 2026-09-18), `name`*. **No `email` and no `contact_number` since feat/account-create (2026-10-21; the owner's decision of 2026-10-16):** a non-empty value for either is `400` "The email address is no longer collected here — the account holder confirms one at the first sign-in." / "The contact number is no longer collected here — …" with `field: "email"` / `"contact_number"`, checked after the password rule; null or an empty string is ignored; the row is created with both NULL, until the holder confirms one through the contact gate (§5b) or the admin sets one through `PUT /:id`, whose email and contact rules are unchanged. (Until then both were optional — the contact rule since 2026-09-29, the email rule since 2026-09-25.) **Created with `must_change_password = 1` since 2026-10-10** — the teacher picks their own password at the first sign-in (§5b) | `user` |
| POST | `/parents` | `teacher(adviser)` — **the ADVISER of the student's section only** (`sections.adviser_id` on `s.section_id`, since pre-Stage-5 #4, 2026-09-25; from 2026-09-18 to then it was the wider assigned-OR-adviser read predicate, which let a subject teacher create the account — never the school's process). Order: password rule → **the retired-field refusal** (no `email`, no `contact_number` since feat/account-create, 2026-10-21 — `400` naming the field, run BEFORE the scope query so the refusal reveals nothing about the LRN; until then the contact rule and the email rule stood here) → ONE query resolving the LRN and the scope together → the two duplicate `409`s → hash + insert. An unknown LRN and an out-of-scope student are the same `403` "Only the adviser of this student's section can create the parent account." (no `404` exists on this route since 2026-09-19), and because the scope check runs before the `409`s, an out-of-scope teacher posting the LRN of a child who already has a parent gets that same `403`, never a `409`. A learner whose `section_id` is NULL has no adviser and therefore no possible parent account through this route. Nothing is created on any refusal. **Created `pending` with `must_change_password = 1` since 2026-10-10** — after approval the parent picks their own password at the first sign-in, then meets the consent gate (§5b) | `lrn`*, `password`* (the password rule — at least 8 characters AND at least one number — `400` with `field: "password"`, checked before the student lookup so a weak password never reveals whether an LRN exists; since 2026-09-18), `name`*. **No `email` and no `contact_number` since feat/account-create (2026-10-21):** a non-empty value for either is `400` "The email address is no longer collected here — the account holder confirms one at the first sign-in." / "The contact number is no longer collected here — …" with the field named, checked before the student lookup too; null or an empty string is ignored; both NULL on the row until the parent confirms one at the first sign-in (§5b) or the admin sets one through `PUT /:id` | `user` |
| GET | `/parents/pending` | `admin` | — | `parents` |
| PUT | `/parents/:id/approve` | `admin` | — | `user` |
| PUT | `/parents/:id/reject` | `admin` | `reason`* | message only |
| GET | `/` | `admin` | query: `role`, `status`, `search` | `users` | `sort` keys `name`, `login_id`, `role`, `status`, `created_at`. **`role` and `status` sort by their LETTERS** (`CAST(... AS CHAR)`, 2026-09-25) — both are ENUMs and MySQL sorts an ENUM by ordinal, so `sort=role&order=asc` used to yield parent, teacher, admin under an A–Z header |
| GET | `/:id` | `admin` | — | `user` |
| PUT | `/:id` | `admin` | `name`, `email`, `contact_number` (any subset; `contact_number` follows the contact rule since 2026-09-18 and **`email` the email rule since 2026-09-25** — `400` with `field: "contact_number"` / `field: "email"`, an empty string clears either; a changed email is stored trimmed, un-verifies the address and burns the email codes already sent; a changed number clears `contact_verified_at` and burns pending text codes — the same number in another form is not a change) — `role`/`login_id`/`student_id`/`password`/`status` are rejected with `400` if present | `user` |
| PATCH | `/:id/status` | `admin` | `status`* (`active`\|`inactive`) | `user` |
| DELETE | `/:id/photo` | `admin` — **REMOVE ONLY** (moderation; no admin upload for someone else exists), any id including your own | — | message only — `200` "Profile photo removed." / "This account has no profile photo." (a no-op); `400` "Invalid user id."; `404` "User not found." The file is deleted after the row is cleared; `admin_remove_profile_photo` names the target by name and role, never an id |
| POST | `/:id/temp-password` | `admin` | — | message + **`temporary_password`** | The office fallback for an account that cannot use `/forgot-password` (no email, unverified, or an inbox they cannot reach). Generates a rule-satisfying password with `crypto`, bumps `token_version` (every session of that account dies now) and sets `must_change_password = 1`. **The password is in this response and nowhere else** — never stored in plain form, never logged, not retrievable again. Your own id is `400` "Use Change password for your own account.", a nonexistent id is `404`. **Sends the HOLDER the office's alert after the reply** — "the school office set a temporary password", never the password itself — on every confirmed channel; nothing confirmed logs `password_alert_not_sent` on the holder, while `admin_temp_password` stays on the admin (§5b, feat/password-alert) |

### Students (5) — `/api/students`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `teacher(wide)`, `admin` | query: `grade_level`, `section`, `status`, `search` | `students` | `status`: `active` \| `inactive` \| `all`; absent = active-only; anything else (a typo, an empty value) → `400` "status must be one of: active, inactive, all." (2026-09-15; a typo used to fall through to active-only) |
| GET | `/:id` | `teacher(wide)`, `admin`, `parent(own)` | — | `student` + `parent_account` (teacher and admin only, since 2026-09-18: `{ id, status } \| null` for the one parent account linked to the student; absent on the parent's own read) | `404` out-of-scope |
| POST | `/` | `teacher(adviser)` of the **target** section (pre-Stage-5 #4), `admin` | `lrn`* (exactly 12 digits since 2026-09-18 — `server/utils/lrnRule.js`, checked before the duplicate lookup, `400` with `field: "lrn"`; seeded/older rows keep shorter LRNs), `first_name`*, `last_name`*, `grade_level`*, `section`*. **`birthday`, `gender`, `address` and `contact_number` are NOT COLLECTED since 2026-10-10** (feat/privacy, decision 6): a VALUE for any of them is `400` "The learner's birthday is no longer collected." (… gender / address / contact number) with `field` naming it; a key that is `null` or empty is ignored, so a client echoing an old row is not broken. The columns stay, NULL; no `student` response carries the four | `student` | **Who may enrol (pre-Stage-5 #4, 2026-09-25): a teacher must be `sections.adviser_id` of the TARGET section** — the adviser keeps the class list; a subject teacher assigned there does not enrol. **Admin is kept**: 20 of 23 sections have no adviser and no screen assigns one, so an admin POST is the only way a learner reaches them. **Order:** duplicate LRN `409` → `academic_year` unset `409` → section resolved (`400` "No section named…" to every role — names are reference data) → **gate `403`** "Only the adviser of Grade N - Section can enrol a learner into it." → insert with `section_id`. The scope label above is therefore `teacher(adviser of target)`, not `wide` |
| PUT | `/:id` | `teacher(wide)`, `admin` | `first_name`, `last_name`, `grade_level`, `section` (any subset; the LRN is never changed here). **The four retired fields are refused exactly as on POST since 2026-10-10** — a value is `400` naming the field and nothing is saved; null or empty is ignored | `student` | **Edit scope is assigned OR adviser since pre-Stage-5 #4** — the two legs of the read predicate, written out in the handler rather than imported, so the adviser who enrolled a learner can correct the record; outside both legs is `404`, exactly as `GET /:id` answers the same teacher (the former "can view but not edit" `403` no longer exists). Differing `grade_level`/`section` → `400` (whole request refused). Matching class may set `section_id` when it is NULL (same resolve as POST); unmatched resolve does not fail the PUT |
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
| GET | `/` | `all` | query: `grade_level` (optional, 1–6) | `subjects` | unscoped reference data; no `GET /:id`; inventory is seeded, not managed through this API. Rows carry `display_order` and arrive in the school's printed order — see below |

#### `subjects.display_order` — the printed order lives in the database (CR3a, 2026-09-22)

The school's printed order for a grade level's learning areas, `1..N`,
transcribed from the SF9. Before CR3a there was no ordering column: every
subject list came back `name ASC` and the only real order lived in a **client
constant** on the parent report card. That constant is deleted — Expo cannot
import one, and the class record and the class summary need the same order
without a parent document owning it. **Changing an order is now an `UPDATE`,
not a code change.**

**Every reader sorts `display_order IS NULL, display_order, name`** — the
null-last idiom. MySQL sorts `NULL` **first** by default, so without the
leading term a grade level with no recorded order would lead with its
unordered rows, and on a grade level with a *mix* the unordered ones would
jump to the front.

| Grade | `display_order` | Status |
|---|---|---|
| 4, 5, 6 | English 1, Mathematics 2, Filipino 3, Araling Panlipunan 4, GMRC 5, Science 6, MAPEH 7, EPP 8 | **one Key Stage 2 SF9 order applied to all three** — **CONFIRMED by the school, 2026-09-23** (the seeded order was right) |
| 1 | Makabansa 1, Mathematics 2, GMRC 3, Reading and Literacy 4, Language 5 | **CONFIRMED by the school, 2026-09-23** — no longer provisional; the seeded order (from the class program) was right |
| 2 | Makabansa 1, Mathematics 2, GMRC 3, English 4, Filipino 5 | **CONFIRMED by the school, 2026-09-23; seeded 2026-09-26** (pre-Stage-5 #5a) — `NULL` → `name ASC` until then |
| 3 | English 1, Mathematics 2, Science 3, Filipino 4, Makabansa 5, GMRC 6 | **CONFIRMED by the school, 2026-09-23; seeded 2026-09-26** — `NULL` → `name ASC` until then |

`GET /api/assignments`' **default** order follows it too, because the class
record's Subject dropdown reads that endpoint and must agree with the report
card. **An explicit `sort=subject` still means A–Z** — changing what a
documented sort value does would be a contract change; only the default moved.

### Assignments (3) — `/api/assignments`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `teacher` (own rows only), `admin` | query: `teacher_id` (optional; admin anyone, teacher forced to self) | `assignments` | teacher naming another `teacher_id` → `403` (not `404` — contacts already lists teachers; see §5) |
| POST | `/` | `admin` | `teacher_id`*, `subject_id`*, `section`* | `assignment` | `grade_level` from the subject row, never the body; `section_id` resolved against `sections` for current `academic_year`; duplicate → `409`; inactive/non-teacher → `400` |
| DELETE | `/:id` | `admin` | — | message only | does **not** refuse when grades exist; a scope change removes future authority, never past records |

### Grades (15) — `/api/grades`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `teacher(wide)`, `admin`, `parent(own)` | query: `student_id`, `subject_id`, `term`, `school_year`, **`grade_level`** (integer 1–6, else `400`), **`section`** (trimmed, non-empty, else `400`) — all optional, no defaults | `grades` | parent naming a different `student_id` → `403`. The class pair filters on the JOINed `students` columns (2026-09-25); `sort` keys are `student`, `subject`, **`class`** (`s.grade_level, s.section`), `term`, `school_year`, `updated_at` |
| GET | `/class-record` | `teacher(wide)`, `admin` | query: `subject_id`*, `grade_level`*, `section`*, `term`*, `school_year` | `subject`+`slots`+`learners`+`group_hps`+`exam_max`+`exam_max_mixed`+`weights`+`grading_mode`+`can_encode` (no `grade` key) | the whole grid in one request; **registered BEFORE `/:id`** or `class-record` parses as an id. `404` outside view scope |
| GET | `/class-summary` | `teacher(adviser)`, `admin` | query: `grade_level`*, `section`*, `term`* (`1｜2｜3｜final`), `school_year` | `section`+`school_year`+`term`+`grading_mode`+`show_final`+`show_general_average`+`subjects`+`learners`+`completeness` | the adviser's Summary of Grades, read-only. **Also registered BEFORE `/:id`.** `403` in view scope but not adviser; `404` otherwise. **No pagination** — see below. Since 2026-10-21 each learner row carries `term_locked` (boolean; `null` on the Final sheet) and `acknowledged` (`{ acknowledged_at, by_name }` or `null`) |
| PUT | `/class-record` | `teacher(subject)`, `admin` | `subject_id`*, `grade_level`*, `section`*, `term`*, `school_year`, plus any of `slots[]`, `entries[]`, `exam_max`, `dry_run` | `results`+`group_hps`+`slots` | one save for the whole class; see below |
| POST | `/acknowledgements` | `parent` only | `term`* (1–3), `school_year` (optional, defaults to `system_settings.academic_year`) | `acknowledgement` | "I have seen these grades" for a FULLY locked term (feat/grade-acknowledgement, 2026-10-21); `201` the first time, `200` on a repeat, `409` while the term is not fully locked; **registered BEFORE `/locks` and `/:id`**; see below |
| POST | `/locks` | `admin` only | `lock`* (boolean), `term`* (1–3), `grade_level` (1–6; none = the whole school), `section` (needs `grade_level`), `dry_run` (boolean) | `dry_run`+`lock`+`scope`+`learners`+`learners_ready`+`learners_changed`+`records_changed`+`records_already`+`acknowledgements_cleared`+`skipped` | lock or unlock a whole term (fix/grade-locks, 2026-10-13); **also registered BEFORE `/:id`**; see below |
| GET | `/:id` | `teacher(wide)`, `admin`, `parent(own)` | — | `grade` + `grade_components` + `descriptor` | `404` out-of-scope |
| GET | `/student/:studentId` | `teacher(wide)`, `admin`, `parent(own)` | query: `school_year` (optional, defaults to `system_settings.academic_year`) | `student`+`school_year`+`grading_mode`+`subjects`+`term_averages`+**`term_average_descriptors`**+`general_average`+`general_average_descriptor`+**`acknowledgements`** (no `grade`/`grades` key) | `404` out-of-scope |
| POST | `/` | `teacher(subject)`, `admin` | `student_id`*, `subject_id`*, `term`*, `school_year`* | `grade` | teacher out-of-scope → `403`; nonexistent `student_id` → `404` admin / `403` teacher |
| POST | `/:id/components` | `teacher(subject)`, `admin` | **`slot_id`***, `type`* (`WW`\|`PT`), `score`*, `max_score`*, `label`, `date_recorded` | `component` + `grade` | `403` naming the subject if `wide` but not `subject`; `404` if outside `wide` entirely. **`slot_id` required since CR1**; a slot of another class or the wrong type → `404` (never leaks that it exists). **`label` is now OPTIONAL** — a slot-backed row leaves it `NULL`. Non-integer `score`/`max_score` → `400` |
| PUT | `/:id/components/:componentId` | `teacher(subject)`, `admin` | `score`, `max_score`, `label`, `date_recorded`, `slot_id` (any subset — `type` not editable, `400` if sent differently) | `component` + `grade` | same `403`/`404` split; mismatched `componentId` → `404`; **moving a row into an UNUSED slot is refused**; non-integer score/max → `400` |
| DELETE | `/:id/components/:componentId` | `teacher(subject)`, `admin` | — | `grade` | same `403`/`404` split; mismatched `componentId` → `404` |
| PATCH | `/:id/exam` | `teacher(subject)`, `admin` | any subset of `st1_score`/`st1_max`/`st2_score`/`st2_max`/`te_score`/`te_max` (score+max always paired; explicit `null` clears both) | `grade` | same `403`/`404` split |
| ~~PATCH~~ | ~~`/:id/descriptive`~~ | — | — | — | **RETIRED 2026-09-22 — the route is unmounted; every caller gets `404`.** See below |
| PATCH | `/:id/lock` | `admin` only | `is_locked`* (boolean) | `grade` | unscoped, no `403`/`404` split; already that value → `200` "Grade is already locked/unlocked. Nothing was changed.", no log entry (2026-09-15) |
| DELETE | `/:id` | `admin` only | — | message only | unscoped; `403` when locked (`This grade is locked and cannot be deleted.`); `404` when missing; `grade_components` cascade |

### The class record: two endpoints, one grid (CR1/CR2, 2026-09-22)

`GET` and `PUT /api/grades/class-record` are the DepEd E-Class Record shape —
learners as rows, WW/PT/Summative as columns, one Save. They replace encoding
one learner at a time through a modal, which cost up to 80 requests for one
quiz across 40 learners.

**Route order is load-bearing.** Both are registered **before `GET /:id`**.
Express matches in registration order, so `/class-record` registered after
`/:id` would be parsed as an id, fail `parseId()` and answer `400`. Do not
reorder `routes/grades.js`.

**The fixed frame: WW 1-5 and PT 1-3.** A class's columns are
`assessment_slots` rows keyed
`(subject_id, grade_level, section, term, school_year, type, slot_no)`. The
API accepts `slot_no` 1-20; the grid only ever sends the fixed frame. A slot
the class has not used yet is a **phantom** — it has no row, and `GET` returns
it with `id: null` so the grid can render an empty column that is typed into
and created in the same save.

**USED is defined by the highest possible score, not by the row existing.**
A slot with `max_score` set is one the class sat. A slot with `max_score`
`null` is unused and is left out of the computation entirely — nobody is
missing anything. Those two cases must never be conflated; see
`docs/GRADING_SPEC.md` → Assessment slots for what each does to a grade.

**A score names its column one of two ways**, and the second is not a
convenience:

```jsonc
{ "slot_id": 41, "score": 18 }                    // the column already exists
{ "type": "WW", "slot_no": 2, "score": 18 }       // created in this same save
```

The grid lets a teacher give a blank column an HPS **and** type scores into it
before pressing Save once. At that moment the slot has no id, so a payload
that could only address by `slot_id` would be unsendable. **`slot_id` is
required on the per-row component endpoints** (`POST /:id/components`,
`PUT /:id/components/:componentId`) — a component written through those paths
must belong to a declared column. Only the class-record `PUT` may create the
column and the score together.

**`exam_max` is class-wide.** Grade 1's Summative and Grades 2-6's
Examinations share the three fixed columns on `grades` (`ex_st1`, `ex_st2`,
`ex_te`). `exam_max: { st1, st2, te }` fans the maxima out to every active
learner in the class in the same transaction. `GET` returns `exam_max` as the
**most common** stored value per part plus `exam_max_mixed`, a per-part
boolean that is `true` when learners disagree — the grid shows the header
value and flags the disagreement rather than silently picking one.

**`group_hps`, and why the client never sums it.** `GET` and `PUT` both
return `group_hps: { ww, pt, ex }` — each group's total highest possible
score, `null` when the group has no used slot. The grid does no grade
arithmetic at all (see `docs/FRONTEND_CONVENTIONS.md` §13), and a header total
that disagreed with the column beneath it by a rounding step would be the
worst possible thing to debug.

**`short_label` vs `display_label`.** `short_label` is what the grid column
header shows — the slot's `name` trimmed, or the bare `slot_no` when it has
none, because a column two characters wide cannot hold "Written Work 2".
`display_label` is the full resolved name used everywhere else (the parent
breakdown modal, exports). **Neither is stored:** `grade_components.label` is
`NULL` on a slot-backed row, so renaming a slot renames every reference at
once. A legacy row with no `slot_id` keeps the label it was written with.

**`can_encode` is in the payload so a read-only grid is possible.** Read scope
is view scope (grade + section, any subject), matching `GET /` and `GET /:id`;
encode scope is still the subject teacher. A teacher who may look but not
encode gets `can_encode: false` and a read-only grid — **not** a `404`. That
follows the existing two-tier split rather than inventing a third rule.

**`dry_run: true` runs the whole save inside the transaction and rolls back**,
returning what every affected row *would* hold. It is how the grid shows live
totals, PS, WS and a term grade as the teacher types without computing
anything. **A dry run writes nothing, notifies nobody and logs nothing** —
asserted in `test:class-record` against both `notifications` and
`activity_logs`, not just against the grade rows.

**Refusals:**

| Cause | Status | Message shape |
|---|---|---|
| A locked grade for any learner in the save | **`409`** | `Nothing was saved. <names> have locked grades for this subject and term — ask an admin to unlock before saving.` |
| A column's HPS set, changed or cleared while ANY learner of the class (any status) has a locked row for this subject and term (fix/grade-locks, 2026-10-13) | **`409`** | `Nothing was saved. <names> has a locked grade` (one) / `have locked grades` (two or more) `for this subject and term — ask an admin to unlock before changing a highest possible score.` — every locked learner as "First Last" in name order, joined with ", "; more than three is the first three and "and N more". **A dry run gets the same sentence without "Nothing was saved."** Checked before the first write. A rename at the same HPS, an unused column sent back unchanged (empty to empty) and score-only saves are not refused by it |
| Clearing a slot's HPS while it still holds scores | **`409`** | `<slot> cannot be cleared — N learners have scores in it. Remove the scores first.` |
| A non-integer score or max | **`400`** | `<field> must be a whole number — the school does not award half points (got 42.5).` |
| Nothing sent | `400` | `Nothing to save — send slots, entries, or both.` |
| A score whose slot is not in this class, or the wrong type | `400` | names the slot |

**The locked refusal is all-or-nothing on purpose.** One locked learner
rolls back the entire save rather than writing the other 39 — a partial save
of a bulk grid is the state nobody can reason about afterwards. `GET` returns
`is_locked` per learner so the grid disables those rows before the teacher
types.

**A score above its highest possible score is ALLOWED and flagged, never
refused or clamped.** That matches `utils/gradeComputation.js`, which does not
clamp percentages over 100. The school does award bonus points (confirmed
2026-09-23 — event participation, added to PT), so the grid's copy names
them; the API still neither refuses nor clamps, and a cap would be explicit
route validation if the school ever asked for one.

**A locked grade is never recomputed by this endpoint (fix/grade-locks).**
An HPS change rewrites the materialised maximum of every row in the column and
recomputes the class, so it is refused while anyone in the class is locked
(the table above); behind that refusal, the class-wide recompute selects
`is_locked = 0` rows only — a backstop nothing should reach.

### Lock or unlock a whole term: `POST /api/grades/locks` (fix/grade-locks, 2026-10-13)

The owner's Finding 1: locking one learner × subject × term at a time is
impractical across Grades 1–6. Admin only; **registered before `GET /:id`**.

- **Scope.** `term` is required; no `grade_level` is the whole school; a
  `section` needs its `grade_level` and must exist for the school year, else
  `400` "There is no Grade G - S section for <year>.". The school year is the
  `academic_year` setting (`500` when unset). **Active learners only**, for
  lock and unlock alike; scoping is on the VARCHAR class columns.
- **Lock** takes a learner only when EVERY subject of their grade level has a
  grade this term (`term_grade`, or `descriptive_grade` — Grade 1's legacy
  letters count). Anyone else is skipped WHOLE and returned in `skipped`
  (`student_id`, `name` "Last, First", `grade_level`, `section`, `pending`,
  `subjects`); nothing of theirs is locked. **Unlock** has no completeness
  check: every locked row in scope.
- **`dry_run: true`** answers the same counts and changes nothing — the
  screens' preview. The apply path reads the rows `FOR UPDATE` inside one
  transaction and runs a guarded `UPDATE`, so the counts it returns are the
  counts it wrote; a preview taken earlier can be stale.
- **Counts:** `learners` (active learners in scope), `learners_ready` (lock
  only; `null` for unlock), `learners_changed`, `records_changed`,
  `records_already` (lock only; `0` for unlock), and since 2026-10-21
  `acknowledgements_cleared` — the parent confirmations an unlock clears (a
  dry run counts them; a lock sends `0`); `scope` echoes
  `{ school_year, term, grade_level, section }`.
- **Audit and notifications:** one `activity_logs` row
  (`bulk_grade_lock` / `bulk_grade_unlock`, scope and counts only) when an
  applied action changed something — none for a dry run or a repeat; one
  `grade_acknowledgement_cleared` row (counts only) when an unlock cleared a
  confirmation. **One notification, since feat/grade-acknowledgement
  (2026-10-21, the owner's Q4):** every learner a lock changes is then FULLY
  locked (it took them only with every subject graded, and locked every
  row), so each one's active parent gets `grades_locked` — bell only,
  INSERT IGNORE on the term's lowest grade id, so a repeat asks nobody
  twice. An unlock deletes the term's `grade_acknowledgements` row and both
  typed notifications for every learner it changes, inside the transaction,
  and signals their recipients after the commit; a relock asks again. A lock
  is still not a publication: nothing says what the grades are. Never an
  LRN.
- **`400`s, exact:** "lock must be true or false.", "term must be 1, 2, or
  3.", "dry_run must be true or false." (strict — the string `"true"` never
  applies), "grade_level must be a whole number from 1 to 6.", "section must
  be a section name.", "A section needs a grade level.". `401` without a
  token; a teacher or a parent `403` (`authorize`).

Proved by `test:grade-locks` (`docs/TESTING.md`).

### Grade acknowledgements: `POST /api/grades/acknowledgements` (feat/grade-acknowledgement, 2026-10-21)

The owner's Q1–Q12: a parent confirms, once per term, that they have seen
their child's locked grades; the adviser is told; an unlock clears it.
**Parent only; registered BEFORE `/locks` and `GET /:id`.**

- **What "locked" means (Q3):** the term is FULLY locked for the learner —
  every subject of the learner's grade level has a locked grade row WITH a
  value (`term_grade` or `descriptive_grade`; Grade 1's letters count, Q10).
  The bulk lock's own test, applied after the fact (`termFullyLocked` in
  `routes/grades.js`); a locked shell row is not a final grade, and a
  subject with no row is not graded. The report card's
  `acknowledgements[term].locked` and the class summary's `term_locked`
  are this same answer.
- **The row (Q1):** `grade_acknowledgements` — the 26th table — one per
  (`student_id`, `school_year`, `term`), `user_id` the confirming account
  (SET NULL if it goes), `acknowledged_at`. **Never written for an unlocked
  term; deleted by an unlock of ANY row of the term (Q2)** — bulk or
  single — and `activity_logs` keeps the trail (`acknowledge_grades` on the
  parent, `grade_acknowledgement_cleared` on the admin). The dormant
  `grades.acknowledged` / `acknowledged_at` columns stay as they are (Q8).
- **Body** `{ term, school_year? }` — the learner is `req.user.student_id`,
  never a body or path value; the school year defaults to the
  `academic_year` setting. Only an ACTIVE parent reaches the handler (Q11;
  `authenticate` refuses every other status first).
- **Answers:** `400` "term must be 1, 2, or 3." / the school-year sentence /
  "Your account is not linked to a learner."; `404` "Student not found.";
  **`409` "Term N is not locked yet — there is nothing to confirm."**;
  **`200` "Already confirmed on <day>. Nothing changed."** with the row (a
  repeat is absorbed, not refused — the client's §5e dialog is the one
  deliberate step); **`201` "Term N grades confirmed."** with
  `acknowledgement` `{ term, school_year, acknowledged_at, by_name }`.
  Teacher and admin are `403` (`authorize`). Never an LRN.
- **Notifications, both bell-only under `grades` (Q4, Q5):**
  `grades_locked` to the learner's active parent when a lock — the bulk
  `POST /locks` or the single `PATCH /:id/lock` — completes the term (the
  term's LOWEST grade id is the item, one key for the ask, the confirmation
  and the delete); it **self-heals** in the parent's visibility clause once
  the confirmation exists (listed and counted no more, the row kept unread)
  and the handler signals the parent so the bell drops it live.
  `grades_acknowledged` to the adviser of the learner's section
  (`excuseAdviserAudience` — the review authority; no adviser, no row),
  re-checked live in the teacher's visibility clause. **Nothing for the
  admin.** An unlock deletes both typed rows (`removeTypedNotifications`,
  never the item's `grade_available`) so a relock can ask again.
- **Where it shows:** `GET /grades/student/:studentId` →
  `acknowledgements` (all three terms, every reader); `GET /class-summary`
  → `term_locked` + `acknowledged` per learner (term sheets; `null` on the
  Final); `POST /locks` → `acknowledgements_cleared`.
- **Migration:** `npm run db:migrate:grade-acknowledgements`
  (`scripts/migrate-grade-acknowledgements.js`, the template's shape:
  idempotent, `--print-state`, never drops) creates the table, its two
  foreign keys and appends `'grades_locked','grades_acknowledged'` to
  `notifications.type`; a dump taken before it needs it re-run after a
  restore (KNOWN_ISSUES).

Proved by `npm run test:grade-acknowledgements` (`docs/TESTING.md`).

### The class summary: the adviser's Summary of Grades (CR3, 2026-09-22)

`GET /api/grades/class-summary` — one learner per row, every subject across
the row, the General Average at the end. The sheet an adviser compiles from
the subject teachers' class records. **Read-only: the adviser is not the
encoder.**

**Scope answers in three ways, not two:**

| Caller | Status |
|---|---|
| The adviser of that section | `200` |
| A teacher in **view** scope but not the adviser | **`403`** — *"Only the adviser of Grade 5 - Masigasig can open the class summary."* |
| Any other teacher, **or a section that does not exist** | `404`, identically — probing cannot tell "no such class" from "not yours" |
| `admin` | `200`, unscoped |
| `parent` | `403` from `authorize()` |

The `403` is **not** a widening of §5's "reads out of scope return `404`". It
is the same exception excuse-letter review and the five `:id`-keyed grades
writes already take: a broader `GET` (the class record, the report card)
already exposes this class to an assigned teacher, so a `404` here would be a
lie and the `403` leaks nothing they could not already read.

**`term` takes `final`** alongside 1/2/3. A final cell carries the Final Grade
(whole) or the Final **letter** for Key Stage 1, and `grade_id` / `is_locked`
are `null` — a final is computed, not a row.

**TWO FLAGS, never one.** `show_final` and `show_general_average` are
independent, because a descriptive card has a Final **letter** and no general
average at all — one shared boolean would put a GA column on a Key Stage 1
sheet. On a descriptive class the `general_average` key is **absent from each
learner row**, not `null`: the school computes no such figure, so there is
nothing for a client to render as Pending.

**`completeness`** is `[{ subject_id, recorded, total }]` — how many learners
have that term recorded, out of the class. **Counted, never concluded** (§4):
it is a fraction, never "behind". `total` is the class size, so a seeded
learner with no grades raises every subject's pending count, which is correct.

**A learner with no grade row is `null`, never `0`.** A shell row created as a
side effect of encoding someone else is still `null` — a row is not a grade.

**NO PAGINATION, and this is the one list endpoint in the API without it.** A
Summary of Grades is a **document**: the adviser reads it against a paper
form, and page 2 of a class is not a thing that exists on that form. A class
is bounded by enrolment (~40), not by history, which is the difference from
every other list here.

### Grades read scope is assigned-OR-adviser (CR3, 2026-09-22)

`teacherCanViewGrade` widened. **Encode scope did NOT** — encoding is the
subject teacher's authority (`teacher_assignments` on all four of
teacher/subject/grade/section), and widening it would invent school policy.

The omission it fixed was real: **TCH-002 advises Masigasig and holds zero
`teacher_assignments` rows**, so the adviser of a section could not read one
grade in it — not a report card, not the class record — while being the one
person expected to compile that section's summary. Read scopes were widened to
assigned-OR-adviser in `students.js`, `excuses.js`, `content.js` and
`messages.js` on 2026-09-06/07; grades was left out.

**`TEACHER_ADVISES_CLASS_SQL` sits beside `TEACHER_VIEW_SCOPE_SQL` in
`utils/teacherScope.js`, and the two must change together.** Two forms of one
rule, because the callers differ:

- `TEACHER_VIEW_SCOPE_SQL` matches `sec.id = s.section_id` and needs a
  `students` row aliased `s`.
- `TEACHER_ADVISES_CLASS_SQL` matches `sec.grade_level = ? AND sec.name = ?`
  and needs only a **class key**.

Every grades caller passes a class key, and two of them — the class record's
`GET` and `PUT` — hold no student at all. **Routing them through `students`
would make an EMPTY class invisible to a teacher holding a real assignment
row**, which is a silent regression, so the class-keyed form exists. They
agree by construction on real data (`POST /api/students` resolves `section_id`
and never inserts `NULL`); the empty-class case is the divergence they are
allowed. Matching `sections` by `grade_level + name` is the `content.js`
shape, **not** a `section_id` read, so the count of `section_id` readers stays
at four.

### Grade 1 writes: the four score endpoints, and the one that is gone (2026-09-22)

**`PATCH /:id/descriptive` is RETIRED.** The route is not mounted, so any
caller — including an admin — gets a plain `404`. It took a letter a teacher
picked by hand, and the school confirmed the letter is **computed**
(`docs/GRADING_SPEC.md` §6a). There is no replacement endpoint, because there
is no longer anything to set.

**A Grade 1 row now accepts scores through the same four endpoints Grades 2–6
use** — `POST /:id/components`, `PUT` and `DELETE` on a component, and
`PATCH /:id/exam`. They used to answer `400` ("record a letter instead") on a
descriptive row. Consequences worth stating, because each one is a behaviour a
caller can observe:

- **`grade_components.type` is still `ENUM('WW','PT')`.** Summative rides on
  the existing `ex_st1`/`ex_st2`/`ex_te` columns via `PATCH /:id/exam` with
  the same 30/30/40 split. The request body is unchanged; only the *word* on
  screen differs (the school calls it Summative in Key Stage 1).
- **The response carries `descriptive_grade` and `initial_grade`, and
  `term_grade` stays `null` forever.** The dual-mode invariant is enforced in
  `recomputeGrade`, which throws rather than write both.
- **`grade_weight_configs` is now required for descriptive levels too**, so a
  Grade 1 subject with no weight row answers the usual `409` naming the gap
  rather than the old `400`. A clean `db:setup` seeds all 40; an existing
  database gets the five Grade 1 rows from
  `npm run db:migrate:grade1-weights`.
- **`grade_available` fires once per row**, on that row's own grade value
  going `null` → non-null — `descriptive_grade` for Grade 1, `term_grade`
  otherwise. Re-encoding a score that changes B to A does **not** notify again.

**`initial_grade` is present on every term of `GET /student/:studentId`.**
Added 2026-09-22 so the report card's Final *letter* can be computed from the
three terms' raw scores. **A parent client must not render it** — Key Stage 1
reports letters only, and the web card is covered by a render-time guard that
fails if any spelling of the number reaches the markup. It is returned rather
than hidden because the Final letter cannot be derived without it, and the
server is the only place a grade may be computed.

**`subjects[].final_grade` holds two types by mode.** A **number** in
numerical mode and a **letter** (`A`–`E`) in descriptive mode, with
`final_grade_descriptor` beside it in both. A client that formats it as a
number will print a real `A` as "not applicable" — the web card routes the
letter through its term renderer instead. `null` means *not all three terms
are recorded*, which for a legacy Grade 1 row (a letter with no scores behind
it) is permanent.

**There is still no General Average for Grade 1.** `general_average`,
`general_average_descriptor` and all three `term_averages` are `null` in
descriptive mode regardless of how complete the card is — inapplicable, not
pending.

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
- **`term_average_descriptors` rides beside it (pre-Stage-5 #2, 2026-09-25)**
  — the band word for each term average, keyed the same way:

  ```json
  "term_average_descriptors": { "1": { "descriptor": "Benchmarking", "remarks": "Passed" }, "2": null, "3": null }
  ```

  Each entry is `qualitativeDescriptor(term_averages[t])` — the **same
  `{ descriptor, remarks }` object** `general_average_descriptor` is, through
  the same `BANDS` ladder — or `null` wherever the average is `null`. Exists
  because the parent hero shows `term_averages[current_term]` and had no word
  to put beside it: `general_average_descriptor` describes the YEAR, and
  banding the number in the client would be a second ladder (§12). **A client
  renders `.descriptor` and never `remarks`** — that is Passed/Failed, a
  verdict (§4) — and never the object itself as a child.
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
| GET | `/` | **`teacher(recorder)`**, `admin` | query: `student_id`, `grade_level`, `section`, `date`, `from`, `to`, `status` | `attendance` (array) | **Teacher scope since 2026-09-26 (pre-Stage-5 #6), per row: `a.recorded_by = me` OR the learner is CURRENTLY in a section I advise** — no `teacher_assignments` leg, no schema; a former adviser keeps the days they recorded, the new adviser sees every row of a current learner. **`date` with `from` or `to` → `400`** *"date cannot be combined with from or to — send one day or a range, not both."* (2026-09-25; before that the range was silently dropped and the one day answered) |
| GET | `/student/:studentId` | **`teacher(recorder)`**, `admin`, `parent(own)` | query: `from`, `to`, `status` | `attendance` (array) | `404` unless adviser of the learner's current section OR recorder of at least one of their rows (2026-09-26); then the same per-row predicate as `GET /` — the query JOINs `students s` for the adviser leg. Parent and admin unchanged |
| GET | `/summary/:studentId` | **`teacher(recorder)`**, `admin`, `parent(own)` | query: `from`, `to` | `summary` | `404` as above; the counts are over the per-row predicate for a teacher (a former adviser's summary counts only the days they recorded); raw counts only, no rate. Parent and admin unchanged |
| POST | `/` | `teacher(adviser)`, `admin` | `student_id`*, `date`*, `status`* (`Present`\|`Absent`\|`Late`\|`Excused`) | `attendance` (single) | teacher out-of-scope → `403` |
| POST | `/bulk` | `teacher(adviser)`, `admin` | `section_id`*, `date`*, `entries`* (array of `{student_id, status}`) | `attendance` (array) | teacher out-of-scope → `403`; this is the **primary** path, not a convenience alias |
| PUT | `/:id` | `teacher(adviser)`, `admin` | `status`* | `attendance` (single) | `404` out-of-scope |

**One more writer of these rows since B8:** an excuse letter's review sets
that day's attendance in its own transaction (Excuse Letters, below). A day it
writes is an ordinary row: `PUT /:id` can correct it, and so can the two POSTs
for an active learner — both refuse an inactive one, whose past day a review
still writes (the owner's Q10).

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
| PUT | `/:id` | `parent(own)` | `absence_date`, `reason`, `details` (any subset) | `excuse_letter` | `404` if not theirs; `403` if already reviewed — re-checked in the `UPDATE` itself (`AND status = 'Pending'`, since B8), so an edit cannot land after a review that began after its read |
| PATCH | `/:id/review` | `teacher(adviser)`, `admin` | `status`* (`Approved`\|`Declined`), `teacher_remarks` | `excuse_letter`, **`attendance`** (the day's row afterwards, or `null`), **`attendance_from`** (its status before, or `null`), **`class_day`** (boolean) | `404` outside `wide` read-scope; `403` naming the reason if within `wide` but not `adviser`; `403` if already reviewed (re-checked inside the transaction, so two reviews of one letter cannot both land); **since `feat/excuse-attendance` (B8, the owner's decision of 2026-10-22) it SETS that day's attendance in the same transaction** — see the paragraph below; **`409`** *"Another change arrived at the same moment, so this decision was not saved. Please try again."* when the transaction loses to a concurrent write (a duplicate key, a deadlock or a lock-wait timeout — everything rolls back and the letter stays Pending); emits `notification_counts` to the parent AND the reviewer (the reviewer's `excuse_submitted` self-heals — Notifications); the parent's `excuse_reviewed` text is unchanged |

**A review sets that day's attendance (B8, `utils/excuseAttendance.js`).** In
one transaction the letter moves out of Pending, is re-read `FOR UPDATE` (its
learner and date as stored at that moment, never the handler's earlier read),
that day's row is read `FOR UPDATE`, and the rule decides: **approved** — no
record → a new row `Excused`, `Absent` → `Excused`; **declined** — no record →
a new row `Absent`; **every other mark stays** (`Excused`, `Present` and `Late`
under either decision, `Absent` under a decline). **A day that is not a class
day gets no write**, whatever it holds: a class day is a weekday inside one of
the three terms (`TERMS` in `utils/schoolCalendar.js`, each term's
`start`..`end` — the owner's answer of 2026-10-23), so a weekend, the break
between Term 2 and Term 3 (in SY 2026-2027, 2026-12-19 → 2027-01-03) and a
date outside the school year are not. A row written carries `recorded_by` = the reviewer; a day
that already holds the result is not written at all (no `recorded_by` change,
no `updated_at` bump). An inactive learner's past day is written all the same.
When the day changes, a second `activity_logs` row, `excuse_attendance`
("Set attendance for student #N, YYYY-MM-DD: Absent -> Excused (excuse letter
#M)"). Plain `INSERT` / `UPDATE` by id — no `ON DUPLICATE KEY`. The reply's
`attendance` row is read inside the transaction, before `COMMIT`, so it is the
row this review left, not a later write's. The rule
replaces the school's earlier "the learner stays Absent" (`docs/ARCHIVE.md` →
"Moved from CLAUDE.md on 2026-10-23"). Attendance's own write paths (above)
are unchanged; this is a fourth writer of `attendance` rows.

### Settings (5) — `/api/settings`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `all` | — | `settings` (flat object) | only the **8** allow-listed keys: `school_name`, `school_address`, `academic_year`, `logo_url`, and since 2026-09-26 (pre-Stage-5 #5a) `school_id` (6 digits or empty), `school_email` (the email rule), `school_phone` (7–15 digits after stripping spaces/dashes/parens/`+` — a landline passes), `facebook_page` (≤ 255, free text; blank until the school gives it). **`current_term` is RETIRED (pre-Stage-5 #7, 2026-09-26)** — the term is derived from today's date by `utils/schoolCalendar.js`; a PUT or PATCH naming the key is the ordinary unknown-key `400`, whose allowed-keys list no longer contains it, and a row left on a live database never appears in any read |
| GET | `/public` | **none — unauthenticated** | — | `settings` (flat object) | **The one public settings read** (2026-09-26): exactly six keys — the five `school_*` keys and `facebook_page` (`school_name`, `school_address`, `school_id`, `school_email`, `school_phone`, `facebook_page`; `PUBLIC_KEYS` in `server/routes/settings.js`), every key present, `''` when unset. For the signed-out About page. **Registered BEFORE `/:key`**, or Express parses `public` as a key and answers 404 |
| GET | `/:key` | `all` | — | `key` + `value` (bare) | `404` if not one of the 8 allow-listed keys (so `/current_term` is `404` since #7); `:key` is a **string**, not `parseId`-validated |
| PUT | `/:key` | `admin` | `value`* | message + `key` + `value` | `400` if unknown key or fails per-key validation; a string value is trimmed before validation and stored, echoed and logged trimmed (2026-09-15) |
| PATCH | `/` | `admin` | `settings`* (object of key/value pairs) | `settings` (flat object) | all-or-nothing; `400` naming any unknown key or failing value before anything is written; values trimmed as in PUT; the response is the 8 allow-listed keys only, same read as `GET /` (2026-09-15; nine keys from #5a, eight since #7 retired `current_term`, both 2026-09-26) |

### Backups (5) — `/api/backups`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | `admin` only | — | `backups` + `orphaned_files` | newest first; each row flags `file_exists` |
| POST | `/` | `admin` only | — | `backup` | real `mysqldump`; row inserted only after success. **Since 2026-09-30 the dump is written as `<name>.sql.partial` and renamed to `.sql` only when non-empty and footer-complete**; a failure removes it, and a startup sweep removes any `.partial` older than a minute (a safeguard against a process killed mid-dump — never a `.sql`, so no backup file is deleted). The list's `orphaned_files` is `.sql` only |
| GET | `/:id/download` | `admin` only | — | binary file stream, no JSON on success | `404` if row or file missing |
| DELETE | `/:id` | `admin` only | — | message only | row still removed if file already gone |
| POST | `/:id/restore` | `admin` only | `password`*, `confirm_filename`* | `restored_from` + `safety_backup` + `activity_logs_wiped` | see Gotchas — the one `200`-but-degraded endpoint; `400` on missing password, `403` "Incorrect password." on a wrong one (both were `401` until 2026-09-15 — the session is valid), `400` on `confirm_filename` mismatch; since 2026-09-18 the two password refusals carry `field: "password"` and the mismatch carries `field: "confirm_filename"`; each of those refusals is logged as `restore_refused` |

### Messages (6) — `/api/messages`

| Method | Path | Roles | Request body | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/contacts` | any authenticated | query: `search` (optional) | `contacts` (array) | Who this user may start a conversation with — the inverse of `canMessage()`. **parent** → teachers connected to their own child (assigned to the child's class OR its section adviser) — **no admin since 2026-10-05**; **teacher** → parents of students in their own scope (assigned OR adviser) + other teachers + admins; **admin** → **teachers only since 2026-10-05** (every active teacher; it was everyone else); any other role → nobody. **ACTIVE accounts only** — a pending parent cannot log in, so listing them would offer a conversation that cannot happen. `?search=` filters on contact name and student name **within the already-scoped set**, never an unscoped user search. Row: `{id, name, role, subject, student_name, student_grade_level, student_section, last_message, last_message_at, unread_count}`; `subject` and the three `student_*` fields are `null` where not applicable (teacher/admin rows have no linked student — the prefix marks the **child's** class, not the contact user's). **`subject` on a teacher row** is the comma-joined names of the subjects they are assigned (`teacher_assignments`, alphabetical); **since 2026-10-06 a teacher with NO assignment who advises a section carries `"Adviser of Grade 5 - Masigasig"` there instead** (the teacher dashboard's chip, word for word; several sections are comma-joined; matched on `sections.adviser_id`, as the teacher view scope is), and a teacher with neither carries `null`. A teacher with subjects keeps the subject list even when they also advise. The web and phone pickers print the field as " — {subject}" and the parent/admin pickers search it, so the label needs no client change. Self always excluded. `GET /conversations` and `GET /with/:userId` do not carry class. |
| GET | `/conversations` | any authenticated | — | `conversations` | one row per person messaged, last message + unread count |
| GET | `/with/:userId` | any authenticated | — | `messages` (thread array) | participant-scoped, not re-checked against current `canMessage()` eligibility |
| POST | `/` | any authenticated | `receiver_id`*, `body`* | `data` | `403` naming the reason on a `canMessage()` violation; `404` if recipient not found/inactive; emits `new_message` over Socket.io. **The pairs (the owner's decision, 2026-10-05):** teacher ↔ teacher and teacher ↔ admin allowed both ways; teacher ↔ parent only for the teacher's own learners. Refusals, verbatim: parent → anyone but a teacher, the admin included: *"Parents may only message their child's teachers."*; parent → an unconnected teacher: *"This teacher is not connected to your child's class."*; **admin → anyone but a teacher, a parent or another admin included: *"The admin may only message teachers."***; teacher → a parent outside their classes: *"This parent's child is not in one of your classes."*. Until 2026-10-05 an admin could message anyone and anyone the admin; an older parent ↔ admin thread stays readable through `GET /with/:userId`, and only a new send is refused |
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

**Except a deleted ITEM (since 2026-09-30, `fix/server-reliability`).**
`DELETE /api/announcements/:id`, `/api/memos/:id`, `/api/events/:id` and
`/api/grades/:id` delete the item's `notifications` rows in the same
transaction as the item (`utils/notify.js` `removeItemNotifications`) and,
after the commit, emit `notification_counts` to every recipient those rows
had — so a cached bell or badge refetches instead of counting a row the
read-time check already hides. The re-check above still covers the other
case, an audience that changed while the item lives.

**A call to act self-heals** (fix/smoke-gate `12a3495`, 2026-09-26): an
adviser's `excuse_submitted` is listed and counted only while its letter is
still `Pending` (`n.type <> 'excuse_submitted' OR x.status = 'Pending'` in
the teacher visibility clause) — the same shape as admin's pending parent.
The row is neither deleted nor marked read; it stays, unread, as history.
Before this the adviser's Excuse Letters badge and the bell kept counting a
letter that needed nothing more. `PATCH /api/excuse-letters/:id/review`
therefore also emits `notification_counts` to the **reviewer**, not only to
the parent, so the drop is live. **The same for a parent's `grades_locked`
since feat/grade-acknowledgement (2026-10-21):** listed and counted only
while no `grade_acknowledgements` row exists for that learner, school year
and term, and `POST /api/grades/acknowledgements` signals the parent too.

**A visit clears an information badge (since `fix/f3-badges`, 2026-10-22 —
the smoke gate's F3, the owner's decision).** `PATCH /read-all` takes an
optional `{ section }`: the badged page's information rows only, the calls to
act above untouched. No new handler — still four here (101 / 102). The table
below has the rules.

| Method | Path | Roles | Request | Response key | Notes |
|---|---|---|---|---|---|
| GET | `/` | any authenticated | query: `limit` (1–200, default 50), `offset`, `sort` (`created_at` only), `order`, `unread_only` (`true`/`false`) | `notifications` (array) + `page` | Newest first. Row: `{ id, type, item_type, item_id, title, body, link, actor_name, created_at, read_at }` — `read_at` `null` means unread. `title`/`body` are **composed server-side from the LIVE item**, never stored text (an edited announcement reads as it reads now); `link` is the client route to open, so no client keeps a type→route map. `page.total` counts the filtered AND visibility-checked set (§6b C4). `unread_only` outside `true`/`false` is `400`. |
| GET | `/unread-counts` | any authenticated | — | `counts` | `{ total, announcements, memos, events, excuse_letters, users, grades }`, keyed by **nav section**, unread only. `total` is every unread row; the named keys are what a sidebar badge may show. **`total` can exceed the sum of the named keys a role badges**, because `grades` is counted here and is deliberately never badged — see CLAUDE.md §9. Excludes messages entirely: those have their own count at `GET /api/messages/conversations`. |
| PATCH | `/:id/read` | any authenticated (own rows only) | — | `notification` | Sets `read_at`. Ownership is in the `UPDATE` itself, so there is no window between a check and the write. An already-read row is **absorbed**, not an error (a repeat, not a second decision — §5e). Another user’s row, or a nonexistent one, is `404`. Non-numeric id is `400` (`parseId`). |
| PATCH | `/read-all` | any authenticated (own rows only) | body: optional `{ section }` (since `fix/f3-badges`, 2026-10-22) | `updated` (number); with a section also `section` | **No `section` key** (no body, or `{}` — the bell's Mark all as read): exactly as before — every unread row of the caller read, including ones currently filtered out by the visibility re-check; `{ message: 'All notifications marked as read.', updated }`. **With `section`** — THE VISIT CLEAR, which a badged page sends once its list loads — only that badge's unread **information** rows that pass the visibility re-check are marked read, per role (`VISIT_CLEAR`): parent `announcements` (announcement), `memos` (memo), `events` (event), `excuse_letters` (excuse_reviewed); teacher the first three and `excuse_letters` (none); admin `announcements` (announcement + memo — its badge carries both) and `users` (none). **A call to act is never in a section** — `excuse_submitted` and `parent_pending` clear on the decision (self-heal, above) — nor any grade type (Grades is never badged; `grades_locked` / `grades_acknowledged` are bell-only), and messages are not notifications. A section with no clearable type answers `{ message: 'Marked as read.', section, updated: 0 }` with no query; found ids none, no `UPDATE`. A clear above 0 emits `notification_counts` to the CALLER's own room, so their other devices and tabs refetch; nothing is emitted at 0. Any other value — a section of another role, `grades`, `messages`, a non-string, `null`, `''` — is **`400` "section must be one of: announcements, memos, events, excuse_letters."** (parent, teacher) / **"section must be one of: announcements, users."** (admin). A second call returns `updated: 0` and is not an error. |

**No DELETE, and no endpoint that writes a notification.** Rows are created
only by the fan-out hooks in `server/routes/` (seven at N1; nine since
feat/grade-acknowledgement added the two grade-lock hooks and the
acknowledge handler's), never by a request.

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
| `excuse_submitted` | New excuse letter | `{student first + last} has a new excuse letter for {absence_date}.` — to the adviser, who is already authorised to see that student; **listed and counted only while the letter is Pending** (self-heals on review, above) |
| `excuse_reviewed` (Approved) | Excuse letter approved | `Your excuse letter for {absence_date} was approved.` |
| `excuse_reviewed` (Declined) | Excuse letter declined | `Your excuse letter for {absence_date} was declined. Open it to read the teacher’s remarks.` — the remarks are **not** inlined; they are optional and can be long |
| `parent_pending` | Parent account waiting for approval | `A new parent account for {student first + last} is waiting for approval.` — names the STUDENT, never the login id |
| `grade_available` | A grade is ready to view | `{subject} — Term {n} is now on the report card.` — **no number, no letter, no "passing"** |
| `grades_locked` (feat/grade-acknowledgement, 2026-10-21) | Term {n} grades are final | `Please confirm you have seen your child's Term {n} grades.` — to the learner's parent, link `/parent/grades`; **listed and counted only until the parent confirms** (self-heals, above); no score or letter |
| `grades_acknowledged` (feat/grade-acknowledgement, 2026-10-21) | Grades confirmed | `{student first + last}'s parent has seen the Term {n} grades.` — to the adviser of the learner's section, link `/teacher/class-summary?term={n}` — Class summary opens on the confirmed term (since the B1 fix round, 2026-10-22; before it the bare path, today's term); names the STUDENT, never the parent's login id |

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

Common to every role: `role`, `school_year`. A missing `academic_year` in
`system_settings` is `500` naming the key — it is seeded and validated by
`PUT /api/settings/:key`, so absence is a real misconfiguration, not an
empty state. **The term is not read from settings since pre-Stage-5 #7
(2026-09-26): `readSchoolContext()` takes it from
`utils/schoolCalendar.js` — the latest term whose start is on or before
today's local date, else 1 — and answers `500` naming both strings when
`academic_year` differs from the module's `SCHOOL_YEAR`** ("academic_year is
2027-2028 in system settings but the school calendar is for 2026-2027"), so
a new school year cannot be half-configured.

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
  `term_grade` — deliberately NOT the current term (once a setting an admin
  could advance, since #7 the calendar's), which on the first day of a term
  would leave the card reading "Pending — 0 of 8" for a term nobody has
  encoded yet.
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

### Policy (3) — `/api/policy`

The consent gate's own endpoints (feat/privacy, 2026-10-10). All three are
reachable while the gate is shut (§5b) — after the forced change. **The text
ships with the app**: `server/policy/privacy-notice.md`, `terms-of-use.md` and
`versions.json`, read once when the server starts — a new text is an edit, a
version bump and a restart. Both are still the placeholder ("Draft — awaiting
the school's approval"; KNOWN ISSUES).

| Method | Path | Roles | Request body | Response key |
|---|---|---|---|---|
| GET | `/` | any authenticated | — | `documents` — `[{ document, title, version, text }]`, the Data Privacy Notice then the Terms of Use |
| GET | `/status` | any authenticated | — | `required` (does this role accept — every role since feat/staff-acceptance), `policy_pending`, `acceptances` — `[{ document, title, version, accepted_at }]` for the CURRENT versions, `accepted_at` null until accepted |
| POST | `/accept` | `parent`, `teacher`, `admin` (`policy.ROLES_THAT_ACCEPT`; staff since feat/staff-acceptance, 2026-10-11) | `versions`* — `{ privacy_notice, terms_of_use }`, the versions the screen SHOWED; `on_behalf_of_child`* — `true`, **a parent only** (staff send `{ versions }`; the flag is neither required nor read for them) | `policy_pending` + `acceptances` + message "Thank you. You can now use the portal." — a missing version is `400` "Tick the box to accept the …" with `field` naming the document; a parent with no `on_behalf_of_child: true` is `400` with `field: "on_behalf_of_child"`; **a version other than the current one is `409`** "The … has changed since this page opened. Read the new version, then accept again." — never a silent acceptance of words not shown. One `policy_acceptances` row per document (user, version, time, and the parent's `student_id` — NULL for staff); a version already accepted is a no-op `200` (a double tap). Logged `accept_policy` with the documents and versions only |

---

### Activity log (3) — `/api/activity-logs`

The admin's read of `activity_logs` (feat/activity-log, B2 — the owner's
decision D-21, 2026-10-16; FRONTEND §36). `routes/activityLogs.js`.
**`description` is never selected** — no statement names it — and an entry is
exactly seven fields: `id`, `created_at` (the instant, ISO), `action`,
`action_label` and `action_group` (the server's words,
`utils/activityActions.js`; an unknown code is its own label, group `other`),
`actor_name` and `actor_role` (`users.name` / `users.role`, both null for a
deleted account — every writer passes an id, the FK is `ON DELETE SET NULL`).
Never `user_id`, never a login id. **Newest first, always**: `ORDER BY
a.created_at DESC, a.id DESC`; `sort` and `order` are `400`.

**The filters**, shared by the list and the export, all optional: `from`,
`to` — a real date `YYYY-MM-DD`, a MANILA day (`from` its first instant, `to`
the first instant after it; `utils/manilaTime.js`), `from` after `to` `400`;
`role` — `admin` | `teacher` | `parent` | `deleted` (no account); `action` — one
code (lower-case letters and underscores); `group` — a group key, or `other`
(every code the map does not know); `action` with `group` is `400`. Every
refusal is `400 { success: false, message }`.

| Method | Path | Roles | Query | Response key |
|---|---|---|---|---|
| GET | `/` | `admin` | the filters; `limit` (default 50, max 200), `offset` (§6b) | `entries` — the seven fields; `page` — `{ limit, offset, total, has_more }`, `total` the FILTERED count; `export_limit` — `{ max: 50000, message }`, `message` the export's own refusal when this filter is over the cap, else null. Logs nothing (a read) |
| GET | `/actions` | `admin` | — | `groups` — `[{ key, label, actions: [{ code, label }] }]`, the map's eleven groups in order, then `other` with any code the table holds that the map does not know (its code as its label) — absent when there is none |
| GET | `/export` | `admin` | the filters (no `limit`, `offset`, `sort` or `order` — `400`) | **A CSV, not JSON**: `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="activity-log_<from or beginning>_to_<to or today>.csv"` (exposed through CORS — `server.js`), `Cache-Control: no-store`. UTF-8 BOM, eight quoted columns — Entry, Date, Time (Philippine time), Account ("Deleted account" for none), Role, Group, Action, Action code — CRLF between records, every cell formula-guarded (`utils/csv.js`), newest first. **Over 50,000 matching entries `400`** "This filter matches N entries; a download holds at most 50,000. Narrow the dates or add a filter." — never a cut set. Logged `export_activity_log`: the count, the dates and the filter codes only. A failure's body is the usual JSON |

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
| Auth | 14 | `auth.js` |
| Users | 11 | `users.js` |
| Students | 5 | `students.js` |
| Sections | 3 | `sections.js` |
| Subjects | 1 | `assignments.js` |
| Assignments | 3 | `assignments.js` |
| Grades | 15 | `grades.js` |
| Grading modes | 1 | `gradingModes.js` |
| Attendance | 6 | `attendance.js` |
| Announcements | 4 | `content.js` |
| Memos | 4 | `content.js` |
| Events | 4 | `content.js` |
| Excuse Letters | 6 | `excuses.js` |
| Settings | 5 | `settings.js` |
| Backups | 5 | `backups.js` |
| Messages | 6 | `messages.js` |
| Notifications | 4 | `notifications.js` |
| Dashboard | 1 | `dashboard.js` |
| Policy | 3 | `policy.js` |
| Activity log | 3 | `activityLogs.js` |
| **Total** | **104** | |

14+11+5+3+1+3+15+1+6+4+4+4+6+5+5+6+4+1+3+3 = **104 handlers in `server/routes/`**
(recounted from the code 2026-10-23, feat/activity-log (B2): +3 activity log;
101 on 2026-10-21, feat/grade-acknowledgement, merged 2026-10-22: +1 grades
`POST /acknowledgements`; 100 on 2026-10-18, feat/first-signin: +2 auth `PUT /email`
and `PUT /first-password`; 98 on 2026-10-13, fix/grade-locks: +1 grades `POST /locks`;
97 on 2026-10-10, feat/privacy: +3 policy; 94 on
2026-09-30, feat/profile-photos: +2 auth `PUT`/`DELETE /photo`, +1 users
`DELETE /:id/photo`; 91 on 2026-09-29, when
the Total row had said 87 while the sum said 89). Plus `GET /api/health`,
mounted directly in `server.js` = **105** endpoints in total. Contributions' 8 were removed 2026-09-13 and are not in either figure.
**Grades went 11 → 10 → 12 → 13 across 2026-09-22/23**: `PATCH /:id/descriptive`
was retired — still the only endpoint this system has ever removed other than
Contributions' eight — then the class record's `GET` and `PUT` landed, then
the class summary's `GET`. **14 on 2026-10-13** with the bulk `POST /locks`;
**15 on 2026-10-21** with `POST /acknowledgements`.

**State which number you mean.** 104 is handlers in route files; 105 is every
endpoint the API answers. CLAUDE.md's archived table is 81 rows — that is a
dated 2026-09-19 snapshot taken before Notifications and account recovery
landed, and it is not the live record. This document is.

**Verified by a three-way audit on 2026-09-07** (CLAUDE.md's endpoints table vs. this document vs. the handlers actually registered in `server/routes/` and mounted in `server/server.js`): all three agreed then at 77. Additions since: assignments/subjects and grading-modes and `DELETE /grades/:id` (2026-09-08), `PUT /auth/contact` (2026-09-09), Notifications' 4 (2026-09-19, N1), and account recovery's 5 — four on `/api/auth` plus `POST /api/users/:id/temp-password` (2026-09-19, R1), and `GET /api/dashboard` (2026-09-19, DB1), `GET /api/settings/public` (2026-09-26), and `POST /api/auth/verify-contact/request` + `/confirm` (2026-09-29, feat/sms-transport), and `PUT` + `DELETE /api/auth/photo` and `DELETE /api/users/:id/photo` (2026-09-30, feat/profile-photos — recounted from the code the same day: 94 `router.<method>(` calls across `server/routes/`, auth 12, users 11), and the three `/api/policy` endpoints (2026-10-10, feat/privacy — recounted from the code the same day: 97 across 16 route files), and `POST /api/grades/locks` (2026-10-13, fix/grade-locks — recounted from the code the same day: 98 across 16 route files, grades 14), and `PUT /api/auth/email` + `PUT /api/auth/first-password` (2026-10-18, feat/first-signin — recounted from the code the same day: 100 across 16 route files, auth 14), and `POST /api/grades/acknowledgements` (2026-10-21, feat/grade-acknowledgement — recounted from the code the same day: 101 across 16 route files, grades 15), and `GET /api/activity-logs`, `/actions` and `/export` (2026-10-23, feat/activity-log — recounted from the code the same day: 104 across 17 route files). Re-run the existence diff after a dispatch that adds or removes an endpoint.
