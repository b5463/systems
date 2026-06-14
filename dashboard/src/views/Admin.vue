<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { api } from '../api/client'

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

/* ---------- Admins ---------- */
const users = ref([])
const usersLoading = ref(true)
const usersError = ref('')

function fmtDate(s) {
  if (!s) return '–'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString()
}

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
async function deleteUser(u) {
  usersError.value = ''
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
        <div class="kv"><span class="k">Platform</span><span class="v mono small">SYSTEMS. v1.1</span></div>
      </div>

      <!-- Change password -->
      <div class="card stack">
        <div class="section-label" style="margin:0">Change password</div>
        <input v-model="currentPassword" type="password" placeholder="Current password" autocomplete="current-password" />
        <input v-model="newPassword" type="password" placeholder="New password (min 8 chars)" autocomplete="new-password" />
        <input v-model="confirmPassword" type="password" placeholder="Confirm new password" autocomplete="new-password" />
        <div v-if="pwError" class="error-box">{{ pwError }}</div>
        <div v-else-if="pwMsg" class="notice">{{ pwMsg }}</div>
        <button class="btn btn-primary btn-block" :disabled="pwSaving" @click="changePassword">
          <span v-if="pwSaving" class="spinner"></span><span v-else>Update password</span>
        </button>
      </div>

      <!-- Session -->
      <div class="card stack">
        <div class="section-label" style="margin:0">Session</div>
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
          <div class="section-label" style="margin:0">Administrators</div>
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
              <button v-if="u.id !== auth.user?.id" class="btn btn-danger btn-sm" :disabled="deletingId === u.id" @click="deleteUser(u)">
                <span v-if="deletingId === u.id" class="spinner"></span><span v-else>Remove</span>
              </button>
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
            <input v-model="newUsername" placeholder="username" autocapitalize="none" autocorrect="off" />
            <input v-model="newUserPassword" type="password" placeholder="password (min 8 chars)" autocomplete="new-password" />
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
        <div class="section-label" style="margin:0">Limits &amp; retention</div>
        <div class="kv"><span class="k">Max upload size</span><span class="v mono">{{ UPLOAD_MAX_MB }} MB</span></div>
        <div class="kv"><span class="k">Release retention</span><span class="v mono">{{ RELEASE_RETENTION }} releases</span></div>
        <div class="hint">
          Configured in <span class="mono">.env</span> for V1.1. Editable in-app settings arrive in V1.2.
        </div>
      </div>

      <!-- Security & audit -->
      <div class="card stack">
        <div class="section-label" style="margin:0">Security &amp; audit</div>
        <div class="row gap-sm">
          <RouterLink class="btn btn-sm btn-ghost" :to="{ name: 'events' }">Audit log</RouterLink>
          <RouterLink class="btn btn-sm btn-ghost" :to="{ name: 'server' }">SYSTEMS. health</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
