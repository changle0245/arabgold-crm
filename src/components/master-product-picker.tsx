'use client'

// Phase 5C-follow1 · Quotation/Deal lineItem 产品选择器
// 替代原来的 <input list="product-list">,改为从中台 master_products 检索 + 选中后回填
// master_product_id,使报价/成交 lineItem 真正关联主数据(支撑跨站 LTV / 客户偏好分析)。
// 走 /api/master-products(NextAuth-gated proxy),不暴露 MASTER_PRODUCTS_READ_TOKEN 给浏览器。

import { useEffect, useRef, useState } from 'react'
import { Link2 } from 'lucide-react'
import type { MasterProduct } from '@/lib/master-products-client'

interface Props {
  value: string
  masterProductId: string | null
  onPick: (product: MasterProduct) => void
  onTextChange: (text: string) => void
}

const DEBOUNCE_MS = 200

export function MasterProductPicker({ value, masterProductId, onPick, onTextChange }: Props) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<MasterProduct[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const qs = new URLSearchParams()
        if (value.trim()) qs.set('search', value.trim())
        const resp = await fetch(`/api/master-products?${qs}`, { cache: 'no-store' })
        if (!resp.ok) {
          if (!cancelled) setResults([])
          return
        }
        const json = (await resp.json()) as { ok: boolean; data?: MasterProduct[] }
        if (!cancelled) setResults(json.ok && Array.isArray(json.data) ? json.data : [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [value, open])

  function handleChange(text: string) {
    onTextChange(text)
    if (!open) setOpen(true)
  }

  function handlePick(p: MasterProduct) {
    onPick(p)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1">
        <input
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="搜索 SKU / 名称…"
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
        {masterProductId && (
          <span
            className="shrink-0 text-emerald-600"
            title="已关联中台主数据"
          >
            <Link2 size={12} />
          </span>
        )}
      </div>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto text-xs">
          {loading && <div className="px-3 py-2 text-gray-400">加载中…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-gray-400">
              {value.trim() ? '无匹配，按当前文本作自定义产品保存' : '输入 SKU 或名称开始搜索'}
            </div>
          )}
          {!loading && results.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePick(p)}
              className="w-full text-left px-3 py-2 hover:bg-gold-50 border-b border-gray-50 last:border-b-0 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-gold-700">{p.sku}</span>
                <span className="text-gray-800">{p.name_zh || p.name_en || '(无名称)'}</span>
              </div>
              {p.name_en && p.name_zh && (
                <div className="text-gray-400 mt-0.5">{p.name_en}</div>
              )}
              {(p.category_slug || p.price_default !== null) && (
                <div className="flex items-center gap-2 text-gray-400 mt-0.5">
                  {p.category_slug && <span>{p.category_slug}</span>}
                  {p.price_default !== null && <span>默认 ¥{p.price_default}</span>}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
