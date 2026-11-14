#!/bin/sh
# =============================================================================
#  Runs once, on first start of an empty data volume (docker-entrypoint-initdb.d).
#
#  Two roles:
#    POSTGRES_USER (pst_owner)  owns the schema; used only for migrations,
#                               backups and maintenance.
#    APP_DB_USER   (pst_app)    used by the app and worker. Plain DML only,
#                               no DDL, and (after the audit migration) no
#                               UPDATE/DELETE/TRUNCATE on audit_logs — so even
#                               a compromised app cannot rewrite the audit trail.
# =============================================================================
set -eu

: "${APP_DB_USER:?APP_DB_USER is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_pass="$APP_DB_PASSWORD" -v owner="$POSTGRES_USER" -v db="$POSTGRES_DB" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_pass' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_user";

-- Tables/sequences created later by migrations (as the owner) are usable by the app.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_user";
SQL

echo "[initdb] role ${APP_DB_USER} created"
