<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge.vue'
import StatsCharts from '../components/StatsCharts.vue'
import LogConsole from '../components/LogConsole.vue'
import ExecTerminal from '../components/ExecTerminal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import SystemSettings from '../components/SystemSettings.vue'
import { useToast } from '../composables/useToast'
import { hostFor, urlFor, LOCAL_MODE } from '../config'
import { fmtDateTime } from '../utils/date'
import { isCrashed } from '../utils/status'

const { showToast } = useToast()
const props = defineProps({ slug: { type: String, required: true } })
const router = useRouter()
const route = useRoute()

const TABS = ['Overview', 'Deployments', 'Logs', 'Metrics', 'Console', 'Settings']
const tab = ref('Overview')

function normalizeTab(value) {
  const match = TABS.find((t) => t.toLowerCase() === String(value || '').toLowerCase())
  return match || 'Overview'
}

const system = ref(null)
const loading = ref(true)
const error = ref('')
const acting = ref('')

/* Metrics */
const history = ref([])
const latestStats = ref(null)
const overviewStat = ref(null)
let statsTimer = null
const historyMinutes = ref(0)

/* Deployments */
const deployHistory = ref([])

/* Redeploy / delete / rollback (modals use ConfirmDialog: focus + Esc handled there) */
const redeployFile = ref(null)
const redeploying = ref(false)
const showBuildLog = ref(false)
const confirmDelete = ref(false)
const deleting = ref(false)
function openDelete() { confirmDelete.value = true }

/* Purge (typed-slug confirm) */
const confirmPurge = ref(false)
const purging = ref(false)
function openPurge() { confirmPurge.value = true }

async function doPurge() {
  purging.value = true; error.value = ''
  try {
    await api.post(`/projects/${props.slug}/purge`, { confirm: system.value.slug })
    router.replace({ name: 'systems' })
  } catch (e) {
    error.value = e.message || 'Purge failed.'; purging.value = false; confirmPurge.value = false
  }
}

/* Health check */
const checkingHealth = ref(false)
async function runHealthCheck() {
  checkingHealth.value = true; error.value = ''
  try {
    const r = await api.post(`/projects/${props.slug}/health`); await loadSystem()
    const st = r && r.health && r.health.state
    showToast(st === 'healthy' ? 'Health check passed' : `Health: ${st || 'checked'}`, st === 'healthy' ? 'success' : 'warn')
  }
  catch (e) { error.value = e.message || 'Health check failed.'; showToast(e.message || 'Health check failed', 'error') }
  finally { checkingHealth.value = false }
}

const fileInput = ref(null)
const rollingBack = ref(false)

const publicHost = computed(() => (system.value ? hostFor(system.value.slug, system.value.port) : ''))
const publicUrl = computed(() => (system.value ? urlFor(system.value.slug, system.value.port) : '#'))
const isRunning = computed(() => system.value?.status === 'running')

// Capability model: which actions can actually succeed in the current state.
// Drives the action matrix so we never offer an action that cannot work
// (e.g. Start/Restart/Open/Check-health on a failed build with no container).
const isBuilding = computed(() => system.value?.status === 'building')
const hasContainer = computed(() => !!system.value?.image_id) // built at least once
const hasRuntimeContainer = computed(() => !!system.value?.container_id)
const canStart = computed(() => !!system.value && system.value.status === 'stopped' && !acting.value)
const canStop = computed(() => isRunning.value && !acting.value)
// Restart needs an existing container image (running or a stopped/crashed one).
const canRestart = computed(() => (isRunning.value || (system.value?.status === 'error' && hasContainer.value)) && !acting.value)
const canRedeploy = computed(() => !!system.value && !isBuilding.value && !redeploying.value)
const canRollback = computed(() => !!system.value?.previous_image_id && !isBuilding.value && !rollingBack.value)
// Health probes the public endpoint — only meaningful for a running, non-private system.
const canHealthCheck = computed(() => isRunning.value && (system.value?.visibility !== 'private') && !checkingHealth.value)
// Open only when there's a usable endpoint: a published route, or local testing (host port).
const canOpen = computed(() => isRunning.value && (!!system.value?.route_published || LOCAL_MODE))
// What the Open control actually opens — be explicit so it's never ambiguous.
const opensPublic = computed(() => isRunning.value && !!system.value?.route_published)
const openLabel = computed(() => (opensPublic.value ? 'Open public URL' : 'Open local endpoint'))
// Running, meant to be public, but no public route exists yet.
const routeUnpublished = computed(() =>
  isRunning.value && (system.value?.visibility !== 'private') && !system.value?.route_published
)

