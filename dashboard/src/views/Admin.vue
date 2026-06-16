<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { api } from '../api/client'
import CopyButton from '../components/CopyButton.vue'
import { fmtDate } from '../utils/date'

const auth = useAuthStore()
const router = useRouter()

const UPLOAD_MAX_MB = import.meta.env.VITE_UPLOAD_MAX_MB || '100'
const RELEASE_RETENTION = import.meta.env.VITE_RELEASE_RETENTION || '3'

const loggingOut = ref(false)
async function logout() {
  loggingOut.value = true
  await auth.logout()
  router.replace({ name: 'login' })
}

/* ---------- Change password ---------- */
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const pwSaving = ref(false)
const pwMsg = ref('')
const pwError = ref('')

async function changePassword() {
  pwMsg.value = ''; pwError.value = ''
  if (!currentPassword.value || !newPassword.value) return (pwError.value = 'Both current and new password are required.')
  if (newPassword.value.length < 8) return (pwError.value = 'New password must be at least 8 characters.')
  if (newPassword.value !== confirmPassword.value) return (pwError.value = 'New passwords do not match.')
  pwSaving.value = true
  try {
    const data = await api.post('/auth/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value
    })
    pwMsg.value = data.message || 'Password updated.'
    currentPassword.value = ''; newPassword.value = ''; confirmPassword.value = ''
  } catch (e) {
    pwError.value = e.message || 'Failed to update password.'
  } finally {
    pwSaving.value = false
  }
}

/* ---------- Two-factor (TOTP) ---------- */
const twoFAEnabled = computed(() => !!auth.user?.twoFactorEnabled)
const tfaSecret = ref('')
const tfaOtpauth = ref('')
const tfaCode = ref('')
const tfaPassword = ref('')
const tfaBusy = ref(false)
const tfaMsg = ref('')
const tfaError = ref('')

async function startSetup2FA() {
  tfaMsg.value = ''; tfaError.value = ''; tfaBusy.value = true
  try {
    const data = await api.post('/auth/2fa/setup')
    tfaSecret.value = data.secret
    tfaOtpauth.value = data.otpauth
  } catch (e) {
    tfaError.value = e.message || 'Could not start 2FA setup.'
  } finally { tfaBusy.value = false }
}

async function enable2FA() {
  tfaMsg.value = ''; tfaError.value = ''
  if (!tfaCode.value) return (tfaError.value = 'Enter the 6-digit code.')
  tfaBusy.value = true
  try {
    const data = await api.post('/auth/2fa/enable', { code: tfaCode.value })
    if (data && data.token) auth.setToken(data.token)
    tfaSecret.value = ''; tfaOtpauth.value = ''; tfaCode.value = ''
    tfaMsg.value = 'Two-factor enabled.'
    await auth.fetchMe()
  } catch (e) {
    tfaError.value = e.message || 'Could not enable 2FA.'
  } finally { tfaBusy.value = false }
}

async function disable2FA() {
  tfaMsg.value = ''; tfaError.value = ''
  if (!tfaPassword.value || !tfaCode.value) return (tfaError.value = 'Password and a current code are required.')
  tfaBusy.value = true
  try {
    const data = await api.post('/auth/2fa/disable', { password: tfaPassword.value, code: tfaCode.value })
    if (data && data.token) auth.setToken(data.token)
    tfaPassword.value = ''; tfaCode.value = ''
    tfaMsg.value = 'Two-factor disabled.'
    await auth.fetchMe()
  } catch (e) {
    tfaError.value = e.message || 'Could not disable 2FA.'
  } finally { tfaBusy.value = false }
}

/* ---------- Sessions ---------- */
const revoking = ref(false)
const revokeMsg = ref('')
async function revokeSessions() {
  revokeMsg.value = ''
  revoking.value = true
  try {
    const data = await api.post('/auth/revoke-sessions')
    if (data && data.token) auth.setToken(data.token)
    revokeMsg.value = 'Other sessions signed out.'
  } catch (e) {
    revokeMsg.value = e.message || 'Could not revoke sessions.'
  } finally { revoking.value = false }
}

/* ---------- Admins ---------- */
const users = ref([])
const usersLoading = ref(true)
const usersError = ref('')


async function loadUsers() {
  usersError.value = ''
  try {
    const data = await api.get('/admin/users')
    users.value = data.users || []
  } catch (e) {
    if (e.status !== 401) usersError.value = e.message || 'Failed to load admins.'
  } finally {
    usersLoading.value = false
  }
}

const otherAdmins = computed(() => users.value.filter((u) => u.id !== auth.user?.id))
const atCap = computed(() => users.value.length >= 2) // two admins max — no public signup

