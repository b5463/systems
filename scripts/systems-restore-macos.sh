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
[[ -f "$backup/manifest.json" && -f "$backup/platform.pgdump" ]] || systems_die 'Backup is missing manifest.json or platform.pgdump.'
$assume_yes || confirm_typed RESTORE 'This replaces the current local control-plane database.' || systems_die 'Restore cancelled.'

data_dir="$(env_value SYSTEMS_MAC_DATA_DIR)"
[[ -n "$data_dir" && "$data_dir" == "$HOME/Library/Application Support/SYSTEMS"* ]] || systems_die 'Refusing to restore outside the expected macOS SYSTEMS data directory.'

db_name="$(env_value POSTGRES_DB)"; db_name="${db_name:-systems}"
db_user="$(env_value POSTGRES_USER)"; db_user="${db_user:-systems}"

# The macOS stack runs Postgres (systems-postgres), and the backup service
# writes platform.pgdump via pg_dump --format=custom. Restore it with
# pg_restore into the running control-plane database (stop the API first so it
# isn't holding connections). --clean --if-exists replaces existing objects;
# --exit-on-error fails loudly rather than reporting a partial restore as done.
compose stop acronym-api
if ! compose exec -T systems-postgres pg_restore -U "$db_user" -d "$db_name" \
      --clean --if-exists --no-owner --exit-on-error <"$backup/platform.pgdump"; then
  compose up -d acronym-api acronym-nginx
  systems_die 'pg_restore failed; the API has been restarted against the existing database.'
fi
compose up -d acronym-api acronym-nginx
bash "$SCRIPT_DIR/systems-health-macos.sh"
