'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth-provider'
import type { Customer, Profile, Reminder } from '@/lib/types'
import { OVERDUE_DAYS_THRESHOLD, SILENT_DAYS_THRESHOLD, REMINDER_TYPE_LABELS } from '@/lib/constants'
import { Users, AlertTriangle, MessageSquare, Bell, Check, Calendar, PieChart } from 'lucide-react'
import { daysSince, daysFromNow } from '@/lib/dates'
import { currencySymbol } from '@/lib/currency'

interface WeekMonthStats {
  newCustomers: number
  logs: number
  stageChanges: number
  deals: number
}

interface PersonalDashboardData {
  my_customers: (Customer & { owner?: Profile })[]
  today_new_count: number
  today_logs: number
  my_reminders: Reminder[]
  weekly_stats: WeekMonthStats
  monthly_stats: WeekMonthStats
  my_month_revenue: number
  company_month_revenue: number
  main_currency: string
}

interface DashboardResponse {
  ok: boolean
  data?: PersonalDashboardData
  error?: string
}

export default function PersonalDashboard() {
  const { profile } = useAuth()
  const [myCustomers, setMyCustomers] = useState<(Customer & { owner?: Profile })[]>([])
  const [todayNewCount, setTodayNewCount] = useState(0)
  const [todayLogCount, setTodayLogCount] = useState(0)
  const [myReminders, setMyReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  // P1-2 states
  const [weeklyStats, setWeeklyStats] = useState<WeekMonthStats>({ newCustomers: 0, logs: 0, stageChanges: 0, deals: 0 })
  const [monthlyStats, setMonthlyStats] = useState<WeekMonthStats>({ newCustomers: 0, logs: 0, stageChanges: 0, deals: 0 })
  const [myMonthRevenue, setMyMonthRevenue] = useState(0)
  const [companyMonthRevenue, setCompanyMonthRevenue] = useState(0)
  const [mainCurrency, setMainCurrency] = useState<string>('USD')

  // Use a stable load function so markDone can call it
  const load = async () => {
    if (!profile?.id) return
    try {
      const res = await fetch('/api/dashboard/personal', { method: 'POST' })
      const body = (await res.json()) as DashboardResponse
      if (!body.ok || !body.data) {
        setLoading(false)
        return
      }
      const d = body.data
      setMyCustomers(d.my_customers || [])
      setTodayNewCount(d.today_new_count || 0)
      setTodayLogCount(d.today_logs || 0)
      setMyReminders(d.my_reminders || [])
      setWeeklyStats(d.weekly_stats)
      setMonthlyStats(d.monthly_stats)
      setMyMonthRevenue(d.my_month_revenue || 0)
      setCompanyMonthRevenue(d.company_month_revenue || 0)
      setMainCurrency((d.main_currency || 'USD').toUpperCase())
    } catch {
      // Network errors: stop loading so the empty state can render.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [profile])

  async function markDone(id: string) {
    await fetch(`/api/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    load()
    // 修 #12: 通知 sidebar 立即刷新红圈
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('reminders-changed'))
  }

  if (loading) return <div className="p-6 text-gray-400">加载中...</div>

  // 修 #1: daysSince(null) === 9999（dates.ts 设计：never recorded → overdue forever）。
  // 从未联系过的客户应计入"超期"和"沉默"——逻辑上他们更需要被跟进，旧逻辑用
  // c.last_contact_date && ... 把 null 静默排除，导致大屏数字偏低。
  const overdueCustomers = myCustomers.filter(c =>
    daysSince(c.last_contact_date) >= OVERDUE_DAYS_THRESHOLD
  )
  const silentCustomers = myCustomers.filter(c =>
    daysSince(c.last_contact_date) >= SILENT_DAYS_THRESHOLD && c.stage !== '已成交'
  )
  const overdueReminders = myReminders.filter(r => daysFromNow(r.due_date) < 0)
  const todayReminders = myReminders.filter(r => daysFromNow(r.due_date) === 0)
  const todoToday = [...overdueReminders, ...todayReminders]

  return (
    <div className="p-4 lg:p-6 max-w-5xl">
      <h1 className="text-xl font-bold text-gray-900 mb-4">
        {profile?.full_name} 的工作台
      </h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} label="我的客户" value={myCustomers.length} color="text-gold-600" />
        <StatCard icon={Bell} label="今日待办" value={todoToday.length} color="text-pink-600" danger={overdueReminders.length > 0} />
        <StatCard icon={AlertTriangle} label="沉默客户" value={silentCustomers.length} color="text-red-600" danger={silentCustomers.length > 0} />
        <StatCard icon={MessageSquare} label="今日联系" value={todayLogCount} color="text-green-600" />
      </div>

      {/* Today's Reminders */}
      {todoToday.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Bell size={14} className="text-pink-500" />
              今日待办提醒
              {overdueReminders.length > 0 && (
                <span className="text-xs text-red-500 font-medium">· 逾期 {overdueReminders.length}</span>
              )}
            </h2>
            <Link href="/reminders" className="text-xs text-gold-600 hover:text-gold-700">查看全部 →</Link>
          </div>
          <div className="space-y-2">
            {todoToday.slice(0, 8).map(r => {
              const days = daysFromNow(r.due_date)
              const isOverdue = days < 0
              return (
                <div key={r.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isOverdue ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{REMINDER_TYPE_LABELS[r.type] || r.type}</span>
                      {r.customer && (
                        <Link href={`/customers/${r.customer.id}`} className="text-xs text-gold-600 hover:text-gold-700">
                          {r.customer.contact_name}
                          {r.customer.company_name ? ` · ${r.customer.company_name}` : ''}
                        </Link>
                      )}
                      <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-amber-700'}`}>
                        {isOverdue ? `逾期 ${-days} 天` : '今天'}
                      </span>
                    </div>
                    {r.note && <p className="text-xs text-gray-600 mt-0.5">{r.note}</p>}
                  </div>
                  <button onClick={() => markDone(r.id)} title="标记完成"
                    className="p-1.5 text-green-600 hover:bg-green-100 rounded cursor-pointer shrink-0">
                    <Check size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* P1-2.1: Weekly/Monthly Work Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Weekly Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Calendar size={14} className="text-blue-600" />
            本周工作汇总
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">新增客户</p>
              <p className="text-xl font-bold text-gray-900">{weeklyStats.newCustomers}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">记录联系</p>
              <p className="text-xl font-bold text-gray-900">{weeklyStats.logs}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">推进阶段</p>
              <p className="text-xl font-bold text-gray-900">{weeklyStats.stageChanges}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">成交笔数</p>
              <p className="text-xl font-bold text-gold-700">{weeklyStats.deals}</p>
            </div>
          </div>
        </div>

        {/* Monthly Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Calendar size={14} className="text-green-600" />
            本月工作汇总
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">新增客户</p>
              <p className="text-xl font-bold text-gray-900">{monthlyStats.newCustomers}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">记录联系</p>
              <p className="text-xl font-bold text-gray-900">{monthlyStats.logs}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">推进阶段</p>
              <p className="text-xl font-bold text-gray-900">{monthlyStats.stageChanges}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">成交笔数</p>
              <p className="text-xl font-bold text-gold-700">{monthlyStats.deals}</p>
            </div>
          </div>
        </div>
      </div>

      {/* P1-2.2: Personal Revenue Share */}
      <div className="bg-white rounded-xl border border-gold-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <PieChart size={14} className="text-gold-600" />
          本月个人业绩占比
        </h2>
        {companyMonthRevenue > 0 ? (
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">我的成交额 ({mainCurrency})</p>
                <p className="text-2xl font-bold text-gold-700">
                  {currencySymbol(mainCurrency)}{myMonthRevenue >= 10000 ? (myMonthRevenue / 10000).toFixed(1) + 'w' : myMonthRevenue.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">公司总成交额 ({mainCurrency})</p>
                <p className="text-lg font-medium text-gray-600">
                  {currencySymbol(mainCurrency)}{companyMonthRevenue >= 10000 ? (companyMonthRevenue / 10000).toFixed(1) + 'w' : companyMonthRevenue.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-gold-400 to-gold-600 flex items-center justify-center"
                style={{ width: `${(myMonthRevenue / companyMonthRevenue * 100).toFixed(1)}%` }}
              >
                <span className="text-xs font-medium text-white">
                  {(myMonthRevenue / companyMonthRevenue * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-2">本月暂无成交</p>
        )}
      </div>

      {/* Overdue list */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          需要跟进的客户
          <span className="text-xs text-gray-400 font-normal ml-2">（超过{OVERDUE_DAYS_THRESHOLD}天未联系）</span>
        </h2>
        {overdueCustomers.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">暂无超期客户，保持节奏！</p>
        ) : (
          <div className="space-y-2">
            {overdueCustomers.map(c => {
              const days = daysSince(c.last_contact_date)
              return (
                <Link
                  key={c.id}
                  href={`/customers/${c.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-gray-100"
                >
                  <div>
                    <span className="font-medium text-gray-900">{c.contact_name}</span>
                    {c.company_name && <span className="text-gray-400 text-sm ml-2">{c.company_name}</span>}
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{c.country}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        c.stage === '报价中' ? 'bg-blue-50 text-blue-600' :
                        c.stage === '已寄样' ? 'bg-purple-50 text-purple-600' :
                        'bg-gray-50 text-gray-500'
                      }`}>{c.stage}</span>
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${days >= SILENT_DAYS_THRESHOLD ? 'text-red-600' : 'text-amber-600'}`}>
                    {days}天
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, danger }: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
  color: string
  danger?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${danger ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={color} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
