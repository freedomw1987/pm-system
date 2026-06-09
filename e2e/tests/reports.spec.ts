/**
 * Reports E2E — US-11.1 (progress report)
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

const suffix = Date.now().toString(36)

test.describe('US-11.1: Progress report', () => {
  test('progress report API returns project stats', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-11.1 progress')

    // Create project
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E Report ${suffix}` },
    })
    expect(projRes.ok()).toBe(true)
    const project = await projRes.json()

    // Get progress report
    const reportRes = await request.get(`http://localhost:4001/api/reports/progress?projectId=${project.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(reportRes.ok()).toBe(true)
    const report = await reportRes.json()

    // Should have stats structure
    expect(report).toHaveProperty('requirements')
    expect(report).toHaveProperty('tasks')
    expect(report).toHaveProperty('bugs')
    expect(report.requirements).toHaveProperty('total')
    expect(report.requirements).toHaveProperty('completed')
  })

  test('cost report API returns worklog stats', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-11.1 cost')

    // Create project
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E Cost ${suffix}` },
    })
    const project = await projRes.json()

    // Get cost report
    const reportRes = await request.get(`http://localhost:4001/api/reports/cost?projectId=${project.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(reportRes.ok()).toBe(true)
    const report = await reportRes.json()

    expect(report).toHaveProperty('totalHours')
    expect(report).toHaveProperty('workLogs')
  })

  test('reports page UI loads', async ({ page }) => {
    await page.goto('http://localhost:3000/login')
    await page.fill('input[type="email"]', 'admin@test.com')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')

    await page.goto('http://localhost:3000/reports')
    await page.waitForTimeout(1000)

    // Reports page should load
    await expect(page.locator('text=進度').first()).toBeVisible({ timeout: 5000 })
  })
})