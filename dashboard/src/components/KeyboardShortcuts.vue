<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const showHelp = ref(false)

let gPending = false
let gTimer = null

const NAV = { s: 'systems', h: 'ship', e: 'events', v: 'server', a: 'admin' }

function isTyping(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const typing = isTyping(document.activeElement)

  if (e.key === '?') { if (!typing) { e.preventDefault(); showHelp.value = !showHelp.value } return }
  if (e.key === 'Escape') { showHelp.value = false; gPending = false; return }
  if (typing) return // never hijack while typing

  if (gPending) {
    gPending = false
    clearTimeout(gTimer)
    const name = NAV[e.key.toLowerCase()]
    if (name) { e.preventDefault(); if (route.name !== name) router.push({ name }) }
    return
  }
  if (e.key === 'g') { gPending = true; clearTimeout(gTimer); gTimer = setTimeout(() => { gPending = false }, 1200); return }
  if (e.key === '/') {
    const s = document.querySelector('input[type="search"]')
    if (s) { e.preventDefault(); s.focus() }
    return
  }
  if (e.key === 'r') {
    const b = document.querySelector('[data-refresh]')
    if (b) { e.preventDefault(); b.click() }
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); clearTimeout(gTimer) })
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showHelp" class="modal-backdrop" @click.self="showHelp = false">
        <div class="modal stack" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" style="max-width:380px">
          <div class="spread"><h3 style="margin:0">Keyboard shortcuts</h3>
            <button class="iconbtn" aria-label="Close" @click="showHelp = false">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div class="ks-row"><span>Focus search</span><kbd>/</kbd></div>
          <div class="ks-row"><span>Refresh the list</span><kbd>r</kbd></div>
          <div class="ks-row"><span>Go to Systems</span><span><kbd>g</kbd> <kbd>s</kbd></span></div>
          <div class="ks-row"><span>Go to Ship</span><span><kbd>g</kbd> <kbd>h</kbd></span></div>
          <div class="ks-row"><span>Go to Events</span><span><kbd>g</kbd> <kbd>e</kbd></span></div>
          <div class="ks-row"><span>Go to Server</span><span><kbd>g</kbd> <kbd>v</kbd></span></div>
          <div class="ks-row"><span>Go to Admin</span><span><kbd>g</kbd> <kbd>a</kbd></span></div>
          <div class="ks-row"><span>Close dialogs</span><kbd>Esc</kbd></div>
          <div class="ks-row"><span>This help</span><kbd>?</kbd></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ks-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--text-muted);
  padding: 5px 0;
  border-bottom: 1px solid var(--border-soft);
}
.ks-row:last-child { border-bottom: none; }
kbd {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: var(--radius-xs);
  padding: 2px 6px;
  min-width: 18px;
  text-align: center;
}
</style>
