// Phase 3b · /api/customer-avatars
//   POST — multipart upload of a customer avatar image to R2. Returns the
//          public URL so the client can drop it into the customer payload.
//          ACL: any signed-in user (avatars are uploaded during create/edit
//          flow which has its own ACL on the customer PATCH/POST).

import { type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth-helpers'
import { uploadObject, isR2Configured } from '@/lib/r2'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const r = await requireUser()
  if (r.error || !r.user) {
    return Response.json({ ok: false, error: r.error ?? '未登录' }, { status: r.status })
  }
  const user = r.user

  if (!isR2Configured()) {
    return Response.json({ ok: false, error: '存储未配置' }, { status: 500 })
  }

  const form = await request.formData().catch(() => null)
  if (!form) return Response.json({ ok: false, error: '请求格式错误' }, { status: 400 })
  const file = form.get('file') as File | null
  if (!file) return Response.json({ ok: false, error: '缺少文件' }, { status: 400 })
  if (!(file.type || '').startsWith('image/')) {
    return Response.json({ ok: false, error: '仅支持图片' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const path = `avatars/${user.id}/${Date.now()}.${ext}`

  try {
    const result = await uploadObject(
      'customer-attachments',
      path,
      await file.arrayBuffer(),
      { contentType: file.type || 'image/jpeg' }
    )
    return Response.json({ ok: true, data: { url: result.url, path } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ ok: false, error: '上传失败: ' + msg }, { status: 500 })
  }
}
