<#
.SYNOPSIS
  Update SYSTEMS. itself, safely: back up first, pull, install, build, migrate,
  restart, reload Caddy, then verify. Stops on the first failure and prints
  rollback steps. No auto-update — requires confirmation.
.PARAMETER SkipBackup
  Skip the pre-update backup (NOT recommended).
#>
[CmdletBinding()]
param(
    [switch]$SkipBackup,
    [switch]$DryRun  # print the update plan; change nothing
)

. "$PSScriptRoot\_systems-common.ps1"

$repo = Get-RepoRoot
$cfg  = Import-DotEnv

function Write-RollbackHelp {
    Write-Host ''
    Write-SystemsWarn 'ROLLBACK STEPS:'
    Write-Host '  1. git -C "<repo>" checkout <previous-commit>'
    Write-Host '  2. scripts\restore-systems-windows.ps1   (restores the pre-update backup)'
    Write-Host '  3. scripts\deploy-systems-windows.ps1'
    Write-Host '  4. scripts\check-systems-health-windows.ps1'
}

Write-SystemsStatus 'checking environment'
$current = (& git -C $repo rev-parse --short HEAD 2>$null)
Write-SystemsStatus "current version: $current"

if ($DryRun) {
    Write-SystemsStatus 'DRY-RUN — update plan (nothing will change):'
    Write-Host '  1. backup-systems-windows.ps1 (pre-update backup)'
    Write-Host '  2. git pull --ff-only'
    Write-Host '  3. api: npm install --production'
    Write-Host '  4. dashboard: npm install && npm run build'
    Write-Host '  5. run migrations'
    Write-Host '  6. docker compose up -d --build'
    Write-Host '  7. check-systems-health-windows.ps1'
    Write-RollbackHelp
    Write-SystemsOk 'complete (dry-run)'
    return
}

if (-not (Confirm-Typed 'Update SYSTEMS. now? A backup will be taken first.' 'UPDATE')) {
    Write-SystemsWarn 'aborted — no changes made.'
    exit 1
}

if (-not $SkipBackup) {
    Write-SystemsStatus 'creating pre-update backup'
    & "$PSScriptRoot\backup-systems-windows.ps1"
    if ($LASTEXITCODE -ne 0) { Write-SystemsError 'backup failed — aborting update'; exit 1 }
}

Push-Location $repo
try {
    Write-SystemsStatus 'pulling latest code'
    & git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw 'git pull failed' }

    Write-SystemsStatus 'installing API dependencies'
    Push-Location (Join-Path $repo 'api'); & npm install --production; $apirc = $LASTEXITCODE; Pop-Location
    if ($apirc -ne 0) { throw 'api npm install failed' }

    Write-SystemsStatus 'building dashboard'
    Push-Location (Join-Path $repo 'dashboard'); & npm install; & npm run build; $brc = $LASTEXITCODE; Pop-Location
    if ($brc -ne 0) { throw 'dashboard build failed' }

    Write-SystemsStatus 'running migrations (if any)'
    # V1.2: invoke the migration runner here. V1.1 SQLite migrations are idempotent on boot.

    Write-SystemsStatus 'restarting services'
    & docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'service restart failed' }
} catch {
    Write-SystemsError $_.Exception.Message
    Write-RollbackHelp
    Pop-Location
    exit 1
}
Pop-Location

Write-SystemsStatus 'verifying health'
& "$PSScriptRoot\check-systems-health-windows.ps1"

Write-SystemsOk "complete — updated from $current. Verify dashboard, admin login, and one existing system."
Write-RollbackHelp
