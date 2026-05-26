import { createClient } from '@/lib/supabase/server'
import { createClient as createPlainClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

// 自助改密 API：用户已登录后修改自己密码。
// 必须走服务端是因为 profiles RLS 只允许 admin update，
// 否则业务员清不掉自己的 must_change_password 标记，会陷入死循环（issue 发现于 e2e 测试）。
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: '未登录' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.new_password !== 'string' || body.new_password.length < 6) {
    return Response.json({ error: '新密码至少 6 位' }, { status: 400 })
  }

  // L2: 校验当前密码 —— 否则会话被劫持者能直接改密、永久锁死真实用户。
  if (typeof body.current_password !== 'string' || body.current_password.length === 0) {
    return Response.json({ error: '请填写当前密码' }, { status: 400 })
  }
  if (!user.email) {
    return Response.json({ error: '账号无邮箱,无法校验当前密码,请联系管理员' }, { status: 400 })
  }
  // 用独立的临时客户端验证密码:不写 cookie、不影响当前会话。
  const verifyClient = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { error: verifyError } = await verifyClient.auth.signInWithPassword({
    email: user.email,
    password: body.current_password,
  })
  if (verifyError) {
    return Response.json({ error: '当前密码不正确' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  // 1. 改密码
  const { error: pwError } = await adminClient.auth.admin.updateUserById(user.id, {
    password: body.new_password,
  })
  if (pwError) return Response.json({ error: pwError.message }, { status: 400 })

  // 2. 清强制改密标记（admin 权限绕过 RLS）
  const { error: flagError } = await adminClient
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', user.id)
  if (flagError) {
    // 密码已改但 flag 没清——返回特殊提示，前端不要让用户陷入死循环
    return Response.json({ error: '密码已更新但标记未清除，请联系管理员: ' + flagError.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
