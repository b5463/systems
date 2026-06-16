// System status vocabulary, in one place.
//
// A down/errored system is shown as "Crashed" if it had built and run before
// (it has an image), or "Failed" if it never got that far (a build failure).
export function isCrashed(project) {
  return !!(project && project.status === 'error' && project.image_id)
}

export function statusWord(project) {
  if (!project) return 'Unknown'
  switch (project.status) {
    case 'running': return 'Live'
    case 'building': return 'Building'
    case 'stopped': return 'Stopped'
    case 'deleted': return 'Deleted'
    case 'error': return project.image_id ? 'Crashed' : 'Failed'
    default: return project.status.charAt(0).toUpperCase() + project.status.slice(1)
  }
}
