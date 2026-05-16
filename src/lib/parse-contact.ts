// OCR 结果解析：从 OCR 的纯文本里提取联系人字段
// 输入：OCR 识别出的整段文字
// 输出：尽可能提取的客户字段

// 国家码 → 国家名（直接填具体国家名，country 字段已改为 datalist 可输入任意值）
// 按外贸常见客源/目的国排列，覆盖 95% 场景
const COUNTRY_CODE_MAP: Record<string, string> = {
  // 中东
  '971': '阿联酋', '966': '沙特阿拉伯', '965': '科威特', '974': '卡塔尔',
  '973': '巴林', '968': '阿曼', '962': '约旦', '964': '伊拉克',
  '961': '黎巴嫩', '963': '叙利亚', '967': '也门', '972': '以色列',
  '98':  '伊朗', '93':  '阿富汗', '90':  '土耳其',
  // 北非
  '20':  '埃及', '212': '摩洛哥', '213': '阿尔及利亚', '216': '突尼斯',
  '218': '利比亚', '249': '苏丹',
  // 东非 / 南部非洲
  '251': '埃塞俄比亚', '254': '肯尼亚', '255': '坦桑尼亚',
  '234': '尼日利亚', '27':  '南非',
  // 东南亚
  '60':  '马来西亚', '62':  '印度尼西亚', '63':  '菲律宾',
  '65':  '新加坡', '66':  '泰国', '84':  '越南',
  // 南亚
  '91':  '印度', '92':  '巴基斯坦', '880': '孟加拉国',
  // 欧洲
  '44':  '英国', '49':  '德国', '33':  '法国', '39':  '意大利',
  '34':  '西班牙', '31':  '荷兰', '7':   '俄罗斯',
  // 美洲
  '1':   '美国', '52':  '墨西哥', '55':  '巴西', '54':  '阿根廷',
  // 其他
  '61':  '澳大利亚', '86':  '中国',
}

export interface ParsedContact {
  contact_name?: string
  whatsapp?: string
  email?: string
  country?: string
  notes?: string
  source?: string
  raw_text: string
  // 调试信息：识别到哪些片段
  detected: {
    phone_country?: string
    wechat_id?: string
    app_type?: 'wechat' | 'whatsapp' | 'linkedin' | 'unknown'
  }
}

/**
 * 从 OCR 文本里解析联系人信息
 */
