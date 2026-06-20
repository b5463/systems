// WebSocket URL builder + thin helper for the platform's WS endpoints.
// Authentication is carried by the browser's HttpOnly same-origin cookie.
export function wsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}

export function openWs(path, { onMessage, onOpen, onClose, onError } = {}) {
  const ws = new WebSocket(wsUrl(path))
  ws.onopen = (e) => onOpen && onOpen(e)
  ws.onclose = (e) => onClose && onClose(e)
  ws.onerror = (e) => onError && onError(e)
  ws.onmessage = (e) => {
    if (!onMessage) return
    let msg = e.data
    try { msg = JSON.parse(e.data) } catch { /* leave raw */ }
    onMessage(msg)
  }
  return ws
}