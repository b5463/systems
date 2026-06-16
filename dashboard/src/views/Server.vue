<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api/client'
import { BASE_DOMAIN } from '../config'

const info = ref(null)
const loading = ref(true)
const error = ref('')

async function load() {
  error.value = ''
  try {
    info.value = await api.get('/server/info')
  } catch (e) {
    if (e.status !== 401) error.value = e.message || 'Failed to reach the server.'
  } finally {
    loading.value = false
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

// Honest status → tone + label. Never invents "online".
function present(status) {
  switch (status) {
    case 'connected': return { tone: 'ok', label: 'Connected' }
    case 'measured': return { tone: 'ok', label: 'OK' }
    case 'ok': return { tone: 'ok', label: 'OK' }
    case 'in_api': return { tone: 'ok', label: 'Runs in API' }
    case 'unavailable': return { tone: 'error', label: 'Not connected' }
    case 'overdue': return { tone: 'warn', label: 'Overdue' }
    case 'none': return { tone: 'warn', label: 'None yet' }
    case 'host_validation': return { tone: 'idle', label: 'Set up on host' }
    case 'planned': return { tone: 'idle', label: 'Planned' }
    case 'not_configured': return { tone: 'idle', label: 'Not configured' }
    case 'not_measured': return { tone: 'idle', label: 'Not measured yet' }
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
  return { tone: p.tone, label: p.label, sub: b.last ? `${b.count} backup(s) · last ${b.ageHours}h ago` : 'no backups found' }
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
onMounted(load)
</script>

<template>
  <div class="page-head">
    <h1>Server</h1>
    <div class="head-actions">
      <button class="btn btn-sm btn-ghost" data-refresh @click="load">Refresh</button>
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
    <div class="callout" style="margin-bottom: 22px">
      <div class="co-bar" style="background: var(--accent)"></div>
      <div><strong>“Set up on host” and “Not measured yet” are expected, not errors.</strong>
        Caddy and Postgres are built in but connected during the one-time Windows host
        setup; DNS is configured manually. SYSTEMS. only shows a component as connected
        once it has actually observed it.</div>
    </div>

    <!-- Core services (locked target stack) -->
    <div class="section-label">Core services</div>
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

    <!-- SYSTEMS. health -->
    <div class="section-label">SYSTEMS. health</div>
    <div class="card" style="padding:0; margin-bottom: 22px">
      <div class="conn-row">
        <div class="c-name" style="flex:1">Frontend</div>
        <div class="conn-state"><span class="sdot ok"></span>Reachable</div>
      </div>
      <div class="conn-row">
        <div style="flex:1"><div class="c-name">Backend / API</div><div v-if="info.self" class="c-sub">uptime {{ fmtUptime(info.self.uptimeSeconds) }} · {{ info.self.rssMb }} MB · node {{ info.self.node }}</div></div>
        <div class="conn-state"><span class="sdot ok"></span>Reachable</div>
      </div>
      <div class="conn-row">
        <div class="c-name" style="flex:1">Deployment worker</div>
        <div class="conn-state"><span class="sdot" :class="present(info.health.deploymentWorker).tone"></span>{{ present(info.health.deploymentWorker).label }}</div>
      </div>
      <div class="conn-row">
        <div class="c-name" style="flex:1">Docker access</div>
        <div class="conn-state"><span class="sdot" :class="present(info.health.dockerAccess).tone"></span>{{ present(info.health.dockerAccess).label }}</div>
      </div>
      <div class="conn-row">
        <div class="c-name" style="flex:1">Caddy config</div>
        <div class="conn-state"><span class="sdot" :class="present(info.health.caddyConfig).tone"></span>{{ present(info.health.caddyConfig).label }}</div>
      </div>
      <div class="conn-row">
        <div class="c-name" style="flex:1">Postgres connection</div>
        <div class="conn-state"><span class="sdot" :class="present(info.health.postgres).tone"></span>{{ present(info.health.postgres).label }}</div>
      </div>
      <div class="conn-row">
        <div style="flex:1"><div class="c-name">Disk</div><div class="c-sub">{{ disk.sub }}</div></div>
        <div class="conn-state"><span class="sdot" :class="disk.tone"></span>{{ disk.label }}</div>
      </div>
      <div class="conn-row">
        <div style="flex:1"><div class="c-name">Backups</div><div class="c-sub">{{ backupMsg || backup.sub }}</div></div>
        <div class="row gap-sm" style="align-items:center">
          <button class="btn btn-sm btn-ghost" :disabled="backingUp" @click="runBackup">
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
      <div class="kv"><span class="k">Upload limit</span><span class="v mono">{{ info.features.uploadMaxMb }} MB (V2 target {{ info.features.v2UploadMaxMb }} MB)</span></div>
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
