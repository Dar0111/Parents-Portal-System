# 07 — Cutover and rollback outline

Preconditions recorded by the owner on 2026-10-19: **no live users** (seed,
team and check data only) and **downtime is acceptable**. Neither changes
the procedure below; they only mean the freeze window can be generous and
no parent has to be told. The procedure still preserves every row, because
the test and check data are the team's own history (backup numbers and
`activity_logs` ids are cited in `docs/CHANGELOG.md`).

Prerequisites, all from this package: the application port merged and
green against the local PostgreSQL copy (`03_QUERY_PORT_INVENTORY.md`),
the hosted checks in `06_STAGING_SUPABASE.md` §4 all answered, the roles made
(`002` as the owner, `roles:passwords`, `06` §2) and `003`'s two walls proven
on the hosted target (`06` §4 items 7, 8 and 13), and the Backup & Restore
replacement in `04_BACKUP_RESTORE_DESIGN.md` built and rehearsed — a cutover
without a working restore has no rollback inside the new system.

**The owner's decisions of 2026-10-24 that govern MySQL's fate are
recorded here and nowhere else: D-19, D-66 and D-67 (Phase 4 and the
decision table).** Every step that drops or deletes anything is the owner's
to approve, with the command shown first.

## Phase 0 — rehearsal (any day before)

1. `snapshot` → `snapshot:restore-check` (MySQL, isolated).
2. `pg:schema --target staging` (001 + 003, the COUNTS and POLICIES lines)
   → `rls:check --target staging` (the catalog part) → `transfer --target
   staging` → `reconcile --target staging` → `semantics` → `rehearse`.
3. Run the ported server against staging with `MAIL_TRANSPORT=file
   SMS_TRANSPORT=file`, then the HTTP suites retargeted per
   `05_VALIDATION_MATRIX.md` §3. Fix, re-apply with `--drop-first`
   (staging is disposable until cutover), repeat.
4. Time the whole thing. The data is < 10 MB; expect minutes, not hours.

## Phase 1 — freeze (cutover day)

1. Announce the window to the team; stop the web dev server and the Expo
   bundler so nobody writes by habit.
2. Stop the running API (`npm start`). **This is the write freeze**: the
   only writers are the API and the suites, and both are down. Nothing in
   MySQL changes from here on.
3. `snapshot` → `snapshot:restore-check` — the final source snapshot, with
   its manifest. Record the per-table counts and AUTO_INCREMENT values; they
   are the acceptance figures for step 2 below.

## Phase 2 — load

1. `pg:schema --target staging` on an EMPTY schema — `001` and `003` in one
   transaction, the POLICIES line read back (`06` §2a). If the rehearsal
   left a schema, `--drop-first` is refused for staging on purpose, by the
   flag before any secret is read and by the connection after (D-65, the
   owner's Q2.3): the owner drops it by hand as `portal_migrate` after
   confirming it holds rehearsal data only, the command shown first — with
   `node scripts/drop-staging-schema.js --target staging` (the owner's Q5,
   2026-10-26): the read-only survey, the statement printed, the typed
   `DROP portal`, one transaction through the pooler with verify-full, the
   read-back. Its test runs on a disposable local database only
   (`scripts/test-drop-staging-schema.js`).
2. `transfer --target staging` — one transaction, every FK deferred, every
   sequence set to the source AUTO_INCREMENT. Any error → automatic
   ROLLBACK → fix → rerun. There is no partial state to clean up.
3. `reconcile --target staging` → must print `RECONCILE OK` with `grown=0`
   on every table (the API is stopped, so nothing may have grown).
4. Copy `server/uploads/avatars/` to the new API host (0 files today) and
   `server/policy/` is in git. `server/backups/` stays where it is — the
   historical dumps are MySQL files and are recovered through §04's
   historical path, never through the new restore endpoint.

## Phase 3 — switch

1. Deploy the ported API connecting as `portal_app.<ref>` through the
   Session pooler (port 5432) with `verify-full` and the project's CA (`06`
   §0 and §1; the direct host is not used), the restore endpoint's one-off
   connection as `portal_migrate.<ref>`, `trust proxy` set, `JWT_SECRET`
   unchanged, `CORS_ORIGIN` listing the web origin, `VITE_API_BASE_URL` /
   `EXPO_PUBLIC_API_URL` pointing at the new API host (the phone needs a
   rebuilt bundle for that).
2. `GET /api/health` must answer `"db":"ok"` (the ported health check runs
   `SELECT 1` on the pg pool).
