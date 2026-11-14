# Nightly PostgreSQL + uploads backup runner (cron inside the container).
FROM postgres:16-alpine
RUN apk add --no-cache age tzdata dcron coreutils findutils
COPY scripts/backup/pg-backup.sh /usr/local/bin/pg-backup
COPY scripts/backup/restore.sh /usr/local/bin/pg-restore-pst
COPY docker/backup/entrypoint.sh /usr/local/bin/backup-entrypoint
RUN chmod 755 /usr/local/bin/pg-backup /usr/local/bin/pg-restore-pst /usr/local/bin/backup-entrypoint
ENTRYPOINT ["/usr/local/bin/backup-entrypoint"]
