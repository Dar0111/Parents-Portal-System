# GRADING SPEC — DepEd Order No. 015, s. 2026

Source of truth for the Grades module. Place at `docs/GRADING_SPEC.md`.

| | |
|---|---|
| Order | DepEd Order No. 015, s. 2026 |
| Title | Revised Guidelines on Classroom Assessment, Grading System, and Awards and Recognition for the K to 12 Basic Education Program |
| Signed | June 4, 2026 |
| Effective | SY 2026–2027, all public elementary and secondary schools |
| Repeals | DO 8 s. 2015 (Classroom Assessment) · DO 36 s. 2016 (Awards and Recognition) |
| Official PDF | https://www.deped.gov.ph/wp-content/uploads/DO_s2026_015r.pdf |
| Companion | DO 009 s. 2026 — Three-Term School Calendar |

> **This supersedes every earlier grading assumption in the manuscript and in
> `database/schema.sql`.** The manuscript's five-component model (Figures 17
> and 25) is wrong under this order. Three components only.

---

## 1. Scope for this school

Captain H. Francisco Elementary School covers **Grades 1–6**, which spans two
Key Stages under different grading systems in the same school year.

| Grade | Key Stage | SY 2026–2027 system |
|---|---|---|
| 1 | KS1 | **Descriptive** (letter descriptors, no numbers) |
| 2 | KS1 | Numerical + adjusted transmutation |
| 3 | KS1 | Numerical + adjusted transmutation |
| 4–6 | KS2 | Numerical + adjusted transmutation |

**The system must support both descriptive and numerical grading
simultaneously.** This is a hard requirement, not an edge case — Grade 1 uses
one and Grades 2–6 use the other, in the same term, in the same database.

### KS1 descriptive rollout (Table 12)

| School Year | Grade 1 | Grade 2 | Grade 3 |
|---|---|---|---|
| 2026–2027 | Descriptive | Numerical (adjusted transmutation) | Numerical (adjusted transmutation) |
| 2027–2028 | Descriptive | Descriptive | Numerical (zero-based) |
| 2028–2029 | Descriptive | Descriptive | Descriptive |

The system should not hardcode "Grade 1 is descriptive." Store the mode per
grade level per school year so the 2027–2028 shift is a settings change, not a
code change.

---

## 2. Component weights — keyed by LEARNING AREA, not grade level

### Grades 4–10 (KS2–KS3)

| Learning area | WWs | PTs | EXs |
|---|---|---|---|
| English, Filipino, Mathematics, Science, Araling Panlipunan, GMRC / Values Education | 20% | 50% | 30% |
| EPP / TLE, MAPEH | 20% | 60% | 20% |

### Grades 2–3 while still numerical

Same table as above for the learning areas they carry. **Makabansa uses
20% / 50% / 30%.**

### Known schema defect — must be fixed

`grade_weight_configs` is currently keyed by grade band:

```
G1–3: 30/50/20
G4–6: 40/40/20
```

Both the basis and the values are wrong. Two learners in the same Grade 5
section carry different weights depending on the subject: Mathematics is
20/50/30 while MAPEH is 20/60/20.

**Required change:** re-key the table to `subject_id`. Migration must happen
before any grade computation is written.

---

## 3. The Examinations component is composite

`EXs` is not a single score. It is built from three assessments first, then
scaled by the learning area's EX weight.

```
EX_percentage = (ST1 × 0.30) + (ST2 × 0.30) + (TE × 0.40)
EX_weighted   = EX_percentage × EX_weight_for_that_learning_area
```

- **ST1** — Summative Test 1, teacher-made
- **ST2** — Summative Test 2, teacher-made
- **TE** — Term Examination, administered in the last week of the
  Instructional Block

Item caps: Summative Test for Grades 4–6 must not exceed **20 items**;
Grades 7–10 must not exceed 25 items.

**Schema implication:** the current three-component model is correct at the top
level, but `EXs` needs three child rows. Either a `component_type` enum on the
scores table with `ST1 | ST2 | TE`, or a separate `exam_subcomponent` column.
Decide before building.

---

## 4. Grade computation chain

```
Raw Score
  → Percentage Score        (raw ÷ highest possible × 100)
  → Weighted Score          (× component weight)
  → Initial Grade (IG)      (sum of weighted scores)
  → Term Grade (TG)         (transmuted from IG — SY 2026–2027 only)
  → Final Grade (FG)        (average of Term 1, 2, 3 grades)
  → General Average (GA)    (average of Final Grades across learning areas)
```

