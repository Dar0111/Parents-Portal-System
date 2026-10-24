# 06 — The Supabase staging target

**Status 2026-10-25 (Session B step 3, the staging run): the project holds
the portal.** The owner wrote the three keys of §0 and the CA file; then, in
order and each its own command: `002` as the owner, the two passwords set
and verified through the pooler, `001` + `003` applied (COUNTS and POLICIES
equal to the local lines), the 2026-10-24 scratch transferred (26 tables,
30,780 rows) and reconciled (`RECONCILE OK`, every sequence equal), the RLS
catalog checks and the behavioural probe (three Data API roles refused with
42501 on `portal`), the semantics matrix and the rehearsal. Every connection
was `verify-full` over TLSv1.3 against the project's intermediate CA, the
certificate matching the pooler host. **Three things the run found, §4:**
the clock of this laptop is about 9.8 s behind the database (item 4 — the
two hosted check failures are that, nothing else); the semantics script
installed the `citext` extension into `portal` as a side effect (item 5 — a
`DROP EXTENSION` awaiting the owner's approval); the read-only MCP runs as
`supabase_read_only_user` and cannot `SET ROLE`, so the behavioural probe
ran as the owner instead (item 13). The application stays on MySQL; nothing
in `server/`, `client/` or `mobile/` changed.

(2026-10-24, the D-65 fix round: the project existed, `supabase.env` did
not; the catalog facts read through the MCP that day are in §4.) No script
contacts Supabase unless `--target staging` is passed explicitly; nothing in
this package asks for a value in a chat.

Sources consulted on 2026-10-19: Supabase "Connecting to Postgres",
"Using custom schemas", "Hardening the Data API", the platform upgrade
notes and changelog; PostgreSQL 17 and 18 documentation on collations. On
2026-10-24, through the docs search: "Connect to your database" (the pooler
user name `<role>.<project ref>`), "Connecting with PSQL" and "Postgres SSL
Enforcement" (`verify-full` with the downloaded CA, the pooler host included),
"Supavisor connection error: EAUTHQUERY" (an expired `VALID UNTIL`).

## 0. The secrets file — three keys, no value written twice (A2)

`C:\Users\Win10 User\Parents_Portal-migration-data\secrets\supabase.env`, one
key per line, written by the owner, never pasted into a chat, never printed
by a script (`scripts/set-role-passwords.js --dry-run` reports missing KEY
NAMES only):

| Key | Holds | Where it comes from |
|---|---|---|
| `PG_OWNER_URL` | the **Session pooler** URI for the owner role, the dashboard's line with the database password filled in — user `postgres.<ref>`, host `aws-0-ap-southeast-1.pooler.supabase.com`, port 5432, database `postgres` | the dashboard's **Connect** panel → **Session pooler** (port 5432); the database password from Project Settings → Database (reset it there if it is not known) |
| `PORTAL_MIGRATE_PASSWORD` | the password `scripts/set-role-passwords.js` gives `portal_migrate` — a new, long, random value | the owner's password manager; it exists nowhere in the dashboard |
| `PORTAL_APP_PASSWORD` | the same for `portal_app` (the API's runtime role) | the owner's password manager |

Beside it, recommended: **`prod-ca-2021.crt`**, the project's root
certificate, from Project Settings → Database → **SSL Configuration** →
Download certificate. With it every staging connection is `verify-full`;
without it a script refuses to connect unless `--tls-encrypt-only` is passed,
and then says on its first line that it encrypts without verifying (§1, TLS).

Derived from `PG_OWNER_URL` by `lib/env.js` and never written a second time:
the host, the port, the database, the project ref, and each role's pooler
user name `<role>.<ref>` (A1 — Supavisor's format for every role, the owner's
and the two portal roles alike). The 2026-10-19 keys (`PG_URL`, `PGHOST`,
`PGUSER`…) are no longer read. The direct host (`db.<ref>.supabase.co`) is
IPv6-only on this network and is not used anywhere.

## 1. What to create

| Item | Value | Why |
|---|---|---|
| Project | one dedicated **staging** project for the portal; nothing else in it | the migration role runs DDL and `SET CONSTRAINTS`, and the rehearsal truncates tables; it must not share a database with anything |
| Region | Singapore (`ap-southeast-1`) | nearest to Pateros for the API host; the database's own `TimeZone` stays UTC — the API computes nothing from the server zone (§02 contracts) |
| Postgres major | **17** — the platform's current default per the Supabase changelog; the dashboard shows the exact minor | the schema and the semantics matrix were rehearsed on 17.10; PG 18 would change one conclusion (LIKE on `portal.ci`, §02 D) |
| Database | the project's `postgres` database, application schema **`portal`** (not `public`) | `public` is what the Data API exposes by default; the application never uses the Data API |
| Data API | **ON, as the owner approved (D-17)**, with Supabase's "Enable automatic RLS" setting on. `portal` is never an exposed schema and `public` holds no portal object, so PostgREST and GraphQL see nothing of the portal; the two walls that make that true whatever the toggle says are `003_grants_rls.sql` (§2a, D-83) | the API is Express + JWT; no table may be reachable through the Data API with the `anon` key — proven by §4 items 11 and 13, not by the toggle. (2026-10-19 said "disable it"; D-17 keeps it on.) |
| Connection for the API | **Session mode** pooler, port 5432, host `aws-0-ap-southeast-1.pooler.supabase.com`, user **`portal_app.<project-ref>`** (A1) | the API keeps `pool.getConnection()`-style leased clients, `FOR UPDATE` transactions and session-stateful work; transaction mode (6543) breaks `SET`, prepared statements and multi-statement transactions on one lease. The direct host is IPv6-only here and is not used |
| Connection for migration/restore | the same Session pooler as **`portal_migrate.<project-ref>`**; the owner's own steps (002, the passwords) as `postgres.<project-ref>` from `PG_OWNER_URL` | DDL, `SET CONSTRAINTS ALL DEFERRED`, `setval`, long transactions — all session-mode safe |
| TLS (A3) | **always on**; `verify-full` when `secrets/prod-ca-2021.crt` is present (`lib/env.js`: `rejectUnauthorized: true`, the CA as the trust anchor, `servername` = the pooler host, so the chain AND the host name are checked); without the file a script refuses unless `--tls-encrypt-only`, and then prints the mode. What the open connection checked is printed by `tlsFacts()`: encrypted, protocol, chain verified, the authorization error if any, the certificate's subject and issuer CN, its expiry and its subject alternative names | `require` encrypts but does not authenticate the server; Supabase's docs use the downloaded CA with the pooler host too ("Connecting with PSQL") |

## 2. Roles (narrow runtime role, separate migration role)

Run `schema/002_roles.sql` once as the project owner (`postgres.<ref>` from
`PG_OWNER_URL`, through the Session pooler). **Passwords are set by
`scripts/set-role-passwords.js --target staging` (D-65, the owner's Q2.4):**
it reads the two password keys from `supabase.env`, connects as the owner and
runs `SELECT set_config('portal.pw', $1, true)` with the value as a BIND
PARAMETER, then a `DO` block that executes `ALTER ROLE <role> PASSWORD %L`
from `current_setting('portal.pw')` — so the value never appears in a
statement's text, a server log, the SQL editor's history or any file in git —
sets `VALID UNTIL 'infinity'` (an expired role makes Supavisor's auth query
return no secret), clears the setting and commits; then it signs in through
the pooler as `<role>.<ref>` with the new password and runs `SELECT 1`, and
prints the role names, "verified" and the TLS facts. `--dry-run` opens no
connection and names what is missing. psql is not installed here (`01` §5)
and the dashboard has no password field for a custom role.

```
portal_migrate   LOGIN, NOSUPERUSER, CREATEROLE off
                 owns schema portal and every object in it (apply-schema,
                 transfer, backup/restore run as this role); exempt from RLS
                 as the OWNER (no FORCE — the owner's Q2.1)
portal_app       LOGIN, NOSUPERUSER
                 USAGE on schema portal; SELECT/INSERT/UPDATE/DELETE on all
                 tables; USAGE on all sequences; EXECUTE on portal.now_s /
                 now_ms / touch_updated_at; search_path = portal, pg_catalog;
                 no CREATE; the ONE role with a row-level-security policy
anon / authenticated / service_role   NO grants on portal, NO policy
```

`portal_app` cannot TRUNCATE, cannot DROP, cannot ALTER, cannot create
extensions. That is the "limit destination changes to the designated
application objects" rule enforced by the database, not by discipline.

**What no file can deny (the owner's Q2.2, read from the project's catalog on
2026-10-24):** `postgres` — not a superuser, but BYPASSRLS, a member of
`pg_read_all_data`, and a member of `anon`, `authenticated`, `service_role`
and `authenticator` with INHERIT and SET; `supabase_admin` — the superuser;
`supabase_read_only_user` — BYPASSRLS. They are the platform's own roles: the
dashboard, the read-only MCP and Supabase's operators read through them, and
`003` does not fight them. Consequence for the proofs: the read-only MCP
runs as **`supabase_read_only_user`** (read 2026-10-25: `current_user` and
`session_user` both that role, BYPASSRLS, `transaction_read_only` on, no SET
on `anon`), so it proves the CATALOG only; the behavioural probe runs as the
owner `postgres.<ref>` through the pooler, inside `BEGIN READ ONLY`, because
`postgres` holds SET on the three Data API roles (item 13). Neither can be a
deny probe for its own role: on 2026-10-25 the owner's own `SELECT` on
`portal.users` returned its 8 rows, as this paragraph predicts.

### 2a. The RLS file — `schema/003_grants_rls.sql` (D-83 Option A, D-13)

Applied by `scripts/apply-schema.js` right after `001`, in the same
transaction, on both targets. Two walls:

1. **Privileges.** The grants to `portal_app` that `002` once carried as a
   comment block (USAGE on the schema; SELECT, INSERT, UPDATE, DELETE on all
   tables; USAGE on all sequences; EXECUTE on all functions; the three
   `ALTER DEFAULT PRIVILEGES FOR ROLE portal_migrate IN SCHEMA portal`), then
   `REVOKE ALL` on the schema, all tables, all sequences and all functions
   from PUBLIC and — guarded by `pg_roles`, because the local cluster lacks
   them — from `anon`, `authenticated` and `service_role`.
2. **Row Level Security** on every portal table, two statements each,
   written out for all 26 so the file reads like `001`: `ENABLE ROW LEVEL
   SECURITY` and `CREATE POLICY portal_app_all … AS PERMISSIVE FOR ALL TO
   portal_app USING (true) WITH CHECK (true)`. **No FORCE** (Q2.1):
   `portal_migrate` owns the tables and runs the transfer, the restore's
   TRUNCATE + COPY and `setval`; with FORCE and one policy for `portal_app`
   the owner's own INSERTs would be refused. A closing `DO` block RAISES if a
   portal table is left without RLS, with FORCE, or without exactly one
   `portal_app_all` policy — a 27th table added to `001` without its two
   lines fails the apply. `apply-schema.js` prints a POLICIES line after the
   COUNTS line; on 2026-10-24, local: `rls_on 26, forced 0, policies 26,
   portal_app_all 26, app_schema_usage true, app_schema_create false,
   app_dml_tables 26, app_truncate_tables 0, app_usage_sequences 25,
   anon/authenticated/service_role schema usage false, anon/service_role
   select tables 0`.

Parent-vs-teacher rules stay in Express (`authenticate` + `authorize()`); the
database never decides scope. The application connects as `portal_app` only
(§3); the restore endpoint's one-off connection as `portal_migrate` (`04`).

**The local proof — `scripts/rls-check.js --target local`** (one transaction,
rolled back; 2026-10-24: `RLS CHECK OK`, 20 checks, 6 INFO lines,
`rlscheck_local_20261024T090921.json`): the catalog (26 on, 0 forced, 26
`portal_app_all`, `portal_app` USAGE + DML on 26 and TRUNCATE on 0, sequences
25 of 25, `now_s()` executable; the three Data API roles with no schema usage
and no table privilege); **deny** — `anon`, `authenticated` and `service_role`
(BYPASSRLS, like Supabase's) get 42501 on SELECT, INSERT, UPDATE and DELETE on
every table, 104 of 104 each; **RLS alone** — a throwaway role GRANTED SELECT
and INSERT but given no policy sees 0 rows in all 26 tables (18 of them
populated) and its INSERT is 42501 with RLS's own message; **allow** —
`portal_app` sees the owner's counts on all 26, inserts, updates and deletes a
synthetic row (an explicit id far above the source's, so no sequence moves),
and gets 42501 on TRUNCATE, ALTER TABLE, DROP TABLE and CREATE TABLE; **owner**
— the 26 tables moved to a throwaway owner inside the transaction, which reads
every row and inserts without any policy (the no-FORCE rule); **rollback** —
no throwaway role, no synthetic row, every table back with its owner, 26
policies. The first run found one thing worth keeping: the emulated owner's
INSERT was refused by `portal.now_s()` (the default on `attempted_at`), not by
RLS — the function revoke from PUBLIC works, and `portal_app` inserts only
because `003` grants it EXECUTE. A reconcile right after the check printed
`RECONCILE OK` with every sequence equal.

**The hosted proof** (pending `supabase.env`): `rls-check.js --target staging`
runs the catalog part as `portal_migrate` and skips the behaviour matrix
(not a superuser); the behaviour is probed through the read-only MCP, §4
item 13.

## 3. Application configuration (for the port, not for this phase)

Server `.env` gains the API's connection — the Session pooler host, port
5432, database `postgres`, user `portal_app.<ref>`, its password, and the CA
file for `verify-full` (one `PG_URL` plus a `PG_CA_FILE`, or the `PG*`
pieces; the port decides) — and, for the restore endpoint only, the
`portal_migrate` credential (`04`); `DB_*` stay only while MySQL is still the
source. `trust proxy` must be set on Express when
the API runs behind a load balancer, or `req.ip` — which feeds
`login_attempts` — is the proxy's address for everyone (Phase 1 flagged
this). `JWT_SECRET` stays the same across the move, or every session and
every `login_attempts.login_key` is orphaned at once (harmless, but it is
the first thing someone would blame on the migration).

## 4. Hosted checks that remain pending (run once `supabase.env` exists)

Each is a command in this package or a dashboard read; record the answer in
`05_VALIDATION_MATRIX.md` → "hosted".

1. `SELECT version()` — **answered 2026-10-24 through the read-only MCP
   (D-70): PostgreSQL 17.11** (aarch64), so `02` §D's LIKE rule stays
   `COLLATE "C" ILIKE`; re-read before cutover in case the platform moves
   to 18.
2. `SELECT count(*) FROM pg_collation WHERE collprovider = 'i'` — **answered:
   853, ICU present.**
3. `SHOW TimeZone`, `SHOW default_transaction_isolation` — **answered: UTC,
   read committed.** `SELECT now() - clock_timestamp()` ≈ 0 still to run on
   the first connected session. Also read on 2026-10-24: schemas `auth,
   extensions, graphql, graphql_public, public, realtime, storage, vault`
   (no `portal` yet, `public` without tables); `portal_app` and
   `portal_migrate` not created yet; `anon` carries `statement_timeout=3s`,
   `authenticated` and `authenticator` 8 s, a custom role none; default ACLs
   grant the Data API roles on new objects in `public` and `storage` only,
   never in `portal`.
4. Clock skew API host ↔ database — **measured 2026-10-25 from this laptop,
   five samples of `clock_timestamp()` with the round trip halved (43–47 ms):
   the database is 9,776 ms AHEAD of this host, median, spread 1 ms.** That
   is the laptop's clock, not the port: the semantics matrix's
   `B.cutoff_same_second_token_minted_after_write_is_accepted` and the
   rehearsal's `restore.cutoff_rejects_old_token_accepts_new` are the only
   two hosted expectations not met, and both compare `Date.now()` here with
   `portal.now_s()` there (locally one clock served both). **Open until the
   host that will run the API is time-synced and this measurement reads
   under one second**; the restore cutoff and "confirmed since this sign-in"
   compare a JWT `iat` with database stamps in whole seconds, and a skew
   above one second is fixed on the host before cutover, never tolerated.
5. Privileges — **answered 2026-10-25:** `CREATE SCHEMA` and `CREATE
   COLLATION` as `portal_migrate` both worked (`001` applied, `portal.ci`
   ICU nondeterministic). `pg_available_extensions`: `citext` 1.6 and
   `unaccent` 1.1 available, neither installed before the run. **Side effect
   to undo:** `scripts/semantics.js` §D runs `CREATE EXTENSION IF NOT EXISTS
   citext` to measure it, and on Supabase a trusted extension may be created
   by a non-superuser — it is now installed **in schema `portal`**, owned by
   `supabase_admin` (the platform's extension mechanism), adding its
   functions to the schema (50 functions where `001` makes 3). `02` §D
   measured `citext` and did NOT choose it. The remedy is one statement,
   `DROP EXTENSION citext;` as the owner, which waits for the owner's
   approval like every DROP (D-19); the script itself should measure
   `citext` only where it is already present — a change for the next round,
   not this one. The rehearsal's `CREATE EXTENSION IF NOT EXISTS unaccent`
   also succeeded but inside a savepoint that the rolled-back transaction
   discarded: `unaccent` is NOT installed. No `zz_%` relation or collation
   remains in `portal` (0 and 0); relations 51 = 26 tables + 25 sequences.
6. Connection mode — **partly answered 2026-10-25:** the session-mode pooler
   is reachable over IPv4 from this host (every step of the run went through
   it, as `postgres.<ref>`, `portal_migrate.<ref>` and `portal_app.<ref>`).
   Still open: a 15-minute idle transaction is not killed (the class-record
   PUT is seconds, but the pooler's limits must be known).
7. `scripts/apply-schema.js --target staging` — **ran 2026-10-25, as
   `portal_migrate.<ref>`:** COUNTS tables 26, indexes 86, fks 35, uniques
   15, checks 25, pks 26, enums 13, triggers 7, sequences 25; POLICIES
   `rls_on 26, forced 0, policies 26, portal_app_all 26, app_schema_usage
   true, app_schema_create false, app_dml_tables 26, app_truncate_tables 0,
   app_usage_sequences 25, anon / authenticated / service_role schema usage
   false, anon / service_role select tables 0`; `COLLATION portal.ci
   provider=i deterministic=false`; database `postgres`, encoding UTF8,
   provider ICU — every figure equal to the local lines. Before it, the same
   day: `002` as the owner (both roles LOGIN, no superuser, no BYPASSRLS,
   `VALID UNTIL` infinity, `search_path` set; `portal_migrate` holds CREATE
   on the database), then `scripts/set-role-passwords.js --target staging`
   → `ROLE PASSWORDS OK`, each role verified by signing in through the
   pooler. TLS, printed once by `tlsFacts()`: encrypted, TLSv1.3, chain
   verified, no authorization error, subject `*.pooler.supabase.com`,
   issuer `Supabase Intermediate 2021 CA`, valid to March 2030, SANs the
   two pooler wildcards — `verify-full` held on every connection.
8. `scripts/transfer.js --target staging --source-db
   parents_portal_migsrc_20261024_164012` — **ran 2026-10-25:** 26 tables,
   30,780 rows (activity_logs 30,409), one transaction
   (`rehearsal/transfer_staging_20261024T170617.json`); `scripts/reconcile.js
   --target staging --source-db …` → **`RECONCILE OK`**, 26 tables, 0 missing /
   extra / differing, 0 grown, every sequence equal, catalog pks 26 /
   uniques 15 / fks 35 / checks 25 / indexes 86
   (`reconcile_staging_20261024T170651.json`); `scripts/rls-check.js --target
   staging` → **`RLS CHECK OK`**, the 7 catalog checks PASS, the behaviour
   matrix reported as skipped (`rlscheck_staging_20261024T170700.json`).
9. `scripts/semantics.js --target staging` (no `--mysql-db`) — **ran
   2026-10-25: one expectation not met of the PostgreSQL-side set, the
   clock-skew one (item 4); every other PASS, the collation matrix identical
   to the local run** (`semantics_staging_20261024T170819.json`). Section F
   ran through session mode with its two connections. The run's `citext`
   side effect is item 5. Its §F creates and drops throwaway tables in
   `portal` rather than rolling back — nothing remained.
10. `scripts/rehearse.js --target staging` — **ran 2026-10-25: 90 checks,
    89 PASS, 1 FAIL — the restore cutoff's same-second case, item 4;
    `rollback.left_no_synthetic_rows` 0** (`rehearse_staging_20261024T170837.json`).
    The `unaccent` INFO read `true` inside its savepoint and left nothing
    (item 5).
11. Data API (D-17 keeps it on): **a dashboard check, no curl** — Project
    Settings → Data API: the **Exposed schemas** list does not contain
    `portal`, and `public` holds no portal table (the Table Editor shows
    none); record the date in `05`. Then, through the read-only MCP:
    `SELECT has_schema_privilege('anon', 'portal', 'USAGE'),
    has_schema_privilege('authenticated', 'portal', 'USAGE'),
    has_schema_privilege('service_role', 'portal', 'USAGE')` → three
    `false`. (The 2026-10-19 curl with the anon key is withdrawn: it put a key
    on a command line and proved less than the catalog does.) **Catalog part
    ran 2026-10-25 through the MCP: the three `false`; `rls_on` 26 of 26;
    26 `portal_app_all` policies; `current_setting('pgrst.db_schemas', true)`
    is null, and `pg_db_role_setting` holds no `pgrst.*` entry for
    `authenticator` or any role — the exposed-schema list lives in the
    dashboard's API settings, not in the catalog, so the dashboard read is
    the part still open, the owner's.**
12. Backups: confirm the plan's automatic backup cadence and PITR
    availability for the project (both are inputs to §04). **Open.**
13. **The RLS proof on the hosted target — ran 2026-10-25.** The catalog
    statements through the MCP as planned (item 11's figures). The
    behavioural probe could NOT run through the MCP: its session is
    `supabase_read_only_user`, which holds no SET on the Data API roles
    (`permission denied to set role`), so it ran as the owner through the
    pooler, each role in its own `BEGIN READ ONLY … ROLLBACK`: `SET LOCAL
    ROLE anon`, then `authenticated`, then `service_role`, each followed by
    `SELECT 1 FROM portal.users LIMIT 1` → **42501 "permission denied for
    schema portal", three of three** — the privilege wall, before RLS is
    consulted. The owner's own read of the same table returned 8 rows, the
    platform-role fact §2 records.
14. Supabase's automatic-RLS trigger — **answered 2026-10-24, present:**
    event trigger `ensure_rls` on `ddl_command_end` for `CREATE TABLE`,
    `CREATE TABLE AS` and `SELECT INTO`, calling `public.rls_auto_enable()`
    (SECURITY DEFINER, owner `postgres`, `search_path` pinned to
    `pg_catalog`); it enables RLS only when the new table's schema is
    `public` and swallows every error with a LOG line. It is D-17's
    "Enable automatic RLS" setting, kept on; it never reaches `portal`, which
    `003` covers table by table, and it cannot break `apply-schema` on
    staging. Nothing to add.

## 5. What is and is not in scope on the hosted side (D-13, D-17, D-83)

**Row Level Security IS used — D-13 overrides this section's 2026-10-19
"RLS unused", and D-83 says how it reaches `portal`:** RLS on every portal
table, one allow policy for `portal_app` only, every other role denied, the
Data API roles included (§2a, `003_grants_rls.sql`). It is the second wall
behind the privilege grants, never the authorization: parent-vs-teacher rules
stay in Express (`authenticate` + `authorize()`), the JWT stays the API's own,
and Socket.io stays in-process on the one API host. D-13 also includes
Supabase's "Enable automatic RLS" setting, which covers `public` only (§4
item 14).

**The project's settings as approved (D-17):** the Data API on, "Enable
automatic RLS" on. The Data API exposes nothing of the portal because
`portal` is not an exposed schema and `003` leaves its roles with no USAGE on
the schema (§4 items 11 and 13).

**Still not used:** Supabase Auth, Storage for profile photos, Edge Functions
and Realtime. Each of those is a separate decision with its own consequences
for the clients, and none is a prerequisite for moving the database.

**MySQL after the cutover (D-19, D-66, D-67)** is `07`'s matter: nothing
happens to MySQL until the cutover is done and the whole database is confirmed
working on Supabase; it then stays on the laptop, disconnected from the app,
as the fallback; deleting it is a new decision.
