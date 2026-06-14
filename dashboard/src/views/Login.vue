<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = 'Enter your username and password.'
    return
  }
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    const redirect = route.query.redirect
    router.replace(typeof redirect === 'string' ? redirect : { name: 'projects' })
  } catch (e) {
    error.value = e.status === 401 ? 'Invalid credentials.' : e.message || 'Login failed.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page no-nav center" style="flex-direction: column; min-height: 100vh">
    <div style="width: 100%; max-width: 360px">
      <div style="text-align: center; margin-bottom: 28px">
        <div style="font-size: 40px">🚀</div>
        <h1 style="margin: 8px 0 2px">Acronym Deploy</h1>
        <p class="muted small" style="margin: 0">Sign in to manage your apps</p>
      </div>

      <form class="card stack" @submit.prevent="submit">
        <div class="field" style="margin: 0">
          <label class="label" for="u">Username</label>
          <input
            id="u"
            v-model="username"
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
          />
        </div>
        <div class="field" style="margin: 0">
          <label class="label" for="p">Password</label>
          <input id="p" v-model="password" type="password" autocomplete="current-password" />
        </div>

        <div v-if="error" class="error-box">{{ error }}</div>

        <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          <span v-else>Sign in</span>
        </button>
      </form>
    </div>
  </div>
</template>
