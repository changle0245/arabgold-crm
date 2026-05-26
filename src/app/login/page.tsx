'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Read ?reason=inactive (set by auth-provider when a deactivated session
  // is detected) without pulling in useSearchParams + a Suspense boundary.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('reason') === 'inactive') {
      setError('账号已停用,请联系管理员')
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !signInData.user) {
      setError('邮箱或密码错误')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active, must_change_password')
      .eq('id', signInData.user.id)
      .single()

    if (!profile || profile.is_active === false) {
      await supabase.auth.signOut()
      setError('账号已停用,请联系管理员')
      setLoading(false)
      return
    }

    // 修 #4: 用 window.location.replace 做硬跳转，避免 router.push 在 React 状态结算过程中
    // 让"登录中..."按钮卡 15+ 秒。硬跳转直接 kill 当前 SPA 状态，新页面 fresh 加载。
    let target = '/dashboard/personal'
    if (profile.must_change_password) target = '/account/change-password'
    else if (profile.role === 'admin') target = '/dashboard/boss'
    window.location.replace(target)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gold-700">ArabGold CRM</h1>
          <p className="text-gray-500 mt-1 text-sm">客户管理系统</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              密码
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          账号由管理员创建，如需开通请联系管理员
        </p>
      </div>
    </div>
  )
}