**Formative assessments are never included.** They monitor progress and inform
instruction only. Do not store them in a way that feeds computation.

Minimum passing Final Grade: **75**.

---

## 5. Adjusted Transmutation Table — SY 2026–2027 ONLY

Transitional. An Initial Grade of 70.00 is the floor for a passing Transmuted
Grade of 75. From SY 2027–2028, KS2–KS4 move to **zero-based grading** — Term
Grades come directly from the Initial Grade with no transmutation.

| Initial Grade | TG | Initial Grade | TG |
|---|---|---|---|
| 99.50 – 100.00 | 100 | 75.90 – 77.07 | 80 |
| 98.32 – 99.49 | 99 | 74.72 – 75.89 | 79 |
| 97.14 – 98.31 | 98 | 73.54 – 74.71 | 78 |
| 95.96 – 97.13 | 97 | 72.36 – 73.53 | 77 |
| 94.78 – 95.95 | 96 | 71.18 – 72.35 | 76 |
| 93.60 – 94.77 | 95 | 70.00 – 71.17 | 75 |
| 92.42 – 93.59 | 94 | 65.34 – 69.99 | 74 |
| 91.24 – 92.41 | 93 | 60.67 – 65.33 | 73 |
| 90.06 – 91.23 | 92 | 56.01 – 60.66 | 72 |
| 88.88 – 90.05 | 91 | 51.34 – 56.00 | 71 |
| 87.70 – 88.87 | 90 | 46.67 – 51.33 | 70 |
| 86.52 – 87.69 | 89 | 42.01 – 46.66 | 69 |
| 85.34 – 86.51 | 88 | 37.34 – 42.00 | 68 |
| 84.16 – 85.33 | 87 | 32.68 – 37.33 | 67 |
| 82.98 – 84.15 | 86 | 28.01 – 32.67 | 66 |
| 81.80 – 82.97 | 85 | 23.35 – 28.00 | 65 |
| 80.62 – 81.79 | 84 | 18.68 – 23.34 | 64 |
| 79.44 – 80.61 | 83 | 14.01 – 18.67 | 63 |
| 78.26 – 79.43 | 82 | 9.35 – 14.00 | 62 |
| 77.08 – 78.25 | 81 | 4.68 – 9.34 | 61 |
| | | 0.00 – 4.67 | 60 |

**Implementation note:** store this as a seeded lookup table with
`ig_min`, `ig_max`, `transmuted_grade`, and a `school_year` column — not as a
hardcoded array. It is explicitly temporary and disappears next school year.
Lookup must be inclusive on both bounds and handle the exact boundary values
(70.00 → 75, not 74).

---

## 6. Descriptive grading — Grade 1 (and later Grades 2–3)

### Grades 1–3 descriptors (Table 8)

| Letter | Descriptor | Filipino |
|---|---|---|
| A | Advancing | Namumukod-tangi |
| B | Benchmarking | Napamamalas |
| C | Connecting | Natutungo |
| D | Developing | Napauunlad |
| E | Emerging | Nagsisimula |

### Kindergarten descriptors (Table 7) — not needed here, for reference

| Letter | Descriptor | Filipino |
|---|---|---|
| CO | Consistent | Palagiang Naipapakita |
| DV | Developing | Umuusbong |
| BG | Beginning | Nagsisimula |

**Schema implication:** Grade 1 records carry a letter, not a number. The
`grades` table needs either a nullable `descriptive_grade ENUM('A','B','C','D','E')`
alongside the numeric columns, or a `grading_mode` discriminator. Parent-facing
screens must render the descriptor and its meaning, never a number, for Grade 1.

---

## 6b. Qualitative descriptors for numerical grades (Table 11)

Confirmed against the school's own SF9 Learner's Performance Report.

| Grading Scale | Descriptor | Remarks |
|---|---|---|
| 90–100 | Advancing | Passed |
| 80–89 | Benchmarking | Passed |
| 75–79 | Connecting | Passed |
| 65–74 | Developing | Failed |
| 0–64 | Emerging | Failed |

The parent dashboard should show the numeric grade **and** the descriptor —
that is what the parent sees on the printed report card.

---

## 6c. Learning areas per grade level

Taken from the school's posted class programs, SY 2026–2027. These differ by
grade level — seeding one flat subject list for all grades is wrong.

