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

if ($DryRun) {
    Write-SystemsStatus 'DRY-RUN - no containers or files will be created/modified'
}

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

$pgDataDir     = Join-Path $paths.Data 'pgdata'
$containerName = 'systems-postgres'

# For local Windows dev, API runs on host, so DATABASE_URL must use localhost.
# For Docker-to-Docker deploy, the API can use systems-postgres inside the Docker network.
$dbUrlLocal  = 'postgresql://{0}:{1}@localhost:{2}/{3}' -f $pgUser, $pgPass, $pgPort, $pgDb
$dbUrlDocker = 'postgresql://{0}:{1}@{2}:5432/{3}' -f $pgUser, $pgPass, $containerName, $pgDb
$maskedLocal = 'postgresql://{0}:****@localhost:{1}/{2}' -f $pgUser, $pgPort, $pgDb
$maskedDocker = 'postgresql://{0}:****@{1}:5432/{2}' -f $pgUser, $containerName, $pgDb

# ---- Ensure Docker network exists -----------------------------------
Write-SystemsStatus ("checking Docker network '{0}'" -f $net)

$networkExists = & docker network ls --filter "name=^$net$" --format '{{.Name}}' 2>$null

if (-not $networkExists) {
    Write-SystemsStatus ("creating Docker network '{0}'" -f $net)

    if (-not $DryRun) {
        & docker network create $net | Out-Null
    }

    Write-SystemsOk 'Docker network ready.'
} else {
    Write-SystemsOk 'Docker network already exists.'
}

# ---- Check if container already exists -------------------------------
$existing = & docker ps -a --filter "name=^${containerName}$" --format '{{.Status}}' 2>$null

if ($existing) {
    if ($existing -match 'Up') {
        Write-SystemsOk ("Container '{0}' is already running." -f $containerName)
    } else {
        Write-SystemsStatus ("Container '{0}' exists but is stopped. Starting..." -f $containerName)

        if (-not $DryRun) {
            & docker start $containerName | Out-Null
        }

        Write-SystemsOk 'Started.'
    }
} else {
    Write-SystemsStatus ("creating data directory: {0}" -f $pgDataDir)

    if (-not $DryRun) {
        if (-not (Test-Path $pgDataDir)) {
            New-Item -ItemType Directory -Path $pgDataDir -Force | Out-Null
        }
    }

    Write-SystemsStatus 'pulling postgres:16-alpine'

    if (-not $DryRun) {
        & docker pull postgres:16-alpine
    }

    Write-SystemsStatus ("creating container '{0}'" -f $containerName)

    if (-not $DryRun) {
        & docker create `
            --name $containerName `
            --restart unless-stopped `
            -e "POSTGRES_DB=$pgDb" `
            -e "POSTGRES_USER=$pgUser" `
            -e "POSTGRES_PASSWORD=$pgPass" `
            -v "$($pgDataDir):/var/lib/postgresql/data" `
            -p "127.0.0.1:$($pgPort):5432" `
            --network $net `
            --health-cmd "pg_isready -U $pgUser -d $pgDb" `
            --health-interval 5s `
            --health-retries 5 `
            postgres:16-alpine | Out-Null

        & docker start $containerName | Out-Null
    }

    Write-SystemsOk ("Container '{0}' created and started." -f $containerName)
}

# ---- Wait for Postgres to be ready ----------------------------------
Write-SystemsStatus 'waiting for Postgres to accept connections'

if (-not $DryRun) {
    $ready = $false

    for ($i = 0; $i -lt 30; $i++) {
        $check = & docker exec $containerName pg_isready -U $pgUser -d $pgDb 2>$null

        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }

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

function Set-EnvValue {
    param(
        [string]$FilePath,
        [string]$Key,
        [string]$Value
    )

    if (-not (Test-Path $FilePath)) {
        return $false
    }

    $content = Get-Content -Path $FilePath -Raw
    $escapedKey = [regex]::Escape($Key)
    $pattern = "(?m)^$escapedKey=.*$"
    $line = "$Key=$Value"

    if ($content -match $pattern) {
        $content = $content -replace $pattern, $line
    } else {
        $content = $content.TrimEnd() + "`n$line`n"
    }

    Set-Content -Path $FilePath -Value $content -NoNewline
    return $true
}

if (Test-Path $envPath) {
    Write-SystemsStatus 'updating .env with Postgres settings'

    if (-not $DryRun) {
        Set-EnvValue $envPath 'DATABASE_URL' $dbUrlLocal | Out-Null
        Set-EnvValue $envPath 'DATABASE_URL_DOCKER' $dbUrlDocker | Out-Null
        Set-EnvValue $envPath 'POSTGRES_PASSWORD' $pgPass | Out-Null
        Set-EnvValue $envPath 'POSTGRES_HOST' 'localhost' | Out-Null
        Set-EnvValue $envPath 'POSTGRES_DOCKER_HOST' $containerName | Out-Null
        Set-EnvValue $envPath 'POSTGRES_PORT' $pgPort | Out-Null
        Set-EnvValue $envPath 'POSTGRES_DB' $pgDb | Out-Null
        Set-EnvValue $envPath 'POSTGRES_USER' $pgUser | Out-Null
    }

    Write-SystemsOk '.env updated.'
} else {
    Write-SystemsWarn (".env not found at {0} - copy .env.example to .env first." -f $envPath)
    Write-SystemsStatus ("DATABASE_URL would be: {0}" -f $maskedLocal)
    Write-SystemsStatus ("DATABASE_URL_DOCKER would be: {0}" -f $maskedDocker)
}

# ---- Summary ---------------------------------------------------------
Write-Host ''
Write-SystemsOk '--- PostgreSQL setup complete ---'
Write-SystemsStatus ("Container:           {0}" -f $containerName)
Write-SystemsStatus ("Database:            {0}" -f $pgDb)
Write-SystemsStatus ("User:                {0}" -f $pgUser)
Write-SystemsStatus ("Local port:          {0}" -f $pgPort)
Write-SystemsStatus ("Docker network:      {0}" -f $net)
Write-SystemsStatus ("Data:                {0}" -f $pgDataDir)
Write-SystemsStatus ("DATABASE_URL:        {0}" -f $maskedLocal)
Write-SystemsStatus ("DATABASE_URL_DOCKER: {0}" -f $maskedDocker)
Write-Host ''
Write-SystemsStatus 'Next: run Prisma generate/migrate from the api folder.'