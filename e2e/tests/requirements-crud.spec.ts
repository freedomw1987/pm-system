/**
 * Requirements E2E — US-3.2 (assign), US-3.4 (status change)
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

const suffix = Date.now().toString(36)

test.describe('US-3.2: Assign requirement', () => {
  test('admin can assign requirement to user', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-3.2 assign')

    // Create project
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E Req ${suffix}` },
    })
    const project = await projRes.json()

    // Create requirement
    const reqRes = await request.post('http://localhost:4001/api/requirements', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: project.id, title: `Test Req ${suffix}` },
    })
    expect(reqRes.ok()).toBe(true)
    const req = await reqRes.json()

    // Get users
    const usersRes = await request.get('http://localhost:4001/api/users?pageSize=1', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const { users } = await usersRes.json()
    const assignee = users[0]

    // Update requirement with assignee
    const updateRes = await request.put(`http://localhost:4001/api/requirements/${req.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { assigneeId: assignee.id },
    })
    expect(updateRes.ok()).toBe(true)
    const updated = await updateRes.json()
    expect(updated.assigneeId).toBe(assignee.id)
  })
})

test.describe('US-3.4: Change requirement status', () => {
  test('can change requirement status', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-3.4 status')

    // Create project + requirement
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E Req Status ${suffix}` },
    })
    const project = await projRes.json()

    const reqRes = await request.post('http://localhost:4001/api/requirements', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: project.id, title: `Status Test ${suffix}`, status: 'pending' },
    })
    const req = await reqRes.json()

    // Update status to in_progress
    const updateRes = await request.put(`http://localhost:4001/api/requirements/${req.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'in_progress' },
    })
    expect(updateRes.ok()).toBe(true)
    const updated = await updateRes.json()
    expect(updated.status).toBe('in_progress')

    // Update to completed
    const completeRes = await request.put(`http://localhost:4001/api/requirements/${req.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'completed' },
    })
    expect(completeRes.ok()).toBe(true)
    const completed = await completeRes.json()
    expect(completed.status).toBe('completed')
  })
})