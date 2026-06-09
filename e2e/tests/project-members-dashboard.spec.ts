/**
 * Project features E2E — US-2.2 (add members), US-2.3 (dashboard)
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

const ADMIN = { email: 'admin@test.com', password: 'admin123' }
const suffix = Date.now().toString(36)

test.describe('US-2.2: Add project members', () => {
  test('admin can add member to project', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-2.2 add member')

    // Create project
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E Member Test ${suffix}` },
    })
    expect(projRes.ok()).toBe(true)
    const project = await projRes.json()
    const projectId = project.id

    // Get user to add
    const usersRes = await request.get('http://localhost:4001/api/users?pageSize=1', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const { users } = await usersRes.json()
    const userToAdd = users.find((u: any) => u.email !== ADMIN.email)

    // Add member via PUT project
    const updateRes = await request.put(`http://localhost:4001/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        memberIds: [userToAdd.id],
        memberRole: 'developer',
      },
    })
    expect(updateRes.ok()).toBe(true)

    // Verify member added
    const detailRes = await request.get(`http://localhost:4001/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const detail = await detailRes.json()
    expect(detail.members).toBeDefined()
    expect(detail.members.length).toBeGreaterThan(0)
  })

  test('non-admin cannot add members', async ({ request }) => {
    const token = await loginAs(request, 'developer', 'US-2.2 non-admin add')

    // Create project as admin first
    const adminToken = await loginAs(request, 'admin', 'US-2.2 setup')
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: `E2E Member Test ${suffix}` },
    })
    const project = await projRes.json()

    // Try to add member as developer
    const updateRes = await request.put(`http://localhost:4001/api/projects/${project.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { memberIds: ['some-user-id'] },
    })
    expect(updateRes.status()).toBe(403)
  })
})

test.describe('US-2.3: Dashboard', () => {
  test('dashboard shows project summary', async ({ page }) => {
    await page.goto('http://localhost:3000/login')
    await page.fill('input[type="email"]', ADMIN.email)
    await page.fill('input[type="password"]', ADMIN.password)
    await page.click('button[type="submit"]')
    await page.waitForURL('/')

    // Dashboard should load
    await page.waitForSelector('text=進行中任務', { timeout: 10000 })
  })

  test('dashboard shows user projects', async ({ page, request }) => {
    const token = await loginAs(request, 'admin', 'US-2.3 dashboard')

    // Create a project first
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E Dashboard ${suffix}` },
    })
    expect(projRes.ok()).toBe(true)

    // Navigate to dashboard
    await page.goto('http://localhost:3000/')
    await page.waitForSelector('text=進行中任務', { timeout: 10000 })

    // Project should appear
    const projectLink = page.locator(`text=E2E Dashboard ${suffix}`)
    await expect(projectLink.first()).toBeVisible({ timeout: 5000 })
  })
})