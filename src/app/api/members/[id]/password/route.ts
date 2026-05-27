import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-helpers'

// POST /api/members/:id/password  → admin resets a member's password
// body: { new_password: string }
//
// Phase 3 NextAuth rewrite: bcrypt-hash and write to public.profiles directly,
// then mark must_change_password = true so the member is forced to change it
// at their next login.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const a = await requireAdmin()
  if (a.error) return Response.json({ error: a.error }, { status: a.status })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.new_password !== 'string' || body.new_password.length < 6) {
    return Response.json({ error: '新密码至少 6 位' }, { status: 400 })
  }

  const hash = await bcrypt.hash(body.new_password, 12)
  const result = await db.query(
    'update public.profiles set password_hash = $1, must_change_password = true where id = $2',
    [hash, id]
  )
  if (result.rowCount === 0) {
    return Response.json({ error: '成员不存在' }, { status: 404 })
  }

  return Response.json({ success: true })
}
