# V4 Phase 1 — migrate a legacy (pre-Prisma, SQLite) install to PostgreSQL on
# a Windows host, then verify. Wraps:
#   1. prisma migrate deploy           (creates/updates the PostgreSQL schema)
#   2. migrate-sqlite-to-postgres.js   (copies legacy data, if a SQLite file exists)
#   3. verify-postgres-migration.js    (fails loudly if anything is off)
#
# Usage:
#   $env:DATABASE_URL = "postgresql://user:pass@localhost:5432/systems"
#   # optional, only for legacy installs:
#   $env:SQLITE_DB_PATH = "C:\systems\data\platform.db"
#   .\scripts\migrate-v4-windows.ps1

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL is not set."
    exit 1
}

$apiDir = Join-Path $PSScriptRoot "..\api"
Push-Location $apiDir
try {
    Write-Host "==> Applying Prisma migrations"
    npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    if ($env:SQLITE_DB_PATH -and (Test-Path $env:SQLITE_DB_PATH)) {
        Write-Host "==> Migrating legacy SQLite data from $($env:SQLITE_DB_PATH)"
        node scripts/migrate-sqlite-to-postgres.js
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } else {
        Write-Host "==> No legacy SQLite database configured (SQLITE_DB_PATH); skipping data migration"
    }

    Write-Host "==> Verifying"
    node scripts/verify-postgres-migration.js
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
