import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SITE_ID, guardHmac, jsonOk, jsonError } from '@/lib/middleground/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 进程启动时间(serverless 冷启动语义,契约 §10.1 示例)
const PROCESS_STARTED_AT = Math.floor(Date.now() / 1000)

export async function GET(request: NextRequest) {
  const denied = guardHmac(request)
  if (denied) return denied

  // 探一次 Supabase 连通性
  let dbStatus: 'ok' | 'down' = 'ok'
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('profiles').select('id', { count: 'exact', head: true }).limit(1)
    if (error) dbStatus = 'down'
  } catch {
    dbStatus = 'down'
  }

  if (dbStatus === 'down') {
    return jsonError('E_DEPENDENCY_DOWN', 'database unreachable', { dependency: 'database' })
  }

  return jsonOk({
    version: 'v1',
    site_id: SITE_ID(),
    uptime_seconds: Math.max(0, Math.floor(Date.now() / 1000) - PROCESS_STARTED_AT),
    dependencies: {
      database: dbStatus,
      external_apis: 'ok',
    },
  })
}
