#!/usr/bin/env node
// Seed / update an admin profile in Neon.
// Usage:   node scripts/seed-admin.mjs <email> [password]
// If password omitted, generates a random 12-char password and writes it to
// C:\temp\crm-admin-initial-password.txt (Windows) / /tmp/crm-admin-initial-password.txt.
// The new admin is marked must_change_password=true so the first login forces a reset.

import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const email = process.argv[2]
const explicitPassword = process.argv[3]

if (!email) {
  console.error('Usage: node scripts/seed-admin.mjs <email> [password]')
  process.exit(1)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

// Load .env.local manually so this script does not depend on Next dotenv loader.
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

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL missing (expected in .env.local)')
  process.exit(1)
}

const password = explicitPassword ?? crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12)
const hash = await bcrypt.hash(password, 12)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
})

try {
  const existing = await pool.query(
    'select id, full_name from public.profiles where lower(email) = lower($1) limit 1',
    [email]
  )

  let adminId
  if (existing.rows.length > 0) {
    adminId = existing.rows[0].id
    await pool.query(
      `update public.profiles
          set password_hash = $1,
              must_change_password = true,
              is_active = true,
              role = 'admin'
        where id = $2`,
      [hash, adminId]
    )
    console.log(`[seed-admin] UPDATED existing profile ${adminId} (${email}) -> admin, must_change_password=true`)
  } else {
    adminId = crypto.randomUUID()
    await pool.query(
      `insert into public.profiles
         (id, email, full_name, role, password_hash, must_change_password, is_active)
       values
         ($1, $2, $3, 'admin', $4, true, true)`,
      [adminId, email, email.split('@')[0], hash]
    )
    console.log(`[seed-admin] INSERTED new profile ${adminId} (${email}) -> admin, must_change_password=true`)
  }

  if (!explicitPassword) {
    const tempDir = process.platform === 'win32' ? 'C:\\temp' : '/tmp'
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
    const passFile = path.join(tempDir, 'crm-admin-initial-password.txt')
    fs.writeFileSync(passFile, password, { encoding: 'utf8' })
    console.log(`[seed-admin] initial password written to ${passFile}`)
    console.log(`[seed-admin] login as ${email} with that password, you'll be forced to change it on first login`)
  } else {
    console.log(`[seed-admin] password set from command-line argument (must_change_password still true)`)
  }
} finally {
  await pool.end()
}
