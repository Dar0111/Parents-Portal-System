# fix/grade-locks — device-check fixture and checklist (PLAN NOTES, NOT RUN)

Written 2026-10-13 with the branch, per the owner's approval (change 2): **the
fixture below is a proposal and has not been run.** It runs only in the
smoke-gate fix round, on the owner's word, before the device check. Nothing in
this file is a credential: sign-ins are read at run time and never printed.

## 1. What the check needs

- **Grade 6 - Malikhain, Term 2 (SY 2026-2027)** with one learner READY and
  one INCOMPLETE:
  - **Tala** (the browser-fixture learner) — a term grade in all 8 Grade 6
    subjects, created by the fixture below.
  - **Marwin** (the suites' learner) — **never written to**. With no Term 2
    rows he is incomplete by absence ("8 of 8 subjects still Pending").
- **A used WW 1 column** in that class's Mathematics, for 1a — the fixture
  creates it. The owner's own bulk lock in the check (A5) then locks Tala, so
  no separate lock fixture is needed.
- Whole school, Term 2 also lists Nino (Grade 1 - Mabait, 3 of 5 — his two
  legacy letters count) and Jea (Grade 5 - Masigasig, 8 of 8). Neither is
  written to.

## 2. The fixture (proposal)

**Preconditions, a read-only survey first — STOP if any fails:**
- `GET /api/health` answers 200.
- The admin is ACCEPTED (staff acceptances from batch 8). The fixture never
  accepts on anybody's behalf; if `/auth/me` says `policy_pending`, STOP and
  ask the owner to sign in once on the web.
- Grade 6 - Malikhain has **no** Term 2 `assessment_slots` and Tala has **no**
  Term 2 `grades` rows (the fixture assumes a clean class).
- **The pre-fixture survey is recorded** (counts only, never
  `activity_logs.description`): `grades`, `assessment_slots`,
  `grade_components`, `notifications`, `policy_acceptances`,
  `login_attempts`, plus the ids of every `policy_acceptances` and
  `login_attempts` row that exists now. **These are the recount targets** —
  not fixed numbers: the live DB holds smoke-gate data and the staff
  acceptances from batch 8.

**Then:** health 200 → `POST /api/backups` 201 as the admin (still accepted)
→ a throwaway script (a new folder under `C:\Users\Win10 User\AppData\Local\Temp\`,
deleted after) signs in as the admin — the password read at run time from
`server/scripts/proof-backup-loop.js:172`, never printed — and sends
**8 × `PUT /api/grades/class-record`**, one per Grade 6 subject:

```
{ subject_id: <each Grade 6 subject>, grade_level: 6, section: 'Malikhain',
  term: 2, school_year: '2026-2027',
  slots:   [ { type: 'WW', slot_no: 1, max_score: 10 },
             { type: 'PT', slot_no: 1, max_score: 10 } ],
  entries: [ { student_id: <Tala>,
               scores: [ { type: 'WW', slot_no: 1, score: 8 },
                         { type: 'PT', slot_no: 1, score: 9 } ],
               st1_score: 8, st1_max: 10, st2_score: 9, st2_max: 10,
               te_score: 18, te_max: 20 } ] }
```

**No class-wide `exam_max`**, so Marwin gets no row. The script prints counts
and the ids it created only, and **records every id it created**: the 8
`grades` ids (`results[].grade_id`), the 16 `assessment_slots` ids (the
response's `slots`), the 16 `grade_components` ids (read back by those grade
ids), and the `notifications` ids on those grade ids (the 8 `grade_available`
rows to Tala's parent). The 8 `save_class_record` audit rows stay, as audit.

## 3. Cleanup (after the device check, in the merge-ready dispatch)

1. **Survey AFTER** (read-only): each recorded id still matches what was
   created (grade id ↔ Tala + subject + Term 2; slot id ↔ Grade 6 -
   Malikhain + Term 2 + type + number; component id ↔ its grade id;
   notification id ↔ Tala's parent + `grade` + its grade id), and every
   fixture grade row has `is_locked = 0` (the check ends unlocked; STOP and
   report if one is still locked). Also list any row in that class and term
   that is NOT a recorded id — **reported, never deleted** without the
   owner's word.
2. Health 200 → backup 201 as the admin (still accepted).
3. **One transaction, ids only**: DELETE `notifications` → `grade_components`
   → `grades` → `assessment_slots`, each by its recorded id AND the surveyed
   values; any statement that does not hit exactly 1 row rolls everything
   back.
4. **Never delete a `policy_acceptances` or `login_attempts` row that existed
   before the fixture.** The fixture itself creates none (a successful
   sign-in writes no `login_attempts` row; the admin is already accepted). If
   the device check created any for its accounts, they are listed in the
   survey and deleted only by those new ids, on the owner's word.
5. **Recount** every table against the PRE-FIXTURE survey values.

## 4. Device-check outline (web Chrome at 3000 and 390px; emulator; both themes)

**A. Admin — web**
1. Admin → Grades: "Lock or unlock a term" beside "Report card".
2. The dialog "Lock or unlock a term": "Lock grades", "Term 2", "Whole
   school", Section disabled "Pick a grade first"; the line "Locks every grade
   for each learner who has a grade in every subject this term. A learner with
   any subject still Pending is skipped and listed — nothing of theirs is
   locked."
3. Grade 6, Section Malikhain → Preview: "Grade 6 - Malikhain · Term 2 · SY
   2026-2027" / "Ready: 1 of 2 learners — every subject graded." / "To lock: 8
   grade records." / "Skipped: 1 learner — still Pending in at least one
   subject:" / "Conde, Marwin · Grade 6 - Malikhain · 8 of 8 subjects still
   Pending"; the button "Lock 8 grade records"; no LRN anywhere.
4. Term 1 → the preview and the button disappear; back to Term 2 → Preview.
5. "Lock 8 grade records" → "Locked 8 grade records for 1 learner — Grade 6 -
   Malikhain, Term 2. 1 learner skipped." Close → the same line under the
   header.
6. Report card for Tala: a lock on all 8 Term 2 cells, none on Terms 1 and 3.
7. Preview again: "Already locked: 8 grade records." and "Nothing to lock —
   every ready learner's Term 2 grades are already locked."
8. Whole school → Preview: "Ready: 1 of 4 learners — every subject graded.";
   skipped "Alcantara, Nino · Grade 1 - Mabait · 3 of 5 subjects still
   Pending", "Bargaso, Jea Mae · Grade 5 - Masigasig · 8 of 8 subjects still
   Pending" and Marwin's; the nothing-to-lock line.
9. Dashboard: "Grade records locked (Term 2)" — "8 of 10".

**B. Teacher (the Grade 6 - Malikhain Mathematics teacher) — web**, Grades →
Mathematics, Grade 6 - Malikhain, Term 2:
1. Tala's row marked Locked, her cells disabled.
2. WW 1's highest possible score 10 → 15, Done → "Live totals are out of date —
   Tala Halimbawa has a locked grade for this subject and term — ask an admin
   to unlock before changing a highest possible score."
3. Save all → confirm → "Nothing was saved. Tala Halimbawa has a locked grade
   for this subject and term — ask an admin to unlock before changing a highest
   possible score."
4. Leave → "Leave without saving?" → "Leave and discard"; reopen: WW 1 still 10.

**C. Teacher — emulator**: Grades → Mathematics, Grade 6 - Malikhain, Term 2 →
the WW 1 column → change its HPS → the same "Live totals are out of date — …"
line → Save all → the same "Nothing was saved. …" line. Leave and discard.

**D. Admin — emulator**
1. Grades → "Lock or unlock a term" → Lock / Term 2 / Whole school and "Pick a
   grade to narrow it to one section."
2. Grade 6 → Malikhain → Preview → the A7 lines.
3. Unlock → Preview → "To unlock: 8 grade records for 1 learner." → "Unlock 8
   grade records" → back on Grades: "Unlocked 8 grade records for 1 learner —
   Grade 6 - Malikhain, Term 2."; Tala's locks gone.
4. Lock again from the phone, then unlock again — the check ends unlocked.
5. Airplane mode → Preview → "Cannot reach the server. Check that it is
   running, then try again."

**E. Admin — web**: Dashboard "8 of 10" after D4's lock, "0 of 10" after its
unlock; the single lock still works (lock and unlock one cell; its copy
unchanged); teacher web: WW 1 HPS change → Done → no amber line; Leave and
discard.
