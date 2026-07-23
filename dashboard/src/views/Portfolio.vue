<script setup>
// V4 Phase 5 — Portfolio CMS dashboard area (roadmap: "Dashboard Portfolio
// area: homepage, nav, product-page, media, legal, redirects, locales,
// publish history, rollback"). Hidden admin/test page like Products.vue —
// reachable only by URL at /portfolio, and only useful once
// ENABLE_V4_PORTFOLIO is on — otherwise every read 404s and the empty state
// explains why.
import { ref, computed, onMounted } from 'vue'
import { api } from '../api/client'
import Icon from '../components/Icon.vue'

const enabled = ref(true)
const error = ref('')
const locale = ref('en')
const LOCALES = ['en', 'sk']

const TABS = ['Homepage', 'Pages', 'Products', 'Media', 'Legal', 'Redirects', 'Locales', 'Publish']
const tab = ref('Homepage')

/* ---------- Pages ---------- */
const pages = ref([])
const pageForm = ref({ slug: '', title: '', pageType: 'page', seoTitle: '', seoDescription: '', content: '' })
const savingPage = ref(false)
const pageMsg = ref('')

async function loadPages() {
  try {
    const data = await api.get(`/portfolio/pages?locale=${locale.value}`)
    pages.value = data.pages || []
    enabled.value = true
  } catch (e) {
    if (e.status === 404) { enabled.value = false; pages.value = [] }
    else if (e.status !== 401) error.value = e.message || 'Failed to load pages.'
  }
}

function editPage(p) {
  pageForm.value = { ...p }
}
function newPage(pageType) {
  pageForm.value = { slug: '', title: '', pageType, seoTitle: '', seoDescription: '', content: '', locale: locale.value }
}

async function savePage() {
  pageMsg.value = ''
  savingPage.value = true
  try {
    await api.put('/portfolio/pages', { ...pageForm.value, locale: locale.value })
    pageMsg.value = 'Saved.'
    await loadPages()
  } catch (e) {
    pageMsg.value = e.message || 'Save failed.'
  } finally {
    savingPage.value = false
  }
}

const homepage = computed(() => pages.value.find((p) => p.pageType === 'homepage') || null)
const navPage = computed(() => pages.value.find((p) => p.pageType === 'navigation') || null)
const otherPages = computed(() => pages.value.filter((p) => !['homepage', 'navigation', 'legal'].includes(p.pageType)))
const legalPages = computed(() => pages.value.filter((p) => p.pageType === 'legal'))

/* ---------- Product profiles ---------- */
const profiles = ref([])
async function loadProfiles() {
  try {
    const data = await api.get(`/portfolio/profiles?locale=${locale.value}`)
    profiles.value = data.profiles || []
  } catch { /* covered by loadPages enabled-check */ }
}

const profileForm = ref({ productId: '', title: '', tagline: '', shortDescription: '', fullDescription: '', seoTitle: '', seoDescription: '' })
const savingProfile = ref(false)
const profileMsg = ref('')
function editProfile(p) { profileForm.value = { ...p } }
function newProfile() { profileForm.value = { productId: '', title: '', tagline: '', shortDescription: '', fullDescription: '', seoTitle: '', seoDescription: '' } }
async function saveProfile() {
  profileMsg.value = ''
  savingProfile.value = true
  try {
    await api.put('/portfolio/profiles', { ...profileForm.value, locale: locale.value })
    profileMsg.value = 'Saved.'
    await loadProfiles()
  } catch (e) {
    profileMsg.value = e.message || 'Save failed.'
  } finally {
    savingProfile.value = false
  }
}

/* ---------- Media ---------- */
const media = ref([])
async function loadMedia() {
  try {
    const data = await api.get('/portfolio/media')
    media.value = data.media || []
  } catch { /* covered by loadPages enabled-check */ }
}

/* ---------- Legal versions ---------- */
const legalForm = ref({ docType: 'terms', version: '', content: '', effectiveAt: '' })
const savingLegal = ref(false)
const legalMsg = ref('')
async function saveLegal() {
  legalMsg.value = ''
  savingLegal.value = true
  try {
    await api.post('/portfolio/legal', { ...legalForm.value, locale: locale.value })
    legalMsg.value = 'Legal version recorded.'
    await loadPages()
  } catch (e) {
    legalMsg.value = e.message || 'Save failed.'
  } finally {
    savingLegal.value = false
  }
}

