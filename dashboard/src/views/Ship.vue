<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import LogConsole from '../components/LogConsole.vue'
import Icon from '../components/Icon.vue'
import { BASE_DOMAIN, SCHEME, LOCAL_MODE, urlFor } from '../config'

const router = useRouter()

// Defined deploy pipeline — shown as a reference rail (atmosphere, not a fake
// live readout; SYSTEMS. does not assert which substep is running).
const LIFECYCLE = ['archive', 'detect', 'install', 'build', 'container', 'route', 'HTTPS', 'health', 'live']

const VISIBILITY = [
  { key: 'public', label: 'Public', desc: 'Public route. Anyone with the URL can reach it.' },
  { key: 'private', label: 'Private', desc: 'No public route — runs and is monitored internally only.' },
  { key: 'password', label: 'Password', desc: 'Set after deploy in Settings (Caddy basic auth).', after: true }
]

const name = ref('')
const slug = ref('')
const slugEdited = ref(false)
const visibility = ref('public')
const file = ref(null)
const dragOver = ref(false)
const fileInput = ref(null)
const envVarPairs = ref([])

function addEnvPair() { envVarPairs.value.push({ key: '', value: '' }) }
function removeEnvPair(i) { envVarPairs.value.splice(i, 1) }
const envVarsForSubmit = computed(() => {
  const obj = {}
  for (const p of envVarPairs.value) {
    const k = p.key.trim()
    if (k && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) obj[k] = p.value
  }
  return obj
})

const uploading = ref(false)
const progress = ref(0)
const uploadStage = ref('')
const error = ref('')
const deployedSlug = ref('')
const deployedPort = ref(null)
const phase = ref('form') // form | building
const buildResult = ref('')
const analysis = ref(null)
const analyzing = ref(false)
const analysisError = ref('')

// Where the just-shipped system is actually reachable (localhost:port locally).
const deployedUrl = computed(() => urlFor(deployedSlug.value, deployedPort.value))
const deployedHost = computed(() => deployedUrl.value.replace(/^https?:[/][/]/, ''))
const deploymentState = computed(() => {
  if (buildResult.value === 'done') {
    return {
      label: 'Deployment complete',
      tone: 'success',
      title: 'Your system is live',
      detail: 'The image built successfully, the container started, and the deployment finished.',
    }
  }
  if (buildResult.value === 'error') {
    return {
      label: 'Deployment failed',
      tone: 'error',
      title: 'The build needs attention',
      detail: 'Nothing new went live. Review the output below, then open the system to correct and redeploy it.',
    }
  }
  return {
    label: 'Deployment in progress',
    tone: 'building',
    title: 'Building your system',
    detail: 'SYSTEMS. is preparing the release. The live output below is the source of truth for progress.',
  }
})

// Upload limits/capabilities (from the server). When large uploads are enabled
// and a file is bigger than the standard limit, we stream it in chunks.
const largeUploads = ref(false)
const uploadMaxMb = ref(100)
const v2UploadMaxMb = ref(2048)
const serverInfo = ref(null)
const systemsCount = ref(null)
onMounted(async () => {
  try {
    const info = await api.get('/server/info')
    serverInfo.value = info
    if (info && info.features) {
      largeUploads.value = !!info.features.largeUploads
      uploadMaxMb.value = info.features.uploadMaxMb || 100
      v2UploadMaxMb.value = info.features.v2UploadMaxMb || 2048
    }
  } catch { /* non-fatal — fall back to standard upload */ }
  try {
    const data = await api.get('/projects')
    systemsCount.value = (data.projects || []).length
  } catch { /* non-fatal - do not block deploy if the count cannot be loaded */ }
})
const willChunk = computed(() =>
  !!file.value && largeUploads.value && file.value.size > uploadMaxMb.value * 1024 * 1024
)

function onBuildFinished(status) { buildResult.value = status }

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}
watch(name, (v) => { if (!slugEdited.value) slug.value = slugify(v) })
function onSlugInput(e) { slugEdited.value = true; slug.value = slugify(e.target.value) }
const slugValid = computed(() => /^[a-z0-9-]{2,50}$/.test(slug.value))
const visDesc = computed(() => VISIBILITY.find((v) => v.key === visibility.value)?.desc || '')

