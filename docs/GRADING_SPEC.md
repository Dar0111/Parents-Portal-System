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

### Known schema defect — FIXED in Stage G1a (2026-09-05)

> **READ THIS BEFORE QUOTING THE NUMBERS BELOW.** The block that follows is
> the **DISCARDED** grade-band scheme, kept as the record of what was wrong.
> It is **NOT** the Grade 1 rule, even though `30/50/20` happens to match the
> Grade 1 weights confirmed on 2026-09-22 (§6a). The resemblance is a
> coincidence and has already invited one misreading. The live weights are
> §2's table, keyed by learning area, and are verified correct for all 40
> seeded subjects.

`grade_weight_configs` **was** keyed by grade band:

```
G1–3: 30/50/20          <- DISCARDED. Not the Grade 1 rule; see §6a.
G4–6: 40/40/20          <- DISCARDED.
```

Both the basis and the values were wrong. Two learners in the same Grade 5
section carry different weights depending on the subject: Mathematics is
20/50/30 while MAPEH is 20/60/20.

**Done:** the table is keyed `(subject_id, school_year)` with a `CHECK` that
the three weights sum to 100.00.

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

### 4a. Rounding — two precisions, confirmed against the school's sheet (2026-09-22)

| Value | Precision | How |
|---|---|---|
| Percentage, Weighted, Initial Grade | **2 decimals**, half-up | `roundTo2` at every stored step |
| **Term Grade** | **whole** | `transmutation_table.transmuted_grade` is an `INT` |
| **Final Grade** | **whole**, half-up | `roundToWhole((t1+t2+t3)/3)` |
| **General Average** (final and per term) | **2 decimals**, half-up | `roundTo2`, over the **already-rounded** grades |

**The General Average averages the ROUNDED subject grades, and that is not an
approximation.** The school's sheet adds eight whole Final Grades and prints
721 / 8 = 90.125 as **90.13** — it adds up the numbers a parent can see.
Averaging unrounded finals would produce a figure that disagrees with the
paper.

**Half-up at both precisions**, with a `Number.EPSILON` nudge, because a value
mathematically on a `.5` or `.005` boundary can be stored just below it in
IEEE 754 and would otherwise round down. **Never `toFixed`** — it rounds on
the binary value, is inconsistent across inputs (`(1.005).toFixed(2)` is
`"1.00"`), and returns a string.

**A Term Grade is whole only while the transmutation table has rows.** From
SY 2027-2028 (§5) a term grade inherits the Initial Grade's two decimals. No
code rounds it at that point, and the display must show it as stored — see
`docs/KNOWN_ISSUES.md`.

**Display follows storage, never the reverse:** the client renders a whole
number as whole and a non-integral one as-is, and never rounds for looks
(`docs/FRONTEND_CONVENTIONS.md` §3).

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

## 6a. How the Grade 1 letter is produced — DECIDED 2026-09-22, **BUILT 2026-09-22**

> **Status: BUILT.** Server and client both shipped on 2026-09-22 and were
> browser-checked. `PATCH /api/grades/:id/descriptive` is **retired** — a
> letter can no longer be set by hand at all — and the four score writes
> accept a Grade 1 row, so the letter comes out of the same endpoints Grades
> 2–6 use. A teacher encodes Written Works, Performance Tasks and three
> Summative parts; the server computes and stores the letter.

**This is the SCHOOL's practice, not DO 015.** DO 015 defines no
Initial-Grade-to-letter mapping, and descriptive grading exists precisely to
avoid numerical labelling in Key Stage 1. The school nevertheless computes the
letter, and these are its rules.

**Weights — Grade 1, every learning area:**

| Component | Weight |
|---|---|
| Written Works | **30%** |
| Performance Tasks | **50%** |
| Summative | **20%** |

Note the coincidence and do not be misled by it: `30/50/20` is also the
discarded grade-band scheme quoted in §2's defect block. These are unrelated.

**Summative is composite, the same shape as EX in Grades 2–6:**
**ST1 30% · ST2 30% · TE 40%.**

**The weighted score is banded RAW — there is no transmutation.** Grade 1 never
touches `transmutation_table`.

| Raw weighted score | Letter |
|---|---|
| 90 – 100 | **A** — Advancing |
| 80 – 89 | **B** — Benchmarking |
| 75 – 79 | **C** — Connecting |
| 65 – 74 | **D** — Developing |
| below 65 | **E** — Emerging |

The same five bands as Table 11 (§6b), which is why the five English words are
identical in both tables — one vocabulary, two uses. **As built they are
literally one table**: `utils/gradeComputation.js` holds a single `BANDS`
array behind both `bandForScore()` (the letter) and `qualitativeDescriptor()`
(the words), and a unit test asserts the two agree at every whole score from
0 to 100, so the two ladders cannot drift apart.

### The rounding a band sits on — read this before disputing a boundary

**An Initial Grade is the sum of three weighted parts, and each part is stored
at two decimals before they are added.** So a component percentage just below
a boundary can round its way over one:

