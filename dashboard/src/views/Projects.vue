<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import TopBar from '../components/TopBar.vue'
import StatusBadge from '../components/StatusBadge.vue'

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

/* ---- Status summary ---- */
const summary = computed(() => {
  const counts = { running: 0, stopped: 0, error: 0, building: 0 }
  for (const p of projects.value) {
    if (counts[p.status] !== undefined) counts[p.status]++
    else counts.stopped++
  }
  return [
    { key: 'running', count: counts.running, label: 'running', dot: 'dot-ok' },
    { key: 'building', count: counts.building, label: 'building', dot: 'dot-warn' },
    { key: 'stopped', count: counts.stopped, label: 'stopped', dot: 'dot-grey' },
    { key: 'error', count: counts.error, label: 'error', dot: 'dot-error' }
  ].filter((s) => s.count > 0)
})

const allRunning = computed(
  () =>
    projects.value.length > 0 &&
    projects.value.every((p) => p.status === 'running')
)

onMounted(async () => {
  await load()
  timer = setInterval(tick, 5000)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <TopBar title="Apps">
    <template #actions>
      <button class="iconbtn" aria-label="Refresh" @click="load()">
        <svg viewBox="0 0 24 24" stroke-width="1.75">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 4v5h-5" />
        </svg>
      </button>
    </template>
  </TopBar>

  <div class="page">
    <!-- Skeleton loading -->
    <div v-if="loading && !projects.length" class="stack">
      <div
        v-for="i in 3"
        :key="i"
        class="skel-card"
        :style="{ animationDelay: (i - 1) * 0.08 + 's' }"
      >
        <div class="spread">
          <div style="flex: 1">
            <div class="skel skel-title" style="width: 55%"></div>
            <div class="skel skel-line" style="width: 35%; margin-top: 8px"></div>
          </div>
          <div class="skel skel-badge"></div>
        </div>
        <div class="skel skel-line" style="width: 70%; margin-top: 14px"></div>
      </div>
    </div>

    <div v-else-if="error" class="error-box">{{ error }}</div>

    <!-- Empty state -->
    <div v-else-if="!projects.length" class="empty">
      <svg class="empty-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M3 20h18" />
      </svg>
      <p>No apps deployed yet.</p>
      <p class="empty-sub">Drop a ZIP to deploy your first app.</p>
      <router-link class="btn btn-primary" :to="{ name: 'deploy' }">
        Deploy your first app
      </router-link>
    </div>

    <div v-else class="stack">
      <!-- Status summary bar -->
      <div v-if="allRunning" class="stat-pill" style="align-self: flex-start">
        <span class="dot dot-ok"></span>
        <span class="lbl">All systems running</span>
      </div>
      <div v-else class="summary-bar">
        <div v-for="s in summary" :key="s.key" class="stat-pill">
          <span class="dot" :class="s.dot"></span>
          <span class="count">{{ s.count }}</span>
          <span class="lbl">{{ s.label }}</span>
        </div>
      </div>

      <!-- App cards -->
      <div
        v-for="p in projects"
        :key="p.id"
        class="card card-tap"
        @click="open(p)"
      >
        <div class="spread">
          <div style="min-width: 0; flex: 1">
            <div style="font-weight: 700; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
              {{ p.name }}
            </div>
            <div class="mono dim small">/{{ p.slug }}</div>
          </div>
          <StatusBadge :status="p.status" />
          <span class="chevron">
            <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
          </span>
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
</template>
