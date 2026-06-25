import { useEffect, useState, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bot, Send, Plus, Trash2, X,
  MessageSquare, Loader2, Settings, Brain, ChevronDown, ChevronUp, CheckCircle2, AlertCircle
} from 'lucide-react'
import clsx from 'clsx'
import api from '../utils/api'
import { uuid } from '../utils/uuid'

// Custom component to render thinking tags differently
function ThinkingBlock({ content }: { content: string }) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div className="my-2 rounded-lg border border-purple-200 bg-purple-50 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-purple-100 hover:bg-purple-200 transition-colors text-left"
      >
        <Brain size={14} className="text-purple-600" />
        <span className="text-xs font-medium text-purple-700">AI 思考過程</span>
        <span className="text-xs text-purple-500">{collapsed ? '（點擊展開）' : '（點擊隱藏）'}</span>
        <div className="ml-auto">
          {collapsed ? <ChevronDown size={14} className="text-purple-500" /> : <ChevronUp size={14} className="text-purple-500" />}
        </div>
      </button>
      {!collapsed && (
        <div className="px-3 py-2 text-xs text-purple-700 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  )
}

function ToolActivityList({ activities }: { activities?: ToolActivity[] }) {
  if (!activities?.length) return null

  return (
    <div className="mb-3 space-y-1.5">
      {activities.map((activity, index) => {
        const isStarted = activity.status === 'started'
        const isCompleted = activity.status === 'completed'
        const isFailed = activity.status === 'failed'
        return (
          <div
            key={`${activity.toolName}-${index}-${activity.status}`}
            className={clsx(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
              isStarted && 'border-blue-100 bg-blue-50 text-blue-700',
              isCompleted && 'border-emerald-100 bg-emerald-50 text-emerald-700',
              isFailed && 'border-red-100 bg-red-50 text-red-700'
            )}
          >
            {isStarted ? (
              <Loader2 size={13} className="animate-spin flex-shrink-0" />
            ) : isCompleted ? (
              <CheckCircle2 size={13} className="flex-shrink-0" />
            ) : (
              <AlertCircle size={13} className="flex-shrink-0" />
            )}
            <span className="font-medium">{activity.label}</span>
            {typeof activity.resultCount === 'number' && isCompleted && (
              <span className="text-gray-500">找到 {activity.resultCount} 筆</span>
            )}
            {activity.error && <span className="text-red-500">{activity.error}</span>}
          </div>
        )
      })}
    </div>
  )
}

// Extracts chart config from HTML blocks
function parseChartConfig(html: string): { canvasId: string; config: any }[] {
  const charts: { canvasId: string; config: any }[] = []

  // Match <canvas id="xxx" data-config='{"..."}'>
  const canvasRegex = /<canvas\s+id="([^"]+)"[^>]*>/gi
  let match

  while ((match = canvasRegex.exec(html)) !== null) {
    const canvasId = match[1]
    const fullMatch = match[0]

    // Try to extract data-config JSON
    const configMatch = fullMatch.match(/data-config='([^']+)'/)
    if (configMatch) {
      try {
        const config = JSON.parse(configMatch[1])
        charts.push({ canvasId, config })
        continue
      } catch {}
    }

    // Fallback: extract config from new Chart() in script after canvas
    const afterCanvas = html.slice(match.index + match[0].length, match.index + match[0].length + 2000)
    const scriptMatch = afterCanvas.match(/<script[^>]*>\s*new\s+Chart\s*\(\s*[^,]*,\s*({[\s\S]*?})\s*\)\s*;?\s*<\/script>/i)
    if (scriptMatch) {
      try {
        const fixed = scriptMatch[1]
          .replace(/([{,]\s*)(\w+)(\s*):/g, '$1"$2"$3:')
          .replace(/:\s*'([^']*)'/g, ': "$1"')
        const config = JSON.parse(fixed)
        charts.push({ canvasId, config })
      } catch (e) {
        console.log('Chart config parse error:', e)
      }
    }
  }

  return charts
}

