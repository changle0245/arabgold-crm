// Phase 5C · Master products read client
// ----------------------------------------------------------------
// Fetch master_products list from middleground (read-only).
// Used by /api/master-products proxy (CRM internal) which serves the
// quotation form's product picker. Token 是 read-only,与 outbound HMAC 隔离。
// ----------------------------------------------------------------

export interface MasterProduct {
  id: string
  sku: string
  name_zh: string | null
  name_en: string | null
  price_default: number | null
  category_slug: string | null
  images: string[]
  is_active: boolean
}

interface MasterProductsResponse {
  ok: boolean
  data?: MasterProduct[]
  error?: { code?: string; message?: string }
}

const DEFAULT_LIMIT = 50

export async function fetchMasterProducts(search?: string): Promise<MasterProduct[]> {
  const url = process.env.MIDDLEGROUND_URL
  const token = process.env.MASTER_PRODUCTS_READ_TOKEN
  if (!url || !token) {
    console.error('[master-products] MIDDLEGROUND_URL or MASTER_PRODUCTS_READ_TOKEN not configured')
    return []
  }

  const qs = new URLSearchParams()
  if (search) qs.set('search', search)
  qs.set('limit', String(DEFAULT_LIMIT))

  const endpoint = `${url.replace(/\/$/, '')}/api/master/products?${qs}`
  try {
    const resp = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'crm-master-products/1.0',
      },
      // 不缓存 — master 数据变化由中台控制,CRM 端实时拉。
      cache: 'no-store',
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '<no body>')
      console.error(`[master-products] fetch returned ${resp.status}: ${text.slice(0, 300)}`)
      return []
    }

    let parsed: MasterProductsResponse
    try {
      parsed = (await resp.json()) as MasterProductsResponse
    } catch (e) {
      console.error('[master-products] response not JSON:', e)
      return []
    }

    if (!parsed.ok || !Array.isArray(parsed.data)) {
      console.error('[master-products] response not ok:', parsed.error)
      return []
    }

    return parsed.data
  } catch (err) {
    console.error('[master-products] fetch failed:', err)
    return []
  }
}
