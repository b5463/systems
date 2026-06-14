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
    <div class="card">
      <div class="row" style="gap: 14px">
        <div
          class="center"
          style="
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: var(--accent-dim);
            color: var(--accent);
            font-size: 22px;
            font-weight: 700;
          "
        >
          {{ (auth.user?.username || '?').slice(0, 1).toUpperCase() }}
        </div>
        <div>
          <div style="font-weight: 700; font-size: 17px">
            {{ auth.user?.username || 'Unknown' }}
          </div>
          <div class="dim small">User ID: {{ auth.user?.id ?? '–' }}</div>
        </div>
      </div>
    </div>

    <button class="btn btn-danger btn-block" :disabled="loggingOut" @click="logout">
      <span v-if="loggingOut" class="spinner"></span><span v-else>Log out</span>
    </button>

    <p class="dim small center">Acronym Deploy · self-hosted deployment platform</p>
  </div>
</template>
