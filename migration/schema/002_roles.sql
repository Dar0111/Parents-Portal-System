-- ===========================================================================
-- Roles for the hosted target (Supabase). Run ONCE as the project owner
-- (`postgres`) BEFORE 001_portal_schema.sql, then apply 001 as portal_migrate
-- so it owns every object. Passwords are set in the dashboard or with
-- \password — never written into this file or any file in git.
--
--   portal_migrate  migration + restore role: owns schema portal; DDL, the
--                   transfer's deferred-constraint load, setval, TRUNCATE
--   portal_app      the API's runtime role: DML on portal.* only; no CREATE,
--                   no TRUNCATE, no ALTER, no extensions
--
-- The Data API roles (anon, authenticated, service_role) get NOTHING here.
-- docs/06_STAGING_SUPABASE.md §2.
-- ===========================================================================

CREATE ROLE portal_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE portal_app     LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

-- portal_migrate creates the schema in 001; it needs CREATE on the database.
GRANT CREATE ON DATABASE postgres TO portal_migrate;

-- After 001 has run as portal_migrate (the objects exist and are owned by it):
--   GRANT USAGE ON SCHEMA portal TO portal_app;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA portal TO portal_app;
--   GRANT USAGE ON ALL SEQUENCES IN SCHEMA portal TO portal_app;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA portal TO portal_app;
--   ALTER DEFAULT PRIVILEGES FOR ROLE portal_migrate IN SCHEMA portal
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app;
--   ALTER DEFAULT PRIVILEGES FOR ROLE portal_migrate IN SCHEMA portal
--     GRANT USAGE ON SEQUENCES TO portal_app;
--   ALTER DEFAULT PRIVILEGES FOR ROLE portal_migrate IN SCHEMA portal
--     GRANT EXECUTE ON FUNCTIONS TO portal_app;
--   ALTER ROLE portal_app SET search_path = portal, pg_catalog;
--   ALTER ROLE portal_migrate SET search_path = portal, pg_catalog;
--   REVOKE ALL ON SCHEMA portal FROM PUBLIC, anon, authenticated, service_role;
-- (kept as comments so this file stays runnable before the schema exists;
-- scripts/apply-schema.js prints them as the next step on a staging target.)
