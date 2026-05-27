// Phase 3: server-side auth guards (replace supabase.auth.getUser() + profiles role check).
import { auth } from './auth'
import { db } from './db'

export type UserRole = 'admin' | 'member'

export interface UserContext {
  id: string
  email: string
  role: UserRole
  is_active: true
  must_change_password: boolean
}

// Discriminated union — every call site uses `if (r.error || !r.user)` or
// `if (!r.ok)` to narrow. Both work because the discriminator carries the
// same information.
export type Guard =
  | { ok: false; error: string; status: 401 | 403; user: null }
  | { ok: true; error: null; status: 200; user: UserContext }

export async function requireUser(): Promise<Guard> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, error: '未登录', status: 401, user: null }
  }
  const { rows } = await db.query<{ role: UserRole; is_active: boolean; must_change_password: boolean }>(
    'select role, is_active, must_change_password from public.profiles where id = $1 limit 1',
    [session.user.id]
  )
  const profile = rows[0]
  if (!profile || profile.is_active === false) {
    return { ok: false, error: '账号已停用', status: 403, user: null }
  }
  return {
    ok: true,
    error: null,
    status: 200,
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      role: profile.role,
      is_active: true,
      must_change_password: profile.must_change_password,
    },
  }
}

export async function requireAdmin(): Promise<Guard> {
  const r = await requireUser()
  if (!r.ok) return r
  if (r.user.role !== 'admin') {
    return { ok: false, error: '无权限', status: 403, user: null }
  }
  return r
}
