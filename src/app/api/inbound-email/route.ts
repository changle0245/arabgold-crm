import { NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTranslator } from '@/lib/translator'

// 接 SendGrid Inbound Parse / Mailgun Routes 的 webhook（multipart/form-data）
//
// 鉴权：URL 加 ?token=xxx，token 配在 .env.local 的 INBOUND_EMAIL_TOKEN
//
// 字段映射（兼容两个 provider）：
//   from       (SG)  / sender         (MG)  → 发件人
//   to         (SG)  / recipient      (MG)  → 收件人（业务员转发地址）
//   subject    (两边一样)
//   text       (SG)  / body-plain     (MG)  → 纯文本正文
//   html       (SG)  / body-html      (MG)  → HTML 正文
//   Message-Id (SG)  / message-id     (MG)
//   attachments(SG, 数字) / attachment-count (MG)
//   attachment{N}(SG) / attachment-{N}(MG)  → 附件 File
//
// 归档逻辑：
//   1. 解析 to 邮箱 local part → 找业务员（profiles.mail_alias）
//   2. 解析 from 邮箱 → 找客户（customers.email）
//   3. 找到 customer → 进 communication_logs（自动翻译）
//   4. 找不到 customer → 进 inbound_email_queue（pending，业务员手工归并）

export const runtime = 'nodejs'
export const maxDuration = 60

