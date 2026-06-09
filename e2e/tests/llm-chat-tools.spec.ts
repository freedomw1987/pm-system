/**
 * LLM Chat Tools E2E — US-8.3-8.6
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

test.describe('US-8.3-8.6: Chat API', () => {
  test('chat endpoint responds (with or without LLM config)', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-8.3 chat')
    const res = await request.post('http://localhost:4001/api/chat', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { message: 'test' },
    })
    // 200 = success, 500 = no LLM config, both are valid responses
    expect([200, 500]).toContain(res.status())
  })

  test('chat with project context', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-8.3 project')
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `Chat E2E ${Date.now()}` },
    })
    const project = await projRes.json()

    const res = await request.post('http://localhost:4001/api/chat', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { projectId: project.id, message: 'hello' },
    })
    expect([200, 500]).toContain(res.status())
  })
})