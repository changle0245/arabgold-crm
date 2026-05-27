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

// CRM 真正承载的实体子集 — 契约 §9.3.1 枚举里其余值(product/blog_post/inquiry)
// 在本站点不适用,按用户指令一并以 E_UNSUPPORTED_TYPE 拒绝
const SUPPORTED_TYPES = new Set(['customer', 'order', 'quote'])

interface Entity {
  site_id: string
  entity_type: string
  entity_id: string
  title: string
  url: string | null
  data: Record<string, unknown>
  created_at: string
  updated_at: string
}

// cursor 用 base64({ts, id})。同 ts 下用 id 做 tiebreaker
function encodeCursor(ts: string, id: string): string {
  return Buffer.from(JSON.stringify({ ts, id })).toString('base64url')
}
function decodeCursor(cursor: string): { ts: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (typeof parsed?.ts === 'string' && typeof parsed?.id === 'string') return parsed
    return null
  } catch {
    return null
  }
}

async function fetchCustomers(
  admin: ReturnType<typeof createAdminClient>,
  since: Date | null,
  cursor: { ts: string; id: string } | null,
  limit: number
): Promise<{ rows: Entity[]; nextCursor: string | null }> {
  let q = admin
    .from('customers')
    .select(
      'id, contact_name, company_name, country, email, whatsapp, level, stage, source, product_category, total_deal_count, total_deal_amount, first_deal_date, owner_id, created_at, updated_at'
    )
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1)

  if (since) q = q.gte('updated_at', since.toISOString())
  if (cursor) {
    // (updated_at, id) > (cursor.ts, cursor.id)
    q = q.or(`updated_at.gt.${cursor.ts},and(updated_at.eq.${cursor.ts},id.gt.${cursor.id})`)
  }

  const { data, error } = await q
  if (error) throw error

  // Compat shim types `data` as `T | null` even for list queries; cast.
  const customerRows = (data ?? []) as Array<Record<string, unknown>>
  const rows: Entity[] = customerRows.slice(0, limit).map((c) => {
    const id = c.id as string
    return {
      site_id: SITE_ID(),
      entity_type: 'customer',
      entity_id: id,
      // 任务简报 §F.CRM 红线 11:title 不允许含明文 PII。用 entity_id 前 8 位做稳定可读标识
      title: `Customer ${id.slice(0, 8)}`,
      url: null, // CRM 是内部系统,无公开 URL
      data: {
        // PII 字段 sha256 → hex 取前 16 字符,中台只用于去重/关联,无法还原(任务简报 §D.4)
        contact_name_hash: hashPii(c.contact_name as string | null),
        company_name_hash: hashPii(c.company_name as string | null),
        email_hash: hashPii(c.email as string | null),
        whatsapp_hash: hashPii(c.whatsapp as string | null),
        // 非 PII 业务字段保留明文
        country: c.country,
        level: c.level,
        stage: c.stage,
        source: c.source,
        product_category: c.product_category,
        total_deal_count: c.total_deal_count,
        // total_deal_amount 来自 refresh_customer_deal_stats — 仅含主货币累加,数字原值
        total_deal_amount: c.total_deal_amount,
        first_deal_date: c.first_deal_date,
        owner_id: c.owner_id,
      },
      created_at: toIsoZ(c.created_at as string) ?? new Date(0).toISOString(),
      updated_at: toIsoZ(c.updated_at as string) ?? new Date(0).toISOString(),
    }
  })

  const hasMore = customerRows.length > limit
  const last = rows[rows.length - 1]
  const nextCursor = hasMore && last ? encodeCursor(last.updated_at, last.entity_id) : null
  return { rows, nextCursor }
}

async function fetchDeals(
  admin: ReturnType<typeof createAdminClient>,
  since: Date | null,
  cursor: { ts: string; id: string } | null,
  limit: number
): Promise<{ rows: Entity[]; nextCursor: string | null }> {
  // deals 表无 updated_at — 用 created_at 排序+分页
  let q = admin
    .from('deals')
    .select(
      'id, customer_id, quotation_id, deal_no, deal_date, deal_amount, currency, payment_method, deposit_received, balance_received, status, is_reorder, created_at'
    )
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1)

  if (since) q = q.gte('created_at', since.toISOString())
  if (cursor) {
    q = q.or(`created_at.gt.${cursor.ts},and(created_at.eq.${cursor.ts},id.gt.${cursor.id})`)
  }

  const { data, error } = await q
  if (error) throw error

  const dealRows = (data ?? []) as Array<Record<string, unknown>>
  const rows: Entity[] = dealRows.slice(0, limit).map((d) => {
    const amount = d.deal_amount === null || d.deal_amount === undefined ? null : Number(d.deal_amount)
    const currency = ((d.currency as string | null) ?? 'USD').toUpperCase()
    return {
      site_id: SITE_ID(),
      entity_type: 'order',
      entity_id: d.id as string,
      title: (d.deal_no as string | null) || `Deal ${d.deal_date ?? d.id}`,
      url: null,
      data: {
        deal_no: d.deal_no,
        customer_id: d.customer_id,
        quotation_id: d.quotation_id,
        deal_date: d.deal_date,
        // 金额:契约 §4 要求货币用整数最小单位。amount 是原币种数,转成 cents
        amount_cents: amount === null ? null : Math.round(amount * 100),
        currency,
        payment_method: d.payment_method,
        deposit_received: d.deposit_received,
        balance_received: d.balance_received,
        status: d.status,
        is_reorder: d.is_reorder,
      },
      created_at: toIsoZ(d.created_at as string) ?? new Date(0).toISOString(),
      updated_at: toIsoZ(d.created_at as string) ?? new Date(0).toISOString(),
    }
  })

  const hasMore = dealRows.length > limit
  const last = rows[rows.length - 1]
  const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.entity_id) : null
  return { rows, nextCursor }
}

