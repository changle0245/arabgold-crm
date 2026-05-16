// 用截图实际的 OCR 原文测试 parseContactFromOCR
// 用法: node scripts/test-parser.mjs

// 临时 import TS 文件 - 需要把核心逻辑复制过来或用 tsx 跑
// 简单做法：复制核心代码到这里跑

const COUNTRY_CODE_MAP = {
  '971': '阿联酋', '966': '沙特阿拉伯', '965': '科威特', '974': '卡塔尔',
  '973': '巴林', '968': '阿曼', '962': '约旦', '964': '伊拉克',
  '961': '黎巴嫩', '963': '叙利亚', '967': '也门', '972': '以色列',
  '98': '伊朗', '93': '阿富汗', '90': '土耳其',
  '20': '埃及', '212': '摩洛哥', '213': '阿尔及利亚', '216': '突尼斯',
  '218': '利比亚', '249': '苏丹',
  '251': '埃塞俄比亚', '254': '肯尼亚', '255': '坦桑尼亚',
  '234': '尼日利亚', '27': '南非',
  '60': '马来西亚', '62': '印度尼西亚', '63': '菲律宾',
  '65': '新加坡', '66': '泰国', '84': '越南',
  '91': '印度', '92': '巴基斯坦', '880': '孟加拉国',
  '44': '英国', '49': '德国', '33': '法国', '39': '意大利',
  '34': '西班牙', '31': '荷兰', '7': '俄罗斯',
  '1': '美国', '52': '墨西哥', '55': '巴西', '54': '阿根廷',
  '61': '澳大利亚', '86': '中国',
}

function parseContactFromOCR(text) {
  const result = { raw_text: text, detected: {} }
  const notesParts = []

  if (/weixin|wechat|微信/i.test(text)) {
    result.detected.app_type = 'wechat'
    result.source = '老客户介绍'
  } else if (/whatsapp|contact info|disappearing messages/i.test(text)) {
    result.detected.app_type = 'whatsapp'
  } else if (/linkedin|linked.?in/i.test(text)) {
    result.detected.app_type = 'linkedin'
  } else {
    result.detected.app_type = 'unknown'
  }

  const phoneRegex = /\+\s?(\d{1,3})[\s\-()]*(\d[\d\s\-()]{6,18}\d)/g
  const phones = []
  let m
  while ((m = phoneRegex.exec(text)) !== null) {
    phones.push({ country_code: m[1], number: m[2].replace(/[\s\-()]/g, '') })
  }
  if (phones.length > 0) {
    const p = phones[0]
    result.whatsapp = '+' + p.country_code + p.number
    result.detected.phone_country = p.country_code
    if (COUNTRY_CODE_MAP[p.country_code]) {
      result.country = COUNTRY_CODE_MAP[p.country_code]
    }
  }

  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/i)
  if (emailMatch) result.email = emailMatch[0]

  const wxidMatch = text.match(/(?:wxid_[\w-]+|Weixin\s*ID[:\s]+([^\s\n]+)|微信号[:\s：]*([^\s\n]+))/i)
  if (wxidMatch) {
    const wxid = wxidMatch[0].includes('wxid_')
      ? text.match(/wxid_[\w-]+/i)?.[0] || ''
      : wxidMatch[1] || wxidMatch[2] || ''
    if (wxid) {
      result.detected.wechat_id = wxid
      notesParts.push(`微信ID: ${wxid}`)
    }
  }

  // ── 5. 姓名 - 锚点 + 启发式 ──
  const uiNoiseTerms = [
    'weixin id', 'wechat id', 'contact info', 'friend profile',
    'voice or video', 'voice call', 'video call', 'audio video',
    'messages', 'add notes', 'manage storage', 'media, links',
    'disappearing messages', 'chat theme', 'save to photos',
    'starred none', 'lists none', 'notifications', 'default',
    '语音通话', '视频通话', '消息', '编辑', '更多功能', '设置备注',
  ]
  const garbageChars = /[<>《》©®™@]|^[©®™&|×x]\s|^[!?]+$/
  function looksLikeName(line) {
    const l = line.trim()
    if (l.length < 2 || l.length > 40) return false
    if (/wxid_|@[a-z]|http|\+\d/i.test(l)) return false
    if (garbageChars.test(l)) return false
    const lower = l.toLowerCase()
    if (uiNoiseTerms.some(w => lower.includes(w))) return false
    if (/^\d+(:\d+)?$/.test(l)) return false
    if (/^\d+\s*(MB|KB|GB|TB)\b/i.test(l)) return false
    if (l.length === 1) return false
    if (/^[\s.\-_·,，。]+$/.test(l)) return false
    if (!/[a-z一-鿿]/i.test(l)) return false
    return true
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let nameFound = ''

  if (result.detected.app_type === 'whatsapp') {
    const phoneIdx = lines.findIndex(l => /\+\d{1,3}\s?\d/.test(l))
    if (phoneIdx > 0) {
      for (let i = phoneIdx - 1; i >= 0 && i >= phoneIdx - 4; i--) {
        if (looksLikeName(lines[i])) { nameFound = lines[i]; break }
      }
    }
  }
  if (!nameFound && result.detected.app_type === 'wechat') {
    const wxidIdx = lines.findIndex(l => /weixin\s*id|wxid_|微信号/i.test(l))
    if (wxidIdx > 0) {
      for (let i = wxidIdx - 1; i >= 0 && i >= wxidIdx - 4; i--) {
        if (looksLikeName(lines[i])) { nameFound = lines[i]; break }
      }
    }
  }
  if (!nameFound) {
    for (const line of lines.slice(0, 6)) {
      if (looksLikeName(line)) { nameFound = line; break }
    }
  }
  if (nameFound) result.contact_name = nameFound

  if (result.detected.app_type === 'wechat') notesParts.unshift('来源: 微信添加')
  else if (result.detected.app_type === 'whatsapp') {
    notesParts.unshift('来源: WhatsApp')
  }
  if (notesParts.length > 0) result.notes = notesParts.join('\n')

  return result
}

