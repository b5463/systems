<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../api/client'

const entries = ref([])
const total = ref(0)
const loading = ref(true)
const error = ref('')

const ACTION_OPTIONS = [
  'deploy', 'redeploy', 'rollback', 'start', 'stop', 'restart',
  'env_update', 'delete', 'login', 'login_fail', 'user_create', 'user_delete', 'password_change'
]
const filterAction = ref('')
const filterTarget = ref('')
const filterUser = ref('')
let textDebounce = null

const ACTION_LABELS = {
  deploy: 'Shipped system',
  redeploy: 'Redeployed',
  rollback: 'Rolled back',
  restart: 'Restarted',
  stop: 'Stopped',
  start: 'Started',
  login: 'Signed in',
  login_fail: 'Failed sign-in',
  logout: 'Signed out',
  env_update: 'Updated env vars',
  delete: 'Deleted system',
  user_create: 'Added admin',
  user_delete: 'Removed admin',
  password_change: 'Changed password',
  password_reset: 'Reset password'
}

function humanize(action) {
  if (!action) return 'Event'
  return ACTION_LABELS[action] || (action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' '))
}

function dotClass(action) {
  switch (action) {
    case 'deploy': case 'redeploy': return 'ok'
    case 'start': case 'restart': return 'ok'
    case 'stop': return 'idle'
    case 'login_fail': case 'delete': case 'user_delete': case 'error': return 'error'
    case 'env_update': case 'rollback': return 'warn'
    default: return 'idle'
  }
}

function fmtTime(s) {
  if (!s) return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function dayKey(s) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return 'Earlier'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(d); that.setHours(0, 0, 0, 0)
  const diff = Math.round((today - that) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

// Group entries by day for a readable stream.
const grouped = computed(() => {
  const groups = []
  let current = null
  for (const e of entries.value) {
    const key = dayKey(e.created_at)
    if (!current || current.key !== key) {
      current = { key, items: [] }
      groups.push(current)
    }
    current.items.push(e)
  }
  return groups
})

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
    if (e.status !== 401) error.value = e.message || 'Failed to load events.'
  } finally {
    loading.value = false
  }
}

watch(filterAction, () => load())
watch([filterTarget, filterUser], () => {
  clearTimeout(textDebounce)
  textDebounce = setTimeout(() => load(), 300)
})

onMounted(load)
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Events</h1>
      <div class="sub">Every admin and deployment action, audited and time-stamped.</div>
    </div>
    <div class="head-actions">
      <button class="btn btn-sm btn-ghost" @click="load">Refresh</button>
    </div>
  </div>

  <!-- Filters -->
  <div class="card stack" style="gap: 10px; margin-bottom: 20px">
    <div class="row flex-wrap" style="gap: 10px">
      <select v-model="filterAction" style="flex:1; min-width: 160px">
        <option value="">All event types</option>
        <option v-for="a in ACTION_OPTIONS" :key="a" :value="a">{{ humanize(a) }}</option>
      </select>
      <input v-model="filterTarget" placeholder="Filter by system" autocapitalize="none" autocorrect="off" style="flex:1; min-width: 150px" />
      <input v-model="filterUser" placeholder="Filter by admin" autocapitalize="none" autocorrect="off" style="flex:1; min-width: 150px" />
    </div>
    <div class="small muted">{{ total }} event{{ total === 1 ? '' : 's' }}</div>
  </div>

  <!-- Skeleton -->
  <div v-if="loading" class="timeline">
    <div v-for="i in 5" :key="i" class="tl-item">
      <div class="tl-rail">
        <span class="skel" style="width:11px;height:11px;border-radius:50%"></span>
        <span v-if="i < 5" class="tl-line"></span>
      </div>
      <div class="tl-body skel-card" :style="{ animationDelay: (i - 1) * 0.07 + 's', padding: '12px 14px' }">
        <div class="spread">
          <div class="skel skel-title" style="width:40%"></div>
          <div class="skel skel-line" style="width:60px"></div>
        </div>
        <div class="skel skel-line" style="width:55%;margin-top:8px"></div>
      </div>
    </div>
  </div>

  <div v-else-if="error" class="error-box">{{ error }}</div>

  <!-- Honest empty state -->
  <div v-else-if="!entries.length" class="empty-block">
    <div class="eb-title">No events yet.</div>
    <div class="eb-sub">
      Activity appears here the moment you sign in, ship a system, or change a setting. Every action
      is recorded to the audit log.
    </div>
  </div>

  <!-- Grouped stream -->
  <template v-else>
    <div v-for="group in grouped" :key="group.key" style="margin-bottom: 24px">
      <div class="section-label">{{ group.key }}</div>
      <div class="timeline">
        <div v-for="(e, idx) in group.items" :key="e.id" class="tl-item">
          <div class="tl-rail">
            <span class="tl-dot sdot" :class="dotClass(e.action)"></span>
            <span v-if="idx < group.items.length - 1" class="tl-line"></span>
          </div>
          <div class="tl-body card" style="padding: 12px 14px">
            <div class="spread">
              <strong>{{ humanize(e.action) }}</strong>
              <span class="dim small" style="white-space:nowrap">{{ fmtTime(e.created_at) }}</span>
            </div>
            <div v-if="e.target" class="mono small muted" style="margin-top:4px">{{ e.target }}</div>
            <div v-if="e.detail" class="small muted" style="margin-top:4px">{{ e.detail }}</div>
            <div v-if="e.username || e.ip" class="row small dim" style="margin-top:8px; gap:14px">
              <span v-if="e.username" class="mono">{{ e.username }}</span>
              <span v-if="e.ip" class="mono">{{ e.ip }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>
