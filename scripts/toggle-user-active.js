// Toggle a user's is_active flag for testing.
// Usage: node scripts/toggle-user-active.js <email> <true|false>

const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const t = line.trim()
  if (!t || t.startsWith('#')) return
  const i = t.indexOf('=')
  if (i === -1) return
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[t.slice(0, i).trim()] = v
})
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

const email = process.argv[2]
const target = process.argv[3]
if (!email || (target !== 'true' && target !== 'false')) {
  console.error('Usage: node scripts/toggle-user-active.js <email> <true|false>')
  process.exit(1)
}

;(async () => {
  // find user id by email via admin api
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  const uj = await ur.json()
  const users = uj.users || uj
  const u = users.find(x => x.email === email)
  if (!u) { console.error('No user with email', email); process.exit(1) }

  const pr = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${u.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ is_active: target === 'true' }),
  })
  console.log('Status', pr.status, await pr.text())
})()