// Dry-run plan: ask the API what WOULD happen (validated slug, container name,
// generated Caddy route) without touching Docker/Caddy.
const plan = ref(null)
const planChecking = ref(false)
let planTimer = null
function refreshPlan() {
  clearTimeout(planTimer)
  plan.value = null
  if (!slugValid.value) { planChecking.value = false; return }
  planChecking.value = true
  planTimer = setTimeout(async () => {
    try {
      const d = await api.post('/deploy/plan', { slug: slug.value, visibility: visibility.value })
      plan.value = d.plan
    } catch { plan.value = null }
    finally { planChecking.value = false }
  }, 400)
}
watch([slug, visibility], refreshPlan)
onBeforeUnmount(() => clearTimeout(planTimer))

const slugStatus = computed(() => {
  if (!slugValid.value) return null
  if (planChecking.value) return { tone: 'idle', label: 'Checking…' }
  if (!plan.value) return null
  if (plan.value.valid === false) return { tone: 'error', label: plan.value.error || 'Slug unavailable' }
  return { tone: 'ok', label: 'Available' }
})

// Effective upload limit (in MB) — single authoritative value from the server.
const effectiveMaxMb = computed(() => largeUploads.value ? v2UploadMaxMb.value : uploadMaxMb.value)
const archiveWithinLimit = computed(() =>
  !file.value || file.value.size <= effectiveMaxMb.value * 1024 * 1024
)
const firstDeploy = computed(() => systemsCount.value === 0)
const hostReadiness = computed(() => {
  const info = serverInfo.value
  const dockerReady = info?.docker?.status === 'connected'
  const diskReady = info?.disk?.status !== 'measured' || Number(info.disk.usedPct) < 90
  const diskToFreeGb = info?.disk?.status === 'measured' && Number(info.disk.totalGb) > 0
    ? Math.max(0, (Number(info.disk.totalGb) * 0.1) - Number(info.disk.freeGb || 0))
    : null
  const domainReady = LOCAL_MODE || !!info?.platform?.baseDomain
  const proxyReady = LOCAL_MODE || info?.caddy?.status !== 'unavailable'
  return [
    {
      label: 'Docker engine reachable',
      ok: dockerReady,
      required: true,
      detail: dockerReady ? `${info.docker.running ?? 0}/${info.docker.managed ?? 0} managed containers running` : 'Start Docker Desktop or expose Docker to the API.',
    },
    {
      label: LOCAL_MODE ? 'Local route mode' : 'Base domain configured',
      ok: domainReady,
      required: !LOCAL_MODE,
      detail: LOCAL_MODE ? 'Deploys publish to localhost ports in this environment.' : (info?.platform?.baseDomain || 'Set BASE_DOMAIN before publishing public systems.'),
    },
    {
      label: 'Proxy route readiness',
      ok: proxyReady,
      required: false,
      detail: LOCAL_MODE ? 'Subdomain proxying is bypassed locally.' : `Caddy status: ${info?.caddy?.status || 'unknown'}`,
    },
    {
      label: 'Data volume capacity',
      ok: diskReady,
      required: true,
      detail: info?.disk?.status === 'measured'
        ? String(info.disk.freeGb) + ' GB free · ' + String(info.disk.usedPct) + '% used · deployment limit is below 90%'
        : 'Disk usage could not be measured from the API.',
      action: diskReady ? null : (diskToFreeGb != null
        ? 'Free at least ' + Math.max(0.1, diskToFreeGb).toFixed(1) + ' GB from the SYSTEMS. data volume, then refresh this page.'
        : 'Reduce data-volume usage below 90%, then refresh this page.'),
    },  ]
})
const hostBlocks = computed(() =>
  firstDeploy.value ? hostReadiness.value.filter((r) => r.required && !r.ok) : []
)
const planFacts = computed(() => {
  if (analysis.value) {
    const a = analysis.value
    return [
      { label: 'Detection', value: `${a.projectType}${a.rootFolder && a.rootFolder !== '.' ? ' in ' + a.rootFolder : ''}` },
      { label: 'Entry point', value: a.entryPoint || 'No explicit entry point detected' },
      { label: 'Build command', value: a.buildCommand || 'No build command detected' },
      { label: 'Output folder', value: a.outputFolder || 'Not applicable or detected at build time' },
      { label: 'Expected port', value: String(a.expectedPort || 3000) },
      { label: 'Evidence', value: (a.filesUsed || []).length ? a.filesUsed.join(', ') : `${a.fileCount || 0} files inspected` },
    ]
  }
  if (!plan.value) {
    const slugMsg = slugValid.value
      ? (planChecking.value ? 'Checking the slug is available…' : 'Waiting for an available slug')
      : 'Enter a valid slug (2–50 chars: a–z, 0–9 and hyphens)'
    return [
      { label: 'Detection', value: slugMsg },
      { label: 'Route effect', value: slugValid.value ? 'Route is planned once the slug is confirmed available' : 'No route planned until the slug is valid' },
      { label: 'Build plan', value: file.value ? 'Build command and output are detected after upload' : 'Upload a .zip archive to plan the build' },
    ]
  }
  return [
    {
      label: 'Detection',
      value: file.value
        ? 'Project type, build command, output folder, and port are detected inside the build worker after upload.'
        : 'Project detection requires the archive contents.',
    },
    {
      label: 'Route effect',
      value: plan.value.routePublished
        ? `A public route will be written for ${plan.value.host}.`
        : 'No public route will be published; the container runs privately.',
    },
    {
      label: 'Rollback',
      value: 'First deploy creates the initial release; rollback points start after redeploys.',
    },
  ]
})

