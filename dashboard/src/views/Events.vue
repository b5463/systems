<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'
import SelectMenu from '../components/SelectMenu.vue'
import Icon from '../components/Icon.vue'

const route = useRoute()
const router = useRouter()
const entries = ref([])
const total = ref(0)
const loading = ref(true)
const refreshing = ref(false)
const lastChecked = ref(null)
const error = ref('')
const viewMode = ref(String(route.query.view || localStorage.getItem('events:view') || 'timeline'))
// Whether the view was deliberately chosen (query/localStorage) — if not, the
// first load defaults to the denser table on desktop once there are many events.
const viewExplicit = !!(route.query.view || localStorage.getItem('events:view'))
let firstLoad = true
const page = ref(Number(route.query.page) || 1)
const perPage = 25

const ACTION_LABELS = {
  deploy: 'Deployed system', deploy_fail: 'Deploy failed', redeploy: 'Redeployed', redeploy_fail: 'Redeploy failed',
  rollback: 'Rolled back', restart: 'Restarted', stop: 'Stopped', start: 'Started',
  github_push: 'GitHub push deploy', exec_open: 'Console opened',
  delete: 'Deleted system', purge: 'Purged system',
  visibility_change: 'Changed visibility', route_publish: 'Published route',
  repo_set: 'Set repo mapping', primary_set: 'Set root domain', db_provisioned: 'Provisioned database',
  health_ok: 'Health check passed', health_fail: 'Health check failed',
  login: 'Signed in', login_fail: 'Failed sign-in', login_locked: 'Sign-in locked out',
  logout: 'Signed out', sessions_revoked: 'Signed out other sessions', session_revoked: 'Revoked a session',
  '2fa_enabled': 'Enabled two-factor', '2fa_disabled': 'Disabled two-factor',
  env_update: 'Updated env vars',
  user_create: 'Added admin', user_delete: 'Removed admin',
  password_change: 'Changed password', password_reset: 'Reset password',
  backup_succeeded: 'Backup succeeded', backup_failed: 'Backup failed',
  disk_cleanup: 'Disk cleanup', reconcile: 'Status reconciled', build_stuck: 'Build recovered',
  restore_started: 'Restore started', restore_completed: 'Restore completed',
  update_started: 'Update started', update_failed: 'Update failed',
  update_completed: 'Update completed', caddy_validate_failed: 'Caddy config invalid',
  docker_unavailable: 'Docker unavailable', postgres_unavailable: 'Postgres unavailable',
  disk_warning: 'Disk warning', backup_overdue: 'Backup overdue', resource_warning: 'Resource warning'
}

const ACTION_CATEGORIES = {
  deploy: ['deploy', 'redeploy', 'redeploy_fail', 'rollback', 'start', 'stop', 'restart', 'github_push'],
  auth: ['login', 'login_fail', 'login_locked', 'logout', 'sessions_revoked', 'session_revoked',
    'password_change', '2fa_enabled', '2fa_disabled'],
  admin: ['user_create', 'user_delete', 'env_update', 'delete'],
  system: ['backup_succeeded', 'backup_failed', 'restore_started', 'restore_completed',
    'update_started', 'update_failed', 'update_completed', 'caddy_validate_failed',
    'docker_unavailable', 'postgres_unavailable', 'disk_warning', 'backup_overdue', 'resource_warning'],
}

const SYSTEM_TARGET_ACTIONS = new Set([
  'deploy', 'redeploy', 'redeploy_fail', 'rollback', 'start', 'stop', 'restart', 'github_push',
  'env_update', 'delete', 'purge', 'visibility_change', 'health_ok', 'health_fail',
  'db_provisioned', 'repo_set', 'primary_set', 'reconcile', 'build_stuck'
])
const AUTH_TARGET_ACTIONS = new Set(['login', 'login_fail', 'login_locked'])
const ADMIN_TARGET_ACTIONS = new Set(['user_create', 'user_delete', 'password_reset', 'password_change'])

