import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { User, Save, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react'

export default function ProfilePage() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!newPassword || newPassword.length < 6) {
      setError('新密碼至少需要 6 個字元')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('新密碼與確認密碼不符')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || '更新失敗')
      setSuccess('密碼已成功更新')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <User size={28} className="text-primary-500" />
        <h1 className="text-2xl font-bold text-gray-900">用戶設定</h1>
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

      {/* User Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">個人資料</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-primary-600 font-bold text-lg">
                {user?.name?.charAt(0) || 'U'}
              </span>
            </div>
            <div>
              <p className="font-medium text-gray-900">{user?.name}</p>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-3 border-t">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">角色</p>
              <p className="font-medium text-gray-700 capitalize">{user?.role}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">ID</p>
              <p className="font-medium text-gray-700 text-sm truncate">{user?.id}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">修改密碼</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">當前密碼</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="input-field w-full pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">新密碼</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="input-field w-full pr-10"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">至少 6 個字元</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">確認新密碼</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="input-field w-full"
              required
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? '更新中...' : '更新密碼'}
          </button>
        </form>
      </div>
    </div>
  )
}
