<#
.SYNOPSIS
  Read-only hardening audit for SYSTEMS. Checks safe-by-default posture:
  risky feature flags, secret hygiene, CORS lockdown, port exposure, and
  backup freshness. Changes nothing; exits non-zero if any HIGH finding.
#>
[CmdletBinding()]
param(
    [string]$PublicIp
)

. "$PSScriptRoot\_systems-common.ps1"

$cfg   = Import-DotEnv
$paths = Get-SystemsPaths $cfg
if (-not $PublicIp) { $PublicIp = Get-ConfigValue $cfg 'SERVER_IP' '' }
$high = 0; $warn = 0

Write-SystemsStatus 'verifying hardening posture'

# --- 1. risky V2 feature flags should be off unless deliberately enabled ---
Write-SystemsStatus 'feature flags'
foreach ($flag in 'ENABLE_DOCKERFILE_MODE','ENABLE_SHELL_CONSOLE','ENABLE_DB_PROVISIONING','ENABLE_GITHUB_DEPLOYS','ENABLE_NOTIFICATIONS') {
    $v = Get-ConfigValue $cfg $flag 'false'
    if ($v -match '^(1|true|yes|on)$') { Write-SystemsWarn "$flag is ENABLED — ensure it is intended and hardened"; $warn++ }
    else { Write-SystemsOk "$flag off" }
}

# --- 2. secret hygiene (never print the values) ---
Write-SystemsStatus 'secrets'
foreach ($s in 'JWT_SECRET','ENV_SECRET') {
    $v = Get-ConfigValue $cfg $s ''
    if (-not $v) { Write-SystemsError "$s is empty"; $high++ }
    elseif ($v -match 'change-me|change-this|example|000000') { Write-SystemsError "$s still looks like the placeholder"; $high++ }
    else { Write-SystemsOk "$s set" }
}
$admins = Get-ConfigValue $cfg 'ADMIN_USERS' ''
if ($admins -match 'change-this-password|password1') { Write-SystemsError 'ADMIN_USERS still uses a default password'; $high++ }

# --- 3. CORS locked to the dashboard origin ---
$cors = Get-ConfigValue $cfg 'CORS_ORIGIN' ''
if (-not $cors -or $cors -eq '*' -or $cors -match '\*') { Write-SystemsError "CORS_ORIGIN must be the exact dashboard origin, not '*'"; $high++ }
else { Write-SystemsOk "CORS locked to $cors" }

# --- 4. ports that must NOT be public ---
Write-SystemsStatus 'exposure'
if ($PublicIp) {
    foreach ($pair in @(@{n='Postgres';p=[int](Get-ConfigValue $cfg 'POSTGRES_PORT' '5432')}, @{n='Docker API';p=2375}, @{n='Docker APIs';p=2376}, @{n='Caddy admin';p=2019})) {
        if (Test-TcpPort -ComputerName $PublicIp -Port $pair.p) { Write-SystemsError "$($pair.n) ($($pair.p)) is PUBLICLY reachable"; $high++ }
        else { Write-SystemsOk "$($pair.n) ($($pair.p)) not public" }
    }
} else { Write-SystemsWarn 'SERVER_IP not set — skipped external exposure probe'; $warn++ }

# --- 5. backups present & fresh ---
Write-SystemsStatus 'backups'
$last = Get-ChildItem -Path $paths.Backups -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $last) { Write-SystemsWarn 'no backups found — run backup-systems-windows.ps1'; $warn++ }
else {
    $age = (New-TimeSpan -Start $last.LastWriteTime -End (Get-Date)).TotalHours
    if ($age -gt 168) { Write-SystemsWarn "last backup is $([math]::Round($age))h old (overdue)"; $warn++ }
    else { Write-SystemsOk "last backup $([math]::Round($age,1))h ago" }
}

Write-Host ''
if ($high -gt 0) { Write-SystemsError "complete — $high high finding(s), $warn warning(s). Resolve HIGH items before exposing."; exit 1 }
elseif ($warn -gt 0) { Write-SystemsWarn "complete — 0 high, $warn warning(s)."; }
else { Write-SystemsOk 'complete — no findings.' }
