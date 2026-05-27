// Phase 3b · /api/customers/[customerId]/attachments
//   POST — multipart upload: stream the file to R2 then insert a
//          customer_attachments row. Members may upload only against their
//          own customers; admins against any.

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth-helpers'
import { uploadObject, isR2Configured } from '@/lib/r2'
import type { Customer } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

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

  if (!isR2Configured()) {
    return Response.json({ ok: false, error: '存储未配置' }, { status: 500 })
  }

  const admin = createAdminClient()

  // ACL
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

  const form = await request.formData().catch(() => null)
  if (!form) return Response.json({ ok: false, error: '请求格式错误' }, { status: 400 })
  const file = form.get('file') as File | null
  if (!file) return Response.json({ ok: false, error: '缺少文件' }, { status: 400 })

  const ext = file.name.split('.').pop() || 'bin'
  const path = `${customerId}/${Date.now()}.${ext}`

  let url: string
  try {
    const r2 = await uploadObject('customer-attachments', path, await file.arrayBuffer(), {
      contentType: file.type || 'application/octet-stream',
    })
    url = r2.url
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ ok: false, error: '上传失败: ' + msg }, { status: 500 })
  }

  const insertRow = {
    customer_id: customerId,
    uploaded_by: user.id,
    file_name: file.name,
    file_url: url,
    file_type: (file.type || '').startsWith('image/') ? 'image' : 'document',
    file_size: file.size,
  }

  const { data: inserted, error: insertErr } = await admin
    .from('customer_attachments')
    .insert(insertRow)
    .select()
    .single()

  if (insertErr || !inserted) {
    return Response.json(
      { ok: false, error: '保存附件记录失败: ' + (insertErr?.message ?? 'unknown') },
      { status: 500 }
    )
  }

  return Response.json({ ok: true, data: inserted })
}
