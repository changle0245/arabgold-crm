// Phase 3b · POST /api/dashboard/boss
//   Hydrates the boss dashboard in a single round-trip. Admin-only.
//   Replaces the 7+ `createClient().from(...)` chains in
//   src/app/(app)/dashboard/boss/page.tsx.
//
//   The deals array is returned with only the fields needed for the chart
//   computations (id, deal_amount, currency, deal_date, status, customer_id,
//   created_by, deal_no, is_reorder, deposit_received, balance_received) to
//   keep the payload small. Cancelled deals are filtered out server-side
//   (matches the H2 fix — every revenue path excludes cancelled).

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-helpers'
import type { Customer, Profile, Deal, Reminder } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ConcentrationRiskRow = {
  customer_id: string
  customer_name: string
  customer_company: string | null
  total_amount: number
  revenue_share: number
  deal_count: number
}

type TodayProgress = Record<
  string,
  { newCustomers: number; stageChanges: number; logs: number }
>

export async function POST(_request: NextRequest) {
  const r = await requireAdmin()
  if (!r.ok) {
    return Response.json({ ok: false, error: r.error }, { status: r.status })
  }
  const admin = createAdminClient()

  // ── Today in Asia/Shanghai for the "today progress" join ──
  const { rows: boundaryRows } = await db.query<{ today: string }>(
    `select (now() at time zone 'Asia/Shanghai')::date::text as today`
  )
  const today = boundaryRows[0].today
  const todayTs = `${today}T00:00:00+08:00`

  // ── 1. All customers ──
  const { data: custData, error: custErr } = await admin
    .from<Customer>('customers')
    .select('*')
  if (custErr) {
    return Response.json({ ok: false, error: custErr.message }, { status: 500 })
  }
  const customers = (custData ?? []) as Customer[]

  // ── 2. All active members ──
  const { data: memData, error: memErr } = await admin
    .from<Profile>('profiles')
    .select('*')
    .eq('is_active', true)
  if (memErr) {
    return Response.json({ ok: false, error: memErr.message }, { status: 500 })
  }
  const members = (memData ?? []) as Profile[]

  // ── 3. All deals (slim shape) ──
  // Cancelled deals are dropped here so client doesn't have to filter twice.
  const { rows: dealRows } = await db.query<Deal>(
    `select id, customer_id, deal_no, deal_date, deal_amount, currency,
            status, is_reorder, deposit_received, balance_received,
            created_by, created_at
       from public.deals
      where status <> 'cancelled'
      order by deal_date desc nulls last`
  )
  const deals = dealRows as Deal[]

  // ── 4. Pending reminders (full row — client needs assigned_to + due_date) ──
  const { data: remData, error: remErr } = await admin
    .from<Reminder>('reminders')
    .select('*')
    .eq('status', 'pending')
  if (remErr) {
    return Response.json({ ok: false, error: remErr.message }, { status: 500 })
  }
  const pending_reminders = (remData ?? []) as Reminder[]

  // ── 5. Concentration risk customers (SECURITY DEFINER RPC) ──
  const { rows: riskRows } = await db.query<ConcentrationRiskRow>(
    `select * from public.get_concentration_risk_customers()`
  )
  const concentration_risk_customers = riskRows as ConcentrationRiskRow[]

  // ── 6. Today progress per member ──
  // One JOIN per source table (customers / stage_changes / contact_logs).
  // The personal page exposes only members (admin excluded from sales metrics).
  const [
    { rows: todayCustRows },
    { rows: todayStageRows },
    { rows: todayLogRows },
  ] = await Promise.all([
    db.query<{ created_by: string | null }>(
      `select created_by from public.customers where created_at >= $1::timestamptz`,
      [todayTs]
    ),
    db.query<{ changed_by: string | null }>(
      `select changed_by from public.stage_changes where changed_at >= $1::timestamptz`,
      [todayTs]
    ),
    db.query<{ logged_by: string | null }>(
      `select logged_by from public.contact_logs where log_date = $1::date`,
      [today]
    ),
  ])
  const today_progress: TodayProgress = {}
  for (const m of members) {
    if (m.role !== 'admin') {
      today_progress[m.id] = { newCustomers: 0, stageChanges: 0, logs: 0 }
    }
  }
  for (const row of todayCustRows) {
    if (row.created_by && today_progress[row.created_by]) {
      today_progress[row.created_by].newCustomers++
    }
  }
  for (const row of todayStageRows) {
    if (row.changed_by && today_progress[row.changed_by]) {
      today_progress[row.changed_by].stageChanges++
    }
  }
  for (const row of todayLogRows) {
    if (row.logged_by && today_progress[row.logged_by]) {
      today_progress[row.logged_by].logs++
    }
  }

  // ── 7. System settings (3 keys in one round trip) ──
  const { rows: settingsRows } = await db.query<{ key: string; value: unknown }>(
    `select key, value from public.system_settings
      where key in ('monthly_revenue_target', 'concentration_risk_threshold', 'main_currency')`
  )
  const settingsMap = new Map<string, unknown>(
    settingsRows.map((s) => [s.key, s.value])
  )
  const targetRaw = settingsMap.get('monthly_revenue_target')
  let monthly_target: number | null = null
  if (
    targetRaw !== undefined &&
    targetRaw !== null &&
    targetRaw !== 'null'
  ) {
    const num = typeof targetRaw === 'number' ? targetRaw : Number(targetRaw)
    if (Number.isFinite(num)) monthly_target = num
  }
  const thresholdRaw = settingsMap.get('concentration_risk_threshold')
  let concentration_threshold: number | null = null
  if (thresholdRaw !== undefined && thresholdRaw !== null) {
    const num = typeof thresholdRaw === 'number' ? thresholdRaw : Number(thresholdRaw)
    if (Number.isFinite(num)) concentration_threshold = num
  }
  const mcRaw = settingsMap.get('main_currency')
  const main_currency =
    (typeof mcRaw === 'string' && mcRaw.length > 0 ? mcRaw : 'USD').toUpperCase()

  return Response.json({
    ok: true,
    data: {
      customers,
      members,
      deals,
      pending_reminders,
      concentration_risk_customers,
      today_progress,
      monthly_target,
      concentration_threshold,
      main_currency,
    },
  })
}
