// Phase 3b · POST /api/dashboard/personal
//   Hydrates the personal dashboard in a single round-trip. Members + admins
//   both see only their own data (个人看板语义).
//
//   Replaces the 14+ `createClient().from(...)` chains in
//   src/app/(app)/dashboard/personal/page.tsx.
//
// Date semantics: all "today / week / month" boundaries are computed in
// Asia/Shanghai (`now() at time zone 'Asia/Shanghai'`) so the answer matches
// the CN-local calendar regardless of the server's TZ. Same convention used
// by the existing dates.ts helpers.

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth-helpers'
import type { Customer, Reminder } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface WeekMonthStats {
  newCustomers: number
  logs: number
  stageChanges: number
  deals: number
}

export async function POST(_request: NextRequest) {
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user
  const admin = createAdminClient()

  // ── Date boundaries (Asia/Shanghai, computed server-side) ──
  const { rows: boundaryRows } = await db.query<{
    today: string
    month_start: string
    week_start: string
  }>(
    `select
       (now() at time zone 'Asia/Shanghai')::date::text as today,
       date_trunc('month', (now() at time zone 'Asia/Shanghai'))::date::text as month_start,
       (
         (now() at time zone 'Asia/Shanghai')::date
         - ((extract(isodow from (now() at time zone 'Asia/Shanghai'))::int - 1) || ' days')::interval
       )::date::text as week_start`
  )
  const today = boundaryRows[0].today
  const monthStart = boundaryRows[0].month_start
  const weekStartDate = boundaryRows[0].week_start
  // timestamptz comparisons need CN offset; created_at/changed_at are timestamptz.
  const todayTs = `${today}T00:00:00+08:00`
  const weekStartTs = `${weekStartDate}T00:00:00+08:00`
  const monthStartTs = `${monthStart}T00:00:00+08:00`

  // ── 1. My customers (owner_id = me, ordered by last_contact_date asc nullsFirst) ──
  const { data: myCustomersData, error: myCustomersErr } = await admin
    .from<Customer>('customers')
    .select('*')
    .eq('owner_id', user.id)
    .order('last_contact_date', { ascending: true, nullsFirst: true })
  if (myCustomersErr) {
    return Response.json({ ok: false, error: myCustomersErr.message }, { status: 500 })
  }
  const my_customers = (myCustomersData ?? []) as Customer[]

  // ── 2. Today counts: new customers + contact logs ──
  const [{ rows: todayNewRows }, { rows: todayLogRows }] = await Promise.all([
    db.query<{ c: number }>(
      `select count(*)::int as c from public.customers
        where created_by = $1 and created_at >= $2::timestamptz`,
      [user.id, todayTs]
    ),
    db.query<{ c: number }>(
      `select count(*)::int as c from public.contact_logs
        where logged_by = $1 and log_date = $2::date`,
      [user.id, today]
    ),
  ])
  const today_new_count = todayNewRows[0]?.c ?? 0
  const today_logs = todayLogRows[0]?.c ?? 0

  // ── 3. My pending reminders + JOIN customer mini-shape ──
  const { data: reminderRows, error: reminderErr } = await admin
    .from<Reminder>('reminders')
    .select('*')
    .eq('assigned_to', user.id)
    .eq('status', 'pending')
    .order('due_date', { ascending: true })
  if (reminderErr) {
    return Response.json({ ok: false, error: reminderErr.message }, { status: 500 })
  }
  const reminders = (reminderRows ?? []) as Reminder[]
  const reminderCustomerIds = Array.from(
    new Set(reminders.map((rm) => rm.customer_id).filter((x): x is string => !!x))
  )
  const customerMiniMap = new Map<
    string,
    { id: string; contact_name: string; company_name: string | null }
  >()
  if (reminderCustomerIds.length > 0) {
    const { data: miniRows } = await admin
      .from<Customer>('customers')
      .select('id, contact_name, company_name')
      .in('id', reminderCustomerIds)
    for (const m of (miniRows ?? []) as Array<{
      id: string
      contact_name: string
      company_name: string | null
    }>) {
      customerMiniMap.set(m.id, m)
    }
  }
  const my_reminders = reminders.map((rm) => ({
    ...rm,
    customer: rm.customer_id ? customerMiniMap.get(rm.customer_id) : undefined,
  }))

  // ── 4. Weekly & monthly stats: customers + logs + stage_changes + deals (count) ──
  const [
    { rows: weekCustRows },
    { rows: monthCustRows },
    { rows: weekLogRows },
    { rows: monthLogRows },
    { rows: weekStageRows },
    { rows: monthStageRows },
    { rows: weekDealRows },
    { rows: monthDealRows },
  ] = await Promise.all([
    db.query<{ c: number }>(
      `select count(*)::int as c from public.customers
        where created_by = $1 and created_at >= $2::timestamptz`,
      [user.id, weekStartTs]
    ),
    db.query<{ c: number }>(
      `select count(*)::int as c from public.customers
        where created_by = $1 and created_at >= $2::timestamptz`,
      [user.id, monthStartTs]
    ),
    db.query<{ c: number }>(
      `select count(*)::int as c from public.contact_logs
        where logged_by = $1 and log_date >= $2::date`,
      [user.id, weekStartDate]
    ),
    db.query<{ c: number }>(
      `select count(*)::int as c from public.contact_logs
        where logged_by = $1 and log_date >= $2::date`,
      [user.id, monthStart]
    ),
    db.query<{ c: number }>(
      `select count(*)::int as c from public.stage_changes
        where changed_by = $1 and changed_at >= $2::timestamptz`,
      [user.id, weekStartTs]
    ),
    db.query<{ c: number }>(
      `select count(*)::int as c from public.stage_changes
        where changed_by = $1 and changed_at >= $2::timestamptz`,
      [user.id, monthStartTs]
    ),
    db.query<{ c: number }>(
      `select count(*)::int as c from public.deals
        where created_by = $1 and status <> 'cancelled' and deal_date >= $2::date`,
      [user.id, weekStartDate]
    ),
    db.query<{ c: number }>(
      `select count(*)::int as c from public.deals
        where created_by = $1 and status <> 'cancelled' and deal_date >= $2::date`,
      [user.id, monthStart]
    ),
  ])
  const weekly_stats: WeekMonthStats = {
    newCustomers: weekCustRows[0]?.c ?? 0,
    logs: weekLogRows[0]?.c ?? 0,
    stageChanges: weekStageRows[0]?.c ?? 0,
    deals: weekDealRows[0]?.c ?? 0,
  }
  const monthly_stats: WeekMonthStats = {
    newCustomers: monthCustRows[0]?.c ?? 0,
    logs: monthLogRows[0]?.c ?? 0,
    stageChanges: monthStageRows[0]?.c ?? 0,
    deals: monthDealRows[0]?.c ?? 0,
  }

  // ── 5. Main currency setting (default USD) ──
  const { rows: mcRows } = await db.query<{ value: unknown }>(
    `select value from public.system_settings where key = 'main_currency' limit 1`
  )
  const mcRaw = mcRows[0]?.value
  const main_currency =
    (typeof mcRaw === 'string' && mcRaw.length > 0 ? mcRaw : 'USD').toUpperCase()

  // ── 6. My month revenue (主货币 only, exclude cancelled) ──
  // deals.created_by = me. The schema has no deals.owner_id column — deal
  // ownership is derived via customers.owner_id. We use created_by here to
  // match the legacy client behaviour (personal page filtered by created_by).
  const { rows: myMonthRevRows } = await db.query<{ s: string | null }>(
    `select coalesce(sum(deal_amount), 0)::text as s
       from public.deals
      where created_by = $1
        and status <> 'cancelled'
        and deal_date >= $2::date
        and upper(coalesce(currency, 'USD')) = $3`,
    [user.id, monthStart, main_currency]
  )
  const my_month_revenue = Number(myMonthRevRows[0]?.s ?? 0) || 0

  // ── 7. Company-wide month revenue (SECURITY DEFINER RPC) ──
  const { rows: companyRevRows } = await db.query<{ v: string | null }>(
    `select public.get_company_month_revenue($1::date)::text as v`,
    [monthStart]
  )
  const company_month_revenue = Number(companyRevRows[0]?.v ?? 0) || 0

  return Response.json({
    ok: true,
    data: {
      my_customers,
      today_new_count,
      today_logs,
      my_reminders,
      weekly_stats,
      monthly_stats,
      my_month_revenue,
      company_month_revenue,
      main_currency,
    },
  })
}
