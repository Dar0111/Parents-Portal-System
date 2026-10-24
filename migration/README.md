# MySQL → PostgreSQL migration package (Phase 2 preparation, 2026-10-19)

Everything needed to move the Parent's Portal database from MySQL 8.0 to
PostgreSQL 17 (Supabase) reproducibly, with the application's behaviour and
records preserved. The application port itself is a later branch; this
package is the schema, the transfer, the reconciliation, the measured
semantics and the design documents it follows.

**Read in order:** `docs/01_BASELINE.md` → `02_CONTRACTS.md` →
`03_QUERY_PORT_INVENTORY.md` → `04_BACKUP_RESTORE_DESIGN.md` →
`05_VALIDATION_MATRIX.md` → `06_STAGING_SUPABASE.md` → `07_CUTOVER_ROLLBACK.md`.

## Layout

```
migration/
  schema/001_portal_schema.sql   the PostgreSQL DDL, column by column from database/schema.sql
  schema/002_roles.sql           the two hosted roles (migration/restore, runtime)
  schema/003_grants_rls.sql      the grants and the row-level-security policies (D-83),
                                 applied with 001 by apply-schema on both targets
  lib/                           paths, env (the three staging keys read from
                                 secrets/supabase.env, everything else derived
                                 from PG_OWNER_URL, nothing ever printed),
                                 read-only MySQL, pg with the type parsers, the
                                 26-table column map + conversions + the
                                 set-equality guard, safeMessage
  scripts/                       the pipeline (below)
  docs/                          the eight deliverables
```

Dependencies are NOT installed under this folder (no shell command writes
into the repo): they live in `../../Parents_Portal-migration-data/tooling`
and `lib/deps.js` finds them there. `npm install` inside `migration/` also
works for a normal checkout.

## The pipeline

| Step | Command (from `migration/`) | Touches | Writes |
|---|---|---|---|
| inventory | `node scripts/inventory-queries.js` | server source (read) | stdout |
| backups manifest | `node scripts/backups-manifest.js` | `server/backups/` + `backups` table (read) | `…-data/manifests/backups_*.json` |
| snapshot | `node scripts/snapshot-source.js [--restore-check] [--drop-scratch]` | MySQL (read); `--restore-check` creates `parents_portal_migsrc_<stamp>` | `…-data/snapshots/*.sql`, `…-data/manifests/snapshot_*.json` |
| local PostgreSQL | `node scripts/pg-local.js serve \| status \| stop` | `…-data/pg17` | the data directory |
| schema | `node scripts/apply-schema.js --target local\|staging [--drop-first]` | the target (001 + 003 in one transaction; `--drop-first` refused off the disposable local cluster, by the flag before any secret is read) | schema `portal` |
| roles' passwords | `node scripts/set-role-passwords.js --target staging [--dry-run]` | the hosted roles, as the owner (`06` §2) | nothing on disk; `--dry-run` names missing keys only |
| rls check | `node scripts/rls-check.js --target …` | the target, one rolled-back transaction (`06` §2a) | `…-data/rehearsal/rlscheck_*.json` |
| transfer | `node scripts/transfer.js --target … [--source-db …] [--truncate]` | MySQL (read), target (one transaction; `--truncate` guarded like `--drop-first`) | `…-data/rehearsal/transfer_*.json` |
| reconcile | `node scripts/reconcile.js --target …` | both (read) | `…-data/rehearsal/reconcile_*.json` |
| semantics | `node scripts/semantics.js --target … --mysql-db <scratch>` | throwaway `zz_*` objects only | `…-data/rehearsal/semantics_*.json` |
| rehearsal | `node scripts/rehearse.js --target …` | the target, one rolled-back transaction | `…-data/rehearsal/rehearse_*.json` |

Rules every script keeps: the application database is opened `READ ONLY`
at the session level; no value from a real row is printed (counts, ids,
types and table names only); every error message passes through
`lib/safeMessage.js`; nothing is written under `server/backups` or into
any git tree.

## Status (2026-10-24 — the D-65 fix round, after the sync)

`003_grants_rls.sql` (D-83: RLS on all 26 tables, one `portal_app_all`
policy, no FORCE; the grants that `002` carried as comments; PUBLIC and the
Data API roles revoked) is applied with `001`; `apply-schema.js` prints a
POLICIES line; `rls-check.js` proves the matrix on the local cluster
(`RLS CHECK OK`, 20 checks); `--drop-first` and `--truncate` are refused by
the flag before any secret is read and by the connection after;
`set-role-passwords.js` sets the hosted roles' passwords with the value bound
as a parameter and verifies each through the Session pooler; `lib/env.js`
reads exactly three keys from `secrets/supabase.env` and derives the rest
from `PG_OWNER_URL`, TLS verify-full with the dashboard's CA file (`06` §0).
Reconcile after the matrix: `RECONCILE OK`. The hosted steps wait for
`supabase.env` and their own go.

## Status (2026-10-24 — the sync with `main` `5426b70`)

The branch was rebased onto `main` (B4–B8, B1, B3, B2 and B7 merged since
the 2026-10-19 base) and the package now carries **26 tables**:
`grade_acknowledgements` and the two `notifications.type` labels
`grades_locked` / `grades_acknowledged` (B1). New: `lib/tables.js`'s
set-equality guard — the transfer and the reconciliation refuse a source
whose base tables are not exactly the map's. Re-run on the local 17.10 from a
fresh verified snapshot (26 tables, loaded into the isolated
`parents_portal_migsrc_20261024_164012`): schema tables 26 / indexes 86 /
fks 35 / uniques 15 / checks 25 / sequences 25; transfer 26 tables, 30,780
rows; `RECONCILE OK`; `REHEARSAL OK` 90 checks (71 + 19 for B1, B3, B8 and
B2's statements); `SEMANTICS OK`; inventory 350 call sites in 27 files
(`docs/01` §7, `03`, `05` §0). The D-65 fix round and the hosted steps wait
for their own go.

## Status (2026-10-19)

Local rehearsal complete on embedded PostgreSQL 17.10: schema applied,
25 tables transferred and reconciled row by row, sequences at the source
AUTO_INCREMENT values, semantics matrix 0 failures, workflow rehearsal
green. Supabase staging: not created yet; `06` lists the hosted checks.
