<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'

const router = useRouter()

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputEl = ref(null)
const listEl = ref(null)
const systems = ref([])
let lastFocused = null

// Static commands: navigation + page actions. System entries are appended live.
const baseCommands = [
  { id: 'nav-systems', label: 'Go to Systems', group: 'Navigate', hint: 'g s', run: () => go('systems') },
  { id: 'nav-ship', label: 'Go to Ship', group: 'Navigate', hint: 'g h', run: () => go('ship') },
  { id: 'nav-events', label: 'Go to Events', group: 'Navigate', hint: 'g e', run: () => go('events') },
  { id: 'nav-server', label: 'Go to Server', group: 'Navigate', hint: 'g v', run: () => go('server') },
  { id: 'nav-admin', label: 'Go to Admin', group: 'Navigate', hint: 'g a', run: () => go('admin') },
  { id: 'act-ship', label: 'Ship a new system', group: 'Actions', run: () => go('ship') },
  { id: 'act-refresh', label: 'Refresh current page', group: 'Actions', hint: 'r', run: () => clickRefresh() },
  { id: 'act-sidebar', label: 'Toggle sidebar', group: 'Actions', run: () => dispatch('app:toggle-sidebar') },
  { id: 'act-density', label: 'Toggle compact density', group: 'Actions', run: () => dispatch('app:toggle-density') },
  { id: 'act-shortcuts', label: 'Keyboard shortcuts', group: 'Actions', hint: '?', run: () => dispatch('app:shortcuts') },
]

const systemCommands = computed(() =>
  systems.value.map((s) => ({
    id: `sys-${s.slug}`,
    label: `Open ${s.name}`,
    sub: s.slug,
    group: 'Systems',
    run: () => router.push({ name: 'system-detail', params: { slug: s.slug } }),
  }))
)

const allCommands = computed(() => [...baseCommands, ...systemCommands.value])

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allCommands.value
  return allCommands.value.filter((c) =>
    c.label.toLowerCase().includes(q) || (c.sub || '').toLowerCase().includes(q)
  )
})

// Group filtered results in stable order for rendering.
const grouped = computed(() => {
  const order = ['Navigate', 'Actions', 'Systems']
  const flat = filtered.value
  return order
    .map((g) => ({ group: g, items: flat.filter((c) => c.group === g) }))
    .filter((g) => g.items.length)
})

// A flat index across groups for arrow-key navigation.
const flatList = computed(() => grouped.value.flatMap((g) => g.items))

function go(name) { router.push({ name }) }
function clickRefresh() { document.querySelector('[data-refresh]')?.click() }
function dispatch(evt) { window.dispatchEvent(new Event(evt)) }

async function show() {
  lastFocused = document.activeElement
  open.value = true
  query.value = ''
  activeIndex.value = 0
  // Best-effort: load systems so "Open <name>" is available.
  api.get('/projects').then((d) => { systems.value = (d.projects || []).filter((s) => s.status !== 'deleted') }).catch(() => {})
  await nextTick()
  inputEl.value?.focus()
}
function hide() {
  open.value = false
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus()
  lastFocused = null
}
function toggle() { open.value ? hide() : show() }

function runActive() {
  const cmd = flatList.value[activeIndex.value]
  if (!cmd) return
  hide()
  cmd.run()
}
function runCmd(cmd) { hide(); cmd.run() }

function move(delta) {
  const n = flatList.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
  nextTick(() => {
    listEl.value?.querySelector('.cmd-opt.is-active')?.scrollIntoView({ block: 'nearest' })
  })
}

function onInputKey(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
  else if (e.key === 'Enter') { e.preventDefault(); runActive() }
  else if (e.key === 'Escape') { e.preventDefault(); hide() }
}

// Reset the active row whenever the result set changes.
function onQuery() { activeIndex.value = 0 }

function onGlobalKey(e) {
  // Cmd/Ctrl+K opens the palette from anywhere.
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    toggle()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKey)
  window.addEventListener('app:command-palette', show)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey)
  window.removeEventListener('app:command-palette', show)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="cmd-backdrop" @click.self="hide">
        <div class="cmd-panel" role="dialog" aria-modal="true" aria-label="Command palette">
          <input
            ref="inputEl"
            v-model="query"
            class="cmd-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            placeholder="Search commands and systems…"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            @input="onQuery"
            @keydown="onInputKey"
          />
          <ul v-if="flatList.length" id="cmd-list" ref="listEl" class="cmd-list" role="listbox">
            <template v-for="g in grouped" :key="g.group">
              <li class="cmd-group" aria-hidden="true">{{ g.group }}</li>
              <li
                v-for="cmd in g.items"
                :key="cmd.id"
                class="cmd-opt"
                :class="{ 'is-active': flatList[activeIndex] && flatList[activeIndex].id === cmd.id }"
                role="option"
                :aria-selected="flatList[activeIndex] && flatList[activeIndex].id === cmd.id"
                @mouseenter="activeIndex = flatList.findIndex((c) => c.id === cmd.id)"
                @click="runCmd(cmd)"
              >
                <span class="cmd-label">{{ cmd.label }}<span v-if="cmd.sub" class="cmd-sub mono">{{ cmd.sub }}</span></span>
                <kbd v-if="cmd.hint" class="cmd-hint">{{ cmd.hint }}</kbd>
              </li>
            </template>
          </ul>
          <div v-else class="cmd-empty">No matching commands.</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cmd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 24px 24px;
}
.cmd-panel {
  width: 100%;
  max-width: 540px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.cmd-input {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--border-soft);
  border-radius: 0;
  background: transparent;
  padding: 16px 18px;
  font-size: 15px;
  color: var(--text);
}
.cmd-input:focus { outline: none; box-shadow: none; }
.cmd-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: 50vh;
  overflow-y: auto;
}
.cmd-group {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-dim);
  font-weight: 700;
  padding: 10px 10px 4px;
}
.cmd-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  color: var(--text-muted);
}
.cmd-opt.is-active { background: var(--bg-hover); color: var(--text); }
.cmd-label { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.cmd-sub { font-size: 12px; color: var(--text-dim); }
.cmd-hint {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 3px;
  padding: 1px 5px;
  flex-shrink: 0;
}
.cmd-empty { padding: 22px; text-align: center; color: var(--text-muted); font-size: 13px; }
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active, .fade-leave-active { transition: none; }
}
</style>
