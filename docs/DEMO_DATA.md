# DEMO DATA — the load, its undo, the run sheet and the check

> Module 12, 2026-10-31. The professor and the panel asked for demo accounts, for the panel, the demo video and data gathering.
> This is the one place the load is described. The Seeded baseline in `CLAUDE.md` is `db:setup` alone and does not change: the suites never see a row this module writes, and "20 of 23 sections have no adviser" stays true of a fresh `db:setup` while it stops being true on production.

## What it writes

| Table | Seed | Added | After |
|---|---|---|---|
| `users` | 8 | 368 (22 teachers, 346 parents) | 376 |
| `students` | 4 | 346 | 350 |
| `sections` | 23 | 20 advisers set | 23 |
| `teacher_assignments` | 8 | 147 | 155 |
| `assessment_slots` | 10 | 1,377 | 1,387 |
| `grades` | 5 | 4,696 | 4,701 |
| `grade_components` | 10 | 20,842 | 20,852 |
| `attendance` | 0 | 3,500 | 3,500 |
| `system_settings` | | 1 (the manifest) | |
| `activity_logs` | | 1 (the load) + 1 (the clear) | |

Production's own counts come from the dry run, which prints the live figures. No notification, no socket emit, no `policy_acceptances` row.

- **30 learners** in one section per grade: Mabait, Masikap, Magiliw, Makatao, Masigasig, Malikhain. **10** in each of the other 17. Kept learners count towards the 30.
- **Every name is fictional.** The kept learners with team members' names, and any guardian with a team surname, are renamed inside the load. LRNs, ids and login ids do not change, and the undo puts the names back.
- **Term 1 complete. Term 2 partial:** every subject has two written works and one performance task, and the first half of the subjects in printed order also have a Summative, so the rest read `— Pending`. Term 3 is empty. Nothing is locked.
- **Attendance:** the ten class days 2026-10-19 → 2026-10-30, recorded by each section's adviser. A fixed window, so a re-run writes the same days.
- **Added rows only.** A kept learner's existing grade is never updated, an attendance day already recorded wins, and a class that already has columns keeps them. Nino's Mathematics and Reading and Literacy are scored on their own two columns.

## The teacher map

`DEMO-TCH-` is shortened to its number below. 155 rows; 8 seeded.

**Grades 1–2, self-contained**

| Section | Teacher, every subject |
|---|---|
| G1 Matipid / Mabait / Maagap / Mapagmahal | 004 / TCH-003 / 005 / 006 |
| G2 Mapagkaibigan / Masikap / Mapagkakatiwalaan | 007 / 008 / 009 |

**Grade 3, exchange.** Each adviser teaches one subject across the grade and keeps Makabansa and GMRC at home.

| Section (adviser) | English | Mathematics | Science | Filipino | Makabansa, GMRC |
|---|---|---|---|---|---|
| Magiliw (010) | 010 | 011 | 012 | 013 | 010 |
| Matapat (011) | 010 | 011 | 012 | 013 | 011 |
| Masipag (012) | 010 | 011 | 012 | 013 | 012 |
| Malinis (013) | 010 | 011 | 012 | 013 | 013 |

**Grades 4–6, departmentalized.** One teacher per subject across all the sections of the grade.

| Subject | G4 | G5 | G6 |
|---|---|---|---|
| English | 014 | 018 | TCH-001 |
| Mathematics | 017 | 019 | TCH-001 |
| Filipino | 014 | 018 | TCH-001 |
| Araling Panlipunan | 017 | 020 | 021 |
| GMRC | 016 | 020 | 023 |
| Science | 015 | 019 | 022 |
| MAPEH | 016 | 024 | 024 |
| EPP | 015 | 025 | 025 |

Advisers: G4 Makabansa 014, Makakalikasan 015, Makadiyos 016, Makatao 017. G5 Mahusay 018, Masigasig TCH-002 (zero assignments, on purpose), Masinop 019, Masunurin 020. G6 Maunlad 021, Matatag 022, Malikhain TCH-001, Marangal 023. 024 and 025 advise nothing.

