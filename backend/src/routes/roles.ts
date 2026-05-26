import { Elysia, t } from 'elysia'
import { rolePermissionCache } from '../middleware/permission'

const DEFAULT_PERMISSIONS = [
  { key: 'projects.view', name: '項目視圖', category: '項目管理' },
  { key: 'projects.create', name: '項目創建', category: '項目管理' },
  { key: 'projects.edit', name: '項目編輯', category: '項目管理' },
  { key: 'projects.delete', name: '項目刪除', category: '項目管理' },

  { key: 'requirements.view', name: '需求視圖', category: '需求管理' },
  { key: 'requirements.create', name: '需求創建', category: '需求管理' },
  { key: 'requirements.edit', name: '需求編輯', category: '需求管理' },
  { key: 'requirements.delete', name: '需求刪除', category: '需求管理' },

  { key: 'tasks.view', name: '任務視圖', category: '任務管理' },
  { key: 'tasks.create', name: '任務創建', category: '任務管理' },
  { key: 'tasks.edit', name: '任務編輯', category: '任務管理' },
  { key: 'tasks.delete', name: '任務刪除', category: '任務管理' },
  { key: 'tasks.assign', name: '任務分配', category: '任務管理' },
  { key: 'tasks.claim', name: '任務認領', category: '任務管理' },

  { key: 'bugs.view', name: '缺陷視圖', category: '缺陷管理' },
  { key: 'bugs.create', name: '缺陷創建', category: '缺陷管理' },
  { key: 'bugs.edit', name: '缺陷編輯', category: '缺陷管理' },
  { key: 'bugs.delete', name: '缺陷刪除', category: '缺陷管理' },
  { key: 'bugs.resolve', name: '缺陷解決', category: '缺陷管理' },

  { key: 'worklogs.view', name: '工時視圖', category: '工時管理' },
  { key: 'worklogs.create', name: '工時創建', category: '工時管理' },
  { key: 'worklogs.edit', name: '工時編輯', category: '工時管理' },
  { key: 'worklogs.delete', name: '工時刪除', category: '工時管理' },
  { key: 'worklogs.export', name: '工時匯出', category: '工時管理' },

  { key: 'reports.view', name: '報表視圖', category: '報表管理' },
  { key: 'reports.export', name: '報表匯出', category: '報表管理' },

  { key: 'users.view', name: '用戶視圖', category: '用戶管理' },
  { key: 'users.create', name: '用戶創建', category: '用戶管理' },
  { key: 'users.edit', name: '用戶編輯', category: '用戶管理' },
  { key: 'users.delete', name: '用戶刪除', category: '用戶管理' },
  { key: 'users.assign_roles', name: '分配角色', category: '用戶管理' },

  { key: 'roles.view', name: '角色視圖', category: '角色權限' },
  { key: 'roles.create', name: '角色創建', category: '角色權限' },
  { key: 'roles.edit', name: '角色編輯', category: '角色權限' },
  { key: 'roles.delete', name: '角色刪除', category: '角色權限' },

  { key: 'agents.view', name: 'Agent 視圖', category: 'Agent 管理' },
  { key: 'agents.create', name: 'Agent 創建', category: 'Agent 管理' },
  { key: 'agents.edit', name: 'Agent 編輯', category: 'Agent 管理' },
  { key: 'agents.delete', name: 'Agent 刪除', category: 'Agent 管理' },

  { key: 'tokenlogs.view', name: 'Token 日誌視圖', category: 'Token 管理' },
  { key: 'tokenlogs.create', name: 'Token 日誌創建', category: 'Token 管理' },
]

const allPermissions = DEFAULT_PERMISSIONS.map((permission) => permission.key)
const permissionsStartingWith = (prefix: string) =>
  allPermissions.filter((permission) => permission.startsWith(prefix))

