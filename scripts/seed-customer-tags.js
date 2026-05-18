// scripts/seed-customer-tags.js
//
// 给 100 个客户里的一部分挂 customer_tags,标签值取自 src/lib/constants.ts
// 的 PRESET_TAGS(18 个预设)。 颜色由前端 tagColor() 对文本 hash 计算,
// 不入库,这里不管。
//
// 仅本地测试库。重复运行前先 TRUNCATE customer_tags;脚本自带预检,
// 表非空会直接停。失败不回滚,原样停在出错处。
//
// 用法: node scripts/seed-customer-tags.js

const fs = require('fs')
const path = require('path')

// ── 1) 加载 .env.local ──
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(l => {
  const t = l.trim()
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

// ── 2) 确定性伪随机 ──
function mulberry32(seed) {
  return function () {
    let t = (seed = (seed + 0x6D2B79F5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260517)
const pick = (a) => a[Math.floor(rand() * a.length)]

// ── 3) PRESET_TAGS (来自 src/lib/constants.ts,不凭记忆) ──
const PRESET_TAGS = [
  'VIP', '大客户', '战略客户',
  '高潜力', '待孵化', '沉睡客户',
  '中间商', '终端用户', '经销商',
  '价格敏感', '品质优先', '速度优先',
  '节日大单', '月度返单', '一次性',
  '信用好', '难搞', '沟通顺畅',
]

// 6 组分类(组内互斥取一个)
const VALUE_TAGS = ['VIP', '大客户', '战略客户']
const POTENTIAL  = ['高潜力', '待孵化', '沉睡客户']
const ROLE_TAGS  = ['中间商', '终端用户', '经销商']
const PREF_TAGS  = ['价格敏感', '品质优先', '速度优先']
const CADENCE    = ['节日大单', '月度返单', '一次性']
const CREDIT     = ['信用好', '难搞', '沟通顺畅']

;(async () => {
  console.log('=== seed-customer-tags.js ===')
  console.log(`目标库: ${SUPABASE_URL}\n`)

  // ── 4) 预检: customer_tags 必须为空,profiles 与 customers 必须就位 ──
  const existing = await api('/rest/v1/customer_tags?select=id&limit=1')
  if (existing.length > 0) {
    console.error('[STOP] customer_tags 不为空,请先 TRUNCATE 后再跑。')
    process.exit(1)
  }
  console.log('[预检] customer_tags 为空 ✓')

  const customers = await api(
    '/rest/v1/customers?select=id,owner_id,stage,total_deal_count,total_deal_amount,last_contact_date&order=created_at.asc'
  )
  if (customers.length === 0) {
    console.error('[STOP] customers 表是空的,先跑 seed-test-data.js')
    process.exit(1)
  }
  console.log(`[预检] 客户总数 ${customers.length}`)

  // ── 5) 找出大单 / 返单 / 沉默集合(口径与之前核对一致) ──
  const allDeals = await api('/rest/v1/deals?select=customer_id,deal_amount')
  const bigDealSet = new Set()
  const dealCountByCust = new Map()
  for (const d of allDeals) {
    dealCountByCust.set(d.customer_id, (dealCountByCust.get(d.customer_id) || 0) + 1)
    if (Number(d.deal_amount) >= 80000) bigDealSet.add(d.customer_id)
  }
  const reorderSet = new Set(
    [...dealCountByCust.entries()].filter(([_, c]) => c >= 2).map(([id]) => id)
  )
  const silentSet = new Set(customers.filter(c => c.stage === '沉默').map(c => c.id))

  console.log(`[预检] 大单 ${bigDealSet.size}, 返单 ${reorderSet.size}, 沉默 ${silentSet.size}`)

  // ── 6) 决定每客户挂哪些标签(同客户去重,最多 3 个) ──
  const ops = []
  let tagged = 0
  let totalTags = 0
  for (const c of customers) {
    const isBig = bigDealSet.has(c.id)
    const isReorder = reorderSet.has(c.id)
    const isSilent = silentSet.has(c.id)
    const tagSet = new Set()

    if (isBig) {
      tagSet.add(pick(VALUE_TAGS))                       // 必挂 价值类
      if (rand() < 0.6) tagSet.add(pick(CREDIT))         // 60% 信用类
      if (rand() < 0.4) tagSet.add(pick(PREF_TAGS))      // 40% 偏好类
    }
    if (isReorder) {
      tagSet.add('月度返单')                              // 必挂 节奏类
      if (rand() < 0.5) tagSet.add('大客户')              // 50% 加大客户
      if (rand() < 0.4) tagSet.add(pick(CREDIT))         // 40% 信用类
    }
    if (isSilent) {
      tagSet.add('沉睡客户')                              // 必挂
      if (rand() < 0.4) tagSet.add(pick(['价格敏感','难搞']))  // 40% 加性格类
    }
    if (tagSet.size === 0) {
      // 普通客户: 33% 概率挂 1-3 个跨组随机标签
      if (rand() < 0.33) {
        const numTags = Math.floor(rand() * 3) + 1
        const groups = [VALUE_TAGS, POTENTIAL, ROLE_TAGS, PREF_TAGS, CADENCE, CREDIT]
        // 洗牌取前 numTags 组,每组取 1 个标签
        const shuffled = [...groups].sort(() => rand() - 0.5)
        for (let k = 0; k < numTags && k < shuffled.length; k++) {
          tagSet.add(pick(shuffled[k]))
        }
      }
    }

    let tags = [...tagSet]
    if (tags.length > 3) tags = tags.slice(0, 3)
    if (tags.length === 0) continue

    tagged++
    totalTags += tags.length
    for (const t of tags) {
      ops.push({ customer_id: c.id, tag: t, created_by: c.owner_id })
    }
  }

  console.log(`\n[规划] ${tagged}/${customers.length} 客户将挂 ${totalTags} 条标签 ` +
              `(avg ${(totalTags / tagged).toFixed(2)}/客户), 未挂 ${customers.length - tagged}`)

  // ── 7) 批量 INSERT(每批 100 条) ──
  console.log('\n[灌入] customer_tags ...')
  let done = 0
  const BATCH = 100
  for (let i = 0; i < ops.length; i += BATCH) {
    const slice = ops.slice(i, i + BATCH)
    await api('/rest/v1/customer_tags', 'POST', slice)
    done += slice.length
    console.log(`  customer_tags: ${done}/${ops.length}`)
  }

  // ── 8) 汇总 ──
  console.log('\n==============================')
  console.log(`✅ 完成: ${tagged} 个客户挂上 ${totalTags} 条标签`)
  console.log(`   大单客户   ${bigDealSet.size}  全部带价值类标签 (VIP/大客户/战略客户 之一)`)
  console.log(`   返单客户   ${reorderSet.size}  全部带 "月度返单"`)
  console.log(`   沉默客户   ${silentSet.size}  全部带 "沉睡客户"`)
  console.log(`   未挂标签   ${customers.length - tagged} 个客户`)
  console.log('==============================')
})().catch(err => {
  console.error('\n[FATAL]', err.message || err)
  console.error('已插入的数据原样保留,等乐哥决定。')
  process.exit(1)
})
