// Shared date formatters (were duplicated across views).

export function fmtDate(s) {
  if (!s) return '–'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString()
}

// Date + time (used where the exact moment matters, e.g. deploy timestamps).
export function fmtDateTime(s) {
  if (!s) return '–'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString()
}

// Relative "x ago" for recent timestamps.
export function fmtAgo(s) {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}