function ChartBlock({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [chartReady, setChartReady] = useState(false)

  // Parse configs after mount
  const chartConfigs = useMemo(() => parseChartConfig(content), [content])

  // Load Chart.js CDN once
  useEffect(() => {
    if ((window as any).Chart) {
      setChartReady(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js'
    script.onload = () => setChartReady(true)
    script.onerror = () => console.error('Failed to load Chart.js')
    document.head.appendChild(script)
  }, [])

  // Inject HTML and render charts
  useEffect(() => {
    if (!chartReady || !containerRef.current || chartConfigs.length === 0) return

    // Inject HTML via innerHTML
    containerRef.current.innerHTML = content

    // Wait a tick for DOM to update, then init charts
    requestAnimationFrame(() => {
      for (const { canvasId, config } of chartConfigs) {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement
        if (!canvas) continue
        try {
          if ((canvas as any)._chart) (canvas as any)._chart.destroy()
          ;(canvas as any)._chart = new (window as any).Chart(canvas, config)
        } catch (e) {
          console.error(`Chart init error [${canvasId}]:`, e)
        }
      }
    })
  }, [chartReady, chartConfigs, content])

  return <div ref={containerRef} className="my-4 p-4 bg-white rounded-lg border border-gray-200 overflow-x-auto" />
}

// Process markdown to extract thinking tags and render specially
function processContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi
  // Support both ```html and 「html formats
  const htmlBlockRegex = /(?:```html|「html)([\s\S]*?)(?:```|」)/gi
  let match

  // First handle thinking blocks and HTML blocks together
  const allBlocks: { index: number; length: number; type: 'think' | 'html'; content: string }[] = []

  // Find thinking blocks
  while ((match = thinkRegex.exec(content)) !== null) {
    allBlocks.push({
      index: match.index,
      length: match[0].length,
      type: 'think',
      content: match[1].trim()
    })
  }

  // Find HTML blocks
  while ((match = htmlBlockRegex.exec(content)) !== null) {
    allBlocks.push({
      index: match.index,
      length: match[0].length,
      type: 'html',
      content: match[1].trim()
    })
  }

  // Sort by index
  allBlocks.sort((a, b) => a.index - b.index)

  // Build result
  let pos = 0
  for (const block of allBlocks) {
    if (block.index > pos) {
      // Add text before block
      const textBefore = content.slice(pos, block.index)
      if (textBefore) {
        parts.push(textBefore)
      }
    }

    if (block.type === 'think') {
      parts.push(<ThinkingBlock key={`think-${block.index}`} content={block.content} />)
    } else if (block.type === 'html') {
      // Decode all HTML entities and escaped characters
      const htmlContent = block.content
        .replace(/\\</g, '<')
        .replace(/\\>/g, '>')
        .replace(/\\&/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
      parts.push(<ChartBlock key={`html-${block.index}`} content={htmlContent} />)
    }

    pos = block.index + block.length
  }

  // Add remaining text
  if (pos < content.length) {
    parts.push(content.slice(pos))
  }

  return parts
}

interface ToolActivity {
  id?: string
  status: 'started' | 'completed' | 'failed'
  toolName: string
  label: string
  query?: string
  resultCount?: number
  error?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolActivities?: ToolActivity[]
}

interface ChatSession {
  id: string
  title: string
  projectId: string | null
  project?: { id: string; name: string }
  _count?: { messages: number }
  updatedAt: string
}

interface Project {
  id: string
  name: string
  status?: string
}

export default function ChatPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const token = localStorage.getItem('accessToken')

  // Load sessions
  useEffect(() => {
    if (!token) { navigate('/login'); return }
    fetchSessions()
    fetchProjects()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/chat/sessions', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch (e) {
      console.error(e)
    }
  }

  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects', { params: { limit: -1 } })
      setProjects(res.data.projects || [])
    } catch (e) {
      console.error(e)
    }
  }

  const loadMessages = async (session: ChatSession) => {
    try {
      const res = await fetch(`/api/chat/sessions/${session.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setMessages(data.messages || [])
      setActiveSession(session)
      setSidebarOpen(false)
    } catch (e) {
      console.error(e)
    }
  }

  const createSession = async (projectId?: string): Promise<ChatSession | null> => {
    try {
      const res = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ projectId: projectId || undefined })
      })
      const data = await res.json()
      const newSession: ChatSession = data.session
      setSessions(prev => [newSession, ...prev.filter(s => s.id !== newSession.id)])
      setMessages([])
      setActiveSession(newSession)
      setSidebarOpen(false)
      return newSession
    } catch (e) {
      console.error(e)
      return null
    }
  }

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('刪除這個對話？')) return
    try {
      await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      if (activeSession?.id === sessionId) {
        setActiveSession(null)
        setMessages([])
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleSend = async () => {
    if (!input.trim() || streaming) return
    const content = input.trim()
    setInput('')

    // Create session if none exists
    let session = activeSession
    if (!session) {
      setStreaming(true)
      const res = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ projectId: selectedProjectId || undefined })
      })
      const data = await res.json()
      const newSession: ChatSession = data.session
      session = newSession
      setSessions(prev => [newSession, ...prev.filter(s => s.id !== newSession.id)])
      setActiveSession(newSession)
    }

    // Add user message immediately
    const userMsg: ChatMessage = { id: uuid(), role: 'user', content }
    setMessages(prev => [...prev, userMsg])
    setStreaming(true)

    const assistantMsgId = uuid()
    let assistantContent = ''
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }])

    abortRef.current = new AbortController()

    try {
      const res = await fetch(`/api/chat/sessions/${session!.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content }),
        signal: abortRef.current.signal
      })

      if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        throw new Error(`Server error: ${res.status} ${errorText}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const activity = parsed?.tool_activity as ToolActivity | undefined
            if (activity?.toolName && activity?.status) {
              setMessages(prev =>
                prev.map(m => {
                  if (m.id !== assistantMsgId) return m
                  const existing = m.toolActivities || []
                  const activityIndex = activity.id
                    ? existing.findIndex(item => item.id === activity.id)
                    : -1

                  if (activityIndex >= 0) {
                    return {
                      ...m,
                      toolActivities: existing.map((item, index) =>
                        index === activityIndex ? { ...item, ...activity } : item
                      )
                    }
                  }

                  return { ...m, toolActivities: [...existing, activity] }
                })
              )
              continue
            }

            const delta = parsed?.choices?.[0]?.delta?.content
            if (typeof delta === 'string' && delta) {
              assistantContent += delta
              setMessages(prev =>
                prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantContent } : m)
              )
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        assistantContent += `\n\n[錯誤: ${e.message}]`
        setMessages(prev =>
          prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantContent } : m)
        )
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)]">
      {/* Session Sidebar */}
      <aside className={clsx(
        'fixed lg:static inset-y-0 left-0 z-50 w-72 lg:w-80 bg-white border-r border-gray-200 flex flex-col',
        'transform transition-transform duration-200 ease-in-out lg:transform-none',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot size={20} className="text-primary-500" />
            <span className="font-bold text-gray-900">AI 助手</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        <button
          onClick={() => createSession(selectedProjectId || undefined)}
          className="mx-4 my-3 flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium"
        >
          <Plus size={16} />
          新建對話
        </button>

        <div className="flex-1 overflow-y-auto">
          {sessions.map(session => (
            <div
              key={session.id}
              onClick={() => loadMessages(session)}
              className={clsx(
                'flex items-center justify-between gap-2 px-4 py-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors',
                activeSession?.id === session.id && 'bg-primary-50 border-l-2 border-primary-500'
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{session.title || '新聊天'}</p>
                <p className="text-xs text-gray-500 truncate">{session.project?.name || '未指定項目'}</p>
              </div>
              <button
                onClick={(e) => deleteSession(session.id, e)}
                className="p-1 text-gray-400 hover:text-red-500 rounded flex-shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-12">
              尚無對話記錄
            </div>
          )}
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg mr-1"
          >
            <MessageSquare size={20} />
          </button>

          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            className="input-field py-1.5 text-sm max-w-56"
          >
            {/* Sprint 21 US-21.5: empty value → cross-project query. AI will
                search across all member projects (or all projects for admin). */}
            <option value="">🌐 全部項目 (跨項目搜尋)</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <div className="flex-1" />

          <button
            onClick={() => setSettingsOpen(s => !s)}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            title="設定"
          >
            <Settings size={18} />
          </button>
        </div>

        {settingsOpen && (
          <div className="bg-white border-b border-gray-200 px-4 py-3 text-sm space-y-1">
            <Link to="/profile" className="block px-3 py-2 hover:bg-gray-50 rounded-lg" onClick={() => setSettingsOpen(false)}>
              用戶設定
            </Link>
            <Link to="/users" className="block px-3 py-2 hover:bg-gray-50 rounded-lg" onClick={() => setSettingsOpen(false)}>
              用戶管理
            </Link>
            <Link to="/roles" className="block px-3 py-2 hover:bg-gray-50 rounded-lg" onClick={() => setSettingsOpen(false)}>
              角色權限
            </Link>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {!activeSession && !streaming && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot size={56} className="text-primary-200 mb-4" />
              <h2 className="text-xl font-bold text-gray-700 mb-2">AI 助手</h2>
              <p className="text-gray-400 text-sm max-w-xs">
                選擇或建立一個對話，AI 會幫你管理項目中的需求、任務和缺陷
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md px-4">
                {[
                  { icon: '📋', text: '查看這個項目的所有需求' },
                  { icon: '🐛', text: '新增一個缺陷' },
                  { icon: '✅', text: '建立一個任務' },
                  { icon: '📄', text: '搜尋 Wiki 文件' },
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      createSession(selectedProjectId || undefined).then(session => {
                        if (session) {
                          setActiveSession(session)
                          setMessages([])
                          setInput(prompt.text)
                        }
                      })
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-left text-sm text-gray-600 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-colors shadow-sm"
                  >
                    <span>{prompt.icon}</span>
                    <span className="text-xs">{prompt.text}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => createSession(selectedProjectId || undefined)}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm"
              >
                <Plus size={16} />
                開始新對話
              </button>
            </div>

          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={clsx(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={clsx(
                  'max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary-500 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                )}
              >
                {msg.role === 'assistant' ? (
                  <>
                    <ToolActivityList activities={msg.toolActivities} />
                    {msg.content ? (
                      <div className="max-w-none">
                        {processContent(msg.content).map((part, i) =>
                          typeof part === 'string' ? (
                            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                              {part}
                            </ReactMarkdown>
                          ) : part
                        )}
                      </div>
                    ) : msg.toolActivities?.length ? null : (
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Loader2 size={14} className="animate-spin" />
                        <span>AI 思考中...</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="bg-white border-t border-gray-200 px-4 py-3 pb-2">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="輸入訊息...（Enter 傳送，Shift+Enter 換行）"
              rows={1}
              className="flex-1 resize-none input-field py-2.5 text-sm max-h-32 overflow-y-auto"
              disabled={streaming}
            />
            <button
              onClick={handleSend}
              disabled={streaming || !input.trim()}
              className="p-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-40 flex-shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">AI 助手可幫你建立和管理項目中的需求、任務與缺陷</p>
        </div>
      </main>
    </div>
  )
}
