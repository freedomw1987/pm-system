/**
 * Auth E2E tests — US-1.2 (refresh), US-1.3 (logout)
 *
 * 涵蓋:
 *  - US-1.2: Token refresh flow
 *  - US-1.3: Logout flow
 */

import { test, expect } from '@playwright/test'

const ADMIN = { email: 'admin@test.com', password: 'admin123' }
const DEV = { email: 'dev@test.com', password: 'dev123' }

test.describe('US-1.2: Token refresh', () => {
  test('refresh token endpoint returns new access token', async ({ request }) => {
    // Login to get tokens
    const loginRes = await request.post('http://localhost:4001/auth/login', {
      data: ADMIN,
    })
    expect(loginRes.ok()).toBe(true)
    const loginData = await loginRes.json()
    expect(loginData.accessToken).toBeDefined()
    expect(loginData.refreshToken).toBeDefined()

    const originalAccessToken = loginData.accessToken

    // Use refresh token to get new access token
    const refreshRes = await request.post('http://localhost:4001/auth/refresh', {
      data: { refreshToken: loginData.refreshToken },
    })
    expect(refreshRes.ok()).toBe(true)
    const refreshData = await refreshRes.json()
    expect(refreshData.accessToken).toBeDefined()
    expect(refreshData.accessToken).not.toBe(originalAccessToken)
  })

  test('refresh token with invalid token returns 401', async ({ request }) => {
    const res = await request.post('http://localhost:4001/auth/refresh', {
      data: { refreshToken: 'invalid-token' },
    })
    expect(res.status()).toBe(401)
  })

  test('protected endpoint works with refreshed token', async ({ request }) => {
    // Login
    const loginRes = await request.post('http://localhost:4001/auth/login', {
      data: ADMIN,
    })
    const { refreshToken } = await loginRes.json()

    // Refresh
    const refreshRes = await request.post('http://localhost:4001/auth/refresh', {
      data: { refreshToken },
    })
    const { accessToken } = await refreshRes.json()

    // Use new token to access protected endpoint
    const projectsRes = await request.get('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(projectsRes.ok()).toBe(true)
  })
})

test.describe('US-1.3: Logout', () => {
  test('logout endpoint invalidates refresh token', async ({ request }) => {
    // Login
    const loginRes = await request.post('http://localhost:4001/auth/login', {
      data: DEV,
    })
    const { refreshToken } = await loginRes.json()

    // Logout
    const logoutRes = await request.post('http://localhost:4001/auth/logout', {
      data: { refreshToken },
    })
    expect(logoutRes.ok()).toBe(true)

    // Try to use the now-invalid refresh token
    const refreshRes = await request.post('http://localhost:4001/auth/refresh', {
      data: { refreshToken },
    })
    expect(refreshRes.status()).toBe(401)
  })

  test('UI logout clears session', async ({ page }) => {
    // Login via UI
    await page.goto('http://localhost:3000/login')
    await page.fill('input[type="email"]', DEV.email)
    await page.fill('input[type="password"]', DEV.password)
    await page.click('button[type="submit"]')
    await page.waitForURL('/')

    // Click logout
    await page.click('button:has-text("登出")')
    await page.waitForURL('/login')
  })
})