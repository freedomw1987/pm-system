import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'

const requirementRoutes = new Elysia({ prefix: '/requirements' })
  // Get all requirements (filtered by project access)
  .get('/', async ({ user }) => {
    if (!user) {
      return { requirements: [] }
    }

    const canViewRequirements = hasPermission(user, 'requirements.view') || user.role === 'admin' || user.role === 'pm'
    const projectIds = canViewRequirements
      ? await prisma.project.findMany({ select: { id: true } }).then(r => r.map(p => p.id))
      : await prisma.projectMember.findMany({
          where: { userId: user.id },
          select: { projectId: true }
        }).then(r => r.map(m => m.projectId))

    const requirements = await prisma.requirement.findMany({
      where: { projectId: { in: projectIds } },
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { tasks: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return { requirements }
  })
  // Get single requirement
  .get('/:id', async ({ params, set, user }) => {
    const requirement = await prisma.requirement.findUnique({
      where: { id: params.id },
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } }
      }
    })

    if (!requirement) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Requirement not found' } }
    }

    if (!user) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'requirements.view' is required" } }
    }

    const membership = await prisma.projectMember.findFirst({
      where: { projectId: requirement.projectId, userId: user.id }
    })

    if (!hasPermission(user, 'requirements.view') && user.role !== 'admin' && user.role !== 'pm' && !membership) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'requirements.view' is required" } }
    }

    return { requirement }
  })
  // Create requirement
  .post('/', async ({ body, set, user }) => {
    const { projectId, title, description, priority } = body as { projectId: string; title: string; description?: string; priority?: string }

    if (!user) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Only PM or Admin can create requirements' } }
    }

    // Check permission (requirements.create permission, PM/Admin role, or project PM membership)
    const membership = await prisma.projectMember.findFirst({
      where: { projectId, userId: user.id }
    })

    if (!hasPermission(user, 'requirements.create') && user.role !== 'admin' && user.role !== 'pm' && (!membership || membership.role !== 'pm')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Only PM or Admin can create requirements' } }
    }

    const requirement = await prisma.requirement.create({
      data: {
        projectId,
        title,
        description,
        priority: priority || 'medium',
        createdById: user.id
      },
      include: {
        createdBy: { select: { id: true, name: true } }
      }
    })

    return { requirement }
  }, {
    body: t.Object({
      projectId: t.String(),
      title: t.String(),
      description: t.Optional(t.String()),
      priority: t.Optional(t.String())
    })
  })
  // Update requirement
  .put('/:id', async ({ params, body, set, user }) => {
    const { title, description, status, priority } = body as { title?: string; description?: string; status?: string; priority?: string }

    const existing = await prisma.requirement.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Requirement not found' } }
    }

    if (!user) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    // Check permission (requirements.edit permission, PM/Admin role, or project PM/Tech Lead membership)
    const membership = await prisma.projectMember.findFirst({
      where: { projectId: existing.projectId, userId: user.id }
    })

    if (!hasPermission(user, 'requirements.edit') &&
        user.role !== 'admin' &&
        user.role !== 'pm' &&
        (!membership || !['pm', 'tech_lead'].includes(membership.role))) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const requirement = await prisma.requirement.update({
      where: { id: params.id },
      data: { title, description, status, priority },
      include: { createdBy: { select: { id: true, name: true } } }
    })

    return { requirement }
  })
  // Delete requirement
  .delete('/:id', async ({ params, set, user }) => {
    const existing = await prisma.requirement.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Requirement not found' } }
    }

    if (!user) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Only PM or Admin can delete requirements' } }
    }

    // Check permission (requirements.delete permission, PM/Admin role, or project PM membership)
    const membership = await prisma.projectMember.findFirst({
      where: { projectId: existing.projectId, userId: user.id }
    })

    if (!hasPermission(user, 'requirements.delete') && user.role !== 'admin' && user.role !== 'pm' && (!membership || membership.role !== 'pm')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Only PM or Admin can delete requirements' } }
    }

    await prisma.requirement.delete({ where: { id: params.id } })
    return { success: true }
  })

export { requirementRoutes }
