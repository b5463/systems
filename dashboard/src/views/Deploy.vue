<script setup>
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import TopBar from '../components/TopBar.vue'
import LogConsole from '../components/LogConsole.vue'

const router = useRouter()

const name = ref('')
const slug = ref('')
const slugEdited = ref(false)
const file = ref(null)
const dragOver = ref(false)

const uploading = ref(false)
const progress = ref(0)
const error = ref('')
const deployedSlug = ref('')
const phase = ref('form') // form | building | done

const fileInput = ref(null)

function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

watch(name, (v) => {
  if (!slugEdited.value) slug.value = slugify(v)
})

function onSlugInput(e) {
  slugEdited.value = true
  slug.value = slugify(e.target.value)
}

const slugValid = computed(() => /^[a-z0-9-]{2,50}$/.test(slug.value))

function setFile(f) {
  if (!f) return
  if (!/\.zip$/i.test(f.name)) {
    error.value = 'Please select a .zip file.'
    return
  }
  error.value = ''
  file.value = f
}

function onDrop(e) {
  dragOver.value = false
  const f = e.dataTransfer.files && e.dataTransfer.files[0]
  setFile(f)
}

function onPick(e) {
  setFile(e.target.files && e.target.files[0])
}

function fmtSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

async function submit() {
  error.value = ''
  if (!name.value.trim()) return (error.value = 'Enter an app name.')
  if (!slugValid.value) return (error.value = 'Slug must be 2-50 chars: a-z, 0-9 and hyphens.')
  if (!file.value) return (error.value = 'Choose a .zip file to deploy.')

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
    error.value = e.message || 'Deploy failed.'
  } finally {
    uploading.value = false
  }
}

function reset() {
  name.value = ''
  slug.value = ''
  slugEdited.value = false
  file.value = null
  progress.value = 0
  deployedSlug.value = ''
  phase.value = 'form'
  error.value = ''
}

function goToProject() {
  router.push({ name: 'project-detail', params: { slug: deployedSlug.value } })
}
</script>

<template>
  <TopBar title="Deploy" />

  <div class="page">
    <!-- FORM -->
    <form v-if="phase === 'form'" class="stack" @submit.prevent="submit">
      <div class="card stack">
        <div class="field" style="margin: 0">
          <label class="label" for="name">App name</label>
          <input id="name" v-model="name" placeholder="e.g. Notes API" autocorrect="off" />
        </div>

        <div class="field" style="margin: 0">
          <label class="label" for="slug">URL slug</label>
          <input
            id="slug"
            :value="slug"
            placeholder="my-api"
            autocapitalize="none"
            autocorrect="off"
            @input="onSlugInput"
          />
          <div class="hint">Letters, numbers, hyphens — becomes the URL path.</div>
        </div>
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
          <path d="M12 16V4M7 9l5-5 5 5"/>
          <path d="M3 19h18"/>
        </svg>
        <div v-if="file">
          <strong style="font-size: 15px">{{ file.name }}</strong>
          <div class="small dim">{{ fmtSize(file.size) }} · tap to change</div>
        </div>
        <div v-else>
          <strong>Drop a .zip to deploy</strong>
          <div class="small dim">or tap to choose file</div>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept=".zip,application/zip"
          style="display: none"
          @change="onPick"
        />
      </div>

      <div v-if="error" class="error-box">{{ error }}</div>

      <div v-if="uploading" class="stack">
        <div class="progress"><span :style="{ width: progress + '%' }"></span></div>
        <div class="small muted center">Uploading… {{ progress }}%</div>
      </div>

      <button class="btn btn-primary btn-block" type="submit" :disabled="uploading">
        <span v-if="uploading" class="spinner"></span><span v-else>Deploy app</span>
      </button>
    </form>

    <!-- BUILDING -->
    <div v-else class="stack">
      <div class="card">
        <div class="spread">
          <div>
            <div style="font-weight: 700">{{ name || deployedSlug }}</div>
            <div class="mono dim small">/{{ deployedSlug }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="spread" style="margin-bottom: 10px">
          <div class="label" style="margin: 0">Build log</div>
          <span class="badge badge-building">
            <span class="dot"></span>
            Building…
          </span>
        </div>
        <LogConsole :slug="deployedSlug" mode="build" />
      </div>

      <div class="btn-row">
        <button class="btn" @click="reset">Deploy another</button>
        <button class="btn btn-primary" @click="goToProject">Open app</button>
      </div>
    </div>
  </div>
</template>
