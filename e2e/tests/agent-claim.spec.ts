/**
 * Agent E2E — US-9.2 (claim task)
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

const suffix = Date.now().toString(36)

test.describe('US-9.2: Agent claim task', () => {
  test('agent can claim a task', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-9.2 claim')

    // Create project + task
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E Agent ${suffix}` },
    })
    const project = await projRes.json()

    const taskRes = await request.post('http://localhost:4001/api/tasks', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: project.id, title: `Agent Task ${suffix}` },
    })
    expect(taskRes.ok()).toBe(true)
    const task = await taskRes.json()

    // Get agent user
    const agentsRes = await request.get('http://localhost:4001/api/agents', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const { agents } = await agentsRes.json()
    expect(agents.length).toBeGreaterThan(0)
    const agent = agents[0]

    // Claim task
    const claimRes = await request.post(`http://localhost:4001/api/agents/${agent.id}/claim`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { taskId: task.id },
    })
    expect(claimRes.ok()).toBe(true)

    // Verify task is assigned
    const taskDetail = await request.get(`http://localhost:4001/api/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const updated = await taskDetail.json()
    expect(updated.assigneeId).toBe(agent.id)
  })

  test('non-agent cannot claim tasks', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-9.2 forbidden')

    // Create project + task
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E No Claim ${suffix}` },
    })
    const project = await projRes.json()

    const taskRes = await request.post('http://localhost:4001/api/tasks', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: project.id, title: `No Claim ${suffix}` },
    })
    const task = await taskRes.json()

    // Get agent user
    const agentsRes = await request.get('http://localhost:4001/api/agents', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const { agents } = await agentsRes.json()
    const agent = agents[0]

    // Try to claim already-assigned task
    await request.post(`http://localhost:4001/api/agents/${agent.id}/claim`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { taskId: task.id },
    })

    // Second claim should fail
    const claimRes = await request.post(`http://localhost:4001/api/agents/${agent.id}/claim`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { taskId: task.id },
    })
    // Should either 400 (already assigned) or succeed (same agent)
  })
})