const publishingRoute = ref(false)
const publishMsg = ref('')
async function retryPublish() {
  publishingRoute.value = true
  publishMsg.value = ''
  try {
    const data = await api.post(`/projects/${props.slug}/publish-route`)
    if (data && data.project) system.value = data.project
    showToast('Public route published.', 'ok')
  } catch (e) {
    publishMsg.value = e.message || 'Could not publish the route.'
  } finally {
    publishingRoute.value = false
  }
}
const publicEndpointLabel = computed(() => {
  const s = system.value
  if (!s) return ''
  if (s.visibility === 'private') return 'No public endpoint (private)'
  if (s.route_published) return publicHost.value
  return `Planned endpoint: ${publicHost.value}`
})
const runtimeLabel = computed(() => {
  const type = system.value?.deploy_type
  if (!type) return 'Auto-detected at deploy time'
  return type === 'node' ? 'Node' : type === 'static' ? 'Static' : type
})

/* ---- Truth model ---- */
const truth = computed(() => {
  const s = system.value
  if (!s) return []
  const containerTone =
    s.status === 'running' ? 'ok' : s.status === 'error' ? 'error' : s.status === 'building' ? 'warn' : 'idle'
  const containerLabel =
    s.status === 'running' ? 'Running' : s.status === 'building' ? 'Building' : s.status === 'error' ? (isCrashed(s) ? 'Crashed' : 'Build failed') : 'Stopped'

  const routePublished = !!s.route_published
  const vis = s.visibility || 'public'
  const hs = s.health_state
  const healthMap = {
    healthy: { tone: 'ok', val: `HTTP ${s.health_status || 200}` },
    unhealthy: { tone: 'warn', val: `HTTP ${s.health_status || '?'}` },
    timeout: { tone: 'error', val: 'Timeout' },
    unreachable: { tone: 'error', val: 'Unreachable' }
  }
  const health = healthMap[hs] || { tone: 'idle', val: 'Not measured yet' }

  return [
    { key: 'Container', tone: containerTone, val: containerLabel },
    { key: 'Route', tone: routePublished ? 'ok' : (vis === 'private' ? 'idle' : 'warn'), val: routePublished ? 'Published' : (vis === 'private' ? 'None (private)' : 'Not published') },
    { key: 'HTTPS', tone: hs ? (health.tone === 'error' ? 'error' : 'ok') : 'idle', val: vis === 'private' ? '—' : (hs ? (health.tone === 'error' ? 'Failed' : 'Valid') : 'Not measured yet') },
    { key: 'Health', tone: health.tone, val: health.val },
    { key: 'Visibility', tone: 'idle', val: vis.charAt(0).toUpperCase() + vis.slice(1) },
    { key: 'Runtime', tone: 'idle', val: runtimeLabel.value }
  ]
})

async function loadSystem() {
  try {
    const data = await api.get(`/projects/${props.slug}`)
    system.value = data.project
    error.value = ''
  } catch (e) {
    if (e.status !== 401) error.value = e.message || 'Failed to load system.'
  } finally {
    loading.value = false
  }
}

