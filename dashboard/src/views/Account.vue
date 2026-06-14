<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import TopBar from '../components/TopBar.vue'

const auth = useAuthStore()
const router = useRouter()
const loggingOut = ref(false)

async function logout() {
  loggingOut.value = true
  await auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <TopBar title="Account" />

  <div class="page stack">
    <!-- Profile -->
    <div class="card">
      <div class="row" style="gap: 14px; margin-bottom: 16px">
        <div
          class="center"
          style="width: 52px; height: 52px; border-radius: 50%; background: var(--accent-dim); color: var(--accent); font-size: 22px; font-weight: 700; border: 1px solid rgba(45,212,191,0.2); flex-shrink: 0;"
        >
          {{ (auth.user?.username || '?').slice(0, 1).toUpperCase() }}
        </div>
        <div>
          <div style="font-weight: 700; font-size: 17px; letter-spacing: -0.01em">{{ auth.user?.username || 'Unknown' }}</div>
          <div class="small" style="color: var(--text-dim); margin-top: 2px">User ID {{ auth.user?.id ?? '–' }}</div>
        </div>
      </div>
      <div class="kv">
        <span class="k">Role</span>
        <span class="v">Admin</span>
      </div>
      <div class="kv">
        <span class="k">Platform</span>
        <span class="v mono small">acronym-deploy v1.0</span>
      </div>
    </div>

    <!-- Session -->
    <div class="card">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 12px">Session</div>
      <button class="btn btn-danger btn-block" :disabled="loggingOut" @click="logout">
        <span v-if="loggingOut" class="spinner"></span><span v-else>Sign out</span>
      </button>
    </div>
  </div>
</template>
