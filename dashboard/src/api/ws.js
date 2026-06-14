// WebSocket URL builder + thin helper for the platform's WS endpoints.

import { useAuthStore } from '../stores/auth'

// Build an absolute ws(s):// URL from a path like '/api/projects/foo/logs'
// appending the auth token as a query param.
export function wsUrl(path) {
  const auth = useAuthStore()
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const sep = path.includes('?') ? '&' : '?'
  const token = encodeURIComponent(auth.token || '')
  return `${proto}//${window.location.host}${path}${sep}token=${token}`
}

// Open a WebSocket to an API path. Handlers receive parsed JSON messages.
// Returns the raw WebSocket so callers can send() and close().
export function openWs(path, { onMessage, onOpen, onClose, onError } = {}) {
  const ws = new WebSocket(wsUrl(path))

  ws.onopen = (e) => onOpen && onOpen(e)
  ws.onclose = (e) => onClose && onClose(e)
  ws.onerror = (e) => onError && onError(e)
  ws.onmessage = (e) => {
    if (!onMessage) return
    let msg = e.data
    try {
      msg = JSON.parse(e.data)
    } catch {
      // leave as raw string
    }
    onMessage(msg)
  }

  return ws
}
