import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return Response.json({ error: '未登录' }, { status: 401 })

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (currentProfile?.role !== 'admin') {
    return Response.json({ error: '无权限' }, { status: 403 })
  }

  const body = await request.json()
  const { email, password, full_name, role, job_title } = body

  if (!email || !password || !full_name) {
    return Response.json({ error: '缺少必填字段' }, { status: 400 })
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
    })

  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 400 })
  }

  return Response.json({ success: true, id: authData.user.id })
}
