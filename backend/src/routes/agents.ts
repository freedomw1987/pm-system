import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'

const agentRoutes = new Elysia({ prefix: '/agents' })
  // List all agents (users where isAgent = true)
  .get('/', async ({ user }) => {
    // Permission: agents.view OR admin
    if (!user || (!hasPermission(user, 'agents.view') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const agents = await prisma.user.findMany({
      where: { isAgent: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isAgent: true,
        agentConfig: true,
        createdAt: true,
        _count: {
          select: {
            assignedTasks: { where: { status: { in: ['pending', 'in_progress'] } } },
            tokenLogs: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return { agents }
  })
  // Get agent by ID with stats
  .get('/:id', async ({ params, user }) => {
    if (!user || (!hasPermission(user, 'agents.view') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const agent = await prisma.user.findUnique({
      where: { id: params.id, isAgent: true },
      include: {
        assignedTasks: {
          where: { status: { in: ['pending', 'in_progress', 'completed'] } },
          select: {
            id: true,
            title: true,
            status: true,
            projectId: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: { updatedAt: 'desc' },
          take: 20
        },
        _count: {
          select: {
            assignedTasks: { where: { status: { not: 'completed' } } },
            tokenLogs: true
          }
        }
      }
    })

    if (!agent) {
      return { error: { code: 'NOT_FOUND', message: 'Agent not found' } }
    }

    // Get token usage stats
    const tokenStats = await prisma.tokenLog.aggregate({
      where: { userId: params.id },
      _sum: { tokensUsed: true },
      _count: true
    })

    return {
      agent: {
        ...agent,
        stats: {
          activeTasks: agent._count.assignedTasks,
          totalTokenLogs: agent._count.tokenLogs,
          totalTokensUsed: tokenStats._sum.tokensUsed || 0
        }
      }
    }
  })
  // Create/register a new agent
  .post('/', async ({ body, set, user }) => {
    if (!user || (!hasPermission(user, 'agents.create') && user.role !== 'admin')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const { name, role, agentConfig } = body as {
      name: string
      role?: string
      agentConfig?: any
    }

    if (!name) {
      set.status = 400
      return { error: { code: 'BAD_REQUEST', message: 'Name is required' } }
    }

    // Generate a unique email for the agent
    const email = `agent-${Date.now()}@agent.local`

    // Generate a random password for internal use
    const passwordHash = await Bun.password.hash(crypto.randomUUID())

    // Generate a unique token for agent authentication
    const token = crypto.randomUUID()

    const agent = await prisma.user.create({
      data: {
        email,
        name,
        role: role || 'developer',
        passwordHash,
        isAgent: true,
        agentConfig: {
          token, // Store token for WebSocket authentication
          maxConcurrentTasks: 3,
          temperature: 0.7,
          systemPrompt: '你是一個專業的 AI Agent，擅長分析和解決軟件工程問題。',
          skills: [],
          mcpServers: [],
          ...agentConfig
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isAgent: true,
        agentConfig: true,
        createdAt: true
      }
    })

    return { agent }
  }, {
    body: t.Object({
      name: t.String(),
      role: t.Optional(t.String()),
      agentConfig: t.Optional(t.Any())
    })
  })
  // Update agent config
  .put('/:id', async ({ params, body, set, user }) => {
    if (!user || (!hasPermission(user, 'agents.edit') && user.role !== 'admin')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const { name, role, agentConfig } = body as {
      name?: string
      role?: string
      agentConfig?: any
    }

    const existing = await prisma.user.findUnique({ where: { id: params.id, isAgent: true } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Agent not found' } }
    }

    const agent = await prisma.user.update({
      where: { id: params.id },
      data: { name, role, agentConfig },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isAgent: true,
        agentConfig: true,
        updatedAt: true
      }
    })

    return { agent }
  })
  // Delete/deactivate agent
  .delete('/:id', async ({ params, set, user }) => {
    if (!user || (!hasPermission(user, 'agents.delete') && user.role !== 'admin')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    // Soft delete: set isAgent to false instead of hard delete
    const existing = await prisma.user.findUnique({ where: { id: params.id, isAgent: true } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Agent not found' } }
    }

    await prisma.user.update({
      where: { id: params.id },
      data: { isAgent: false }
    })

    return { success: true }
  })
  // Get available tasks for agent to claim
  .get('/available-tasks', async ({ query, user }) => {
    // Agents and admins can view available tasks
    if (!user || (!hasPermission(user, 'tasks.view') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const where: any = {
      status: 'pending',
      assigneeId: null // Only unassigned tasks
    }

    if (query.projectId) {
      where.projectId = query.projectId
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        requirements: {
          include: { requirement: { select: { id: true, title: true } } }
        }
      },
      orderBy: { createdAt: 'asc' },
      take: query.limit ? parseInt(query.limit as string) : 20
    })

    return { tasks }
  })
  // Claim a task (agent self-service)
  .post('/claim-task', async ({ body, set, user }) => {
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    // Check if user is an agent or has tasks.claim permission
    const isAgentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isAgent: true }
    })

    if (!isAgentUser?.isAgent && !hasPermission(user, 'tasks.claim')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Only agents can claim tasks or tasks.claim permission required' } }
    }

    const { taskId } = body as { taskId: string }

    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Task not found' } }
    }

    // Check if task is available (pending and not assigned)
    if (task.status !== 'pending') {
      set.status = 400
      return { error: { code: 'BAD_REQUEST', message: `Task is not available. Current status: ${task.status}` } }
    }

    if (task.assigneeId) {
      set.status = 400
      return { error: { code: 'BAD_REQUEST', message: 'Task is already assigned' } }
    }

    // Claim the task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        assigneeId: user.id,
        status: 'in_progress',
        claimedByAgentAt: new Date()
      },
      include: {
        assignee: { select: { id: true, name: true, isAgent: true } },
        project: { select: { id: true, name: true } }
      }
    })

    return { task: updatedTask }
  }, {
    body: t.Object({
      taskId: t.String()
    })
  })
  // Release a claimed task
  .post('/release-task', async ({ body, set, user }) => {
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    const { taskId } = body as { taskId: string }

    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Task not found' } }
    }

    // Check if user is the assignee
    if (task.assigneeId !== user.id) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'You are not assigned to this task' } }
    }

    // Release the task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        assigneeId: null,
        status: 'pending',
        claimedByAgentAt: null
      },
      include: {
        project: { select: { id: true, name: true } }
      }
    })

    return { task: updatedTask }
  }, {
    body: t.Object({
      taskId: t.String()
    })
  })
  // Get agent's tasks
  .get('/:id/tasks', async ({ params, query, user }) => {
    if (!user || (!hasPermission(user, 'tasks.view') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const where: any = { assigneeId: params.id }
    if (query.status) {
      where.status = query.status
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        requirements: {
          include: { requirement: { select: { id: true, title: true } } }
        },
        tokenLogs: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 50
    })

    return { tasks }
  })
  // Get agent stats
  .get('/:id/stats', async ({ params, user }) => {
    if (!user || (!hasPermission(user, 'agents.view') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    // Get task stats
    const taskStats = await prisma.task.groupBy({
      by: ['status'],
      where: { assigneeId: params.id },
      _count: true
    })

    // Get token usage stats
    const tokenStats = await prisma.tokenLog.aggregate({
      where: { userId: params.id },
      _sum: { tokensUsed: true },
      _count: true
    })

    // Get recent activity
    const recentTasks = await prisma.task.findMany({
      where: { assigneeId: params.id },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true
      }
    })

    return {
      stats: {
        tasks: taskStats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
        tokens: {
          total: tokenStats._sum.tokensUsed || 0,
          logs: tokenStats._count
        },
        recentTasks
      }
    }
  })

export { agentRoutes }