'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'
import { createClient } from '@/lib/supabase/client'
import {
  Users, LayoutDashboard, BarChart3, UserCog, LogOut, Menu, X, Bell, FileText, Package,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { BellNotification } from './bell-notification'

const navItems = [
  { href: '/customers', label: '客户列表', icon: Users, roles: ['admin', 'member'] },
  { href: '/quotations', label: '报价记录', icon: FileText, roles: ['admin', 'member'] },
  { href: '/deals', label: '成交记录', icon: Package, roles: ['admin', 'member'] },
  { href: '/reminders', label: '我的提醒', icon: Bell, roles: ['admin', 'member'] },
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
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { count } = await supabase
      .from('reminders')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', profile.id)
      .eq('status', 'pending')
      .lte('due_date', today)
    setOverdueCount(count || 0)
  }, [profile?.id])

  useEffect(() => {
    loadOverdue()
    const interval = setInterval(loadOverdue, 60000)
    return () => clearInterval(interval)
  }, [loadOverdue, pathname])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const visibleItems = navItems.filter(item =>
    item.roles.includes(profile?.role || 'member')
  )

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
