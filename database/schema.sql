-- Captain H. Francisco Elementary School — Parent's Portal System
-- Database Schema (v2.0 — aligned with docs/SYSTEM_ARCHITECTURE.md Section 9)

CREATE DATABASE IF NOT EXISTS parents_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE parents_portal;

-- ---------------------------------------------------------------------------
-- Core authentication & users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  login_id VARCHAR(20) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('parent', 'teacher', 'admin') NOT NULL,
  status ENUM('pending', 'active', 'rejected', 'inactive') NOT NULL DEFAULT 'pending',
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) DEFAULT NULL,
  -- NULL until the account proves it reads that inbox. Seeded NULL for
  -- everyone (Darryl, 2026-09-19): a seeded "verified" for an address
  -- nobody controls is a claim the system cannot back.
  email_verified_at TIMESTAMP NULL DEFAULT NULL,
  -- Per-user JWT cutoff, the twin of auth_security_state.token_valid_after.
  -- Set by a password change, a reset and an admin temporary password;
  -- middleware/auth.js rejects any token issued before it.
  --
  -- AUDIT ONLY — WHEN a password last changed. Revocation is token_version
  -- below; do not reintroduce this as the check, and see that column's note
  -- for why a timestamp cannot do that job.
  password_changed_at TIMESTAMP(3) NULL DEFAULT NULL,
  -- THE JWT REVOCATION MECHANISM. Bumped by every password change, by a
  -- reset and by an admin temporary password. The value rides in the token as
  -- `v` and middleware/auth.js compares it for equality, so every token
  -- minted before the bump stops working at once.
  --
  -- A COUNTER, NOT A TIMESTAMP, and the reason is worth keeping. The first
  -- attempt compared the JWT `iat` against password_changed_at. That cannot
  -- work: `iat` has ONE-SECOND resolution, and a temp password, the login
  -- that follows it and the forced change all land inside the same second, so
  -- the dead token and the live one carry an identical `iat`. Minting the new
  -- token a second forward only moved the hole — it then outlived the NEXT
  -- change. A counter has no resolution to run out of.
  --
  -- A token with no `v` reads as 0, which matches a never-changed account, so
  -- tokens predating this column keep working until that account next changes
  -- its password.
  token_version INT UNSIGNED NOT NULL DEFAULT 0,
  -- Set by an admin temporary password. Until it is cleared the account can
  -- only read itself and change its password.
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  contact_number VARCHAR(20) DEFAULT NULL,
  profile_pic VARCHAR(255) DEFAULT NULL,
  student_id INT UNSIGNED DEFAULT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  approved_by INT UNSIGNED DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_status (status),
  INDEX idx_users_student (student_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Students & academic structure
-- ---------------------------------------------------------------------------

CREATE TABLE students (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lrn VARCHAR(12) NOT NULL UNIQUE,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  grade_level TINYINT UNSIGNED NOT NULL CHECK (grade_level BETWEEN 1 AND 6),
  section VARCHAR(50) NOT NULL,
  section_id INT UNSIGNED DEFAULT NULL,
  birthday DATE DEFAULT NULL,
  gender ENUM('male', 'female') DEFAULT NULL,
  address TEXT DEFAULT NULL,
  contact_number VARCHAR(20) DEFAULT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_students_grade_section (grade_level, section)
) ENGINE=InnoDB;

CREATE TABLE subjects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  grade_level TINYINT UNSIGNED NOT NULL CHECK (grade_level BETWEEN 1 AND 6),
  UNIQUE KEY uq_subject_grade (name, grade_level),
  INDEX idx_subjects_grade (grade_level)
) ENGINE=InnoDB;

CREATE TABLE sections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  grade_level TINYINT UNSIGNED NOT NULL CHECK (grade_level BETWEEN 1 AND 6),
  adviser_id INT UNSIGNED DEFAULT NULL,
  school_year VARCHAR(9) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_section (grade_level, name, school_year),
  INDEX idx_sections_adviser (adviser_id)
) ENGINE=InnoDB;

