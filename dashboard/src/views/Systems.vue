<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge.vue'
import SelectMenu from '../components/SelectMenu.vue'
import { useToast } from '../composables/useToast'
import { BASE_DOMAIN, hostFor, urlFor } from '../config'
import { fmtAgo } from '../utils/date'
import { isCrashed } from '../utils/status'

const router = useRouter()
const { showToast } = useToast()

const systems = ref([])
const loading = ref(true)
const refreshing = ref(false)
const loadedAt = ref(null)
const error = ref('')
const stats = ref({})
const server = ref(null)
const prevStatuses = ref({})
let timer = null
let loading_inflight = false

async function load(silent = false) {
  // Skip overlapping runs: a slow stats fan-out shouldn't let 5s ticks stack up.
  if (loading_inflight) return
  loading_inflight = true
  if (!silent) { error.value = ''; refreshing.value = true }
  try {
    const data = await api.get('/projects')
    systems.value = data.projects || []
    loadedAt.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    for (const s of systems.value) {
      const prev = prevStatuses.value[s.slug]
      // Only alert on a genuine crash (running → error); a running → stopped
      // transition is usually a deliberate Stop, so don't cry wolf.
      if (prev === 'running' && s.status === 'error') {
        showToast(`${s.name} crashed`, 'error')
      }
      prevStatuses.value[s.slug] = s.status
    }
    const running = systems.value.filter((s) => s.status === 'running')
    await Promise.all(running.map(async (s) => {
      try { stats.value[s.slug] = await api.get(`/projects/${s.slug}/stats`) } catch { /* best-effort */ }
    }))
  } catch (e) {
    if (e.status !== 401) error.value = e.message || 'Failed to load systems.'
  } finally {
    loading_inflight = false
    loading.value = false
    refreshing.value = false
  }
}

async function loadServer() {
  try { server.value = await api.get('/server/info') } catch { /* best-effort */ }
}

function tick() { if (document.visibilityState === 'visible') load(true) }
function open(s) { router.push({ name: 'system-detail', params: { slug: s.slug } }) }

const active = computed(() => systems.value.filter((s) => s.status !== 'deleted'))
const deleted = computed(() => systems.value.filter((s) => s.status === 'deleted'))

// Search + sort for the "All systems" grid (shown once the list grows).
const query = ref('')
const sortBy = ref('recent')
const sortOptions = [
  { value: 'recent', label: 'Recent' },
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
]
const STATUS_RANK = { error: 0, building: 1, stopped: 2, running: 3 }
const visibleSystems = computed(() => {
  const q = query.value.trim().toLowerCase()
  let list = active.value
  if (q) list = list.filter((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q))
  const arr = [...list]
  if (sortBy.value === 'name') arr.sort((a, b) => a.name.localeCompare(b.name))
  else if (sortBy.value === 'status') arr.sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9))
  else arr.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
  return arr
})

const counts = computed(() => {
  const c = { live: 0, building: 0, stopped: 0, failed: 0 }
  for (const s of active.value) {
    if (s.status === 'running') c.live++
    else if (s.status === 'building') c.building++
    else if (s.status === 'error') c.failed++
    else c.stopped++
  }
  return c
})

const needsAttention = computed(() => active.value.filter((s) => s.status === 'error' || s.status === 'stopped'))

const latest = computed(() => {
  if (!active.value.length) return null
  return [...active.value].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))[0]
})

// Honest server mini-status line.
function statusLabel(s) {
  switch (s) {
    case 'connected': return 'connected'
    case 'unavailable': return 'not connected'
    case 'host_validation': return 'not verified yet'
    case 'planned': return 'planned'
    default: return 'not measured'
  }
}
function statusTone(s) { return s === 'connected' ? 'ok' : s === 'unavailable' ? 'error' : 'idle' }

