#!/bin/sh
set -e

echo "[entrypoint] Pushing Prisma schema to database..."
# --skip-generate: client was already generated at build time
# If a schema change would cause data loss, this will fail safely and require
# manual intervention. Use --accept-data-loss only when you know it's safe.
npx prisma db push --skip-generate

echo "[entrypoint] Starting application..."
exec "$@"