| Grade | Learning areas |
|---|---|
| 1 | Makabansa, Mathematics, GMRC, Language, Reading |
| 2 | English, GMRC, Makabansa, Mathematics, Filipino |
| 3 | GMRC, English, Science, Mathematics, Filipino, Makabansa |
| 5 | English, Filipino, Araling Panlipunan, Science, GMRC/Values, EPP, Mathematics, MAPEH |
| 6 | English, Filipino, Araling Panlipunan, Science, ESP, Mathematics, MAPEH, TLE |

Grade 4 was not photographed. Assume the intermediate set matching the SF9
printed rows — English, Mathematics, Filipino, Araling Panlipunan, GMRC,
Science, MAPEH, EPP — but **confirm before seeding.**

Naming shifts to watch:
- `Makabansa` (G1–G3) becomes `Araling Panlipunan` (G4–G6)
- `GMRC` (G1–G5) appears as `ESP` in the Grade 6 program
- `EPP` (G5) becomes `TLE` (G6)

`Homeroom Guidance` and `ARAL Program` appear on class programs but not on the
report card. They are not graded — exclude from `subjects`.

---

## 6d. Departmentalization by grade level

| Grades | Structure |
|---|---|
| 1–2 | One teacher handles all learning areas |
| 3 | Mixed — dedicated Science, Filipino, Makabansa teachers |
| 4–6 | Fully departmentalized |

`teacher_assignments` handles all three. Note that a Grade 1 adviser needs one
assignment row per subject, not one row total.

---

## 7. Awards and recognition

- **Key Stage 1 (Grades 1–3):** no academic awards. Character Traits Awards
  only, recognising positive learning behaviours. This avoids early competition
  and labeling.
- **Grades 4–12:** Academic Excellence Award requires a General Average of
  **90 or higher**, **no Final Grade below 80** in any learning area, and no
  derogatory or disciplinary records.
- Awardees are listed **alphabetically**, not ranked.

Awards are out of scope for the current build but affect what the parent
dashboard may display. Do not build a ranking view.

---

## 8. Term structure (from DO 009 s. 2026)

| Term | Dates | Class days |
|---|---|---|
| Term 1 | June 8 – September 15, 2026 | 69 |
| Term 2 | September 16 – December 18, 2026 | 65 |
| Term 3 | January 4 – April 8, 2027 | 67 |
| | **Total** | **201** |

Each term contains an Opening Block (Term 1 only), an Instructional Block, and
a two-week End-of-Term Block where grades are computed and report cards are
distributed.

**Schema implication:** any `quarter` column with values 1–4 must become `term`
with values 1–3.

---

## 9. Open items still requiring school confirmation

1. **Grade 4 learning areas** — not captured during the visit.
2. **Is the school actually implementing DO 015 this year?** Mandatory for
   public schools, but confirm Grade 1 is on descriptive grading in practice.
3. **Attendance rate formula** — does Excused count as present? Is Late
   penalised? The SF9 records monthly Class Days / Days Present / Days Absent,
   suggesting present ÷ class days, but the treatment of Late and Excused is
   unstated.

### Resolved by the school visit

- **Attendance does NOT feed grade computation.** The SF9 carries attendance as
  a separate section on the reverse side, distinct from Learning Progress. No
  linkage needed between the attendance and grades tables.
- **Attendance is per DAY, not per subject.** The SF9 records monthly totals of
  Class Days, Days Present, Days Absent.

---

## 10. Build impact summary

| Item | Status |
|---|---|
| Three terms, not four quarters | Confirmed — schema change |
| Three components, not five | Confirmed — manuscript is wrong |
| Weights keyed by learning area | Confirmed — schema defect, must re-key |
| EX is composite (ST1/ST2/TE) | New requirement — needs sub-components |
| Grade 1 descriptive, 2–6 numerical | New requirement — dual mode |
| Adjusted transmutation table | New requirement — seeded lookup |
| Qualitative descriptors on report card | New requirement — display layer |
| Subjects differ per grade level | New requirement — seed carefully |
| Attendance does not feed grades | Confirmed — no linkage needed |
| Passing grade 75 | Unchanged |
| Zero-based grading SY 2027–2028 | Future — design so transmutation is removable |

---

*Compiled September 2026 from DO 015 s. 2026, DO 009 s. 2026, and documents
photographed during the school visit. Weight tables and the transmutation table
are transcribed from the published order — verify each value against the
official PDF during implementation.*
