-- ===========================================================================
-- Roles for the hosted target (Supabase). Run ONCE as the project owner
-- (`postgres`, through the Session pooler as postgres.<ref>) BEFORE
-- 001_portal_schema.sql; then apply 001 + 003 as portal_migrate so it owns
-- every object (scripts/apply-schema.js --target staging).
--
-- PASSWORDS are set by scripts/set-role-passwords.js (D-65, the owner's Q2.4):
-- it reads PORTAL_MIGRATE_PASSWORD and PORTAL_APP_PASSWORD from the secrets
-- file and runs ALTER ROLE … PASSWORD with the value bound as a parameter, so
-- it never sits in a file in git, in the SQL editor's history or in a
-- statement log. psql is not installed on this host (docs/01 §5) and the
-- dashboard has no password field for a custom role.
--
--   portal_migrate  migration + restore role: owns schema portal; DDL, the
--                   transfer's deferred-constraint load, setval, TRUNCATE
--   portal_app      the API's runtime role: DML on portal.* only; no CREATE,
--                   no TRUNCATE, no ALTER, no extensions — and the ONE role
--                   with a row-level-security policy (003_grants_rls.sql)
--
-- Through Supavisor each role signs in as <role>.<project ref> (A1); the role
-- names inside the database carry no ref. The Data API roles (anon,
-- authenticated, service_role) get NOTHING — 003 revokes and RLS denies. The
-- platform's own roles (postgres, supabase_admin, supabase_read_only_user)
-- bypass RLS by attribute and are recorded in docs/06 §2, not fought.
-- ===========================================================================

CREATE ROLE portal_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE portal_app     LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

-- portal_migrate creates the schema in 001; it needs CREATE on the database.
GRANT CREATE ON DATABASE postgres TO portal_migrate;

-- The search path is a role setting, so it belongs to the role's creator here
-- (ALTER ROLE … SET needs the owner, not portal_migrate). The schema need not
-- exist yet for the setting to be stored.
ALTER ROLE portal_app     SET search_path = portal, pg_catalog;
ALTER ROLE portal_migrate SET search_path = portal, pg_catalog;

-- Supavisor refuses a role whose VALID UNTIL has passed (its auth query then
-- returns no secret); say "never" explicitly.
ALTER ROLE portal_app     VALID UNTIL 'infinity';
ALTER ROLE portal_migrate VALID UNTIL 'infinity';

-- The grants on schema portal, its tables, sequences and functions, the
-- default privileges for what portal_migrate creates later, the revokes from
-- PUBLIC and the Data API roles, and the row-level-security policies are
-- 003_grants_rls.sql — applied by scripts/apply-schema.js right after 001,
-- once the objects exist and are owned by portal_migrate.
