import { useEffect, useState } from 'react'
import { Users, Trash2, UserPlus, Pencil } from 'lucide-react'
import { userApi, roleApi } from '../utils/api'
import type { User, Role } from '../types'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'developer' as string })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [availableRoles, setAvailableRoles] = useState<Role[]>([])

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const [usersRes, rolesRes] = await Promise.all([
        userApi.list(),
        roleApi.list(),
      ])
      setUsers(usersRes.data.users)
      setAvailableRoles(rolesRes.data.roles)
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
    setFormData({ name: user.name, email: user.email, password: '', role: user.role || 'developer' })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      if (editingUser) {
        const data: any = { name: formData.name, email: formData.email }
        if (formData.password) data.password = formData.password
        if (formData.role) data.role = formData.role
        await userApi.update(editingUser.id, data)
      } else {
        await userApi.create({ email: formData.email, name: formData.name, password: formData.password, role: formData.role })
      }
      setShowForm(false); setEditingUser(null); setFormData({ name: '', email: '', password: '', role: 'developer' }); loadUsers()
    } catch (err) { console.error(err) } finally { setIsSubmitting(false) }
  }

  const openCreate = () => {
    setEditingUser(null)
    setFormData({ name: '', email: '', password: '', role: 'developer' })
    setShowForm(true)
  }

  const roleLabel = (r?: string) => ({ admin: '系統管理員', pm: '項目經理', tech_lead: '技術主管', developer: '開發人員', tester: '測試人員', visitor: '訪客' }[r || ''] || r || '-')
  const projectRoleLabel = (r: string) => ({ pm: '項目經理', tech_lead: '技術主管', developer: '開發', tester: '測試' }[r] || r)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">用戶管理</h1>
          <p className="text-gray-500 mt-1">管理系統用戶帳號與項目角色</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <UserPlus size={20} /> 新建用戶
        </button>
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
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${user.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                    {roleLabel(user.role)}
                  </span>
                  <button onClick={() => handleEdit(user)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDelete(user.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">全局角色 *</label>
                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="input-field">
                  {availableRoles.map((r) => (
                    <option key={r.id} value={r.name}>{r.description || r.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">全局角色用於登入系統，項目角色在「項目成員」中設定</p>
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
    </div>
  )
}