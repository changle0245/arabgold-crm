import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SITE_ID,
  guardHmac,
  jsonOk,
  jsonError,
  parseIsoUtc,
  parseLimit,
} from '@/lib/middleground/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 契约 §9.2.1 全部枚举(用于校验 metric_name 是否合法)
const ALL_METRIC_NAMES = new Set([
  'daily_visits',
  'daily_pageviews',
  'monthly_revenue',
  'monthly_orders',
  'monthly_quotes',
  'monthly_inquiries',
  'product_count',
  'blog_count',
  'customer_count',
  'ad_revenue_daily',
])

// CRM 实际能产出的子集(其它枚举内的 metric_name 视为合法但 CRM 无数据,返回空)
const CRM_SUPPORTED = new Set([
  'customer_count',
  'monthly_orders',
  'monthly_quotes',
  'monthly_revenue',
])

interface MetricRow {
  site_id: string
  metric_name: string
  value: number
  unit: 'count' | 'usd_cents'
  timestamp: string
  dimensions: Record<string, string>
}

function monthStartIso(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString()
}

async function fetchMonthlyCount(
  admin: ReturnType<typeof createAdminClient>,
  table: 'deals' | 'quotations',
  dateColumn: string,
  metricName: string,
  since: Date,
  until: Date
): Promise<MetricRow[]> {
  const { data, error } = await admin
    .from(table)
    .select(dateColumn)
    .gte(dateColumn, since.toISOString())
    .lt(dateColumn, until.toISOString())
    .not(dateColumn, 'is', null)
  if (error) throw error

  const buckets = new Map<string, number>()
  for (const row of data ?? []) {
    const raw = (row as unknown as Record<string, unknown>)[dateColumn]
    if (!raw) continue
    const d = new Date(raw as string)
    if (Number.isNaN(d.getTime())) continue
    const key = monthStartIso(d)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ts, value]) => ({
      site_id: SITE_ID(),
      metric_name: metricName,
      value,
      unit: 'count' as const,
      timestamp: ts,
      dimensions: {},
    }))
}

async function fetchMonthlyRevenue(
  admin: ReturnType<typeof createAdminClient>,
  since: Date,
  until: Date
): Promise<MetricRow[]> {
  // 主货币从 system_settings 读;契约要求 unit=usd_cents,但 CRM 不做汇率换算
  // 按风险点 #1:value 是主货币的最小单位金额,dimensions.original_currency 标注实际币种
  const { data: settingRow } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'main_currency')
    .maybeSingle()
  // value 在该表里是 jsonb,取出后是字符串如 "USD"
  const rawMain = (settingRow?.value as unknown) ?? 'USD'
  const mainCurrency = (typeof rawMain === 'string' ? rawMain : 'USD').toUpperCase()

  const { data, error } = await admin
    .from('deals')
    .select('deal_date, deal_amount, currency, status')
    .gte('deal_date', since.toISOString().slice(0, 10))
    .lt('deal_date', until.toISOString().slice(0, 10))
    .not('deal_date', 'is', null)
  if (error) throw error

  const buckets = new Map<string, number>()
  for (const row of data ?? []) {
    const r = row as { deal_date: string | null; deal_amount: number | null; currency: string | null; status: string | null }
    if (!r.deal_date || r.deal_amount === null) continue
    // 与 get_company_month_revenue / refresh_customer_deal_stats 一致:仅累加主货币
    const c = (r.currency ?? 'USD').toUpperCase()
    if (c !== mainCurrency) continue
    // 也跟取消单的处理对齐:跳过 cancelled(与 20260520030000_exclude_cancelled_deals 一致)
    if (r.status === 'cancelled') continue
    const d = new Date(r.deal_date)
    if (Number.isNaN(d.getTime())) continue
    const key = monthStartIso(d)
    const cents = Math.round(Number(r.deal_amount) * 100)
    if (!Number.isFinite(cents)) continue
    buckets.set(key, (buckets.get(key) ?? 0) + cents)
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ts, value]) => ({
      site_id: SITE_ID(),
      metric_name: 'monthly_revenue',
      value,
      unit: 'usd_cents' as const,
      timestamp: ts,
      dimensions: { original_currency: mainCurrency },
    }))
}

async function fetchCustomerCount(
  admin: ReturnType<typeof createAdminClient>,
  since: Date,
  until: Date
): Promise<MetricRow[]> {
  // 快照型指标 — 只在 [since, until) 区间覆盖当前时刻时返回 1 个点
  const now = new Date()
  if (now < since || now >= until) return []
  const { count, error } = await admin
    .from('customers')
    .select('id', { count: 'exact', head: true })
  if (error) throw error
  return [
    {
      site_id: SITE_ID(),
      metric_name: 'customer_count',
      value: count ?? 0,
      unit: 'count',
      timestamp: now.toISOString(),
      dimensions: {},
    },
  ]
}

export async function GET(request: NextRequest) {
  const denied = guardHmac(request)
  if (denied) return denied

  const sp = request.nextUrl.searchParams
  const sinceRaw = sp.get('since')
  const untilRaw = sp.get('until')
  const metricFilter = sp.get('metric_name')
  const limit = parseLimit(sp.get('limit'), 1000, 10000)

  const since = parseIsoUtc(sinceRaw)
  if (!since) {
    return jsonError('E_INVALID_RANGE', 'since is required, must be ISO 8601 UTC ending with Z')
  }
  const until = untilRaw === null ? new Date() : parseIsoUtc(untilRaw)
  if (!until) {
    return jsonError('E_INVALID_RANGE', 'until must be ISO 8601 UTC ending with Z')
  }
  if (until <= since) {
    return jsonError('E_INVALID_RANGE', 'until must be strictly greater than since')
  }

  if (metricFilter !== null && !ALL_METRIC_NAMES.has(metricFilter)) {
    return jsonError('E_UNSUPPORTED_METRIC', `metric_name "${metricFilter}" is not in the v1 enum`)
  }

  // 决定本次要跑的指标集合
  const targets = metricFilter === null ? Array.from(CRM_SUPPORTED) : [metricFilter]

  const admin = createAdminClient()
  const rows: MetricRow[] = []

  try {
    for (const name of targets) {
      if (!CRM_SUPPORTED.has(name)) continue // 合法枚举但 CRM 无该数据 → 空
      if (name === 'monthly_orders') {
        rows.push(...(await fetchMonthlyCount(admin, 'deals', 'deal_date', name, since, until)))
      } else if (name === 'monthly_quotes') {
        rows.push(...(await fetchMonthlyCount(admin, 'quotations', 'created_at', name, since, until)))
      } else if (name === 'monthly_revenue') {
        rows.push(...(await fetchMonthlyRevenue(admin, since, until)))
      } else if (name === 'customer_count') {
        rows.push(...(await fetchCustomerCount(admin, since, until)))
      }
    }
  } catch (e) {
    return jsonError('E_INTERNAL', e instanceof Error ? e.message : 'metric query failed')
  }

  // 全局排序 + limit(契约 §9.2 limit 默认 1000 最大 10000)
  rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.metric_name.localeCompare(b.metric_name))
  const sliced = rows.slice(0, limit)
  return jsonOk(sliced, sliced.length, null)
}
