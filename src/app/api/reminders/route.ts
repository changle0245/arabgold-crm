// Phase 3b · GET /api/reminders
//   List reminders with scope/status/type filters + paginated + 3-bucket stats.
//   Replaces createClient().from('reminders') chains in
//   src/app/(app)/reminders/page.tsx.
//
//   ACL:
//     - members: scope forced to 'mine' (assigned_to = me)
//     - admins:  may opt scope=all (no assigned_to filter) or scope=mine
//
//   Stats (overdue / today / upcoming) are scoped by `scope` only — they
//   describe the pending bucket and are independent of the current status/type
//   filter so the cards stay stable as the user flicks filters around.

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth-helpers'
import type { Customer, Profile, Reminder } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

export async function GET(request: NextRequest) {
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user

  const sp = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const statusFilter = (sp.get('status') ?? 'pending').trim()
  const typeFilter = (sp.get('type') ?? '').trim()
  const scopeParam = (sp.get('scope') ?? 'mine').trim()

  // ACL: members are always 'mine' regardless of what they send
  const scope: 'mine' | 'all' =
    user.role !== 'admin' || scopeParam === 'mine' ? 'mine' : 'all'

  const admin = createAdminClient()

  // ── Main list query ──
  let q = admin.from<Reminder>('reminders').select('*', { count: 'exact' })
  if (scope === 'mine') q = q.eq('assigned_to', user.id)
  if (statusFilter !== 'all') q = q.eq('status', statusFilter)
  if (typeFilter && typeFilter !== 'all') q = q.eq('type', typeFilter)

  const start = (page - 1) * PAGE_SIZE
  const { data, count, error } = await q
    .order('due_date', { ascending: true })
    .range(start, start + PAGE_SIZE - 1)

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
  const reminders = (data ?? []) as Reminder[]

  // ── Hydrate JOINs in two batches (customer mini + assignee profile) ──
  const customerIds = Array.from(
    new Set(reminders.map((r) => r.customer_id).filter((x): x is string => !!x))
  )
  const assigneeIds = Array.from(
    new Set(reminders.map((r) => r.assigned_to).filter((x): x is string => !!x))
  )

  const customerMap = new Map<
    string,
    { id: string; contact_name: string; company_name: string | null }
  >()
  if (customerIds.length > 0) {
    const { data: cRows } = await admin
      .from<Customer>('customers')
      .select('id, contact_name, company_name')
      .in('id', customerIds)
    for (const c of (cRows ?? []) as Array<{
      id: string
      contact_name: string
      company_name: string | null
    }>) {
      customerMap.set(c.id, c)
    }
  }

  const assigneeMap = new Map<string, Profile>()
  if (assigneeIds.length > 0) {
    const { data: aRows } = await admin
      .from<Profile>('profiles')
      .select('*')
      .in('id', assigneeIds)
    for (const a of (aRows ?? []) as Profile[]) {
      assigneeMap.set(a.id, a)
    }
  }

  const items = reminders.map((rem) => ({
    ...rem,
    customer: rem.customer_id ? customerMap.get(rem.customer_id) : undefined,
    assignee: rem.assigned_to ? assigneeMap.get(rem.assigned_to) : undefined,
  }))

  // ── Stats (overdue / today / upcoming) — scope-aware, status='pending' ──
  // Use Asia/Shanghai today so the buckets match the cards in the UI.
  const { rows: todayRows } = await db.query<{ today: string }>(
    `select (now() at time zone 'Asia/Shanghai')::date::text as today`
  )
  const today = todayRows[0].today

  const scopeClause = scope === 'mine' ? `and assigned_to = $2` : ''
  const scopeParams = scope === 'mine' ? [user.id] : []

  const [{ rows: overdueRows }, { rows: todayCountRows }, { rows: upcomingRows }] =
    await Promise.all([
      db.query<{ c: number }>(
        `select count(*)::int as c from public.reminders
          where status = 'pending' and due_date < $1::date ${scopeClause}`,
        [today, ...scopeParams]
      ),
      db.query<{ c: number }>(
        `select count(*)::int as c from public.reminders
          where status = 'pending' and due_date = $1::date ${scopeClause}`,
        [today, ...scopeParams]
      ),
      db.query<{ c: number }>(
        `select count(*)::int as c from public.reminders
          where status = 'pending' and due_date > $1::date ${scopeClause}`,
        [today, ...scopeParams]
      ),
    ])

  return Response.json({
    ok: true,
    items,
    total: count ?? 0,
    stats: {
      overdue: overdueRows[0]?.c ?? 0,
      today: todayCountRows[0]?.c ?? 0,
      upcoming: upcomingRows[0]?.c ?? 0,
    },
    page,
    page_size: PAGE_SIZE,
  })
}
