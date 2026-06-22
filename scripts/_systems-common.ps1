# Shared helpers for SYSTEMS. Windows scripts.
# Keep this file plain ASCII/UTF-8. Avoid smart quotes.

$script:SystemsCommonDir = Split-Path -Parent $PSCommandPath
$script:SystemsRepoRoot  = Split-Path -Parent $script:SystemsCommonDir

function Get-RepoRoot {
    return $script:SystemsRepoRoot
}

function Write-SystemsStatus {
    param([string]$Message)
    Write-Host "[systems] $Message"
}

function Write-SystemsOk {
    param([string]$Message)
    Write-Host "[systems] OK: $Message"
}

function Write-SystemsWarn {
    param([string]$Message)
    Write-Warning "[systems] $Message"
}

function Write-SystemsError {
    param([string]$Message)
    Write-Error "[systems] $Message"
}

function Import-DotEnv {
    param(
        [string]$Path = $(Join-Path (Get-RepoRoot) '.env')
    )

    $values = @{}

    if (-not (Test-Path $Path)) {
        return $values
    }

    $lines = Get-Content -Path $Path

    foreach ($line in $lines) {
        $trimmed = $line.Trim()

        if (-not $trimmed) {
            continue
        }

        if ($trimmed.StartsWith('#')) {
            continue
        }

        $equalsIndex = $trimmed.IndexOf('=')

        if ($equalsIndex -lt 1) {
            continue
        }

        $key = $trimmed.Substring(0, $equalsIndex).Trim()
        $value = $trimmed.Substring($equalsIndex + 1).Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $values[$key] = $value
    }

    return $values
}

function Get-ConfigValue {
    param(
        [hashtable]$Config,
        [string]$Key,
        [string]$Default = ''
    )

    if ($null -ne $Config -and $Config.ContainsKey($Key)) {
        $value = $Config[$Key]

        if ($null -ne $value -and "$value" -ne '') {
            return "$value"
        }
    }

    return $Default
}

function Resolve-SystemsPath {
    param(
        [string]$Path,
        [string]$Fallback
    )

    $chosen = $Path

    if (-not $chosen) {
        $chosen = $Fallback
    }

    if ([System.IO.Path]::IsPathRooted($chosen)) {
        return $chosen
    }

    return Join-Path (Get-RepoRoot) $chosen
}

function Get-SystemsPaths {
    param([hashtable]$Config)

    $root = Get-RepoRoot

    $data = Resolve-SystemsPath `
        (Get-ConfigValue $Config 'SYSTEMS_DATA_DIR' '') `
        (Join-Path $root '.systems-data')

    $logs = Resolve-SystemsPath `
        (Get-ConfigValue $Config 'SYSTEMS_LOG_DIR' '') `
        (Join-Path $data 'logs')

    $releases = Resolve-SystemsPath `
        (Get-ConfigValue $Config 'SYSTEMS_RELEASES_DIR' '') `
        (Join-Path $data 'releases')

    $backups = Resolve-SystemsPath `
        (Get-ConfigValue $Config 'SYSTEMS_BACKUP_DIR' '') `
        (Join-Path $data 'backups')

    $caddy = Resolve-SystemsPath `
        (Get-ConfigValue $Config 'CADDY_SYSTEMS_DIR' '') `
        (Join-Path $data 'caddy')

    return [PSCustomObject]@{
        Root     = $root
        Data     = $data
        Logs     = $logs
        Releases = $releases
        Backups  = $backups
        Caddy    = $caddy
    }
}

function Test-DockerLinux {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        return $false
    }

    $osType = & docker info --format '{{.OSType}}' 2>$null

    if ($LASTEXITCODE -ne 0) {
        return $false
    }

    return ($osType -eq 'linux')
}

function Confirm-SystemsAction {
    param(
        [string]$Expected = 'CONFIRM',
        [string]$Message = 'This action may modify your SYSTEMS installation.'
    )

    Write-SystemsWarn $Message

    $prompt = "Type {0} to proceed" -f $Expected
    $answer = Read-Host $prompt

    return ($answer -eq $Expected)
}