<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge.vue'
import SelectMenu from '../components/SelectMenu.vue'
import Icon from '../components/Icon.vue'
import { useToast } from '../composables/useToast'
import { BASE_DOMAIN, LOCAL_MODE, hostFor, urlFor } from '../config'
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
function detailLink(s, tab = 'Overview') {
  return {
    name: 'system-detail',
    params: { slug: s.slug },
    query: tab === 'Overview' ? undefined : { tab },
  }
}

/* ---------- Bulk selection (P2 #7) ---------- */
const selectMode = ref(false)
const selected = ref([])           // slugs (survives the 5s auto-refresh)
const bulkBusy = ref('')           // '' | 'stop' | 'restart' | 'delete'
const confirmBulkDelete = ref(false)
function isSelected(slug) { return selected.value.includes(slug) }
function toggleSelect(slug) {
  selected.value = isSelected(slug) ? selected.value.filter((s) => s !== slug) : [...selected.value, slug]
}
function enterSelect() { selectMode.value = true }
function exitSelect() { selectMode.value = false; selected.value = []; confirmBulkDelete.value = false }
// In selection mode a card click toggles selection; otherwise it opens the system.
function cardClick(s) { if (selectMode.value) toggleSelect(s.slug); else open(s) }
const selectedSystems = computed(() => active.value.filter((s) => selected.value.includes(s.slug)))
const bulkStoppable = computed(() => selectedSystems.value.filter((s) => s.status === 'running').length)
const bulkRestartable = computed(() => selectedSystems.value.filter((s) => s.status === 'running' || isCrashed(s)).length)

async function bulkRun(action) {
  const targets = selectedSystems.value.filter((s) =>
    action === 'restart' ? (s.status === 'running' || isCrashed(s)) : s.status === 'running'
  )
  if (!targets.length) return
  bulkBusy.value = action
  const results = await Promise.allSettled(targets.map((s) => api.post(`/projects/${s.slug}/${action}`)))
  const ok = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.length - ok
  showToast(`${action === 'stop' ? 'Stopped' : 'Restarted'} ${ok}${failed ? ` · ${failed} failed` : ''}`, failed ? 'error' : 'ok')
  bulkBusy.value = ''
  exitSelect()
  load()
}

