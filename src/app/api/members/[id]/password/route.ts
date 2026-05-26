import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: '未登录' }, { status: 401 })

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  // M7: 停用的管理员也必须拦截(此路由用 service-role 绕过 RLS)。
  if (currentProfile?.role !== 'admin' || currentProfile?.is_active === false) {
    return Response.json({ error: '无权限' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.new_password !== 'string' || body.new_password.length < 6) {
    return Response.json({ error: '新密码至少 6 位' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { error: pwError } = await adminClient.auth.admin.updateUserById(id, {
    password: body.new_password,
  })
  if (pwError) return Response.json({ error: pwError.message }, { status: 400 })

  // 重置后要求该成员下次登录必须改密
  await adminClient
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', id)

  return Response.json({ success: true })
}
