<script setup>
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import LogConsole from '../components/LogConsole.vue'
import AsciiChaosField from '../components/AsciiChaosField.vue'

const router = useRouter()

// The defined deploy pipeline — shown as a reference rail (atmosphere, not a
// fake live readout; SYSTEMS. does not assert which substep is running).
const LIFECYCLE = ['archive', 'detect', 'install', 'build', 'container', 'route', 'HTTPS', 'health', 'live']
const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'acronym.sk'
const SCHEME = import.meta.env.VITE_PUBLIC_SCHEME || 'https'

const name = ref('')
const slug = ref('')
const slugEdited = ref(false)
const visibility = ref('public') // public | password | private
const file = ref(null)
const dragOver = ref(false)
const fileInput = ref(null)

const uploading = ref(false)
const progress = ref(0)
const error = ref('')
const deployedSlug = ref('')
const phase = ref('form') // form | building
const buildResult = ref('') // '' | 'done' | 'error' (from the real build stream)

function onBuildFinished(status) {
  buildResult.value = status
}

function slugify(s) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

watch(name, (v) => { if (!slugEdited.value) slug.value = slugify(v) })

function onSlugInput(e) {
  slugEdited.value = true
  slug.value = slugify(e.target.value)
}

const slugValid = computed(() => /^[a-z0-9-]{2,50}$/.test(slug.value))

function setFile(f) {
  if (!f) return
  if (!/\.zip$/i.test(f.name)) { error.value = 'Please select a .zip archive.'; return }
  error.value = ''
  file.value = f
}
function onDrop(e) { dragOver.value = false; setFile(e.dataTransfer.files && e.dataTransfer.files[0]) }
function onPick(e) { setFile(e.target.files && e.target.files[0]) }

function fmtSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

async function submit() {
  error.value = ''
  if (!name.value.trim()) return (error.value = 'Enter a system name.')
  if (!slugValid.value) return (error.value = 'Slug must be 2–50 chars: a–z, 0–9 and hyphens.')
  if (!file.value) return (error.value = 'Choose a .zip archive to ship.')

  uploading.value = true
  progress.value = 0
  try {
    const data = await api.upload('/deploy', {
      fields: { name: name.value.trim(), slug: slug.value },
      files: { file: file.value },
      onProgress: (p) => (progress.value = p)
    })
    deployedSlug.value = (data && data.project && data.project.slug) || slug.value
    phase.value = 'building'
  } catch (e) {
    error.value = e.message || 'Ship failed.'
  } finally {
    uploading.value = false
  }
}

function reset() {
  name.value = ''; slug.value = ''; slugEdited.value = false
  file.value = null; progress.value = 0; deployedSlug.value = ''
  phase.value = 'form'; error.value = ''; visibility.value = 'public'
  buildResult.value = ''
}

function openSystem() {
  router.push({ name: 'system-detail', params: { slug: deployedSlug.value } })
}
</script>

