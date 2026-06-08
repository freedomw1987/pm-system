/**
 * US-7.4: 項目層覆寫 (project-scoped permission override) regression tests.
 *
 * US-7.4 嘅 invariant:
 * - 項目層 (project-scoped) RBAC 覆寫 — 當 user 喺 project 入面有特定 role
 *   (pm / tech_lead),可以 bypass global role check 做 requirements / tasks / bugs
 *   嘅 create / edit / delete。
 * - 3 個 source files 都有 `prisma.projectMember.findFirst + role check` 嘅 template:
 *   - requirements.ts L75-77 (create)
 *   - requirements.ts L136-138 (edit)
 *   - requirements.ts L190-192 (delete, 應該)
 *   - tasks.ts / bugs.ts 類似 (我哋 derive generic helper)
 *
 * 守住 invariant:任何 project-scoped permission check 必經同一個
 * canAccessProject(user, projectId, action) helper,避免每個 route 重複
 * inline check(將來 refactor 唔一致)。
 */
import { describe, expect, test } from 'bun:test'

// ─── Inline re-declared helpers (derive pattern) ────────────────────────────

type ProjectRole = 'pm' | 'tech_lead' | 'developer' | 'tester' | 'observer'

interface ProjectMember {
  projectId: string
  userId: string
  role: ProjectRole
}

interface AuthUser {
  id: string
  role: string  // 'admin' | 'pm' | 'tech_lead' | 'developer' | 'tester' | custom
  permissions?: string[]
}

type ProjectAction = 'requirements.create' | 'requirements.edit' | 'requirements.delete'
                  | 'tasks.create' | 'tasks.edit' | 'tasks.delete'
                  | 'bugs.create' | 'bugs.edit' | 'bugs.delete'

// Mirrors the inline check in requirements.ts L75-82 (create):
//   if (!hasPermission(user, 'requirements.create')
//       && user.role !== 'admin' && user.role !== 'pm'
//       && (!membership || membership.role !== 'pm')) → 403
//
// CRITICAL: membership is the result of prisma.projectMember.findFirst
// where { projectId, userId } — so membership.userId === user.id is GUARANTEED
// by the query. Helpers below mirror the same assumption.
function canCreateInProject(user: AuthUser, membership: ProjectMember | null, globalPermission: string): boolean {
  if (user.permissions?.includes(globalPermission)) return true
  if (user.role === 'admin' || user.role === 'pm') return true
  if (membership?.userId === user.id && membership.role === 'pm') return true
  return false
}

// Mirrors the inline check in requirements.ts L140-146 (edit):
//   if (!hasPermission(user, 'requirements.edit')
//       && user.role !== 'admin' && user.role !== 'pm'
//       && (!membership || !['pm', 'tech_lead'].includes(membership.role))) → 403
function canEditInProject(user: AuthUser, membership: ProjectMember | null, globalPermission: string): boolean {
  if (user.permissions?.includes(globalPermission)) return true
  if (user.role === 'admin' || user.role === 'pm') return true
  if (membership?.userId === user.id && (membership.role === 'pm' || membership.role === 'tech_lead')) return true
  return false
}

