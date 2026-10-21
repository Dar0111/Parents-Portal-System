# Grade acknowledgement — device check (`feat/grade-acknowledgement`, 2026-10-21; PENDING)

The owner's check of branch 4 of the pre-Oct-21 build, on its own after the
combined B5 + B6 check: **a parent confirms a TERM of the report card once
the school has locked it — "I have seen these grades" — the adviser is told,
and an unlock clears it** (the owner's Q1–Q12 of 2026-10-21). Rules:
FRONTEND §33, MOBILE M30, API_REFERENCE → "Grade acknowledgements".

**Given one section at a time during the check.** 📸 marks only the rows
that need a screenshot. Every expected sentence is the exact copy on screen
or in the bell. Nothing in this file is a credential: sign-ins are read at
run time and never printed; the seeded passwords are typed where the app
accepts them and the cleanup puts back only a failure, by id (D-86).

## 0. Before the check

- **The branch's order 2 is done:** the migration ran on `parents_portal`
  after a backup (health 200, `POST /api/backups` 201), the 23 HTTP suites
  on 5001 with file transports, every proof, `smoke:isolated` 20/20, the
  baseline survey, the commit, the push. The main tree carries the branch
  ("switch", on the owner's word); `npx expo start --clear` and a cold boot
  of the phone (M7).
- **Who:** ADMIN001 (the locks), **Maria Santos (2, TCH-001)** — adviser of
  Grade 6 - Malikhain — and **Marwin's parent (3)**; for Grade 1,
  **TCH-003 (Grade 1 - Mabait's adviser)** and **Nino's parent (7)**. Both
  parents have NO confirmed contact (the read-only survey of 2026-10-21),
  so each meets the contact step at the first sign-in of the check — confirm
  through the project Gmail (the same as the first-sign-in check); the
  cleanup puts the two `email` / `email_verified_at` columns back to NULL by
  id. **Never** sign in as Tala's parent; Tala is written to by the fixture
  only as the OTHER learner of the class (her term stays unlocked).
- **The fixture, after a read-only survey and a backup:** Marwin's Term 1 —
  a term grade in all 8 Grade 6 subjects (`PUT /api/grades/class-record`,
  one per subject, Tala left out), so Marwin is READY and Tala is not; Nino
  already has three Term 1 letters (the seed) — give him the two missing
  ones the same way (Grade 1's class record), so his Term 1 is complete.
  Recorded: every grade id, slot id and component id the fixture created.
- **The start marks, written down before row 1** (read-only): the ids of
  every `notifications`, `grade_acknowledgements`, `policy_acceptances` and
  `auth_codes` row that exists now; `activity_logs`' highest id.

## 1. Before any lock — nothing to confirm (web, Marwin's parent)

1. Parent → Grades: the report card shows **no "Term 1 grades are final."
   block** (Term 1 is not locked). 📸
2. The bell holds no "Term 1 grades are final" row.

## 2. The bulk lock asks the parent (web, ADMIN001 then the parent)

3. Admin → Grades → **Lock or unlock a term**: Lock grades · Term 1 ·
   Grade 6 · Malikhain → **Preview**: "Ready: 1 of 2 learners — every
   subject graded.", "To lock: 8 grade records.", "Skipped: 1 learner —
   still Pending in at least one subject:" with Tala's row → **Lock 8 grade
   records** → the line "Locked 8 grade records for 1 learner — Grade 6 -
   Malikhain, Term 1. 1 learner skipped." 📸
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
    the Term 1 grades." and opens Class summary. 📸
13. Teacher → Class summary, Term 1: the last column **"Confirmed"** over
    **"1 of 2 learners"**; Marwin's cell the short date (today), Tala's
    **"—"**; Final: no Confirmed column. 📸
14. Marwin's name → the learner's card: **"Term 1 grades are final."** /
    **"Confirmed by the parent on <today, long form>."**, no button.
15. Tala's cell stays "—" on every reload: her Term 1 has no rows, so her
    term is not locked and nothing asks her parent (never signed in as).

## 5. Admin → Grades and the unlock (web, ADMIN001)

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
21. As the parent, confirm again (rows 7–9). Then as ADMIN001 unlock ONE
    Term 1 cell singly (Admin → Grades → a cell → Unlock grade): the
    confirmed line is gone, the parent's block is gone, both bell rows are
    gone. Lock that cell again → the parent is asked again.

## 6. The phone (Expo Go, the Tecno)

22. Nino's parent (7) signs in — the contact step, then Grades: **"Term 1
    grades are final."** is NOT there yet (Nino's Term 1 is not locked).
23. ADMIN001 on the web: Lock grades · Term 1 · Grade 1 · Mabait → Preview
    ("Ready: 1 of 1 learner — every subject graded.") → Lock 5 grade
    records.
24. The phone: the bell (pull to refresh) shows **"Term 1 grades are
    final"** / "Please confirm you have seen your child's Term 1 grades."
    → opens Grades; the block with the 48dp button **"I have seen these
    grades"**. 📸
25. The button → the system Alert **"Confirm Term 1 grades?"** / the
    sentence / **Go back** · **Yes, I have seen them**; Go back changes
    nothing; the button again → Yes → the block reads **"You confirmed Term
    1 on <today, long form>."**. 📸
26. TCH-003 on the phone: the bell **"Grades confirmed"** / "Nino
    Alcantara's parent has seen the Term 1 grades." → Class summary, Term
    1: swipe to the last column **"Confirmed"** / "1 of 1 learner", the
    date; Nino's name → the card's line **"Confirmed by the parent on
    <today>."**. 📸
27. ADMIN001 on the phone: Grades → Grade 1 → Mabait → Nino: **"Term 1 ·
    Confirmed <today>"** under the header card; a Term 1 cell → the lock
    sheet shows the unlock sentence; Close. **Lock or unlock a term** →
    Unlock · Term 1 · Grade 1 · Mabait → Preview shows **"Confirmations to
    clear: 1."** → Unlock. 📸
28. Dark theme, one screen: the parent's block (row 24) and the summary's
    column (row 26). 📸

## 7. Cleanup (by id, backup first)

Health 200 → `POST /api/backups` 201 → one transaction, every statement by
id from the fixture and the start marks: `grade_acknowledgements` rows for
Marwin and Nino (if any remain), the check's `notifications` rows (the two
types, by the recorded item ids — `item_id` has no FK), the fixture's grade
components, slots and grade rows (Marwin's 8; Nino's two NEW rows only — his
three seeded letters stay), the two parents' `email` / `email_verified_at`
back to NULL and their `auth_codes` above the start mark, the check's
`policy_acceptances` rows above the start mark, the seeded passwords checked
against the seeded hashes and restored only on a failure (D-86); every
table compared with the start marks; `activity_logs` rows kept.

## 8. Result

PENDING.