const DEFAULT_ROLES = [
  {
    name: 'admin',
    description: '系統管理員，可管理所有模組與權限',
    permissions: allPermissions,
    isBuiltIn: true,
  },
  {
    name: 'pm',
    description: '項目經理，可管理項目、需求、任務、缺陷、工時與報表',
    permissions: [
      ...permissionsStartingWith('projects.'),
      ...permissionsStartingWith('requirements.'),
      ...permissionsStartingWith('tasks.'),
      'bugs.view',
      'bugs.create',
      'bugs.edit',
      ...permissionsStartingWith('worklogs.'),
      ...permissionsStartingWith('reports.'),
    ],
    isBuiltIn: true,
  },
  {
    name: 'tech_lead',
    description: '技術主管，可管理任務、缺陷與工時',
    permissions: [
      ...permissionsStartingWith('tasks.'),
      ...permissionsStartingWith('bugs.'),
      ...permissionsStartingWith('worklogs.'),
    ],
    isBuiltIn: true,
  },
  {
    name: 'developer',
    description: '開發人員，可處理任務、缺陷與個人工時',
    permissions: [
      'tasks.view',
      'tasks.create',
      'tasks.edit',
      'bugs.view',
      'bugs.create',
      'bugs.edit',
      'worklogs.view',
      'worklogs.create',
    ],
    isBuiltIn: true,
  },
  {
    name: 'tester',
    description: '測試人員，可回報與編輯缺陷並填寫工時',
    permissions: [
      'bugs.view',
      'bugs.create',
      'bugs.edit',
      'worklogs.view',
      'worklogs.create',
    ],
    isBuiltIn: true,
  },
]

let permissionsSeeded = false

async function seedRolePermissions(prisma: any) {
  // Seed permissions only once per process lifetime
  if (!permissionsSeeded) {
    await Promise.all(
      DEFAULT_PERMISSIONS.map((permission) =>
        prisma.permission.upsert({
          where: { key: permission.key },
          update: {
            name: permission.name,
            category: permission.category,
          },
          create: permission,
        })
      )
    )
    permissionsSeeded = true
  }

  await Promise.all(
    DEFAULT_ROLES.map((role) =>
      prisma.role.upsert({
        where: { name: role.name },
        update: {
          description: role.description,
          permissions: role.permissions,
          isBuiltIn: true,
        },
        create: role,
      })
    )
  )
}

function requireAdmin(user: { role?: string } | null | undefined, set: any) {
  if (user?.role !== 'admin') {
    set.status = 403
    return { error: { code: 'FORBIDDEN', message: 'Admin access required' } }
  }

  return null
}

function normalizePermissions(permissions: unknown, validPermissionKeys: Set<string>) {
  if (!Array.isArray(permissions)) return []

  return Array.from(
    new Set(
      permissions
        .filter((permission): permission is string => typeof permission === 'string')
        .filter((permission) => validPermissionKeys.has(permission))
    )
  )
}

