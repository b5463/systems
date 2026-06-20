# macOS testing

SYSTEMS. has a local macOS test topology for Docker Desktop on both Apple
Silicon and Intel Macs. It runs the control plane in Linux containers, mounts
Docker Desktop's socket, exposes the dashboard at `http://localhost:8080`, and
routes deployed systems at `http://localhost:8080/<slug>/`.

This is a local validation path. It deliberately uses HTTP and nginx; it does
not prove wildcard DNS, Caddy, or public TLS.

## Requirements

- macOS 13 or newer
- Docker Desktop using Linux containers
- Node.js 20 or newer and npm
- Git, curl, Bash, and OpenSSL
- At least 8 GB RAM; allocate 4 GB or more to Docker Desktop

The upstream Node and nginx images are multi-architecture, so no Rosetta setup
is required on Apple Silicon.

## First run

```bash
bash scripts/systems-setup-macos.sh
bash scripts/systems-deploy-macos.sh
```

Setup asks for an initial admin password, creates `.env.macos` with random
secrets and mode `0600`, and stores state under
`~/Library/Application Support/SYSTEMS`. It never overwrites an existing env
file. Open `http://localhost:8080` and sign in as `admin`.

If port 8080 is occupied, change `SYSTEMS_HTTP_PORT` in `.env.macos` before
deploying. Do not commit that file.

## Cross-platform deploy test

```bash
cd api
npm ci
npm run test:e2e
```

Then upload a static zip in the dashboard. SYSTEMS. should build a Linux
container, probe its published host port locally, and expose it at
`http://localhost:8080/<slug>/`. This exercises Docker socket access,
architecture-native image builds, route generation, nginx reload, health,
redeploy, and rollback. Public DNS and HTTPS remain outside this test.

## Operations

```bash
bash scripts/systems-health-macos.sh
bash scripts/systems-backup-macos.sh
bash scripts/systems-update-macos.sh
```

Backups are online SQLite snapshots under
`~/Library/Application Support/SYSTEMS/backups`. Restore requires an explicit
backup directory and typed confirmation:

```bash
bash scripts/systems-restore-macos.sh \
  --backup "$HOME/Library/Application Support/SYSTEMS/backups/<timestamp>"
```

Stop the stack without deleting state:

```bash
docker compose --env-file .env.macos -f docker-compose.macos.yml down
```

## Security boundary

The API controls the Docker socket and must remain local. The macOS Compose file
binds nginx to loopback and does not publish the API or Docker daemon. Deployed
apps use ephemeral host ports for local health and routing. Uploaded
code is still untrusted. Use a dedicated test Mac or disposable Docker Desktop
data set for adversarial archives.

macOS host validation is not complete until a full zip deploy, redeploy,
rollback, route, and health run succeeds on an actual Mac.
