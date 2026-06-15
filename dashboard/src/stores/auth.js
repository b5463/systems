import { defineStore } from 'pinia'

const TOKEN_KEY = 'acronym_token'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || null,
    user: null,
    ready: false // becomes true once initial validation completes
  }),

  getters: {
    isAuthenticated: (s) => !!s.token
  },

  actions: {
    setToken(token) {
      this.token = token
      if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    },

    clear() {
      this.token = null
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
    },

    async login(username, password, code) {
      // Direct fetch (not the shared client) so we can read the response body
      // on a 401 — the login endpoint signals twoFactorRequired that way, and
      // the shared client otherwise drops the body + redirects on any 401.
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
      this.setToken(data.token)
      await this.fetchMe()
      return data
    },

    async logout() {
      const { api } = await import('../api/client')
      try {
        await api.post('/auth/logout')
      } catch {
        // ignore — clear locally regardless
      }
      this.clear()
    },

    async fetchMe() {
      const { api } = await import('../api/client')
      const me = await api.get('/auth/me')
      this.user = me
      return me
    },

    async refresh() {
      if (!this.token) return
      const { api } = await import('../api/client')
      try {
        const data = await api.post('/auth/refresh')
        if (data && data.token) this.setToken(data.token)
      } catch {
        // a failed refresh on a still-valid token is non-fatal
      }
    },

    // Called once at app startup: validate any persisted token.
    async init() {
      if (this.token) {
        try {
          await this.fetchMe()
        } catch {
          this.clear()
        }
      }
      this.ready = true
    }
  }
})
