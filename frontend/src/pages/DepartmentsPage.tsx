import { useEffect, useState } from 'react'
import { Building2, Plus, Pencil, Trash2, X, AlertCircle } from 'lucide-react'
import { departmentApi } from '../utils/api'
import type { Department } from '../types'

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [formData, setFormData] = useState({ name: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadDepartments() }, [])

  const loadDepartments = async () => {
    setIsLoading(true)
    try {
      const res = await departmentApi.list()
      setDepartments(res.data.departments)
    } catch (err) {
      console.error('Failed to load departments:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個部門嗎？')) return
    try {
      await departmentApi.delete(id)
      loadDepartments()
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || '刪除失敗'
      alert(msg)
    }
  }

  const handleEdit = (dept: Department) => {
    setEditingDept(dept)
    setFormData({ name: dept.name })
    setError('')
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return

    setIsSubmitting(true)
    setError('')
    try {
      if (editingDept) {
        await departmentApi.update(editingDept.id, { name: formData.name.trim() })
      } else {
        await departmentApi.create({ name: formData.name.trim() })
      }
      setShowForm(false)
      setEditingDept(null)
      setFormData({ name: '' })
      loadDepartments()
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || '儲存失敗'
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const openCreate = () => {
    setEditingDept(null)
    setFormData({ name: '' })
    setError('')
    setShowForm(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">部門管理</h1>
          <p className="text-gray-500 mt-1">管理系統部門結構</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={20} /> 新增部門
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
        </div>
      ) : departments.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">暫無部門</h3>
          <p className="text-gray-500">點擊「新增部門」建立第一個部門</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <div key={dept.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Building2 size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{dept.name}</p>
                    <p className="text-sm text-gray-500">{dept.userCount || 0} 位成員</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(dept)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="編輯"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(dept.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="刪除"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{editingDept ? '編輯部門' : '新增部門'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">部門名稱 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ name: e.target.value })}
                  className="input-field"
                  placeholder="例如：研發部、產品部"
                  required
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
              <div className="flex gap-3 justify-end">
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