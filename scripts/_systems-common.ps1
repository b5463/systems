# ============================================================
# SYSTEMS. — shared PowerShell helpers
# Dot-source from every systems-*-windows.ps1 script:
#   . "$PSScriptRoot\_systems-common.ps1"
# No secrets are ever printed. Functions fail safely.
# ============================================================

Set-StrictMode -Version Latest

function Write-SystemsStatus { param([string]$Message) Write-Host "[systems] $Message" -ForegroundColor Cyan }
function Write-SystemsOk     { param([string]$Message) Write-Host "[systems] $Message" -ForegroundColor Green }
function Write-SystemsWarn   { param([string]$Message) Write-Host "[systems] WARN: $Message" -ForegroundColor Yellow }
function Write-SystemsError  { param([string]$Message) Write-Host "[systems] ERROR: $Message" -ForegroundColor Red }

# Repo root = parent of the scripts directory.
function Get-RepoRoot { return (Split-Path -Parent $PSScriptRoot) }

<#
  Load KEY=VALUE pairs from a .env file into a hashtable (and into the current
  process environment). Lines starting with # and blank lines are ignored.
  Values are NOT logged. Returns the hashtable.
#>
function Import-DotEnv {
    param([string]$Path = (Join-Path (Get-RepoRoot) '.env'))
    $config = @{}
    if (-not (Test-Path $Path)) {
        Write-SystemsWarn ".env not found at $Path — using defaults / process env"
        return $config
    }
    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $idx = $trimmed.IndexOf('=')
        if ($idx -lt 1) { continue }
        $key = $trimmed.Substring(0, $idx).Trim()
        $val = $trimmed.Substring($idx + 1).Trim()
        if ($val.Length -ge 2 -and $val.StartsWith('"') -and $val.EndsWith('"')) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        $config[$key] = $val
        # expose to child processes (docker/pg_dump) without echoing the value
        [Environment]::SetEnvironmentVariable($key, $val, 'Process')
    }
    return $config
}

# Resolve a config value: .env -> process env -> default.
function Get-ConfigValue {
    param([hashtable]$Config, [string]$Key, [string]$Default = $null)
    if ($Config.ContainsKey($Key) -and $Config[$Key]) { return $Config[$Key] }
    $envVal = [Environment]::GetEnvironmentVariable($Key, 'Process')
    if ($envVal) { return $envVal }
    return $Default
}

# Standard SYSTEMS. directory set with Windows defaults.
function Get-SystemsPaths {
    param([hashtable]$Config)
    $data = Get-ConfigValue $Config 'SYSTEMS_DATA_DIR' 'C:\ProgramData\SYSTEMS'
    return [ordered]@{
        Data       = $data
        Releases   = (Get-ConfigValue $Config 'DEPLOYMENTS_DIR' (Join-Path $data 'releases'))
        Uploads    = (Get-ConfigValue $Config 'UPLOADS_DIR'     (Join-Path $data 'uploads'))
        Logs       = (Get-ConfigValue $Config 'LOGS_DIR'        (Join-Path $data 'logs'))
        Backups    = (Get-ConfigValue $Config 'BACKUP_DIR'      (Join-Path $data 'backups'))
        CaddyFile  = (Get-ConfigValue $Config 'CADDY_CONFIG_PATH' (Join-Path $data 'caddy\Caddyfile'))
        CaddyDir   = (Get-ConfigValue $Config 'CADDY_SYSTEMS_DIR' (Join-Path $data 'caddy\systems.d'))
    }
}

# Typed confirmation. Returns $true only if the operator types $Expected.
function Confirm-Typed {
    param([string]$Prompt, [string]$Expected)
    Write-Host $Prompt -ForegroundColor Yellow
    $answer = Read-Host "Type '$Expected' to proceed"
    return ($answer -eq $Expected)
}

# Is a TCP port open on a host? Used to verify a service is NOT publicly exposed.
function Test-TcpPort {
    param([string]$ComputerName = '127.0.0.1', [int]$Port, [int]$TimeoutMs = 1500)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($ComputerName, $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne($TimeoutMs)
        if ($ok -and $client.Connected) { $client.Close(); return $true }
        $client.Close(); return $false
    } catch { return $false }
}

# True if Docker CLI responds and is in Linux-container mode.
function Test-DockerLinux {
    try {
        $os = (& docker info --format '{{.OSType}}' 2>$null)
        return ($LASTEXITCODE -eq 0 -and $os -eq 'linux')
    } catch { return $false }
}