// Deployment readiness — each gate the deploy depends on, surfaced as a checklist.
const readiness = computed(() => [
  { label: 'System name', ok: !!name.value.trim() },
  { label: 'Valid slug & route plan', ok: slugValid.value && !!plan.value && plan.value.valid !== false },
  { label: 'ZIP archive selected', ok: !!file.value },
  { label: 'Within upload limit', ok: archiveWithinLimit.value },
  { label: 'Archive detection reviewed', ok: !!analysis.value && !(analysis.value.blockers || []).length },
])
const canDeploy = computed(() =>
  readiness.value.every((r) => r.ok) && !hostBlocks.value.length && !planChecking.value && !uploading.value
)

// Specific, actionable guidance for the FIRST thing blocking deploy. Read-only —
// mirrors the readiness gates but spells out exactly what to do next. Empty when
// canDeploy is true.
const nextStep = computed(() => {
  if (canDeploy.value) return ''
  if (!name.value.trim()) return 'Enter a system name.'
  if (!slugValid.value) return 'Choose a valid slug (2–50 chars: a–z, 0–9 and hyphens).'
  if (planChecking.value) return 'Checking the slug is available…'
  if (!plan.value) return 'Waiting for a valid, available slug.'
  if (plan.value.valid === false) return plan.value.error || 'This slug is unavailable — pick another.'
  if (!file.value) return 'Upload a .zip archive to deploy.'
  if (!archiveWithinLimit.value) return `Archive exceeds the ${effectiveMaxMb.value} MB upload limit.`
  if (analyzing.value) return 'Analyzing the archive…'
  if (!analysis.value) return 'Waiting for archive detection to finish.'
  if ((analysis.value.blockers || []).length) return analysis.value.blockers.join(' ')
  if (hostBlocks.value.length) return hostBlocks.value[0].action || ('Resolve ' + hostBlocks.value[0].label.toLowerCase() + ' before the first deploy.')
  if (uploading.value) return 'Upload in progress…'
  return 'Complete the checklist above to deploy.'
})

function setFile(f) {
  if (!f) return
  if (!/\.zip$/i.test(f.name)) { error.value = 'Please select a .zip archive.'; return }
  error.value = ''; file.value = f; analysis.value = null; analysisError.value = ''
  analyzeSelectedArchive()
}
function onDrop(e) { dragOver.value = false; setFile(e.dataTransfer.files && e.dataTransfer.files[0]) }
function onPick(e) { setFile(e.target.files && e.target.files[0]) }
function fmtSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

async function analyzeSelectedArchive() {
  if (!file.value) return
  analyzing.value = true
  analysisError.value = ''
  try {
    const data = await api.upload('/deploy/analyze', { files: { file: file.value } })
    analysis.value = data.analysis || null
    if (analysis.value?.blockers?.length) analysisError.value = analysis.value.blockers.join(' ')
  } catch (e) {
    analysis.value = null
    analysisError.value = e.message || 'Could not analyze archive.'
  } finally {
    analyzing.value = false
  }
}

