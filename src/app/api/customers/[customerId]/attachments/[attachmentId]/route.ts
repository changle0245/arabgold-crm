// Phase 3b · /api/customers/[customerId]/attachments/[attachmentId]
//   DELETE — remove the customer_attachments row. ACL: uploader, customer
//            owner, and admins. We DO NOT touch the R2 object here — the
//            R2 keys embed customerId + timestamp + random and remain
//            obscure; a separate sweep job can reclaim orphaned blobs.
//            (Same approach as the legacy client code which only deleted
//            the DB row.)

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth-helpers'
import type { Customer, CustomerAttachment } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string; attachmentId: string }> }
) {
  const { customerId, attachmentId } = await params
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user

  const admin = createAdminClient()

  // Load both customer (for owner_id) and attachment (for uploaded_by)
  const { data: customer } = await admin
    .from<Customer>('customers')
    .select('id, owner_id')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer) return Response.json({ ok: false, error: '客户不存在' }, { status: 404 })

  const { data: att } = await admin
    .from<CustomerAttachment>('customer_attachments')
    .select('*')
    .eq('id', attachmentId)
    .maybeSingle()
  if (!att) return Response.json({ ok: false, error: '附件不存在' }, { status: 404 })
  if (att.customer_id !== customerId) {
    return Response.json({ ok: false, error: '附件归属不匹配' }, { status: 400 })
  }

  // ACL: admin, customer owner, or uploader
  const canDelete =
    user.role === 'admin' ||
    customer.owner_id === user.id ||
    att.uploaded_by === user.id
  if (!canDelete) {
    return Response.json({ ok: false, error: '无权删除该附件' }, { status: 403 })
  }

  const { error: delErr } = await admin
    .from('customer_attachments')
    .delete()
    .eq('id', attachmentId)
  if (delErr) {
    return Response.json(
      { ok: false, error: '删除附件失败: ' + delErr.message },
      { status: 500 }
    )
  }

  return Response.json({ ok: true, data: { id: attachmentId } })
}
