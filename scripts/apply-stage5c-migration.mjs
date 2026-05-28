#!/usr/bin/env node
// One-shot: apply 20260528020000_replace_items_master_product_id.sql to Neon prod
// CRM Phase 5C — replace_quotation_items + replace_deal_items RPC 加 master_product_id 字段

import { Pool } from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const envFile = path.join(repoRoot, '.env.local')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) {
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  }
}

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL missing'); process.exit(1) }

const sql = fs.readFileSync(
  path.join(repoRoot, 'supabase', 'migrations', '20260528020000_replace_items_master_product_id.sql'),
  'utf8'
)

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2 })

try {
  console.log('[apply-5c] running migration...')
  await pool.query(sql)
  console.log('[apply-5c] migration OK')

  // Verify functions exist with master_product_id in source
  const res = await pool.query(`
    select p.proname, pg_get_function_arguments(p.oid) AS args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname IN ('replace_quotation_items', 'replace_deal_items')
    order by p.proname
  `)
  console.log('[apply-5c] functions:')
  for (const r of res.rows) console.log(`  ${r.proname}(${r.args})`)
  if (res.rows.length !== 2) {
    console.error(`FAIL expected 2 functions, got ${res.rows.length}`)
    process.exit(2)
  }

  // Verify replace_quotation_items signature contains master_product_id
  const src = await pool.query(`
    select pg_get_functiondef(p.oid) AS body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'replace_quotation_items'
  `)
  const hasMaster = src.rows[0]?.body?.includes('master_product_id')
  console.log(`[apply-5c] replace_quotation_items body contains master_product_id: ${hasMaster}`)
  if (!hasMaster) { console.error('FAIL function body missing master_product_id'); process.exit(3) }

  console.log('[apply-5c] DONE')
} finally {
  await pool.end()
}
