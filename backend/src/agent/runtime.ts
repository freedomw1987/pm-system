/**
 * AI Agent WebSocket Runtime
 *
 * Handles real-time communication with AI agents via WebSocket.
 * Manages task assignment, heartbeat monitoring, and agent coordination.
 */

import { Elysia } from 'elysia'
import { PrismaClient } from '@prisma/client'
import { prisma } from '../utils/prisma'
import {
  extractWsAuthParams,
  wsCloseCodeForReason,
  buildAgentWelcomeMessage,
  type WsCloseReason
} from './ws-handler-helpers'
import { hasPermission } from '../middleware/permission'

// Connected agents map: agentId -> WebSocket
const connectedAgents = new Map<string, any>()

// Agent session info
interface AgentTaskLog {
  taskId: string
  step: string
  status: 'started' | 'progress' | 'completed' | 'error'
  details?: string
  timestamp: Date
}

interface AgentSession {
  agentId: string
  projectId?: string
  status: 'idle' | 'working' | 'paused'
  activeTasks: string[]
  lastHeartbeat: Date
  lastLog?: AgentTaskLog
  taskLogs: AgentTaskLog[]
  websocket: any
}

const agentSessions = new Map<string, AgentSession>()

export function getAgentSession(agentId: string): AgentSession | undefined {
  return agentSessions.get(agentId)
}

export function getConnectedAgents(): string[] {
  return Array.from(agentSessions.keys())
}

/**
 * Get all task logs for an agent
 */
export function getAgentTaskLogs(agentId: string): AgentTaskLog[] {
  const session = agentSessions.get(agentId)
  return session?.taskLogs || []
}

/**
 * Send intervention message to agent from PM
 */
export function sendInterveneToAgent(agentId: string, taskId: string, instruction: string): boolean {
  const session = agentSessions.get(agentId)
  if (!session?.websocket) {
    return false
  }

  try {
    session.websocket.send(JSON.stringify({
      type: 'intervene',
      payload: {
        taskId,
        instruction,
        timestamp: Date.now()
      }
    }))
    return true
  } catch (error) {
    console.error(`Failed to send intervene to agent ${agentId}:`, error)
    return false
  }
}

/**
 * Pause agent task
 */
export function pauseAgentTask(agentId: string, taskId: string): boolean {
  const session = agentSessions.get(agentId)
  if (!session?.websocket) {
    return false
  }

  try {
    session.status = 'paused'
    session.websocket.send(JSON.stringify({
      type: 'pause',
      payload: { taskId, timestamp: Date.now() }
    }))
    return true
  } catch (error) {
    console.error(`Failed to pause agent ${agentId} task ${taskId}:`, error)
    return false
  }
}

/**
 * Resume agent task
 */
export function resumeAgentTask(agentId: string, taskId: string): boolean {
  const session = agentSessions.get(agentId)
  if (!session?.websocket) {
    return false
  }

  try {
    session.status = 'working'
    session.websocket.send(JSON.stringify({
      type: 'resume',
      payload: { taskId, timestamp: Date.now() }
    }))
    return true
  } catch (error) {
    console.error(`Failed to resume agent ${agentId} task ${taskId}:`, error)
    return false
  }
}

// Message types for WebSocket communication
export type AgentMessageType =
  | 'heartbeat'
  | 'assign_task'
  | 'release_task'
  | 'task_completed'
  | 'task_failed'
  | 'ping'
  | 'pong'
  | 'error'
  | 'intervene'
  | 'task_log'
  | 'task_status'
  | 'pause'
  | 'resume'

export interface AgentMessage {
  type: AgentMessageType
  payload?: any
  timestamp?: number
}

export interface HeartbeatPayload {
  status: 'idle' | 'working' | 'paused'
  activeTasks: string[]
  totalTokensUsed?: number
}

export interface IntervenePayload {
  taskId: string
  instruction: string
  priority?: 'low' | 'normal' | 'high'
}

export interface TaskLogPayload {
  taskId: string
  step: string
  status: 'started' | 'progress' | 'completed' | 'error'
  details?: string
}

export interface TaskAssignPayload {
  taskId: string
  task: {
    id: string
    title: string
    description?: string
    projectId: string
    projectName?: string
    requirements?: { id: string; title: string }[]
  }
}