/* ---------- Redirects ---------- */
const redirects = ref([])
const redirectForm = ref({ fromPath: '', toPath: '', statusCode: 301 })
const savingRedirect = ref(false)
const redirectMsg = ref('')

async function loadRedirects() {
  try {
    const data = await api.get(`/portfolio/redirects?locale=${locale.value}`)
    redirects.value = data.redirects || []
  } catch { /* covered by loadPages enabled-check */ }
}

async function createRedirect() {
  redirectMsg.value = ''
  savingRedirect.value = true
  try {
    await api.post('/portfolio/redirects', { ...redirectForm.value, locale: locale.value })
    redirectForm.value = { fromPath: '', toPath: '', statusCode: 301 }
    await loadRedirects()
  } catch (e) {
    redirectMsg.value = e.message || 'Failed to create redirect.'
  } finally {
    savingRedirect.value = false
  }
}

async function removeRedirect(id) {
  try {
    await api.del(`/portfolio/redirects/${id}`)
    await loadRedirects()
  } catch (e) {
    redirectMsg.value = e.message || 'Failed to remove redirect.'
  }
}

/* ---------- Locales / translation completeness ---------- */
const localeReport = ref(null)
async function loadLocaleReport() {
  try {
    localeReport.value = await api.get('/portfolio/locales')
  } catch { /* covered by loadPages enabled-check */ }
}

/* ---------- Publish / snapshots / rollback ---------- */
const preview = ref(null)
const previewing = ref(false)
const previewError = ref('')
async function runPreview() {
  previewError.value = ''
  previewing.value = true
  try {
    preview.value = await api.post('/portfolio/preview', { locale: locale.value })
  } catch (e) {
    previewError.value = e.message || 'Preview failed.'
  } finally {
    previewing.value = false
  }
}

const publishing = ref(false)
const publishMsg = ref('')
async function doPublish() {
  publishMsg.value = ''
  publishing.value = true
  try {
    const result = await api.post('/portfolio/publish', { locale: locale.value })
    publishMsg.value = `Published v${result.snapshot.version} (${result.snapshot.sizeBytes}B).`
    await loadSnapshots()
  } catch (e) {
    publishMsg.value = e.message || 'Publish failed.'
  } finally {
    publishing.value = false
  }
}

const snapshots = ref([])
async function loadSnapshots() {
  try {
    const data = await api.get(`/portfolio/snapshots?locale=${locale.value}`)
    snapshots.value = data.snapshots || []
  } catch { /* covered by loadPages enabled-check */ }
}

const rollingBack = ref(null)
async function doRollback(version) {
  rollingBack.value = version
  publishMsg.value = ''
  try {
    const result = await api.post(`/portfolio/snapshots/${version}/rollback`, { locale: locale.value })
    publishMsg.value = `Rolled back to v${version}, republished as v${result.snapshot.version}.`
    await loadSnapshots()
  } catch (e) {
    publishMsg.value = e.message || 'Rollback failed.'
  } finally {
    rollingBack.value = null
  }
}

async function loadAll() {
  error.value = ''
  await loadPages()
  if (!enabled.value) return
  await Promise.all([loadProfiles(), loadMedia(), loadRedirects(), loadLocaleReport(), loadSnapshots()])
}

async function switchLocale(l) {
  locale.value = l
  await loadAll()
}

onMounted(loadAll)
</script>

