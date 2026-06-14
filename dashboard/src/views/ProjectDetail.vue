<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import TopBar from '../components/TopBar.vue'
import StatusBadge from '../components/StatusBadge.vue'
import StatsCharts from '../components/StatsCharts.vue'
import LogConsole from '../components/LogConsole.vue'
import ExecTerminal from '../components/ExecTerminal.vue'

const props = defineProps({ slug: { type: String, required: true } })
const router = useRouter()

const TABS = ['Overview', 'Analytics', 'Logs', 'Console', 'Env']
const tab = ref('Overview')

const project = ref(null)
const loading = ref(true)
const error = ref('')
const acting = ref('') // current lifecycle action in-flight

/* ---- Analytics state ---- */
const history = ref([])
const latestStats = ref(null)
let statsTimer = null

/* ---- Env state ---- */
const envKeys = ref([])
const envVars = ref([{ key: '', value: '' }])
const envSaving = ref(false)
const envMsg = ref('')

/* ---- Redeploy / delete ---- */
const redeployFile = ref(null)
const redeploying = ref(false)
const showBuildLog = ref(false)
const confirmDelete = ref(false)
const deleting = ref(false)
const fileInput = ref(null)

const publicUrl = computed(() => (project.value ? `/${project.value.slug}/` : '#'))

function fmtDate(s) {
  if (!s) return '–'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString()
}

async function loadProject() {
  try {
    const data = await api.get(`/projects/${props.slug}`)
    project.value = data.project
    error.value = ''
  } catch (e) {
    if (e.status !== 401) error.value = e.message || 'Failed to load app.'
  } finally {
    loading.value = false
  }
}

/* ---------- Lifecycle actions ---------- */
async function lifecycle(action) {
  acting.value = action
  error.value = ''
  try {
    const data = await api.post(`/projects/${props.slug}/${action}`)
    if (data && data.project) project.value = data.project
    else await loadProject()
  } catch (e) {
    error.value = e.message || `Failed to ${action}.`
  } finally {
    acting.value = ''
  }
}

/* ---------- Analytics polling ---------- */
async function pollStats() {
  if (document.visibilityState !== 'visible') return
  try {
    const s = await api.get(`/projects/${props.slug}/stats`)
    latestStats.value = s
    const now = new Date()
    history.value.push({
      label: now.toLocaleTimeString(),
      cpu: s.cpu_percent ?? 0,
      mem: s.memory_mb ?? 0
    })
    if (history.value.length > 60) history.value.shift()
  } catch {
    /* transient */
  }
}

function startStats() {
  stopStats()
  history.value = []
  latestStats.value = null
  pollStats()
  statsTimer = setInterval(pollStats, 2000)
}

function stopStats() {
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
}

/* ---------- Env ---------- */
async function loadEnv() {
  try {
    const data = await api.get(`/projects/${props.slug}/env`)
    envKeys.value = data.keys || []
  } catch (e) {
    if (e.status !== 401) envMsg.value = e.message || 'Failed to load env keys.'
  }
}

function addEnvRow() {
  envVars.value.push({ key: '', value: '' })
}

function removeEnvRow(i) {
  envVars.value.splice(i, 1)
  if (!envVars.value.length) addEnvRow()
}

async function saveEnv() {
  envMsg.value = ''
  const vars = {}
  for (const row of envVars.value) {
    const k = row.key.trim()
    if (k) vars[k] = row.value
  }
  if (!Object.keys(vars).length) {
    envMsg.value = 'Add at least one KEY=value pair.'
    return
  }
  envSaving.value = true
  try {
    const data = await api.put(`/projects/${props.slug}/env`, { vars })
    envKeys.value = data.keys || envKeys.value
    envVars.value = [{ key: '', value: '' }]
    envMsg.value = 'Saved. The container is restarting.'
    await loadProject()
  } catch (e) {
    envMsg.value = e.message || 'Failed to save env.'
  } finally {
    envSaving.value = false
  }
}

/* ---------- Redeploy ---------- */
function pickRedeploy() {
  fileInput.value && fileInput.value.click()
}

async function onRedeployFile(e) {
  const f = e.target.files && e.target.files[0]
  if (!f) return
  redeployFile.value = f
  await doRedeploy()
  e.target.value = ''
}

