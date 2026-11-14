#!/bin/sh
# =============================================================================
#  Restore a PST database backup into the running stack.
#
#    docker compose exec backup pg-restore-pst /backups/daily/pst-db-20261114-0200.dump
#    docker compose exec -e AGE_KEY_FILE=/tmp/key.txt backup pg-restore-pst /backups/daily/….dump.age
#
#  ⚠ Replaces the current database contents. Stop the app and worker first:
#    docker compose stop app worker
# =============================================================================
set -eu

FILE="${1:?usage: pg-restore-pst <backup.dump|backup.dump.age>}"
export PGHOST="${PGHOST:-postgres}"
export PGUSER="${PGUSER:-${POSTGRES_USER:-pst_owner}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-pst}}"

SRC="$FILE"
case "$FILE" in
  *.age)
    : "${AGE_KEY_FILE:?set AGE_KEY_FILE to the age identity (private key) file to decrypt}"
    SRC="/tmp/pst-restore-$$.dump"
    age -d -i "$AGE_KEY_FILE" -o "$SRC" "$FILE"
    ;;
esac

pg_restore --list "$SRC" > /dev/null
echo "Restoring $FILE into $PGDATABASE@$PGHOST — existing objects will be dropped."
printf "Type the database name (%s) to continue: " "$PGDATABASE"
read -r answer
[ "$answer" = "$PGDATABASE" ] || { echo "Aborted."; exit 1; }

pg_restore --clean --if-exists --no-owner --role="$PGUSER" --exit-on-error --dbname="$PGDATABASE" "$SRC"
# Re-apply app-role privileges (dropped objects lose their grants).
psql -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pst_app') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pst_app;
  GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO pst_app;
  REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM pst_app;
  REVOKE ALL ON _prisma_migrations FROM pst_app; END IF; END \$\$;"

[ "$SRC" != "$FILE" ] && rm -f "$SRC"
echo "Restore complete. Start the app again: docker compose start app worker"