<template>
  <div class="page-head">
    <h1>Ship</h1>
  </div>

  <!-- BUILDING -->
  <div v-if="phase === 'building'" class="stack" style="max-width: 820px">
    <div class="brand-panel" :class="{ live: buildResult === 'done' }">
      <AsciiChaosField :intensity="0.7" :cell="12" />
      <div class="brand-panel-fade" aria-hidden="true"></div>
      <div class="spread">
        <div>
          <div class="sc-name" style="font-size:17px">{{ name || deployedSlug }}</div>
          <a class="mono small" :href="`${SCHEME}://${deployedSlug}.${BASE_DOMAIN}`" target="_blank" rel="noopener">
            {{ deployedSlug }}.{{ BASE_DOMAIN }}
          </a>
        </div>
        <span v-if="buildResult === 'done'" class="live-pulse"><span class="lp-dot"></span>Live</span>
        <span v-else-if="buildResult === 'error'" class="badge badge-error"><span class="dot"></span>Failed</span>
        <span v-else class="badge badge-building"><span class="dot"></span>Building</span>
      </div>

      <!-- Lifecycle rail -->
      <div class="lifecycle" style="margin-top: 22px">
        <template v-for="(step, i) in LIFECYCLE" :key="step">
          <span class="lc-step" :class="{ active: buildResult === 'done' }"><span class="lc-dot"></span>{{ step }}</span>
          <span v-if="i < LIFECYCLE.length - 1" class="lc-link"></span>
        </template>
      </div>
    </div>

    <div class="card">
      <div class="section-label" style="margin-bottom: 10px">Build log</div>
      <LogConsole :slug="deployedSlug" mode="build" @finished="onBuildFinished" />
    </div>

    <div class="btn-row" style="max-width: 360px">
      <button class="btn" @click="reset">Ship another</button>
      <button class="btn btn-primary" @click="openSystem">Open system</button>
    </div>
  </div>

  <!-- WORKBENCH -->
  <form v-else class="workbench" @submit.prevent="submit">
    <!-- LEFT: configuration -->
    <div class="stack">
      <div class="card stack">
        <div class="step-head">
          <span class="step-num" :class="{ active: !name }">1</span>
          <div class="section-label" style="margin: 0">System</div>
        </div>

        <div class="field" style="margin: 0">
          <label class="label" for="name">Name</label>
          <input id="name" v-model="name" placeholder="Notes API" autocorrect="off" />
        </div>

        <div class="field" style="margin: 0">
          <label class="label" for="slug">Slug</label>
          <input id="slug" :value="slug" placeholder="notes" autocapitalize="none" autocorrect="off" @input="onSlugInput" />
          <div class="hint">Becomes the subdomain. Letters, numbers, hyphens.</div>
        </div>

        <div class="field" style="margin: 0">
          <label class="label">Public URL</label>
          <div class="url-preview">
            <span class="scheme">{{ SCHEME }}://</span><span class="slug">{{ slug || 'your-system' }}</span>.{{ BASE_DOMAIN }}
          </div>
        </div>
      </div>

      <div class="card stack">
        <div class="section-label" style="margin: 0">Visibility</div>
        <div class="segmented">
          <button type="button" :class="{ active: visibility === 'public' }" @click="visibility = 'public'">Public</button>
          <button type="button" :class="{ active: visibility === 'password' }" disabled title="Arrives in V1.2">Password</button>
          <button type="button" :class="{ active: visibility === 'private' }" disabled title="Arrives in V1.2">Private</button>
        </div>
        <div class="hint">Password-protected and private modes arrive in V1.2.</div>
      </div>

      <div class="card stack">
        <div class="section-label" style="margin: 0">Deployment type</div>
        <div class="hint">Detected from the archive — Vue/Vite, static, Node, or Dockerfile. Shown in the build log.</div>
      </div>

      <div class="card stack">
        <div class="section-label" style="margin: 0">Environment variables</div>
        <div class="hint">Set after the first deploy, in Settings. Stored encrypted; values aren't shown again.</div>
      </div>
    </div>

    <!-- RIGHT: upload + lifecycle -->
    <div class="stack">
      <div class="card stack">
        <div class="step-head">
          <span class="step-num" :class="{ active: !file, done: !!file }">2</span>
          <div class="section-label" style="margin: 0">Source archive</div>
        </div>

        <div
          class="dropzone"
          :class="{ over: dragOver, 'has-file': !!file }"
          @click="fileInput && fileInput.click()"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
        >
          <svg class="dz-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5" /><path d="M3 19h18" />
          </svg>
          <div v-if="file">
            <strong style="font-size: 15px">{{ file.name }}</strong>
            <div class="small dim">{{ fmtSize(file.size) }} · click to change</div>
          </div>
          <div v-else>
            <strong>Drop a .zip to ship</strong>
            <div class="small dim">or click to choose a file</div>
          </div>
          <input ref="fileInput" type="file" accept=".zip,application/zip" style="display:none" @change="onPick" />
        </div>
      </div>

      <div class="card stack">
        <div class="step-head">
          <span class="step-num" :class="{ active: !!file }">3</span>
          <div class="section-label" style="margin: 0">Ship</div>
        </div>

        <div v-if="error" class="error-box">{{ error }}</div>

        <div v-if="uploading" class="stack">
          <div class="progress"><span :style="{ width: progress + '%' }"></span></div>
          <div class="small muted center">Uploading… {{ progress }}%</div>
        </div>

        <button class="btn btn-primary btn-block" type="submit" :disabled="uploading">
          <span v-if="uploading" class="spinner"></span>
          <span v-else>Build &amp; deploy</span>
        </button>

        <div class="lifecycle">
          <template v-for="(step, i) in LIFECYCLE" :key="step">
            <span class="lc-step"><span class="lc-dot"></span>{{ step }}</span>
            <span v-if="i < LIFECYCLE.length - 1" class="lc-link"></span>
          </template>
        </div>
        <div class="hint">Build progress streams into the log after upload.</div>
      </div>
    </div>
  </form>
</template>
