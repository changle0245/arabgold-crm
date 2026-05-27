// Phase 3b · /api/customers/[customerId]
//   GET — single customer + owner JOIN + tags array
// Replaces client-side createClient().from('customers').eq('id', id).single() chains
// in customers/[id]/page.tsx and customers/[id]/edit/page.tsx.

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth-helpers'
import type { Customer, Profile } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user

  const admin = createAdminClient()

  const { data: customer, error } = await admin
    .from<Customer>('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle()

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
  if (!customer) return Response.json({ ok: false, error: '客户不存在' }, { status: 404 })

  // ACL: member can only access own customers; admin can access all
  if (user.role !== 'admin' && customer.owner_id !== user.id) {
    return Response.json({ ok: false, error: '无权访问该客户' }, { status: 403 })
  }

  // Owner JOIN (two-step to avoid compat nested-join limitation)
  let owner: Profile | undefined
  if (customer.owner_id) {
    const { data: ownerRow } = await admin
      .from<Profile>('profiles')
      .select('*')
      .eq('id', customer.owner_id)
      .maybeSingle()
    owner = (ownerRow ?? undefined) as Profile | undefined
  }

  // Tags
  const { data: tagRows } = await admin
    .from('customer_tags')
    .select('tag')
    .eq('customer_id', customerId)
  const tagRowsArr = (tagRows ?? []) as Array<{ tag: string }>
  const tags = tagRowsArr.map((r) => r.tag)

  return Response.json({
    ok: true,
    data: { ...customer, owner, tags },
  })
}