onMounted(async () => {
  await Promise.all([load(), loadServer()])
  timer = setInterval(tick, 5000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Systems</h1>
      <div v-if="!loading && active.length" class="watching">
        Watching {{ active.length }} system{{ active.length === 1 ? '' : 's' }} —
        <span class="ok">{{ counts.live }} live</span> ·
        <span :class="{ warn: counts.building }">{{ counts.building }} building</span> ·
        <span>{{ counts.stopped }} stopped</span> ·
        <span :class="{ err: counts.failed }">{{ counts.failed }} failed</span>
      </div>
    </div>
    <div class="head-actions">
      <span v-if="loadedAt && (active.length || deleted.length)" class="small dim" style="align-self:center">Updated {{ loadedAt }}</span>
      <button class="btn btn-sm btn-ghost" data-refresh :disabled="refreshing" @click="load()">
        <span v-if="refreshing" class="spinner"></span><span v-else>Refresh</span>
      </button>
      <RouterLink v-if="active.length || deleted.length" class="btn btn-sm btn-primary" :to="{ name: 'ship' }">Ship a system</RouterLink>
    </div>
  </div>

  <!-- Skeleton -->
  <div v-if="loading && !systems.length" class="grid grid-auto">
    <div v-for="i in 3" :key="i" class="skel-card" :style="{ animationDelay: (i - 1) * 0.08 + 's' }">
      <div class="spread"><div style="flex:1"><div class="skel skel-title" style="width:55%"></div></div><div class="skel skel-badge"></div></div>
      <div class="skel skel-line" style="width:70%;margin-top:14px"></div>
    </div>
  </div>

  <div v-else-if="error" class="error-box">{{ error }}</div>

  <!-- Empty -->
  <div v-else-if="!active.length && !deleted.length" class="empty-block">
    <div class="eb-title">Deploy your first system</div>
    <div class="eb-sub">
      Upload a ZIP containing a static, Vue/Vite, Node.js or Dockerfile project. SYSTEMS. validates the deployment plan before publishing it at <span class="mono">slug.{{ BASE_DOMAIN }}</span> over HTTPS.
    </div>
    <div class="eb-actions"><RouterLink class="btn btn-primary" :to="{ name: 'ship' }">Prepare deployment</RouterLink></div>
  </div>

  <template v-else>
    <!-- Needs attention -->
    <template v-if="needsAttention.length">
      <div class="section-label">Needs attention</div>
      <div class="callout danger" style="margin-bottom: 20px">
        <div class="co-bar"></div>
        <div>
          {{ needsAttention.length }} system{{ needsAttention.length === 1 ? '' : 's' }} not live —
          <template v-for="(s, i) in needsAttention" :key="s.slug"><a href="#" @click.prevent="open(s)">{{ s.name }}</a>{{ i < needsAttention.length - 1 ? ', ' : '' }}</template>
        </div>
      </div>
    </template>

    <!-- Latest deploy + server mini-status, side by side on desktop -->
    <div class="grid grid-2" style="margin-bottom: 22px; align-items:stretch">
      <div v-if="latest" class="card card-tap" role="button" tabindex="0" @click="open(latest)" @keydown.enter="open(latest)" @keydown.space.prevent="open(latest)">
        <div class="section-label">Latest deploy</div>
        <div class="spread">
          <div style="min-width:0"><div class="sc-name">{{ latest.name }}</div><div class="mono small dim">{{ hostFor(latest.slug) }}</div></div>
          <div class="row gap-sm"><span class="small muted">{{ fmtAgo(latest.updated_at || latest.created_at) }}</span><StatusBadge :status="latest.status" :crashed="isCrashed(latest)" /></div>
        </div>
      </div>
      <div class="card">
        <div class="section-label">Server</div>
        <div v-if="server" class="server-mini">
          <span><span class="sdot" :class="statusTone(server.docker.status)"></span>Docker {{ statusLabel(server.docker.status) }}</span>
          <span><span class="sdot" :class="statusTone(server.caddy.status)"></span>Caddy {{ statusLabel(server.caddy.status) }}</span>
          <span><span class="sdot" :class="statusTone(server.postgres.status)"></span>Postgres {{ statusLabel(server.postgres.status) }}</span>
          <RouterLink class="small" :to="{ name: 'server' }">Details →</RouterLink>
        </div>
        <div v-else class="muted small">Server status unavailable.</div>
      </div>
    </div>

    <!-- All systems -->
    <div class="spread" style="margin-bottom:10px; gap:10px; flex-wrap:wrap">
      <div class="section-label" style="margin:0">All systems · {{ active.length }}</div>
      <div v-if="active.length > 4" class="row gap-sm" style="flex-wrap:wrap">
        <input v-model="query" class="sys-search" type="search" placeholder="Search name or slug" aria-label="Search systems" autocapitalize="none" autocorrect="off" />
        <SelectMenu v-model="sortBy" :options="sortOptions" placeholder="Sort" style="width:140px" />
      </div>
    </div>
    <div v-if="!visibleSystems.length" class="muted small" style="margin-bottom:18px">No systems match “{{ query }}”.</div>
    <div class="grid grid-auto">
      <div v-for="s in visibleSystems" :key="s.id" class="card card-tap sys-card" role="button" tabindex="0" :aria-label="`Open ${s.name}`" @click="open(s)" @keydown.enter="open(s)" @keydown.space.prevent="open(s)">
        <div class="sc-top">
          <div style="min-width:0">
            <div class="sc-name">{{ s.name }}</div>
            <div class="sc-host mono">{{ hostFor(s.slug) }}</div>
          </div>
          <StatusBadge :status="s.status" :crashed="isCrashed(s)" />
        </div>

        <div class="sc-facts">
          <span><i>Route</i>{{ s.route_published ? 'Active' : (s.visibility === 'private' ? 'Private' : 'None') }}</span>
          <span><i>Health</i>{{ s.health_state ? (s.health_state === 'healthy' ? 'Healthy' : s.health_state) : 'Not measured' }}</span>
          <span><i>Visibility</i>{{ (s.visibility || 'public').charAt(0).toUpperCase() + (s.visibility || 'public').slice(1) }}</span>
          <span><i>Last deploy</i>{{ fmtAgo(s.updated_at || s.created_at) }}</span>
        </div>

        <div class="sc-foot">
          <span v-if="s.status === 'running' && stats[s.slug]" class="mono small muted">
            CPU {{ (stats[s.slug].cpu_percent ?? 0).toFixed(1) }}% · RAM {{ (stats[s.slug].memory_mb ?? 0).toFixed(0) }} MB<span v-if="s.port"> · :{{ s.port }}</span>
          </span>
          <span v-else class="small dim">{{ s.status === 'building' ? 'Building…' : s.status === 'error' ? (isCrashed(s) ? 'Crashed' : 'Build failed') : 'Not running' }}</span>
          <a v-if="s.status === 'running'" class="sc-open small" :href="urlFor(s.slug)" target="_blank" rel="noopener" @click.stop>Open ↗</a>
        </div>
      </div>
    </div>

    <!-- Deleted (history kept; purge from detail) -->
    <template v-if="deleted.length">
      <div class="section-label" style="margin-top:22px">Deleted · {{ deleted.length }}</div>
      <div class="card" style="padding:0">
        <div v-for="s in deleted" :key="s.id" class="conn-row" style="cursor:pointer" role="button" tabindex="0" :aria-label="`Open ${s.name}`" @click="open(s)" @keydown.enter="open(s)" @keydown.space.prevent="open(s)">
          <div style="flex:1; min-width:0"><div class="c-name">{{ s.name }}</div><div class="c-sub mono">{{ hostFor(s.slug) }}</div></div>
          <span class="small dim">deleted · purge to remove</span>
        </div>
      </div>
    </template>
  </template>
</template>

<style scoped>
.sys-search { width: 200px; min-height: 38px; padding: 8px 12px; font-size: 13px; }
@media (max-width: 560px) { .sys-search { width: 100%; } }
.watching { font-size: 13px; color: var(--text-muted); margin-top: 6px; }
.watching .ok { color: var(--ok); }
.watching .warn { color: var(--warn); }
.watching .err { color: var(--danger); }

.server-mini { display: flex; flex-direction: column; gap: 9px; font-size: 13px; color: var(--text-muted); }
.server-mini span { display: inline-flex; align-items: center; gap: 8px; }
.server-mini .sdot { width: 8px; height: 8px; border-radius: 50%; }

.sc-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
  font-size: 12.5px;
}
.sc-facts span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sc-facts i {
  font-style: normal; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--text-dim);
}
.sc-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.sc-open { color: var(--text-muted); white-space: nowrap; }
</style>
