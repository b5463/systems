<script setup>
import { ref, onMounted, watch } from 'vue'
import { api } from '../api/client'
import TopBar from '../components/TopBar.vue'

const entries = ref([])
const total = ref(0)
const loading = ref(true)
const error = ref('')

/* ---- Filters ---- */
const ACTION_OPTIONS = [
  'deploy',
  'restart',
  'stop',
  'start',
  'login',
  'login_fail',
  'env_update',
  'delete',
  'rollback'
]
const filterAction = ref('')
const filterTarget = ref('')
const filterUser = ref('')
let textDebounce = null

function fmtDate(s) {
  if (!s) return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString()
}

const ACTION_LABELS = {
  deploy: 'Deployed',
  redeploy: 'Redeployed',
  restart: 'Restarted',
  stop: 'Stopped',
  start: 'Started',
  login: 'Signed in',
  login_fail: 'Failed login',
  env_update: 'Updated env vars',
  delete: 'Deleted app',
  rollback: 'Rolled back'
}

function humanize(action) {
  if (!action) return 'Activity'
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  return action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ')
}

function dotColor(action) {
  switch (action) {
    case 'deploy':
    case 'redeploy':
      return '#2dd4bf'
    case 'start':
    case 'restart':
      return '#3fb950'
    case 'stop':
      return '#4c5766'
    case 'error':
    case 'login_fail':
    case 'delete':
      return '#f85149'
    case 'env_update':
      return '#d29922'
    case 'login':
      return '#58a6ff'
    default:
      return '#4c5766'
  }
}

async function load() {
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (filterAction.value) params.set('action', filterAction.value)
    if (filterTarget.value.trim()) params.set('target', filterTarget.value.trim())
    if (filterUser.value.trim()) params.set('username', filterUser.value.trim())
    const qs = params.toString()
    const data = await api.get(`/audit${qs ? `?${qs}` : ''}`)
    entries.value = data.entries || []
    total.value = data.total ?? entries.value.length
  } catch (e) {
    if (e.status !== 401) error.value = e.message || 'Failed to load activity.'
  } finally {
    loading.value = false
  }
}

// Dropdown changes refetch immediately; text inputs debounce 300ms.
watch(filterAction, () => load())
watch([filterTarget, filterUser], () => {
  clearTimeout(textDebounce)
  textDebounce = setTimeout(() => load(), 300)
})

onMounted(load)
</script>

<template>
  <TopBar title="Activity">
    <template #actions>
      <button class="iconbtn" aria-label="Refresh" @click="load">
        <svg viewBox="0 0 24 24" stroke-width="1.75">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 4v5h-5" />
        </svg>
      </button>
    </template>
  </TopBar>

  <div class="page">
    <!-- Filter bar -->
    <div class="card stack" style="gap: 10px; margin-bottom: 14px">
      <select v-model="filterAction">
        <option value="">All actions</option>
        <option v-for="a in ACTION_OPTIONS" :key="a" :value="a">{{ a }}</option>
      </select>
      <div class="row" style="gap: 10px">
        <input v-model="filterTarget" placeholder="Filter by app" autocapitalize="none" autocorrect="off" />
        <input v-model="filterUser" placeholder="Filter by user" autocapitalize="none" autocorrect="off" />
      </div>
      <div class="small muted">{{ total }} result{{ total === 1 ? '' : 's' }}</div>
    </div>

    <!-- Skeleton loading -->
    <div v-if="loading" class="timeline">
      <div v-for="i in 4" :key="i" class="tl-item">
        <div class="tl-rail">
          <span class="skel" style="width: 11px; height: 11px; border-radius: 50%"></span>
          <span v-if="i < 4" class="tl-line"></span>
        </div>
        <div class="tl-body skel-card" :style="{ animationDelay: (i - 1) * 0.08 + 's', padding: '12px 14px' }">
          <div class="spread">
            <div class="skel skel-title" style="width: 40%"></div>
            <div class="skel skel-line" style="width: 60px"></div>
          </div>
          <div class="skel skel-line" style="width: 55%; margin-top: 8px"></div>
        </div>
      </div>
    </div>

    <div v-else-if="error" class="error-box">{{ error }}</div>

    <div v-else-if="!entries.length" class="empty">
      <svg class="empty-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="5" x2="21" y2="5" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="3" y1="15" x2="14" y2="15" />
      </svg>
      <p>No activity yet.</p>
    </div>

    <!-- Timeline -->
    <div v-else class="timeline">
      <div v-for="(e, idx) in entries" :key="e.id" class="tl-item">
        <div class="tl-rail">
          <span class="tl-dot" :style="{ background: dotColor(e.action) }"></span>
          <span v-if="idx < entries.length - 1" class="tl-line"></span>
        </div>
        <div class="tl-body card" style="padding: 12px 14px">
          <div class="spread">
            <strong>{{ humanize(e.action) }}</strong>
            <span class="dim small" style="white-space: nowrap">{{ fmtDate(e.created_at) }}</span>
          </div>
          <div v-if="e.target" class="mono small muted" style="margin-top: 4px">
            {{ e.target }}
          </div>
          <div v-if="e.detail" class="small muted" style="margin-top: 4px">{{ e.detail }}</div>
          <div
            v-if="e.username || e.ip"
            class="row small dim"
            style="margin-top: 8px; gap: 14px"
          >
            <span v-if="e.username" class="mono">{{ e.username }}</span>
            <span v-if="e.ip" class="mono">{{ e.ip }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
