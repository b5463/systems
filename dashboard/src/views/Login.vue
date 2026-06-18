<script setup>
import { ref, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import SystemsLogo from '../components/SystemsLogo.vue'
import FlowField from '../components/FlowField.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const codeInput = ref(null)
const username = ref('')
const password = ref('')
const code = ref('')
const needCode = ref(false)
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)
const capsLock = ref(false)

function updateCapsLock(event) {
  capsLock.value = !!event.getModifierState?.('CapsLock')
}

async function submit() {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = 'Enter your administrator credentials.'
    return
  }
  if (needCode.value && !code.value) {
    error.value = 'Enter your two-factor code.'
    return
  }
  loading.value = true
  try {
    await auth.login(username.value, password.value, code.value || undefined)
    const redirect = route.query.redirect
    router.replace(typeof redirect === 'string' ? redirect : { name: 'systems' })
  } catch (e) {
    if (e.twoFactorRequired) {
      needCode.value = true
      error.value = code.value ? 'Invalid two-factor code.' : 'Enter the 6-digit code from your authenticator.'
      nextTick(() => codeInput.value && codeInput.value.focus())
    } else {
      error.value = e.status === 401 ? 'Invalid credentials.' : e.message || 'Sign in failed.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <section class="login-art" aria-hidden="true">
      <FlowField :density="0.62" :alpha="0.42" :intensity="0.88" />
      <div class="login-art-shade"></div>
      <div class="login-art-brand">
        <SystemsLogo size="lg" />
      </div>
    </section>

    <section class="login-formzone" aria-label="Sign in">
      <div class="lf-inner">
        <div class="lf-mobile-brand">
          <SystemsLogo size="lg" />
        </div>

        <form class="login-card" @submit.prevent="submit">
          <div class="login-card-head">
            <h1>Sign in</h1>
            <p>Administrator access for deployment, routing, and runtime control.</p>
          </div>

          <div class="login-card-body">
            <div class="login-fieldset">
              <label class="login-field" for="u">
                <span>Username</span>
                <input
                  id="u"
                  v-model="username"
                  aria-label="username"
                  autocomplete="username"
                  autocapitalize="none"
                  autocorrect="off"
                  placeholder="username"
                />
              </label>
              <label class="login-field" for="p">
                <span>Password</span>
                <span class="password-control">
                  <input
                    id="p"
                    v-model="password"
                    aria-label="Password"
                    :type="showPassword ? 'text' : 'password'"
                    autocomplete="current-password"
                    placeholder="password"
                    @keydown="updateCapsLock"
                    @keyup="updateCapsLock"
                    @blur="capsLock = false"
                  />
                  <button
                    class="password-toggle"
                    type="button"
                    :aria-label="showPassword ? 'Hide password' : 'Show password'"
                    :title="showPassword ? 'Hide password' : 'Show password'"
                    @click="showPassword = !showPassword"
                  >
                    <svg v-if="showPassword" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.5 5.5A9.8 9.8 0 0 1 12 5c5 0 8.5 4.4 9.5 6.5a12 12 0 0 1-2.1 3.1" />
                      <path d="M6.2 6.2A13.7 13.7 0 0 0 2.5 11.5C3.5 13.6 7 18 12 18a9.7 9.7 0 0 0 4.1-.9" />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                      <circle cx="12" cy="12" r="2.5" />
                    </svg>
                  </button>
                </span>
              </label>
              <div v-if="capsLock" class="caps-warning">Caps Lock is on.</div>
              <label v-if="needCode" class="login-field" for="c">
                <span>2FA code</span>
                <input
                  id="c"
                  ref="codeInput"
                  v-model="code"
                  aria-label="Two-factor code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  placeholder="123456"
                />
              </label>
            </div>

            <div v-if="error" class="login-error" role="alert">{{ error }}</div>

            <button
              class="btn btn-primary btn-block login-submit"
              type="submit"
              :disabled="loading"
              :aria-busy="loading"
            >
              <span v-if="loading" class="spinner"></span>
              <span>{{ loading ? 'Signing in...' : 'Enter console' }}</span>
            </button>

            <div class="login-context" aria-label="Console details">
              <span>Protected session</span>
              <span>Console v2.0</span>
            </div>
          </div>
        </form>
      </div>
    </section>
  </div>
</template>

<style scoped>
.lf-mobile-brand {
  display: none;
  text-align: center;
}

.login-page {
  grid-template-columns: minmax(0, 58fr) minmax(390px, 42fr);
  gap: 12px;
  padding: 12px;
  background: #000;
}

.login-art {
  position: relative;
  z-index: 1;
  overflow: hidden;
  background: #08080a;
  min-height: calc(100vh - 24px);
  border: 1px solid rgba(255, 255, 255, 0.045);
  border-radius: 12px;
}

.login-art::after {
  content: none;
}

.login-art-shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    radial-gradient(80% 60% at 24% 54%, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.42) 74%),
    radial-gradient(42% 26% at 12% 86%, #08080a 0%, rgba(8, 8, 10, 0.92) 44%, transparent 78%),
    linear-gradient(90deg, rgba(8, 8, 10, 0.06), rgba(8, 8, 10, 0.2) 72%, #08080a 100%);
  pointer-events: none;
}

.login-art-brand {
  position: absolute;
  left: clamp(36px, 5.4vw, 82px);
  bottom: clamp(76px, 14vh, 148px);
  z-index: 2;
}

.login-art-brand :deep(.brand-img.lg) {
  height: clamp(27px, 2.9vw, 43px);
}

.login-formzone {
  position: relative;
  z-index: 2;
  min-height: calc(100vh - 24px);
  padding: 0;
  background: #0a0b0e;
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 12px;
  overflow: hidden;
}

.login-formzone::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    linear-gradient(90deg, rgba(8, 8, 10, 0.72), rgba(10, 11, 14, 0) 18%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 38%);
  pointer-events: none;
}

.login-formzone .lf-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: stretch;
  width: 100%;
  max-width: none;
  min-height: inherit;
}

