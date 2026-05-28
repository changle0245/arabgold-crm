// Phase 5D.3 · 反向事件总线 inbound — 中台询价转 CRM lead
// 中台 /api/master/inbound/inquiries 收到 arabgold 询价 → 调此 endpoint
// 在 CRM 创建 customer as lead (master_customer_id 已 pre-filled)
//
// 防回环关键: 直接走 db.query INSERT,不走 POST /api/customers route handler
// (那个会触发 fireAndForgetCustomerSync 反向推中台 → 死循环)

import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PATH = '/api/master/inbound/customers/from-inquiry'

// 默认 lead owner = lc0245308 admin (从 v1.32 等段记录)
// 业务员可在 CRM 后台 reassign(用 PATCH /api/customers/[id] owner_id 字段)
const DEFAULT_OWNER_ID = '912f0559-5027-46ec-81ed-d0c7cf80ea0d'

interface InquiryLeadPayload {
  master_customer_id: string
  contact_name: string
  company_name?: string | null
  country?: string | null
  email?: string | null
  whatsapp?: string | null
  phone?: string | null
  source_inquiry: {
    site_id: string
    site_inquiry_id: string
    message?: string | null
    product_skus?: string[]
    source_url?: string | null
  }
}

interface LeadResult {
  master_customer_id: string | null
  crm_customer_id?: string
  action: 'created' | 'exists' | 'skipped' | 'error'
  error?: string
}

function authFail(message: string) {
  return Response.json(
    { ok: false, error: { code: 'E_AUTH_FAILED', message } },
    { status: 401 },
  )
}

export async function POST(req: Request) {
  const secret = process.env.MASTER_INBOUND_HMAC_SECRET
  if (!secret) {
    return Response.json(
      { ok: false, error: { code: 'E_CONFIG', message: 'MASTER_INBOUND_HMAC_SECRET 未配置' } },
      { status: 500 },
    )
  }

  const rawBody = await req.text()
  const timestamp = req.headers.get('x-middleground-timestamp')
  const signature = req.headers.get('x-middleground-signature')
  if (!timestamp || !signature) return authFail('missing headers')

  const ts = parseInt(timestamp, 10)
  if (!Number.isFinite(ts)) return authFail('invalid timestamp')
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > 300) return authFail('timestamp out of window')

  const signingString = `${timestamp}\nPOST\n${PATH}\n${rawBody}`
  const expected = createHmac('sha256', secret).update(signingString).digest('hex')
  const received = signature.replace(/^sha256=/, '')
  if (received.length !== expected.length) return authFail('length mismatch')

  let recvBuf: Buffer
  let expBuf: Buffer
  try {
    recvBuf = Buffer.from(received, 'hex')
    expBuf = Buffer.from(expected, 'hex')
  } catch {
    return authFail('invalid signature hex')
  }
  if (!timingSafeEqual(recvBuf, expBuf)) return authFail('signature mismatch')

  let payloads: InquiryLeadPayload[]
  try {
    payloads = JSON.parse(rawBody)
    if (!Array.isArray(payloads)) throw new Error('expect JSON array')
  } catch (e) {
    return Response.json(
      { ok: false, error: { code: 'E_INVALID_BODY', message: String(e) } },
      { status: 400 },
    )
  }

  const results: LeadResult[] = []

  for (const item of payloads) {
    try {
      if (!item.master_customer_id || !item.contact_name) {
        results.push({
          master_customer_id: item.master_customer_id ?? null,
          action: 'skipped',
          error: 'missing master_customer_id or contact_name',
        })
        continue
      }

      // 防重复创建:看是否已有 customer 关联此 master_customer_id
      const existing = await db.query<{ id: string }>(
        'SELECT id FROM public.customers WHERE master_customer_id = $1 LIMIT 1',
        [item.master_customer_id],
      )
      if (existing.rows.length > 0) {
        results.push({
          master_customer_id: item.master_customer_id,
          crm_customer_id: existing.rows[0].id,
          action: 'exists',
        })
        continue
      }

      // INSERT as lead — 直接 db.query 不走 /api/customers route(防回环)
      const skus = item.source_inquiry.product_skus ?? []
      const notesParts: string[] = [`[arabgold 询价]`]
      if (item.source_inquiry.message) notesParts.push(item.source_inquiry.message)
      if (skus.length > 0) notesParts.push(`产品: ${skus.join(', ')}`)
      if (item.source_inquiry.source_url) notesParts.push(`来源: ${item.source_inquiry.source_url}`)
      const notes = notesParts.join('\n')

      const ins = await db.query<{ id: string }>(
        `INSERT INTO public.customers (
           master_customer_id, contact_name, company_name, country,
           email, whatsapp, phone,
           owner_id, level, stage, source, notes
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
         ) RETURNING id`,
        [
          item.master_customer_id,
          item.contact_name,
          item.company_name ?? null,
          item.country ?? null,
          item.email ?? null,
          item.whatsapp ?? null,
          item.phone ?? null,
          DEFAULT_OWNER_ID,
          '待定',
          '待定',
          'arabgold_inquiry',
          notes,
        ],
      )

      results.push({
        master_customer_id: item.master_customer_id,
        crm_customer_id: ins.rows[0].id,
        action: 'created',
      })
    } catch (e) {
      results.push({
        master_customer_id: item.master_customer_id ?? null,
        action: 'error',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return Response.json({ ok: true, data: results }, { status: 200 })
}
