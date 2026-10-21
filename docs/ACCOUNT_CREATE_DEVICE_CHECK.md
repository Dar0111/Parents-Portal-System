# Account creation — device check (`feat/account-create`, 2026-10-21)

The owner's check of branch 2 of the pre-Oct-21 build (the owner's order:
the first sign-in → account creation → the password alert → acknowledgement →
F3 → the Activity log). The decision of 2026-10-16: **Create Teacher and
Create Parent drop the Email and Contact fields** — on the web's three forms,
the phone's two screens, and the two POST handlers, which refuse a value with
`400` "no longer collected" naming the field. Rules: FRONTEND §29g, MOBILE
M15 and M17, API_REFERENCE §8. The owner decides whether this check is
combined with `feat/password-alert`'s.

**Given one section at a time during the check.** 📸 marks only the rows that
need a screenshot. Every expected sentence is the exact copy on screen; the
first-sign-in screens' copy is `docs/FIRST_SIGNIN_DEVICE_CHECK.md`'s,
verified 2026-10-20/21.

## 0. Before the check

- **The switch** (on the owner's word "switch"): the worktree is detached and
  the main tree checks out `feat/account-create`; the `--watch` API reloads.
  Then `npx expo start --clear` and a cold boot of the phone (M7).
- **Who skips what.** ADMIN001 and the seeded teachers Maria Santos (2), Ana
  Reyes (5) and Lito Bautista (6) skip the consent screen (their draft-1
  acceptance rows exist) and meet no contact gate (each has a confirmed
  contact). A seeded address is never reachable: if any seeded account ever
  shows "Confirm your contact", press **Change** first. The NEW accounts this
  check creates meet all three steps, with an EMPTY contact field — there is
  nothing on file, so no Change.
- **SMS:** the SMSGate app on the Tecno, local mode, on the hotspot, for row
  5's text. Mail goes to the project Gmail.
- **Never** sign in as Tala's parent.

## 1. Create teacher, web (ADMIN001)

1. Admin → Users → **Create teacher**: the dialog "Create teacher" holds
   **Login ID**, **Password** (with the checklist) and **Name** — **no Email,
   no Contact number**. 📸
2. A fictional check teacher, a password you choose → Create → above the list:
   "Teacher account created and activated. Login ID: <the id>."

## 2. The new teacher's first sign-in, web

3. Sign in with that password → "Before you continue", two ticks, "I agree and
   continue" → **"Confirm your contact"** / "Choose your Gmail or your mobile
   number. We’ll send a 6-digit code to it. One is enough — you can add the
   other later in Settings.", Gmail selected, an **EMPTY** "Gmail" field with
   "Use an address you can open now — a Gmail works." under it, no Change. 📸
4. The project Gmail → Send code → "We sent a 6-digit code to <the address>."
   → the code → Confirm → **"Set a new password"** (no Temporary password
   field) → Save password → the teacher dashboard.

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

## 5. The new parent's first sign-in, the Tecno (Expo Go)

8. Sign in with the password from row 5 → consent, three ticks → "Confirm
   your contact" → **Mobile number**, an **EMPTY** field → the Tecno's number
   → Send code → the text through SMSGate → Confirm → "Set a new password" →
   Save password → Home.

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

## 8. After the check — cleanup (by id, backup first)

The check teacher, the two learners and the two parents by id, with their
`auth_codes` rows, their acceptance rows and the admin's `parent_pending`
bell rows (`notifications.item_id` has no FK, so a by-hand user delete takes
them in the same transaction); `activity_logs` rows stay. Health 200 →
`POST /api/backups` 201 → one guarded transaction, as the B4 cleanup ran.
