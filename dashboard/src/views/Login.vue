<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import SystemsLogo from '../components/SystemsLogo.vue'

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
    error.value = 'Enter your administrator credentials.'
    return
  }
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    const redirect = route.query.redirect
    router.replace(typeof redirect === 'string' ? redirect : { name: 'systems' })
  } catch (e) {
    error.value = e.status === 401 ? 'Invalid credentials.' : e.message || 'Sign in failed.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-inner">
      <div class="login-brand">
        <SystemsLogo size="lg" />
        <p class="login-tag">Private deployment console</p>
      </div>

      <form class="card stack login-card" @submit.prevent="submit">
        <div class="field" style="margin: 0">
          <label class="label" for="u">Administrator</label>
          <input
            id="u"
            v-model="username"
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
            placeholder="username"
          />
        </div>
        <div class="field" style="margin: 0">
          <label class="label" for="p">Password</label>
          <input id="p" v-model="password" type="password" autocomplete="current-password" placeholder="••••••••" />
        </div>

        <div v-if="error" class="error-box">{{ error }}</div>

        <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          <span v-else>Authenticate</span>
        </button>
      </form>

      <p class="login-foot">
        Admin-only access · No public signup · SYSTEMS. v1.1
      </p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}
.login-inner {
  width: 100%;
  max-width: 360px;
}
.login-brand {
  text-align: center;
  margin-bottom: 30px;
}
.login-tag {
  margin: 16px 0 0;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.login-card {
  animation: none;
  border-color: var(--border);
}
.login-foot {
  text-align: center;
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 26px;
  letter-spacing: 0.03em;
}
</style>
