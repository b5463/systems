// Shared deploy-domain config + URL helpers (was duplicated across views).
export const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'acronym.sk'
export const SCHEME = import.meta.env.VITE_PUBLIC_SCHEME || 'https'

// Local testing: when the dashboard itself is opened over localhost there is no
// Caddy/DNS, so deployed systems are NOT reachable at slug.<domain> — they're
// published on a host port. In that case the helpers return localhost:<port>
// (when the port is known) so the shown URLs and "Open" links actually work.
// Override with VITE_BASE_DOMAIN / VITE_PUBLIC_SCHEME for a real deployment.
export const LOCAL_MODE =
  (import.meta.env.VITE_LOCAL_MODE === 'true') ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname))

export const hostFor = (slug, port) =>
  LOCAL_MODE && port ? `localhost:${port}` : `${slug}.${BASE_DOMAIN}`

export const urlFor = (slug, port) =>
  LOCAL_MODE && port ? `http://localhost:${port}` : `${SCHEME}://${slug}.${BASE_DOMAIN}`
