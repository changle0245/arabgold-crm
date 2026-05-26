import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SITE_ID,
  guardHmac,
  jsonOk,
  jsonError,
  parseIsoUtc,
  parseLimit,
  toIsoZ,
} from '@/lib/middleground/response'
import { hashPii } from '@/lib/middleground/redact'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface MiddlegroundEvent {
  site_id: string
  event_id: string
  event_type: string
  timestamp: string
  payload: Record<string, unknown>
}

// 已识别的事件类型(snake_case 阶段一不强制枚举,但保持稳定)
const KNOWN_EVENT_TYPES = new Set(['stage_changed', 'deal_created', 'customer_created', 'contact_logged'])

async function fetchStageChanged(
  admin: ReturnType<typeof createAdminClient>,
  since: Date,
  limit: number
): Promise<MiddlegroundEvent[]> {
  const { data, error } = await admin
    .from('stage_changes')
    .select('id, customer_id, changed_by, from_stage, to_stage, changed_at')
    .gte('changed_at', since.toISOString())
    .order('changed_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => ({
    site_id: SITE_ID(),
    event_id: `stage_changed:${r.id}`,
    event_type: 'stage_changed',
    timestamp: toIsoZ(r.changed_at as string) ?? new Date(0).toISOString(),
    payload: {
      customer_id: r.customer_id,
      changed_by: r.changed_by,
      from_stage: r.from_stage,
      to_stage: r.to_stage,
    },
  }))
}

async function fetchDealCreated(
  admin: ReturnType<typeof createAdminClient>,
  since: Date,
  limit: number
): Promise<MiddlegroundEvent[]> {
  const { data, error } = await admin
    .from('deals')
    .select('id, customer_id, deal_no, deal_date, deal_amount, currency, status, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((d) => {
    const amount = d.deal_amount === null || d.deal_amount === undefined ? null : Number(d.deal_amount)
    return {
      site_id: SITE_ID(),
      event_id: `deal_created:${d.id}`,
      event_type: 'deal_created',
      timestamp: toIsoZ(d.created_at as string) ?? new Date(0).toISOString(),
      payload: {
        deal_id: d.id,
        customer_id: d.customer_id,
        deal_no: d.deal_no,
        deal_date: d.deal_date,
        amount_cents: amount === null ? null : Math.round(amount * 100),
        currency: ((d.currency as string | null) ?? 'USD').toUpperCase(),
        status: d.status,
      },
    }
  })
}

async function fetchCustomerCreated(
  admin: ReturnType<typeof createAdminClient>,
  since: Date,
  limit: number
): Promise<MiddlegroundEvent[]> {
  const { data, error } = await admin
    .from('customers')
    .select('id, contact_name, company_name, country, owner_id, source, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((c) => ({
    site_id: SITE_ID(),
    event_id: `customer_created:${c.id}`,
    event_type: 'customer_created',
    timestamp: toIsoZ(c.created_at as string) ?? new Date(0).toISOString(),
    payload: {
      customer_id: c.id,
      // PII 脱敏 — 任务简报 §F.CRM 红线 11 / §D.4
      contact_name_hash: hashPii(c.contact_name as string | null),
      company_name_hash: hashPii(c.company_name as string | null),
      country: c.country,
      owner_id: c.owner_id,
      source: c.source,
    },
  }))
}

async function fetchContactLogged(
  admin: ReturnType<typeof createAdminClient>,
  since: Date,
  limit: number
): Promise<MiddlegroundEvent[]> {
  const { data, error } = await admin
    .from('contact_logs')
    .select('id, customer_id, logged_by, log_date, tag, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((c) => ({
    site_id: SITE_ID(),
    event_id: `contact_logged:${c.id}`,
    event_type: 'contact_logged',
    timestamp: toIsoZ(c.created_at as string) ?? new Date(0).toISOString(),
    payload: {
      customer_id: c.customer_id,
      logged_by: c.logged_by,
      log_date: c.log_date,
      tag: c.tag,
    },
  }))
}

export async function GET(request: NextRequest) {
  const denied = guardHmac(request)
  if (denied) return denied

  const sp = request.nextUrl.searchParams
  const sinceRaw = sp.get('since')
  const since = parseIsoUtc(sinceRaw)
  if (!since) {
    return jsonError('E_INVALID_RANGE', 'since is required, must be ISO 8601 UTC ending with Z')
  }
  const eventType = sp.get('event_type')
  const limit = parseLimit(sp.get('limit'), 100, 1000)

  if (eventType !== null && !KNOWN_EVENT_TYPES.has(eventType)) {
    // 契约 §9.4 阶段一未强制枚举,未知类型按"无匹配"返回空,不报错
    return jsonOk([], 0, null)
  }

  const admin = createAdminClient()
  try {
    const events: MiddlegroundEvent[] = []
    // 单源过滤时只跑那一支;无过滤时全部跑
    if (eventType === null || eventType === 'stage_changed') {
      events.push(...(await fetchStageChanged(admin, since, limit)))
    }
    if (eventType === null || eventType === 'deal_created') {
      events.push(...(await fetchDealCreated(admin, since, limit)))
    }
    if (eventType === null || eventType === 'customer_created') {
      events.push(...(await fetchCustomerCreated(admin, since, limit)))
    }
    if (eventType === null || eventType === 'contact_logged') {
      events.push(...(await fetchContactLogged(admin, since, limit)))
    }

    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.event_id.localeCompare(b.event_id))
    const sliced = events.slice(0, limit)
    return jsonOk(sliced, sliced.length, null)
  } catch (e) {
    return jsonError('E_INTERNAL', e instanceof Error ? e.message : 'event query failed')
  }
}
