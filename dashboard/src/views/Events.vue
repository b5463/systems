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
const viewMode = ref('timeline')
const page = ref(1)
const perPage = 25

const ACTION_LABELS = {
  deploy: 'Shipped system', redeploy: 'Redeployed', rollback: 'Rolled back',
  restart: 'Restarted', stop: 'Stopped', start: 'Started',
  login: 'Signed in', login_fail: 'Failed sign-in', logout: 'Signed out',
  env_update: 'Updated env vars', delete: 'Deleted system',
  user_create: 'Added admin', user_delete: 'Removed admin',
  password_change: 'Changed password', password_reset: 'Reset password',
  backup_succeeded: 'Backup succeeded', backup_failed: 'Backup failed',
  restore_started: 'Restore started', restore_completed: 'Restore completed',
  update_started: 'Update started', update_failed: 'Update failed',
  update_completed: 'Update completed', caddy_validate_failed: 'Caddy config invalid',
  docker_unavailable: 'Docker unavailable', postgres_unavailable: 'Postgres unavailable',
  disk_warning: 'Disk warning', backup_overdue: 'Backup overdue', resource_warning: 'Resource warning'
}

const ACTION_CATEGORIES = {
  deploy: ['deploy', 'redeploy', 'rollback', 'start', 'stop', 'restart'],
  auth: ['login', 'login_fail', 'password_change'],
  admin: ['user_create', 'user_delete', 'env_update', 'delete'],
  system: ['backup_succeeded', 'backup_failed', 'restore_started', 'restore_completed',
    'update_started', 'update_failed', 'update_completed', 'caddy_validate_failed',
    'docker_unavailable', 'postgres_unavailable', 'disk_warning', 'backup_overdue', 'resource_warning'],
}

const categoryMenuOptions = [
  { value: '', label: 'All categories' },
  { value: 'deploy', label: 'Deploys & ops' },
  { value: 'auth', label: 'Auth' },
  { value: 'admin', label: 'Admin' },
  { value: 'system', label: 'System events' },
]

const filterCategory = ref('')
const filterAction = ref('')
const filterTarget = ref('')
const filterUser = ref('')
const filterFrom = ref('')
const filterTo = ref('')
let textDebounce = null

const filteredActionOptions = computed(() => {
  const base = filterCategory.value ? (ACTION_CATEGORIES[filterCategory.value] || []) : Object.keys(ACTION_LABELS).slice(0, 13)
  return [{ value: '', label: 'All event types' }, ...base.map(a => ({ value: a, label: humanize(a) }))]
})

function humanize(action) {
  if (!action) return 'Event'
  return ACTION_LABELS[action] || (action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' '))
}

function dotClass(action) {
  switch (action) {
    case 'deploy': case 'redeploy': case 'start': case 'restart':
    case 'backup_succeeded': case 'update_completed': case 'restore_completed': return 'ok'
    case 'stop': return 'idle'
    case 'login_fail': case 'delete': case 'user_delete': case 'error':
    case 'backup_failed': case 'update_failed': case 'caddy_validate_failed':
    case 'docker_unavailable': case 'postgres_unavailable': return 'error'
    case 'env_update': case 'rollback': case 'disk_warning': case 'backup_overdue':
    case 'resource_warning': case 'restore_started': case 'update_started': return 'warn'
    default: return 'idle'
  }
}

function fmtTime(s) {
  if (!s) return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDateTime(s) {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

const grouped = computed(() => {
  const groups = []
  let current = null
  for (const e of entries.value) {
    const key = dayKey(e.created_at)
    if (!current || current.key !== key) { current = { key, items: [] }; groups.push(current) }
    current.items.push(e)
  }
  return groups
})

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / perPage)))
const hasActiveFilters = computed(() =>
  !!(filterCategory.value || filterAction.value || filterTarget.value.trim() ||
     filterUser.value.trim() || filterFrom.value || filterTo.value)
)

