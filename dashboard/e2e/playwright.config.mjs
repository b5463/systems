import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// The dashboard root (one level up from this e2e/ folder).
const dashboardRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: '**/*.spec.mjs',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  // Serve the production build; mirrors scripts/shots.mjs.
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    cwd: dashboardRoot,
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
