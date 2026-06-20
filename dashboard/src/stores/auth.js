import { defineStore } from 'pinia'

// Shared across all callers so the session probe runs exactly once per page
// load, even if the router guard and App.vue both call init() concurrently.
let initPromise = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    csrfToken: null,
    ready: false
  }),

  getters: {
    isAuthenticated: (s) => !!s.user
  },

  actions: {
    setCsrf(token) {
      this.csrfToken = token || null
    },

    clear() {
      this.user = null
      this.csrfToken = null
      // Remove credentials left by versions that used localStorage bearer JWTs.
      localStorage.removeItem('acronym_token')
    },

    async login(username, password, code) {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, ...(code ? { code } : {}) })
      })
      let data = null
      const text = await res.text()
      if (text) { try { data = JSON.parse(text) } catch { data = text } }
      if (!res.ok) {
        const err = new Error((data && data.error) || 'Sign in failed.')
        err.status = res.status
        err.twoFactorRequired = !!(data && data.twoFactorRequired)
        throw err
      }
      this.setCsrf(data.csrfToken)
      await this.fetchMe()
      return data
    },

    async logout() {
      const { api } = await import('../api/client')
      try { await api.post('/auth/logout') } catch { /* clear locally regardless */ }
      this.clear()
    },

    async fetchMe() {
      const { api } = await import('../api/client')
      const me = await api.get('/auth/me')
      this.user = me
      this.setCsrf(me.csrfToken)
      return me
    },

    async refresh() {
      if (!this.user) return
      const { api } = await import('../api/client')
      try {
        const data = await api.post('/auth/refresh')
        if (data && data.csrfToken) this.setCsrf(data.csrfToken)
      } catch { /* a failed refresh is non-fatal until the session expires */ }
    },

    async init() {
      // The HttpOnly credential cannot be inspected by JavaScript. Ask the
      // server whether the browser has a valid session on every cold start.
      // Memoized: the router guard awaits this on the first navigation while
      // App.vue also kicks it off on mount — they must share one probe so the
      // guard never decides auth state before the session is known (which would
      // bounce an already-signed-in user to /login on a cold load).
      if (initPromise) return initPromise
      initPromise = (async () => {
        localStorage.removeItem('acronym_token')
        try { await this.fetchMe() } catch { this.clear() }
        this.ready = true
      })()
      return initPromise
    }
  }
})