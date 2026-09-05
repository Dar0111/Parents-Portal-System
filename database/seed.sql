-- Captain H. Francisco Elementary School — Parent's Portal System
-- Seed data (v2.0)
-- Default passwords (hashed at setup time via scripts/setup-db.js):
--   Admin:   ADMIN001  / Admin@2026
--   Teacher: TCH-001   / Teacher@2026
--   Parent:  LRN login / Parent@2026 (after approval)

USE parents_portal;

-- ---------------------------------------------------------------------------
-- System settings
-- ---------------------------------------------------------------------------

INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('school_name', 'Captain H. Francisco Elementary School'),
  ('school_address', 'Captain H. Francisco Elementary School, Philippines'),
  ('academic_year', '2026-2027'),
  ('current_term', '1'),
  ('logo_url', '');

-- ---------------------------------------------------------------------------
-- DepEd subjects per grade level (G1-G6) — Stage G1b (2026-09-06). Real
-- per-grade learning areas, replacing G1a's uniform 8-subject placeholder
-- list. Transcribed from class programs photographed at the school (SY
-- 2026-2027) and the school's own SF9 report card — see
-- docs/GRADING_SPEC.md section 6c, which this transcription matches
-- verbatim.
--
-- GRADE 4 IS INFERRED, NOT CONFIRMED. It was not photographed during the
-- school visit. Basis for the inference: the SF9 report card prints
-- exactly eight rows (English, Mathematics, Filipino, Araling Panlipunan,
-- GMRC, Science, MAPEH, EPP) and is used for the whole intermediate level
-- (Grades 4-6); Grade 5's photographed program matches those same eight
-- exactly. If the school later says Grade 4 differs, this is the row to
-- revisit — do not treat it as equally solid as Grades 1, 2, 3, 5, and 6.
--
-- NAMING NOTE: Grade 6's class program shows "ESP" and "TLE" where the
-- SF9 shows "GMRC" and "EPP" for the identical learning areas. Seeded
-- here under the SF9 names (GMRC, EPP) — that is what the parent actually
-- sees on the printed report card. ESP and TLE are the same subjects
-- under the class-program naming, recorded here so the alternates are
-- findable, not silently dropped.
--
-- Homeroom Guidance and ARAL Program appear on class programs but not on
-- the report card — they are not graded, and are deliberately excluded.
-- ---------------------------------------------------------------------------

-- Grade 1
INSERT INTO subjects (name, grade_level) VALUES
  ('Makabansa', 1),
  ('Mathematics', 1),
  ('GMRC', 1),
  ('Language', 1),
  ('Reading', 1);

-- Grade 2
INSERT INTO subjects (name, grade_level) VALUES
  ('English', 2),
  ('GMRC', 2),
  ('Makabansa', 2),
  ('Mathematics', 2),
  ('Filipino', 2);

-- Grade 3
INSERT INTO subjects (name, grade_level) VALUES
  ('GMRC', 3),
  ('English', 3),
  ('Science', 3),
  ('Mathematics', 3),
  ('Filipino', 3),
  ('Makabansa', 3);

-- Grade 4 — INFERRED, see the note above. Matches the SF9's eight
-- intermediate-level rows and Grade 5's photographed program exactly.
INSERT INTO subjects (name, grade_level) VALUES
  ('English', 4),
  ('Mathematics', 4),
  ('Filipino', 4),
  ('Araling Panlipunan', 4),
  ('GMRC', 4),
  ('Science', 4),
  ('MAPEH', 4),
  ('EPP', 4);

-- Grade 5
INSERT INTO subjects (name, grade_level) VALUES
  ('English', 5),
  ('Filipino', 5),
  ('Araling Panlipunan', 5),
  ('Science', 5),
  ('GMRC', 5),
  ('EPP', 5),
  ('Mathematics', 5),
  ('MAPEH', 5);

-- Grade 6 — SF9 names (GMRC, EPP), not the class-program names (ESP, TLE)
-- for the same two learning areas. See the naming note above.
INSERT INTO subjects (name, grade_level) VALUES
  ('English', 6),
  ('Filipino', 6),
  ('Araling Panlipunan', 6),
  ('Science', 6),
  ('GMRC', 6),
  ('Mathematics', 6),
  ('MAPEH', 6),
  ('EPP', 6);

-- ---------------------------------------------------------------------------
-- Grading mode per grade level, SY 2026-2027 (Table 12, DO 015 s.2026) —
-- Grade 1 descriptive, Grades 2-6 numerical. Moved ahead of grade_weight_configs
-- below (Stage G1b) — the weight seed now JOINs against this table to
-- decide which grade levels get weight rows at all.
-- ---------------------------------------------------------------------------

INSERT INTO grading_mode_configs (grade_level, school_year, mode) VALUES
  (1, '2026-2027', 'descriptive'),
  (2, '2026-2027', 'numerical'),
  (3, '2026-2027', 'numerical'),
  (4, '2026-2027', 'numerical'),
  (5, '2026-2027', 'numerical'),
  (6, '2026-2027', 'numerical');

