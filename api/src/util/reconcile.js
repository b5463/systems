'use strict';

// Pure decision logic for container-state reconciliation. Given a project row
// and the actual Docker container (or null if none was found), decide what
// status the DB should hold. Returns null when no change is needed.
//
// This is the truth-keeper: the DB `status` column otherwise only reflects the
// last *action* taken, so a crash, OOM, or host reboot would leave a system
// showing "running" forever. Reconciliation corrects that drift honestly.

// Statuses we never auto-correct: the system is mid-operation or was
// intentionally removed.
const SKIP = new Set(['building', 'deleted']);

// Map a Docker container State string to the status we want to store.
function desiredStatus(dockerState) {
  if (!dockerState) return null;
  const s = String(dockerState).toLowerCase();
  if (s === 'running' || s === 'restarting') return 'running';
  if (s === 'paused' || s === 'exited' || s === 'dead' || s === 'created') return 'stopped';
  return null;
}

/**
 * @param {{status:string, container_id:?string}} project
 * @param {{State:string}|null} container - matched managed container, or null
 * @returns {string|null} new status, or null if unchanged
 */
function reconcileStatus(project, container) {
  if (!project || SKIP.has(project.status)) return null;
  // Nothing was ever deployed for this system — leave it alone.
  if (!project.container_id) return null;
  if (!container) {
    // We expected a container but Docker has none. The system cannot be
    // running; surface it as an error so the operator knows to redeploy.
    return project.status === 'error' ? null : 'error';
  }
  const want = desiredStatus(container.State);
  if (!want || want === project.status) return null;
  return want;
}

module.exports = { desiredStatus, reconcileStatus, SKIP };
