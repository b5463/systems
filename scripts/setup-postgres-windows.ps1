<#
.SYNOPSIS
  Launch a PostgreSQL container for the SYSTEMS. control plane and populate
  the DATABASE_URL in .env if not already set.
.DESCRIPTION
  Creates and starts a postgres:16-alpine Docker container named
  systems-postgres with a persistent volume at SYSTEMS_DATA_DIR\pgdata.
  Generates a random password if POSTGRES_PASSWORD is not set.
  Writes/updates DATABASE_URL, POSTGRES_HOST, and POSTGRES_PASSWORD in .env.
  Idempotent — safe to re-run. Does not destroy existing data.
.NOTES
  Run in an elevated PowerShell (Administrator) after setup-windows.ps1.
  Requires Docker Desktop (Linux containers) to be running.
#>
[CmdletBinding()]
param(
    [switch]$DryRun
)

. "$PSScriptRoot\_systems-common.ps1"
if ($DryRun) { Write-SystemsStatus 'DRY-RUN — no containers or files will be created/modified' }

$cfg   = Import-DotEnv
$paths = Get-SystemsPaths $cfg
$net   = Get-ConfigValue $cfg 'DOCKER_NETWORK' 'systems'

# ---- Check Docker ---------------------------------------------------
Write-SystemsStatus 'checking Docker'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-SystemsError 'Docker not found. Install Docker Desktop first.'
    exit 1
}
if (-not (Test-DockerLinux)) {
    Write-SystemsError 'Docker is not reachable or not in Linux-container mode.'
    exit 1
}
Write-SystemsOk 'Docker reachable'

# ---- Resolve Postgres credentials -----------------------------------
$pgUser = Get-ConfigValue $cfg 'POSTGRES_USER' 'systems'
$pgDb   = Get-ConfigValue $cfg 'POSTGRES_DB' 'systems'
$pgPort = Get-ConfigValue $cfg 'POSTGRES_PORT' '5432'
$pgPass = Get-ConfigValue $cfg 'POSTGRES_PASSWORD' ''

if (-not $pgPass -or $pgPass -eq 'CHANGE_ME') {
    Write-SystemsStatus 'generating random Postgres password'
    $pgPass = & node -e "console.log(require('crypto').randomBytes(24).toString('hex'))" 2>$null
    if (-not $pgPass) {
        Write-SystemsError 'Node.js is required to generate a password.'
        exit 1
    }
}

$pgDataDir = Join-Path $paths.Data 'pgdata'
$containerName = 'systems-postgres'

# ---- Check if container already exists -------------------------------
$existing = & docker ps -a --filter "name=^${containerName}$" --format '{{.Status}}' 2>$null
if ($existing) {
    if ($existing -match 'Up') {
        Write-SystemsOk "Container '$containerName' is already running."
    } else {
        Write-SystemsStatus "Container '$containerName' exists but is stopped. Starting..."
        if (-not $DryRun) { & docker start $containerName | Out-Null }
        Write-SystemsOk 'Started.'
    }
} else {
    Write-SystemsStatus "creating data directory: $pgDataDir"
    if (-not $DryRun) {
        if (-not (Test-Path $pgDataDir)) {
            New-Item -ItemType Directory -Path $pgDataDir -Force | Out-Null
        }
    }

    Write-SystemsStatus "pulling postgres:16-alpine"
    if (-not $DryRun) { & docker pull postgres:16-alpine }

    Write-SystemsStatus "creating container '$containerName'"
    if (-not $DryRun) {
        & docker create `
            --name $containerName `
            --restart unless-stopped `
            -e "POSTGRES_DB=$pgDb" `
            -e "POSTGRES_USER=$pgUser" `
            -e "POSTGRES_PASSWORD=$pgPass" `
            -v "${pgDataDir}:/var/lib/postgresql/data" `
            --network $net `
            --health-cmd "pg_isready -U $pgUser" `
            --health-interval 5s `
            --health-retries 5 `
            postgres:16-alpine | Out-Null

        & docker start $containerName | Out-Null
    }
    Write-SystemsOk "Container '$containerName' created and started."
}

# ---- Wait for Postgres to be ready ----------------------------------
Write-SystemsStatus 'waiting for Postgres to accept connections'
if (-not $DryRun) {
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        $check = & docker exec $containerName pg_isready -U $pgUser 2>$null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if ($ready) {
        Write-SystemsOk 'Postgres is ready.'
    } else {
        Write-SystemsError 'Postgres did not become ready within 30 seconds.'
        exit 1
    }
}

# ---- Update .env with DATABASE_URL ----------------------------------
$envPath = Join-Path (Get-RepoRoot) '.env'
$dbUrl = "postgresql://${pgUser}:${pgPass}@${containerName}:${pgPort}/${pgDb}"

function Set-EnvValue {
    param([string]$FilePath, [string]$Key, [string]$Value)
    if (-not (Test-Path $FilePath)) { return $false }
    $content = Get-Content -Path $FilePath -Raw
    $pattern = "(?m)^${Key}=.*$"
    if ($content -match $pattern) {
        $content = $content -replace $pattern, "${Key}=${Value}"
    } else {
        $content = $content.TrimEnd() + "`n${Key}=${Value}`n"
    }
    Set-Content -Path $FilePath -Value $content -NoNewline
    return $true
}

if (Test-Path $envPath) {
    Write-SystemsStatus "updating .env with DATABASE_URL and POSTGRES_PASSWORD"
    if (-not $DryRun) {
        Set-EnvValue $envPath 'DATABASE_URL' $dbUrl
        Set-EnvValue $envPath 'POSTGRES_PASSWORD' $pgPass
        Set-EnvValue $envPath 'POSTGRES_HOST' $containerName
    }
    Write-SystemsOk '.env updated.'
} else {
    Write-SystemsWarn ".env not found at $envPath — copy .env.example to .env first."
    Write-SystemsStatus "DATABASE_URL would be: postgresql://${pgUser}:****@${containerName}:${pgPort}/${pgDb}"
}

# ---- Summary ---------------------------------------------------------
Write-Host ''
Write-SystemsOk '--- PostgreSQL setup complete ---'
Write-SystemsStatus "Container:    $containerName"
Write-SystemsStatus "Database:     $pgDb"
Write-SystemsStatus "User:         $pgUser"
Write-SystemsStatus "Port:         $pgPort (inside Docker network '$net')"
Write-SystemsStatus "Data:         $pgDataDir"
Write-SystemsStatus "DATABASE_URL: postgresql://${pgUser}:****@${containerName}:${pgPort}/${pgDb}"
Write-Host ''
Write-SystemsStatus 'Next: run deploy-systems-windows.ps1 to build and start the API.'
