// Phase 4: R2 storage — reuses the ArabGold Worker proxy
// (mute-hat-decearabgold-r2-proxy). All CRM objects live under the
// `crm-arabgold/` prefix to keep blast radius separate from arabgold main.
//
// Worker endpoints:
//   POST   /upload   formData(file, path)     — no auth, fire-and-forget
//   DELETE /delete   {keys: string[]}         — X-Admin-Token
//   GET    /list     ?prefix=&cursor=&limit=  — X-Admin-Token
//
// Public read: `${R2_PUBLIC_URL}/${key}` (bucket is public; URL paths
// embed customerId + timestamp + random, never expose without auth).

const KEY_PREFIX = 'crm-arabgold/'

function workerUrl(): string {
  const u = process.env.R2_WORKER_URL
  if (!u) throw new Error('R2_WORKER_URL not configured')
  return u.replace(/\/upload$/, '').replace(/\/$/, '')
}

function publicUrl(): string {
  const u = process.env.R2_PUBLIC_URL
  if (!u) throw new Error('R2_PUBLIC_URL not configured')
  return u.replace(/\/$/, '')
}

function adminToken(): string {
  const t = process.env.R2_ADMIN_TOKEN
  if (!t) throw new Error('R2_ADMIN_TOKEN not configured')
  return t
}

export function isR2Configured(): boolean {
  return !!process.env.R2_WORKER_URL && !!process.env.R2_PUBLIC_URL
}

function toKey(bucketOrPath: string, path?: string): string {
  const raw = path === undefined ? bucketOrPath : `${bucketOrPath}/${path}`
  const stripped = raw.replace(/^\/+/, '')
  if (stripped.startsWith(KEY_PREFIX)) return stripped
  return KEY_PREFIX + stripped
}

export function getPublicObjectUrl(bucket: string, path: string): string {
  return `${publicUrl()}/${toKey(bucket, path)}`
}

export interface UploadResult {
  key: string
  path: string
  url: string
}

export async function uploadObject(
  bucket: string,
  path: string,
  body: Blob | ArrayBuffer | Buffer,
  opts?: { contentType?: string }
): Promise<UploadResult> {
  const key = toKey(bucket, path)
  const form = new FormData()
  const blob =
    body instanceof Blob
      ? body
      : new Blob([body as unknown as BlobPart], {
          type: opts?.contentType ?? 'application/octet-stream',
        })
  form.append('file', blob, key.split('/').pop() || 'file')
  form.append('path', key)
  const res = await fetch(`${workerUrl()}/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`R2 upload failed: ${res.status} ${t.slice(0, 200)}`)
  }
  return {
    key,
    path,
    url: `${publicUrl()}/${key}`,
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  const normalized = keys
    .filter((k): k is string => !!k && typeof k === 'string')
    .map(k => toKey(k))
  if (normalized.length === 0) return
  const res = await fetch(`${workerUrl()}/delete`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken(),
    },
    body: JSON.stringify({ keys: normalized }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`R2 delete failed: ${res.status} ${t.slice(0, 200)}`)
  }
}