> WW/PT/Summative all at **89.99%** → `0.30(89.99)=26.997`,
> `0.50(89.99)=44.995`, `0.20(89.99)=17.998` → stored as
> **27.00 + 45.00 + 18.00 = 90.00** → banded **A**, not B.

**This is not a Grade 1 rule and not a defect.** It is the same arithmetic
every numerical grade has always used, at every grade level — the Initial
Grade behind a Grade 6 transmutation rounds identically. The practical
consequence is only that nothing can be probed closer than the second decimal
of the *weighted* parts; `test-grades-flows.js` samples `x.9` rather than
`x.99` for exactly this reason, and says so at the assertion.

**A Final letter exists:** average the three terms' **raw weighted scores**,
then band that average. **Only when all three terms are recorded** — the same
NULL-until-complete rule as every other computed value; never a running
average of whatever exists so far. Band the averaged score, not the letters.

**No General Average for Grade 1**, per §7 — Key Stage 1 has no GA-based
awards. The parent card says so in a sentence rather than printing N/A cells.

**Parents see letters only.** The raw weighted score, the component weights
and the band arithmetic are the teacher's; the card shows `A Advancing` and
the legend. This matches the existing rule for numerical grades, where the
Initial Grade is deliberately not shown.

**Nino's five seeded rows have no components and are kept as legacy.** They
were entered as letters before any computation existed, and a computed path
must tolerate a letter with no inputs rather than back-filling invented
assessment data — that is honestly what a transitional row looks like.

**What that means on screen, and it is visible on the demo card:** a legacy
subject with all three letters recorded still shows **no Final letter**,
because the Final averages the three terms' Initial Grades and there are none
behind a typed letter. Nino's Mathematics reads A / B / C with a blank Final,
and that is correct, not a bug. The breakdown modal on such a row says the
grade predates kept scores rather than claiming the grade level has none.

### What it touched, as built

Each line below was a prediction in the DECIDED version of this section; all
five held, and the resolution is recorded rather than the guess.

- **`preflightGradeWrite`** accepts a *score-bearing* mode — numerical and
  descriptive both — and **returns the mode** to its caller, so
  `recomputeGrade` forks on what preflight already read instead of
  re-querying.
- **`grade_components.type` stayed `ENUM('WW','PT')`.** Summative reuses the
  existing `ex_st1`/`ex_st2`/`ex_te` columns with `exPercentage`'s 30/30/40 —
  the ENUM was **not** extended. Only the heading differs on screen, because
  Summative is the school's word for Key Stage 1.
- **`grade_weight_configs` holds the Grade 1 rows unchanged** at 30/50/20.
  The seed's `JOIN grading_mode_configs WHERE mode = 'numerical'` was the
  blocker and is gone: the seed now writes a weight row for **every** grade
  level and `grading_mode_configs` alone decides how the weights are used.
  Live databases get the five rows from `scripts/migrate-grade1-weights.js`,
  which **aborts rather than overwrite** a row carrying different weights.
- **`recomputeGrade` has a descriptive branch** that bands the raw Initial
  Grade with no transmutation, writes `descriptive_grade` **and**
  `initial_grade`, and **throws** if `term_grade` ever became non-null on a
  descriptive row — the dual-mode invariant is asserted in code, not just
  documented.
- **`PATCH /:id/descriptive` was retired rather than left in place.** One
  write path for every grade level; a stored legacy letter keeps its value and
  is simply no longer editable through the API.

**Suite baselines after this work:** `test:grades` 212 · `test:grade-computation`
68 · `test:notifications` 124 · `test:dashboard` 77 · `verify-grading-seed` 34 ·
`test:assignments` 56 · `test:grading-modes` 13.

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

## 6d-i. The printed order of learning areas — seeded, not guessed (CR3a, 2026-09-22)

Until CR3a the order subjects print in lived in a **client constant** on the
parent report card. It is now `subjects.display_order`, seeded and migrated,
so **changing an order is an `UPDATE` rather than a code change** — and Expo,
which cannot import a client constant, gets it in the payload.

