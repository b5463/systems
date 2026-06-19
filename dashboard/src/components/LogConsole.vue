<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { openWs } from '../api/ws'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const props = defineProps({
  slug: { type: String, required: true },
  // 'logs' streams container logs; 'build' streams a deploy build log
  mode: { type: String, default: 'logs' }
})

// Emitted once when a build log reports a terminal state ('done' | 'error').
const emit = defineEmits(['finished'])

const wrap = ref(null)
// connecting | waiting | streaming | reconnecting | ended | error
const status = ref('connecting')
const errMsg = ref('')
const noOutput = ref(false)
const paused = ref(false)
const hasLog = ref(false)
const followLogs = ref(true)
const wrapLines = ref(true)
const searchQuery = ref('')
const importantLines = ref([])
const sourceFilter = ref('all')

let term = null
let fit = null
let ws = null
let resizeObserver = null
let terminalReached = false   // a terminal state was reached — do not reconnect
let reconnects = 0
let idleTimer = null
let lastOutputAt = 0
let logBuffer = ''
let pausedBuffer = ''
let pendingLine = ''
let suppressedBuffer = ''

const STATUS_LABEL = {
  connecting: 'Connecting…',
  waiting: props.mode === 'build' ? 'Waiting for build output…' : 'Waiting for output…',
  streaming: 'Streaming',
  reconnecting: 'Reconnecting…',
  ended: 'Stream ended',
  error: 'Error'
}
const statusLabel = computed(() => STATUS_LABEL[status.value] || status.value)
const statusTone = computed(() => {
  if (status.value === 'error') return 'error'
  if (status.value === 'reconnecting' || status.value === 'waiting') return 'warn'
  if (status.value === 'streaming') return 'ok'
  return 'idle'
})
const canReconnect = computed(() => status.value === 'ended' || status.value === 'error')
const searchMatches = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  return logBuffer
    .split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.line.toLowerCase().includes(q))
    .slice(-25)
})
const sourceOptions = [
  { value: 'all', label: 'All' },
  { value: 'stdout', label: 'stdout' },
  { value: 'stderr', label: 'stderr' },
]

// Neutral, brand-aligned terminal palette (no cyan).
const theme = {
  background: '#000000',
  foreground: '#e6edf3',
  cursor: '#e6edf3',
  selectionBackground: 'rgba(255,255,255,0.18)'
}

function classifyLine(line) {
  const text = String(line || '')
  if (/\b(error|failed|failure|exception|traceback|fatal|panic|permission denied|eaddrinuse|cannot|refused|timed out|exited with code)\b/i.test(text)) {
    return 'error'
  }
  if (/\b(warn|warning|deprecated|retry|reconnecting|unhealthy|timeout)\b/i.test(text)) {
    return 'warn'
  }
  return ''
}