async function submit() {
  error.value = ''
  if (!name.value.trim()) return (error.value = 'Enter a system name.')
  if (!slugValid.value) return (error.value = 'Slug must be 2–50 chars: a–z, 0–9 and hyphens.')
  if (!file.value) return (error.value = 'Choose a .zip archive to deploy.')
  // Reject oversized archives early unless large uploads are enabled.
  if (!largeUploads.value && file.value.size > uploadMaxMb.value * 1024 * 1024) {
    return (error.value = `Archive exceeds the ${uploadMaxMb.value} MB limit. Enable large uploads (ENABLE_LARGE_UPLOADS) to ship bigger archives.`)
  }
  uploading.value = true; progress.value = 0; uploadStage.value = willChunk.value ? 'Preparing chunked upload…' : 'Uploading archive…'
  try {
    const fields = { name: name.value.trim(), slug: slug.value, visibility: visibility.value, envVars: JSON.stringify(envVarsForSubmit.value) }
    const data = willChunk.value
      ? await api.chunkedDeploy({
          fields,
          file: file.value,
          onProgress: (p) => (progress.value = p),
          onStatus: ({ chunk, totalChunks, attempt }) => {
            uploadStage.value = attempt > 1
              ? 'Retrying chunk ' + chunk + '/' + totalChunks + ' (attempt ' + attempt + '/3)…'
              : 'Streaming chunk ' + chunk + '/' + totalChunks + '…'
          }
        })
      : await api.upload('/deploy', { fields, files: { file: file.value }, onProgress: (p) => (progress.value = p) })
    deployedSlug.value = (data && data.project && data.project.slug) || slug.value
    deployedPort.value = (data && data.project && data.project.port) || null
    phase.value = 'building'
  } catch (e) {
    error.value = (e.message || 'Deploy failed.') + (willChunk.value ? ' The archive is still selected; choose Deploy system to retry safely.' : '')
  } finally {
    uploading.value = false
  }
}
function reset() {
  name.value = ''; slug.value = ''; slugEdited.value = false
  file.value = null; progress.value = 0; uploadStage.value = ''; deployedSlug.value = ''; deployedPort.value = null
  analysis.value = null; analysisError.value = ''
  phase.value = 'form'; error.value = ''; visibility.value = 'public'; buildResult.value = ''
  envVarPairs.value = []
}
function openSystem() { router.push({ name: 'system-detail', params: { slug: deployedSlug.value } }) }
</script>

