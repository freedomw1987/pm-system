import { useState, useEffect } from 'react'
import { Settings, Eye, EyeOff, Save, AlertCircle, CheckCircle, Image } from 'lucide-react'

interface LLMConfig {
  id?: string
  apiUrl: string
  model: string
  visionApiUrl?: string
  visionModel?: string
  hasVisionKey?: boolean
  updatedAt?: string
}

export default function SettingsPage() {
  const [config, setConfig] = useState<LLMConfig>({ apiUrl: '', model: '' })
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [visionApiKey, setVisionApiKey] = useState('')
  const [showVisionKey, setShowVisionKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [currentConfig, setCurrentConfig] = useState<LLMConfig | null>(null)

  useEffect(() => {
    fetch('/api/llm-config', {
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          setCurrentConfig(data)
          setConfig({
            apiUrl: data.apiUrl,
            model: data.model,
            visionApiUrl: data.visionApiUrl || '',
            visionModel: data.visionModel || ''
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setError('')
    setSuccess('')
    if (!config.apiUrl || !config.model) {
      setError('請填寫 API URL 和 Model')
      return
    }
    setSaving(true)
    try {
      const body: any = {
        apiUrl: config.apiUrl,
        model: config.model,
        visionApiUrl: config.visionApiUrl || undefined,
        visionModel: config.visionModel || undefined
      }
      if (apiKey) body.apiKey = apiKey
      if (visionApiKey) body.visionApiKey = visionApiKey
      const res = await fetch('/api/llm-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || '儲存失敗')
      setCurrentConfig(data)
      setApiKey('')
      setVisionApiKey('')
      setSuccess('設定已儲存')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-gray-500">載入中...</div>

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={28} className="text-primary-500" />
        <h1 className="text-2xl font-bold text-gray-900">AI 設定</h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle size={18} />
          <span>{success}</span>
        </div>
      )}

      {/* Main LLM Config */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800">一般對話 LLM</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">API URL</label>
          <input
            type="url"
            value={config.apiUrl}
            onChange={e => setConfig(c => ({ ...c, apiUrl: e.target.value }))}
            placeholder="https://openrouter.ai/api/v1"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <p className="mt-1 text-sm text-gray-500">例如：OpenRouter、Ollama、Fireworks AI 等</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
          <input
            type="text"
            value={config.model}
            onChange={e => setConfig(c => ({ ...c, model: e.target.value }))}
            placeholder="openai/gpt-4o-mini"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key {currentConfig && <span className="text-gray-400 font-normal">（留空保持不變）</span>}
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              type="button"
              onClick={() => setShowKey(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Vision LLM Config */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 mb-6">
        <div className="flex items-center gap-2">
          <Image size={20} className="text-primary-500" />
          <h2 className="text-lg font-semibold text-gray-800">圖像分析 LLM（Vision）</h2>
        </div>
        <p className="text-sm text-gray-500 -mt-4">用於 PDF 文件分析和圖像識別，請選擇支援 Vision 的模型（如 gpt-4o、claude-3-sonnet）</p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">API URL</label>
          <input
            type="url"
            value={config.visionApiUrl || ''}
            onChange={e => setConfig(c => ({ ...c, visionApiUrl: e.target.value }))}
            placeholder="https://openrouter.ai/api/v1"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
          <input
            type="text"
            value={config.visionModel || ''}
            onChange={e => setConfig(c => ({ ...c, visionModel: e.target.value }))}
            placeholder="openai/gpt-4o"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key {currentConfig?.hasVisionKey && <span className="text-gray-400 font-normal">（留空保持不變）</span>}
          </label>
          <div className="relative">
            <input
              type={showVisionKey ? 'text' : 'password'}
              value={visionApiKey}
              onChange={e => setVisionApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              type="button"
              onClick={() => setShowVisionKey(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showVisionKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      </div>

      {currentConfig && (
        <div className="pt-4 text-sm text-gray-500">
          上次更新：{new Date(currentConfig.updatedAt!).toLocaleString('zh-HK')}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
      >
        <Save size={18} />
        {saving ? '儲存中...' : '儲存設定'}
      </button>
    </div>
  )
}