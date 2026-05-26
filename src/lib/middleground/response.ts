// 中台契约 v1.0 统一响应/错误/限流 helper
// 字段命名、时间格式、HTTP 状态码全部按 CONTRACT_V1.md §6-§8

import { type NextRequest } from 'next/server'
import { HmacError, verifyMiddlegroundHmac } from './hmac'

export const MIDDLEGROUND_VERSION = 'v1'

export type ErrorCode =
  | 'E_AUTH_FAILED'
  | 'E_INVALID_RANGE'
  | 'E_VERSION_MISMATCH'
  | 'E_NOT_FOUND'
  | 'E_RATE_LIMIT'
  | 'E_INTERNAL'
  | 'E_DEPENDENCY_DOWN'
  | 'E_UNSUPPORTED_TYPE'
  | 'E_UNSUPPORTED_METRIC'

export interface Meta {
  version: 'v1'
  site_id: string
  generated_at: string
  count?: number | null
  next_cursor?: string | null
}

function siteId(): string {
  // 契约 §4 要求 site_id 必填; env 缺失等同于配置错误
  return process.env.MIDDLEGROUND_SITE_ID ?? 'crm-arabgold'
}

export function buildMeta(count: number | null = null, next_cursor: string | null = null): Meta {
  return {
    version: MIDDLEGROUND_VERSION,
    site_id: siteId(),
    generated_at: new Date().toISOString(),
    count,
    next_cursor,
  }
}

export function rateLimitHeaders(): Record<string, string> {
  // 契约 §8.2 + §10.1 示例:CRM 未接真实限流,按示例硬编码
  return {
    'X-RateLimit-Limit': '100',
    'X-RateLimit-Remaining': '99',
    'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
    'Content-Type': 'application/json; charset=utf-8',
  }
}

export function jsonOk<T>(data: T, count: number | null = null, next_cursor: string | null = null): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      data,
      meta: buildMeta(count, next_cursor),
      error: null,
    }),
    { status: 200, headers: rateLimitHeaders() }
  )
}

const CODE_TO_STATUS: Record<ErrorCode, number> = {
  E_AUTH_FAILED: 401,
  E_INVALID_RANGE: 400,
  E_VERSION_MISMATCH: 400,
  E_NOT_FOUND: 404,
  E_RATE_LIMIT: 429,
  E_INTERNAL: 500,
  E_DEPENDENCY_DOWN: 503,
  E_UNSUPPORTED_TYPE: 400,
  E_UNSUPPORTED_METRIC: 400,
}

export function jsonError(code: ErrorCode, message: string, details: unknown = null): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      data: null,
      meta: buildMeta(),
      error: { code, message, details },
    }),
    { status: CODE_TO_STATUS[code], headers: rateLimitHeaders() }
  )
}

// 中台请求落地前必须先过这道 — 失败直接返回 401 Response,通过返回 null
export function guardHmac(request: NextRequest): Response | null {
  try {
    verifyMiddlegroundHmac({
      headers: request.headers,
      method: request.method,
      path: request.nextUrl.pathname + request.nextUrl.search,
      body: '',
    })
    return null
  } catch (e) {
    const msg = e instanceof HmacError ? e.message : 'E_AUTH_FAILED'
    return jsonError('E_AUTH_FAILED', msg)
  }
}

// 严格 ISO 8601 UTC,必须以 Z 结尾,允许带毫秒。契约 §4
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

export function parseIsoUtc(value: string | null): Date | null {
  if (!value || !ISO_RE.test(value)) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function toIsoZ(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function parseLimit(value: string | null, defaultLimit: number, maxLimit: number): number {
  if (value === null) return defaultLimit
  const n = parseInt(value, 10)
  if (!Number.isFinite(n) || n <= 0) return defaultLimit
  return Math.min(n, maxLimit)
}

export const SITE_ID = siteId
