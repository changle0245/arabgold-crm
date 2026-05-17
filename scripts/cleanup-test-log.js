// Delete the D1 test contact log
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
  // Find any contact_log row whose note mentions D1
  const r = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/contact_logs?note=like.*D1%20%E6%97%B6%E5%8C%BA%E9%AA%8C%E8%AF%81*&select=id,note', {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
  })
  const rows = await r.json()
  console.log('Found test logs:', rows)
  for (const row of rows) {
    const dr = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + `/rest/v1/contact_logs?id=eq.${row.id}`, {
      method: 'DELETE',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
    })
    console.log(`Delete ${row.id}: HTTP ${dr.status}`)
  }
})()