const newUsername = ref('')
const newUserPassword = ref('')
const addingUser = ref(false)
const addUserError = ref('')
const showAddForm = ref(false)

async function addUser() {
  addUserError.value = ''
  if (!newUsername.value || !newUserPassword.value) return (addUserError.value = 'Username and password are required.')
  if (newUserPassword.value.length < 8) return (addUserError.value = 'Password must be at least 8 characters.')
  addingUser.value = true
  try {
    await api.post('/admin/users', { username: newUsername.value, password: newUserPassword.value })
    newUsername.value = ''; newUserPassword.value = ''; showAddForm.value = false
    await loadUsers()
  } catch (e) {
    addUserError.value = e.message || 'Failed to add admin.'
  } finally {
    addingUser.value = false
  }
}

const deletingId = ref(null)
const confirmRemoveId = ref(null)
async function deleteUser(u) {
  usersError.value = ''
  confirmRemoveId.value = null
  deletingId.value = u.id
  try {
    await api.del(`/admin/users/${u.id}`)
    await loadUsers()
  } catch (e) {
    usersError.value = e.message || 'Failed to remove admin.'
  } finally {
    deletingId.value = null
  }
}

onMounted(loadUsers)
</script>

<template>
  <div class="page-head">
    <h1>Admin</h1>
  </div>

  <div class="grid grid-2" style="align-items:start">
    <!-- LEFT -->
    <div class="stack">
      <!-- Profile -->
      <div class="card">
        <div class="row" style="gap:14px; margin-bottom:14px">
          <span class="avatar" style="width:46px;height:46px;border-radius:10px;font-size:18px">
            {{ (auth.user?.username || '?').slice(0,1).toUpperCase() }}
          </span>
          <div>
            <div style="font-weight:700;font-size:16px">{{ auth.user?.username || 'Unknown' }}</div>
            <div class="small dim">Administrator · ID {{ auth.user?.id ?? '–' }}</div>
          </div>
        </div>
        <div class="kv"><span class="k">Role</span><span class="v">Admin (full access)</span></div>
        <div class="kv"><span class="k">Platform</span><span class="v mono small">SYSTEMS. · self-hosted</span></div>
      </div>

      <!-- Change password -->
      <div class="card stack">
        <div class="section-label">Change password</div>
        <input aria-label="Current password" v-model="currentPassword" type="password" placeholder="Current password" autocomplete="current-password" />
        <input aria-label="New password (min 8 chars)" v-model="newPassword" type="password" placeholder="New password (min 8 chars)" autocomplete="new-password" />
        <input aria-label="Confirm new password" v-model="confirmPassword" type="password" placeholder="Confirm new password" autocomplete="new-password" />
        <div v-if="pwError" class="error-box">{{ pwError }}</div>
        <div v-else-if="pwMsg" class="notice">{{ pwMsg }}</div>
        <button class="btn btn-primary btn-block" :disabled="pwSaving" @click="changePassword">
          <span v-if="pwSaving" class="spinner"></span><span v-else>Update password</span>
        </button>
      </div>

      <!-- Two-factor -->
      <div class="card stack">
        <div class="spread">
          <div class="section-label">Two-factor authentication</div>
          <span class="chip" :class="twoFAEnabled ? 'ok' : ''">{{ twoFAEnabled ? 'On' : 'Off' }}</span>
        </div>

        <template v-if="!twoFAEnabled">
          <p class="small muted" style="margin:0" v-if="!tfaOtpauth">
            Add a time-based code from an authenticator app as a second step at sign-in.
          </p>
          <button v-if="!tfaOtpauth" class="btn btn-block" :disabled="tfaBusy" @click="startSetup2FA">
            <span v-if="tfaBusy" class="spinner"></span><span v-else>Set up two-factor</span>
          </button>

          <template v-else>
            <p class="small muted" style="margin:0">Add this secret to your authenticator, then enter a code to confirm.</p>
            <div class="kv"><span class="k">Secret</span><span class="v mono small row gap-sm" style="justify-content:flex-end">{{ tfaSecret }}<CopyButton :text="tfaSecret" label="Secret" /></span></div>
            <div class="hint mono small" style="word-break:break-all">{{ tfaOtpauth }}</div>
            <input aria-label="Six-digit code" v-model="tfaCode" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" />
            <button class="btn btn-primary btn-block" :disabled="tfaBusy" @click="enable2FA">
              <span v-if="tfaBusy" class="spinner"></span><span v-else>Confirm &amp; enable</span>
            </button>
          </template>
        </template>

        <template v-else>
          <p class="small muted" style="margin:0">Enter your password and a current code to turn two-factor off.</p>
          <input aria-label="Current password" v-model="tfaPassword" type="password" autocomplete="current-password" placeholder="Current password" />
          <input aria-label="Six-digit code" v-model="tfaCode" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" />
          <button class="btn btn-danger btn-block" :disabled="tfaBusy" @click="disable2FA">
            <span v-if="tfaBusy" class="spinner"></span><span v-else>Disable two-factor</span>
          </button>
        </template>

        <div v-if="tfaError" class="error-box">{{ tfaError }}</div>
        <div v-else-if="tfaMsg" class="notice">{{ tfaMsg }}</div>
      </div>

      <!-- Session -->
      <div class="card stack">
        <div class="section-label">Session</div>
        <button class="btn btn-block" :disabled="revoking" @click="revokeSessions">
          <span v-if="revoking" class="spinner"></span><span v-else>Sign out other sessions</span>
        </button>
        <div v-if="revokeMsg" class="notice">{{ revokeMsg }}</div>
        <button class="btn btn-danger btn-block" :disabled="loggingOut" @click="logout">
          <span v-if="loggingOut" class="spinner"></span><span v-else>Sign out</span>
        </button>
      </div>
    </div>

    <!-- RIGHT -->
    <div class="stack">
      <!-- Admins -->
      <div class="card stack">
        <div class="spread">
          <div class="section-label">Administrators</div>
          <button v-if="!showAddForm && !atCap" class="btn btn-sm btn-ghost" @click="showAddForm = true">Add admin</button>
          <span v-else-if="atCap" class="small dim">2 / 2</span>
        </div>

        <div v-if="usersLoading" class="muted small">Loading admins…</div>
        <div v-else-if="usersError" class="error-box">{{ usersError }}</div>

        <template v-else>
          <!-- Current admins -->
          <div class="stack" style="gap:8px">
            <div v-for="u in users" :key="u.id" class="spread" style="padding:8px 0; border-bottom:1px solid var(--border-soft)">
              <div style="min-width:0">
                <div style="font-weight:600">{{ u.username }}</div>
                <div class="small dim">Added {{ fmtDate(u.created_at) }}</div>
              </div>
              <template v-if="u.id !== auth.user?.id">
                <div v-if="confirmRemoveId === u.id" class="row gap-sm">
                  <button class="btn btn-sm" @click="confirmRemoveId = null">Cancel</button>
                  <button class="btn btn-danger btn-sm" :disabled="deletingId === u.id" @click="deleteUser(u)">
                    <span v-if="deletingId === u.id" class="spinner"></span><span v-else>Confirm</span>
                  </button>
                </div>
                <button v-else class="btn btn-danger btn-sm" @click="confirmRemoveId = u.id">Remove</button>
              </template>
              <span v-else class="chip">you</span>
            </div>
          </div>

          <!-- Second-admin empty state -->
          <div v-if="!otherAdmins.length && !showAddForm" class="empty-block" style="padding:24px 18px">
            <div class="eb-title">No second admin yet.</div>
            <div class="eb-sub">Add a second admin so access isn't tied to one login.</div>
            <div class="eb-actions">
              <button class="btn btn-primary btn-sm" @click="showAddForm = true">Add second admin</button>
            </div>
          </div>

          <!-- Add form -->
          <div v-if="showAddForm" class="stack" style="gap:8px; margin-top:6px">
            <div class="label" style="margin:0">New admin</div>
            <input aria-label="username" v-model="newUsername" placeholder="username" autocapitalize="none" autocorrect="off" />
            <input aria-label="password (min 8 chars)" v-model="newUserPassword" type="password" placeholder="password (min 8 chars)" autocomplete="new-password" />
            <div v-if="addUserError" class="error-box">{{ addUserError }}</div>
            <div class="btn-row">
              <button class="btn btn-sm" @click="showAddForm = false">Cancel</button>
              <button class="btn btn-primary btn-sm" :disabled="addingUser" @click="addUser">
                <span v-if="addingUser" class="spinner"></span><span v-else>Add admin</span>
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- Limits & retention -->
      <div class="card stack">
        <div class="section-label">Limits &amp; retention</div>
        <div class="kv"><span class="k">Max upload size</span><span class="v mono">{{ UPLOAD_MAX_MB }} MB</span></div>
        <div class="kv"><span class="k">Release retention</span><span class="v mono">{{ RELEASE_RETENTION }} releases</span></div>
        <div class="hint">
          Configured in <span class="mono">.env</span>. Per-system overrides are planned.
        </div>
      </div>

      <!-- Security & audit -->
      <div class="card stack">
        <div class="section-label">Security &amp; audit</div>
        <div class="row gap-sm">
          <RouterLink class="btn btn-sm btn-ghost" :to="{ name: 'events' }">Audit log</RouterLink>
          <RouterLink class="btn btn-sm btn-ghost" :to="{ name: 'server' }">SYSTEMS. health</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