| Grade | Order | Confidence |
|---|---|---|
| **4, 5, 6** | English · Mathematics · Filipino · Araling Panlipunan · GMRC · Science · MAPEH · EPP | The Key Stage 2 SF9's eight intermediate rows (§6c). **ONE transcription applied to all three grade levels** — not three independent observations. **Confirm at the next school visit.** |
| **1** | Makabansa · Mathematics · GMRC · Reading and Literacy · Language | **PROVISIONAL.** This is the Grade 1 **class program** — a timetable, not a report card. It is used because an observed school artifact beats alphabetical-by-accident, and it was carried over exactly so the seeded card did not change. **The school has never given a printed order for Key Stage 1.** |
| **2** | Makabansa · Mathematics · GMRC · English · Filipino | **CONFIRMED by the school, 2026-09-23; seeded 2026-09-26 (pre-Stage-5 #5a).** Until then both rows were `NULL` → `name ASC` on purpose — the honest value while no printed order was known, with `verify-grading-seed` asserting the NULL so a guess would fail first. The school's answer is not a guess; the same script now asserts this order. |
| **3** | English · Mathematics · Science · Filipino · Makabansa · GMRC | **CONFIRMED by the school, 2026-09-23; seeded 2026-09-26.** As above. |

**A correction worth recording:** an earlier note in this repo said Grades 2,
3 **and 5** fell back to alphabetical. Grade 5 never did — it carries the Key
Stage 2 order like 4 and 6, and always had it in the client constant. The
error was in a comment beside the data, not the data.

---

## 6e. Assessment slots — the columns of a class record (CR1/CR2, 2026-09-22)

DO 015 fixes the three components (WW / PT / EX) and their weights, but it
says nothing about how many written works a class sits or what each is worth.
That is the teacher's, and it is what an E-Class Record's **columns** are.
`assessment_slots` is that declaration, one row per column per class per term.

**A slot is class-level; a score is learner-level.** The slot says "Written
Work 2 in Grade 1 - Mabait, Mathematics, Term 1 is out of 20". The
`grade_components` row says "this learner got 18 of it". `max_score` is
materialised onto both — the slot is the declaration, the component is the
copy the computation actually reads, and the class-record endpoint is the only
writer of either. When a slot's HPS changes it rewrites every row on that slot
in the same transaction.

### The fixed frame: WW 1-5, PT 1-3

Eight columns, always in the same positions, whether or not the class has used
them. This is a **display and data-entry** decision, not a DepEd rule: a grid
whose column count changes per class is a grid a teacher cannot learn. The API
accepts `slot_no` 1-20 so the frame can widen without a migration; nothing
sends outside 1-5 / 1-3 today.

A slot with no row yet is a **phantom** — rendered, typeable, created on save.

### USED vs UNUSED, and the defect that made the distinction matter

**A slot is USED once it has a highest possible score.** Not once it has a row,
and not once someone has a score in it.

| State | `max_score` | Effect on the computation |
|---|---|---|
| **Unused** | `NULL` | **Left out entirely.** The assessment never happened; nobody is missing anything |
| **Used, learner scored** | set | Counts, score and max both |
| **Used, learner has NO score** | set | **That learner's whole group is Pending** — never left out, never zero |

**The third row is the one that was wrong, and it is worth stating why.**
The first build simply left a missing score out of both the numerator and the
denominator. That **silently raises the grade of a learner who missed an
assessment**: 18 out of a used 20 + 10 showed as 90.00 instead of waiting for
the second mark. A learner who skipped a quiz scored higher than one who sat
it and did badly. `componentPercentage(rows, requiredSlotIds)` now returns
`null` when any used slot has no component, which renders as "— Pending" — the
same answer the report card already gives when an exam part is missing.

**Never zero.** A missing mark is *not recorded*, not *nothing earned*. Zero is
a grade a teacher gives; blank is a grade a teacher has not given yet. This is
the same rule as §4's "every computed value is NULL until every required input
exists", one level down.

### Whole numbers

**Every score and every highest possible score is an integer.** The school
never awards half points, so `42.5/50` is not a value this system should be
able to hold; the server refuses it at all four score write paths plus the
class record (`utils/validateScore.js`). **This does not make computed values
integers** — an Initial Grade of 83.60 and a General Average of 90.13 are
still correct and still carry two decimals (§4a). The rule constrains what a
teacher TYPES, never what the system works out from it.

### A score above its HPS

**Allowed, flagged on screen, never refused and never clamped.** That matches
`utils/gradeComputation.js`, which does not clamp a percentage over 100.
**The school confirmed on 2026-09-23 that it awards bonus points** (event
participation, added to Performance Tasks), so the grid says "check that each
is a bonus, not a typing mistake" — naming the reading the school recognises.
The behaviour was already right; only the copy changed. A cap, if the school
ever wants one, belongs in route validation as explicit policy.

> One consequence, stated because it is not obvious: a weighted score above
> 100 yields no band, so a Grade 1 letter comes back `null` and renders as
> Pending. That is the honest answer — the school's table does not define a
> band up there.

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
3. ~~**Attendance rate formula**~~ — **ANSWERED 2026-09-13** by the principal,
   in conversation: **Late counts as present, Excused counts as absent.** A
   school decision, not DepEd's — DO 015 prescribes no rate — so never
   attribute it to DepEd in parent-facing copy. Built as "Present on recorded
   days" on Parent → Attendance; it is recorded days, not SF9 Class Days,
   because unmarked school days are not in the table.
4. **What order do the learning areas print in on a Grade 1 card?** Raised
   2026-09-22. §6c's per-grade tables come from CLASS PROGRAMS, which are
   timetables; the only order transcribed from a report card is the SF9's
   eight intermediate rows (Grades 4–6). The client uses the Grade 1 class
   programme order provisionally, marked as such in `ReportCard.jsx`. Grades
   2, 3 and 5 are in the same position and fall back to alphabetical rather
   than guess. One answer settles all four.

### Resolved by the school visit

- **How the Grade 1 letter is produced — ANSWERED 2026-09-22, BUILT the same
  day.** Computed from WW 30 / PT 50 / Summative 20, banded on the raw
  weighted score. The full rule, and what building it actually touched, is
  **§6a**.

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
