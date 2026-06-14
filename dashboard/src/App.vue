<script setup>
import { onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import BottomNav from './components/BottomNav.vue'

const auth = useAuthStore()
const route = useRoute()

const showNav = computed(() => auth.isAuthenticated && route.name !== 'login')

let refreshTimer = null

function onFocus() {
  if (auth.token) auth.refresh()
}

onMounted(async () => {
  await auth.init()
  // Periodically refresh the token and on window focus.
  refreshTimer = setInterval(() => {
    if (auth.token && document.visibilityState === 'visible') auth.refresh()
  }, 10 * 60 * 1000)
  window.addEventListener('focus', onFocus)
})

onBeforeUnmount(() => {
  clearInterval(refreshTimer)
  window.removeEventListener('focus', onFocus)
})
</script>

<template>
  <div class="app-shell">
    <router-view v-if="auth.ready" />
    <div v-else class="center" style="min-height: 100vh">
      <div class="spinner"></div>
    </div>
    <BottomNav v-if="showNav" />
  </div>
</template>