export interface TaskCompletePayload {
  taskId: string
  tokensUsed: number
  inputTokens?: number
  outputTokens?: number
  model: string
  wikiContent?: string // Markdown content for auto-generated wiki
}

/**
 * Send message to an agent via WebSocket
 */
export function sendToAgent(agentId: string, message: AgentMessage): boolean {
  const session = agentSessions.get(agentId)
  if (!session?.websocket) {
    return false
  }

  try {
    session.websocket.send(JSON.stringify(message))
    return true
  } catch (error) {
    console.error(`Failed to send message to agent ${agentId}:`, error)
    return false
  }
}

/**
 * Broadcast message to all connected agents
 */
export function broadcastToAgents(message: AgentMessage): void {
  for (const [agentId] of agentSessions) {
    sendToAgent(agentId, message)
  }
}

/**
 * Assign a task to an agent via WebSocket
 */
export async function assignTaskToAgent(agentId: string, taskId: string): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true } },
      requirements: {
        include: { requirement: { select: { id: true, title: true } } }
      }
    }
  })

  if (!task) {
    console.error(`Task ${taskId} not found`)
    return false
  }

  const payload: TaskAssignPayload = {
    taskId: task.id,
    task: {
      id: task.id,
      title: task.title,
      description: task.description || undefined,
      projectId: task.projectId,
      projectName: task.project.name,
      requirements: task.requirements.map(r => ({
        id: r.requirement.id,
        title: r.requirement.title
      }))
    }
  }

  return sendToAgent(agentId, { type: 'assign_task', payload })
}

/**
 * Get available tasks for an agent
 */
export async function getAvailableTasks(projectId?: string, limit: number = 10) {
  const where: any = {
    status: 'pending',
    assigneeId: null
  }

  if (projectId) {
    where.projectId = projectId
  }

  return prisma.task.findMany({
    where,
    include: {
      project: { select: { id: true, name: true } },
      requirements: {
        include: { requirement: { select: { id: true, title: true } } }
      }
    },
    orderBy: { createdAt: 'asc' },
    take: limit
  })
}

/**
 * Handle agent task completion
 */
export async function handleTaskCompletion(
  agentId: string,
  payload: TaskCompletePayload
): Promise<void> {
  const { taskId, tokensUsed, inputTokens, outputTokens, model, wikiContent } = payload

  // Update task status to completed
  await prisma.task.update({
    where: { id: taskId },
    data: { status: 'completed' }
  })

  // Create token log
  await prisma.tokenLog.create({
    data: {
      userId: agentId,
      taskId,
      tokensUsed,
      inputTokens,
      outputTokens,
      model,
      date: new Date(),
      description: `Task completed: ${taskId}`
    }
  })

  // Auto-generate Wiki page if content provided
  if (wikiContent) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true }
    })

    if (task) {
      const wikiTitle = `[任務完成] ${task.title} - ${new Date().toLocaleDateString('zh-TW')}`

      await prisma.wikiPage.create({
        data: {
          projectId: task.projectId,
          title: wikiTitle,
          content: wikiContent,
          tags: ['agent', 'task-completion', task.id],
          createdById: agentId
        }
      })

      console.log(`Wiki page created for task ${taskId}: "${wikiTitle}"`)
    }
  }

  // Update agent session
  const session = agentSessions.get(agentId)
  if (session) {
    session.activeTasks = session.activeTasks.filter(id => id !== taskId)
    if (session.activeTasks.length === 0) {
      session.status = 'idle'
    }
  }

  console.log(`Agent ${agentId} completed task ${taskId}, used ${tokensUsed} tokens`)
}

/**
 * Register agent heartbeat
 */
export function handleHeartbeat(agentId: string, payload: HeartbeatPayload): void {
  const session = agentSessions.get(agentId)
  if (session) {
    session.lastHeartbeat = new Date()
    session.status = payload.status === 'idle' ? 'idle' : 'working'
    session.activeTasks = payload.activeTasks || []
  }
}

/**
 * WebSocket route setup for agent communication
 */
