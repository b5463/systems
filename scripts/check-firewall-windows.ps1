<#
.SYNOPSIS
  Verify the Windows Firewall posture for SYSTEMS.: public 80/443 should be
  open; Postgres / Docker API / Caddy admin / internal ports must NOT be
  publicly reachable. Read-only — reports findings, changes nothing.
#>
[CmdletBinding()]
param(
    [string]$PublicIp
)

. "$PSScriptRoot\_systems-common.ps1"

$cfg = Import-DotEnv
if (-not $PublicIp) { $PublicIp = Get-ConfigValue $cfg 'SERVER_IP' '' }

Write-SystemsStatus 'checking Windows Firewall'

# Should be OPEN (inbound) for the reverse proxy.
foreach ($port in 80, 443) {
    $f = Get-NetFirewallPortFilter -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port }
    if ($f) { Write-SystemsOk "inbound $port/tcp rule present (expected)" }
    else { Write-SystemsWarn "no inbound rule for $port/tcp — public traffic will be blocked" }
}

# Must NOT be publicly reachable. We probe the public IP (if known) and warn
# loudly if any of these answer.
$mustBePrivate = @{
    'Postgres'    = [int](Get-ConfigValue $cfg 'POSTGRES_PORT' '5432')
    'Docker API'  = 2375
    'Docker APIs' = 2376
    'Caddy admin' = 2019
}
if ($PublicIp) {
    Write-SystemsStatus "probing public IP $PublicIp for ports that must stay private"
    foreach ($name in $mustBePrivate.Keys) {
        $p = $mustBePrivate[$name]
        if (Test-TcpPort -ComputerName $PublicIp -Port $p) {
            Write-SystemsError "$name ($p) is PUBLICLY REACHABLE — close it immediately"
        } else {
            Write-SystemsOk "$name ($p) not reachable publicly"
        }
    }
} else {
    Write-SystemsWarn 'SERVER_IP not set — skipping external probe. Set it to verify exposure.'
}

# Local listeners on sensitive ports bound to 0.0.0.0 are a red flag.
Write-SystemsStatus 'checking local listeners on sensitive ports'
foreach ($name in $mustBePrivate.Keys) {
    $p = $mustBePrivate[$name]
    $listen = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
    if ($listen) {
        $addrs = ($listen.LocalAddress | Sort-Object -Unique) -join ', '
        if ($addrs -match '0\.0\.0\.0|::') {
            Write-SystemsError "$name ($p) is listening on $addrs — bind to 127.0.0.1 only"
        } else {
            Write-SystemsOk "$name ($p) listening on $addrs (local only)"
        }
    }
}

Write-Host ''
Write-SystemsStatus 'reminders:'
Write-Host '  - systems.acronym.sk must stay behind admin auth'
Write-Host '  - deployed projects are public ONLY when visibility = Public'
Write-Host '  - password-protected projects use Caddy basic auth/equivalent'
Write-Host '  - private/internal projects must have NO public Caddy route'
Write-Host '  - wildcard DNS does not mean every subdomain should expose a service'
Write-SystemsOk 'complete'
