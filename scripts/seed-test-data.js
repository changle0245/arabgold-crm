// scripts/seed-test-data.js
//
// 大规模压测数据灌库 —— 仅本地测试库。
// 灌:customers (100) + contact_logs + quotations + quotation_items
//     + deals + deal_items + samples (七张表)。
// 不灌:reminders / stage_changes（由触发器/cron 自动生成）。
//
// 重复运行前请先清空上述七张表（reminders 跟 stage_changes 会随之级联/留作
// 触发器再生）。本脚本 NOT idempotent，自身不做清空，失败时不回滚，
// 原样停在出错处，等人决定。
//
// 用法:  node scripts/seed-test-data.js
//
// 详见任务描述（步骤 2）。

const fs = require('fs')
const path = require('path')

// ──────────────────────────────────────────────────────────
// 1) 加载 .env.local
// ──────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const t = line.trim()
  if (!t || t.startsWith('#')) return
  const i = t.indexOf('=')
  if (i === -1) return
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[t.slice(0, i).trim()] = v
})

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const H = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
}

async function api(p, method = 'GET', body) {
  const opts = { method, headers: { ...H, Prefer: 'return=representation' } }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${SUPABASE_URL}${p}`, opts)
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`${method} ${p}: ${res.status} ${txt}`)
  }
  const ct = res.headers.get('content-type') || ''
  return ct.includes('json') ? res.json() : res.text()
}

// ──────────────────────────────────────────────────────────
// 2) 确定性伪随机 (Mulberry32)，便于复现
// ──────────────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    let t = (seed = (seed + 0x6D2B79F5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(424242)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min
const randAmount = (min, max) => Math.round((rand() * (max - min) + min) * 100) / 100
const pickInRange = (min, max) => (max < min ? min : randInt(min, max))

// ──────────────────────────────────────────────────────────
// 3) 真实枚举值 —— 全部从 src/lib/constants.ts 抄过来，
//    DB CHECK 约束也跟这个一致。
// ──────────────────────────────────────────────────────────
const STAGES = ['待定', '新接触', '报价中', '已寄样', '已成交', '沉默']
const LEVELS = ['L1', 'L2', 'L3', '待定']
const SOURCES = [
  '阿里巴巴', 'Made-in-China', '环球资源', '中国制造网',
  'TikTok', 'Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'WhatsApp Group',
  '抖音', '小红书', '视频号',
  'Google SEO', 'Google Ads', 'Bing 搜索',
  '展会', '客户拜访', '老客户介绍', '同行介绍',
  '海关数据', '主动开发邮件', '电话开发',
  '网站询盘', '邮件营销',
  '海外代理', '老客户复购', '其他',
]
const PRODUCT_CATEGORIES = ['香炉', '镀金托盘', '礼品套装', '其他']
const PAYMENT_PREFERENCES = ['TT', '信用证LC', '部分预付', 'D/P', 'D/A', '其他']
const CONTACT_TAGS = ['已报价', '已寄样', '客户砍价', '暂无回应', '已成交', '其他']
const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'DAP', 'DDP', 'FAS', 'CIP', 'CPT', '其他']
const PURCHASE_FREQUENCIES = ['每周', '每月', '每季度', '每半年', '每年', '不定期', '一次性']
const DECISION_ROLES = ['决策人', '影响者', '使用者', '采购员', '中间商', '不确定']
const INDUSTRIES = ['零售', '批发', '电商', '酒店餐饮', '装修家居', '礼品分销', '宗教用品', '工艺品店', '免税店', '其他']
const COMPANY_SIZES = ['1-10人', '11-50人', '51-200人', '201-500人', '500+', '不确定']
const GENDERS = ['男', '女', '不便提供']
const CURRENCIES = ['USD', 'EUR', 'AED', 'SAR', 'CNY', 'GBP', 'JPY', 'AUD', '其他']
const QUOTATION_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired']
const DEAL_STATUSES = ['pending', 'in_production', 'shipped', 'completed', 'cancelled']
const SAMPLE_STATUSES = ['pending', 'sent', 'received', 'feedback_received']
const CARRIERS = ['DHL', 'FedEx', 'UPS', 'TNT', 'EMS', '顺丰', '圆通', '中通', '其他']
const CONTACT_TITLES = [
  'CEO/总经理', 'Owner/老板', '采购经理', '采购专员', '总监',
  '业务经理', '财务', '物流', '设计师', '中间商', '代理',
]

// ──────────────────────────────────────────────────────────
// 4) 国家池 100 个（沙特/UAE/科威特/卡塔尔/埃及为主，少量其他海湾）
// ──────────────────────────────────────────────────────────
const COUNTRY_POOL = [
  ...Array(18).fill('沙特阿拉伯'),
  ...Array(17).fill('阿联酋'),
  ...Array(15).fill('科威特'),
  ...Array(15).fill('卡塔尔'),
  ...Array(15).fill('埃及'),
  ...Array(5).fill('巴林'),
  ...Array(5).fill('阿曼'),
  ...Array(4).fill('约旦'),
  ...Array(3).fill('伊拉克'),
  ...Array(3).fill('黎巴嫩'),
] // total = 100

// 名字/公司池（够 100 个唯一组合即可）
const ARAB_FIRST = [
  'Ahmed', 'Mohammed', 'Ali', 'Omar', 'Hassan', 'Hussein', 'Khalid', 'Saeed',
  'Faisal', 'Yusuf', 'Ibrahim', 'Abdullah', 'Salem', 'Tariq', 'Mahmoud', 'Karim',
  'Rashid', 'Saleh', 'Sami', 'Nasser', 'Bilal', 'Marwan', 'Ziad', 'Walid',
  'Fatima', 'Aisha', 'Maryam', 'Layla', 'Noor', 'Sara', 'Zainab', 'Huda',
  'Salma', 'Yasmin', 'Amira', 'Reem',
]
const ARAB_LAST = [
  'Al-Mansoori', 'Al-Saud', 'Al-Kuwaiti', 'Al-Doha', 'El-Masry', 'Al-Otaibi',
  'Al-Rashid', 'Al-Hashemi', 'Al-Maktoum', 'Al-Nahyan', 'Al-Thani', 'Al-Sabah',
  'Al-Khalifa', 'Al-Said', 'El-Sayed', 'Al-Bahrani', 'Al-Mutairi', 'Al-Qassimi',
  'Al-Suwaidi', 'Al-Hammadi', 'Al-Zahrani', 'Al-Ghamdi', 'Al-Harbi', 'Al-Dosari',
  'Al-Marri', 'Al-Kuwari', 'Al-Attiyah', 'El-Shafei', 'El-Banna', 'Mansour',
]
const COMPANY_SUFFIX = [
  'Trading LLC', 'International', 'Group', 'Co.', 'Industries', 'Exports',
  'Heritage Crafts', 'Premium Trading', 'Royal Gifts', 'Hospitality Group',
  'Souk', 'Bazaar', 'Imports', 'Holdings',
]
const COMPANY_PREFIX_BY_CTY = {
  '沙特阿拉伯': ['Riyadh', 'Jeddah', 'Mecca', 'Dammam', 'Medina', 'Khobar'],
  '阿联酋':     ['Dubai', 'Abu Dhabi', 'Sharjah', 'Al Madar', 'Emirates', 'Gulf Bridge'],
  '科威特':     ['Kuwait City', 'Hawally', 'Salmiya', 'KPT', 'Al Salam'],
  '卡塔尔':     ['Doha', 'Lusail', 'Al Wakrah', 'Al Khor', 'Qatar Bay'],
  '埃及':       ['Cairo', 'Alexandria', 'Giza', 'Luxor', 'Nile'],
  '巴林':       ['Manama', 'Riffa', 'Muharraq'],
  '阿曼':       ['Muscat', 'Salalah', 'Sohar'],
  '约旦':       ['Amman', 'Aqaba', 'Zarqa'],
  '伊拉克':     ['Baghdad', 'Basra', 'Erbil'],
  '黎巴嫩':     ['Beirut', 'Tripoli', 'Sidon'],
}
const PHONE_PREFIX_BY_CTY = {
  '沙特阿拉伯': '+9665',
  '阿联酋':     '+9715',
  '科威特':     '+9659',
  '卡塔尔':     '+97455',
  '埃及':       '+201',
  '巴林':       '+9733',
  '阿曼':       '+9689',
  '约旦':       '+9627',
  '伊拉克':     '+9647',
  '黎巴嫩':     '+9613',
}

function genFullName() {
  return `${pick(ARAB_FIRST)} ${pick(ARAB_LAST)}`
}
function genCompany(country) {
  const prefixes = COMPANY_PREFIX_BY_CTY[country] || ['Gulf']
  return `${pick(prefixes)} ${pick(COMPANY_SUFFIX)}`
}
function genWhatsapp(country, salt) {
  // 加 salt(全局序号) 防同号
  const prefix = PHONE_PREFIX_BY_CTY[country] || '+9715'
  const tail = String(1000000 + salt) + String(randInt(10, 99))
  return prefix + tail
}
function genEmail(fullName, salt) {
  const slug = fullName.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.+|\.+$/g, '')
  return `${slug}.${salt}@example.com`
}

// ──────────────────────────────────────────────────────────
// 5) 日期工具 —— 全部按中国时区 (Asia/Shanghai) 计算。
//
// 不要再用 `new Date().toISOString().split('T')[0]`,那是 UTC 日期,
// CN 凌晨 00:00–08:00 会偏一天 —— 正是 Bug 4 的根源,DB 触发器侧已经
// 修过(参见 20260517020000_localize_reminder_trigger_dates.sql),
// 这里写入侧也必须一致,否则 100 个客户的 log_date / deal_date /
// valid_until / sent_date 等都会系统性偏 1 天。
//
// 写法参照 src/lib/dates.ts —— Intl 锁 Asia/Shanghai 拿"今天",
// Date.UTC 做日期算术(纯整数 ms,免疫 DST 与机器时区)。
// ──────────────────────────────────────────────────────────
const TZ = 'Asia/Shanghai'

function todayLocalISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  const ry = t.getUTCFullYear()
  const rm = String(t.getUTCMonth() + 1).padStart(2, '0')
  const rd = String(t.getUTCDate()).padStart(2, '0')
  return `${ry}-${rm}-${rd}`
}

function daysAgoISO(n) {
  return addDays(todayLocalISO(), -n)
}

function tsAtDate(dateStr, hh = 9) {
  // 已经是 CN 时区显式偏移,无需改。dateStr 由 daysAgoISO/addDays
  // 产出,fix 后是 CN-local 日期串,拼上 +08:00 后整体落在 CN 当天上午。
  return `${dateStr}T${String(hh).padStart(2, '0')}:00:00+08:00`
}

// ──────────────────────────────────────────────────────────
// 6) 金额三档
// ──────────────────────────────────────────────────────────
const TIER = {
  small: () => randAmount(3000, 15000),
  mid:   () => randAmount(15000, 60000),
  large: () => randAmount(80000, 300000),
}
function pickTier(forceLarge) {
  if (forceLarge) return 'large'
  const r = rand()
  if (r < 0.45) return 'small'
  if (r < 0.78) return 'mid'
  return 'large'
}

// ──────────────────────────────────────────────────────────
// 7) 客户计划生成
//
// 100 个客户阶段分布:
//   待定 17, 新接触 17, 报价中 17, 已寄样 17, 已成交 17, 沉默 15
// 类别分布:
//   A 类(故事线完整) 70, B 类(故意不规整) 30
//
// 阶段 × 类别 拆分:
//   待定:   A=10, B=7
//   新接触: A=13, B=4
//   报价中: A=12, B=5
//   已寄样: A=12, B=5
//   已成交: A=14, B=3   (其中 ≥4 个大单, 15-17 个返单≥2 deals)
//   沉默:   A=9,  B=6
//
// 沉默客户(15) — last_contact_date 必须 > 60 天前。
// 不自洽 B 类(5个,在 新接触/报价中/已寄样) — 故意挂上 deal,
//                                              最后再把 stage 改回去。
// ──────────────────────────────────────────────────────────
function buildPlans() {
  const slots = [
    ['待定',   'A', 10], ['待定',   'B', 7],
    ['新接触', 'A', 13], ['新接触', 'B', 4],
    ['报价中', 'A', 12], ['报价中', 'B', 5],
    ['已寄样', 'A', 12], ['已寄样', 'B', 5],
    ['已成交', 'A', 14], ['已成交', 'B', 3],
    ['沉默',   'A', 9],  ['沉默',   'B', 6],
  ]
  const plans = []
  let i = 0
  for (const [stage, kind, count] of slots) {
    for (let k = 0; k < count; k++) {
      plans.push({ idx: i++, stage, kind, country: null,
        ownerIdx: 0, bigDeal: false, dealCount: 0, silent: stage === '沉默',
        inconsistent: false, bareB: false })
    }
  }

  // 大单标记 (≥4): 已成交 A 类 前 5 个 → 大单
  let bigCount = 0
  for (const p of plans) {
    if (bigCount >= 5) break
    if (p.stage === '已成交' && p.kind === 'A') { p.bigDeal = true; bigCount++ }
  }

  // 返单标记 (15-17): 已成交客户 17 个里取 16 个做 2-4 单
  let reorderCount = 0
  for (const p of plans) {
    if (p.stage === '已成交') {
      if (reorderCount < 16) { p.dealCount = randInt(2, 4); reorderCount++ }
      else                   { p.dealCount = 1 }
    }
  }
  // 沉默客户中 40% 曾经成交过 1 单(不是返单),用来制造"曾有过成交的沉默客户"
  for (const p of plans) {
    if (p.stage === '沉默' && p.kind === 'A' && rand() < 0.4) p.dealCount = 1
  }

  // 不自洽 B 类(5 个): 在 新接触/报价中/已寄样 各挑 B 类，故意挂 1 单 deal
  let inconsistentCount = 0
  for (const p of plans) {
    if (inconsistentCount >= 5) break
    if (p.kind === 'B' && ['新接触', '报价中', '已寄样'].includes(p.stage)) {
      p.dealCount = 1
      p.inconsistent = true
      inconsistentCount++
    }
  }

  // B 类一半概率"字段留空" (留空 industry/email/notes 等)
  for (const p of plans) {
    if (p.kind === 'B' && rand() < 0.5) p.bareB = true
  }

  // owner 分配: idx*7 % 10 错位，保证每 sales 取 10 个
  for (let idx = 0; idx < 100; idx++) {
    plans[idx].ownerIdx = (idx * 7) % 10
  }

  // 国家洗牌
  const countries = [...COUNTRY_POOL]
  for (let k = countries.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1))
    ;[countries[k], countries[j]] = [countries[j], countries[k]]
  }
  for (let idx = 0; idx < 100; idx++) plans[idx].country = countries[idx]

  // 时间轴
  for (const p of plans) {
    if (p.silent) {
      p.firstContactDaysAgo = randInt(120, 540)
      p.lastDaysAgo = randInt(61, Math.min(180, p.firstContactDaysAgo - 1))
    } else {
      p.firstContactDaysAgo = randInt(45, 540)
      p.lastDaysAgo = randInt(2, Math.min(30, p.firstContactDaysAgo - 1))
    }
  }

  return plans
}

// ──────────────────────────────────────────────────────────
// 8) 主流程
// ──────────────────────────────────────────────────────────
;(async () => {
  console.log('=== 大规模压测数据灌库 (seed-test-data.js) ===')
  console.log(`目标库: ${SUPABASE_URL}`)
  console.log('警告: 仅限本地测试库,重复运行前需手动清空七张表。\n')

  // ── 0. 取 sales01-sales10 的 profile id（必须存在,不能用旧账号） ──
  console.log('[0/6] 预检 sales01-sales10 ...')
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers: H })
  if (!authRes.ok) throw new Error(`列 auth users 失败: ${await authRes.text()}`)
  const authJson = await authRes.json()
  const authUsers = authJson.users || authJson

  const profs = await api('/rest/v1/profiles?select=id,full_name,role,is_active')

  const salesIds = []
  for (let k = 1; k <= 10; k++) {
    const email = `sales${String(k).padStart(2, '0')}@arabgold.test`
    const u = authUsers.find(x => x.email === email)
    if (!u) throw new Error(`找不到 auth 账号: ${email} — 先跑 seed-test-accounts.js`)
    const prof = profs.find(p => p.id === u.id)
    if (!prof) throw new Error(`profile 缺失: ${email} (auth.id=${u.id})`)
    if (prof.role !== 'member') throw new Error(`${email} 角色应为 member, 实为 ${prof.role}`)
    if (prof.is_active !== true) throw new Error(`${email} 已停用,不能分配客户`)
    salesIds.push(u.id)
  }
  console.log(`     ✓ sales01-sales10 全部对齐,id 已锁定。`)

  // ── 1. 生成计划 ──
  const plans = buildPlans()
  console.log(`[1/6] 计划生成 ${plans.length} 个客户。`)
  console.log(`     A 类 ${plans.filter(p => p.kind === 'A').length},` +
              ` B 类 ${plans.filter(p => p.kind === 'B').length}`)
  console.log(`     大单 ≥80k: ${plans.filter(p => p.bigDeal).length} 个`)
  console.log(`     返单(≥2 deals): ${plans.filter(p => p.dealCount >= 2).length} 个`)
  console.log(`     沉默(60+天): ${plans.filter(p => p.silent).length} 个`)
  console.log(`     不自洽 B(挂 deal 但 stage 非已成交): ${plans.filter(p => p.inconsistent).length} 个`)

  // ── 2. 插 customers ──
  console.log('\n[2/6] 插入 customers ...')
  const customers = []
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i]
    const ownerId = salesIds[p.ownerIdx]
    const fullName = genFullName()
    const companyName = genCompany(p.country)
    const whatsapp = genWhatsapp(p.country, p.idx)
    const firstContactDate = daysAgoISO(p.firstContactDaysAgo)

    const customer = {
      contact_name: fullName,
      company_name: companyName,
      country: p.country,
      whatsapp,
      email: p.bareB ? null : genEmail(fullName, p.idx),
      owner_id: ownerId,
      level: pick(LEVELS),
      stage: '待定',                        // 初始一律待定,后续触发器/PATCH 推到目标
      first_contact_date: firstContactDate,
      source:             p.bareB ? null : pick(SOURCES),
      product_category:   p.bareB ? null : pick(PRODUCT_CATEGORIES),
      payment_preference: p.bareB ? null : pick(PAYMENT_PREFERENCES),
      contact_title:      p.bareB ? null : pick(CONTACT_TITLES),
      gender:             p.bareB ? null : pick(GENDERS),
      industry:           p.bareB ? null : pick(INDUSTRIES),
      company_size:       p.bareB ? null : pick(COMPANY_SIZES),
      decision_role:      p.bareB ? null : pick(DECISION_ROLES),
      purchase_frequency: p.bareB ? null : pick(PURCHASE_FREQUENCIES),
      incoterms:          p.bareB ? null : pick(INCOTERMS),
      currency_preference:p.bareB ? null : pick(CURRENCIES),
      notes: p.bareB ? null
        : `[seed] ${p.country} ${p.kind} 类,目标阶段=${p.stage}` +
          (p.bigDeal ? ', 大单' : '') +
          (p.dealCount >= 2 ? `, 返单×${p.dealCount}` : '') +
          (p.silent ? ', 沉默' : '') +
          (p.inconsistent ? ', 故意不自洽' : ''),
      created_by: ownerId,
      created_at: tsAtDate(firstContactDate, 8),
    }
    const r = await api('/rest/v1/customers', 'POST', customer)
    const inserted = r[0]
    customers.push({ ...inserted, plan: p, lastQuoteDaysAgo: null, lastQuotationId: null })
    if ((i + 1) % 10 === 0) console.log(`     customers: ${i + 1}/${plans.length}`)
  }
  console.log(`     ✓ customers ${customers.length}/${plans.length}`)

  // ── 3. 插 contact_logs ──
  //  A 类: 3-6 条; B 类: 0-3 条 (待定 B 0-1 条)
  console.log('\n[3/6] 插入 contact_logs ...')
  let logCount = 0
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i]
    const p = c.plan
    let numLogs
    if (p.kind === 'A') {
      numLogs = randInt(3, 6)
    } else {
      numLogs = p.stage === '待定' ? randInt(0, 1) : randInt(1, 3)
    }
    if (numLogs === 0) continue

    // 日期点散布在 [lastDaysAgo, firstContactDaysAgo]
    const points = []
    for (let k = 0; k < numLogs; k++) {
      points.push(randInt(p.lastDaysAgo, p.firstContactDaysAgo))
    }
    points.sort((a, b) => b - a)  // 老到新
    if (points.length > 0) points[points.length - 1] = p.lastDaysAgo  // 锚定最后一条

    for (const da of points) {
      const log = {
        customer_id: c.id,
        logged_by: c.owner_id,
        log_date: daysAgoISO(da),
        tag: pick(CONTACT_TAGS),
        note: `[seed] ${da} 天前联系: ${c.contact_name}`,
      }
      await api('/rest/v1/contact_logs', 'POST', log)
      logCount++
    }
    c.contactLogPoints = points
    if ((i + 1) % 10 === 0) console.log(`     contact_logs: ${i + 1}/${customers.length} 客户, 累计 ${logCount} 条`)
  }
  console.log(`     ✓ contact_logs 累计 ${logCount} 条`)

  // ── 4. 插 quotations + quotation_items ──
  console.log('\n[4/6] 插入 quotations + quotation_items ...')
  let quoteCount = 0
  let itemCount = 0
  let quoteSeq = 1
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i]
    const p = c.plan

    // 决定 quotation 数量
    let numQuotes = 0
    if (p.kind === 'A') {
      if (['报价中', '已寄样', '已成交'].includes(p.stage)) numQuotes = randInt(1, 3)
      else if (p.stage === '沉默' && p.dealCount > 0) numQuotes = randInt(1, 2)
      else if (p.stage === '沉默' && rand() < 0.3) numQuotes = 1
    } else {
      // B 类: 不自洽 / 报价后无下文 / 等多种情况
      if (p.inconsistent) numQuotes = 1
      else if (['报价中', '已寄样'].includes(p.stage)) numQuotes = randInt(1, 2)
      else if (p.stage === '已成交') numQuotes = randInt(1, 2)
      else if (rand() < 0.3) numQuotes = 1
    }
    if (numQuotes === 0) continue

    // 报价日期窗口 [lastDaysAgo+1, firstContactDaysAgo-1]
    const quoteWindowMin = p.lastDaysAgo + 1
    const quoteWindowMax = Math.max(quoteWindowMin, p.firstContactDaysAgo - 1)

    for (let q = 0; q < numQuotes; q++) {
      const quoteDaysAgo = pickInRange(quoteWindowMin, quoteWindowMax)
      const quoteDate = daysAgoISO(quoteDaysAgo)
      const tier = pickTier(p.bigDeal && q === numQuotes - 1)

      // items
      const numItems = randInt(1, 4)
      const targetTotal = TIER[tier]()
      const items = []
      let totalAmount = 0
      for (let it = 0; it < numItems; it++) {
        const qty = randInt(50, 500)
        const unitPrice = Math.round((targetTotal / numItems / qty) * 100) / 100
        const amount = Math.round(qty * unitPrice * 100) / 100
        items.push({
          product_name: pick(PRODUCT_CATEGORIES),
          spec: `Spec-${randInt(100, 999)}`,
          quantity: qty,
          unit: '件',
          unit_price: unitPrice,
          amount,
          remark: null,
        })
        totalAmount += amount
      }
      totalAmount = Math.round(totalAmount * 100) / 100

      // quote_no 手动给（绕过 generate_quote_no 触发器用 current_date 的问题）
      const quoteNoDate = quoteDate.replace(/-/g, '')
      const quoteNo = `Q-${quoteNoDate}-${String(quoteSeq).padStart(4, '0')}`
      quoteSeq++

      const quotation = {
        customer_id: c.id,
        quote_no: quoteNo,
        version: q + 1,
        trade_terms: pick(INCOTERMS),
        currency: pick(['USD', 'EUR', 'AED']),
        total_amount: totalAmount,
        valid_until: addDays(quoteDate, 30),
        status: pick(QUOTATION_STATUSES),
        notes: `[seed] ${p.country} 第 ${q + 1} 版报价 (${tier})`,
        created_by: c.owner_id,
        created_at: tsAtDate(quoteDate, 9),
      }
      const qr = await api('/rest/v1/quotations', 'POST', quotation)
      const insertedQ = qr[0]
      quoteCount++

      const itemsPayload = items.map(it => ({ ...it, quotation_id: insertedQ.id }))
      await api('/rest/v1/quotation_items', 'POST', itemsPayload)
      itemCount += itemsPayload.length

      c.lastQuotationId = insertedQ.id
      c.lastQuoteDaysAgo = quoteDaysAgo
    }

    if ((i + 1) % 10 === 0)
      console.log(`     quotations: ${i + 1}/${customers.length} 客户, 累计报价 ${quoteCount} 条, items ${itemCount}`)
  }
  console.log(`     ✓ quotations ${quoteCount}, quotation_items ${itemCount}`)

  // ── 5. 插 deals + deal_items ──
  console.log('\n[5/6] 插入 deals + deal_items ...')
  let dealCount = 0
  let dealItemCount = 0
  let dealSeq = 1
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i]
    const p = c.plan
    if (p.dealCount === 0) continue

    // 成交日期窗口: [lastDaysAgo+1, min(报价日期-1, firstContactDaysAgo-2)]
    // 没报价时窗口 = [lastDaysAgo+1, firstContactDaysAgo-1]
    const upper = c.lastQuoteDaysAgo != null
      ? Math.max(p.lastDaysAgo + 1, c.lastQuoteDaysAgo - 1)
      : Math.max(p.lastDaysAgo + 1, p.firstContactDaysAgo - 1)
    const lower = p.lastDaysAgo + 1

    // 给多个 deal 分配日期(老到新)
    const dealDays = []
    for (let d = 0; d < p.dealCount; d++) {
      dealDays.push(pickInRange(lower, upper))
    }
    dealDays.sort((a, b) => b - a)

    for (let d = 0; d < p.dealCount; d++) {
      const dealDaysAgo = dealDays[d]
      const dealDate = daysAgoISO(dealDaysAgo)
      const tier = pickTier(p.bigDeal && d === 0)

      const numItems = randInt(1, 4)
      const targetTotal = TIER[tier]()
      const items = []
      let total = 0
      for (let it = 0; it < numItems; it++) {
        const qty = randInt(50, 500)
        const unitPrice = Math.round((targetTotal / numItems / qty) * 100) / 100
        const amount = Math.round(qty * unitPrice * 100) / 100
        items.push({
          product_name: pick(PRODUCT_CATEGORIES),
          spec: `Spec-${randInt(100, 999)}`,
          quantity: qty,
          unit: '件',
          unit_price: unitPrice,
          amount,
          remark: null,
        })
        total += amount
      }
      total = Math.round(total * 100) / 100

      const dealNoDate = dealDate.replace(/-/g, '')
      const dealNo = `D-${dealNoDate}-${String(dealSeq).padStart(4, '0')}`
      dealSeq++

      const deal = {
        customer_id: c.id,
        quotation_id: (d === 0 && c.lastQuotationId) ? c.lastQuotationId : null,
        deal_no: dealNo,
        deal_date: dealDate,
        deal_amount: total,
        currency: 'USD',
        payment_method: pick(PAYMENT_PREFERENCES),
        deposit_received: rand() < 0.7,
        balance_received: rand() < 0.4,
        status: pick(DEAL_STATUSES),
        is_reorder: d > 0,
        shipping_date: rand() < 0.5 ? addDays(dealDate, randInt(10, 40)) : null,
        notes: `[seed] ${p.country} 成交单 #${d + 1} (${tier})`,
        created_by: c.owner_id,
        created_at: tsAtDate(dealDate, 10),
      }
      const dr = await api('/rest/v1/deals', 'POST', deal)
      const insertedD = dr[0]
      dealCount++

      const itemsPayload = items.map(it => ({ ...it, deal_id: insertedD.id }))
      await api('/rest/v1/deal_items', 'POST', itemsPayload)
      dealItemCount += itemsPayload.length
    }

    if ((i + 1) % 10 === 0)
      console.log(`     deals: ${i + 1}/${customers.length} 客户, 累计成交 ${dealCount} 单, items ${dealItemCount}`)
  }
  console.log(`     ✓ deals ${dealCount}, deal_items ${dealItemCount}`)

  // ── 6. 插 samples (部分客户 0-1 个) ──
  console.log('\n[6/6] 插入 samples ...')
  let sampleCount = 0
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i]
    const p = c.plan
    let has = false
    if (p.kind === 'A') {
      if (['已寄样', '已成交'].includes(p.stage)) has = rand() < 0.8
      else if (p.stage === '沉默' && p.dealCount > 0) has = rand() < 0.5
      else if (p.stage === '报价中') has = rand() < 0.3
    } else {
      has = rand() < 0.2
    }
    if (!has) continue

    // sample 寄出日期: 在 lastDaysAgo 之后某天, 优先靠近报价后(若有)
    const upper = c.lastQuoteDaysAgo != null
      ? Math.max(p.lastDaysAgo + 1, c.lastQuoteDaysAgo)
      : Math.max(p.lastDaysAgo + 1, p.firstContactDaysAgo - 1)
    const sentDaysAgo = pickInRange(p.lastDaysAgo + 1, upper)
    const sentDate = daysAgoISO(sentDaysAgo)
    const status = pick(SAMPLE_STATUSES)
    const feedbackDate = (status === 'feedback_received' || status === 'received')
      ? addDays(sentDate, randInt(5, 30))
      : null

    const carrier = pick(CARRIERS)
    const trackingPrefix = carrier === '其他' ? 'OTH' : carrier.slice(0, 3).toUpperCase()
    const sample = {
      customer_id: c.id,
      sample_desc: `${pick(PRODUCT_CATEGORIES)} 样品`,
      sent_date: sentDate,
      tracking_no: `${trackingPrefix}${randInt(1000000000, 9999999999)}`,
      carrier,
      quantity: randInt(1, 5),
      cost: randAmount(50, 500),
      status,
      feedback: feedbackDate ? '客户对样品总体满意,部分细节需调整' : null,
      feedback_date: feedbackDate,
      created_by: c.owner_id,
      created_at: tsAtDate(sentDate, 11),
    }
    await api('/rest/v1/samples', 'POST', sample)
    sampleCount++
    if ((i + 1) % 20 === 0)
      console.log(`     samples: ${i + 1}/${customers.length} 客户, 累计 ${sampleCount}`)
  }
  console.log(`     ✓ samples ${sampleCount}`)

  // ── 7. 修正最终 stage / last_contact_date ──
  // 触发器会把 stage 自动推到最高(deal=>已成交; sample=>已寄样; quotation=>报价中)。
  // 我们需要强制把目标 stage 写回:
  //   - 待定/新接触: 强制 PATCH 回去（即使有 deal）
  //   - 沉默:       强制 PATCH stage='沉默'
  //   - 其他:       PATCH 一遍冗余但无害
  console.log('\n[7/7] 修正 stage / last_contact_date ...')
  let fixCount = 0
  for (const c of customers) {
    const p = c.plan
    const patch = { stage: p.stage }
    // 沉默客户最后一次重写 last_contact_date(触发器已经写过,这里再确认)
    if (p.silent) patch.last_contact_date = daysAgoISO(p.lastDaysAgo)
    await api(`/rest/v1/customers?id=eq.${c.id}`, 'PATCH', patch)
    fixCount++
    if (fixCount % 20 === 0) console.log(`     stage 修正 ${fixCount}/${customers.length}`)
  }
  console.log(`     ✓ stage 修正 ${fixCount}`)

  // ── 8. 汇总 ──
  console.log('\n========================================')
  console.log(`✅ 完成. 灌入条数:`)
  console.log(`     customers       ${customers.length}`)
  console.log(`     contact_logs    ${logCount}`)
  console.log(`     quotations      ${quoteCount}`)
  console.log(`     quotation_items ${itemCount}`)
  console.log(`     deals           ${dealCount}`)
  console.log(`     deal_items      ${dealItemCount}`)
  console.log(`     samples         ${sampleCount}`)
  console.log(`     stage 修正      ${fixCount}`)
  console.log(`⚠️  reminders / stage_changes 由触发器/cron 自动生成,本脚本未手动插入。`)
  console.log(`========================================`)
})().catch(err => {
  console.error('\n[FATAL]', err.message || err)
  console.error('已插入的数据原样保留,等乐哥决定下一步。')
  process.exit(1)
})
