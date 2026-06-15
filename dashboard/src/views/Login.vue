<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import SystemsLogo from '../components/SystemsLogo.vue'
import AsciiChaosField from '../components/AsciiChaosField.vue'

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
    <!-- White ASCII chaos art (decorative, inert) -->
    <div class="login-art">
      <AsciiChaosField :intensity="0.8" :cell="14" />
    </div>

    <!-- Desktop brand zone -->
    <div class="login-brandzone">
      <SystemsLogo size="lg" />
    </div>

    <!-- Form zone -->
    <div class="login-formzone">
      <div class="lf-inner">
        <!-- Mobile-only compact brand (logo sits in its own ASCII halo) -->
        <div class="lf-mobile-brand">
          <SystemsLogo size="lg" />
        </div>

        <form class="card stack login-card" @submit.prevent="submit">
          <div class="field" style="margin:0">
            <label class="label" for="u">Administrator</label>
            <input aria-label="username" id="u" v-model="username" autocomplete="username" autocapitalize="none" autocorrect="off" placeholder="username" />
          </div>
          <div class="field" style="margin:0">
            <label class="label" for="p">Password</label>
            <input aria-label="••••••••" id="p" v-model="password" type="password" autocomplete="current-password" placeholder="••••••••" />
          </div>

          <div v-if="error" class="error-box">{{ error }}</div>

          <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
            <span v-if="loading" class="spinner"></span>
            <span v-else>Enter SYSTEMS.</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lf-mobile-brand { display: none; text-align: center; }

@media (max-width: 860px) {
  .login-brandzone { display: none; }
  .lf-mobile-brand { display: block; }
  /* smaller, calmer logo on mobile */
  .lf-mobile-brand :deep(.brand-img.lg) { height: 20px; margin: 0 auto; }
}
</style>
