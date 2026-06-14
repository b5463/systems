<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import TopBar from '../components/TopBar.vue'
import StatusBadge from '../components/StatusBadge.vue'
import PullToRefresh from '../components/PullToRefresh.vue'

const router = useRouter()
const projects = ref([])
const loading = ref(true)
const error = ref('')
const stats = ref({}) // slug -> stats

let timer = null

async function load(silent = false) {
  if (!silent) error.value = ''
  try {
    const data = await api.get('/projects')
    projects.value = data.projects || []
    // Fetch lightweight stats for running apps.
    const running = projects.value.filter((p) => p.status === 'running')
    await Promise.all(
      running.map(async (p) => {
        try {
          stats.value[p.slug] = await api.get(`/projects/${p.slug}/stats`)
        } catch {
          /* ignore per-app stats failure */
        }
      })
    )
  } catch (e) {
    if (e.status !== 401) error.value = e.message || 'Failed to load apps.'
  } finally {
    loading.value = false
  }
}

function tick() {
  if (document.visibilityState === 'visible') load(true)
}

function open(p) {
  router.push({ name: 'project-detail', params: { slug: p.slug } })
}

onMounted(async () => {
  await load()
  timer = setInterval(tick, 5000)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <TopBar title="Apps">
    <template #actions>
      <button class="iconbtn" aria-label="Refresh" @click="load()">⟳</button>
    </template>
  </TopBar>

  <PullToRefresh @refresh="load()">
    <div class="page">
      <div v-if="loading && !projects.length" class="center" style="padding: 48px">
        <div class="spinner"></div>
      </div>

      <div v-else-if="error" class="error-box">{{ error }}</div>

      <div v-else-if="!projects.length" class="empty">
        <div class="empty-ico">📦</div>
        <p>No apps yet.</p>
        <router-link class="btn btn-primary" :to="{ name: 'deploy' }">
          Deploy your first app
        </router-link>
      </div>

      <div v-else class="stack">
        <div
          v-for="p in projects"
          :key="p.id"
          class="card card-tap"
          @click="open(p)"
        >
          <div class="spread">
            <div style="min-width: 0">
              <div style="font-weight: 700; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                {{ p.name }}
              </div>
              <div class="mono dim small">/{{ p.slug }}</div>
            </div>
            <StatusBadge :status="p.status" />
          </div>

          <div
            v-if="p.status === 'running' && stats[p.slug]"
            class="row small muted"
            style="margin-top: 12px; gap: 18px"
          >
            <span>CPU {{ (stats[p.slug].cpu_percent ?? 0).toFixed(1) }}%</span>
            <span>RAM {{ (stats[p.slug].memory_mb ?? 0).toFixed(0) }} MB</span>
            <span v-if="p.port" class="mono">:{{ p.port }}</span>
          </div>
        </div>
      </div>
    </div>
  </PullToRefresh>
</template>
