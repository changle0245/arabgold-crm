// Phase 3b · /api/customers/[customerId]
//   GET    — single customer + owner JOIN + tags array
//   PATCH  — update customer fields + tag sync + ownership-change side-effect
//   DELETE — admin-only hard delete (schema CASCADE drops related rows)
// Replaces client-side createClient().from('customers')... chains in
// customers/[id]/page.tsx, customers/[id]/edit/page.tsx and customer-form.tsx.

import { type NextRequest } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser, requireAdmin } from '@/lib/auth-helpers'
import { fireAndForgetCustomerSync } from '@/lib/master-sync'
import type { Customer, Profile } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user

  const admin = createAdminClient()

  const { data: customer, error } = await admin
    .from<Customer>('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle()

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
  if (!customer) return Response.json({ ok: false, error: '客户不存在' }, { status: 404 })

  // ACL: member can only access own customers; admin can access all
  if (user.role !== 'admin' && customer.owner_id !== user.id) {
    return Response.json({ ok: false, error: '无权访问该客户' }, { status: 403 })
  }

  // Owner JOIN (two-step to avoid compat nested-join limitation)
  let owner: Profile | undefined
  if (customer.owner_id) {
    const { data: ownerRow } = await admin
      .from<Profile>('profiles')
      .select('*')
      .eq('id', customer.owner_id)
      .maybeSingle()
    owner = (ownerRow ?? undefined) as Profile | undefined
  }

  // Tags
  const { data: tagRows } = await admin
    .from('customer_tags')
    .select('tag')
    .eq('customer_id', customerId)
  const tagRowsArr = (tagRows ?? []) as Array<{ tag: string }>
  const tags = tagRowsArr.map((r) => r.tag)

  return Response.json({
    ok: true,
    data: { ...customer, owner, tags },
  })
}

