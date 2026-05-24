import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Save, Shield, ShieldCheck, Trash2 } from 'lucide-react'
import { roleApi } from '../utils/api'
import type { Permission, Role } from '../types'

type RoleForm = {
  name: string
  description: string
  permissions: string[]
}

const roleLabel = (name: string) =>
  ({
    admin: '系統管理員',
    pm: '項目經理',
    tech_lead: '技術主管',
    developer: '開發人員',
    tester: '測試人員',
  }[name] || name)

const emptyForm: RoleForm = { name: '', description: '', permissions: [] }

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  const [formData, setFormData] = useState<RoleForm>(emptyForm)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const selectedRole = roles.find((role) => role.id === selectedRoleId) || null

  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
      if (!groups[permission.category]) groups[permission.category] = []
      groups[permission.category].push(permission)
      return groups
    }, {})
  }, [permissions])

  const loadData = async () => {
    setIsLoading(true)
    setError('')
    try {
      const [rolesRes, permissionsRes] = await Promise.all([
        roleApi.list(),
        roleApi.permissions(),
      ])
      const loadedRoles: Role[] = rolesRes.data.roles
      setRoles(loadedRoles)
      setPermissions(permissionsRes.data.permissions)

      const nextRole = loadedRoles.find((role) => role.name === 'admin') || loadedRoles[0]
      if (nextRole) selectExistingRole(nextRole)
    } catch (err) {
      console.error('Failed to load roles:', err)
      setError('載入角色與權限失敗')
    } finally {
      setIsLoading(false)
    }
  }

  const selectExistingRole = (role: Role) => {
    setIsCreating(false)
    setSelectedRoleId(role.id)
    setFormData({
      name: role.name,
      description: role.description || '',
      permissions: role.permissions || [],
    })
    setError('')
  }

  const startCreate = () => {
    setIsCreating(true)
    setSelectedRoleId('')
    setFormData(emptyForm)
    setError('')
  }

  const togglePermission = (permissionKey: string) => {
    setFormData((current) => ({
      ...current,
      permissions: current.permissions.includes(permissionKey)
        ? current.permissions.filter((key) => key !== permissionKey)
        : [...current.permissions, permissionKey],
    }))
  }

  const toggleCategory = (categoryPermissions: Permission[]) => {
    const categoryKeys = categoryPermissions.map((permission) => permission.key)
    const allSelected = categoryKeys.every((key) => formData.permissions.includes(key))

    setFormData((current) => ({
      ...current,
      permissions: allSelected
        ? current.permissions.filter((key) => !categoryKeys.includes(key))
        : Array.from(new Set([...current.permissions, ...categoryKeys])),
    }))
  }

  const handleSave = async () => {
    setError('')
    if (!formData.name.trim()) {
      setError('請輸入角色名稱')
      return
    }

    setIsSaving(true)
    try {
      if (isCreating) {
        const response = await roleApi.create({
          name: formData.name.trim(),
          description: formData.description.trim(),
          permissions: formData.permissions,
        })
        const newRole: Role = response.data.role
        await refreshAndSelect(newRole.id)
      } else if (selectedRole) {
        const response = await roleApi.update(selectedRole.id, {
          name: formData.name.trim(),
          description: formData.description.trim(),
          permissions: formData.permissions,
        })
        const updatedRole: Role = response.data.role
        await refreshAndSelect(updatedRole.id)
      }
    } catch (err) {
      console.error('Failed to save role:', err)
      setError('儲存角色失敗，請確認名稱未重複')
    } finally {
      setIsSaving(false)
    }
  }

  const refreshAndSelect = async (roleId: string) => {
    const response = await roleApi.list()
    const loadedRoles: Role[] = response.data.roles
    setRoles(loadedRoles)
    const role = loadedRoles.find((item) => item.id === roleId)
    if (role) selectExistingRole(role)
  }

  const handleDelete = async () => {
    if (!selectedRole || selectedRole.isBuiltIn) return
    if (!confirm(`確定要刪除角色「${roleLabel(selectedRole.name)}」嗎？`)) return

    setIsSaving(true)
    setError('')
    try {
      await roleApi.delete(selectedRole.id)
      const response = await roleApi.list()
      const loadedRoles: Role[] = response.data.roles
      setRoles(loadedRoles)
      if (loadedRoles.length > 0) selectExistingRole(loadedRoles[0])
      else startCreate()
    } catch (err) {
      console.error('Failed to delete role:', err)
      setError('刪除角色失敗')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">角色與權限</h1>
          <p className="text-gray-500 mt-1">管理系統角色及各模組操作權限</p>
        </div>
        <button onClick={startCreate} className="btn-primary flex items-center justify-center gap-2">
          <Plus size={20} /> 新建角色
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center gap-2">
            <Shield size={20} className="text-primary-500" />
            <h2 className="font-semibold text-gray-900">角色列表</h2>
          </div>
          <div className="p-3 space-y-2">
            {isCreating && (
              <button className="w-full text-left p-4 rounded-xl border-2 border-primary-200 bg-primary-50">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600">
                    <Plus size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-primary-700">新建自訂角色</p>
                    <p className="text-sm text-gray-500 mt-1">設定名稱與權限後儲存</p>
                  </div>
                </div>
              </button>
            )}

            {roles.map((role) => {
              const active = selectedRoleId === role.id && !isCreating
              return (
                <button
                  key={role.id}
                  onClick={() => selectExistingRole(role)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    active
                      ? 'border-primary-200 bg-primary-50'
                      : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      role.isBuiltIn ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                    }`}>
                      {role.isBuiltIn ? <ShieldCheck size={20} /> : <Shield size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{roleLabel(role.name)}</p>
                        {role.isBuiltIn && <span className="badge bg-blue-100 text-blue-700">內建</span>}
                      </div>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {role.description || '無描述'}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">{role.permissions.length} 項權限</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">權限編輯</h2>
              <p className="text-sm text-gray-500 mt-1">
                {isCreating ? '建立新的自訂角色' : selectedRole ? `正在編輯：${roleLabel(selectedRole.name)}` : '請選擇角色'}
              </p>
            </div>
            <div className="flex gap-2">
              {selectedRole && !selectedRole.isBuiltIn && !isCreating && (
                <button
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="btn-secondary flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 size={18} /> 刪除
                </button>
              )}
              <button onClick={handleSave} disabled={isSaving} className="btn-primary flex items-center gap-2">
                <Save size={18} /> {isSaving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>

          <div className="p-5 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色名稱 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  className="input-field"
                  placeholder="例如：support"
                />
                {selectedRole?.isBuiltIn && (
                  <p className="text-xs text-amber-600 mt-1">內建角色可調整權限與描述，請謹慎修改名稱。</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                  className="input-field"
                  placeholder="角色用途說明"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-5">
              <div>
                <h3 className="font-semibold text-gray-900">權限設定</h3>
                <p className="text-sm text-gray-500 mt-1">
                  已選擇 {formData.permissions.length} / {permissions.length} 項權限
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, permissions: permissions.map((permission) => permission.key) })}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                全選
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => {
                const selectedCount = categoryPermissions.filter((permission) =>
                  formData.permissions.includes(permission.key)
                ).length
                const allSelected = selectedCount === categoryPermissions.length

                return (
                  <div key={category} className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900">{category}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {selectedCount} / {categoryPermissions.length} 已選
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleCategory(categoryPermissions)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          allSelected ? 'bg-primary-100 text-primary-700' : 'bg-white text-gray-600 border border-gray-200'
                        }`}
                      >
                        {allSelected ? '取消全選' : '全選'}
                      </button>
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {categoryPermissions.map((permission) => {
                        const checked = formData.permissions.includes(permission.key)
                        return (
                          <label
                            key={permission.key}
                            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                              checked ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePermission(permission.key)}
                              className="sr-only"
                            />
                            <span className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                              checked ? 'bg-primary-500 border-primary-500 text-white' : 'border-gray-300 bg-white'
                            }`}>
                              {checked && <Check size={14} />}
                            </span>
                            <span>
                              <span className="block font-medium text-sm">{permission.name}</span>
                              <span className="block text-xs text-gray-400 mt-0.5">{permission.key}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
