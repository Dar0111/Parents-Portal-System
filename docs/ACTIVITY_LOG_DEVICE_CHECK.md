# Activity log — device check (`feat/activity-log`, B2, built 2026-10-23/24; PASSED 2026-10-24)

The owner's check of B2: **Admin → Activity log** reads `activity_logs` newest
first by Manila day, account role and action, 50 a page, and downloads exactly
the filtered set as a CSV — **never an entry's details** (the owner's decision
D-21 of 2026-10-16 and the PLAN APPROVED of 2026-10-23). Rules: FRONTEND §36,
API_REFERENCE → Activity log; the three accepted rows are in KNOWN_ISSUES (the
description never selected, no index on `created_at`, Backup & Restore's
device-zone times).

**Given one section at a time during the check.** 📸 marks only the rows that
need a screenshot. Nothing in this file is a credential. **Never Tala or Tala's
parent, and no parent account at all:** every parent is at the seed contacts,
unconfirmed, so a parent sign-in would send a code — and nothing here needs a
parent (the suite proves a parent's `403`).

## 0. Before the check — waits for its own go

- **Where:** the laptop's Chrome at `http://localhost:3000`. **A web-only check
  works off the Tecno hotspot** (B2's plan, P8): `VITE_API_BASE_URL` is blank,
  so the page derives `localhost:5000`; `CORS_ORIGIN` lists the web's localhost
  origin; `DB_HOST` is local; the API listens on every interface. **The phone
  (§6) needs the hotspot** — `EXPO_PUBLIC_API_URL` is a LAN address — and is
  dropped unless the owner is already on it (C8); the phone proofs cover
  `WEB_ONLY`.
- **The switch:** the B2 worktree detached, then the main tree on
  `feat/activity-log` (on the owner's word); the API and Vite reload on it.
- **Who:** **the admin** (accepted, email confirmed) for §1–§4; **Maria
  Santos** (a seeded teacher, accepted, both contacts confirmed) for §5. Neither
  meets a code step.
- **The marks** (read-only): `activity_logs`' highest id, the `login_attempts`
  count, the next ids of `users` and `notifications`. Health, then a backup —
  the pre-check dump, not a restore point. No fixture.
- **As run (2026-10-24 01:26):** health 200; **backup 368**
  (`parents_portal_2026-10-24_012659.sql`, 2,663,879 bytes, footer present —
  the pre-check dump; 317 stays the restore point); the marks —
  `activity_logs` highest id 29652, `login_attempts` 16, `auth_codes` 11
  (highest 305; recorded because the owner's SMS test followed the check),
  `users` highest id 647, `notifications` 0; the B2 worktree detached at
  `774b98c` and the main tree switched to `feat/activity-log` at `774b98c`;
  `GET /api/activity-logs` with no token `401`, not `404` — the running API
  had reloaded on the branch.

## 1. Web, the admin, 1280 px, light — the page

1. The sidebar's **System** group: Backup & Restore, then **Activity log**
   (the clock icon). Open it. 📸
2. Under the title, the sentence, word for word: "Entries the portal records,
   such as sign-ins, changes and downloads. Newest first; times are in
   Philippine time. For a failed sign-in, a reset request or a password alert,
   Account is the account it concerned, which may not be who acted. An entry's
   details are not shown."
3. The filters: From and To at the last 7 days (today the last), Account role
   "All roles", Action "All actions". The list: **When / Account / Role /
   Action**, newest first — the top row is this sign-in ("Signed in", the
   admin's name, Admin, the time now, in Philippine time). No column header
   sorts. "Showing 1–50 of N"; Next, then Previous.

## 2. Web, the admin — the filters

4. Account role **Teacher** → Apply: every row Teacher.
5. Account role All roles, Action **Attendance set by an excuse decision**,
   From = To = **23 Oct 2026** → Apply: that day's rows, B8's check among them.
6. Action **All Attendance** (the group's first option) → Apply: every row an
   attendance label.
7. Action All actions, Account role **Deleted account** → Apply (the 7 days):
   the Account column reads "Deleted account", Role "—".
8. Account role All roles, From **16 Oct 2026**, To **17 Oct 2026** (both empty
   on the live data) → Apply: **"No entries — Nothing recorded from 16 Oct 2026
   to 17 Oct 2026."** with Reset. 📸 Then Action **Signed in** and role
   **Teacher** → Apply: **'No "Signed in" entries for teacher accounts from 16
   Oct 2026 to 17 Oct 2026.'**
9. From **23 Oct**, To **17 Oct** → Apply: refused under To — "To must be on or
   after From." — and the list unchanged.
10. **Reset**: back to the last 7 days, every role, every action; Reset gone.

## 3. Web, the admin — the CSV

11. Action "Attendance set by an excuse decision", From = To = 23 Oct → Apply →
    **Download CSV**: the file **`activity-log_2026-10-23_to_2026-10-23.csv`**
    and the line "Downloaded activity-log_2026-10-23_to_2026-10-23.csv." under
    the header.
12. Open it in Excel: **no garbled character**, eight columns — Entry, Date,
    Time (Philippine time), Account, Role, Group, Action, Action code — the
    rows newest first, each time equal to the page's. 📸
13. Reload the browser on the page (back to the 7 days): the top row is
    **"Downloaded the activity log"** by the admin.
14. Clear From and To → Apply (all dates, about 29,000 entries — under the
    50,000 cap) → Download CSV: **`activity-log_beginning_to_<today>.csv`**
    downloads and opens.

## 4. Web, the admin — dark and 390 px

15. Settings → Personalization → **Dark**, back to the Activity log: the page,
    the filters and the list in the dark theme. 📸
16. The browser at **390 px** (devtools' device bar), both themes: each entry
    a card — the action, then the account · role, then the time; the filters
    wrap; Download CSV within reach. 📸 Back to Light and the full width.

## 5. Web, Maria Santos — not hers

17. Sign out; Maria Santos signs in. The sidebar has **no Activity log**;
    typing `/admin/activity-log` lands on the teacher's home.

## 6. The phone — dropped unless already on the hotspot (C8)

18. The admin on the Tecno: the drawer has **no Activity log** item (and no
    Backup & Restore); nine items.

## 7. After the check

A read-only survey: every count at its §0 value but `activity_logs` (the
check's sign-ins and downloads — kept, as activity rows always are) and
`login_attempts` (only if a sign-in was mistyped). The check writes nothing
else, so there is no cleanup by id; the survey says so.

**As run (2026-10-24 02:08–02:11).** The owner's SMS test came after the
check, so its one row is cleaned up here. **The SMS test** (the owner's own
`.env`, not read): SMS switched to SMSGate Cloud mode and the 5000 API
restarted; `npm run sms:probe` answered reachable, http 200, gateway status
pass, then crashed at exit on a libuv assertion
(`!(handle->flags & UV_HANDLE_CLOSING)`, `src\win\async.c` line 76 — for B7,
CLAUDE.md NEXT); a Forgot password on Lito Bautista at about 02:04 delivered
the reset code by text to the Tecno. **The survey** (read only, against
§0): every count at its §0 value but `activity_logs` (+6 — Principal Admin's
sign-in at 01:34 and downloads at 01:43 and 01:51, Maria Santos's sign-ins at
01:40 and 01:53, the reset request at 02:04; kept) and `auth_codes` (+1 — id
466, Lito Bautista's `password_reset` of 02:04:17, unused); `login_attempts`
16, `notifications` 0. **Backup 369** (`parents_portal_2026-10-24_020902.sql`,
2,664,531 bytes, footer present — the pre-cleanup dump; 317 stays). **ONE
guarded transaction:** G1 the rows above 305 are exactly id 466, Lito
Bautista's, `password_reset`; G2 one row deleted; G3 `auth_codes` 11, highest
305 — committed. **After:** `auth_codes` 11 (highest 305), `notifications` 0;
the four seeded staff passwords still sign in (a guard only — no restore);
`test:recovery` **141/141** and `test:activity-log` **98/98** on 5001 with
file transports, from the B2 worktree (detached at `774b98c`); the survey
after them every seeded count at §0 but `activity_logs` (+59) and
`login_attempts` (16 → 17, `test:recovery`'s deliberate wrong-password
sign-in), both kept.

## 8. Result

**PASSED 2026-10-24 — §1–§5 on the web, every row, no findings, no fix
round.** §6 (the phone) dropped (C8). As run, where it differs from the
sheet:

- **Row 5** ran with role **Teacher** still set from row 4: 47 of 47 entries
  (the 51 is All roles; row 12's CSV shows the admin's rows that make the
  difference).
- **Row 7** ran with **All Attendance** still set from row 6, giving the empty
  state "No Attendance entries for deleted accounts from 18 Oct 2026 to 24 Oct
  2026."
- **Row 8b** ran with **All roles**, giving 'No "Signed in" entries from 16
  Oct 2026 to 17 Oct 2026.'
- **Row 9** ran with To = **13 Oct**.
- **Row 12** opened the CSV in **Google Sheets**, not Excel.
- **Row 14** downloaded the all-dates file (3.1 MB).

The check's own rows: three sign-ins and two downloads in `activity_logs`
(kept); nothing else. The cleanup above removed the SMS test's one
`auth_codes` row.
