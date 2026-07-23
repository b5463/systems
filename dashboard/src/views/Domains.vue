<script setup>
// V4 Phase 4 — hidden admin/test Domains page (roadmap: "Domain management UI
// in dashboard", "Custom domain add/verify wizard UI"). Same pattern as
// /products and /portfolio: reachable only by URL, no nav entry, and only
// useful once ENABLE_V4_SYSTEMS is on.
//
// Honest-status note: this page is real for list/add/remove, but DNS
// verification, route publication, maintenance mode, and canonical redirect
// selection are Alex's remaining Phase 4 backend work (renderRoute(),
// verification flow, maintenance_windows table, route_status enum). Those
// sections are shown as explicit "not built yet" states, never faked.
import { ref, onMounted } from 'vue'
import { api } from '../api/client'
import Icon from '../components/Icon.vue'

const enabled = ref(true)
const error = ref('')

const systems = ref([])
const domainsBySystem = ref({})
const loadingDomains = ref({})

const addForm = ref({}) // keyed by system id -> hostname string
const adding = ref({})
const addMsg = ref({})

async function loadSystems() {
  error.value = ''
  try {
    const data = await api.get('/systems')
    systems.value = data.systems || []
    enabled.value = true
    await Promise.all(systems.value.map((s) => loadDomains(s.id)))
  } catch (e) {
    if (e.status === 404) { enabled.value = false; systems.value = [] }
    else if (e.status !== 401) error.value = e.message || 'Failed to load systems.'
  }
}

async function loadDomains(systemId) {
  loadingDomains.value = { ...loadingDomains.value, [systemId]: true }
  try {
    const data = await api.get(`/systems/${systemId}/domains`)
    domainsBySystem.value = { ...domainsBySystem.value, [systemId]: data.domains || [] }
  } catch {
    domainsBySystem.value = { ...domainsBySystem.value, [systemId]: [] }
  } finally {
    loadingDomains.value = { ...loadingDomains.value, [systemId]: false }
  }
}

async function addDomain(systemId) {
  const hostname = (addForm.value[systemId] || '').trim()
  addMsg.value = { ...addMsg.value, [systemId]: '' }
  if (!hostname) return
  adding.value = { ...adding.value, [systemId]: true }
  try {
    const result = await api.post(`/systems/${systemId}/domains`, { hostname })
    addForm.value = { ...addForm.value, [systemId]: '' }
    addMsg.value = { ...addMsg.value, [systemId]: result.verification?.note || 'Domain registered.' }
    await loadDomains(systemId)
  } catch (e) {
    addMsg.value = { ...addMsg.value, [systemId]: e.message || 'Failed to add domain.' }
  } finally {
    adding.value = { ...adding.value, [systemId]: false }
  }
}

async function removeDomain(systemId, domainId) {
  try {
    await api.del(`/domains/${domainId}`)
    await loadDomains(systemId)
  } catch (e) {
    addMsg.value = { ...addMsg.value, [systemId]: e.message || 'Failed to remove domain.' }
  }
}

onMounted(loadSystems)
</script>

<template>
  <div class="page-head">
    <h1>Domains <span class="small muted">V4 · hidden test page</span></h1>
  </div>

  <div v-if="error" class="card" style="margin-bottom: 22px">{{ error }}</div>

  <div v-if="!enabled" class="card" style="margin-bottom: 22px">
    <div class="c-name">Systems API is dark</div>
    <div class="hint">Enable <span class="mono">ENABLE_V4_SYSTEMS</span> to use this page. Domains hang off V4 systems, so both share the same gate.</div>
  </div>

  <template v-else>
    <div v-if="!systems.length" class="card" style="margin-bottom: 22px">
      <div class="hint">No systems yet. Migrate legacy projects first, or create a system at <span class="mono">/products</span>-adjacent write APIs.</div>
    </div>

    <div v-for="s in systems" :key="s.id" class="card stack" style="margin-bottom: 22px">
      <div class="kv"><span class="k">{{ s.name }}</span><span class="v mono">{{ s.slug }} · {{ s.currentStatus }}</span></div>

      <div v-if="loadingDomains[s.id]" class="hint">Loading domains…</div>
      <template v-else>
        <div v-if="!(domainsBySystem[s.id] || []).length" class="hint">No domains registered.</div>
        <div v-for="d in (domainsBySystem[s.id] || [])" :key="d.id" class="kv">
          <span class="k mono">{{ d.hostname }}</span>
          <span class="v row gap-sm" style="justify-content:flex-end">
            <span :class="d.verified ? 'ok-text' : 'warn-text'">{{ d.verified ? 'Verified' : (d.isCustom ? 'Unverified' : 'Default') }}</span>
            <button v-if="d.isCustom" class="btn btn-sm btn-ghost" @click="removeDomain(s.id, d.id)"><Icon name="trash" /></button>
          </span>
        </div>
      </template>

      <div class="row gap-sm" style="margin-top: 8px">
        <input
          v-model="addForm[s.id]"
          placeholder="custom.example.com"
          class="input mono"
          style="flex: 1"
          @keyup.enter="addDomain(s.id)"
        />
        <button class="btn btn-sm" :disabled="adding[s.id] || !(addForm[s.id] || '').trim()" @click="addDomain(s.id)">
          <Icon name="plus" /> Add
        </button>
      </div>
      <div v-if="addMsg[s.id]" class="hint">{{ addMsg[s.id] }}</div>
    </div>

    <h2 class="section-label">Not built yet (Alex, Phase 4)</h2>
    <div class="card stack" style="margin-bottom: 22px">
      <div class="kv"><span class="k">DNS verification</span><span class="v muted">Adding a domain above registers it unverified. There is no TXT/CNAME check yet — a domain never gets a route published until this ships.</span></div>
      <div class="kv"><span class="k">Maintenance mode</span><span class="v muted">No <span class="mono">maintenance_windows</span> table exists yet.</span></div>
      <div class="kv"><span class="k">Canonical redirect</span><span class="v muted">No canonical-domain column or Caddy redirect wiring exists yet.</span></div>
      <div class="hint">These controls will appear here once Alex's Phase 4 backend (domain-driven <span class="mono">renderRoute()</span>, route publication transaction, verification flow) lands — this page will not show fake toggles for functionality that doesn't exist.</div>
    </div>
  </template>
</template>

<style scoped>
.page-head { margin-bottom: 18px; }
.ok-text { color: var(--ok, #22c55e); }
.warn-text { color: var(--warning, #b45309); }
.mono { font-family: monospace; }
</style>