CREATE TABLE teacher_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  grade_level TINYINT UNSIGNED NOT NULL CHECK (grade_level BETWEEN 1 AND 6),
  section VARCHAR(50) NOT NULL,
  section_id INT UNSIGNED DEFAULT NULL,
  UNIQUE KEY uq_teacher_assignment (teacher_id, subject_id, grade_level, section),
  INDEX idx_assignments_teacher (teacher_id),
  INDEX idx_assignments_subject (subject_id)
) ENGINE=InnoDB;

-- DepEd component weights, keyed by LEARNING AREA (subject_id), not grade
-- band. Re-keyed here per DO 015 s. 2026 — the previous grade_level_min/
-- grade_level_max shape was confirmed wrong: two students in the same
-- Grade 5 section carry different weights depending on subject (core
-- learning areas 20/50/30, EPP/TLE and MAPEH 20/60/20). school_year is
-- included because these weights are themselves a policy artifact that
-- has already changed once this school year (DO 8 s.2015 -> DO 015
-- s.2026) — keying by subject_id alone would silently apply a future
-- reweighting to past, already-computed grades on read.
-- NOTE: seeded in this stage (G1a) against the CURRENT subject ids —
-- `subjects` itself is not being touched here, see G1b. This weight seed
-- is provisional until G1b re-seeds subjects and this table together.
CREATE TABLE grade_weight_configs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_id INT UNSIGNED NOT NULL,
  school_year VARCHAR(9) NOT NULL,
  ww_weight DECIMAL(5,2) NOT NULL,
  pt_weight DECIMAL(5,2) NOT NULL,
  ex_weight DECIMAL(5,2) NOT NULL,
  UNIQUE KEY uq_weight_subject_year (subject_id, school_year),
  CHECK (ww_weight + pt_weight + ex_weight = 100.00)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Grades & attendance
-- ---------------------------------------------------------------------------

-- Dual-mode: exactly one of term_grade (numerical, Grades 2-6 for SY
-- 2026-2027) or descriptive_grade (Grade 1, and later Grades 2-3 per the
-- KS1 rollout) is ever populated on a given row — which one is decided
-- by grading_mode_configs at WRITE time, keyed on (grade_level,
-- school_year). At READ time no lookup is needed: whichever of the two
-- columns is non-NULL on the row already tells you which mode it was
-- written under. This is deliberate, not incomplete — do NOT "clean up"
-- by dropping one column or merging them. A later school year moves more
-- grade levels into descriptive mode (see grading_mode_configs), so both
-- shapes stay live simultaneously, indefinitely.
-- Final Grade (average of the 3 term rows) and General Average (average
-- of Final Grades across subjects) are NOT columns here — both are pure
-- aggregates of already-stored term_grade values, computed at read time.
CREATE TABLE grades (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  term TINYINT UNSIGNED NOT NULL CHECK (term BETWEEN 1 AND 3),
  school_year VARCHAR(9) NOT NULL,

  ww_percentage DECIMAL(5,2) DEFAULT NULL,
  ww_weighted DECIMAL(5,2) DEFAULT NULL,
  pt_percentage DECIMAL(5,2) DEFAULT NULL,
  pt_weighted DECIMAL(5,2) DEFAULT NULL,

  -- EX is a fixed, positional composite (ST1 x0.30 + ST2 x0.30 + TE
  -- x0.40), not an arbitrary-count aggregate like WW/PT — three
  -- dedicated columns here rather than three more grade_components rows,
  -- since "is this exam complete" is then a NULL check on this row, not
  -- a child-table query, and the formula never grows a fourth sub-part.
  -- ex_st1/ex_st2/ex_te hold the RAW score, not a percentage — each
  -- sub-test's max is a separate column (ex_st1_max/ex_st2_max/ex_te_max)
  -- so the percentage (score / max x 100) is always re-derivable, exactly
  -- like WW/PT retain every raw score via grade_components. Storing only
  -- the derived percentage here (the original G1a design) was a mistake,
  -- corrected before Stage G2 wrote anything against it: a parent asking
  -- "what did my child score on ST1" could never be told the raw score,
  -- and a wrong max_score could never be corrected, once the raw value
  -- was gone. ex_percentage stays the DERIVED value, computed at write
  -- time from these six raw columns — it is a cache, not the source.
  ex_st1 DECIMAL(5,2) DEFAULT NULL,
  ex_st1_max DECIMAL(5,2) DEFAULT NULL,
  ex_st2 DECIMAL(5,2) DEFAULT NULL,
  ex_st2_max DECIMAL(5,2) DEFAULT NULL,
  ex_te DECIMAL(5,2) DEFAULT NULL,
  ex_te_max DECIMAL(5,2) DEFAULT NULL,
  ex_percentage DECIMAL(5,2) DEFAULT NULL,
  ex_weighted DECIMAL(5,2) DEFAULT NULL,

  initial_grade DECIMAL(5,2) DEFAULT NULL,
  term_grade DECIMAL(5,2) DEFAULT NULL,
  descriptive_grade ENUM('A', 'B', 'C', 'D', 'E') DEFAULT NULL,

  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  acknowledged_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_grade_record (student_id, subject_id, term, school_year),
  INDEX idx_grades_student (student_id),
  INDEX idx_grades_subject (subject_id)
) ENGINE=InnoDB;

