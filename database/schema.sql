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

CREATE TABLE teacher_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  grade_level TINYINT UNSIGNED NOT NULL CHECK (grade_level BETWEEN 1 AND 6),
  section VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_teacher_assignment (teacher_id, subject_id, grade_level, section),
  INDEX idx_assignments_teacher (teacher_id),
  INDEX idx_assignments_subject (subject_id)
) ENGINE=InnoDB;

-- DepEd grade weight configuration (G1-3: 30/50/20, G4-6: 40/40/20)
CREATE TABLE grade_weight_configs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  grade_level_min TINYINT UNSIGNED NOT NULL,
  grade_level_max TINYINT UNSIGNED NOT NULL,
  quiz_weight DECIMAL(5,2) NOT NULL,
  activity_weight DECIMAL(5,2) NOT NULL,
  exam_weight DECIMAL(5,2) NOT NULL,
  UNIQUE KEY uq_grade_weight_range (grade_level_min, grade_level_max)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Grades & attendance
-- ---------------------------------------------------------------------------

CREATE TABLE grades (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  quarter ENUM('Q1', 'Q2', 'Q3', 'Q4') NOT NULL,
  school_year VARCHAR(9) NOT NULL,
  quiz_avg DECIMAL(5,2) DEFAULT NULL,
  activity_avg DECIMAL(5,2) DEFAULT NULL,
  exam_score DECIMAL(5,2) DEFAULT NULL,
  final_grade DECIMAL(5,2) DEFAULT NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  acknowledged_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_grade_record (student_id, subject_id, quarter, school_year),
  INDEX idx_grades_student (student_id),
  INDEX idx_grades_subject (subject_id)
) ENGINE=InnoDB;

CREATE TABLE grade_components (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  grade_id INT UNSIGNED NOT NULL,
  type ENUM('quiz', 'activity') NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  max_score DECIMAL(5,2) NOT NULL,
  label VARCHAR(100) NOT NULL,
  date_recorded DATE DEFAULT NULL,
  INDEX idx_grade_components_grade (grade_id)
) ENGINE=InnoDB;

CREATE TABLE attendance (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  date DATE NOT NULL,
  status ENUM('Present', 'Absent', 'Late', 'Excused') NOT NULL,
  recorded_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance (student_id, subject_id, date),
  INDEX idx_attendance_student_date (student_id, date),
  INDEX idx_attendance_subject (subject_id)
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

CREATE TABLE contributions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  grade_level TINYINT UNSIGNED NOT NULL CHECK (grade_level BETWEEN 1 AND 6),
  due_date DATE DEFAULT NULL,
  posted_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contributions_grade (grade_level)
) ENGINE=InnoDB;

CREATE TABLE contribution_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contribution_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('Paid', 'Pending') NOT NULL DEFAULT 'Pending',
  updated_by INT UNSIGNED DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contribution_student (contribution_id, student_id),
  INDEX idx_contribution_records_student (student_id)
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

-- ---------------------------------------------------------------------------
-- Foreign keys (added after all tables exist)
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD CONSTRAINT fk_users_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_users_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE students
  ADD CONSTRAINT fk_students_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE teacher_assignments
  ADD CONSTRAINT fk_assignments_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_assignments_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;

ALTER TABLE grades
  ADD CONSTRAINT fk_grades_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_grades_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;

ALTER TABLE grade_components
  ADD CONSTRAINT fk_grade_components_grade FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE;

ALTER TABLE attendance
  ADD CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_attendance_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_attendance_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE excuse_letters
  ADD CONSTRAINT fk_excuse_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_excuse_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_excuse_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE announcements
  ADD CONSTRAINT fk_announcements_posted_by FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE memos
  ADD CONSTRAINT fk_memos_posted_by FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE contributions
  ADD CONSTRAINT fk_contributions_posted_by FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE contribution_records
  ADD CONSTRAINT fk_contribution_records_contribution FOREIGN KEY (contribution_id) REFERENCES contributions(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_contribution_records_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_contribution_records_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE events
  ADD CONSTRAINT fk_events_posted_by FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE activity_logs
  ADD CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE backups
  ADD CONSTRAINT fk_backups_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;
