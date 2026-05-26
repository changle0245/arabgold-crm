// 中台契约 PII 脱敏工具 — 任务简报 §F.CRM 红线 11 + §D.4
// 客户邮箱/电话/姓名等 PII 不允许进 export 明文;统一用 sha256 → hex 取前 16 字符
// 中台只能用这个值做去重/关联,无法还原原始 PII

import { createHash } from 'node:crypto'

export function hashPii(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  if (trimmed === '') return null
  return createHash('sha256').update(trimmed).digest('hex').slice(0, 16)
}
