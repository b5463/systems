// Shared deploy-domain config + URL helpers (was duplicated across views).
export const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'acronym.sk'
export const SCHEME = import.meta.env.VITE_PUBLIC_SCHEME || 'https'

export const hostFor = (slug) => `${slug}.${BASE_DOMAIN}`
export const urlFor = (slug) => `${SCHEME}://${hostFor(slug)}`
