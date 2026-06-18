import { test, expect } from '@playwright/test'

// Minimal API mocks so the SPA renders without a backend (mirrors the approach
// in scripts/shots.mjs). These are smoke checks: the app boots, routes guard,
// and the core surfaces render.

const systems = [
  { id: 1, name: 'Notes API', slug: 'notes', status: 'running', visibility: 'public', route_published: 1, health_state: 'healthy', port: 4012, updated_at: new Date().toISOString(), created_at: new Date().toISOString(), deploy_branch: 'main' },
]
const serverInfo = {
  platform: { name: 'SYSTEMS.', version: '2.0.0-rc.1' },
  docker: { status: 'connected', managed: 1, running: 1 },
  caddy: { type: 'caddy', status: 'host_validation' },
  postgres: { type: 'postgres', status: 'host_validation' },
  features: {},
  disk: { status: 'measured', usedPct: 10, freeGb: 100, totalGb: 200 },
  backup: { status: 'ok' },
  self: {},
}

function json(route, body) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockApi(page) {
  await page.route('**/api/**', (route) => {
    const p = new URL(route.request().url()).pathname
    if (p === '/api/auth/me') return json(route, { id: 1, username: 'admin', twoFactorEnabled: false })
    if (p === '/api/projects') return json(route, { projects: systems })
    if (p === '/api/server/info') return json(route, serverInfo)
    if (p === '/api/audit') return json(route, { entries: [], total: 0 })
    return json(route, {})
  })
}

test.beforeEach(async ({ page }) => {
  // Skip the service worker so navigation is deterministic.
  await page.addInitScript(() => Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined }))
  await mockApi(page)
})

test('login page renders the sign-in form', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input#p')).toBeVisible()
  await expect(page.getByRole('button', { name: /enter systems/i })).toBeVisible()
})

test('unauthenticated visit to a guarded route redirects to login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('authenticated Systems view lists deployed systems', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('acronym_token', 'eyJfake.token.e2e'))
  await page.goto('/')
  // The system name can appear in more than one place (card title + aria/label);
  // assert at least one is visible rather than requiring a unique match.
  await expect(page.getByText('Notes API').first()).toBeVisible()
})

test('authenticated core pages render their primary surfaces', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('acronym_token', 'eyJfake.token.e2e'))

  await page.goto('/ship')
  await expect(page.getByRole('heading', { name: 'Ship' })).toBeVisible()
  await expect(page.getByText('Source archive')).toBeVisible()

  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible()
  await expect(page.getByText('No events yet.')).toBeVisible()

  await page.goto('/server')
  await expect(page.getByRole('heading', { name: 'Server' })).toBeVisible()
  await expect(page.getByText('Core services')).toBeVisible()

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()
  await expect(page.getByText('Administrators')).toBeVisible()
})
