/**
 * AgentClient - WebSocket 客户端
 * 连接到 PM System，处理任务
 */

import { createLogger, Logger } from './logger'
import { processTask, TaskPayload, TaskResult } from './task-processor'
import { LLMConfig } from './llm'

export interface AgentClientConfig {
  agentId: string
  agentToken: string
  backendUrl: string
  wsUrl: string
  maxConcurrent?: number
}

interface AgentSession {
  status: 'idle' | 'working' | 'paused'
  activeTasks: string[]
  lastHeartbeat: Date
}

interface WebSocketMessage {
  type: string
  payload?: any
  timestamp?: number
}

interface AvailableTasksPayload {
  tasks: TaskPayload[]
}

interface AssignTaskPayload {
  taskId: string
  task: TaskPayload
}

export class AgentClient {
  private ws: WebSocket | null = null
  private config: AgentClientConfig
  private logger: Logger
  private session: AgentSession
  private heartbeatTimer: Timer | null = null
  private llmConfig: LLMConfig | null = null
  private taskQueue: TaskPayload[] = []
  private processingTask: TaskPayload | null = null

  constructor(config: AgentClientConfig) {
    this.config = {
      maxConcurrent: 1,
      ...config
    }
    this.logger = createLogger(`Agent(${config.agentId.slice(0, 8)})`)
    this.session = {
      status: 'idle',
      activeTasks: [],
      lastHeartbeat: new Date()
    }
  }

  /**
   * 连接到 WebSocket 服务器
   */
  connect(): void {
    const wsUrl = `${this.config.wsUrl}/agents?token=${encodeURIComponent(this.config.agentToken)}&agentId=${encodeURIComponent(this.config.agentId)}`

    this.logger.info(`正在连接到 ${wsUrl}...`)

    try {
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.logger.success('WebSocket 连接已建立')
        this.startHeartbeat()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onerror = (error) => {
        this.logger.error('WebSocket 错误:', error)
      }

      this.ws.onclose = (event) => {
        this.logger.warn(`WebSocket 连接关闭: code=${event.code}, reason=${event.reason}`)
        this.stopHeartbeat()
        this.reconnect()
      }
    } catch (error) {
      this.logger.error('连接失败:', error)
      this.reconnect()
    }
  }