.login-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  min-height: inherit;
  padding: clamp(48px, 6vw, 96px);
  background: transparent;
  transform: translateY(-3vh);
}

.login-card::before {
  content: none;
}

.login-card-head {
  display: block;
  margin-bottom: 34px;
}

.login-card h1 {
  margin: 0;
  color: var(--text);
  font-family: var(--font);
  font-size: clamp(38px, 3.55vw, 54px);
  font-weight: 720;
  letter-spacing: 0;
}

.login-card-head p {
  max-width: 520px;
  margin: 12px 0 0;
  color: #b2b7c1;
  font-size: 15px;
  line-height: 1.5;
}

.login-card-body {
  width: 100%;
  max-width: 560px;
}

.login-fieldset {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.login-field > span:first-child {
  color: #c0c4cc;
  font-family: var(--font);
  font-size: 14px;
  font-weight: 650;
}

.login-field input {
  width: 100%;
  min-height: 58px;
  padding: 0 16px;
  border: 1px solid #3d414c;
  border-radius: 6px;
  background: #090a0d;
  color: var(--text);
  font-size: 16px;
  box-shadow: none;
}

.login-field input::placeholder {
  color: #747b87;
}

.login-field input:focus {
  border-color: #d8dbe1;
  box-shadow: 0 0 0 3px rgba(216, 219, 225, 0.1);
}

.login-field input:focus-visible {
  outline: none;
}

.login-field:focus-within > span:first-child {
  color: #f0f1f3;
}

.password-control {
  position: relative;
  display: block;
}

.password-control input {
  padding-right: 54px;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.035);
  color: #b4b9c3;
  font-family: var(--font);
  line-height: 1;
  transform: translateY(-50%);
  cursor: pointer;
}

.password-toggle svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.password-toggle:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.055);
}

.password-toggle:focus-visible {
  outline: none;
  border-color: #d8dbe1;
  box-shadow: 0 0 0 3px rgba(216, 219, 225, 0.1);
}

.caps-warning {
  margin-top: -4px;
  color: #f3c969;
  font-size: 12px;
  line-height: 1.4;
}

.login-error {
  margin-top: 14px;
  border: 1px solid rgba(239, 91, 81, 0.45);
  border-radius: 6px;
  padding: 10px 11px;
  background: rgba(239, 91, 81, 0.1);
  color: #ffb4ae;
  font-size: 13px;
}

.login-submit {
  margin-top: 20px;
  min-height: 58px;
  border-radius: 6px;
  font-size: 16px;
}

.login-submit:disabled {
  opacity: 0.72;
  cursor: wait;
}

.login-submit:disabled:hover {
  background: #f2f3f5;
  border-color: #f2f3f5;
}

.login-submit .spinner {
  width: 18px;
  height: 18px;
  border-color: rgba(0, 0, 0, 0.18);
  border-top-color: #0a0a0c;
}

.login-submit:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px rgba(9, 10, 12, 1),
    0 0 0 5px rgba(255, 255, 255, 0.72);
}

.login-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 18px;
  color: #b0b5be;
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.5;
}

.login-context span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.login-context span + span::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #4d535e;
}

@media (max-width: 860px) {
  .login-page {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    gap: 8px;
    padding: 8px;
    background: #000;
  }

  .login-art {
    min-height: 180px;
    height: clamp(160px, 26vh, 220px);
    flex: 0 0 auto;
  }

  .login-art-shade {
    background:
      radial-gradient(80% 70% at 28% 58%, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.5) 72%),
      radial-gradient(60% 42% at 18% 82%, #08080a 0%, rgba(8, 8, 10, 0.84) 44%, transparent 78%),
      linear-gradient(180deg, rgba(8, 8, 10, 0.04), rgba(8, 8, 10, 0.78));
  }

  .login-art-brand {
    left: 24px;
    bottom: 24px;
  }

  .login-formzone {
    flex: 0 0 auto;
    min-height: auto;
    align-items: flex-start;
    overflow: visible;
  }

  .login-formzone .lf-inner {
    max-width: 420px;
    margin: 0 auto;
  }

  .login-card {
    justify-content: flex-start;
    min-height: auto;
    padding: 28px 24px calc(var(--safe-bottom) + 28px);
    transform: none;
  }

  .login-card-head {
    margin-bottom: 24px;
  }

  .login-card h1 {
    font-size: 32px;
  }

  .login-card-head p {
    max-width: 330px;
    font-size: 13px;
  }

  .login-field input {
    min-height: 48px;
    font-size: 15px;
  }

  .login-submit {
    min-height: 50px;
    font-size: 14px;
  }
}

@media (max-width: 520px) {
  .login-card {
    padding: 24px 18px calc(var(--safe-bottom) + 24px);
  }

  .login-card-head {
    margin-bottom: 22px;
  }

  .login-card h1 {
    font-size: 30px;
  }

  .login-card-head p {
    font-size: 12.5px;
  }

  .login-field {
    gap: 6px;
  }

  .login-context {
    font-size: 11px;
  }
}
</style>
