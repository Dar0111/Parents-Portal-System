# Account creation and the password alert — device check (`feat/account-create` + `feat/password-alert`, 2026-10-21; ONE sheet, D-79)

The owner's check of branches 2 and 3 of the pre-Oct-21 build, run together
on the owner's word (D-79; the order: the first sign-in → account creation →
the password alert → acknowledgement → F3 → the Activity log). Two decisions:
**Create Teacher and Create Parent drop the Email and Contact fields**
(2026-10-16) — the web's three forms, the phone's two screens, and the two
POST handlers refuse a value with `400` "no longer collected" naming the
field; and **after a password change a confirmation alert goes out, like
Facebook's "was this you?"** (2026-10-14/16) — to the Gmail or the number,
any confirmed one, all four paths, no code and no link. Rules: FRONTEND §29g
and §29h, MOBILE M15, M17 and M26, API_REFERENCE §5b and §8.

**Given one section at a time during the check.** 📸 marks only the rows that
need a screenshot. Every expected sentence is the exact copy on screen or in
the message; the first-sign-in screens' copy is
`docs/FIRST_SIGNIN_DEVICE_CHECK.md`'s, verified 2026-10-20/21.

## 0. Before the check

- **The switch** (on the owner's word "switch"): the worktree is detached and
  the main tree checks out `feat/password-alert`, which carries
  `feat/account-create`; the `--watch` API reloads with the owner's REAL mail
  and SMS transports (the `.env`'s SMTP and gateway settings — not `file`).
  Then `npx expo start --clear` and a cold boot of the phone (M7).
- **Who skips what.** ADMIN001 and the seeded teachers Maria Santos (2), Ana
  Reyes (5) and Lito Bautista (6) skip the consent screen (their draft-1
  acceptance rows exist) and meet no contact gate (each has a confirmed
  contact). The NEW accounts this check creates meet all three steps, with
  an EMPTY contact field — there is nothing on file, so no Change.
- **Who hears the alert, by id** (the read-only survey of 2026-10-21): ADMIN001
  (1) the email; **Maria Santos (2) BOTH**; **Ana Reyes (5) the email only**;
  **Lito Bautista (6) the number only**; Marwin's parent (3), Nino's parent
  (7), Jea's parent (4, pending) and Ligaya Halimbawa (647) nothing. An
  account with nothing confirmed cannot reach Settings at all — the contact
  gate lets through only the six contact endpoints, `/auth/me` and the policy
  pages (`server/utils/accountGates.js:50–61`), and Change password passes no
  gate (`:20–21`) — so this sheet has no "nothing confirmed" row;
  `test:recovery` proves that case (no message, one `password_alert_not_sent`
  row).
- **SMS:** the SMSGate app on the Tecno, local mode, on the hotspot; its SIM
  SENDS the texts. The number Maria and Lito confirmed must be a phone in the
  room — the texts arrive THERE. Mail goes to the project Gmail.
- **The start marks, written down before row 1** (read-only): `auth_codes`'
  highest id and the time. The cleanup deletes codes above that id only.
- **The seeded passwords are typed back wherever the app accepts a value**
  (rows 12, 13 and 15 — the owner's correction 3). The cleanup checks each
  seeded hash against the seeded password and restores only a failure, by
  id (D-86).
- **Never** sign in as Tala's parent.

## 1. Create teacher, web (ADMIN001)

1. Admin → Users → **Create teacher**: the dialog "Create teacher" holds
   **Login ID**, **Password** (with the checklist) and **Name** — **no Email,
   no Contact number**. 📸
2. A fictional check teacher, a password you choose → Create → above the list:
   "Teacher account created and activated. Login ID: <the id>."

## 2. The new teacher's first sign-in, web — and the first alert

3. Sign in with that password → "Before you continue", two ticks, "I agree and
   continue" → **"Confirm your contact"** / "Choose your Gmail or your mobile
   number. We’ll send a 6-digit code to it. One is enough — you can add the
   other later in Settings.", Gmail selected, an **EMPTY** "Gmail" field with
   "Use an address you can open now — a Gmail works." under it, no Change. 📸
4. The project Gmail → Send code → "We sent a 6-digit code to <the address>."
   → the code → Confirm → **"Set a new password"** (no Temporary password
   field) → Save password → the teacher dashboard. **And the project Gmail
   receives the first-password alert (Q1):** subject **"Parent's Portal — your
   password was changed"**, beginning "Hello <the teacher's name>," / "The
   password for your Parent's Portal account was changed just now." / "If this
   was you, there is nothing to do." — no code, no link. 📸 the mail.

## 3. Create parent account, web (Maria Santos, Grade 6 - Malikhain)

5. Straight in (no consent, no gate). Teacher → Students → Enrol: a fictional
   check learner in Grade 6 - Malikhain → "Enroll this student?" → then
   **"Create parent account"**: **Guardian name**, **Password**, **Confirm
   password** — **no Email, no Contact number**. 📸
6. Continue → "Create a pending parent account for <name> (login ID <the
   LRN>)? An admin must approve it before they can log in. You cannot
   un-create it." → create → the server's sentence above the list.

## 4. Approve, web (ADMIN001)

7. Admin → Users → the pending parent → Review → Approve, the dialog naming
   the decision → "Parent approved."

## 5. The new parent's first sign-in, the Tecno (Expo Go) — the alert by text

8. Sign in with the password from row 5 → consent, three ticks → "Confirm
   your contact" → **Mobile number**, an **EMPTY** field → the Tecno's number
   → Send code → the text through SMSGate → Confirm → "Set a new password" →
   Save password → Home. **And the text arrives on the Tecno:** "Parent's
   Portal: your password was changed just now. If this was not you, use
   Forgot password on the sign-in page or tell the school office." 📸

## 6. Create teacher, the Tecno (ADMIN001) — screenshot only

9. Admin → Users → Create teacher: **Login ID, Password, Name — no Email, no
   Contact number.** 📸 Cancel; no second teacher is created (the owner's
   call).

## 7. Create parent account, the Tecno (Lito Bautista, Grade 1 - Mabait)

10. Teacher → Students → **Enroll student** → "Enroll a student" → "Enroll
    this student?" → **"Create parent account"**: Guardian name, Password,
    Confirm password — **no Email, no Contact number**. 📸 → "Create this
    parent account?" → create (a second fictional learner and parent, in
    Grade 1 - Mabait).

## 8. Change password, web (Maria Santos — both channels)

11. Settings → Change password: Current = the seeded password, New = one you
    choose → "Change your password?" / "You will stay logged in on this
    device. Use the new password the next time you log in." → Yes, change
    password → "Password changed successfully." under the button, still
    signed in. **BOTH arrive:** the project Gmail's "Parent's Portal — your
    password was changed", and on the phone holding her confirmed number the
    text "Parent's Portal: your password was changed just now. If this was
    not you, use Forgot password on the sign-in page or tell the school
    office." 📸 both.
12. The same again, Current = the one just chosen, New = **the seeded
    password** → a second pair arrives (nothing suppresses a repeat). Her
    hash is back where it was; the cleanup only checks it.

## 9. Forgot password, the Tecno (Ana Reyes — email only)

13. Sign out → Forgot password → her login id → Send → the one
    forgot-password sentence (the same for every case) → the code from the
    project Gmail → the code, New password = **the seeded password** → the
    sign-in screen with "Password updated. You can sign in now." → **the
    project Gmail receives "Parent's Portal — your password was changed"**
    and no text (she has no confirmed number). 📸 the mail. Sign in with the
    seeded password: in.

## 10. Reset password by the office (Lito Bautista — number only), web then the Tecno

14. As ADMIN001, web: Admin → Users → Lito Bautista → Reset password → the
    dialog "Give this to <name>. When they next sign in, they confirm their
    Gmail or mobile number with a code, then choose their own password." —
    **and the phone holding his confirmed number receives the office's text
    (Q2):** "Parent's Portal: the school office set a temporary password for
    your account just now. If you did not ask for this, tell the school
    office." 📸 No mail (he has no confirmed email).
15. On the Tecno, Lito signs in with the temporary password → **"Confirm it’s
    you"** / "Before you set a new password, we’ll send a 6-digit code to your
    confirmed Gmail or mobile number." → Send code → the code by text →
    Confirm → "Set a new password" → New password = **the seeded password** →
    Save password → Home → **the second text:** "Parent's Portal: your
    password was changed just now. If this was not you, use Forgot password
    on the sign-in page or tell the school office." 📸

## 11. After the check — cleanup (by id, backup first)

**B5's rows:** the check teacher, the two learners and the two parents by id,
with their `auth_codes` rows, their acceptance rows and the admin's
`parent_pending` bell rows (`notifications.item_id` has no FK, so a by-hand
user delete takes them in the same transaction); `activity_logs` rows stay.

**B6's rows:** every `auth_codes` row above the start mark, by id (row 13's
reset code on Ana Reyes, row 15's reconfirm code on Lito Bautista); then each
seeded hash of Maria Santos (2), Ana Reyes (5) and Lito Bautista (6) checked
against the seeded password — **pass or fail only, never printed** — and a
failing one restored by id, D-86 style: the hash as `scripts/setup-db.js`
makes it, `password_changed_at = NOW(3)`, `token_version = token_version + 1`,
`must_change_password = 0`, exactly one row or ROLLBACK; confirmed contacts
untouched. The `password_alert_*` rows stay, as every activity row does.

Health 200 → `POST /api/backups` 201 → one guarded transaction, as option D
and the B4 cleanup ran.

## 12. Result

Pending the owner's run.
