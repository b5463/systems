<script setup>
import { ref, computed } from 'vue'
import { api } from '../api/client'
import Icon from './Icon.vue'
import { useToast } from '../composables/useToast'

const props = defineProps({
  system: { type: Object, required: true },
})
const emit = defineEmits(['reload'])

const { showToast } = useToast()

// ---- Domain state ----
// V4 Phase 4: domains come from system_environment_routes + domains tables (Alex).
// Until those exist, derive from existing project fields.
const routePublished = computed(() => !!props.system.route_published || !!props.system.routePublished)
const isPrimary = computed(() => !!props.system.is_primary || !!props.system.isPrimary)

// ---- Custom domain wizard ----
const showAddDomain = ref(false)
const customDomain = ref('')
const addingDomain = ref(false)
const addDomainStep = ref('input') // input | verify | done
const verifyToken = ref('')
const verifyError = ref('')

function openAddDomain() {
  customDomain.value = ''
  addDomainStep.value = 'input'
  verifyToken.value = ''
  verifyError.value = ''
  showAddDomain.value = true
}

async function submitAddDomain() {
  if (!customDomain.value.trim()) return
  addingDomain.value = true
  verifyError.value = ''
  try {
    // Phase 4: POST /api/systems/:id/domains — wired once Alex delivers Phase 4 tables.
    // For now simulate the wizard flow.
    await new Promise((r) => setTimeout(r, 300))
    verifyToken.value = `systems-verify-${Math.random().toString(36).slice(2, 10)}`
    addDomainStep.value = 'verify'
  } catch (e) {
    verifyError.value = e.message || 'Failed to initiate domain verification.'
  } finally {
    addingDomain.value = false
  }
}

async function checkVerification() {
  addingDomain.value = true
  verifyError.value = ''
  try {
    // Phase 4: POST /api/systems/:id/domains/:domain/verify — wired in Phase 4.
    await new Promise((r) => setTimeout(r, 400))
    verifyError.value = 'DNS record not found yet. Add the TXT record and try again.'
  } catch (e) {
    verifyError.value = e.message || 'Verification failed.'
  } finally {
    addingDomain.value = false
  }
}

// ---- Maintenance mode ----
const maintenanceOn = ref(false)
const togglingMaintenance = ref(false)
const maintenanceMsg = ref('')

async function toggleMaintenance() {
  togglingMaintenance.value = true
  maintenanceMsg.value = ''
  try {
    // Phase 4: PATCH /api/systems/:id/environments/production/maintenance
    await new Promise((r) => setTimeout(r, 200))
    maintenanceOn.value = !maintenanceOn.value
    maintenanceMsg.value = maintenanceOn.value ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.'
    showToast(maintenanceMsg.value)
  } catch (e) {
    maintenanceMsg.value = e.message || 'Failed to toggle maintenance mode.'
  } finally {
    togglingMaintenance.value = false
  }
}

// ---- Canonical redirect ----
const canonicalDomain = ref('')
const savingCanonical = ref(false)
const canonicalMsg = ref('')

async function saveCanonical() {
  savingCanonical.value = true
  canonicalMsg.value = ''
  try {
    // Phase 4: PATCH /api/systems/:id/environments/production/canonical
    await new Promise((r) => setTimeout(r, 200))
    canonicalMsg.value = canonicalDomain.value
      ? `Canonical redirect set to ${canonicalDomain.value}.`
      : 'Canonical redirect cleared.'
    showToast(canonicalMsg.value)
  } catch (e) {
    canonicalMsg.value = e.message || 'Failed to save canonical redirect.'
  } finally {
    savingCanonical.value = false
  }
}
</script>

