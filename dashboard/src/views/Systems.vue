<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge.vue'
import { useToast } from '../composables/useToast'

const router = useRouter()
const { showToast } = useToast()

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'acronym.sk'

const systems = ref([])
const loading = ref(true)
const error = ref('')
const stats = ref({})
const prevStatuses = ref({})
let timer = null

async function load(silent = false) {
  if (!silent) error.value = ''
  try {
    const data = await api.get('/projects')
    systems.value = data.projects || []

    for (const s of systems.value) {
      const prev = prevStatuses.value[s.slug]
      if (prev === 'running' && (s.status === 'error' || s.status === 'stopped')) {
        showToast(`${s.name} stopped unexpectedly`, 'error')
      }
      prevStatuses.value[s.slug] = s.status
    }

    const running = systems.value.filter((s) => s.status === 'running')
    await Promise.all(
      running.map(async (s) => {
        try {
          stats.value[s.slug] = await api.get(`/projects/${s.slug}/stats`)
        } catch { /* per-system stats are best-effort */ }
      })
    )
  } catch (e) {
    if (e.status !== 401) error.value = e.message || 'Failed to load systems.'
  } finally {
    loading.value = false
  }
}

function tick() {
  if (document.visibilityState === 'visible') load(true)
}

function open(s) {
  router.push({ name: 'system-detail', params: { slug: s.slug } })
}

const counts = computed(() => {
  const c = { live: 0, building: 0, stopped: 0, failed: 0 }
  for (const s of systems.value) {
    if (s.status === 'running') c.live++
    else if (s.status === 'building') c.building++
    else if (s.status === 'error') c.failed++
    else c.stopped++
  }
  return c
})

const snapshot = computed(() => [
  { label: 'Live', value: counts.value.live, tone: counts.value.live ? 'ok' : 'dim' },
  { label: 'Building', value: counts.value.building, tone: counts.value.building ? 'warn' : 'dim' },
  { label: 'Stopped', value: counts.value.stopped, tone: 'dim' },
  { label: 'Failed', value: counts.value.failed, tone: counts.value.failed ? 'error' : 'dim' }
])

const needsAttention = computed(() =>
  systems.value.filter((s) => s.status === 'error' || s.status === 'stopped')
)

const latest = computed(() => {
  if (!systems.value.length) return null
  return [...systems.value].sort(
    (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
  )[0]
})

function hostFor(slug) {
  return `${slug}.${BASE_DOMAIN}`
}

function fmtAgo(s) {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

onMounted(async () => {
  await load()
  timer = setInterval(tick, 5000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="page-head">
    <h1>Systems</h1>
    <div class="head-actions">
      <button class="btn btn-sm btn-ghost" @click="load()">Refresh</button>
      <RouterLink class="btn btn-sm btn-primary" :to="{ name: 'ship' }">Ship a system</RouterLink>
    </div>
  </div>

  <!-- Server snapshot -->
  <div class="grid grid-4" style="margin-bottom: 22px">
    <div v-for="m in snapshot" :key="m.label" class="metric">
      <div class="m-label">{{ m.label }}</div>
      <div class="m-value tnum" :class="{ dim: m.tone === 'dim' && !m.value }">
        <template v-if="loading">—</template>
        <template v-else>{{ m.value }}</template>
      </div>
    </div>
  </div>

  <!-- Skeleton -->
  <div v-if="loading && !systems.length" class="grid grid-auto">
    <div v-for="i in 3" :key="i" class="skel-card" :style="{ animationDelay: (i - 1) * 0.08 + 's' }">
      <div class="spread">
        <div style="flex:1"><div class="skel skel-title" style="width:55%"></div></div>
        <div class="skel skel-badge"></div>
      </div>
      <div class="skel skel-line" style="width:70%;margin-top:14px"></div>
    </div>
  </div>

  <div v-else-if="error" class="error-box">{{ error }}</div>

  <!-- Honest empty state -->
  <div v-else-if="!systems.length" class="empty-block">
    <div class="eb-title">No systems yet.</div>
    <div class="eb-sub">Ship a <span class="mono">.zip</span> to deploy one at <span class="mono">slug.{{ BASE_DOMAIN }}</span>.</div>
    <div class="eb-actions">
      <RouterLink class="btn btn-primary" :to="{ name: 'ship' }">Ship a system</RouterLink>
    </div>
  </div>

  <template v-else>
    <!-- Needs attention -->
    <template v-if="needsAttention.length">
      <div class="section-label">Needs attention</div>
      <div class="callout danger" style="margin-bottom: 22px">
        <div class="co-bar"></div>
        <div>
          {{ needsAttention.length }}
          system{{ needsAttention.length === 1 ? '' : 's' }} not live —
          <template v-for="(s, i) in needsAttention" :key="s.slug">
            <a href="#" @click.prevent="open(s)">{{ s.name }}</a><span v-if="i < needsAttention.length - 1">, </span>
          </template>
        </div>
      </div>
    </template>

    <!-- Latest deploy -->
    <template v-if="latest">
      <div class="section-label">Latest deploy</div>
      <div class="card card-tap" style="margin-bottom: 22px" @click="open(latest)">
        <div class="spread">
          <div style="min-width:0">
            <div class="sc-name">{{ latest.name }}</div>
            <div class="mono small dim">{{ hostFor(latest.slug) }}</div>
          </div>
          <div class="row gap-sm">
            <span class="small muted">{{ fmtAgo(latest.updated_at || latest.created_at) }}</span>
            <StatusBadge :status="latest.status" />
          </div>
        </div>
      </div>
    </template>

    <!-- All systems -->
    <div class="section-label">All systems · {{ systems.length }}</div>
    <div class="grid grid-auto">
      <div
        v-for="s in systems"
        :key="s.id"
        class="card card-tap sys-card"
        @click="open(s)"
      >
        <div class="sc-top">
          <div style="min-width:0">
            <div class="sc-name">{{ s.name }}</div>
            <div class="sc-host mono">{{ hostFor(s.slug) }}</div>
          </div>
          <StatusBadge :status="s.status" />
        </div>
        <div v-if="s.status === 'running' && stats[s.slug]" class="sc-meta">
          <span>CPU {{ (stats[s.slug].cpu_percent ?? 0).toFixed(1) }}%</span>
          <span>RAM {{ (stats[s.slug].memory_mb ?? 0).toFixed(0) }} MB</span>
          <span v-if="s.port" class="mono">:{{ s.port }}</span>
        </div>
        <div v-else class="sc-meta dim">
          <span v-if="s.status === 'building'">Building…</span>
          <span v-else-if="s.status === 'error'">Last deploy failed</span>
          <span v-else>Not running</span>
        </div>
      </div>
    </div>
  </template>
</template>
