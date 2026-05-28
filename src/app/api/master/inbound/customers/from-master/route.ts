// 2.1 · 中台 master_customers → CRM customers UPDATE 反向 sync inbound
// 中台 master_customers AFTER UPDATE trigger → POST 此 endpoint
// 收到后:UPDATE 所有 customers WHERE master_customer_id = master_id 的本地行
//
// 防回环关键: 直接 db.query UPDATE,不走 PATCH /api/customers/[id] route
// (那个会 fire waitUntil(fireAndForgetCustomerSync) 推回中台 → 死循环)

import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PATH = '/api/master/inbound/customers/from-master'

interface MasterCustomerPayload {
  master_id: string
  contact_name: string
  contact_title?: string | null
  gender?: string | null
  company_name?: string | null
  company_website?: string | null
  company_address?: string | null
  country?: string | null
  avatar_url?: string | null
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
  wechat_id?: string | null
  telegram?: string | null
  linkedin?: string | null
  skype?: string | null
  instagram?: string | null
  facebook?: string | null
  alibaba_id?: string | null
  industry?: string | null
  company_size?: string | null
  payment_preference?: string | null
  currency_preference?: string | null
  incoterms?: string | null
}

interface SyncResult {
  master_id: string
  affected_rows: number
  action: 'updated' | 'no-link' | 'error'
  error?: string
}

function authFail(message: string) {
  return Response.json(
    { ok: false, error: { code: 'E_AUTH_FAILED', message } },
    { status: 401 },
  )
}

export async function POST(req: Request) {
  // 复用 master sync 同一个 secret(MASTER_SYNC_HMAC_SECRET 跟 master_products inbound 共用)
  // arabgold 用的是 MIDDLEGROUND_HMAC_SECRET(中台 → arabgold 方向),
  // CRM 这条新链路用 MASTER_SYNC_HMAC_SECRET(中台 _app_secrets 同 key)
  const secret = process.env.MASTER_SYNC_HMAC_SECRET
  if (!secret) {
    return Response.json(
      { ok: false, error: { code: 'E_CONFIG', message: 'MASTER_SYNC_HMAC_SECRET 未配置' } },
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

  let payloads: MasterCustomerPayload[]
  try {
    payloads = JSON.parse(rawBody)
    if (!Array.isArray(payloads)) throw new Error('expect JSON array')
  } catch (e) {
    return Response.json(
      { ok: false, error: { code: 'E_INVALID_BODY', message: String(e) } },
      { status: 400 },
    )
  }

  const results: SyncResult[] = []

  for (const item of payloads) {
    try {
      if (!item.master_id || !item.contact_name) {
        results.push({
          master_id: item.master_id ?? '(missing)',
          affected_rows: 0,
          action: 'error',
          error: 'missing master_id or contact_name',
        })
        continue
      }

      // UPDATE CRM customers linked to this master — 全字段覆盖主数据范畴的列
      // 业务字段(level/stage/owner_id/source/notes/last_contact_date)不在 master,不动
      const res = await db.query<{ id: string }>(
        `UPDATE public.customers
           SET contact_name = $2,
               contact_title = $3,
               gender = $4,
               company_name = $5,
               company_website = $6,
               company_address = $7,
               country = $8,
               avatar_url = $9,
               email = $10,
               phone = $11,
               whatsapp = $12,
               wechat_id = $13,
               telegram = $14,
               linkedin = $15,
               skype = $16,
               instagram = $17,
               facebook = $18,
               alibaba_id = $19,
               industry = $20,
               company_size = $21,
               payment_preference = $22,
               currency_preference = $23,
               incoterms = $24,
               updated_at = NOW()
         WHERE master_customer_id = $1
         RETURNING id`,
        [
          item.master_id,
          item.contact_name,
          item.contact_title ?? null,
          item.gender ?? null,
          item.company_name ?? null,
          item.company_website ?? null,
          item.company_address ?? null,
          item.country ?? null,
          item.avatar_url ?? null,
          item.email ?? null,
          item.phone ?? null,
          item.whatsapp ?? null,
          item.wechat_id ?? null,
          item.telegram ?? null,
          item.linkedin ?? null,
          item.skype ?? null,
          item.instagram ?? null,
          item.facebook ?? null,
          item.alibaba_id ?? null,
          item.industry ?? null,
          item.company_size ?? null,
          item.payment_preference ?? null,
          item.currency_preference ?? null,
          item.incoterms ?? null,
        ],
      )

      if (res.rowCount === 0) {
        results.push({
          master_id: item.master_id,
          affected_rows: 0,
          action: 'no-link',
        })
      } else {
        results.push({
          master_id: item.master_id,
          affected_rows: res.rowCount ?? 0,
          action: 'updated',
        })
      }
    } catch (e) {
      results.push({
        master_id: item.master_id ?? '(missing)',
        affected_rows: 0,
        action: 'error',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return Response.json({ ok: true, data: results }, { status: 200 })
}
