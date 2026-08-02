#!/usr/bin/env bash
# Nightly MongoDB backup for the FairHaven VPS.
#
# Install (on the VPS, as the app user):
#   chmod +x backend/scripts/backup-mongo.sh
#   crontab -e   →   15 2 * * * /path/to/backend/scripts/backup-mongo.sh >> $HOME/backups/mongo/backup.log 2>&1
#
# Keeps 14 daily dumps; adjust KEEP_DAYS below. MONGO_URI is read from the
# project root .env so the script has no credentials of its own.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../../.env"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/mongo}"
KEEP_DAYS=14

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[backup] .env not found at $ENV_FILE" >&2
  exit 1
fi

MONGO_URI="$(grep -E '^MONGO_URI=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
if [[ -z "$MONGO_URI" ]]; then
  echo "[backup] MONGO_URI missing in .env" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"

mongodump --uri="$MONGO_URI" --db=fairhaven --gzip --out="$DEST"

# Prune old dumps.
find "$BACKUP_ROOT" -maxdepth 1 -type d -name '20*' -mtime +"$KEEP_DAYS" -exec rm -rf {} +

echo "[backup] $STAMP done → $DEST ($(du -sh "$DEST" | cut -f1))"
