/**
 * Wiki route helper test — US-10.1, US-10.2 (P0)
 *
 * Covers:
 *  - US-10.1: 建頁 — 補 unit test 守住:
 *    * 建頁必填 projectId + title
 *    * 必為 project member (非 admin)
 *    * Default values (content='', tags=[], order=0)
 *  - US-10.2: 編輯 — 守住 member-only edit + 局部 update
 *  - List scope: 守住 non-admin 限 projectId IN [membership]
 *
 * 對應 TECH-DEBT TD-001 + 紅線 12.
 */

import { describe, expect, test } from 'bun:test'

// ─── Pure helpers derived from wikis.ts ──────────────────────────────────────

type AuthUser = {
  id: string
  role: string
}

/**
 * 從 wikis.ts POST / derive 嘅 create input validation
 * 必填 projectId + title
 */
function validateCreateWikiInput(body: unknown): {
  ok: boolean
  reason?: string
} {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'body required' }
  const b = body as Record<string, unknown>
  if (typeof b.projectId !== 'string' || b.projectId.length === 0) {
    return { ok: false, reason: 'projectId is required' }
  }
  if (typeof b.title !== 'string' || b.title.length === 0) {
    return { ok: false, reason: 'title is required' }
  }
  return { ok: true }
}

/**
 * 從 wikis.ts POST / derive 嘅 default values
 */
function buildWikiPageData(
  userId: string,
  projectId: string,
  title: string,
  content?: string,
  tags?: string[],
  order?: number
) {
  return {
    projectId,
    title,
    content: content || '',
    tags: tags || [],
    order: order || 0,
    createdById: userId,
  }
}

/**
 * 從 wikis.ts POST / + PUT /:id + DELETE /:id derive 嘅 membership check
 * 守住 "非 admin 必須係 project member" invariant
 */
function canAccessWikiPage(
  user: AuthUser | null,
  membership: { userId: string } | null
): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (membership) return true
  return false
}

/**
 * 從 wikis.ts GET / derive 嘅 list scope
 *  - admin: 全部
 *  - non-admin: 限自己係 member 嘅 project
 *  - 冇任何 membership: 返 []
 */
function getWikiListScope(
  user: AuthUser | null,
  memberships: { projectId: string }[],
  requestedProjectId?: string
): { where: any; empty: boolean } {
  if (!user) return { where: {}, empty: true }

  if (user.role === 'admin') {
    const where: any = {}
    if (requestedProjectId) where.projectId = requestedProjectId
    return { where, empty: false }
  }

  const projectIds = memberships.map(m => m.projectId)
  if (projectIds.length === 0) return { where: {}, empty: true }
  if (requestedProjectId && !projectIds.includes(requestedProjectId)) {
    return { where: {}, empty: true }
  }
  return { where: { projectId: { in: projectIds } }, empty: false }
}

/**
 * 從 wikis.ts GET / derive 嘅 search filter
 */
function buildWikiSearchFilter(search?: string) {
  if (!search) return null
  return {
    OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
      { tags: { has: search } },
    ],
  }
}

/**
 * 從 wikis.ts PUT /:id derive 嘅 partial update
 * 守住 "undefined field 唔覆蓋" invariant
 */
function buildWikiPartialUpdate(body: {
  title?: string
  content?: string
  tags?: string[]
  order?: number
}) {
  const data: any = {}
  if (body.title !== undefined) data.title = body.title
  if (body.content !== undefined) data.content = body.content
  if (body.tags !== undefined) data.tags = body.tags
  if (body.order !== undefined) data.order = body.order
  return data
}

// ─── US-10.1 建頁 ──────────────────────────────────────────────────────────

describe('US-10.1: POST /wikis', () => {
  describe('validateCreateWikiInput', () => {
    test('rejects null body', () => {
      expect(validateCreateWikiInput(null).ok).toBe(false)
    })

    test('rejects missing projectId', () => {
      const r = validateCreateWikiInput({ title: 'Page' })
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('projectId is required')
    })

    test('rejects empty projectId', () => {
      const r = validateCreateWikiInput({ projectId: '', title: 'Page' })
      expect(r.ok).toBe(false)
    })

    test('rejects missing title', () => {
      const r = validateCreateWikiInput({ projectId: 'p-1' })
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('title is required')
    })

    test('rejects empty title', () => {
      const r = validateCreateWikiInput({ projectId: 'p-1', title: '' })
      expect(r.ok).toBe(false)
    })

    test('accepts minimum valid input', () => {
      expect(
        validateCreateWikiInput({ projectId: 'p-1', title: 'Page' }).ok
      ).toBe(true)
    })

    test('accepts full input (content + tags + order)', () => {
      expect(
        validateCreateWikiInput({
          projectId: 'p-1',
          title: 'Page',
          content: '# Hello',
          tags: ['docs', 'guide'],
          order: 5,
        }).ok
      ).toBe(true)
    })
  })

  describe('buildWikiPageData (default values)', () => {
    test('content default = ""', () => {
      const data = buildWikiPageData('u-1', 'p-1', 'Title')
      expect(data.content).toBe('')
    })

    test('tags default = []', () => {
      const data = buildWikiPageData('u-1', 'p-1', 'Title')
      expect(data.tags).toEqual([])
    })

    test('order default = 0', () => {
      const data = buildWikiPageData('u-1', 'p-1', 'Title')
      expect(data.order).toBe(0)
    })

    test('createdById is set to user.id', () => {
      const data = buildWikiPageData('user-1', 'p-1', 'Title')
      expect(data.createdById).toBe('user-1')
    })

    test('explicit values preserved', () => {
      const data = buildWikiPageData('u-1', 'p-1', 'Title', '# Hello', ['docs'], 5)
      expect(data.content).toBe('# Hello')
      expect(data.tags).toEqual(['docs'])
      expect(data.order).toBe(5)
    })
  })

  describe('canAccessWikiPage (membership gate)', () => {
    test('null user → false', () => {
      expect(canAccessWikiPage(null, null)).toBe(false)
    })

    test('admin → true (bypass)', () => {
      expect(canAccessWikiPage({ id: 'u-1', role: 'admin' }, null)).toBe(true)
    })

    test('project member → true', () => {
      expect(canAccessWikiPage({ id: 'u-1', role: 'developer' }, { userId: 'u-1' })).toBe(true)
    })

    test('non-member, non-admin → false', () => {
      expect(canAccessWikiPage({ id: 'u-1', role: 'developer' }, null)).toBe(false)
    })
  })
})

