'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import type { Customer, Profile, Deal, Reminder } from '@/lib/types'
import { OVERDUE_DAYS_THRESHOLD, SILENT_DAYS_THRESHOLD, STAGES } from '@/lib/constants'
import { Users, AlertTriangle, Moon, TrendingUp, DollarSign, Package, Repeat, Bell, ShieldAlert, ArrowUp, ArrowDown, Target, Pencil } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { daysSince, todayLocalISO } from '@/lib/dates'
import { currencySymbol, formatAmount, sumInMainCurrency, countInMainCurrency, otherCurrenciesSummary, formatOtherCurrencies } from '@/lib/currency'

type ConcentrationRiskCustomer = {
  customer_id: string
  customer_name: string
  customer_company: string | null
  total_amount: number
  revenue_share: number
  deal_count: number
}

type TodayProgress = Record<string, { newCustomers: number; stageChanges: number; logs: number }>

interface BossDashboardData {
  customers: Customer[]
  members: Profile[]
  deals: Deal[]
  pending_reminders: Reminder[]
  concentration_risk_customers: ConcentrationRiskCustomer[]
  today_progress: TodayProgress
  monthly_target: number | null
  concentration_threshold: number | null
  main_currency: string
}

interface DashboardResponse {
  ok: boolean
  data?: BossDashboardData
  error?: string
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
  const [concentrationThreshold, setConcentrationThreshold] = useState<number>(0.30)
  const [todayProgress, setTodayProgress] = useState<TodayProgress>({})
  const [monthlyTarget, setMonthlyTarget] = useState<number | null>(null)
  const [showTargetForm, setShowTargetForm] = useState(false)
  const [targetInput, setTargetInput] = useState('')
  const [savingTarget, setSavingTarget] = useState(false)
  const [showThresholdForm, setShowThresholdForm] = useState(false)
  const [thresholdInput, setThresholdInput] = useState('')
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [rankingScope, setRankingScope] = useState<'month' | 'quarter' | 'year' | 'all'>('month')
  const [mainCurrency, setMainCurrency] = useState<string>('USD')
  const [loading, setLoading] = useState(true)

  async function refreshDashboard() {
    try {
      const res = await fetch('/api/dashboard/boss', { method: 'POST' })
      const body = (await res.json()) as DashboardResponse
      if (!body.ok || !body.data) {
        setLoading(false)
        return
      }
      const d = body.data
      setCustomers(d.customers || [])
      setMembers(d.members || [])
      // Cancelled deals are already filtered server-side.
      setDeals(d.deals || [])
      setPendingReminders(d.pending_reminders || [])
      setConcentrationRiskCustomers(d.concentration_risk_customers || [])
      setTodayProgress(d.today_progress || {})
      setMonthlyTarget(d.monthly_target)
      if (d.concentration_threshold !== null) {
        setConcentrationThreshold(d.concentration_threshold)
      }
      setMainCurrency((d.main_currency || 'USD').toUpperCase())
    } finally {
      setLoading(false)
    }
  }

  async function saveMonthlyTarget() {
    const raw = targetInput.trim()
    if (raw === '') {
      // Empty input means clear target
      setSavingTarget(true)
      const res = await fetch('/api/system-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'monthly_revenue_target', value: null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert('保存失败：' + (body?.error ?? '未知错误'))
        setSavingTarget(false)
        return
      }
      setMonthlyTarget(null)
      setShowTargetForm(false)
      setSavingTarget(false)
      return
    }
    const num = Number(raw)
    if (!isFinite(num) || num < 0) {
      alert('请输入有效金额（数字，不可为负）')
      return
    }
    setSavingTarget(true)
    const res = await fetch('/api/system-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'monthly_revenue_target', value: num }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert('保存失败：' + (body?.error ?? '未知错误'))
      setSavingTarget(false)
      return
    }
    setMonthlyTarget(num)
    setShowTargetForm(false)
    setSavingTarget(false)
  }

  function openTargetForm() {
    setTargetInput(monthlyTarget !== null ? String(monthlyTarget) : '')
    setShowTargetForm(true)
  }

