<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api/client'
import { BASE_DOMAIN } from '../config'

const info = ref(null)
const loading = ref(true)
const refreshing = ref(false)
const loadedAt = ref(null)
const error = ref('')

const DEFAULT_INFO = {
  platform: {},
  docker: { status: 'not_measured', managed: null, running: null },
  caddy: { status: 'not_measured' },
  postgres: { status: 'not_measured' },
  wildcard: { domain: null, status: 'not_measured' },
  self: null,
  health: {
    deploymentWorker: 'not_measured',
    dockerAccess: 'not_measured',
    caddyConfig: 'not_measured',
    postgres: 'not_measured',
  },
  disk: { status: 'not_measured', usedPct: null, freeGb: null, totalGb: null },
  backup: {
    status: 'not_measured',
    last: null,
    ageHours: null,
    count: 0,
    destination: '',
    scheduler: 'disabled',
    intervalHours: 24,
    retentionCount: 7,
    restoreScript: 'scripts/restore-systems-windows.ps1',
    lastFailure: null,
  },
  defaults: null,
  features: null,
}

function normalizeInfo(data) {
  const source = data && typeof data === 'object' ? data : {}
  return {
    ...DEFAULT_INFO,
    ...source,
    platform: { ...DEFAULT_INFO.platform, ...(source.platform || {}) },
    docker: { ...DEFAULT_INFO.docker, ...(source.docker || {}) },
    caddy: { ...DEFAULT_INFO.caddy, ...(source.caddy || {}) },
    postgres: { ...DEFAULT_INFO.postgres, ...(source.postgres || {}) },
    wildcard: { ...DEFAULT_INFO.wildcard, ...(source.wildcard || {}) },
    health: { ...DEFAULT_INFO.health, ...(source.health || {}) },
    disk: { ...DEFAULT_INFO.disk, ...(source.disk || {}) },
    backup: { ...DEFAULT_INFO.backup, ...(source.backup || {}) },
    features: source.features || null,
  }
}

