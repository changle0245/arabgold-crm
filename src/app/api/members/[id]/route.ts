import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const body = await request.json()

  // H4: 禁止管理员修改自己的 role / is_active —— 唯一管理员一旦把自己降级或停用,
  // 会永久失去管理员权限,且没有第二个 admin 能改回来。改别人不受此限。
  if (id === user.id) {
    if (body.role !== undefined && body.role !== 'admin') {
      return Response.json({ error: '不能修改自己的角色' }, { status: 400 })
    }
    if (body.is_active === false) {
      return Response.json({ error: '不能停用自己的账号' }, { status: 400 })
    }
  }

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('profiles')
    .update({
      full_name: body.full_name,
      role: body.role,
      job_title: body.job_title,
      is_active: body.is_active,
    })
    .eq('id', id)

  if (error) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  return Response.json({ success: true })
}
