<script setup>
import { ref, onMounted } from 'vue'
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
    case 'unavailable': return { tone: 'error', label: 'Not connected' }
    case 'unknown': return { tone: 'idle', label: 'Not measured yet' }
    case 'not_measured': return { tone: 'idle', label: 'Not measured yet' }
    default: return { tone: 'idle', label: '—' }
  }
}

onMounted(load)
</script>

<template>
  <div class="server-head">
    <div class="art-layer art-topology ambient" aria-hidden="true"></div>
    <div class="page-head" style="margin-bottom:0">
      <div>
        <h1>Server</h1>
        <div class="sub">Infrastructure SYSTEMS. depends on. Status is observed, never assumed.</div>
      </div>
      <div class="head-actions">
        <button class="btn btn-sm btn-ghost" @click="load">Refresh</button>
      </div>
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
      <!-- Docker -->
      <div class="conn-row">
        <span class="conn-ico">
          <svg viewBox="0 0 24 24"><rect x="3" y="9" width="4" height="4" /><rect x="8" y="9" width="4" height="4" /><rect x="13" y="9" width="4" height="4" /><path d="M3 16h15a4 4 0 0 0 4-4" /></svg>
        </span>
        <div>
          <div class="c-name">Docker engine</div>
          <div class="c-sub">
            <template v-if="info.docker.status === 'connected'">
              {{ info.docker.managed ?? 0 }} managed · {{ info.docker.running ?? 0 }} running
            </template>
            <template v-else>container runtime</template>
          </div>
        </div>
        <div class="conn-state">
          <span class="sdot" :class="present(info.docker.status).tone"></span>
          {{ present(info.docker.status).label }}
        </div>
      </div>

      <!-- Reverse proxy -->
      <div class="conn-row">
        <span class="conn-ico">
          <svg viewBox="0 0 24 24"><path d="M4 12h16" /><path d="M4 12a8 8 0 0 1 8-8" /><path d="M20 12a8 8 0 0 1-8 8" /></svg>
        </span>
        <div>
          <div class="c-name">Reverse proxy</div>
          <div class="c-sub">{{ info.reverseProxy.type }}</div>
        </div>
        <div class="conn-state">
          <span class="sdot" :class="present(info.reverseProxy.status).tone"></span>
          {{ present(info.reverseProxy.status).label }}
        </div>
      </div>

      <!-- Database -->
      <div class="conn-row">
        <span class="conn-ico">
          <svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>
        </span>
        <div>
          <div class="c-name">Internal database</div>
          <div class="c-sub">{{ info.database.type }}</div>
        </div>
        <div class="conn-state">
          <span class="sdot" :class="present(info.database.status).tone"></span>
          {{ present(info.database.status).label }}
        </div>
      </div>

      <!-- Wildcard DNS -->
      <div class="conn-row">
        <span class="conn-ico">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.5 4 5.6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.6-4-9s1.5-6.5 4-9Z" /></svg>
        </span>
        <div>
          <div class="c-name">Wildcard DNS</div>
          <div class="c-sub">{{ info.wildcard.domain || ('*.' + BASE_DOMAIN) }}</div>
        </div>
        <div class="conn-state">
          <span class="sdot" :class="present(info.wildcard.status).tone"></span>
          {{ present(info.wildcard.status).label }}
        </div>
      </div>
    </div>

    <!-- Platform facts -->
    <div class="section-label">Platform</div>
    <div class="card">
      <div class="kv"><span class="k">Version</span><span class="v mono">SYSTEMS. {{ info.platform.version }}</span></div>
      <div class="kv"><span class="k">Base domain</span><span class="v mono">{{ info.platform.baseDomain || BASE_DOMAIN }}</span></div>
      <div class="kv"><span class="k">Dashboard</span><span class="v mono">{{ info.platform.dashboardDomain || ('systems.' + BASE_DOMAIN) }}</span></div>
      <div class="kv"><span class="k">Wildcard</span><span class="v mono">{{ info.platform.wildcardDomain || ('*.' + BASE_DOMAIN) }}</span></div>
    </div>

    <div class="callout warn mt">
      <div class="co-bar"></div>
      <div>
        DNS records are managed manually in Websupport and point the wildcard at this server.
        SYSTEMS. cannot verify external resolution from inside the container, so wildcard status
        is reported as <span class="mono">not measured</span>. The Caddy reverse proxy and Postgres
        migration land in V1.2.
      </div>
    </div>
  </template>
</template>

<style scoped>
.server-head {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  background: #08080a;
  padding: 22px 22px;
  margin-bottom: 22px;
}
.server-head > .page-head { position: relative; z-index: 1; }
.server-head .art-layer { z-index: 0; opacity: 0.4; }
</style>
