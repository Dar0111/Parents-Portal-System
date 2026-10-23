# Excuse attendance — device check (`feat/excuse-attendance`, B8, built 2026-10-23; PENDING)

The owner's check of B8: **approving or declining an excuse letter sets that
day's attendance** — approved → Excused, declined → Absent (a new row for an
unrecorded day), a Present, Late or Excused mark kept, nothing written on a
day that is not a class day — and the review says exactly that before and
after (the owner's decision of 2026-10-22, Q1–Q11). Rules: FRONTEND §35,
MOBILE M32, API_REFERENCE → Excuse Letters; the accepted gap (a register open
elsewhere) is a KNOWN_ISSUES row.

**Given one section at a time during the check.** 📸 marks only the rows that
need a screenshot. Nothing in this file is a credential: sign-ins are read at
run time and never printed. **Never Tala or Tala's parent.**

## 0. Before the check — waits for its own go

- **The switch:** the main tree carries the branch (on the owner's word);
  `npx expo start --clear` and a cold boot of the phone (M7).
- **Who:** the web — **Maria Santos** (Grade 6 - Malikhain's adviser) and
  **Marwin's parent**, about **Marwin**; the phone (the Tecno, Expo Go) —
  **Lito Bautista** (Grade 1 - Mabait's adviser) and **Nino's parent**, about
  **Nino**. Both parents are at the seed contacts, unconfirmed, with no consent
  rows, so each meets **consent first (three ticks)**, then Confirm your
  contact: **Change → the project Gmail → Send code → the code** — never the
  address on file, never Mobile.
- **The days, picked by a read-only survey:** past CLASS days (weekdays inside
  the school year) on which that learner has **no attendance row and no
  letter yet**, so every row the check makes is new and the cleanup deletes it
  by id — for Marwin **D1–D4** and one weekend day **W1**; for Nino **E1–E2**
  and one weekend day **W2**. The survey prints the dates (dates only).
- **The start marks** (read-only): the next id of `excuse_letters`,
  `notifications`, `attendance`, `policy_acceptances` and `auth_codes`;
  `activity_logs`' highest id. A backup first; no direct insert.

## 1. Web — the marks and the letters

1. Maria Santos: Teacher → Attendance → Grade 6 - Malikhain → date **D2** →
   mark **Marwin Absent** only → Save; date **D3** → **Marwin Present** only →
   Save. (Nobody else is marked.)
2. Marwin's parent signs in (consent, the contact step). Parent → Excuse
   Letters: with no letters the empty state reads "Use Submit letter when your
   child is absent. If the adviser approves it, an absent or unrecorded class
   day is marked Excused; if declined, an unrecorded class day is marked
   Absent." 📸
3. Submit letter: the form's note is the same sentence. Five letters, one each
   for **D1, D2, D3, D4 and W1**.

## 2. Web — Maria Santos reviews (Teacher → Excuse Letters)

Each review: the note under the letter → Decision → Continue → the warning →
Yes → the line above the list.

4. **D1 — Approve.** Note: "<D1> has no attendance record yet. Approving
   records it as Excused; declining records it as Absent." Warning: "Approve
   this letter? <D1> will be recorded as Excused in attendance. The decision
   cannot be changed afterward." Line: "Letter from Conde, Marwin approved.
   <D1> was recorded as Excused." 📸
5. **D2 — Approve.** Note: "… is marked Absent. Approving changes it to
   Excused; declining leaves it Absent." Warning: "… changes from Absent to
   Excused in attendance. …". Line: "… is now Excused (was Absent)."
6. **D3 — Approve.** Note: "… is marked Present. Neither decision changes it."
   Warning: "… stays Present in attendance. The decision cannot be changed
   afterward." Line: "… stays Present."
7. **D4 — Decline.** Note as row 4. Warning: "Decline this letter? <D4> will
   be recorded as Absent in attendance. …". Line: "Letter from Conde, Marwin
   declined. <D4> was recorded as Absent."
8. **W1 — Approve.** Note: "<Saturday or Sunday, W1> is not a class day, so
   neither decision changes attendance." (the weekday named). Warning: "… is
   not a class day; attendance does not change. The decision cannot be changed
   afterward." Line: "… is not a class day; attendance was not changed." 📸
9. Teacher → Attendance, Malikhain, each date: Marwin **Excused** on D1 and D2,
   **Present** on D3, **Absent** on D4, nothing on W1; Teacher → Attendance
   records shows the same four days.
10. Marwin's parent: Parent → Attendance (reload): the month shows **E** on D1
    and D2, **P** on D3, **A** on D4, each with "Excuse letter · Approved /
    Declined"; W1 has no mark. 📸

## 3. The phone (Expo Go, the Tecno)

11. Lito Bautista: Teacher → Attendance → date **E2** → **Nino Absent** → Save.
    Then date **E1** — Nino unmarked — and leave the screen with nothing
    unsaved.
12. Nino's parent signs in (consent, the contact step) → Attendance: the month
    shows no mark on E1. Back to the dashboard (the screen stays mounted).
13. Nino's parent: Excuse Letters → Submit letter (the note is the owner's
    sentence) → letters for **E1, E2 and W2**.
14. Lito Bautista: Teacher → Excuse Letters → **E1 — Approve** (the phone's
    note, warning and notice: as rows 4's, with "Alcantara, Nino"). 📸
15. **E2 — Decline:** note "… is marked Absent. Approving changes it to
    Excused; declining leaves it Absent." → "… stays Absent in attendance." →
    "… stays Absent."
16. **W2 — Approve:** not a class day, its weekday named (row 8's words).
17. Lito: back to **Attendance** from the drawer — still on E1 — **without a
    pull** Nino now reads **Excused** (the focus re-read; the register had
    nothing unsaved). 📸
18. Nino's parent: open **Attendance** again from the drawer — **without a
    pull** E1 shows **E** with "Excuse letter · Approved" (the quiet focus
    re-read: no skeleton). 📸
19. Dark theme: the review screen at its warning. 📸

**Not by hand:** two reviews of one day at the same moment (the 409) — the
suite drives it (`test:excuses`, "Two reviews of one day at the same moment").

## 4. Cleanup (by id, backup first)

Health 200 → `POST /api/backups` 201 → a read-only survey → one transaction,
every statement by id from the start marks: the check's letters and their
notification rows; the attendance rows the check made (D1–D4, E1–E2 — all
new, picked so); both parents' consent rows and codes above the start marks;
the two parents' email and number back to the seed values (read from
`setup-db.js` at run time) with both confirmation stamps NULL; the seeded
passwords checked as a guard (pass or fail only, no restore); `activity_logs`
and `login_attempts` kept.

## 5. Result

PENDING.
