import { useState, useEffect } from 'react'
import { Bot, RefreshCw, Activity, Cpu, Link, Plus, Pencil, Trash2, X, Code, Zap, Server, Copy, Play } from 'lucide-react'
import { agentApi } from '../utils/api'
import type { Agent } from '../types'

interface AgentFormData {
  name: string
  role: string
  systemPrompt: string
  skills: string
  mcpServers: string
  maxConcurrentTasks: number
  temperature: number
}

const defaultFormData: AgentFormData = {
  name: '',
  role: 'developer',
  systemPrompt: '你是一個專業的 AI Agent，擅長分析和解決軟件工程問題。\n\n職責：\n1. 理解任務需求\n2. 分析問題並提供解決方案\n3. 產出高質量的代碼或文檔',
  skills: 'code_review,testing,documentation,bug_analysis',
  mcpServers: '',
  maxConcurrentTasks: 3,
  temperature: 0.7
}

const ROLE_OPTIONS = [
  { value: 'developer', label: '開發者', icon: Code },
  { value: 'tester', label: '測試工程師', icon: Zap },
  { value: 'pm', label: '產品經理', icon: Activity },
  { value: 'tech_lead', label: '技術主管', icon: Server },
]

const SKILL_OPTIONS = [
  { value: 'code_review', label: '代碼審查' },
  { value: 'testing', label: '測試' },
  { value: 'documentation', label: '文檔撰寫' },
  { value: 'bug_analysis', label: 'Bug 分析' },
  { value: 'refactoring', label: '重構' },
  { value: 'security_audit', label: '安全審計' },
  { value: 'performance', label: '性能優化' },
  { value: 'design', label: '系統設計' },
]

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [formData, setFormData] = useState<AgentFormData>(defaultFormData)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null)
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [selectedAgentToken, setSelectedAgentToken] = useState<{ id: string; name: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadAgents()
  }, [])

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

  const loadAgentStats = async (agent: Agent) => {
    try {
      const response = await agentApi.getStats(agent.id)
      setSelectedAgent(response.data.agent)
      setShowStatsModal(true)
    } catch (error) {
      console.error('Failed to load agent stats:', error)
    }
  }

  const showAgentToken = (agent: Agent) => {
    const token = (agent.agentConfig as any)?.token
    if (token) {
      setSelectedAgentToken({ id: agent.id, name: agent.name, token })
      setShowTokenModal(true)
      setCopied(false)
    }
  }

  const copyToken = () => {
    if (selectedAgentToken) {
      navigator.clipboard.writeText(selectedAgentToken.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const copyLaunchCommand = () => {
    if (selectedAgentToken) {
      const cmd = `AGENT_ID=${selectedAgentToken.id} AGENT_TOKEN=${selectedAgentToken.token} bun run backend/src/agent/client/index.ts`
      navigator.clipboard.writeText(cmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const openCreateModal = () => {
    setEditingAgent(null)
    setFormData(defaultFormData)
    setShowFormModal(true)
  }

  const openEditModal = (agent: Agent) => {
    setEditingAgent(agent)
    const config = agent.agentConfig || {}
    setFormData({
      name: agent.name,
      role: agent.role || 'developer',
      systemPrompt: config.systemPrompt || defaultFormData.systemPrompt,
      skills: Array.isArray(config.skills) ? config.skills.join(',') : (config.skills || defaultFormData.skills),
      mcpServers: Array.isArray(config.mcpServers) ? config.mcpServers.join(',') : (config.mcpServers || ''),
      maxConcurrentTasks: config.maxConcurrentTasks || 3,
      temperature: config.temperature || 0.7
    })
    setShowFormModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      const agentConfig = {
        maxConcurrentTasks: formData.maxConcurrentTasks,
        temperature: formData.temperature,
        systemPrompt: formData.systemPrompt,
        skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean),
        mcpServers: formData.mcpServers.split(',').map(s => s.trim()).filter(Boolean)
      }

      if (editingAgent) {
        await agentApi.update(editingAgent.id, {
          name: formData.name,
          role: formData.role,
          agentConfig
        })
      } else {
        // Create agent via backend - just need name, role, config
        await agentApi.create({
          name: formData.name,
          role: formData.role,
          agentConfig
        } as any)
      }

      setShowFormModal(false)
      setFormData(defaultFormData)
      loadAgents()
    } catch (error) {
      console.error('Failed to save agent:', error)
      alert('保存失敗')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingAgent) return

    try {
      await agentApi.delete(deletingAgent.id)
      setShowDeleteConfirm(false)
      setDeletingAgent(null)
      loadAgents()
    } catch (error) {
      console.error('Failed to delete agent:', error)
      alert('刪除失敗')
    }
  }

  const toggleSkill = (skill: string) => {
    const currentSkills = formData.skills.split(',').map(s => s.trim()).filter(Boolean)
    if (currentSkills.includes(skill)) {
      setFormData({
        ...formData,
        skills: currentSkills.filter(s => s !== skill).join(',')
      })
    } else {
      setFormData({
        ...formData,
        skills: [...currentSkills, skill].join(',')
      })
    }
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const getRoleIcon = (role: string) => {
    const option = ROLE_OPTIONS.find(r => r.value === role)
    return option?.icon || Bot
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-8 h-8" />
            Agent 管理
          </h1>
          <p className="text-gray-600 mt-1">管理 AI Agent 團隊成員</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadAgents()}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            新增 Agent
          </button>
        </div>
      </div>

      {/* LLM Config Reference */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">LLM 配置</h2>
            <p className="text-gray-500 text-sm mt-1">AI Agent 使用的 LLM 設置在「AI 設定」頁面</p>
          </div>
          <a
            href="/settings"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 text-sm"
          >
            <Link className="w-4 h-4" />
            前往 AI 設定
          </a>
        </div>
      </div>

      {/* Agent Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Bot className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{agents.length}</p>
              <p className="text-gray-500 text-sm">已配置 Agent</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Cpu className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatNumber(agents.reduce((sum, a) => sum + (a.stats?.totalTokensUsed || 0), 0))}
              </p>
              <p className="text-gray-500 text-sm">總 Token 使用</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {agents.filter(a => (a.stats?.activeTasks ?? 0) > 0).length}
              </p>
              <p className="text-gray-500 text-sm">運行中任務</p>
            </div>
          </div>
        </div>
      </div>

      {/* Agent List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-2 text-gray-500">載入中...</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600">尚未配置 Agent</h3>
          <p className="text-gray-400 mt-1">點擊「新增 Agent」創建第一個 AI Agent</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const RoleIcon = getRoleIcon(agent.role)
            const skills = agent.agentConfig?.skills || []

            return (
              <div key={agent.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                <div className="p-4 border-b">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <Bot className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{agent.name}</h3>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <RoleIcon className="w-3 h-3" />
                          <span>{ROLE_OPTIONS.find(r => r.value === agent.role)?.label || agent.role}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {(agent.agentConfig as any)?.token && (
                        <button
                          onClick={() => showAgentToken(agent)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-green-600"
                          title="啟動 Client"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => loadAgentStats(agent)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-blue-600"
                        title="查看統計"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(agent)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"
                        title="編輯"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setDeletingAgent(agent)
                          setShowDeleteConfirm(true)
                        }}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-red-600"
                        title="刪除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  {/* Skills */}
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-2">技能</p>
                    <div className="flex flex-wrap gap-1">
                      {skills.length > 0 ? skills.map((skill: string) => (
                        <span key={skill} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
                          {skill}
                        </span>
                      )) : (
                        <span className="text-gray-400 text-xs">未設定</span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-gray-500 text-xs">並發任務</p>
                      <p className="font-medium">{agent.agentConfig?.maxConcurrentTasks || 3}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-gray-500 text-xs">活躍任務</p>
                      <p className="font-medium">{agent.stats?.activeTasks || 0}</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Agent Modal */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Bot className="w-6 h-6" />
                {editingAgent ? '編輯 Agent' : '新增 Agent'}
              </h2>
              <button onClick={() => setShowFormModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">名稱 *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例如：代碼審查 Agent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ROLE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  系統提示詞 (System Prompt) *
                </label>
                <textarea
                  required
                  value={formData.systemPrompt}
                  onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  rows={6}
                  placeholder="定義 Agent 的行為、角色和能力..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  設定 Agent 的核心指令和行為準則
                </p>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">技能 (Skills)</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {SKILL_OPTIONS.map(skill => {
                    const currentSkills = formData.skills.split(',').map(s => s.trim()).filter(Boolean)
                    const isSelected = currentSkills.includes(skill.value)
                    return (
                      <button
                        key={skill.value}
                        type="button"
                        onClick={() => toggleSkill(skill.value)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {skill.label}
                      </button>
                    )
                  })}
                </div>
                <input
                  type="text"
                  value={formData.skills}
                  onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="自定義技能（用逗號分隔）"
                />
                <p className="text-xs text-gray-500 mt-1">
                  當前：{formData.skills.split(',').map(s => s.trim()).filter(Boolean).join(', ') || '無'}
                </p>
              </div>

              {/* MCP Servers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  MCP 伺服器 (MCP Servers)
                </label>
                <input
                  type="text"
                  value={formData.mcpServers}
                  onChange={(e) => setFormData({ ...formData, mcpServers: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="github, jira, slack（用逗號分隔）"
                />
                <p className="text-xs text-gray-500 mt-1">
                  連接到外部服務的工具（需 Agent Client 支援）
                </p>
              </div>

              {/* Advanced Settings */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">進階設定</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">最大並發任務</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.maxConcurrentTasks}
                      onChange={(e) => setFormData({ ...formData, maxConcurrentTasks: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={formData.temperature}
                      onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">值：{formData.temperature}（越低越精確）</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? '保存中...' : (editingAgent ? '保存' : '創建')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold mb-2">確認刪除</h3>
              <p className="text-gray-600 mb-6">
                確定要刪除 Agent「{deletingAgent.name}」嗎？<br />
                此操作無法撤銷。
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setDeletingAgent(null)
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  確認刪除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {showStatsModal && selectedAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedAgent.name}</h2>
                  <p className="text-gray-500">{ROLE_OPTIONS.find(r => r.value === selectedAgent.role)?.label || selectedAgent.role}</p>
                </div>
              </div>
              <button onClick={() => setShowStatsModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">活躍任務</p>
                <p className="text-2xl font-bold">{selectedAgent.stats?.activeTasks || 0}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">總 Token</p>
                <p className="text-2xl font-bold">{formatNumber(selectedAgent.stats?.totalTokensUsed || 0)}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">日誌數</p>
                <p className="text-2xl font-bold">{selectedAgent.stats?.totalTokenLogs || 0}</p>
              </div>
            </div>

            {/* Agent Config Details */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="font-medium mb-3">Agent 配置</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-500">系統提示詞</p>
                  <pre className="mt-1 p-2 bg-white rounded border text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {selectedAgent.agentConfig?.systemPrompt || '未設定'}
                  </pre>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-500">技能</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedAgent.agentConfig?.skills && selectedAgent.agentConfig.skills.length > 0 ? (
                        selectedAgent.agentConfig.skills.map((skill: string) => (
                          <span key={skill} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400 text-xs">未設定</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-500">MCP 伺服器</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedAgent.agentConfig?.mcpServers && selectedAgent.agentConfig.mcpServers.length > 0 ? (
                        selectedAgent.agentConfig.mcpServers.map((mcp: string) => (
                          <span key={mcp} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                            {mcp}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400 text-xs">未設定</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-500">最大並發</p>
                    <p className="font-medium">{selectedAgent.agentConfig?.maxConcurrentTasks || 3}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Temperature</p>
                    <p className="font-medium">{selectedAgent.agentConfig?.temperature || 0.7}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Tasks */}
            {selectedAgent.assignedTasks && selectedAgent.assignedTasks.length > 0 && (
              <div>
                <h3 className="font-medium mb-3">最近的任務</h3>
                <div className="space-y-2">
                  {selectedAgent.assignedTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{task.title}</p>
                        <p className="text-sm text-gray-500">{task.project?.name}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-sm ${
                        task.status === 'completed' ? 'bg-green-100 text-green-700' :
                        task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {task.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agent Token Modal */}
      {showTokenModal && selectedAgentToken && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Play className="w-6 h-6 text-green-600" />
                啟動 Agent Client
              </h2>
              <button onClick={() => setShowTokenModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-600 mb-4">
              複製以下命令來啟動 <strong>{selectedAgentToken.name}</strong>：
            </p>

            <div className="bg-gray-900 rounded-lg p-4 mb-4">
              <p className="text-green-400 font-mono text-sm break-all">
                AGENT_ID={selectedAgentToken.id}
              </p>
              <p className="text-green-400 font-mono text-sm break-all">
                AGENT_TOKEN={selectedAgentToken.token}
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-xs text-gray-500 mb-1">完整啟動命令：</p>
              <p className="text-sm font-mono text-gray-700 break-all">
                AGENT_ID={selectedAgentToken.id} AGENT_TOKEN={selectedAgentToken.token} bun run backend/src/agent/client/index.ts
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={copyToken}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                {copied ? '已複製！' : '複製 Token'}
              </button>
              <button
                onClick={copyLaunchCommand}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                {copied ? '已複製！' : '複製啟動命令'}
              </button>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <p className="font-medium">注意：</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>請確保 LLM 配置已設置（/settings）</li>
                <li>後端服務需要運行在 localhost:4000</li>
                <li>前端服務需要運行在 localhost:4001（API）</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}