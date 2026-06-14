<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
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
const status = ref('connecting') // connecting | streaming | ended | error
const errMsg = ref('')

let term = null
let fit = null
let ws = null
let resizeObserver = null

const theme = {
  background: '#000000',
  foreground: '#e6edf3',
  cursor: '#5fb0d4',
  selectionBackground: 'rgba(95,176,212,0.3)'
}

function writeLine(data) {
  if (!term || data == null) return
  // Normalise newlines to CRLF for xterm.
  term.write(String(data).replace(/\r?\n/g, '\r\n'))
}

function connect() {
  const path =
    props.mode === 'build'
      ? `/api/deploy/${props.slug}/build-log`
      : `/api/projects/${props.slug}/logs`

  status.value = 'connecting'
  errMsg.value = ''

  ws = openWs(path, {
    onOpen() {
      status.value = 'streaming'
    },
    onMessage(msg) {
      if (typeof msg === 'string') {
        writeLine(msg)
        return
      }
      if (msg.type === 'log' || msg.type === 'output') {
        writeLine(msg.data)
      } else if (msg.type === 'status') {
        writeLine(`\n[build ${msg.status}]\n`)
        if (msg.status === 'done' || msg.status === 'error') {
          status.value = msg.status === 'done' ? 'ended' : 'error'
          emit('finished', msg.status)
        }
      } else if (msg.type === 'end') {
        status.value = 'ended'
        writeLine('\n[stream ended]\n')
      } else if (msg.type === 'error') {
        status.value = 'error'
        errMsg.value = msg.message || 'Stream error'
        writeLine(`\n[error] ${msg.message || ''}\n`)
      }
    },
    onClose() {
      if (status.value === 'streaming') status.value = 'ended'
    },
    onError() {
      status.value = 'error'
      errMsg.value = 'Connection failed'
    }
  })
}

function doFit() {
  try {
    fit && fit.fit()
  } catch {
    /* ignore fit errors when detached */
  }
}

function downloadLogs() {
  const token = encodeURIComponent(auth.token || '')
  const url = `/api/projects/${props.slug}/logs/download?token=${token}`
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.slug}-logs.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
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

  connect()
})

watch(
  () => props.slug,
  () => {
    if (ws) ws.close()
    if (term) term.clear()
    connect()
  }
)

onBeforeUnmount(() => {
  if (ws) {
    ws.onmessage = null
    ws.close()
    ws = null
  }
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
        <span>{{ status }}</span>
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
    <div ref="wrap" class="term-wrap"></div>
    <div v-if="errMsg" class="error-box">{{ errMsg }}</div>
  </div>
</template>
