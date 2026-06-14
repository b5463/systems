<#
.SYNOPSIS
  Build and (re)start the SYSTEMS. platform itself on Windows.
  Builds the dashboard, then brings up the stack via docker compose.
.NOTES
  This deploys SYSTEMS., not a user project. Idempotent; safe to re-run.
  Run setup-windows.ps1 first.
#>
[CmdletBinding()]
param(
    [switch]$SkipBuild
)

. "$PSScriptRoot\_systems-common.ps1"

$repo = Get-RepoRoot
$cfg  = Import-DotEnv

Write-SystemsStatus 'checking environment'
if (-not (Test-Path (Join-Path $repo '.env'))) {
    Write-SystemsError 'No .env found. Copy .env.example to .env and fill it in first.'
    exit 1
}
if (-not (Test-DockerLinux)) {
    Write-SystemsError 'Docker not reachable in Linux-container mode. Start Docker Desktop (WSL2).'
    exit 1
}

if (-not $SkipBuild) {
    Write-SystemsStatus 'building dashboard'
    Push-Location (Join-Path $repo 'dashboard')
    try {
        & npm install
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw 'dashboard build failed' }
        Write-SystemsOk 'dashboard built'
    } catch {
        Write-SystemsError $_.Exception.Message
        Pop-Location; exit 1
    }
    Pop-Location
}

Write-SystemsStatus 'starting SYSTEMS. services (docker compose up -d)'
Push-Location $repo
try {
    & docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }
} catch {
    Write-SystemsError $_.Exception.Message
    Pop-Location; exit 1
}
Pop-Location

Write-SystemsStatus 'verifying health'
& "$PSScriptRoot\check-systems-health-windows.ps1"

Write-SystemsOk "complete — open https://$(Get-ConfigValue $cfg 'DASHBOARD_DOMAIN' 'systems.acronym.sk') and sign in."
