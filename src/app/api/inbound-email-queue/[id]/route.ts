import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { getTranslator } from '@/lib/translator'

// PATCH /api/inbound-email-queue/[id]
// body: { action: 'merge' | 'discard', customer_id?: string }
//
// merge：把 queue 邮件作为 communication_log 插入指定客户，queue 标 matched
// discard：仅标 discarded，不删除（保留审计）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: '未登录' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()
  if (!profile || profile.is_active === false) {
    return Response.json({ error: '账号已停用' }, { status: 403 })
  }

  const adminClient = createAdminClient()
  const { data: queueItem } = await adminClient
    .from('inbound_email_queue')
    .select('*')
    .eq('id', id)
    .single()
  if (!queueItem) return Response.json({ error: '记录不存在' }, { status: 404 })

  if (profile.role !== 'admin' && queueItem.recipient_member !== user.id) {
    return Response.json({ error: '无权操作此邮件' }, { status: 403 })
  }
  if (queueItem.status !== 'pending') {
    return Response.json({ error: '该邮件已处理（status=' + queueItem.status + '）' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !body.action) return Response.json({ error: 'action 必填' }, { status: 400 })

  if (body.action === 'discard') {
    const { error } = await adminClient
      .from('inbound_email_queue')
      .update({
        status: 'discarded',
        matched_by: user.id,
        matched_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true, status: 'discarded' })
  }

  if (body.action === 'merge') {
    if (!body.customer_id) return Response.json({ error: '需要 customer_id' }, { status: 400 })

    const { data: customer } = await adminClient
      .from('customers')
      .select('id, owner_id')
      .eq('id', body.customer_id)
      .single()
    if (!customer) return Response.json({ error: '客户不存在' }, { status: 404 })
    if (profile.role !== 'admin' && customer.owner_id !== user.id) {
      return Response.json({ error: '无权将邮件归并到该客户' }, { status: 403 })
    }

    let translated: string | null = null
    try {
      const t = getTranslator()
      const toTranslate = queueItem.subject
        ? `${queueItem.subject}\n\n${queueItem.content || ''}`
        : (queueItem.content || '')
      if (toTranslate.trim()) translated = await t.translate(toTranslate)
    } catch { /* stub or fail */ }

    const rawMeta = (queueItem.raw_meta || {}) as Record<string, unknown>
    const attachments = queueItem.attachments as { name: string; url: string }[] | null

    const { error: insertErr } = await adminClient.from('communication_logs').insert({
      customer_id: body.customer_id,
      channel: 'email',
      direction: 'incoming',
      sender_name: queueItem.from_name || queueItem.from_email,
      content: queueItem.content,
      translated_content: translated,
      sent_at: queueItem.received_at,
      raw_meta: {
        subject: queueItem.subject,
        from_email: queueItem.from_email,
        to_email: queueItem.to_email,
        message_id: rawMeta.message_id || null,
        html: rawMeta.html || null,
        attachments,
        merged_from_queue: queueItem.id,
      },
      original_file_url: attachments?.[0]?.url || null,
      created_by: user.id,
    })
    if (insertErr) return Response.json({ error: '归档失败: ' + insertErr.message }, { status: 500 })

    const { error: updErr } = await adminClient
      .from('inbound_email_queue')
      .update({
        status: 'matched',
        matched_customer_id: body.customer_id,
        matched_by: user.id,
        matched_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 })

    return Response.json({ success: true, status: 'matched', customer_id: body.customer_id })
  }

  return Response.json({ error: '未知 action: ' + body.action }, { status: 400 })
}