const categoryMenuOptions = [
  { value: '', label: 'All categories' },
  { value: 'deploy', label: 'Deploys & ops' },
  { value: 'auth', label: 'Auth' },
  { value: 'admin', label: 'Admin' },
  { value: 'system', label: 'System events' },
]

const severityMenuOptions = [
  { value: '', label: 'Any result' },
  { value: 'ok', label: 'Success' },
  { value: 'warn', label: 'Warning' },
  { value: 'error', label: 'Failure' },
]

const filterCategory = ref(String(route.query.category || ''))
const filterAction = ref(String(route.query.action || ''))
const filterSeverity = ref(String(route.query.result || ''))
const filterTarget = ref(String(route.query.target || ''))
const filterUser = ref(String(route.query.actor || ''))
const filterFrom = ref(String(route.query.from || ''))
const filterTo = ref(String(route.query.to || ''))
let textDebounce = null
let syncingQuery = false

const filteredActionOptions = computed(() => {
  const base = filterCategory.value ? (ACTION_CATEGORIES[filterCategory.value] || []) : Object.keys(ACTION_LABELS)
  return [{ value: '', label: 'All event types' }, ...base.map(a => ({ value: a, label: humanize(a) }))]
})

function humanize(action) {
  if (!action) return 'Event'
  return ACTION_LABELS[action] || (action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' '))
}

function actorLabel(e) {
  if (e.username) return e.username
  if (AUTH_TARGET_ACTIONS.has(e.action)) return 'Anonymous'
  return 'System'
}

function targetKind(e) {
  if (!e.target) return ''
  if (SYSTEM_TARGET_ACTIONS.has(e.action)) return 'System'
  if (AUTH_TARGET_ACTIONS.has(e.action)) return 'Username'
  if (ADMIN_TARGET_ACTIONS.has(e.action)) return 'Admin'
  return 'Target'
}

function dotClass(action) {
  switch (action) {
    case 'deploy': case 'redeploy': case 'start': case 'restart': case 'login': case '2fa_enabled':
    case 'github_push': case 'route_publish': case 'db_provisioned': case 'health_ok':
    case 'backup_succeeded': case 'update_completed': case 'restore_completed': return 'ok'
    case 'stop': case 'logout': return 'idle'
    case 'login_fail': case 'login_locked': case 'delete': case 'purge': case 'user_delete': case 'error':
    case 'deploy_fail': case 'redeploy_fail': case 'health_fail': case 'backup_failed': case 'update_failed':
    case 'caddy_validate_failed': case 'docker_unavailable': case 'postgres_unavailable': return 'error'
    case 'env_update': case 'rollback': case 'disk_warning': case 'backup_overdue': case 'sessions_revoked':
    case 'session_revoked': case '2fa_disabled': case 'visibility_change': case 'primary_set': case 'build_stuck':
    case 'resource_warning': case 'restore_started': case 'update_started': return 'warn'
    default: return 'idle'
  }
}

// Every known action that carries a given severity (derived from dotClass) —
// backs the severity filter, which the API receives as an `actions` list.
function severityActions(sev) {
  return Object.keys(ACTION_LABELS).filter((a) => dotClass(a) === sev)
}

// The effective set of actions to query: a specific event type wins, else the
// chosen severity, else the chosen category. Empty = no action constraint.
const effectiveActions = computed(() => {
  if (filterAction.value) return [filterAction.value]
  if (filterSeverity.value) return severityActions(filterSeverity.value)
  if (filterCategory.value) return ACTION_CATEGORIES[filterCategory.value] || []
  return []
})

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

