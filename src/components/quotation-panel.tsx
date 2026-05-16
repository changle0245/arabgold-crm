'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './auth-provider'
import type { Quotation, QuotationItem } from '@/lib/types'
import {
  QUOTATION_STATUS_LABELS, QUOTATION_STATUSES, CURRENCIES, INCOTERMS, PRODUCT_CATEGORIES,
} from '@/lib/constants'
import { Plus, ChevronDown, ChevronRight, Copy, Trash2, Pencil, Package, Printer } from 'lucide-react'

interface Props {
  customerId: string
  quotations: Quotation[]
  canEdit: boolean
  onRefresh: () => void
  onConvertToDeal?: (q: Quotation) => void
}

const emptyItem = (): Partial<QuotationItem> => ({
  product_name: '', spec: '', quantity: 1, unit: '件', unit_price: 0, amount: 0, remark: '',
})

export function QuotationPanel({ customerId, quotations, canEdit, onRefresh, onConvertToDeal }: Props) {
  const { profile } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // form state
  const [currency, setCurrency] = useState('USD')
  const [tradeTerms, setTradeTerms] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Partial<QuotationItem>[]>([emptyItem()])

  // for "new version" mode
  const [parentId, setParentId] = useState<string | null>(null)
  const [parentVersion, setParentVersion] = useState(0)

  // for edit mode (mutually exclusive with new-version mode)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingVersion, setEditingVersion] = useState<number>(0)

  function resetForm() {
    setCurrency('USD')
    setTradeTerms('')
    setValidUntil('')
    setNotes('')
    setItems([emptyItem()])
    setParentId(null)
    setParentVersion(0)
    setEditingId(null)
    setEditingVersion(0)
  }

  function updateItem(idx: number, field: string, value: string | number) {
    setItems(prev => {
      const next = [...prev]
      const item = { ...next[idx], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        item.amount = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
      }
      next[idx] = item
      return next
    })
  }

  function removeItem(idx: number) {
    if (items.length <= 1) return
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function loadItemsInto(quotationId: string) {
    const supabase = createClient()
    const { data: prevItems } = await supabase
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('id')
    if (prevItems && prevItems.length > 0) {
      setItems(prevItems.map(it => ({
        product_name: it.product_name, spec: it.spec, quantity: it.quantity,
        unit: it.unit, unit_price: it.unit_price, amount: it.amount, remark: it.remark,
      })))
    } else {
      setItems([emptyItem()])
    }
  }

  async function startNewVersion(q: Quotation) {
    resetForm()
    setParentId(q.parent_id || q.id)
    setParentVersion(q.version)
    setCurrency(q.currency)
    setTradeTerms(q.trade_terms || '')
    setValidUntil(q.valid_until || '')
    setNotes(q.notes || '')
    setShowForm(true)
    await loadItemsInto(q.id)
  }

  async function startEdit(q: Quotation) {
    resetForm()
    setEditingId(q.id)
    setEditingVersion(q.version)
    setCurrency(q.currency)
    setTradeTerms(q.trade_terms || '')
    setValidUntil(q.valid_until || '')
    setNotes(q.notes || '')
    setShowForm(true)
    await loadItemsInto(q.id)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()

    const validItems = items.filter(it => it.product_name && Number(it.amount) > 0)
    if (validItems.length === 0) {
      alert('请至少填写一行有效明细（产品名称 + 数量 + 单价）')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const totalAmount = validItems.reduce((s, it) => s + (Number(it.amount) || 0), 0)

    if (editingId) {
      // EDIT existing quotation: update header, replace items
      const { error: qErr } = await supabase.from('quotations').update({
        trade_terms: tradeTerms || null,
        currency,
        total_amount: totalAmount,
        valid_until: validUntil || null,
        notes: notes || null,
      }).eq('id', editingId)

      if (qErr) {
        alert('保存失败: ' + qErr.message)
        setSaving(false)
        return
      }

      const { error: delErr } = await supabase
        .from('quotation_items')
        .delete()
        .eq('quotation_id', editingId)

      if (delErr) {
        alert('明细更新失败: ' + delErr.message)
        setSaving(false)
        return
      }

      const lineItems = validItems.map(it => ({
        quotation_id: editingId,
        product_name: it.product_name,
        spec: it.spec || null,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || '件',
        unit_price: Number(it.unit_price) || 0,
        amount: Number(it.amount) || 0,
        remark: it.remark || null,
      }))
      await supabase.from('quotation_items').insert(lineItems)
    } else {
      // INSERT new quotation (either first version or new version of an existing chain)
      const version = parentId ? parentVersion + 1 : 1

      const { data: q, error } = await supabase.from('quotations').insert({
        customer_id: customerId,
        version,
        trade_terms: tradeTerms || null,
        currency,
        total_amount: totalAmount,
        valid_until: validUntil || null,
        status: 'draft',
        notes: notes || null,
        parent_id: parentId,
        created_by: profile!.id,
      }).select().single()

      if (error || !q) {
        alert('保存失败: ' + (error?.message || '未知错误'))
        setSaving(false)
        return
      }

      const lineItems = validItems.map(it => ({
        quotation_id: q.id,
        product_name: it.product_name,
        spec: it.spec || null,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || '件',
        unit_price: Number(it.unit_price) || 0,
        amount: Number(it.amount) || 0,
        remark: it.remark || null,
      }))
      if (lineItems.length > 0) {
        await supabase.from('quotation_items').insert(lineItems)
      }
    }

    setSaving(false)
    setShowForm(false)
    resetForm()
    onRefresh()
  }

  async function updateStatus(quotationId: string, status: string) {
    const supabase = createClient()
    const { error } = await supabase.from('quotations').update({ status }).eq('id', quotationId)
    if (error) {
      alert('状态更新失败: ' + error.message)
      return
    }
    onRefresh()
  }

  async function deleteQuotation(q: Quotation) {
    const supabase = createClient()
    // Block deleting a version that has child versions
    const { data: children } = await supabase
      .from('quotations')
      .select('id, version')
      .eq('parent_id', q.id)
    if (children && children.length > 0) {
      alert(`该报价有 ${children.length} 个新版本，请先删除新版本再删除此版本。`)
      return
    }
    if (!confirm(`确定删除报价 ${q.quote_no} V${q.version}？此操作不可恢复。`)) return

    const { error } = await supabase.from('quotations').delete().eq('id', q.id)
    if (error) {
      alert('删除失败: ' + error.message)
      return
    }
    onRefresh()
  }

  // Group quotations by chain (parent_id or self)
  const chains = new Map<string, Quotation[]>()
  quotations.forEach(q => {
    const key = q.parent_id || q.id
    if (!chains.has(key)) chains.set(key, [])
    chains.get(key)!.push(q)
  })
  chains.forEach(arr => arr.sort((a, b) => b.version - a.version))

  const formTitle = editingId
    ? `编辑报价 V${editingVersion}`
    : parentId
      ? `新版本 (V${parentVersion + 1})`
      : '新建报价'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">报价管理</h2>
        {canEdit && (
          <button
            onClick={() => { resetForm(); setShowForm(!showForm) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 transition-colors cursor-pointer"
          >
            <Plus size={14} />
            新建报价
          </button>
        )}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <form onSubmit={handleSave} className="mb-4 p-4 bg-gray-50 rounded-lg space-y-4">
          <h3 className="text-sm font-medium text-gray-800">{formTitle}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">货币</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">贸易条款</label>
              <select value={tradeTerms} onChange={e => setTradeTerms(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
                <option value="">选择...</option>
                {INCOTERMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">有效期至</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500" />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500 font-medium">明细行</label>
              <button type="button" onClick={() => setItems(prev => [...prev, emptyItem()])}
                className="text-xs text-gold-600 hover:text-gold-700 cursor-pointer">+ 添加行</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-left text-xs">
                    <th className="py-1 px-1">产品名称</th>
                    <th className="py-1 px-1">规格</th>
                    <th className="py-1 px-1 w-20">数量</th>
                    <th className="py-1 px-1 w-16">单位</th>
                    <th className="py-1 px-1 w-24">单价</th>
                    <th className="py-1 px-1 w-24">金额</th>
                    <th className="py-1 px-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-1 px-1">
                        <input list="product-list" value={item.product_name || ''} onChange={e => updateItem(idx, 'product_name', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gold-500" />
                      </td>
                      <td className="py-1 px-1">
                        <input value={item.spec || ''} onChange={e => updateItem(idx, 'spec', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gold-500" />
                      </td>
                      <td className="py-1 px-1">
                        <input type="number" min="0" value={item.quantity ?? ''} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gold-500" />
                      </td>
                      <td className="py-1 px-1">
                        <input value={item.unit || '件'} onChange={e => updateItem(idx, 'unit', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gold-500" />
                      </td>
                      <td className="py-1 px-1">
                        <input type="number" min="0" step="0.01" value={item.unit_price ?? ''} onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gold-500" />
                      </td>
                      <td className="py-1 px-1 text-right font-medium text-gray-700">
                        {(Number(item.amount) || 0).toFixed(2)}
                      </td>
                      <td className="py-1 px-1">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200">
                    <td colSpan={5} className="py-2 px-1 text-right text-xs text-gray-500 font-medium">合计</td>
                    <td className="py-2 px-1 text-right font-bold text-gray-900">
                      {currency} {items.reduce((s, it) => s + (Number(it.amount) || 0), 0).toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <datalist id="product-list">
              {PRODUCT_CATEGORIES.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">备注</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
              placeholder="付款条件、交期等补充说明..." />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-gold-600 text-white rounded-lg text-sm hover:bg-gold-700 disabled:opacity-50 cursor-pointer">
              {saving ? '保存中...' : (editingId ? '保存修改' : '保存报价')}
            </button>
            <button type="button" onClick={() => { setShowForm(false); resetForm() }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">取消</button>
          </div>
        </form>
      )}

      {/* Quotation list */}
      {quotations.length === 0 ? (
        <p className="text-sm text-gray-400">暂无报价记录</p>
      ) : (
        <div className="space-y-2">
          {Array.from(chains.entries()).map(([chainId, versions]) => {
            const latest = versions[0]
            const expanded = expandedId === chainId
            return (
              <div key={chainId} className="border border-gray-100 rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedId(expanded ? null : chainId)}
                >
                  {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{latest.quote_no}</span>
                      <StatusBadge status={latest.status} />
                      {versions.length > 1 && (
                        <span className="text-xs text-gray-400">{versions.length} 个版本</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {latest.currency} {latest.total_amount?.toFixed(2) || '0.00'}
                      {latest.trade_terms && <span className="ml-2">{latest.trade_terms}</span>}
                      <span className="ml-2">{latest.created_at.split('T')[0]}</span>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      {onConvertToDeal && latest.status !== 'rejected' && (
                        <button
                          onClick={e => { e.stopPropagation(); onConvertToDeal(latest) }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-green-700 border border-green-200 rounded hover:bg-green-50 transition-colors cursor-pointer"
                          title="客户确认订单 → 转为成交记录"
                        >
                          <Package size={12} />
                          转为成交
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); startNewVersion(latest) }}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gold-600 border border-gold-200 rounded hover:bg-gold-50 transition-colors cursor-pointer"
                        title="客户还价 → 新建一版"
                      >
                        <Copy size={12} />
                        新版本
                      </button>
                    </div>
                  )}
                </div>

                {expanded && (
                  <div className="border-t border-gray-100">
                    {versions.map(v => (
                      <QuotationDetail
                        key={v.id}
                        quotation={v}
                        canEdit={canEdit}
                        onEdit={() => startEdit(v)}
                        onDelete={() => deleteQuotation(v)}
                        onStatusChange={status => updateStatus(v.id, status)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface QuotationDetailProps {
  quotation: Quotation
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (status: string) => void
}

function QuotationDetail({ quotation: q, canEdit, onEdit, onDelete, onStatusChange }: QuotationDetailProps) {
  const [items, setItems] = useState<QuotationItem[]>([])
  const [loaded, setLoaded] = useState(false)

  async function loadItems() {
    if (loaded) return
    const supabase = createClient()
    const { data } = await supabase
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', q.id)
      .order('id')
    setItems(data || [])
    setLoaded(true)
  }

  // auto-load when rendered
  if (!loaded) loadItems()

  return (
    <div className="p-3 bg-gray-50 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-medium text-gray-600">V{q.version}</span>
        <StatusBadge status={q.status} />
        <span className="text-xs text-gray-400">{q.created_at.split('T')[0]}</span>
        {q.valid_until && <span className="text-xs text-gray-400">有效期至 {q.valid_until}</span>}
        {q.creator && <span className="text-xs text-gray-400">{q.creator.full_name}</span>}
        <div className="ml-auto flex items-center gap-1">
          <a
            href={`/quotations/${q.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-gray-400 hover:text-gold-600 cursor-pointer"
            title="打印 / 导出 PDF"
          >
            <Printer size={13} />
          </a>
          {canEdit && (
            <>
              <select
                value={q.status}
                onChange={e => onStatusChange(e.target.value)}
                className="px-2 py-0.5 border border-gray-200 rounded text-xs text-gray-600 focus:outline-none cursor-pointer bg-white"
                title="修改状态"
              >
                {QUOTATION_STATUSES.map(s => <option key={s} value={s}>{QUOTATION_STATUS_LABELS[s]}</option>)}
              </select>
              <button
                type="button"
                onClick={onEdit}
                className="p-1 text-gray-400 hover:text-gold-600 cursor-pointer"
                title="编辑此版本"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                title="删除此版本"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>
      {items.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="py-1">产品</th>
              <th className="py-1">规格</th>
              <th className="py-1 text-right">数量</th>
              <th className="py-1 text-right">单价</th>
              <th className="py-1 text-right">金额</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} className="text-gray-600">
                <td className="py-0.5">{it.product_name}</td>
                <td className="py-0.5">{it.spec || '-'}</td>
                <td className="py-0.5 text-right">{it.quantity} {it.unit}</td>
                <td className="py-0.5 text-right">{it.unit_price?.toFixed(2)}</td>
                <td className="py-0.5 text-right">{it.amount?.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 font-medium text-gray-800">
              <td colSpan={4} className="py-1 text-right">合计</td>
              <td className="py-1 text-right">{q.currency} {q.total_amount?.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      {q.notes && <p className="text-xs text-gray-500 mt-1">{q.notes}</p>}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
    expired: 'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {QUOTATION_STATUS_LABELS[status] || status}
    </span>
  )
}