// ────────────────────────────────────────
// 测试 1: 微信截图（Abdullahi Musa）
// ────────────────────────────────────────
const ocr1 = `Abdullahi Musa

Weixin ID: wxid_r1n7j45uzexb12
Friend i
Profile

© Messages
QZ Voice or Video Call`

// ────────────────────────────────────────
// 测试 2: WhatsApp 截图（埃塞俄比亚 Huzeyfa）
// ────────────────────────────────────────
const ocr2 = `a
-5 埃塞俄比亚  Huzeyfa
+25194 988 6075
& x Q
Audio Video Search
Add notes
® Lists None
a) Media, links and docs 303
& Manage storage 145.5 MB
Sw Starred None
Notifications
Chat theme
Save to Photos Default
Disappearing messages Off`

console.log('═══════════════════════════════════════')
console.log('  测试 1: 微信截图 Abdullahi Musa')
console.log('═══════════════════════════════════════')
const r1 = parseContactFromOCR(ocr1)
console.log('姓名:    ', r1.contact_name || '❌ 未识别')
console.log('WhatsApp:', r1.whatsapp || '—')
console.log('国家:    ', r1.country || '—')
console.log('微信ID:  ', r1.detected.wechat_id || '—')
console.log('App:     ', r1.detected.app_type)
console.log('备注:\n' + (r1.notes || '—'))
console.log('期望姓名: Abdullahi Musa', r1.contact_name === 'Abdullahi Musa' ? '✅' : '❌')

console.log('\n═══════════════════════════════════════')
console.log('  测试 2: WhatsApp 截图 Huzeyfa')
console.log('═══════════════════════════════════════')
const r2 = parseContactFromOCR(ocr2)
console.log('姓名:    ', r2.contact_name || '❌ 未识别')
console.log('WhatsApp:', r2.whatsapp || '—')
console.log('国家:    ', r2.country || '—')
console.log('App:     ', r2.detected.app_type)
console.log('备注:\n' + (r2.notes || '—'))
console.log('期望姓名包含 Huzeyfa:', r2.contact_name?.includes('Huzeyfa') ? '✅' : '❌')
console.log('期望 WhatsApp 含 251:', r2.whatsapp?.includes('251') ? '✅' : '❌')
