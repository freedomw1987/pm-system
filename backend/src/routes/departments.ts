import { Elysia, t } from 'elysia'

const DEFAULT_DEPARTMENTS = [
  '研發部',
  '產品部',
  '測試部',
  '業務部',
]

let departmentsSeeded = false

async function seedDepartments(prisma: any) {
  if (!departmentsSeeded) {
    for (const name of DEFAULT_DEPARTMENTS) {
      await prisma.department.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    }
    departmentsSeeded = true
  }
}

function requireAdmin(user: { role?: string } | null | undefined, set: any) {
  if (user?.role !== 'admin') {
    set.status = 403
    return { error: { code: 'FORBIDDEN', message: 'Admin access required' } }
  }
  return null
}

const departmentRoutes = new Elysia()
  .get('/departments', async ({ set, user }) => {
    // Allow any authenticated user to view departments (for project creation)
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Login required' } }
    }

    const { prisma } = await import('../utils/prisma')
    await seedDepartments(prisma)

    const departments = await prisma.department.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    })

    return {
      departments: departments.map(d => ({
        id: d.id,
        name: d.name,
        userCount: d._count.users,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }))
    }
  })
  .get('/departments/:id', async ({ params, set, user }) => {
    const forbidden = requireAdmin(user, set)
    if (forbidden) return forbidden

    const { prisma } = await import('../utils/prisma')
    const department = await prisma.department.findUnique({
      where: { id: params.id },
      include: { _count: { select: { users: true } } },
    })
    if (!department) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Department not found' } }
    }
    return {
      department: {
        id: department.id,
        name: department.name,
        userCount: department._count.users,
        createdAt: department.createdAt,
        updatedAt: department.updatedAt,
      }
    }
  })
  .post('/departments', async ({ body, set, user }) => {
    const forbidden = requireAdmin(user, set)
    if (forbidden) return forbidden

    const { prisma } = await import('../utils/prisma')
    await seedDepartments(prisma)

    const { name } = body as { name: string }
    const trimmed = name.trim()
    if (!trimmed) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: '部門名稱不能為空' } }
    }

    const existing = await prisma.department.findUnique({ where: { name: trimmed } })
    if (existing) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: '部門名稱已存在' } }
    }

    const department = await prisma.department.create({
      data: { name: trimmed },
    })

    return { department: { id: department.id, name: department.name, userCount: 0 } }
  }, {
    body: t.Object({ name: t.String({ minLength: 1 }) })
  })
  .put('/departments/:id', async ({ params, body, set, user }) => {
    const forbidden = requireAdmin(user, set)
    if (forbidden) return forbidden

    const { prisma } = await import('../utils/prisma')
    await seedDepartments(prisma)

    const { name } = body as { name?: string }
    const existing = await prisma.department.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Department not found' } }
    }

    const data: { name?: string } = {}
    if (name !== undefined) {
      const trimmed = name.trim()
      if (!trimmed) {
        set.status = 400
        return { error: { code: 'VALIDATION_ERROR', message: '部門名稱不能為空' } }
      }
      data.name = trimmed
    }

    if (Object.keys(data).length === 0) {
      return { department: { id: existing.id, name: existing.name } }
    }

    try {
      const updated = await prisma.department.update({
        where: { id: params.id },
        data,
        include: { _count: { select: { users: true } } },
      })
      return {
        department: {
          id: updated.id,
          name: updated.name,
          userCount: updated._count.users,
        }
      }
    } catch (error: any) {
      if (error?.code === 'P2002') {
        set.status = 400
        return { error: { code: 'VALIDATION_ERROR', message: '部門名稱已存在' } }
      }
      throw error
    }
  }, {
    body: t.Object({ name: t.Optional(t.String({ minLength: 1 })) })
  })
  .delete('/departments/:id', async ({ params, set, user }) => {
    const forbidden = requireAdmin(user, set)
    if (forbidden) return forbidden

    const { prisma } = await import('../utils/prisma')
    await seedDepartments(prisma)

    const existing = await prisma.department.findUnique({
      where: { id: params.id },
      include: { _count: { select: { users: true } } },
    })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Department not found' } }
    }

    if (existing._count.users > 0) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: `尚有 ${existing._count.users} 位用戶屬於此部門，無法刪除` } }
    }

    await prisma.department.delete({ where: { id: params.id } })
    return { success: true }
  })

export { departmentRoutes, seedDepartments }