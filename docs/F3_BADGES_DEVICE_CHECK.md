# F3 badges — device check (`fix/f3-badges`, B3, 2026-10-22/23; PASSED)

The owner's check of the smoke gate's F3: **visiting a badged page clears
the INFORMATION notifications its badge counts; a call to act keeps clearing
only on the decision** (the owner's decision of 2026-10-22). Rules: FRONTEND
§34, MOBILE M31, API_REFERENCE → Notifications (`PATCH /read-all
{ section }`); the accepted gaps are a KNOWN_ISSUES row.

**Given one section at a time during the check.** 📸 marks only the rows
that need a screenshot. A badge is the sidebar's (web) or the drawer's
(phone) number on a nav item; the bell is the header's. Nothing in this file
is a credential: sign-ins are read at run time and never printed.

## 0. Before the check — waits for its own go

- **The switch:** the main tree carries the branch (on the owner's word);
  `npx expo start --clear` and a cold boot of the phone (M7).
- **Who:** the web — the admin, **Maria Santos** (Grade 6 - Malikhain's
  adviser) and **Marwin's parent**; the phone (the Tecno, Expo Go) — **Lito
  Bautista** (Grade 1 - Mabait's adviser) and **Nino's parent**. **Never**
  Tala's parent. Both parents are at the seed contacts, unconfirmed, with no
  consent rows, so each meets **consent first (three ticks)**, then Confirm
  your contact: **Change → the project Gmail → Send code → the code** —
  never the address on file, never Mobile.
- **The start marks** (read-only): the next id of `notifications`,
  `announcements`, `memos`, `events`, `excuse_letters`,
  `policy_acceptances` and `auth_codes`; `activity_logs`' highest id.
- **After a backup, ONE direct insert by id:** a `parent_pending`
  notification for the admin about the seeded pending parent account (Jea's
  parent) — the Users badge, without creating an account. Recorded: its id.
- **Two run-sheet corrections, given with §0's go:** for rows 13–14 the
  second admin tab is opened FIRST, on another page, so the self-signal has
  somewhere to land; and one phone holds one account, so rows 17 and 19 are
  Lito Bautista's on the web while Nino's parent stays on the phone.

## 1. The posts — made in the app

1. The admin (web): Admin → Announcements → a school-wide announcement, and
   a memo.
2. Maria Santos (web): an announcement for Grade 6 - Malikhain, and an event
   for Grade 6 dated next week.
3. Lito Bautista (phone): an announcement for Grade 1 - Mabait.

## 2. Marwin's parent — web

4. Sign in (consent, the contact step). The sidebar: **Announcements 2**
   (the school-wide one and Malikhain's), **Memos 1**, **Events 1**; the bell
   counts the same four. 📸
5. Parent → Announcements: once the list shows, **the Announcements badge is
   gone** and the bell's count falls by 2; open the bell — the two
   announcement rows read (no dot), the memo and the event still unread. 📸
6. Memos → its badge gone; Events → its badge gone (the event is next week,
   so it is on Upcoming).
7. Reload Announcements: nothing changes; no badge comes back.

## 3. A letter — the call to act and the information

8. Marwin's parent submits an excuse letter. Maria Santos's **Excuse
   Letters badge reads 1**.
9. Maria Santos opens Teacher → Excuse Letters: **the badge STAYS 1** — a
   call to act clears on the decision, not on a visit. 📸
10. She declines it with a remark: her badge goes to 0 (the self-heal).
11. Marwin's parent: **Excuse Letters 1** ("declined") → Parent → Excuse
    Letters → **the badge is gone** (a declined letter is information). 📸

## 4. The admin — web

12. The sidebar: **Announcements 2** (Maria's and Lito's — the admin's own
    posts never notify the admin) and **Users 1** (the inserted row).
13. Admin → Announcements → **the badge is gone**; Admin → Users → **the
    badge STAYS 1**. 📸
14. With a second admin tab open on another page, a visit in the first tab
    drops the badge in the second without a reload (the self-signal). 📸

## 5. The phone (Expo Go, the Tecno)

15. Nino's parent signs in (consent, the contact step): **Announcements 2**
    (the school-wide one and Lito Bautista's Mabait post), **Memos 1**,
    Events none (Grade 6 only); the menu button says "Open menu, 3 unread".
16. Open Announcements: once the list shows, **its badge is gone**, and the
    menu button's count falls. 📸
17. Lito Bautista posts another Mabait announcement. Nino's parent, still on
    Announcements: the badge comes back (1); **pull to refresh → gone**. 📸
18. Open Memos → gone. Back to Announcements: it re-reads on focus, the list
    stays on screen while it does.
19. Nino's parent submits a letter on the phone; Lito Bautista opens Teacher
    → Excuse Letters: **his badge STAYS 1**; he reviews it: 0.
20. Dark theme: one badged screen. 📸

## 6. Cleanup (by id, backup first)

Health 200 → `POST /api/backups` 201 → one transaction, every statement by
id from the start marks: the check's announcements, memos and events (their
notification rows with them), the two letters and their notification rows,
the inserted `parent_pending` row, the message the check sent (an unscripted
step, row 9), both parents' consent rows and codes above the start marks, the
two parents' email and number back to the seed values (read from
`setup-db.js` at run time) with both confirmation stamps NULL; the seeded
passwords checked as a guard (pass or fail only, no restore);
`activity_logs` and `login_attempts` kept. Then `test:notifications` on 5001
with file transports.

**Result (2026-10-23, 05:24–05:28; the plan approved as written, the
owner's Q1–Q6).** A read-only survey first (04:52): every row above the
marks was the check's or the smoke run's, nothing unexplained. Health 200 →
**backup 354** (`parents_portal_2026-10-23_052443.sql`, 2,497,921 bytes,
footer present) — **the pre-cleanup dump: it still holds the check's rows,
so it is not a restore point; the restore point stays 317.** Guards G1–G13
all passed (the five seeded passwords passed, so nothing was restored; users
1, 2, 4, 5, 6 and 647 unchanged by one digest; #3's and #7's other columns
untouched, compared before and after the writes). W1–W11 at exactly **1, 29,
2, 5, 1, 2, 1, 4, 3, 1, 1** rows: notification 3577 (the §0 insert) and
3578–3606 (the fan-out); letters 572 and 573; announcements 392–396; memo
132; events 262 and 263; message 622; acceptances 1361–1364; codes 427–429
(#428 was #7's first email change, 10/22 17:51, overtaken by #429 the next
morning); #3 and #7 back to the seed contacts. COMMIT at 05:25:03.
**After:** users 8, students 4, grades 5 all unlocked, `excuse_letters`,
notifications, messages, `grade_acknowledgements` and attendance 0;
announcements, memos and events 0 (their §0 counts); `policy_acceptances` 8
(highest 796), `auth_codes` 11 (highest 305); backups 120, the newest 354;
every other table at its count; `activity_logs` and `login_attempts` kept.
**`test:notifications` 226/226** on 5001 at 05:27, and the same state after
it. What the smoke run of 10/23 (04:11–04:17, `c248c51`'s gate) left: 25
sign-in rows (kept) and five of the check's notifications marked read by its
visits (deleted with the rest).

## 7. Result

**PASSED — §1–§5, one finding, fixed in `c248c51` (parent) and `ce9f111`
(teacher) and re-checked on the web and the phone (2026-10-22/23; the admin,
Maria Santos and Marwin's parent on the web in Chrome; Nino's parent on the
Tecno via Expo Go; Lito Bautista on the phone, and on the web for rows 17
and 19).** The owner's adjustments: rows 12–14 redone with one more
Malikhain announcement; row 17 with one more Mabait announcement and a
Grade 1 event, posted by Lito Bautista on the web; both letters approved
instead of declined, so row 11 read "approved" — information all the same.
One line per section:

- **§0 DONE** (10/22, 15:31–15:33) — **backup 353**
  (`parents_portal_2026-10-22_153141.sql`, 2,489,074 bytes, a pre-write
  dump), the insert #3577 at 15:32:29, the start marks, the switch of the
  main tree to the branch (the API reloaded at 15:32:42).
- **§1 PASS** (16:59–17:02) — announcements 392 (school-wide), 393
  (Malikhain), 394 (Mabait), memo 132, event 262.
- **§2 PASS** (17:08–17:13) — rows 4–7 after consent and the contact step;
  each page's badge gone once its list showed, the bell's rows read.
- **§3 PASS** (17:14–17:19) — rows 8–11; a message from Maria Santos to
  Marwin's parent (17:14, unscripted, cleaned up in §6); the letter 572
  approved, its call to act cleared on the decision, not on the visit.
- **§4 PASS** (17:25–17:47) — rows 12–14, redone with announcement 395; the
  second tab's badge dropped without a reload.
- **§5 PASS** (10/22 17:51 – 10/23 03:57) — rows 15–20; Nino's parent's
  contact step finished on the morning of 10/23; announcement 396 and event
  263 by Lito Bautista on the web; letter 573 approved; the re-read on focus.
- **Finding #1** — below; fixed and re-checked on 10/23, web and phone.
- **§6 DONE** (10/23, 05:24–05:28) — above.

**Finding #1 (the owner) — fixed and re-checked.** The parent dashboard's
Upcoming events card showed the next event's name too large, web and phone:
it went through the shared `Stat` (`text-xl font-bold`, a figure's size).
That card stops using `Stat` (`c248c51`), and so does the teacher
dashboard's Upcoming events card, whose lead was built the same way (approved
by the owner for the same fix; the rows below the lead differ between the two
cards and are untouched); `Stat` and every other card are unchanged. On both
dashboards the name is now, as the owner asked, the parent dashboard's
Messages sender line on the web (`text-sm font-semibold`) and, on the phone, the cards' line size
in bold (`text-sm font-bold`) — so the two weights differ on purpose; "Next
event · <date>" keeps `Stat`'s caption classes. The card's loading shape
(`skeleton="list"`, shared) still draws a figure-sized first row, so the
lines move up about 8px when it loads — accepted by the owner (Q3), an OPEN,
accepted KNOWN_ISSUES row; no fix now. The rule went into FRONTEND §15e and
§24 and MOBILE M23: an event's name is a line, not a figure.