const roleRoutes = new Elysia()
  .get('/permissions', async ({ set, user }) => {
    const forbidden = requireAdmin(user, set)
    if (forbidden) return forbidden

    const { prisma } = await import('../utils/prisma')
    await seedRolePermissions(prisma)

    const permissions = await prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    })

    return { permissions }
  })
  .group('/roles', (app) =>
    app
      .get('/', async ({ set, user }) => {
        const forbidden = requireAdmin(user, set)
        if (forbidden) return forbidden

        const { prisma } = await import('../utils/prisma')
        await seedRolePermissions(prisma)

        const roles = await prisma.role.findMany({
          orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
        })

        return { roles }
      })
      .post(
        '/',
        async ({ body, set, user }) => {
          const forbidden = requireAdmin(user, set)
          if (forbidden) return forbidden

          const { name, description, permissions } = body as {
            name: string
            description?: string
            permissions?: string[]
          }

          const { prisma } = await import('../utils/prisma')
          await seedRolePermissions(prisma)

          const normalizedName = name.trim()
          if (!normalizedName) {
            set.status = 400
            return { error: { code: 'VALIDATION_ERROR', message: 'Role name is required' } }
          }

          const existing = await prisma.role.findUnique({ where: { name: normalizedName } })
          if (existing) {
            set.status = 400
            return { error: { code: 'VALIDATION_ERROR', message: 'Role name already exists' } }
          }

          const validPermissions = new Set(
            (await prisma.permission.findMany({ select: { key: true } })).map((permission: { key: string }) => permission.key)
          )
          const role = await prisma.role.create({
            data: {
              name: normalizedName,
              description: description?.trim() || null,
              permissions: normalizePermissions(permissions, validPermissions),
              isBuiltIn: false,
            },
          })
          // Invalidate cache for this role
          rolePermissionCache.delete(normalizedName)
          // Refresh all roles so admin permissions are up-to-date
          const { refreshAllRolePermissions } = await import('../index')
          await refreshAllRolePermissions()

          return { role }
        },
        {
          body: t.Object({
            name: t.String({ minLength: 1 }),
            description: t.Optional(t.String()),
            permissions: t.Optional(t.Array(t.String())),
          }),
        }
      )
      .put(
        '/:id',
        async ({ params, body, set, user }) => {
          const forbidden = requireAdmin(user, set)
          if (forbidden) return forbidden

          const { name, description, permissions } = body as {
            name?: string
            description?: string | null
            permissions?: string[]
          }

          const { prisma } = await import('../utils/prisma')
          await seedRolePermissions(prisma)

          const existing = await prisma.role.findUnique({ where: { id: params.id } })
          if (!existing) {
            set.status = 404
            return { error: { code: 'NOT_FOUND', message: 'Role not found' } }
          }

          const validPermissions = new Set(
            (await prisma.permission.findMany({ select: { key: true } })).map((permission: { key: string }) => permission.key)
          )
          const data: { name?: string; description?: string | null; permissions?: string[] } = {}

          if (name !== undefined) {
            const normalizedName = name.trim()
            if (!normalizedName) {
              set.status = 400
              return { error: { code: 'VALIDATION_ERROR', message: 'Role name is required' } }
            }
            data.name = normalizedName
          }
          if (description !== undefined) data.description = description?.trim() || null
          if (permissions !== undefined) data.permissions = normalizePermissions(permissions, validPermissions)

          try {
            const role = await prisma.role.update({
              where: { id: params.id },
              data,
            })
            // Invalidate cache so next request re-loads from DB
            if (role.name) rolePermissionCache.delete(role.name)
            // Also invalidate old name if it changed
            if (existing.name !== role.name) rolePermissionCache.delete(existing.name)
            // Refresh all roles so admin permissions are up-to-date
            const { refreshAllRolePermissions } = await import('../index')
            await refreshAllRolePermissions()
            return { role }
          } catch (error: any) {
            if (error?.code === 'P2002') {
              set.status = 400
              return { error: { code: 'VALIDATION_ERROR', message: 'Role name already exists' } }
            }
            throw error
          }
        },
        {
          body: t.Object({
            name: t.Optional(t.String({ minLength: 1 })),
            description: t.Optional(t.Nullable(t.String())),
            permissions: t.Optional(t.Array(t.String())),
          }),
        }
      )
      .delete('/:id', async ({ params, set, user }) => {
        const forbidden = requireAdmin(user, set)
        if (forbidden) return forbidden

        const { prisma } = await import('../utils/prisma')
        await seedRolePermissions(prisma)

        const role = await prisma.role.findUnique({ where: { id: params.id } })
        if (!role) {
          set.status = 404
          return { error: { code: 'NOT_FOUND', message: 'Role not found' } }
        }

        if (role.isBuiltIn) {
          set.status = 400
          return { error: { code: 'VALIDATION_ERROR', message: 'Built-in roles cannot be deleted' } }
        }

        await prisma.role.delete({ where: { id: params.id } })

        // Invalidate cache and refresh so admin permissions are up-to-date
        rolePermissionCache.delete(role.name)
        const { refreshAllRolePermissions } = await import('../index')
        await refreshAllRolePermissions()

        return { success: true }
      })
  )

export { roleRoutes, seedRolePermissions }
