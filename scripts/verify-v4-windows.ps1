# V4 Phase 1 — verify the PostgreSQL control-plane database on a Windows host.
# Thin wrapper over api/scripts/verify-postgres-migration.js.
#
# Usage:
#   $env:DATABASE_URL = "postgresql://user:pass@localhost:5432/systems"
#   .\scripts\verify-v4-windows.ps1

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL is not set."
    exit 1
}

$apiDir = Join-Path $PSScriptRoot "..\api"
Push-Location $apiDir
try {
    node scripts/verify-postgres-migration.js
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
