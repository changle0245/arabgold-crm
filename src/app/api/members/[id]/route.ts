import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await requireAdmin()
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })
  const user = a.user

  const body = await request.json()

  // H4: admin 不能修改自己的 role / is_active
  if (id === user.id) {
    if (body.role !== undefined && body.role !== 'admin') {
      return Response.json({ error: '不能修改自己的角色' }, { status: 400 })
    }
    if (body.is_active === false) {
      return Response.json({ error: '不能停用自己的账号' }, { status: 400 })
    }
  }

  const adminClient = createAdminClient()
  const update: Record<string, unknown> = {}
  if (body.full_name !== undefined) update.full_name = body.full_name
  if (body.role !== undefined) update.role = body.role
  if (body.job_title !== undefined) update.job_title = body.job_title
  if (body.is_active !== undefined) update.is_active = body.is_active

  if (Object.keys(update).length === 0) {
    return Response.json({ success: true })
  }

  const { error } = await adminClient
    .from('profiles')
    .update(update)
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 400 })

  return Response.json({ success: true })
}
