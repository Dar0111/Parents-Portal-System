# The first sign-in — device check (`feat/first-signin`, 2026-10-18; RUN 2026-10-20/21 — PASSED)

The owner's check of branch 1 of the pre-Oct-21 build (the owner's order:
the first sign-in → account creation → the password alert → acknowledgement →
F3 → the Activity log). It covers scope items 2 and 3: consent → a confirmed
Gmail or mobile number → your own password; your own email; the 60-second
resend cooldown. Rules: FRONTEND §29f, MOBILE M26, API_REFERENCE §5b.

**Given one section at a time during the check.** 📸 marks only the rows that
need a screenshot. Every expected sentence is the exact copy on screen.

## 0. Before the check

- **The switch** (on the owner's word "switch"): the worktree is detached and
  the main tree checks out `feat/first-signin`; the `--watch` API reloads.
  Then `npx expo start --clear` and a cold boot of the emulator (M7).
- **What changes the moment this runs:** every account with no confirmed
  email and no confirmed mobile number meets "Confirm your contact" at its
  next sign-in — the seeded teachers and parents included. On the live
  database today one account has a confirmed email; every other staff account
  will ask. A browser tab already signed in gets refusals until it reloads.
- **SMS:** the SMSGate app on the owner's phone, on the same network, for the
  rows that send a text. Mail goes to real inboxes — use the project Gmail.
- **Never** sign in as Tala's parent.

**Prep (the owner, on the web):**

- **P1 — as admin:** Admin → Users → Create teacher: a fictional check teacher.
  Leave Email and Contact number BLANK (the fields go in the next branch); choose
  the password yourself.
- **P2 — as the Grade 1 - Mabait adviser:** enrol a fictional check learner and
  create its parent account (email and contact blank); then **as admin**,
  approve it.

## 1. The check teacher, web — the first sign-in

1. Sign in with the temporary password. The consent screen: "Before you
   continue", two ticks, "I agree and continue". Tick both and continue.
2. The next screen reads **"Confirm your contact"** / "Choose your Gmail or
   your mobile number. We’ll send a 6-digit code to it. One is enough — you can
   add the other later in Settings." Two choices, **Gmail** (selected) and
   **Mobile number**; a field labelled "Gmail" with "Use an address you can
   open now — a Gmail works." under it; the button **Send code**; under the
   card only **Sign out** — no Back, no Skip. 📸
3. Type the project Gmail and press Send code. It reads "We sent a 6-digit code
   to <the address>." with **Change** beside it, a "6-digit code" field ("It
   expires in 10 minutes and can be used once."), **Confirm** (disabled until
   six digits) and **Resend code in 0:59**, counting down. 📸
4. At 0:00 the button reads **Resend code**. Press it; a second code arrives.
   Type the FIRST code: "That code is not valid. Request a new one." under the
   field.
5. Press **Sign out**, then sign in again: straight to "Confirm your contact"
   (consent is done), the address now shown read-only with **Change**.
6. The browser's Back, and a reload: still "Confirm your contact".
7. Send a code, type it, Confirm. The next screen is **"Set a new password"**
   with only "New password" and "Confirm new password" — **no "Temporary
   password"** — and **Save password**. 📸
8. Type a password with no number: the checklist leaves "at least one number"
   unticked and Save password stays disabled.
9. Type the temporary password as the new one (both fields), Save: "Choose a
   new password, not the temporary one." under New password.
10. A good new password: the teacher dashboard. Sign out; the temporary
    password no longer signs in ("Invalid login credentials.").

## 2. The seeded staff accounts — the demo prep (the next system check is Mon 2026-10-26)

11. Each seeded teacher, web or phone: sign in → **no consent screen when the
    account's two draft-1 acceptance rows already exist** (the seeded staff's
    do, from the 2026-10-12/13 checks; the gate is only that count,
    `utils/policy.js`; a fresh `db:setup`, or a restore of a dump without
    those rows, shows the screen again) → "Confirm your contact" with the
    seeded address on file. **Press Change FIRST**, type the project Gmail,
    Send code, Confirm → the dashboard. No password step (these accounts are
    not in the forced state).
12. One teacher chooses **Mobile number** instead: type the number, Send code —
    the text arrives through SMSGate — Confirm → the dashboard. 📸 (the text)

## 3. A temporary password on a confirmed account — "Confirm it’s you" (D2)

13. As admin: Admin → Users → Reset password for a teacher confirmed in §2. The
    dialog after it reads "Give this to <name>. When they next sign in, they
    confirm their Gmail or mobile number with a code, then choose their own
    password." 📸 That teacher signs in with it: **"Confirm it’s you"** /
    "Before you set a new password, we’ll send a 6-digit code to your confirmed
    Gmail or mobile number.", the confirmed contact read-only with Change. Send
    code → the code → "Set a new password" → Save password → the dashboard. 📸
    **Change stays on this step — the owner's decision, 2026-10-21 (the D2
    follow-up), reaffirmed by the owner on 2026-10-21 00:13: the admin's
    temporary-password reset stays in the local version, and Change stays on
    this step.** A teacher who lost that phone or that inbox would otherwise
    be stuck.

