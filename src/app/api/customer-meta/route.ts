// Phase 3b · /api/customer-meta
//   GET — lookup data for the customers list filter bar + customer-form dropdowns
// Returns active profiles (for owner filter / form select), distinct countries
// (from existing customer rows) and distinct tags (from customer_tags). One
// round-trip replaces the three parallel queries the client used to make
// directly against the supabase compat shim.

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth-helpers'
import type { Profile } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }

  const admin = createAdminClient()

  const [profilesRes, countriesRes, tagsRes] = await Promise.all([
    admin.from<Profile>('profiles').select('*').eq('is_active', true),
    // Distinct countries; compat shim doesn't expose SELECT DISTINCT directly,
    // but a plain select-all-then-uniq is fine for current table sizes (~1k).
    admin.from('customers').select('country'),
    admin.from('customer_tags').select('tag'),
  ])

  if (profilesRes.error) {
    return Response.json({ ok: false, error: profilesRes.error.message }, { status: 500 })
  }
  if (countriesRes.error) {
    return Response.json({ ok: false, error: countriesRes.error.message }, { status: 500 })
  }
  if (tagsRes.error) {
    return Response.json({ ok: false, error: tagsRes.error.message }, { status: 500 })
  }

  const profiles = (profilesRes.data ?? []) as Profile[]

  // Frequency-sorted (most common first) to mirror previous client behaviour.
  const countryRows = (countriesRes.data ?? []) as Array<{ country: string | null }>
  const cf: Record<string, number> = {}
  for (const row of countryRows) {
    if (row.country) cf[row.country] = (cf[row.country] || 0) + 1
  }
  const countries = Object.keys(cf).sort((a, b) => cf[b] - cf[a])

  const tagRows = (tagsRes.data ?? []) as Array<{ tag: string | null }>
  const tf: Record<string, number> = {}
  for (const row of tagRows) {
    if (row.tag) tf[row.tag] = (tf[row.tag] || 0) + 1
  }
  const tags = Object.keys(tf).sort((a, b) => tf[b] - tf[a])

  return Response.json({
    ok: true,
    data: { profiles, countries, tags },
  })
}