3. **Invalidate every session once, deliberately:** write
   `auth_security_state.token_valid_after = portal.now_s()` through the
   restore endpoint's bookkeeping statement (or the admin "sign everyone
   out" action if the port adds one). Tokens minted against MySQL carry
   `token_version` values that the copy preserved, so they would otherwise
   keep working — which is correct but makes "which database did this
   request hit" ambiguous during verification.
4. Smoke: sign in as each seeded role, the three gates, a grade read, the
   class record dry run, an attendance upsert on the fixture learner (Tala),
   a message, the dashboards, Admin → Backup & Restore (create one backup
   with the new mechanism and confirm it lists), then delete what the smoke
   wrote by id. `npm run smoke` (the read-only Playwright run) against the
   new API.
5. **The post-cutover checks (the owner's answers of 2026-10-26).** The web
   smoke: `node scripts/staging-api.js --smoke-live` in `migration/` against
   the owner's API on 5000 and web on 3000 — the flag in the smoke child's
   environment only, read-only counts by role before and after, which must
   match (Q8 (b)). The phone: the SHORT starred check, not the full sheet
   (Q3), with real mail and SMS:
   - **the email code** from **Forgot password on Ana Reyes** (the
     adviser-only teacher, whose confirmed email is the project's own Gmail)
     — read the code, then **stop before any reset**. **Never #7's Verify
     email:** #7's address on file is a seed address, and #7's data must not
     change;
   - **the SMS code** from **Forgot password on Lito** — read the code, then
     **stop before any reset**.

## Phase 4 — after the switch: writes that happen after cutover

Everything written after Phase 3 exists only in PostgreSQL. Two cases:

- **Roll back within the window** (a smoke failure, a defect found in the
  first hours): stop the new API, restart the MySQL-backed API as it was.
  Rows written to PostgreSQL in between are **lost by decision**, and the
  rollback note says so with the counts: `reconcile --target staging` run
  backwards is not provided; instead `SELECT count(*)` per table on
  PostgreSQL minus the Phase 1 snapshot counts gives the number of rows
  abandoned, table by table, for the record. With no live users this is a
  team note, not a parent-facing incident.
- **Roll back later** (days): the PostgreSQL side is now the system of
  record; "rollback" means a reverse transfer (PostgreSQL → MySQL), which
  this package does not build. The decision point is the end of the smoke
  window: after it, forward-fix on PostgreSQL. Write that down in the
  CHANGELOG row of the cutover with the time.

**MySQL after the cutover — the owner's decisions of 2026-10-24:**

- **D-19.** Nothing happens to MySQL until the cutover is done and the whole
  database is confirmed working on Supabase (D-67). The final snapshot
  `.sql` of Phase 1 and its manifest in `Parents_Portal-migration-data` are
  kept. Any `DROP` — a database, a scratch, a table — goes through the
  owner's approval like every destructive step, the command shown first.
- **D-66.** After the cutover and the D-67 checks, MySQL is **not deleted**:
  it stays on the laptop, disconnected from the app (the API's `DB_*` keys
  removed, or the MySQL service kept stopped), as the fallback. Deleting it
  later is a new decision with its own date.
- **D-67.** Before the app leaves MySQL for good, or anything is dropped,
  three things, in order: (1) `RECONCILE OK` on Supabase for every table
  (26) and every sequence; (2) the full smoke gate passing on Supabase, on
  the web and on the phone; (3) the owner's explicit go, with any `DROP`
  command screenshotted to the chat before approval.

The two scratch databases `parents_portal_migsrc_20261019_145706` and
`parents_portal_migsrc_20261024_164012` stay until after the cutover; the
owner drops both by hand then (the owner's answer Q2.6, 2026-10-24).

## Rollback decision table

| Moment | Action | Data consequence |
|---|---|---|
| Phase 2 fails | transfer rolled back itself; fix and rerun | none |
| Phase 3 smoke fails | stop new API, restart MySQL API | smoke rows abandoned (count them) |
| First hours, defect | same as above | post-cutover rows abandoned, counted |
| After the smoke window | forward-fix on PostgreSQL | none; MySQL is the disconnected fallback (D-66), not history |
| D-67 not yet satisfied | MySQL stays as it was; nothing dropped (D-19) | none |
| D-67 satisfied, the owner's go given | the app leaves MySQL; MySQL stays on the laptop, disconnected (D-66) | none; a later deletion is a new decision |
| Restore needed on PostgreSQL | §04 restore (application-scope, transactional) | sessions invalidated by the cutoff, as today |
| Restore needed from a pre-cutover MySQL dump | §04 historical path: MySQL scratch → transfer → reconcile | the PostgreSQL rows newer than that dump are replaced, as a snapshot restore does today |
