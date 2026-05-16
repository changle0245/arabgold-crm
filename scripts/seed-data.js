// 预填演示数据：4 个业务员 + 5 个客户 + 25 条联系记录
// 用法: node scripts/seed-data.js

const fs = require('fs')
const path = require('path')

// 解析 .env.local
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) return
  let value = trimmed.slice(eqIdx + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  env[trimmed.slice(0, eqIdx).trim()] = value
})

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

const authHeaders = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
}

// 工具函数
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

async function api(path, method = 'GET', body) {
  const opts = { method, headers: { ...authHeaders, Prefer: 'return=representation' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${SUPABASE_URL}${path}`, opts)
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`${method} ${path}: ${res.status} ${txt}`)
  }
  const ct = res.headers.get('content-type') || ''
  return ct.includes('json') ? res.json() : res.text()
}

async function createMember(email, password, fullName, jobTitle, isActive = true) {
  // 先看 profile 是否已存在
  const existing = await api(`/rest/v1/profiles?full_name=eq.${encodeURIComponent(fullName)}&select=id`)
  if (existing.length > 0) {
    console.log(`  [skip] 成员已存在: ${fullName}`)
    return existing[0].id
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const userData = await userRes.json()
  if (!userRes.ok) throw new Error(`Create user ${email}: ${JSON.stringify(userData)}`)

  await api('/rest/v1/profiles', 'POST', {
    id: userData.id,
    full_name: fullName,
    role: 'member',
    job_title: jobTitle,
    is_active: isActive,
  })
  console.log(`  [√] 成员 ${fullName} (${jobTitle}) 创建`)
  return userData.id
}

;(async () => {
  console.log('=== 预填演示数据 ===\n')

  // 1. 取已有 admin
  const admins = await api('/rest/v1/profiles?role=eq.admin&select=id,full_name&limit=1')
  if (!admins.length) {
    console.error('[×] 没有 admin 账号，请先运行 init-admin.bat')
    process.exit(1)
  }
  const adminId = admins[0].id
  console.log(`管理员: ${admins[0].full_name} (${adminId.slice(0, 8)}...)\n`)

  // 2. 创建 4 个业务员（含 1 个离职示例）
  console.log('[1/4] 创建团队成员...')
  const zhangLei = await createMember('zhanglei@arabgold.local', 'zhanglei123', '张磊', '业务员')
  const wangFang = await createMember('wangfang@arabgold.local', 'wangfang123', '王芳', '业务员')
  const liNa     = await createMember('lina@arabgold.local',     'lina123',     '李娜', '跟单')
  const liuQiang = await createMember('liuqiang@arabgold.local', 'liuqiang123', '刘强', '客服', false) // 离职

  // 3. 创建 5 个客户
  console.log('\n[2/4] 创建客户...')
  const customers = [
    {
      contact_name: 'Ahmed Al-Mansoori',
      company_name: 'Al Madar Trading LLC',
      country: '阿联酋',
      whatsapp: '+971501234567',
      email: 'ahmed@almadar.ae',
      owner_id: zhangLei,
      level: 'L1',
      stage: '已成交',
      source: '展会',
      product_category: '香炉',
      payment_preference: 'TT',
      notes: '迪拜大客户，年采购量稳定。喜欢镀金款。决策快但喜欢砍价 5-10%。斋月前会大批量下单。',
      last_contact_date: daysAgo(3),
      created_by: zhangLei,
    },
    {
      contact_name: 'Fatima Al-Saud',
      company_name: 'Riyadh Royal Gifts',
      country: '沙特阿拉伯',
      whatsapp: '+966551234567',
      email: 'fatima@riyadhroyal.sa',
      owner_id: wangFang,
      level: 'L1',
      stage: '报价中',
      source: '老客户介绍',
      product_category: '礼品套装',
      payment_preference: '信用证LC',
      notes: '宗教节日采购为主，开斋节、宰牲节高峰。要求包装精美。付款偏好 LC at sight。决策人是其哥哥。',
      last_contact_date: daysAgo(10),
      created_by: wangFang,
    },
    {
      contact_name: 'Mohammed Al-Kuwaiti',
      company_name: 'Kuwait Premium Trading',
      country: '科威特',
      whatsapp: '+96599123456',
      email: 'mohammed@kpt.kw',
      owner_id: zhangLei,
      level: 'L2',
      stage: '已寄样',
      source: 'TikTok',
      product_category: '镀金托盘',
      payment_preference: '部分预付',
      notes: '通过抖音找过来的，对短视频内容很感兴趣。第一次合作，订单量不大但意向明确。样品反馈很好。',
      last_contact_date: daysAgo(5),
      created_by: zhangLei,
    },
    {
      contact_name: 'Ali Al-Doha',
      company_name: 'Doha Hospitality Group',
      country: '卡塔尔',
      whatsapp: '+97455123456',
      email: 'ali@dohahg.qa',
      owner_id: liNa,
      level: 'L2',
      stage: '新接触',
      source: '网站询盘',
      product_category: '香炉',
      payment_preference: 'TT',
      notes: '酒店用品采购方，对香炉需求量大。之前发过资料后无回应，需要再跟进。',
      last_contact_date: daysAgo(35), // 沉默
      created_by: adminId,
    },
    {
      contact_name: 'Hassan El-Masry',
      company_name: 'Cairo Heritage Crafts',
      country: '埃及',
      whatsapp: '+20100123456',
      email: 'hassan@cairoheritage.eg',
      owner_id: wangFang,
      level: 'L3',
      stage: '沉默',
      source: '展会',
      product_category: '礼品套装',
      payment_preference: '其他',
      notes: '开罗当地零售商，价格敏感型。曾询过价但因报价偏高一直未成交。可能需要降价或推荐入门款。',
      last_contact_date: daysAgo(60), // 深度沉默
      created_by: adminId,
    },
  ]

  const created = []
  for (const c of customers) {
    // 检查是否已存在（用 whatsapp 唯一）
    const exists = await api(`/rest/v1/customers?whatsapp=eq.${encodeURIComponent(c.whatsapp)}&select=id`)
    if (exists.length > 0) {
      console.log(`  [skip] 客户已存在: ${c.contact_name}`)
      created.push({ ...c, id: exists[0].id })
      continue
    }
    const result = await api('/rest/v1/customers', 'POST', c)
    console.log(`  [√] ${c.contact_name} | ${c.country} | ${c.level} | ${c.stage}`)
    created.push({ ...c, id: result[0].id })
  }

  // 4. 为每个客户创建 5 条联系记录（按时间线展开历史）
  console.log('\n[3/4] 创建联系记录（每客户 5 条）...')

  // 联系记录模板：[相对最近联系日的天数偏移（0 = 最近，向前推）, 标签, 备注]
  const logTemplates = {
    'Ahmed Al-Mansoori': [
      [0,   '已成交', 'PI 已签，定金 30% 已收。预计 30 天内出货。'],
      [15,  '已报价', '出第三版报价单 v3，调整了 5 件套优惠。'],
      [28,  '客户砍价', '客户要求 8% 折扣，按惯例同意 5%。'],
      [40,  '已报价', '首次报价 v1，FOB 广州。'],
      [50,  '其他',   '展会后第一次接触，留了名片和样品手册。'],
    ],
    'Fatima Al-Saud': [
      [0,   '已报价', '改版第二版报价，加上了精装包装选项。等客户确认。'],
      [12,  '客户砍价', '客户对单价不满意，要求降 12%。我方反提 7%。'],
      [25,  '已报价', '首次正式报价 v1，含 3 个产品组合。'],
      [40,  '其他',   '微信视频沟通需求，确认要做开斋节大单。'],
      [55,  '其他',   '老客户介绍来的，已加上 WhatsApp。'],
    ],
    'Mohammed Al-Kuwaiti': [
      [0,   '已寄样', '样品已寄出，DHL 单号 1234567890。预计 5 天到。'],
      [8,   '其他',   '确认样品规格，客户要 3 个尺寸各一件。'],
      [14,  '已报价', '基础报价单，FOB 价。'],
      [20,  '其他',   '客户问起 MOQ 和起订量。'],
      [28,  '其他',   '抖音留言后加了 WhatsApp，对镀金托盘感兴趣。'],
    ],
    'Ali Al-Doha': [
      [0,   '暂无回应', '发了产品手册和价目表，至今无回应。'],
      [8,   '其他',   '电话过去说在开会，让发资料。'],
      [20,  '其他',   '回复询盘邮件，主动发了 WhatsApp。'],
      [32,  '其他',   '网站收到询盘，对香炉感兴趣。'],
      [40,  '其他',   '询盘登记，预计采购量 500 件。'],
    ],
    'Hassan El-Masry': [
      [0,   '暂无回应', '节后再发了一次问候，无回应。可能已转向其他供应商。'],
      [25,  '客户砍价', '客户嫌报价高 30%，要求大幅降价，未达成。'],
      [45,  '已报价', '出礼品套装报价单，FOB 价。'],
      [60,  '其他',   '邮件询盘，要求礼品套装方案。'],
      [80,  '其他',   '开罗展会上加的微信，回访询问需求。'],
    ],
  }

  // 修正：相对天数要从 last_contact_date 往前推
  for (const c of created) {
    const templates = logTemplates[c.contact_name] || []
    const baseDate = new Date(c.last_contact_date)
    let inserted = 0
    for (const [offset, tag, note] of templates) {
      const logDate = new Date(baseDate)
      logDate.setDate(logDate.getDate() - offset)
      const logDateStr = logDate.toISOString().split('T')[0]
      await api('/rest/v1/contact_logs', 'POST', {
        customer_id: c.id,
        logged_by: c.owner_id,
        log_date: logDateStr,
        tag,
        note,
      })
      inserted++
    }
    console.log(`  [√] ${c.contact_name}: ${inserted} 条记录`)
  }

  // 修复 last_contact_date（trigger 可能把它更新成了最早的日期）
  console.log('\n[4/4] 修正 last_contact_date（覆盖触发器写入）...')
  for (const c of created) {
    await api(`/rest/v1/customers?id=eq.${c.id}`, 'PATCH', {
      last_contact_date: c.last_contact_date,
    })
  }
  console.log('  [√] 完成')

  console.log('\n============================================')
  console.log('  演示数据预填完成！现在刷新浏览器可以看到：')
  console.log('  • 4 个新业务员（含 1 个离职示例：刘强）')
  console.log('  • 5 个客户（涵盖各国家/分级/阶段）')
  console.log('  • 25 条联系记录（每客户 5 条历史）')
  console.log('  • 多个客户已超期或沉默，可看到红色高亮和大屏预警')
  console.log('============================================')
})().catch(e => {
  console.error('\n[×] 出错:', e.message)
  process.exit(1)
})
