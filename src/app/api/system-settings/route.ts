import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

// 鉴权：登录 + admin 角色（与 /api/members 模板一致）
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登录' as const, status: 401 }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()
  // M7: 停用的管理员也必须拦截(admin 路由用 service-role 绕过 RLS)。
  if (profile?.role !== 'admin' || profile?.is_active === false) {
    return { error: '无权限' as const, status: 403 }
  }
  return { error: null, status: 200 }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

  const key = request.nextUrl.searchParams.get('key')
  if (!key) return Response.json({ error: '缺少 key 参数' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('system_settings')
    .select('key, value, description')
    .eq('key', key)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  if (!data) return Response.json({ error: '设置项不存在' }, { status: 404 })

  return Response.json({ key: data.key, value: data.value, description: data.description })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.key !== 'string') {
    return Response.json({ error: '请求体必须包含 key 字段' }, { status: 400 })
  }
  // L4: key 白名单 —— 只允许已知运营设置,挡掉拼错的键名或垃圾键
  const ALLOWED_KEYS = ['monthly_revenue_target', 'concentration_risk_threshold', 'main_currency']
  if (!ALLOWED_KEYS.includes(body.key)) {
    return Response.json({ error: '未知的设置项: ' + body.key }, { status: 400 })
  }
  // value 可以是任何 JSON 值（number / string / null / object），不校验类型
  if (!('value' in body)) {
    return Response.json({ error: '请求体必须包含 value 字段' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  // 用 upsert 而非 update：避免新增 setting 时 key 不存在导致失败
  const { error } = await adminClient
    .from('system_settings')
    .upsert(
      { key: body.key, value: body.value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) return Response.json({ error: error.message }, { status: 400 })

  return Response.json({ success: true })
}
