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

-- The school's own details, confirmed 2026-09-22 (CLAUDE.md's front matter is
-- the one place they are recorded; this seeds them). "– Main" is part of the
-- official name and prints on every masthead that reads school_name. The
-- phone is a PHONE number, not the School ID. The email, phone and Facebook
-- page are as the school's own Facebook page shows them (2026-09-26). A live
-- database gets these through Admin → Settings or a PATCH through the API,
-- not by re-seeding.
--
-- NO current_term ROW (pre-Stage-5 #7, 2026-09-26): the term is derived from
-- today's date by server/utils/schoolCalendar.js, whose SCHOOL_YEAR must
-- equal academic_year here — test:school-calendar checks both facts.
INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('school_name', 'Captain H. Francisco Elementary School – Main'),
  ('school_address', 'P. Rosales St., Sta. Ana, Pateros, Metro Manila'),
  ('academic_year', '2026-2027'),
  ('logo_url', ''),
  ('school_id', '136893'),
  ('school_email', '136893@deped.gov.ph'),
  -- The 8-digit Metro Manila number with its area code, as the school's own
  -- Facebook page shows it (2026-09-26); the validator strips the spaces,
  -- dashes and parentheses and the About page dials it as tel:0283506114.
  ('school_phone', '(02) 8350-6114'),
  ('facebook_page', 'https://www.facebook.com/136893Capt.hipolitofrancisco.elemsch.main');

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
-- display_order is the school's PRINTED order, 1..N (CR3a, 2026-09-22).
-- Grade 1's is PROVISIONAL — it is the class program, a timetable, not a
-- report card, and is carried over exactly as the deleted client constant
-- had it so Nino's card does not change. Grades 2 and 3 pass NULL on
-- purpose: no printed order is known for them and every reader falls back to
-- name ASC. Grades 4-6 share one order per the Key Stage 2 SF9. Changing an
-- order is an UPDATE, not a code change; keep this in step with
-- scripts/migrate-subject-display-order.js, which applies the same map to a
-- live database.
INSERT INTO subjects (name, grade_level, display_order) VALUES
  ('Makabansa', 1, 1),
  ('Mathematics', 1, 2),
  ('GMRC', 1, 3),
  ('Language', 1, 5),
  -- "Reading and Literacy", not "Reading" — the school's own name for the
  -- learning area. Corrected 2026-09-22; live databases were migrated by
  -- scripts/migrate-reading-and-literacy.js, which RENAMES the row rather
  -- than replacing it (a DELETE would cascade Nino's two seeded letters
  -- away). client/src/pages/parent/ReportCard.jsx's PRINTED_ORDER[1] matches
  -- on this string — change both together.
  ('Reading and Literacy', 1, 4);

-- Grade 2 — printed order CONFIRMED by the school on 2026-09-23 (seeded
-- pre-Stage-5 #5a). The INSERT order is historical; display_order decides.
INSERT INTO subjects (name, grade_level, display_order) VALUES
  ('English', 2, 4),
  ('GMRC', 2, 3),
  ('Makabansa', 2, 1),
  ('Mathematics', 2, 2),
  ('Filipino', 2, 5);

-- Grade 3 — printed order CONFIRMED by the school on 2026-09-23.
INSERT INTO subjects (name, grade_level, display_order) VALUES
  ('GMRC', 3, 6),
  ('English', 3, 1),
  ('Science', 3, 3),
  ('Mathematics', 3, 2),
  ('Filipino', 3, 4),
  ('Makabansa', 3, 5);

-- Grade 4 — INFERRED, see the note above. Matches the SF9's eight
-- intermediate-level rows and Grade 5's photographed program exactly.
INSERT INTO subjects (name, grade_level, display_order) VALUES
  ('English', 4, 1),
  ('Mathematics', 4, 2),
  ('Filipino', 4, 3),
  ('Araling Panlipunan', 4, 4),
  ('GMRC', 4, 5),
  ('Science', 4, 6),
  ('MAPEH', 4, 7),
  ('EPP', 4, 8);

-- Grade 5 — the INSERT order below is historical and no longer decides
-- anything; display_order does. Left as-is rather than resorted, so the diff
-- of this dispatch shows only the added column.
INSERT INTO subjects (name, grade_level, display_order) VALUES
  ('English', 5, 1),
  ('Filipino', 5, 3),
  ('Araling Panlipunan', 5, 4),
  ('Science', 5, 6),
  ('GMRC', 5, 5),
  ('EPP', 5, 8),
  ('Mathematics', 5, 2),
  ('MAPEH', 5, 7);

-- Grade 6 — SF9 names (GMRC, EPP), not the class-program names (ESP, TLE)
-- for the same two learning areas. See the naming note above.
INSERT INTO subjects (name, grade_level, display_order) VALUES
  ('English', 6, 1),
  ('Filipino', 6, 3),
  ('Araling Panlipunan', 6, 4),
  ('Science', 6, 6),
  ('GMRC', 6, 5),
  ('Mathematics', 6, 2),
  ('MAPEH', 6, 7),
  ('EPP', 6, 8);

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
-- EVERY GRADE LEVEL GETS WEIGHT ROWS, including descriptive ones (2026-09-22).
--
-- This REVERSES the rule that stood here until then, and the reversal is the
-- school's, not a refactor. The old rule excluded Grade 1 by JOINing against
-- grading_mode_configs (mode = 'numerical'), on the reasoning that "no code
-- path can ever read a weight row for a descriptive-mode grade, so seeding
-- one would be dead data implying a promise the system doesn't keep."
--
-- That reasoning was sound and is now simply false. GRADING_SPEC §6a records
-- the school's answer: a Grade 1 letter is COMPUTED, from WW 30 / PT 50 /
-- Summative 20 banded on the raw weighted score. recomputeGrade reads the
-- weight row for a descriptive grade exactly as it does for a numerical one —
-- the promise is kept, so the data is not dead.
--
-- Grade 1 is 30/50/20; the school has not stated per-subject variation at
-- Key Stage 1, so all five learning areas share it. Grades 2-6 keep DO 015's
-- split: core 20/50/30, MAPEH and EPP 20/60/20. `ex_weight` holds the
-- SUMMATIVE weight for Grade 1 — the column keeps its numerical name because
-- the three ex_* score columns do too (see the grades table).
--
-- grading_mode_configs ALONE now decides how a weight row is used, never
-- whether one exists. That is the simpler rule and it survives the KS1
-- rollout: when Grade 2 turns descriptive in SY 2027-2028, its weights stop
-- being transmuted and start being banded, and NOTHING HERE CHANGES. Under
-- the old JOIN that same rollout would have silently deleted Grade 2's weight
-- rows on the next reseed and broken every Grade 2 grade.
-- ---------------------------------------------------------------------------

INSERT INTO grade_weight_configs (subject_id, school_year, ww_weight, pt_weight, ex_weight)
SELECT s.id, '2026-2027',
       CASE WHEN s.grade_level = 1 THEN 30.00 ELSE 20.00 END,
       CASE WHEN s.grade_level = 1 THEN 50.00
            WHEN s.name IN ('MAPEH', 'EPP') THEN 60.00 ELSE 50.00 END,
       CASE WHEN s.grade_level = 1 THEN 20.00
            WHEN s.name IN ('MAPEH', 'EPP') THEN 20.00 ELSE 30.00 END
FROM subjects s;

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
  ('1234567', 'Jea Mae', 'Bargaso', 5, 'Masigasig', '2015-07-22', 'female', 'Pateros, Metro Manila', 'active'),
  -- Grade 1 descriptive-path fixture (demo 2026-09-18). Fictional name,
  -- not a real learner. Section is Mabait, NOT Matipid: test-grades-flows.js
  -- creates a throwaway Grade 1 student in Matipid every run and deletes it,
  -- so the demo student must not share that section.
  ('1090001', 'Nino', 'Alcantara', 1, 'Mabait', '2019-08-12', 'male', 'Pateros, Metro Manila', 'active'),
  -- THE BROWSER-FIXTURE LEARNER (pre-Stage-5 #3b, 2026-09-25). Nobody's
  -- test target: every suite that needs a Grade 6 - Malikhain learner uses
  -- Marwin, so browser-check fixtures (grades, attendance, letters) go on
  -- this learner and the two protocols stop excluding each other
  -- (docs/KNOWN_ISSUES.md, "mutually exclusive on student 1"). Same section
  -- as Marwin on purpose — TCH-001 must be able to encode and review.
  -- "Halimbawa" is Filipino for "example": plainly fictional. 12-digit LRN.
  -- Mirrored by scripts/migrate-fixture-learner.js for a live database.
  ('136893260001', 'Tala', 'Halimbawa', 6, 'Malikhain', '2014-05-05', 'female', 'Pateros, Metro Manila', 'active');

-- Password hashes for users are inserted by scripts/setup-db.js after bcrypt hashing.
-- Placeholder markers below are replaced programmatically:

-- __SEED_USERS__

-- Sample teacher assignment (teacher_id = 2 after admin=1, teacher=2)
-- __SEED_ASSIGNMENTS__

-- Section advisers. Three of 23 sections get one — the rest stay NULL;
-- assigning those is an admin UI feature, not seed data. Keyed by
-- login_id/section-name, not a hardcoded numeric id. See CLAUDE.md
-- CURRENT STATE → Seeded baseline for the live counts.
UPDATE sections SET adviser_id = (SELECT id FROM users WHERE login_id = 'TCH-001')
  WHERE grade_level = 6 AND name = 'Malikhain' AND school_year = '2026-2027';

UPDATE sections SET adviser_id = (SELECT id FROM users WHERE login_id = 'TCH-002')
  WHERE grade_level = 5 AND name = 'Masigasig' AND school_year = '2026-2027';

UPDATE sections SET adviser_id = (SELECT id FROM users WHERE login_id = 'TCH-003')
  WHERE grade_level = 1 AND name = 'Mabait' AND school_year = '2026-2027';

-- ---------------------------------------------------------------------------
-- Grade 1 partial descriptive card for Nino (LRN 1090001).
--
-- These letters are ILLUSTRATIVE FIXTURE DATA, not a computed result.
-- Grade 1 as a manual A-E judgment is an ASSUMPTION (DO 015 defines no
-- IG-to-letter mapping). Nothing in this INSERT derives a letter from
-- scores; if the school later says a computation feeds the letter, one
-- write handler changes (PATCH /:id/descriptive), not this seed and not
-- the schema.
--
-- Partial on purpose so Parent → Grades can show three states on one
-- screen: letters (Mathematics, all three terms), Pending (Reading term
-- 3 blank; Makabansa/GMRC/Language untouched), and N/A (Final Grade and
-- General Average, inapplicable in descriptive mode).
-- ---------------------------------------------------------------------------
INSERT INTO grades (student_id, subject_id, term, school_year, descriptive_grade)
SELECT st.id, s.id, v.term, '2026-2027', v.letter
FROM students st
JOIN subjects s ON s.grade_level = 1
JOIN (
  SELECT 'Mathematics' AS subject_name, 1 AS term, 'A' AS letter
  UNION ALL SELECT 'Mathematics', 2, 'B'
  UNION ALL SELECT 'Mathematics', 3, 'C'
  UNION ALL SELECT 'Reading and Literacy', 1, 'D'
  UNION ALL SELECT 'Reading and Literacy', 2, 'E'
) v ON v.subject_name = s.name
WHERE st.lrn = '1090001';

-- Activity log for initial admin seed
-- __SEED_ACTIVITY__
