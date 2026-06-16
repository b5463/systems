<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge.vue'
import StatsCharts from '../components/StatsCharts.vue'
import LogConsole from '../components/LogConsole.vue'
import ExecTerminal from '../components/ExecTerminal.vue'
import CopyButton from '../components/CopyButton.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useToast } from '../composables/useToast'
import { BASE_DOMAIN, hostFor, urlFor } from '../config'
import { fmtDateTime } from '../utils/date'
import { isCrashed } from '../utils/status'

const { showToast } = useToast()
const props = defineProps({ slug: { type: String, required: true } })
const router = useRouter()

const TABS = ['Overview', 'Deployments', 'Logs', 'Metrics', 'Console', 'Settings']
const tab = ref('Overview')

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

/* Env (Settings) */
const envKeys = ref([])
const envVars = ref([{ key: '', value: '' }])
const envSaving = ref(false)
const envMsg = ref('')

/* Gated features (GitHub deploys, DB provisioning) */
const features = ref({})
const repoInput = ref('')
const branchInput = ref('main')
const repoSaving = ref(false)
const repoMsg = ref('')
const provisioning = ref(false)
const provisionMsg = ref('')
const provisionedUrl = ref('')

async function loadFeatures() {
  try { const info = await api.get('/server/info'); features.value = info.features || {} }
  catch { /* non-fatal — panels stay hidden */ }
}
async function saveRepo() {
  repoMsg.value = ''
  repoSaving.value = true
  try {
    const data = await api.patch(`/projects/${props.slug}/repo`, {
      repo: repoInput.value.trim() || null,
      branch: branchInput.value.trim() || 'main'
    })
    system.value = data.project
    repoMsg.value = 'Saved.'
  } catch (e) { repoMsg.value = e.message || 'Could not save.' }
  finally { repoSaving.value = false }
}
async function provisionDb() {
  provisionMsg.value = ''; provisionedUrl.value = ''
  provisioning.value = true
  try {
    const data = await api.post(`/projects/${props.slug}/provision-db`)
    provisionedUrl.value = data.databaseUrl
    provisionMsg.value = `Provisioned ${data.database}. DATABASE_URL stored for next deploy.`
  } catch (e) { provisionMsg.value = e.message || 'Could not provision.' }
  finally { provisioning.value = false }
}

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

/* Visibility */
const visSaving = ref(false)
const visUser = ref('')
const visPass = ref('')
async function setVisibility(v) {
  if (v === 'password' && (!visUser.value || !visPass.value)) { error.value = 'Username and password required for password protection.'; return }
  visSaving.value = true; error.value = ''
  try {
    const body = { visibility: v }
    if (v === 'password') { body.username = visUser.value; body.password = visPass.value }
    const data = await api.patch(`/projects/${props.slug}/visibility`, body)
    if (data && data.project) system.value = data.project
    visPass.value = ''
  } catch (e) {
    error.value = e.message || 'Failed to change visibility.'
  } finally {
    visSaving.value = false
  }
}
// Primary system: also served at the bare base/apex domain (e.g. acronym.sk).
const primarySaving = ref(false)
const primaryMsg = ref('')
async function setPrimary(val) {
  primaryMsg.value = ''
  primarySaving.value = true
  try {
    const data = await api.patch(`/projects/${props.slug}/primary`, { primary: val })
    if (data && data.project) system.value = data.project
    primaryMsg.value = val ? `Now served at ${BASE_DOMAIN}.` : `No longer served at ${BASE_DOMAIN}.`
  } catch (e) {
    primaryMsg.value = e.message || 'Failed to update.'
  } finally {
    primarySaving.value = false
  }
}

const fileInput = ref(null)
const rollingBack = ref(false)

const publicHost = computed(() => (system.value ? hostFor(system.value.slug) : ''))
const publicUrl = computed(() => (system.value ? urlFor(system.value.slug) : '#'))
const isRunning = computed(() => system.value?.status === 'running')

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
    { key: 'Route', tone: routePublished ? 'ok' : 'idle', val: routePublished ? 'Active' : (vis === 'private' ? 'None (private)' : 'None') },
    { key: 'HTTPS', tone: hs ? (health.tone === 'error' ? 'error' : 'ok') : 'idle', val: vis === 'private' ? '—' : (hs ? (health.tone === 'error' ? 'Failed' : 'Valid') : 'Not measured yet') },
    { key: 'Health', tone: health.tone, val: health.val },
    { key: 'Visibility', tone: 'idle', val: vis.charAt(0).toUpperCase() + vis.slice(1) },
    { key: 'Runtime', tone: 'idle', val: s.deploy_type ? (s.deploy_type === 'node' ? 'Node' : s.deploy_type === 'static' ? 'Static' : s.deploy_type) : 'Auto-detected' }
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

