#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_systems-common.sh"

assume_yes=false
while (($#)); do
  case "$1" in
    --yes) assume_yes=true; shift ;;
    *) systems_die "Unknown option: $1" ;;
  esac
done
require_macos
require_command git
require_env
$assume_yes || confirm_typed UPDATE 'This backs up, fast-forwards the current branch, rebuilds, and restarts SYSTEMS.' || systems_die 'Update cancelled.'
bash "$SCRIPT_DIR/systems-backup-macos.sh"
(cd "$REPO_ROOT" && git pull --ff-only)
bash "$SCRIPT_DIR/systems-deploy-macos.sh"
