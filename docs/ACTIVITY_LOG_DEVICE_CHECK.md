# Activity log — device check (`feat/activity-log`, B2, built 2026-10-23/24; waits for its go)

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

## 8. Result

PENDING — the device check waits for its own go.
