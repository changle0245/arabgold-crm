// 聊天导出文件解析器：WhatsApp + 微信
// 设计原则：宽松匹配格式，跳过解析失败的行而不是整个失败

export interface ParsedMessage {
  sent_at: string                          // ISO 时间戳
  sender_name: string
  content: string
  direction: 'outgoing' | 'incoming'       // 我方/客户
  raw_meta?: Record<string, unknown>
}

export interface ParseResult {
  messages: ParsedMessage[]
  skipped: number
  warnings: string[]
}

function detectDirection(senderName: string, ourKeywords: string[]): 'outgoing' | 'incoming' {
  const s = senderName.toLowerCase().trim()
  for (const kw of ourKeywords) {
    const k = kw.trim().toLowerCase()
    if (k && s.includes(k)) return 'outgoing'
  }
  return 'incoming'
}

// 解析 YYYY/M/D 或 D/M/YYYY 或 YYYY-MM-DD 等日期 + HH:MM[:SS] [AM/PM] 时间
// 中文用户默认 YYYY/M/D；西方导出可能 D/M/YYYY 或 M/D/YYYY
function parseDateTime(dateStr: string, timeStr: string): Date | null {
  const dateMatch = dateStr.match(/^(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,4})$/)
  if (!dateMatch) return null
  const [, aStr, bStr, cStr] = dateMatch
  const a = parseInt(aStr), b = parseInt(bStr), c = parseInt(cStr)
  let year: number, month: number, day: number
  if (aStr.length === 4) {
    // YYYY/M/D
    year = a; month = b; day = c
  } else if (cStr.length === 4) {
    // D/M/YYYY（默认欧洲格式；若 a > 12，必为 D；若 b > 12，必为 M）
    year = c
    if (a > 12) { day = a; month = b }
    else if (b > 12) { month = a; day = b }
    else { day = a; month = b }  // 歧义时假设 D/M（更常见于中东外贸）
  } else {
    // 两位数年。与 4 位数年分支一致的 D/M vs M/D 启发式（fix #8）
    // 若 a > 12 必为 D，b > 12 必为 M；都 <=12 时默认 D/M（中东外贸更常见）
    year = c < 50 ? 2000 + c : 1900 + c
    if (a > 12) { day = a; month = b }
    else if (b > 12) { month = a; day = b }
    else { day = a; month = b }
  }
  // L6: 越界值防御(如 45/3/2024 → day=45)。new Date 对越界 ISO 串行为不一致,
  // 显式范围校验,越界即判解析失败、跳过该行。
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i)
  if (!timeMatch) return null
  let hh = parseInt(timeMatch[1])
  const mm = parseInt(timeMatch[2])
  const ss = timeMatch[3] ? parseInt(timeMatch[3]) : 0
  const ampm = timeMatch[4]?.toUpperCase()
  if (ampm === 'PM' && hh < 12) hh += 12
  if (ampm === 'AM' && hh === 12) hh = 0
  // 用 +08:00 显式时区构造 ISO，避免依赖 Node 进程时区（dev/prod 服务器时区可能不同）
  // 业务员视角：客户在中东（UTC+3~+4），但聊天导出是导出者本地时间，业务员在中国导出 → 按 +08:00 解
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hh)}:${pad(mm)}:${pad(ss)}+08:00`
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d
}

// ─────────────────────────────────────
// WhatsApp 解析
// 支持格式：
//   [2024/1/15, 14:32:01] Sender: msg          (iOS 中括号)
//   2024/1/15, 14:32 - Sender: msg              (Android 横杠)
//   2024/1/15 14:32 - Sender: msg               (Android 无逗号)
//   15/1/2024, 2:32 PM - Sender: msg            (英语 12 小时)
// 续行附加到当前消息
// 系统消息（如 "Messages and calls are end-to-end encrypted"）跳过
// ─────────────────────────────────────

// 一行消息开头：日期 + 时间 + 发送者 + 冒号
const WA_PATTERNS = [
  // iOS: [日期, 时间] 发送者: 内容
  /^\[(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\]\s+([^:]+?):\s?(.*)$/i,
  // Android: 日期, 时间 - 发送者: 内容
  /^(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\s+-\s+([^:]+?):\s?(.*)$/i,
]

// 跳过的系统消息片段（不区分大小写）
const WA_SYSTEM_HINTS = [
  'end-to-end encrypted',
  'messages and calls',
  'changed the group',
  'added',
  'removed',
  '加密',
  '群名',
  '添加了',
  '退出了',
]

function isWaSystem(content: string): boolean {
  const s = content.toLowerCase()
  return WA_SYSTEM_HINTS.some(hint => s.includes(hint.toLowerCase()))
}

export function parseWhatsAppChat(text: string, ourKeywords: string[] = []): ParseResult {
  const lines = text.split(/\r?\n/)
  const messages: ParsedMessage[] = []
  const warnings: string[] = []
  let skipped = 0
  let current: ParsedMessage | null = null

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line) continue

    let match: RegExpMatchArray | null = null
    for (const pat of WA_PATTERNS) {
      match = line.match(pat)
      if (match) break
    }

    if (match) {
      // 完成上一条
      if (current) messages.push(current)
      const [, dateStr, timeStr, sender, content] = match
      const dt = parseDateTime(dateStr, timeStr)
      if (!dt) {
        warnings.push(`无法解析时间: ${dateStr} ${timeStr}`)
        skipped++
        current = null
        continue
      }
      if (isWaSystem(content)) {
        skipped++
        current = null
        continue
      }
      current = {
        sent_at: dt.toISOString(),
        sender_name: sender.trim(),
        content: content.trim(),
        direction: detectDirection(sender, ourKeywords),
      }
    } else {
      // 续行。先做 isWaSystem 兜底过滤（fix #5）：
      // WhatsApp 真实导出里 "Messages and calls are end-to-end encrypted." 和
      // "~ X changed the group name to ..." 经常没有时间戳前缀，作为"续行"
      // 直接 append 进上一条消息正文会污染 timeline。
      if (isWaSystem(line)) {
        skipped++
        continue
      }
      if (current) current.content = current.content + '\n' + line
      else skipped++
    }
  }
  if (current) messages.push(current)

  return { messages, skipped, warnings }
}

// ─────────────────────────────────────
// 微信解析
// 主流导出格式（WeChatExporter / 留痕 / 手动整理）：
//   2024-01-15 14:32:01 发送者
//   内容（多行）
//
//   [2024-01-15 14:32:01] 发送者:
//   内容（多行）
//
//   2024-01-15 14:32 发送者: 单行内容          (手动整理简版)
// 不同消息之间通常有空行
// ─────────────────────────────────────

const WC_PATTERNS = [
  // 单行模式：日期 时间 发送者: 内容
  /^\[?(\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2})[\s\]]+(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+([^:\n]+?):\s+(.+)$/,
  // 两行模式：日期 时间 发送者（内容在下一行）
  /^\[?(\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2})[\s\]]+(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+([^:\n]+?):?$/,
]

export function parseWeChatChat(text: string, ourKeywords: string[] = []): ParseResult {
  const lines = text.split(/\r?\n/)
  const messages: ParsedMessage[] = []
  const warnings: string[] = []
  let skipped = 0
  let current: ParsedMessage | null = null

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line) {
      // 空行通常分隔消息
      if (current) { messages.push(current); current = null }
      continue
    }

    // 先试单行模式
    let inlineMatch = line.match(WC_PATTERNS[0])
    if (inlineMatch) {
      if (current) { messages.push(current); current = null }
      const [, dateStr, timeStr, sender, content] = inlineMatch
      const dt = parseDateTime(dateStr, timeStr)
      if (!dt) { skipped++; continue }
      messages.push({
        sent_at: dt.toISOString(),
        sender_name: sender.trim(),
        content: content.trim(),
        direction: detectDirection(sender, ourKeywords),
      })
      continue
    }

    // 再试两行模式
    const headerMatch = line.match(WC_PATTERNS[1])
    if (headerMatch) {
      if (current) { messages.push(current); current = null }
      const [, dateStr, timeStr, sender] = headerMatch
      const dt = parseDateTime(dateStr, timeStr)
      if (!dt) { skipped++; continue }
      current = {
        sent_at: dt.toISOString(),
        sender_name: sender.trim(),
        content: '',
        direction: detectDirection(sender, ourKeywords),
      }
      continue
    }

    // 续行（内容）。修 #5: 微信导出同样可能出现系统消息行（"加密"/"群名"/"添加了"等），
    // 续行 append 前先做 isWaSystem 兜底过滤（WA_SYSTEM_HINTS 含中文系统词，两个 channel 通用）。
    if (isWaSystem(line)) {
      skipped++
    } else if (current) {
      current.content = current.content ? current.content + '\n' + line : line
    } else {
      skipped++
    }
  }
  if (current) messages.push(current)

  // 去掉 content 全空的消息
  const filtered = messages.filter(m => m.content.trim().length > 0)
  return { messages: filtered, skipped: skipped + (messages.length - filtered.length), warnings }
}

// 入口：按 channel 分发
export function parseChat(
  channel: 'whatsapp' | 'wechat',
  text: string,
  ourKeywords: string[] = []
): ParseResult {
  if (channel === 'whatsapp') return parseWhatsAppChat(text, ourKeywords)
  if (channel === 'wechat') return parseWeChatChat(text, ourKeywords)
  return { messages: [], skipped: 0, warnings: [`未知渠道: ${channel}`] }
}
