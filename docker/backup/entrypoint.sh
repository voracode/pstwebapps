#!/bin/sh
# Installs the cron schedule from BACKUP_SCHEDULE and runs crond in the foreground.
set -eu

SCHEDULE="${BACKUP_SCHEDULE:-0 2 * * *}"
mkdir -p /backups

# cron jobs don't inherit the container env: persist what pg-backup needs.
env | grep -E '^(PG|POSTGRES_|BACKUP_|TELEGRAM_|TZ=)' | sed 's/^\([^=]*\)=\(.*\)$/export \1="\2"/' > /etc/pst-backup.env
chmod 600 /etc/pst-backup.env

echo "$SCHEDULE . /etc/pst-backup.env; /usr/local/bin/pg-backup >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "[backup] schedule: $SCHEDULE (TZ=${TZ:-UTC})"

# Optional immediate run to validate the setup: BACKUP_RUN_ON_START=true
if [ "${BACKUP_RUN_ON_START:-false}" = "true" ]; then
  /usr/local/bin/pg-backup || true
fi

exec crond -f -l 8
