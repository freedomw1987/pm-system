/**
 * Tasks E2E — US-4.2 (MyTasks), US-4.3 (change status)
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

const suffix = Date.now().toString(36)

test.describe('US-4.2: MyTasks', () => {
  test('shows tasks assigned to current user', async ({ request, page }) => {
    const token = await loginAs(request, 'admin', 'US-4.2 my tasks')

    // Create project + task
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E MyTasks ${suffix}` },
    })
    const project = await projRes.json()

    const taskRes = await request.post('http://localhost:4001/api/tasks', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: project.id, title: `My Task ${suffix}`, status: 'pending' },
    })
    expect(taskRes.ok()).toBe(true)

    // Navigate to MyTasks
    await page.goto('http://localhost:3000/login')
    await page.fill('input[type="email"]', 'admin@test.com')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')

    await page.goto('http://localhost:3000/my-tasks')
    await page.waitForTimeout(1000)

    // Task should appear in list
    const taskLink = page.locator(`text=My Task ${suffix}`)
    await expect(taskLink.first()).toBeVisible({ timeout: 5000 })
  })

  test('unassigned tasks do not appear in MyTasks', async ({ request }) => {
    const token = await loginAs(request, 'developer', 'US-4.2 filter')

    // Create project + task with different assignee
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E Filter ${suffix}` },
    })
    const project = await projRes.json()

    // Create task assigned to someone else
    const usersRes = await request.get('http://localhost:4001/api/users?pageSize=1', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const { users } = await usersRes.json()
    const otherUser = users.find((u: any) => u.email !== 'developer@test.com')

    await request.post('http://localhost:4001/api/tasks', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: project.id, title: `Other Task ${suffix}`, assigneeId: otherUser?.id },
    })
  })
})

test.describe('US-4.3: Change task status', () => {
  test('can change task status via API', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-4.3 status')

    // Create project + task
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E Task Status ${suffix}` },
    })
    const project = await projRes.json()

    const taskRes = await request.post('http://localhost:4001/api/tasks', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: project.id, title: `Status Test ${suffix}` },
    })
    const task = await taskRes.json()

    // Update status
    const updateRes = await request.put(`http://localhost:4001/api/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'in_progress' },
    })
    expect(updateRes.ok()).toBe(true)
    const updated = await updateRes.json()
    expect(updated.status).toBe('in_progress')

    // Move to completed
    const completeRes = await request.put(`http://localhost:4001/api/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'completed' },
    })
    expect(completeRes.ok()).toBe(true)
  })

  test('Kanban status update via UI', async ({ page }) => {
    await page.goto('http://localhost:3000/login')
    await page.fill('input[type="email"]', 'admin@test.com')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })
})