## 4. The check parent, phone (the Tecno, Expo Go)

14. Sign in → the consent screen (three ticks) → "Confirm your contact" →
    choose **Mobile number**. Press the **Android back button**: nothing
    happens; still on the step. 📸
15. Type the number, Send code, the text, Confirm → "Set a new password" →
    Save password → Home.
    **On the run (2026-10-21):** a SECOND fake learner and parent, enrolled by
    the Grade 1 - Mabait adviser (Lito Bautista) during the check, because the
    first fake parent had already finished its first sign-in on the web.
    Row 14's Android back button was verified during §7's parent variant.

## 5. Forgot password — the resend clock (web and phone)

16. Sign out. "Forgot password?" → Login ID → Send code → "If this account has
    a confirmed email or mobile number, we sent a code to it." and **Resend
    code in 0:59** (disabled). Press it at 0:00 → the clock starts again. The
    same on the phone. **The second request must be for the SAME Login ID:**
    Resend re-sends for the id typed in step one; to press Send code again
    inside the minute, "Use a different Login ID" → the same id → Send code.
    Two different ids are two accounts, and each one sends, which proves
    nothing about the minute. **The reply never changes:** a send, the
    minute's cooldown, the hour's limit, an unknown id and a failed send all
    answer the same 202 and sentence, and the clock starts on every 202
    (`routes/auth.js` forgot-password; `ForgotPassword.jsx`). So "no code
    arrived" is read on the server, never on the screen: a `password_reset`
    row in `auth_codes` exists only for a real send; `activity_logs` carries
    `password_reset_requested` when a channel delivered and
    `password_reset_email_failed` / `password_reset_sms_failed` when it did
    not. **The limits** (`utils/authCodes.js`): 3 codes per account per
    purpose per rolling hour and 10 per IP per hour, a row counting from the
    moment it is written, burned rows included. Only the signed-in verify
    endpoints ever say "Too many codes requested…".

## 6. Your own email — Settings → Account information

17. Web: Settings → Account information → **Update email** → "New email
    address" → **Save email**. Three cases (`AccountInfoSection.jsx`
    `saveEmail`; `PUT /auth/email` unconfirms a changed address and never
    touches the number):
    - **(a) the email is the ONLY confirmed contact:** the hint under the
      field reads "You’ll confirm the new address before you can use the app
      again."; Save → the app goes to "Confirm your contact" with the new
      address on file, Gmail selected, the address read-only with Change →
      Send code → the code → the dashboard, no password step. (Run as step
      18.)
    - **(b) another contact is confirmed and a confirmed email is changed:**
      the page stays: "Email address updated. The new address is not
      confirmed yet — send yourself a code above to confirm it." In the Email
      address block above: "Not confirmed", **Verify email** → the code form
      ("Sent to <the address>. It expires in 10 minutes and can be used
      once.", "Resend code in 0:59") → the code → "Email confirmed. You can
      now reset your own password." (Seen verbatim on the check parent after
      (c), 2026-10-21.)
    - **(c) no email yet, a confirmed mobile number, adding one:** the block
      first says reset codes can still come to the confirmed number; Save →
      "Email address updated. Confirm it with a code above.", then (b)'s
      Verify email path. (On the check parent, 2026-10-21: the Save sentence
      was not captured — it is read from the code — and the Verify email
      path was seen: "We sent a code to your email address.", the "Sent to …"
      hint, "Email confirmed…".)
18. Case (a) on the check teacher, whose email is its only confirmed contact:
    the hint, the gate, the code, the dashboard. Typing the original address
    back is a change too, so one inbox is enough.