function parseEmailAddress(raw: string): { email: string; name: string | null } {
  const trimmed = raw.trim()
  const lt = trimmed.indexOf('<')
  const gt = trimmed.lastIndexOf('>')
  if (lt > -1 && gt > lt) {
    // "Name" <email>  或  Name <email>  或  <email>
    const email = trimmed.substring(lt + 1, gt).trim().toLowerCase()
    const name = trimmed.substring(0, lt).trim().replace(/^["']|["']$/g, '').trim()
    return { email, name: name || null }
  }
  // 直接邮箱（无 <>）
  return { email: trimmed.toLowerCase(), name: null }
}

function extractLocalPart(emailStr: string): string {
  const at = emailStr.indexOf('@')
  return at > 0 ? emailStr.substring(0, at).toLowerCase() : emailStr.toLowerCase()
}

// H5: 常量时间比较 webhook token —— 先各自 SHA-256 到定长再 timingSafeEqual,
// 既不泄露长度也不泄露内容。完整加固还应校验邮件服务商的 HMAC 签名(需各服务商
// 的签名密钥,按服务商而定,未在此实现)。
function safeTokenEqual(provided: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(provided).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.INBOUND_EMAIL_TOKEN
  if (!expectedToken) {
    return Response.json({ error: 'INBOUND_EMAIL_TOKEN not configured on server' }, { status: 500 })
  }
  // H5: 优先从请求头取 token(不会进 URL / 访问日志 / Referer);仍兼容 ?token=
  // 查询参数(SendGrid Inbound Parse 等无法自定义请求头的服务商)。
  const token =
    request.headers.get('x-inbound-token') ||
    request.nextUrl.searchParams.get('token') ||
    ''
  if (!safeTokenEqual(token, expectedToken)) {
    return Response.json({ error: 'Invalid token' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const fromRaw = ((form.get('from') || form.get('sender') || '') as string).trim()
  const toRaw = ((form.get('to') || form.get('recipient') || '') as string).trim()
  const subject = ((form.get('subject') || '') as string).trim()
  const textBody = ((form.get('text') || form.get('body-plain') || '') as string).trim()
  const htmlBody = ((form.get('html') || form.get('body-html') || '') as string).trim()
  const messageId = ((form.get('Message-Id') || form.get('message-id') || form.get('Message-ID') || '') as string).trim()

  if (!fromRaw) return Response.json({ error: 'Missing from/sender' }, { status: 400 })
  if (!toRaw) return Response.json({ error: 'Missing to/recipient' }, { status: 400 })

  const { email: fromEmail, name: fromName } = parseEmailAddress(fromRaw)
  const { email: toEmail } = parseEmailAddress(toRaw)
  if (!fromEmail || !toEmail) {
    return Response.json({ error: 'Could not parse email addresses' }, { status: 400 })
  }

  const toAlias = extractLocalPart(toEmail)
  const adminClient = createAdminClient()

  // 找 recipient member by mail_alias
  const { data: member } = await adminClient
    .from('profiles')
    .select('id, full_name')
    .eq('mail_alias', toAlias)
    .maybeSingle()
  const recipientMemberId = member?.id || null

  // 附件
  const attachmentTotal = Math.max(
    parseInt(((form.get('attachments') || '0') as string), 10) || 0,
    parseInt(((form.get('attachment-count') || '0') as string), 10) || 0,
  )
  const attachments: { name: string; url: string; size: number; type: string }[] = []
  for (let i = 1; i <= attachmentTotal; i++) {
    const file = (form.get(`attachment${i}`) || form.get(`attachment-${i}`)) as File | null
    if (!(file instanceof File) || file.size === 0) continue
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `inbound/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`
      const { data: upData, error: upErr } = await adminClient.storage
        .from('communication-files')
        .upload(filePath, await file.arrayBuffer(), {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })
      if (!upErr && upData) {
        // M9: 桶已私有 —— 存 path,展示时经 /api/communication-files 代理签 URL
        attachments.push({
          name: file.name,
          url: upData.path,
          size: file.size,
          type: file.type,
        })
      }
    } catch { /* skip */ }
  }

  // 按 from email 找客户（如有 recipient_member，优先该 member 名下的）
  let customerId: string | null = null
  if (fromEmail) {
    const { data: candidates } = await adminClient
      .from('customers')
      .select('id, owner_id')
      .eq('email', fromEmail)
    if (candidates && candidates.length > 0) {
      if (recipientMemberId) {
        const mine = candidates.find(c => c.owner_id === recipientMemberId)
        customerId = (mine || candidates[0]).id
      } else {
        customerId = candidates[0].id
      }
    }
  }

  const content = textBody || htmlBody  // 兜底：纯文本为空时存 HTML

  if (customerId) {
    // 自动归档：进 communication_logs
    let translated: string | null = null
    try {
      const t = getTranslator()
      const toTranslate = subject ? `${subject}\n\n${content}` : content
      translated = await t.translate(toTranslate)
    } catch { /* stub 模式直接返 null，不影响 */ }

    const { error: insertErr } = await adminClient.from('communication_logs').insert({
      customer_id: customerId,
      channel: 'email',
      direction: 'incoming',
      sender_name: fromName || fromEmail,
      content,
      translated_content: translated,
      sent_at: new Date().toISOString(),
      raw_meta: {
        subject: subject || null,
        from_email: fromEmail,
        to_email: toEmail,
        message_id: messageId || null,
        html: htmlBody || null,
        attachments,
      },
      original_file_url: attachments[0]?.url || null,
      created_by: recipientMemberId,
    })
    if (insertErr) {
      return Response.json({ error: 'Failed to insert: ' + insertErr.message }, { status: 500 })
    }
    return Response.json({ success: true, matched: true, customer_id: customerId })
  } else {
    // 没匹配 → 待归档队列
    const { error: queueErr } = await adminClient.from('inbound_email_queue').insert({
      to_alias: toAlias,
      to_email: toEmail,
      recipient_member: recipientMemberId,
      from_email: fromEmail,
      from_name: fromName,
      subject: subject || null,
      content,
      raw_meta: {
        message_id: messageId || null,
        html: htmlBody || null,
      },
      attachments,
      status: 'pending',
    })
    if (queueErr) {
      return Response.json({ error: 'Failed to enqueue: ' + queueErr.message }, { status: 500 })
    }
    return Response.json({ success: true, matched: false, queued: true })
  }
}
