/**
 * Departments E2E — US-12.1, US-12.2, US-12.3
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

const suffix = Date.now().toString(36)

test.describe('US-12.1: Create department', () => {
  test('admin can create department', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-12.1 create')

    const res = await request.post('http://localhost:4001/api/departments', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `Test Dept ${suffix}` },
    })
    expect(res.ok()).toBe(true)
    const dept = await res.json()
    expect(dept.department.name).toBe(`Test Dept ${suffix}`)
  })

  test('non-admin cannot create department', async ({ request }) => {
    const token = await loginAs(request, 'developer', 'US-12.1 forbidden')

    const res = await request.post('http://localhost:4001/api/departments', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `Bad Dept ${suffix}` },
    })
    expect(res.status()).toBe(403)
  })

  test('duplicate department name rejected', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-12.1 duplicate')

    // Create first
    await request.post('http://localhost:4001/api/departments', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `Unique Dept ${suffix}` },
    })

    // Try duplicate
    const res = await request.post('http://localhost:4001/api/departments', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `Unique Dept ${suffix}` },
    })
    expect(res.status()).toBe(400)
  })
})

test.describe('US-12.2: Update department', () => {
  test('admin can update department name', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-12.2 update')

    // Create dept
    const createRes = await request.post('http://localhost:4001/api/departments', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `Old Name ${suffix}` },
    })
    const dept = await createRes.json()

    // Update
    const updateRes = await request.put(`http://localhost:4001/api/departments/${dept.department.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `New Name ${suffix}` },
    })
    expect(updateRes.ok()).toBe(true)
    const updated = await updateRes.json()
    expect(updated.department.name).toBe(`New Name ${suffix}`)
  })
})

test.describe('US-12.3: List departments', () => {
  test('lists all departments', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-12.3 list')

    const res = await request.get('http://localhost:4001/api/departments', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data.departments)).toBe(true)
    expect(data.departments.length).toBeGreaterThan(0)
  })

  test('get single department', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-12.3 get one')

    // Get from list
    const listRes = await request.get('http://localhost:4001/api/departments', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const { departments } = await listRes.json()
    const dept = departments[0]

    // Get by id
    const res = await request.get(`http://localhost:4001/api/departments/${dept.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(data.department.id).toBe(dept.id)
    expect(data.department).toHaveProperty('userCount')
  })
})