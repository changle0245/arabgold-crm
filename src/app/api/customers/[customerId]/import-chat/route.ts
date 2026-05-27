import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { parseChat } from '@/lib/parsers'
import { translateBatch } from '@/lib/translator'
import { requireUser } from '@/lib/auth-helpers'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user

  const adminClient = createAdminClient()

  const { data: customer } = await adminClient
    .from<{ id: string; owner_id: string; contact_name: string }>('customers')
    .select('id, owner_id, contact_name')
    .eq('id', customerId)
    .single()
  if (!customer) return Response.json({ error: '客户不存在' }, { status: 404 })
  const canAccess = user.role === 'admin' || customer.owner_id === user.id
  if (!canAccess) return Response.json({ error: '无权访问该客户' }, { status: 403 })

  const form = await request.formData().catch(() => null)
  if (!form) return Response.json({ error: '请求格式错误' }, { status: 400 })

  const file = form.get('file') as File | null
  const channel = form.get('channel') as string | null
  const ourKeywordsRaw = (form.get('ourKeywords') as string) || (form.get('keywords') as string) || ''

  if (!file) return Response.json({ error: '缺少文件' }, { status: 400 })
  if (channel !== 'whatsapp' && channel !== 'wechat') {
    return Response.json({ error: 'channel 必须是 whatsapp 或 wechat' }, { status: 400 })
  }

  let text: string
  try {
    text = await file.text()
  } catch {
    return Response.json({ error: '读取文件失败(请确保是 UTF-8 编码的 .txt)' }, { status: 400 })
  }

  const ourKeywords = ourKeywordsRaw
    .split(/[,,;;]/)
    .map(s => s.trim())
    .filter(Boolean)

  const result = parseChat(channel, text, ourKeywords)

  if (result.messages.length === 0) {
    return Response.json({
      error: '未解析到任何消息,请检查文件格式或参考示例',
      skipped: result.skipped,
      warnings: result.warnings,
    }, { status: 400 })
  }

  let originalFileUrl: string | null = null
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${customerId}/${channel}_${Date.now()}_${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { data: uploadData, error: upErr } = await adminClient.storage
      .from('communication-files')
      .upload(filePath, buffer, {
        contentType: 'text/plain;charset=utf-8',
        upsert: false,
      })
    if (!upErr && uploadData) {
      originalFileUrl = uploadData.path
    }
  } catch {
    result.warnings.push('原始文件上传失败,消息已入库但无法回溯原文件')
  }

  let translations: (string | null)[]
  try {
    translations = await translateBatch(result.messages.map(m => m.content))
  } catch {
    translations = result.messages.map(() => null)
    result.warnings.push('自动翻译失败,可在时间线手工添加译文')
  }

  const rows = result.messages.map((m, i) => ({
    customer_id: customerId,
    channel,
    direction: m.direction,
    sender_name: m.sender_name,
    content: m.content,
    translated_content: translations[i],
    sent_at: m.sent_at,
    raw_meta: m.raw_meta || null,
    original_file_url: originalFileUrl,
    created_by: user.id,
  }))

  const { error: insertErr } = await adminClient.from('communication_logs').insert(rows)
  if (insertErr) {
    return Response.json({ error: '保存消息失败: ' + insertErr.message }, { status: 500 })
  }

  const translatedCount = translations.filter(t => t !== null).length

  return Response.json({
    success: true,
    imported: result.messages.length,
    translated: translatedCount,
    skipped: result.skipped,
    warnings: result.warnings,
    channel,
  })
}
