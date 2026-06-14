<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { openWs } from '../api/ws'

const props = defineProps({
  slug: { type: String, required: true }
})

const wrap = ref(null)
const status = ref('connecting') // connecting | connected | ended | error
const errMsg = ref('')

let term = null
let fit = null
let ws = null
let resizeObserver = null

const theme = {
  background: '#000000',
  foreground: '#e6edf3',
  cursor: '#2dd4bf',
  selectionBackground: 'rgba(45,212,191,0.3)'
}

function doFit() {
  try {
    fit && fit.fit()
  } catch {
    /* ignore */
  }
}

function sendResize() {
  if (!term || !ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
}

function connect() {
  status.value = 'connecting'
  errMsg.value = ''

  ws = openWs(`/api/projects/${props.slug}/exec`, {
    onOpen() {
      status.value = 'connected'
      term && term.focus()
      // Fit + send the current terminal size once the session is live.
      doFit()
      sendResize()
    },
    onMessage(msg) {
      if (typeof msg === 'string') {
        term && term.write(msg)
        return
      }
      if (msg.type === 'output') {
        term && term.write(msg.data)
      } else if (msg.type === 'end') {
        status.value = 'ended'
        term && term.write('\r\n[session ended]\r\n')
      } else if (msg.type === 'error') {
        status.value = 'error'
        errMsg.value = msg.message || 'Exec error'
        term && term.write(`\r\n[error] ${msg.message || ''}\r\n`)
      }
    },
    onClose() {
      if (status.value === 'connected') status.value = 'ended'
    },
    onError() {
      status.value = 'error'
      errMsg.value = 'Connection failed'
    }
  })
}

onMounted(() => {
  term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    theme,
    scrollback: 5000
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(wrap.value)
  doFit()

  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }))
    }
  })

  // When xterm reflows to a new size, tell the backend to resize the TTY.
  term.onResize(() => sendResize())

  resizeObserver = new ResizeObserver(() => doFit())
  resizeObserver.observe(wrap.value)

  connect()
})

onBeforeUnmount(() => {
  if (ws) {
    ws.onmessage = null
    ws.close()
    ws = null
  }
  if (resizeObserver) resizeObserver.disconnect()
  if (term) term.dispose()
})
</script>

<template>
  <div class="stack">
    <div class="spread small muted">
      <span>Interactive shell</span>
      <span>{{ status }}</span>
    </div>
    <div ref="wrap" class="term-wrap" @click="term && term.focus()"></div>
    <div v-if="errMsg" class="error-box">{{ errMsg }}</div>
  </div>
</template>
