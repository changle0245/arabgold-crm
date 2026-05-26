import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { getTranslator } from '@/lib/translator'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: '未登录' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()
  if (!profile || profile.is_active === false) {
    return Response.json({ error: '账号已停用' }, { status: 403 })
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, owner_id, contact_name')
    .eq('id', customerId)
    .single()
  if (!customer) return Response.json({ error: '客户不存在' }, { status: 404 })
  const canAccess = profile.role === 'admin' || customer.owner_id === user.id
  if (!canAccess) return Response.json({ error: '无权访问该客户' }, { status: 403 })

  const form = await request.formData().catch(() => null)
  if (!form) return Response.json({ error: '请求格式错误' }, { status: 400 })

  const direction = form.get('direction') as string | null
  const subject = ((form.get('subject') as string) || '').trim()
  const content = ((form.get('content') as string) || '').trim()
  const sentAt = (form.get('sentAt') as string) || ''
  const attachments = form.getAll('attachments') as File[]

  if (direction !== 'outgoing' && direction !== 'incoming') {
    return Response.json({ error: 'direction 必须是 outgoing 或 incoming' }, { status: 400 })
  }
  if (!content) return Response.json({ error: '邮件正文必填' }, { status: 400 })
  if (!sentAt) return Response.json({ error: '邮件时间必填' }, { status: 400 })
  const sentAtDate = new Date(sentAt)
  if (isNaN(sentAtDate.getTime())) return Response.json({ error: '邮件时间格式错误' }, { status: 400 })
  // L3: 不接受未来时间(留 5 分钟时钟偏差余量),避免伪造或误填的沟通时间线
  if (sentAtDate.getTime() > Date.now() + 5 * 60 * 1000) {
    return Response.json({ error: '邮件时间不能晚于当前时间' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // 附件上传到 Storage（每个独立处理，单个失败不影响整体）
  const uploadedAttachments: { name: string; url: string; size: number; type: string }[] = []
  for (const file of attachments) {
    if (!(file instanceof File) || file.size === 0) continue
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${customerId}/email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`
      const buffer = await file.arrayBuffer()
      const { data: uploadData, error: upErr } = await adminClient.storage
        .from('communication-files')
        .upload(filePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })
      if (!upErr && uploadData) {
        // M9: 桶已私有 —— 存 path,展示时经 /api/communication-files 代理签 URL
        uploadedAttachments.push({
          name: file.name,
          url: uploadData.path,
          size: file.size,
          type: file.type,
        })
      }
    } catch { /* skip failed attachments */ }
  }

  const senderName = direction === 'outgoing' ? '我方' : (customer.contact_name || '客户')

  // 自动翻译（subject + content 拼接后翻译；stub 模式返回 null 不影响）
  let translated: string | null = null
  try {
    const t = getTranslator()
    const textToTranslate = subject ? `${subject}\n\n${content}` : content
    translated = await t.translate(textToTranslate)
  } catch { /* 翻译失败不阻塞 */ }

  const { data: inserted, error: insertErr } = await adminClient
    .from('communication_logs')
    .insert({
      customer_id: customerId,
      channel: 'email',
      direction,
      sender_name: senderName,
      content,
      translated_content: translated,
      sent_at: sentAtDate.toISOString(),
      raw_meta: {
        subject: subject || null,
        attachments: uploadedAttachments,
      },
      original_file_url: uploadedAttachments[0]?.url || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (insertErr) return Response.json({ error: '保存失败: ' + insertErr.message }, { status: 500 })

  return Response.json({
    success: true,
    log: inserted,
    attachmentCount: uploadedAttachments.length,
    translated: translated !== null,
  })
}
