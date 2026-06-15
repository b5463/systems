import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(import.meta.url)
const { chromium } = require(`${process.env.NODE_PATH}/playwright`)

const OUT = '/tmp/shots'
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:4173'

const systems = [
  { id: 1, name: 'Notes API', slug: 'notes', status: 'running', visibility: 'public', route_published: 1, health_state: 'healthy', port: 4012, updated_at: new Date(Date.now() - 9e5).toISOString(), created_at: new Date(Date.now() - 8.6e7).toISOString(), deploy_branch: 'main' },
  { id: 2, name: 'Marketing Site', slug: 'marketing', status: 'running', visibility: 'public', route_published: 1, health_state: 'healthy', port: 4015, updated_at: new Date(Date.now() - 6e6).toISOString(), created_at: new Date(Date.now() - 9e7).toISOString(), deploy_branch: 'main' },
  { id: 3, name: 'Internal Worker', slug: 'worker', status: 'stopped', visibility: 'private', route_published: 0, health_state: null, port: 4020, updated_at: new Date(Date.now() - 2e8).toISOString(), created_at: new Date(Date.now() - 2e8).toISOString(), deploy_branch: 'main' },
  { id: 4, name: 'Staging App', slug: 'staging', status: 'error', visibility: 'password', route_published: 1, health_state: 'unreachable', port: 4030, updated_at: new Date(Date.now() - 3e6).toISOString(), created_at: new Date(Date.now() - 3e7).toISOString(), deploy_branch: 'main' },
]
const serverInfo = {
  platform: { name: 'SYSTEMS.', version: '2.0.0-rc.1', stage: 'repo-complete · host validation pending', commit: 'a1b2c3d', target: 'Windows (Docker Desktop / WSL2)', baseDomain: 'acronym.sk', dashboardDomain: 'systems.acronym.sk', wildcardDomain: '*.acronym.sk', dataDir: 'C:\\ProgramData\\SYSTEMS', uploadMaxMb: 100, releaseRetention: 3, firewall: 'host_validation', hardening: 'host_validation' },
  docker: { status: 'connected', managed: 4, running: 2 },
  caddy: { type: 'caddy', status: 'host_validation' },
  postgres: { type: 'postgres', status: 'host_validation' },
  wildcard: { domain: '*.acronym.sk', status: 'not_measured' },
  self: { version: '2.0.0-rc.1', node: 'v22.22.2', uptimeSeconds: 12600, rssMb: 84.2 },
  health: { deploymentWorker: 'in_api', caddyConfig: 'host_validation', postgres: 'host_validation', dockerAccess: 'connected' },
  disk: { status: 'measured', usedPct: 38.4, freeGb: 142.6, totalGb: 232 },
  backup: { status: 'ok', last: new Date(Date.now() - 6e6).toISOString(), ageHours: 1.7, count: 6 },
  defaults: { Memory: 536870912, CpuPeriod: 100000, CpuQuota: 50000, PidsLimit: 256, RestartPolicy: { Name: 'unless-stopped' }, LogConfig: { Config: { 'max-size': '10m', 'max-file': '3' } } },
  features: { dockerfileMode: false, shellConsole: false, dbProvisioning: false, dbMode: 'shared', githubDeploys: false, largeUploads: false, notifications: false, uploadMaxMb: 100, v2UploadMaxMb: 2048 },
}
const audit = { total: 5, entries: [
  { id: 5, action: 'deploy', target: 'notes', detail: 'port:4012 public', username: 'admin', ip: '10.0.0.4', created_at: new Date(Date.now() - 9e5).toISOString() },
  { id: 4, action: 'reconcile', target: 'staging', detail: 'running → error', username: 'system', ip: null, created_at: new Date(Date.now() - 3e6).toISOString() },
  { id: 3, action: 'backup_succeeded', target: null, detail: '2026-06-15', username: 'system', ip: null, created_at: new Date(Date.now() - 6e6).toISOString() },
  { id: 2, action: 'login', target: 'admin', detail: null, username: 'admin', ip: '10.0.0.4', created_at: new Date(Date.now() - 9e7).toISOString() },
  { id: 1, action: 'visibility_change', target: 'marketing', detail: 'public', username: 'admin', ip: '10.0.0.4', created_at: new Date(Date.now() - 9.1e7).toISOString() },
] }

function json(route, body) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }) }

async function mock(page) {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname
    if (p === '/api/auth/me') return json(route, { id: 1, username: 'admin', twoFactorEnabled: false })
    if (p === '/api/projects') return json(route, { projects: systems })
    if (p === '/api/server/info') return json(route, serverInfo)
    if (p === '/api/audit') return json(route, audit)
    if (p === '/api/admin/users') return json(route, { users: [{ id: 1, username: 'admin', created_at: new Date(Date.now() - 9e9).toISOString() }] })
    const m = p.match(/^\/api\/projects\/([^/]+)(\/.*)?$/)
    if (m) {
      const s = systems.find((x) => x.slug === m[1]) || systems[0]
      const sub = m[2] || ''
      if (sub === '/stats') return json(route, { cpu_percent: 12.4, memory_mb: 96, memory_limit_mb: 512, rx_bytes: 1e6, tx_bytes: 2e6 })
      if (sub === '/stats/history') return json(route, { history: [] })
      if (sub === '/env') return json(route, { keys: ['NODE_ENV', 'PORT'] })
      if (sub === '/deploy-history') return json(route, { history: [] })
      return json(route, { project: s })
    }
    return json(route, {})
  })
}

const pages = [
  { name: 'login', path: '/login', auth: false },
  { name: 'systems', path: '/', auth: true },
  { name: 'ship', path: '/ship', auth: true },
  { name: 'system-detail', path: '/systems/notes', auth: true },
  { name: 'server', path: '/server', auth: true },
  { name: 'events', path: '/events', auth: true },
  { name: 'admin', path: '/admin', auth: true },
]

const browser = await chromium.launch()
for (const vp of [{ tag: 'desktop', w: 1280, h: 900 }, { tag: 'mobile', w: 390, h: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 })
  for (const pg of pages) {
    const page = await ctx.newPage()
    await page.addInitScript(() => { Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined }) })
    if (pg.auth) await page.addInitScript(() => localStorage.setItem('acronym_token', 'eyJfake.token.shot'))
    await mock(page)
    await page.goto(BASE + pg.path, { waitUntil: 'networkidle' }).catch(() => {})
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${OUT}/${pg.name}-${vp.tag}.png`, fullPage: vp.tag === 'desktop' })
    await page.close()
  }
  await ctx.close()
}
await browser.close()
console.log('shots done ->', OUT)
