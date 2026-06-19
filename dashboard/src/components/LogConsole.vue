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

// Neutral, brand-aligned terminal palette (no cyan).
const theme = {
  background: '#000000',
  foreground: '#e6edf3',
  cursor: '#e6edf3',
  selectionBackground: 'rgba(255,255,255,0.18)'
}

function writeLine(data) {
  if (!term || data == null) return
  const text = String(data)
  logBuffer += text
  if (text) hasLog.value = true
  if (paused.value) {
    pausedBuffer += text
    return
  }
  term.write(text.replace(/\r?\n/g, '\r\n'))
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
        writeLine(msg.data)
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
  hasLog.value = false
  connect()
}

function togglePause() {
  paused.value = !paused.value
  if (!paused.value && pausedBuffer) {
    const text = pausedBuffer
    pausedBuffer = ''
    if (term) term.write(text.replace(/\r?\n/g, '\r\n'))
  }
}

function clearView() {
  if (term) term.clear()
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
    scrollback: 5000
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
    <div v-if="noOutput" class="hint" style="margin:0">
      No output for 30s — {{ mode === 'build' ? 'the worker may still be preparing the build.' : 'the container may be idle.' }}
    </div>
    <div v-if="paused" class="hint" style="margin:0">Paused locally. Incoming output is buffered and will appear when resumed.</div>
    <div ref="wrap" class="term-wrap"></div>
    <div v-if="errMsg" class="error-box">{{ errMsg }}</div>
  </div>
</template>

<style scoped>
.lc-status { display: inline-flex; align-items: center; gap: 7px; }
.lc-status .sdot { width: 7px; height: 7px; }
</style>
