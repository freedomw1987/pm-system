import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'

const projectRoutes = new Elysia({ prefix: '/projects' })
  // Get all projects (filtered by permission)
  .get('/', async ({ user }) => {
    // For admin with users.view OR admin role: all projects
    // For others: only projects where they are a member
    const projects = await prisma.project.findMany({
      where: !user || user.role === 'admin'
        ? {}
        : {
            members: {
              some: { userId: user.id }
            }
          },
      include: {
        _count: {
          select: { members: true, requirements: true }
        },
        owner: { select: { id: true, name: true, email: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return {
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        memberCount: p._count.members,
        createdAt: p.createdAt
      }))
    }
  })
  // Create project (PM or Admin with projects.create)
  .post('/', async ({ body, set, user }) => {
    const { name, description } = body as { name: string; description?: string }

    // Permission check: projects.create OR (admin/pm for backward compat)
    if (!user || (!hasPermission(user, 'projects.create') && user.role !== 'admin' && user.role !== 'pm')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'projects.create' is required" } }
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        createdById: user.id,
        members: {
          create: {
            userId: user.id,
            role: 'pm'
          }
        }
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    })

    return { project }
  }, {
    body: t.Object({
      name: t.String(),
      description: t.Optional(t.String())
    })
  })
  // Get project by ID
  .get('/:id', async ({ params, set, user }) => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        requirements: {
          include: {
            _count: { select: { tasks: true } }
          }
        }
      }
    })

    if (!project) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Project not found' } }
    }

    // Check permission: admin or project member
    if (!user || (user.role !== 'admin' && !project.members.some(m => m.userId === user.id))) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Access denied' } }
    }

    return { project }
  })
  // Get requirements for a project (nested under projects)
  .get('/:id/requirements', async ({ params, user }) => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: { members: true }
    })

    if (!project) {
      return { requirements: [] }
    }

    // Check permission: admin or project member
    if (!user || (user.role !== 'admin' && !project.members.some(m => m.userId === user.id))) {
      return { requirements: [] }
    }

    const requirements = await prisma.requirement.findMany({
      where: { projectId: params.id },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { tasks: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return { requirements }
  })
  // Create requirement under a project (nested under projects)
  .post('/:id/requirements', async ({ params, body, set, user }) => {
    const { title, description } = body as { title: string; description?: string }

    // Check permission: projects.create OR admin/pm for backward compat
    const membership = await prisma.projectMember.findFirst({
      where: { projectId: params.id, userId: user.id }
    })

    if (!user || (!hasPermission(user, 'projects.create') && user.role !== 'admin' && (!membership || membership.role !== 'pm'))) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'projects.create' is required" } }
    }

    const requirement = await prisma.requirement.create({
      data: {
        projectId: params.id,
        title,
        description,
        createdById: user.id
      },
      include: {
        createdBy: { select: { id: true, name: true } }
      }
    })

    return { requirement }
  }, {
    body: t.Object({
      title: t.String(),
      description: t.Optional(t.String())
    })
  })
  // Update project
  .put('/:id', async ({ params, body, set, user }) => {
    const { name, description, status } = body as { name?: string; description?: string; status?: string }

    const existing = await prisma.project.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Project not found' } }
    }

    // Check permission: projects.edit OR admin/pm for backward compat
    const isMember = await prisma.projectMember.findFirst({
      where: { projectId: params.id, userId: user.id }
    })

    if (!user || (!hasPermission(user, 'projects.edit') && user.role !== 'admin' && (!isMember || isMember.role !== 'pm'))) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'projects.edit' is required" } }
    }

    const project = await prisma.project.update({
      where: { id: params.id },
      data: { name, description, status },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    })

    return { project }
  })
  // Delete project (Admin with projects.delete)
  .delete('/:id', async ({ params, set, user }) => {
    if (!user || !hasPermission(user, 'projects.delete')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'projects.delete' is required" } }
    }

    await prisma.project.delete({ where: { id: params.id } })
    return { success: true }
  })
  // Get project members
  .get('/:id/members', async ({ params, set, user }) => {
    const project = await prisma.project.findUnique({ where: { id: params.id } })
    if (!project) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Project not found' } }
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId: params.id },
      include: { user: { select: { id: true, name: true, email: true } } }
    })

    return { members }
  })
  // Add project member
  .post('/:id/members', async ({ params, body, set, user }) => {
    const { userId, role } = body as { userId: string; role: string }

    // Check if requester is PM or Admin with users.assign_roles
    const membership = await prisma.projectMember.findFirst({
      where: { projectId: params.id, userId: user.id }
    })

    if (!user || (!hasPermission(user, 'users.assign_roles') && user.role !== 'admin' && (!membership || membership.role !== 'pm'))) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'users.assign_roles' is required" } }
    }

    const member = await prisma.projectMember.create({
      data: { projectId: params.id, userId, role },
      include: { user: { select: { id: true, name: true, email: true } } }
    })

    return { member }
  }, {
    body: t.Object({
      userId: t.String(),
      role: t.String()
    })
  })
  // Update project member role
  .patch('/members/:memberId', async ({ params, body, set, user }) => {
    const { role } = body as { role: string }
    const membership = await prisma.projectMember.findUnique({ where: { id: params.memberId } })
    if (!membership) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Member not found' } }
    }

    const requesterMembership = await prisma.projectMember.findFirst({
      where: { projectId: membership.projectId, userId: user.id }
    })

    if (!user || (!hasPermission(user, 'users.assign_roles') && user.role !== 'admin' &&
        requesterMembership?.role !== 'pm')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const updated = await prisma.projectMember.update({
      where: { id: params.memberId },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true } } }
    })

    return { member: updated }
  }, {
    body: t.Object({
      role: t.String()
    })
  })
  // Remove project member
  .delete('/members/:memberId', async ({ params, set, user }) => {
    const membership = await prisma.projectMember.findUnique({ where: { id: params.memberId } })
    if (!membership) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Member not found' } }
    }

    // Check if requester is PM, Admin, or removing themselves
    const requesterMembership = await prisma.projectMember.findFirst({
      where: { projectId: membership.projectId, userId: user.id }
    })

    if (!user || (!hasPermission(user, 'users.assign_roles') && user.role !== 'admin' &&
        requesterMembership?.role !== 'pm' &&
        membership.userId !== user.id)) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    await prisma.projectMember.delete({ where: { id: params.memberId } })
    return { success: true }
  })

export { projectRoutes }