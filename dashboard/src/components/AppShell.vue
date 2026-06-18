<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import SystemsLogo from './SystemsLogo.vue'
import NavIcon from './NavIcon.vue'
import KeyboardShortcuts from './KeyboardShortcuts.vue'

const auth = useAuthStore()
const route = useRoute()

// Primary navigation — the five operational surfaces.
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
  // Identify which system on the detail page rather than a generic "System".
  if (route.name === 'system-detail') return route.params.slug || 'System'
  return 'SYSTEMS.'
})

const initial = computed(() => (auth.user?.username || '?').slice(0, 1).toUpperCase())

function openShortcuts() { window.dispatchEvent(new Event('app:shortcuts')) }
</script>

<template>
  <div class="shell">
    <a class="skip-link" href="#main-content">Skip to content</a>

    <!-- Desktop sidebar -->
    <aside class="sidebar">
      <div class="sidebar-head">
        <SystemsLogo size="sm" />
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
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        <button class="kbd-hint" @click="openShortcuts">Keyboard shortcuts <kbd>?</kbd></button>
        <RouterLink class="sidebar-user nav-link" :to="{ name: 'admin' }">
          <span class="avatar">{{ initial }}</span>
          <span style="min-width:0">
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
.skip-link:focus {
  left: 8px;
  top: 8px;
}
.content-inner:focus { outline: none; }
.su-name {
  display: block;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kbd-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-dim);
  font-size: 11.5px;
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: var(--radius-xs);
}
.kbd-hint:hover { color: var(--text-muted); background: var(--bg-hover); }
.kbd-hint kbd {
  font-family: var(--mono);
  font-size: 10px;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 3px;
  padding: 1px 5px;
  color: var(--text-muted);
}
</style>
