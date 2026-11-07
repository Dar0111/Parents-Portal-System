# ACCOUNT DELETE — one parent account and its learner, by id (D-312)

The owner's PLAN APPROVED, 2026-11-07 (Darryl, 15:53), on the plan of the same
day; item 2 changed later that day (the gate's own cluster on 54341). Built on
`feature/d312-account-delete`. **Its production run waits for the merge and
Darryl's go.**

## Scope

A parent account named "TEST" (user **1307**) and its learner (**1846**,
Grade 1 – Mabait) were made on production on 2026-10-30, the VPS's first day,
before the demo load: Mabait's adviser enrolled the learner and created the
parent, the admin approved it, the parent signed in (email confirmed, password
changed), sent an excuse letter that the adviser declined (an Absent day), and
a Term 2 grade was recorded. The demo load of 2026-11-01 then added 9 grades and
9 attendance days to the learner (its manifest's `added` lists them). Nothing
in the app deletes an account or a learner, and `demo:undo` selects by its own
markers, which this pair does not carry — so a script of its own.

**One pair, by id, and nothing else.** It never deletes a demo row
(`demo:undo` does that), the browser-check family (learner 1037, parent 647), a
teacher or an admin account, or a learner with any other linked account.

## The script: `server/scripts/account-delete.js` (`npm run account:delete`)

```
npm run account:delete -- --user=<id> --student=<id>
    a dry run: BEGIN READ ONLY. The pair, every reference count and a
    paste-ready --expect=… line. Nothing is written.

npm run account:delete -- --user=<id> --student=<id> --expect=<line> --apply
    ONE transaction. Any difference from --expect, any refusal and any failed
    check after the deletes rolls the whole run back.
```

- **Production** also needs `PORTAL_ACCOUNT_DELETE=production-account-delete`
  in the apply command. Neither `PORTAL_DEMO_HOSTED` nor
  `PORTAL_ACTIVITY_RESET` unlocks it. A dry run is READ ONLY and needs no flag.
- Runs as `portal_migrate` (`config/db.js` `settings('migrate')`), the role
  that may delete, like the other one-off scripts.
- **It prints ids, counts, dates, grade levels and sections.** Never a name, a
  login id, an LRN, an email or a phone. `activity_logs.description` is never
  selected; the one statement that names it is the INSERT of the new row. The
  demo markers are tested in SQL that returns a boolean, so no LRN or login id
  is read into the process.

### Refused before anything is written (dry run and apply alike)

- either id is the protected browser-check family (learner 1037, parent 647) —
  refused before connecting;
- the user or the learner does not exist;
- the user is not a parent, or its `student_id` is not `--student`;
- the learner has any other linked account;
- either carries a demo marker (the `999900` LRN prefix, `DEMO-TCH-`);
- any grade of the learner is locked;
- anything RESTRICT points at the user (attendance recorded by, announcements,
  memos, events posted by, backups created by);
- on `--apply`, any count differs from `--expect`.

### The counts (the dry run prints them; `--expect` repeats every one, zeros included)

| Deleted with the pair | | Kept, their link cleared (SET NULL) | |
|---|---|---|---|
| `grades` | the learner's | `detached_users` | users the account created or approved |
| `grade_components` | of those grades | `detached_students` | learners the account created |
| `attendance` | the learner's | `detached_sections` | sections it advises |
| `excuse_letters` | the learner's or the account's | `detached_excuse_letters` | letters it reviewed |
| `grade_acknowledgements` | the learner's | `detached_activity_logs` | **its own activity rows** |
| `policy_acceptances` | the account's | `detached_notifications` | notifications it acted on, not about the pair |
| `notifications` | to the account, or about it, its letters or the learner's grades | `detached_grade_acknowledgements` | other learners' it confirmed |
| `messages`, `auth_codes`, `teacher_assignments` | the account's | `detached_policy_acceptances` | other accounts' naming the learner |

### The apply, in one transaction (`SET LOCAL lock_timeout = '15s'`)

1. Lock both rows (`FOR UPDATE`) and count again with the dry run's own query
   text. Any difference from `--expect` rolls back.
2. Delete the notifications about the pair: by item (the user, its excuse
   letters, the learner's grades), then by `user_id`. `item_id` has no foreign
   key, so the staff's two would otherwise be orphaned.
3. Delete the user (its acceptances and its letters cascade).
4. Delete the learner (grades, components, attendance and acknowledgements
   cascade).
5. Insert **one** activity row, as the admin, code `account_deleted_by_id`
   ("Deleted an account by id", System), with ids and counts only — **before
   the checks** (the approval's item 4), so its `+1` is checked.
6. Count again: every reference 0 (the notifications by the dry run's own
   ids), every table changed by exactly its count, `activity_logs` by `+1`,
   every other table by 0. Anything else rolls back.
7. `COMMIT`.

**Activity rows about the account are kept.** An audit trail is not rewound
(the rule behind `demo:undo`, Feature 7's 40 rows and D-122 being the one
approved reset), and finding which rows mention the account would mean reading
`description`, which is never allowed. Their `user_id` is cleared by the
foreign key, and the Activity log lists them under **Deleted account** (§36).
On production 1307 has 0 such rows today (the D-122 reset removed that
evening's), so nothing is detached there.

**Side effects:** no badge changes (the staff's two notifications are calls to
act that already resolved); the account's tokens answer `401` (`authenticate`
re-reads the user and finds nothing).

## The proof: `server/scripts/test-account-delete.js`

- `npm run test:account-delete` — part 1, no database, no port: every argument
  refusal, the `--expect` line, the guard as a pure function (the demo's and
  the reset's values do not unlock it), the refusal rules, the script's own
  text (no TRUNCATE, no UPDATE … SET, DELETE from three tables only,
  `description` only in the INSERT, `login_id` and `lrn` only compared), the
  script as a process refusing before any connection, and the gate's own
  preconditions.
- `npm run test:account-delete -- --gate` — part 1, then part 2 on **its own
  loopback cluster at 54341** (never 54329, which belongs to another tab), in
  `parents_portal_d312` alone. The command sets `MIGRATION_PG_PORT=54341`,
  `MIGRATION_PG_DIR` (a scratch folder outside the repo), `MIGRATION_APP_TREE`
  (the worktree), `MIGRATION_SOURCE_ENV` (a file that does not exist) and
  `NODE_OPTIONS` loading `migration/scripts/p4b-net-guard.js` and
  `server/scripts/lib/listen-loopback.js`, with forward slashes; part 2 refuses
  otherwise. It makes the roles the schema grants to, runs `db:setup` (output
  withheld), starts `server/server.js` **itself** on `127.0.0.1:5312` (the
  preload binds every listen to 127.0.0.1; `server.js` and `serve-pg.js` are
  unchanged) and shows the `netstat` lines, then builds three "TEST"-like pairs
  through the API (enrol, create, approve, accept, excuse, decline, a Grade 1
  letter), so the four notifications are real: the dry run, eight refusals,
  three negative controls (a copy without the notification step commits and
  leaves 2 orphans the gate finds; the same copy with the script's own checks
  rolls back; a copy without the `--expect` check deletes on a wrong line), the
  apply with every table's change checked independently, Mabait's other
  learners unchanged by fingerprint, the activity row and its label through the
  API, the parent's own rows listed as a Deleted account, and a `401`.
- **Not proved here:** the gate runs as the cluster's own superuser, as
  `test:activity-reset --gate` does, so `portal_migrate`'s privileges on
  production are proved by the production dry run, not by the gate.

Figures: `docs/TESTING.md`.

## Production run sheet (one command per step; STOP on any `REFUSED:` or `FAILED at`)

**Before step 1:** the VPS is on the merged `main` (`deploy/README.md` §11,
with one `pm2 reload`, because `activityActions.js` is read by the running
server).

| # | Where | Action | What Darryl sees |
|---|---|---|---|
| 1 | Claude, read-only connector | Both checks (`transaction_read_only` on, the read-only user), then the survey again, plus a fingerprint of the other 29 Mabait learners' rows | The same ids and counts as the plan. Anything different: STOP |
| 2 | VPS | `curl -s https://<domain>/api/health` | `"db":"ok"` |
| 3 | Hosted app | Admin → Backup & Restore → Create backup | A new row: the pre-delete backup |
| 4 | VPS | `ls -l /home/portal/Parents_Portal/server/backups \| tail -n 3` | The new `.zip` |
| 5 | VPS | `cd /home/portal/Parents_Portal/server` | |
| 6 | VPS | `npm run account:delete -- --user=1307 --student=1846` | `BEGIN READ ONLY`, the counts, the `--expect=…` line, `Dry run complete. Nothing was written.` |
| 7 | **Darryl** | Read step 6 and give the go | |
| 8 | VPS | `PORTAL_ACCOUNT_DELETE=production-account-delete npm run account:delete -- --user=1307 --student=1846 --expect=<the line> --apply` | The table counts before → after, the eight changes, `activity_logs +1`, `Committed.` |
| 9 | Hosted app | Admin → Users, search "Test" | No rows |
| 10 | Hosted app | **Admin → Students** only (the approval's item 3: no teacher sign-in on production — Mabait's adviser may be on a Module 13 temporary password) | Grade 1 – Mabait lists 29 learners, 1846 gone |
| 11 | Claude, read-only connector | The other learners' fingerprint again; references to both ids | Fingerprint unchanged, references 0, `users` 375, `students` 349 |
| 12 | VPS | `curl -s https://<domain>/api/health` | `"db":"ok"` |
| 13 | Hosted app | Admin → Activity log | One new row, "Deleted an account by id" |
| 14 | Hosted app, then VPS | A new backup, then the `ls` from step 4, then `sha256sum <file>` (the same on the laptop) | **The new restore point** |

Expected at step 8 (the plan's survey): `users` −1, `students` −1, `grades`
−10, `grade_components` −38, `attendance` −10, `excuse_letters` −1,
`notifications` −4, `policy_acceptances` −2, `activity_logs` +1, every other
table 0.

**Rollback:** restore the pre-delete backup (step 3) through the app. That ends
every session and loses anything written since step 3, which is minutes.

**The restore point** (`docs/KNOWN_ISSUES.md`, CLAUDE.md KNOWN ISSUES): today
`parents_portal_2026-11-07_125434.zip`, with K
(`parents_portal_2026-11-05_234112.zip`) as the last fallback; **after the run,
only the step-14 backup** — every older one brings 1307 and 1846 back.

## The demo undo, later

`demo:undo` still runs, but its delete of the load's added grades and
attendance finds 9 fewer rows of each (they went with learner 1846). Its
closing comparison will then name `users` −1, `students` −1, `grades` −1 (the
pre-load grade), `grade_components` −6, `attendance` −1 (the declined day) and
`policy_acceptances` −2 (and `notifications`) as differing from before the
load. That is expected, and `docs/DEMO_DATA.md` says so. The manifest itself is
not edited.
