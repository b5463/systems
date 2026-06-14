<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import SystemsLogo from '../components/SystemsLogo.vue'
import SignalField from '../components/SignalField.vue'

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
    <!-- Abstract technical art (decorative, inert) -->
    <div class="login-art">
      <SignalField :count="110" :seed="2099" :links="3" :intensity="1.05" />
    </div>

    <!-- Brand zone -->
    <div class="login-brandzone">
      <SystemsLogo size="lg" />
      <p class="lz-tag">Private deployment console — ship a zip, get a live system at your own infrastructure.</p>
      <div class="lz-meta">
        <span>Admin-only</span>
        <span>No public signup</span>
        <span>v1.1</span>
      </div>
    </div>

    <!-- Form zone -->
    <div class="login-formzone">
      <div class="lf-inner">
        <!-- Mobile-only compact lockup -->
        <div class="lf-mobile-brand">
          <SystemsLogo size="lg" />
          <p class="lz-tag" style="margin-top:14px">Private deployment console</p>
        </div>

        <form class="card stack" style="animation:none;border-color:var(--border)" @submit.prevent="submit">
          <div class="field" style="margin:0">
            <label class="label" for="u">Administrator</label>
            <input id="u" v-model="username" autocomplete="username" autocapitalize="none" autocorrect="off" placeholder="username" />
          </div>
          <div class="field" style="margin:0">
            <label class="label" for="p">Password</label>
            <input id="p" v-model="password" type="password" autocomplete="current-password" placeholder="••••••••" />
          </div>

          <div v-if="error" class="error-box">{{ error }}</div>

          <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
            <span v-if="loading" class="spinner"></span>
            <span v-else>Enter SYSTEMS.</span>
          </button>
        </form>

        <p class="login-foot">Hardened · least-privilege · private infrastructure</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The brand zone is the desktop left column; on mobile it is replaced by the
   compact lockup inside the form zone. */
.lf-mobile-brand { display: none; text-align: center; margin-bottom: 28px; }

@media (max-width: 860px) {
  .login-brandzone { display: none; }
  .lf-mobile-brand { display: block; }
}
</style>