async function bulkDelete() {
  const targets = [...selectedSystems.value]
  if (!targets.length) return
  bulkBusy.value = 'delete'
  const results = await Promise.allSettled(targets.map((s) => api.del(`/projects/${s.slug}`)))
  const ok = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.length - ok
  showToast(`Deleted ${ok}${failed ? ` · ${failed} failed` : ''}`, failed ? 'error' : 'ok')
  bulkBusy.value = ''
  exitSelect()
  load()
}

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
function endpointText(s) {
  if (!s) return ''
  if (s.visibility === 'private') return 'Private — no public endpoint'
  return s.route_published ? hostFor(s.slug, s.port) : `Planned endpoint: ${hostFor(s.slug, s.port)}`
}
function routeText(s) {
  if (s.route_published) return 'Published'
  if (s.visibility === 'private') return 'Not requested'
  return 'Planned, not published'
}
function healthText(s) {
  if (!s.health_state) return 'Not measured'
  if (s.health_state === 'healthy') return s.health_status ? `Healthy / HTTP ${s.health_status}` : 'Healthy'
  return s.health_status ? `${s.health_state} / HTTP ${s.health_status}` : s.health_state
}
function runtimeText(s) {
  if (!s.container_id) return s.image_id ? 'No container observed' : 'No built image'
  return s.status === 'running' ? 'Container running' : 'Container exists'
}

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
    <div class="eb-actions"><RouterLink class="btn btn-primary" :to="{ name: 'ship' }">Ship your first system</RouterLink></div>
  </div>

  <template v-else>
    <!-- Needs attention -->
    <template v-if="needsAttention.length">
      <h2 class="section-label">Needs attention</h2>
      <div class="attention-grid">
        <div v-for="s in needsAttention" :key="s.slug" class="card attention-card">
          <div class="spread" style="align-items:flex-start">
            <div style="min-width:0">
              <div class="sc-name">{{ s.name }}</div>
              <div class="small muted">{{ s.status === 'error' ? (isCrashed(s) ? 'Runtime crashed' : 'Build failed') : 'Stopped' }}</div>
            </div>
            <StatusBadge :project="s" />
          </div>
          <div v-if="s.last_error" class="attention-error mono small">{{ s.last_error }}</div>
          <div class="attention-next small">
            {{ s.status === 'error'
              ? (isCrashed(s) ? 'Next: review runtime logs, then restart or roll back.' : 'Next: review the build log, correct the archive or configuration, then redeploy.')
              : 'Next: open the system and start it when you are ready.' }}
          </div>
          <div class="row gap-sm flex-wrap">
            <RouterLink class="btn btn-sm" :to="detailLink(s)">View failure</RouterLink>
            <RouterLink v-if="s.container_id" class="btn btn-sm btn-ghost" :to="detailLink(s, 'Logs')">View logs</RouterLink>
            <RouterLink class="btn btn-sm btn-ghost" :to="detailLink(s, 'Settings')">Settings</RouterLink>
          </div>
        </div>
      </div>
    </template>

    <!-- Latest deploy + server mini-status, side by side on desktop -->
    <div class="grid grid-2" style="margin-bottom: 22px; align-items:stretch">
      <div v-if="latest" class="card card-tap" role="button" tabindex="0" @click="open(latest)" @keydown.enter="open(latest)" @keydown.space.prevent="open(latest)">
        <h2 class="section-label">Latest deploy</h2>
        <div class="spread">
          <div style="min-width:0"><div class="sc-name">{{ latest.name }}</div><div class="mono small dim">{{ endpointText(latest) }}</div></div>
          <div class="row gap-sm"><span class="small muted">{{ fmtAgo(latest.updated_at || latest.created_at) }}</span><StatusBadge :project="latest" /></div>
        </div>
      </div>
      <div class="card">
        <h2 class="section-label">Server</h2>
        <div v-if="server" class="server-mini">
          <span><span class="sdot" :class="statusTone(server.docker.status)"></span>Docker {{ statusLabel(server.docker.status) }}</span>
          <span><span class="sdot" :class="statusTone(server.caddy.status)"></span>Caddy {{ statusLabel(server.caddy.status) }}</span>
          <span><span class="sdot" :class="statusTone(server.postgres.status)"></span>Postgres {{ statusLabel(server.postgres.status) }}</span>
          <RouterLink class="small" :to="{ name: 'server' }">Details <Icon name="arrow-right" /></RouterLink>
        </div>
        <div v-else class="muted small">Server status unavailable.</div>
      </div>
    </div>

    <!-- All systems -->
    <div class="spread" style="margin-bottom:10px; gap:10px; flex-wrap:wrap">
      <h2 class="section-label" style="margin:0">All systems · {{ active.length }}</h2>
      <div class="row gap-sm" style="flex-wrap:wrap">
        <button v-if="active.length" class="btn btn-sm btn-ghost" @click="selectMode ? exitSelect() : enterSelect()">{{ selectMode ? 'Cancel' : 'Select' }}</button>
        <template v-if="active.length > 4">
          <input v-model="query" class="sys-search" type="search" placeholder="Search name or slug" aria-label="Search systems" autocapitalize="none" autocorrect="off" />
          <SelectMenu v-model="sortBy" :options="sortOptions" placeholder="Sort" style="width:140px" />
        </template>
      </div>
    </div>
    <div v-if="!visibleSystems.length" class="muted small" style="margin-bottom:18px">{{ query.trim() ? `No systems match “${query}”.` : 'No active systems.' }}</div>
    <div class="grid grid-auto">
      <div v-for="s in visibleSystems" :key="s.id" class="card card-tap sys-card" :class="{ 'sys-selectable': selectMode, 'sys-selected': selectMode && isSelected(s.slug) }" role="button" tabindex="0" :aria-label="selectMode ? `Select ${s.name}` : `Open ${s.name}`" :aria-pressed="selectMode ? isSelected(s.slug) : null" @click="cardClick(s)" @keydown.enter="cardClick(s)" @keydown.space.prevent="cardClick(s)">
        <span v-if="selectMode" class="sys-check" :class="{ on: isSelected(s.slug) }" aria-hidden="true"><Icon v-if="isSelected(s.slug)" name="check" /></span>
        <div class="sc-top">
          <div style="min-width:0">
            <div class="sc-name">{{ s.name }}</div>
            <div class="sc-host mono">{{ endpointText(s) }}</div>
          </div>
          <StatusBadge :project="s" />
        </div>

        <div class="sc-facts">
          <span><i>Route</i>{{ routeText(s) }}</span>
          <span><i>Health</i>{{ healthText(s) }}</span>
          <span><i>Visibility</i>{{ (s.visibility || 'public').charAt(0).toUpperCase() + (s.visibility || 'public').slice(1) }}</span>
          <span><i>Runtime</i>{{ runtimeText(s) }}</span>
          <span><i>Last deploy</i>{{ fmtAgo(s.updated_at || s.created_at) }}</span>
        </div>

        <div class="sc-foot">
          <span v-if="s.status === 'running' && stats[s.slug]" class="mono small muted">
            CPU {{ (stats[s.slug].cpu_percent ?? 0).toFixed(1) }}% · RAM {{ (stats[s.slug].memory_mb ?? 0).toFixed(0) }} MB<span v-if="s.port"> · :{{ s.port }}</span>
          </span>
          <span v-else class="small dim">{{ s.status === 'building' ? 'Building…' : s.status === 'error' ? (isCrashed(s) ? 'Crashed' : 'Build failed') : 'Stopped' }}</span>
          <a v-if="s.status === 'running' && (s.route_published || LOCAL_MODE)" class="sc-open small" :href="urlFor(s.slug, s.port)" target="_blank" rel="noopener" @click.stop>{{ s.route_published ? 'Open' : 'Open local' }} <Icon name="arrow-up-right" /></a>
        </div>
      </div>
    </div>

    <!-- Deleted (history kept; purge from detail) -->
    <template v-if="deleted.length">
      <h2 class="section-label" style="margin-top:22px">Deleted · {{ deleted.length }}</h2>
      <div class="card" style="padding:0">
        <div v-for="s in deleted" :key="s.id" class="conn-row" style="cursor:pointer" role="button" tabindex="0" :aria-label="`Open ${s.name}`" @click="open(s)" @keydown.enter="open(s)" @keydown.space.prevent="open(s)">
          <div style="flex:1; min-width:0"><div class="c-name">{{ s.name }}</div><div class="c-sub mono">{{ hostFor(s.slug) }}</div></div>
          <span class="small dim">deleted · purge to remove</span>
        </div>
      </div>
    </template>

    <!-- Bulk action bar (selection mode) -->
    <div v-if="selectMode" class="bulk-bar">
      <template v-if="confirmBulkDelete">
        <span class="small">Delete {{ selected.length }} system{{ selected.length === 1 ? '' : 's' }}? Containers and routes are removed; records are kept until purged.</span>
        <div class="row gap-sm">
          <button class="btn btn-sm btn-ghost" :disabled="!!bulkBusy" @click="confirmBulkDelete = false">Cancel</button>
          <button class="btn btn-sm btn-danger" :disabled="!!bulkBusy" @click="bulkDelete">
            <span v-if="bulkBusy === 'delete'" class="spinner"></span><span v-else>Delete {{ selected.length }}</span>
          </button>
        </div>
      </template>
      <template v-else>
        <span class="small">{{ selected.length }} selected</span>
        <div class="row gap-sm" style="flex-wrap:wrap">
          <button class="btn btn-sm" :disabled="!bulkStoppable || !!bulkBusy" @click="bulkRun('stop')">
            <span v-if="bulkBusy === 'stop'" class="spinner"></span><span v-else>Stop{{ bulkStoppable ? ` (${bulkStoppable})` : '' }}</span>
          </button>
          <button class="btn btn-sm" :disabled="!bulkRestartable || !!bulkBusy" @click="bulkRun('restart')">
            <span v-if="bulkBusy === 'restart'" class="spinner"></span><span v-else>Restart{{ bulkRestartable ? ` (${bulkRestartable})` : '' }}</span>
          </button>
          <button class="btn btn-sm btn-danger" :disabled="!selected.length || !!bulkBusy" @click="confirmBulkDelete = true">Delete</button>
          <button class="btn btn-sm btn-ghost" :disabled="!!bulkBusy" @click="exitSelect">Done</button>
        </div>
      </template>
    </div>
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

/* Bulk selection */
.sys-card { position: relative; }
.sys-selectable { border-color: var(--border); }
.sys-selected { border-color: var(--focus-border); box-shadow: 0 0 0 1px var(--focus-border) inset; }
/* Reserve room on the top row so the corner checkbox never overlaps the badge. */
.sys-selectable .sc-top { padding-right: 30px; }
.sys-check {
  position: absolute;
  top: 14px; right: 14px;
  width: 20px; height: 20px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; line-height: 1;
  border: 1px solid var(--border-strong);
  background: var(--bg-input);
  color: transparent;
  z-index: 1;
}
.sys-check.on { background: var(--ok); border-color: var(--ok); color: #06140b; }
.sys-check .icon { width: 13px; height: 13px; }
.bulk-bar {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 20px;
  z-index: 45;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: calc(100vw - 32px);
  padding: 10px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.5);
}
@media (max-width: 899px) {
  .bulk-bar { bottom: calc(var(--nav-height) + var(--safe-bottom) + 12px); }
}

.attention-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.attention-card { display: flex; flex-direction: column; gap: 12px; }
.attention-next { color: var(--text-muted); line-height: 1.45; }
.attention-error {
  padding: 8px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 84px;
  overflow: auto;
}

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