-- WW (Written Works) and PT (Performance Tasks) only — an arbitrary
-- number of raw scores per grade, averaged. Renamed from quiz/activity
-- to match DO 015's actual terms. Deliberately no 'formative' value:
-- formative assessments are never included in grade computation (DO 015
-- s.2026) — if ever tracked, that belongs in a separate, unlinked table,
-- not a third value here. EX's three sub-scores (ST1/ST2/TE) live as
-- fixed columns on `grades` instead — see the comment there.
-- ONE ASSESSMENT SLOT PER CLASS, added 2026-09-22 for the class-record
-- grid. A slot is a COLUMN on the DepEd E-Class Record — "Written Work 1"
-- for this subject, this section, this term — and its highest possible
-- score belongs to the CLASS, not to any one learner's row.
--
-- WHY A TABLE AND NOT "max_score per grade_components row with an agreement
-- check". With the max only on the rows, it exists only where a score
-- exists — so "a slot nobody has used" and "a slot nobody has scored YET"
-- become the same state, and the school's rule (a blank HPS means the slot
-- is unused and is left out of the computation, never counted as zero) is
-- literally unrepresentable. An agreement check can only DETECT a
-- divergence; this prevents one.
--
-- max_score NULL = the slot is unused. That is the only meaning of NULL
-- here, and it is why clearing an HPS that already has scores is refused by
-- the API rather than silently dropping them.
--
-- KEYED ON (grade_level, section) AS VARCHARs, deliberately, matching
-- teacher_assignments — which is what teacherCanEncodeGrade already scopes
-- on. CLAUDE.md records that section_id is READ in exactly four places;
-- this would have been a fifth and should not be.
--
-- `name` is optional. Named, the grid header and the parent breakdown modal
-- show it ("Long quiz"); unnamed, the server resolves a display_label of
-- "Written Work 1" / "Performance Task 1". The fallback is computed
-- SERVER-SIDE, once, because two clients will read it (web now, Expo later)
-- and a fallback computed twice drifts.
CREATE TABLE assessment_slots (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_id INT UNSIGNED NOT NULL,
  grade_level TINYINT UNSIGNED NOT NULL,
  section VARCHAR(50) NOT NULL,
  term TINYINT UNSIGNED NOT NULL CHECK (term BETWEEN 1 AND 3),
  school_year VARCHAR(9) NOT NULL,
  type ENUM('WW', 'PT') NOT NULL,
  slot_no TINYINT UNSIGNED NOT NULL,
  name VARCHAR(100) DEFAULT NULL,
  max_score DECIMAL(5,2) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_slot (subject_id, grade_level, section, term, school_year, type, slot_no)
) ENGINE=InnoDB;

