// Phase 5C · CRM 内部 proxy → 中台 master_products 读 API
// ----------------------------------------------------------------
// 客户端(quotation form 产品选择器)走这个 proxy,而不是直连中台 —
// 1) 鉴权用 NextAuth session(避免在浏览器侧暴露 MASTER_PRODUCTS_READ_TOKEN)
// 2) 隔离边界,后续要加缓存/审计/降级都在此处加
// 3) 中台 endpoint URL 变更时只需要改一处
// ----------------------------------------------------------------

import { type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth-helpers'
import { fetchMasterProducts } from '@/lib/master-products-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }

  const sp = request.nextUrl.searchParams
  const search = (sp.get('search') ?? '').trim()

  const products = await fetchMasterProducts(search || undefined)
  return Response.json({ ok: true, data: products })
}
