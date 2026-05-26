import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Play, Pause, Square, Send, Clock, Activity, AlertCircle, CheckCircle, ArrowLeft, RefreshCw } from 'lucide-react'
import { agentApi, agentManagementApi } from '../utils/api'
import type { Agent } from '../types'

interface TaskLog {
  taskId: string
  step: string
  status: 'started' | 'progress' | 'completed' | 'error'
  details?: string
  timestamp: Date
}

interface AgentStatus {
  logs: TaskLog[]
  currentLog: TaskLog | null
  status: string
  activeTasks: string[]
}

export default function AgentMonitorPage() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [logs, setLogs] = useState<TaskLog[]>([])
  const [instruction, setInstruction] = useState('')
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    if (selectedAgent) {
      loadAgentStatus(selectedAgent.id)
      // Start polling for real-time updates
      const interval = setInterval(() => {
        loadAgentStatus(selectedAgent.id)
      }, 5000) // Poll every 5 seconds
      return () => clearInterval(interval)
    }
  }, [selectedAgent])

  const loadAgents = async () => {
    try {
      setLoading(true)
      const response = await agentApi.list()
      setAgents(response.data.agents || [])
    } catch (error) {
      console.error('Failed to load agents:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAgentStatus = async (agentId: string) => {
    try {
      const response = await agentManagementApi.getLogs(agentId)
      setAgentStatus(response.data)
      if (response.data.currentLog) {
        setLogs(prev => {
          const newLogs = [...prev]
          const existingIndex = newLogs.findIndex(l =>
            l.taskId === response.data.currentLog?.taskId &&
            l.step === response.data.currentLog?.step
          )
          if (existingIndex >= 0) {
            newLogs[existingIndex] = response.data.currentLog
          } else {
            newLogs.push(response.data.currentLog)
          }
          return newLogs.slice(-50) // Keep last 50 logs
        })
      }
    } catch (error) {
      console.error('Failed to load agent status:', error)
    }
  }

  const sendIntervene = async () => {
    if (!selectedAgent || !instruction.trim()) return

    const activeTaskId = agentStatus?.activeTasks[0]
    if (!activeTaskId) {
      alert('該 Agent 目前沒有運行中的任務')
      return
    }

    setIsSending(true)
    try {
      await agentManagementApi.intervene(selectedAgent.id, activeTaskId, instruction)
      setInstruction('')
      alert('指令已發送')
    } catch (error) {
      console.error('Failed to send intervention:', error)
      alert('發送失敗')
    } finally {
      setIsSending(false)
    }
  }

  const pauseTask = async () => {
    if (!selectedAgent) return
    const activeTaskId = agentStatus?.activeTasks[0]
    if (!activeTaskId) return

    try {
      await agentManagementApi.pause(selectedAgent.id, activeTaskId)
      loadAgentStatus(selectedAgent.id)
    } catch (error) {
      console.error('Failed to pause task:', error)
    }
  }

  const resumeTask = async () => {
    if (!selectedAgent) return
    const activeTaskId = agentStatus?.activeTasks[0]
    if (!activeTaskId) return

    try {
      await agentManagementApi.resume(selectedAgent.id, activeTaskId)
      loadAgentStatus(selectedAgent.id)
    } catch (error) {
      console.error('Failed to resume task:', error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'idle':
        return <Clock className="w-5 h-5 text-gray-400" />
      case 'working':
        return <Activity className="w-5 h-5 text-green-500 animate-pulse" />
      case 'paused':
        return <Pause className="w-5 h-5 text-yellow-500" />
      default:
        return <Bot className="w-5 h-5 text-gray-400" />
    }
  }

  const getLogStatusIcon = (status: string) => {
    switch (status) {
      case 'started':
        return <Play className="w-4 h-4 text-blue-500" />
      case 'progress':
        return <Activity className="w-4 h-4 text-yellow-500 animate-pulse" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  const formatTime = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-8 h-8" />
            Agent 任務監控
          </h1>
          <p className="text-gray-600 mt-1">PM/Tech Lead 可以監控和干預 Agent 的任務執行</p>
        </div>
        <button
          onClick={() => loadAgents()}
          className="ml-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold mb-4">在線 Agent</h2>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : agents.length === 0 ? (
              <p className="text-gray-500 text-center py-4">暫無 Agent</p>
            ) : (
              <div className="space-y-2">
                {agents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      setSelectedAgent(agent)
                      setLogs([])
                    }}
                    className={`w-full p-4 rounded-lg text-left transition-colors ${
                      selectedAgent?.id === agent.id
                        ? 'bg-blue-50 border-2 border-blue-500'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{agent.name}</p>
                        <p className="text-sm text-gray-500">
                          {(agent.agentConfig as any)?.skills?.join(', ') || '無技能'}
                        </p>
                      </div>
                      {getStatusIcon('idle')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agent Monitor Panel */}
        <div className="lg:col-span-2">
          {selectedAgent ? (
            <div className="bg-white rounded-lg shadow">
              {/* Header */}
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">{selectedAgent.name}</h2>
                      <p className="text-gray-500">
                        狀態：
                        <span className={`ml-1 ${
                          agentStatus?.status === 'working' ? 'text-green-600' :
                          agentStatus?.status === 'paused' ? 'text-yellow-600' : 'text-gray-500'
                        }`}>
                          {agentStatus?.status === 'working' ? '運行中' :
                           agentStatus?.status === 'paused' ? '已暫停' : '空閒'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {agentStatus?.status === 'working' ? (
                      <button
                        onClick={pauseTask}
                        className="px-3 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded-lg flex items-center gap-2 text-sm"
                      >
                        <Pause className="w-4 h-4" />
                        暫停
                      </button>
                    ) : agentStatus?.status === 'paused' ? (
                      <button
                        onClick={resumeTask}
                        className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg flex items-center gap-2 text-sm"
                      >
                        <Play className="w-4 h-4" />
                        恢復
                      </button>
                    ) : null}
                    <button
                      onClick={pauseTask}
                      className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg flex items-center gap-2 text-sm"
                    >
                      <Square className="w-4 h-4" />
                      中止
                    </button>
                  </div>
                </div>
              </div>

              {/* Current Task */}
              {agentStatus?.activeTasks[0] && (
                <div className="p-4 bg-blue-50 border-b">
                  <p className="text-sm text-blue-600 font-medium mb-2">當前任務</p>
                  <p className="text-gray-900">任務 ID: {agentStatus.activeTasks[0]}</p>
                </div>
              )}

              {/* Task Logs */}
              <div className="p-4">
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  執行日誌
                </h3>
                <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
                  {logs.length === 0 ? (
                    <p className="text-gray-500">暫無日誌</p>
                  ) : (
                    logs.map((log, index) => (
                      <div key={index} className="flex items-start gap-3 py-2 border-b border-gray-700 last:border-0">
                        {getLogStatusIcon(log.status)}
                        <div className="flex-1">
                          <span className="text-gray-400">[{formatTime(log.timestamp)}]</span>
                          <span className="ml-2 text-green-400">{log.step}</span>
                          {log.details && (
                            <p className="text-gray-300 mt-1">{log.details}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Intervention Panel */}
              <div className="p-4 border-t">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  發送干預指令
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="輸入指令給 Agent（例如：請優先處理登入模組的測試）"
                    className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && sendIntervene()}
                  />
                  <button
                    onClick={sendIntervene}
                    disabled={isSending || !instruction.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    發送
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  干預指令會即時發送給 Agent，Agent 會根據優先級處理您的指令
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600">選擇要監控的 Agent</h3>
              <p className="text-gray-400 mt-1">從左側列表選擇一個 Agent 開始監控</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}