-- WW (Written Works) and PT (Performance Tasks) only — an arbitrary
-- number of raw scores per grade, averaged. Renamed from quiz/activity
-- to match DO 015's actual terms. Deliberately no 'formative' value:
-- formative assessments are never included in grade computation (DO 015
-- s.2026) — if ever tracked, that belongs in a separate, unlinked table,
-- not a third value here. EX's three sub-scores (ST1/ST2/TE) live as
-- fixed columns on `grades` instead — see the comment there.
--
-- slot_id (2026-09-22) ties a row to its class's slot. REQUIRED by every
-- API write path since CR1; nullable in the column because rows recorded
-- before the grid existed have none, and a legacy row is kept, never
-- back-filled with an invented slot. It becomes NOT NULL only once there
-- is nothing left to back-fill.
--
-- max_score STAYS on the row and is still what the computation reads
-- (componentPercentage sums score/max_score per row). The slot is the
-- class-level DECLARATION; this is the materialised copy, and the
-- class-record endpoint is the ONLY writer of both — when a slot's HPS
-- changes it rewrites every row on that slot in the same transaction.
-- That is a denormalisation on purpose: the alternative is a join inside
-- recomputeGrade, and the computation chain is the last place to add one.
-- The guard is an invariant test, not a comment.
--
-- label is NULLABLE since 2026-09-22. A slot row leaves it NULL and
-- renders display_label instead; storing the resolved label here would be
-- a snapshot that goes stale the moment a slot is renamed. Legacy rows
-- keep the label they were written with.
CREATE TABLE grade_components (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  grade_id INT UNSIGNED NOT NULL,
  slot_id INT UNSIGNED DEFAULT NULL,
  type ENUM('WW', 'PT') NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  max_score DECIMAL(5,2) NOT NULL,
  label VARCHAR(100) DEFAULT NULL,
  date_recorded DATE DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_grade_components_grade (grade_id),
  INDEX idx_grade_components_slot (slot_id)
) ENGINE=InnoDB;

-- Adjusted Transmutation Table, SY 2026-2027 ONLY (DO 015 s.2026,
-- Section 5). Seeded as data, not a hardcoded array or CASE expression,
-- specifically because it is transitional: from SY 2027-2028 onward
-- (zero-based grading), no row is seeded for that school_year, and a
-- lookup returning zero rows is read by the application as "use the
-- Initial Grade directly, no transmutation" — the table disappearing is
-- what removes the behavior, not a code change keyed on a hardcoded
-- year. Lookup is inclusive on both bounds (ig_min <= IG <= ig_max), so
-- the exact boundary values transcribed from the spec resolve correctly
-- (70.00 -> 75, 69.99 -> 74).
CREATE TABLE transmutation_table (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_year VARCHAR(9) NOT NULL,
  ig_min DECIMAL(5,2) NOT NULL,
  ig_max DECIMAL(5,2) NOT NULL,
  transmuted_grade TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_transmutation_range (school_year, ig_min, ig_max)
) ENGINE=InnoDB;

-- Which grade levels use descriptive (letter) vs numerical grading, per
-- school year — Table 12 of DO 015 s.2026 phases more grade levels into
-- descriptive grading over time (Grade 1 only in SY 2026-2027; Grades
-- 1-2 in SY 2027-2028; and so on). Keyed here, not hardcoded, so that
-- rollout is a seed/data change, not a code change. Read at grade-write
-- time only, to decide which of grades.term_grade / descriptive_grade a
-- given write may populate — not needed at read time, see the comment
-- on `grades`.
CREATE TABLE grading_mode_configs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  grade_level TINYINT UNSIGNED NOT NULL CHECK (grade_level BETWEEN 1 AND 6),
  school_year VARCHAR(9) NOT NULL,
  mode ENUM('descriptive', 'numerical') NOT NULL,
  UNIQUE KEY uq_grading_mode (grade_level, school_year)
) ENGINE=InnoDB;

