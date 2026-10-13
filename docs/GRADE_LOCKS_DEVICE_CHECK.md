# fix/smoke-round — device-check fixture and checklist (RUN 2026-10-13 — PASSED)

Written 2026-10-13 with `fix/grade-locks`, extended the same day for
`fix/smoke-round` (the grade locks 1a + 1b and the smoke gate's F4–F7; F3 was
cut — KNOWN ISSUES). **Run the same evening, on the owner's word, after the
owner's main tree had the branch ("switch"); every section passed and the
data was cleaned up — the result is section 5 at the end.** Nothing in this
file is a credential: sign-ins are read at run time and never printed.

## 1. What the check needs

- **Grade 6 - Malikhain, Term 2 (SY 2026-2027)** with one learner READY and
  one INCOMPLETE:
  - **Tala** (the browser-fixture learner) — a term grade in all 8 Grade 6
    subjects, created by the fixture below.
  - **Marwin** (the suites' learner) — **never written to**. With no Term 2
    rows he is incomplete by absence ("8 of 8 subjects still Pending").
- **A used WW 1 column** in that class's Mathematics, for 1a, and **a named
  PT 1 column** there ("Group project"), for F5 — the fixture creates both.
  The owner's own bulk lock (A5) then locks Tala, so no separate lock fixture
  is needed.
- **Summative scores whose PS differs from their raw sum**, for F4: ST1 8/10,
  ST2 9/10, TE 18/20 → **ST PS 87.00** (0.30 × 80 + 0.30 × 90 + 0.40 × 90),
  where 35/40 would be 87.50.
- Whole school, Term 2 also lists Nino (Grade 1 - Mabait, 3 of 5 — his two
  legacy letters count) and Jea (Grade 5 - Masigasig, 8 of 8). Neither is
  written to.
- **For F6 (section 7): the admin's email CONFIRMED** (the owner, through
  "Confirm your email"). The reset accepts the current password as the new
  one — `POST /auth/reset-password` checks only the rule (8 characters and a
  number), never the old hash, and the admin's password passes it on the
  server and in the web's checklist (checked in memory, 2026-10-13). The
  owner sets the SAME password, so the run-time sign-in
  (`server/scripts/proof-backup-loop.js:172`) still works.

## 2. The fixture

**Preconditions, a read-only survey first — STOP if any fails:**
- `GET /api/health` answers 200, and the owner's API runs the branch:
  `POST /api/grades/locks` with no token answers `401` (`404` on `main`).
- The admin is ACCEPTED (`/auth/me` `policy_pending` false). The fixture
  never accepts on anybody's behalf.
- Grade 6 - Malikhain has **no** Term 2 `assessment_slots` and Tala has **no**
  Term 2 `grades` rows.
- **The pre-fixture survey is recorded** (counts only, never
  `activity_logs.description`): `grades`, `assessment_slots`,
  `grade_components`, `notifications`, `announcements`, `memos`,
  `auth_codes`, `policy_acceptances`, `login_attempts`, plus **the id of
  every `policy_acceptances` and `login_attempts` row that exists now** —
  ids 791–796 (the three teachers) and the admin's two must be among them.
  **These are the recount targets** — not fixed numbers.

