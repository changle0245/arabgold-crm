'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import type { Customer, Profile, Deal, Reminder } from '@/lib/types'
import { OVERDUE_DAYS_THRESHOLD, SILENT_DAYS_THRESHOLD, STAGES, DEAL_STATUS_LABELS } from '@/lib/constants'
import { Users, AlertTriangle, Moon, TrendingUp, DollarSign, Package, Repeat, Bell, ShieldAlert, ArrowUp, ArrowDown, Target } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { daysSince, todayLocalISO } from '@/lib/dates'

type ConcentrationRiskCustomer = {
  customer_id: string
  customer_name: string
  customer_company: string | null
  total_amount: number
  revenue_share: number
  deal_count: number
}

const COLORS = ['#d1d5db', '#34d399', '#60a5fa', '#a78bfa', '#f59e0b', '#ef4444']

export default function BossDashboard() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [pendingReminders, setPendingReminders] = useState<Reminder[]>([])
  const [concentrationRiskCustomers, setConcentrationRiskCustomers] = useState<ConcentrationRiskCustomer[]>([])
  const [todayProgress, setTodayProgress] = useState<Record<string, { newCustomers: number; stageChanges: number; logs: number }>>({})
  const [monthlyTarget, setMonthlyTarget] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push('/dashboard/personal')
  }, [authLoading, isAdmin, router])

  useEffect(() => {
    if (!isAdmin) return
    const supabase = createClient()
    const today = todayLocalISO()

    async function load() {
      const [{ data: custs }, { data: mems }, { data: todayCustomers }, { data: todayStageChanges }, { data: todayLogs }, { data: allDeals }, { data: allReminders }, { data: riskCustomers }, { data: settings }] = await Promise.all([
        supabase.from('customers').select('*'),
        supabase.from('profiles').select('*').eq('is_active', true),
        supabase.from('customers').select('created_by').gte('created_at', today + 'T00:00:00'),
        supabase.from('stage_changes').select('changed_by').gte('changed_at', today + 'T00:00:00'),
        supabase.from('contact_logs').select('logged_by').eq('log_date', today),
        supabase.from('deals').select('*'),
        supabase.from('reminders').select('*').eq('status', 'pending'),
        supabase.rpc('get_concentration_risk_customers'),
        supabase.from('system_settings').select('*').eq('key', 'monthly_revenue_target').single(),
      ])

      setCustomers(custs || [])
      setMembers(mems || [])
      setDeals(allDeals || [])
      setPendingReminders((allReminders as Reminder[]) || [])
      setConcentrationRiskCustomers((riskCustomers as ConcentrationRiskCustomer[]) || [])

      // Parse monthly target
      if (settings && settings.value !== null && settings.value !== 'null') {
        setMonthlyTarget(typeof settings.value === 'number' ? settings.value : Number(settings.value))
      } else {
        setMonthlyTarget(null)
      }

      const progress: Record<string, { newCustomers: number; stageChanges: number; logs: number }> = {}
      ;(mems || []).forEach(m => {
        progress[m.id] = { newCustomers: 0, stageChanges: 0, logs: 0 }
      })
      ;(todayCustomers || []).forEach(c => {
        if (c.created_by && progress[c.created_by]) progress[c.created_by].newCustomers++
      })
      ;(todayStageChanges || []).forEach(s => {
        if (s.changed_by && progress[s.changed_by]) progress[s.changed_by].stageChanges++
      })
      ;(todayLogs || []).forEach(l => {
        if (l.logged_by && progress[l.logged_by]) progress[l.logged_by].logs++
      })
      setTodayProgress(progress)
      setLoading(false)
    }
    load()
  }, [isAdmin])

  if (!isAdmin || loading) return <div className="p-6 text-gray-400">加载中..</div>

  const totalCustomers = customers.length
  const overdueCount = customers.filter(c =>
    c.last_contact_date && daysSince(c.last_contact_date) >= OVERDUE_DAYS_THRESHOLD
  ).length
  const silentCount = customers.filter(c =>
    c.last_contact_date && daysSince(c.last_contact_date) >= SILENT_DAYS_THRESHOLD && c.stage !== '已成交'
  ).length

  // Monthly deal stats
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthDeals = deals.filter(d => d.deal_date && d.deal_date >= monthStart)
  const monthDealAmount = monthDeals.reduce((s, d) => s + (d.deal_amount || 0), 0)
  const monthDealCount = monthDeals.length

  // Repeat purchase rate: customers with >1 deal / customers with >=1 deal
  const customerDealCounts = new Map<string, number>()
  deals.forEach(d => {
    customerDealCounts.set(d.customer_id, (customerDealCounts.get(d.customer_id) || 0) + 1)
  })
  const customersWithDeals = customerDealCounts.size
  const customersWithReorders = Array.from(customerDealCounts.values()).filter(c => c > 1).length
  const reorderRate = customersWithDeals > 0
    ? Math.round((customersWithReorders / customersWithDeals) * 100)
    : 0

  const ownerCounts = members.map(m => ({
    name: m.full_name,
    count: customers.filter(c => c.owner_id === m.id).length,
  })).sort((a, b) => b.count - a.count)

  const stageCounts = STAGES.map(s => ({
    name: s,
    value: customers.filter(c => c.stage === s).length,
  }))

  // Monthly deal trend (last 6 months)
  const monthlyDealData: { month: string; amount: number; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const mDeals = deals.filter(deal => deal.deal_date?.startsWith(mKey))
    monthlyDealData.push({
      month: `${d.getMonth() + 1}月`,
      amount: mDeals.reduce((s, deal) => s + (deal.deal_amount || 0), 0),
      count: mDeals.length,
    })
  }

  // Top deal salespersons this month
  const memberDealMap = new Map<string, number>()
  monthDeals.forEach(d => {
    if (d.created_by) {
      memberDealMap.set(d.created_by, (memberDealMap.get(d.created_by) || 0) + (d.deal_amount || 0))
    }
  })
  const memberDealRanking = members
    .map(m => ({ name: m.full_name, amount: memberDealMap.get(m.id) || 0 }))
    .filter(m => m.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  // Reminder distribution by member
  const todayStr = todayLocalISO()
  const reminderByMember = members.map(m => {
    const mine = pendingReminders.filter(r => r.assigned_to === m.id)
    const overdueRem = mine.filter(r => r.due_date && r.due_date < todayStr).length
    return {
      id: m.id,
      name: m.full_name,
      total: mine.length,
      overdue: overdueRem,
    }
  }).filter(x => x.total > 0).sort((a, b) => b.overdue - a.overdue || b.total - a.total)
  const totalOverdueReminders = pendingReminders.filter(r => r.due_date && r.due_date < todayStr).length

  // === P1-1.1: YoY/MoM Revenue Comparison ===
  // Calculate last month revenue
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`
  const lastMonthDeals = deals.filter(d => d.deal_date?.startsWith(lastMonthKey))
  const lastMonthAmount = lastMonthDeals.reduce((s, d) => s + (d.deal_amount || 0), 0)

  // Calculate MoM (Month-over-Month)
  let momChange: number | null = null
  let momPercent: number | null = null
  if (lastMonthAmount > 0) {
    momChange = monthDealAmount - lastMonthAmount
    momPercent = (momChange / lastMonthAmount) * 100
  }

  // Calculate last year same month revenue
  const lastYearDate = new Date(now.getFullYear() - 1, now.getMonth(), 1)
  const lastYearMonthKey = `${lastYearDate.getFullYear()}-${String(lastYearDate.getMonth() + 1).padStart(2, '0')}`
  const lastYearMonthDeals = deals.filter(d => d.deal_date?.startsWith(lastYearMonthKey))
  const lastYearMonthAmount = lastYearMonthDeals.reduce((s, d) => s + (d.deal_amount || 0), 0)

  // Calculate YoY (Year-over-Year)
  let yoyChange: number | null = null
  let yoyPercent: number | null = null
  if (lastYearMonthAmount > 0) {
    yoyChange = monthDealAmount - lastYearMonthAmount
    yoyPercent = (yoyChange / lastYearMonthAmount) * 100
  }

  // === P1-1.2: Conversion Funnel（累计漏斗占比） ===
  // 每档显示 sum(counts[i..end]) / sum(counts) * 100
  // 永远 ≤100%、单调不增,不依赖"客户严格按阶段顺序流转"的假设。
  const funnelStages = ['新接触', '报价中', '已寄样', '已成交']
  const funnelCounts = funnelStages.map(stage => customers.filter(c => c.stage === stage).length)
  const funnelTotal = funnelCounts.reduce((a, b) => a + b, 0)
  const funnelData = funnelStages.map((stage, index) => {
    const count = funnelCounts[index]
    const cumulativeCount = funnelCounts.slice(index).reduce((a, b) => a + b, 0)
    const cumulativePercent = funnelTotal > 0 ? (cumulativeCount / funnelTotal) * 100 : 0
    return { stage, count, cumulativePercent }
  })

  // === P1-1.3: Monthly Target Progress ===
  const targetProgress = monthlyTarget && monthlyTarget > 0
    ? (monthDealAmount / monthlyTarget) * 100
    : null

  return (
    <div className="p-4 lg:p-6 max-w-6xl">
      <h1 className="text-xl font-bold text-gray-900 mb-4">老板大屏</h1>

      {/* Top cards row 1: deal metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <StatCard icon={DollarSign} label="本月成交额" value={`$${formatAmount(monthDealAmount)}`} gold />
        <StatCard icon={Package} label="本月成交笔数" value={monthDealCount} gold />
        <StatCard icon={Repeat} label="复购率" value={`${reorderRate}%`} gold />
        <StatCard icon={TrendingUp} label="今日总联系" value={Object.values(todayProgress).reduce((s, p) => s + p.logs, 0)} />
      </div>

      {/* Top cards row 2: customer health */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} label="客户总数" value={totalCustomers} />
        <StatCard icon={AlertTriangle} label="超期未跟进" value={overdueCount} danger={overdueCount > 0} />
        <StatCard icon={Moon} label="沉默客户" value={silentCount} danger={silentCount > 0} />
        <StatCard icon={Bell} label="逾期提醒" value={totalOverdueReminders} danger={totalOverdueReminders > 0} subtext={`待办 ${pendingReminders.length}`} />
      </div>

      {/* P1-1.3: Monthly Target Progress */}
      {monthlyTarget !== null && monthlyTarget > 0 ? (
        <div className="bg-white rounded-xl border border-gold-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Target size={14} className="text-gold-600" />
              本月业绩目标
            </h3>
            <span className="text-xs text-gray-500">目标: ${formatAmount(monthlyTarget)}</span>
          </div>
          <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                targetProgress && targetProgress >= 100 ? 'bg-green-500' : 'bg-gold-500'
              }`}
              style={{ width: `${Math.min(targetProgress || 0, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              已完成: ${formatAmount(monthDealAmount)}
            </span>
            <span className={`text-sm font-bold ${
              targetProgress && targetProgress >= 100 ? 'text-green-600' : 'text-gold-700'
            }`}>
              {targetProgress !== null ? `${targetProgress.toFixed(1)}%` : '0%'}
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Target size={14} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">本月业绩目标</h3>
          </div>
          <p className="text-sm text-gray-400">未设置本月目标</p>
        </div>
      )}

      {/* P1-1.1: YoY/MoM Revenue Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* MoM Comparison */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">环比增长（月环比）</h3>
          {momPercent !== null ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">
                  ${formatAmount(monthDealAmount)}
                </span>
                <span className="text-xs text-gray-500">本月成交额</span>
              </div>
              <div className="flex items-center gap-2">
                {momPercent >= 0 ? (
                  <ArrowUp size={16} className="text-green-500" />
                ) : (
                  <ArrowDown size={16} className="text-red-500" />
                )}
                <span className={`text-sm font-medium ${
                  momPercent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {momPercent >= 0 ? '+' : ''}{momPercent.toFixed(1)}%
                </span>
                <span className="text-xs text-gray-500">
                  vs 上月 ${formatAmount(lastMonthAmount)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-4">暂无可比数据</p>
          )}
        </div>

        {/* YoY Comparison */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">同比增长（年同比）</h3>
          {yoyPercent !== null ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">
                  ${formatAmount(monthDealAmount)}
                </span>
                <span className="text-xs text-gray-500">本月成交额</span>
              </div>
              <div className="flex items-center gap-2">
                {yoyPercent >= 0 ? (
                  <ArrowUp size={16} className="text-green-500" />
                ) : (
                  <ArrowDown size={16} className="text-red-500" />
                )}
                <span className={`text-sm font-medium ${
                  yoyPercent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {yoyPercent >= 0 ? '+' : ''}{yoyPercent.toFixed(1)}%
                </span>
                <span className="text-xs text-gray-500">
                  vs 去年同月 ${formatAmount(lastYearMonthAmount)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-4">暂无可比数据</p>
          )}
        </div>
      </div>

      {/* P1-1.2: Conversion Funnel */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">成交漏斗</h3>
        {funnelTotal === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">暂无客户进入漏斗</p>
        ) : (
          <div className="space-y-3">
            {funnelData.map((item) => (
              <div key={item.stage}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{item.stage}</span>
                  <span className="text-sm font-bold text-gray-900">{item.count} 人</span>
                </div>
                <div className="relative h-8 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-gold-400 to-gold-600 flex items-center justify-start px-3"
                    style={{
                      width: `${Math.max(item.cumulativePercent, 5)}%`
                    }}
                  >
                    <span className="text-xs font-medium text-white">
                      {item.count > 0 && `${item.cumulativePercent.toFixed(0)}%`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">
          注：不包含"沉默"和"待定"阶段客户
        </p>
      </div>

      {/* Charts row 1: deal trend + stage distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Monthly deal trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">近6个月成交趋势</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyDealData}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [`$${formatAmount(Number(value))}`, '成交额']}
              />
              <Bar dataKey="amount" fill="#b45309" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stage distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">各阶段客户分布</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={stageCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => value > 0 ? `${name}(${value})` : ''}>
                {stageCounts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2: owner distribution + member deal ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Owner distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">各业务员客户数</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ownerCounts} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#b45309" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Member deal ranking this month */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">本月业务员成交排行</h3>
          {memberDealRanking.length === 0 ? (
            <p className="text-sm text-gray-400 mt-8 text-center">本月暂无成交</p>
          ) : (
            <div className="space-y-2 mt-2">
              {memberDealRanking.map((m, i) => (
                <div key={m.name} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-gold-100 text-gold-700' : 'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  <span className="text-sm text-gray-800 flex-1">{m.name}</span>
                  <span className="text-sm font-medium text-gray-900">${formatAmount(m.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reminder distribution */}
      {reminderByMember.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Bell size={14} className="text-pink-500" />
            各业务员待办提醒
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left text-xs border-b border-gray-100">
                  <th className="py-2 px-2">业务员</th>
                  <th className="py-2 px-2 text-right">待办</th>
                  <th className="py-2 px-2 text-right">逾期</th>
                </tr>
              </thead>
              <tbody>
                {reminderByMember.map(m => (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 px-2 text-gray-700">{m.name}</td>
                    <td className="py-2 px-2 text-right font-medium text-gray-800">{m.total}</td>
                    <td className={`py-2 px-2 text-right font-medium ${m.overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{m.overdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Concentration Risk Customers - Admin Only */}
      {concentrationRiskCustomers.length > 0 && (
        <div className="bg-white rounded-xl border border-orange-200 p-4 mb-6">
          <h3 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-2">
            <ShieldAlert size={14} className="text-orange-600" />
            集中度风险客户（仅老板可见）
          </h3>
          <p className="text-xs text-gray-500 mb-3">以下客户占总营收比例超过预警阈值，建议关注客户集中度风险</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left text-xs border-b border-gray-100">
                  <th className="py-2 px-2">客户名称</th>
                  <th className="py-2 px-2">公司</th>
                  <th className="py-2 px-2 text-right">12个月成交额</th>
                  <th className="py-2 px-2 text-right">营收占比</th>
                  <th className="py-2 px-2 text-right">成交次数</th>
                </tr>
              </thead>
              <tbody>
                {concentrationRiskCustomers.map(c => (
                  <tr key={c.customer_id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 px-2 text-gray-900 font-medium">{c.customer_name}</td>
                    <td className="py-2 px-2 text-gray-600">{c.customer_company || '-'}</td>
                    <td className="py-2 px-2 text-right font-medium text-gray-800">${formatAmount(c.total_amount)}</td>
                    <td className="py-2 px-2 text-right font-bold text-orange-600">{(c.revenue_share * 100).toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right text-gray-600">{c.deal_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily progress table */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">各业务员今日进度</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-gray-100">
              <th className="py-2 px-3 font-medium">业务员</th>
              <th className="py-2 px-3 font-medium text-center">新增客户</th>
              <th className="py-2 px-3 font-medium text-center">推进阶段</th>
              <th className="py-2 px-3 font-medium text-center">联系记录</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {members.map(m => {
              const p = todayProgress[m.id] || { newCustomers: 0, stageChanges: 0, logs: 0 }
              return (
                <tr key={m.id}>
                  <td className="py-2 px-3 font-medium text-gray-900">{m.full_name}</td>
                  <td className="py-2 px-3 text-center">{p.newCustomers}</td>
                  <td className="py-2 px-3 text-center">{p.stageChanges}</td>
                  <td className="py-2 px-3 text-center">{p.logs}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatAmount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function StatCard({ icon: Icon, label, value, danger, gold, subtext }: {
  icon: any; label: string; value: number | string; danger?: boolean; gold?: boolean; subtext?: string
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${danger ? 'border-red-200' : gold ? 'border-gold-200' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={danger ? 'text-red-500' : gold ? 'text-gold-600' : 'text-gray-400'} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${danger ? 'text-red-600' : gold ? 'text-gold-700' : 'text-gray-900'}`}>{value}</p>
      {subtext && <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>}
    </div>
  )
}

