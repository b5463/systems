<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { api } from '../api/client'
import SelectMenu from '../components/SelectMenu.vue'

const entries = ref([])
const total = ref(0)
const loading = ref(true)
const refreshing = ref(false)
const lastChecked = ref(null)
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
  password_reset: 'Reset password',
  // SYSTEMS. operating on itself
  backup_succeeded: 'Backup succeeded',
  backup_failed: 'Backup failed',
  restore_started: 'Restore started',
  restore_completed: 'Restore completed',
  update_started: 'Update started',
  update_failed: 'Update failed',
  update_completed: 'Update completed',
  caddy_validate_failed: 'Caddy config invalid',
  docker_unavailable: 'Docker unavailable',
  postgres_unavailable: 'Postgres unavailable',
  disk_warning: 'Disk warning',
  backup_overdue: 'Backup overdue',
  resource_warning: 'Resource warning'
}

function humanize(action) {
  if (!action) return 'Event'
  return ACTION_LABELS[action] || (action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' '))
}

const actionMenuOptions = [
  { value: '', label: 'All event types' },
  ...ACTION_OPTIONS.map((a) => ({ value: a, label: humanize(a) })),
]

function dotClass(action) {
  switch (action) {
    case 'deploy': case 'redeploy': return 'ok'
    case 'start': case 'restart': return 'ok'
    case 'backup_succeeded': case 'update_completed': case 'restore_completed': return 'ok'
    case 'stop': return 'idle'
    case 'login_fail': case 'delete': case 'user_delete': case 'error':
    case 'backup_failed': case 'update_failed': case 'caddy_validate_failed':
    case 'docker_unavailable': case 'postgres_unavailable': return 'error'
    case 'env_update': case 'rollback':
    case 'disk_warning': case 'backup_overdue': case 'resource_warning':
    case 'restore_started': case 'update_started': return 'warn'
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
  if (!loading.value) refreshing.value = true
  try {
    const params = new URLSearchParams()
    if (filterAction.value) params.set('action', filterAction.value)
    if (filterTarget.value.trim()) params.set('target', filterTarget.value.trim())
    if (filterUser.value.trim()) params.set('username', filterUser.value.trim())
    const qs = params.toString()
    const data = await api.get(`/audit${qs ? `?${qs}` : ''}`)
    entries.value = data.entries || []
    total.value = data.total ?? entries.value.length
    lastChecked.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    if (e.status !== 401) error.value = e.message || 'Failed to load events.'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

watch(filterAction, () => load())
watch([filterTarget, filterUser], () => {
  clearTimeout(textDebounce)
  textDebounce = setTimeout(() => load(), 300)
})

onMounted(load)
onBeforeUnmount(() => clearTimeout(textDebounce))
</script>

<template>
  <div class="page-head">
    <h1>Events</h1>
    <div class="head-actions">
      <button class="btn btn-sm btn-ghost" data-refresh :disabled="refreshing" @click="load">
        <span v-if="refreshing" class="spinner"></span><span v-else>Refresh</span>
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="card stack" style="gap: 10px; margin-bottom: 20px">
    <div class="row flex-wrap" style="gap: 10px">
      <div class="field-group" style="flex:1; min-width:160px">
        <label class="field-label">Event type</label>
        <SelectMenu v-model="filterAction" :options="actionMenuOptions" placeholder="All event types" />
      </div>
      <div class="field-group" style="flex:1; min-width:150px">
        <label class="field-label" for="ev-target">System</label>
        <input id="ev-target" v-model="filterTarget" autocapitalize="none" autocorrect="off" />
      </div>
      <div class="field-group" style="flex:1; min-width:150px">
        <label class="field-label" for="ev-user">Admin</label>
        <input id="ev-user" v-model="filterUser" autocapitalize="none" autocorrect="off" />
      </div>
    </div>
    <div class="row" style="gap:12px; align-items:center">
      <span class="small muted">{{ total }} event{{ total === 1 ? '' : 's' }}</span>
      <span v-if="lastChecked" class="small dim">Checked {{ lastChecked }}</span>
    </div>
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
    <div class="eb-sub">Actions you take are recorded here.</div>
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
              <div class="row gap-sm" style="min-width:0">
                <strong>{{ humanize(e.action) }}</strong>
                <span v-if="e.target" class="chip">{{ e.target }}</span>
              </div>
              <span class="dim small" style="white-space:nowrap">{{ fmtTime(e.created_at) }}</span>
            </div>
            <div v-if="e.detail" class="small muted" style="margin-top:6px">{{ e.detail }}</div>
            <div class="row small dim" style="margin-top:8px; gap:14px">
              <span class="mono">{{ e.username || 'system' }}</span>
              <span v-if="e.ip" class="mono">{{ e.ip }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>
