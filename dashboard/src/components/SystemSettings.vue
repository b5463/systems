<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../api/client'
import { BASE_DOMAIN, hostFor } from '../config'
import CopyButton from './CopyButton.vue'

const props = defineProps({
  slug: { type: String, required: true },
  system: { type: Object, required: true }
})
// update: an endpoint returned the refreshed project row.
// reload: the parent should re-fetch (e.g. env save restarts the container).
const emit = defineEmits(['update', 'reload'])

const error = ref('')
const publicHost = computed(() => hostFor(props.system.slug, props.system.port))

/* Gated features (GitHub deploys, DB provisioning) */
const features = ref({})

onMounted(async () => {
  try { const info = await api.get('/server/info'); features.value = info.features || {} }
  catch { /* non-fatal — gated panels stay hidden */ }
  repoInput.value = props.system.repo || ''
  branchInput.value = props.system.deploy_branch || 'main'
  loadEnv()
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

/* Env */
const envKeys = ref([])
const envVars = ref([{ key: '', value: '' }])
const envSaving = ref(false)
const envMsg = ref('')
const envPhase = ref('')
const confirmEnvSave = ref(false)
const bulkOpen = ref(false)
const bulkText = ref('')
async function loadEnv() {
  try {
    const data = await api.get(`/projects/${props.slug}/env`)
    envKeys.value = data.keys || []
  } catch (e) {
    envPhase.value = 'failed'
    if (e.status !== 401) envMsg.value = e.message || 'Failed to load env keys.'
  }
}
function addEnvRow() { envVars.value.push({ key: '', value: '' }) }
function removeEnvRow(i) {
  envVars.value.splice(i, 1)
  if (!envVars.value.length) addEnvRow()
}

// Dirty / validation state for the add-update form (#14): only enable Save when
// there's something valid to save.
const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const envDirty = computed(() => envVars.value.some((r) => r.key.trim() || r.value.trim()))
const envIssues = computed(() => {
  const issues = []
  const seen = new Set()
  for (const r of envVars.value) {
    const k = r.key.trim()
    if (!k) {
      if (r.value.trim()) issues.push('A value has no variable name.')
      continue
    }
    if (!VAR_NAME.test(k)) issues.push(`“${k}” is not a valid name (letters, digits, underscore; can’t start with a digit).`)
    else if (seen.has(k)) issues.push(`“${k}” is listed more than once.`)
    seen.add(k)
  }
  return issues
})
const envEmptyValues = computed(() => envVars.value.filter((r) => r.key.trim() && r.value === '').map((r) => r.key.trim()))
const canSaveEnv = computed(() => envDirty.value && !envIssues.value.length && !envSaving.value)
function beforeUnload(e) {
  if (!envDirty.value || envSaving.value) return
  e.preventDefault()
  e.returnValue = ''
}
function pasteEnvText() {
  const rows = bulkText.value.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const eq = line.indexOf('=')
      if (eq === -1) return null
      return { key: line.slice(0, eq).trim(), value: line.slice(eq + 1) }
    })
    .filter(Boolean)
  if (!rows.length) {
    envMsg.value = 'Paste KEY=value lines to import variables.'
    return
  }
  envVars.value = envDirty.value ? [...envVars.value.filter((r) => r.key.trim() || r.value.trim()), ...rows] : rows
  bulkText.value = ''
  bulkOpen.value = false
}
async function saveEnv() {
  envMsg.value = ''
  const vars = {}
  for (const row of envVars.value) { const k = row.key.trim(); if (k) vars[k] = row.value }
  if (!Object.keys(vars).length) return (envMsg.value = 'Add at least one KEY=value pair.')
  if (!confirmEnvSave.value) {
    confirmEnvSave.value = true
    return
  }
  envSaving.value = true
  envPhase.value = 'saving'
  try {
    const data = await api.put(`/projects/${props.slug}/env`, { vars })
    envKeys.value = data.keys || envKeys.value
    envVars.value = [{ key: '', value: '' }]
    envPhase.value = 'restarting'
    confirmEnvSave.value = false
    envMsg.value = 'Saved — other variables kept. The container is restarting.'
    emit('reload')
  } catch (e) {
    envMsg.value = e.message || 'Failed to save env.'
  } finally {
    envSaving.value = false
  }
}

// Delete an existing variable (confirmed inline — it restarts the container).
const removingKey = ref(null)
async function removeKey() {
  const key = removingKey.value
  envSaving.value = true; envMsg.value = ''
  try {
    const data = await api.put(`/projects/${props.slug}/env`, { remove: [key] })
    envKeys.value = data.keys || envKeys.value.filter((k) => k !== key)
    envMsg.value = `Removed ${key}. The container is restarting.`
    emit('reload')
  } catch (e) {
    envMsg.value = e.message || 'Failed to remove variable.'
  } finally {
    envSaving.value = false; removingKey.value = null
  }
}

