#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_systems-common.sh"

require_macos
require_command docker
require_command npm
require_env
docker info >/dev/null 2>&1 || systems_die 'Docker Desktop is not running.'
systems_log 'Building dashboard...'
(cd "$REPO_ROOT/dashboard" && npm ci && npm run build)
systems_log 'Building and starting the macOS stack...'
compose up -d --build
bash "$SCRIPT_DIR/systems-health-macos.sh"
