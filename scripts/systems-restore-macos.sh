#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_systems-common.sh"

backup='' assume_yes=false
while (($#)); do
  case "$1" in
    --backup) [[ $# -ge 2 ]] || systems_die '--backup needs a directory'; backup="$2"; shift 2 ;;
    --yes) assume_yes=true; shift ;;
    *) systems_die "Unknown option: $1" ;;
  esac
done
require_macos
require_env
[[ -n "$backup" ]] || systems_die 'Usage: systems-restore-macos.sh --backup <backup-directory> [--yes]'
backup="$(cd -- "$backup" 2>/dev/null && pwd -P)" || systems_die 'Backup directory does not exist.'
[[ -f "$backup/manifest.json" && -f "$backup/platform.db" ]] || systems_die 'Backup is missing manifest.json or platform.db.'
$assume_yes || confirm_typed RESTORE 'This replaces the current local control-plane database.' || systems_die 'Restore cancelled.'

data_dir="$(env_value SYSTEMS_MAC_DATA_DIR)"
[[ -n "$data_dir" && "$data_dir" == "$HOME/Library/Application Support/SYSTEMS"* ]] || systems_die 'Refusing to restore outside the expected macOS SYSTEMS data directory.'
compose stop acronym-api
install -m 600 "$backup/platform.db" "$data_dir/platform.db"
rm -f -- "$data_dir/platform.db-wal" "$data_dir/platform.db-shm"
compose up -d acronym-api acronym-nginx
bash "$SCRIPT_DIR/systems-health-macos.sh"
