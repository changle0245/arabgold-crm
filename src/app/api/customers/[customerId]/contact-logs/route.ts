// Phase 3b · /api/customers/[customerId]/contact-logs
//   POST — insert a contact_log row for the customer. Members can only log
//          against their own customers; admins can log against any.

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth-helpers'
import type { Customer } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CreateContactLogBody {
  log_date?: string | null
  tag?: string
  note?: string | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user

  const body = (await request.json().catch(() => null)) as CreateContactLogBody | null
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, error: '请求体无效' }, { status: 400 })
  }
  const tag = (body.tag ?? '').trim()
  if (!tag) {
    return Response.json({ ok: false, error: 'tag 必填' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ACL: load customer to enforce ownership for non-admins
  const { data: customer, error: loadErr } = await admin
    .from<Customer>('customers')
    .select('id, owner_id')
    .eq('id', customerId)
    .maybeSingle()
  if (loadErr) return Response.json({ ok: false, error: loadErr.message }, { status: 500 })
  if (!customer) return Response.json({ ok: false, error: '客户不存在' }, { status: 404 })
  if (user.role !== 'admin' && customer.owner_id !== user.id) {
    return Response.json({ ok: false, error: '无权访问该客户' }, { status: 403 })
  }

  const insertRow = {
    customer_id: customerId,
    logged_by: user.id,
    log_date: body.log_date ?? null,
    tag,
    note: (body.note ?? '').trim() || null,
  }

  const { data: inserted, error: insertErr } = await admin
    .from('contact_logs')
    .insert(insertRow)
    .select()
    .single()

  if (insertErr || !inserted) {
    return Response.json(
      { ok: false, error: '保存联系记录失败: ' + (insertErr?.message ?? 'unknown') },
      { status: 500 }
    )
  }

  return Response.json({ ok: true, data: inserted })
}