-- Per DAY, not per subject — the section adviser records this once daily
-- during Homeroom Guidance (confirmed by the school; SF9 records monthly
-- Class Days/Days Present/Days Absent, not a per-subject figure). Was
-- (student_id, subject_id, date); subject_id dropped outright, not made
-- nullable — table held 0 rows, so this is a clean rebuild, not a migration.
CREATE TABLE attendance (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  date DATE NOT NULL,
  status ENUM('Present', 'Absent', 'Late', 'Excused') NOT NULL,
  recorded_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance (student_id, date),
  INDEX idx_attendance_student_date (student_id, date)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Communication & records
-- ---------------------------------------------------------------------------

CREATE TABLE excuse_letters (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  parent_id INT UNSIGNED NOT NULL,
  absence_date DATE NOT NULL,
  reason TEXT NOT NULL,
  details TEXT DEFAULT NULL,
  attachment_url VARCHAR(255) DEFAULT NULL,
  status ENUM('Pending', 'Approved', 'Declined') NOT NULL DEFAULT 'Pending',
  teacher_remarks TEXT DEFAULT NULL,
  reviewed_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_excuse_student (student_id),
  INDEX idx_excuse_parent (parent_id),
  INDEX idx_excuse_status (status)
) ENGINE=InnoDB;

CREATE TABLE messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sender_id INT UNSIGNED NOT NULL,
  receiver_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  read_status TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_sender (sender_id),
  INDEX idx_messages_receiver (receiver_id),
  INDEX idx_messages_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE announcements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(50) DEFAULT NULL,
  target_grade TINYINT UNSIGNED DEFAULT NULL,
  target_section VARCHAR(50) DEFAULT NULL,
  section_id INT UNSIGNED DEFAULT NULL,
  attachment_url VARCHAR(255) DEFAULT NULL,
  posted_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_announcements_grade (target_grade),
  INDEX idx_announcements_posted (posted_by)
) ENGINE=InnoDB;

CREATE TABLE memos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  attachment_url VARCHAR(255) DEFAULT NULL,
  posted_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_memos_posted (posted_by)
) ENGINE=InnoDB;

CREATE TABLE events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  event_date DATE NOT NULL,
  target_grade TINYINT UNSIGNED DEFAULT NULL,
  posted_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_events_date (event_date),
  INDEX idx_events_grade (target_grade)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- System administration
-- ---------------------------------------------------------------------------

CREATE TABLE activity_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED DEFAULT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_user (user_id),
  INDEX idx_activity_action (action)
) ENGINE=InnoDB;

CREATE TABLE system_settings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(50) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE backups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_backups_created (created_by)
) ENGINE=InnoDB;

