import type { ReactNode } from 'react'
import { Bot } from 'lucide-react'
import RichTextEditor from './RichTextEditor'
import FullscreenModal from './FullscreenModal'
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
  /** Override heading text。default "新建任務";Edit mode 改 "編輯任務" */
  titleText?: string

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

  // TD-NEW-7 (Sprint 18): extraFields slot —— EditTaskModal 用嚟 inject
  // Status dropdown (Edit 專用) 而唔等 share 邏輯。Slot 喺「父任務」select
  // 後面 render,add/remove 唔影響其他 field。Create flow 唔 pass(slot undefined)
  // 行為同 Sprint 17 統一後完全一樣。
  extraFields?: ReactNode

  // 提供時,RichTextEditor 會把貼上嘅圖真正 upload 去 /api/attachments
  // (Edit mode 用,Create mode 冇 ID,主 caller 喺 onSubmit 之後 migrate data URL)
  uploadEntity?: { type: 'task'; id: string }

  // Submission
  submitLabel: string
  isSubmitting: boolean
  onSubmit: (e: React.SyntheticEvent) => void
}

export default function AddTaskModal({
  open,
  onClose,
  titleText = '新建任務',
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
  extraFields,
  uploadEntity,
  submitLabel,
  isSubmitting,
  onSubmit,
}: AddTaskModalProps) {
  if (!open) return null

  return (
    <FullscreenModal
      open={open}
      onClose={onClose}
      title={titleText}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            取消
          </button>
          <button
            type="submit"
            form="add-task-form"
            disabled={!title.trim() || isSubmitting}
            className="btn-primary"
          >
            {isSubmitting ? '儲存中...' : submitLabel}
          </button>
        </>
      }
    >
      <form id="add-task-form" onSubmit={onSubmit} className="space-y-4">
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
            {...(uploadEntity ? { uploadEntity } : {})}
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
            /*
             * RWD-fix (Sprint 17.1):320px viewport 之前撞 3 個 layout bug:
             * 1. Avatar 冇 flex-shrink-0 會被 squish
             * 2. flex-1 冇 min-w-0,長 agent name 撐爆父 container,推 chips overflow
             * 3. Skill chips 用 inline <span> + ml-1,inline 唔可以 wrap 喺 chip 邊界
             *
             * 修法:外層 mobile stack(flex-col),sm: 之後返 flex-row;chips 用 flex-wrap container;
             *      avatar / chip 都加 shrink-0;agent name truncate(視覺接受 ellipsis 唔接受 overflow)
             */
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-white rounded-lg border border-blue-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{recommendedAgent.name}</p>
                  <div className="text-sm text-gray-500 flex flex-wrap items-center gap-1 mt-1">
                    <span className="flex-shrink-0">匹配技能：</span>
                    {recommendedAgent.skills.map((s) => (
                      <span key={s} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {autoAssignAgent && (
                <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded flex-shrink-0 whitespace-nowrap self-start sm:self-center">將自動分配</span>
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

        {extraFields}
      </form>
    </FullscreenModal>
  )
}
