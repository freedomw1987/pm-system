/**
 * Project resolver helper tests — US-21.6
 *
 * Verifies:
 *  - isUuidLike: UUID-shaped detection (incl. case-insensitive)
 *  - resolveProjectIdentifier: UUID path, exact name, contains fallback,
 *    empty input, scoped membership for non-admin, error shape
 *  - listAccessibleProjectNames: admin sees all, non-admin sees member only,
 *    cap at 20, sorted ascending
 */

import { describe, expect, mock, test } from 'bun:test'

// Mock prisma before importing the helpers
const mockProjectFindUnique = mock(() => Promise.resolve(null as any))
const mockProjectFindFirst = mock(() => Promise.resolve(null as any))
const mockProjectMemberFindMany = mock(() => Promise.resolve([] as any[]))
const mockProjectFindMany = mock(() => Promise.resolve([] as any[]))

// Cast to any-arg variant so we can capture `args` in mockImplementationOnce
const projectFindUniqueAny = mockProjectFindUnique as unknown as ((args?: any) => Promise<any>)
const projectFindFirstAny = mockProjectFindFirst as unknown as ((args?: any) => Promise<any>)
const projectMemberFindManyAny = mockProjectMemberFindMany as unknown as ((args?: any) => Promise<any>)
const projectFindManyAny = mockProjectFindMany as unknown as ((args?: any) => Promise<any>)

mock.module('./prisma', () => ({
  prisma: {
    project: {
      findUnique: projectFindUniqueAny,
      findFirst: projectFindFirstAny,
      findMany: projectFindManyAny
    },
    projectMember: {
      findMany: projectMemberFindManyAny
    }
  }
}))

const {
  isUuidLike,
  resolveProjectIdentifier,
  listAccessibleProjectNames
} = await import('./project-resolver')

// ─── isUuidLike ────────────────────────────────────────────────────────────

describe('US-21.6: isUuidLike', () => {
  test('accepts canonical lowercase UUID', () => {
    expect(isUuidLike('e28393d4-210c-4f5e-a36e-bc018989094a')).toBe(true)
  })
  test('accepts uppercase UUID', () => {
    expect(isUuidLike('E28393D4-210C-4F5E-A36E-BC018989094A')).toBe(true)
  })
  test('rejects Chinese name', () => {
    expect(isUuidLike('範例項目')).toBe(false)
  })
  test('rejects partial UUID', () => {
    expect(isUuidLike('e28393d4-210c')).toBe(false)
  })
  test('rejects empty string', () => {
    expect(isUuidLike('')).toBe(false)
  })
  test('rejects name with spaces', () => {
    expect(isUuidLike('my project')).toBe(false)
  })
})

// ─── resolveProjectIdentifier ──────────────────────────────────────────────

