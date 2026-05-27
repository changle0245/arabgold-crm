import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.new_password !== 'string' || body.new_password.length < 6) {
    return Response.json({ error: '新密码至少 6 位' }, { status: 400 })
  }
  if (typeof body.current_password !== 'string' || body.current_password.length === 0) {
    return Response.json({ error: '请填写当前密码' }, { status: 400 })
  }

  const { rows } = await db.query<{ password_hash: string | null }>(
    'select password_hash from public.profiles where id = $1 limit 1',
    [session.user.id]
  )
  const row = rows[0]
  if (!row?.password_hash) {
    return Response.json({ error: '账号未设置密码,请联系管理员' }, { status: 400 })
  }

  const ok = await bcrypt.compare(body.current_password, row.password_hash)
  if (!ok) {
    return Response.json({ error: '当前密码不正确' }, { status: 400 })
  }

  const newHash = await bcrypt.hash(body.new_password, 12)
  await db.query(
    'update public.profiles set password_hash = $1, must_change_password = false where id = $2',
    [newHash, session.user.id]
  )

  return Response.json({ success: true })
}