  /**
   * 处理 WebSocket 消息
   */
  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data)
      this.logger.debug(`收到消息: ${message.type}`)

      switch (message.type) {
        case 'ping':
          this.logger.info('收到服务器 ping，已连接')
          break

        case 'pong':
          this.logger.debug('心跳回复')
          break

        case 'available_tasks':
          this.handleAvailableTasks(message.payload as AvailableTasksPayload)
          break

        case 'assign_task':
          this.handleAssignTask(message.payload as AssignTaskPayload)
          break

        default:
          this.logger.warn(`未知消息类型: ${message.type}`)
      }
    } catch (error) {
      this.logger.error('解析消息失败:', error)
    }
  }

  /**
   * 处理可用任务列表
   */
  private async handleAvailableTasks(payload: AvailableTasksPayload): Promise<void> {
    const tasks = payload.tasks || []

    if (tasks.length === 0) {
      this.logger.info('当前没有待处理的任务')
      return
    }

    this.logger.info(`收到 ${tasks.length} 个待处理任务`)

    for (const task of tasks) {
      this.taskQueue.push(task)
    }

    this.processQueue()
  }

  /**
   * 处理分配的任务
   */
  private async handleAssignTask(payload: AssignTaskPayload): Promise<void> {
    this.logger.info(`收到任务分配: ${payload.taskId} - ${payload.task.title}`)

    if (this.processingTask) {
      this.logger.warn('正在处理其他任务，将任务加入队列')
      this.taskQueue.push(payload.task)
      return
    }

    await this.executeTask(payload.task)
  }

  /**
   * 处理任务队列
   */
  private async processQueue(): Promise<void> {
    if (this.processingTask) {
      this.logger.debug('正在处理任务，队列等待')
      return
    }

    const task = this.taskQueue.shift()
    if (task) {
      await this.executeTask(task)
    } else {
      this.logger.info('任务队列已空')
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: TaskPayload): Promise<void> {
    if (!this.llmConfig) {
      await this.loadLLMConfig()
    }

    if (!this.llmConfig) {
      this.logger.error('无法加载 LLM 配置，跳过任务')
      this.processQueue()
      return
    }

    this.processingTask = task
    this.session.status = 'working'
    this.session.activeTasks = [task.taskId]

    this.logger.info(`开始处理任务: ${task.taskId} - ${task.title}`)

    try {
      const result: TaskResult = await processTask(task, this.llmConfig)

      // 发送完成消息
      this.send({
        type: 'task_completed',
        payload: {
          taskId: task.taskId,
          tokensUsed: result.tokensUsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          model: result.model,
          wikiContent: result.wikiContent
        }
      })

      if (result.success) {
        this.logger.success(`任务完成: ${task.taskId}, 消耗 ${result.tokensUsed} tokens`)
      } else {
        this.logger.error(`任务失败: ${task.taskId}, ${result.error}`)
      }
    } catch (error: any) {
      this.logger.error(`任务执行异常: ${error.message}`)

      this.send({
        type: 'task_failed',
        payload: {
          taskId: task.taskId,
          error: error.message
        }
      })
    } finally {
      this.processingTask = null
      this.session.status = 'idle'
      this.session.activeTasks = []

      // 处理下一个任务
      this.processQueue()
    }
  }

  /**
   * 加载 LLM 配置和 Agent 配置
   */
  private async loadLLMConfig(): Promise<void> {
    try {
      this.logger.info('正在加载 LLM 配置...')

      // 获取全局 LLM 配置
      const llmResponse = await fetch(`${this.config.backendUrl}/api/llm-config`, {
        headers: {
          'Authorization': `Bearer ${this.config.agentToken}`
        }
      })

      if (!llmResponse.ok) {
        throw new Error(`HTTP ${llmResponse.status}`)
      }

      const llmData = await llmResponse.json()

      if (!llmData.config) {
        throw new Error('未找到 LLM 配置')
      }

      // 获取 Agent 配置（包含 systemPrompt, skills 等）
      const agentResponse = await fetch(`${this.config.backendUrl}/api/agents/${this.config.agentId}`, {
        headers: {
          'Authorization': `Bearer ${this.config.agentToken}`
        }
      })

      let agentConfig: any = {}
      if (agentResponse.ok) {
        const agentData = await agentResponse.json()
        agentConfig = agentData.agent?.agentConfig || {}
      }

      this.llmConfig = {
        apiUrl: llmData.config.apiUrl,
        apiKey: llmData.config.apiKey || '',
        model: llmData.config.model,
        systemPrompt: agentConfig.systemPrompt,
        temperature: agentConfig.temperature
      }

      this.logger.success(`LLM 配置已加载: ${this.llmConfig.model}`)
      if (this.llmConfig.systemPrompt) {
        this.logger.info(`使用自定義系統提示詞 (${this.llmConfig.systemPrompt.length} chars)`)
      }
    } catch (error: any) {
      this.logger.error('加载 LLM 配置失败:', error.message)
    }
  }

  /**
   * 发送 WebSocket 消息
   */
  private send(message: WebSocketMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        ...message,
        timestamp: Date.now()
      }))
    } else {
      this.logger.warn('WebSocket 未连接，消息未发送')
    }
  }

  /**
   * 开始心跳
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat()
    }, 30000) // 每 30 秒

    // 立即发送一次
    this.sendHeartbeat()
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * 发送心跳
   */
  private sendHeartbeat(): void {
    this.send({
      type: 'heartbeat',
      payload: {
        status: this.session.status,
        activeTasks: this.session.activeTasks
      }
    })
  }

  /**
   * 重新连接
   */
  private reconnect(): void {
    this.logger.info('5 秒后尝试重新连接...')

    setTimeout(() => {
      this.connect()
    }, 5000)
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.stopHeartbeat()

    if (this.ws) {
      this.ws.close(1000, 'Agent 正常关闭')
      this.ws = null
    }

    this.logger.info('已断开连接')
  }
}

// Timer type for Bun
type Timer = ReturnType<typeof setInterval>

export default AgentClient