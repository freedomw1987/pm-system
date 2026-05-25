import { Elysia, t } from 'elysia'
import { hasPermission } from '../middleware/permission'

const projectAgentRoutes = new Elysia({ prefix: '/projects/:projectId/agents' })

  // Get project agents (human members + AI agents)
  .get('/', async ({ params, set }) => {
    const { prisma } = await import('../utils/prisma')

    const [members, agents] = await Promise.all([
      prisma.projectMember.findMany({
        where: { projectId: params.projectId },
        include: { user: { select: { id: true, name: true, email: true } } }
      }),
      prisma.projectAgent.findMany({
        where: { projectId: params.projectId },
        include: { agent: true }
      })
    ])

    return {
      members: members.map(m => ({
        id: m.id,
        workerType: 'user',
        workerId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        createdAt: m.createdAt
      })),
      agents: agents.map(a => ({
        id: a.id,
        workerType: 'agent',
        workerId: a.agent.id,
        name: a.agent.name,
        model: a.agent.model,
        status: a.agent.status,
        lastActiveAt: a.agent.lastActiveAt,
        role: a.role,
        createdAt: a.createdAt
      }))
    }
  })

  // Add AI agent to project
  .post('/', async ({ params, body, set, user }) => {
    if (!user || (!hasPermission(user, 'project_agents.create') && user.role !== 'admin' && user.role !== 'pm')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied" } }
    }

    const { agentId, role } = body as { agentId: string; role?: string }

    if (!agentId) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: 'agentId is required' } }
    }

    const { prisma } = await import('../utils/prisma')

    // Verify agent exists and is active
    const agent = await prisma.aIAgent.findUnique({ where: { id: agentId } })
    if (!agent || !agent.isActive) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Agent not found or inactive' } }
    }

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id: params.projectId } })
    if (!project) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Project not found' } }
    }

    const projectAgent = await prisma.projectAgent.upsert({
      where: { projectId_agentId: { projectId: params.projectId, agentId } },
      update: { role: role || 'developer' },
      create: { projectId: params.projectId, agentId, role: role || 'developer' }
    })

    return { projectAgent }
  }, {
    body: t.Object({
      agentId: t.String(),
      role: t.Optional(t.String())
    })
  })

  // Remove AI agent from project
  .delete('/:agentId', async ({ params, set, user }) => {
    if (!user || (!hasPermission(user, 'project_agents.delete') && user.role !== 'admin' && user.role !== 'pm')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied" } }
    }

    const { prisma } = await import('../utils/prisma')

    await prisma.projectAgent.deleteMany({
      where: { projectId: params.projectId, agentId: params.agentId }
    })

    return { success: true }
  })

export { projectAgentRoutes }