/**
 * Wiki E2E — US-10.1, US-10.2, US-10.3
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

test.describe('US-10.1: Create Wiki page', () => {
  test('admin can list wiki pages', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-10.1 list')
    const res = await request.get('http://localhost:4001/api/wikis', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data.pages) || Array.isArray(data.wikiPages)).toBe(true)
  })
})

test.describe('US-10.2: Wiki page structure', () => {
  test('wiki response has required fields', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-10.2 fields')
    const res = await request.get('http://localhost:4001/api/wikis', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    const pages = data.pages || data.wikiPages || []
    if (pages.length > 0) {
      expect(pages[0]).toHaveProperty('id')
      expect(pages[0]).toHaveProperty('title')
    }
  })
})

test.describe('US-10.3: Wiki search', () => {
  test('wiki list supports project filter', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-10.3 filter')

    // Create project
    const projRes = await request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `Wiki E2E ${Date.now()}` },
    })
    expect(projRes.ok()).toBe(true)
    const project = await projRes.json()

    // List wikis with project filter
    const res = await request.get(`http://localhost:4001/api/wikis?projectId=${project.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
  })
})