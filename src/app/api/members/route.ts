import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: '未登录' }, { status: 401 })

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  // M7: 停用的管理员(is_active=false)也必须拦截 —— 这些路由用 service-role
  // 客户端绕过 RLS,所以 is_active 校验只能在这里做。
  if (currentProfile?.role !== 'admin' || currentProfile?.is_active === false) {
    return Response.json({ error: '无权限' }, { status: 403 })
  }

  const body = await request.json()
  const { email, password, full_name, role, job_title } = body

  if (!email || !password || !full_name) {
    return Response.json({ error: '缺少必填字段' }, { status: 400 })
  }
  // 修 #7: 密码至少 6 位（前端 UI 提示「至少6位」是装饰文案，必须后端兜底）
  if (typeof password !== 'string' || password.length < 6) {
    return Response.json({ error: '密码至少 6 位' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    return Response.json({ error: authError.message }, { status: 400 })
  }

  const { error: profileError } = await adminClient
    .from('profiles')
    .insert({
      id: authData.user.id,
      full_name,
      role: role || 'member',
      job_title: job_title || '业务员',
      must_change_password: true,
    })

  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 400 })
  }

  return Response.json({ success: true, id: authData.user.id })
}
