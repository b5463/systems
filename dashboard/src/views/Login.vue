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
  <div class="login-page" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 24px;">
    <div style="width: 100%; max-width: 340px">
      <div style="text-align: center; margin-bottom: 32px">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 13px; background: var(--accent-dim); border: 1px solid rgba(45,212,191,0.18); margin-bottom: 18px">
          <span style="color: var(--accent); font-weight: 800; font-size: 17px; font-family: var(--mono); letter-spacing: -0.05em">AC</span>
        </div>
        <div style="font-size: 20px; font-weight: 700; margin-bottom: 5px; letter-spacing: -0.02em">Acronym Deploy</div>
        <div style="font-size: 13px; color: var(--text-dim)">Self-hosted deployment platform</div>
      </div>

      <form class="card stack" style="animation: none; border-color: var(--border)" @submit.prevent="submit">
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

      <p style="text-align: center; font-size: 11px; color: var(--text-dim); margin-top: 24px; letter-spacing: 0.04em; text-transform: uppercase">Acronym · v1.0</p>
    </div>
  </div>
</template>