/* Visibility */
const visSaving = ref(false)
const visUser = ref('')
const visPass = ref('')
// Reveal basic-auth credential fields only while choosing/holding Password (#15).
const wantPassword = ref(false)
const credsVisible = computed(() => wantPassword.value || props.system.visibility === 'password')

// Public/Private apply immediately; Password reveals the credential fields first.
function selectVis(v) {
  error.value = ''
  if (v === 'password') { wantPassword.value = true; return }
  wantPassword.value = false
  setVisibility(v)
}

async function setVisibility(v) {
  if (v === 'password' && (!visUser.value || !visPass.value)) { error.value = 'Username and password required for password protection.'; return }
  visSaving.value = true; error.value = ''
  try {
    const body = { visibility: v }
    if (v === 'password') { body.username = visUser.value; body.password = visPass.value }
    const data = await api.patch(`/projects/${props.slug}/visibility`, body)
    if (data && data.project) emit('update', data.project)
    visPass.value = ''
    wantPassword.value = false
  } catch (e) {
    error.value = e.message || 'Failed to change visibility.'
  } finally {
    visSaving.value = false
  }
}

/* Primary (root/apex domain) */
const primarySaving = ref(false)
const primaryMsg = ref('')
const confirmingPrimary = ref(false)
const primaryBlockers = computed(() => {
  const blockers = []
  if (props.system.visibility === 'private') blockers.push('Private systems have no public route.')
  if (props.system.status !== 'running') blockers.push('The container is not running.')
  if (!props.system.route_published) blockers.push('The public route is not published.')
  if (props.system.health_state && props.system.health_state !== 'healthy') blockers.push(`Health is ${props.system.health_state}.`)
  return blockers
})
async function setPrimary(val) {
  primaryMsg.value = ''
  primarySaving.value = true
  try {
    const data = await api.patch(`/projects/${props.slug}/primary`, { primary: val })
    if (data && data.project) emit('update', data.project)
    primaryMsg.value = val ? `Now served at ${BASE_DOMAIN}.` : `No longer served at ${BASE_DOMAIN}.`
  } catch (e) {
    primaryMsg.value = e.message || 'Failed to update.'
  } finally {
    primarySaving.value = false
  }
}

/* GitHub repo mapping */
const repoInput = ref('')
const branchInput = ref('main')
const repoSaving = ref(false)
const repoMsg = ref('')
async function saveRepo() {
  repoMsg.value = ''
  repoSaving.value = true
  try {
    const data = await api.patch(`/projects/${props.slug}/repo`, {
      repo: repoInput.value.trim() || null,
      branch: branchInput.value.trim() || 'main'
    })
    if (data && data.project) emit('update', data.project)
    repoMsg.value = 'Saved.'
  } catch (e) { repoMsg.value = e.message || 'Could not save.' }
  finally { repoSaving.value = false }
}

/* DB provisioning */
const provisioning = ref(false)
const provisionMsg = ref('')
const provisionedUrl = ref('')
async function provisionDb() {
  provisionMsg.value = ''; provisionedUrl.value = ''
  provisioning.value = true
  try {
    const data = await api.post(`/projects/${props.slug}/provision-db`)
    provisionedUrl.value = data.databaseUrl
    provisionMsg.value = `Provisioned ${data.database}. DATABASE_URL stored for next deploy.`
  } catch (e) { provisionMsg.value = e.message || 'Could not provision.' }
  finally { provisioning.value = false }
}
</script>