async function load() {
  error.value = ''
  if (!loading.value) refreshing.value = true
  try {
    info.value = normalizeInfo(await api.get('/server/info'))
    loadedAt.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    if (e.status !== 401) error.value = e.message || 'Failed to reach the server.'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const backingUp = ref(false)
const backupMsg = ref('')
async function runBackup() {
  backupMsg.value = ''
  backingUp.value = true
  try {
    await api.post('/server/backup')
    backupMsg.value = 'Backup created.'
    await load()
  } catch (e) {
    backupMsg.value = e.message || 'Backup failed.'
  } finally {
    backingUp.value = false
  }
}

const cleanupInfo = ref(null)
const cleaningUp = ref(false)
const cleanupMsg = ref('')

async function loadCleanup() {
  try {
    cleanupInfo.value = await api.get('/server/cleanup/preview')
  } catch { /* best-effort */ }
}

async function doCleanup() {
  cleanupMsg.value = ''
  cleaningUp.value = true
  try {
    const result = await api.post('/server/cleanup')
    const parts = []
    if (result.imagesPruned) parts.push(`${result.imagesPruned} image${result.imagesPruned !== 1 ? 's' : ''} removed (~${result.imagesSizeMb} MB)`)
    if (result.releasesPruned) parts.push(`${result.releasesPruned} release dir${result.releasesPruned !== 1 ? 's' : ''} removed`)
    cleanupMsg.value = parts.length ? parts.join(', ') + '.' : 'Nothing to clean up.'
    await loadCleanup()
  } catch (e) {
    cleanupMsg.value = e.message || 'Cleanup failed.'
  } finally {
    cleaningUp.value = false
  }
}

const testingNotify = ref(false)
const notifyMsg = ref('')
async function testNotify() {
  notifyMsg.value = ''
  testingNotify.value = true
  try {
    await api.post('/server/notify-test')
    notifyMsg.value = 'Test notification sent.'
  } catch (e) {
    notifyMsg.value = e.message || 'Could not send.'
  } finally {
    testingNotify.value = false
  }
}

async function copyDiagnostic(command) {
  if (!command || !navigator.clipboard) return
  try { await navigator.clipboard.writeText(command) } catch { /* clipboard unavailable */ }
}

// Honest status → tone + label. Never invents "online".
function present(status) {
  switch (status) {
    case 'connected': return { tone: 'ok', label: 'Connected' }
    case 'measured': return { tone: 'ok', label: 'OK' }
    case 'ok': return { tone: 'ok', label: 'OK' }
    case 'in_api': return { tone: 'ok', label: 'In-process' }
    case 'unavailable': return { tone: 'error', label: 'Not connected' }
    case 'overdue': return { tone: 'warn', label: 'Overdue' }
    case 'none': return { tone: 'warn', label: 'None yet' }
    case 'host_validation': return { tone: 'config', label: 'Needs host setup' }
    case 'planned': return { tone: 'idle', label: 'Planned' }
    case 'not_configured': return { tone: 'idle', label: 'Not configured' }
    case 'not_measured': return { tone: 'idle', label: 'Not measured' }
    default: return { tone: 'idle', label: '—' }
  }
}

function fmtUptime(s) {
  if (!s && s !== 0) return '—'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

function fmtDateTime(value) {
  if (!value) return 'Never'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const disk = computed(() => {
  const d = info.value?.disk
  if (!d || d.status !== 'measured') return { tone: 'idle', label: 'Not measured yet', sub: 'data volume' }
  const tone = d.usedPct >= 90 ? 'error' : d.usedPct >= 75 ? 'warn' : 'ok'
  return { tone, label: `${d.usedPct}% used`, sub: `${d.freeGb} GB free of ${d.totalGb} GB` }
})

const backup = computed(() => {
  const b = info.value?.backup
  if (!b) return { tone: 'idle', label: 'Not measured yet', sub: '' }
  const p = present(b.status)
  let sub = 'no backups found'
  if (b.last) {
    const age = b.ageHours != null
      ? (b.ageHours < 1 ? 'under 1h ago' : b.ageHours < 24 ? `${b.ageHours}h ago` : `${Math.floor(b.ageHours / 24)}d ${Math.floor(b.ageHours % 24)}h ago`)
      : ''
    sub = `${b.count} backup${b.count !== 1 ? 's' : ''}${age ? ' · last ' + age : ''}`
  }
  return { tone: p.tone, label: p.label, sub }
})

const backupDetails = computed(() => {
  const b = info.value?.backup || DEFAULT_INFO.backup
  const schedulerEnabled = b.scheduler === 'enabled'
  return {
    destination: b.destination || 'Not configured',
    last: fmtDateTime(b.last),
    count: `${b.count || 0} snapshot${b.count === 1 ? '' : 's'}`,
    scheduler: schedulerEnabled
      ? `Enabled - every ${b.intervalHours || 24}h`
      : `Disabled - set ENABLE_BACKUP_SCHEDULER=true for automatic backups`,
    retention: `${b.retentionCount || 7} snapshot${(b.retentionCount || 7) === 1 ? '' : 's'} retained`,
    restoreScript: b.restoreScript || 'scripts/restore-systems-windows.ps1',
    lastFailure: b.lastFailure || 'None reported',
  }
})

const defaults = computed(() => {
  const d = info.value?.defaults
  if (!d) return null
  return {
    memMb: Math.round((d.Memory || 0) / (1024 * 1024)),
    cpu: d.CpuPeriod ? Math.round((d.CpuQuota / d.CpuPeriod) * 100) / 100 : '—',
    pids: d.PidsLimit ?? '—',
    restart: d.RestartPolicy?.Name || '—',
    logSize: d.LogConfig?.Config?.['max-size'] || '—',
    logFile: d.LogConfig?.Config?.['max-file'] || '—'
  }
})

// Critical operational alerts — surfaced as prominent banners at the top of the page.
// Only raised when the data has actually been measured (not for "not_measured" states).
const criticals = computed(() => {
  if (!info.value) return []
  const alerts = []
  const d = info.value.disk
  const b = info.value.backup
  if (d?.status === 'measured' && d.usedPct >= 90) {
    alerts.push({ level: 'error', message: `Disk is ${d.usedPct}% full — only ${d.freeGb} GB free. Free space before deploying.`, next: 'Review cleanup candidates below, then run cleanup if the list is safe.', command: 'docker system df' })
  } else if (d?.status === 'measured' && d.usedPct >= 75) {
    alerts.push({ level: 'warn', message: `Disk is ${d.usedPct}% full (${d.freeGb} GB free). Consider running disk cleanup.`, next: 'Check orphaned images and release directories before the next large deploy.', command: 'docker system df' })
  }
  if (b?.status === 'none') {
    alerts.push({ level: 'warn', message: 'No backups found. Run a backup before deploying to production.', next: 'Use Back up now, then verify the backup destination contains the new snapshot.' })
  } else if (b?.status === 'overdue') {
    alerts.push({ level: 'warn', message: `Backup overdue — last backup was ${b.ageHours}h ago (threshold: 168h).`, next: 'Run a fresh backup and check whether the scheduler is enabled on the host.' })
  }
  if (info.value.docker?.status === 'unavailable') {
    alerts.push({ level: 'error', message: 'Docker is not reachable. Deploys will fail until Docker is running.', next: 'Start Docker Desktop, confirm Linux containers are active, then refresh this page.', command: 'docker version' })
  }
  return alerts
})

onMounted(() => { load(); loadCleanup(); })
</script>

<template>
  <div class="page-head">
    <h1>Server</h1>
    <div class="head-actions">
      <span v-if="loadedAt" class="small dim" style="align-self:center">{{ loadedAt }}</span>
      <button class="btn btn-sm btn-ghost" data-refresh :disabled="refreshing" @click="load">
        <span v-if="refreshing" class="spinner"></span><span v-else>Refresh</span>
      </button>
    </div>
  </div>

  <div v-if="loading" class="card" style="padding:0">
    <div v-for="i in 4" :key="i" class="conn-row">
      <div class="skel" style="width:34px;height:34px;border-radius:8px"></div>
      <div style="flex:1"><div class="skel skel-title" style="width:30%"></div><div class="skel skel-line" style="width:45%;margin-top:8px"></div></div>
    </div>
  </div>

  <div v-else-if="error" class="error-box">{{ error }}</div>

  <template v-else-if="info">
    <!-- Critical operational alerts — disk, backups, Docker -->
    <div
      v-for="(alert, i) in criticals"
      :key="i"
      class="critical-banner"
      :class="alert.level"
    >
      <svg class="cb-icon" viewBox="0 0 20 20" fill="none">
        <path v-if="alert.level === 'error'" d="M10 3L18 17H2L10 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        <path v-else d="M10 6v5m0 3h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <circle v-if="alert.level === 'warn'" cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/>
        <line v-if="alert.level === 'error'" x1="10" y1="9" x2="10" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <circle v-if="alert.level === 'error'" cx="10" cy="15.5" r="0.75" fill="currentColor"/>
      </svg>
      <div class="alert-body">
        <strong>{{ alert.message }}</strong>
        <span v-if="alert.next">{{ alert.next }}</span>
        <button v-if="alert.command" class="btn btn-sm btn-ghost" @click="copyDiagnostic(alert.command)">Copy diagnostic command</button>
      </div>
    </div>

    <!-- Infrastructure (locked target stack) -->
    <div class="section-label">Infrastructure</div>
    <div class="card" style="padding:0; margin-bottom: 22px">
      <div class="conn-row">
        <span class="conn-ico"><svg viewBox="0 0 24 24"><rect x="3" y="9" width="4" height="4" /><rect x="8" y="9" width="4" height="4" /><rect x="13" y="9" width="4" height="4" /><path d="M3 16h15a4 4 0 0 0 4-4" /></svg></span>
        <div>
          <div class="c-name">Docker</div>
          <div class="c-sub"><template v-if="info.docker.status === 'connected'">{{ info.docker.managed ?? 0 }} managed · {{ info.docker.running ?? 0 }} running</template><template v-else>container runtime</template></div>
        </div>
        <div class="conn-state"><span class="sdot" :class="present(info.docker.status).tone"></span>{{ present(info.docker.status).label }}</div>
      </div>
      <div class="conn-row">
        <span class="conn-ico"><svg viewBox="0 0 24 24"><path d="M4 12h16" /><path d="M4 12a8 8 0 0 1 8-8" /><path d="M20 12a8 8 0 0 1-8 8" /></svg></span>
        <div><div class="c-name">Caddy</div><div class="c-sub">reverse proxy · TLS</div></div>
        <div class="conn-state"><span class="sdot" :class="present(info.caddy.status).tone"></span>{{ present(info.caddy.status).label }}</div>
      </div>
      <div class="conn-row">
        <span class="conn-ico"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg></span>
        <div><div class="c-name">Postgres</div><div class="c-sub">internal database</div></div>
        <div class="conn-state"><span class="sdot" :class="present(info.postgres.status).tone"></span>{{ present(info.postgres.status).label }}</div>
      </div>
      <div class="conn-row">
        <span class="conn-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.5 4 5.6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.6-4-9s1.5-6.5 4-9Z" /></svg></span>
        <div><div class="c-name">Wildcard DNS</div><div class="c-sub">{{ info.wildcard.domain || ('*.' + BASE_DOMAIN) }}</div></div>
        <div class="conn-state"><span class="sdot" :class="present(info.wildcard.status).tone"></span>{{ present(info.wildcard.status).label }}</div>
      </div>
    </div>

    <!-- SYSTEMS. runtime -->
    <div class="section-label">SYSTEMS. runtime</div>
    <div class="card" style="padding:0; margin-bottom: 22px">
      <div class="conn-row">
        <div class="c-name" style="flex:1">Dashboard</div>
        <div class="conn-state"><span class="sdot ok"></span>Reachable</div>
      </div>
      <div class="conn-row">
        <div style="flex:1">
          <div class="c-name">API</div>
          <div v-if="info.self" class="c-sub">uptime {{ fmtUptime(info.self.uptimeSeconds) }} · {{ info.self.rssMb }} MB · node {{ info.self.node }}</div>
        </div>
        <div class="conn-state"><span class="sdot ok"></span>Reachable</div>
      </div>
      <div class="conn-row">
        <div class="c-name" style="flex:1">Deploy worker</div>
        <div class="conn-state"><span class="sdot" :class="present(info.health.deploymentWorker).tone"></span>{{ present(info.health.deploymentWorker).label }}</div>
      </div>
      <div class="conn-row">
        <div style="flex:1">
          <div class="c-name">Disk</div>
          <div class="c-sub">{{ disk.sub }}</div>
          <div v-if="info.disk?.status === 'measured'" class="disk-bar" style="margin-top:5px">
            <div class="disk-fill" :class="disk.tone" :style="{ width: info.disk.usedPct + '%' }"></div>
          </div>
        </div>
        <div class="conn-state"><span class="sdot" :class="disk.tone"></span>{{ disk.label }}</div>
      </div>
      <div class="conn-row">
        <div style="flex:1"><div class="c-name">Backups</div><div class="c-sub">{{ backupMsg || backup.sub }}</div></div>
        <div class="row gap-sm" style="align-items:center">
          <button class="btn btn-sm" :disabled="backingUp" @click="runBackup">
            <span v-if="backingUp" class="spinner"></span><span v-else>Back up now</span>
          </button>
          <div class="conn-state"><span class="sdot" :class="backup.tone"></span>{{ backup.label }}</div>
        </div>
      </div>
      <div class="conn-row">
        <div style="flex:1"><div class="c-name">Firewall</div><div class="c-sub">check-firewall-windows.ps1</div></div>
        <div class="conn-state"><span class="sdot" :class="present(info.platform.firewall).tone"></span>{{ present(info.platform.firewall).label }}</div>
      </div>
      <div class="conn-row">
        <div style="flex:1"><div class="c-name">Hardening</div><div class="c-sub">verify-hardening-windows.ps1</div></div>
        <div class="conn-state"><span class="sdot" :class="present(info.platform.hardening).tone"></span>{{ present(info.platform.hardening).label }}</div>
      </div>
    </div>

    <!-- Disk cleanup -->
    <div v-if="cleanupInfo" class="section-label">Disk cleanup</div>
    <div v-if="cleanupInfo" class="card stack" style="margin-bottom: 22px">
      <div class="kv">
        <span class="k">Orphaned images</span>
        <span class="v mono">{{ cleanupInfo.images.count }} image{{ cleanupInfo.images.count !== 1 ? 's' : '' }}
          <template v-if="cleanupInfo.images.sizeMb > 0"> · ~{{ cleanupInfo.images.sizeMb }} MB</template>
        </span>
      </div>
      <div v-if="cleanupInfo.releases.count > 0" class="kv">
        <span class="k">Orphaned release dirs</span>
        <span class="v mono">{{ cleanupInfo.releases.count }}</span>
      </div>
      <div class="hint">Images no longer referenced by any system (current or rollback) are safe to remove. Rollback targets are always kept.</div>
      <div class="row gap-sm" style="align-items:center">
        <button
          class="btn btn-sm"
          style="align-self:flex-start"
          :disabled="cleaningUp || (cleanupInfo.images.count === 0 && cleanupInfo.releases.count === 0)"
          @click="doCleanup"
        >
          <span v-if="cleaningUp" class="spinner"></span>
          <span v-else>Clean up now</span>
        </button>
        <span v-if="cleanupMsg" class="notice" style="margin:0">{{ cleanupMsg }}</span>
      </div>
    </div>

    <!-- Backup and restore -->
    <div class="section-label">Backup and restore</div>
    <div class="card stack" style="margin-bottom: 22px">
      <div class="kv"><span class="k">Destination</span><span class="v mono small">{{ backupDetails.destination }}</span></div>
      <div class="kv"><span class="k">Last successful backup</span><span class="v">{{ backupDetails.last }}</span></div>
      <div class="kv"><span class="k">Available snapshots</span><span class="v mono">{{ backupDetails.count }}</span></div>
      <div class="kv"><span class="k">Scheduler</span><span class="v">{{ backupDetails.scheduler }}</span></div>
      <div class="kv"><span class="k">Retention</span><span class="v mono">{{ backupDetails.retention }}</span></div>
      <div class="kv"><span class="k">Restore script</span><span class="v mono small">{{ backupDetails.restoreScript }}</span></div>
      <div class="kv"><span class="k">Last failure</span><span class="v">{{ backupDetails.lastFailure }}</span></div>
      <div class="row gap-sm" style="align-items:center">
        <button class="btn btn-sm" :disabled="backingUp" @click="runBackup">
          <span v-if="backingUp" class="spinner"></span><span v-else>Back up now</span>
        </button>
        <span class="notice" style="margin:0">Restore is manual so production recovery remains deliberate.</span>
      </div>
    </div>

    <!-- Platform -->
    <div class="section-label">Platform</div>
    <div class="card" style="margin-bottom: 22px">
      <div class="kv"><span class="k">Version</span><span class="v mono">SYSTEMS. {{ info.platform.version }}</span></div>
      <div v-if="info.platform.stage" class="kv"><span class="k">Stage</span><span class="v">{{ info.platform.stage }}</span></div>
      <div class="kv"><span class="k">Commit</span><span class="v mono small">{{ info.platform.commit || '—' }}</span></div>
      <div class="kv"><span class="k">Target</span><span class="v">{{ info.platform.target }}</span></div>
      <div class="kv"><span class="k">Base domain</span><span class="v mono">{{ info.platform.baseDomain || BASE_DOMAIN }}</span></div>
      <div class="kv"><span class="k">Dashboard</span><span class="v mono">{{ info.platform.dashboardDomain || ('systems.' + BASE_DOMAIN) }}</span></div>
      <div class="kv"><span class="k">Wildcard</span><span class="v mono">{{ info.platform.wildcardDomain || ('*.' + BASE_DOMAIN) }}</span></div>
      <div class="kv"><span class="k">Data directory</span><span class="v mono small">{{ info.platform.dataDir }}</span></div>
      <div class="kv"><span class="k">Upload limit</span><span class="v mono">{{ info.platform.uploadMaxMb }} MB</span></div>
      <div class="kv"><span class="k">Release retention</span><span class="v mono">{{ info.platform.releaseRetention }}</span></div>
    </div>

    <!-- Deployed-system defaults -->
    <div v-if="defaults" class="section-label">Deployed-system defaults</div>
    <div v-if="defaults" class="card" style="margin-bottom: 22px">
      <div class="kv"><span class="k">Memory limit</span><span class="v mono">{{ defaults.memMb }} MB</span></div>
      <div class="kv"><span class="k">CPU limit</span><span class="v mono">{{ defaults.cpu }} cores</span></div>
      <div class="kv"><span class="k">PIDs limit</span><span class="v mono">{{ defaults.pids }}</span></div>
      <div class="kv"><span class="k">Restart policy</span><span class="v mono">{{ defaults.restart }}</span></div>
      <div class="kv"><span class="k">Log rotation</span><span class="v mono">{{ defaults.logSize }} × {{ defaults.logFile }}</span></div>
    </div>

    <!-- V2 feature flags -->
    <div v-if="info.features" class="section-label">V2 features</div>
    <div v-if="info.features" class="card" style="margin-bottom: 22px">
      <div class="kv"><span class="k">Dockerfile mode</span><span class="v">{{ info.features.dockerfileMode ? 'Enabled' : 'Disabled' }}</span></div>
      <div class="kv"><span class="k">Shell console</span><span class="v">{{ info.features.shellConsole ? 'Enabled' : 'Disabled' }}</span></div>
      <div class="kv"><span class="k">DB provisioning</span><span class="v">{{ info.features.dbProvisioning ? 'Enabled' : 'Disabled' }}</span></div>
      <div class="kv"><span class="k">DB mode</span><span class="v mono">{{ info.features.dbMode }}</span></div>
      <div class="kv"><span class="k">GitHub deploys</span><span class="v">{{ info.features.githubDeploys ? 'Enabled' : 'Disabled' }}</span></div>
      <div class="kv"><span class="k">Large uploads</span><span class="v">{{ info.features.largeUploads ? 'Enabled' : 'Disabled' }}</span></div>
      <div class="kv"><span class="k">Notifications</span><span class="v">{{ info.features.notifications ? 'Enabled' : 'Disabled' }}</span></div>
      <div class="kv">
        <span class="k">Upload limit</span>
        <span class="v mono">
          {{ info.features.largeUploads ? info.features.v2UploadMaxMb : info.features.uploadMaxMb }} MB
          <template v-if="!info.features.largeUploads"> · {{ info.features.v2UploadMaxMb }} MB when <span class="mono">ENABLE_LARGE_UPLOADS</span> is on</template>
        </span>
      </div>
      <div class="hint">These are wired but off by default; enable each in <span class="mono">.env</span> after validating on the Windows host. Pulling external code (GitHub deploys), running container shells, and provisioning databases are the higher-risk ones.</div>
    </div>

    <!-- Notifications -->
    <div v-if="info.features" class="section-label">Notifications</div>
    <div v-if="info.features" class="card stack" style="margin-bottom: 22px">
      <div class="kv">
        <span class="k">Outbound webhook</span>
        <span class="v">{{ info.features.notifications ? 'Enabled' : 'Disabled' }}</span>
      </div>
      <div class="hint">
        Fires on deploy success/failure, redeploy, and when a system drifts to error.
        Configure with <span class="mono">ENABLE_NOTIFICATIONS</span> + <span class="mono">NOTIFY_WEBHOOK_URL</span>.
      </div>
      <button class="btn btn-sm" style="align-self:flex-start" :disabled="testingNotify || !info.features.notifications" @click="testNotify">
        <span v-if="testingNotify" class="spinner"></span><span v-else>Send test notification</span>
      </button>
      <div v-if="notifyMsg" class="notice">{{ notifyMsg }}</div>
    </div>

    <div class="callout warn">
      <div class="co-bar"></div>
      <div>Caddy routing and Postgres are implemented in the repo; connecting them is a Windows-host step (see docs/WINDOWS_VALIDATION_CHECKLIST.md). DNS is set manually in Websupport and can't be checked from here.</div>
    </div>
  </template>
</template>

<style scoped>
.alert-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.alert-body strong {
  font-size: 13.5px;
  line-height: 1.45;
}
.alert-body .btn {
  align-self: flex-start;
  margin-top: 2px;
}
.disk-bar {
  height: 3px;
  background: var(--bg-elevated);
  border-radius: 2px;
  width: 160px;
  max-width: 100%;
  overflow: hidden;
}
.disk-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--ok);
  transition: width 0.3s ease;
}
.disk-fill.warn { background: var(--warn); }
.disk-fill.error { background: var(--danger); }
</style>
