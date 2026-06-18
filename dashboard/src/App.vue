<script setup>
import { onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import AppShell from './components/AppShell.vue'
import Toast from './components/Toast.vue'

const auth = useAuthStore()
const route = useRoute()

// The product shell wraps every authenticated surface. Login renders bare.
const showShell = computed(() => auth.isAuthenticated && route.name !== 'login')

let refreshTimer = null
let lastRefresh = 0

// Refresh at most once a minute on window focus (avoids spamming /auth/refresh
// when alt-tabbing).
function onFocus() {
  if (auth.token && Date.now() - lastRefresh > 60 * 1000) {
    lastRefresh = Date.now()
    auth.refresh()
  }
}

onMounted(async () => {
  await auth.init()
  refreshTimer = setInterval(() => {
    if (auth.token && document.visibilityState === 'visible') { lastRefresh = Date.now(); auth.refresh() }
  }, 10 * 60 * 1000)
  window.addEventListener('focus', onFocus)
})

onBeforeUnmount(() => {
  clearInterval(refreshTimer)
  window.removeEventListener('focus', onFocus)
})
</script>

<template>
  <Toast />

  <template v-if="auth.ready">
    <AppShell v-if="showShell">
      <RouterView :key="route.fullPath" />
    </AppShell>
    <RouterView v-else />
  </template>

  <div v-else class="center" style="min-height: 100vh">
    <div class="spinner"></div>
  </div>
</template>
