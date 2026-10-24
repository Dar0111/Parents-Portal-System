-- ===========================================================================
-- Grants and Row Level Security for schema portal — D-83 (RLS Option A) and
-- D-13, the owner's decisions of 2026-10-24. Run as portal_migrate (the owner
-- of every object) RIGHT AFTER 001_portal_schema.sql, in the same transaction:
-- scripts/apply-schema.js applies 001 then this file on both targets.
--
-- THE TWO WALLS. (1) Privileges: portal_app gets DML and nothing else; PUBLIC
-- and the Data API roles (anon, authenticated, service_role) get nothing on
-- the schema, its tables, sequences or functions. (2) Row Level Security on
-- every portal table with ONE permissive policy, portal_app_all, for
-- portal_app alone — a role that somehow held a table privilege but no policy
-- would still see no row and insert none. Parent-vs-teacher rules stay in
-- Express (authenticate + authorize()); the database never decides scope.
--
-- NO FORCE ROW LEVEL SECURITY (the owner's Q2.1): portal_migrate owns the
-- tables and runs the transfer, the restore's TRUNCATE + COPY and setval; with
-- FORCE and a single policy for portal_app, the owner's own INSERTs would be
-- refused. The owner is exempt by PostgreSQL's ownership rule, documented here
-- and measured by scripts/rls-check.js (the zz_owner case).
--
-- WHAT NO FILE CAN DENY (the owner's Q2.2, read from the project's catalog on
-- 2026-10-24): `postgres` (BYPASSRLS and a member of pg_read_all_data — the
-- dashboard and the read-only MCP), `supabase_admin` (the superuser) and
-- `supabase_read_only_user` (BYPASSRLS). They are the platform's own roles and
-- are recorded in docs/06 §2, not fought here.
--
-- Supabase's automatic-RLS event trigger (ensure_rls → public.rls_auto_enable,
-- D-17) acts on schema public only and swallows errors; it never reaches
-- portal, which is why every table is named below. The final block RAISES if
-- any portal table is left without RLS or without exactly one policy, so a
-- 27th table added to 001 without its two lines fails the apply.
-- ===========================================================================

-- --- (1) privileges ---------------------------------------------------------
GRANT USAGE ON SCHEMA portal TO portal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA portal TO portal_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA portal TO portal_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA portal TO portal_app;
ALTER DEFAULT PRIVILEGES FOR ROLE portal_migrate IN SCHEMA portal GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app;
ALTER DEFAULT PRIVILEGES FOR ROLE portal_migrate IN SCHEMA portal GRANT USAGE ON SEQUENCES TO portal_app;
ALTER DEFAULT PRIVILEGES FOR ROLE portal_migrate IN SCHEMA portal GRANT EXECUTE ON FUNCTIONS TO portal_app;

REVOKE ALL ON SCHEMA portal FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA portal FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA portal FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA portal FROM PUBLIC;

-- The Data API roles exist on Supabase, not on the embedded local cluster
-- (scripts/apply-schema.js creates them there, NOLOGIN, so this block and the
-- rls-check run the same on both). Guarded so the file applies either way.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA portal FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA portal FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA portal FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA portal FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- --- (2) row level security, the 26 tables, two statements each ------------
ALTER TABLE portal.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.users AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.sections AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.students AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.subjects AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.teacher_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.teacher_assignments AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.grade_weight_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.grade_weight_configs AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.grades AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.assessment_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.assessment_slots AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.grade_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.grade_components AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.transmutation_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.transmutation_table AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.grading_mode_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.grading_mode_configs AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.attendance AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.excuse_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.excuse_letters AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.messages AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.announcements AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.memos ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.memos AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.events AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.activity_logs AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.system_settings AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.backups AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.auth_security_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.auth_security_state AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.notifications AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.auth_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.auth_codes AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.policy_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.policy_acceptances AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.login_attempts AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

ALTER TABLE portal.grade_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_app_all ON portal.grade_acknowledgements AS PERMISSIVE FOR ALL TO portal_app USING (true) WITH CHECK (true);

-- --- the self-check: every portal table, RLS on, exactly one policy -------
DO $$
DECLARE
  tables_total int;
  rls_off int;
  forced int;
  policies int;
  wrong_policy int;
BEGIN
  SELECT count(*) INTO tables_total FROM pg_tables WHERE schemaname = 'portal';
  SELECT count(*) INTO rls_off FROM pg_tables WHERE schemaname = 'portal' AND NOT rowsecurity;
  SELECT count(*) INTO forced FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'portal' AND c.relkind = 'r' AND c.relforcerowsecurity;
  SELECT count(*) INTO policies FROM pg_policies WHERE schemaname = 'portal';
  SELECT count(*) INTO wrong_policy FROM pg_policies
    WHERE schemaname = 'portal'
      AND NOT (policyname = 'portal_app_all' AND roles = ARRAY['portal_app']::name[] AND cmd = 'ALL' AND permissive = 'PERMISSIVE');
  IF rls_off > 0 THEN RAISE EXCEPTION '003_grants_rls: % portal table(s) without ROW LEVEL SECURITY', rls_off; END IF;
  IF forced > 0 THEN RAISE EXCEPTION '003_grants_rls: % portal table(s) with FORCE ROW LEVEL SECURITY (the owner must stay exempt)', forced; END IF;
  IF policies <> tables_total THEN RAISE EXCEPTION '003_grants_rls: % policies for % tables (exactly one portal_app_all per table)', policies, tables_total; END IF;
  IF wrong_policy > 0 THEN RAISE EXCEPTION '003_grants_rls: % policy(ies) that are not portal_app_all FOR ALL TO portal_app', wrong_policy; END IF;
  RAISE NOTICE '003_grants_rls: % tables, RLS on, one portal_app_all policy each, none forced', tables_total;
END $$;
