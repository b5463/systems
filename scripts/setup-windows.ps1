<#
.SYNOPSIS
  Prepare a Windows host for SYSTEMS. — verify prerequisites and create the
  C:\ProgramData\SYSTEMS layout + Docker network. Idempotent and non-destructive.
.NOTES
  Run in an elevated PowerShell (Administrator). Does NOT install software or
  open firewall ports for you — it checks and tells you what to do.
#>
[CmdletBinding()]
param()

. "$PSScriptRoot\_systems-common.ps1"

$cfg   = Import-DotEnv
$paths = Get-SystemsPaths $cfg
$net   = Get-ConfigValue $cfg 'DOCKER_NETWORK' 'systems'
$issues = 0

Write-SystemsStatus 'checking environment'
Write-SystemsStatus "data dir: $($paths.Data)"

Write-SystemsStatus 'checking Docker'
if (Get-Command docker -ErrorAction SilentlyContinue) {
    if (Test-DockerLinux) {
        Write-SystemsOk 'Docker reachable (Linux containers)'
    } else {
        Write-SystemsWarn 'Docker CLI found but engine unreachable or not in Linux-container mode. Start Docker Desktop and switch to Linux containers.'
        $issues++
    }
} else {
    Write-SystemsError 'Docker not found. Install Docker Desktop (WSL2 backend) — see docs\WINDOWS_DEPLOYMENT.md'
    $issues++
}

Write-SystemsStatus 'checking Caddy'
$caddySvc = Get-Service -Name 'caddy' -ErrorAction SilentlyContinue
if ($caddySvc) {
    Write-SystemsOk "Caddy Windows service present (status: $($caddySvc.Status))"
} elseif ((Get-Command docker -ErrorAction SilentlyContinue) -and (& docker ps --format '{{.Names}}' 2>$null | Select-String -Quiet 'caddy')) {
    Write-SystemsOk 'Caddy running as a Docker container'
} else {
    Write-SystemsWarn 'Caddy not detected (service or container). See docs\WINDOWS_DEPLOYMENT.md for both options.'
}

Write-SystemsStatus 'checking Postgres'
$pgPort = [int](Get-ConfigValue $cfg 'POSTGRES_PORT' '5432')
if (Test-TcpPort -ComputerName '127.0.0.1' -Port $pgPort) {
    Write-SystemsOk "Postgres reachable on 127.0.0.1:$pgPort (V1.2 target)"
} else {
    Write-SystemsWarn "Postgres not reachable on 127.0.0.1:$pgPort. V1.1 uses SQLite; Postgres lands in V1.2."
}

Write-SystemsStatus 'creating data directories'
foreach ($p in @($paths.Data, $paths.Releases, $paths.Uploads, $paths.Logs, $paths.Backups, $paths.CaddyDir)) {
    if (Test-Path $p) {
        Write-Host "  exists  $p"
    } else {
        New-Item -ItemType Directory -Force -Path $p | Out-Null
        Write-Host "  created $p"
    }
}

Write-SystemsStatus 'ensuring Docker network'
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $exists = (& docker network ls --filter "name=^$net$" --format '{{.Name}}' 2>$null)
    if ($exists -eq $net) {
        Write-SystemsOk "network '$net' already exists"
    } else {
        & docker network create $net | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-SystemsOk "created network '$net'" }
        else { Write-SystemsWarn "could not create network '$net'"; $issues++ }
    }
}

Write-SystemsStatus 'checking Windows Firewall (ports 80/443)'
foreach ($port in 80, 443) {
    $rule = Get-NetFirewallPortFilter -ErrorAction SilentlyContinue |
            Where-Object { $_.LocalPort -eq $port } | Select-Object -First 1
    if ($rule) { Write-SystemsOk "firewall rule present for $port/tcp" }
    else { Write-SystemsWarn "no inbound rule for $port/tcp — run check-firewall-windows.ps1" }
}

Write-Host ''
if ($issues -eq 0) {
    Write-SystemsOk 'complete — host looks ready. Next: scripts\deploy-systems-windows.ps1'
} else {
    Write-SystemsWarn "complete with $issues issue(s) — resolve the items above, then re-run."
}
