# Migration inventory — before Supabase

> **What this is:** a list of everything that exists TODAY in the local
> MySQL + Express + Socket.io version, so nothing is missed when it moves.
> **It is not a plan.** Nothing here says how anything should move.
>
> **Measured 2026-10-18** on `main` `bae0800`, tagged **`v1-local`**.
> The database was read through `information_schema` and `SELECT COUNT(*)`
> only, so row counts are a snapshot: `activity_logs`, `login_attempts` and
> `backups` grow as the app is used. Code references are `file:line` on that
> commit. The test counts are the recorded baselines in `docs/TESTING.md`.
> No suite was run for this file (the HTTP suites write to the live
> database).
>
> No values appear here. That means no secrets, env values, login ids, LRNs,
> names, emails or phone numbers.

## Counts

| | Count | Section |
|---|---|---|
| Tables | 25 (208 columns, 33 foreign keys, 59 secondary indexes, 8 CHECK constraints) | A |
| Views / triggers / stored routines / scheduled events | 0 / 0 / 0 / 0 | A2 |
| Express handlers | 98 in `server/routes/`, plus `GET /api/health` and the static `/uploads` mount in `server.js` | B |
| Handlers no web page or phone screen calls | 20 | B |
| Server rules listed | 50 | C |
| Socket events | 2 emitted by the server, 0 emitted by clients, plus 3 built-in lifecycle events the clients listen to | D |
| Env var names | 20 read by the server at runtime, 1 by the web, 1 by the phone; 15 more used by tooling only; 2 declared in a file but read by no code | F |
| Server test suites | 29 (22 HTTP, 7 direct-call), 2,080 recorded assertions; plus 29 web SSR proofs, 28 phone proofs, 1 Playwright smoke run | G |

---

## A. Database

**Server:** MySQL 8.0.43, InnoDB on every table. The charset is utf8mb4 with
collation `utf8mb4_unicode_ci` on every table and every text column. The
session `time_zone` is `SYSTEM`, and the host is on UTC+8.
`sql_mode` includes `STRICT_TRANS_TABLES` and `ONLY_FULL_GROUP_BY`.

**Schema source:** `database/schema.sql`. It hardcodes
`CREATE DATABASE parents_portal` at `:4` and `USE parents_portal` at `:8`.
It is kept in step with nine migration scripts (`server/scripts/migrate-*.js`).

**Notation:** In "Null", **no** means NOT NULL. "AI" means
`AUTO_INCREMENT`. An FK is written as `→ table.column (ON DELETE rule)`.
Every FK's ON UPDATE is NO ACTION. A `tinyint(1)` is used as a boolean.

### A1. Tables

#### activity_logs — 24,184 rows — `schema.sql:460`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| user_id | int unsigned | yes | — | → users.id (SET NULL); idx_activity_user |
| action | varchar(50) | no | — | idx_activity_action |
| description | text | yes | — | free text, not read for this file |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |

1,415 rows have `user_id` NULL.

#### announcements — 0 rows — `schema.sql:419`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| title | varchar(200) | no | — | |
| content | text | no | — | |
| category | varchar(50) | yes | — | |
| target_grade | tinyint unsigned | yes | — | idx_announcements_grade |
| target_section | varchar(50) | yes | — | |
| section_id | int unsigned | yes | — | → sections.id (CASCADE); fk_announcements_section |
| attachment_url | varchar(255) | yes | — | no upload path exists; 0 rows set |
| posted_by | int unsigned | no | — | → users.id (RESTRICT); idx_announcements_posted |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |

#### assessment_slots — 0 rows — `schema.sql:276`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| subject_id | int unsigned | no | — | → subjects.id (CASCADE) |
| grade_level | tinyint unsigned | no | — | |
| section | varchar(50) | no | — | |
| term | tinyint unsigned | no | — | CHECK 1–3 |
| school_year | varchar(9) | no | — | |
| type | enum('WW','PT') | no | — | |
| slot_no | tinyint unsigned | no | — | |
| name | varchar(100) | yes | — | |
| max_score | decimal(5,2) | yes | — | |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

UNIQUE uq_slot(subject_id, grade_level, section, term, school_year, type, slot_no).

#### attendance — 0 rows — `schema.sql:373`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| student_id | int unsigned | no | — | → students.id (CASCADE) |
| date | date | no | — | |
| status | enum('Present','Absent','Late','Excused') | no | — | |
| recorded_by | int unsigned | no | — | → users.id (RESTRICT); fk_attendance_recorded_by |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

UNIQUE uq_attendance(student_id, date). Also idx_attendance_student_date(student_id, date), which has the same columns as the unique key.

#### auth_codes — 3 rows (all consumed) — `schema.sql:546`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| user_id | int unsigned | no | — | → users.id (CASCADE) |
| purpose | enum('password_reset','email_verification','contact_verification') | no | — | |
| code_hash | varchar(255) | no | — | bcrypt |
| email_snapshot | varchar(100) | yes | — | |
| contact_snapshot | varchar(20) | yes | — | |
| expires_at | timestamp | no | none | |
| attempts | tinyint unsigned | no | 0 | |
| consumed_at | timestamp | yes | — | |
| request_ip | varchar(45) | yes | — | |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |

Indexes: idx_auth_codes_lookup(user_id, purpose, consumed_at, expires_at), idx_auth_codes_rate(user_id, purpose, created_at), idx_auth_codes_ip(request_ip, created_at). The table's rows are never written into a backup dump (C26).

#### auth_security_state — 1 row — `schema.sql:494`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | tinyint unsigned | no | 1 | PK, no AI (a single row) |
| token_valid_after | timestamp | yes | — | the restore cutoff (C24) |

#### backups — 108 rows — `schema.sql:476`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| filename | varchar(255) | no | — | |
| file_path | varchar(255) | no | — | an absolute path on this laptop |
| file_size | int unsigned | no | — | |
| created_by | int unsigned | no | — | → users.id (RESTRICT); idx_backups_created |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |

The table's rows are never written into a dump. The `.sql` files are in `server/backups/`.

#### events — 0 rows — `schema.sql:444`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| title | varchar(200) | no | — | |
| description | text | yes | — | |
| event_date | date | no | — | idx_events_date |
| target_grade | tinyint unsigned | yes | — | idx_events_grade |
| posted_by | int unsigned | no | — | → users.id (RESTRICT); fk_events_posted_by |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |

#### excuse_letters — 0 rows — `schema.sql:389`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| student_id | int unsigned | no | — | → students.id (CASCADE); idx_excuse_student |
| parent_id | int unsigned | no | — | → users.id (CASCADE); idx_excuse_parent |
| absence_date | date | no | — | |
| reason | text | no | — | |
| details | text | yes | — | |
| attachment_url | varchar(255) | yes | — | no upload path exists |
| status | enum('Pending','Approved','Declined') | no | 'Pending' | idx_excuse_status |
| teacher_remarks | text | yes | — | |
| reviewed_by | int unsigned | yes | — | → users.id (SET NULL); fk_excuse_reviewed_by |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

#### grade_components — 0 rows — `schema.sql:319`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| grade_id | int unsigned | no | — | → grades.id (CASCADE); idx_grade_components_grade |
| slot_id | int unsigned | yes | — | → assessment_slots.id (RESTRICT); idx_grade_components_slot |
| type | enum('WW','PT') | no | — | |
| score | decimal(5,2) | no | — | |
| max_score | decimal(5,2) | no | — | |
| label | varchar(100) | yes | — | |
| date_recorded | date | yes | — | |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |

#### grade_weight_configs — 40 rows — `schema.sql:164`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| subject_id | int unsigned | no | — | → subjects.id (CASCADE) |
| school_year | varchar(9) | no | — | |
| ww_weight | decimal(5,2) | no | — | |
| pt_weight | decimal(5,2) | no | — | |
| ex_weight | decimal(5,2) | no | — | |

CHECK ww_weight + pt_weight + ex_weight = 100.00. UNIQUE uq_weight_subject_year(subject_id, school_year). No timestamps.

#### grades — 5 rows (0 locked, 0 acknowledged) — `schema.sql:192`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| student_id | int unsigned | no | — | → students.id (CASCADE); idx_grades_student |
| subject_id | int unsigned | no | — | → subjects.id (CASCADE); idx_grades_subject |
| term | tinyint unsigned | no | — | CHECK 1–3 |
| school_year | varchar(9) | no | — | |
| ww_percentage, ww_weighted, pt_percentage, pt_weighted | decimal(5,2) ×4 | yes | — | |
| ex_st1, ex_st1_max, ex_st2, ex_st2_max, ex_te, ex_te_max | decimal(5,2) ×6 | yes | — | raw exam scores |
| ex_percentage, ex_weighted, initial_grade, term_grade | decimal(5,2) ×4 | yes | — | computed at write time (C3) |
| descriptive_grade | enum('A','B','C','D','E') | yes | — | Grade 1 only; exactly one of term_grade / descriptive_grade is set |
| is_locked | tinyint(1) | no | 0 | |
| acknowledged | tinyint(1) | no | 0 | no code reads or writes it |
| acknowledged_at | timestamp | yes | — | no code reads or writes it |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

UNIQUE uq_grade_record(student_id, subject_id, term, school_year). The Final Grade and General Average are not stored anywhere (C4).

#### grading_mode_configs — 6 rows — `schema.sql:360`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| grade_level | tinyint unsigned | no | — | CHECK 1–6 |
| school_year | varchar(9) | no | — | |
| mode | enum('descriptive','numerical') | no | — | |

UNIQUE uq_grading_mode(grade_level, school_year).

#### login_attempts — 5 rows — `schema.sql:587`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| login_key | char(64) | no | — | an HMAC of the typed id (C16); no FK by design |
| ip | varchar(45) | yes | — | |
| cleared | tinyint(1) | no | 0 | |
| attempted_at | timestamp | no | CURRENT_TIMESTAMP | |

Indexes: idx_login_attempts_key(login_key, attempted_at), idx_login_attempts_ip(ip, attempted_at). Rows older than 24 h are pruned by the app.

#### memos — 0 rows — `schema.sql:434`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| title | varchar(200) | no | — | |
| content | text | no | — | |
| attachment_url | varchar(255) | yes | — | no upload path exists |
| posted_by | int unsigned | no | — | → users.id (RESTRICT); idx_memos_posted |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |

#### messages — 0 rows — `schema.sql:407`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| sender_id | int unsigned | no | — | → users.id (CASCADE); idx_messages_sender |
| receiver_id | int unsigned | no | — | → users.id (CASCADE); idx_messages_receiver |
| body | text | no | — | |
| read_status | tinyint(1) | no | 0 | |
| created_at | timestamp | no | CURRENT_TIMESTAMP | idx_messages_created |

#### notifications — 0 rows — `schema.sql:517`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| user_id | int unsigned | no | — | → users.id (CASCADE) |
| type | enum('announcement','memo','event','excuse_submitted','excuse_reviewed','parent_pending','grade_available') | no | — | |
| item_type | enum('announcement','memo','event','excuse_letter','user','grade') | no | — | |
| item_id | int unsigned | no | — | **no FK**, because it points at six tables |
| title_snapshot | varchar(200) | yes | — | |
| actor_id | int unsigned | yes | — | → users.id (SET NULL); fk_notifications_actor |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |
| read_at | timestamp | yes | — | NULL = unread |

UNIQUE uq_notifications_once(user_id, type, item_id). Also idx_notifications_unread(user_id, read_at, created_at) and idx_notifications_item(item_type, item_id).

#### policy_acceptances — 8 rows — `schema.sql:570`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| user_id | int unsigned | no | — | → users.id (CASCADE) |
| document | enum('privacy_notice','terms_of_use') | no | — | |
| version | varchar(32) | no | — | |
| student_id | int unsigned | yes | — | → students.id (SET NULL); fk_policy_student |
| accepted_at | timestamp | no | CURRENT_TIMESTAMP | |

UNIQUE uq_policy_once(user_id, document, version).

#### sections — 23 rows — `schema.sql:128`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| name | varchar(50) | no | — | |
| grade_level | tinyint unsigned | no | — | CHECK 1–6 |
| adviser_id | int unsigned | yes | — | → users.id (SET NULL); idx_sections_adviser |
| school_year | varchar(9) | no | — | |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

UNIQUE uq_section(grade_level, name, school_year).

#### students — 4 rows — `schema.sql:75`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| lrn | varchar(12) | no | — | UNIQUE lrn |
| first_name | varchar(50) | no | — | |
| last_name | varchar(50) | no | — | |
| grade_level | tinyint unsigned | no | — | CHECK 1–6 |
| section | varchar(50) | no | — | idx_students_grade_section(grade_level, section) |
| section_id | int unsigned | yes | — | → sections.id (RESTRICT); fk_students_section |
| birthday | date | yes | — | retired field (C47); 0 rows hold a value |
| gender | enum('male','female') | yes | — | retired; 0 rows hold a value |
| address | text | yes | — | retired; 0 rows hold a value |
| contact_number | varchar(20) | yes | — | retired; 0 rows hold a value |
| status | enum('active','inactive') | no | 'active' | |
| created_by | int unsigned | yes | — | → users.id (SET NULL); fk_students_created_by |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

#### subjects — 40 rows — `schema.sql:119`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| name | varchar(100) | no | — | |
| grade_level | tinyint unsigned | no | — | CHECK 1–6; idx_subjects_grade |
| display_order | tinyint unsigned | yes | — | |

UNIQUE uq_subject_grade(name, grade_level).

#### system_settings — 9 rows — `schema.sql:470`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| setting_key | varchar(50) | no | — | UNIQUE setting_key |
| setting_value | text | no | — | |

8 rows are on the allow-list (C46). The 9th is a retired `current_term` row that no route reads.

#### teacher_assignments — 8 rows — `schema.sql:140`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| teacher_id | int unsigned | no | — | → users.id (CASCADE); idx_assignments_teacher |
| subject_id | int unsigned | no | — | → subjects.id (CASCADE); idx_assignments_subject |
| grade_level | tinyint unsigned | no | — | CHECK 1–6 |
| section | varchar(50) | no | — | |
| section_id | int unsigned | yes | — | → sections.id (CASCADE); fk_assignments_section |

UNIQUE uq_teacher_assignment(teacher_id, subject_id, grade_level, section).

#### transmutation_table — 41 rows — `schema.sql:343`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| school_year | varchar(9) | no | — | |
| ig_min | decimal(5,2) | no | — | |
| ig_max | decimal(5,2) | no | — | |
| transmuted_grade | tinyint unsigned | no | — | |

UNIQUE uq_transmutation_range(school_year, ig_min, ig_max).

#### users — 8 rows — `schema.sql:14`
| Column | Type | Null | Default | Keys / FK |
|---|---|---|---|---|
| id | int unsigned | no | AI | PK |
| login_id | varchar(20) | no | — | UNIQUE login_id. This is the sign-in identifier; a parent's is the child's LRN |
| password | varchar(255) | no | — | bcrypt hash, cost 10 (C14) |
| password_changed_at | timestamp(3) | yes | — | audit only; 4 rows set |
| token_version | int unsigned | no | 0 | per-user revocation (C20) |
| must_change_password | tinyint(1) | no | 0 | |
| role | enum('parent','teacher','admin') | no | — | idx_users_role |
| status | enum('pending','active','rejected','inactive') | no | 'pending' | idx_users_status |
| name | varchar(100) | no | — | |
| email | varchar(100) | yes | — | **not unique, on purpose**: sibling parent accounts can share one guardian email |
| email_verified_at | timestamp | yes | — | |
| contact_number | varchar(20) | yes | — | |
| contact_verified_at | timestamp | yes | — | |
| profile_pic | varchar(255) | yes | — | a 32-hex `.jpg` file name; 0 rows set |
| student_id | int unsigned | yes | — | → students.id (SET NULL); idx_users_student |
| created_by | int unsigned | yes | — | → users.id (SET NULL); fk_users_created_by |
| approved_by | int unsigned | yes | — | → users.id (SET NULL); fk_users_approved_by |
| rejection_reason | text | yes | — | |
| created_at | timestamp | no | CURRENT_TIMESTAMP | |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

**FK cycle:** `users.student_id → students` and `students.created_by → users`. `users` also references itself through `created_by` and `approved_by`.

### A2. MySQL-only features that need conversion for PostgreSQL

#### Schema level

| Feature | Where (count) | Why it needs conversion |
|---|---|---|
| `ENUM` columns | 14: assessment_slots.type, attendance.status, auth_codes.purpose, excuse_letters.status, grade_components.type, grades.descriptive_grade, grading_mode_configs.mode, notifications.type, notifications.item_type, policy_acceptances.document, students.gender, students.status, users.role, users.status | PostgreSQL has no inline ENUM column type. MySQL sorts an ENUM by its index, so `routes/users.js:416-422` casts `role` / `status` to CHAR to sort alphabetically |
| `AUTO_INCREMENT` | 24 id columns, every table except auth_security_state | PostgreSQL uses identity/sequence columns. The current next values are in A3 |
| `UNSIGNED` integers | all 60 `int` and 15 `tinyint` (non-boolean) columns | PostgreSQL has no unsigned types |
| `TINYINT(1)` used as a boolean | 5: grades.is_locked, grades.acknowledged, login_attempts.cleared, messages.read_status, users.must_change_password. The code compares them with `0`/`1` in 15 places | PostgreSQL has a real boolean type and won't compare it with an integer |
| `TINYINT UNSIGNED` small numbers | 15: announcements.target_grade, assessment_slots.grade_level/term/slot_no, auth_codes.attempts, auth_security_state.id, events.target_grade, grades.term, grading_mode_configs.grade_level, sections.grade_level, students.grade_level, subjects.grade_level/display_order, teacher_assignments.grade_level, transmutation_table.transmuted_grade | PostgreSQL has no 1-byte integer |
| `TIMESTAMP` with session time zone | 33 timestamp columns. The server zone is `SYSTEM` (UTC+8). `NOW()` has 15 matches in server code | A MySQL TIMESTAMP is stored as UTC but read and written in the session zone. Stored wall-clock values are Manila time |
| `timestamp(3)` | users.password_changed_at | fractional seconds |
| `DEFAULT CURRENT_TIMESTAMP` | 25 columns (16 `created_at`, 7 `updated_at`, `attempted_at`, `accepted_at`) | different default syntax |
| `ON UPDATE CURRENT_TIMESTAMP` | 7: `updated_at` on assessment_slots, attendance, excuse_letters, grades, sections, students, users | PostgreSQL has no ON UPDATE clause on a column |
| `DATETIME` | 0 columns | — |
| `DATE` columns | 5: attendance.date, events.event_date, excuse_letters.absence_date, grade_components.date_recorded, students.birthday | the app reads them as `YYYY-MM-DD` strings (`config/db.js:27`) |
| `DECIMAL(5,2)` | 22 columns | mysql2 returns them as strings, and the clients coerce them |
| `CHECK` constraints | 8: the `BETWEEN 1 AND 6` grade levels (5), `BETWEEN 1 AND 3` terms (2), weights sum to 100.00 (1) | supported in both; listed for completeness |
| Collation `utf8mb4_unicode_ci` | every table and text column | Comparisons are case- and accent-insensitive, and that covers equality, UNIQUE and LIKE. It affects UNIQUE login_id and the sign-in lookup (`routes/auth.js:56`), UNIQUE setting_key, uq_subject_grade, uq_section, and the LIKE searches at `users.js:405`, `students.js:130`, `messages.js:235`. PostgreSQL's default collation is case-sensitive |
| Foreign keys | 33: 17 CASCADE, 9 SET NULL, 7 RESTRICT on delete, plus the users ↔ students cycle | supported in both; the load order matters because of the cycle |
| Redundant index | attendance idx_attendance_student_date duplicates uq_attendance | — |
| JSON columns, generated columns | 0, 0 | — |
| Triggers, views, procedures/functions, events | 0, 0, 0, 0 | — |
| FULLTEXT / SPATIAL indexes | 0 (all 59 are BTREE) | — |
| Engine / charset | InnoDB, utf8mb4, everywhere | — |
| Hardcoded database name | `schema.sql:4`, `:8` | also a KNOWN ISSUES hazard |

#### Query level (in `server/routes/`, `utils/`, `middleware/`, `socket.js`)

