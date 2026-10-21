# Grade acknowledgement — device check (`feat/grade-acknowledgement`, 2026-10-21/22; PASSED)

The owner's check of branch 4 of the pre-Oct-21 build, on its own after the
combined B5 + B6 check: **a parent confirms a TERM of the report card once
the school has locked it — "I have seen these grades" — the adviser is told,
and an unlock clears it** (the owner's Q1–Q12 of 2026-10-21). Rules:
FRONTEND §33, MOBILE M30, API_REFERENCE → "Grade acknowledgements".

**Given one section at a time during the check.** 📸 marks only the rows
that need a screenshot. Every expected sentence is the exact copy on screen
or in the bell. Nothing in this file is a credential: sign-ins are read at
run time and never printed; the seeded passwords are typed where the app
accepts them, and the cleanup checks them as a guard — pass or fail only.

**Corrected after the check (2026-10-22), as the check ran** — from the §0
plan's item 5, plus the fix round: (1) the fixture was direct inserts, not
the class record; (2) Nino had TWO seeded Term 1 letters, so the fixture
added his three missing ones; (3) both parents meet the consent screen first;
(4) both parents had the seed email and number on file, unconfirmed — the
contact step starts with **Change**, and the cleanup restores the seed
contacts; (5) §7 as it ran; (6) Lito Bautista has a confirmed number only.
Also: the Confirmed column's third state, "Not yet" (row 13), and rows 12 and
26 opening Class summary on the confirmed term (`2525215`).

## 0. Before the check

- **The branch's order 2 is done:** the migration ran on `parents_portal`
  after a backup (health 200, `POST /api/backups` 201), the 23 HTTP suites
  on 5001 with file transports, every proof, `smoke:isolated` 20/20, the
  baseline survey, the commit, the push. The main tree carries the branch
  ("switch", on the owner's word); `npx expo start --clear` and a cold boot
  of the phone (M7).
- **Who:** the admin (the locks), **Maria Santos (2)** — adviser of Grade 6
  - Malikhain — and **Marwin's parent (3)**; for Grade 1, **Lito Bautista
  (6)** — adviser of Grade 1 - Mabait, with a confirmed number only, so he
  meets no contact step — and **Nino's parent (7)**. **Both parents have the
  seed email and number on file, NEITHER confirmed** (the read-only survey
  of 2026-10-21), so each meets, at the first sign-in of the check, **the
  consent screen first (three ticks)**, then the contact step with the
  address on file shown: **press Change, type the project Gmail, Send code,
  type the code.** **Never** send to the address on file (it is not on a
  reserved domain) and **never** pick Mobile (the API sends real texts).
  The cleanup puts each parent's seed email and number back and both
  confirmation stamps to NULL, by id. **Never** sign in as Tala's parent:
  Tala has no grade rows, so the bulk lock lists her as skipped and her
  term stays unlocked.
- **The fixture, after a read-only survey and a backup — direct inserts in
  ONE guarded transaction** (not the class record, so no slot, no component
  and no `grade_available` row): Marwin's Term 1 term grade in all 8 Grade 6
  subjects (#5717–5724: English 88, Mathematics 85, Filipino 90, Araling
  Panlipunan 87, GMRC 92, Science 84, MAPEH 91, EPP 89), so Marwin is READY
  and Tala is not; and **Nino's three missing Term 1 letters** (#5725
  Makabansa B, #5726 GMRC A, #5727 Language C) beside his **two** seeded
  ones (#1 Mathematics A, #4 Reading and Literacy D), so his Term 1 is
  complete. COMMIT only on exact matches. Recorded: every grade id.
- **The start marks, written down before row 1** (read-only): the next id
  of `notifications` (3399) and `grade_acknowledgements` (7), the highest
  `policy_acceptances` (796) and `auth_codes` (305) ids, `activity_logs`'
  highest id, the database time, and yes/no that both parents' email and
  number equal the seed.

## 1. Before any lock — nothing to confirm (web, Marwin's parent)

First, Marwin's parent signs in: consent (three ticks) → Confirm your
contact (Change → the project Gmail → Send code → the code) → the dashboard.

1. Parent → Grades: the report card shows **no "Term 1 grades are final."
   block** (Term 1 is not locked). 📸
2. The bell holds no "Term 1 grades are final" row.

## 2. The bulk lock asks the parent (web, the admin then the parent)

3. Admin → Grades → **Lock or unlock a term**: Lock grades · Term 1 ·
   Grade 6 · Malikhain → **Preview**: "Ready: 1 of 2 learners — every
   subject graded.", "To lock: 8 grade records.", "Skipped: 1 learner —
   still Pending in at least one subject:" with Tala's row, **"Halimbawa,
   Tala · Grade 6 - Malikhain · 8 of 8 subjects still Pending"** → **Lock 8
   grade records** → the line "Locked 8 grade records for 1 learner — Grade
   6 - Malikhain, Term 1. 1 learner skipped." 📸
4. As Marwin's parent (a reload if signed in): the bell shows **"Term 1
   grades are final"** / "Please confirm you have seen your child's Term 1
   grades." and opens Grades; the bell count is +1 and **no sidebar badge
   changed** (bell only). 📸
5. Parent → Grades: between the learner's facts and the table, **"Term 1
   grades are final."** / "The school has locked them. Please confirm that
   you have seen them." and the button **"I have seen these grades"**. 📸
6. Print preview (Ctrl+P): the block prints without its button.

## 3. The confirmation (web, Marwin's parent)

7. **I have seen these grades** → the dialog **"Confirm Term 1 grades?"** /
   "This tells the adviser and the school that you have seen your child's
   Term 1 grades. It cannot be undone." / **Go back** · **Yes, I have seen
   them**. 📸
8. **Go back** → nothing changes; the block still asks.
9. **I have seen these grades** → **Yes, I have seen them** → the dialog
   closes and the block reads **"You confirmed Term 1 on <today, long
   form>."** with no button. 📸
10. The bell no longer lists "Term 1 grades are final" and its count is back
    down by one (the self-heal) — the row is still in `notifications`,
    unread (read-only check).
11. Reload: the line stays — it comes from the server's row.

## 4. The adviser (web, Maria Santos)

12. The bell shows **"Grades confirmed"** / "Marwin Conde's parent has seen
    the Term 1 grades." and opens Class summary **on Term 1**
    (`/teacher/class-summary?term=1` — the confirmed term, since `2525215`;
    before it, today's term). 📸
13. Teacher → Class summary, Term 1: the last column **"Confirmed"** over
    **"1 of 2 learners"**; Marwin's cell the short date (today), Tala's
    **"—"**; Final: no Confirmed column. 📸 **The cell has three states:**
    the short date once the parent has confirmed, **"Not yet"** while the
    term is locked and not confirmed (between a lock and the parent's Yes —
    after row 20's relock, for one), and **"—"** while it is not locked.
14. Marwin's name → the learner's card: **"Term 1 grades are final."** /
    **"Confirmed by the parent on <today, long form>."**, no button.
15. Tala's cell stays "—" on every reload: her Term 1 has no rows, so her
    term is not locked and nothing asks her parent (never signed in as).

## 5. Admin → Grades and the unlock (web, the admin)

16. Admin → Grades → Grade 6 → Malikhain → Marwin: under the header card
    **"Term 1 · Confirmed <today, long form>"** with the check. 📸
17. Any Term 1 cell → the lock dialog: under the locking sentence, **"The
    parent confirmed these grades on <today>. Unlocking clears that
    confirmation, and the parent is asked again after a relock."** →
    Close. 📸
18. **Lock or unlock a term**: Unlock grades · Term 1 · Grade 6 · Malikhain
    → Preview: "To unlock: 8 grade records for 1 learner." and
    **"Confirmations to clear: 1."** → Unlock 8 grade records. 📸
19. The confirmed line under the header card is gone; as the parent, the
    block is gone (Term 1 is not locked) and the bell holds neither row.
20. Lock again (row 3's choices) → the parent is asked again (row 4's bell
    row, new) and the block asks again.
21. As the parent, confirm again (rows 7–9). Then as the admin unlock ONE
    Term 1 cell singly (Admin → Grades → a cell → Unlock grade): the
    confirmed line is gone, the parent's block is gone, both bell rows are
    gone. Lock that cell again → the parent is asked again.

## 6. The phone (Expo Go, the Tecno)

22. Nino's parent (7) signs in — consent (three ticks), then Confirm your
    contact (Change → the project Gmail → Send code → the code), then
    Grades: **"Term 1 grades are final."** is NOT there yet (Nino's Term 1
    is not locked).
23. The admin on the web: Lock grades · Term 1 · Grade 1 · Mabait → Preview
    ("Ready: 1 of 1 learner — every subject graded.", "To lock: 5 grade
    records." — his two seeded letters and the fixture's three) → Lock 5
    grade records.
24. The phone: the bell (pull to refresh) shows **"Term 1 grades are
    final"** / "Please confirm you have seen your child's Term 1 grades."
    → opens Grades; the block with the 48dp button **"I have seen these
    grades"**. 📸
25. The button → the system Alert **"Confirm Term 1 grades?"** / the
    sentence / **Go back** · **Yes, I have seen them**; Go back changes
    nothing; the button again → Yes → the block reads **"You confirmed Term
    1 on <today, long form>."**. 📸
26. Lito Bautista on the phone: the bell **"Grades confirmed"** / "Nino
    Alcantara's parent has seen the Term 1 grades." → Class summary **on the
    Term 1 tab** (the link's `?term=1`, since `2525215`): swipe to the last
    column **"Confirmed"** / "1 of 1 learner", the date; Nino's name → the
    card's line **"Confirmed by the parent on <today>."**. 📸
27. The admin on the phone: Grades → Grade 1 → Mabait → Nino: **"Term 1 ·
    Confirmed <today>"** under the header card; a Term 1 cell → the lock
    sheet shows the unlock sentence; Close. **Lock or unlock a term** →
    Unlock · Term 1 · Grade 1 · Mabait → Preview shows "To unlock: 5 grade
    records for 1 learner." and **"Confirmations to clear: 1."** →
    Unlock. 📸
28. Dark theme, one screen: the parent's block (row 24) and the summary's
    column (row 26). 📸

## 7. Cleanup (by id, backup first)

Health 200 → `POST /api/backups` 201 → the baselines right after it → ONE
transaction, every statement by id from the fixture, the start marks and a
read-only survey. **Guards first** (`SELECT … FOR UPDATE`): G1 the check's
`notifications` rows, exactly, with their types, recipients and items
(`item_id` has no FK); G2 its `grade_acknowledgements` rows; G3 the fixture's
11 grade rows, no components; G4 the seeded grades #1–#5 with their letters
and which of them are locked; G5 `policy_acceptances` above 796; G6
`auth_codes` above 305; G7 `scripts/setup-db.js` read at run time (the 8
seeded users, the 3 default passwords); G8 the seeded passwords of #1, #2,
#3, #6 and #7 — **pass or fail only; a failure stops the cleanup, no
restore.** **Then:** W1 delete the check's notifications; W2 its
acknowledgements; W3 grades 5717–5727 (no component or slot exists); W4
unlock the seeded rows the check left locked — `is_locked` only, as the app's
unlock writes, and no notification; W5 the acceptances above 796; W6 the
codes above 305; W7 and W8 #3's and #7's email and number back to the seed
values, both confirmation stamps NULL. The checks before COMMIT (users 8,
students 4, grades 5 none locked, `policy_acceptances` 8, `auth_codes` 11
(highest 305), notifications 0, `grade_acknowledgements` 0, the two parents at
the seed, the other users unchanged); COMMIT only on exact matches, otherwise
ROLLBACK and STOP "BASELINE MISMATCH". `activity_logs` and `login_attempts`
kept. Then `test:notifications` on 5001 with file transports.

**Result (2026-10-22, 02:07–02:09; the plan approved as written).** Health
200 → **backup 346** (`parents_portal_2026-10-22_020752.sql`, 2,433,853
bytes) — **the pre-cleanup dump: it still holds the check's rows, so it is
not a restore point; the restore point stays 317.** G1–G8 all passed (the
five seeded passwords passed, so nothing was restored). W1–W8 at exactly
**4, 2, 11, 2, 4, 2, 1, 1** rows: notifications 3403, 3440, 3441, 3442;
acknowledgements 13 and 14 (the ids before them were used and cleared
during the check);
grades 5717–5727; seeded #1 and #4 unlocked (Nino's Term 1 was locked at the
end); acceptances 1245–1248; codes 405 and 406; #3 and #7 back to the seed
contacts. COMMIT at 02:08:27. **After:** users 8, students 4, grades 5 —
all unlocked, the seeded letters — notifications 0, `grade_acknowledgements`
0, `policy_acceptances` 8 (highest 796), `auth_codes` 11 (highest 305),
`grade_components` and `assessment_slots` 0; #3 and #7 at the seed email and
number with both stamps NULL; users 1, 2, 4, 5, 6 and 647 unchanged (one
digest); `activity_logs` and `login_attempts` kept; backups 116; every other
table's count unchanged. **`test:notifications` 157/157** on 5001 at 02:09
(156/157 during the check, its "grades is back to 5" counting the fixture's
11 rows), and the same state after it. Nino's parent had been confirmed
with a Gmail address other than the project Gmail; W8 put the seed value
back. **The owner's Admin → Grades check afterwards passed:** Marwin and
Nino — no confirmed line, no locks, the seeded letters only.

## 8. Result

**PASSED — Sections 1–6, one finding, fixed in `2525215` and re-checked
(2026-10-22; Marwin's parent, Maria Santos and the admin on the web in
Chrome, Nino's parent, Lito Bautista and the admin on the Tecno via Expo
Go). Every row showed its expected text; every "<today>" read 22 October
2026.** One line per section:

- **§0 DONE** (2026-10-21, about 23:50) — **backup 345**
  (`parents_portal_2026-10-21_235109.sql`, 2,421,033 bytes), the fixture
  5717–5727 committed at 23:52:22 with every guard and check passing, the
  start marks, then the switch of the main tree to the branch.
- **§1 PASS** (00:20) — rows 1–2 after consent and the contact step: no
  block, no bell row.
- **§2–§3 PASS** (00:20–00:27) — rows 3–11: the preview with Tala's row, the
  lock line, the bell row with no badge change, the block, the dialog, the
  confirmed line, the self-heal, the reload. **Rows 6 (the print preview)
  and 8 (Go back) were checked after the relock in §5.**
- **§4 PASS** (00:30–00:32) — rows 12–15, with the finding on row 12
  (below).
- **§5 PASS** (00:35–00:56) — rows 16–21: the unlock preview and
  "Confirmations to clear: 1.", both kinds of unlock clearing the line, the
  block and both bell rows, each relock asking again. **Rows 16 (the
  admin's confirmed line) and 17 (the lock dialog's sentence) were checked
  after the re-confirmation in row 21.**
- **§6 PASS** (00:58–01:08) — rows 22–28 on the Tecno, with the finding on
  row 26; **row 28's dark theme passed.**

**The finding — "Grades confirmed" opened Class summary on TODAY's term
(Term 2), so the adviser first read "0 of N learners"** (§4 row 12 on the
web, `/teacher/class-summary?term=2`; §6 row 26 on the phone). **Fixed in
`2525215`:** the server's link names the confirmed term
(`/teacher/class-summary?term=<n>`), and on the phone a link's query now
reaches its own screen (`routes.js` `linkParams` → `params.preset` →
Class summary's term). **Re-checked at 01:45–01:50 on both:** Maria Santos's
bell opened Term 1 on the web, Lito Bautista's the Term 1 tab on the phone.

**The cleanup:** §7 above (2026-10-22, 02:07–02:09, backup 346).
