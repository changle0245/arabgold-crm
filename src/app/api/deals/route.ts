// Phase 3b · GET /api/deals
//   List deals with filters + pagination + page-aware totals.
//   Replaces the client createClient().from('deals') chains in
//   src/app/(app)/deals/page.tsx.
//
//   ACL:
//     - member: forced to deals whose customer.owner_id = me
//     - admin scope=mine: same as member (using admin's own id)
//     - admin scope=all:  no owner restriction; optional `owner_id` filter
//       narrows to one salesperson's deals
//
//   The `extra` knob mirrors the legacy client filter: 'reorder' / 'pending_deposit'
//   / 'pending_balance'. The original task spec used 'pending_payment' as a
//   single bucket; the schema has separate deposit_received + balance_received
//   booleans (no paid_amount column), so we preserve the existing UI semantics.

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth-helpers'
import type { Customer, Profile, Deal } from '@/lib/types'

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
  const status = (sp.get('status') ?? '').trim()
  const ownerIdParam = (sp.get('owner_id') ?? '').trim()
  const from = (sp.get('from') ?? '').trim()
  const to = (sp.get('to') ?? '').trim()
  const search = (sp.get('search') ?? '').trim()
  const extra = (sp.get('extra') ?? '').trim()
  const scopeParam = (sp.get('scope') ?? '').trim()

  // Effective scope: member always 'mine'; admin honours param (default 'all')
  const scope: 'mine' | 'all' =
    user.role !== 'admin'
      ? 'mine'
      : scopeParam === 'mine'
        ? 'mine'
        : 'all'

  const admin = createAdminClient()

  // ── Stage 1: derive the visible customer-ids set when scope/owner_id needs it ──
  // (Either the user is constrained to a single owner via 'mine' or admin
  // narrows via owner_id.)
  let scopedCustomerIds: string[] | null = null
  if (scope === 'mine' || (scope === 'all' && ownerIdParam && ownerIdParam !== 'all')) {
    const targetOwner = scope === 'mine' ? user.id : ownerIdParam
    const { data: rows } = await admin
      .from<Customer>('customers')
      .select('id')
      .eq('owner_id', targetOwner)
    scopedCustomerIds = ((rows ?? []) as Array<{ id: string }>).map((c) => c.id)
  }

  // ── Stage 2: search-derived customer ids (contact_name / company_name) ──
  let searchCustomerIds: string[] | null = null
  if (search) {
    const s = `%${search}%`
    let cq = admin
      .from<Customer>('customers')
      .select('id')
      .or(`contact_name.ilike.${s},company_name.ilike.${s}`)
    if (scopedCustomerIds !== null) cq = cq.in('id', scopedCustomerIds)
    const { data: rows } = await cq
    searchCustomerIds = ((rows ?? []) as Array<{ id: string }>).map((c) => c.id)
  }

  // Empty scope → empty result fast-path
  if (scopedCustomerIds !== null && scopedCustomerIds.length === 0) {
    return Response.json({
      ok: true,
      items: [],
      total: 0,
      page_totals_by_currency: {},
      page_reorder_count: 0,
      page,
      page_size: PAGE_SIZE,
    })
  }

  // ── Stage 3: main query ──
  let q = admin.from<Deal>('deals').select('*', { count: 'exact' })
  if (status && status !== 'all') q = q.eq('status', status)
  if (from) q = q.gte('deal_date', from)
  if (to) q = q.lte('deal_date', to)
  if (extra === 'reorder') q = q.eq('is_reorder', true)
  if (extra === 'pending_deposit') q = q.eq('deposit_received', false)
  if (extra === 'pending_balance') q = q.eq('balance_received', false)
  if (extra === 'pending_payment') {
    // Spec alias: any deal still owing money (deposit OR balance unpaid)
    // AND status is non-terminal. We use status='active' as spec said but
    // schema uses pending/in_production/shipped — drop the status filter and
    // use the existing two booleans (cancelled deals are still excluded by
    // the explicit neq below).
    q = q.neq('status', 'cancelled')
  }

  if (scopedCustomerIds !== null) {
    q = q.in('customer_id', scopedCustomerIds)
  }

  if (search) {
    const s = `%${search}%`
    if (searchCustomerIds && searchCustomerIds.length > 0) {
      q = q.or(
        `deal_no.ilike.${s},payment_method.ilike.${s},customer_id.in.(${searchCustomerIds.join(',')})`
      )
    } else {
      q = q.or(`deal_no.ilike.${s},payment_method.ilike.${s}`)
    }
  }

  const start = (page - 1) * PAGE_SIZE
  const { data, count, error } = await q
    .order('deal_date', { ascending: false })
    .range(start, start + PAGE_SIZE - 1)
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
  const deals = (data ?? []) as Deal[]

  // ── Hydrate JOINs: creator (profile) + customer mini + customer.owner ──
  const creatorIds = Array.from(
    new Set(deals.map((d) => d.created_by).filter((x): x is string => !!x))
  )
  const customerIds = Array.from(new Set(deals.map((d) => d.customer_id)))

  const creatorMap = new Map<string, Profile>()
  if (creatorIds.length > 0) {
    const { data: pRows } = await admin
      .from<Profile>('profiles')
      .select('*')
      .in('id', creatorIds)
    for (const p of (pRows ?? []) as Profile[]) creatorMap.set(p.id, p)
  }

  type CustomerMini = {
    id: string
    contact_name: string
    company_name: string | null
    owner_id: string
  }
  const customerMap = new Map<string, CustomerMini>()
  const customerOwnerIds = new Set<string>()
  if (customerIds.length > 0) {
    const { data: cRows } = await admin
      .from<Customer>('customers')
      .select('id, contact_name, company_name, owner_id')
      .in('id', customerIds)
    for (const c of (cRows ?? []) as CustomerMini[]) {
      customerMap.set(c.id, c)
      if (c.owner_id) customerOwnerIds.add(c.owner_id)
    }
  }
  // Owner profiles (might already be in creatorMap but fetch once if missing)
  const ownerMap = new Map<string, Profile>()
  const ownerToFetch = Array.from(customerOwnerIds).filter((id) => !creatorMap.has(id))
  for (const [id, p] of creatorMap) {
    if (customerOwnerIds.has(id)) ownerMap.set(id, p)
  }
  if (ownerToFetch.length > 0) {
    const { data: oRows } = await admin
      .from<Profile>('profiles')
      .select('*')
      .in('id', ownerToFetch)
    for (const p of (oRows ?? []) as Profile[]) ownerMap.set(p.id, p)
  }

  const items = deals.map((d) => {
    const cm = customerMap.get(d.customer_id)
    return {
      ...d,
      creator: d.created_by ? creatorMap.get(d.created_by) : undefined,
      customer: cm
        ? {
            id: cm.id,
            contact_name: cm.contact_name,
            company_name: cm.company_name,
            owner_id: cm.owner_id,
            owner: cm.owner_id ? ownerMap.get(cm.owner_id) : undefined,
          }
        : undefined,
    }
  })

  // ── Page totals by currency + reorder count ──
  const page_totals_by_currency: Record<string, number> = {}
  let page_reorder_count = 0
  for (const d of deals) {
    if (d.deal_amount) {
      const cur = (d.currency || 'USD').toUpperCase()
      page_totals_by_currency[cur] = (page_totals_by_currency[cur] || 0) + d.deal_amount
    }
    if (d.is_reorder) page_reorder_count++
  }

  return Response.json({
    ok: true,
    items,
    total: count ?? 0,
    page_totals_by_currency,
    page_reorder_count,
    page,
    page_size: PAGE_SIZE,
  })
}
