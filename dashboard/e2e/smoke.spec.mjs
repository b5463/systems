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
// Mirrors GET /api/server/cleanup/preview (diskhygiene previewCleanup + storage).
const cleanup = {
  images: { count: 0, sizeMb: 0 },
  releases: { count: 0 },
  storage: { buildCacheMb: 0, danglingImagesMb: 0, stoppedContainers: 0, unusedVolumesMb: 0, available: false },
}

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

// Mock the API for one of two session states. Auth is an HttpOnly cookie the
// test can't set, so the session is expressed purely through /api/auth/me:
// a signed-in browser gets a user, a signed-out one gets 401.
async function mockApi(page, { authed }) {
  await page.route('**/api/**', (route) => {
    const p = new URL(route.request().url()).pathname
    if (p === '/api/auth/me') {
      return authed
        ? json(route, { id: 1, username: 'admin', twoFactorEnabled: false, csrfToken: 'e2e-csrf' })
        : json(route, { error: 'Unauthorized' }, 401)
    }
    if (p === '/api/projects') return json(route, { projects: systems })
    if (p === '/api/server/info') return json(route, serverInfo)
    if (p === '/api/server/cleanup/preview') return json(route, cleanup)
    if (p === '/api/admin/settings') return json(route, { settings: [] })
    if (p === '/api/admin/sessions') return json(route, { sessions: [] })
    if (p === '/api/admin/users') return json(route, { users: [{ id: 1, username: 'admin', created_at: new Date().toISOString() }] })
    if (p === '/api/deploy/plan') return json(route, {
      plan: { valid: true, containerName: 'systems-ui-audit', proxy: 'caddy', routePublished: true, host: 'ui-audit.acronym.sk' },
    })
    if (p === '/api/deploy/analyze') return json(route, {
      analysis: {
        projectType: 'static', rootFolder: '.', entryPoint: 'index.html', outputFolder: '.', expectedPort: 3000,
        fileCount: 1, filesUsed: ['index.html'], warnings: [], blockers: [],
      },
    })
    if (p === '/api/deploy') return json(route, {
      project: { id: 2, name: 'UI Audit', slug: 'ui-audit', port: 4022, status: 'building', visibility: 'public' },
    }, 202)
    if (p === '/api/audit') return json(route, { entries: [], total: 0 })
    return json(route, {})
  })
}

async function expectNoViewportOverflow(page) {
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className : '',
          width: Math.round(rect.width),
          right: Math.round(rect.right),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        }
      })
      .filter((item) => item.right > window.innerWidth + 1 || item.width > window.innerWidth + 1)
      .slice(0, 8),
  }))
  expect(
    overflow.document,
    'Viewport overflow: ' + JSON.stringify(overflow.offenders),
  ).toBeLessThanOrEqual(overflow.viewport + 1)
}

test.beforeEach(async ({ page }) => {
  // Skip the service worker so navigation is deterministic.
  await page.addInitScript(() => { delete Navigator.prototype.serviceWorker })
})

test('login page renders the sign-in form', async ({ page }) => {
  await mockApi(page, { authed: false })
  await page.goto('/login')
  await expect(page.locator('input#p')).toBeVisible()
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
})

test('unauthenticated visit to a guarded route redirects to login', async ({ page }) => {
  await mockApi(page, { authed: false })
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('authenticated Systems view lists deployed systems', async ({ page }) => {
  await mockApi(page, { authed: true })
  await page.goto('/')
  // The system name can appear in more than one place (card title + aria/label);
  // assert at least one is visible rather than requiring a unique match.
  await expect(page.getByText('Notes API').first()).toBeVisible()
})

test('authenticated core pages render their primary surfaces', async ({ page }) => {
  await mockApi(page, { authed: true })

  await page.goto('/ship')
  await expect(page.getByRole('heading', { name: 'Ship', level: 1 })).toBeVisible()
  await expect(page.getByText('Source archive')).toBeVisible()

  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Events', level: 1 })).toBeVisible()
  await expect(page.getByText('No events yet.')).toBeVisible()

  await page.goto('/server')
  await expect(page.getByRole('heading', { name: 'Server', level: 1 })).toBeVisible()
  await expect(page.getByText('Infrastructure')).toBeVisible()

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible()
  await expect(page.getByText('Administrators')).toBeVisible()
})
test('primary authenticated pages do not overflow the viewport', async ({ page }) => {
  await mockApi(page, { authed: true })
  for (const path of ['/', '/ship', '/events', '/server', '/admin']) {
    await page.goto(path)
    await expectNoViewportOverflow(page)
  }
})

test('active Ship deployment uses the responsive production layout', async ({ page }) => {
  await mockApi(page, { authed: true })
  await page.goto('/ship')

  await page.getByLabel('Name').fill('UI Audit')
  await page.getByLabel('Slug').fill('ui-audit')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'ui-audit.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('PK mocked archive'),
  })

  await expect(page.getByText('static', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Deploy system' }).click()

  await expect(page.getByRole('heading', { name: 'Building your system' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Deployment pipeline' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Build output' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View system' })).toBeVisible()
  await expectNoViewportOverflow(page)
  await page.goto('/')
})
