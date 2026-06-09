/**
 * WorkLogs E2E — US-6.2 (pagination), US-6.4 (filter)
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

const suffix = Date.now().toString(36)

test.describe('US-6.2: WorkLog pagination', () => {
  test('worklogs API supports pagination', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-6.2 pagination')

    // Get first page
    const res1 = await request.get('http://localhost:4001/api/worklogs?page=1&pageSize=5', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res1.ok()).toBe(true)
    const data1 = await res1.json()
    expect(data1).toHaveProperty('totalCount')
    expect(data1).toHaveProperty('page')
    expect(data1).toHaveProperty('pageSize')

    // Get second page
    const res2 = await request.get('http://localhost:4001/api/worklogs?page=2&pageSize=5', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res2.ok()).toBe(true)
    const data2 = await res2.json()
    expect(data2.page).toBe(2)
  })

  test('worklogs page UI shows pagination', async ({ page }) => {
    await page.goto('http://localhost:3000/login')
    await page.fill('input[type="email"]', 'admin@test.com')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')

    await page.goto('http://localhost:3000/worklogs')
    await page.waitForTimeout(1000)

    // Should have pagination controls
    const pagination = page.locator('button:has-text("»"), button:has-text("»")')
    await expect(pagination.first()).toBeVisible({ timeout: 5000 })
  })
})

test.describe('US-6.4: WorkLog filtering', () => {
  test('filter by project', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-6.4 filter')

    // Create project + task + worklog
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E WL Filter ${suffix}` },
    })
    const project = await projRes.json()

    const taskRes = await request.post('http://localhost:4001/api/tasks', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: project.id, title: `WL Task ${suffix}` },
    })
    const task = await taskRes.json()

    await request.post('http://localhost:4001/api/worklogs', {
      headers: { Authorization: `Bearer ${token}` },
      data: { taskId: task.id, hours: 2, workDate: '2026-06-10' },
    })

    // Filter by project
    const res = await request.get(`http://localhost:4001/api/worklogs?projectId=${project.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(data.workLogs.length).toBeGreaterThan(0)
  })

  test('filter by date range', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-6.4 date range')

    const res = await request.get('http://localhost:4001/api/worklogs?startDate=2026-06-01&endDate=2026-06-30', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data.workLogs)).toBe(true)
  })
})