/* ---- Lifecycle ---- */
const ACTION_DONE = { start: 'started', stop: 'stopped', restart: 'restarted' }
const OPTIMISTIC = { start: 'running', stop: 'stopped', restart: 'running' }
async function lifecycle(action) {
  acting.value = action
  error.value = ''
  // Optimistic: move the badge/truth grid immediately, revert if the call fails.
  const prevStatus = system.value && system.value.status
  if (system.value && OPTIMISTIC[action]) system.value = { ...system.value, status: OPTIMISTIC[action] }
  try {
    const data = await api.post(`/projects/${props.slug}/${action}`)
    if (data && data.project) system.value = data.project
    else await loadSystem()
    showToast(`${system.value?.name || 'System'} ${ACTION_DONE[action] || action}`, 'success')
  } catch (e) {
    if (system.value && prevStatus !== undefined) system.value = { ...system.value, status: prevStatus }
    error.value = e.message || `Failed to ${action}.`
    showToast(e.message || `Failed to ${action}`, 'error')
  } finally {
    acting.value = ''
  }
}

/* ---- Metrics ---- */
async function pollStats() {
  if (document.visibilityState !== 'visible') return
  try {
    const s = await api.get(`/projects/${props.slug}/stats`)
    latestStats.value = s
    history.value.push({ label: new Date().toLocaleTimeString(), cpu: s.cpu_percent ?? 0, mem: s.memory_mb ?? 0 })
    if (history.value.length > 60) history.value.shift()
  } catch { /* transient */ }
}
async function loadStatsHistory() {
  try {
    const data = await api.get(`/projects/${props.slug}/stats/history?hours=1`)
    const points = data.points || []
    if (points.length) {
      history.value = points.map((p) => ({
        label: new Date(p.recorded_at).toLocaleTimeString(),
        cpu: p.cpu_percent ?? 0, mem: p.memory_mb ?? 0
      })).slice(-60)
      const first = new Date(points[0].recorded_at).getTime()
      const last = new Date(points[points.length - 1].recorded_at).getTime()
      const mins = Math.round((last - first) / 60000)
      historyMinutes.value = Number.isFinite(mins) && mins > 0 ? mins : 0
    }
  } catch { /* best-effort */ }
}
async function startStats() {
  stopStats()
  history.value = []; latestStats.value = null; historyMinutes.value = 0
  await loadStatsHistory()
  pollStats()
  statsTimer = setInterval(pollStats, 2000)
}
function stopStats() {
  if (statsTimer) { clearInterval(statsTimer); statsTimer = null }
}

/* ---- Deployments ---- */
async function loadDeployHistory() {
  try {
    const data = await api.get(`/projects/${props.slug}/deploy-history`)
    deployHistory.value = data.history || []
  } catch { /* best-effort */ }
}

/* ---- Redeploy / rollback / delete ---- */
const confirmRedeploy = ref(false)
function pickRedeploy() { fileInput.value && fileInput.value.click() }
// Picking a file no longer fires immediately — it opens a confirm step, since
// a redeploy replaces the running container.
function onRedeployFile(e) {
  const f = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!f) return
  redeployFile.value = f
  confirmRedeploy.value = true
}
async function doRedeploy() {
  if (!redeployFile.value) return
  redeploying.value = true
  error.value = ''
  try {
    await api.upload(`/deploy/${props.slug}/redeploy`, { files: { file: redeployFile.value } })
    confirmRedeploy.value = false
    showBuildLog.value = true
    tab.value = 'Overview'
    showToast('Redeploy started — streaming the build log', 'info')
    await loadSystem()
  } catch (e) {
    error.value = e.message || 'Redeploy failed.'
    showToast(e.message || 'Redeploy failed', 'error')
  } finally {
    redeploying.value = false
    redeployFile.value = null
  }
}
async function doRollback() {
  if (rollingBack.value) return
  rollingBack.value = true
  error.value = ''
  try {
    const data = await api.post(`/projects/${props.slug}/rollback`)
    if (data && data.project) system.value = data.project
    else await loadSystem()
    await loadDeployHistory()
    showToast('Rolled back to the previous release', 'success')
  } catch (e) {
    error.value = e.message || 'Rollback failed.'
    showToast(e.message || 'Rollback failed', 'error')
  } finally {
    rollingBack.value = false
  }
}
async function doDelete() {
  deleting.value = true
  error.value = ''
  try {
    await api.del(`/projects/${props.slug}`)
    router.replace({ name: 'systems' })
  } catch (e) {
    error.value = e.message || 'Delete failed.'
    deleting.value = false
    confirmDelete.value = false
  }
}

