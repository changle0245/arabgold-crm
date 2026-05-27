// Phase 3b · /api/customers/[customerId]/timeline
//   GET — aggregated timeline: contact_logs + communication_logs + quotations + deals
//         + samples + reminders + stage_changes + ownership_changes + attachments.
// Replaces 12-table client-side parallel Promise.all in customers/[id]/page.tsx.

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

  // ACL gate: load customer first, check ownership
  const { data: customer, error: custErr } = await admin
    .from<Customer>('customers')
    .select('id, owner_id')
    .eq('id', customerId)
    .maybeSingle()

  if (custErr) return Response.json({ ok: false, error: custErr.message }, { status: 500 })
  if (!customer) return Response.json({ ok: false, error: '客户不存在' }, { status: 404 })
  if (user.role !== 'admin' && customer.owner_id !== user.id) {
    return Response.json({ ok: false, error: '无权访问该客户' }, { status: 403 })
  }

  // Parallel pull — 8 tables (12 includes profiles JOIN deferred to single hydrate)
  const [
    contactLogs,
    commLogs,
    quotations,
    deals,
    samples,
    reminders,
    stageChanges,
    ownershipChanges,
    attachments,
  ] = await Promise.all([
    admin.from('contact_logs').select('*').eq('customer_id', customerId).order('log_date', { ascending: false }),
    admin.from('communication_logs').select('*').eq('customer_id', customerId).order('sent_at', { ascending: false }),
    admin.from('quotations').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
    admin.from('deals').select('*').eq('customer_id', customerId).order('deal_date', { ascending: false }),
    admin.from('samples').select('*').eq('customer_id', customerId).order('sent_date', { ascending: false, nullsFirst: false }),
    admin.from('reminders').select('*').eq('customer_id', customerId).order('due_date', { ascending: true }),
    admin.from('stage_changes').select('*').eq('customer_id', customerId).order('changed_at', { ascending: false }),
    admin.from('customer_ownership_changes').select('*').eq('customer_id', customerId).order('changed_at', { ascending: false }),
    admin.from('customer_attachments').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
  ])

  // First error wins
  const firstErr = [contactLogs, commLogs, quotations, deals, samples, reminders, stageChanges, ownershipChanges, attachments]
    .find((r) => r.error)
  if (firstErr?.error) {
    return Response.json({ ok: false, error: 'timeline query failed: ' + firstErr.error.message }, { status: 500 })
  }

  // Hydrate profile names (logger/owner) — collect all referenced profile ids
  const profileIds = new Set<string>()
  const collect = (rows: unknown[] | null | undefined, ...keys: string[]) => {
    for (const row of rows ?? []) {
      const r = row as Record<string, unknown>
      for (const k of keys) {
        const v = r[k]
        if (typeof v === 'string' && v) profileIds.add(v)
      }
    }
  }
  collect(contactLogs.data as unknown as unknown[], 'logged_by')
  collect(commLogs.data as unknown as unknown[], 'created_by')
  collect(quotations.data as unknown as unknown[], 'created_by')
  collect(deals.data as unknown as unknown[], 'created_by')
  collect(samples.data as unknown as unknown[], 'created_by')
  collect(reminders.data as unknown as unknown[], 'created_by', 'assigned_to')
  collect(stageChanges.data as unknown as unknown[], 'changed_by')
  collect(ownershipChanges.data as unknown as unknown[], 'changed_by', 'from_owner_id', 'to_owner_id')
  collect(attachments.data as unknown as unknown[], 'uploaded_by')

  let profilesMap = new Map<string, Profile>()
  if (profileIds.size > 0) {
    const { data: profs } = await admin
      .from<Profile>('profiles')
      .select('*')
      .in('id', Array.from(profileIds))
    const profsArr = (profs ?? []) as Profile[]
    profilesMap = new Map(profsArr.map((p) => [p.id, p]))
  }

  return Response.json({
    ok: true,
    data: {
      contact_logs: contactLogs.data ?? [],
      communication_logs: commLogs.data ?? [],
      quotations: quotations.data ?? [],
      deals: deals.data ?? [],
      samples: samples.data ?? [],
      reminders: reminders.data ?? [],
      stage_changes: stageChanges.data ?? [],
      ownership_changes: ownershipChanges.data ?? [],
      attachments: attachments.data ?? [],
      profiles: Object.fromEntries(profilesMap),
    },
  })
}