19. Phone: the same **Update email** card (its Save email is a bordered button;
    the screen's one filled button stays Save contact number).

## 7. An admin edit unconfirms the address

20. As admin: Admin → Users → Edit → Email → **a genuinely different
    address** (the admin PUT compares in SQL under the column's collation, so
    a re-cased address may not count as a change) → Save → "User updated.".
    Two halves, on two kinds of account:
    - **"Not confirmed" in that person's Settings** needs an account with a
      SECOND confirmed contact, or the gate blocks Settings: open Account
      information fresh (it re-reads on mount) → the new address with the
      "Not confirmed" pill; the account stays in the app and the number stays
      confirmed. (Run on the check parent, 2026-10-21.)
    - **"Confirm your contact" at the next sign-in** applies when the edited
      email was the only confirmed contact (the gate re-reads the row on
      every request; the client moves on its next `/auth/me`, so sign out
      and in): the address read-only with Change, Send code, the code, the
      dashboard. The same for the Contact number field. **If the admin
      CLEARS the email, the gate shows an empty Gmail field.** (Run on the
      check teacher, 2026-10-21, by clearing: the empty field, stopped there
      without a code. The parent variant, the Contact number: §9.)

### Steps 16–20 — the accounts and the order

T = the check teacher (email its only confirmed contact), P = the check
parent (mobile its only confirmed contact; it signs in on the web too). The
order keeps each account in the state its step needs and costs four Gmail
codes plus step 16's (one, two with the Resend):

| Step | Account | Codes |
|---|---|---|
| 16 | T, signed out, web (the phone run fills P's `password_reset` bucket, 3 per hour) | 1 Gmail, 2 with the Resend |
| 17 (c) | P: adds the project Gmail, confirms it | 1 Gmail |
| 17 (b) | P, after (c): changes to a second inbox, confirms it | 1 Gmail |
| 18 = 17 (a) | T | 1 Gmail |
| 20, "Not confirmed" | admin edits P's email, P opens Settings | none |
| 20, the gate | admin edits T's email (or P's number), or clears it; next sign-in; stopping at the gate costs nothing | 1 Gmail or SMS, or none |

## 8. After the check — cleanup (by id, backup first)

The check teacher, learner and parent by id, with their `auth_codes` rows and
acceptance rows; `activity_logs` rows stay. **The seeded staff's confirmations
from §2 stay** — they are the demo prep — and any address changed in §6–§7 goes
back to the project Gmail (the owner's word).

**Done 2026-10-21 (plan approved; one transaction after backup 324,
`parents_portal_2026-10-21_021335.sql`):** the check teacher (users 982), the
two fake parents (983, 984) and their learners (students 1450, 1451); their
10 `auth_codes` rows, 6 acceptance rows and the admin's 2 `parent_pending`
bell rows (`notifications.item_id` has no FK, so a by-hand user delete takes
them in the same transaction, §10); the 49 `activity_logs` rows stayed,
`user_id` set NULL by the FK. Users 11 → 8, students 6 → 4, acceptances
14 → 8. §6–§7 ran on the check accounts, so no seeded address needed
restoring.

## 9. Result — 2026-10-20/21, laptop Chrome (3000), the Tecno phone in Expo Go (8081), SMSGate in local mode

**Every section PASSED; no app finding, so no fix round.** The owner ran it
one section at a time.

- **0 / P1 / P2:** the switch, the hotspot addresses; the check teacher by
  the admin; the first fake learner and parent by Maria Santos (Grade 6 -
  Malikhain).
- **1. The check teacher, web — PASS** (rows 1–10).
- **2. The seeded staff — PASS** (rows 11–12): Maria Santos and Ana Reyes by
  Gmail, Lito Bautista by mobile number through SMSGate; Ana Reyes last, on
  2026-10-21. No consent screen: their draft-1 rows already existed.
- **3. "Confirm it’s you" (D2) — PASS** on Maria Santos (row 13); Change
  stays on the step (the owner, 2026-10-21 00:13).
- **4. The check parent, phone — PASS** (rows 14–15) on the SECOND fake
  parent (Grade 1 - Mabait, enrolled by Lito Bautista), by mobile number;
  the first fake parent had already finished its first sign-in on the web.
  Row 14's Android back button: verified in §7.
- **5. Forgot password — PASS.** The minute rule rests on the PHONE run, on
  one account: a second Send code inside the minute delivered nothing,
  Resend at 0:00 delivered one. The web half verified the one reply, the
  disabled clock, and Resend at 0:00 restarting the clock and delivering;
  its inside-the-minute press used a DIFFERENT Login ID, which is a second
  account and sends, so it proves nothing about the minute (row 16 says so
  now).
- **6. Your own email — PASS** (rows 17–19): 17 (c) on the check parent —
  the Save sentence was not captured (it is read from the code), the Verify
  email path seen ("We sent a code to your email address.", "Sent to … It
  expires in 10 minutes and can be used once.", "Email confirmed. You can
  now reset your own password."); 17 (b) on the same parent after (c) — the
  sentence seen verbatim, then Verify email → "Email confirmed…"; 18 = 17 (a)
  on the check teacher — the hint, the gate, the code, the dashboard; 19
  the phone card.
- **7. The admin edit — PASS**, both halves and the parent variant. "Not
  confirmed", on the check parent: the admin changed its email; Settings
  showed the new address "Not confirmed"; it stayed in the app; the mobile
  number stayed confirmed. The gate, on the check teacher: the admin CLEARED
  its email; the next sign-in showed "Confirm your contact" with an empty
  Gmail field; the run stopped there without sending a code. The parent
  variant: the admin changed the check parent's Contact number; next sign-in
  "Confirm your contact" with the new number on file, no consent screen,
  Android back did nothing, Change to a reachable number, Send code, Confirm,
  Home, no password step.
- **Seeded accounts changed and KEPT:** Maria Santos (email and number
  confirmed, her own password after the D2 temporary one), Ana Reyes (Gmail
  confirmed), Lito Bautista (number confirmed); their 8 acceptance rows,
  `auth_codes` and `activity_logs` untouched.
- **8. Cleanup — done,** backup 324 (above); the owner's browser check after
  it: Users 8, Students 4, an empty admin bell, Maria Santos still signs in.
