# ACTIVITY RESET — D-122: the decision, the procedure and the old survey

**Run on production on 2026-11-03 at 22:20** (the owner's PLAN APPROVED of 2026-11-03, Module 15; the results: The run, below).
`npm run activity:reset` is new with `ops/m15-activity-reset`. The rows below are
the production procedure; the dated survey at the end of this file is history, not
deletion criteria.

## The decision

- **D-122:** the old test-era `activity_logs` rows are deleted after a backup, at
  the end, on production, before the Nov 4 school demo.
- **D-175 (owner decision, 2026-10-30), word for word:** "D-122's activity reset
  moves to after the check, with an approved production procedure (Module 15, last
  write before Nov 4, then the restore-point backup)."

## The scope

Option 2 of the plan, the owner's answers of 2026-11-03.

**The cutoff T.** Plan for `2026-11-03T03:35:00+08:00`, the start of the Module 13
sitting. Darryl confirms T at run time from the dry-run counts (row 6), before any
`--apply`.

**What goes:** every row older than T that the list below does not name.
`restore_refused` goes.

**What stays:**

| Rows | Why |
|---|---|
| Every row at or after T | Today's Module 13 and Module 14 trail |
| `seed`, `create_contribution`, `update_contribution`, `delete_contribution`, `update_contribution_record` | The written rules (`CLAUDE.md` → SCOPE DECISION → Feature 7) |
| Ids 5515, 5516, 5517 | The clock rows (`CLAUDE.md` → After Stage 4) |
| `demo_data_load`, `demo_data_undo`, `demo_messages_clear`, `demo_passwords_set` | The record of bulk writes to production, counts only |
| `restore_backup`, `restore_wiped_activity_logs` | The log's own record of being rewound |

`server/scripts/activity-reset.js` holds that list as two constants, and
`test:activity-reset` holds it again, so a change to it is a change to both.

**When.** The production run is the last job after the Tuesday evening dry run. If
the build or the gate is not green by then, skip the reset and make a fresh backup
as the restore point.

**What it cannot touch.** No table references `activity_logs`, and it has no
trigger. Its readers are `routes/activityLogs.js`, the archive and the restore's
lost-entries count; throttles read `login_attempts`, and `demo:undo` reads its
manifest in `system_settings`. The script writes this one table, leaves the
identity sequence alone, and never selects `description` or `user_id`.

## The run sheet

**Before row 1:** the branch is merged, and the VPS is updated by
`deploy/README.md` section 11, steps 1–7 and 11. Steps 8–10 are not needed, because
no dependency or client file changed. The one `pm2 reload` loads the labels.

On the VPS as `portal`, in `/home/portal/Parents_Portal/server`, in a quiet window
with nobody signing in. Every failed expected result means STOP.

| # | Where | Action | Expected | STOP if |
|---|---|---|---|---|
| 1 | VPS | `curl -fsS https://__DOMAIN__/api/health` | `"db":"ok"` | Anything else |
| 2 | VPS | `node scripts/account-state.js > /home/portal/m15-state-before.txt` | Silent | Any `FAILED:` |
| 3 | App | Note the Dashboard Users card and the Admin → Users total | Numbers written down | A page error |
| 4 | App | Backup & Restore → Create backup | A new row: **backup G** | Any failure |
| 5 | VPS | `ls -l /home/portal/Parents_Portal/server/backups \| tail -n 3` | G's `.zip`, no `.partial` | Missing |
| 6 | VPS | `npm run activity:reset -- --before=<T>` | `Delete: N rows`, then by code; `Keep, older than the cutoff:` by code; `Keep, since the cutoff:` by code; `Clock rows found: 3 of 3.`; `Dry run complete. Nothing was written.` | `REFUSED`, `FAILED`, an unexpected code, a keep count other than `seed` 5 / contribution 40 / clock 3, or today's trail missing from the third list |
| 7 | Darryl | Confirm T and N from row 6, go or no-go | A written go | No go: finished, nothing changed |
| 8 | VPS | `PORTAL_ACTIVITY_RESET=production-activity-reset npm run activity:reset -- --before=<T> --expect=<N> --apply` | `activity_logs A -> A-N+1`, `Row counts equal, activity_logs aside.`, `Reset committed.` | `REFUSED` or `FAILED`: it rolled back. Repeat row 6. No retry without Darryl's go |
| 9 | VPS | Repeat row 6 | `Delete: 0 rows.`, the same older rows kept, one `activity_log_reset` | Delete above 0 |
| 10 | Mixed | Check rows B1–B6 | All pass | Any failure: no restore point yet |
| 11 | App | Create backup | A new row: **backup H, the Nov 4 restore point** | Any failure |
| 12 | VPS | Repeat row 5 | H's `.zip`, smaller than G | Missing, or a `.partial` |
| 13 | VPS | `sha256sum /home/portal/Parents_Portal/server/backups/<H>` | A hash, noted | An error |
| 14 | App | Download on H's row | The file saves | An error |
| 15 | Laptop | `Get-FileHash "$HOME\Downloads\<H>" -Algorithm SHA256` | The same hash, case aside | It differs: download again |
| 16 | Google Drive | Upload backup H only, to Darryl's own Drive folder for the earlier backups | Same size, owner-only, no share link | Any sharing |

The 5, 40 and 3 come from the MySQL survey of 2026-10-24; production's run: The
run, below.

## The run, 2026-11-03

The owner's run on production. Module 15 was merged at 13:46 (`31333c3`) and
deployed at 13:51, with the one `pm2 reload`. Only the rows with a result to keep
are listed.

| Row | Result |
|---|---|
| 4 | Backup G, `parents_portal_2026-11-03_221709.zip`, before the reset |
| 6–7 | T `2026-11-03T03:35:00+08:00`, confirmed from the dry run |
| 8 | 22:20: 31,986 rows deleted; `activity_logs` 32,117 → 132; every other table equal |
| 9 | Delete 0. Kept: 57 older than the cutoff and 75 since it, the `activity_log_reset` row among them |
| 10 | B1 PASS ("Reset the activity log" at the top, 10:20 PM). B2–B3 skipped (optional). B4–B5 PASS (the script's equal counts: `users` 376, `students` 350). B6 PASS: the diff printed nothing |
| 11 | Backup H, `parents_portal_2026-11-03_222242.zip`, after the reset: **the Nov 4 restore point. Restore only H**; G, F and older bring the old rows back |
| B7 | PASS: G and H both have Download |
| 13–15 | 2026-11-04, 11:33–11:40: H's SHA-256 on the VPS and on the laptop match |
| 16 | H is on the owner's Google Drive, owner-only |
| B8 | PASS, 2026-11-04 11:33: `/api/health` on the domain, `"db":"ok"` |

**Backup I**, `parents_portal_2026-11-04_113604.zip` (11:36), was made by mistake
while downloading H. It is after the reset, so it is harmless; H stays the restore
point.

**2026-11-05, 23:34 (D-259):** H was restored to undo the Nov 4–5 demo's writes, and the restore rewound `activity_logs` (122 rows lost; its `restore_backup` and `restore_wiped_activity_logs` rows came after). **Backup K, `parents_portal_2026-11-05_234112.zip` (23:41), is the restore point since: restore only K.** I, J and the restore's safety copy are deleted (`docs/CHANGELOG.md`, 2026-11-06).

## The check

B1–B6 run at row 10, so a failed check stops before a restore point exists. B3
writes one `export_activity_log` row, which lands in H.

| # | Action | Expected |
|---|---|---|
| B1 | Admin → Activity log, default range | Loads; a "Reset the activity log" row; the Module 13 rows still listed |
| B2 | Widen From to 2026-08-01 | The total equals row 9's two Keep counts added (a sign-in since then adds a row); contribution rows present |
| B3 | Download CSV | Eight columns; the row count equals the total |
| B4 | Admin Dashboard | The same numbers as row 3; no error card |
| B5 | Admin → Users | The same total as row 3 |
| B6 | `node scripts/account-state.js \| diff /home/portal/m15-state-before.txt -` | No output: ids 1–7, 647 and 1307 unchanged. Any line for id 3 means STOP |
| B7 | After row 12: Backup & Restore page | G and H both have Download enabled; no new orphaned file |
| B8 | After row 16: repeat row 1 | `"db":"ok"` |

## Rollback

- **Before COMMIT:** any failure rolls back the whole transaction, and nothing
  changes. Confirm with row 6.
- **After COMMIT, wrong rows deleted:** leave it and decide after Nov 4. No code
  needs those rows and backup G holds them all. A restore the night before the demo
  is riskier than a missing log row.
- **Only if a restore is truly needed:** measure the host clock against the database
  first, then restore **G** with the password and the typed file name. It makes a
  safety archive first. Everyone must sign in again, and everything since G is lost.
  Re-run B6. **Never use D or older.** The repo records no restore on production;
  `deploy/README.md` bars a rehearsal, so this path is proved on loopback only.
- **H bad, or the hash differs:** download again. If H itself is broken, make another
  backup. G and F stay.

## What restoring H brings back

Every table except `backups`, which is kept, and `auth_codes`, which is left empty.
Every session ends. As they stood at H: consent rows, temporary passwords, contact
confirmations and user id 3. So anyone who accepted, set a password or confirmed a
contact after H does it again, and id 3 returns clean if H predates its first
sign-in. Grades, attendance and messages entered after H are gone. The old activity
rows stay deleted; only G, F or older bring them back.

## After the run

Done in M16's docs commit (2026-11-04):

- `docs/CHANGELOG.md`: T, N, the kept counts, and the names of G and H.
- `docs/MOBILE_CONVENTIONS.md`: "`activity_logs` rows are audit history and are never
  cleaned."
- `docs/KNOWN_ISSUES.md` and `docs/FRONTEND_CONVENTIONS.md`: "291 rows" and "160
  existing rows", which then describe old backups only.
- `CLAUDE.md`: BUILD ORDER → Remaining, and the run-book note that older
  `password_reset_*_failed` rows are gone.

---

**Everything below is the survey as it stood: history, not deletion criteria.**

## The survey for the reset of the old `activity_logs` rows

> Moved from `CLAUDE.md` → BUILD ORDER → NEXT, item 4, on 2026-10-24 — every
> figure and line reference as it stood there, the sentences laid out as lists
> (B7 `chore/pre-migration`, the owner's word: "move the activity-reset survey
> from NEXT into a new docs/ACTIVITY_RESET.md, leaving a one-line pointer").
> `CLAUDE.md` keeps the step and its place in the order; this file holds the
> survey. **Nothing here is a decision**: the reset happens at the end — after
> the last gate and before the demo, on Supabase (D-122; moved out of B7) — and
> its scope is decided then.

## The step

The reset of the old activity rows, at the end — after the last gate and
before the demo, on Supabase (D-122; moved out of B7); its scope is decided
then. Until then **Session B copies everything, the old activity rows
included**, and the restore point taken at the end of B7 still holds them.

## B7's survey (2026-10-24, MySQL)

Read only: counts, ids and action codes — `activity_logs.description` never
selected. The figures are as they stood before B7's gate; every gate since adds
its own rows (about 650 for a full gate, below).

- **29,712 rows, ids 1–29721.**
- **The written rules protect 48:**
  - the 40 contribution rows (`CLAUDE.md` → SCOPE DECISION → Feature 7);
  - ids 5515–5517 (the 2026-09-21 clock rows, `CLAUDE.md` → After Stage 4);
  - the five `seed` rows (ids 1–4, 15782).
- **The restore trail is 149:** 3 `restore_backup`, 3
  `restore_wiped_activity_logs`, 143 `restore_refused`.
- **No code needs old rows.**

## What a reset would make stale

`activityActions.js:8–9` and `:164–165`, `CLAUDE.md`'s two rules above its
NEXT list (the survey's "this file's two rules above" — SCOPE DECISION →
Feature 7's 40 rows and After Stage 4's clock rows) and its KNOWN ISSUES "291
rows" line, MOBILE_CONVENTIONS `:605`, FRONTEND `:4518` and `:4542–4543`, TESTING
`:616`, KNOWN_ISSUES `:126` and `:264–265`, MIGRATION_INVENTORY's 77 distinct
actions, and the "check `activity_logs` for `password_reset_*_failed`"
run-book. (Line numbers as of 2026-10-24.)

## Q7's figures

28,983 rows since 2026-09-07, about 589 a day over the 14 days to 2026-10-23,
17% from deleted suite accounts, a full gate about 650.