| Idiom | Where (count) | Why it needs conversion |
|---|---|---|
| `?` placeholders through `pool.query` / `conn.query` | 319 query calls | mysql2 substitutes them client-side. PostgreSQL drivers use `$n` |
| `IN (?)` with a JS array | 10 sites, e.g. `grades.js:1489`, `:2208` | mysql2 expands the array |
| `VALUES ?` with nested arrays | `utils/notify.js:195` | mysql2's bulk-insert expansion |
| `INSERT … ON DUPLICATE KEY UPDATE … VALUES(col)` | 5: `attendance.js:416`, `:510`; `backups.js:668`; `settings.js:230`, `:286` | MySQL-only upsert syntax |
| `INSERT IGNORE` | 2: `policy.js:95`, `utils/notify.js:194` | MySQL-only |
| `NOW() ± INTERVAL n UNIT` with a bound `n` | 6: `utils/authCodes.js:36`, `:45`, `:75`; `utils/loginThrottle.js:46`, `:52`, `:61` | MySQL interval syntax |
| `GROUP_CONCAT(… SEPARATOR …)` | 2: `messages.js:279`, `:293` | MySQL-only |
| `CONCAT()` | 4: `students.js:130`, `messages.js:255`, `:274`, `:293`. **`students.js:130` puts the space in double quotes**, which is a string in MySQL but an identifier in PostgreSQL | |
| `CAST(x AS CHAR)` | `users.js:421-422` | |
| `LIKE` relying on case-insensitivity | 3: `users.js:405`, `students.js:130`, `messages.js:235` | see the collation row |
| `SELECT … FOR UPDATE` | `grades.js:2153` | supported in both |
| `result.insertId` | 18 uses in 11 route files | mysql2's result shape |
| `result.affectedRows` | 8 uses | mysql2's result shape |
| `error.code === 'ER_DUP_ENTRY'` | `assignments.js:241` | a MySQL error name |
| mysql2 connection error codes | `utils/dbUnavailable.js:22-32` | a driver-specific list behind the 503 |
| Transactions through `getConnection()` + `beginTransaction()` | 12 (counted 2026-10-23: `grades.js` 8, `attendance.js`, `content.js` and `settings.js` 1 each, and since B8 `utils/excuseAttendance.js:95-98` — an excuse review and that day's attendance, the letter and the day read `SELECT … FOR UPDATE`) | A lost race is recognised in ONE place, `isWriteConflict()` (`utils/excuseAttendance.js`), by code: MySQL's `ER_DUP_ENTRY`, `ER_LOCK_DEADLOCK`, `ER_LOCK_WAIT_TIMEOUT` and PostgreSQL's `23505`, `40P01`, `40001` are already listed. It reads `affectedRows` (mysql2's shape; `rowCount` in pg) |
| `multipleStatements: true` on a one-off connection | `backups.js:611` | the restore runs a whole dump file as one script |
| `mysqldump` child process | `backups.js:108-245` | the backup format is a MySQL dump |
| `dateStrings: ['DATE']` | `config/db.js:27` | a driver option |
| A pool proxy that a restore can swap | `config/db.js:48-58` (`resetPool`) | |

### A3. Sequence positions (AUTO_INCREMENT next value, 2026-10-18)

activity_logs 24186 · announcements 349 · assessment_slots 2137 · attendance 397 · auth_codes 255 · backups 319 · events 234 · excuse_letters 507 · grade_components 3100 · grade_weight_configs 41 · grades 5111 · grading_mode_configs 7 · login_attempts 772 · memos 119 · messages 586 · notifications 3055 · policy_acceptances 813 · sections 24 · students 1412 · subjects 41 · system_settings 530 · teacher_assignments 242 · transmutation_table 42 · users 953.

The ids already in use carry meaning. For example, backup numbers and `activity_logs` ids are cited in `docs/CHANGELOG.md`.

---

## B. API

**Mounts:** `server/server.js:80-98`. Two things don't go through a router:
`GET /api/health` (`server.js:70`) and the static `/uploads` mount
(`server.js:48-58`).

**Gates:** every handler that runs `authenticate` passes the forced-change
gate and then the consent gate (C13). The only exceptions are `/auth/me`,
`/auth/change-password` and `/api/policy/*`.

**Roles:** these follow `docs/API_REFERENCE.md`. `public` means no token.
`any` means any signed-in account. `teacher(wide)` means assigned OR
adviser. `teacher(adviser)` means the section's adviser only.
`teacher(subject)` means the subject teacher, through `teacher_assignments`.
`teacher(recorder)` means the teacher who recorded the row OR the current
adviser.

**Side effects:** **log:** is the `activity_logs.action` written.
**notif:** is the `notifications.type` → its audience (C29). **emit:** is a
socket event (D). **mail** / **sms** are the outgoing transports (C39, C40).
**file:** is a disk write. **db:** is any other table written.

**Callers:** web paths are under `client/src/`, with `pages/` dropped from
page paths. Phone paths are under `mobile/src/`, with `screens/` dropped.
`—` means no app code calls the endpoint; the suites still do.

