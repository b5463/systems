<#
.SYNOPSIS
  Read-only health check for SYSTEMS. itself. Reports real, observed status;
  anything that cannot be checked is reported honestly (not "online").
#>
[CmdletBinding()]
param()

. "$PSScriptRoot\_systems-common.ps1"

$cfg   = Import-DotEnv
$paths = Get-SystemsPaths $cfg
$dash  = Get-ConfigValue $cfg 'DASHBOARD_DOMAIN' 'systems.acronym.sk'

Write-SystemsStatus 'checking Docker'
if (Test-DockerLinux) { Write-SystemsOk 'Docker: connected (linux)' }
else { Write-SystemsWarn 'Docker: not reachable' }

Write-SystemsStatus 'checking Caddy'
$caddyContainer = $null
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $caddyContainer = (& docker ps --filter 'name=caddy' --format '{{.Names}}' 2>$null | Select-Object -First 1)
}
if ($caddyContainer) {
    & docker exec $caddyContainer caddy validate --config /etc/caddy/Caddyfile 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-SystemsOk 'Caddy: running, config valid' }
    else { Write-SystemsWarn 'Caddy: running, config INVALID' }
} elseif (Get-Service -Name 'caddy' -ErrorAction SilentlyContinue) {
    Write-SystemsOk 'Caddy: Windows service present'
} else {
    Write-SystemsWarn 'Caddy: not measured'
}

Write-SystemsStatus 'checking Postgres'
$pgPort = [int](Get-ConfigValue $cfg 'POSTGRES_PORT' '5432')
if (Test-TcpPort -Port $pgPort) { Write-SystemsOk "Postgres: reachable on 127.0.0.1:$pgPort" }
else { Write-SystemsWarn 'Postgres: not reachable (V1.1 uses SQLite)' }

Write-SystemsStatus 'checking dashboard HTTPS'
try {
    $resp = Invoke-WebRequest -Uri "https://$dash" -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop
    Write-SystemsOk "dashboard: HTTP $($resp.StatusCode) at https://$dash"
} catch {
    Write-SystemsWarn "dashboard: not reachable at https://$dash"
}

Write-SystemsStatus 'checking disk'
try {
    $drive = (Split-Path -Qualifier $paths.Data)
    $vol = Get-PSDrive -Name $drive.TrimEnd(':') -ErrorAction Stop
    $total = $vol.Used + $vol.Free
    if ($total -gt 0) {
        $pct = [math]::Round(($vol.Used / $total) * 100, 1)
        $msg = "disk $drive used ${pct}% (free $([math]::Round($vol.Free/1GB,1)) GB)"
        if ($pct -ge 90) { Write-SystemsError $msg }
        elseif ($pct -ge 75) { Write-SystemsWarn $msg }
        else { Write-SystemsOk $msg }
    }
} catch { Write-SystemsWarn 'disk: not measured' }

Write-SystemsStatus 'checking last backup'
$last = Get-ChildItem -Path $paths.Backups -Directory -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($last) {
    $age = (New-TimeSpan -Start $last.LastWriteTime -End (Get-Date)).TotalHours
    $msg = "last backup: $($last.Name) ($([math]::Round($age,1))h ago)"
    if ($age -gt 168) { Write-SystemsWarn "$msg — overdue" } else { Write-SystemsOk $msg }
} else {
    Write-SystemsWarn 'last backup: none found — run backup-systems-windows.ps1'
}

Write-SystemsOk 'complete'
