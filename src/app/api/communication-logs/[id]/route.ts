import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth-helpers'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user

  const adminClient = createAdminClient()
  const { data: log } = await adminClient
    .from<{ id: string; customer_id: string }>('communication_logs')
    .select('id, customer_id')
    .eq('id', id)
    .single()
  if (!log) return Response.json({ error: '记录不存在' }, { status: 404 })

  if (user.role !== 'admin') {
    const { data: customer } = await adminClient
      .from<{ owner_id: string }>('customers')
      .select('owner_id')
      .eq('id', log.customer_id)
      .single()
    if (!customer || customer.owner_id !== user.id) {
      return Response.json({ error: '无权修改' }, { status: 403 })
    }
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.translated_content !== 'string') {
    return Response.json({ error: '需要 translated_content 字段' }, { status: 400 })
  }
  const translated = body.translated_content.trim()
  if (!translated) {
    return Response.json({ error: '译文不能为空' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('communication_logs')
    .update({
      translated_content: translated,
      translation_edited_by: user.id,
      translation_edited_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true })
}