<template>
  <div class="page-head">
    <h1>Portfolio <span class="small muted">V4 · hidden test page</span></h1>
    <div class="locale-switch">
      <button
        v-for="l in LOCALES" :key="l"
        class="btn btn-sm" :class="{ 'btn-primary': locale === l }"
        @click="switchLocale(l)"
      >{{ l.toUpperCase() }}</button>
    </div>
  </div>

  <div v-if="error" class="card" style="margin-bottom: 22px">{{ error }}</div>

  <div v-if="!enabled" class="card" style="margin-bottom: 22px">
    <div class="c-name">Portfolio CMS is dark</div>
    <div class="hint">Enable <span class="mono">ENABLE_V4_PORTFOLIO</span> to use this page. It stays out of the navigation until the public Portfolio ships.</div>
  </div>

  <template v-else>
    <div class="tabs" style="margin-bottom: 18px">
      <button v-for="t in TABS" :key="t" :class="{ active: tab === t }" @click="tab = t">{{ t }}</button>
    </div>

    <!-- HOMEPAGE -->
    <div v-show="tab === 'Homepage'" class="stack">
      <h2 class="section-label">Homepage ({{ locale.toUpperCase() }})</h2>
      <div class="card" style="margin-bottom: 22px">
        <div v-if="homepage" class="kv"><span class="k">Current</span><span class="v mono">{{ homepage.slug }} · {{ homepage.status }}</span></div>
        <div v-else class="hint">No homepage draft yet for this locale.</div>
        <button class="btn btn-sm" style="margin-top: 8px" @click="editPage(homepage || {}); pageForm.pageType = 'homepage'; pageForm.slug = pageForm.slug || 'home'">
          <Icon name="edit" /> {{ homepage ? 'Edit' : 'Create' }} homepage
        </button>
      </div>

      <h2 class="section-label">Navigation</h2>
      <div class="card" style="margin-bottom: 22px">
        <div v-if="navPage" class="kv"><span class="k">Current</span><span class="v mono">{{ navPage.slug }} · {{ navPage.status }}</span></div>
        <div v-else class="hint">No navigation draft yet for this locale.</div>
        <button class="btn btn-sm" style="margin-top: 8px" @click="editPage(navPage || {}); pageForm.pageType = 'navigation'; pageForm.slug = pageForm.slug || 'nav'">
          <Icon name="edit" /> {{ navPage ? 'Edit' : 'Create' }} navigation
        </button>
      </div>

      <h2 class="section-label">{{ pageForm.pageType || 'Page' }} editor</h2>
      <div class="card stack" style="margin-bottom: 22px">
        <input v-model="pageForm.slug" placeholder="slug" class="input mono" />
        <input v-model="pageForm.title" placeholder="Title" class="input" />
        <input v-model="pageForm.seoTitle" placeholder="SEO title" class="input" />
        <input v-model="pageForm.seoDescription" placeholder="SEO description" class="input" />
        <textarea v-model="pageForm.content" placeholder="Content (blocks come later — plain text for now)" class="input" rows="4" />
        <button class="btn" :disabled="savingPage || !pageForm.slug || !pageForm.title" @click="savePage">
          <Icon name="save" /> Save draft
        </button>
        <div v-if="pageMsg" class="hint">{{ pageMsg }}</div>
      </div>
    </div>

    <!-- PAGES -->
    <div v-show="tab === 'Pages'" class="stack">
      <h2 class="section-label">All pages ({{ locale.toUpperCase() }})</h2>
      <div class="card" style="margin-bottom: 22px">
        <div v-if="!otherPages.length" class="hint">No non-homepage pages yet.</div>
        <div v-for="p in otherPages" :key="p.id" class="kv">
          <span class="k">{{ p.title }}</span>
          <span class="v mono row gap-sm" style="justify-content:flex-end">
            {{ p.slug }} · {{ p.status }}
            <button class="btn btn-sm btn-ghost" @click="editPage(p); tab = 'Homepage'"><Icon name="edit" /></button>
          </span>
        </div>
        <button class="btn btn-sm" style="margin-top: 8px" @click="newPage('page'); tab = 'Homepage'">
          <Icon name="plus" /> New page
        </button>
      </div>
    </div>

    <!-- PRODUCTS -->
    <div v-show="tab === 'Products'" class="stack">
      <h2 class="section-label">Product portfolio profiles ({{ locale.toUpperCase() }})</h2>
      <div class="card" style="margin-bottom: 22px">
        <div v-if="!profiles.length" class="hint">No product profiles yet. Product IDs come from the V4 Products API (see /products).</div>
        <div v-for="p in profiles" :key="p.id" class="kv">
          <span class="k">{{ p.title }}</span>
          <span class="v mono row gap-sm" style="justify-content:flex-end">
            {{ p.completenessScore }}% complete
            <button class="btn btn-sm btn-ghost" @click="editProfile(p)"><Icon name="edit" /></button>
          </span>
        </div>
      </div>

      <h2 class="section-label">Profile editor</h2>
      <div class="card stack" style="margin-bottom: 22px">
        <input v-model="profileForm.productId" placeholder="Product ID (UUID)" class="input mono" />
        <input v-model="profileForm.title" placeholder="Title" class="input" />
        <input v-model="profileForm.tagline" placeholder="Tagline" class="input" />
        <textarea v-model="profileForm.shortDescription" placeholder="Short description" class="input" rows="2" />
        <textarea v-model="profileForm.fullDescription" placeholder="Full description" class="input" rows="4" />
        <input v-model="profileForm.seoTitle" placeholder="SEO title" class="input" />
        <input v-model="profileForm.seoDescription" placeholder="SEO description" class="input" />
        <div class="btn-row">
          <button class="btn" :disabled="savingProfile || !profileForm.productId || !profileForm.title" @click="saveProfile">
            <Icon name="save" /> Save draft
          </button>
          <button class="btn btn-ghost btn-sm" @click="newProfile">New</button>
        </div>
        <div v-if="profileMsg" class="hint">{{ profileMsg }}</div>
      </div>
    </div>

    <!-- MEDIA -->
    <div v-show="tab === 'Media'" class="stack">
      <h2 class="section-label">Media library</h2>
      <div class="card" style="margin-bottom: 22px">
        <div v-if="!media.length" class="hint">
          No media uploaded yet. The upload/quarantine/scan pipeline (Alex, Phase 5) is not wired —
          this list reads whatever exists in <span class="mono">media_assets</span> once it does.
        </div>
        <div v-for="m in media" :key="m.id" class="kv">
          <span class="k">{{ m.altText || m.storageKey }}</span>
          <span class="v mono">{{ m.mediaType }} · {{ m.status }}</span>
        </div>
      </div>
    </div>

    <!-- LEGAL -->
    <div v-show="tab === 'Legal'" class="stack">
      <h2 class="section-label">Legal pages ({{ locale.toUpperCase() }})</h2>
      <div class="card" style="margin-bottom: 22px">
        <div v-if="!legalPages.length" class="hint">No published legal page drafts for this locale yet.</div>
        <div v-for="p in legalPages" :key="p.id" class="kv">
          <span class="k">{{ p.title }}</span>
          <span class="v mono">{{ p.slug }} · {{ p.status }}</span>
        </div>
      </div>

      <h2 class="section-label">Record legal version</h2>
      <div class="card stack" style="margin-bottom: 22px">
        <select v-model="legalForm.docType" class="input">
          <option value="terms">Terms of service</option>
          <option value="privacy">Privacy policy</option>
          <option value="withdrawal">Withdrawal rights</option>
        </select>
        <input v-model="legalForm.version" placeholder="Version (e.g. 2026-07-01)" class="input mono" />
        <input v-model="legalForm.effectiveAt" type="datetime-local" class="input" />
        <textarea v-model="legalForm.content" placeholder="Full legal text" class="input" rows="6" />
        <button class="btn" :disabled="savingLegal || !legalForm.version || !legalForm.effectiveAt" @click="saveLegal">
          <Icon name="save" /> Record version
        </button>
        <div v-if="legalMsg" class="hint">{{ legalMsg }}</div>
      </div>
    </div>

    <!-- REDIRECTS -->
    <div v-show="tab === 'Redirects'" class="stack">
      <h2 class="section-label">Redirects ({{ locale.toUpperCase() }})</h2>
      <div class="card" style="margin-bottom: 22px">
        <div v-if="!redirects.length" class="hint">No redirects configured for this locale.</div>
        <div v-for="r in redirects" :key="r.id" class="kv">
          <span class="k mono">{{ r.fromPath }} → {{ r.toPath }}</span>
          <span class="v row gap-sm" style="justify-content:flex-end">
            {{ r.statusCode }}
            <button class="btn btn-sm btn-ghost" @click="removeRedirect(r.id)"><Icon name="trash" /></button>
          </span>
        </div>
      </div>

      <h2 class="section-label">Add redirect</h2>
      <div class="card stack" style="margin-bottom: 22px">
        <input v-model="redirectForm.fromPath" placeholder="/old-path" class="input mono" />
        <input v-model="redirectForm.toPath" placeholder="/new-path" class="input mono" />
        <select v-model.number="redirectForm.statusCode" class="input">
          <option :value="301">301 — Permanent</option>
          <option :value="302">302 — Temporary</option>
        </select>
        <button class="btn" :disabled="savingRedirect || !redirectForm.fromPath || !redirectForm.toPath" @click="createRedirect">
          <Icon name="plus" /> Add redirect
        </button>
        <div v-if="redirectMsg" class="hint">{{ redirectMsg }}</div>
      </div>
    </div>

    <!-- LOCALES -->
    <div v-show="tab === 'Locales'" class="stack">
      <h2 class="section-label">Translation completeness</h2>
      <div class="card" style="margin-bottom: 22px">
        <div v-if="!localeReport" class="hint">Loading…</div>
        <template v-else>
          <div class="kv"><span class="k">Supported locales</span><span class="v mono">{{ localeReport.supportedLocales.join(', ') }}</span></div>
          <h3 class="small muted" style="margin: 12px 0 4px">Pages</h3>
          <div v-if="!localeReport.pages.length" class="hint">No pages yet.</div>
          <div v-for="r in localeReport.pages" :key="r.key" class="kv">
            <span class="k mono">{{ r.key }}</span>
            <span class="v" :class="r.complete ? 'ok-text' : 'warn-text'">
              {{ r.complete ? 'Complete' : `Missing: ${r.missing.join(', ')}` }}
            </span>
          </div>
          <h3 class="small muted" style="margin: 12px 0 4px">Product profiles</h3>
          <div v-if="!localeReport.profiles.length" class="hint">No product profiles yet.</div>
          <div v-for="r in localeReport.profiles" :key="r.key" class="kv">
            <span class="k mono">{{ r.key }}</span>
            <span class="v" :class="r.complete ? 'ok-text' : 'warn-text'">
              {{ r.complete ? 'Complete' : `Missing: ${r.missing.join(', ')}` }}
            </span>
          </div>
        </template>
      </div>
    </div>

    <!-- PUBLISH -->
    <div v-show="tab === 'Publish'" class="stack">
      <h2 class="section-label">Preview ({{ locale.toUpperCase() }})</h2>
      <div class="card stack" style="margin-bottom: 22px">
        <button class="btn btn-sm" :disabled="previewing" @click="runPreview">
          <Icon name="eye" /> {{ previewing ? 'Building preview…' : 'Build preview' }}
        </button>
        <div v-if="previewError" class="hint error-text">{{ previewError }}</div>
        <div v-if="preview" class="kv"><span class="k">Preview size</span><span class="v mono">{{ preview.sizeBytes }}B · {{ preview.hash.slice(0, 12) }}</span></div>
      </div>

      <h2 class="section-label">Publish</h2>
      <div class="card stack" style="margin-bottom: 22px">
        <div class="hint">
          Publishing validates every draft page, builds an immutable snapshot, and records a new version.
          Concurrent publishes for the same locale are rejected (5-minute lock). This does not yet push to
          S3/CDN — <span class="mono">/api/public/*</span> reads live from PostgreSQL until Alex's Phase 5 S3 pipeline ships.
        </div>
        <button class="btn btn-primary" :disabled="publishing" @click="doPublish">
          <Icon name="upload" /> {{ publishing ? 'Publishing…' : `Publish ${locale.toUpperCase()}` }}
        </button>
        <div v-if="publishMsg" class="hint">{{ publishMsg }}</div>
      </div>

      <h2 class="section-label">Publish history</h2>
      <div class="card" style="margin-bottom: 22px">
        <div v-if="!snapshots.length" class="hint">No published snapshots yet.</div>
        <div v-for="s in snapshots" :key="s.id" class="kv">
          <span class="k mono">v{{ s.version }}</span>
          <span class="v row gap-sm" style="justify-content:flex-end">
            {{ new Date(s.publishedAt).toLocaleString() }} · {{ s.contentHash.slice(0, 10) }}
            <button class="btn btn-sm btn-ghost" :disabled="rollingBack === s.version" @click="doRollback(s.version)">
              {{ rollingBack === s.version ? 'Rolling back…' : 'Rollback' }}
            </button>
          </span>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.locale-switch {
  display: flex;
  gap: 6px;
}
.ok-text { color: var(--ok, #22c55e); }
.warn-text { color: var(--warning, #b45309); }
.error-text { color: var(--error, #ef4444); }
.mono { font-family: monospace; }
</style>
