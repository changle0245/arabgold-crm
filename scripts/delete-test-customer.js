// Delete the test customer created during F3 (_测试_Yusuf Al-Hashimi)
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
const env = {}
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
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

;(async () => {
  // find customers where contact_name like _测试_%
  const url = `${SUPABASE_URL}/rest/v1/customers?contact_name=like.*_%E6%B5%8B%E8%AF%95_*&select=id,contact_name`
  const r = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  const rows = await r.json()
  console.log('Found test customers:', rows)
  for (const row of rows) {
    // delete dependent contact_logs first
    await fetch(`${SUPABASE_URL}/rest/v1/contact_logs?customer_id=eq.${row.id}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    })
    const dr = await fetch(`${SUPABASE_URL}/rest/v1/customers?id=eq.${row.id}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    })
    console.log(`Delete ${row.contact_name}: HTTP ${dr.status}`)
  }
})()
