const fs = require('fs'), path = require('path')
const env = {}
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach(l => {
  const t = l.trim()
  if (!t || t.startsWith('#')) return
  const i = t.indexOf('=')
  if (i === -1) return
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[t.slice(0, i).trim()] = v
})

;(async () => {
  const r = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users?per_page=50', {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
  })
  const j = await r.json()
  const users = j.users || j
  for (const e of ['admin@arabgold.local', 'zhanglei@arabgold.local', 'liuqiang@arabgold.local']) {
    const u = users.find(x => x.email === e)
    console.log(e, u ? `OK (id=${u.id.slice(0, 8)})` : 'MISSING')
  }
  // also check profile.is_active for each
  const pr = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/profiles?select=id,full_name,role,is_active', {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
  })
  const profs = await pr.json()
  console.log('\nProfiles:')
  for (const p of profs) console.log(`  ${p.full_name} (${p.role}) is_active=${p.is_active}`)
})()
