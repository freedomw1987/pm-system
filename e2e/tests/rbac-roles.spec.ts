/**
 * RBAC & Roles E2E — US-7.1, US-7.2
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_helpers'

const suffix = Date.now().toString(36)

test.describe('US-7.1: Create custom role', () => {
  test('admin can create custom role', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-7.1 create role')

    const res = await request.post('http://localhost:4001/api/roles', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `CustomRole${suffix}`,
        permissions: ['projects.view', 'tasks.view'],
      },
    })
    expect(res.ok()).toBe(true)
    const role = await res.json()
    expect(role.name).toBe(`CustomRole${suffix}`)
  })

  test('non-admin cannot create role', async ({ request }) => {
    const token = await loginAs(request, 'developer', 'US-7.1 forbidden')

    const res = await request.post('http://localhost:4001/api/roles', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `Role${suffix}`, permissions: [] },
    })
    expect(res.status()).toBe(403)
  })
})

test.describe('US-7.2: Change user role', () => {
  test('admin can change user role', async ({ request }) => {
    const token = await loginAs(request, 'admin', 'US-7.2 change role')

    // Get a user
    const usersRes = await request.get('http://localhost:4001/api/users?pageSize=10', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const { users } = await usersRes.json()
    const user = users.find((u: any) => u.email === 'dev@test.com')

    // Get roles
    const rolesRes = await request.get('http://localhost:4001/api/roles', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const { roles } = await rolesRes.json()
    const techLeadRole = roles.find((r: any) => r.name === 'tech_lead')

    // Change role
    const updateRes = await request.put(`http://localhost:4001/api/users/${user.id}/role`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { role: techLeadRole.name },
    })
    expect(updateRes.ok()).toBe(true)
    const updated = await updateRes.json()
    expect(updated.role).toBe('tech_lead')
  })

  test('non-admin cannot change other user roles', async ({ request }) => {
    const token = await loginAs(request, 'developer', 'US-7.2 forbidden')

    // Get another user
    const usersRes = await request.get('http://localhost:4001/api/users?pageSize=10', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const { users } = await usersRes.json()
    const otherUser = users.find((u: any) => u.email !== 'developer@test.com')

    const res = await request.put(`http://localhost:4001/api/users/${otherUser.id}/role`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { role: 'admin' },
    })
    expect(res.status()).toBe(403)
  })
})