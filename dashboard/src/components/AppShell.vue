<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { api } from '../api/client'
import { BASE_DOMAIN } from '../config'
import SystemsLogo from './SystemsLogo.vue'
import NavIcon from './NavIcon.vue'
import KeyboardShortcuts from './KeyboardShortcuts.vue'

const auth = useAuthStore()
const route = useRoute()

const nav = [
  { name: 'systems', label: 'Systems', icon: 'systems' },
  { name: 'ship', label: 'Ship', icon: 'ship' },
  { name: 'events', label: 'Events', icon: 'events' },
  { name: 'server', label: 'Server', icon: 'server' },
  { name: 'admin', label: 'Admin', icon: 'admin' }
]

const currentTitle = computed(() => {
  const match = nav.find((n) => n.name === route.name)
  if (match) return match.label
  if (route.name === 'system-detail') return route.params.slug || 'System'
  return 'SYSTEMS.'
})

const initial = computed(() => (auth.user?.username || '?').slice(0, 1).toUpperCase())

function openShortcuts() { window.dispatchEvent(new Event('app:shortcuts')) }

/* Sidebar collapse — persisted in localStorage */
const sidebarCollapsed = ref(false)
onMounted(() => {
  sidebarCollapsed.value = localStorage.getItem('sb-col') === '1'
  loadHealth()
})
watch(sidebarCollapsed, v => localStorage.setItem('sb-col', v ? '1' : ''))
function toggleSidebar() { sidebarCollapsed.value = !sidebarCollapsed.value }

/* Server health — best-effort indicator for Server nav item */
const health = ref('idle')
async function loadHealth() {
  try {
    const info = await api.get('/server/info')
    if (info?.docker?.status === 'unavailable' || info?.caddy?.status === 'unavailable') {
      health.value = 'error'
    } else if (info?.disk?.status === 'measured' && info.disk.usedPct >= 75) {
      health.value = 'warn'
    } else if (info?.docker?.status === 'connected') {
      health.value = 'ok'
    }
  } catch { /* best-effort — no error surfaced for non-critical indicator */ }
}
</script>

<template>
  <div class="shell" :class="{ 'sb-collapsed': sidebarCollapsed }">
    <a class="skip-link" href="#main-content">Skip to content</a>

    <!-- Desktop sidebar -->
    <aside class="sidebar">
      <div class="sidebar-head">
        <SystemsLogo size="sm" />
        <button
          class="sidebar-collapse-btn"
          :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          @click="toggleSidebar"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path :d="sidebarCollapsed ? 'M7 5l6 5-6 5' : 'M13 5l-6 5 6 5'" />
          </svg>
        </button>
      </div>

      <!-- Active domain label -->
      <div class="sidebar-env" aria-label="Active domain">
        <span class="sdot sidebar-env-dot" :class="health"></span>
        <span class="mono">{{ BASE_DOMAIN }}</span>
      </div>

      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in nav"
          :key="item.name"
          class="nav-link"
          :to="{ name: item.name }"
        >
          <NavIcon :name="item.icon" />
          <span class="nav-label">{{ item.label }}</span>
          <span
            v-if="item.name === 'server' && health !== 'idle'"
            class="nav-health sdot"
            :class="health"
            :aria-label="`Server: ${health}`"
          ></span>
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        <button class="kbd-hint" @click="openShortcuts">
          <span class="kb-text">Open shortcuts</span>
          <kbd>?</kbd>
        </button>
        <RouterLink class="sidebar-user nav-link" :to="{ name: 'admin' }">
          <span class="avatar">{{ initial }}</span>
          <span class="su-info">
            <span class="su-name">{{ auth.user?.username || 'admin' }}</span>
            <span class="small dim">Admin</span>
          </span>
        </RouterLink>
      </div>
    </aside>

    <!-- Content column -->
    <div class="content">
      <header class="mobile-bar">
        <span class="mb-title">{{ currentTitle }}</span>
        <SystemsLogo size="sm" :byline="false" />
      </header>

      <main id="main-content" class="content-inner" tabindex="-1">
        <slot />
      </main>
    </div>

    <!-- Mobile bottom tab bar -->
    <nav class="bottom-nav">
      <RouterLink
        v-for="item in nav"
        :key="item.name"
        class="bn-tab"
        :to="{ name: item.name }"
        :aria-label="item.label"
      >
        <NavIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <KeyboardShortcuts />
  </div>
</template>

<style scoped>
/* Keyboard skip link — visually hidden until focused, then pinned top-left. */
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 100;
  padding: 8px 14px;
  background: var(--bg-hover);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
}
.skip-link:focus { left: 8px; top: 8px; }
.content-inner:focus { outline: none; }

.su-name {
  display: block;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.su-info { min-width: 0; overflow: hidden; }

.sidebar-foot {
  border-top: 1px solid var(--border-soft);
  padding-top: 8px;
}
.kbd-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: var(--radius-xs);
}
.kbd-hint:hover { color: var(--text); background: var(--bg-hover); }
.kbd-hint kbd {
  font-family: var(--mono);
  font-size: 10px;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 3px;
  padding: 1px 5px;
  color: var(--text-muted);
}

/* Collapse toggle button */
.sidebar-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-xs);
  background: none;
  border: 1px solid transparent;
  color: var(--text-dim);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}
.sidebar-collapse-btn:hover { background: var(--bg-hover); color: var(--text); border-color: var(--border-soft); }
.sidebar-collapse-btn svg { width: 14px; height: 14px; }

/* Active domain env label */
.sidebar-env {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 18px 8px;
  font-size: 11px;
  color: var(--text-dim);
  letter-spacing: 0.02em;
  overflow: hidden;
  white-space: nowrap;
}
.sidebar-env-dot { width: 6px; height: 6px; flex-shrink: 0; }

/* Health dot on server nav item */
.nav-link { position: relative; }
.nav-health { margin-left: auto; width: 7px; height: 7px; }

/* ------------------------------------------------------------------ */
/* Collapsed state                                                       */
/* ------------------------------------------------------------------ */
.sidebar { transition: width 0.22s ease; overflow: hidden; }
.content { transition: margin-left 0.22s ease; }

.shell.sb-collapsed .sidebar { width: var(--sidebar-collapsed); }
.shell.sb-collapsed .content { margin-left: var(--sidebar-collapsed); }

/* Logo: hide byline and scale down mark */
.shell.sb-collapsed .sidebar-head :deep(.lockup .by) { display: none; }
.shell.sb-collapsed .sidebar-head :deep(.lockup .mark) { font-size: 14px; letter-spacing: -0.02em; }

/* Nav: icon-only, centered */
.shell.sb-collapsed .nav-label { display: none; }
.shell.sb-collapsed .nav-link { justify-content: center; padding: 9px 0; }
.shell.sb-collapsed .nav-health { position: absolute; top: 5px; right: 5px; margin: 0; }

/* Domain label: hidden */
.shell.sb-collapsed .sidebar-env { display: none; }

/* Footer: centred avatar, hide text */
.shell.sb-collapsed .su-info { display: none; }
.shell.sb-collapsed .sidebar-user { justify-content: center; }
.shell.sb-collapsed .kb-text { display: none; }
.shell.sb-collapsed .kbd-hint { justify-content: center; padding: 6px 4px; }
</style>
