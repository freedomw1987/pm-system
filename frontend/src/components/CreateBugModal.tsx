/**
 * CreateBugModal — 新建缺陷 modal
 *
 * 對應 bug fix 2026-06-09:
 *   - bug #2: 全部缺陷列表加「新建缺陷」按鈕(由 BugsPage 觸發)
 *   - bug #7(US-5.1): 新建缺陷描述要支援 image paste(用 RichTextEditor)
 *                   同時要有「指派給誰」dropdown
 *
 * Props:
 *   - onClose(): 關閉 modal
 *   - onCreated(msg): 建立成功,parent 重 load + 顯示 success
 *   - defaultProjectId?: 預選項目
 *   - defaultTaskId?: 預選任務(從 task detail 觸發時)
 *   - defaultRequirementId?: 預選需求(從 requirement detail 觸發時)
 */
import { useEffect, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { bugApi, projectApi, taskApi, requirementApi } from '../utils/api'
import type { Project, User, Task, Requirement } from '../types'
import RichTextEditor from './RichTextEditor'

interface CreateBugModalProps {
  onClose: () => void
  onCreated: (msg: string) => void
  defaultProjectId?: string
  defaultTaskId?: string
  defaultRequirementId?: string
}

const SEVERITY_LABELS: Record<string, string> = {
  low: '輕微',
  medium: '中等',
  high: '高',
  critical: '嚴重',
}

export default function CreateBugModal({
  onClose,
  onCreated,
  defaultProjectId,
  defaultTaskId,
  defaultRequirementId,
}: CreateBugModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [projectId, setProjectId] = useState(defaultProjectId || '')
  const [taskId, setTaskId] = useState(defaultTaskId || '')
  const [requirementId, setRequirementId] = useState(defaultRequirementId || '')
  const [assigneeId, setAssigneeId] = useState('')

  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [projectMembers, setProjectMembers] = useState<User[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Load projects for the dropdown
  useEffect(() => {
    projectApi.list()
      .then(res => setProjects(res.data.projects || []))
      .catch(err => console.error('Failed to load projects:', err))
  }, [])

  // Load tasks and requirements for selected project
  useEffect(() => {
    if (!projectId) {
      setTasks([])
      setRequirements([])
      return
    }
    // Tasks
    taskApi.list({ projectId })
      .then(res => setTasks(res.data.tasks || []))
      .catch(err => console.error('Failed to load tasks:', err))
    // Requirements
    requirementApi.list(projectId)
      .then(res => setRequirements(res.data.requirements || []))
      .catch(err => console.error('Failed to load requirements:', err))
  }, [projectId])

  // Load project members for assignee dropdown
  useEffect(() => {
    if (!projectId) {
      setProjectMembers([])
      return
    }
    projectApi.getMembers(projectId)
      .then(res => {
        const members = (res.data.members || [])
          .map((m: { user: User }) => m.user)
          .filter(Boolean)
        setProjectMembers(members)
      })
      .catch(err => {
        console.error('Failed to load project members:', err)
        setProjectMembers([])
      })
  }, [projectId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('請輸入缺陷標題')
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      await bugApi.create({
        title: title.trim(),
        description: description || undefined,
        severity,
        projectId: projectId || undefined,
        taskId: taskId || undefined,
        requirementId: requirementId || undefined,
        assigneeId: assigneeId || undefined,
      })
      onCreated(`已建立缺陷「${title}」`)
    } catch (err: any) {
      console.error('Failed to create bug:', err)
      setError(err?.response?.data?.error?.message || '建立缺陷失敗')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            新建缺陷
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
            aria-label="關閉"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-100 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              標題 *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field w-full"
              placeholder="輸入缺陷標題"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              描述
            </label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="輸入缺陷描述,可貼上/拖拽圖片..."
              rows={6}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                嚴重程度
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="input-field w-full"
              >
                {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                指派給誰
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="input-field w-full"
                disabled={!projectId}
              >
                <option value="">-- 不指定 --</option>
                {projectMembers.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              {!projectId && (
                <p className="text-xs text-gray-400 mt-1">先選項目先可以指派</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              項目
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input-field w-full"
            >
              <option value="">-- 不指定 --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                關聯任務
              </label>
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="input-field w-full"
                disabled={!projectId}
              >
                <option value="">-- 無 --</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                關聯需求
              </label>
              <select
                value={requirementId}
                onChange={(e) => setRequirementId(e.target.value)}
                className="input-field w-full"
                disabled={!projectId}
              >
                <option value="">-- 無 --</option>
                {requirements.map(r => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary order-2 sm:order-1"
              disabled={isSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary order-1 sm:order-2"
            >
              {isSubmitting ? '建立中...' : '建立缺陷'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
