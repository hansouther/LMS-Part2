#!/usr/bin/env bash
# Backup harian MongoDB Binara LMS (dipanggil via cron).
# Pasang di cron:  0 2 * * * /opt/binara-lms/deploy/dcloud/backup.sh >> /var/log/lms-backup.log 2>&1
set -euo pipefail

# Lokasi file .env compose (berisi MONGO_ROOT_USER / MONGO_ROOT_PASSWORD)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/.env"

STAMP="$(date +%F-%H%M)"
OUT_DIR="/opt/lms-backups"
mkdir -p "$OUT_DIR"

# Dump di dalam container lalu salin keluar
docker exec lms-mongo sh -c "mongodump --username '$MONGO_ROOT_USER' --password '$MONGO_ROOT_PASSWORD' --authenticationDatabase admin --archive --gzip" \
  > "$OUT_DIR/binara-lms-$STAMP.gz"

# Simpan hanya 14 backup terbaru
ls -1t "$OUT_DIR"/binara-lms-*.gz | tail -n +15 | xargs -r rm -f

echo "[$(date)] Backup selesai: $OUT_DIR/binara-lms-$STAMP.gz"
