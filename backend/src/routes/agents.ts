import { Elysia, t } from 'elysia'
import { hasPermission } from '../middleware/permission'

const agentRoutes = new Elysia({ prefix: '/agents' })

  // List all agents
  .get('/', async ({ set, user }) => {
    if (!hasPermission(user, 'agents.view')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'agents.view' is required" } }
    }

    const { prisma } = await import('../utils/prisma')
    const agents = await prisma.aIAgent.findMany({
      orderBy: { createdAt: 'desc' }
    })

    return {
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        model: a.model,
        apiUrl: a.apiUrl,
        skills: a.skills,
        mcpServers: a.mcpServers,
        systemPrompt: a.systemPrompt,
        status: a.status,
        lastActiveAt: a.lastActiveAt,
        isActive: a.isActive,
        config: a.config,
        createdAt: a.createdAt
      }))
    }
  })

  // Get agent by ID
  .get('/:id', async ({ params, set, user }) => {
    if (!hasPermission(user, 'agents.view')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'agents.view' is required" } }
    }

    const { prisma } = await import('../utils/prisma')
    const agent = await prisma.aIAgent.findUnique({ where: { id: params.id } })
    if (!agent) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Agent not found' } }
    }

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      model: agent.model,
      apiUrl: agent.apiUrl,
      skills: agent.skills,
      mcpServers: agent.mcpServers,
      systemPrompt: agent.systemPrompt,
      status: agent.status,
      lastActiveAt: agent.lastActiveAt,
      isActive: agent.isActive,
      config: agent.config,
      createdAt: agent.createdAt
    }
  })

  // Create agent
  .post('/', async ({ body, set, user }) => {
    if (!hasPermission(user, 'agents.create')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'agents.create' is required" } }
    }

    const { name, description, model, apiUrl, apiKey, skills, mcpServers, systemPrompt, config } = body as {
      name: string
      description?: string
      model?: string
      apiUrl?: string
      apiKey?: string
      skills?: string[]
      mcpServers?: any
      systemPrompt?: string
      config?: any
    }

    if (!name) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: 'name is required' } }
    }

    const { prisma } = await import('../utils/prisma')

    const agent = await prisma.aIAgent.create({
      data: {
        name,
        description,
        model: model || 'gpt-4o',
        apiUrl: apiUrl || 'https://api.openai.com/v1',
        apiKey: apiKey || '',
        skills: skills || [],
        mcpServers,
        systemPrompt,
        config,
        status: 'offline',
        isActive: true
      }
    })

    return { agent: { id: agent.id, name: agent.name, model: agent.model, status: agent.status, createdAt: agent.createdAt } }
  }, {
    body: t.Object({
      name: t.String(),
      description: t.Optional(t.String()),
      model: t.Optional(t.String()),
      apiUrl: t.Optional(t.String()),
      apiKey: t.Optional(t.String()),
      skills: t.Optional(t.Array(t.String())),
      mcpServers: t.Optional(t.Any()),
      systemPrompt: t.Optional(t.String()),
      config: t.Optional(t.Any())
    })
  })

  // Update agent
  .put('/:id', async ({ params, body, set, user }) => {
    if (!hasPermission(user, 'agents.edit')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'agents.edit' is required" } }
    }

    const { name, description, model, apiUrl, apiKey, skills, mcpServers, systemPrompt, config, isActive } = body as {
      name?: string
      description?: string
      model?: string
      apiUrl?: string
      apiKey?: string
      skills?: string[]
      mcpServers?: any
      systemPrompt?: string
      config?: any
      isActive?: boolean
    }

    const { prisma } = await import('../utils/prisma')

    const existing = await prisma.aIAgent.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Agent not found' } }
    }

    const data: any = {}
    if (name !== undefined) data.name = name
    if (description !== undefined) data.description = description
    if (model !== undefined) data.model = model
    if (apiUrl !== undefined) data.apiUrl = apiUrl
    if (apiKey !== undefined) data.apiKey = apiKey
    if (skills !== undefined) data.skills = skills
    if (mcpServers !== undefined) data.mcpServers = mcpServers
    if (systemPrompt !== undefined) data.systemPrompt = systemPrompt
    if (config !== undefined) data.config = config
    if (isActive !== undefined) data.isActive = isActive

    const agent = await prisma.aIAgent.update({ where: { id: params.id }, data })

    return {
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        model: agent.model,
        apiUrl: agent.apiUrl,
        skills: agent.skills,
        mcpServers: agent.mcpServers,
        systemPrompt: agent.systemPrompt,
        status: agent.status,
        isActive: agent.isActive,
        config: agent.config,
        updatedAt: agent.updatedAt
      }
    }
  })

  // Soft delete agent (toggle isActive)
  .delete('/:id', async ({ params, set, user }) => {
    if (!hasPermission(user, 'agents.delete')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'agents.delete' is required" } }
    }

    const { prisma } = await import('../utils/prisma')

    const existing = await prisma.aIAgent.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Agent not found' } }
    }

    await prisma.aIAgent.update({ where: { id: params.id }, data: { isActive: false } })

    return { success: true }
  })

  // Lightweight status poll endpoint
  .get('/status', async () => {
    const { prisma } = await import('../utils/prisma')
    const agents = await prisma.aIAgent.findMany({
      where: { isActive: true },
      select: { id: true, name: true, status: true, lastActiveAt: true, model: true }
    })
    return { agents }
  })

export { agentRoutes }