export const agentWebSocketRoutes = new Elysia({ prefix: '/ws/agents' })
  .ws('/', {
    open(ws) {
      // Extract agent token from query params (extracted to pure helper, see
      // ws-handler-helpers.ts / RG-010 — unit tested in isolation).
      const params = extractWsAuthParams(ws.raw.url)
      if (!params) {
        ws.close(wsCloseCodeForReason('missing'), 'Missing authentication')
        return
      }
      const { token, agentId } = params

      // Verify agent exists and token is valid
      prisma.user.findUnique({
        where: { id: agentId, isAgent: true }
      }).then(agent => {
        if (!agent) {
          ws.close(wsCloseCodeForReason('invalid_agent'), 'Invalid agent')
          return
        }

        // Verify token matches stored token
        const storedToken = (agent.agentConfig as any)?.token
        if (!storedToken || storedToken !== token) {
          ws.close(wsCloseCodeForReason('invalid_token'), 'Invalid token')
          return
        }

        // Register agent session
        const session: AgentSession = {
          agentId,
          status: 'idle',
          activeTasks: [],
          lastHeartbeat: new Date(),
          websocket: ws
        }
        agentSessions.set(agentId, session)
        connectedAgents.set(agentId, ws)

        console.log(`Agent ${agentId} connected via WebSocket`)

        // Send welcome message (built by pure helper, RG-010)
        ws.send(buildAgentWelcomeMessage(
          agentId,
          'Connected to PM System Agent Runtime',
          Date.now()
        ))

        // Send available tasks
        getAvailableTasks(undefined, 5).then(tasks => {
          ws.send(JSON.stringify({
            type: 'available_tasks',
            payload: { tasks },
            timestamp: Date.now()
          }))
        })
      }).catch(error => {
        console.error('Agent auth error:', error)
        ws.close(wsCloseCodeForReason('auth_failed'), 'Authentication failed')
      })
    },
    message(ws, message) {
      // Get agent ID from session
      const url = new URL(ws.raw.url, 'http://localhost')
      const agentId = url.searchParams.get('agentId')

      if (!agentId) return

      try {
        const data = JSON.parse(message.toString())

        switch (data.type) {
          case 'heartbeat':
            handleHeartbeat(agentId, data.payload || {})
            ws.send(JSON.stringify({
              type: 'pong',
              timestamp: Date.now()
            }))
            break

          case 'task_log':
            // Agent sends task execution log, broadcast to connected PMs
            // Store in memory for real-time display
            const logSession = agentSessions.get(agentId)
            if (logSession) {
              logSession.lastLog = data.payload
            }
            // Echo back acknowledgment
            ws.send(JSON.stringify({
              type: 'ack',
              payload: { received: true },
              timestamp: Date.now()
            }))
            break

          case 'task_status':
            // Agent updates task status
            const statusPayload = data.payload
            if (statusPayload?.taskId && statusPayload?.status) {
              prisma.task.update({
                where: { id: statusPayload.taskId },
                data: { status: statusPayload.status }
              }).catch(console.error)
            }
            ws.send(JSON.stringify({
              type: 'ack',
              payload: { received: true },
              timestamp: Date.now()
            }))
            break

          case 'task_completed':
            handleTaskCompletion(agentId, data.payload).catch(console.error)
            ws.send(JSON.stringify({
              type: 'ack',
              payload: { received: true },
              timestamp: Date.now()
            }))
            break

          case 'task_failed':
            // Handle task failure - release the task back to pool
            const taskId = data.payload?.taskId
            if (taskId) {
              prisma.task.update({
                where: { id: taskId },
                data: {
                  assigneeId: null,
                  status: 'pending',
                  claimedByAgentAt: null
                }
              }).catch(console.error)

              const session = agentSessions.get(agentId)
              if (session) {
                session.activeTasks = session.activeTasks.filter(id => id !== taskId)
              }
            }
            ws.send(JSON.stringify({
              type: 'ack',
              payload: { taskReleased: true },
              timestamp: Date.now()
            }))
            break

          case 'request_tasks':
            // Agent requesting more tasks
            const limit = data.payload?.limit || 5
            getAvailableTasks(data.payload?.projectId, limit).then(tasks => {
              ws.send(JSON.stringify({
                type: 'available_tasks',
                payload: { tasks },
                timestamp: Date.now()
              }))
            })
            break

          default:
            console.log(`Unknown message type from agent ${agentId}:`, data.type)
        }
      } catch (error) {
        console.error('Failed to parse agent message:', error)
      }
    },
    close(ws) {
      const url = new URL(ws.raw.url, 'http://localhost')
      const agentId = url.searchParams.get('agentId')

      if (agentId) {
        agentSessions.delete(agentId)
        connectedAgents.delete(agentId)
        console.log(`Agent ${agentId} disconnected`)
      }
    }
  })