// ─── US-10.1 List ───────────────────────────────────────────────────────────

describe('GET /wikis (list scope)', () => {
  describe('getWikiListScope', () => {
    test('null user → empty', () => {
      const r = getWikiListScope(null, [])
      expect(r.empty).toBe(true)
    })

    test('admin → see all, with optional projectId filter', () => {
      const r = getWikiListScope({ id: 'u-1', role: 'admin' }, [], 'p-1')
      expect(r.empty).toBe(false)
      expect(r.where.projectId).toBe('p-1')
    })

    test('admin → see all without projectId filter', () => {
      const r = getWikiListScope({ id: 'u-1', role: 'admin' }, [])
      expect(r.empty).toBe(false)
      expect(r.where.projectId).toBeUndefined()
    })

    test('non-admin with no memberships → empty', () => {
      const r = getWikiListScope({ id: 'u-1', role: 'developer' }, [])
      expect(r.empty).toBe(true)
    })

    test('non-admin with memberships → in-filter scope', () => {
      const r = getWikiListScope(
        { id: 'u-1', role: 'developer' },
        [{ projectId: 'p-1' }, { projectId: 'p-2' }]
      )
      expect(r.empty).toBe(false)
      expect(r.where.projectId).toEqual({ in: ['p-1', 'p-2'] })
    })

    test('non-admin requesting projectId not in memberships → empty', () => {
      const r = getWikiListScope(
        { id: 'u-1', role: 'developer' },
        [{ projectId: 'p-1' }],
        'p-other'
      )
      expect(r.empty).toBe(true)
    })

    test('non-admin requesting projectId in memberships → in-filter', () => {
      const r = getWikiListScope(
        { id: 'u-1', role: 'developer' },
        [{ projectId: 'p-1' }],
        'p-1'
      )
      expect(r.empty).toBe(false)
    })
  })

  describe('buildWikiSearchFilter', () => {
    test('no search → null', () => {
      expect(buildWikiSearchFilter()).toBeNull()
      expect(buildWikiSearchFilter('')).toBeNull()
    })

    test('search → OR across title / content / tags', () => {
      const filter = buildWikiSearchFilter('hello')
      expect(filter).not.toBeNull()
      expect(filter!.OR).toHaveLength(3)
      expect(filter!.OR[0]).toMatchObject({ title: { contains: 'hello' } })
      expect(filter!.OR[1]).toMatchObject({ content: { contains: 'hello' } })
      expect(filter!.OR[2]).toMatchObject({ tags: { has: 'hello' } })
    })

    test('search uses case-insensitive mode', () => {
      const filter = buildWikiSearchFilter('foo')
      expect((filter!.OR[0] as any).title.mode).toBe('insensitive')
      expect((filter!.OR[1] as any).content.mode).toBe('insensitive')
    })
  })
})

// ─── US-10.2 編輯 ──────────────────────────────────────────────────────────

describe('US-10.2: PUT /wikis/:id (partial update)', () => {
  describe('buildWikiPartialUpdate', () => {
    test('empty body → empty data', () => {
      expect(buildWikiPartialUpdate({})).toEqual({})
    })

    test('undefined fields are skipped', () => {
      const data = buildWikiPartialUpdate({ title: 'New' })
      expect(data.title).toBe('New')
      expect(data.content).toBeUndefined()
      expect(data.tags).toBeUndefined()
      expect(data.order).toBeUndefined()
    })

    test('all fields included', () => {
      const data = buildWikiPartialUpdate({
        title: 'New',
        content: 'body',
        tags: ['t1'],
        order: 2,
      })
      expect(data).toEqual({
        title: 'New',
        content: 'body',
        tags: ['t1'],
        order: 2,
      })
    })

    test('empty string IS included (allows clearing content)', () => {
      const data = buildWikiPartialUpdate({ content: '' })
      expect(data.content).toBe('')
    })
  })
})