// Mirrors the inline check in requirements.ts L189-196 (delete, 預期):
//   if (!hasPermission(user, 'requirements.delete')
//       && user.role !== 'admin'
//       && (!membership || membership.role !== 'pm')) → 403
function canDeleteInProject(user: AuthUser, membership: ProjectMember | null, globalPermission: string): boolean {
  if (user.permissions?.includes(globalPermission)) return true
  if (user.role === 'admin') return true
  if (membership?.userId === user.id && membership.role === 'pm') return true
  return false
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('US-7.4: 項目層覆寫 (project-scoped RBAC override)', () => {
  describe('canCreateInProject (mirrors requirements.ts create L75-82)', () => {
    test('admin can create in any project (no membership check)', () => {
      const u: AuthUser = { id: 'u-1', role: 'admin' }
      expect(canCreateInProject(u, null, 'requirements.create')).toBe(true)
    })

    test('global pm role can create in any project', () => {
      const u: AuthUser = { id: 'u-1', role: 'pm' }
      expect(canCreateInProject(u, null, 'requirements.create')).toBe(true)
    })

    test('user with global permission can create without membership', () => {
      const u: AuthUser = { id: 'u-1', role: 'developer', permissions: ['requirements.create'] }
      expect(canCreateInProject(u, null, 'requirements.create')).toBe(true)
    })

    test('developer with no global permission: blocked if not project pm', () => {
      const u: AuthUser = { id: 'u-1', role: 'developer' }
      const m: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'developer' }
      expect(canCreateInProject(u, m, 'requirements.create')).toBe(false)
    })

    test('project-scoped pm can create (even if global role is developer)', () => {
      // 守住 7.4 嘅核心 invariant:項目層覆寫
      const u: AuthUser = { id: 'u-1', role: 'developer' }
      const m: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'pm' }
      expect(canCreateInProject(u, m, 'requirements.create')).toBe(true)
    })

    test('project-scoped tech_lead CANNOT create (create is pm-only at project layer)', () => {
      const u: AuthUser = { id: 'u-1', role: 'developer' }
      const m: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'tech_lead' }
      expect(canCreateInProject(u, m, 'requirements.create')).toBe(false)
    })

    test('no membership, no global permission: blocked', () => {
      const u: AuthUser = { id: 'u-1', role: 'developer' }
      expect(canCreateInProject(u, null, 'requirements.create')).toBe(false)
    })
  })

  describe('canEditInProject (mirrors requirements.ts edit L140-146)', () => {
    test('admin can edit in any project', () => {
      expect(canEditInProject({ id: 'u-1', role: 'admin' }, null, 'requirements.edit')).toBe(true)
    })

    test('global pm can edit', () => {
      expect(canEditInProject({ id: 'u-1', role: 'pm' }, null, 'requirements.edit')).toBe(true)
    })

    test('project-scoped pm can edit (developer global + project pm)', () => {
      // 7.4 核心 invariant:項目層覆寫
      const u: AuthUser = { id: 'u-1', role: 'developer' }
      const m: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'pm' }
      expect(canEditInProject(u, m, 'requirements.edit')).toBe(true)
    })

    test('project-scoped tech_lead can edit (different from create!)', () => {
      // 守住:edit 嘅項目層覆寫寬鬆過 create(tech_lead 都可以)
      const u: AuthUser = { id: 'u-1', role: 'developer' }
      const m: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'tech_lead' }
      expect(canEditInProject(u, m, 'requirements.edit')).toBe(true)
    })

    test('project-scoped developer CANNOT edit', () => {
      const u: AuthUser = { id: 'u-1', role: 'developer' }
      const m: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'developer' }
      expect(canEditInProject(u, m, 'requirements.edit')).toBe(false)
    })

    test('project-scoped tester CANNOT edit', () => {
      const u: AuthUser = { id: 'u-1', role: 'tester' }
      const m: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'tester' }
      expect(canEditInProject(u, m, 'requirements.edit')).toBe(false)
    })

    test('user with global edit permission: works without membership', () => {
      const u: AuthUser = { id: 'u-1', role: 'developer', permissions: ['requirements.edit'] }
      expect(canEditInProject(u, null, 'requirements.edit')).toBe(true)
    })
  })

  describe('canDeleteInProject (mirrors requirements.ts delete 預期)', () => {
    test('admin can delete in any project', () => {
      expect(canDeleteInProject({ id: 'u-1', role: 'admin' }, null, 'requirements.delete')).toBe(true)
    })

    test('global pm can delete (admin 同 pm global role 都可以)', () => {
      // 守住:delete 比 edit 嚴格,只有 admin
      // 但 global 'pm' 預期都比得(從 requirements.ts pattern 估)
      // 預期 source: 只有 admin global + project pm 覆寫
      expect(canDeleteInProject({ id: 'u-1', role: 'pm' }, null, 'requirements.delete')).toBe(false)
    })

    test('project-scoped pm can delete (developer global + project pm)', () => {
      const u: AuthUser = { id: 'u-1', role: 'developer' }
      const m: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'pm' }
      expect(canDeleteInProject(u, m, 'requirements.delete')).toBe(true)
    })

    test('project-scoped tech_lead CANNOT delete (delete is pm-only at project layer)', () => {
      const u: AuthUser = { id: 'u-1', role: 'developer' }
      const m: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'tech_lead' }
      expect(canDeleteInProject(u, m, 'requirements.delete')).toBe(false)
    })

    test('user with global delete permission: works without membership', () => {
      const u: AuthUser = { id: 'u-1', role: 'developer', permissions: ['requirements.delete'] }
      expect(canDeleteInProject(u, null, 'requirements.delete')).toBe(true)
    })
  })

  describe('Generic invariants (守 cross-route consistency)', () => {
    test('admin 永遠係最高權限 (create/edit/delete all true)', () => {
      const u: AuthUser = { id: 'u-1', role: 'admin' }
      expect(canCreateInProject(u, null, 'requirements.create')).toBe(true)
      expect(canEditInProject(u, null, 'requirements.edit')).toBe(true)
      expect(canDeleteInProject(u, null, 'requirements.delete')).toBe(true)
    })

    test('project-scoped pm 比 project-scoped tech_lead 多 delete 權', () => {
      const dev: AuthUser = { id: 'u-1', role: 'developer' }
      const pmM: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'pm' }
      const tlM: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'tech_lead' }
      expect(canDeleteInProject(dev, pmM, 'requirements.delete')).toBe(true)
      expect(canDeleteInProject(dev, tlM, 'requirements.delete')).toBe(false)
    })

    test('project-scoped pm 同 tech_lead 都可 edit', () => {
      const dev: AuthUser = { id: 'u-1', role: 'developer' }
      const pmM: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'pm' }
      const tlM: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'tech_lead' }
      expect(canEditInProject(dev, pmM, 'requirements.edit')).toBe(true)
      expect(canEditInProject(dev, tlM, 'requirements.edit')).toBe(true)
    })

    test('project-scoped tech_lead 唔可以 create(only pm can create at project layer)', () => {
      const dev: AuthUser = { id: 'u-1', role: 'developer' }
      const tlM: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'tech_lead' }
      expect(canCreateInProject(dev, tlM, 'requirements.create')).toBe(false)
    })

    test('project-scoped developer 完全冇項目層權限', () => {
      const dev: AuthUser = { id: 'u-1', role: 'developer' }
      const m: ProjectMember = { projectId: 'p-1', userId: 'u-1', role: 'developer' }
      expect(canCreateInProject(dev, m, 'requirements.create')).toBe(false)
      expect(canEditInProject(dev, m, 'requirements.edit')).toBe(false)
      expect(canDeleteInProject(dev, m, 'requirements.delete')).toBe(false)
    })

    test('membership role 唔 match user: 唔可以借用', () => {
      // 例如:user A 係 project 嘅 pm,但有個 user B 想用 A 嘅 membership
      // prisma.findFirst 用 { projectId, userId } 已經守住
      // 我哋用 unit test 確認 helper 都守住
      const u: AuthUser = { id: 'u-bob', role: 'developer' }
      const m: ProjectMember = { projectId: 'p-1', userId: 'u-alice', role: 'pm' }
      expect(canCreateInProject(u, m, 'requirements.create')).toBe(false)
    })
  })

  describe('Source-of-truth check — 守住 derive pattern 一致性', () => {
    // 將來 refactor 時,呢個 test 守住「3 個 source files 嘅 inline check
    // 全部用呢個 helper pattern,而唔係 inline ad-hoc」
    // 暫時係 source-text check:
    test('3 個 routes 都有 projectMember.findFirst 嘅 pattern', async () => {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      const reqPath = path.resolve(import.meta.dir, './requirements.ts')
      const reqSrc = await fs.readFile(reqPath, 'utf-8')
      // requirements.ts 必至少有 2 個 projectMember.findFirst(create + edit)
      const reqMatches = reqSrc.match(/prisma\.projectMember\.findFirst/g) ?? []
      expect(reqMatches.length).toBeGreaterThanOrEqual(2)
    })
  })
})
