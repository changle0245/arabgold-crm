'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'
import { signOut } from 'next-auth/react'
import {
  Users, LayoutDashboard, BarChart3, UserCog, LogOut, Menu, X, Bell, FileText, Package, Inbox,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { BellNotification } from './bell-notification'

const navItems = [
  { href: '/customers', label: '客户列表', icon: Users, roles: ['admin', 'member'] },
  { href: '/quotations', label: '报价记录', icon: FileText, roles: ['admin', 'member'] },
  { href: '/deals', label: '成交记录', icon: Package, roles: ['admin', 'member'] },
  { href: '/reminders', label: '我的提醒', icon: Bell, roles: ['admin', 'member'] },
  { href: '/inbound-queue', label: '待归档邮件', icon: Inbox, roles: ['admin', 'member'] },
  { href: '/dashboard/personal', label: '个人大屏', icon: LayoutDashboard, roles: ['admin', 'member'] },
  { href: '/dashboard/boss', label: '老板大屏', icon: BarChart3, roles: ['admin'] },
  { href: '/members', label: '成员管理', icon: UserCog, roles: ['admin'] },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const [overdueCount, setOverdueCount] = useState(0)

  const loadOverdue = useCallback(async () => {
    if (!profile?.id) return
    try {
      const res = await fetch('/api/reminders/overdue-count', { cache: 'no-store' })
      const body = await res.json()
      setOverdueCount(body.count ?? 0)
    } catch {
      setOverdueCount(0)
    }
  }, [profile?.id])

  useEffect(() => {
    loadOverdue()
    // 修 #12: sidebar 红圈数字以前每 60s 才刷新一次，导致完成提醒后徽章很久不更新。
    // 现在：① 任何 reminder 操作（完成/取消/创建/推迟）会 dispatch 'reminders-changed'
    // ② 缩短轮询到 15s 作为兜底
    // ③ 切到本页时（visibilitychange → visible）立即刷新
    const interval = setInterval(loadOverdue, 15000)
    const onChange = () => loadOverdue()
    const onVisible = () => { if (!document.hidden) loadOverdue() }
    window.addEventListener('reminders-changed', onChange)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      window.removeEventListener('reminders-changed', onChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadOverdue, pathname])

  async function handleLogout() {
    await signOut({ redirect: false })
    router.push('/login')
  }

  // ⑯ 修:profile 加载中不再 fallback 'member' — 否则 admin-only 菜单项(老板大屏/成员管理)
  // 会先被 filter 掉,profile 加载完成后再出现,视觉上闪一下。
  // 未加载时返回空列表,nav 区域整体不渲染菜单项(布局其他部分仍正常)。
  const visibleItems = profile
    ? navItems.filter(item => item.roles.includes(profile.role))
    : []

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-40">
        <span className="font-bold text-gold-700 text-lg">ArabGold CRM</span>
        <div className="flex items-center gap-2">
          <BellNotification />
          <button onClick={() => setOpen(!open)} className="p-2 text-gray-600 cursor-pointer">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 z-50
        flex flex-col transition-transform duration-200
        lg:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-14 flex items-center justify-between px-5 border-b border-gray-100">
          <span className="font-bold text-gold-700 text-lg">ArabGold CRM</span>
          <BellNotification />
        </div>

        <nav className="flex-1 py-3 px-3 space-y-0.5">
          {visibleItems.map(item => {
            const active = pathname.startsWith(item.href)
            const showBadge = item.href === '/reminders' && overdueCount > 0
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gold-50 text-gold-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <item.icon size={18} />
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium bg-red-500 text-white rounded-full">
                    {overdueCount > 99 ? '99+' : overdueCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-gray-100 p-3">
          <div className="px-3 py-2 text-xs text-gray-400 truncate">
            {profile?.full_name}
            {isAdmin && <span className="ml-1 text-gold-600">(管理员)</span>}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors cursor-pointer"
          >
            <LogOut size={18} />
            退出登录
          </button>
        </div>
      </aside>
    </>
  )
}
