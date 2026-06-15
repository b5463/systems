<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import SystemsLogo from './SystemsLogo.vue'
import NavIcon from './NavIcon.vue'

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

const drawerOpen = ref(false)

const currentTitle = computed(() => {
  const match = nav.find((n) => n.name === route.name)
  if (match) return match.label
  // Identify which system on the detail page rather than a generic "System".
  if (route.name === 'system-detail') return route.params.slug || 'System'
  return 'SYSTEMS.'
})

const initial = computed(() => (auth.user?.username || '?').slice(0, 1).toUpperCase())

// Close the mobile drawer on any navigation.
watch(() => route.fullPath, () => { drawerOpen.value = false })
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
        <button class="iconbtn" aria-label="Open navigation" @click="drawerOpen = true">
          <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.9" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span class="mb-title">{{ currentTitle }}</span>
        <SystemsLogo size="sm" :byline="false" />
      </header>

      <main class="content-inner">
        <slot />
      </main>
    </div>

    <!-- Mobile drawer -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="drawerOpen" class="drawer-backdrop" @click="drawerOpen = false" />
      </Transition>
      <Transition name="drawer">
        <aside v-if="drawerOpen" class="drawer">
          <div class="sidebar-head">
            <SystemsLogo size="sm" />
            <button class="iconbtn" aria-label="Close navigation" @click="drawerOpen = false">
              <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.9" stroke-linecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav class="sidebar-nav">
            <RouterLink
              v-for="item in nav"
              :key="item.name"
              class="nav-link"
              :to="{ name: item.name }"
              @click="drawerOpen = false"
            >
              <NavIcon :name="item.icon" />
              <span class="nav-label">{{ item.label }}</span>
            </RouterLink>
          </nav>
          <div class="sidebar-foot">
            <div class="sidebar-user">
              <span class="avatar">{{ initial }}</span>
              <span>
                <span class="su-name">{{ auth.user?.username || 'admin' }}</span>
                <span class="small dim">Admin</span>
              </span>
            </div>
          </div>
        </aside>
      </Transition>
    </Teleport>
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
