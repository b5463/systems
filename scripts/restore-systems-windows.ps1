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
    [string]$BackupPath,
    [switch]$DryRun  # show what would be restored; change nothing
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
if ($DryRun) {
    Write-SystemsStatus 'DRY-RUN — nothing was changed.'
    Write-SystemsOk 'complete (dry-run)'
    return
}
if (-not (Confirm-SystemsAction -Expected 'RESTORE' -Message 'This cannot be undone.')) {
    Write-SystemsWarn 'aborted — no changes made.'
    exit 1
}

# ---- database ------------------------------------------------------------
Write-SystemsStatus 'restoring database'
$pgContainer = $null
if (Get-Command docker -ErrorAction SilentlyContinue) {
    # Match ONLY the control-plane container, never a tenant's own Postgres.
    $pgContainer = (& docker ps --filter 'name=^systems-postgres$' --format '{{.Names}}' 2>$null | Select-Object -First 1)
}
$dump = Join-Path $BackupPath 'systems-db.dump'   # custom-format (pg_restore)
$sql  = Join-Path $BackupPath 'systems-db.sql'    # legacy plain-SQL (psql)
if ($pgContainer -and (Test-Path $dump)) {
    $db   = Get-ConfigValue $cfg 'POSTGRES_DB' 'systems'
    $user = Get-ConfigValue $cfg 'POSTGRES_USER' 'systems'
    # --clean --if-exists drops existing objects first so restoring into a
    # non-empty live DB doesn't error on every CREATE; --exit-on-error makes a
    # partial failure fail loudly instead of "restored" over broken state.
    & cmd /c "docker exec -i $pgContainer pg_restore -U $user -d $db --clean --if-exists --no-owner --exit-on-error < `"$dump`""
    if ($LASTEXITCODE -eq 0) { Write-SystemsOk 'database restored (postgres, pg_restore)' }
    else { Write-SystemsError 'pg_restore failed — database left unchanged where possible'; exit 1 }
} elseif ($pgContainer -and (Test-Path $sql)) {
    $db   = Get-ConfigValue $cfg 'POSTGRES_DB' 'systems'
    $user = Get-ConfigValue $cfg 'POSTGRES_USER' 'systems'
    # Legacy plain-SQL dump: stop on the first error rather than plough through.
    & cmd /c "docker exec -i $pgContainer psql -U $user -d $db -v ON_ERROR_STOP=1 < `"$sql`""
    if ($LASTEXITCODE -eq 0) { Write-SystemsOk 'database restored (postgres, psql)' }
    else { Write-SystemsError 'psql restore failed'; exit 1 }
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
