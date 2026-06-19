// System status vocabulary, in one place — the single source of truth for the
// user-facing headline state. No screen should derive status independently.
//
// A down/errored system is "Crashed" if it had built and run before (it has an
// image), or "Build failed" if it never got that far.
export function isCrashed(project) {
  return !!(project && project.status === 'error' && project.image_id)
}

const UNHEALTHY = ['unhealthy', 'unreachable', 'timeout']

// Derive the headline state from the independent facts (runtime + route +
// health + intended visibility). Critically: a running container is NOT "Live"
// unless its intended public route is published and health is good. A public
// system that is running but unrouted is "Running — unpublished", not Live.
//
// Returns { key, label, tone } where tone ∈ ok | warn | error | building | idle.
export function deriveState(project) {
  const p = project || {}
  switch (p.status) {
    case 'building':
      return { key: 'building', label: 'Building', tone: 'building' }
    case 'deleted':
      return { key: 'deleted', label: 'Deleted', tone: 'idle' }
    case 'stopped':
      return { key: 'stopped', label: 'Stopped', tone: 'idle' }
    case 'error':
      return p.image_id
        ? { key: 'crashed', label: 'Crashed', tone: 'error' }
        : { key: 'failed', label: 'Build failed', tone: 'error' }
    case 'running': {
      const vis = p.visibility || 'public'
      const unhealthy = UNHEALTHY.includes(p.health_state)
      if (vis === 'private') {
        return unhealthy
          ? { key: 'degraded', label: 'Degraded', tone: 'warn' }
          : { key: 'running_private', label: 'Running privately', tone: 'ok' }
      }
      // public / password: a public route must be published to be reachable.
      if (!p.route_published) {
        return { key: 'unpublished', label: 'Running — unpublished', tone: 'warn' }
      }
      if (unhealthy) return { key: 'degraded', label: 'Degraded', tone: 'warn' }
      // Only call it Live when the intended endpoint actually responded.
      if (p.health_state === 'healthy') return { key: 'live', label: 'Live', tone: 'ok' }
      // Routed and running but health not yet measured — running, not "Live".
      return { key: 'running', label: 'Running', tone: 'ok' }
    }
    default:
      if (!p.status) return { key: 'unknown', label: 'Unknown', tone: 'idle' }
      return { key: p.status, label: p.status.charAt(0).toUpperCase() + p.status.slice(1), tone: 'idle' }
  }
}

// Back-compat: a short word for the state. Delegates to the canonical model.
export function statusWord(project) {
  return deriveState(project).label
}
