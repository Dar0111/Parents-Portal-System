# ACTIVITY RESET — the survey for the reset of the old `activity_logs` rows

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
