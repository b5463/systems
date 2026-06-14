<#
.SYNOPSIS
  Back up SYSTEMS. critical state: internal database, Caddy route files +
  Caddyfile, release files, and (optionally) logs/uploads. Timestamped,
  retention-enforced, fail-safe. No secrets are written to the archive index
  or printed.
.PARAMETER IncludeLogs
  Override BACKUP_INCLUDE_LOGS=true.
.PARAMETER IncludeUploads
  Override BACKUP_INCLUDE_UPLOADS=true.
.NOTES
  Postgres (V1.2) is dumped via the postgres container if present; otherwise
  the V1.1 SQLite file under SYSTEMS_DATA_DIR is copied.
#>
[CmdletBinding()]
param(
    [switch]$IncludeLogs,
    [switch]$IncludeUploads,
    [switch]$DryRun  # list what would be backed up; write nothing
)

. "$PSScriptRoot\_systems-common.ps1"

$cfg   = Import-DotEnv
$paths = Get-SystemsPaths $cfg
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dest  = Join-Path $paths.Backups $stamp

$incLogs    = $IncludeLogs    -or ((Get-ConfigValue $cfg 'BACKUP_INCLUDE_LOGS' 'false') -eq 'true')
$incUploads = $IncludeUploads -or ((Get-ConfigValue $cfg 'BACKUP_INCLUDE_UPLOADS' 'false') -eq 'true')

if ($DryRun) {
    Write-SystemsStatus 'DRY-RUN — backup contents (nothing will be written):'
    Write-Host "  target dir : $dest"
    Write-Host "  database   : Postgres (pg_dump) or SQLite copy from $($paths.Data)"
    Write-Host "  caddy      : $($paths.CaddyFile) + $($paths.CaddyDir)"
    Write-Host "  releases   : $($paths.Releases)"
    Write-Host "  logs       : $(if ($incLogs) { $paths.Logs } else { 'excluded' })"
    Write-Host "  uploads    : $(if ($incUploads) { $paths.Uploads } else { 'excluded' })"
    Write-Host "  retention  : $(Get-ConfigValue $cfg 'BACKUP_RETENTION_DAYS' '14') days"
    Write-SystemsOk 'complete (dry-run)'
    return
}

Write-SystemsStatus 'checking environment'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-SystemsStatus "backup target: $dest"

# ---- database ------------------------------------------------------------
Write-SystemsStatus 'backing up database'
$pgContainer = $null
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $pgContainer = (& docker ps --filter 'name=postgres' --format '{{.Names}}' 2>$null | Select-Object -First 1)
}
if ($pgContainer) {
    $db   = Get-ConfigValue $cfg 'POSTGRES_DB' 'systems'
    $user = Get-ConfigValue $cfg 'POSTGRES_USER' 'systems'
    $out  = Join-Path $dest 'systems-db.sql'
    & docker exec $pgContainer pg_dump -U $user $db | Out-File -FilePath $out -Encoding utf8
    if ($LASTEXITCODE -eq 0) { Write-SystemsOk "pg_dump -> $out" }
    else { Write-SystemsError 'pg_dump failed — aborting backup'; exit 1 }
} else {
    $sqlite = Join-Path $paths.Data 'platform.db'
    if (Test-Path $sqlite) {
        Copy-Item $sqlite (Join-Path $dest 'platform.db') -Force
        # include WAL/SHM if present for a consistent copy
        foreach ($ext in '-wal', '-shm') {
            $f = "$sqlite$ext"; if (Test-Path $f) { Copy-Item $f (Join-Path $dest "platform.db$ext") -Force }
        }
        Write-SystemsOk 'copied SQLite database (V1.1)'
    } else {
        Write-SystemsWarn 'no Postgres container and no SQLite file found — database NOT backed up'
    }
}

# ---- Caddy route files ---------------------------------------------------
Write-SystemsStatus 'backing up Caddy routes'
$caddyDest = Join-Path $dest 'caddy'
New-Item -ItemType Directory -Force -Path $caddyDest | Out-Null
if (Test-Path $paths.CaddyFile) { Copy-Item $paths.CaddyFile $caddyDest -Force }
if (Test-Path $paths.CaddyDir)  { Copy-Item $paths.CaddyDir (Join-Path $caddyDest 'systems.d') -Recurse -Force }

# ---- releases ------------------------------------------------------------
Write-SystemsStatus 'archiving releases'
if (Test-Path $paths.Releases) {
    Compress-Archive -Path (Join-Path $paths.Releases '*') -DestinationPath (Join-Path $dest 'releases.zip') -Force -ErrorAction SilentlyContinue
}

# ---- optional logs / uploads --------------------------------------------
if ($incLogs -and (Test-Path $paths.Logs)) {
    Write-SystemsStatus 'archiving logs'
    Compress-Archive -Path (Join-Path $paths.Logs '*') -DestinationPath (Join-Path $dest 'logs.zip') -Force -ErrorAction SilentlyContinue
}
if ($incUploads -and (Test-Path $paths.Uploads)) {
    Write-SystemsStatus 'archiving uploads'
    Compress-Archive -Path (Join-Path $paths.Uploads '*') -DestinationPath (Join-Path $dest 'uploads.zip') -Force -ErrorAction SilentlyContinue
}

# ---- manifest (no secrets) ----------------------------------------------
@{
    created_at      = (Get-Date).ToString('o')
    includes_logs   = [bool]$incLogs
    includes_uploads= [bool]$incUploads
    database        = (if ($pgContainer) { 'postgres' } else { 'sqlite' })
} | ConvertTo-Json | Out-File (Join-Path $dest 'manifest.json') -Encoding utf8

# ---- retention -----------------------------------------------------------
$days = [int](Get-ConfigValue $cfg 'BACKUP_RETENTION_DAYS' '14')
Write-SystemsStatus "enforcing retention ($days days)"
Get-ChildItem -Path $paths.Backups -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$days) } |
    ForEach-Object { Write-Host "  removing old backup $($_.Name)"; Remove-Item $_.FullName -Recurse -Force }

Write-SystemsOk "complete — backup at $dest"