<template>
  <div class="page-head"><h1>Ship</h1></div>

  <!-- ACTIVE DEPLOYMENT -->
  <section
    v-if="phase === 'building'"
    class="ship-active"
    :class="'is-' + deploymentState.tone"
    aria-live="polite"
  >
    <div class="ship-status-card card">
      <div class="ship-status-main">
        <div class="ship-status-copy">
          <div class="ship-status-label">
            <span class="ship-status-dot" aria-hidden="true"></span>
            {{ deploymentState.label }}
          </div>
          <h2>{{ deploymentState.title }}</h2>
          <p>{{ deploymentState.detail }}</p>
        </div>
        <div class="ship-system-identity">
          <span class="small dim">System</span>
          <strong>{{ name || deployedSlug }}</strong>
          <a class="mono" :href="deployedUrl" target="_blank" rel="noopener">{{ deployedHost }}</a>
        </div>
      </div>

      <div class="ship-status-facts" aria-label="Deployment summary">
        <div><span>Release</span><strong class="mono">{{ deployedSlug }}</strong></div>
        <div><span>Visibility</span><strong>{{ visibility }}</strong></div>
        <div><span>Destination</span><strong class="mono">{{ deployedHost }}</strong></div>
      </div>
    </div>

    <div class="ship-pipeline card">
      <div class="ship-section-head">
        <div>
          <h2>Deployment pipeline</h2>
          <p>Pipeline reference. Detailed progress and failures appear in the build output.</p>
        </div>
        <span
          class="badge"
          :class="{
          'badge-building': buildResult === '',
          'badge-running': buildResult === 'done',
          'badge-error': buildResult === 'error',
        }">
          <span class="dot"></span>{{ buildResult === 'done' ? 'Complete' : buildResult === 'error' ? 'Stopped' : 'Running' }}
        </span>
      </div>
      <ol class="ship-steps">
        <li
          v-for="(step, i) in LIFECYCLE"
          :key="step"
          :class="{ complete: buildResult === 'done', failed: buildResult === 'error' }"
        >
          <span class="ship-step-index">{{ String(i + 1).padStart(2, '0') }}</span>
          <span>{{ step }}</span>
        </li>
      </ol>
    </div>

    <div class="ship-log-card card">
      <div class="ship-section-head">
        <div>
          <h2>Build output</h2>
          <p>Search, pause, copy, or reconnect without interrupting the deployment.</p>
        </div>
      </div>
      <LogConsole :slug="deployedSlug" mode="build" @finished="onBuildFinished" />
    </div>

    <div class="ship-active-actions">
      <button class="btn btn-primary" @click="openSystem">
        {{ buildResult === 'error' ? 'Open system to fix' : 'View system' }}
      </button>
      <a v-if="buildResult === 'done'" class="btn" :href="deployedUrl" target="_blank" rel="noopener">Open live site</a>
      <button class="btn btn-ghost" @click="reset">Deploy another system</button>
    </div>
  </section>
  <!-- WORKBENCH -->
  <form v-else class="workbench" @submit.prevent="submit">
    <!-- LEFT: configuration -->
    <div class="stack">
      <div class="card stack">
        <h2 class="section-label">System</h2>
        <div class="field" style="margin:0">
          <label class="label" for="name">Name</label>
          <input id="name" v-model="name" placeholder="Notes API" autocorrect="off" />
        </div>
        <div class="field" style="margin:0">
          <label class="label" for="slug">Slug</label>
          <input id="slug" :value="slug" placeholder="notes" autocapitalize="none" autocorrect="off" @input="onSlugInput" />
          <div v-if="slugStatus" class="slug-status" :class="slugStatus.tone">
            <span class="sdot" :class="slugStatus.tone" style="flex-shrink:0"></span>{{ slugStatus.label }}
          </div>
          <div v-else class="hint">Becomes the URL below — choose carefully, it can't be changed after deploy.</div>
        </div>
        <div class="field" style="margin:0">
          <div class="label">{{ LOCAL_MODE ? 'Local URL' : 'Public URL' }}</div>
          <div class="url-preview url-preview-lg">
            <template v-if="LOCAL_MODE"><span class="scheme">http://</span><span class="slug">localhost</span>:<span class="slug">port</span></template>
            <template v-else><span class="scheme">{{ SCHEME }}://</span><span class="slug">{{ slug || 'your-system' }}</span>.{{ BASE_DOMAIN }}</template>
          </div>
          <div v-if="LOCAL_MODE" class="hint">Local testing — the system is published on a host port (shown after deploy). Set <span class="mono">VITE_BASE_DOMAIN</span> for subdomain routing.</div>
        </div>
      </div>

      <div class="card stack">
        <h2 class="section-label">Visibility</h2>
        <div class="segmented">
          <button v-for="v in VISIBILITY" :key="v.key" type="button" :class="{ active: visibility === v.key }" :disabled="v.after" :title="v.after ? 'Set after the first deploy' : ''" @click="visibility = v.key">{{ v.label }}</button>
        </div>
        <div class="hint">{{ visDesc }}</div>
      </div>

      <div class="card stack">
        <h2 class="section-label">Build</h2>
        <div class="hint">SYSTEMS. auto-detects Vue/Vite, static, Node, and Dockerfile builds from your archive. Custom overrides can be added in Settings after the first deploy.</div>
      </div>

      <div class="card stack">
        <h2 class="section-label">Environment variables</h2>
        <div v-if="envVarPairs.length" class="env-pairs">
          <div v-for="(pair, i) in envVarPairs" :key="i" class="env-row">
            <input v-model="pair.key" class="env-key" placeholder="KEY" autocapitalize="none" autocorrect="off" spellcheck="false" />
            <input v-model="pair.value" class="env-val" placeholder="value" autocorrect="off" spellcheck="false" />
            <button type="button" class="env-remove" :aria-label="`Remove ${pair.key || 'env var'}`" @click="removeEnvPair(i)"><Icon name="close" :size="16" /></button>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-ghost" style="align-self:flex-start" @click="addEnvPair"><Icon name="plus" /> Add variable</button>
        <div class="hint">Injected into the container at deploy time. Update or add more in Settings after deploy.</div>
      </div>
    </div>

    <!-- RIGHT: upload + lifecycle -->
    <div class="stack">
      <div class="card stack">
        <div class="step-head"><span class="step-num" :class="{ active: !file, done: !!file }">1</span><h2 class="section-label">Source archive</h2></div>
        <div class="dropzone" :class="{ over: dragOver, 'has-file': !!file }" @click="fileInput && fileInput.click()" @dragover.prevent="dragOver = true" @dragleave.prevent="dragOver = false" @drop.prevent="onDrop">
          <Icon name="upload" class="dz-ico" />
          <div v-if="file"><strong style="font-size: 15px">{{ file.name }}</strong><div class="small dim">{{ fmtSize(file.size) }} · click to change</div></div>
          <div v-else><strong>Drop a ZIP archive</strong><div class="small dim">or click to choose a file</div></div>
          <input ref="fileInput" type="file" accept=".zip,application/zip" style="display:none" @change="onPick" />
        </div>
        <div v-if="willChunk" class="hint">Large archive — streaming in chunks (limit {{ effectiveMaxMb }} MB).</div>
        <div v-else class="hint">Upload limit {{ effectiveMaxMb }} MB.<template v-if="largeUploads"> Archives over {{ uploadMaxMb }} MB stream in chunks.</template></div>
      </div>

      <div class="card stack">
        <h2 class="section-label">Deployment plan</h2>
        <div class="plan-note">Dry-run values below are known before upload. Build detection happens after SYSTEMS. extracts the archive.</div>
        <div class="detect-row">
          <span class="kv"><span class="k">Type</span><span class="v dim">{{ analysis ? analysis.projectType : (analyzing ? 'Analyzing archive…' : (file ? 'Waiting for analysis' : 'Choose an archive above')) }}</span></span>
          <span class="kv"><span class="k">Container</span><span class="v mono small">{{ plan ? plan.containerName : (slug ? 'systems-' + slug : 'systems-{slug}') }}</span></span>
          <span class="kv"><span class="k">Network</span><span class="v mono small">systems</span></span>
          <span class="kv"><span class="k">Proxy</span><span class="v dim">{{ plan ? plan.proxy : '—' }}</span></span>
          <span class="kv"><span class="k">Route</span><span class="v dim">{{ plan ? (plan.routePublished ? 'Caddy route generated after upload' : 'none (private)') : '—' }}</span></span>
        </div>
        <div v-if="analysisError" class="error-box">{{ analysisError }}</div>
        <div v-if="analysis?.warnings?.length" class="callout warn" style="margin:0">
          <div class="co-bar"></div>
          <div>{{ analysis.warnings.join(' ') }}</div>
        </div>
        <div class="plan-facts">
          <div v-for="fact in planFacts" :key="fact.label" class="plan-fact">
            <span>{{ fact.label }}</span>
            <strong>{{ fact.value }}</strong>
          </div>
        </div>
        <details v-if="plan && plan.route" style="margin-top:8px">
          <summary class="small muted" style="cursor:pointer">Caddy route preview (dry-run)</summary>
          <pre class="plan-route">{{ plan.route }}</pre>
        </details>
      </div>

      <div class="card stack">
        <h2 class="section-label">Host readiness</h2>
        <div v-if="systemsCount === null" class="hint">Checking first-deploy host readiness…</div>
        <div v-else-if="firstDeploy" class="host-ready">
          <div v-for="r in hostReadiness" :key="r.label" class="host-ready-row">
            <span class="sdot" :class="r.ok ? 'ok' : (r.required ? 'error' : 'warn')"></span>
            <span>
              <strong>{{ r.label }}</strong>
              <span class="small muted">{{ r.detail }}</span>
            </span>
          </div>
        </div>
        <div v-else class="hint">Host readiness is enforced before the first deploy. Existing systems indicate initial rollout has already completed.</div>
        <div v-if="hostBlocks.length" class="host-blocker" role="alert">
          <strong>Deployment blocked by {{ hostBlocks.length }} host check{{ hostBlocks.length === 1 ? '' : 's' }}</strong>
          <ul>
            <li v-for="block in hostBlocks" :key="block.label">
              <span>{{ block.label }}</span>
              <span>{{ block.action || block.detail }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="card stack">
        <h2 class="section-label">Ship</h2>
        <div class="lifecycle">
          <template v-for="(step, i) in LIFECYCLE" :key="step">
            <span class="lc-step"><span class="lc-dot"></span>{{ step }}</span>
            <span v-if="i < LIFECYCLE.length - 1" class="lc-link"></span>
          </template>
        </div>
        <ul class="readiness">
          <li v-for="r in readiness" :key="r.label" :class="{ ok: r.ok }">
            <span class="rd-mark" aria-hidden="true"><Icon :name="r.ok ? 'check' : 'circle'" /></span>{{ r.label }}
          </li>
        </ul>
        <div v-if="error" class="error-box">{{ error }}</div>
        <div v-if="uploading" class="stack">
          <div class="progress"><span :style="{ width: progress + '%' }"></span></div>
          <div class="small muted center">{{ uploadStage || (willChunk ? 'Streaming…' : 'Uploading…') }} {{ progress }}%</div>
        </div>
        <button class="btn btn-primary btn-block" type="submit" :disabled="!canDeploy">
          <span v-if="uploading" class="spinner"></span><span v-else>Deploy system</span>
        </button>
        <div class="hint">{{ canDeploy ? 'Build progress streams into the log after upload.' : nextStep }}</div>
      </div>
    </div>
  </form>
</template>

<style scoped>
.ship-active {
  width: 100%;
  max-width: 1240px;
  min-width: 0;
  display: grid;
  gap: 16px;
}
.ship-active > * { min-width: 0; }
.ship-status-card {
  padding: clamp(20px, 3vw, 32px);
  border-color: var(--border);
}
.ship-status-main {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(240px, 0.75fr);
  gap: clamp(24px, 5vw, 72px);
  align-items: start;
}
.ship-status-copy { max-width: 700px; }
.ship-status-label {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--text-muted);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
}
.ship-status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--warn);
}
.ship-active.is-success .ship-status-dot { background: var(--ok); }
.ship-active.is-error .ship-status-dot { background: var(--danger); }
.ship-status-copy h2 {
  margin: 14px 0 8px;
  font-size: clamp(1.45rem, 1.2rem + 0.7vw, 2rem);
  line-height: 1.2;
  text-wrap: balance;
}
.ship-status-copy p,
.ship-section-head p {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.55;
  text-wrap: pretty;
}
.ship-system-identity {
  display: grid;
  gap: 5px;
  padding-left: 22px;
  border-left: 1px solid var(--border);
  min-width: 0;
}
.ship-system-identity strong { font-size: 1.05rem; }
.ship-system-identity a {
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ship-system-identity a:hover { color: var(--text); }
.ship-status-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 28px;
  border-top: 1px solid var(--border-soft);
}
.ship-status-facts > div {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 18px 20px 0 0;
}
.ship-status-facts span {
  color: var(--text-dim);
  font-size: var(--fs-xs);
}
.ship-status-facts strong {
  overflow: hidden;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  text-overflow: ellipsis;
  text-transform: capitalize;
  white-space: nowrap;
}
.ship-pipeline,
.ship-log-card { padding: clamp(18px, 2.4vw, 24px); }
.ship-pipeline { overflow: hidden; }
.ship-section-head {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 18px;
}
.ship-section-head h2 {
  margin: 0 0 4px;
  font-size: 1rem;
  line-height: 1.35;
  text-wrap: balance;
}
.ship-section-head p { font-size: var(--fs-sm); }
.ship-steps {
  display: grid;
  grid-template-columns: repeat(9, minmax(76px, 1fr));
  margin: 0;
  padding: 0;
  overflow-x: auto;
  list-style: none;
  scrollbar-width: thin;
}
.ship-steps li {
  position: relative;
  display: grid;
  gap: 8px;
  min-width: 76px;
  padding: 12px 12px 10px 0;
  color: var(--text-dim);
  font-size: var(--fs-xs);
  text-transform: capitalize;
}
.ship-steps li::after {
  content: '';
  position: absolute;
  top: 16px;
  right: 8px;
  left: 29px;
  height: 1px;
  background: var(--border);
}
.ship-steps li:last-child::after { display: none; }
.ship-step-index {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 32px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-dim);
  font-family: var(--mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.ship-steps li.complete { color: var(--text-muted); }
.ship-steps li.complete .ship-step-index {
  border-color: color-mix(in srgb, var(--ok) 55%, var(--border));
  color: var(--ok);
}
.ship-steps li.failed:first-child .ship-step-index {
  border-color: var(--danger);
  color: var(--danger);
}
.ship-log-card :deep(.term-wrap) { height: clamp(320px, 42vh, 520px); }
.ship-active-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 2px;
}
.ship-active-actions .btn { min-width: 170px; }