export function parseContactFromOCR(text: string): ParsedContact {
  const result: ParsedContact = {
    raw_text: text,
    detected: {},
  }
  const notesParts: string[] = []

  // ── 1. 识别 App 类型（看关键词） ──
  if (/weixin|wechat|微信/i.test(text)) {
    result.detected.app_type = 'wechat'
    result.source = '老客户介绍' // 微信加的多半是熟人介绍
  } else if (/whatsapp|contact info|disappearing messages/i.test(text)) {
    result.detected.app_type = 'whatsapp'
  } else if (/linkedin|linked.?in/i.test(text)) {
    result.detected.app_type = 'linkedin'
  } else {
    result.detected.app_type = 'unknown'
  }

  // ── 2. 提取电话号码（国际格式 +xxx 或 +xxx xxx xxxx）──
  // 匹配 +国家码 + 主号（允许空格、-、括号）
  const phoneRegex = /\+\s?(\d{1,3})[\s\-()]*(\d[\d\s\-()]{6,18}\d)/g
  const phones: { country_code: string; number: string }[] = []
  let phoneMatch
  while ((phoneMatch = phoneRegex.exec(text)) !== null) {
    const cc = phoneMatch[1]
    const num = phoneMatch[2].replace(/[\s\-()]/g, '')
    phones.push({ country_code: cc, number: num })
  }
  if (phones.length > 0) {
    const p = phones[0]
    result.whatsapp = '+' + p.country_code + p.number
    result.detected.phone_country = p.country_code
    // 国家码 → 国家（直接填具体国家名）
    if (COUNTRY_CODE_MAP[p.country_code]) {
      result.country = COUNTRY_CODE_MAP[p.country_code]
    }
  }

  // ── 3. 邮箱 ──
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/i)
  if (emailMatch) {
    result.email = emailMatch[0]
  }

  // ── 4. 微信 ID（wxid_xxx 或 Weixin ID: xxx）──
  // 不再写入备注，由前端填入独立的 wechat_id 字段
  const wxidMatch = text.match(/(?:wxid_[\w-]+|Weixin\s*ID[:\s]+([^\s\n]+)|微信号[:\s：]*([^\s\n]+))/i)
  if (wxidMatch) {
    const wxid = wxidMatch[0].includes('wxid_')
      ? text.match(/wxid_[\w-]+/i)?.[0] || ''
      : wxidMatch[1] || wxidMatch[2] || ''
    if (wxid) {
      result.detected.wechat_id = wxid
    }
  }

  // ── 5. 联系人姓名（基于锚点定位 + 启发式）──
  // UI 噪声词（包含匹配，整行小写 includes 任一则排除）
  const uiNoiseTerms = [
    'weixin id', 'wechat id', 'contact info', 'friend profile',
    'voice or video', 'voice call', 'video call', 'audio video',
    'messages', 'add notes', 'manage storage', 'media, links',
    'disappearing messages', 'chat theme', 'save to photos',
    'starred none', 'lists none', 'notifications', 'default',
    '语音通话', '视频通话', '消息', '编辑', '更多功能', '设置备注',
  ]
  // 乱码字符（含这些视为 UI 元素识别噪声）
  const garbageChars = /[<>《》©®™@]|^[©®™&|×x]\s|^[!?]+$/
  // 是否像有效姓名
  function looksLikeName(line: string): boolean {
    const l = line.trim()
    if (l.length < 2 || l.length > 40) return false
    // 含电话/邮箱/wxid 不行
    if (/wxid_|@[a-z]|http|\+\d/i.test(l)) return false
    // 含乱码
    if (garbageChars.test(l)) return false
    // 含 UI 噪声词
    const lower = l.toLowerCase()
    if (uiNoiseTerms.some(w => lower.includes(w))) return false
    // 纯数字/时间戳/容量
    if (/^\d+(:\d+)?$/.test(l)) return false
    if (/^\d+\s*(MB|KB|GB|TB)\b/i.test(l)) return false
    // 单字符或全标点
    if (l.length === 1) return false
    if (/^[\s.\-_·,，。]+$/.test(l)) return false
    // 必须含字母或中文
    if (!/[a-z一-鿿]/i.test(l)) return false
    return true
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  let nameFound = ''

  // 策略 A: WhatsApp - 找电话号码那行，往上找最近的姓名
  if (result.detected.app_type === 'whatsapp') {
    const phoneIdx = lines.findIndex(l => /\+\d{1,3}\s?\d/.test(l))
    if (phoneIdx > 0) {
      // 从电话上方往上找
      for (let i = phoneIdx - 1; i >= 0 && i >= phoneIdx - 4; i--) {
        if (looksLikeName(lines[i])) { nameFound = lines[i]; break }
      }
    }
  }

  // 策略 B: 微信 - 找 "Weixin ID" 那行，往上找最近的姓名
  if (!nameFound && result.detected.app_type === 'wechat') {
    const wxidIdx = lines.findIndex(l => /weixin\s*id|wxid_|微信号/i.test(l))
    if (wxidIdx > 0) {
      for (let i = wxidIdx - 1; i >= 0 && i >= wxidIdx - 4; i--) {
        if (looksLikeName(lines[i])) { nameFound = lines[i]; break }
      }
    }
  }

  // 策略 C: 通用兜底 - 前 6 行里找第一个像姓名的
  if (!nameFound) {
    for (const line of lines.slice(0, 6)) {
      if (looksLikeName(line)) { nameFound = line; break }
    }
  }

  if (nameFound) {
    result.contact_name = nameFound
  }

  // ── 6. 备注：仅记录来源（其它字段已结构化填入）──
  if (result.detected.app_type === 'wechat') {
    notesParts.unshift('来源: 微信添加')
  } else if (result.detected.app_type === 'whatsapp') {
    notesParts.unshift('来源: WhatsApp')
  } else if (result.detected.app_type === 'linkedin') {
    notesParts.unshift('来源: 领英')
  }

  if (notesParts.length > 0) {
    result.notes = notesParts.join('\n')
  }

  return result
}

// 给前端预览用：把解析结果转成"识别到了 N 个字段"的简短文案
export function summarizeParsedContact(p: ParsedContact): string {
  const fields: string[] = []
  if (p.contact_name) fields.push(`姓名: ${p.contact_name}`)
  if (p.whatsapp) fields.push(`WhatsApp: ${p.whatsapp}`)
  if (p.country) fields.push(`国家: ${p.country}`)
  if (p.email) fields.push(`邮箱: ${p.email}`)
  if (p.detected.wechat_id) fields.push(`微信ID: ${p.detected.wechat_id}`)
  return fields.length === 0
    ? '没有识别到结构化字段，请手动填写。'
    : `识别到 ${fields.length} 个字段：\n${fields.join('\n')}`
}
