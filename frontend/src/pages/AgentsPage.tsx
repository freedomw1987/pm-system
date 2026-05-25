import { useEffect, useState } from 'react'
import { Bot, Plus, Pencil, Trash2, X } from 'lucide-react'
import clsx from 'clsx'

interface AIAgent {
  id: string
  name: string
  description?: string
  model: string
  apiUrl: string
  skills: string[]
  mcpServers?: any
  systemPrompt?: string
  status: string
  lastActiveAt?: string
  isActive: boolean
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-100 text-green-700',
  busy: 'bg-yellow-100 text-yellow-700',
  offline: 'bg-gray-100 text-gray-500',
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AIAgent | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    model: 'gpt-4o',
    apiUrl: 'https://api.openai.com/v1',
    apiKey: '',
    skills: '',
    mcpServers: '',
    systemPrompt: '',
    isActive: true,
  })

  useEffect(() => { loadAgents() }, [])

  const loadAgents = async () => {
    setIsLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/agents', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setAgents(data.agents || [])
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const openCreate = () => {
    setEditingAgent(null)
    setFormData({
      name: '', description: '', model: 'gpt-4o',
      apiUrl: 'https://api.openai.com/v1', apiKey: '',
      skills: '', mcpServers: '', systemPrompt: '', isActive: true
    })
    setShowForm(true)
  }

  const openEdit = (agent: AIAgent) => {
    setEditingAgent(agent)
    setFormData({
      name: agent.name,
      description: agent.description || '',
      model: agent.model,
      apiUrl: agent.apiUrl,
      apiKey: '', // don't expose existing key
      skills: agent.skills?.join(', ') || '',
      mcpServers: agent.mcpServers ? JSON.stringify(agent.mcpServers) : '',
      systemPrompt: agent.systemPrompt || '',
      isActive: agent.isActive,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return
    setIsSubmitting(true)

    const payload = {
      name: formData.name,
      description: formData.description || undefined,
      model: formData.model,
      apiUrl: formData.apiUrl,
      apiKey: formData.apiKey || undefined,
      skills: formData.skills ? formData.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
      mcpServers: formData.mcpServers ? JSON.parse(formData.mcpServers) : undefined,
      systemPrompt: formData.systemPrompt || undefined,
      isActive: formData.isActive,
    }

    try {
      const token = localStorage.getItem('token')
      if (editingAgent) {
        await fetch(`/api/agents/${editingAgent.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      } else {
        await fetch('/api/agents', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      }
      setShowForm(false)
      loadAgents()
    } catch (err) {
      console.error(err)
      alert('儲存失敗')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (agent: AIAgent) => {
    if (!confirm(`確定要停用 "${agent.name}" 嗎？`)) return
    try {
      const token = localStorage.getItem('token')
      await fetch(`/api/agents/${agent.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      loadAgents()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Agent 管理</h1>
          <p className="text-gray-500 mt-1">管理系統中的 AI Agent 角色與配置</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium"
        >
          <Plus size={16} />
          新增 Agent
        </button>
      </div>

      {/* Agent List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">載入中...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Bot size={48} className="mx-auto mb-3 opacity-30" />
          <p>尚無 AI Agent</p>
          <button onClick={openCreate} className="mt-3 text-primary-500 hover:underline text-sm">
            點此新增第一個 Agent
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {agents.map(agent => (
            <div key={agent.id} className={clsx('bg-white rounded-xl border p-5', !agent.isActive && 'opacity-60')}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center text-lg',
                    agent.status === 'online' ? 'bg-green-50 text-green-600' :
                    agent.status === 'busy' ? 'bg-yellow-50 text-yellow-600' :
                    'bg-gray-100 text-gray-400'
                  )}>
                    <Bot size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[agent.status] || STATUS_COLORS.offline)}>
                        {agent.status === 'online' ? '🟢 線上' : agent.status === 'busy' ? '🟡 工作中' : '⚫ 離線'}
                      </span>
                      {!agent.isActive && <span className="text-xs text-gray-400">(已停用)</span>}
                    </div>
                    <p className="text-sm text-gray-500">{agent.description || '—'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(agent)}
                    className="p-2 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg"
                    title="編輯"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(agent)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    title="停用"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Details */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-400 text-xs">模型</span>
                  <p className="font-medium text-gray-700 text-xs mt-0.5">{agent.model}</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-400 text-xs">技能</span>
                  <p className="font-medium text-gray-700 text-xs mt-0.5">{agent.skills?.length || 0} 項</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-400 text-xs">MCP Servers</span>
                  <p className="font-medium text-gray-700 text-xs mt-0.5">
                    {agent.mcpServers ? (Array.isArray(agent.mcpServers) ? agent.mcpServers.length : '-') : 0} 個
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-400 text-xs">最後活動</span>
                  <p className="font-medium text-gray-700 text-xs mt-0.5">
                    {agent.lastActiveAt ? new Date(agent.lastActiveAt).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '從未'}
                  </p>
                </div>
              </div>

              {/* Skills */}
              {agent.skills && agent.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {agent.skills.map(skill => (
                    <span key={skill} className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded-full">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{editingAgent ? '編輯 Agent' : '新增 AI Agent'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名稱 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(d => ({ ...d, name: e.target.value }))}
                  className="input-field"
                  placeholder="例如：代碼審查助手"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData(d => ({ ...d, description: e.target.value }))}
                  className="input-field"
                  placeholder="這個 Agent 的職責描述..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
                  <select
                    value={formData.model}
                    onChange={e => setFormData(d => ({ ...d, model: e.target.value }))}
                    className="input-field"
                  >
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o mini</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    <option value="claude-sonnet-4">Claude Sonnet 4</option>
                    <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
                    <option value="claude-3-opus-latest">Claude 3 Opus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Endpoint</label>
                  <input
                    type="text"
                    value={formData.apiUrl}
                    onChange={e => setFormData(d => ({ ...d, apiUrl: e.target.value }))}
                    className="input-field"
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key {editingAgent && '(留空保持不變)'}</label>
                <input
                  type="password"
                  value={formData.apiKey}
                  onChange={e => setFormData(d => ({ ...d, apiKey: e.target.value }))}
                  className="input-field"
                  placeholder={editingAgent ? '••••••••' : 'sk-...'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能 (逗號分隔)</label>
                <input
                  type="text"
                  value={formData.skills}
                  onChange={e => setFormData(d => ({ ...d, skills: e.target.value }))}
                  className="input-field"
                  placeholder="code_review, documentation, testing"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">MCP Servers (JSON 陣列)</label>
                <textarea
                  value={formData.mcpServers}
                  onChange={e => setFormData(d => ({ ...d, mcpServers: e.target.value }))}
                  className="input-field"
                  rows={2}
                  placeholder='[{"name": "filesystem", "url": "http://..."}]'
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                <textarea
                  value={formData.systemPrompt}
                  onChange={e => setFormData(d => ({ ...d, systemPrompt: e.target.value }))}
                  className="input-field"
                  rows={3}
                  placeholder="你是一個專業的代碼審查助手..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={e => setFormData(d => ({ ...d, isActive: e.target.checked }))}
                  className="w-4 h-4"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">啟用此 Agent</label>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isSubmitting} className="btn-primary">
                  {isSubmitting ? '儲存中...' : '儲存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}