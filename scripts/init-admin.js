// 创建第一个管理员账号
// 用法: node scripts/init-admin.js <email> <password> <full_name>

const fs = require('fs')
const path = require('path')

// 手动解析 .env.local
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) return
  let value = trimmed.slice(eqIdx + 1).trim()
  // 去除两端的引号（Supabase status -o env 输出会带引号）
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  env[trimmed.slice(0, eqIdx).trim()] = value
})

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[×] .env.local 缺少必要字段')
  process.exit(1)
}

const [, , email, password, fullName] = process.argv

if (!email || !password || !fullName) {
  console.error('[×] 缺少参数: <email> <password> <full_name>')
  process.exit(1)
}

;(async () => {
  try {
    // 1. 创建 auth user
    const createUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
      }),
    })

    const userData = await createUserRes.json()

    if (!createUserRes.ok) {
      console.error('[×] 创建 auth 用户失败:', userData.msg || userData.error || JSON.stringify(userData))
      process.exit(1)
    }

    const userId = userData.id

    // 2. 写入 profiles 表（admin 角色）
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        id: userId,
        full_name: fullName,
        role: 'admin',
        job_title: '业务员',
        is_active: true,
      }),
    })

    if (!profileRes.ok) {
      const err = await profileRes.text()
      console.error('[×] 写入 profile 失败:', err)
      process.exit(1)
    }

    console.log('')
    console.log('[√] 管理员账号创建成功！')
    console.log('    邮箱: ' + email)
    console.log('    角色: 管理员 (admin)')
    console.log('')
    console.log('现在可以打开 http://localhost:3000 登录使用了')
  } catch (e) {
    console.error('[×] 出错:', e.message)
    process.exit(1)
  }
})()
