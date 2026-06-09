import { useEffect, useState } from 'react'
import { Users, Trash2, UserPlus, Pencil, Upload, X, CheckCircle, AlertCircle } from 'lucide-react'
import { userApi, roleApi, departmentApi } from '../utils/api'
import type { User, Role, Department } from '../types'
import { useAuth } from '../context/AuthContext'
import { hasAnyPermission } from '../utils/permissions'
import Pagination from '../components/Pagination'
import { DEFAULT_PAGE_SIZE } from '../utils/pagination'

interface BatchResult {
  email: string
  name: string
  success: boolean
  error?: string
}

export default function UsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showBatchForm, setShowBatchForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'developer', departmentId: '' as string })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [availableRoles, setAvailableRoles] = useState<Role[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [batchData, setBatchData] = useState('')
  const [batchResults, setBatchResults] = useState<BatchResult[]>([])
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false)
  const [batchPreview, setBatchPreview] = useState<{ name: string; email: string; role: string; password: string; department: string }[]>([])
  const [filterDepartment, setFilterDepartment] = useState('')

  // Pagination (US-7.x Sprint 9)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Reset to page 1 whenever the department filter changes
  useEffect(() => {
    setPage(1)
  }, [filterDepartment])

  useEffect(() => { loadUsers() }, [filterDepartment, page, pageSize])

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const params: { departmentId?: string; page: number; pageSize: number } = { page, pageSize }
      if (filterDepartment) params.departmentId = filterDepartment
      const [usersRes, rolesRes, deptsRes] = await Promise.all([
        userApi.list(params),
        roleApi.list(),
        departmentApi.list(),
      ])
      setUsers(usersRes.data.users || [])
      setTotalCount(usersRes.data.totalCount ?? usersRes.data.users?.length ?? 0)
      setTotalPages(usersRes.data.totalPages ?? 1)
      setAvailableRoles(rolesRes.data.roles)
      setDepartments(deptsRes.data.departments)
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個用戶嗎？')) return
    try { await userApi.delete(id); loadUsers() } catch (err) { console.error(err) }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role || 'developer',
      departmentId: user.departmentId || ''
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const data: any = { name: formData.name, email: formData.email }
      if (formData.password) data.password = formData.password
      data.role = formData.role
      data.departmentId = formData.departmentId || null

      if (editingUser) {
        await userApi.update(editingUser.id, data)
      } else {
        await userApi.create({ email: formData.email, name: formData.name, password: formData.password, role: formData.role, departmentId: formData.departmentId || undefined })
      }
      setShowForm(false)
      setEditingUser(null)
      setFormData({ name: '', email: '', password: '', role: 'developer', departmentId: '' })
      loadUsers()
    } catch (err) { console.error(err) } finally { setIsSubmitting(false) }
  }

  const openCreate = () => {
    setEditingUser(null)
    setFormData({ name: '', email: '', password: '', role: 'developer', departmentId: '' })
    setShowForm(true)
  }

  const openBatchCreate = () => {
    setBatchData('')
    setBatchResults([])
    setBatchPreview([])
    setShowBatchForm(true)
  }

  const generatePassword = () => Math.random().toString(36).slice(-8)

  // Parse batch data for preview (now includes department as 5th column)
  const parseBatchData = (data: string) => {
    const lines = data.trim().split('\n')
    const preview: { name: string; email: string; role: string; password: string; department: string }[] = []
    for (const line of lines) {
      if (!line.trim()) continue
      const cols = line.split('\t')
      preview.push({
        name: cols[0]?.trim() || '',
        email: cols[1]?.trim() || '',
        role: cols[2]?.trim() || 'developer',
        password: cols[3]?.trim() || '(自動生成)',
        department: cols[4]?.trim() || '(未指定)',
      })
    }
    return preview
  }

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!batchData.trim()) return

    setIsBatchSubmitting(true)
    setBatchResults([])

    // Build department name→id lookup
    const deptNameToId: Record<string, string> = {}
    for (const d of departments) {
      deptNameToId[d.name] = d.id
    }

    const lines = batchData.trim().split('\n')
    const results: BatchResult[] = []

    for (const line of lines) {
      if (!line.trim()) continue

      const cols = line.split('\t')
      const name = cols[0]?.trim()
      const email = cols[1]?.trim()
      const role = cols[2]?.trim() || 'developer'
      const password = cols[3]?.trim() || generatePassword()
      const deptName = cols[4]?.trim()

      if (!name || !email) {
        results.push({ name: name || '(無姓名)', email: email || '(無電郵)', success: false, error: '姓名和電郵為必填' })
        continue
      }

      if (!email.includes('@')) {
        results.push({ name, email, success: false, error: '電郵格式無效' })
        continue
      }

      const departmentId = deptName ? (deptNameToId[deptName] || null) : null

      try {
        await userApi.create({ name, email, password, role, departmentId: departmentId || undefined })
        results.push({ name, email, success: true })
      } catch (err: any) {
        const msg = err?.response?.data?.error?.message || '創建失敗'
        results.push({ name, email, success: false, error: msg })
      }
    }

    setBatchResults(results)
    setIsBatchSubmitting(false)

    if (results.every(r => r.success)) {
      setTimeout(() => {
        setShowBatchForm(false)
        loadUsers()
      }, 1500)
    }
  }

  const BUILT_IN_LABELS: Record<string, string> = {
    admin: '系統管理員', pm: '項目經理', tech_lead: '技術主管', developer: '開發人員', tester: '測試人員', visitor: '訪客'
  }
  const roleLabel = (r?: string) => {
    if (!r) return '-'
    return BUILT_IN_LABELS[r] || r
  }
  const projectRoleLabel = (r: string) => ({ pm: '項目經理', tech_lead: '技術主管', developer: '開發', tester: '測試' }[r] || r)

  const canCreateUser = hasAnyPermission(user, ['users.create'])
  const canEditUser = hasAnyPermission(user, ['users.edit'])
  const canDeleteUser = hasAnyPermission(user, ['users.delete'])

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">用戶管理</h1>
          <p className="text-gray-500 mt-1">管理系統用戶帳號與項目角色</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="input-field w-40"
          >
            <option value="">全部部門</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {canCreateUser && (
            <>
              <button onClick={openCreate} className="btn-primary flex items-center gap-2">
                <UserPlus size={20} /> 新建用戶
              </button>
              <button onClick={openBatchCreate} className="btn-secondary flex items-center gap-2">
                <Upload size={20} /> 批量新增
              </button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" /></div>
      ) : users.length === 0 ? (
        <div className="card p-12 text-center">
          <Users size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">暫無用戶</h3>
          <p className="text-gray-500">創建第一個用戶帳號</p>
        </div>
      ) : (
        <div className="space-y-4">
          {users.map((user) => (
            <div key={user.id} className="card p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-primary-600 font-bold text-lg">{user.name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-lg">{user.name}</p>
                    <p className="text-gray-500 text-sm">{user.email}</p>
                    {user.department && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 mt-1">
                        {user.department.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${user.role === 'admin' ? 'bg-red-100 text-red-700' : user.role === 'pm' ? 'bg-purple-100 text-purple-700' : user.role === 'developer' ? 'bg-orange-100 text-orange-700' : user.role === 'tester' ? 'bg-green-100 text-green-700' : user.role === 'tech_lead' ? 'bg-blue-100 text-blue-700' : 'bg-blue-100 text-blue-700'}`}>
                    {roleLabel(user.role)}
                  </span>
                  {canEditUser && (
                    <button onClick={() => handleEdit(user)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Pencil size={16} />
                    </button>
                  )}
                  {canDeleteUser && (
                    <button onClick={() => handleDelete(user.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {user.projectMemberships && user.projectMemberships.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">項目角色</p>
                  <div className="flex flex-wrap gap-2">
                    {user.projectMemberships.map((m) => (
                      <span key={m.projectId} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                        <span className="font-medium">{m.projectName}</span>
                        <span className="text-gray-400">·</span>
                        <span className={`${m.role === 'pm' ? 'text-purple-600' : m.role === 'tech_lead' ? 'text-green-600' : m.role === 'developer' ? 'text-orange-600' : 'text-blue-600'}`}>
                          {projectRoleLabel(m.role)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <Pagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
          />
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingUser ? '編輯用戶' : '新建用戶'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電子郵件 *</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密碼 {editingUser ? '(留空則保持不變)' : '*'}
                </label>
                <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="input-field" minLength={6} {...(editingUser ? {} : { required: true })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">部門</label>
                <select
                  value={formData.departmentId}
                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                  className="input-field"
                >
                  <option value="">— 未指定 —</option>
стояние {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">全局角色 *</label>
                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="input-field">
                  {availableRoles.map((r) => (
                    <option key={r.id} value={r.name}>{r.description || r.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">全局角色用於登入系統，項目凅色在「項目成員」中設定</p>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => { setShowForm(false); setEditingUser(null) }} className="btn-secondary">取消</button>
                <button type="submit" disabled={isSubmitting} className="btn-primary">
                  {isSubmitting ? (editingUser ? '儲存中...' : '創建中...') : (editingUser ? '儲存' : '創建')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBatchForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">批量新增用戶</h2>
              <button onClick={() => setShowBatchForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm">
              <p className="font-medium text-blue-800 mb-1">📋 Excel 格式說明</p>
              <p className="text-blue-700">直接從 Excel 複製貼上即可，支援 5 欄：</p>
              <p className="text-blue-700 mt-1">格式：<span className="font-mono bg-blue-100 px-1">姓名</span> <span className="text-blue-400">tab</span> <span className="font-mono bg-blue-100 px-1">電郵</span> <span className="text-blue-400">tab</span> <span className="font-mono bg-blue-100 px-1">角色</span> <span className="text-blue-400">tab</span> <span className="font-mono bg-blue-100 px-1">密碼(可留空)</span> <span className="text-blue-400">tab</span> <span className="font-mono bg-blue-100 px-1">部門(可留空)</span></p>
              <p className="text-blue-600 mt-1">角色：admin, pm, tech_lead, developer, tester｜部門名稱需與系統中一致</p>
            </div>

            <form onSubmit={handleBatchSubmit} className="flex-1 flex flex-col">
              <div className="flex-1 mb-4">
                <textarea
                  value={batchData}
                  onChange={(e) => {
                    setBatchData(e.target.value)
                    setBatchPreview(parseBatchData(e.target.value))
                  }}
                  placeholder="張三	zhangsan@example.com	developer	pass123	研發部
李四	lisi@example.com	pm		產品部
王五	wangwu@example.com	developer		"
                  className="w-full h-48 p-3 border rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Preview Table */}
              {batchPreview.length > 0 && (
                <div className="mb-4 max-h-60 overflow-auto border rounded-lg">
                  <div className="p-2 bg-gray-50 border-b sticky top-0">
                    <p className="text-sm font-medium text-gray-700">預覽（共 {batchPreview.length} 筆）</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-8">
                      <tr className="text-left text-gray-500">
                        <th className="p-2 font-medium">姓名</th>
                        <th className="p-2 font-medium">電郵</th>
                        <th className="p-2 font-medium">角色</th>
                        <th className="p-2 font-medium">密碼</th>
                        <th className="p-2 font-medium">部門</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {batchPreview.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="p-2">{row.name || <span className="text-red-400">必填</span>}</td>
                          <td className="p-2">{row.email || <span className="text-red-400">必填</span>}</td>
                          <td className="p-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              row.role === 'admin' ? 'bg-red-100 text-red-700' :
                              row.role === 'pm' ? 'bg-purple-100 text-purple-700' :
                              row.role === 'tech_lead' ? 'bg-blue-100 text-blue-700' :
                              row.role === 'developer' ? 'bg-orange-100 text-orange-700' :
                              row.role === 'tester' ? 'bg-green-100 text-green-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {row.role || 'developer'}
                            </span>
                          </td>
                          <td className="p-2 text-gray-400 text-xs">{row.password}</td>
                          <td className="p-2 text-gray-600 text-xs">{row.department}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {batchResults.length > 0 && (
                <div className="mb-4 max-h-48 overflow-y-auto border rounded-lg">
                  <div className="p-2 bg-gray-50 border-b sticky top-0">
                    <p className="text-sm font-medium">
                      結果：{batchResults.filter(r => r.success).length}/{batchResults.length} 成功
                    </p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {batchResults.map((r, i) => (
                      <div key={i} className="w-full flex items-center gap-2 text-sm">
                        {r.success ? (
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                        <span className="font-medium">{r.name}</span>
                        <span className="text-gray-500">{r.email}</span>
                        {!r.success && <span className="text-red-500 text-xs">{r.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowBatchForm(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isBatchSubmitting || !batchData.trim()} className="btn-primary">
                  {isBatchSubmitting ? '處理中...' : '確認新增'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