<template>
  <div class="hint">Saving restarts the container. Stored values are encrypted and masked; omitted existing keys stay unchanged.</div>
  <div v-if="error" class="error-box">{{ error }}</div>

  <div class="card stack">
    <div class="section-label">Current env keys</div>
    <div v-if="!envKeys.length" class="muted small">No environment variables set.</div>
    <div v-else class="row flex-wrap" style="gap:8px">
      <span v-for="k in envKeys" :key="k" class="chip">
        {{ k }} = ********
        <button class="chip-x" :aria-label="`Remove ${k}`" :disabled="envSaving" @click="removingKey = k">✕</button>
      </span>
    </div>
    <div v-if="removingKey" class="callout warn" style="margin:0">
      <div class="co-bar"></div>
      <div class="stack" style="gap:8px">
        <div>Remove <span class="mono">{{ removingKey }}</span>? This restarts the container.</div>
        <div class="row gap-sm">
          <button class="btn btn-sm" :disabled="envSaving" @click="removingKey = null">Cancel</button>
          <button class="btn btn-sm btn-danger" :disabled="envSaving" @click="removeKey">
            <span v-if="envSaving" class="spinner"></span><span v-else>Remove</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <div class="card stack">
    <div class="section-label">Add / update variables</div>
    <div class="hint">Adding or changing a variable keeps the others. Values aren't shown again once saved.</div>
    <div v-for="(row, i) in envVars" :key="i" class="row">
      <input v-model="row.key" aria-label="Variable name" placeholder="Variable name" autocapitalize="characters" autocorrect="off" spellcheck="false" />
      <input v-model="row.value" aria-label="Value" placeholder="Value" autocorrect="off" spellcheck="false" />
      <button class="iconbtn" aria-label="Remove row" title="Remove row" @click="removeEnvRow(i)">✕</button>
    </div>
    <div class="row gap-sm flex-wrap">
      <button class="btn btn-sm" @click="addEnvRow">+ Add row</button>
      <button class="btn btn-sm btn-ghost" @click="bulkOpen = !bulkOpen">{{ bulkOpen ? 'Close bulk paste' : 'Paste .env' }}</button>
    </div>
    <div v-if="bulkOpen" class="bulk-env">
      <textarea v-model="bulkText" rows="6" placeholder="KEY=value&#10;ANOTHER=value" spellcheck="false"></textarea>
      <button class="btn btn-sm" style="align-self:flex-start" @click="pasteEnvText">Import lines</button>
    </div>
    <ul v-if="envIssues.length" class="env-issues">
      <li v-for="msg in envIssues" :key="msg">{{ msg }}</li>
    </ul>
    <div v-else-if="envEmptyValues.length" class="callout warn" style="margin:0">
      <div class="co-bar"></div>
      <div>Empty values will be saved for: <span class="mono">{{ envEmptyValues.join(', ') }}</span>.</div>
    </div>
    <div v-else-if="envDirty" class="small" style="color:var(--warn)">Unsaved changes · saving restarts the container and briefly interrupts traffic.</div>
    <div v-if="confirmEnvSave" class="callout warn" style="margin:0">
      <div class="co-bar"></div>
      <div class="stack" style="gap:8px">
        <div>Save these environment changes and restart the container? Active traffic may be interrupted. Existing keys not listed here remain unchanged; listed empty values are saved as empty strings.</div>
        <div class="row gap-sm">
          <button class="btn btn-sm" :disabled="envSaving" @click="confirmEnvSave = false">Cancel</button>
          <button class="btn btn-sm btn-primary" :disabled="envSaving" @click="saveEnv">
            <span v-if="envSaving" class="spinner"></span><span v-else>Confirm save & restart</span>
          </button>
        </div>
      </div>
    </div>
    <div v-if="envPhase" class="small muted">State: {{ envPhase }}</div>
    <div v-if="envMsg" class="notice">{{ envMsg }}</div>
    <button class="btn btn-primary btn-block" :disabled="!canSaveEnv" @click="saveEnv">
      <span v-if="envSaving" class="spinner"></span><span v-else>Save &amp; restart</span>
    </button>
  </div>

  <!-- Visibility -->
  <div class="card stack">
    <div class="section-label">Visibility</div>
    <div class="segmented">
      <button type="button" :class="{ active: system.visibility === 'public' && !wantPassword }" :disabled="visSaving" @click="selectVis('public')">Public</button>
      <button type="button" :class="{ active: system.visibility === 'private' && !wantPassword }" :disabled="visSaving" @click="selectVis('private')">Private</button>
      <button type="button" :class="{ active: system.visibility === 'password' || wantPassword }" :disabled="visSaving" @click="selectVis('password')">Password</button>
    </div>
    <div class="hint">Public: open route, no auth. Private: no public route. Password: public route behind basic auth (credentials hashed).</div>

    <!-- Credential fields only while choosing or holding Password visibility (#15) -->
    <template v-if="credsVisible">
      <div v-if="system.visibility === 'password'" class="small muted">Protected. Enter new credentials to rotate them.</div>
      <input v-model="visUser" aria-label="Basic-auth username" placeholder="Username" autocapitalize="none" autocorrect="off" spellcheck="false" />
      <input v-model="visPass" aria-label="Basic-auth password" type="password" placeholder="Password" autocomplete="new-password" />
      <button class="btn btn-primary btn-block" :disabled="visSaving || !visUser || !visPass" @click="setVisibility('password')">
        <span v-if="visSaving" class="spinner"></span>
        <span v-else>{{ system.visibility === 'password' ? 'Update credentials' : 'Enable password protection' }}</span>
      </button>
    </template>
  </div>

  <!-- Root domain (primary system) -->
  <div class="card stack">
    <div class="spread">
      <div class="section-label">Root domain</div>
      <span class="chip" :class="system.is_primary ? 'ok' : ''">{{ system.is_primary ? 'On' : 'Off' }}</span>
    </div>
    <div class="hint">
      Also serve this system at <span class="mono">{{ BASE_DOMAIN }}</span> (the bare
      root domain), alongside <span class="mono">{{ publicHost }}</span>. The dashboard
      stays on its own subdomain. Only one system can hold the root domain.
    </div>
    <div v-if="system.visibility === 'private'" class="hint">Make the system public or password-protected first — a private system has no public route to serve.</div>

    <div v-if="primaryBlockers.length" class="callout warn" style="margin:0">
      <div class="co-bar"></div>
      <div>
        <div>Resolve before assigning the root domain:</div>
        <ul style="margin:6px 0 0; padding-left:18px">
          <li v-for="b in primaryBlockers" :key="b">{{ b }}</li>
        </ul>
      </div>
    </div>

    <!-- Already primary: stop serving (low-impact, immediate). -->
    <button
      v-else-if="system.is_primary"
      class="btn btn-block"
      :disabled="primarySaving"
      @click="setPrimary(false)"
    >
      <span v-if="primarySaving" class="spinner"></span>
      <span v-else>Stop serving at {{ BASE_DOMAIN }}</span>
    </button>

    <!-- Assigning the root domain replaces the current owner — confirm first (#13). -->
    <template v-else>
      <div v-if="confirmingPrimary" class="callout warn" style="margin:0">
        <div class="co-bar"></div>
        <div class="stack" style="gap:8px">
          <div>Route <span class="mono">{{ BASE_DOMAIN }}</span> to <strong>{{ system.name }}</strong>. This replaces any system currently holding the root domain and reloads the proxy — active connections may be briefly interrupted.</div>
          <div class="row gap-sm">
            <button class="btn btn-sm" :disabled="primarySaving" @click="confirmingPrimary = false">Cancel</button>
            <button class="btn btn-sm btn-primary" :disabled="primarySaving" @click="confirmingPrimary = false; setPrimary(true)">
              <span v-if="primarySaving" class="spinner"></span><span v-else>Assign root domain</span>
            </button>
          </div>
        </div>
      </div>
      <button v-else class="btn btn-primary btn-block" :disabled="primarySaving || primaryBlockers.length" @click="confirmingPrimary = true">
        Assign root domain
      </button>
    </template>
    <div v-if="primaryMsg" class="notice">{{ primaryMsg }}</div>
  </div>

  <!-- GitHub deploy-on-push (only when enabled on the server) -->
  <div v-if="features.githubDeploys" class="card stack">
    <div class="spread"><div class="section-label">GitHub deploy-on-push</div><span class="chip">Experimental</span></div>
    <div class="hint">Advanced / optional — off by default and enabled on the server. Map this system to a repo. A push to the branch triggers a redeploy (requires the webhook configured in GitHub).</div>
    <div class="field" style="margin:0">
      <label class="label" for="repo">Repository</label>
      <input id="repo" v-model="repoInput" aria-label="Repository (owner/name)" placeholder="owner/name" autocapitalize="none" autocorrect="off" />
    </div>
    <div class="field" style="margin:0">
      <label class="label" for="branch">Branch</label>
      <input id="branch" v-model="branchInput" aria-label="Branch" placeholder="main" autocapitalize="none" autocorrect="off" />
    </div>
    <div v-if="repoMsg" class="notice">{{ repoMsg }}</div>
    <button class="btn btn-primary btn-block" :disabled="repoSaving" @click="saveRepo">
      <span v-if="repoSaving" class="spinner"></span><span v-else>Save repo mapping</span>
    </button>
  </div>

  <!-- Database provisioning (only when enabled on the server) -->
  <div v-if="features.dbProvisioning" class="card stack">
    <div class="spread"><div class="section-label">Database</div><span class="chip">Experimental</span></div>
    <div class="hint">Advanced / optional — off by default and enabled on the server. Provision a dedicated Postgres database + role. The <span class="mono">DATABASE_URL</span> is stored (encrypted) and injected on the next deploy.</div>
    <div v-if="provisionedUrl" class="kv"><span class="k">DATABASE_URL</span><span class="v mono small row gap-sm" style="justify-content:flex-end">{{ provisionedUrl }}<CopyButton :text="provisionedUrl" label="DATABASE_URL" /></span></div>
    <div v-if="provisionMsg" class="notice">{{ provisionMsg }}</div>
    <button class="btn btn-block" :disabled="provisioning" @click="provisionDb">
      <span v-if="provisioning" class="spinner"></span><span v-else>Provision database</span>
    </button>
  </div>
</template>

<style scoped>
.chip-x {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 0 0 0 4px;
  font-size: 10px;
  line-height: 1;
}
.chip-x:hover { color: var(--danger); }
.chip-x:disabled { opacity: 0.4; cursor: not-allowed; }
.env-issues {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12.5px;
  color: var(--danger);
}
.bulk-env {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bulk-env textarea {
  font-family: var(--mono);
  font-size: 13px;
}
</style>