async function copyUrl() {
  try {
    if (!navigator.clipboard) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(publicUrl.value)
    showToast('URL copied', 'success')
  } catch {
    showToast('Could not copy URL', 'error')
  }
}

/* ---- Tab side effects ---- */
// Select a tab and run its data load. Done explicitly (not via watch) so the
// side-effects reliably fire on every tab change.
function selectTab(t) {
  tab.value = t
  router.replace({ query: { ...route.query, tab: t === 'Overview' ? undefined : t } })
  if (t === 'Metrics') startStats(); else stopStats()
  if (t === 'Deployments') loadDeployHistory()
}

function onVisibility() {
  if (document.visibilityState === 'visible' && tab.value === 'Metrics' && !statsTimer) startStats()
}

// One-shot stat for the Overview metadata (Metrics tab does the live polling).
async function fetchOverviewStat() {
  if (!isRunning.value) { overviewStat.value = null; return }
  try { overviewStat.value = await api.get(`/projects/${props.slug}/stats`) } catch { /* best-effort */ }
}

onMounted(async () => {
  tab.value = normalizeTab(route.query.tab)
  await loadSystem()
  if (tab.value === 'Metrics') startStats()
  if (tab.value === 'Deployments') loadDeployHistory()
  fetchOverviewStat()
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  stopStats()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <!-- Skeleton -->
  <div v-if="loading" class="stack">
    <div class="skel-card">
      <div class="spread" style="margin-bottom:14px">
        <div style="flex:1"><div class="skel skel-title" style="width:45%"></div><div class="skel skel-line" style="width:30%;margin-top:8px"></div></div>
        <div class="skel skel-badge"></div>
      </div>
      <div class="skel skel-line" style="width:70%;margin-top:12px"></div>
      <div class="skel skel-line" style="width:55%"></div>
    </div>
  </div>

  <template v-else-if="system">
    <!-- Header -->
    <div class="page-head" style="margin-bottom:18px">
      <div>
        <div class="row gap-sm">
          <RouterLink class="btn btn-sm btn-ghost" :to="{ name: 'systems' }" style="min-height:32px;padding:0 10px">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
            Systems
          </RouterLink>
          <StatusBadge :project="system" />
        </div>
        <h1 style="margin-top:10px">{{ system.name }}</h1>
        <a v-if="canOpen" class="mono small" :href="publicUrl" target="_blank" rel="noopener">{{ publicEndpointLabel }}</a>
        <span v-else class="mono small dim">{{ publicEndpointLabel }}</span>
      </div>
      <div class="head-actions">
        <button v-if="canOpen" class="btn btn-sm btn-ghost" @click="copyUrl">{{ opensPublic ? 'Copy URL' : 'Copy local URL' }}</button>
        <a v-if="canOpen" class="btn btn-sm" :href="publicUrl" target="_blank" rel="noopener">{{ openLabel }}</a>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button v-for="t in TABS" :key="t" :class="{ active: tab === t }" @click="selectTab(t)">{{ t }}</button>
    </div>

    <div v-if="error" class="error-box" style="margin-bottom:14px">{{ error }}</div>

    <!-- OVERVIEW -->
    <div v-show="tab === 'Overview'" class="stack">
      <div v-if="system.status === 'error'" class="callout danger">
        <div class="co-bar"></div>
        <div class="stack" style="gap:10px">
          <div v-if="isCrashed(system)">
            This system <strong>crashed</strong> — it was running, then the container stopped.
            Check the logs, then restart{{ system.previous_image_id ? ' (or roll back to the last release)' : '' }}.
          </div>
          <div v-else>
            The last <strong>build failed</strong>, so nothing new went live. Check the build log,
            fix it, and redeploy{{ system.previous_image_id ? ' — or roll back to the last working release' : '' }}.
          </div>
          <div v-if="system.last_error" class="mono small" style="padding:8px 10px; background:var(--bg-input); border:1px solid var(--border-soft); border-radius:var(--radius-sm); color:var(--text-muted); white-space:pre-wrap; word-break:break-word">{{ system.last_error }}</div>
          <div v-if="system.last_error_stage || system.last_error_hint || system.last_error_excerpt" class="failure-detail">
            <div v-if="system.last_error_stage" class="kv"><span class="k">Failed stage</span><span class="v">{{ system.last_error_stage }}</span></div>
            <div v-if="system.last_error_hint" class="kv"><span class="k">Suggested fix</span><span class="v">{{ system.last_error_hint }}</span></div>
            <div v-if="system.last_error_excerpt" class="kv">
              <span class="k">Relevant log excerpt</span>
              <pre class="v mono small">{{ system.last_error_excerpt }}</pre>
            </div>
          </div>
          <div class="row gap-sm flex-wrap">
            <button class="btn btn-sm" @click="selectTab('Logs')">View logs</button>
            <button v-if="canRestart" class="btn btn-sm" :disabled="!!acting" @click="lifecycle('restart')">Restart</button>
            <button class="btn btn-sm" :disabled="redeploying" @click="pickRedeploy">Redeploy…</button>
            <button v-if="canRollback" class="btn btn-sm" :disabled="rollingBack" @click="doRollback">
              <span v-if="rollingBack" class="spinner"></span><span v-else>Roll back</span>
            </button>
            <button class="btn btn-sm" @click="selectTab('Settings')">Edit configuration</button>
          </div>
        </div>
      </div>
      <div v-else-if="system.status === 'building'" class="callout warn">
        <div class="co-bar"></div><div>This system is building — this can take a minute. Live output appears in the build log below.</div>
      </div>

      <!-- Running, public intent, but no public route yet -->
      <div v-else-if="routeUnpublished" class="callout warn">
        <div class="co-bar"></div>
        <div class="stack" style="gap:10px">
          <div>
            <strong>Running, but not published.</strong>
            The container is up and reachable on its host port<template v-if="system.port"> (<span class="mono">localhost:{{ system.port }}</span>)</template>,
            but no public route exists yet — so <span class="mono">{{ hostFor(system.slug) }}</span> won't resolve.
          </div>
          <div class="row gap-sm flex-wrap">
            <button class="btn btn-sm btn-primary" :disabled="publishingRoute" @click="retryPublish">
              <span v-if="publishingRoute" class="spinner"></span><span v-else>Retry route publish</span>
            </button>
            <a v-if="canOpen" class="btn btn-sm" :href="publicUrl" target="_blank" rel="noopener">{{ openLabel }}</a>
            <RouterLink class="btn btn-sm btn-ghost" :to="{ name: 'server' }">Server routing setup</RouterLink>
          </div>
          <div v-if="publishMsg" class="small" style="color:var(--warn)">{{ publishMsg }}</div>
        </div>
      </div>

      <!-- Truth model -->
      <div>
        <div class="section-label">Status</div>
        <div class="truth">
          <div v-for="cell in truth" :key="cell.key" class="t-cell">
            <div class="t-key">{{ cell.key }}</div>
            <div class="t-val"><span class="sdot" :class="cell.tone"></span>{{ cell.val }}</div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div>
        <div class="section-label">Actions</div>

        <!-- For error/building states the contextual callout above is the action
             surface; here we only show actions that can succeed right now. -->
        <div v-if="system.status !== 'error' && !isBuilding" class="action-group">
          <div class="ag-label">Primary</div>
          <div class="btn-row">
            <button v-if="canStart" class="btn btn-primary" :disabled="!!acting" @click="lifecycle('start')">
              <span v-if="acting === 'start'" class="spinner"></span><span v-else>Start</span>
            </button>
            <button v-if="canStop" class="btn" :disabled="!!acting" @click="lifecycle('stop')">
              <span v-if="acting === 'stop'" class="spinner"></span><span v-else>Stop</span>
            </button>
            <button class="btn" :disabled="!canRedeploy" title="Upload a new .zip — it builds and replaces the running container" @click="pickRedeploy">
              <span v-if="redeploying" class="spinner"></span><span v-else>Redeploy…</span>
            </button>
          </div>
          <div class="hint">Redeploy uploads a new <span class="mono">.zip</span>; the previous release is kept for rollback.</div>
        </div>

        <div v-if="system.status !== 'error' && !isBuilding && (canRestart || canRollback || canHealthCheck)" class="action-group">
          <div class="ag-label">Secondary</div>
          <div class="btn-row">
            <button v-if="canRestart" class="btn" :disabled="!!acting" @click="lifecycle('restart')">
              <span v-if="acting === 'restart'" class="spinner"></span><span v-else>Restart</span>
            </button>
            <button v-if="canRollback" class="btn" :disabled="rollingBack" @click="doRollback">
              <span v-if="rollingBack" class="spinner"></span><span v-else>Roll back</span>
            </button>
            <button v-if="canHealthCheck" class="btn" :disabled="checkingHealth" @click="runHealthCheck">
              <span v-if="checkingHealth" class="spinner"></span><span v-else>Check health</span>
            </button>
          </div>
        </div>

        <div class="action-group danger">
          <div class="ag-label">Danger</div>
          <div class="btn-row">
            <button class="btn btn-danger" @click="openDelete">Delete system</button>
          </div>
          <div class="hint">Deleting stops and removes the container and route. The deployment record is kept until you purge it.</div>
        </div>
      </div>

      <input ref="fileInput" type="file" accept=".zip,application/zip" style="display:none" @change="onRedeployFile" />

      <!-- Configured vs observed state -->
      <div class="grid grid-2">
        <div class="card">
          <div class="section-label">Configured plan</div>
          <div class="kv"><span class="k">Planned endpoint</span><span class="v mono small">{{ system.visibility === 'private' ? 'Private - no public route' : publicHost }}</span></div>
          <div class="kv"><span class="k">Planned port</span><span class="v mono">{{ system.port ?? '-' }}</span></div>
          <div class="kv"><span class="k">Requested visibility</span><span class="v">{{ (system.visibility || 'public').charAt(0).toUpperCase() + (system.visibility || 'public').slice(1) }}</span></div>
          <div class="kv"><span class="k">Detected runtime</span><span class="v">{{ runtimeLabel }}</span></div>
          <div class="kv"><span class="k">Created</span><span class="v small">{{ fmtDateTime(system.created_at) }}</span></div>
        </div>
        <div class="card">
          <div class="section-label">Observed runtime</div>
          <div v-if="isRunning && overviewStat" class="kv"><span class="k">CPU / RAM</span><span class="v mono">{{ (overviewStat.cpu_percent ?? 0).toFixed(1) }}% Â· {{ (overviewStat.memory_mb ?? 0).toFixed(0) }} MB</span></div>
          <div class="kv"><span class="k">Container</span><span class="v mono small">{{ hasRuntimeContainer ? String(system.container_id).slice(0,12) : 'No container observed' }}</span></div>
          <div class="kv"><span class="k">Image</span><span class="v mono small">{{ system.image_id ? String(system.image_id).replace('sha256:','').slice(0,12) : 'No built image' }}</span></div>
          <div class="kv"><span class="k">Published route</span><span class="v">{{ system.route_published ? publicHost : (system.visibility === 'private' ? 'Not published (private)' : 'Not published') }}</span></div>
          <div class="kv"><span class="k">Observed health</span><span class="v">{{ system.health_state ? `${system.health_state}${system.health_status ? ' / HTTP ' + system.health_status : ''}` : 'Not measured yet' }}</span></div>
          <div class="kv"><span class="k">Last deploy</span><span class="v small">{{ fmtDateTime(system.updated_at) }}</span></div>
        </div>
      </div>

      <!-- Legacy mixed metadata kept out of the rendered UI. -->
      <div v-if="false" class="card">
        <div v-if="isRunning && overviewStat" class="kv"><span class="k">CPU / RAM</span><span class="v mono">{{ (overviewStat.cpu_percent ?? 0).toFixed(1) }}% · {{ (overviewStat.memory_mb ?? 0).toFixed(0) }} MB</span></div>
        <div class="kv"><span class="k">{{ hasContainer ? 'Port' : 'Planned port' }}</span><span class="v mono">{{ system.port ?? '–' }}</span></div>
        <div class="kv"><span class="k">Container</span><span class="v mono small">{{ system.container_id ? String(system.container_id).slice(0,12) : '–' }}</span></div>
        <div class="kv"><span class="k">Image</span><span class="v mono small">{{ system.image_id ? String(system.image_id).replace('sha256:','').slice(0,12) : '–' }}</span></div>
        <div class="kv"><span class="k">Created</span><span class="v small">{{ fmtDateTime(system.created_at) }}</span></div>
        <div class="kv"><span class="k">Last deploy</span><span class="v small">{{ fmtDateTime(system.updated_at) }}</span></div>
      </div>

      <div v-if="showBuildLog" class="card">
        <div class="section-label">Redeploy build log</div>
        <LogConsole :slug="system.slug" mode="build" />
      </div>
    </div>

    <!-- DEPLOYMENTS -->
    <div v-show="tab === 'Deployments'" class="stack">
      <div class="hint">Each redeploy keeps the previous release for rollback.</div>

      <div class="row gap-sm flex-wrap">
        <button class="btn btn-sm" :disabled="redeploying" @click="pickRedeploy">
          <span v-if="redeploying" class="spinner"></span><span v-else>Upload new release</span>
        </button>
        <button v-if="system.previous_image_id" class="btn btn-sm" :disabled="rollingBack" @click="doRollback">
          <span v-if="rollingBack" class="spinner"></span><span v-else>Roll back to previous</span>
        </button>
      </div>

      <div v-if="!deployHistory.length" class="empty-block">
        <div class="eb-title">No previous releases yet.</div>
        <div class="eb-sub">The first redeploy creates a rollback point.</div>
      </div>
      <div v-else class="card" style="padding:0">
        <div v-for="(h, i) in deployHistory" :key="h.id" class="conn-row">
          <span class="conn-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
          <div>
            <div class="c-name">Release {{ deployHistory.length - i }}</div>
            <div class="c-sub">image {{ h.image_id ? String(h.image_id).replace('sha256:','').slice(0,12) : '–' }}</div>
          </div>
          <div class="conn-state">{{ fmtDateTime(h.deployed_at) }}</div>
        </div>
      </div>
    </div>

    <!-- LOGS -->
    <div v-show="tab === 'Logs'">
      <div v-if="!system.container_id" class="empty-block">
        <div class="eb-title">No runtime logs yet.</div>
        <div class="eb-sub">Logs will appear after the container starts.</div>
      </div>
      <LogConsole v-else-if="tab === 'Logs'" :slug="system.slug" mode="logs" />
    </div>

    <!-- METRICS -->
    <div v-show="tab === 'Metrics'">
      <div v-if="!isRunning" class="empty-block">
        <div class="eb-title">No metrics yet.</div>
        <div class="eb-sub">Metrics appear once the container is running.</div>
        <div v-if="system.status === 'stopped'" class="eb-actions">
          <button class="btn btn-sm btn-primary" :disabled="acting === 'start'" @click="lifecycle('start')">
            <span v-if="acting === 'start'" class="spinner"></span><span v-else>Start system</span>
          </button>
        </div>
      </div>
      <template v-else>
        <div v-if="historyMinutes > 0" class="small muted" style="margin-bottom:10px">Showing last {{ historyMinutes }} minutes</div>
        <!-- mount only when visible so Chart.js sizes the canvas correctly -->
        <StatsCharts v-if="tab === 'Metrics'" :history="history" :latest="latestStats" />
      </template>
    </div>

    <!-- CONSOLE -->
    <div v-show="tab === 'Console'">
      <div v-if="!isRunning" class="empty-block">
        <div class="eb-title">Console unavailable.</div>
        <div class="eb-sub">The shell attaches only while the container is running.</div>
        <div v-if="system.status === 'stopped'" class="eb-actions">
          <button class="btn btn-sm btn-primary" :disabled="acting === 'start'" @click="lifecycle('start')">
            <span v-if="acting === 'start'" class="spinner"></span><span v-else>Start system</span>
          </button>
        </div>
      </div>
      <ExecTerminal v-if="tab === 'Console' && isRunning" :slug="system.slug" />
    </div>

    <!-- SETTINGS -->
    <div v-show="tab === 'Settings'" class="stack">
      <SystemSettings v-if="tab === 'Settings'" :slug="system.slug" :system="system" @update="system = $event" @reload="loadSystem" />

      <div class="card stack">
        <div class="section-label danger-label">Danger zone</div>
        <div class="hint"><strong>Delete</strong> stops the container and removes the public route but keeps history. <strong>Purge</strong> removes everything permanently.</div>
        <div class="btn-row">
          <button class="btn btn-danger" @click="openDelete">Delete</button>
          <button class="btn btn-danger" @click="openPurge">Purge…</button>
        </div>
      </div>
    </div>
  </template>

  <div v-else class="error-box">{{ error || 'System not found.' }}</div>

  <!-- Redeploy confirm -->
  <ConfirmDialog v-model:open="confirmRedeploy" title="Redeploy this system?" confirm-text="Deploy release" :busy="redeploying" @confirm="doRedeploy">
    <p class="muted small" style="margin:0">
      This builds <strong>{{ redeployFile?.name }}</strong> and replaces the running
      container for <strong>{{ system?.name }}</strong>. The previous release is kept for rollback.
    </p>
  </ConfirmDialog>

  <!-- Delete confirm -->
  <ConfirmDialog v-model:open="confirmDelete" title="Delete this system?" tone="danger" confirm-text="Delete system" :busy="deleting" :require-text="system?.slug" @confirm="doDelete">
    <p class="muted small" style="margin:0">
      This permanently removes <strong>{{ system?.name }}</strong>, its container, image and
      public route. This cannot be undone.
    </p>
    <div class="callout warn" style="margin:0">
      <div class="co-bar"></div>
      <div>No backup is taken automatically. Back up first if you might need this system again.</div>
    </div>
  </ConfirmDialog>

  <!-- Purge confirm -->
  <ConfirmDialog v-model:open="confirmPurge" title="Purge this system?" tone="danger" confirm-text="Purge everything" :busy="purging" :require-text="system?.slug" @confirm="doPurge">
    <p class="muted small" style="margin:0">
      This permanently removes <strong>{{ system?.name }}</strong> — container, images, route,
      release files and all records. This cannot be undone.
    </p>
    <div class="callout danger" style="margin:0">
      <div class="co-bar"></div>
      <div>No backup is taken automatically. Back up first — recovery steps are in the docs.</div>
    </div>
  </ConfirmDialog>
</template>

<style scoped>
.danger-label { color: var(--danger); }
.failure-detail {
  border: 1px solid var(--border-soft);
  background: rgba(255,255,255,0.025);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}
.failure-detail pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
