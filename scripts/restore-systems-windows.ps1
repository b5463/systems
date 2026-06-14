<#
.SYNOPSIS
  Restore SYSTEMS. from a backup created by backup-systems-windows.ps1.
  Restores the database, Caddy route files and release files, reloads Caddy,
  restarts services and verifies health. DESTRUCTIVE — requires confirmation.
.PARAMETER BackupPath
  Path to a timestamped backup folder under BACKUP_DIR. If omitted, the most
  recent backup is used (after you confirm).
.NOTES
  This overwrites current state. Take a fresh backup first if in doubt.
#>
[CmdletBinding()]
param(
    [string]$BackupPath
)

. "$PSScriptRoot\_systems-common.ps1"

$cfg   = Import-DotEnv
$paths = Get-SystemsPaths $cfg

Write-SystemsStatus 'checking environment'
if (-not $BackupPath) {
    $latest = Get-ChildItem -Path $paths.Backups -Directory -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) { Write-SystemsError "No backups found in $($paths.Backups)"; exit 1 }
    $BackupPath = $latest.FullName
}
if (-not (Test-Path $BackupPath)) { Write-SystemsError "Backup not found: $BackupPath"; exit 1 }

$manifest = $null
$mf = Join-Path $BackupPath 'manifest.json'
if (Test-Path $mf) { $manifest = Get-Content $mf -Raw | ConvertFrom-Json }

Write-Host ''
Write-SystemsStatus 'this restore WILL overwrite current state:'
Write-Host "  source       : $BackupPath"
Write-Host "  created_at   : $(if ($manifest) { $manifest.created_at } else { 'unknown' })"
Write-Host "  database     : $(if ($manifest) { $manifest.database } else { 'unknown' })"
Write-Host "  -> database, Caddy routes ($($paths.CaddyDir)) and releases ($($paths.Releases))"
Write-Host ''
if (-not (Confirm-Typed 'This cannot be undone.' 'RESTORE')) {
    Write-SystemsWarn 'aborted — no changes made.'
    exit 1
}

# ---- database ------------------------------------------------------------
Write-SystemsStatus 'restoring database'
$pgContainer = $null
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $pgContainer = (& docker ps --filter 'name=postgres' --format '{{.Names}}' 2>$null | Select-Object -First 1)
}
$sql = Join-Path $BackupPath 'systems-db.sql'
if ($pgContainer -and (Test-Path $sql)) {
    $db   = Get-ConfigValue $cfg 'POSTGRES_DB' 'systems'
    $user = Get-ConfigValue $cfg 'POSTGRES_USER' 'systems'
    Get-Content $sql -Raw | & docker exec -i $pgContainer psql -U $user -d $db
    if ($LASTEXITCODE -eq 0) { Write-SystemsOk 'database restored (postgres)' }
    else { Write-SystemsError 'psql restore failed' }
} elseif (Test-Path (Join-Path $BackupPath 'platform.db')) {
    Copy-Item (Join-Path $BackupPath 'platform.db*') $paths.Data -Force
    Write-SystemsOk 'database restored (sqlite)'
} else {
    Write-SystemsWarn 'no database artifact in backup — skipped'
}

# ---- Caddy routes --------------------------------------------------------
Write-SystemsStatus 'restoring Caddy routes'
$caddySrc = Join-Path $BackupPath 'caddy'
if (Test-Path (Join-Path $caddySrc 'systems.d')) {
    New-Item -ItemType Directory -Force -Path $paths.CaddyDir | Out-Null
    Copy-Item (Join-Path $caddySrc 'systems.d\*') $paths.CaddyDir -Recurse -Force
}
if (Test-Path (Join-Path $caddySrc 'Caddyfile')) { Copy-Item (Join-Path $caddySrc 'Caddyfile') $paths.CaddyFile -Force }

# ---- releases ------------------------------------------------------------
Write-SystemsStatus 'restoring releases'
$relZip = Join-Path $BackupPath 'releases.zip'
if (Test-Path $relZip) {
    New-Item -ItemType Directory -Force -Path $paths.Releases | Out-Null
    Expand-Archive -Path $relZip -DestinationPath $paths.Releases -Force
}

# ---- reload caddy + restart services ------------------------------------
Write-SystemsStatus 'reloading Caddy'
$caddyContainer = $null
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $caddyContainer = (& docker ps --filter 'name=caddy' --format '{{.Names}}' 2>$null | Select-Object -First 1)
}
if ($caddyContainer) {
    & docker exec $caddyContainer caddy reload --config /etc/caddy/Caddyfile 2>$null
} elseif (Get-Service -Name 'caddy' -ErrorAction SilentlyContinue) {
    Restart-Service -Name 'caddy'
} else {
    Write-SystemsWarn 'Caddy not detected — reload manually'
}

Write-SystemsStatus 'restarting SYSTEMS. services'
$repo = Get-RepoRoot
Push-Location $repo
& docker compose restart 2>$null
Pop-Location

Write-SystemsStatus 'verifying health'
& "$PSScriptRoot\check-systems-health-windows.ps1"

Write-SystemsOk 'complete — verify the dashboard, admin login, and one existing system.'