async function fetchQuotes(
  admin: ReturnType<typeof createAdminClient>,
  since: Date | null,
  cursor: { ts: string; id: string } | null,
  limit: number
): Promise<{ rows: Entity[]; nextCursor: string | null }> {
  let q = admin
    .from('quotations')
    .select(
      'id, customer_id, quote_no, version, trade_terms, currency, total_amount, valid_until, status, created_at'
    )
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1)

  if (since) q = q.gte('created_at', since.toISOString())
  if (cursor) {
    q = q.or(`created_at.gt.${cursor.ts},and(created_at.eq.${cursor.ts},id.gt.${cursor.id})`)
  }

  const { data, error } = await q
  if (error) throw error

  const quoteRows = (data ?? []) as Array<Record<string, unknown>>
  const rows: Entity[] = quoteRows.slice(0, limit).map((qrow) => {
    const total = qrow.total_amount === null || qrow.total_amount === undefined ? null : Number(qrow.total_amount)
    const currency = ((qrow.currency as string | null) ?? 'USD').toUpperCase()
    return {
      site_id: SITE_ID(),
      entity_type: 'quote',
      entity_id: qrow.id as string,
      title: (qrow.quote_no as string | null) || `Quote ${qrow.id}`,
      url: null,
      data: {
        quote_no: qrow.quote_no,
        version: qrow.version,
        customer_id: qrow.customer_id,
        trade_terms: qrow.trade_terms,
        total_amount_cents: total === null ? null : Math.round(total * 100),
        currency,
        valid_until: qrow.valid_until,
        status: qrow.status,
      },
      created_at: toIsoZ(qrow.created_at as string) ?? new Date(0).toISOString(),
      updated_at: toIsoZ(qrow.created_at as string) ?? new Date(0).toISOString(),
    }
  })

  const hasMore = quoteRows.length > limit
  const last = rows[rows.length - 1]
  const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.entity_id) : null
  return { rows, nextCursor }
}

export async function GET(request: NextRequest) {
  const denied = guardHmac(request)
  if (denied) return denied

  const sp = request.nextUrl.searchParams
  const type = sp.get('type')
  if (!type) {
    return jsonError('E_UNSUPPORTED_TYPE', 'type query parameter is required')
  }
  if (!SUPPORTED_TYPES.has(type)) {
    return jsonError(
      'E_UNSUPPORTED_TYPE',
      `entity type "${type}" is not exported by this site (supported: customer, order, quote)`
    )
  }

  const sinceRaw = sp.get('since')
  const since = sinceRaw === null ? null : parseIsoUtc(sinceRaw)
  if (sinceRaw !== null && !since) {
    return jsonError('E_INVALID_RANGE', 'since must be ISO 8601 UTC ending with Z')
  }

  const cursorRaw = sp.get('cursor')
  const cursor = cursorRaw === null ? null : decodeCursor(cursorRaw)
  if (cursorRaw !== null && !cursor) {
    return jsonError('E_INVALID_RANGE', 'cursor is malformed')
  }

  const limit = parseLimit(sp.get('limit'), 100, 1000)

  const admin = createAdminClient()
  try {
    let result: { rows: Entity[]; nextCursor: string | null }
    if (type === 'customer') {
      result = await fetchCustomers(admin, since, cursor, limit)
    } else if (type === 'order') {
      result = await fetchDeals(admin, since, cursor, limit)
    } else {
      result = await fetchQuotes(admin, since, cursor, limit)
    }
    return jsonOk(result.rows, result.rows.length, result.nextCursor)
  } catch (e) {
    return jsonError('E_INTERNAL', e instanceof Error ? e.message : 'entity query failed')
  }
}