-- Single-row global auth control, never exposed through /api/settings.
-- token_valid_after is set by POST /api/backups/:id/restore — any JWT
-- issued (iat) before this timestamp is rejected by middleware/auth.js,
-- since a restore can replace every users row with different data.
-- Deliberately not a system_settings row: that table is readable by
-- every authenticated role and writable by any admin through a generic
-- form, neither of which is appropriate for a value only the restore
-- endpoint itself should ever read or write.
CREATE TABLE auth_security_state (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  token_valid_after TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB;

-- Notifications (N1, 2026-09-19). The bell.
--
-- item_id is POLYMORPHIC and therefore carries NO FOREIGN KEY: it points at
-- announcements, memos, events, excuse_letters, users or grades depending on
-- item_type. This is the one deliberate break from the convention that every
-- reference in this file is a real FK. What compensates is a read-time
-- visibility re-check in routes/notifications.js, which joins each row back to
-- the item through that same list WHERE: a notification whose item was deleted,
-- or whose audience no longer includes this user, simply stops being returned.
-- Do not add a cleanup job for orphans; there is nothing to clean, by design.
--
-- uq_notifications_once does double duty: it makes every fan-out idempotent
-- under a retry, AND it is the entire implementation of the grades rule
-- "at most once per subject + term" -- a grades row already IS one
-- (student, subject, term, school_year), so its id is that key.
--
-- read_at is a nullable TIMESTAMP rather than a boolean: NULL is the unread
-- dot, and a value is also when it was read, at no extra cost.
CREATE TABLE notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('announcement','memo','event','excuse_submitted','excuse_reviewed','parent_pending','grade_available') NOT NULL,
  item_type ENUM('announcement','memo','event','excuse_letter','user','grade') NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  title_snapshot VARCHAR(200) DEFAULT NULL,
  actor_id INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_notifications_once (user_id, type, item_id),
  INDEX idx_notifications_unread (user_id, read_at, created_at),
  INDEX idx_notifications_item (item_type, item_id)
) ENGINE=InnoDB;
-- Account recovery (R1, 2026-09-19). ONE table for both code purposes: they
-- share a lifecycle (six digits, hashed, ten-minute expiry, five attempts,
-- single use, the same per-account and per-IP limits), so `purpose` is a
-- discriminator rather than a difference in shape.
--
-- code_hash is bcrypt, via the same helper passwords use: a code is a
-- credential for the length of its life. email_snapshot records where it was
-- actually sent, because an admin can change the address in between.
--
-- ITS ROWS ARE EXCLUDED FROM EVERY mysqldump (routes/backups.js). A hash of
-- a six-digit code is a 10^6 search space; a dump on disk containing live
-- rows is a reset credential, and no backup file is ever deleted.
CREATE TABLE auth_codes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  purpose ENUM('password_reset','email_verification') NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  email_snapshot VARCHAR(100) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at TIMESTAMP NULL DEFAULT NULL,
  request_ip VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_codes_lookup (user_id, purpose, consumed_at, expires_at),
  INDEX idx_auth_codes_rate (user_id, purpose, created_at),
  INDEX idx_auth_codes_ip (request_ip, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Foreign keys (added after all tables exist)
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD CONSTRAINT fk_users_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_users_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE students
  ADD CONSTRAINT fk_students_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  -- RESTRICT, not CASCADE: a section with enrolled learners must not be deletable.
  ADD CONSTRAINT fk_students_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE RESTRICT;

-- SET NULL, not RESTRICT — deactivating a teacher must not delete the section.
ALTER TABLE sections
  ADD CONSTRAINT fk_sections_adviser FOREIGN KEY (adviser_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE teacher_assignments
  ADD CONSTRAINT fk_assignments_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_assignments_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_assignments_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE;

ALTER TABLE grade_weight_configs
  ADD CONSTRAINT fk_weight_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;

ALTER TABLE grades
  ADD CONSTRAINT fk_grades_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_grades_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;

ALTER TABLE assessment_slots
  ADD CONSTRAINT fk_slot_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;

-- ON DELETE RESTRICT on the slot, not CASCADE, and the asymmetry with the
-- grade FK beside it is the point: deleting a GRADE row should take its
-- components (they describe that learner's work and nothing else), but
-- deleting a SLOT that still holds scores must be impossible — it would
-- silently destroy every learner's mark for that column. The API refuses
-- it first with a 409 naming the count; this is the backstop for a direct
-- DB write.
ALTER TABLE grade_components
  ADD CONSTRAINT fk_grade_components_grade FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_grade_components_slot FOREIGN KEY (slot_id) REFERENCES assessment_slots(id) ON DELETE RESTRICT;

ALTER TABLE attendance
  ADD CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_attendance_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE excuse_letters
  ADD CONSTRAINT fk_excuse_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_excuse_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_excuse_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE announcements
  ADD CONSTRAINT fk_announcements_posted_by FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_announcements_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE;

ALTER TABLE memos
  ADD CONSTRAINT fk_memos_posted_by FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE events
  ADD CONSTRAINT fk_events_posted_by FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE activity_logs
  ADD CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE backups
  ADD CONSTRAINT fk_backups_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE auth_codes
  ADD CONSTRAINT fk_auth_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
