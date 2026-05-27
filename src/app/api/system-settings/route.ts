import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  const a = await requireAdmin()
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const key = request.nextUrl.searchParams.get('key')
  if (!key) return Response.json({ error: '缺少 key 参数' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from<{ key: string; value: unknown; description: string }>('system_settings')
    .select('key, value, description')
    .eq('key', key)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  if (!data) return Response.json({ error: '设置项不存在' }, { status: 404 })

  return Response.json({ key: data.key, value: data.value, description: data.description })
}

export async function PATCH(request: NextRequest) {
  const a = await requireAdmin()
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.key !== 'string') {
    return Response.json({ error: '请求体必须包含 key 字段' }, { status: 400 })
  }
  const ALLOWED_KEYS = ['monthly_revenue_target', 'concentration_risk_threshold', 'main_currency']
  if (!ALLOWED_KEYS.includes(body.key)) {
    return Response.json({ error: '未知的设置项: ' + body.key }, { status: 400 })
  }
  if (!('value' in body)) {
    return Response.json({ error: '请求体必须包含 value 字段' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('system_settings')
    .upsert(
      { key: body.key, value: body.value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) return Response.json({ error: error.message }, { status: 400 })

  return Response.json({ success: true })
}