-- ---------------------------------------------------------------------------
-- Grade weight configs (DO 015 s.2026) — keyed by subject_id, not grade
-- band (see schema.sql comment on grade_weight_configs). Core learning
-- areas are 20/50/30; EPP and MAPEH are 20/60/20.
--
-- Stage G1b (2026-09-06): re-seeded against the real subjects above,
-- replacing G1a's provisional seed against the placeholder list.
--
-- Grade 1 deliberately gets NO weight rows at all — enforced here by the
-- JOIN against grading_mode_configs (mode = 'numerical'), not by a
-- hardcoded "WHERE grade_level >= 2". No code path can ever read a
-- weight row for a descriptive-mode grade (routes/grades.js rejects
-- numerical writes against one before recomputeGrade() ever runs), so
-- seeding one would be dead data implying a promise the system doesn't
-- keep. The JOIN form is deliberate, not the simpler grade_level
-- comparison: in SY 2027-2028 Grade 2 also becomes descriptive per the
-- KS1 rollout (see grading_mode_configs's own comment) — a hardcoded
-- ">= 2" would not fail loudly then, it would quietly reseed weight rows
-- for a now-descriptive grade with nothing to catch it. Changing one row
-- in grading_mode_configs is what should drive this, the same way the
-- transmutation table's disappearance is driven by data absence, not a
-- hardcoded year — see that table's own comment for the same principle
-- applied a second time in this file.
-- ---------------------------------------------------------------------------

INSERT INTO grade_weight_configs (subject_id, school_year, ww_weight, pt_weight, ex_weight)
SELECT s.id, '2026-2027', 20.00,
       CASE WHEN s.name IN ('MAPEH', 'EPP') THEN 60.00 ELSE 50.00 END,
       CASE WHEN s.name IN ('MAPEH', 'EPP') THEN 20.00 ELSE 30.00 END
FROM subjects s
JOIN grading_mode_configs gmc
  ON gmc.grade_level = s.grade_level AND gmc.school_year = '2026-2027'
WHERE gmc.mode = 'numerical';

-- ---------------------------------------------------------------------------
-- Adjusted Transmutation Table, SY 2026-2027 ONLY (DO 015 s.2026, Section
-- 5). 41 rows, transcribed verbatim from docs/GRADING_SPEC.md — verify
-- against the official PDF if this table is ever re-transcribed.
-- ---------------------------------------------------------------------------

INSERT INTO transmutation_table (school_year, ig_min, ig_max, transmuted_grade) VALUES
  ('2026-2027', 99.50, 100.00, 100),
  ('2026-2027', 98.32, 99.49, 99),
  ('2026-2027', 97.14, 98.31, 98),
  ('2026-2027', 95.96, 97.13, 97),
  ('2026-2027', 94.78, 95.95, 96),
  ('2026-2027', 93.60, 94.77, 95),
  ('2026-2027', 92.42, 93.59, 94),
  ('2026-2027', 91.24, 92.41, 93),
  ('2026-2027', 90.06, 91.23, 92),
  ('2026-2027', 88.88, 90.05, 91),
  ('2026-2027', 87.70, 88.87, 90),
  ('2026-2027', 86.52, 87.69, 89),
  ('2026-2027', 85.34, 86.51, 88),
  ('2026-2027', 84.16, 85.33, 87),
  ('2026-2027', 82.98, 84.15, 86),
  ('2026-2027', 81.80, 82.97, 85),
  ('2026-2027', 80.62, 81.79, 84),
  ('2026-2027', 79.44, 80.61, 83),
  ('2026-2027', 78.26, 79.43, 82),
  ('2026-2027', 77.08, 78.25, 81),
  ('2026-2027', 75.90, 77.07, 80),
  ('2026-2027', 74.72, 75.89, 79),
  ('2026-2027', 73.54, 74.71, 78),
  ('2026-2027', 72.36, 73.53, 77),
  ('2026-2027', 71.18, 72.35, 76),
  ('2026-2027', 70.00, 71.17, 75),
  ('2026-2027', 65.34, 69.99, 74),
  ('2026-2027', 60.67, 65.33, 73),
  ('2026-2027', 56.01, 60.66, 72),
  ('2026-2027', 51.34, 56.00, 71),
  ('2026-2027', 46.67, 51.33, 70),
  ('2026-2027', 42.01, 46.66, 69),
  ('2026-2027', 37.34, 42.00, 68),
  ('2026-2027', 32.68, 37.33, 67),
  ('2026-2027', 28.01, 32.67, 66),
  ('2026-2027', 23.35, 28.00, 65),
  ('2026-2027', 18.68, 23.34, 64),
  ('2026-2027', 14.01, 18.67, 63),
  ('2026-2027', 9.35, 14.00, 62),
  ('2026-2027', 4.68, 9.34, 61),
  ('2026-2027', 0.00, 4.67, 60);

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
