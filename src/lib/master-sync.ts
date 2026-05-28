// Phase 4 stage 4 · Outbound master-data push
// ----------------------------------------------------------------
// Fire-and-forget POST 客户主数据到中台 master_customers inbound endpoint。
// 只同步"主数据范畴"字段(身份/联系方式/商务偏好);
// CRM 内部业务字段(level/stage/owner_id/source/notes/last_contact_date 等)不同步。
//
// 调用方在 customer INSERT/UPDATE 后用 setTimeout/Promise 异步触发,
// 失败仅记日志不阻塞 API response。
// 首次同步成功后中台返 master_id,调用方写回 customers.master_customer_id。
// ----------------------------------------------------------------

import { db } from '@/lib/db'
import type { Customer } from '@/lib/types'

interface PushResult {
  master_id: string
}

// HMAC sign string format (与中台 inbound endpoint verifyMiddlegroundHmac 对齐):
//   ${timestamp}\n${METHOD}\n${path}\n${body}
const INBOUND_PATH = '/api/master/inbound/customers'

// 主数据范畴白名单 — 只同步这些字段
type MasterCustomerPayload = {
  crm_id: string
  master_customer_id: string | null
  contact_name: string
  contact_title: string | null
  gender: string | null
  company_name: string | null
  company_website: string | null
  company_address: string | null
  country: string | null
  avatar_url: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  wechat_id: string | null
  telegram: string | null
  linkedin: string | null
  skype: string | null
  instagram: string | null
  facebook: string | null
  alibaba_id: string | null
  industry: string | null
  company_size: string | null
  payment_preference: string | null
  currency_preference: string | null
  incoterms: string | null
}

function toPayload(c: Customer & { master_customer_id?: string | null }): MasterCustomerPayload {
  return {
    crm_id: c.id,
    master_customer_id: c.master_customer_id ?? null,
    contact_name: c.contact_name,
    contact_title: c.contact_title,
    gender: c.gender,
    company_name: c.company_name,
    company_website: c.company_website,
    company_address: c.company_address,
    country: c.country,
    avatar_url: c.avatar_url,
    email: c.email,
    phone: c.phone,
    whatsapp: c.whatsapp,
    wechat_id: c.wechat_id,
    telegram: c.telegram,
    linkedin: c.linkedin,
    skype: c.skype,
    instagram: c.instagram,
    facebook: c.facebook,
    alibaba_id: c.alibaba_id,
    industry: c.industry,
    company_size: c.company_size,
    payment_preference: c.payment_preference,
    currency_preference: c.currency_preference,
    incoterms: c.incoterms,
  }
}

// 主推送 — 直接抛出/返回 null 由调用方决定。
// 返回 { master_id } 表示中台已 upsert;null 表示失败(详见 console.error)。
export async function pushCustomerToMaster(
  customer: Customer & { master_customer_id?: string | null }
): Promise<PushResult | null> {
  const url = process.env.MIDDLEGROUND_URL
  const secret = process.env.MASTER_INBOUND_HMAC_SECRET
  if (!url || !secret) {
    console.error('[master-sync] MIDDLEGROUND_URL or MASTER_INBOUND_HMAC_SECRET not configured; skipping push')
    return null
  }

  const payload = [toPayload(customer)]
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000).toString()

  const { createHmac } = await import('node:crypto')
  const signingString = `${timestamp}\nPOST\n${INBOUND_PATH}\n${body}`
  const signature = createHmac('sha256', secret).update(signingString).digest('hex')

  const endpoint = `${url.replace(/\/$/, '')}${INBOUND_PATH}`
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Middleground-Timestamp': timestamp,
        'X-Middleground-Signature': `sha256=${signature}`,
        'User-Agent': 'crm-master-sync/1.0',
      },
      body,
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '<no body>')
      console.error(`[master-sync] inbound returned ${resp.status}: ${text.slice(0, 500)}`)
      return null
    }

    let parsed: unknown
    try {
      parsed = await resp.json()
    } catch (e) {
      console.error('[master-sync] inbound response not JSON:', e)
      return null
    }

    // 兼容两种返回结构:
    //   { ok:true, data:[{ master_id }] }      契约 v1 风格
    //   { master_id }                          扁平风格
    const obj = (parsed ?? {}) as Record<string, unknown>
    let masterId: string | null = null
    if (typeof obj.master_id === 'string' && obj.master_id) {
      masterId = obj.master_id
    } else if (Array.isArray(obj.data)) {
      const first = obj.data[0] as Record<string, unknown> | undefined
      if (first && typeof first.master_id === 'string' && first.master_id) {
        masterId = first.master_id
      }
    }

    if (!masterId) {
      console.warn('[master-sync] inbound 200 but master_id missing in response')
      return null
    }

    return { master_id: masterId }
  } catch (err) {
    console.error('[master-sync] fetch failed:', err)
    return null
  }
}

// 调用方在 POST/PATCH customer 成功后调用这个 — fire-and-forget,不 await。
// - push 成功且原本没有 master_customer_id 时,把回填写到 customers 表
// - 全部错误吞掉,只打日志,不影响 API response
export function fireAndForgetCustomerSync(
  customer: Customer & { master_customer_id?: string | null }
): void {
  // 用 microtask 立刻执行,但调用方不 await
  void (async () => {
    try {
      const result = await pushCustomerToMaster(customer)
      if (!result) return
      const previous = customer.master_customer_id ?? null
      if (previous && previous === result.master_id) {
        // 已经一致,不用写
        return
      }
      // 第一次同步,或中台改了 master_id(理论上不会),都把最新值写回
      try {
        await db.query(
          'update public.customers set master_customer_id = $1 where id = $2',
          [result.master_id, customer.id]
        )
      } catch (e) {
        console.error('[master-sync] backfill master_customer_id failed:', e)
      }
    } catch (e) {
      console.error('[master-sync] hook unhandled:', e)
    }
  })()
}
