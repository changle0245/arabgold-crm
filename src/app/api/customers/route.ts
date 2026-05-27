// Phase 3b · /api/customers
//   GET  — list with filters + pagination (replaces client-side customers/page.tsx queries)
//   POST — create customer + sync tags (replaces customer-form.tsx + new-customer flow)
//
// All client-side `createClient().from('customers')...` chains must migrate here
// to avoid the browser-side deny stub.

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth-helpers'
import type { Customer, Profile } from '@/lib/types'

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
  const search = (sp.get('search') ?? '').trim()
  const country = (sp.get('country') ?? '').trim()
  const ownerIdFilter = (sp.get('owner_id') ?? '').trim()
  const level = (sp.get('level') ?? '').trim()
  const stage = (sp.get('stage') ?? '').trim()
  const source = (sp.get('source') ?? '').trim()
  const tag = (sp.get('tag') ?? '').trim()
  const scope = (sp.get('scope') ?? 'mine').trim()

  const admin = createAdminClient()

  // Tag filter pre-step: resolve to a list of customer_ids (empty → return empty)
  let tagFilterIds: string[] | null = null
  if (tag) {
    const { data: tagRows, error: tagErr } = await admin
      .from('customer_tags')
      .select('customer_id')
      .eq('tag', tag)
    if (tagErr) return Response.json({ ok: false, error: tagErr.message }, { status: 500 })
    const rows = (tagRows ?? []) as Array<{ customer_id: string }>
    tagFilterIds = rows.map((r) => r.customer_id)
    if (tagFilterIds.length === 0) {
      return Response.json({ ok: true, data: [], count: 0, page, page_size: PAGE_SIZE })
    }
  }

  let q = admin.from<Customer>('customers').select('*', { count: 'exact' })

  // ACL: members are always scoped to their own; admins default to mine, can opt 'all'
  if (user.role !== 'admin' || scope === 'mine') {
    q = q.eq('owner_id', user.id)
  } else if (ownerIdFilter) {
    q = q.eq('owner_id', ownerIdFilter)
  }

  if (country) q = q.eq('country', country)
  if (level) q = q.eq('level', level)
  if (stage) q = q.eq('stage', stage)
  if (source) q = q.eq('source', source)
  if (tagFilterIds) q = q.in('id', tagFilterIds)

  if (search) {
    const s = `%${search}%`
    q = q.or(
      `contact_name.ilike.${s},company_name.ilike.${s},whatsapp.ilike.${s},phone.ilike.${s},wechat_id.ilike.${s},email.ilike.${s}`
    )
  }

  const start = (page - 1) * PAGE_SIZE
  const { data, count, error } = await q
    .order('last_contact_date', { ascending: true, nullsFirst: true })
    .range(start, start + PAGE_SIZE - 1)

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })

  const customers = (data ?? []) as Customer[]
  const ownerIds = Array.from(new Set(customers.map((c) => c.owner_id))).filter(Boolean)
  let owners: Profile[] = []
  if (ownerIds.length > 0) {
    const { data: ownerRows } = await admin
      .from<Profile>('profiles')
      .select('*')
      .in('id', ownerIds)
    owners = (ownerRows ?? []) as Profile[]
  }
  const ownerMap = new Map(owners.map((o) => [o.id, o]))

  const result = customers.map((c) => ({ ...c, owner: ownerMap.get(c.owner_id) }))

  return Response.json({
    ok: true,
    data: result,
    count: count ?? 0,
    page,
    page_size: PAGE_SIZE,
  })
}

interface CreateCustomerBody {
  contact_name?: string
  contact_title?: string | null
  gender?: string | null
  company_name?: string | null
  company_website?: string | null
  company_address?: string | null
  country?: string | null
  avatar_url?: string | null
  whatsapp?: string | null
  phone?: string | null
  email?: string | null
  wechat_id?: string | null
  telegram?: string | null
  linkedin?: string | null
  skype?: string | null
  instagram?: string | null
  facebook?: string | null
  alibaba_id?: string | null
  owner_id?: string | null
  level?: string
  stage?: string
  source?: string | null
  product_category?: string | null
  purchase_frequency?: string | null
  decision_role?: string | null
  industry?: string | null
  company_size?: string | null
  payment_preference?: string | null
  currency_preference?: string | null
  incoterms?: string | null
  notes?: string | null
  first_contact_date?: string | null
  tags?: string[]
}

export async function POST(request: NextRequest) {
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user

  const body = (await request.json().catch(() => null)) as CreateCustomerBody | null
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, error: '请求体无效' }, { status: 400 })
  }
  const contact_name = (body.contact_name ?? '').trim()
  if (!contact_name) {
    return Response.json({ ok: false, error: 'contact_name 必填' }, { status: 400 })
  }

  // Owner: admins may assign; members always own their own creations
  let owner_id = user.id
  if (user.role === 'admin' && body.owner_id) {
    owner_id = body.owner_id
  }

  const admin = createAdminClient()

  const insertRow = {
    contact_name,
    contact_title: body.contact_title ?? null,
    gender: body.gender ?? null,
    company_name: body.company_name ?? null,
    company_website: body.company_website ?? null,
    company_address: body.company_address ?? null,
    country: body.country ?? null,
    avatar_url: body.avatar_url ?? null,
    whatsapp: body.whatsapp ?? null,
    phone: body.phone ?? null,
    email: body.email ?? null,
    wechat_id: body.wechat_id ?? null,
    telegram: body.telegram ?? null,
    linkedin: body.linkedin ?? null,
    skype: body.skype ?? null,
    instagram: body.instagram ?? null,
    facebook: body.facebook ?? null,
    alibaba_id: body.alibaba_id ?? null,
    owner_id,
    level: body.level ?? '待定',
    stage: body.stage ?? '待定',
    source: body.source ?? null,
    product_category: body.product_category ?? null,
    purchase_frequency: body.purchase_frequency ?? null,
    decision_role: body.decision_role ?? null,
    industry: body.industry ?? null,
    company_size: body.company_size ?? null,
    payment_preference: body.payment_preference ?? null,
    currency_preference: body.currency_preference ?? null,
    incoterms: body.incoterms ?? null,
    notes: body.notes ?? null,
    first_contact_date: body.first_contact_date ?? null,
    created_by: user.id,
  }

  const { data: inserted, error: insertErr } = await admin
    .from<Customer>('customers')
    .insert(insertRow)
    .select()
    .single()

  if (insertErr || !inserted) {
    return Response.json(
      { ok: false, error: '创建客户失败: ' + (insertErr?.message ?? 'unknown') },
      { status: 500 }
    )
  }

  // Tags (optional; best-effort — tag insert failure doesn't roll back customer)
  const tags = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string' && t.trim()) : []
  if (tags.length > 0) {
    const tagRows = tags.map((tag) => ({
      customer_id: inserted.id,
      tag: tag.trim(),
      created_by: user.id,
    }))
    const { error: tagErr } = await admin.from('customer_tags').insert(tagRows)
    if (tagErr) {
      console.warn('[api/customers POST] tag insert failed (customer created):', tagErr.message)
    }
  }

  return Response.json({ ok: true, data: inserted })
}
