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
</script>

<template>
  <div class="shell">
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

      <main class="content-inner">
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
.su-name {
  display: block;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
