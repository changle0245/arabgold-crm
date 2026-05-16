// 联系方式重号检查 - 通用接口
// GET /api/check-contact?field=whatsapp&value=+971...&exclude=<customer_id>
// 支持的 field: whatsapp, phone, wechat_id, email
// 返回: { exists, customer_name, owner_name, matched_field, matched_value }

import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

const ALLOWED_FIELDS = ['whatsapp', 'phone', 'wechat_id', 'email'] as const
type Field = typeof ALLOWED_FIELDS[number]

// 电话类字段归一化：去掉空格、横线、括号、加号（仅用于比较，不改原值）
function normalizePhone(v: string): string {
  return v.replace(/[\s\-()+]/g, '')
}

export async function GET(request: NextRequest) {
  const field = request.nextUrl.searchParams.get('field') as Field | null
  const value = request.nextUrl.searchParams.get('value')
  const excludeId = request.nextUrl.searchParams.get('exclude')

  if (!field || !ALLOWED_FIELDS.includes(field)) {
    return Response.json({ error: '不支持的字段' }, { status: 400 })
  }
  if (!value || value.trim().length < 3) {
    return Response.json({ exists: false })
  }

  const supabase = await createClient()
  const trimmed = value.trim()
  const isPhoneField = field === 'whatsapp' || field === 'phone'
  const isEmailField = field === 'email'

  // 拉同字段非空的所有客户 → 在内存里做归一化/不区分大小写比较
  // （现实库就是 5-500 个客户，全表扫问题不大；超大规模再用 SQL function 优化）
  let query = supabase
    .from('customers')
    .select(`id, contact_name, whatsapp, phone, wechat_id, email, owner:profiles!customers_owner_id_fkey(full_name)`)
    .not(field, 'is', null)
  if (excludeId) query = query.neq('id', excludeId)

  const { data } = await query
  if (!data) return Response.json({ exists: false })

  // 找匹配
  const targetNorm = isPhoneField ? normalizePhone(trimmed) : isEmailField ? trimmed.toLowerCase() : trimmed
  let matched: any = null
  for (const c of data) {
    const cv = (c as any)[field]
    if (!cv) continue
    const cvNorm = isPhoneField ? normalizePhone(cv) : isEmailField ? cv.toLowerCase() : cv
    if (cvNorm === targetNorm) {
      matched = c
      break
    }
  }

  if (matched) {
    return Response.json({
      exists: true,
      customer_name: matched.contact_name,
      owner_name: matched.owner?.full_name || '未知业务员',
      matched_field: field,
      matched_value: matched[field],
    })
  }
  return Response.json({ exists: false })
}
