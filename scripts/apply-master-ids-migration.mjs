#!/usr/bin/env node
// One-shot helper: apply 20260528010000_add_master_ids.sql to Neon,
// then verify the columns + Ahmed backfill.
//
// Usage:
//   node scripts/apply-master-ids-migration.mjs [--prod]
//
// Without --prod: reads DATABASE_URL from .env.local (dev branch).
// With --prod:    reads DATABASE_URL_PROD from .env.local, or whatever the
//                 caller exports as DATABASE_URL.
//
// Idempotent — re-running on an already-migrated DB is a no-op (all DDL uses
// IF NOT EXISTS, and the Ahmed backfill is a fixed-id UPDATE).

import { Pool } from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const useProd = process.argv.includes('--prod')

// Load .env.local
const envFile = path.join(repoRoot, '.env.local')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) {
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[m[1]] = v
    }
  }
}

const url = useProd
  ? (process.env.DATABASE_URL_PROD || process.env.DATABASE_URL)
  : process.env.DATABASE_URL

if (!url) {
  console.error('DATABASE_URL missing (expected in .env.local or env)')
  process.exit(1)
}

const migrationPath = path.join(
  repoRoot,
  'supabase',
  'migrations',
  '20260528010000_add_master_ids.sql'
)
const sql = fs.readFileSync(migrationPath, 'utf8')

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 2,
})

const AHMED_CRM_ID = 'e0bd7980-2161-4139-9330-8cb340f92860'
const AHMED_MASTER_ID = '8b9b9d17-73b7-46ba-aee6-8c7a6d83405e'

try {
  console.log(`[apply-master-ids] running migration on ${useProd ? 'PROD' : 'DEV'} branch`)
  await pool.query(sql)
  console.log('[apply-master-ids] migration OK')

  // Verify columns
  const cols = await pool.query(`
    select table_name, column_name, data_type, is_nullable
      from information_schema.columns
     where table_schema = 'public'
       and (
         (table_name = 'customers' and column_name = 'master_customer_id') or
         (table_name = 'quotation_items' and column_name = 'master_product_id') or
         (table_name = 'deal_items' and column_name = 'master_product_id')
       )
     order by table_name, column_name`)
  console.log('[apply-master-ids] columns now present:')
  for (const r of cols.rows) {
    console.log(`  ${r.table_name}.${r.column_name}  ${r.data_type}  nullable=${r.is_nullable}`)
  }
  if (cols.rows.length !== 3) {
    console.error(`[apply-master-ids] FAIL: expected 3 columns, got ${cols.rows.length}`)
    process.exit(2)
  }

  // Backfill Ahmed master_customer_id
  const beforeRes = await pool.query(
    'select id, contact_name, master_customer_id from public.customers where id = $1',
    [AHMED_CRM_ID]
  )
  if (beforeRes.rows.length === 0) {
    console.warn(`[apply-master-ids] Ahmed CRM id ${AHMED_CRM_ID} not found in this DB; skipping backfill`)
  } else {
    const before = beforeRes.rows[0]
    console.log(`[apply-master-ids] Ahmed before: ${before.contact_name} master_customer_id=${before.master_customer_id ?? '<null>'}`)
    if (before.master_customer_id !== AHMED_MASTER_ID) {
      await pool.query(
        'update public.customers set master_customer_id = $1 where id = $2',
        [AHMED_MASTER_ID, AHMED_CRM_ID]
      )
      console.log('[apply-master-ids] Ahmed backfill UPDATE done')
    } else {
      console.log('[apply-master-ids] Ahmed already has correct master_customer_id, no-op')
    }
    const afterRes = await pool.query(
      'select id, contact_name, master_customer_id from public.customers where id = $1',
      [AHMED_CRM_ID]
    )
    const after = afterRes.rows[0]
    console.log(`[apply-master-ids] Ahmed after:  ${after.contact_name} master_customer_id=${after.master_customer_id}`)
    if (after.master_customer_id !== AHMED_MASTER_ID) {
      console.error('[apply-master-ids] FAIL: Ahmed master_customer_id mismatch after backfill')
      process.exit(3)
    }
  }

  console.log('[apply-master-ids] DONE')
} finally {
  await pool.end()
}
