#!/usr/bin/env bash
set -euo pipefail
: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGPASSWORD:=postgres}"
export PGPASSWORD
EMPTY_DB="elhafez_empty_${GITHUB_RUN_ID:-local}"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS "$EMPTY_DB" WITH (FORCE);"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE "$EMPTY_DB";"
export DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${EMPTY_DB}?schema=public"
pnpm prisma migrate deploy --schema ./prisma
pnpm prisma migrate status --schema ./prisma
TABLE_COUNT="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$EMPTY_DB" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'core_%';")"
if [[ "$TABLE_COUNT" != "12" ]]; then
  echo "Expected 12 Core tables after empty database migration, found $TABLE_COUNT" >&2
  exit 1
fi
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE "$EMPTY_DB" WITH (FORCE);"
echo "EMPTY DATABASE MIGRATION PASS: 12 Core tables"
