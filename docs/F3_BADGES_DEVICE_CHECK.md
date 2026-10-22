# F3 badges — device check (`fix/f3-badges`, B3, 2026-10-22; PENDING)

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
the inserted `parent_pending` row, both parents' consent rows and codes above
the start marks, the two parents' email and number back to the seed values
(read from `setup-db.js` at run time) with both confirmation stamps NULL; the
seeded passwords checked as a guard (pass or fail only, no restore);
`activity_logs` and `login_attempts` kept.

## 7. Result

PENDING — §1–§5 passed, with the owner's adjustments: rows 12–14 redone
with one more Malikhain announcement; row 17 with one more Mabait
announcement and a Grade 1 event, posted by Lito Bautista on the web; the
letters approved instead of declined. §6 not run yet.

**Finding #1 (the owner) — fixed, re-check pending.** The parent dashboard's
Upcoming events card showed the next event's name too large, web and phone:
it went through the shared `Stat` (`text-xl font-bold`, a figure's size).
That card alone stops using `Stat` — `Stat` and the teacher dashboard's card
are unchanged. The name is now, as the owner asked, the web Messages card's
sender line (`text-sm font-semibold`) and, on the phone, the cards' line size
in bold (`text-sm font-bold`) — so the two weights differ on purpose; "Next
event · <date>" keeps `Stat`'s caption classes. The card's loading shape
(`skeleton="list"`, shared) still draws a figure-sized first row, so the
lines move up about 8px when it loads; left as it is.
