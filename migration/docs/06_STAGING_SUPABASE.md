# 06 — The Supabase staging target

**Status 2026-10-19: no staging project exists yet.** The owner creates it and
writes its connection details to
`C:\Users\Win10 User\Parents_Portal-migration-data\secrets\supabase.env`
(format in that folder's `README.txt`). Nothing in this package asks for the
values in a chat, and no script contacts Supabase until that file exists and
`--target staging` is passed explicitly. Every statement below about the
hosted target is therefore **provisional** and is listed again in §4 as a
check to run.

Sources consulted on 2026-10-19: Supabase "Connecting to Postgres",
"Using custom schemas", "Hardening the Data API", the platform upgrade
notes and changelog; PostgreSQL 17 and 18 documentation on collations.

## 1. What to create

| Item | Value | Why |
|---|---|---|
| Project | one dedicated **staging** project for the portal; nothing else in it | the migration role runs DDL and `SET CONSTRAINTS`, and the rehearsal truncates tables; it must not share a database with anything |
| Region | Singapore (`ap-southeast-1`) | nearest to Pateros for the API host; the database's own `TimeZone` stays UTC — the API computes nothing from the server zone (§02 contracts) |
| Postgres major | **17** — the platform's current default per the Supabase changelog; the dashboard shows the exact minor | the schema and the semantics matrix were rehearsed on 17.10; PG 18 would change one conclusion (LIKE on `portal.ci`, §02 D) |
| Database | the project's `postgres` database, application schema **`portal`** (not `public`) | `public` is what the Data API exposes by default; the application never uses the Data API |
| Data API | **disable it** on this project (Project Settings → Data API). If the toggle is unavailable, keep `portal` out of "Exposed schemas" and leave `public` empty | the API is Express + JWT; no table may be reachable through PostgREST/GraphQL with the `anon` key. Supabase's own guidance: "disable the Data API completely" when client libraries are not used |
| Connection for the API | **Session mode** pooler, port 5432 (`aws-<index>-<region>.pooler.supabase.com`), user `portal_app.<project-ref>` — or the direct connection if the host has IPv6 / the IPv4 add-on | the API keeps `pool.getConnection()`-style leased clients, `FOR UPDATE` transactions and `LISTEN`-free but session-stateful work; transaction mode (6543) breaks `SET`, prepared statements and multi-statement transactions on one lease |
| Connection for migration/restore | the **direct** connection (or session mode) as `portal_migrate` | DDL, `SET CONSTRAINTS ALL DEFERRED`, `setval`, long transactions |
| TLS | `sslmode=require` at minimum (pg: `ssl: { rejectUnauthorized: false }`); **`verify-full`** with the project's root certificate once the deployment is settled (`PG_SSL=verify-full`) | `require` encrypts but does not authenticate the server |

## 2. Roles (narrow runtime role, separate migration role)

Run as the project owner (`postgres`) once; `schema/002_roles.sql` holds the
statements. Passwords are set in the dashboard or with `\password`, never in
a file in git.

```
portal_migrate   LOGIN, NOSUPERUSER, CREATEROLE off
                 owns schema portal and every object in it (apply-schema,
                 transfer, backup/restore run as this role)
portal_app       LOGIN, NOSUPERUSER
                 USAGE on schema portal; SELECT/INSERT/UPDATE/DELETE on all
                 tables; USAGE on all sequences; EXECUTE on portal.now_s /
                 now_ms; search_path = portal, pg_catalog; no CREATE
anon / authenticated / service_role   NO grants on portal (they must not see it)
```

`portal_app` cannot TRUNCATE, cannot DROP, cannot ALTER, cannot create
extensions. That is the "limit destination changes to the designated
application objects" rule enforced by the database, not by discipline.

## 3. Application configuration (for the port, not for this phase)

Server `.env` gains `PG_URL` (or `PGHOST`…) + `PG_SSL`; `DB_*` stay only
while MySQL is still the source. `trust proxy` must be set on Express when
the API runs behind a load balancer, or `req.ip` — which feeds
`login_attempts` — is the proxy's address for everyone (Phase 1 flagged
this). `JWT_SECRET` stays the same across the move, or every session and
every `login_attempts.login_key` is orphaned at once (harmless, but it is
the first thing someone would blame on the migration).

## 4. Hosted checks that remain pending (run once `supabase.env` exists)

Each is a command in this package or a dashboard read; record the answer in
`05_VALIDATION_MATRIX.md` → "hosted".

1. `SELECT version()` — the exact PostgreSQL version (expect 17.x). If 18.x,
   re-run `scripts/semantics.js --target staging` and revisit §02 D (LIKE).
2. `SELECT count(*) FROM pg_collation WHERE collprovider = 'i'` — ICU
   present (expected; the schema falls back to the default collation and
   says so in `portal.ci`'s comment if not).
3. `SHOW TimeZone`, `SHOW default_transaction_isolation` (expect UTC, read
   committed) and `SELECT now() - clock_timestamp()` ≈ 0.
4. Clock skew API host ↔ database: `SELECT extract(epoch from now())` against
   `Date.now()` from the host that will run the API, five samples. The
   restore cutoff and the "confirmed since sign-in" rule compare the API's
   JWT `iat` with database stamps in whole seconds; skew above one second
   must be fixed on the host before cutover, not tolerated.
5. Privileges: `CREATE SCHEMA` and `CREATE COLLATION` as `portal_migrate`
   (both needed by `001_portal_schema.sql`); `CREATE EXTENSION citext` and
   `unaccent` availability (`pg_available_extensions`) — neither is required
   by the schema; `unaccent` is the candidate for the accent-insensitive
   search gap.
6. Connection mode: session-mode pooler reachable over IPv4 from the API
   host; a 15-minute idle transaction is not killed (the class-record PUT
   is seconds, but the pooler's limits must be known).
7. `scripts/apply-schema.js --target staging` → expect the same COUNTS line
   as local (26 tables since the 2026-10-24 sync): tables 26, indexes 86,
   fks 35, uniques 15, checks 25, pks 26, enums 13, triggers 7, sequences 25,
   and `COLLATION portal.ci provider=i`.
8. `scripts/transfer.js --target staging` then `scripts/reconcile.js
   --target staging` → `RECONCILE OK`, every sequence equal to the source
   AUTO_INCREMENT.
9. `scripts/semantics.js --target staging` (no `--mysql-db`; the MySQL side
   is already recorded locally) → the same PASS set as the local run;
   section F needs two connections, so it must run through session mode
   or direct, never 6543.
10. `scripts/rehearse.js --target staging` → `REHEARSAL OK`.
11. Data API: confirm from the dashboard that it is disabled or that
    `portal` is not an exposed schema, then `curl` the REST endpoint for
    `/rest/v1/users` with the anon key and expect no rows and no schema.
12. Backups: confirm the plan's automatic backup cadence and PITR
    availability for the project (both are inputs to §04).

## 5. What is deliberately NOT in scope on the hosted side

Supabase Auth, Row Level Security policies, Storage for profile photos,
Edge Functions, Realtime and the Data API are not used. Authorization stays
in Express (`authenticate` + `authorize()`), the JWT stays the API's own,
and Socket.io stays in-process on the one API host. Each of those is a
separate decision with its own consequences for the clients, and none is a
prerequisite for moving the database.
