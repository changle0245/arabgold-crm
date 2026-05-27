import { Pool } from 'pg'

const globalForDb = globalThis as unknown as { _crmPool?: Pool }

export const db = globalForDb._crmPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

if (process.env.NODE_ENV !== 'production') globalForDb._crmPool = db
