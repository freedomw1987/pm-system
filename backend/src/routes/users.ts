import { Elysia, t } from 'elysia'
import bcrypt from 'bcryptjs'
import { hasPermission } from '../middleware/permission'

const userRoutes = new Elysia({ prefix: '/users' })
  // Get all users (for filter dropdowns)
  .get('/list', async ({ user }) => {
    const { prisma } = await import('../utils/prisma')
    const users = await prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    })
    return { users }
  })
  // Get all users
  .get('/', async ({ set, user }) => {
    if (!hasPermission(user, 'users.view')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'users.view' is required" } }
    }

    const { prisma } = await import('../utils/prisma')
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
        createdAt: true,
        projectMemberships: {
          include: {
            project: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return {
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        departmentId: u.departmentId,
        department: u.department,
        createdAt: u.createdAt,
        projectMemberships: u.projectMemberships.map(m => ({
          projectId: m.project.id,
          projectName: m.project.name,
          role: m.role
        }))
      }))
    }
  })
  // Create user
  .post('/', async ({ body, set, user }) => {
    if (!hasPermission(user, 'users.create')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'users.create' is required" } }
    }

    const { email, name, password, role, departmentId } = body as { email: string; name: string; password: string; role?: string; departmentId?: string }

    const { prisma } = await import('../utils/prisma')

    // Check if email exists
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: 'Email already exists' } }
    }

    // Validate role if provided — only custom roles need to exist in Role table
    const BUILT_IN_ROLES = ['admin', 'pm', 'tech_lead', 'developer', 'tester', 'visitor']
    if (role && !BUILT_IN_ROLES.includes(role)) {
      const roleRecord = await prisma.role.findUnique({ where: { name: role } })
      if (!roleRecord) {
        set.status = 400
        return { error: { code: 'VALIDATION_ERROR', message: 'Invalid role value' } }
      }
    }

    // Validate department if provided
    if (departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: departmentId } })
      if (!dept) {
        set.status = 400
        return { error: { code: 'VALIDATION_ERROR', message: 'Invalid department' } }
      }
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const userRecord = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: role || 'developer',
        departmentId: departmentId || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
        createdAt: true,
      }
    })

    return { user: userRecord }
  }, {
    body: t.Object({
      email: t.String({ format: 'email' }),
      name: t.String(),
      password: t.String({ minLength: 6 }),
      role: t.Optional(t.String()),
      departmentId: t.Optional(t.String())
    })
  })
  // Get user by ID
  .get('/:id', async ({ params, set, user }) => {
    const { prisma } = await import('../utils/prisma')
    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    })

    if (!targetUser) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'User not found' } }
    }

    return { user: targetUser }
  })
  // Update user
  .put('/:id', async ({ params, body, set, user }) => {
    if (!hasPermission(user, 'users.edit')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'users.edit' is required" } }
    }

    const { name, email, password, role, departmentId } = body as { name?: string; email?: string; password?: string; role?: string; departmentId?: string | null }

    const { prisma } = await import('../utils/prisma')

    // Validate role if provided
    const BUILT_IN_ROLES = ['admin', 'pm', 'tech_lead', 'developer', 'tester', 'visitor']
    if (role && !BUILT_IN_ROLES.includes(role)) {
      const roleRecord = await prisma.role.findUnique({ where: { name: role } })
      if (!roleRecord) {
        set.status = 400
        return { error: { code: 'VALIDATION_ERROR', message: 'Invalid role value' } }
      }
    }

    // Validate department if provided (null = remove department)
    if (departmentId !== undefined && departmentId !== null) {
      const dept = await prisma.department.findUnique({ where: { id: departmentId } })
      if (!dept) {
        set.status = 400
        return { error: { code: 'VALIDATION_ERROR', message: 'Invalid department' } }
      }
    }

    const data: { name?: string; email?: string; passwordHash?: string; role?: string; departmentId?: string | null } = {}
    if (name) data.name = name
    if (email) data.email = email
    if (password) data.passwordHash = await bcrypt.hash(password, 10)
    if (role) data.role = role
    if (departmentId !== undefined) data.departmentId = departmentId

    const updated = await prisma.user.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
        createdAt: true,
      }
    })

    return { user: updated }
  })
  // Delete user
  .delete('/:id', async ({ params, set, user }) => {
    if (!hasPermission(user, 'users.delete')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'users.delete' is required" } }
    }

    const { prisma } = await import('../utils/prisma')

    await prisma.user.delete({ where: { id: params.id } })

    return { success: true }
  })

export { userRoutes }