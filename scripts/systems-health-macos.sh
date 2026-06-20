#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_systems-common.sh"

require_macos
require_command docker
require_command curl
require_env
docker info >/dev/null 2>&1 || systems_die 'Docker Desktop is not running.'
port="$(env_value SYSTEMS_HTTP_PORT)"
port="${port:-8080}"
compose ps --status running
[[ "$(compose ps --status running --services | wc -l | tr -d ' ')" -eq 2 ]] || systems_die 'Expected nginx and API to be running.'
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$port/" >/dev/null
api_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "http://127.0.0.1:$port/api/server/info")"
[[ "$api_status" == 401 ]] || systems_die "API route returned HTTP $api_status; expected 401 without a token."
systems_log "Dashboard and API routing are healthy at http://localhost:$port"
