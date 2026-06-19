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

// Effective limits come from the server, not the build-time env fallback.
const serverInfo = ref(null)
async function loadServerInfo() {
  try { serverInfo.value = await api.get('/server/info') } catch { /* fall back to build-time values */ }
}
const uploadLimitMb = computed(() => {
  const f = serverInfo.value?.features
  if (f) return f.largeUploads ? f.v2UploadMaxMb : f.uploadMaxMb
  return serverInfo.value?.platform?.uploadMaxMb ?? UPLOAD_MAX_MB
})
const releaseRetentionVal = computed(() => serverInfo.value?.platform?.releaseRetention ?? RELEASE_RETENTION)

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
const showCurrentPw = ref(false)
const showNewPw = ref(false)
const showConfirmPw = ref(false)

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
    showCurrentPw.value = false; showNewPw.value = false; showConfirmPw.value = false
  } catch (e) {
    pwError.value = e.message || 'Failed to update password.'
  } finally {
    pwSaving.value = false
  }
}

const pwStrength = computed(() => {
  const pw = newPassword.value
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
})
const pwStrengthInfo = computed(() => {
  if (!newPassword.value) return null
  const s = pwStrength.value
  if (s <= 1) return { label: 'Weak', cls: 'pw-weak' }
  if (s <= 3) return { label: 'Fair', cls: 'pw-fair' }
  return { label: 'Strong', cls: 'pw-strong' }
})

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
const currentSession = computed(() => {
  try {
    const token = auth.token
    if (!token) return null
    const raw = token.split('.')[1]
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((raw.length % 4) || 4)
    const payload = JSON.parse(atob(padded))
    if (!payload.iat) return null
    const since = new Date(payload.iat * 1000)
    const pad = n => String(n).padStart(2, '0')
    return {
      since: since.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
             ' at ' + pad(since.getHours()) + ':' + pad(since.getMinutes())
    }
  } catch { return null }
})

const revoking = ref(false)
const revokeMsg = ref('')
async function revokeSessions() {
  revokeMsg.value = ''
  revoking.value = true
  try {
    const data = await api.post('/auth/revoke-sessions')
    if (data && data.token) auth.setToken(data.token)
    revokeMsg.value = 'Other sessions signed out.'
    await loadSessions()
  } catch (e) {
    revokeMsg.value = e.message || 'Could not revoke sessions.'
  } finally { revoking.value = false }
}

// Active session list (device / IP / last active) with per-session revocation.
const sessions = ref([])
const sessionsLoading = ref(true)
const revokingId = ref(null)
async function loadSessions() {
  try {
    const data = await api.get('/auth/sessions')
    sessions.value = data.sessions || []
  } catch { /* best-effort — currentSession fallback still shows */ }
  finally { sessionsLoading.value = false }
}
const otherSessionCount = computed(() => sessions.value.filter((s) => !s.current).length)

async function revokeSession(s) {
  revokeMsg.value = ''
  revokingId.value = s.id
  try {
    const data = await api.del(`/auth/sessions/${s.id}`)
    if (data && data.current) { await auth.logout(); return router.replace({ name: 'login' }) }
    await loadSessions()
  } catch (e) {
    revokeMsg.value = e.message || 'Could not revoke session.'
  } finally { revokingId.value = null }
}

