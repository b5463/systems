<script setup>
import { ref, computed, onMounted } from 'vue'
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
const publicHost = computed(() => hostFor(props.system.slug))

/* Gated features (GitHub deploys, DB provisioning) */
const features = ref({})

onMounted(async () => {
  try { const info = await api.get('/server/info'); features.value = info.features || {} }
  catch { /* non-fatal — gated panels stay hidden */ }
  repoInput.value = props.system.repo || ''
  branchInput.value = props.system.deploy_branch || 'main'
  loadEnv()
})

/* Env */
const envKeys = ref([])
const envVars = ref([{ key: '', value: '' }])
const envSaving = ref(false)
const envMsg = ref('')
async function loadEnv() {
  try {
    const data = await api.get(`/projects/${props.slug}/env`)
    envKeys.value = data.keys || []
  } catch (e) {
    if (e.status !== 401) envMsg.value = e.message || 'Failed to load env keys.'
  }
}
function addEnvRow() { envVars.value.push({ key: '', value: '' }) }
function removeEnvRow(i) {
  envVars.value.splice(i, 1)
  if (!envVars.value.length) addEnvRow()
}
async function saveEnv() {
  envMsg.value = ''
  const vars = {}
  for (const row of envVars.value) { const k = row.key.trim(); if (k) vars[k] = row.value }
  if (!Object.keys(vars).length) return (envMsg.value = 'Add at least one KEY=value pair.')
  envSaving.value = true
  try {
    const data = await api.put(`/projects/${props.slug}/env`, { vars })
    envKeys.value = data.keys || envKeys.value
    envVars.value = [{ key: '', value: '' }]
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
async function setVisibility(v) {
  if (v === 'password' && (!visUser.value || !visPass.value)) { error.value = 'Username and password required for password protection.'; return }
  visSaving.value = true; error.value = ''
  try {
    const body = { visibility: v }
    if (v === 'password') { body.username = visUser.value; body.password = visPass.value }
    const data = await api.patch(`/projects/${props.slug}/visibility`, body)
    if (data && data.project) emit('update', data.project)
    visPass.value = ''
  } catch (e) {
    error.value = e.message || 'Failed to change visibility.'
  } finally {
    visSaving.value = false
  }
}

/* Primary (root/apex domain) */
const primarySaving = ref(false)
const primaryMsg = ref('')
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
  <div class="hint">Saving restarts the container. Stored values are encrypted and aren't shown again.</div>
  <div v-if="error" class="error-box">{{ error }}</div>

  <div class="card stack">
    <div class="section-label">Current env keys</div>
    <div v-if="!envKeys.length" class="muted small">No environment variables set.</div>
    <div v-else class="row flex-wrap" style="gap:8px">
      <span v-for="k in envKeys" :key="k" class="chip">
        {{ k }}
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
      <input v-model="row.key" aria-label="KEY" placeholder="KEY" autocapitalize="characters" autocorrect="off" />
      <input v-model="row.value" aria-label="value" placeholder="value" autocorrect="off" />
      <button class="iconbtn" aria-label="Remove" @click="removeEnvRow(i)">✕</button>
    </div>
    <button class="btn btn-sm" @click="addEnvRow">+ Add row</button>
    <div v-if="envMsg" class="notice">{{ envMsg }}</div>
    <button class="btn btn-primary btn-block" :disabled="envSaving" @click="saveEnv">
      <span v-if="envSaving" class="spinner"></span><span v-else>Save &amp; restart</span>
    </button>
  </div>

  <!-- Visibility -->
  <div class="card stack">
    <div class="section-label">Visibility</div>
    <div class="segmented">
      <button type="button" :class="{ active: system.visibility === 'public' }" :disabled="visSaving" @click="setVisibility('public')">Public</button>
      <button type="button" :class="{ active: system.visibility === 'private' }" :disabled="visSaving" @click="setVisibility('private')">Private</button>
      <button type="button" :class="{ active: system.visibility === 'password' }" :disabled="visSaving" @click="setVisibility('password')">Password</button>
    </div>
    <div v-if="system.visibility === 'password'" class="small muted">Protected. Update the credentials below to rotate.</div>
    <input v-model="visUser" aria-label="basic-auth username" placeholder="basic-auth username" autocapitalize="none" autocorrect="off" />
    <input v-model="visPass" aria-label="basic-auth password" type="password" placeholder="basic-auth password" autocomplete="new-password" />
    <div class="hint">Public: open route. Private: no public route. Password: Caddy basic auth (hashed).</div>
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
    <button
      v-else
      class="btn btn-block"
      :class="{ 'btn-primary': !system.is_primary }"
      :disabled="primarySaving"
      @click="setPrimary(!system.is_primary)"
    >
      <span v-if="primarySaving" class="spinner"></span>
      <span v-else>{{ system.is_primary ? `Stop serving at ${BASE_DOMAIN}` : `Serve at ${BASE_DOMAIN}` }}</span>
    </button>
    <div v-if="primaryMsg" class="notice">{{ primaryMsg }}</div>
  </div>

  <!-- GitHub deploy-on-push (only when enabled on the server) -->
  <div v-if="features.githubDeploys" class="card stack">
    <div class="section-label">GitHub deploy-on-push</div>
    <div class="hint">Map this system to a repo. A push to the branch triggers a redeploy (requires the webhook configured in GitHub).</div>
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
    <div class="section-label">Database</div>
    <div class="hint">Provision a dedicated Postgres database + role. The <span class="mono">DATABASE_URL</span> is stored (encrypted) and injected on the next deploy.</div>
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
</style>