async function load() {
  error.value = ''
  if (!loading.value) refreshing.value = true
  try {
    const params = new URLSearchParams()
    if (filterAction.value) params.set('action', filterAction.value)
    if (filterTarget.value.trim()) params.set('target', filterTarget.value.trim())
    if (filterUser.value.trim()) params.set('username', filterUser.value.trim())
    if (filterFrom.value) params.set('from', filterFrom.value + 'T00:00:00.000Z')
    if (filterTo.value) params.set('to', filterTo.value + 'T23:59:59.999Z')
    params.set('limit', String(perPage))
    params.set('offset', String((page.value - 1) * perPage))
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

function clearFilters() {
  filterCategory.value = ''; filterAction.value = ''
  filterTarget.value = ''; filterUser.value = ''
  filterFrom.value = ''; filterTo.value = ''
  page.value = 1; load()
}

function exportCSV() {
  const rows = [['Date/Time', 'Action', 'System', 'Admin', 'IP', 'Detail']]
  for (const e of entries.value) {
    rows.push([e.created_at, humanize(e.action), e.target || '', e.username || 'system', e.ip || '', e.detail || ''])
  }
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'events.csv'; a.click()
  URL.revokeObjectURL(url)
}

function goPage(n) {
  if (n < 1 || n > pageCount.value) return
  page.value = n; load()
}

watch(filterCategory, () => {
  if (filterAction.value && filterCategory.value) {
    const allowed = ACTION_CATEGORIES[filterCategory.value] || []
    if (!allowed.includes(filterAction.value)) filterAction.value = ''
  }
  page.value = 1; load()
})
watch(filterAction, () => { page.value = 1; load() })
watch([filterTarget, filterUser, filterFrom, filterTo], () => {
  clearTimeout(textDebounce)
  textDebounce = setTimeout(() => { page.value = 1; load() }, 300)
})

onMounted(load)
onBeforeUnmount(() => clearTimeout(textDebounce))
</script>

<template>
  <div class="page-head">
    <h1>Events</h1>
    <div class="head-actions">
      <button v-if="entries.length" class="btn btn-sm btn-ghost" title="Export visible events as CSV" @click="exportCSV">Export CSV</button>
      <button class="btn btn-sm btn-ghost" data-refresh :disabled="refreshing" @click="load">
        <span v-if="refreshing" class="spinner"></span><span v-else>Refresh</span>
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="card stack" style="gap: 10px; margin-bottom: 20px">
    <div class="row flex-wrap" style="gap: 10px">
      <div class="field-group" style="min-width:150px; flex:1">
        <label class="field-label">Category</label>
        <SelectMenu v-model="filterCategory" :options="categoryMenuOptions" placeholder="All categories" />
      </div>
      <div class="field-group" style="min-width:160px; flex:1">
        <label class="field-label">Event type</label>
        <SelectMenu v-model="filterAction" :options="filteredActionOptions" placeholder="All event types" />
      </div>
      <div class="field-group" style="min-width:130px; flex:1">
        <label class="field-label" for="ev-target">System</label>
        <input id="ev-target" v-model="filterTarget" autocapitalize="none" autocorrect="off" />
      </div>
      <div class="field-group" style="min-width:130px; flex:1">
        <label class="field-label" for="ev-user">Admin</label>
        <input id="ev-user" v-model="filterUser" autocapitalize="none" autocorrect="off" />
      </div>
    </div>
    <div class="row flex-wrap" style="gap: 10px; align-items: flex-end">
      <div class="field-group" style="min-width:140px">
        <label class="field-label" for="ev-from">From</label>
        <input id="ev-from" v-model="filterFrom" type="date" style="min-height:38px; padding:8px 10px; font-size:13px" />
      </div>
      <div class="field-group" style="min-width:140px">
        <label class="field-label" for="ev-to">To</label>
        <input id="ev-to" v-model="filterTo" type="date" style="min-height:38px; padding:8px 10px; font-size:13px" />
      </div>
      <div style="flex:1"></div>
      <div class="row gap-sm" style="padding-bottom: 2px; flex-wrap: wrap">
        <span class="small muted">{{ total }} event{{ total === 1 ? '' : 's' }}</span>
        <span v-if="lastChecked" class="small dim">Checked {{ lastChecked }}</span>
        <button v-if="hasActiveFilters" class="btn btn-sm btn-ghost" @click="clearFilters">Clear filters</button>
      </div>
    </div>
    <!-- View mode toggle -->
    <div class="row" style="gap: 6px; border-top: 1px solid var(--border-soft); padding-top: 10px">
      <button class="btn btn-sm" :class="viewMode === 'timeline' ? '' : 'btn-ghost'" @click="viewMode = 'timeline'">Timeline</button>
      <button class="btn btn-sm" :class="viewMode === 'table' ? '' : 'btn-ghost'" @click="viewMode = 'table'">Table</button>
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

  <!-- Filter-aware empty state -->
  <div v-else-if="!entries.length" class="empty-block">
    <div class="eb-title">{{ hasActiveFilters ? 'No events match your filters.' : 'No events yet.' }}</div>
    <div class="eb-sub">{{ hasActiveFilters ? 'Try adjusting or clearing the filters to see more events.' : 'Admin and system actions are recorded here as they happen.' }}</div>
    <div v-if="hasActiveFilters" class="eb-actions">
      <button class="btn btn-sm" @click="clearFilters">Clear filters</button>
    </div>
  </div>

  <!-- TABLE VIEW -->
  <template v-else-if="viewMode === 'table'">
    <div class="card" style="padding: 0; overflow: hidden">
      <div style="overflow-x: auto">
        <table class="ev-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>System</th>
              <th>Admin</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in entries" :key="e.id">
              <td class="mono small" style="white-space:nowrap; color:var(--text-dim)">{{ fmtDateTime(e.created_at) }}</td>
              <td>
                <span style="display:inline-flex; align-items:center; gap:8px; white-space:nowrap">
                  <span class="sdot" :class="dotClass(e.action)" style="flex-shrink:0"></span>
                  {{ humanize(e.action) }}
                </span>
              </td>
              <td><span v-if="e.target" class="chip">{{ e.target }}</span></td>
              <td class="mono small muted">{{ e.username || 'system' }}</td>
              <td class="mono small dim">{{ e.ip || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </template>

  <!-- TIMELINE VIEW -->
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

  <!-- Pagination -->
  <div v-if="!loading && !error && pageCount > 1" class="ev-pagination">
    <button class="btn btn-sm btn-ghost" :disabled="page === 1" @click="goPage(page - 1)">← Prev</button>
    <span class="small muted">Page {{ page }} of {{ pageCount }}</span>
    <button class="btn btn-sm btn-ghost" :disabled="page === pageCount" @click="goPage(page + 1)">Next →</button>
  </div>
</template>

<style scoped>
.ev-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.ev-table th {
  text-align: left;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  font-weight: 700;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-soft);
  white-space: nowrap;
  background: var(--bg-elevated);
}
.ev-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-soft);
  vertical-align: middle;
}
.ev-table tbody tr:last-child td { border-bottom: none; }
.ev-table tbody tr:hover td { background: var(--bg-hover); }
.ev-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
}
</style>
