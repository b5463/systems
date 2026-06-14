<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api/client'

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'acronym.sk'

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

// Map an honest backend status into a UI tone + label. We never invent
// "online" — unknown and not_measured stay visibly unresolved.
function present(status) {
  switch (status) {
    case 'connected': return { tone: 'ok', label: 'Connected' }
    case 'configured': return { tone: 'ok', label: 'Configured' }
    case 'measured': return { tone: 'ok', label: 'Measured' }
    case 'ok': return { tone: 'ok', label: 'OK' }
    case 'unavailable': return { tone: 'error', label: 'Not connected' }
    case 'overdue': return { tone: 'warn', label: 'Overdue' }
    case 'none': return { tone: 'warn', label: 'None yet' }
    case 'unknown': return { tone: 'idle', label: 'Not measured yet' }
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
  if (!d || d.status !== 'measured') return { tone: 'idle', label: 'Not measured yet', sub: '' }
  const tone = d.usedPct >= 90 ? 'error' : d.usedPct >= 75 ? 'warn' : 'ok'
  return { tone, label: `${d.usedPct}% used`, sub: `${d.freeGb} GB free of ${d.totalGb} GB` }
})

const backup = computed(() => {
  const b = info.value?.backup
  if (!b) return { tone: 'idle', label: 'Not measured yet', sub: '' }
  const p = present(b.status)
  let sub = 'no backups found'
  if (b.last) sub = `${b.count} backup(s) · last ${b.ageHours}h ago`
  return { tone: p.tone, label: p.label, sub }
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
      <button class="btn btn-sm btn-ghost" @click="load">Refresh</button>
    </div>
  </div>

  <div v-if="loading" class="card" style="padding:0">
    <div v-for="i in 4" :key="i" class="conn-row">
      <div class="skel" style="width:34px;height:34px;border-radius:8px"></div>
      <div style="flex:1">
        <div class="skel skel-title" style="width:30%"></div>
        <div class="skel skel-line" style="width:45%;margin-top:8px"></div>
      </div>
    </div>
  </div>

  <div v-else-if="error" class="error-box">{{ error }}</div>

  <template v-else-if="info">
    <!-- Core services -->
    <div class="section-label">Core services</div>
    <div class="card" style="padding:0; margin-bottom: 22px">
      <div class="conn-row">
        <span class="conn-ico"><svg viewBox="0 0 24 24"><rect x="3" y="9" width="4" height="4" /><rect x="8" y="9" width="4" height="4" /><rect x="13" y="9" width="4" height="4" /><path d="M3 16h15a4 4 0 0 0 4-4" /></svg></span>
        <div>
          <div class="c-name">Docker engine</div>
          <div class="c-sub">
            <template v-if="info.docker.status === 'connected'">{{ info.docker.managed ?? 0 }} managed · {{ info.docker.running ?? 0 }} running</template>
            <template v-else>container runtime</template>
          </div>
        </div>
        <div class="conn-state"><span class="sdot" :class="present(info.docker.status).tone"></span>{{ present(info.docker.status).label }}</div>
      </div>

      <div class="conn-row">
        <span class="conn-ico"><svg viewBox="0 0 24 24"><path d="M4 12h16" /><path d="M4 12a8 8 0 0 1 8-8" /><path d="M20 12a8 8 0 0 1-8 8" /></svg></span>
        <div><div class="c-name">Reverse proxy</div><div class="c-sub">{{ info.reverseProxy.type }}</div></div>
        <div class="conn-state"><span class="sdot" :class="present(info.reverseProxy.status).tone"></span>{{ present(info.reverseProxy.status).label }}</div>
      </div>

      <div class="conn-row">
        <span class="conn-ico"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg></span>
        <div><div class="c-name">Internal database</div><div class="c-sub">{{ info.database.type }}</div></div>
        <div class="conn-state"><span class="sdot" :class="present(info.database.status).tone"></span>{{ present(info.database.status).label }}</div>
      </div>

      <div class="conn-row">
        <span class="conn-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.5 4 5.6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.6-4-9s1.5-6.5 4-9Z" /></svg></span>
        <div><div class="c-name">Wildcard DNS</div><div class="c-sub">{{ info.wildcard.domain || ('*.' + BASE_DOMAIN) }}</div></div>
        <div class="conn-state"><span class="sdot" :class="present(info.wildcard.status).tone"></span>{{ present(info.wildcard.status).label }}</div>
      </div>
    </div>

    <!-- SYSTEMS. watching itself -->
    <template v-if="info.self">
    <div class="section-label">SYSTEMS. health</div>
    <div class="card" style="padding:0; margin-bottom: 22px">
      <div class="conn-row">
        <span class="conn-ico"><svg viewBox="0 0 24 24"><path d="M3 12h4l2 6 4-12 2 6h6" /></svg></span>
        <div><div class="c-name">Backend / API</div><div class="c-sub">uptime {{ fmtUptime(info.self.uptimeSeconds) }} · {{ info.self.rssMb }} MB · node {{ info.self.node }}</div></div>
        <div class="conn-state"><span class="sdot ok"></span>Reachable</div>
      </div>
      <div class="conn-row">
        <span class="conn-ico"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg></span>
        <div><div class="c-name">Disk</div><div class="c-sub">{{ disk.sub || 'usage of the SYSTEMS data volume' }}</div></div>
        <div class="conn-state"><span class="sdot" :class="disk.tone"></span>{{ disk.label }}</div>
      </div>
      <div class="conn-row">
        <span class="conn-ico"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg></span>
        <div><div class="c-name">Backups</div><div class="c-sub">{{ backup.sub }}</div></div>
        <div class="conn-state"><span class="sdot" :class="backup.tone"></span>{{ backup.label }}</div>
      </div>
    </div>
    </template>

    <!-- Platform facts -->
    <div class="section-label">Platform</div>
    <div class="card" style="margin-bottom: 22px">
      <div class="kv"><span class="k">Version</span><span class="v mono">SYSTEMS. {{ info.platform.version }}</span></div>
      <div class="kv"><span class="k">Base domain</span><span class="v mono">{{ info.platform.baseDomain || BASE_DOMAIN }}</span></div>
      <div class="kv"><span class="k">Dashboard</span><span class="v mono">{{ info.platform.dashboardDomain || ('systems.' + BASE_DOMAIN) }}</span></div>
      <div class="kv"><span class="k">Wildcard</span><span class="v mono">{{ info.platform.wildcardDomain || ('*.' + BASE_DOMAIN) }}</span></div>
    </div>

    <!-- Deployed-system resource defaults -->
    <div v-if="defaults" class="section-label">Deployed-system defaults</div>
    <div v-if="defaults" class="card">
      <div class="kv"><span class="k">Memory limit</span><span class="v mono">{{ defaults.memMb }} MB</span></div>
      <div class="kv"><span class="k">CPU limit</span><span class="v mono">{{ defaults.cpu }} cores</span></div>
      <div class="kv"><span class="k">PIDs limit</span><span class="v mono">{{ defaults.pids }}</span></div>
      <div class="kv"><span class="k">Restart policy</span><span class="v mono">{{ defaults.restart }}</span></div>
      <div class="kv"><span class="k">Log rotation</span><span class="v mono">{{ defaults.logSize }} × {{ defaults.logFile }}</span></div>
      <div class="hint">Applied to every deployed container. Per-system overrides arrive in V1.2.</div>
    </div>

    <div class="callout warn mt">
      <div class="co-bar"></div>
      <div>DNS is set manually in Websupport and can't be checked from here, so wildcard shows <span class="mono">not measured</span>. Caddy and Postgres arrive in V1.2.</div>
    </div>
  </template>
</template>
