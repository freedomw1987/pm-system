/**
 * AddBugModal — Sprint 18 TD-NEW-6 (extracted from ProjectDetailPage)
 *
 * 點解抽:ProjectDetailPage 內部 local function `AddBugModal` (~50 行)
 * 同 `CreateBugModal.tsx` (orphan, 0 caller) 係同一個 component 嘅兩份
 * divergence。Sprint 11 拎走 `/bugs` page 之後 `CreateBugModal.tsx` 0 caller,
 * 屬 dead code,留喺 repo 將來 grep 會撞。本 sprint 拎走 dead code + 將 live
 * 嗰份抽出去 standalone file 統一入口。
 *
 * Pattern 同 AddTaskModal 一致:controlled component,form state 由 caller 管。
 * `extraFields` slot 預留畀將來(eg. RequirementDetailPage 想加 requirement
 * 上下文 linking)用。
 *
 * 對應紅線 13/14: dead code / 唔同入口但同一功能嘅 component 要統一
 * (跟 AddTaskModal unify 嘅 Sprint 17 pattern)
 */

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import RichTextEditor from './RichTextEditor'

export interface MemberOption {
  id: string
  name: string
}

export interface AddBugModalProps {
  // Visibility
  open: boolean
  onClose: () => void

  // Form state (controlled)
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  severity: 'low' | 'medium' | 'high' | 'critical'
  setSeverity: (v: 'low' | 'medium' | 'high' | 'critical') => void
  assigneeId: string
  setAssigneeId: (v: string) => void

  // Options
  assigneeOptions: MemberOption[]

  // Future-proofing: 將來 RequirementDetailPage 想加 linking 唔需要 fork
  extraFields?: ReactNode

  // Submission
  submitLabel: string
  isSubmitting: boolean
  onSubmit: (e: React.SyntheticEvent) => void
}

export default function AddBugModal({
  open,
  onClose,
  title,
  setTitle,
  description,
  setDescription,
  severity,
  setSeverity,
  assigneeId,
  setAssigneeId,
  assigneeOptions,
  extraFields,
  submitLabel,
  isSubmitting,
  onSubmit,
}: AddBugModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">新建缺陷</h2>
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
              placeholder="輸入缺陷標題"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="輸入缺陷描述"
              rows={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">嚴重程度</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
              className="input-field w-full"
            >
              <option value="low">輕微</option>
              <option value="medium">中等</option>
              <option value="high">高</option>
              <option value="critical">嚴重</option>
            </select>
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
          {extraFields}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              取消
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? '儲存中...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
