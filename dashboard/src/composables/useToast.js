import { ref } from 'vue'

const toasts = ref([])
let nextId = 0
const timers = new Map()

// Errors/warnings linger longer than confirmations; you shouldn't miss a failure.
const DURATION = { success: 3500, info: 4000, warn: 6000, error: 8000 }

function clear(id) {
  const h = timers.get(id)
  if (h) { clearTimeout(h); timers.delete(id) }
}
function remove(id) {
  clear(id)
  toasts.value = toasts.value.filter((t) => t.id !== id)
}
function schedule(id, ms) {
  clear(id)
  timers.set(id, setTimeout(() => remove(id), ms))
}

export function useToast() {
  function showToast(message, type = 'info') {
    const id = ++nextId
    const duration = DURATION[type] || 4000
    toasts.value.push({ id, message, type, duration })
    schedule(id, duration)
    return id
  }
  function dismiss(id) { remove(id) }
  // Hover-to-pause: stop the timer on enter, restart it on leave.
  function pause(id) { clear(id) }
  function resume(id) {
    const t = toasts.value.find((x) => x.id === id)
    if (t) schedule(id, t.duration)
  }
  return { toasts, showToast, dismiss, pause, resume }
}
