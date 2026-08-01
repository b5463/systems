# V4 Phase 1 — migrate a legacy (pre-Prisma, SQLite) install to PostgreSQL on
# a Windows host, then verify. Wraps:
#   1. prisma migrate deploy           (creates/updates the PostgreSQL schema)
#   2. migrate-sqlite-to-postgres.js   (copies legacy data, if a SQLite file exists)
#   3. verify-postgres-migration.js    (fails loudly if anything is off)
#
# Usage:
#   $env:DATABASE_URL = "postgresql://user:pass@localhost:5432/systems"
#   # optional, only for legacy installs:
#   $env:CONTROL_PLANE_SQLITE_PATH = "C:\systems\data\platform.db"
#   .\scripts\migrate-v4-windows.ps1
#
# Legacy data is imported into the CONTROL_PLANE_POSTGRES_SCHEMA staging schema
# (default systems_import), NOT the live tables — promotion is a deliberate,
# separate step. See the import manifest written under data/migration-backups.

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL is not set."
    exit 1
}

# Accept the older SQLITE_DB_PATH name as an alias for the variable the Node
# script actually reads (CONTROL_PLANE_SQLITE_PATH).
if (-not $env:CONTROL_PLANE_SQLITE_PATH -and $env:SQLITE_DB_PATH) {
    $env:CONTROL_PLANE_SQLITE_PATH = $env:SQLITE_DB_PATH
}
$sqlitePath = $env:CONTROL_PLANE_SQLITE_PATH

$apiDir = Join-Path $PSScriptRoot "..\api"
Push-Location $apiDir
try {
    Write-Host "==> Applying Prisma migrations"
    npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    if ($sqlitePath -and (Test-Path $sqlitePath)) {
        Write-Host "==> Migrating legacy SQLite data from $sqlitePath into the staging schema"
        # The Node importer requires CONTROL_PLANE_POSTGRES_URL as its target;
        # it's the same database as DATABASE_URL.
        if (-not $env:CONTROL_PLANE_POSTGRES_URL) { $env:CONTROL_PLANE_POSTGRES_URL = $env:DATABASE_URL }
        node scripts/migrate-sqlite-to-postgres.js
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } else {
        Write-Host "==> No legacy SQLite database configured (CONTROL_PLANE_SQLITE_PATH); skipping data migration"
    }

    Write-Host "==> Verifying"
    node scripts/verify-postgres-migration.js
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
