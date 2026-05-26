// 翻译服务抽象层
// 用法：
//   import { getTranslator } from '@/lib/translator'
//   const t = getTranslator()
//   const zh = await t.translate('Hello world')
//
// 当前实现：
//   - aliyun: 阿里云机器翻译（HMAC-SHA1 签名，需要 ALIYUN_ACCESS_KEY_ID/SECRET）
//   - tencent: 腾讯云翻译（待实现）
//   - stub: 默认，返回 null（未配置 key 时不阻塞业务，content 入库仅原文）
//
// 由 .env.local 控制 provider：
//   TRANSLATION_PROVIDER=aliyun
//   ALIYUN_ACCESS_KEY_ID=...
//   ALIYUN_ACCESS_KEY_SECRET=...

import crypto from 'crypto'

export interface Translator {
  // 返回 null 表示翻译失败（业务侧应保留原文，不阻塞）
  translate(text: string, opts?: { sourceLang?: string; targetLang?: string }): Promise<string | null>
}

class StubTranslator implements Translator {
  async translate(): Promise<string | null> {
    return null
  }
}

class AliyunTranslator implements Translator {
  constructor(private accessKeyId: string, private accessKeySecret: string) {}

  async translate(text: string, opts: { sourceLang?: string; targetLang?: string } = {}): Promise<string | null> {
    const sourceLang = opts.sourceLang || 'auto'
    const targetLang = opts.targetLang || 'zh'
    try {
      const params: Record<string, string> = {
        AccessKeyId: this.accessKeyId,
        Action: 'TranslateGeneral',
        Format: 'JSON',
        FormatType: 'text',
        Scene: 'general',
        SignatureMethod: 'HMAC-SHA1',
        SignatureNonce: Date.now() + Math.random().toString(36).slice(2),
        SignatureVersion: '1.0',
        SourceLanguage: sourceLang,
        SourceText: text,
        TargetLanguage: targetLang,
        Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), // L14: 阿里云签名要求无毫秒 ISO8601
        Version: '2018-10-12',
      }
      const sortedKeys = Object.keys(params).sort()
      const canonical = sortedKeys
        .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
        .join('&')
      const stringToSign = 'POST&%2F&' + encodeURIComponent(canonical)
      const signature = crypto
        .createHmac('sha1', this.accessKeySecret + '&')
        .update(stringToSign)
        .digest('base64')
      params.Signature = signature

      const body = new URLSearchParams(params).toString()
      const res = await fetch('https://mt.cn-hangzhou.aliyuncs.com/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      if (!res.ok) return null
      const data = await res.json() as { Data?: { Translated?: string }; Code?: string }
      if (data.Code && data.Code !== '200') return null
      return data.Data?.Translated || null
    } catch {
      return null
    }
  }
}

let cached: Translator | null = null

export function getTranslator(): Translator {
  if (cached) return cached
  const provider = process.env.TRANSLATION_PROVIDER
  if (provider === 'aliyun' && process.env.ALIYUN_ACCESS_KEY_ID && process.env.ALIYUN_ACCESS_KEY_SECRET) {
    cached = new AliyunTranslator(process.env.ALIYUN_ACCESS_KEY_ID, process.env.ALIYUN_ACCESS_KEY_SECRET)
  } else {
    cached = new StubTranslator()
  }
  return cached
}

export async function translateBatch(texts: string[]): Promise<(string | null)[]> {
  const t = getTranslator()
  // 限制并发，避免触发 API rate limit
  const CONCURRENCY = 5
  const results: (string | null)[] = new Array(texts.length).fill(null)
  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const batch = texts.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(text => (text && text.trim()) ? t.translate(text) : Promise.resolve(null))
    )
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j]
    }
  }
  return results
}
