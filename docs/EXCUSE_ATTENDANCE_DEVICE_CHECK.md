# Excuse attendance — device check (`feat/excuse-attendance`, B8, built 2026-10-23; PASSED 2026-10-23)

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
  one of the three terms — the owner's answer of 2026-10-23) on which that
  learner has **no attendance row and no
  letter yet**, so every row the check makes is new and the cleanup deletes it
  by id — for Marwin **D1–D4** and one weekend day **W1**; for Nino **E1–E2**
  and one weekend day **W2**. The survey prints the dates (dates only).
- **The start marks** (read-only): the next id of `excuse_letters`,
  `notifications`, `attendance`, `policy_acceptances` and `auth_codes`;
  `activity_logs`' highest id. A backup first; no direct insert.

**As run (2026-10-23, 13:07–13:09):** health 200, then **backup 361**
(`parents_portal_2026-10-23_130719.sql`, 2,589,948 bytes, footer present —
the pre-check dump, not a restore point; 317 stays). The start marks, read
live: the next id of `excuse_letters` **675**, `notifications` **4000**,
`attendance` **527**, `policy_acceptances` **1501**, `auth_codes` **447**;
`activity_logs`' highest **28859**. The days: Marwin **D1** Mon 19 Oct,
**D2** Tue 20, **D3** Wed 21, **D4** Thu 22, **W1** Sun 18; Nino **E1** Thu
15 Oct, **E2** Fri 16, **W2** Sat 17 (2026), all free. No fixture. The
switch: the B8 worktree detached at `7c24e5c`, then the main tree on
`feat/excuse-attendance`; the API reloaded and answered 200, 3000 and 8081
kept running; Metro's `--clear` and the phone's cold boot were the owner's
(M7).

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

**Result, §1–§2 (the web): PASSED**, every row as written, with one
addition by the owner: a **sixth letter, for Fri 23 Oct** (the day of the
check, a class day with no mark), filed first and approved — a new
**Excused** row, the line "… was recorded as Excused". Row 2's 📸 (the
owner's 2b) was not taken; the phone's form (row 13) showed the owner's
sentence.

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

**Result, §3 (the phone): PASSED, reordered by the owner** because one
phone holds one account:

- Row 11 (the owner's P1): Lito marked Nino **Absent on Fri 23 Oct** instead
  of E2, so E2 stayed unrecorded.
- Lito approved the **E2 (16 Oct)** letter **on the web** while Nino's parent
  stayed signed in on the phone — an unrecorded class day, so a new
  **Excused** row, not row 15's decline over Absent.
- Rows 14 (E1, 15 Oct: Approve, a new Excused row), 16 (W2, Sat 17 Oct: not
  a class day, nothing written) and 19 (the dark theme) on the phone, by
  Lito.
- Row 17 (P12, the register's focus re-read) and row 18 (R6, the parent's)
  passed. A re-test of the parent's: Lito changed Nino's 23 Oct to
  **Present** on the web, and the parent's Attendance showed it on focus,
  without a pull.
- **Row 15's cell — a decline over Absent stays Absent — was not exercised
  by hand.** `test:excuses` ("class day 7: decline over Absent → nothing
  written") and `test:excuse-attendance-rule` (`decide()` and the parity
  proof) cover it.

**Not by hand:** two reviews of one day at the same moment (the 409) — the
suite drives it (`test:excuses`, "Two reviews of one day at the same moment");
and a weekday in the December break (not a class day, so no write — the
owner's answer of 2026-10-23): a letter cannot be dated in the future, so
none can name a break day before 19 December; `test:excuses` moves a letter's
stored date into the break and reviews it.

## 4. Cleanup (by id, backup first)

Health 200 → `POST /api/backups` 201 → a read-only survey → one transaction,
every statement by id from the start marks: the check's letters and their
notification rows; the attendance rows the check made (D1–D4, E1–E2 — all
new, picked so); both parents' consent rows and codes above the start marks;
the two parents' email and number back to the seed values (read from
`setup-db.js` at run time) with both confirmation stamps NULL; the seeded
passwords checked as a guard (pass or fail only, no restore); `activity_logs`
and `login_attempts` kept.

**As run (2026-10-23, 18:16–18:19), the check accounts signed out on every
device first:** a read-only survey (every row above the start marks traced
to the four accounts; every table backup 361 holds rows for compared with
it row by row) and the baseline, both matching; health 200; **backup 362**
(`parents_portal_2026-10-23_181651.sql`, 2,597,542 bytes, footer present —
the pre-cleanup dump, not a restore point; 317 stays). ONE transaction by id
— G1–G13 passed, the five seeded passwords included, so no restore; W1–W7
at 18, 8, 9, 4, 2, 1, 1 rows (notifications 4000–4017, attendance 527–534,
letters 675–683, acceptances 1501–1504, codes 447–448, #3 and #7 back to the
seed contacts with both stamps NULL); COMMIT. Verified: users 8, students 4,
grades 5 (all unlocked); attendance, `excuse_letters`, notifications,
messages, `grade_acknowledgements`, announcements, memos and events 0;
acceptances 8 (max id 796), `auth_codes` 11 (max id 305), backups 124;
every table backup 361 holds rows for equal to it but #3's and #7's
`updated_at`; `activity_logs` (+47: the check's 45, the backup's two) and
`login_attempts` (12) kept. Then **`test:excuses` 121/121** on 5001 from the
B8 worktree with file transports, and the same state after it but
`activity_logs` (+78, kept).

## 5. Result

**PASSED 2026-10-23 — no findings, no fix round.** §1–§2 on the web; §3 on
the Tecno in Expo Go, reordered as recorded there. The database's record of
the check, read before the cleanup: 9 letters (#675–#683 — Marwin's six,
the sixth for 23 Oct, and Nino's three), 8 attendance rows (#527–#534), 18
notifications (9 submitted, 9 reviewed), 4 acceptances, 2 codes, no
message; **six `excuse_attendance` activity rows, exactly the six days a
decision changed** — 19, 20, 22 and 23 Oct for Marwin, 15 and 16 Oct for
Nino — and none for 21 Oct (Present stays), 18 Oct or 17 Oct (not class
days): Q5 on live data. `login_attempts` went 19 → 12: the app's own
24-hour prune ran at Nino's parent's first failed sign-in (9 old rows gone),
and that account's two failed sign-ins added two. The cleanup: §4.
