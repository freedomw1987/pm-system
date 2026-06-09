/**
 * Agent E2E — US-9.1, US-9.4
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

test.describe('US-9.1: List Agents', () => {
  test('admin can list agents', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-9.1 list')
    const res = await request.get('http://localhost:4001/api/agents', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data.agents)).toBe(true)
  })

  test('developer can list agents', async ({ request }) => {
    const token = await loginAs(request, 'developer', 'US-9.1 dev list')
    const res = await request.get('http://localhost:4001/api/agents', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
  })
})

test.describe('US-9.4: Agent Monitor', () => {
  test('agent list returns with isAgent flag', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-9.4 monitor')
    const res = await request.get('http://localhost:4001/api/agents', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    if (data.agents.length > 0) {
      expect(data.agents[0]).toHaveProperty('isAgent')
    }
  })
})