TCH-001 holds three subjects, one more than "one or two": the seed gave them three in Malikhain, and the owner's Q2 keeps those and extends them across Grade 6.

## The 14 pre-confirmed accounts

The admin; advisers TCH-003 (G1), 008 (G2), 010 (G3), 017 (G4), 019 (G5), TCH-001 (G6); the parent in seat 1 of each demo section; and 024, the panel's case: a subject teacher recording grades for their subject in a class they do not advise.

New accounts among them have no forced password change. All 14 use the one address typed for the load, because `users.email` has no UNIQUE and no write compares two emails. An existing account already confirmed is left alone, and no existing password or forced-change flag is ever written.

**`DEMO_CONTACT_EMAIL` must be the server's sending mailbox, `SMTP_USER`, character for character.** The load stores the value as confirmed and nothing checks that it exists: the value typed on 2026-11-01 was mistyped, and every reset code bounced (F3, `docs/KNOWN_ISSUES.md`).

Everyone else goes through the normal first sign-in. No `policy_acceptances` row is written for anybody (the owner's Q6), so a pre-confirmed account still sees the consent step.

## The production run sheet

**Run the VPS rows as `portal` on the VPS.** The laptop's connection to Supabase timed out at SSL (`deploy/README.md` §10).

**Before row 1:** the VPS is on the merged `main` commit, by `deploy/README.md` §11 steps 1–7. No runtime file changed, so steps 8–11 are skipped: no install, no build, no reload.

**STOP on any line that starts `REFUSED:` or `FAILED at`.** A refusal wrote nothing. A failure rolled back whole.

| # | Where | Action | Expected |
|---|---|---|---|
| 1 | Hosted app | Admin → Backup & Restore → create a backup | A new row in the list |
| 2 | VPS | `ls -l /home/portal/Parents_Portal/server/backups \| tail -n 3` | The new `.zip`: backup A |
| 3 | VPS | `cd /home/portal/Parents_Portal/server` | |
| 4 | VPS | `read -rs DEMO_TEACHER_PASSWORD && export DEMO_TEACHER_PASSWORD` | Waits with nothing on screen. Type the value, press Enter |
| 5 | VPS | `read -rs DEMO_PARENT_PASSWORD && export DEMO_PARENT_PASSWORD` | The same |
| 6 | VPS | `read -rs DEMO_CONFIRMED_PASSWORD && export DEMO_CONFIRMED_PASSWORD` | The same |
| 7 | VPS | `read -rs DEMO_CONTACT_EMAIL && export DEMO_CONTACT_EMAIL` | The same: the sending mailbox, exactly as in `SMTP_USER` |
| 8 | VPS | `npm run demo:load` | `BEGIN READ ONLY: a dry run, nothing can be written.`, `Preconditions: all passed.`, the counts, `Dry run complete. Nothing was written.` |
| 9 | VPS | `npm run demo:clear-messages` | `messages: 9`, `notifications: 0`, `Dry run complete. Nothing was written.` |
| 10 | **Darryl** | Read rows 8 and 9, give the go | |
| 11 | VPS | `PORTAL_DEMO_HOSTED=production-demo-load npm run demo:clear-messages -- --apply` | `messages: 9 -> 0`, `notifications: 0 -> 0`, `Clear committed.` |
| 12 | VPS | `PORTAL_DEMO_HOSTED=production-demo-load npm run demo:load -- --apply` | Counts per table before and after, `Load committed in`, then the seconds |
| 13 | VPS | `unset DEMO_TEACHER_PASSWORD DEMO_PARENT_PASSWORD DEMO_CONFIRMED_PASSWORD DEMO_CONTACT_EMAIL` | |
| 14 | VPS | `exit` | The terminal closes |
| 15 | Hosted app | Admin → Backup & Restore → create a backup | A new row in the list |
| 16 | VPS, a new terminal | `ls -l /home/portal/Parents_Portal/server/backups \| tail -n 3` | The new `.zip`: backup B |
| 17 | Laptop | `cd "C:\Users\Win10 User\Parents_Portal\server"` | On the merged `main` |
| 18 | Laptop | `npm run demo:logins` | `Wrote 368 rows to C:\Users\Win10 User\Parents_Portal-demo-logins\demo-logins.txt`. If row 12 printed a `--kept` value, run the line it printed instead |
| 19 | Laptop | `notepad "C:\Users\Win10 User\Parents_Portal-demo-logins\demo-logins.txt"` | The list, pre-confirmed first. Never paste it, never screenshot it |

**Rows 4–6 take three values, and the list names two.** Since `demo:passwords` the list says `TEACHER VALUE` or `PARENT VALUE`, so a load from these rows is followed by the section below.

**Size and speed.** About 31,300 rows. Measured on the loopback cluster at the gate: the load took 1.5–2.0 seconds and the archive after it was 247 KB, on a fresh seed with almost no `activity_logs`. Production is unmeasured: the database is across a network, so expect 20–60 seconds on row 12. Its archive already carries the old activity rows (285 KB on 2026-10-27, the last local one), so expect about 0.5 MB.

**Memos and school-wide announcements** now write a notification for about 375 accounts each.

## Setting the passwords again

`fix/demo-passwords`, 2026-11-02. The values typed for the load were saved nowhere, so nobody could sign in to the demo accounts. `npm run demo:passwords` sets two values, **by role**: `DEMO_TEACHER_PASSWORD` for all 22 new teachers and `DEMO_PARENT_PASSWORD` for all the new parents, pre-confirmed or not. Pre-confirmed is a state of the account, and that state stays.

**It writes `users.password` only**, one hash per value, on marked accounts whose holder has changed nothing, plus one `demo_passwords_set` row, counts only. `updated_at` moves by trigger. It never writes `password_changed_at`, `token_version` or `must_change_password`: the first two are how a changed account is recognised, so writing them would make a re-run skip everyone. **A mistyped value is repaired by running it again**, with no restore.

**Skipped:** an account with `password_changed_at` set or `token_version` above 0, or a contact the holder confirmed: `contact_verified_at`, or on a new account that was not pre-confirmed `email_verified_at`, or on a pre-confirmed one `email_verified_at` gone. **Never reached:** ADMIN001, TCH-001, TCH-002, TCH-003 and the seeded parents carry no marker.

**The contact fix (F3), in the same transaction.** On the 11 new pre-confirmed accounts only, `users.email` becomes the server's `SMTP_USER` where it differs, including an account whose password was skipped. Skipped: a holder's own confirmed contact. `email_verified_at` stays. `SMTP_FROM` is not used, because it carries a display name. The script refuses a sender that is unset or not a bare address, and prints no address. A kept account still on the load's address is counted and left for Module 13.

**The two values live in Darryl's own note and nowhere else:** not in a file in the repo, not in the secrets folder. Write the note before typing anything.

**Before row 1:** the VPS is on the merged `main` commit, by `deploy/README.md` §11 steps 1–7. No runtime file changed, so steps 8–11 are skipped. **STOP on any line that starts `REFUSED:` or `FAILED at`.**

| # | Where | Action | Expected |
|---|---|---|---|
| 1 | Darryl's note | Write both values: 8+ characters with a digit, and different from each other | The note exists |
| 2 | Hosted app | Admin → Backup & Restore → create a backup | A new row in the list |
| 3 | VPS | `ls -l /home/portal/Parents_Portal/server/backups \| tail -n 3` | The new `.zip`: backup C |
| 4 | VPS | `cd /home/portal/Parents_Portal/server` | |
| 5 | VPS | `read -rs DEMO_TEACHER_PASSWORD && export DEMO_TEACHER_PASSWORD` | Waits with nothing on screen. Paste from the note, press Enter |
| 6 | VPS | `read -rs DEMO_PARENT_PASSWORD && export DEMO_PARENT_PASSWORD` | The same |
| 7 | VPS | `npm run demo:passwords` | The dry run below |
| 8 | **Darryl** | Read row 7, give the go | |
| 9 | VPS | `PORTAL_DEMO_HOSTED=production-demo-load npm run demo:passwords -- --apply` | Counts per table, `Row counts equal, activity_logs aside.`, `Set: 21 teachers, 342 parents. Contact fix: 11.`, `Passwords committed.` |
| 10 | VPS | `unset DEMO_TEACHER_PASSWORD DEMO_PARENT_PASSWORD` | |
| 11 | VPS | `exit` | The terminal closes |
| 12 | Hosted app | Sign in as a pre-confirmed teacher and a pre-confirmed parent the run wrote | Both reach `Before you continue` |
| 13 | Hosted app, VPS in a new terminal | A backup, then the `ls` of row 3 | Backup D, unless Module 13 follows in the same sitting |
| 14 | Laptop | `cd "C:\Users\Win10 User\Parents_Portal\server"`, on the merged `main` | |
| 15 | Laptop | `npm run demo:logins -- "--kept=6:Malikhain=2,5:Masigasig=1,1:Mabait=2"` | `Wrote 367 rows to …demo-logins.txt` |

**The dry run on production, 2026-11-02's expected figures:**

```
Target: hosted.
BEGIN READ ONLY: a dry run, nothing can be written.
Marked: 22 teachers, 345 parents. Manifest present.
Will set: 21 teachers, 342 parents.
Skipped: 4 (password changed 4, contact confirmed 0).
Skipped accounts already on their role's typed value: N of 4 (information only).
Stored hashes to replace: 2 teachers, 2 parents.
Contact fix: 11 of 11 (own contact kept 0, already correct 0).
Kept accounts still on the load's address: 0 of 3.
Dry run complete. Nothing was written.
```

A larger Skipped means another holder changed something first; the script is right and the figures move with it. Anything above 0 on the last line touches nothing: Module 13 fixes those accounts.

## Taking it back out

Before a pilot with real data. Same terminal rules, no `DEMO_` values needed. Take a backup through the app first.

| # | Where | Action | Expected |
|---|---|---|---|
| 1 | VPS | `cd /home/portal/Parents_Portal/server` | |
| 2 | VPS | `npm run demo:undo` | `BEGIN READ ONLY: a preview, nothing can be written.`, the counts, `Preview complete. Nothing was written.` |
| 3 | VPS | `PORTAL_DEMO_HOSTED=production-demo-load npm run demo:undo -- --apply` | Counts per table, `Every count equals the count before the load.`, `Undo committed.` |

The undo finds its rows by three markers: the LRN prefix `999900`, the login prefix `DEMO-TCH-`, and the `system_settings` row `demo_load_v1`. That row holds what has no identity of its own (slots, added rows on kept teachers and learners) and the values to put back (20 advisers, contacts, names). It also deletes anything a demo teacher posted, with its notifications. A count that differs from before the load is named, not hidden: it is what happened during the demo.

Backup A is the second way back, but a restore loses everything written since.

## Darryl's check

**Do not press Save all or Save on any Grades or Attendance screen: that writes.** Counts come from row 12 if production differs from the seed. If Module 13 already gave TCH-001 a temporary password, row 8 runs `Confirm it’s you`, then `Set a new password`.

**Admin — web (ADMIN001)**

| # | Action | Expected | 📸 |
|---|---|---|---|
| 1 | Open Dashboard | Users card: Teachers `25`, `teacher accounts` | 📸 |
| 2 | Open Students | 350 learners in total | |
| 3 | Open Users, role Teacher | 25 rows | |
| 4 | Open Activity log | One `demo_data_load`, one `demo_messages_clear`, group Other | 📸 |
| 5 | Open Messages | `No messages yet` and `Use New message to start a conversation.` | |
| 6 | Open the bell | No new rows from the load | |

**Admin — phone**

| # | Action | Expected | 📸 |
|---|---|---|---|
| 7 | Sign in, open Dashboard | The same Teachers count as row 1 | 📸 |

**Pre-confirmed adviser — web (TCH-001)**

| # | Action | Expected | 📸 |
|---|---|---|---|
| 8 | Sign in | `Before you continue` if not yet accepted, then Dashboard | |
| 9 | Open Attendance, Grade 6 - Malikhain, 2026-10-30 | 30 learners, marks filled in | 📸 |
| 10 | Open Attendance records, Malikhain | Days 2026-10-19 → 2026-10-30 listed | |
| 11 | Open Class summary, Term 1 | Every learner and subject has a value | 📸 |
| 12 | Open Class summary, Term 2 | Four subjects have values, four read `— Pending` | 📸 |
| 13 | Open Grades, Mathematics, Malikhain, Term 1 | Six columns, scores filled, cells editable. No Save | 📸 |

**Pre-confirmed adviser — phone (TCH-001)**

| # | Action | Expected | 📸 |
|---|---|---|---|
| 14 | Open Attendance | Grade 6 - Malikhain, 30 learners | 📸 |
| 15 | Open Grades, Mathematics, Term 1 | The same marks as row 13 | |

**Pre-confirmed Grade 6 subject teacher — web (DEMO-TCH-024)**

| # | Action | Expected | 📸 |
|---|---|---|---|
| 16 | Sign in | `Before you continue` (two ticks), `I agree and continue`, then Dashboard, with no contact or password step | 📸 |
| 17 | Open Grades, the Subject list | **MAPEH only** | 📸 |
| 18 | Open the Class list | Four Grade 5 and four Grade 6 sections | |
| 19 | Open Malikhain, Term 1 | Cells editable: this teacher records MAPEH in a class they do not advise. No Save | 📸 |
| 20 | Open Attendance | `You are not the adviser of any section` | 📸 |
| 21 | Open Class summary | `Class summary is for class advisers` | 📸 |

**Subject teacher — phone**

| # | Action | Expected | 📸 |
|---|---|---|---|
| 22 | Open Grades | MAPEH only | 📸 |
| 23 | Open Attendance | `You are not the adviser of any section` | 📸 |

**Pre-confirmed parent — web (the Grade 6 one)**

| # | Action | Expected | 📸 |
|---|---|---|---|
| 24 | Sign in | `Before you continue` (three ticks), then Dashboard | 📸 |
| 25 | Read the Grades card | `Term 2 — 4 of 8 recorded` | 📸 |
| 26 | Read the Attendance card, on or after Nov 1 | `Nothing recorded this month.` and `School year so far: N of 10 recorded days` | 📸 |
| 27 | Open Grades | Term 1 all filled; Term 2 four values, four `— Pending` | 📸 |
| 28 | Open Attendance, go back to October | The ten days marked | |

**Pre-confirmed parent — phone**

| # | Action | Expected | 📸 |
|---|---|---|---|
| 29 | Open Grades | The same values as row 27 | 📸 |

**A new parent's first sign-in** (any parent not pre-confirmed; use your own Gmail, not the project one)

| # | Action | Expected | 📸 |
|---|---|---|---|
| 30 | Web: sign in with the login id and the parent password | `Before you continue` | 📸 |
| 31 | Tick three, press `I agree and continue` | `Confirm your contact` | 📸 |
| 32 | Enter the Gmail, enter the code | `Set a new password` | 📸 |
| 33 | Set a password | Dashboard | |
| 34 | Phone: repeat with a second such parent | The same three screens, the same words | 📸 |

## The gate

On the loopback cluster alone, in its own database `parents_portal_demo`:

`npm run test:demo-data -- --gate`

It runs a fresh `db:setup` there, loads, proves the server computes exactly what was stored with a real dry run of the class record, proves a failure part way through leaves nothing, undoes back to the fresh setup, loads again and gets the same data, runs `demo:passwords` on that load, and clears fixture messages. `docs/TESTING.md` has the figure.