/* ---- Env ---- */
async function loadEnv() {
  try {
    const data = await api.get(`/projects/${props.slug}/env`)
    envKeys.value = data.keys || []
  } catch (e) {
    if (e.status !== 401) envMsg.value = e.message || 'Failed to load env keys.'
  }
}
function addEnvRow() { envVars.value.push({ key: '', value: '' }) }
function removeEnvRow(i) {
  envVars.value.splice(i, 1)
  if (!envVars.value.length) addEnvRow()
}
async function saveEnv() {
  envMsg.value = ''
  const vars = {}
  for (const row of envVars.value) { const k = row.key.trim(); if (k) vars[k] = row.value }
  if (!Object.keys(vars).length) return (envMsg.value = 'Add at least one KEY=value pair.')
  envSaving.value = true
  try {
    const data = await api.put(`/projects/${props.slug}/env`, { vars })
    envKeys.value = data.keys || envKeys.value
    envVars.value = [{ key: '', value: '' }]
    envMsg.value = 'Saved. The container is restarting.'
    await loadSystem()
  } catch (e) {
    envMsg.value = e.message || 'Failed to save env.'
  } finally {
    envSaving.value = false
  }
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
  if (t === 'Metrics') startStats(); else stopStats()
  if (t === 'Settings' && !envKeys.value.length) loadEnv()
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
  await loadSystem()
  if (system.value) {
    repoInput.value = system.value.repo || ''
    branchInput.value = system.value.deploy_branch || 'main'
  }
  loadFeatures()
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
          <StatusBadge :status="system.status" :crashed="isCrashed(system)" />
        </div>
        <h1 style="margin-top:10px">{{ system.name }}</h1>
        <a class="mono small" :href="publicUrl" target="_blank" rel="noopener">{{ publicHost }}</a>
      </div>
      <div class="head-actions">
        <button class="btn btn-sm btn-ghost" @click="copyUrl">Copy URL</button>
        <a class="btn btn-sm" :href="publicUrl" target="_blank" rel="noopener">Open</a>
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
        <div class="co-bar"></div><div>This system crashed or its last deploy failed. Check the logs, then restart or roll back.</div>
      </div>
      <div v-else-if="system.status === 'building'" class="callout warn">
        <div class="co-bar"></div><div>This system is building — the build log is streaming under Deployments.</div>
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

        <div class="action-group">
          <div class="ag-label">Primary</div>
          <div class="btn-row">
            <button v-if="!isRunning" class="btn btn-primary" :disabled="!!acting || system.status === 'building'" @click="lifecycle('start')">
              <span v-if="acting === 'start'" class="spinner"></span><span v-else>Start</span>
            </button>
            <button v-else class="btn" :disabled="!!acting" @click="lifecycle('stop')">
              <span v-if="acting === 'stop'" class="spinner"></span><span v-else>Stop</span>
            </button>
            <button class="btn" :disabled="redeploying" @click="pickRedeploy">
              <span v-if="redeploying" class="spinner"></span><span v-else>Redeploy</span>
            </button>
          </div>
        </div>

        <div class="action-group">
          <div class="ag-label">Secondary</div>
          <div class="btn-row">
            <button class="btn" :disabled="!!acting || system.status === 'building'" @click="lifecycle('restart')">
              <span v-if="acting === 'restart'" class="spinner"></span><span v-else>Restart</span>
            </button>
            <button v-if="system.previous_image_id" class="btn" :disabled="rollingBack" @click="doRollback">
              <span v-if="rollingBack" class="spinner"></span><span v-else>Roll back</span>
            </button>
            <button v-if="system.visibility !== 'private'" class="btn" :disabled="checkingHealth" @click="runHealthCheck">
              <span v-if="checkingHealth" class="spinner"></span><span v-else>Check health</span>
            </button>
          </div>
        </div>

        <div class="action-group danger">
          <div class="ag-label">Danger</div>
          <div class="btn-row">
            <button class="btn btn-danger" @click="openDelete">Delete system</button>
          </div>
        </div>
      </div>

      <input ref="fileInput" type="file" accept=".zip,application/zip" style="display:none" @change="onRedeployFile" />

      <!-- Metadata -->
      <div class="card">
        <div v-if="isRunning && overviewStat" class="kv"><span class="k">CPU / RAM</span><span class="v mono">{{ (overviewStat.cpu_percent ?? 0).toFixed(1) }}% · {{ (overviewStat.memory_mb ?? 0).toFixed(0) }} MB</span></div>
        <div class="kv"><span class="k">Port</span><span class="v mono">{{ system.port ?? '–' }}</span></div>
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
      <div class="hint">Saving restarts the container. Stored values are encrypted and aren't shown again.</div>

      <div class="card">
        <div class="section-label">Current env keys</div>
        <div v-if="!envKeys.length" class="muted small">No environment variables set.</div>
        <div v-else class="row flex-wrap" style="gap:8px">
          <span v-for="k in envKeys" :key="k" class="chip">{{ k }}</span>
        </div>
      </div>

      <div class="card stack">
        <div class="section-label">Add / update variables</div>
        <div v-for="(row, i) in envVars" :key="i" class="row">
          <input v-model="row.key" aria-label="KEY" placeholder="KEY" autocapitalize="characters" autocorrect="off" />
          <input v-model="row.value" aria-label="value" placeholder="value" autocorrect="off" />
          <button class="iconbtn" aria-label="Remove" @click="removeEnvRow(i)">✕</button>
        </div>
        <button class="btn btn-sm" @click="addEnvRow">+ Add row</button>
        <div v-if="envMsg" class="notice">{{ envMsg }}</div>
        <button class="btn btn-primary btn-block" :disabled="envSaving" @click="saveEnv">
          <span v-if="envSaving" class="spinner"></span><span v-else>Save &amp; restart</span>
        </button>
      </div>

      <!-- Visibility -->
      <div class="card stack">
        <div class="section-label">Visibility</div>
        <div class="segmented">
          <button type="button" :class="{ active: system.visibility === 'public' }" :disabled="visSaving" @click="setVisibility('public')">Public</button>
          <button type="button" :class="{ active: system.visibility === 'private' }" :disabled="visSaving" @click="setVisibility('private')">Private</button>
          <button type="button" :class="{ active: system.visibility === 'password' }" :disabled="visSaving" @click="setVisibility('password')">Password</button>
        </div>
        <div v-if="system.visibility === 'password'" class="small muted">Protected. Update the credentials below to rotate.</div>
        <input v-model="visUser" aria-label="basic-auth username" placeholder="basic-auth username" autocapitalize="none" autocorrect="off" />
        <input v-model="visPass" aria-label="basic-auth password" type="password" placeholder="basic-auth password" autocomplete="new-password" />
        <div class="hint">Public: open route. Private: no public route. Password: Caddy basic auth (hashed).</div>
      </div>

      <!-- Root domain (primary system) -->
      <div class="card stack">
        <div class="spread">
          <div class="section-label">Root domain</div>
          <span class="chip" :class="system.is_primary ? 'ok' : ''">{{ system.is_primary ? 'On' : 'Off' }}</span>
        </div>
        <div class="hint">
          Also serve this system at <span class="mono">{{ BASE_DOMAIN }}</span> (the bare
          root domain), alongside <span class="mono">{{ publicHost }}</span>. The dashboard
          stays on its own subdomain. Only one system can hold the root domain.
        </div>
        <div v-if="system.visibility === 'private'" class="hint">Make the system public or password-protected first — a private system has no public route to serve.</div>
        <button
          v-else
          class="btn btn-block"
          :class="{ 'btn-primary': !system.is_primary }"
          :disabled="primarySaving"
          @click="setPrimary(!system.is_primary)"
        >
          <span v-if="primarySaving" class="spinner"></span>
          <span v-else>{{ system.is_primary ? `Stop serving at ${BASE_DOMAIN}` : `Serve at ${BASE_DOMAIN}` }}</span>
        </button>
        <div v-if="primaryMsg" class="notice">{{ primaryMsg }}</div>
      </div>

      <!-- GitHub deploy-on-push (only when enabled on the server) -->
      <div v-if="features.githubDeploys" class="card stack">
        <div class="section-label">GitHub deploy-on-push</div>
        <div class="hint">Map this system to a repo. A push to the branch triggers a redeploy (requires the webhook configured in GitHub).</div>
        <div class="field" style="margin:0">
          <label class="label" for="repo">Repository</label>
          <input id="repo" v-model="repoInput" aria-label="Repository (owner/name)" placeholder="owner/name" autocapitalize="none" autocorrect="off" />
        </div>
        <div class="field" style="margin:0">
          <label class="label" for="branch">Branch</label>
          <input id="branch" v-model="branchInput" aria-label="Branch" placeholder="main" autocapitalize="none" autocorrect="off" />
        </div>
        <div v-if="repoMsg" class="notice">{{ repoMsg }}</div>
        <button class="btn btn-primary btn-block" :disabled="repoSaving" @click="saveRepo">
          <span v-if="repoSaving" class="spinner"></span><span v-else>Save repo mapping</span>
        </button>
      </div>

      <!-- Database provisioning (only when enabled on the server) -->
      <div v-if="features.dbProvisioning" class="card stack">
        <div class="section-label">Database</div>
        <div class="hint">Provision a dedicated Postgres database + role. The <span class="mono">DATABASE_URL</span> is stored (encrypted) and injected on the next deploy.</div>
        <div v-if="provisionedUrl" class="kv"><span class="k">DATABASE_URL</span><span class="v mono small row gap-sm" style="justify-content:flex-end">{{ provisionedUrl }}<CopyButton :text="provisionedUrl" label="DATABASE_URL" /></span></div>
        <div v-if="provisionMsg" class="notice">{{ provisionMsg }}</div>
        <button class="btn btn-block" :disabled="provisioning" @click="provisionDb">
          <span v-if="provisioning" class="spinner"></span><span v-else>Provision database</span>
        </button>
      </div>

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
</style>
