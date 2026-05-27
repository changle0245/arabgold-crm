import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-helpers'

// POST /api/members  → admin invite a new member
// body: { email, password, full_name, role?, job_title? }
//
// Phase 3 NextAuth rewrite: instead of supabase.auth.admin.createUser(), we
// hash the password with bcrypt and insert into public.profiles directly. The
// new member is forced to change their password on first login.
export async function POST(request: NextRequest) {
  const a = await requireAdmin()
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const body = await request.json()
  const { email, password, full_name, role, job_title } = body

  if (!email || !password || !full_name) {
    return Response.json({ error: '缺少必填字段' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 6) {
    return Response.json({ error: '密码至少 6 位' }, { status: 400 })
  }
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: '邮箱格式不正确' }, { status: 400 })
  }

  // Uniqueness check (case-insensitive) — the unique index also enforces this,
  // but a friendly error is nicer than a 500.
  const existing = await db.query(
    'select 1 from public.profiles where lower(email) = lower($1) limit 1',
    [email]
  )
  if (existing.rows.length > 0) {
    return Response.json({ error: '该邮箱已被使用' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const hash = await bcrypt.hash(password, 12)

  try {
    await db.query(
      `insert into public.profiles
         (id, email, full_name, role, job_title, password_hash, must_change_password, is_active)
       values
         ($1, $2, $3, $4, $5, $6, true, true)`,
      [id, email, full_name, role || 'member', job_title || '业务员', hash]
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ error: '创建失败: ' + msg }, { status: 400 })
  }

  return Response.json({ success: true, id })
}