// Parse a user-agent into a short device/browser label.
function deviceLabel(ua) {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

function fmtSeen(s) {
  if (!s) return ''
  const d = new Date(s.endsWith('Z') || s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return s
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// Caps Lock detection for password fields.
const capsOn = ref(false)
function onPwKey(e) {
  if (typeof e.getModifierState === 'function') capsOn.value = e.getModifierState('CapsLock')
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

// Security posture summary — surfaced as warnings near the top of the page.
const securityWarnings = computed(() => {
  const w = []
  if (!twoFAEnabled.value) w.push('Two-factor authentication is disabled — anyone with your password can sign in.')
  if (!usersLoading.value && users.value.length < 2) w.push('Only one administrator exists — add a second so access isn’t tied to one login.')
  return w
})

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

onMounted(() => { loadUsers(); loadServerInfo(); loadSessions() })
</script>

<template>
  <div class="page-head">
    <h1>Admin</h1>
  </div>

  <!-- Security posture summary -->
  <div v-if="securityWarnings.length" class="callout warn" style="margin-bottom:20px; flex-direction:column; gap:8px">
    <div class="row gap-sm" style="align-items:center">
      <div class="co-bar" style="width:3px; align-self:stretch"></div>
      <strong style="font-size:13px; color:var(--warn)">Security checklist</strong>
    </div>
    <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:4px">
      <li v-for="w in securityWarnings" :key="w" class="small">{{ w }}</li>
    </ul>
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
        <div class="field-group">
          <label class="field-label" for="ap-cur-pw">Current password</label>
          <div class="input-wrap">
            <input id="ap-cur-pw" v-model="currentPassword" :type="showCurrentPw ? 'text' : 'password'" autocomplete="current-password" @keyup="onPwKey" @keydown="onPwKey" />
            <button type="button" class="pw-toggle" :aria-label="showCurrentPw ? 'Hide password' : 'Show password'" @click="showCurrentPw = !showCurrentPw">
              <svg v-if="!showCurrentPw" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
              <svg v-else viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            </button>
          </div>
        </div>
        <div class="field-group">
          <label class="field-label" for="ap-new-pw">New password</label>
          <div class="input-wrap">
            <input id="ap-new-pw" v-model="newPassword" :type="showNewPw ? 'text' : 'password'" autocomplete="new-password" @keyup="onPwKey" @keydown="onPwKey" />
            <button type="button" class="pw-toggle" :aria-label="showNewPw ? 'Hide password' : 'Show password'" @click="showNewPw = !showNewPw">
              <svg v-if="!showNewPw" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
              <svg v-else viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            </button>
          </div>
          <div v-if="pwStrengthInfo" class="pw-strength">
            <div class="pw-bar"><div class="pw-fill" :class="pwStrengthInfo.cls" :style="{ width: (pwStrength / 5 * 100) + '%' }"></div></div>
            <span class="small pw-label" :class="pwStrengthInfo.cls">{{ pwStrengthInfo.label }}</span>
          </div>
        </div>
        <div class="field-group">
          <label class="field-label" for="ap-conf-pw">Confirm new password</label>
          <div class="input-wrap">
            <input id="ap-conf-pw" v-model="confirmPassword" :type="showConfirmPw ? 'text' : 'password'" autocomplete="new-password" />
            <button type="button" class="pw-toggle" :aria-label="showConfirmPw ? 'Hide password' : 'Show password'" @click="showConfirmPw = !showConfirmPw">
              <svg v-if="!showConfirmPw" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
              <svg v-else viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            </button>
          </div>
        </div>
        <div v-if="capsOn" class="caps-warn small">⇪ Caps Lock is on</div>
        <div class="hint">At least 8 characters. Mixing case, digits and symbols makes it stronger.</div>
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
          <div v-if="!tfaOtpauth" class="callout warn" style="margin:0">
            <div class="co-bar"></div>
            <div>Two-factor is <strong>off</strong>. Anyone with your password can sign in without a second check.</div>
          </div>
          <button v-if="!tfaOtpauth" class="btn btn-block" :disabled="tfaBusy" @click="startSetup2FA">
            <span v-if="tfaBusy" class="spinner"></span><span v-else>Set up two-factor</span>
          </button>

          <template v-else>
            <p class="small muted" style="margin:0">Add this secret to your authenticator, then enter a code to confirm.</p>
            <div class="kv"><span class="k">Secret</span><span class="v mono small row gap-sm" style="justify-content:flex-end">{{ tfaSecret }}<CopyButton :text="tfaSecret" label="Secret" /></span></div>
            <div class="hint mono small" style="word-break:break-all">{{ tfaOtpauth }}</div>
            <input v-model="tfaCode" aria-label="Six-digit code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" />
            <button class="btn btn-primary btn-block" :disabled="tfaBusy" @click="enable2FA">
              <span v-if="tfaBusy" class="spinner"></span><span v-else>Confirm &amp; enable</span>
            </button>
          </template>
        </template>

        <template v-else>
          <div class="callout" style="margin:0">
            <div class="co-bar"></div>
            <div class="small">No recovery codes — your authenticator app is your only recovery path. Store your TOTP secret somewhere safe in case you lose access to it.</div>
          </div>
          <p class="small muted" style="margin:0">Enter your password and a current code to turn two-factor off.</p>
          <input v-model="tfaPassword" aria-label="Current password" type="password" autocomplete="current-password" placeholder="Current password" />
          <input v-model="tfaCode" aria-label="Six-digit code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" />
          <button class="btn btn-danger btn-block" :disabled="tfaBusy" @click="disable2FA">
            <span v-if="tfaBusy" class="spinner"></span><span v-else>Disable two-factor</span>
          </button>
        </template>

        <div v-if="tfaError" class="error-box">{{ tfaError }}</div>
        <div v-else-if="tfaMsg" class="notice">{{ tfaMsg }}</div>
      </div>

      <!-- Sessions -->
      <div class="card stack">
        <div class="spread">
          <div class="section-label">Active sessions</div>
          <button v-if="otherSessionCount > 0" class="btn btn-sm btn-ghost" :disabled="revoking" @click="revokeSessions">
            <span v-if="revoking" class="spinner"></span><span v-else>Sign out {{ otherSessionCount }} other{{ otherSessionCount === 1 ? '' : 's' }}</span>
          </button>
        </div>

        <div v-if="sessionsLoading" class="muted small">Loading sessions…</div>

        <template v-else-if="sessions.length">
          <div v-for="s in sessions" :key="s.id" class="sess-row">
            <div style="min-width:0; flex:1">
              <div class="row gap-sm" style="align-items:center">
                <span class="sess-name">{{ deviceLabel(s.userAgent) }}</span>
                <span v-if="s.current" class="chip ok">this device</span>
              </div>
              <div class="small dim mono">{{ s.ip || 'unknown IP' }} · active {{ fmtSeen(s.lastSeenAt) }}</div>
            </div>
            <button v-if="!s.current" class="btn btn-danger btn-sm" :disabled="revokingId === s.id" @click="revokeSession(s)">
              <span v-if="revokingId === s.id" class="spinner"></span><span v-else>Revoke</span>
            </button>
          </div>
        </template>

        <!-- Fallback when the current token predates session tracking -->
        <div v-else-if="currentSession" class="kv">
          <span class="k">Signed in</span>
          <span class="v small muted">{{ currentSession.since }}</span>
        </div>
        <div v-else class="muted small">No active sessions recorded.</div>

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
          <button v-if="!showAddForm && !atCap && otherAdmins.length > 0" class="btn btn-sm btn-ghost" @click="showAddForm = true">Add admin</button>
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
            <div class="section-label" style="margin:0">New admin</div>
            <div class="field-group">
              <label class="field-label" for="add-username">Username</label>
              <input id="add-username" v-model="newUsername" autocapitalize="none" autocorrect="off" />
            </div>
            <div class="field-group">
              <label class="field-label" for="add-user-pw">Password</label>
              <input id="add-user-pw" v-model="newUserPassword" type="password" autocomplete="new-password" />
            </div>
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
        <div class="kv"><span class="k">Max upload size</span><span class="v mono">{{ uploadLimitMb }} MB</span></div>
        <div class="kv"><span class="k">Release retention</span><span class="v mono">{{ releaseRetentionVal }} releases</span></div>
        <div class="hint">
          Effective values reported by the server. Configured in <span class="mono">.env</span>.
        </div>
      </div>

      <!-- Security & audit -->
      <div class="card" style="padding:0">
        <div class="section-label" style="padding:14px 16px 6px">Security &amp; audit</div>
        <RouterLink class="conn-row sa-link" :to="{ name: 'events' }">
          <div style="flex:1"><div class="c-name">Audit log</div><div class="c-sub">Admin and system actions</div></div>
          <span class="small dim">→</span>
        </RouterLink>
        <RouterLink class="conn-row sa-link" :to="{ name: 'server' }">
          <div style="flex:1"><div class="c-name">SYSTEMS. health</div><div class="c-sub">Infrastructure and runtime</div></div>
          <span class="small dim">→</span>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-wrap { position: relative; }
.input-wrap input { padding-right: 42px; }
.pw-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-xs);
  display: flex;
  align-items: center;
  justify-content: center;
}
.pw-toggle:hover { color: var(--text-muted); }
.pw-toggle svg {
  width: 16px; height: 16px;
  stroke: currentColor; fill: none;
  stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
}
.pw-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.pw-bar {
  flex: 1;
  height: 3px;
  background: var(--bg-elevated);
  border-radius: 2px;
  overflow: hidden;
}
.pw-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--danger);
  transition: width 0.2s ease, background 0.2s ease;
}
.pw-fill.pw-fair { background: var(--warn); }
.pw-fill.pw-strong { background: var(--ok); }
.pw-label { color: var(--text-dim); }
.pw-label.pw-weak { color: var(--danger); }
.pw-label.pw-fair { color: var(--warn); }
.pw-label.pw-strong { color: var(--ok); }
.caps-warn { color: var(--warn); display: flex; align-items: center; gap: 6px; }
.sess-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-soft);
}
.sess-row:last-of-type { border-bottom: none; }
.sess-name { font-weight: 600; font-size: 14px; }
</style>