/**
 * Agent management API (for dashboard/admin)
 */
export const agentManagementRoutes = new Elysia({ prefix: '/agent-management' })
  // Get all connected agents
  .get('/connected', async ({ user }) => {
    if (!user || (!hasPermission(user, 'agents.view') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const agents = Array.from(agentSessions.entries()).map(([id, session]) => ({
      agentId: id,
      status: session.status,
      activeTasks: session.activeTasks,
      lastHeartbeat: session.lastHeartbeat.toISOString()
    }))

    return { connectedAgents: agents }
  })
  // Send message to specific agent
  .post('/send-message', async ({ body, user }) => {
    if (!user || (!hasPermission(user, 'agents.edit') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const { agentId, message } = body as { agentId: string; message: AgentMessage }

    const sent = sendToAgent(agentId, message)
    return { success: sent, message: sent ? 'Message sent' : 'Agent not connected' }
  })
  // Trigger task assignment to specific agent
  .post('/assign-task', async ({ body, user }) => {
    if (!user || (!hasPermission(user, 'tasks.assign') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const { agentId, taskId } = body as { agentId: string; taskId: string }

    const assigned = await assignTaskToAgent(agentId, taskId)
    return { success: assigned, message: assigned ? 'Task assigned' : 'Failed to assign task' }
  })
  // Get agent task logs (for PM monitoring)
  .get('/:agentId/logs', async ({ params, user }) => {
    if (!user || (!hasPermission(user, 'agents.view') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const logs = getAgentTaskLogs(params.agentId)
    const session = agentSessions.get(params.agentId)
    return {
      logs,
      currentLog: session?.lastLog || null,
      status: session?.status || 'offline',
      activeTasks: session?.activeTasks || []
    }
  })
  // Send intervention to agent (PM can send instructions)
  .post('/intervene', async ({ body, user }) => {
    if (!user || (user.role !== 'admin' && user.role !== 'pm' && user.role !== 'tech_lead')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const { agentId, taskId, instruction } = body as { agentId: string; taskId: string; instruction: string }

    const sent = sendInterveneToAgent(agentId, taskId, instruction)
    return { success: sent, message: sent ? 'Instruction sent' : 'Agent not connected' }
  })
  // Pause agent task
  .post('/pause', async ({ body, user }) => {
    if (!user || (user.role !== 'admin' && user.role !== 'pm' && user.role !== 'tech_lead')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const { agentId, taskId } = body as { agentId: string; taskId: string }

    const paused = pauseAgentTask(agentId, taskId)
    return { success: paused, message: paused ? 'Task paused' : 'Agent not connected' }
  })
  // Resume agent task
  .post('/resume', async ({ body, user }) => {
    if (!user || (user.role !== 'admin' && user.role !== 'pm' && user.role !== 'tech_lead')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const { agentId, taskId } = body as { agentId: string; taskId: string }

    const resumed = resumeAgentTask(agentId, taskId)
    return { success: resumed, message: resumed ? 'Task resumed' : 'Agent not connected' }
  })
  // Force disconnect an agent
  .post('/disconnect', async ({ body, user }) => {
    if (!user || user.role !== 'admin') {
      return { error: { code: 'FORBIDDEN', message: 'Admin permission required' } }
    }

    const { agentId } = body as { agentId: string }

    const session = agentSessions.get(agentId)
    if (session?.websocket) {
      session.websocket.close(1000, 'Forced disconnect')
      agentSessions.delete(agentId)
      connectedAgents.delete(agentId)
    }

    return { success: true }
  })

// Health check endpoint for agent runtime
export const agentHealthRoutes = new Elysia({ prefix: '/agent-health' })
  .get('/', async () => {
    return {
      status: 'ok',
      connectedAgents: agentSessions.size,
      timestamp: new Date().toISOString()
    }
  })