function stripAnsi(text) {
  return String(text || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

function ansiForTone(tone) {
  if (tone === 'error') return ['\x1b[91m', '\x1b[0m']
  if (tone === 'warn') return ['\x1b[93m', '\x1b[0m']
  return ['', '']
}

function formatForTerminal(data) {
  return String(data)
    .split(/(\r?\n)/)
    .map((part) => {
      if (/^\r?\n$/.test(part)) return part
      const tone = classifyLine(stripAnsi(part))
      const [open, close] = ansiForTone(tone)
      return tone ? `${open}${part}${close}` : part
    })
    .join('')
}

function collectImportant(data) {
  const parts = String(data).split(/(\r?\n)/)
  for (const part of parts) {
    if (/^\r?\n$/.test(part)) {
      const line = stripAnsi(pendingLine).trim()
      const tone = classifyLine(line)
      if (line && tone) {
        importantLines.value = [...importantLines.value, { tone, text: line, at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }].slice(-8)
      }
      pendingLine = ''
    } else {
      pendingLine += part
    }
  }
}

function writeLine(data, source = 'stdout') {
  if (!term || data == null) return
  const text = String(data)
  logBuffer += text
  collectImportant(text)
  if (text) hasLog.value = true
  if (props.mode === 'logs' && sourceFilter.value !== 'all' && source !== sourceFilter.value) {
    suppressedBuffer += text
    return
  }
  const rendered = formatForTerminal(text)
  if (paused.value) {
    pausedBuffer += rendered
    return
  }
  term.write(rendered.replace(/\r?\n/g, '\r\n'), () => {
    if (followLogs.value) term.scrollToBottom()
  })
}

function markOutput() {
  lastOutputAt = Date.now()
  noOutput.value = false
  if (status.value === 'waiting' || status.value === 'reconnecting') status.value = 'streaming'
}

function startIdleWatch() {
  stopIdleWatch()
  idleTimer = setInterval(() => {
    if (terminalReached) return
    if ((status.value === 'waiting' || status.value === 'streaming') && Date.now() - lastOutputAt > 30000) {
      noOutput.value = true
    }
  }, 5000)
}
function stopIdleWatch() {
  if (idleTimer) { clearInterval(idleTimer); idleTimer = null }
}

function detach() {
  if (ws) {
    ws.onmessage = null
    ws.onclose = null
    ws.onerror = null
    try { ws.close() } catch { /* already closing */ }
    ws = null
  }
}

function connect() {
  const path =
    props.mode === 'build'
      ? `/api/deploy/${props.slug}/build-log`
      : `/api/projects/${props.slug}/logs`

  status.value = reconnects > 0 ? 'reconnecting' : 'connecting'
  errMsg.value = ''
  lastOutputAt = Date.now()

  ws = openWs(path, {
    onOpen() {
      status.value = 'waiting'
      lastOutputAt = Date.now()
    },
    onMessage(msg) {
      if (typeof msg === 'string') { markOutput(); writeLine(msg); return }
      if (msg.type === 'log' || msg.type === 'output') {
        markOutput()
        writeLine(msg.data, msg.stream || 'stdout')
      } else if (msg.type === 'status') {
        writeLine(`\n[build ${msg.status}]\n`)
        if (msg.status === 'done' || msg.status === 'error') {
          terminalReached = true
          status.value = msg.status === 'done' ? 'ended' : 'error'
          emit('finished', msg.status)
        }
      } else if (msg.type === 'end') {
        terminalReached = true
        status.value = 'ended'
        writeLine('\n[stream ended]\n')
      } else if (msg.type === 'error') {
        terminalReached = true
        status.value = 'error'
        errMsg.value = msg.message || 'Stream error'
        writeLine(`\n[error] ${msg.message || ''}\n`)
      }
    },
    onClose() {
      if (terminalReached) return
      // Unexpected close. Build streams may still be running on the server, so
      // try to reconnect a few times before giving up.
      if (props.mode === 'build' && reconnects < 3) {
        reconnects += 1
        status.value = 'reconnecting'
        writeLine(`\n[reconnecting… attempt ${reconnects}]\n`)
        setTimeout(() => { if (!terminalReached) connect() }, 1000 * reconnects)
      } else {
        status.value = 'ended'
        if (reconnects > 0) writeLine('\n[stream interrupted — could not reconnect]\n')
      }
    },
    onError() {
      if (terminalReached) return
      if (status.value === 'connecting' || status.value === 'reconnecting') {
        errMsg.value = 'Connection failed'
      }
    }
  })
}

function reconnect() {
  detach()
  terminalReached = false
  reconnects = 0
  noOutput.value = false
  paused.value = false
  if (term) term.clear()
  logBuffer = ''
  pausedBuffer = ''
  suppressedBuffer = ''
  pendingLine = ''
  importantLines.value = []
  hasLog.value = false
  connect()
}

function togglePause() {
  paused.value = !paused.value
  if (!paused.value && pausedBuffer) {
    const text = pausedBuffer
    pausedBuffer = ''
    suppressedBuffer = ''
    if (term) term.write(text.replace(/\r?\n/g, '\r\n'), () => {
      if (followLogs.value) term.scrollToBottom()
    })
  }
}

function clearView() {
  if (term) term.clear()
}

async function copyLine(text) {
  if (!text || !navigator.clipboard) return
  try { await navigator.clipboard.writeText(text) } catch { /* clipboard unavailable */ }
}

function jumpLatest() {
  followLogs.value = true
  if (term) term.scrollToBottom()
}

async function copyAll() {
  if (!logBuffer || !navigator.clipboard) return
  try { await navigator.clipboard.writeText(logBuffer) } catch { /* clipboard unavailable */ }
}

function doFit() {
  try { fit && fit.fit() } catch { /* ignore fit errors when detached */ }
}

async function downloadLogs() {
  // Fetch with the bearer header (not a ?token= URL) so the token never lands in
  // browser history or server access logs, then save the blob.
  try {
    const res = await fetch(`/api/projects/${props.slug}/logs/download`, {
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {}
    })
    if (!res.ok) return
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.slug}-logs.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch { /* ignore */ }
}

onMounted(() => {
  term = new Terminal({
    convertEol: true,
    disableStdin: true,
    cursorBlink: false,
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    theme,
    scrollback: 5000,
    allowTransparency: true,
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(wrap.value)
  doFit()

  resizeObserver = new ResizeObserver(() => doFit())
  resizeObserver.observe(wrap.value)

  startIdleWatch()
  connect()
})

watch(
  () => props.slug,
  () => {
    detach()
    terminalReached = false
    reconnects = 0
    noOutput.value = false
    paused.value = false
    if (term) term.clear()
    logBuffer = ''
    pausedBuffer = ''
    pendingLine = ''
    importantLines.value = []
    hasLog.value = false
    connect()
  }
)

onBeforeUnmount(() => {
  detach()
  stopIdleWatch()
  if (resizeObserver) resizeObserver.disconnect()
  if (term) term.dispose()
})

defineExpose({ refit: doFit })
</script>

<template>
  <div class="stack">
    <div class="spread small muted">
      <span>{{ mode === 'build' ? 'Build log' : 'Live logs' }}</span>
      <div class="row" style="gap: 10px; align-items: center">
        <span class="lc-status"><span class="sdot" :class="statusTone"></span>{{ statusLabel }}</span>
        <button class="btn btn-sm btn-ghost" :aria-pressed="followLogs" @click="followLogs = !followLogs">{{ followLogs ? 'Following' : 'Follow logs' }}</button>
        <button v-if="!followLogs" class="btn btn-sm btn-ghost" @click="jumpLatest">Jump latest</button>
        <button class="btn btn-sm btn-ghost" @click="togglePause">{{ paused ? 'Resume' : 'Pause' }}</button>
        <button v-if="canReconnect" class="btn btn-sm btn-ghost" @click="reconnect">Reconnect</button>
        <button class="btn btn-sm btn-ghost" :disabled="!hasLog" @click="copyAll">Copy all</button>
        <button class="btn btn-sm btn-ghost" @click="clearView">Clear</button>
        <button
          v-if="mode === 'logs'"
          class="iconbtn"
          aria-label="Download logs"
          title="Download logs"
          @click="downloadLogs"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </button>
      </div>
    </div>
    <div class="log-tools">
      <label class="log-search">
        <span>Search</span>
        <input v-model="searchQuery" type="search" placeholder="Find in buffered logs" autocomplete="off" />
      </label>
      <label class="checkrow">
        <input v-model="wrapLines" type="checkbox" />
        <span>Wrap long lines</span>
      </label>
      <div v-if="mode === 'logs'" class="source-filter" aria-label="Log source filter">
        <button v-for="opt in sourceOptions" :key="opt.value" type="button" :class="{ active: sourceFilter === opt.value }" @click="sourceFilter = opt.value">{{ opt.label }}</button>
      </div>
      <span v-if="searchQuery.trim()" class="small muted">{{ searchMatches.length }} match{{ searchMatches.length === 1 ? '' : 'es' }} in buffer</span>
    </div>
    <div v-if="noOutput" class="hint" style="margin:0">
      No output for 30s — {{ mode === 'build' ? 'the worker may still be preparing the build.' : 'the container may be idle.' }}
    </div>
    <div v-if="paused" class="hint" style="margin:0">Paused locally. Incoming output is buffered and will appear when resumed.</div>
    <div v-if="sourceFilter !== 'all' && suppressedBuffer" class="hint" style="margin:0">Showing {{ sourceFilter }} only. Other log lines are still buffered for search, copy, and download.</div>
    <div v-if="importantLines.length" class="log-issues">
      <div class="issue-head">Detected issues</div>
      <div v-for="(line, i) in importantLines" :key="i" class="issue-line" :class="line.tone">
        <span class="issue-tone">{{ line.tone }}</span>
        <span class="issue-text">{{ line.text }}</span>
        <span class="issue-time">{{ line.at }}</span>
        <button class="btn btn-sm btn-ghost" @click="copyLine(line.text)">Copy</button>
      </div>
    </div>
    <div v-if="searchQuery.trim()" class="log-matches">
      <div v-if="searchMatches.length" class="match-list">
        <button
          v-for="match in searchMatches.slice(-6)"
          :key="match.index"
          class="match-line"
          type="button"
          @click="copyLine(match.line)"
        >
          <span class="mono">#{{ match.index + 1 }}</span>
          <span>{{ match.line }}</span>
        </button>
      </div>
      <div v-else class="hint" style="margin:0">No buffered log lines match that search.</div>
    </div>
    <div ref="wrap" class="term-wrap" :class="{ 'no-wrap': !wrapLines }"></div>
    <div v-if="errMsg" class="error-box">{{ errMsg }}</div>
  </div>
</template>

<style scoped>
.lc-status { display: inline-flex; align-items: center; gap: 7px; }
.lc-status .sdot { width: 7px; height: 7px; }
.log-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.log-search {
  flex: 1;
  min-width: min(100%, 260px);
  display: flex;
  align-items: center;
  gap: 10px;
}
.log-search span {
  color: var(--muted);
  font-size: 12px;
}
.log-search input {
  min-height: 36px;
}
.checkrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.checkrow input {
  width: 15px;
  height: 15px;
  accent-color: var(--text);
}
.source-filter {
  display: inline-flex;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.source-filter button {
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-right: 1px solid var(--border-soft);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}
.source-filter button:last-child { border-right: 0; }
.source-filter button.active {
  background: var(--bg-elevated);
  color: var(--text);
}
.log-issues,
.log-matches {
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.025);
  border-radius: var(--radius-sm);
  padding: 10px;
}
.issue-head {
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 8px;
}
.issue-line,
.match-line {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 7px 0;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.issue-line:first-of-type,
.match-line:first-child {
  border-top: 0;
}
.issue-tone {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0;
}
.issue-line.error .issue-tone { color: var(--danger); }
.issue-line.warn .issue-tone { color: var(--warn); }
.issue-text,
.match-line span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text);
}
.issue-time {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
}
.match-list {
  display: flex;
  flex-direction: column;
}
.match-line {
  width: 100%;
  grid-template-columns: auto minmax(0, 1fr);
  text-align: left;
  color: inherit;
  background: transparent;
  border-left: 0;
  border-right: 0;
  border-bottom: 0;
  cursor: pointer;
}
.match-line:hover span:last-child {
  color: var(--text-strong);
}
.term-wrap.no-wrap :deep(.xterm-rows span) {
  white-space: pre !important;
}
@media (max-width: 720px) {
  .issue-line {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .issue-line .btn {
    grid-column: 2 / -1;
    justify-self: start;
  }
}
</style>
