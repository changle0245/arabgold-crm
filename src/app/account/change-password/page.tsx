'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import { ShieldAlert } from 'lucide-react'

export default function ChangePasswordPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 未登录 → 登录页
  useEffect(() => {
    if (!authLoading && !profile) {
      router.replace('/login')
    }
  }, [authLoading, profile, router])

  // 已经无需强制改密的用户访问此页 → 客户列表
  useEffect(() => {
    if (!authLoading && profile && !profile.must_change_password) {
      router.replace('/customers')
    }
  }, [authLoading, profile, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!currentPw) { setError('请填写当前密码'); return }
    if (newPw.length < 6) { setError('新密码至少 6 位'); return }
    if (newPw !== confirmPw) { setError('两次输入的新密码不一致'); return }
    setSaving(true)
    // 走服务端 API：profiles RLS 只允许 admin update，浏览器端无法清 must_change_password 标记
    const res = await fetch('/api/account/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '修改密码失败')
      setSaving(false)
      return
    }
    // 硬刷新跳客户列表，让 AuthProvider 重新加载 profile
    window.location.replace('/customers')
  }

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
          <div className="p-2 rounded-lg bg-amber-50 shrink-0">
            <ShieldAlert size={18} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">请先修改初始密码</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {profile.full_name}，为了账号安全，首次登录必须修改密码后才能继续使用系统
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">当前密码（管理员给的初始密码）</label>
          <input
            type="password"
            value={currentPw}
            onChange={e => setCurrentPw(e.target.value)}
            autoFocus
            required
            disabled={saving}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">新密码（至少 6 位）</label>
          <input
            type="password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            required
            minLength={6}
            disabled={saving}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">确认新密码</label>
          <input
            type="password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            required
            minLength={6}
            disabled={saving}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving || !currentPw || newPw.length < 6 || newPw !== confirmPw}
          className="w-full px-4 py-2.5 bg-gold-600 text-white text-sm font-medium rounded-lg hover:bg-gold-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {saving ? '保存中...' : '保存并继续'}
        </button>
      </form>
    </div>
  )
}
