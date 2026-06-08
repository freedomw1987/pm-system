import { defineConfig, devices } from '@playwright/test'

/**
 * E2E test config for PM System
 *
 * Target: full stack via docker compose (frontend :8080 / backend :4001)
 * - Base URL: http://localhost:8080 (nginx → backend :4001)
 * - DB: real PG (seeded by docker entrypoint)
 * - Reset between tests: clean test data via API + reload
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Critical paths share seeded admin user → run sequential
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