// Mirror of CreateCustomerBody from /api/customers/route.ts. Kept inline to
// avoid a cross-module type import cycle.
interface UpdateCustomerBody {
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

// Whitelist of patchable scalar columns. Keys outside this set are silently
// ignored (defence-in-depth against extra client payload). `tags` is handled
// separately and `owner_id` requires the admin gate.
const PATCHABLE_FIELDS: ReadonlyArray<keyof UpdateCustomerBody> = [
  'contact_name', 'contact_title', 'gender',
  'company_name', 'company_website', 'company_address', 'country', 'avatar_url',
  'whatsapp', 'phone', 'email', 'wechat_id', 'telegram', 'linkedin',
  'skype', 'instagram', 'facebook', 'alibaba_id',
  'level', 'stage', 'source', 'product_category', 'purchase_frequency',
  'decision_role', 'industry', 'company_size',
  'payment_preference', 'currency_preference', 'incoterms',
  'notes', 'first_contact_date',
]

function emptyToNull(v: unknown): unknown {
  if (typeof v === 'string') {
    const t = v.trim()
    return t === '' ? null : t
  }
  return v
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user

  const body = (await request.json().catch(() => null)) as UpdateCustomerBody | null
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, error: '请求体无效' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Load existing for ACL + ownership diff
  const { data: existing, error: loadErr } = await admin
    .from<Customer>('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle()
  if (loadErr) return Response.json({ ok: false, error: loadErr.message }, { status: 500 })
  if (!existing) return Response.json({ ok: false, error: '客户不存在' }, { status: 404 })

  // ACL: member can only patch their own customers
  if (user.role !== 'admin' && existing.owner_id !== user.id) {
    return Response.json({ ok: false, error: '无权修改该客户' }, { status: 403 })
  }

  // owner_id change is admin-only
  const ownerInBody = Object.prototype.hasOwnProperty.call(body, 'owner_id')
  const newOwnerId = ownerInBody ? (body.owner_id ?? null) : existing.owner_id
  if (ownerInBody && newOwnerId !== existing.owner_id && user.role !== 'admin') {
    return Response.json({ ok: false, error: '只有管理员可转移客户' }, { status: 403 })
  }
  if (ownerInBody && (!newOwnerId || typeof newOwnerId !== 'string')) {
    return Response.json({ ok: false, error: 'owner_id 不能为空' }, { status: 400 })
  }

  // Build update payload from whitelist
  const update: Record<string, unknown> = {}
  for (const key of PATCHABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      update[key] = emptyToNull(body[key])
    }
  }
  // contact_name (if present) must remain non-empty
  if ('contact_name' in update && (!update.contact_name || typeof update.contact_name !== 'string')) {
    return Response.json({ ok: false, error: 'contact_name 不能为空' }, { status: 400 })
  }
  // Defaults for the two required enum-ish columns when client clears them
  if ('level' in update && !update.level) update.level = '待定'
  if ('stage' in update && !update.stage) update.stage = '待定'

  if (ownerInBody && user.role === 'admin') {
    update.owner_id = newOwnerId
  }

  // Phase 5B-follow1 · Writes in parallel (customer update + ownership audit + tag sync)
  // These touch independent tables/rows; their ordering relative to each other doesn't matter.
  const writes: Array<Promise<{ error?: { message: string } | null } | void>> = []

  if (Object.keys(update).length > 0) {
    writes.push(
      (async () => {
        const { error: updErr } = await admin
          .from<Customer>('customers')
          .update(update)
          .eq('id', customerId)
        if (updErr) throw new Error('更新客户失败: ' + updErr.message)
      })()
    )
  }

  if (ownerInBody && user.role === 'admin' && newOwnerId !== existing.owner_id) {
    writes.push(
      (async () => {
        const { error: ownErr } = await admin.from('customer_ownership_changes').insert({
          customer_id: customerId,
          from_owner: existing.owner_id,
          to_owner: newOwnerId,
          changed_by: user.id,
        })
        if (ownErr) {
          console.warn('[api/customers PATCH] ownership-change insert failed:', ownErr.message)
        }
      })()
    )
  }

  if (Array.isArray(body.tags)) {
    const tags = body.tags.filter((t) => typeof t === 'string' && t.trim())
    writes.push(
      (async () => {
        const { error: delErr } = await admin
          .from('customer_tags')
          .delete()
          .eq('customer_id', customerId)
        if (delErr) {
          console.warn('[api/customers PATCH] tag delete failed:', delErr.message)
        }
        if (tags.length > 0) {
          const tagRows = tags.map((tag) => ({
            customer_id: customerId,
            tag: tag.trim(),
            created_by: user.id,
          }))
          const { error: insErr } = await admin.from('customer_tags').insert(tagRows)
          if (insErr) {
            console.warn('[api/customers PATCH] tag insert failed:', insErr.message)
          }
        }
      })()
    )
  }

  try {
    await Promise.all(writes)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }

  // Phase 5B-follow1 · Re-fetch in parallel (customer + owner + tags)
  // owner_id 在 update 已知,可直接用 newOwnerId 推断,避免 customer fetch → owner fetch 串行
  const finalOwnerId = ownerInBody && user.role === 'admin' ? newOwnerId : existing.owner_id

  const [freshRes, ownerRes, tagRowsRes] = await Promise.all([
    admin.from<Customer>('customers').select('*').eq('id', customerId).maybeSingle(),
    finalOwnerId
      ? admin.from<Profile>('profiles').select('*').eq('id', finalOwnerId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('customer_tags').select('tag').eq('customer_id', customerId),
  ])

  const customer = (freshRes.data ?? existing) as Customer
  const owner = (ownerRes.data ?? undefined) as Profile | undefined
  const tagRowsArr = (tagRowsRes.data ?? []) as Array<{ tag: string }>
  const tags = tagRowsArr.map((row) => row.tag)

  // Phase 5B · waitUntil — function 不阻塞 response,outbound 在 response 后继续跑
  waitUntil(fireAndForgetCustomerSync(customer))

  return Response.json({ ok: true, data: { ...customer, owner, tags } })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params
  const r = await requireAdmin()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }

  const admin = createAdminClient()

  const { data: existing, error: loadErr } = await admin
    .from<Customer>('customers')
    .select('id')
    .eq('id', customerId)
    .maybeSingle()
  if (loadErr) return Response.json({ ok: false, error: loadErr.message }, { status: 500 })
  if (!existing) return Response.json({ ok: false, error: '客户不存在' }, { status: 404 })

  const { error: delErr } = await admin
    .from('customers')
    .delete()
    .eq('id', customerId)
  if (delErr) {
    return Response.json(
      { ok: false, error: '删除客户失败: ' + delErr.message },
      { status: 500 }
    )
  }

  return Response.json({ ok: true, data: { id: customerId } })
}
