import { NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth-helpers'
import { getPublicObjectUrl, isR2Configured } from '@/lib/r2'

const BUCKET = 'communication-files'

function normalizePath(raw: string): string {
  const marker = `/${BUCKET}/`
  const i = raw.indexOf(marker)
  return i >= 0 ? raw.slice(i + marker.length) : raw
}

export async function GET(request: NextRequest) {
  const r = await requireUser()
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status })

  const raw = request.nextUrl.searchParams.get('path')
  if (!raw) return Response.json({ error: '缺少 path 参数' }, { status: 400 })

  if (!isR2Configured()) {
    return Response.json({ error: '附件存储未配置 (R2 env 缺失)' }, { status: 503 })
  }

  // Auth check passed → redirect to the R2 public URL. Keys are namespaced
  // under crm-arabgold/communication-files and embed customerId+timestamp+random,
  // so direct URL access requires possession of the row from DB (which already
  // enforces ownership rules elsewhere).
  return Response.redirect(getPublicObjectUrl(BUCKET, normalizePath(raw)), 302)
}
