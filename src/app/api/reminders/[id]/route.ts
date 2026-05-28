// Phase 3b · PATCH /api/reminders/[id]
//   Update a single reminder's status or due_date. Used by the personal
//   dashboard (markDone) and the reminders page (markStatus / postpone).
//
//   ACL: only the assignee (assigned_to) may patch their own reminder.
//   Admins may patch any (consistent with admin scope=all on the list route).

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth-helpers'
import type { Reminder } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PatchReminderBody {
  status?: 'pending' | 'completed' | 'cancelled'
  due_date?: string | null
}

const ALLOWED_STATUS = new Set(['pending', 'completed', 'cancelled'])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user

  const body = (await request.json().catch(() => null)) as PatchReminderBody | null
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, error: '请求体无效' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existing, error: loadErr } = await admin
    .from<Reminder>('reminders')
    .select('id, assigned_to, status, due_date')
    .eq('id', id)
    .maybeSingle()
  if (loadErr) {
    return Response.json({ ok: false, error: loadErr.message }, { status: 500 })
  }
  if (!existing) {
    return Response.json({ ok: false, error: '提醒不存在' }, { status: 404 })
  }
  if (user.role !== 'admin' && existing.assigned_to !== user.id) {
    return Response.json({ ok: false, error: '无权修改该提醒' }, { status: 403 })
  }

  const update: Record<string, unknown> = {}
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    if (typeof body.status !== 'string' || !ALLOWED_STATUS.has(body.status)) {
      return Response.json({ ok: false, error: 'status 无效' }, { status: 400 })
    }
    update.status = body.status
    if (body.status === 'completed') {
      update.completed_at = new Date().toISOString()
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'due_date')) {
    if (body.due_date !== null && typeof body.due_date !== 'string') {
      return Response.json({ ok: false, error: 'due_date 无效' }, { status: 400 })
    }
    update.due_date = body.due_date
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ ok: false, error: '没有可更新的字段' }, { status: 400 })
  }

  const { error: updErr } = await admin
    .from('reminders')
    .update(update)
    .eq('id', id)
  if (updErr) {
    return Response.json({ ok: false, error: updErr.message }, { status: 500 })
  }

  return Response.json({ ok: true, data: { id } })
}
