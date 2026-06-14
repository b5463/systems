<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { api } from '../api/client'
import TopBar from '../components/TopBar.vue'

const auth = useAuthStore()
const router = useRouter()
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
  pwMsg.value = ''
  pwError.value = ''
  if (!currentPassword.value || !newPassword.value) {
    pwError.value = 'Both current and new password are required.'
    return
  }
  if (newPassword.value.length < 8) {
    pwError.value = 'New password must be at least 8 characters.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    pwError.value = 'New passwords do not match.'
    return
  }
  pwSaving.value = true
  try {
    const data = await api.post('/auth/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value
    })
    pwMsg.value = data.message || 'Password updated.'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (e) {
    pwError.value = e.message || 'Failed to update password.'
  } finally {
    pwSaving.value = false
  }
}

/* ---------- Users ---------- */
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
    if (e.status !== 401) usersError.value = e.message || 'Failed to load users.'
  } finally {
    usersLoading.value = false
  }
}

const newUsername = ref('')
const newUserPassword = ref('')
const addingUser = ref(false)
const addUserError = ref('')

async function addUser() {
  addUserError.value = ''
  if (!newUsername.value || !newUserPassword.value) {
    addUserError.value = 'Username and password are required.'
    return
  }
  if (newUserPassword.value.length < 8) {
    addUserError.value = 'Password must be at least 8 characters.'
    return
  }
  addingUser.value = true
  try {
    await api.post('/admin/users', {
      username: newUsername.value,
      password: newUserPassword.value
    })
    newUsername.value = ''
    newUserPassword.value = ''
    await loadUsers()
  } catch (e) {
    addUserError.value = e.message || 'Failed to add user.'
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
    usersError.value = e.message || 'Failed to delete user.'
  } finally {
    deletingId.value = null
  }
}

onMounted(loadUsers)
</script>

<template>
  <TopBar title="Account" />

  <div class="page stack">
    <!-- Profile -->
    <div class="card">
      <div class="row" style="gap: 14px; margin-bottom: 16px">
        <div
          class="center"
          style="width: 52px; height: 52px; border-radius: 50%; background: var(--accent-dim); color: var(--accent); font-size: 22px; font-weight: 700; border: 1px solid rgba(45,212,191,0.2); flex-shrink: 0;"
        >
          {{ (auth.user?.username || '?').slice(0, 1).toUpperCase() }}
        </div>
        <div>
          <div style="font-weight: 700; font-size: 17px; letter-spacing: -0.01em">{{ auth.user?.username || 'Unknown' }}</div>
          <div class="small" style="color: var(--text-dim); margin-top: 2px">User ID {{ auth.user?.id ?? '–' }}</div>
        </div>
      </div>
      <div class="kv">
        <span class="k">Role</span>
        <span class="v">Admin</span>
      </div>
      <div class="kv">
        <span class="k">Platform</span>
        <span class="v mono small">acronym-deploy v1.0</span>
      </div>
    </div>

    <!-- Change password -->
    <div class="card stack">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim)">Change password</div>
      <input v-model="currentPassword" type="password" placeholder="Current password" autocomplete="current-password" />
      <input v-model="newPassword" type="password" placeholder="New password (min 8 chars)" autocomplete="new-password" />
      <input v-model="confirmPassword" type="password" placeholder="Confirm new password" autocomplete="new-password" />
      <div v-if="pwError" class="error-box">{{ pwError }}</div>
      <div v-else-if="pwMsg" class="notice">{{ pwMsg }}</div>
      <button class="btn btn-primary btn-block" :disabled="pwSaving" @click="changePassword">
        <span v-if="pwSaving" class="spinner"></span><span v-else>Save</span>
      </button>
    </div>

    <!-- Users -->
    <div class="card stack">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim)">Users</div>

      <div v-if="usersLoading" class="muted small">Loading users…</div>
      <div v-else-if="usersError" class="error-box">{{ usersError }}</div>
      <div v-else-if="!users.length" class="muted small">No users.</div>
      <div v-else class="stack" style="gap: 8px">
        <div v-for="u in users" :key="u.id" class="spread" style="padding: 8px 0; border-bottom: 1px solid var(--border, rgba(255,255,255,0.06))">
          <div style="min-width: 0">
            <div style="font-weight: 600">{{ u.username }}</div>
            <div class="small dim">Joined {{ fmtDate(u.created_at) }}</div>
          </div>
          <button
            v-if="u.id !== auth.user?.id"
            class="btn btn-danger"
            :disabled="deletingId === u.id"
            @click="deleteUser(u)"
          >
            <span v-if="deletingId === u.id" class="spinner"></span><span v-else>Delete</span>
          </button>
          <span v-else class="badge badge-stopped small">you</span>
        </div>
      </div>

      <div class="stack" style="gap: 8px; margin-top: 6px">
        <div class="label" style="margin: 0">Add user</div>
        <input v-model="newUsername" placeholder="username" autocapitalize="none" autocorrect="off" />
        <input v-model="newUserPassword" type="password" placeholder="password (min 8 chars)" autocomplete="new-password" />
        <div v-if="addUserError" class="error-box">{{ addUserError }}</div>
        <button class="btn btn-block" :disabled="addingUser" @click="addUser">
          <span v-if="addingUser" class="spinner"></span><span v-else>Add</span>
        </button>
      </div>
    </div>

    <!-- Session -->
    <div class="card">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 12px">Session</div>
      <button class="btn btn-danger btn-block" :disabled="loggingOut" @click="logout">
        <span v-if="loggingOut" class="spinner"></span><span v-else>Sign out</span>
      </button>
    </div>
  </div>
</template>