  async function saveThreshold() {
    const raw = thresholdInput.trim()
    const pct = Number(raw)
    if (!isFinite(pct) || pct < 5 || pct > 30) {
      alert('请输入 5 - 30 之间的整数（百分比）')
      return
    }
    const decimal = pct / 100
    setSavingThreshold(true)
    const res = await fetch('/api/system-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'concentration_risk_threshold', value: decimal }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert('保存失败：' + (body?.error ?? '未知错误'))
      setSavingThreshold(false)
      return
    }
    setConcentrationThreshold(decimal)
    // 阈值变化后重新拉取大屏（包含 risk customer + 阈值同步）
    await refreshDashboard()
    setShowThresholdForm(false)
    setSavingThreshold(false)
  }

  function openThresholdForm() {
    setThresholdInput(String(Math.round(concentrationThreshold * 100)))
    setShowThresholdForm(true)
  }

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push('/dashboard/personal')
  }, [authLoading, isAdmin, router])

  useEffect(() => {
    if (!isAdmin) return
    refreshDashboard()
  }, [isAdmin])

  if (!isAdmin || loading) return <div className="p-6 text-gray-400">加载中..</div>

  const totalCustomers = customers.length
  // 修 #1: daysSince(null) === 9999（按 dates.ts 设计：never recorded → overdue forever），
  // 所以从未联系过的客户应该计入"超期未跟进"和"沉默"。旧逻辑用 c.last_contact_date && ...
  // 把 null 静默排除，导致大屏数字偏低 5-17%。
  const overdueCount = customers.filter(c =>
    daysSince(c.last_contact_date) >= OVERDUE_DAYS_THRESHOLD
  ).length
  const silentCount = customers.filter(c =>
    daysSince(c.last_contact_date) >= SILENT_DAYS_THRESHOLD && c.stage !== '已成交'
  ).length

  // Monthly deal stats
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthDeals = deals.filter(d => d.deal_date && d.deal_date >= monthStart)
  // 修 #11: 仅统计主货币的成交额，避免跨币种直接累加导致数字错误。其他币种单独显示。
  const monthDealAmount = sumInMainCurrency(monthDeals, mainCurrency)
  const monthDealCount = countInMainCurrency(monthDeals, mainCurrency)
  const monthOtherCurrencies = otherCurrenciesSummary(monthDeals, mainCurrency)

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

  // L13: 大屏「业务员」相关列表统一排除 admin(管理员不背销售指标),与今日进度口径一致
  const salesMembers = members.filter(m => m.role !== 'admin')

  const ownerCounts = salesMembers.map(m => ({
    name: m.full_name,
    count: customers.filter(c => c.owner_id === m.id).length,
  })).filter(o => o.count > 0).sort((a, b) => b.count - a.count)

  const stageCounts = STAGES.map(s => ({
    name: s,
    value: customers.filter(c => c.stage === s).length,
  }))

  // Monthly deal trend (last 6 months) — 修 #11: 仅主货币
  const monthlyDealData: { month: string; amount: number; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const mDeals = deals.filter(deal => deal.deal_date?.startsWith(mKey))
    monthlyDealData.push({
      month: `${d.getMonth() + 1}月`,
      amount: sumInMainCurrency(mDeals, mainCurrency),
      count: countInMainCurrency(mDeals, mainCurrency),
    })
  }

  // Top deal salespersons (scope-aware)
  const rankingScopeStart = (() => {
    if (rankingScope === 'all') return null
    const d = new Date(now)
    if (rankingScope === 'month') d.setDate(1)
    else if (rankingScope === 'quarter') d.setMonth(now.getMonth() - 2, 1)
    else if (rankingScope === 'year') d.setMonth(0, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const rankingScopeDeals = rankingScopeStart
    ? deals.filter(d => d.deal_date && d.deal_date >= rankingScopeStart)
    : deals
  // 修 #11: 排行只算主货币
  const memberDealMap = new Map<string, number>()
  rankingScopeDeals.forEach(d => {
    if (d.created_by && ((d.currency || 'USD').toUpperCase() === mainCurrency)) {
      memberDealMap.set(d.created_by, (memberDealMap.get(d.created_by) || 0) + (d.deal_amount || 0))
    }
  })
  const memberDealRanking = salesMembers
    .map(m => ({ name: m.full_name, amount: memberDealMap.get(m.id) || 0 }))
    .filter(m => m.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  // Reminder distribution by member
  const todayStr = todayLocalISO()
  const reminderByMember = salesMembers.map(m => {
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

  // === P1-1.1: YoY/MoM Revenue Comparison === 修 #11: 仅主货币
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`
  const lastMonthDeals = deals.filter(d => d.deal_date?.startsWith(lastMonthKey))
  const lastMonthAmount = sumInMainCurrency(lastMonthDeals, mainCurrency)

  // Calculate MoM (Month-over-Month)
  let momChange: number | null = null
  let momPercent: number | null = null
  if (lastMonthAmount > 0) {
    momChange = monthDealAmount - lastMonthAmount
    momPercent = (momChange / lastMonthAmount) * 100
  }

  // Calculate last year same month revenue — 修 #11: 仅主货币
  const lastYearDate = new Date(now.getFullYear() - 1, now.getMonth(), 1)
  const lastYearMonthKey = `${lastYearDate.getFullYear()}-${String(lastYearDate.getMonth() + 1).padStart(2, '0')}`
  const lastYearMonthDeals = deals.filter(d => d.deal_date?.startsWith(lastYearMonthKey))
  const lastYearMonthAmount = sumInMainCurrency(lastYearMonthDeals, mainCurrency)

  // Calculate YoY (Year-over-Year)
  let yoyChange: number | null = null
  let yoyPercent: number | null = null
  if (lastYearMonthAmount > 0) {
    yoyChange = monthDealAmount - lastYearMonthAmount
    yoyPercent = (yoyChange / lastYearMonthAmount) * 100
  }

  // === P1-1.2: Conversion Funnel（累计漏斗占比） === 修 #2
  // 主漏斗链：待定 → 新接触 → 报价中 → 已寄样 → 已成交。
  // 沉默是【流失分支】，单独显示，不计入主漏斗的累计% 也不计入"总转化率"分母。
  // 旧设计把沉默放在主漏斗末尾，导致已成交累计 = 已成交+沉默（32%），但底部总转化率
  // 只算已成交（17%）→ 内部不一致。
  const FUNNEL_MAIN_STAGES: { stage: string; color: string }[] = [
    { stage: '待定',   color: 'bg-gray-300' },
    { stage: '新接触', color: 'bg-gold-300' },
    { stage: '报价中', color: 'bg-gold-400' },
    { stage: '已寄样', color: 'bg-gold-500' },
    { stage: '已成交', color: 'bg-green-500' },
  ]
  const funnelCounts = FUNNEL_MAIN_STAGES.map(s => customers.filter(c => c.stage === s.stage).length)
  const funnelTotal = funnelCounts.reduce((a, b) => a + b, 0)
  const silentLossCount = customers.filter(c => c.stage === '沉默').length
  const funnelData = FUNNEL_MAIN_STAGES.map((s, index) => {
    const count = funnelCounts[index]
    const cumulativeCount = funnelCounts.slice(index).reduce((a, b) => a + b, 0)
    const cumulativePercent = funnelTotal > 0 ? (cumulativeCount / funnelTotal) * 100 : 0
    return { stage: s.stage, color: s.color, count, cumulativePercent }
  })
  // 总转化率 = 已成交 / 主漏斗总人数（不含沉默）
  const closedCount = customers.filter(c => c.stage === '已成交').length
  const overallConversion = funnelTotal > 0 ? (closedCount / funnelTotal) * 100 : 0

  // === P1-1.3: Monthly Target Progress ===
  const targetProgress = monthlyTarget && monthlyTarget > 0
    ? (monthDealAmount / monthlyTarget) * 100
    : null
  void momChange
  void yoyChange

  return (
    <div className="p-4 lg:p-6 max-w-6xl">
      <h1 className="text-xl font-bold text-gray-900 mb-4">老板大屏</h1>

      {/* Top cards row 1: deal metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <StatCard
          icon={DollarSign}
          label={`本月成交额 (${mainCurrency})`}
          value={`${currencySymbol(mainCurrency)}${formatAmount(monthDealAmount)}`}
          subtext={monthOtherCurrencies.length > 0 ? formatOtherCurrencies(monthOtherCurrencies) + '（未计入主货币）' : undefined}
          gold
        />
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
      {showTargetForm ? (
        <div className="bg-white rounded-xl border border-gold-300 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} className="text-gold-600" />
            <h3 className="text-sm font-semibold text-gray-700">设置本月业绩目标</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">$</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={targetInput}
              onChange={e => setTargetInput(e.target.value)}
              placeholder="例如 200000（留空表示清除目标）"
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-gold-400"
              autoFocus
            />
            <button
              onClick={saveMonthlyTarget}
              disabled={savingTarget}
              className="px-3 py-1.5 bg-gold-600 text-white text-sm rounded hover:bg-gold-700 disabled:opacity-50 cursor-pointer"
            >
              {savingTarget ? '保存中…' : '保存'}
            </button>
            <button
              onClick={() => setShowTargetForm(false)}
              disabled={savingTarget}
              className="px-3 py-1.5 text-gray-600 text-sm rounded hover:bg-gray-100 cursor-pointer"
            >
              取消
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">金额以当前主货币（{mainCurrency}）为单位。如需调整主货币：DB `system_settings.main_currency`。</p>
        </div>
      ) : monthlyTarget !== null && monthlyTarget > 0 ? (
        <div className="bg-white rounded-xl border border-gold-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Target size={14} className="text-gold-600" />
              本月业绩目标
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">目标: {currencySymbol(mainCurrency)}{formatAmount(monthlyTarget)}</span>
              <button
                onClick={openTargetForm}
                title="修改目标"
                className="p-1 text-gray-400 hover:text-gold-600 cursor-pointer"
              >
                <Pencil size={12} />
              </button>
            </div>
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
              已完成: {currencySymbol(mainCurrency)}{formatAmount(monthDealAmount)}
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
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Target size={14} className="text-gray-400" />
              本月业绩目标
            </h3>
            <button
              onClick={openTargetForm}
              className="text-xs text-gold-600 hover:text-gold-700 cursor-pointer flex items-center gap-1"
            >
              <Pencil size={12} />
              设置目标
            </button>
          </div>
          <p className="text-sm text-gray-400">未设置本月目标，点右上"设置目标"录入</p>
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
                  {currencySymbol(mainCurrency)}{formatAmount(monthDealAmount)}
                </span>
                <span className="text-xs text-gray-500">本月成交额 ({mainCurrency})</span>
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
                  vs 上月 {currencySymbol(mainCurrency)}{formatAmount(lastMonthAmount)}
                </span>
              </div>
              {(() => {
                const now = new Date()
                const dayOfMonth = now.getDate()
                const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
                // L12: 月初 1-4 号样本太少,×(当月天数/已过天数) 预估会剧烈失真,不显示
                if (dayOfMonth >= 5 && dayOfMonth < daysInMonth) {
                  const projected = monthDealAmount * (daysInMonth / dayOfMonth)
                  const projectedPercent = lastMonthAmount > 0 ? ((projected - lastMonthAmount) / lastMonthAmount) * 100 : null
                  return (
                    <p className="text-xs text-gray-400 mt-1">
                      本月已过 {dayOfMonth}/{daysInMonth} 天{projectedPercent !== null && (
                        <>，按当前进度预估月底约 {currencySymbol(mainCurrency)}{formatAmount(projected)}（环比 {projectedPercent >= 0 ? '+' : ''}{projectedPercent.toFixed(1)}%）</>
                      )}
                    </p>
                  )
                }
                return null
              })()}
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
                  {currencySymbol(mainCurrency)}{formatAmount(monthDealAmount)}
                </span>
                <span className="text-xs text-gray-500">本月成交额 ({mainCurrency})</span>
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
                  vs 去年同月 {currencySymbol(mainCurrency)}{formatAmount(lastYearMonthAmount)}
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
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">成交漏斗</h3>
          <span className="text-xs text-gray-400">累计占比 = 主漏斗中该阶段及之后人数 / 主漏斗总人数。沉默单独显示为流失分支。</span>
        </div>
        {funnelTotal === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">暂无客户进入漏斗</p>
        ) : (
          <>
            <div className="space-y-3">
              {funnelData.map((item) => (
                <div key={item.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{item.stage}</span>
                    <span className="text-sm text-gray-500">
                      <span className="font-bold text-gray-900">{item.count} 人</span>
                      <span className="ml-2 text-xs text-gray-400">累计 {item.cumulativePercent.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="relative h-8 bg-gray-100 rounded overflow-hidden">
                    <div
                      className={`h-full ${item.color} flex items-center justify-start px-3`}
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
              {/* 修 #2: 沉默作为流失分支独立显示，不参与主漏斗累计% */}
              {silentLossCount > 0 && (
                <div className="pt-3 border-t border-dashed border-gray-200 mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-500">沉默（流失）</span>
                    <span className="text-sm text-gray-500">
                      <span className="font-bold text-gray-700">{silentLossCount} 人</span>
                      <span className="ml-2 text-xs text-gray-400">
                        占总 {((silentLossCount / Math.max(funnelTotal + silentLossCount, 1)) * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                  <div className="relative h-6 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full bg-gray-400"
                      style={{ width: `${Math.max((silentLossCount / Math.max(funnelTotal + silentLossCount, 1)) * 100, 5)}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">总转化率（已成交 / 主漏斗总人数，不含沉默）</span>
              <span className="text-sm font-bold text-green-600">
                {overallConversion.toFixed(1)}%
                <span className="ml-1 text-xs text-gray-400 font-normal">
                  ({closedCount} / {funnelTotal})
                </span>
              </span>
            </div>
          </>
        )}
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
                formatter={(value) => [`${currencySymbol(mainCurrency)}${formatAmount(Number(value))}`, '成交额']}
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
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#b45309" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Member deal ranking (scoped) */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">业务员成交排行</h3>
            <select
              value={rankingScope}
              onChange={e => setRankingScope(e.target.value as typeof rankingScope)}
              className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-gold-400 cursor-pointer"
            >
              <option value="month">本月</option>
              <option value="quarter">近 3 个月</option>
              <option value="year">今年</option>
              <option value="all">全部时间</option>
            </select>
          </div>
          {memberDealRanking.length === 0 ? (
            <p className="text-sm text-gray-400 mt-8 text-center">该时段暂无成交</p>
          ) : (
            <div className="space-y-2 mt-2">
              {memberDealRanking.map((m, i) => (
                <div key={m.name} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-gold-100 text-gold-700' : 'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  <span className="text-sm text-gray-800 flex-1">{m.name}</span>
                  <span className="text-sm font-medium text-gray-900">{currencySymbol(mainCurrency)}{formatAmount(m.amount)}</span>
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
      <div className="bg-white rounded-xl border border-orange-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-orange-700 flex items-center gap-2">
            <ShieldAlert size={14} className="text-orange-600" />
            集中度风险客户（仅老板可见）
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">阈值 {(concentrationThreshold * 100).toFixed(0)}%</span>
            <button
              onClick={openThresholdForm}
              title="修改阈值"
              className="p-1 text-gray-400 hover:text-orange-600 cursor-pointer"
            >
              <Pencil size={12} />
            </button>
          </div>
        </div>

        {showThresholdForm && (
          <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="5"
                max="30"
                step="1"
                value={thresholdInput}
                onChange={e => setThresholdInput(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-orange-400"
                autoFocus
              />
              <span className="text-sm text-gray-500">%</span>
              <button
                onClick={saveThreshold}
                disabled={savingThreshold}
                className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 disabled:opacity-50 cursor-pointer"
              >
                {savingThreshold ? '保存中…' : '保存'}
              </button>
              <button
                onClick={() => setShowThresholdForm(false)}
                disabled={savingThreshold}
                className="px-3 py-1.5 text-gray-600 text-sm rounded hover:bg-gray-100 cursor-pointer"
              >
                取消
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">输入 5 - 30 之间的整数（百分比）。例如 10 表示单客户占比超过 10% 触发预警。</p>
          </div>
        )}

        {concentrationRiskCustomers.length > 0 ? (
          <>
            <p className="text-xs text-gray-500 mb-3">以下客户占总营收比例超过预警阈值（{(concentrationThreshold * 100).toFixed(0)}%），建议关注客户集中度风险</p>
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
                      <td className="py-2 px-2 text-right font-medium text-gray-800">{currencySymbol(mainCurrency)}{formatAmount(c.total_amount)}</td>
                      <td className="py-2 px-2 text-right font-bold text-orange-600">{(c.revenue_share * 100).toFixed(1)}%</td>
                      <td className="py-2 px-2 text-right text-gray-600">{c.deal_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400">
            当前无集中度风险客户 — 近 12 个月内无单一客户占总营收超过 {(concentrationThreshold * 100).toFixed(0)}%。客户分布健康。
          </p>
        )}
      </div>


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
            {/* 修 #3: 今日进度只列 member 角色，过滤掉 admin */}
            {members.filter(m => m.role !== 'admin').map(m => {
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

function StatCard({ icon: Icon, label, value, danger, gold, subtext }: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number | string
  danger?: boolean
  gold?: boolean
  subtext?: string
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