@media (max-width: 760px) {
  .ship-active { gap: 12px; }
  .ship-status-main { grid-template-columns: 1fr; gap: 20px; }
  .ship-system-identity {
    padding: 16px 0 0;
    border-top: 1px solid var(--border-soft);
    border-left: 0;
  }
  .ship-status-facts { grid-template-columns: 1fr 1fr; }
  .ship-status-facts > div { padding-top: 14px; }
  .ship-status-facts > div:last-child { grid-column: 1 / -1; }
  .ship-section-head { gap: 12px; }
  .ship-log-card :deep(.term-wrap) { height: 360px; }
  .ship-active-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .ship-active-actions .btn { width: 100%; }
}
.url-preview-lg { font-size: 16px; padding: 12px 14px; }
.detect-row { display: flex; flex-direction: column; gap: 0; }
.detect-row .kv { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid var(--border-soft); font-size: 13px; }
.detect-row .kv:last-child { border-bottom: none; }
.plan-note {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.45;
}
.plan-facts {
  display: grid;
  gap: 8px;
  padding-top: 2px;
}
.plan-fact {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  font-size: 12.5px;
}
.plan-fact span { color: var(--text-dim); }
.plan-fact strong { color: var(--text-muted); font-weight: 550; line-height: 1.4; }
.plan-route {
  margin: 8px 0 0; padding: 10px 12px; background: var(--bg-input);
  border: 1px solid var(--border-soft); border-radius: var(--radius-sm);
  font-family: var(--mono); font-size: 12px; color: var(--text-muted);
  white-space: pre-wrap; overflow-x: auto;
}
.slug-status {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; margin-top: 6px; padding: 4px 0;
}
.slug-status.ok { color: var(--ok); }
.slug-status.error { color: var(--danger); }
.slug-status.idle { color: var(--text-dim); }
.env-pairs { display: flex; flex-direction: column; gap: 6px; }
.env-row { display: flex; gap: 6px; align-items: center; }
.env-key { width: 130px; flex-shrink: 0; font-family: var(--mono); font-size: 13px; }
.env-val { flex: 1; min-width: 0; font-family: var(--mono); font-size: 13px; }
.env-remove { display: inline-grid; place-items: center; width: 44px; height: 44px; padding: 0; background: none; border: none; cursor: pointer; color: var(--text-dim); font-size: 18px; line-height: 1; }
.env-remove:hover { color: var(--danger); }
.readiness { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.readiness li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-dim); }
.readiness li.ok { color: var(--text-muted); }
.readiness .rd-mark { width: 14px; flex-shrink: 0; text-align: center; color: var(--text-disabled); font-weight: 700; }
.readiness li.ok .rd-mark { color: var(--ok); }
.host-blocker {
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--danger) 55%, var(--border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--danger-dim) 70%, var(--bg-card));
}
.host-blocker > strong {
  display: block;
  color: #ffb4ae;
  font-size: var(--fs-sm);
}
.host-blocker ul {
  display: grid;
  gap: 8px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.host-blocker li {
  display: grid;
  gap: 2px;
  color: var(--text-muted);
  font-size: var(--fs-sm);
  line-height: 1.45;
}
.host-blocker li span:first-child {
  color: var(--text);
  font-weight: var(--fw-medium);
}
.host-ready { display: grid; gap: 8px; }
.host-ready-row {
  display: grid;
  grid-template-columns: 10px 1fr;
  gap: 10px;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-soft);
}
.host-ready-row:last-child { border-bottom: none; }
.host-ready-row .sdot { margin-top: 6px; }
.host-ready-row strong { display: block; font-size: 13.5px; }
.host-ready-row .small { display: block; margin-top: 2px; line-height: 1.4; }
</style>
