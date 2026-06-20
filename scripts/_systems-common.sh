#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
ENV_FILE="$REPO_ROOT/.env.macos"
COMPOSE_FILE="$REPO_ROOT/docker-compose.macos.yml"

systems_log() { printf '[systems] %s\n' "$*"; }
systems_die() { printf '[systems] ERROR: %s\n' "$*" >&2; exit 1; }
systems_on_error() { local code=$?; printf '[systems] ERROR: command failed at line %s (exit %s)\n' "${BASH_LINENO[0]}" "$code" >&2; exit "$code"; }
trap systems_on_error ERR

require_command() { command -v "$1" >/dev/null 2>&1 || systems_die "Required command not found: $1"; }
require_macos() { [[ "$(uname -s)" == Darwin ]] || systems_die 'This helper is for macOS.'; }
require_env() { [[ -f "$ENV_FILE" ]] || systems_die "Missing $ENV_FILE. Run scripts/systems-setup-macos.sh first."; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_value() { local key="$1"; awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"; }

confirm_typed() {
  local expected="$1" prompt="$2" answer
  printf '%s\nType %s to proceed: ' "$prompt" "$expected" >&2
  IFS= read -r answer
  [[ "$answer" == "$expected" ]]
}
