#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_systems-common.sh"

require_macos
require_command docker
require_env
systems_log 'Taking an online SQLite backup...'
compose exec -T acronym-api node -e "require('./src/services/backup').runBackup().then(r=>{if(!r.ok)throw new Error(r.error);console.log(r.path)})"
