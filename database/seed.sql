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
-- Sections — real names from the school's official teacher list, SY 2026-2027.
-- adviser_id left NULL for now (Stage A is additive schema only).
-- ---------------------------------------------------------------------------

INSERT INTO sections (name, grade_level, school_year) VALUES
  ('Matipid', 1, '2026-2027'),
  ('Mabait', 1, '2026-2027'),
  ('Maagap', 1, '2026-2027'),
  ('Mapagmahal', 1, '2026-2027'),
  ('Mapagkaibigan', 2, '2026-2027'),
  ('Masikap', 2, '2026-2027'),
  ('Mapagkakatiwalaan', 2, '2026-2027'),
  ('Magiliw', 3, '2026-2027'),
  ('Matapat', 3, '2026-2027'),
  ('Masipag', 3, '2026-2027'),
  ('Malinis', 3, '2026-2027'),
  ('Makabansa', 4, '2026-2027'),
  ('Makakalikasan', 4, '2026-2027'),
  ('Makadiyos', 4, '2026-2027'),
  ('Makatao', 4, '2026-2027'),
  ('Mahusay', 5, '2026-2027'),
  ('Masigasig', 5, '2026-2027'),
  ('Masinop', 5, '2026-2027'),
  ('Masunurin', 5, '2026-2027'),
  ('Maunlad', 6, '2026-2027'),
  ('Matatag', 6, '2026-2027'),
  ('Malikhain', 6, '2026-2027'),
  ('Marangal', 6, '2026-2027');

-- ---------------------------------------------------------------------------
-- Sample students (capstone examples: Marwin & Jea — same guardian, different LRNs)
-- created_by will be set after teacher is seeded (see setup-db.js)
-- ---------------------------------------------------------------------------

INSERT INTO students (lrn, first_name, last_name, grade_level, section, birthday, gender, address, status) VALUES
  ('13567454', 'Marwin', 'Conde', 6, 'Malikhain', '2014-03-15', 'male', 'Pateros, Metro Manila', 'active'),
  ('1234567', 'Jea Mae', 'Bargaso', 5, 'Masigasig', '2015-07-22', 'female', 'Pateros, Metro Manila', 'active');

-- Password hashes for users are inserted by scripts/setup-db.js after bcrypt hashing.
-- Placeholder markers below are replaced programmatically:

-- __SEED_USERS__

-- Sample teacher assignment (teacher_id = 2 after admin=1, teacher=2)
-- __SEED_ASSIGNMENTS__

-- Section advisers (Stage B1, attendance per-day model). Only 2 of 23
-- sections get one — the other 21 stay NULL; assigning the rest is an
-- admin UI feature, not seed data. Keyed by login_id/section-name, not a
-- hardcoded numeric id, since exact user ids depend on insert order.
UPDATE sections SET adviser_id = (SELECT id FROM users WHERE login_id = 'TCH-001')
  WHERE grade_level = 6 AND name = 'Malikhain' AND school_year = '2026-2027';

UPDATE sections SET adviser_id = (SELECT id FROM users WHERE login_id = 'TCH-002')
  WHERE grade_level = 5 AND name = 'Masigasig' AND school_year = '2026-2027';

-- Activity log for initial admin seed
-- __SEED_ACTIVITY__
