-- Captain H. Francisco Elementary School — Parent's Portal System
-- Seed data (v2.0)
-- Default passwords (hashed at setup time via scripts/setup-db.js):
--   Admin:   ADMIN001  / Admin@2026
--   Teacher: TCH-001   / Teacher@2026
--   Parent:  LRN login / Parent@2026 (after approval)

USE parents_portal;

-- ---------------------------------------------------------------------------
-- Grade weight configs (DepEd K-12 elementary)
-- ---------------------------------------------------------------------------

INSERT INTO grade_weight_configs (grade_level_min, grade_level_max, quiz_weight, activity_weight, exam_weight) VALUES
  (1, 3, 30.00, 50.00, 20.00),
  (4, 6, 40.00, 40.00, 20.00);

-- ---------------------------------------------------------------------------
-- System settings
-- ---------------------------------------------------------------------------

INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('school_name', 'Captain H. Francisco Elementary School'),
  ('school_address', 'Captain H. Francisco Elementary School, Philippines'),
  ('academic_year', '2026-2027'),
  ('current_quarter', 'Q1'),
  ('logo_url', '');

-- ---------------------------------------------------------------------------
-- DepEd subjects per grade level (G1–G6)
-- ---------------------------------------------------------------------------

-- Grade 1
INSERT INTO subjects (name, grade_level) VALUES
  ('Mother Tongue', 1),
  ('Filipino', 1),
  ('English', 1),
  ('Mathematics', 1),
  ('Araling Panlipunan', 1),
  ('Edukasyon sa Pagpapakatao', 1),
  ('MAPEH', 1),
  ('EPP', 1);

-- Grade 2
INSERT INTO subjects (name, grade_level) VALUES
  ('Mother Tongue', 2),
  ('Filipino', 2),
  ('English', 2),
  ('Mathematics', 2),
  ('Araling Panlipunan', 2),
  ('Edukasyon sa Pagpapakatao', 2),
  ('MAPEH', 2),
  ('EPP', 2);

-- Grade 3
INSERT INTO subjects (name, grade_level) VALUES
  ('Mother Tongue', 3),
  ('Filipino', 3),
  ('English', 3),
  ('Mathematics', 3),
  ('Araling Panlipunan', 3),
  ('Edukasyon sa Pagpapakatao', 3),
  ('MAPEH', 3),
  ('EPP', 3);

-- Grade 4
INSERT INTO subjects (name, grade_level) VALUES
  ('Filipino', 4),
  ('English', 4),
  ('Mathematics', 4),
  ('Science', 4),
  ('Araling Panlipunan', 4),
  ('Edukasyon sa Pagpapakatao', 4),
  ('MAPEH', 4),
  ('EPP', 4);

-- Grade 5
INSERT INTO subjects (name, grade_level) VALUES
  ('Filipino', 5),
  ('English', 5),
  ('Mathematics', 5),
  ('Science', 5),
  ('Araling Panlipunan', 5),
  ('Edukasyon sa Pagpapakatao', 5),
  ('MAPEH', 5),
  ('EPP', 5);

-- Grade 6
INSERT INTO subjects (name, grade_level) VALUES
  ('Filipino', 6),
  ('English', 6),
  ('Mathematics', 6),
  ('Science', 6),
  ('Araling Panlipunan', 6),
  ('Edukasyon sa Pagpapakatao', 6),
  ('MAPEH', 6),
  ('EPP', 6);

-- ---------------------------------------------------------------------------
-- Sample students (capstone examples: Marwin & Jea — same guardian, different LRNs)
-- created_by will be set after teacher is seeded (see setup-db.js)
-- ---------------------------------------------------------------------------

INSERT INTO students (lrn, first_name, last_name, grade_level, section, birthday, gender, address, status) VALUES
  ('13567454', 'Marwin', 'Conde', 6, 'Mabini', '2014-03-15', 'male', 'Pateros, Metro Manila', 'active'),
  ('1234567', 'Jea Mae', 'Bargaso', 5, 'Rizal', '2015-07-22', 'female', 'Pateros, Metro Manila', 'active');

-- Password hashes for users are inserted by scripts/setup-db.js after bcrypt hashing.
-- Placeholder markers below are replaced programmatically:

-- __SEED_USERS__

-- Sample teacher assignment (teacher_id = 2 after admin=1, teacher=2)
-- __SEED_ASSIGNMENTS__

-- Activity log for initial admin seed
-- __SEED_ACTIVITY__