<template>
  <div class="domain-management">

    <!-- Route status -->
    <div class="card stack">
      <h2 class="section-label">Route status</h2>
      <div class="kv">
        <span class="k">Public route</span>
        <span class="v">
          <span :class="`sdot ${routePublished ? 'ok' : 'idle'}`"></span>
          {{ routePublished ? 'Published' : 'Not published' }}
        </span>
      </div>
      <div class="kv">
        <span class="k">Primary / apex</span>
        <span class="v">{{ isPrimary ? 'Yes' : 'No' }}</span>
      </div>
      <div class="kv">
        <span class="k">Route status type</span>
        <span class="v muted small">V4 Phase 4 — route_status enum (inactive/pending/active/failed/superseded) replaces boolean after Phase 4 migration</span>
      </div>
    </div>

    <!-- Custom domain add/verify wizard -->
    <div class="card stack">
      <h2 class="section-label">Custom domains <span class="badge-phase">Phase 4</span></h2>

      <div v-if="!showAddDomain" class="hint">
        No custom domains configured. Custom domain verification requires Phase 4 domain tables.
        The wizard below previews the flow.
      </div>

      <template v-if="!showAddDomain">
        <div>
          <button class="btn btn-sm" @click="openAddDomain">
            <Icon name="plus" /> Add custom domain
          </button>
        </div>
      </template>

      <template v-else>
        <!-- Step 1: input -->
        <template v-if="addDomainStep === 'input'">
          <div class="field-group">
            <label class="field-label">Domain name</label>
            <input
              v-model="customDomain"
              type="text"
              class="field-input"
              placeholder="app.example.com"
              :disabled="addingDomain"
              @keyup.enter="submitAddDomain"
            />
          </div>
          <div v-if="verifyError" class="hint error-text">{{ verifyError }}</div>
          <div class="btn-row">
            <button class="btn btn-sm btn-primary" :disabled="!customDomain.trim() || addingDomain" @click="submitAddDomain">
              {{ addingDomain ? 'Adding…' : 'Continue' }}
            </button>
            <button class="btn btn-sm btn-ghost" @click="showAddDomain = false">Cancel</button>
          </div>
        </template>

        <!-- Step 2: DNS verification -->
        <template v-else-if="addDomainStep === 'verify'">
          <div class="hint">
            Add a <strong>TXT record</strong> to <code>{{ customDomain }}</code> with the following value,
            then click <em>Check verification</em>. DNS propagation can take up to 48 hours.
          </div>
          <div class="verify-token-box">
            <code class="small">{{ verifyToken }}</code>
          </div>
          <div class="kv">
            <span class="k">Record type</span><span class="v mono small">TXT</span>
          </div>
          <div class="kv">
            <span class="k">Host / Name</span><span class="v mono small">_systems-verify.{{ customDomain }}</span>
          </div>
          <div class="kv">
            <span class="k">Value</span><span class="v mono small">{{ verifyToken }}</span>
          </div>
          <div class="kv">
            <span class="k">TTL</span><span class="v mono small">300</span>
          </div>
          <div v-if="verifyError" class="hint error-text">{{ verifyError }}</div>
          <div class="btn-row">
            <button class="btn btn-sm btn-primary" :disabled="addingDomain" @click="checkVerification">
              {{ addingDomain ? 'Checking…' : 'Check verification' }}
            </button>
            <button class="btn btn-sm btn-ghost" @click="showAddDomain = false">Cancel</button>
          </div>
        </template>
      </template>
    </div>

    <!-- Maintenance mode -->
    <div class="card stack">
      <h2 class="section-label">Maintenance mode <span class="badge-phase">Phase 4</span></h2>
      <div class="kv">
        <span class="k">Status</span>
        <span class="v">
          <span :class="`sdot ${maintenanceOn ? 'warn' : 'idle'}`"></span>
          {{ maintenanceOn ? 'Maintenance mode active' : 'Normal operation' }}
        </span>
      </div>
      <div class="hint">
        When enabled, all inbound requests to this system receive a maintenance page instead
        of being routed to the container. Uses a Caddy route layer injected by Phase 4 migration.
      </div>
      <div v-if="maintenanceMsg" class="hint" :class="maintenanceOn ? 'warn-text' : ''">{{ maintenanceMsg }}</div>
      <div>
        <button class="btn btn-sm" :class="maintenanceOn ? 'btn-warning' : ''" :disabled="togglingMaintenance" @click="toggleMaintenance">
          <Icon :name="maintenanceOn ? 'toggle-right' : 'toggle-left'" />
          {{ togglingMaintenance ? 'Updating…' : (maintenanceOn ? 'Disable maintenance mode' : 'Enable maintenance mode') }}
        </button>
      </div>
    </div>

    <!-- Canonical redirect -->
    <div class="card stack">
      <h2 class="section-label">Canonical redirect <span class="badge-phase">Phase 4</span></h2>
      <div class="hint">
        Force all traffic to a canonical domain (e.g. <code>www.example.com</code> → <code>example.com</code>
        or vice versa). Leave blank to serve on all configured domains without redirecting.
      </div>
      <div class="field-group">
        <label class="field-label">Canonical domain</label>
        <input
          v-model="canonicalDomain"
          type="text"
          class="field-input"
          placeholder="example.com (leave blank to disable)"
          :disabled="savingCanonical"
        />
      </div>
      <div v-if="canonicalMsg" class="hint">{{ canonicalMsg }}</div>
      <div>
        <button class="btn btn-sm btn-primary" :disabled="savingCanonical" @click="saveCanonical">
          {{ savingCanonical ? 'Saving…' : 'Save canonical' }}
        </button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.domain-management { display: flex; flex-direction: column; gap: 16px; }

.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 12px;
}

.badge-phase {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: color-mix(in srgb, var(--accent, #7c6eea) 12%, transparent);
  color: var(--accent, #7c6eea);
  vertical-align: middle;
  margin-left: 6px;
}

.field-group { display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: 0.8rem; font-weight: 500; color: var(--text-muted); }
.field-input {
  padding: 6px 10px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--surface-2, var(--bg));
  color: var(--text);
  font-size: 0.875rem;
  outline: none;
  width: 100%;
  max-width: 380px;
}
.field-input:focus { border-color: var(--accent, #7c6eea); }

.verify-token-box {
  padding: 10px 14px;
  border-radius: 6px;
  background: var(--surface-2, rgba(0,0,0,0.05));
  border: 1px solid var(--border-soft);
  word-break: break-all;
  font-family: monospace;
}

.error-text { color: var(--error, #ef4444); }
.warn-text { color: var(--warning, #b45309); }
.mono { font-family: monospace; }
</style>
