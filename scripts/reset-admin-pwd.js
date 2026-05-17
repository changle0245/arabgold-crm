// Reset admin password to a known value for testing.
// Usage: node scripts/reset-admin-pwd.js <new-password>

const fs = require('fs')
const path = require('path')

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

const newPassword = process.argv[2]
if (!newPassword) {
  console.error('Usage: node scripts/reset-admin-pwd.js <new-password>')
  process.exit(1)
}

;(async () => {
  // 1. find admin profile (role=admin)
  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.admin&select=id,full_name,is_active`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  const profiles = await profRes.json()
  if (!profiles.length) { console.error('No admin profile'); process.exit(1) }
  console.log('Admin profile(s):', profiles)

  // 2. list auth users (need admin api)
  const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  const usersJson = await usersRes.json()
  const users = usersJson.users || usersJson
  const adminProfileIds = new Set(profiles.map(p => p.id))
  const adminUsers = users.filter(u => adminProfileIds.has(u.id))
  console.log('Admin auth users:', adminUsers.map(u => ({ id: u.id, email: u.email })))

  if (!adminUsers.length) { console.error('No matching auth user'); process.exit(1) }

  for (const u of adminUsers) {
    const putRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ password: newPassword }),
    })
    if (putRes.ok) console.log(`[OK] Reset password for ${u.email}`)
    else console.error(`[FAIL] ${u.email}:`, await putRes.text())
  }
})()