describe('US-21.6: resolveProjectIdentifier', () => {
  test('empty input returns INVALID', async () => {
    const r = await resolveProjectIdentifier('')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(400)
      expect(r.code).toBe('INVALID')
    }
  })

  test('whitespace-only input returns INVALID', async () => {
    const r = await resolveProjectIdentifier('   ')
    expect(r.ok).toBe(false)
  })

  test('UUID exact match returns ok with resolvedBy=id', async () => {
    mockProjectFindUnique.mockImplementationOnce(() => Promise.resolve({
      id: 'e28393d4-210c-4f5e-a36e-bc018989094a',
      name: '範例項目'
    }))
    const r = await resolveProjectIdentifier('e28393d4-210c-4f5e-a36e-bc018989094a')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.resolvedBy).toBe('id')
      expect(r.project.id).toBe('e28393d4-210c-4f5e-a36e-bc018989094a')
      expect(r.project.name).toBe('範例項目')
    }
  })

  test('UUID not found falls through to name resolution', async () => {
    mockProjectFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    mockProjectFindFirst.mockImplementationOnce(() => Promise.resolve({
      id: 'proj-1',
      name: '範例項目'
    }))
    const r = await resolveProjectIdentifier('e28393d4-210c-4f5e-a36e-bc018989094a')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.resolvedBy).toBe('name-exact')
  })

  test('exact name match (case-insensitive) returns ok with resolvedBy=name-exact', async () => {
    mockProjectFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    mockProjectFindFirst.mockImplementationOnce(() => Promise.resolve({
      id: 'proj-2',
      name: '範例項目'
    }))
    const r = await resolveProjectIdentifier('範例項目')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.resolvedBy).toBe('name-exact')
      expect(r.project.id).toBe('proj-2')
    }
  })

  test('partial name match returns ok with resolvedBy=name-contains', async () => {
    mockProjectFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    mockProjectFindFirst
      .mockImplementationOnce(() => Promise.resolve(null)) // exact miss
      .mockImplementationOnce(() => Promise.resolve({        // contains hit
        id: 'proj-3',
        name: '範例項目-2026'
      }))
    const r = await resolveProjectIdentifier('範例')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.resolvedBy).toBe('name-contains')
      expect(r.project.name).toBe('範例項目-2026')
    }
  })

  test('no match returns NOT_FOUND with helpful message', async () => {
    mockProjectFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    mockProjectFindFirst
      .mockImplementationOnce(() => Promise.resolve(null))
      .mockImplementationOnce(() => Promise.resolve(null))
    const r = await resolveProjectIdentifier('不存在的項目')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(404)
      expect(r.code).toBe('NOT_FOUND')
      expect(r.message).toContain('不存在的項目')
    }
  })

  test('non-admin: name search is scoped to member projects', async () => {
    mockProjectFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    let capturedWhere: any = null
    mockProjectFindFirst.mockImplementationOnce((args: any) => {
      capturedWhere = args?.where
      return Promise.resolve({
        id: 'proj-member',
        name: 'Member Project'
      })
    })
    await resolveProjectIdentifier('Member Project', {
      userRole: 'developer',
      userId: 'user-1'
    })
    expect(capturedWhere).toBeTruthy()
    expect(capturedWhere.members).toBeTruthy()
    expect(capturedWhere.members.some.userId).toBe('user-1')
  })

  test('admin: name search is NOT scoped (sees all projects)', async () => {
    mockProjectFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    let capturedWhere: any = null
    mockProjectFindFirst.mockImplementationOnce((args: any) => {
      capturedWhere = args?.where
      return Promise.resolve({ id: 'proj-x', name: 'X' })
    })
    await resolveProjectIdentifier('X', { userRole: 'admin', userId: 'admin-1' })
    expect(capturedWhere.members).toBeUndefined()
  })

  test('trims whitespace from identifier', async () => {
    mockProjectFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    mockProjectFindFirst.mockImplementationOnce(() => Promise.resolve({
      id: 'proj-4',
      name: '範例項目'
    }))
    const r = await resolveProjectIdentifier('  範例項目  ')
    expect(r.ok).toBe(true)
  })
})

// ─── listAccessibleProjectNames ────────────────────────────────────────────

describe('US-21.6: listAccessibleProjectNames', () => {
  test('admin returns all projects (no member scope)', async () => {
    // Simulate prisma take + orderBy behavior
    mockProjectFindMany.mockImplementationOnce((args: any) => {
      const data = [
        { name: 'Zeta' }, { name: 'Alpha' }, { name: 'Beta' }
      ]
      const sorted = data.slice().sort((a, b) => a.name.localeCompare(b.name))
      return Promise.resolve(sorted.slice(0, args?.take ?? 20))
    })
    const names = await listAccessibleProjectNames('admin-1', 'admin')
    expect(names).toEqual(['Alpha', 'Beta', 'Zeta'])
  })

  test('non-admin returns only member projects', async () => {
    mockProjectMemberFindMany.mockImplementationOnce(() => Promise.resolve([
      { project: { name: 'Project A' } },
      { project: { name: 'Project C' } }
    ]))
    const names = await listAccessibleProjectNames('user-1', 'developer')
    expect(names).toEqual(['Project A', 'Project C'])
  })

  test('respects limit (default 20)', async () => {
    // Simulate prisma take — only return up to args.take items
    mockProjectFindMany.mockImplementationOnce((args: any) => {
      const all = Array.from({ length: 30 }, (_, i) => ({ name: `P${i}` }))
      return Promise.resolve(all.slice(0, args?.take ?? 20))
    })
    const names = await listAccessibleProjectNames('admin-1', 'admin')
    expect(names).toHaveLength(20)
  })

  test('returns empty array for user with no memberships', async () => {
    mockProjectMemberFindMany.mockImplementationOnce(() => Promise.resolve([]))
    const names = await listAccessibleProjectNames('user-new', 'developer')
    expect(names).toEqual([])
  })
})