| Module | Handlers | File |
|---|---|---|
| /api/auth | 12 | `routes/auth.js` |
| /api/users | 11 | `routes/users.js` |
| /api/students | 5 | `routes/students.js` |
| /api/sections | 3 | `routes/sections.js` |
| /api/subjects, /api/assignments | 1 + 3 | `routes/assignments.js` |
| /api/grades | 14 | `routes/grades.js` |
| /api/grading-modes | 1 | `routes/gradingModes.js` |
| /api/attendance | 6 | `routes/attendance.js` |
| /api/announcements, /memos, /events | 4 + 4 + 4 | `routes/content.js` |
| /api/excuse-letters | 6 | `routes/excuses.js` |
| /api/settings | 5 | `routes/settings.js` |
| /api/backups | 5 | `routes/backups.js` |
| /api/messages | 6 | `routes/messages.js` |
| /api/notifications | 4 | `routes/notifications.js` |
| /api/dashboard | 1 | `routes/dashboard.js` |
| /api/policy | 3 | `routes/policy.js` |
| /api/activity-logs (B2, 2026-10-23 — B16) | 3 | `routes/activityLogs.js` |
| **Total** | **98** on 2026-10-18; **104** recounted from `server/routes/` on 2026-10-23 (B2 — the other rows above are the 2026-10-18 snapshot, refreshed in B7's docs pass) | plus `GET /api/health` and `/uploads` |

### B1. /api/auth — `server/routes/auth.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| POST | /login | :70 | public | Sign in with login_id + password. Throttled. A pending/rejected/inactive account gets 403 + `status` | log:login, login_failed; db:login_attempts | auth/AuthContext.jsx:67 | auth/AuthContext.jsx:88 |
| GET | /me | :153 | any (passes both gates) | The current user, plus `must_change_password` and `policy_pending` | — | auth/AuthContext.jsx:39, :91 | auth/AuthContext.jsx:50, :109 |
| PUT | /change-password | :172 | any (passes both gates) | Current + new password; returns a replacement token | log:change_password; db:token_version+1, must_change_password=0, password_changed_at | ForcedPasswordChange.jsx:91; settings/ChangePasswordSection.jsx:83 | ForcedPasswordChangeScreen.jsx:68; settings/ChangePasswordScreen.jsx:59 |
| PUT | /contact | :263 | any | Set your own mobile number (email is refused) | log:update_contact; db:clears contact_verified_at, burns codes | settings/AccountInfoSection.jsx:456 | settings/AccountInfoScreen.jsx:368 |
| PUT | /photo | :342 | any (own) | Multipart upload, re-encoded | log:upload_profile_photo; file:writes the avatar, unlinks the old one | settings/AccountInfoSection.jsx:251 | settings/AccountInfoScreen.jsx:212 |
| DELETE | /photo | :380 | any (own) | Remove your own photo | log:remove_profile_photo; file:unlink | settings/AccountInfoSection.jsx:265 | settings/AccountInfoScreen.jsx:226 |
| POST | /forgot-password | :424 | public | Always 202; one code goes to every confirmed channel | log:password_reset_requested, password_reset_email_failed, password_reset_sms_failed; db:auth_codes; mail; sms | ForgotPassword.jsx:79 | ForgotPasswordScreen.jsx:74 |
| POST | /reset-password | :531 | public | Code + new password | log:password_reset; db:consumes the code, token_version+1 | ForgotPassword.jsx:102 | ForgotPasswordScreen.jsx:90 |
| POST | /verify-email/request | :578 | any | Mail a confirmation code | log:email_verification_requested; db:auth_codes; mail | settings/AccountInfoSection.jsx:484 | settings/AccountInfoScreen.jsx:393 |
| POST | /verify-email/confirm | :629 | any | Confirm; sets email_verified_at | log:email_verified; db:consumes the code | settings/AccountInfoSection.jsx:511 | settings/AccountInfoScreen.jsx:413 |
| POST | /verify-contact/request | :663 | any | Text a confirmation code (503 when SMS is off, :673-676) | log:contact_verification_requested, contact_verification_sms_failed; db:auth_codes; sms | settings/AccountInfoSection.jsx:534 | settings/AccountInfoScreen.jsx:430 |
| POST | /verify-contact/confirm | :708 | any | Confirm; sets contact_verified_at (the number snapshot must match) | log:contact_verified; db:consumes the code | settings/AccountInfoSection.jsx:559 | settings/AccountInfoScreen.jsx:450 |

### B2. /api/users — `server/routes/users.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| POST | /teachers | :20 | admin | Create a teacher: active, must change password | log:create_teacher | admin/UsersPage.jsx:400 | admin/CreateTeacherScreen.jsx:53 |
| POST | /parents | :91 | teacher(adviser of the learner's section) | Create a parent account (pending) | log:create_parent; notif:parent_pending → active admins; emit | teacher/StudentsPage.jsx:382; teacher/StudentDetailPage.jsx:307 | teacher/EnrollScreen.jsx:171 |
| GET | /parents/pending | :239 | admin | The approval queue | — | admin/UsersPage.jsx:284 | admin/UsersScreen.jsx:124, :160 |
| PUT | /parents/:id/approve | :283 | admin | Approve: active + approved_by | log:approve_parent | admin/UsersPage.jsx:633 | admin/ReviewParentScreen.jsx:73 |
| PUT | /parents/:id/reject | :331 | admin | Reject with a reason | log:reject_parent | admin/UsersPage.jsx:636 | admin/ReviewParentScreen.jsx:74 |
| GET | / | :378 | admin | Users list (paged, search, sort) | — | admin/UsersPage.jsx:288 | admin/UsersScreen.jsx:125, :144 |
| GET | /:id | :451 | admin | One user | — | — | — |
| PUT | /:id | :476 | admin | Edit name / email / contact number | log:update_user; db:clears the changed confirmation, burns codes | admin/UsersPage.jsx:474 | admin/EditUserScreen.jsx:49 |
| PATCH | /:id/status | :568 | admin | Activate / deactivate | log:update_user_status | admin/UsersPage.jsx:510 | admin/UsersScreen.jsx:191 |
| DELETE | /:id/photo | :642 | admin | Remove someone's photo (moderation) | log:admin_remove_profile_photo; file:unlink | admin/UsersPage.jsx:574 | admin/UsersScreen.jsx:218 |
| POST | /:id/temp-password | :675 | admin (never their own id) | A 12-character temporary password, shown once | log:admin_temp_password; db:token_version+1, must_change_password=1 | admin/UsersPage.jsx:542 | admin/users/TempPasswordModal.jsx:81 |

### B3. /api/students — `server/routes/students.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | / | :86 | teacher(wide), admin | Learners (paged; filter; search by LRN or name) | — | admin/StudentsPage.jsx:100; admin/GradesPage.jsx:149; teacher/StudentsPage.jsx:164; teacher/AttendancePage.jsx:272 | admin/StudentsScreen.jsx:68; admin/GradesScreen.jsx:170; teacher/StudentsScreen.jsx:67; teacher/AttendanceScreen.jsx:138 |
| GET | /:id | :173 | teacher(wide), admin, parent(own) | One learner, plus `parent_account` for staff | — | admin/StudentDetailPage.jsx:125; teacher/StudentDetailPage.jsx:180 | admin/StudentDetailScreen.jsx:103; teacher/StudentDetailScreen.jsx:127 |
| POST | / | :218 | teacher(adviser of the target section), admin | Enrol a learner | log:create_student | teacher/StudentsPage.jsx:329 | teacher/EnrollScreen.jsx:128 |
| PUT | /:id | :339 | teacher(wide), admin | Edit names (a class change is refused) | log:update_student | admin/StudentDetailPage.jsx:171; teacher/StudentDetailPage.jsx:354 | admin/StudentDetailScreen.jsx:149; teacher/StudentDetailScreen.jsx:225 |
| PATCH | /:id/status | :460 | admin | Active / inactive | log:update_student_status | admin/StudentsPage.jsx:176 | admin/StudentsScreen.jsx:119 |

### B4. /api/sections — `server/routes/sections.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | / | :37 | any | Reference list | — | 17 sites: AboutPage.jsx:357; admin/AnnouncementsPage.jsx:282, AttendancePage.jsx:74, GradesPage.jsx:124, StudentsPage.jsx:124; dashboards/ParentDashboard.jsx:543, TeacherDashboard.jsx:168; parent/AttendancePage.jsx:236, GradesPage.jsx:455; teacher/AttendancePage.jsx:214, AttendanceRecordsPage.jsx:90, ClassSummaryLearnerPage.jsx:110, ClassSummaryPage.jsx:333, ExcuseLettersPage.jsx:110, StudentDetailPage.jsx:225, StudentsPage.jsx:204; hooks/useTeacherTargets.js:76 | 18 sites: AboutScreen.jsx:302; admin/AnnouncementsScreen.jsx:118, AttendanceScreen.jsx:56, GradeLocksScreen.jsx:68, GradesScreen.jsx:137, PostComposeScreen.jsx:89, StudentsScreen.jsx:92; parent/AttendanceScreen.jsx:141, DashboardScreen.jsx:278, ReportCardView.jsx:152; teacher/AttendanceRecordsScreen.jsx:60, AttendanceScreen.jsx:104, ClassSummaryScreen.jsx:100, DashboardScreen.jsx:133, ExcuseLettersScreen.jsx:63, StudentDetailScreen.jsx:177, StudentsScreen.jsx:112; hooks/useTeacherTargets.js:34 |
| GET | /:id | :81 | any | One section | — | — | — |
| PATCH | /:id/adviser | :103 | admin | Set or clear a section's adviser | log:update_section_adviser | — | — |

### B5. /api/subjects and /api/assignments — `server/routes/assignments.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | /api/subjects | :39 | any | Subjects reference list | — | — | — |
| GET | /api/assignments | :78 | teacher (own), admin | Teaching assignments | — | hooks/useTeacherTargets.js:77; teacher/ClassRecordPage.jsx:94; teacher/StudentDetailPage.jsx:209; teacher/StudentsPage.jsx:188 | hooks/useTeacherTargets.js:35; teacher/GradesScreen.jsx:54; teacher/StudentDetailScreen.jsx:161; teacher/StudentsScreen.jsx:96 |
| POST | /api/assignments | :148 | admin | Assign a teacher to a subject in a section | log:create_assignment | — | — |
| DELETE | /api/assignments/:id | :260 | admin | Remove an assignment (grades are kept) | log:delete_assignment | — | — |

### B6. /api/grades — `server/routes/grades.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | / | :716 | teacher(wide), admin, parent(own) | Grade rows (paged) | — | — | — |
| GET | /class-record | :971 | teacher(wide), admin | The class record grid | — | teacher/classRecord/useClassRecord.js:122 | teacher/classRecord/useSlotRecord.js:85 |
| PUT | /class-record | :1215 | teacher(subject), admin | Save the grid, or run it as a dry run; recompute; 409 rules (C8) | log:save_class_record; db:assessment_slots, grade_components, grades; notif:grade_available → parent; emit | teacher/classRecord/useClassRecord.js:178 (dry run), :226 | teacher/classRecord/useSlotRecord.js:119, :154 |
| GET | /class-summary | :1839 | teacher(adviser or assigned), admin | Class summary for a term or the final | — | teacher/ClassSummaryPage.jsx:406 | teacher/ClassSummaryScreen.jsx:132 |
| POST | /locks | :2066 | admin | Lock or unlock a whole term; dry run first | log:bulk_grade_lock / bulk_grade_unlock (one row) | admin/GradeLocksModal.jsx:111, :126 | admin/GradeLocksScreen.jsx:107, :124 |
| GET | /:id | :2273 | teacher(wide), admin, parent(own) | One grade with its components and descriptor | — | parent/GradesPage.jsx:482 | parent/GradeBreakdownScreen.jsx:179 |
| GET | /student/:studentId | :2364 | teacher(wide), admin, parent(own) | Report card (computes the Final and GA, C4) | — | admin/GradesPage.jsx:193; dashboards/ParentDashboard.jsx:614; parent/GradesPage.jsx:385; teacher/ClassSummaryLearnerPage.jsx:59 | admin/GradesScreen.jsx:207; parent/DashboardScreen.jsx:307; parent/GradesScreen.jsx:41; teacher/ClassSummaryLearnerScreen.jsx:39 |
| POST | / | :2496 | teacher(subject), admin | Create an empty grade row | log:create_grade | — | — |
| POST | /:id/components | :2621 | teacher(subject), admin | Record a WW/PT score (`slot_id` required) | log:record_grade_component; notif:grade_available; emit | — | — |
| PUT | /:id/components/:componentId | :2743 | teacher(subject), admin | Edit a score | log:update_grade_component; notif:grade_available; emit | — | — |
| DELETE | /:id/components/:componentId | :2901 | teacher(subject), admin | Delete a score | log:delete_grade_component; emit | — | — |
| PATCH | /:id/exam | :2974 | teacher(subject), admin | Record exam raw scores | log:record_grade_exam; notif:grade_available; emit | — | — |
| PATCH | /:id/lock | :3183 | admin | Lock or unlock one row | log:update_grade_lock | admin/GradesPage.jsx:257 | admin/GradeLockScreen.jsx:38 |
| DELETE | /:id | :3270 | admin | Delete a row (refused when locked) | log:delete_grade; db:removes its notifications; emit | — (deliberately not surfaced) | — |

### B7. /api/grading-modes — `server/routes/gradingModes.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | / | :31 | any | The grading mode for a grade level (409 when unconfigured) | — | — | — |

### B8. /api/attendance — `server/routes/attendance.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | / | :109 | teacher(recorder), admin | Attendance rows (paged, filters) | — | admin/AttendancePage.jsx:106; dashboards/TeacherDashboard.jsx:70; teacher/AttendancePage.jsx:276; teacher/AttendanceRecordsPage.jsx:143 | admin/AttendanceScreen.jsx:79; teacher/DashboardScreen.jsx:59; teacher/AttendanceScreen.jsx:139; teacher/AttendanceRecordsScreen.jsx:92 |
| GET | /student/:studentId | :226 | teacher(recorder), admin, parent(own) | One learner's days | — | dashboards/ParentDashboard.jsx:635; parent/AttendancePage.jsx:173, :197 | parent/AttendanceScreen.jsx:91, :118; parent/DashboardScreen.jsx:314 |
| GET | /summary/:studentId | :301 | teacher(recorder), admin, parent(own) | Counts per status | — | dashboards/ParentDashboard.jsx:551, :563; parent/AttendancePage.jsx:172 | parent/AttendanceScreen.jsx:90; parent/DashboardScreen.jsx:283, :287 |
| POST | / | :362 | teacher(adviser), admin | One mark (upsert) | log:record_attendance | — | — |
| POST | /bulk | :439 | teacher(adviser), admin | A day's marks for a section (upsert) | log:bulk_record_attendance | teacher/AttendancePage.jsx:447 | teacher/AttendanceScreen.jsx:261 |
| PUT | /:id | :553 | teacher(adviser), admin | Correct one mark | log:correct_attendance | — | — |

### B9. /api/announcements, /api/memos, /api/events — `server/routes/content.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | /api/announcements | :211 | any (audience-scoped) | List | — | admin/AnnouncementsPage.jsx:204; dashboards/ParentDashboard.jsx:577; parent/AnnouncementsPage.jsx:90; teacher/AnnouncementsPage.jsx:175 | admin/AnnouncementsScreen.jsx:78; parent/AnnouncementsScreen.jsx:31; parent/DashboardScreen.jsx:296; teacher/AnnouncementsScreen.jsx:59 |
| POST | /api/announcements | :297 | teacher(wide), admin | Post | log:create_announcement; notif:announcement → audience; emit | admin/AnnouncementsPage.jsx:398; teacher/AnnouncementsPage.jsx:368 | admin/PostComposeScreen.jsx:121; teacher/AnnouncementComposeScreen.jsx:154 |
| PUT | /api/announcements/:id | :350 | author, admin | Edit | log:update_announcement | admin/AnnouncementsPage.jsx:396; teacher/AnnouncementsPage.jsx:366 | admin/PostComposeScreen.jsx:120; teacher/AnnouncementComposeScreen.jsx:153 |
| DELETE | /api/announcements/:id | :406 | author, admin | Hard delete | log:delete_announcement; db:removes its notifications; emit | admin/AnnouncementsPage.jsx:495; teacher/AnnouncementsPage.jsx:392 | admin/AnnouncementsScreen.jsx:145; teacher/AnnouncementsScreen.jsx:97 |
| GET | /api/memos | :441 | any (school-wide) | List | — | admin/AnnouncementsPage.jsx:233; dashboards/ParentDashboard.jsx:578; parent/MemosPage.jsx:64; teacher/MemosPage.jsx:51 | admin/AnnouncementsScreen.jsx:82; parent/DashboardScreen.jsx:297; parent/MemosScreen.jsx:27; teacher/MemosScreen.jsx:33 |
| POST | /api/memos | :471 | admin | Post | log:create_memo; notif:memo → every active account; emit | admin/AnnouncementsPage.jsx:467 | admin/PostComposeScreen.jsx:121 |
| PUT | /api/memos/:id | :517 | admin | Edit | log:update_memo | admin/AnnouncementsPage.jsx:465 | admin/PostComposeScreen.jsx:120 |
| DELETE | /api/memos/:id | :562 | admin | Hard delete | log:delete_memo; db:removes its notifications; emit | admin/AnnouncementsPage.jsx:500 | admin/AnnouncementsScreen.jsx:145 |
| GET | /api/events | :591 | any (audience-scoped) | List (defaults to DESC) | — | dashboards/ParentDashboard.jsx:599; dashboards/TeacherDashboard.jsx:182; parent/EventsPage.jsx:121; teacher/EventsPage.jsx:134 | parent/DashboardScreen.jsx:304; parent/EventsScreen.jsx:44; teacher/DashboardScreen.jsx:139; teacher/EventsScreen.jsx:67 |
| POST | /api/events | :666 | teacher(grade), admin | Post | log:create_event; notif:event → parents + teachers (never admins); emit | teacher/EventsPage.jsx:237 | teacher/EventComposeScreen.jsx:102 |
| PUT | /api/events/:id | :724 | author, admin | Edit | log:update_event | teacher/EventsPage.jsx:235 | teacher/EventComposeScreen.jsx:101 |
| DELETE | /api/events/:id | :788 | author, admin | Hard delete | log:delete_event; db:removes its notifications; emit | teacher/EventsPage.jsx:257 | teacher/EventsScreen.jsx:105 |

### B10. /api/excuse-letters — `server/routes/excuses.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | /mine | :34 | parent | Own letters | — | dashboards/ParentDashboard.jsx:569; parent/AttendancePage.jsx:216; parent/ExcuseLettersPage.jsx:132 | parent/AttendanceScreen.jsx:136; parent/DashboardScreen.jsx:289; parent/ExcuseLettersScreen.jsx:45 |
| GET | / | :64 | teacher(wide), admin | Letters in scope | — | dashboards/TeacherDashboard.jsx:174; teacher/ExcuseLettersPage.jsx:153 | teacher/DashboardScreen.jsx:136; teacher/ExcuseLettersScreen.jsx:89 |
| GET | /:id | :147 | parent(own), teacher(wide), admin | One letter | — | — | — |
| POST | / | :196 | parent | Submit (text only) | log:submit_excuse_letter; notif:excuse_submitted → the section's adviser; emit | parent/ExcuseLettersPage.jsx:272 | parent/ExcuseLetterComposeScreen.jsx:118 |
| PUT | /:id | :291 | parent(own), while Pending (re-checked in the `UPDATE` since B8) | Edit | log:update_excuse_letter | parent/ExcuseLettersPage.jsx:270 | parent/ExcuseLetterComposeScreen.jsx:117 |
| PATCH | /:id/review | :372 | teacher(adviser), admin | Approve / decline, once — and since B8 that day's attendance, in one transaction (approved → Excused, declined → Absent, Present / Late / Excused kept, no write off a class day); 409 on a lost race | log:review_excuse_letter, and log:excuse_attendance when the day changes; notif:excuse_reviewed → the parent; emit to the parent and the reviewer | teacher/ExcuseLettersPage.jsx:256 | teacher/ExcuseLetterReviewScreen.jsx:90 |

### B11. /api/settings — `server/routes/settings.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | / | :153 | any | The 8 allow-listed keys | — | settings/SchoolSettingsSection.jsx:129; AboutPage.jsx:346 (signed in); parent/GradesPage.jsx:426; teacher/ClassRecordPage.jsx:152, ClassSummaryLearnerPage.jsx:94, ClassSummaryPage.jsx:313 | AboutScreen.jsx:295 (signed in); settings/SchoolSettingsScreen.jsx:69; parent/ReportCardView.jsx:133; teacher/GradesScreen.jsx:148 |
| GET | /public | :172 | **public** | 6 keys for the sign-in and About pages | — | Login.jsx:80; AboutPage.jsx:346 (signed out) | LoginScreen.jsx:72; AboutScreen.jsx:295 (signed out) |
| GET | /:key | :190 | any | One key | — | — | — |
| PUT | /:key | :211 | admin | Set one key (upsert) | log:update_setting | — | — |
| PATCH | / | :247 | admin | Set several keys, all or nothing (upsert) | log:update_settings_bulk | settings/SchoolSettingsSection.jsx:164 | settings/SchoolSettingsScreen.jsx:115 |

### B12. /api/backups — `server/routes/backups.js` (web only)
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | / | :327 | admin | Backups and orphaned files | — | admin/BackupsPage.jsx:149; dashboards/AdminDashboard.jsx:137 | admin/DashboardScreen.jsx:131 (`?limit=1`) |
| POST | / | :383 | admin | Run mysqldump (C26) | log:create_backup; file:server/backups/*.sql | admin/BackupsPage.jsx:183 | — |
| GET | /:id/download | :396 | admin | Stream the `.sql` file | log:download_backup | admin/BackupsPage.jsx:197 | — |
| DELETE | /:id | :431 | admin | Delete the row and its file | log:delete_backup; file:unlink | admin/BackupsPage.jsx:220 | — |
| POST | /:id/restore | :490 | admin | Step-up, safety dump, drop and recreate the DB (C27) | log:restore_refused / create_backup (safety copy) / restore_backup / restore_wiped_activity_logs; db:the whole database, auth_security_state; file:the safety dump | admin/BackupsPage.jsx:268 | — |

### B13. /api/messages — `server/routes/messages.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | /conversations | :107 | any | One row per person, with the unread count | — | messages/ConversationsPage.jsx:91; realtime/UnreadProvider.jsx:61; dashboards/ParentDashboard.jsx:648 | realtime/UnreadProvider.jsx:48; parent/MessagesScreen.jsx:38; teacher/MessagesScreen.jsx:40; parent/DashboardScreen.jsx:319 |
| GET | /contacts | :191 | any | Who you may message (the inverse of canMessage) | — | messages/ConversationsPage.jsx:128; teacher/MessageThreadPage.jsx:114 | parent/MessageThreadScreen.jsx:139; parent/NewMessageScreen.jsx:55; teacher/NewMessageScreen.jsx:58 |
| GET | /with/:userId | :326 | any (participant) | The thread | — | messages/MessageThread.jsx:199, :308 | parent/MessageThreadScreen.jsx:182, :261 |
| POST | / | :403 | any (canMessage) | Send | log:send_message; emit:new_message → the receiver | messages/MessageThread.jsx:333 | parent/MessageThreadScreen.jsx:279 |
| PATCH | /:id/read | :451 | the recipient | Mark one read | log:read_message | — | — |
| PATCH | /read-all/:userId | :482 | the recipient | Mark a thread read | log:read_all_messages | messages/MessageThread.jsx:214 | parent/MessageThreadScreen.jsx:191 |

### B14. /api/notifications — `server/routes/notifications.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | / | :301 | any | The bell list (visibility re-checked, C30) | — | components/NotificationBell.jsx:83 | NotificationsScreen.jsx:63 |
| GET | /unread-counts | :349 | any | Counts per nav section | — | realtime/NotificationProvider.jsx:50 | realtime/NotificationProvider.jsx:30 |
| PATCH | /:id/read | :386 | any (own rows) | Mark one read | — | components/NotificationBell.jsx:153 | NotificationsScreen.jsx:86 |
| PATCH | /read-all | :425 | any (own rows) | Mark all read (no section filter) | — | components/NotificationBell.jsx:166 | NotificationsScreen.jsx:101 |
| PATCH | /read-all `{ section }` | :506 (since fix/f3-badges, 2026-10-22) | any (own rows) | The visit clear: one badge's unread INFORMATION rows read, the types per role from `VISIT_CLEAR` (:487); a call to act and every grade type never; `400` naming the role's sections | emits `notification_counts` to the caller when `updated` > 0 | realtime/useVisitClear.js:32 (eight badged pages) | realtime/useVisitClear.js:28 (eight badged screens) |

### B15. /api/dashboard, /api/policy, and `server.js`
| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | /api/dashboard | `dashboard.js:347` | any | The summary for your role (C38) | — | dashboards/AdminDashboard.jsx:135; ParentDashboard.jsx:533; TeacherDashboard.jsx:160 | admin/DashboardScreen.jsx:130; parent/DashboardScreen.jsx:276; teacher/DashboardScreen.jsx:131 |
| GET | /api/policy | `policy.js:19` | any (passes the consent gate) | The two documents | — | PolicyConsent.jsx:76; settings/SecurityPolicySection.jsx:40 | PolicyConsentScreen.jsx:105; settings/SecurityPolicyScreen.jsx:43 |
| GET | /api/policy/status | `policy.js:26` | any | Required / pending / dates | — | settings/SecurityPolicySection.jsx:41 | settings/SecurityPolicyScreen.jsx:44 |
| POST | /api/policy/accept | `policy.js:58` | parent, teacher, admin | Accept the current versions (a stale one gets 409) | log:accept_policy; db:policy_acceptances | PolicyConsent.jsx:126 | PolicyConsentScreen.jsx:143 |
| GET | /api/health | `server.js:70` | public | `SELECT 1`; 503 when the DB is down | — | — (suites, smoke) | — |
| GET | /uploads/* | `server.js:48-58` | public | Profile photo files (`express.static`) | — | through format/photoUrl.js | through format/photoUrl.js |

### B16. /api/activity-logs — `server/routes/activityLogs.js` (web only; B2, 2026-10-23)

The admin's read of `activity_logs` (FRONTEND §36). **It never selects
`description`** — port that as it is. Plain SQL: a `LEFT JOIN users`, `IN` /
`NOT IN` lists built as `?, ?, …` (no mysql2 array expansion), `LIMIT ?
OFFSET ?`, `SELECT DISTINCT`; the day bounds are JS `Date` instants
(`utils/manilaTime.js`), which node-postgres sends with their offset. `server.js`'s
CORS adds `exposedHeaders: ['Content-Disposition']` for the export's file name.

| Method | Path | Line | Role | Purpose | Side effects | Web | Phone |
|---|---|---|---|---|---|---|---|
| GET | /api/activity-logs | `activityLogs.js:150` | admin | One page, newest first, by Manila day, role (or deleted account) and action or group; `export_limit` | — | admin/ActivityLogPage.jsx:108 | — (web only, `WEB_ONLY`) |
| GET | /api/activity-logs/actions | `activityLogs.js:186` | admin | The filter's groups and codes with their labels, plus Other | — | admin/ActivityLogPage.jsx:91 | — |
| GET | /api/activity-logs/export | `activityLogs.js:217` | admin | The filtered set as a CSV (BOM, RFC 4180, formula guard, Manila times; at most 50,000 rows, 400 above) | log:export_activity_log | admin/ActivityLogPage.jsx:166 | — |

**The 20 handlers no web page or phone screen calls:** `GET /users/:id`,
`GET /sections/:id`, `PATCH /sections/:id/adviser`, `GET /subjects`,
`POST /assignments`, `DELETE /assignments/:id`, `GET /grades`,
`POST /grades`, `POST /grades/:id/components`,
`PUT /grades/:id/components/:componentId`,
`DELETE /grades/:id/components/:componentId`, `PATCH /grades/:id/exam`,
`DELETE /grades/:id`, `GET /grading-modes`, `POST /attendance`,
`PUT /attendance/:id`, `GET /excuse-letters/:id`, `GET /settings/:key`,
`PUT /settings/:key`, `PATCH /messages/:id/read`.

**Audit actions** (recounted 2026-10-23 by B2's survey, every `logActivity`
call in `server/routes/` and `server/utils/` — 75 calls): **75 distinct
`activity_logs.action` values are written by code** (74 before B2's
`export_activity_log`), plus `seed`, written only by `scripts/setup-db.js` and
`scripts/migrate-fixture-learner.js`. The live table held 77 on 2026-10-23
(after B8's gate): 71 of the code's, the four removed Contributions codes,
`record_descriptive_grade` (its endpoint is retired) and `seed`. **Three
actions in code have never been logged**, all send failures:
`password_reset_email_failed`, `password_alert_email_failed` and
`password_alert_sms_failed`. (Until B2 this paragraph said 67 and one.) The
English label and group of every code: `server/utils/activityActions.js`.
Three templates changed in B2's commit 2 (`create_teacher`, `update_user`,
`update_user_status` — ids only, no login id); old rows keep their wording.

---

## C. Server rules that live in Express today

| # | Area | Where | What it does |
|---|---|---|---|
| C1 | Grading maths (DO 015) | `utils/gradeComputation.js:30-160` | `roundTo2` :30 and `roundToWhole` :55 round half up. `componentPercentage` :91 is the WW/PT % over the used slots only. `subTestPercentage` :119. `exPercentage` :134 weights 30/30/40. `weighted` :150. `initialGrade` :159. Every function returns `null` on a missing input, and nothing over 100 is clamped |
| C2 | Descriptors and the Grade 1 letter | `utils/gradeComputation.js:194-256` | One `BANDS` table :194 drives `qualitativeDescriptor` :222 and `bandForScore` :235, which turns a raw weighted score into A–E. `descriptiveGradeMeaning` :254 |
| C3 | Recompute on every write | `routes/grades.js:353-500` | A full recompute from components on the writer's transaction. Grade 1 gets a letter (`:435`). Other grades go through the transmutation lookup (`:437-446`), and with no rows for the year the Initial Grade is used directly. It refuses to fill both term_grade and descriptive_grade (`:459-462`). The grade_available hook fires when the value goes from NULL to set (`:476-490`) |
| C4 | Final grade, GA, term averages: read-time only | `routes/grades.js:518-700` | `buildTermEntry` :518, `computeFinalLetter` :570 (Grade 1, all three terms), `computeFinalGrade` :583, `computeGeneralAverage` :624, `computeTermAverages` :660, descriptors :690. None of these is stored |
| C5 | Write preflight | `routes/grades.js:266-318` | 409 when grading_mode_configs or grade_weight_configs has no row. 403 "This grade is locked…" on a locked row |
| C6 | Encode vs view scope | `routes/grades.js:128-260` | `teacherCanEncodeGrade` :128 matches teacher_assignments on four VARCHAR keys. `teacherCanViewGrade` :162. `loadAuthorizedGrade` :202. `encodeScopeError` :243 splits 403 from 404 |
| C7 | Whole-number scores | `utils/validateScore.js:40-80`; `routes/grades.js:20`, `:29` | Scores and highest possible scores must be whole numbers. `slotDisplayLabel` :63 |
| C8 | Lock rules in the class record (409) | `routes/grades.js:958`, `:1386-1396`, `:1426`, `:1685` | A locked learner freezes the class's highest possible scores; the 409 names every locked learner. A used column can't be cleared. "Nothing was saved…" |
| C9 | Bulk term lock | `routes/grades.js:2066-2230` | Dry run first. `FOR UPDATE` at :2153. Only active learners graded in every subject are locked. The UPDATE is at :2208; one audit row at :2221; no notifications |
| C10 | Single lock and delete | `routes/grades.js:3183-3255`, `:3270-3307` | Admin only, with no completeness gate on a lock. Delete refuses a locked row and removes the row's notifications |
| C11 | Missing-config 409s outside writes | `routes/gradingModes.js:74`; `routes/grades.js:1006`, `:1018`, `:1903`, `:2410` | The class record, class summary and report card each name the missing configuration row |
| C12 | JWT | `utils/jwt.js:3-12`; `routes/auth.js:34-35` | `jsonwebtoken`, default HS256, signed with `JWT_SECRET`, expiry `JWT_EXPIRES_IN` (default 24h). **A hardcoded fallback secret applies when `JWT_SECRET` is unset.** `mintToken` adds `v` = token_version |
| C13 | `authenticate` / `authorize` | `middleware/auth.js:14-160` | Re-reads the user on every request. 401 for no token / bad token / missing user / inactive account. Restore cutoff :43-50. token_version :99-103. Forced-change gate :115-125, which matches the **router-relative** path. Consent gate :135-141 through `policyGateAllows` :9-12, which matches the full path. 503 on a DB error :145-150. `authorize(...roles)` :153 |
| C14 | Password hashing | `utils/password.js:3-11` | bcrypt via the `bcryptjs` package, cost 10 |
| C15 | Password rule | `utils/passwordRule.js:16-27` | At least 8 characters and at least 1 digit. Applied where a password is set: `users.js:31`, `:104`; `auth.js:185`, `:541` |
| C16 | Sign-in throttle | `utils/loginThrottle.js:27-66`; `routes/auth.js:80-103` | 15-minute window: 5 failures per account, 100 per IP, checked before the password. The key is an HMAC-SHA256 of the lower-cased typed id under `JWT_SECRET` (:34-41). Rows are pruned after 24 h (:61). Uses `req.ip`, and `server.js` sets no `trust proxy` |
| C17 | One-time codes | `utils/authCodes.js:24-135` | 6 digits from `crypto.randomInt`, bcrypt-hashed. TTL 10 minutes, 5 attempts, 3 per account per hour, 10 per IP per hour. Only the newest code works. `burnTiming` evens out response time |
| C18 | Forgot / reset (no oracle) | `routes/auth.js:418-574` | One 202 sentence always (:418-421). The code goes to every confirmed channel (:443-449). The reply is sent before the send happens, and failures are logged (:503-516). Reset has a single failure message |
| C19 | Contact and email confirmation | `routes/auth.js:252-302`, `:578-730` | Email is school-owned: `PUT /contact` refuses it (:252). Changing a number clears its confirmation and burns codes. Confirm checks the snapshot (:715-723) |
| C20 | Per-user sign-out | `routes/auth.js:217-219`, `:237-240`, `:563-566`; `routes/users.js:702-704`; `socket.js:67` | token_version + 1 on change, reset and temporary password. A change returns a replacement token. `password_changed_at` is audit only |
| C21 | Temporary password | `routes/users.js:675-717` | 12 characters from crypto. Refuses your own id. Returned once |
| C22 | Consent documents | `utils/policy.js:19-80`; `routes/policy.js:58-110`; `server/policy/` | The documents are `privacy-notice.md` and `terms-of-use.md`, versioned in `versions.json`. `acceptedCountSql` and `isPending` live in utils/policy.js. Accept refuses a stale version with 409 (:81) and uses INSERT IGNORE (:95) |
| C23 | Socket handshake gates | `socket.js:31-100` | The same order and wording as `authenticate`: restore cutoff, active, version, forced change, consent |
| C24 | Restore cutoff | `routes/backups.js:667-668`; `middleware/auth.js:43-50`; `socket.js:47-51` | `auth_security_state.token_valid_after = NOW()` after a restore. Every older token stops working |
| C25 | Profile photos | `utils/profilePhoto.js:28-110`; `server.js:47-58`; `routes/auth.js:342`, `:380`; `routes/users.js:642` | multer memory storage: 5 MB, 1 file, field `photo`. sharp accepts JPEG/PNG/WebP only, caps input at 40 MP, and re-encodes to a 512×512 JPEG without EXIF or GPS (:72-93). The file name is 32 random hex + `.jpg` (:97). Stored on local disk at `server/uploads/avatars/`; the old file is unlinked (:105). Served without a token, with `nosniff` and a private cache. Not in any backup |
| C26 | Backup | `routes/backups.js:16-320` | Spawns `mysqldump` (`MYSQLDUMP_PATH`; password passed through `MYSQL_PWD`) :108. Writes `.partial` then renames, with a stale-partial sweep :41 and a footer check :57. `--ignore-table` for backups and auth_codes (:206, :218), plus a `--no-data` pass (:234). `createBackupRecord` :276 |
| C27 | Restore | `routes/backups.js:476-700` | Step-up password (:532). Type-the-filename check (:542). Safety dump first (:566). `stripBackupsTableDdl` (:263, :605). One-off `multipleStatements` connection (:607-611). `resetPool` (:638). Re-runs `migratePrivacy` (:653). Session cutoff (:667). Wiped-logs marker (:679-681). Synchronous |
| C28 | Activity logging | `utils/activity.js:3-8` | One INSERT per write: `user_id`, `action`, free-text `description`. 75 actions in code since B2's `export_activity_log` (B, "Audit actions"); the one read is `GET /api/activity-logs` (B16), which never selects `description` |
| C29 | Notification fan-out | `utils/notify.js:64-236` | Audiences: announcement :64, memo :97 (every active account), event :117 (no admins), excuse adviser :147, admins :159, parent :164, one user :172. INSERT IGNORE on uq_notifications_once :188-198. The actor is never a recipient (:189). A delete removes the item's rows (:210). `notification_counts` is emitted after commit (:230-235) |
| C30 | Read-time visibility | `routes/notifications.js:62`, `:288`, `:349` | `visibilityClause` re-checks each row against live data on every read. `NAV_SECTION` maps the badges. **Since fix/f3-badges (2026-10-22):** `VISIT_CLEAR` (`:487`) maps each role's badged section to the information types a visit may clear; the clear is a SELECT of ids (the badge's own count, through `visibilityClause`) then `UPDATE … WHERE id IN (?)`, skipped when no ids — two plain statements, no multi-table UPDATE (`IN (?)` with an array is mysql2's expansion: `= ANY($1)` on Postgres) |
| C31 | Teacher read scope | `utils/teacherScope.js:55-113` | `TEACHER_VIEW_SCOPE_SQL` needs two parameters (`teacherViewScopeParams` :66). `TEACHER_ADVISES_CLASS_SQL` :108 |
| C32 | Attendance scope | `routes/attendance.js:35`, `:69-108`, `:402`, `:480` | Writes are for the adviser; reads are for the recorder OR the current adviser. 403 outside scope |
| C33 | Excuse-letter authority | `routes/excuses.js:324` and `:340-349` (the edit, Pending re-checked in the `UPDATE`), `:432-457` (the adviser, once), `:466-480` (the transaction's outcomes); `utils/excuseAttendance.js` | The parent edits only while Pending. Only the adviser reviews, and only once (403 after that, re-checked inside the transaction). Since B8 the review also writes that day's `attendance` row (the eleven-cell rule; `recorded_by` = the reviewer; a weekday inside one of the three terms only — `TERMS`, not the December break) |
| C34 | Content targeting | `routes/content.js:120`, `:172`, `:363`, `:419`, `:737`, `:801` | `resolveAnnouncementTarget` and `resolveEventTarget` check the teacher's classes. Only the author or an admin may edit or delete |
| C35 | Who may message whom | `routes/messages.js:27`, `:165-191` | `canMessage`: teacher ↔ admin; a parent → their child's teachers; admin → parent and admin → admin are refused. Contacts are the inverse of the same rule |
| C36 | Parent-account gate | `routes/users.js:145-157` | Only the adviser of the learner's section may create the parent account |
| C37 | School calendar | `utils/schoolCalendar.js:28-77` (server, used by `dashboard.js:74`); `client/src/format/schoolCalendar.js:21-61` (copied byte for byte to `mobile/src/format/`) | SY 2026-2027, class days and three term ranges, `currentTerm`, `termDates`, month clamp. Three copies of one table |
| C38 | Dashboards | `routes/dashboard.js:70-345` | Summaries per role. The parent's general average is computed on the server with `roundTo2` (:339). The term comes from C37 |
| C39 | Email transport | `utils/mailer.js:36-136` | nodemailer over SMTP (`SMTP_*`), or `MAIL_TRANSPORT=file` writes to `server/tmp/mail`. Two templates: reset code :99, verify email :119 |
| C40 | SMS transport | `utils/smsTransport.js:40-197` | An HTTP gateway: `POST <url>/message`, Basic auth, E.164 numbers, a TTL, a 10 s timeout, fixed failure reasons; SMSGate in cloud mode since 2026-10-24 (an https API base), local mode the fallback. Or file mode to `server/tmp/sms`. Four texts: the two codes :164, :168, the two password alerts :176, :180 |
| C41 | Route-param ids | `utils/validateId.js:4` | `parseId`: positive integers only, otherwise 400 |
| C42 | Field rules | `utils/emailRule.js:28-47`; `utils/contactRule.js:27-55`; `utils/lrnRule.js:14-21` | Email pattern, 100 characters max. A mobile number is stored as `09XXXXXXXXX`, with `toE164` for SMS. An LRN is exactly 12 digits |
| C43 | Pagination and sort | `utils/pagination.js:19-92` | Default 50, max 200, a sort allow-list per endpoint, `page` metadata |
| C44 | Dates | `utils/dateFormat.js:6-23`; `config/db.js:27` | `YYYY-MM-DD` validation, `todayLocalDateString`. DATE columns come back as strings |
| C45 | Response scrubbing | `utils/sanitizeUser.js:7` | Strips any key containing "password" |
| C46 | Settings allow-list | `routes/settings.js:22-141` | 8 keys, 6 of them public (:37), with a validator per key |
| C47 | Refused fields | `routes/students.js:24-41`; `routes/users.js:474`; `routes/auth.js:252` | The learner's birthday / gender / address / contact number get a 400 when a value is sent. A user PUT can't change role / login_id / student_id / password / status |
| C48 | CORS | `utils/corsOrigins.js:18-53`; `server.js:35-36`; `socket.js:113-118` | A comma-separated list, never `*`. One list for HTTP and the socket |
| C49 | Outage answers | `utils/dbUnavailable.js:15-44` | A DB connection error gets 503 with the health body, never 401 |
| C50 | Error shape | `server.js:100-107`; every route | `{ success: false, message }`. 404 "Route not found." and 500 handlers |

---

## D. Realtime (`socket.io` ^4.8.3 on the server, `socket.io-client` on both clients)

| | Where | Detail |
|---|---|---|
| Server | `socket.js:112-130`; `server.js:112-114` | Attached to the API's own HTTP server, with the same CORS list. `io` is stored with `app.set('io')` |
| Auth at connect | `socket.js:31-100`, `:120` | `io.use(authenticateHandshake)`: the token comes from `handshake.auth.token`. Once per connection, never per event. A refusal arrives as `connect_error`, with `data.code` = `MUST_CHANGE_PASSWORD`, `POLICY_ACCEPTANCE_REQUIRED` or `DB_UNAVAILABLE` |
| Rooms | `socket.js:126` | One room per user, `user:<id>`. There is no `io.emit` broadcast anywhere |
| Client → server events | — | None. The server registers no custom listeners |

**Server emits:**

| Event | Payload | Emitted at | Triggered by |
|---|---|---|---|
| `notification_counts` | none ("refetch") | `utils/notify.js:234` | 14 call sites: `content.js:37` (the three deletes, through `deleteWithNotifications` at :424, :575, :804), `:338`, `:505`, `:712`; `excuses.js:275`, `:482`, `:494`; `grades.js:1780`, `:2704`, `:2868`, `:2945`, `:3137`, `:3306`; `users.js:222` |
| `new_message` | the message row | `routes/messages.js:440` | `POST /api/messages`, to the receiver's room only |

**Client listeners:**

| Client | Connect | Listens to | Consumers |
|---|---|---|---|
| Web | `client/src/realtime/SocketProvider.jsx:82`: `io(SOCKET_ORIGIN, { auth: { token }, transports: ['websocket','polling'] })`, with the token from localStorage (:71) | `connect`, `disconnect`, `connect_error` (:85-87), `new_message` (:89), `notification_counts` (:98) | realtime/UnreadProvider.jsx:46, NotificationProvider.jsx:37, MessageToast.jsx:85, LiveStatus.jsx:13; pages/messages/ConversationsPage.jsx:70, MessageThread.jsx:86; dashboards/AdminDashboard.jsx:132 |
| Phone | `mobile/src/realtime/SocketProvider.jsx:65-67` (same options) | the same five (:71-82), plus `subscribeConnect` (:115) to refetch on reconnect | realtime/UnreadProvider.jsx:34, NotificationProvider.jsx:21, MessageToast.jsx:77, LiveStatus.jsx:26 (manual reconnect); screens parent/MessagesScreen.jsx:23, parent/MessageThreadScreen.jsx:73, teacher/MessagesScreen.jsx:25, admin/DashboardScreen.jsx:128, admin/GradesScreen.jsx:124 |

There is no polling fallback. The "Live updates paused" strip appears after
a failed connect, a lost connection, or no connect within 3 s
(`realtime/liveState.js`, mirrored on the phone). Counts always come from
`GET /notifications/unread-counts` and `GET /messages/conversations`, never
from client arithmetic.

---

## E. Clients

| | Web (`client/src`) | Phone (`mobile/src`) |
|---|---|---|
| HTTP client | axios instance, `api/axios.js:8-10`, no timeout | axios instance, `api/client.js:35`, `timeout: 15000` |
| Base URL | `api/apiBase.js:20-33`: `VITE_API_BASE_URL`, or the page's own host on port 5000 + `/api` | `api/client.js:28`: `EXPO_PUBLIC_API_URL`, else `http://localhost:5000/api`; inlined at bundle time |
| Socket origin | `api/apiBase.js:36` (the base without `/api`) | `api/client.js:33` |
| Token storage | `localStorage` key `pp_token`: `api/axios.js:13`, `auth/AuthContext.jsx:31`, `:72`, `:83`, `:117` | `expo-secure-store` key `pp_token` through an injected provider: `auth/tokenStore.js:26`, `:44`, `:51`; `api/client.js:44-59` |
| Request interceptor | `Authorization: Bearer <token>` (`api/axios.js:12-18`) | same, awaited (`api/client.js:53-59`) |
| Response contract | `unwrap` (a key or a list) or `raw` is mandatory; a missing key throws (`api/axios.js:50-83`) | the same rule in a pure `readBody` (`api/client.js:64-93`) |
| 401 | Clears the token, stores the reason in `sessionStorage`, then `window.location.assign('/login')`. Never on `/auth/login` (`api/axios.js:115-131`, `:149-176`) | Clears the store and calls the session-ended listener with the reason in memory (`api/client.js:98-128`) |
| 403 and other errors | Never redirect. `api/extractError.js:13-25` shows the server's `message`, or an offline sentence when there was no response | `api/extractError.js` (a copy) |
| Session start | `auth/AuthContext.jsx:39` (`GET /auth/me`), login :67, `applyToken` after a password change :117 | `auth/AuthContext.jsx:50`, `:88`, `:109` |
| Lists | `listParams` / `fetchAll` (pages of 200, at most 25 pages / 5,000 rows), `api/axios.js:188-240` | the same, `api/client.js:133-174` |
| Out-of-order replies | `api/tickets.js` (latest reply wins) | `api/tickets.js` |
| Photo addresses | `format/photoUrl.js`: API origin + `/uploads/avatars/<name>` | copied byte for byte |
| Shared logic | — | Modules the web owns are copied byte for byte, and `npm run lint:mirrors` proves them equal (MOBILE M1) |
| Key libraries | react, react-router-dom, axios, socket.io-client, gsap; Vite build | expo ~57, react-native 0.86, React Navigation, axios, socket.io-client, expo-secure-store, AsyncStorage, NativeWind |

---

## F. Config — env var names only (never values)

### Server — `server/.env` (template `server/.env.example`)
| Name | Read at | Used for |
|---|---|---|
| PORT | `server.js:30` | API port (default 5000) |
| DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME | `config/db.js:7-11`; `routes/backups.js:113`, `:194-197`, `:607-610` | MySQL pool, mysqldump, the restore connection |
| JWT_SECRET | `utils/jwt.js:3`; `utils/loginThrottle.js:35` | Token signing; the `login_key` HMAC |
| JWT_EXPIRES_IN | `utils/jwt.js:4` | Token lifetime (in the template, not set in `.env`) |
| CORS_ORIGIN | `utils/corsOrigins.js:50` | Allowed origins for HTTP and the socket |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM | `utils/mailer.js:40-44` | Outgoing email |
| MAIL_TRANSPORT | `utils/mailer.js:36` | `file` = write mail to disk (suites); not set in `.env` |
| SMS_TRANSPORT | `utils/smsTransport.js:140` | `gateway` / `file` / off |
| SMS_GATEWAY_URL, SMS_GATEWAY_USER, SMS_GATEWAY_PASS | `utils/smsTransport.js:143-155` | The SMS gateway (cloud mode's https API base since 2026-10-24) |
| MYSQLDUMP_PATH | `routes/backups.js:110` | The mysqldump binary (default: on PATH); not set in `.env` |
| NODE_ENV | — | In `.env` and the template; read by no server code |
| SMS_CHECK_PASSWORD | — | In `server/.env` only (not in the template); read by no code |

Server tooling only (`server/scripts/`): **API_BASE** (the target for the
HTTP suites) and **FAIL_PORT** (`test:backups`' second API), plus DB_*,
JWT_SECRET, PORT and SMS_TRANSPORT.

### Web — `client/.env` (template `client/.env.example`)
| Name | Read at | Used for |
|---|---|---|
| VITE_API_BASE_URL | `client/src/api/apiBase.js:31` | API base; blank = derive it from the page (inlined at build time) |
| `import.meta.env.DEV` | 7 places | Vite built-in: the dev-only gallery |

Web tooling only: `TZ` and `NODE_ENV` (client scripts). The Playwright smoke
run reads `client/e2e/.env.e2e` (git-ignored, template
`.env.e2e.example`): E2E_ADMIN_ID, E2E_ADMIN_PW, E2E_TEACHER_ID,
E2E_TEACHER_PW, E2E_PARENT_ID, E2E_PARENT_PW, E2E_TEACHER2_ID,
E2E_TEACHER2_PW, E2E_PARENT2_ID, E2E_PARENT2_PW. It also reads E2E_API_ORIGIN,
E2E_APP_ORIGIN and DB_* (`client/e2e/*.js`, `client/playwright.config.js`,
`client/scripts/smoke-isolated.mjs`).

### Phone — `mobile/.env` (template `mobile/.env.example`)
| Name | Read at | Used for |
|---|---|---|
| EXPO_PUBLIC_API_URL | `mobile/src/api/client.js:28` | API base; inlined at bundle time, so Metro must restart for a change |

All four real env files are git-ignored (`.gitignore:3`, `:58`). Only the
four templates are tracked.

---

## G. Tests

**Source:** the counts are the recorded baselines in `docs/TESTING.md`
(re-measured by dispatch, last on 2026-10-10 → 2026-10-13). Scripts are in
`server/package.json`. **None was run for this file.**

**"Needs" column:**
- **API** = Express running (default `http://127.0.0.1:5000`, or `API_BASE`).
- **DB** = the suite also connects to MySQL itself for fixtures and cleanup.
- **WS** = it opens real `socket.io-client` sockets.
- **stub** = a stubbed pool planted in `require.cache`, with no server and no DB.
- **unit** = direct calls only.

Twenty-one HTTP suites share `scripts/policyFixture.js`. It accepts the
consent documents for the suite's accounts and deletes those
`policy_acceptances` rows directly in the DB afterwards.

| Script | File (`server/scripts/`) | Count | Covers | Needs |
|---|---|---|---|---|
| test:auth | test-auth-flows.js | 69 | Sign-in, /me, forced first change end to end, consent step, parent-account scope | API, DB |
| test:auth-middleware | test-auth-middleware.js | 23 | `authenticate`'s 401 / 403 / 503 paths, pool call counts | stub |
| test:socket-auth | test-socket-auth.js | 37 | The handshake vs the HTTP middleware, case by case, with compiled-in-memory controls | stub |
| test:students | test-student-flows.js | 97 | Learner CRUD, adviser enrolment scope, retired fields | API, DB |
| test:sections | test-sections-flows.js | 30 | Sections list / detail / adviser | API, DB |
| test:assignments | test-assignments-flows.js | 62 | Subjects, assignments, the printed order | API, DB |
| test:grading-modes | test-grading-modes-flows.js | 13 | `GET /grading-modes`, the 409 | API, DB (fixture cleanup only) |
| test:grades | test-grades-flows.js | 256 | Per-row grade writes, the computation chain, report card, scope, the notifications invariant | API, DB |
| test:attendance | test-attendance-flows.js | 73 | Scope, bulk, the mid-year transfer case | API, DB |
| test:content | test-content-flows.js | 97 | Announcements / memos / events, audiences, notification cleanup | API, DB |
| test:settings | test-settings-flows.js | 35 | Allow-list, per-key rules, the public read | API, DB |
| test:users | test-user-management-flows.js | 73 | Admin user management, email / contact rules, code burns (codes planted, no real mail) | API, DB |
| test:backups | test-backups-flows.js | 52 | Backup list / create / download / delete, the `.partial` safeguard on a second API | API, DB, spawns a 2nd server, mysqldump, files |
| test:sanitize | test-sanitize-user.js | 9 | `sanitizeUser` | unit |
| test:grade-computation | test-grade-computation.js | 77 | `utils/gradeComputation.js`, including the BANDS anti-drift check | unit |
| test:school-calendar | test-school-calendar.js | 34 | `utils/schoolCalendar.js` boundaries and refusals | unit |
| test:messages | test-messages-flows.js | 86 | The canMessage matrix, contacts, threads, `new_message` | API, DB, WS |
| test:restore | test-restore-flows.js | 29 | Restore pre-flight gates and the token cutoff. **Never runs a real restore** | API, DB |
| test:excuses | test-excuses-flows.js | 93 | Letters, adviser-only review, notifications | API, DB |
| test:notifications | test-notifications-flows.js | 157 | Fan-out audiences, read-time visibility, counts, self-heal, delete removal, the socket signal | API, DB, WS |
| test:dashboard | test-dashboard-flows.js | 77 | The three dashboards | API, DB |
| test:class-record | test-class-record-flows.js | 132 | Class record GET/PUT, the locked-HPS 409. **Imports the client's `buildPayload.js`** | API, DB |
| test:class-summary | test-class-summary-flows.js | 59 | Class summary; the adviser's read of a report card | API, DB |
| test:grade-locks | test-grade-locks-flows.js | 50 | `POST /grades/locks`, dry run / apply / unlock | API, DB |
| test:recovery | test-recovery-flows.js | 110 | Forgot / reset, email and contact confirmation, token_version. **Only with `MAIL_TRANSPORT=file SMS_TRANSPORT=file` on the server**; otherwise 11 passed / 1 failed | API (file transports), DB, reads `server/tmp/` |
| test:profile-photo | test-profile-photo.js | 70 | Upload, serve, replace, remove, refusals, EXIF/GPS stripped | API, DB, files in `uploads/avatars/` |
| test:cors-origins | test-cors-origins.js | 44 | The CORS list parser, plus the real `cors` and the real `initSocket` | its own throwaway servers; no API, no DB |
| test:privacy | test-privacy-flows.js | 74 | Consent gate, forced change before consent, socket gates, sign-in limits, the restore's privacy step on a scratch database | API, DB (creates and drops a scratch DB), WS |
| test:sms-transport | test-sms-transport.js | 62 | Contact rule, the gateway request shape through a fake fetch, failure reasons, file mode | unit (plus one refused local port) |
| **Total** | **29 suites** | **2,080** | | |

**Other checks:**
- **`verify:grading-seed`** (`verify-grading-seed.js`, 46 checks): direct DB, grading seed consistency.
- **`proof:backups`** (`proof-backup-loop.js`): run by hand; starts its own API.
- **`sms:probe`** (`probe-sms-gateway.js`): checks the real gateway.
- **Web:** 29 SSR proofs (`client/scripts/ssr-*.jsx`, `renderToStaticMarkup`, no server). The Playwright smoke run is `client/e2e/smoke.spec.js` (`npm run smoke` / `smoke:isolated`; needs the running web and API, and reads DB_* for direct DB access). Lint gates: oxlint, `lint:tokens`, `lint:contrast`.
- **Phone:** 28 proofs (`mobile/scripts/proof-*.mjs`, Node, pure modules), plus `lint:mirrors`, `lint:tokens`, `lint:colors` and oxlint.

Per-proof counts are in `docs/TESTING.md`.
