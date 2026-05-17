'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import type { Reminder } from '@/lib/types'
import { REMINDER_TYPES, REMINDER_TYPE_LABELS } from '@/lib/constants'
import { Bell, Check, X, Clock, Filter } from 'lucide-react'
import { daysFromNow, addDays } from '@/lib/dates'

type StatusFilter = 'pending' | 'completed' | 'all'

export default function RemindersPage() {
  const { profile, isAdmin } = useAuth()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [scopeFilter, setScopeFilter] = useState<'mine' | 'all'>('mine')

  const load = useCallback(async () => {
    if (!profile?.id) return
    const supabase = createClient()
    let query = supabase
      .from('reminders')
      .select('*, customer:customers!reminders_customer_id_fkey(id, contact_name, company_name), assignee:profiles!reminders_assigned_to_fkey(*)')
      .order('due_date', { ascending: true })

    if (scopeFilter === 'mine') {
      query = query.eq('assigned_to', profile.id)
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }
    if (typeFilter !== 'all') {
      query = query.eq('type', typeFilter)
    }

    const { data } = await query
    setReminders((data as Reminder[]) || [])
    setLoading(false)
  }, [profile?.id, statusFilter, typeFilter, scopeFilter])

  useEffect(() => { load() }, [load])

  async function markStatus(id: string, status: string) {
    const supabase = createClient()
    await supabase.from('reminders').update({ status }).eq('id', id)
    load()
  }

  async function postpone(id: string, days: number) {
    const supabase = createClient()
    const r = reminders.find(x => x.id === id)
    if (!r?.due_date) return
    await supabase.from('reminders').update({ due_date: addDays(r.due_date, days) }).eq('id', id)
    load()
  }

  if (loading) return <div className="p-6 text-gray-400">加载中...</div>

  const overdue = reminders.filter(r => r.status === 'pending' && daysFromNow(r.due_date) < 0)
  const today = reminders.filter(r => r.status === 'pending' && daysFromNow(r.due_date) === 0)
  const upcoming = reminders.filter(r => r.status === 'pending' && daysFromNow(r.due_date) > 0)

  return (
    <div className="p-4 lg:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Bell size={22} className="text-gold-600" />
          {scopeFilter === 'mine' ? '我的提醒' : '全员提醒'}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-gray-400" />
          {isAdmin && (
            <select value={scopeFilter} onChange={e => setScopeFilter(e.target.value as 'mine' | 'all')}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-gold-500 cursor-pointer">
              <option value="mine">仅我的</option>
              <option value="all">全员</option>
            </select>
          )}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-gold-500 cursor-pointer">
            <option value="pending">待办</option>
            <option value="completed">已完成</option>
            <option value="all">全部</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-gold-500 cursor-pointer">
            <option value="all">全部类型</option>
            {REMINDER_TYPES.map(t => <option key={t} value={t}>{REMINDER_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
      </div>

      {statusFilter === 'pending' && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard label="逾期" value={overdue.length} color="text-red-500" />
          <StatCard label="今天" value={today.length} color="text-amber-500" />
          <StatCard label="未来" value={upcoming.length} color="text-gray-700" />
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
          没有匹配的提醒
        </div>
      ) : (
        <div className="space-y-2">
          {reminders.map(r => {
            const days = daysFromNow(r.due_date)
            const isOverdue = r.status === 'pending' && days < 0
            const isToday = r.status === 'pending' && days === 0
            return (
              <div key={r.id} className={`flex items-start gap-3 p-4 rounded-lg border bg-white ${isOverdue ? 'border-red-200' : isToday ? 'border-amber-200' : 'border-gray-200'}`}>
                <Bell size={16} className={`mt-0.5 shrink-0 ${isOverdue ? 'text-red-500' : isToday ? 'text-amber-500' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{REMINDER_TYPE_LABELS[r.type] || r.type}</span>
                    {r.customer && (
                      <Link href={`/customers/${r.customer.id}`} className="text-xs text-gold-600 hover:text-gold-700">
                        {r.customer.contact_name}
                        {r.customer.company_name ? ` · ${r.customer.company_name}` : ''}
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
                    <span className={isOverdue ? 'text-red-600 font-medium' : isToday ? 'text-amber-700 font-medium' : 'text-gray-500'}>
                      {r.due_date}
                      {r.status === 'pending' && (
                        isOverdue ? ` · 逾期 ${-days} 天` : isToday ? ' · 今天' : ` · ${days} 天后`
                      )}
                    </span>
                    {r.assignee && <span className="text-gray-400">指派 {r.assignee.full_name}</span>}
                    {r.status !== 'pending' && (
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                        {r.status === 'completed' ? '已完成' : '已取消'}
                      </span>
                    )}
                  </div>
                  {r.note && <p className="text-sm text-gray-600 mt-1">{r.note}</p>}
                </div>
                {r.status === 'pending' && r.assigned_to === profile?.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => postpone(r.id, 1)} title="推迟1天"
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded cursor-pointer">
                      <Clock size={14} />
                    </button>
                    <button onClick={() => markStatus(r.id, 'completed')} title="标记完成"
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded cursor-pointer">
                      <Check size={14} />
                    </button>
                    <button onClick={() => markStatus(r.id, 'cancelled')} title="取消"
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded cursor-pointer">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
