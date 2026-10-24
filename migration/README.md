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
  lib/                           paths, env (secrets read from files, never printed),
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
| schema | `node scripts/apply-schema.js --target local\|staging [--drop-first]` | the target | schema `portal` |
| transfer | `node scripts/transfer.js --target … [--source-db …] [--truncate]` | MySQL (read), target (one transaction) | `…-data/rehearsal/transfer_*.json` |
| reconcile | `node scripts/reconcile.js --target …` | both (read) | `…-data/rehearsal/reconcile_*.json` |
| semantics | `node scripts/semantics.js --target … --mysql-db <scratch>` | throwaway `zz_*` objects only | `…-data/rehearsal/semantics_*.json` |
| rehearsal | `node scripts/rehearse.js --target …` | the target, one rolled-back transaction | `…-data/rehearsal/rehearse_*.json` |

Rules every script keeps: the application database is opened `READ ONLY`
at the session level; no value from a real row is printed (counts, ids,
types and table names only); every error message passes through
`lib/safeMessage.js`; nothing is written under `server/backups` or into
any git tree.

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
