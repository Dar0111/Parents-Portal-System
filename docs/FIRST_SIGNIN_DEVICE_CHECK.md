# The first sign-in — device check (`feat/first-signin`, 2026-10-18)

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

## 2. The seeded staff accounts — this is the Oct 21 demo prep

11. Each seeded teacher, web or phone: sign in → (consent, if asked) →
    "Confirm your contact" with the seeded address on file. **Press Change
    FIRST**, type the project Gmail, Send code, Confirm → the dashboard. No
    password step (these accounts are not in the forced state).
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
    (Change is allowed here on purpose: a teacher who lost that phone would
    otherwise be stuck.)

## 4. The check parent, phone (emulator)

14. Sign in → the consent screen (three ticks) → "Confirm your contact" →
    choose **Mobile number**. Press the **Android back button**: nothing
    happens; still on the step. 📸
15. Type the number, Send code, the text, Confirm → "Set a new password" →
    Save password → Home.

## 5. Forgot password — the resend clock (web and phone)

16. Sign out. "Forgot password?" → Login ID → Send code → "If this account has
    a confirmed email or mobile number, we sent a code to it." and **Resend
    code in 0:59** (disabled). Press it at 0:00 → the clock starts again. Two
    requests inside one minute deliver ONE email (check the inbox). The same
    on the phone.

## 6. Your own email — Settings → Account information

17. Web: **Update email** → "New email address" → another address you can open
    → **Save email** → "Email address updated. The new address is not confirmed
    yet — send yourself a code above to confirm it." In the Email address block
    above: **Verify email** → the code form with "Resend code in 0:59" → the
    code → "Email confirmed. You can now reset your own password."
18. On an account whose email is its ONLY confirmed contact, type a new address:
    the hint under the field reads "You’ll confirm the new address before you
    can use the app again." Save → the app goes to "Confirm your contact" with
    the new address on file.
19. Phone: the same **Update email** card (its Save email is a bordered button;
    the screen's one filled button stays Save contact number).

## 7. An admin edit unconfirms the address

20. As admin: Admin → Users → edit a confirmed teacher's email. That teacher's
    Settings shows the new address "Not confirmed"; if it was their only
    confirmed contact, their next sign-in shows "Confirm your contact".

## 8. After the check — cleanup (by id, backup first)

The check teacher, learner and parent by id, with their `auth_codes` rows and
acceptance rows; `activity_logs` rows stay. **The seeded staff's confirmations
from §2 stay** — they are the demo prep — and any address changed in §6–§7 goes
back to the project Gmail (the owner's word).