const expandedId = ref(null)
function toggleRow(id) { expandedId.value = expandedId.value === id ? null : id }

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / perPage)))
const activeFilterCount = computed(() =>
  [filterCategory.value, filterAction.value, filterSeverity.value, filterTarget.value.trim(),
    filterUser.value.trim(), filterFrom.value, filterTo.value].filter(Boolean).length
)
const hasActiveFilters = computed(() =>
  activeFilterCount.value > 0
)

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function setDateShortcut(kind) {
  const now = new Date()
  const start = new Date(now)
  if (kind === 'today') {
    filterFrom.value = isoDate(now)
    filterTo.value = isoDate(now)
  } else if (kind === '7d') {
    start.setDate(start.getDate() - 6)
    filterFrom.value = isoDate(start)
    filterTo.value = isoDate(now)
  } else if (kind === '30d') {
    start.setDate(start.getDate() - 29)
    filterFrom.value = isoDate(start)
    filterTo.value = isoDate(now)
  }
  page.value = 1
  syncQuery()
  load()
}

async function load() {
  error.value = ''
  if (!loading.value) refreshing.value = true
  try {
    const params = new URLSearchParams()
    const acts = effectiveActions.value
    if (acts.length) params.set('actions', acts.join(','))
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
    // On a fresh desktop visit with many events, prefer the denser table view.
    if (firstLoad) {
      firstLoad = false
      if (!viewExplicit && total.value > 30 && window.matchMedia('(min-width: 900px)').matches) {
        viewMode.value = 'table'
      }
    }
  } catch (e) {
    if (e.status !== 401) error.value = e.message || 'Failed to load events.'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function clearFilters() {
  filterCategory.value = ''; filterAction.value = ''; filterSeverity.value = ''
  filterTarget.value = ''; filterUser.value = ''
  filterFrom.value = ''; filterTo.value = ''
  page.value = 1; syncQuery(); load()
}

function syncQuery() {
  if (syncingQuery) return
  const query = {}
  if (viewMode.value !== 'timeline') query.view = viewMode.value
  if (page.value > 1) query.page = String(page.value)
  if (filterCategory.value) query.category = filterCategory.value
  if (filterAction.value) query.action = filterAction.value
  if (filterSeverity.value) query.result = filterSeverity.value
  if (filterTarget.value.trim()) query.target = filterTarget.value.trim()
  if (filterUser.value.trim()) query.actor = filterUser.value.trim()
  if (filterFrom.value) query.from = filterFrom.value
  if (filterTo.value) query.to = filterTo.value
  router.replace({ query })
}

function exportCSV() {
  const rows = [['Date/Time', 'Action', 'Target type', 'Target', 'Actor', 'IP', 'Detail']]
  for (const e of entries.value) {
    rows.push([e.created_at, humanize(e.action), targetKind(e), e.target || '', actorLabel(e), e.ip || '', e.detail || ''])
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
  page.value = n; syncQuery(); load()
}

watch(filterCategory, () => {
  if (syncingQuery) return
  if (filterAction.value && filterCategory.value) {
    const allowed = ACTION_CATEGORIES[filterCategory.value] || []
    if (!allowed.includes(filterAction.value)) filterAction.value = ''
  }
  page.value = 1; syncQuery(); load()
})
watch([filterAction, filterSeverity], () => { if (syncingQuery) return; page.value = 1; syncQuery(); load() })
watch(viewMode, (v) => { if (syncingQuery) return; localStorage.setItem('events:view', v); syncQuery() })
watch([filterTarget, filterUser, filterFrom, filterTo], () => {
  if (syncingQuery) return
  clearTimeout(textDebounce)
  textDebounce = setTimeout(() => { page.value = 1; syncQuery(); load() }, 300)
})
watch(
  () => route.query,
  (q) => {
    syncingQuery = true
    viewMode.value = String(q.view || localStorage.getItem('events:view') || 'timeline')
    page.value = Number(q.page) || 1
    filterCategory.value = String(q.category || '')
    filterAction.value = String(q.action || '')
    filterSeverity.value = String(q.result || '')
    filterTarget.value = String(q.target || '')
    filterUser.value = String(q.actor || '')
    filterFrom.value = String(q.from || '')
    filterTo.value = String(q.to || '')
    syncingQuery = false
    load()
  }
)

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
        <label class="field-label" for="ev-category">Category</label>
        <SelectMenu id="ev-category" v-model="filterCategory" :options="categoryMenuOptions" placeholder="All categories" />
      </div>
      <div class="field-group" style="min-width:160px; flex:1">
        <label class="field-label" for="ev-action">Event type</label>
        <SelectMenu id="ev-action" v-model="filterAction" :options="filteredActionOptions" placeholder="All event types" />
      </div>
      <div class="field-group" style="min-width:130px; flex:1">
        <label class="field-label" for="ev-severity">Result</label>
        <SelectMenu id="ev-severity" v-model="filterSeverity" :options="severityMenuOptions" placeholder="Any result" />
      </div>
      <div class="field-group" style="min-width:130px; flex:1">
        <label class="field-label" for="ev-target">Target</label>
        <input id="ev-target" v-model="filterTarget" autocapitalize="none" autocorrect="off" />
      </div>
      <div class="field-group" style="min-width:130px; flex:1">
        <label class="field-label" for="ev-user">Actor</label>
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
        <span v-if="activeFilterCount" class="chip">{{ activeFilterCount }} filter{{ activeFilterCount === 1 ? '' : 's' }}</span>
        <span v-if="lastChecked" class="small dim">Checked {{ lastChecked }}</span>
        <button class="btn btn-sm btn-ghost" @click="setDateShortcut('today')">Today</button>
        <button class="btn btn-sm btn-ghost" @click="setDateShortcut('7d')">7 days</button>
        <button class="btn btn-sm btn-ghost" @click="setDateShortcut('30d')">30 days</button>
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
    <div class="ev-card-list">
      <button v-for="e in entries" :key="e.id" class="ev-card" :aria-expanded="expandedId === e.id" @click="toggleRow(e.id)">
        <span class="ev-card-top">
          <span class="row gap-sm" style="min-width:0">
            <span class="sdot" :class="dotClass(e.action)"></span>
            <strong>{{ humanize(e.action) }}</strong>
          </span>
          <span class="mono small dim">{{ fmtDateTime(e.created_at) }}</span>
        </span>
        <span class="ev-card-meta">
          <span v-if="e.target" class="chip"><span class="dim">{{ targetKind(e) }}</span>{{ e.target }}</span>
          <span class="mono">{{ actorLabel(e) }}</span>
          <span v-if="e.ip" class="mono">{{ e.ip }}</span>
        </span>
        <span v-if="expandedId === e.id" class="ev-card-detail">
          <span v-if="e.detail">{{ e.detail }}</span>
          <span class="mono dim small">{{ e.action }} · {{ e.created_at }}</span>
        </span>
      </button>
    </div>
    <div class="card" style="padding: 0; overflow: hidden">
      <div class="ev-table-scroll">
        <table class="ev-table">
          <thead>
            <tr>
              <th style="width:1%"></th>
              <th>Time</th>
              <th>Action</th>
              <th>Target</th>
              <th>Actor</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="e in entries" :key="e.id">
              <tr class="ev-trow" :class="{ open: expandedId === e.id }" :aria-expanded="expandedId === e.id" @click="toggleRow(e.id)">
                <td class="ev-caret"><span :class="{ rot: expandedId === e.id }"><Icon name="chevron-right" /></span></td>
                <td class="mono small" style="white-space:nowrap; color:var(--text-dim)">{{ fmtDateTime(e.created_at) }}</td>
                <td>
                  <span style="display:inline-flex; align-items:center; gap:8px; white-space:nowrap">
                    <span class="sdot" :class="dotClass(e.action)" style="flex-shrink:0"></span>
                    {{ humanize(e.action) }}
                  </span>
                </td>
                <td>
                  <span v-if="e.target" class="chip">
                    <span class="dim">{{ targetKind(e) }}</span>{{ e.target }}
                  </span>
                </td>
                <td class="mono small muted">{{ actorLabel(e) }}</td>
                <td class="mono small dim">{{ e.ip || '—' }}</td>
              </tr>
              <tr v-if="expandedId === e.id" class="ev-detail-row">
                <td></td>
                <td colspan="5">
                  <div class="ev-detail">
                    <div class="kv"><span class="k">When</span><span class="v mono small">{{ e.created_at }}</span></div>
                    <div class="kv"><span class="k">Event</span><span class="v">{{ humanize(e.action) }} <span class="mono dim small">({{ e.action }})</span></span></div>
                    <div v-if="e.target" class="kv"><span class="k">{{ targetKind(e) }}</span><span class="v mono small">{{ e.target }}</span></div>
                    <div class="kv"><span class="k">Actor</span><span class="v mono small">{{ actorLabel(e) }}</span></div>
                    <div class="kv"><span class="k">IP address</span><span class="v mono small">{{ e.ip || '—' }}</span></div>
                    <div v-if="e.detail" class="kv"><span class="k">Detail</span><span class="v small">{{ e.detail }}</span></div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </template>

  <!-- TIMELINE VIEW -->
  <template v-else>
    <div v-for="group in grouped" :key="group.key" style="margin-bottom: 24px">
      <h2 class="section-label">{{ group.key }}</h2>
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
                <span v-if="e.target" class="chip"><span class="dim">{{ targetKind(e) }}</span>{{ e.target }}</span>
              </div>
              <span class="dim small" style="white-space:nowrap">{{ fmtTime(e.created_at) }}</span>
            </div>
            <div v-if="e.detail" class="small muted" style="margin-top:6px">{{ e.detail }}</div>
            <div class="row small dim" style="margin-top:8px; gap:14px">
              <span class="mono">{{ actorLabel(e) }}</span>
              <span v-if="e.ip" class="mono">{{ e.ip }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>

  <!-- Pagination -->
  <div v-if="!loading && !error && pageCount > 1" class="ev-pagination">
    <button class="btn btn-sm btn-ghost" :disabled="page === 1" @click="goPage(page - 1)"><Icon name="arrow-left" /> Prev</button>
    <span class="small muted">Page {{ page }} of {{ pageCount }}</span>
    <button class="btn btn-sm btn-ghost" :disabled="page === pageCount" @click="goPage(page + 1)">Next <Icon name="arrow-right" /></button>
  </div>
</template>

<style scoped>
/* Historical log dots are static — pulsing many at once is noise (BRAND §6). */
.timeline .sdot, .ev-table .sdot, .ev-card .sdot { animation: none; }
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
.ev-trow { cursor: pointer; }
.ev-trow:hover td { background: var(--bg-hover); }
.ev-trow.open td { background: var(--bg-elevated); border-bottom-color: transparent; }
.ev-caret { color: var(--text-dim); width: 1%; }
.ev-caret span { display: inline-block; transition: transform 0.15s ease; }
.ev-caret span.rot { transform: rotate(90deg); }
.ev-detail-row td { background: var(--bg-elevated); padding: 0 14px 12px; }
.ev-detail { display: flex; flex-direction: column; gap: 2px; padding: 4px 0 2px; }
.ev-detail .kv { padding: 5px 0; border-bottom: 1px solid var(--border-soft); }
.ev-detail .kv:last-child { border-bottom: none; }
.ev-card-list { display: none; }
.ev-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 9px;
  text-align: left;
  padding: 12px 14px;
  margin: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  color: var(--text);
  cursor: pointer;
}
.ev-card + .ev-card { margin-top: 10px; }
.ev-card-top,
.ev-card-meta,
.ev-card-detail {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ev-card-top { justify-content: space-between; }
.ev-card-meta { flex-wrap: wrap; color: var(--text-muted); font-size: 12px; }
.ev-card-detail {
  align-items: flex-start;
  flex-direction: column;
  padding-top: 8px;
  border-top: 1px solid var(--border-soft);
  color: var(--text-muted);
  font-size: 13px;
}
@media (prefers-reduced-motion: reduce) { .ev-caret span { transition: none; } }
.ev-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
}
@media (max-width: 599px) {
  .ev-card-list { display: block; }
  .ev-table-scroll { display: none; }
}
</style>
