#!/usr/bin/env bash
# BillBull nightly backup + report to the control plane (admin.billbull.app → Backups).
#
# One copy per server. Install:
#   install -m 700 billbull-backup.sh /usr/local/sbin/billbull-backup
#   printf 'PLATFORM_BACKUP_TOKEN=%s\nPLATFORM_URL=https://admin.billbull.app\n' '<token>' > /etc/billbull/backup.env; chmod 600 /etc/billbull/backup.env
#   echo '30 1 * * * root /usr/local/sbin/billbull-backup' > /etc/cron.d/billbull-backup
#
# Edit TENANTS below: "<tenant code>:<database>:<working directory holding uploads/>".
# Dumps are custom-format (pg_restore-able) and checked with `pg_restore --list` before they
# count as SUCCESS. Copy BACKUP_DIR off the server (rclone/rsync) — a backup on the same disk
# as the database is not a backup.
set -uo pipefail

source /etc/billbull/backup.env
BACKUP_DIR=${BACKUP_DIR:-/var/backups/billbull}
KEEP_DAYS=${KEEP_DAYS:-14}
TENANTS=(
  # "royaltools:billbull_royaltools:/srv/billbull/royaltools"
  # "demo:billbull_demo:/srv/billbull/demo"
)

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)

report() { # code db kind status started finished size location sha message
  local body
  body=$(printf '{"tenantCode":"%s","databaseName":"%s","kind":"%s","status":"%s","startedAt":"%s","finishedAt":"%s","sizeBytes":%s,"location":"%s","checksumSha256":"%s","message":"%s"}' \
    "$1" "$2" "$3" "$4" "$5" "$6" "${7:-null}" "$8" "$9" "$(printf '%s' "${10}" | tr '"\n' "' " | cut -c1-900)")
  curl -fsS --max-time 20 -X POST "$PLATFORM_URL/api/backups/report" \
    -H "Content-Type: application/json" -H "X-Backup-Token: $PLATFORM_BACKUP_TOKEN" \
    --data "$body" >/dev/null || echo "WARN: could not report $1 $3 to the control plane" >&2
}

for entry in "${TENANTS[@]}"; do
  IFS=: read -r code db workdir <<<"$entry"
  started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  file="$BACKUP_DIR/${code}-${stamp}.dump"
  if err=$(sudo -u postgres pg_dump -Fc -f "$file" "$db" 2>&1) && sudo -u postgres pg_restore --list "$file" >/dev/null 2>&1; then
    report "$code" "$db" DATABASE SUCCESS "$started" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(stat -c %s "$file")" "$file" "$(sha256sum "$file" | cut -d' ' -f1)" "pg_dump ok"
  else
    report "$code" "$db" DATABASE FAILED "$started" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" null "$file" "" "${err:-pg_restore --list failed}"
  fi

  if [ -d "$workdir/uploads" ]; then
    started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    tarfile="$BACKUP_DIR/${code}-uploads-${stamp}.tar.gz"
    if err=$(tar -C "$workdir" -czf "$tarfile" uploads 2>&1); then
      report "$code" "$db" UPLOADS SUCCESS "$started" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(stat -c %s "$tarfile")" "$tarfile" "$(sha256sum "$tarfile" | cut -d' ' -f1)" "uploads archived"
    else
      report "$code" "$db" UPLOADS FAILED "$started" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" null "$tarfile" "" "$err"
    fi
  fi
done

find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
