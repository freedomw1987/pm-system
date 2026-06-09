/**
 * Token Report E2E — US-11.3
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

test.describe('US-11.3: Token Report', () => {
  test('admin can view token logs', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-11.3')
    const res = await request.get('http://localhost:4001/api/tokenlogs', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(data).toHaveProperty('tokenLogs')
  })

  test('token stats endpoint works', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-11.3 stats')
    const res = await request.get('http://localhost:4001/api/tokenlogs/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
  })

  test('non-admin cannot view token logs', async ({ request }) => {
    const token = await loginAs(request, 'developer', 'US-11.3 forbidden')
    const res = await request.get('http://localhost:4001/api/tokenlogs', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(403)
  })
})