async function doRedeploy() {
  if (!redeployFile.value) return
  redeploying.value = true
  error.value = ''
  try {
    await api.upload(`/deploy/${props.slug}/redeploy`, {
      files: { file: redeployFile.value }
    })
    showBuildLog.value = true
    tab.value = 'Overview'
    await loadProject()
  } catch (e) {
    error.value = e.message || 'Redeploy failed.'
  } finally {
    redeploying.value = false
    redeployFile.value = null
  }
}

/* ---------- Delete ---------- */
async function doDelete() {
  deleting.value = true
  error.value = ''
  try {
    await api.del(`/projects/${props.slug}`)
    router.replace({ name: 'projects' })
  } catch (e) {
    error.value = e.message || 'Delete failed.'
    deleting.value = false
    confirmDelete.value = false
  }
}

/* ---------- Tab side-effects ---------- */
watch(tab, (t) => {
  if (t === 'Analytics') startStats()
  else stopStats()
  if (t === 'Env' && !envKeys.value.length) loadEnv()
})

function onVisibility() {
  if (document.visibilityState === 'visible' && tab.value === 'Analytics' && !statsTimer) {
    startStats()
  }
}

onMounted(async () => {
  await loadProject()
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  stopStats()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <TopBar :title="project ? project.name : 'App'" back>
    <template #actions>
      <StatusBadge v-if="project" :status="project.status" />
    </template>
  </TopBar>

  <div class="page">
    <!-- Skeleton loading -->
    <div v-if="loading" class="stack">
      <div class="skel-card">
        <div class="spread" style="margin-bottom: 14px">
          <div style="flex: 1">
            <div class="skel skel-title" style="width: 55%"></div>
            <div class="skel skel-line" style="width: 30%; margin-top: 8px"></div>
          </div>
          <div class="skel skel-badge"></div>
        </div>
        <div class="skel skel-line" style="width: 70%; margin-top: 12px"></div>
        <div class="skel skel-line" style="width: 60%"></div>
        <div class="skel skel-line" style="width: 50%"></div>
        <div class="skel skel-line" style="width: 65%"></div>
      </div>
      <div class="btn-row">
        <div class="skel" style="height: 46px; border-radius: var(--radius-sm)"></div>
        <div class="skel" style="height: 46px; border-radius: var(--radius-sm)"></div>
        <div class="skel" style="height: 46px; border-radius: var(--radius-sm)"></div>
      </div>
    </div>

    <template v-else-if="project">
      <div class="tabs">
        <button
          v-for="t in TABS"
          :key="t"
          :class="{ active: tab === t }"
          @click="tab = t"
        >
          {{ t }}
        </button>
      </div>

      <div v-if="error" class="error-box" style="margin-bottom: 14px">{{ error }}</div>

      <!-- OVERVIEW -->
      <div v-show="tab === 'Overview'" class="stack">
        <!-- Status hero -->
        <div class="card status-hero">
          <div class="spread">
            <div style="min-width: 0">
              <div class="hero-name">{{ project.name }}</div>
              <div class="mono dim small">/{{ project.slug }}</div>
            </div>
            <StatusBadge :status="project.status" />
          </div>
          <a class="mono small" :href="publicUrl" target="_blank" rel="noopener">{{ publicUrl }}</a>
        </div>

        <div v-if="project.status === 'error'" class="notice-error">
          This app is in an error state — try restarting it.
        </div>
        <div v-else-if="project.status === 'building'" class="notice notice-building">
          <span class="dot"></span>
          <span>This app is building — hang tight.</span>
        </div>

        <div class="btn-row">
          <button
            v-if="project.status !== 'running'"
            class="btn btn-primary"
            :disabled="!!acting"
            @click="lifecycle('start')"
          >
            <span v-if="acting === 'start'" class="spinner"></span><span v-else>Start</span>
          </button>
          <button
            v-if="project.status === 'running'"
            class="btn"
            :disabled="!!acting"
            @click="lifecycle('stop')"
          >
            <span v-if="acting === 'stop'" class="spinner"></span><span v-else>Stop</span>
          </button>
          <button class="btn" :disabled="!!acting" @click="lifecycle('restart')">
            <span v-if="acting === 'restart'" class="spinner"></span><span v-else>Restart</span>
          </button>
          <button class="btn" :disabled="redeploying" @click="pickRedeploy">
            <span v-if="redeploying" class="spinner"></span><span v-else>Redeploy</span>
          </button>
          <button class="btn btn-danger" @click="confirmDelete = true">Delete</button>
        </div>

        <input
          ref="fileInput"
          type="file"
          accept=".zip,application/zip"
          style="display: none"
          @change="onRedeployFile"
        />

        <div class="card">
          <div class="kv"><span class="k">Port</span><span class="v mono">{{ project.port ?? '–' }}</span></div>
          <div class="kv"><span class="k">Container</span><span class="v mono small">{{ project.container_id ? String(project.container_id).slice(0, 12) : '–' }}</span></div>
          <div class="kv"><span class="k">Deployed</span><span class="v small">{{ fmtDate(project.created_at) }}</span></div>
          <div class="kv"><span class="k">Last updated</span><span class="v small">{{ fmtDate(project.updated_at) }}</span></div>
        </div>

        <div v-if="showBuildLog" class="card">
          <div class="label">Redeploy build log</div>
          <LogConsole :slug="project.slug" mode="build" />
        </div>
      </div>

      <!-- ANALYTICS -->
      <div v-show="tab === 'Analytics'">
        <div v-if="project.status !== 'running'" class="notice" style="margin-bottom: 14px">
          App is not running — live stats are unavailable.
        </div>
        <StatsCharts :history="history" :latest="latestStats" />
      </div>

      <!-- LOGS -->
      <div v-show="tab === 'Logs'">
        <LogConsole v-if="tab === 'Logs'" :slug="project.slug" mode="logs" />
      </div>

      <!-- CONSOLE -->
      <div v-show="tab === 'Console'">
        <div v-if="project.status !== 'running'" class="notice" style="margin-bottom: 14px">
          The interactive console only works while the app is running.
        </div>
        <ExecTerminal v-if="tab === 'Console' && project.status === 'running'" :slug="project.slug" />
      </div>

      <!-- ENV -->
      <div v-show="tab === 'Env'" class="stack">
        <div class="notice">
          Saving environment variables restarts the container. Existing values are never shown for
          security.
        </div>

        <div class="card">
          <div class="label">Current keys</div>
          <div v-if="!envKeys.length" class="muted small">No environment variables set.</div>
          <div v-else class="row" style="flex-wrap: wrap; gap: 8px">
            <span
              v-for="k in envKeys"
              :key="k"
              class="badge badge-stopped mono"
            >{{ k }}</span>
          </div>
        </div>

        <div class="card stack">
          <div class="label" style="margin: 0">Add / update variables</div>
          <div v-for="(row, i) in envVars" :key="i" class="row">
            <input v-model="row.key" placeholder="KEY" autocapitalize="characters" autocorrect="off" />
            <input v-model="row.value" placeholder="value" autocorrect="off" />
            <button class="iconbtn" aria-label="Remove" @click="removeEnvRow(i)">✕</button>
          </div>
          <button class="btn" @click="addEnvRow">+ Add row</button>
          <div v-if="envMsg" class="notice">{{ envMsg }}</div>
          <button class="btn btn-primary btn-block" :disabled="envSaving" @click="saveEnv">
            <span v-if="envSaving" class="spinner"></span><span v-else>Save & restart</span>
          </button>
        </div>
      </div>
    </template>

    <div v-else class="error-box">{{ error || 'App not found.' }}</div>
  </div>

  <!-- Delete confirm -->
  <transition name="fade">
    <div v-if="confirmDelete" class="modal-backdrop" @click.self="confirmDelete = false">
      <div class="modal stack">
        <h3>Delete app?</h3>
        <p class="muted small" style="margin: 0">
          This permanently removes <strong>{{ project?.name }}</strong> and its container. This
          cannot be undone.
        </p>
        <div class="btn-row">
          <button class="btn" :disabled="deleting" @click="confirmDelete = false">Cancel</button>
          <button class="btn btn-danger" :disabled="deleting" @click="doDelete">
            <span v-if="deleting" class="spinner"></span><span v-else>Delete</span>
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>
