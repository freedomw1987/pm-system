import { X, Bot } from 'lucide-react'
import RichTextEditor from './RichTextEditor'
import ToggleMultiSelect from './ToggleMultiSelect'
import type { Task } from '../types'

export interface RecommendedAgent {
  id: string
  name: string
  skills: string[]
}

export interface MemberOption {
  id: string
  name: string
}

export interface AddTaskModalProps {
  // Visibility
  open: boolean
  onClose: () => void

  // Form state (controlled)
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  assigneeId: string
  setAssigneeId: (v: string) => void
  participantIds: string[]
  setParticipantIds: (v: string[]) => void
  parentTaskId: string
  setParentTaskId: (v: string) => void

  // Smart-assign panel
  autoAssignAgent: boolean
  setAutoAssignAgent: (v: boolean) => void
  recommendedAgent: RecommendedAgent | null

  // Options
  assigneeOptions: MemberOption[]
  participantOptions: MemberOption[]
  parentTaskOptions: Pick<Task, 'id' | 'title'>[]

  // Submission
  isSubmitting: boolean
  onSubmit: (e: React.FormEvent) => void
}

export default function AddTaskModal({
  open,
  onClose,
  title,
  setTitle,
  description,
  setDescription,
  assigneeId,
  setAssigneeId,
  participantIds,
  setParticipantIds,
  parentTaskId,
  setParentTaskId,
  autoAssignAgent,
  setAutoAssignAgent,
  recommendedAgent,
  assigneeOptions,
  participantOptions,
  parentTaskOptions,
  isSubmitting,
  onSubmit,
}: AddTaskModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">新建任務</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
            aria-label="關閉"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">標題 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field w-full"
              placeholder="輸入任務標題"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="輸入任務描述"
              rows={6}
            />
          </div>

          {/* Smart Assignment */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900">智能分配</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAssignAgent}
                  onChange={(e) => {
                    setAutoAssignAgent(e.target.checked)
                    if (e.target.checked && recommendedAgent) {
                      setAssigneeId(recommendedAgent.id)
                    } else if (!e.target.checked) {
                      setAssigneeId('')
                    }
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {recommendedAgent ? (
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-200">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{recommendedAgent.name}</p>
                  <p className="text-sm text-gray-500">
                    匹配技能：
                    {recommendedAgent.skills.map((s) => (
                      <span key={s} className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                        {s}
                      </span>
                    ))}
                  </p>
                </div>
                {autoAssignAgent && (
                  <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">將自動分配</span>
                )}
              </div>
            ) : title.length >= 3 ? (
              <p className="text-sm text-gray-500">正在分析任務內容...</p>
            ) : (
              <p className="text-sm text-gray-400">輸入任務標題以獲取推薦</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">負責人</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="input-field w-full"
            >
              <option value="">-- 不指定 --</option>
              {assigneeOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">參與人</label>
            <ToggleMultiSelect
              options={participantOptions}
              value={participantIds}
              onChange={setParticipantIds}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">父任務</label>
            <select
              value={parentTaskId}
              onChange={(e) => setParentTaskId(e.target.value)}
              className="input-field w-full"
            >
              <option value="">無父任務</option>
              {parentTaskOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              取消
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? '建立中...' : '建立任務'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
