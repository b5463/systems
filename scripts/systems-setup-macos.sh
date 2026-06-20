#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_systems-common.sh"

admin_password=''
while (($#)); do
  case "$1" in
    --admin-password) [[ $# -ge 2 ]] || systems_die '--admin-password needs a value'; admin_password="$2"; shift 2 ;;
    *) systems_die "Unknown option: $1" ;;
  esac
done

require_macos
require_command docker
require_command openssl
docker info >/dev/null 2>&1 || systems_die 'Docker Desktop is not running.'
docker compose version >/dev/null 2>&1 || systems_die 'Docker Compose v2 is required.'
[[ ! -f "$ENV_FILE" ]] || systems_die "$ENV_FILE already exists; refusing to overwrite it."

if [[ -z "$admin_password" ]]; then
  [[ -t 0 ]] || systems_die 'Pass --admin-password when setup is non-interactive.'
  printf 'Initial admin password (12+ characters): ' >&2
  IFS= read -r -s admin_password
  printf '\n' >&2
fi
[[ ${#admin_password} -ge 12 ]] || systems_die 'Admin password must be at least 12 characters.'
[[ "$admin_password" =~ ^[A-Za-z0-9._@!%+-]+$ ]] || systems_die 'Use only letters, numbers, and . _ @ ! % + - in the admin password.'

data_dir="$HOME/Library/Application Support/SYSTEMS"
conf_dir="$data_dir/nginx/conf.d"
mkdir -p "$data_dir/backups" "$data_dir/releases" "$data_dir/uploads" "$data_dir/logs" "$conf_dir"
umask 077
tmp_env="$(mktemp "$REPO_ROOT/.env.macos.XXXXXX")"
trap 'rm -f -- "${tmp_env:-}"' EXIT
{
  printf 'SYSTEMS_HTTP_PORT=8080\n'
  printf 'SYSTEMS_MAC_DATA_DIR=%s\n' "$data_dir"
  printf 'SYSTEMS_MAC_NGINX_CONF_DIR=%s\n' "$conf_dir"
  printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 48)"
  printf 'ENV_SECRET=%s\n' "$(openssl rand -hex 32)"
  printf 'SYSTEMS_ATTESTATION_SECRET=%s\n' "$(openssl rand -hex 32)"
  printf 'ADMIN_USERS=admin:%s\n' "$admin_password"
  printf 'RECONCILE_INTERVAL_SEC=30\n'
} >"$tmp_env"
mv -- "$tmp_env" "$ENV_FILE"
chmod 600 "$ENV_FILE"
trap - EXIT
systems_log "Created $ENV_FILE and data directories."
systems_log 'Next: scripts/systems-deploy-macos.sh'
