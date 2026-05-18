// scripts/seed-test-accounts.js
//
// Creates 1 admin + 10 sales test accounts in the LOCAL Supabase dev DB.
// All accounts share the same test password (printed at end of run).
//
// Usage: node scripts/seed-test-accounts.js
//
// Idempotency: NOT idempotent. Pre-flight checks for email collisions; if any
// target email already exists, the script bails before creating anything.
// To re-run, wipe the conflicting accounts first.
//
// Safety: hits the LOCAL Supabase via .env.local. Never run against prod.

const fs = require('fs')
const path = require('path')

// ── Load .env.local ─────────────────────────────────────────
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

// ── Test data ───────────────────────────────────────────────
// Shared password for ALL 11 test accounts. Test-only, do NOT use in prod.
const PASSWORD = 'ArabGold2026!'

// @arabgold.test TLD (RFC 2606 reserved for testing) — distinct from existing
// @arabgold.local accounts so this script and the old accounts coexist until
// the cleanup step.
const ACCOUNTS = [
  { email: 'admin@arabgold.test',   full_name: '测试管理员', role: 'admin',  job_title: '业务员' },
  { email: 'sales01@arabgold.test', full_name: '王建国',     role: 'member', job_title: '业务员' },
  { email: 'sales02@arabgold.test', full_name: '李秀英',     role: 'member', job_title: '业务员' },
  { email: 'sales03@arabgold.test', full_name: '张伟',       role: 'member', job_title: '业务员' },
  { email: 'sales04@arabgold.test', full_name: '刘洋',       role: 'member', job_title: '业务员' },
  { email: 'sales05@arabgold.test', full_name: '陈静',       role: 'member', job_title: '业务员' },
  { email: 'sales06@arabgold.test', full_name: '杨帆',       role: 'member', job_title: '业务员' },
  { email: 'sales07@arabgold.test', full_name: '赵磊',       role: 'member', job_title: '业务员' },
  { email: 'sales08@arabgold.test', full_name: '周梅',       role: 'member', job_title: '业务员' },
  { email: 'sales09@arabgold.test', full_name: '吴强',       role: 'member', job_title: '业务员' },
  { email: 'sales10@arabgold.test', full_name: '徐丽',       role: 'member', job_title: '业务员' },
]

const headers = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
}

;(async () => {
  // [1/3] Preflight: no email collision
  console.log(`[1/3] Preflight: checking ${ACCOUNTS.length} target emails for collisions…`)
  const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers })
  if (!listRes.ok) {
    console.error('[FAIL] cannot list auth users:', await listRes.text())
    process.exit(1)
  }
  const listJson = await listRes.json()
  const existing = new Set((listJson.users || listJson).map(u => u.email))
  const collisions = ACCOUNTS.filter(a => existing.has(a.email))
  if (collisions.length) {
    console.error(`[FAIL] ${collisions.length} email(s) already exist:`, collisions.map(c => c.email))
    console.error('Wipe them first or edit ACCOUNTS, then re-run.')
    process.exit(1)
  }
  console.log('       ✓ No collisions.')

  // [2/3] Create each account
  console.log(`[2/3] Creating auth users + profiles…`)
  const created = []
  for (const acc of ACCOUNTS) {
    // (a) auth user
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: acc.email,
        password: PASSWORD,
        email_confirm: true,
      }),
    })
    if (!authRes.ok) {
      console.error(`[FAIL] auth user ${acc.email}:`, await authRes.text())
      process.exit(1)
    }
    const authUser = await authRes.json()

    // (b) profile row (id = auth user id)
    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        id: authUser.id,
        full_name: acc.full_name,
        role: acc.role,
        job_title: acc.job_title,
        is_active: true,
      }),
    })
    if (!profRes.ok) {
      console.error(`[FAIL] profile ${acc.email}:`, await profRes.text())
      console.error(`       Orphaned auth user id: ${authUser.id}`)
      process.exit(1)
    }
    const profile = (await profRes.json())[0]
    created.push({ id: authUser.id, email: acc.email, role: profile.role, full_name: profile.full_name })
    console.log(`       ✓ ${acc.email.padEnd(28)} ${profile.role.padEnd(8)} ${profile.full_name}`)
  }

  // [3/3] Summary
  console.log(`\n[3/3] Done. Created ${created.length}/${ACCOUNTS.length} accounts.`)
  console.log(`\nAll passwords: ${PASSWORD}\n`)
  console.log(`Login URL: ${SUPABASE_URL.replace(':54321', ':3000')}/login   (assumes Next dev on :3000)`)
})().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
