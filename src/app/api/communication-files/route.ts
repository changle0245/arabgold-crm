import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

// GET /api/communication-files?path=<storage path | 旧版完整 public URL>
//
// M9: communication-files 桶已私有。此路由校验「已登录 + 在职」后,对目标
// 文件签发一个 5 分钟有效的签名 URL 并 302 跳转。上传路由现在存的是 path;
// 为兼容历史数据,也接受旧的完整 public URL 并从中抽取 path。

const BUCKET = 'communication-files'

function normalizePath(raw: string): string {
  // 旧行存的是完整 public URL：.../object/public/communication-files/<path>
  const marker = `/${BUCKET}/`
  const i = raw.indexOf(marker)
  return i >= 0 ? raw.slice(i + marker.length) : raw
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: '未登录' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', user.id)
    .single()
  if (!profile || profile.is_active === false) {
    return Response.json({ error: '账号已停用' }, { status: 403 })
  }

  const raw = request.nextUrl.searchParams.get('path')
  if (!raw) return Response.json({ error: '缺少 path 参数' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient.storage
    .from(BUCKET)
    .createSignedUrl(normalizePath(raw), 300)
  if (error || !data) {
    return Response.json({ error: '文件不存在或无法访问' }, { status: 404 })
  }
  return Response.redirect(data.signedUrl, 302)
}
