-- Make the audit trail append-only for the application role.
--
-- In production the app connects as a restricted role (default "pst_app",
-- created by docker/postgres/init/01-app-role.sh). This migration (re)grants
-- normal DML on all tables to that role, then removes UPDATE, DELETE and
-- TRUNCATE on audit_logs. In local development, where that role usually
-- doesn't exist, it does nothing.
DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('pst.app_role', true), ''), 'pst_app');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I', app_role);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM %I', app_role);
    -- Migration history is the owner's business only.
    EXECUTE format('REVOKE ALL ON TABLE _prisma_migrations FROM %I', app_role);
    RAISE NOTICE 'audit_logs is now append-only for role %', app_role;
  ELSE
    RAISE NOTICE 'role % not found — skipping audit privilege hardening', app_role;
  END IF;
END
$$;
