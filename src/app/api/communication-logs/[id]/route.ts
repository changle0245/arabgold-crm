import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

// PATCH /api/communication-logs/[id]
// body: { translated_content: string }
// 修订译文 — admin 或 客户 owner 可修订
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

  // 查 log 拿 customer_id，再校验访问权限
  const adminClient = createAdminClient()
  const { data: log } = await adminClient
    .from('communication_logs')
    .select('id, customer_id')
    .eq('id', id)
    .single()
  if (!log) return Response.json({ error: '记录不存在' }, { status: 404 })

  if (profile.role !== 'admin') {
    const { data: customer } = await adminClient
      .from('customers')
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
