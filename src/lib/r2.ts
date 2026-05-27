// Phase 4: R2 storage via Cloudflare R2 S3-compatible API.
// All CRM objects live under the `crm-arabgold/` prefix to keep blast radius
// separate from any future bucket sharing.
//
// Required env (set in .env.local + Vercel prod env):
//   R2_ACCOUNT_ID         — Cloudflare Account ID (from R2 dashboard)
//   R2_ACCESS_KEY_ID      — S3 access key id (R2 API Token output)
//   R2_SECRET_ACCESS_KEY  — S3 secret access key (R2 API Token output)
//   R2_BUCKET             — bucket name (e.g. arabgold-crm-attachments)
//   R2_PUBLIC_URL         — r2.dev public URL (e.g. https://pub-xxx.r2.dev)
//
// Public read: `${R2_PUBLIC_URL}/${key}` (bucket public-dev enabled; URL
// paths embed customerId + timestamp + random — obscurity is the access
// control, callers must not log raw URLs to untrusted sinks).

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'

const KEY_PREFIX = 'crm-arabgold/'

let _client: S3Client | null = null

function client(): S3Client {
  if (_client) return _client
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)')
  }
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return _client
}

function bucketName(): string {
  return process.env.R2_BUCKET ?? 'arabgold-crm-attachments'
}

function publicUrl(): string {
  const u = process.env.R2_PUBLIC_URL
  if (!u) throw new Error('R2_PUBLIC_URL not configured')
  return u.replace(/\/$/, '')
}

export function isR2Configured(): boolean {
  return (
    !!process.env.R2_ACCOUNT_ID &&
    !!process.env.R2_ACCESS_KEY_ID &&
    !!process.env.R2_SECRET_ACCESS_KEY &&
    !!process.env.R2_PUBLIC_URL
  )
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
  let bodyBuf: Buffer
  if (body instanceof Blob) {
    bodyBuf = Buffer.from(await body.arrayBuffer())
  } else if (body instanceof ArrayBuffer) {
    bodyBuf = Buffer.from(body)
  } else {
    bodyBuf = body
  }
  await client().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: bodyBuf,
      ContentType: opts?.contentType ?? 'application/octet-stream',
    })
  )
  return {
    key,
    path,
    url: `${publicUrl()}/${key}`,
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  const normalized = keys
    .filter((k): k is string => !!k && typeof k === 'string')
    .map((k) => toKey(k))
  if (normalized.length === 0) return
  await client().send(
    new DeleteObjectsCommand({
      Bucket: bucketName(),
      Delete: { Objects: normalized.map((Key) => ({ Key })) },
    })
  )
}
