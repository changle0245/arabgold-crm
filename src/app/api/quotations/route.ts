// Phase 3b · GET /api/quotations
//   List quotations with filters + pagination + page totals.
//   Replaces createClient().from('quotations') chains in
//   src/app/(app)/quotations/page.tsx.
//
//   ACL pattern mirrors /api/deals: customer.owner_id-based scope. The spec
//   mentioned `quotations.creator_id` but the schema column is `created_by`
//   and the legacy client filtered through customer.owner_id (consistent with
//   deals). We keep that semantics.

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth-helpers'
import type { Customer, Profile, Quotation } from '@/lib/types'

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
  const scopeParam = (sp.get('scope') ?? '').trim()

  const scope: 'mine' | 'all' =
    user.role !== 'admin'
      ? 'mine'
      : scopeParam === 'mine'
        ? 'mine'
        : 'all'

  const admin = createAdminClient()

  // ── Stage 1: scoped customer ids ──
  let scopedCustomerIds: string[] | null = null
  if (scope === 'mine' || (scope === 'all' && ownerIdParam && ownerIdParam !== 'all')) {
    const targetOwner = scope === 'mine' ? user.id : ownerIdParam
    const { data: rows } = await admin
      .from<Customer>('customers')
      .select('id')
      .eq('owner_id', targetOwner)
    scopedCustomerIds = ((rows ?? []) as Array<{ id: string }>).map((c) => c.id)
  }

  // ── Stage 2: search-derived customer ids ──
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
      page,
      page_size: PAGE_SIZE,
    })
  }

  // ── Stage 3: main query ──
  let q = admin.from<Quotation>('quotations').select('*', { count: 'exact' })
  if (status && status !== 'all') q = q.eq('status', status)
  if (from) q = q.gte('created_at', from)
  if (to) q = q.lte('created_at', `${to}T23:59:59`)
  if (scopedCustomerIds !== null) q = q.in('customer_id', scopedCustomerIds)
  if (search) {
    const s = `%${search}%`
    if (searchCustomerIds && searchCustomerIds.length > 0) {
      q = q.or(`quote_no.ilike.${s},customer_id.in.(${searchCustomerIds.join(',')})`)
    } else {
      q = q.ilike('quote_no', s)
    }
  }

  const start = (page - 1) * PAGE_SIZE
  const { data, count, error } = await q
    .order('created_at', { ascending: false })
    .range(start, start + PAGE_SIZE - 1)
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
  const quotations = (data ?? []) as Quotation[]

  // ── JOIN hydration ──
  const creatorIds = Array.from(
    new Set(quotations.map((qt) => qt.created_by).filter((x): x is string => !!x))
  )
  const customerIds = Array.from(new Set(quotations.map((qt) => qt.customer_id)))

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
  const ownerIds = new Set<string>()
  if (customerIds.length > 0) {
    const { data: cRows } = await admin
      .from<Customer>('customers')
      .select('id, contact_name, company_name, owner_id')
      .in('id', customerIds)
    for (const c of (cRows ?? []) as CustomerMini[]) {
      customerMap.set(c.id, c)
      if (c.owner_id) ownerIds.add(c.owner_id)
    }
  }
  const ownerMap = new Map<string, Profile>()
  for (const [id, p] of creatorMap) {
    if (ownerIds.has(id)) ownerMap.set(id, p)
  }
  const ownerToFetch = Array.from(ownerIds).filter((id) => !ownerMap.has(id))
  if (ownerToFetch.length > 0) {
    const { data: oRows } = await admin
      .from<Profile>('profiles')
      .select('*')
      .in('id', ownerToFetch)
    for (const p of (oRows ?? []) as Profile[]) ownerMap.set(p.id, p)
  }

  const items = quotations.map((qt) => {
    const cm = customerMap.get(qt.customer_id)
    return {
      ...qt,
      creator: qt.created_by ? creatorMap.get(qt.created_by) : undefined,
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

  // ── Page totals by currency ──
  const page_totals_by_currency: Record<string, number> = {}
  for (const qt of quotations) {
    if (qt.total_amount) {
      const cur = (qt.currency || 'USD').toUpperCase()
      page_totals_by_currency[cur] = (page_totals_by_currency[cur] || 0) + qt.total_amount
    }
  }

  return Response.json({
    ok: true,
    items,
    total: count ?? 0,
    page_totals_by_currency,
    page,
    page_size: PAGE_SIZE,
  })
}
