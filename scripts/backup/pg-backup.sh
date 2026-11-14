#!/bin/sh
# =============================================================================
#  PST backup: PostgreSQL (custom-format pg_dump) + uploaded files.
#
#  Layout under /backups:
#    daily/   pst-db-YYYYmmdd-HHMM.dump[.age]      kept BACKUP_KEEP_DAYS
#    weekly/  copy of Sunday's dump                 kept BACKUP_KEEP_WEEKS
#    monthly/ copy of the 1st of the month          kept BACKUP_KEEP_MONTHS
#    files/   pst-storage-YYYYmmdd.tar.gz[.age]     weekly, kept BACKUP_KEEP_WEEKS
#
#  If BACKUP_ENCRYPTION_PUBLIC_KEY (an age recipient, "age1…") is set, every
#  artefact is encrypted before it touches the disk. Keep the matching private
#  key OFF the server.
#
#  Failures are reported to the Telegram system channel when configured.
# =============================================================================
set -eu

DIR=/backups
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
KEEP_WEEKS="${BACKUP_KEEP_WEEKS:-8}"
KEEP_MONTHS="${BACKUP_KEEP_MONTHS:-6}"
STAMP="$(date +%Y%m%d-%H%M)"
DOW="$(date +%u)"   # 7 = Sunday
DOM="$(date +%d)"
RECIPIENT="${BACKUP_ENCRYPTION_PUBLIC_KEY:-}"

export PGHOST="${PGHOST:-postgres}"
export PGUSER="${PGUSER:-${POSTGRES_USER:-pst_owner}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-pst}}"

log() { echo "$(date '+%F %T') [backup] $*"; }

notify_failure() {
  chat="${TELEGRAM_CHAT_ID_SYSTEM:-${TELEGRAM_ADMIN_CHAT_ID:-}}"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "$chat" ] && [ "${TELEGRAM_ENABLED:-false}" = "true" ]; then
    wget -q -O /dev/null --post-data "chat_id=${chat}&text=⚠️ PST backup FAILED: $1" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" || true
  fi
}
# busybox sh has no ERR trap: report any non-zero exit (set -e) on EXIT instead.
NOTIFIED=0
on_exit() {
  rc=$?
  if [ "$rc" -ne 0 ] && [ "$NOTIFIED" = 0 ]; then
    notify_failure "exit code $rc"
    log "FAILED (exit $rc)"
  fi
}
trap on_exit EXIT

encrypt() { # $1 = file; replaces it with $1.age when a recipient is configured
  if [ -n "$RECIPIENT" ]; then
    age -r "$RECIPIENT" -o "$1.age" "$1" && rm -f "$1"
    echo "$1.age"
  else
    echo "$1"
  fi
}

prune() { # $1 = dir, $2 = number of newest files to keep
  ls -1t "$1" 2>/dev/null | tail -n +"$(( $2 + 1 ))" | while read -r f; do rm -f "$1/$f"; done
}

mkdir -p "$DIR/daily" "$DIR/weekly" "$DIR/monthly" "$DIR/files"
umask 077

# ---- database --------------------------------------------------------------
TMP="$DIR/daily/.pst-db-$STAMP.dump"
log "dumping database $PGDATABASE@$PGHOST"
if ! pg_dump --format=custom --compress=6 --no-owner --file="$TMP"; then
  notify_failure "pg_dump error"; NOTIFIED=1
  exit 1
fi
# A dump that can't be listed is useless — verify before keeping it.
if ! pg_restore --list "$TMP" > /dev/null; then
  rm -f "$TMP"
  notify_failure "dump verification failed"; NOTIFIED=1
  exit 1
fi
FINAL="$DIR/daily/pst-db-$STAMP.dump"
mv "$TMP" "$FINAL"
FINAL="$(encrypt "$FINAL")"
log "database: $(du -h "$FINAL" | cut -f1) → $FINAL"

[ "$DOW" = "7" ] && cp "$FINAL" "$DIR/weekly/" && log "weekly copy kept"
[ "$DOM" = "01" ] && cp "$FINAL" "$DIR/monthly/" && log "monthly copy kept"

# ---- uploaded files (weekly) ------------------------------------------------
if [ -d /storage ] && { [ "$DOW" = "7" ] || [ "${BACKUP_FILES_NOW:-false}" = "true" ]; }; then
  ARCHIVE="$DIR/files/pst-storage-$(date +%Y%m%d).tar.gz"
  tar -C /storage -czf "$ARCHIVE" .
  ARCHIVE="$(encrypt "$ARCHIVE")"
  log "files: $(du -h "$ARCHIVE" | cut -f1) → $ARCHIVE"
fi

# ---- retention --------------------------------------------------------------
prune "$DIR/daily" "$KEEP_DAYS"
prune "$DIR/weekly" "$KEEP_WEEKS"
prune "$DIR/monthly" "$KEEP_MONTHS"
prune "$DIR/files" "$KEEP_WEEKS"

log "done"