**Then:** health 200 → `POST /api/backups` 201 as the admin → a throwaway
script (a new folder under `C:\Users\Win10 User\AppData\Local\Temp\`,
deleted after) signs in as the admin — the password read at run time from
`server/scripts/proof-backup-loop.js:172`, never printed — and sends
**8 × `PUT /api/grades/class-record`**, one per Grade 6 subject:

```
{ subject_id: <each Grade 6 subject>, grade_level: 6, section: 'Malikhain',
  term: 2, school_year: '2026-2027',
  slots:   [ { type: 'WW', slot_no: 1, max_score: 10 },
             { type: 'PT', slot_no: 1, max_score: 10,
               name: 'Group project' /* Mathematics only */ } ],
  entries: [ { student_id: <Tala>,
               scores: [ { type: 'WW', slot_no: 1, score: 8 },
                         { type: 'PT', slot_no: 1, score: 9 } ],
               st1_score: 8, st1_max: 10, st2_score: 9, st2_max: 10,
               te_score: 18, te_max: 20 } ] }
```

The PUT takes a slot `name` (`routes/grades.js` `normalizeSlotName`, written
on the slot). **No class-wide `exam_max`**, so Marwin gets no row. The script
prints counts and the ids it created only, and **records every id**: the 8
`grades` ids, the 16 `assessment_slots` ids, the 16 `grade_components` ids
(read back by those grade ids), and the `notifications` ids on those grade
ids (the 8 `grade_available` rows to Tala's parent). The 8
`save_class_record` audit rows stay, as audit.

## 3. Cleanup (after section 6, before section 7)

1. **Survey AFTER** (read-only): each recorded id still matches what was
   created (grade id ↔ Tala + subject + Term 2; slot id ↔ Grade 6 -
   Malikhain + Term 2 + type + number; component id ↔ its grade id;
   notification id ↔ Tala's parent + `grade` + its grade id), and every
   fixture grade row has `is_locked = 0` (the check ends unlocked; STOP and
   report if one is still locked). Also list every `policy_acceptances` and
   `login_attempts` row whose id is NOT in the pre-fixture survey (Tala's
   parent's consent in section 4, any failed sign-in), and any row in that
   class and term that is NOT a recorded id — **reported, never deleted**
   without the owner's word.
2. Health 200 → backup 201 as the admin (still accepted).
3. **One transaction, ids only**: DELETE `notifications` → `grade_components`
   → `grades` → `assessment_slots`, each by its recorded id AND the surveyed
   values; then **the new `policy_acceptances` and `login_attempts` rows by
   id** (the owner's decision, 2026-10-13: the parent consent screen must
   show again for the demo). Any statement that does not hit exactly the
   surveyed rows rolls everything back. **Ids 791–796 and the admin's two
   acceptances, and every other row in the pre-fixture survey, survive.**
4. **Recount** every table against the PRE-FIXTURE survey values.
5. After section 7: a read-only recount again — the reset adds an
   `auth_codes` row (consumed) and its audit rows, which stay; a failed
   sign-in there is listed and deleted by id only on the owner's word.

## 4. Checklist — given to the owner ONE SECTION AT A TIME

Web: Chrome at 3000, also at 390px, both themes. Phone: the emulator —
**after the switch (or any checkout in the main tree), stop Metro and run
`npx expo start --clear`, then cold-boot** (never `r`). Learned in section 3:
Metro started before the switch kept serving the old bundle, and a cold boot
alone showed the old slot-screen copy (MOBILE M7).

**1. Admin — web**
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
10. **F7:** Grades → Grade 6 → Malikhain → Halimbawa, Tala → tap Mathematics
    Term 2 → the dialog "Mathematics · Term 2", Locked → "Unlock grade" → **the
    dialog closes**, and above the report card: "Mathematics, Term 2
    unlocked." → tap the cell again → "Lock grade" → **the dialog closes the
    same way**: "Mathematics, Term 2 locked." All 8 are locked again.

**2. Teacher (the Grade 6 - Malikhain Mathematics teacher) — web**, Grades →
Mathematics, Grade 6 - Malikhain, Term 2:
1. Tala's row marked Locked, her cells disabled.
2. **F4:** the Summative columns are ST1 · ST2 · TE · ST PS · ST WS — **no "ST
   Total"**; the Highest possible row shows nothing under the Summative
   scores, "100.00" under ST PS and the weight under ST WS; Tala's ST PS
   **87.00** (not 87.50); under the grid: "ST PS = ST1 30% + ST2 30% + TE 40%,
   each part out of its own highest possible score (DO 015 s. 2026) — not the
   three scores added together." WW and PT still show their Total. The PT1
   header reads "PT1" with "Group project" under it.
3. WW1's highest possible score 10 → 15, Done → "Live totals are out of date —
   Tala Halimbawa has a locked grade for this subject and term — ask an admin
   to unlock before changing a highest possible score."
4. Save all → confirm → "Nothing was saved. Tala Halimbawa has a locked grade
   for this subject and term — ask an admin to unlock before changing a
   highest possible score."
5. Leave → "Leave without saving?" → "Leave and discard"; reopen: WW1 still 10.

**3. Teacher — emulator**, Grades → Mathematics, Grade 6 - Malikhain, Term 2:
1. The WW1 column → change its HPS → the same "Live totals are out of date —
   …" line → Save all → the same "Nothing was saved. …" line. Leave and
   discard.
2. **F4:** the ST1 column → "Summative Tests & Term Exam: ST1 30% + ST2 30% +
   TE 40% · weight N%"; Tala's line "ST PS 87.00 · WS …" — no "EX total". The
   WW1 column still reads "Written / Oral Works highest possible: 10 · weight
   N%" and "WW total 8/10 · PS 80.00 · WS …".

**4. Tala's parent — web, then emulator.** The consent screen comes first (the
restore removed this account's acceptance): accept, then continue — the
cleanup removes it again for the demo.
1. **F5, web:** Grades → tap Mathematics, Term 2 → the header "89
   Benchmarking" (the DO 015 s. 2026 descriptor; the dashboard reads "General
   average 89.00 · Term 2 · Benchmarking") → "Written Works": "Written
   Work 1" 8/10; "Performance Tasks": "Group project" 9/10; "Examinations":
   ST1 8/10 · ST2 9/10 · TE 18/20. Any other subject's Term 2: "Written Work
   1" 8/10, "Performance Task 1" 9/10. (Changed by the owner after section 3:
   the breakdown keeps the class record helper's promise — "Left blank, this
   column is called “Written Work 1” here and on the parent's grade
   breakdown"; the teacher's grid keeps its codes.)
2. **F5, emulator:** Grades → Mathematics → Term 2 → the same three groups and
   labels.

**5. Admin — emulator**
1. Grades → "Lock or unlock a term" → Lock / Term 2 / Whole school and "Pick a
   grade to narrow it to one section."
2. Grade 6 → Malikhain → Preview → the lines of 1.7.
3. Unlock → Preview → "To unlock: 8 grade records for 1 learner." → "Unlock 8
   grade records" → back on Grades: "Unlocked 8 grade records for 1 learner —
   Grade 6 - Malikhain, Term 2."; Tala's locks gone.
4. Lock again from the phone, then unlock again — **the check ends
   unlocked.**
5. Airplane mode → Preview → "Cannot reach the server. Check that it is
   running, then try again." Airplane mode off.

**6. Admin — web, then the teacher — web**
1. Dashboard: "Grade records locked (Term 2)" — "0 of 10" (it read "8 of 10"
   while 5.4's lock stood).
2. The single lock still works: lock and unlock one Term 2 cell, each closing
   its dialog with its line (as 1.10); it ends unlocked.
3. Teacher: WW1's highest possible score 10 → 15 → Done → **no** amber line;
   Leave and discard.

→ **The cleanup and recount (section 3) run here.**

**7. F6 — the admin, web then emulator** (after the cleanup)
1. Web: sign out → "Forgot your password?" → the admin's login id → "Send
   code" → the code from the project Gmail → **the SAME password** twice →
   "Set new password" → the sign-in page shows, under "Sign in to
   continue.", a green line: "Password updated. You can sign in now." → reload
   → the line is gone → sign in works. (A wrong password first replaces the
   line with the red refusal.)
2. Emulator: the same flow → back on the sign-in screen with "Password
   updated. You can sign in now." → signing in clears it.
3. Each reset signs out every session of the admin (the token's version
   changes) — expected.

## 5. Result — 2026-10-13, web Chrome (3000) and the Android emulator (8081)

**Every section PASSED.** The owner ran it; each section was given one at a
time, and every expected line above was read back exactly unless noted.

- **The switch:** the worktree detached, the main tree switched to
  `fix/smoke-round` (`55fce07`); the `--watch` API reloaded itself (health
  200, `POST /api/grades/locks` without a token 401). The pre-fixture survey
  was taken twice (a lost connection in between) and matched. **Backup 315**
  (`parents_portal_2026-10-13_193620.sql`), then the fixture: grades
  5103–5110, slots 2121–2136 (Mathematics PT1 #2124 "Group project"),
  components 3084–3099, notifications 3047–3054 to Tala's parent (#647); every
  Term 2 grade WW 80.00 · PT 90.00 · ST PS 87.00 · term grade 89.
- **1. Admin, web — PASS.** F7 was checked on English Term 2 BEFORE the bulk
  lock (Lock → the dialog closed, "English, Term 2 locked."; Unlock → closed,
  "… unlocked."), then the bulk lock. **The 390px / dark-theme pass of the
  bulk dialog was NOT DONE — the owner's call** (offered in section 6, not
  taken).
- **2. Teacher, web — PASS.** Mathematics weights WW 20 · PT 50 · ST 30: Tala
  ST PS 87.00 → WS 26.10 → Initial 87.10 → Term 89; the 1a refusal and the
  "Nothing was saved." line exact; Leave and discard kept WW1 at 10.
- **3. Teacher, emulator — PASS after a restart.** The first look showed the
  OLD slot-screen copy ("…highest possible: 40 · weight 30%", "EX total
  35/40"): Metro had been started before the switch and kept the old bundle,
  and a cold boot alone did not help. `npx expo start --clear` → `a` fixed it
  (now MOBILE M7, and the checklist header above).
- **F5 changed by the owner after section 3** (`e49b801`): the breakdown
  keeps the class record helper's promise — "Written Work 1", a named
  column's name alone — instead of the grid's codes.
- **4. Tala's parent, web then emulator — PASS.** The consent screen first;
  the bell 8; the breakdown's header "89 Benchmarking" (DO 015 s. 2026; the
  check sheet had said "Very Satisfactory" in chat, wrongly); "Written Work
  1" 8/10, "Group project" 9/10, ST1 8/10 · ST2 9/10 · TE 18/20; English
  "Performance Task 1" 9/10; no code anywhere; the same on the phone after the
  `--clear` restart.
- **5. Admin, emulator — PASS**, ending unlocked; offline: "Cannot reach the
  server. …" with the Live updates paused strip.
- **6. Admin web + teacher web — PASS.** Dashboard 0 of 10; the bulk preview
  only; with Tala unlocked the teacher's WW1 10 → 15 gave no amber line (live
  WW total 15, Tala PS 53.33, WS 10.67), not saved. The single-cell lock was
  not repeated (section 1 covered it).
- **Cleanup (section 3) — backup 316** (`parents_portal_2026-10-13_231526.sql`),
  one transaction by id and surveyed values: notifications 8/8, components
  16/16, grades 8/8 (all unlocked), slots 16/16, the parent's consent rows
  811–812 (2/2), the check's two failed sign-ins 762–763 (2/2). **Recount:**
  every table back to the pre-fixture survey and acceptances 765–766 +
  791–796 intact — except `login_attempts` 20 → 0: the app had already pruned
  the 20 pre-fixture rows itself (a failed sign-in deletes rows older than 24
  hours, `utils/loginThrottle.js:61`); only 762–763 were deleted by the
  cleanup. Tala's parent has no acceptance, so the consent screen shows again.
- **7. F6, the admin — PASS.** The admin's email confirmed first ("Email
  confirmed. You can now reset your own password."); the web reset with the
  SAME password landed on "Password updated. You can sign in now." under "Sign
  in to continue.", gone on reload; the emulator's the same with a new code.
  The optional wrong-password check was skipped on purpose.
- **Final recount (read-only):** only `auth_codes` changed — 0 → 3, all
  consumed (#252 email verification, #253–254 the two resets), which stay;
  no failed sign-in; nothing locked; audit rows kept.
