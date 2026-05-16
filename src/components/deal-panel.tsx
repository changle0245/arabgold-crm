'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './auth-provider'
import type { Deal, DealItem, Quotation } from '@/lib/types'
import {
  DEAL_STATUS_LABELS, DEAL_STATUSES, CURRENCIES, PAYMENT_PREFERENCES, PRODUCT_CATEGORIES,
} from '@/lib/constants'
import { Plus, Package, Check, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  customerId: string
  deals: Deal[]
  quotations: Quotation[]
  canEdit: boolean
  onRefresh: () => void
  prefillQuotation?: Quotation | null
  onPrefillConsumed?: () => void
}

const emptyItem = (): Partial<DealItem> => ({
  product_name: '', spec: '', quantity: 1, unit: '件', unit_price: 0, amount: 0, remark: '',
})

export function DealPanel({ customerId, deals, quotations, canEdit, onRefresh, prefillQuotation, onPrefillConsumed }: Props) {
  const { profile } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [dealDate, setDealDate] = useState(new Date().toISOString().split('T')[0])
  const [dealAmount, setDealAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [quotationId, setQuotationId] = useState('')
  const [notes, setNotes] = useState('')
  const [shippingDate, setShippingDate] = useState('')
  const [items, setItems] = useState<Partial<DealItem>[]>([])

  function resetForm() {
    setDealDate(new Date().toISOString().split('T')[0])
    setDealAmount('')
    setCurrency('USD')
    setPaymentMethod('')
    setQuotationId('')
    setNotes('')
    setShippingDate('')
    setItems([])
    setEditingId(null)
  }

  function updateItem(idx: number, field: keyof DealItem, value: string | number) {
    setItems(prev => {
      const next = [...prev]
      const it = { ...next[idx], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        it.amount = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
      }
      next[idx] = it
      return next
    })
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  // Suggest total = sum of items (only shown as hint; user can override)
  const itemsTotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0)

  // Prefill from converted quotation
  useEffect(() => {
    if (!prefillQuotation) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: qItems } = await supabase
        .from('quotation_items')
        .select('*')
        .eq('quotation_id', prefillQuotation.id)
        .order('id')

      if (cancelled) return

      setEditingId(null)
      setDealDate(new Date().toISOString().split('T')[0])
      setDealAmount(prefillQuotation.total_amount != null ? String(prefillQuotation.total_amount) : '')
      setCurrency(prefillQuotation.currency || 'USD')
      setPaymentMethod('')
      setQuotationId(prefillQuotation.id)
      setNotes('')
      setShippingDate('')
      setItems(
        (qItems || []).map(it => ({
          product_name: it.product_name,
          spec: it.spec,
          quantity: it.quantity,
          unit: it.unit || '件',
          unit_price: it.unit_price,
          amount: it.amount,
          remark: it.remark,
        }))
      )
      setShowForm(true)
      onPrefillConsumed?.()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillQuotation])

  async function startEdit(d: Deal) {
    resetForm()
    setEditingId(d.id)
    setDealDate(d.deal_date || new Date().toISOString().split('T')[0])
    setDealAmount(d.deal_amount != null ? String(d.deal_amount) : '')
    setCurrency(d.currency || 'USD')
    setPaymentMethod(d.payment_method || '')
    setQuotationId(d.quotation_id || '')
    setNotes(d.notes || '')
    setShippingDate(d.shipping_date || '')
    setShowForm(true)

    const supabase = createClient()
    const { data: existingItems } = await supabase
      .from('deal_items')
      .select('*')
      .eq('deal_id', d.id)
      .order('id')
    setItems(
      (existingItems || []).map(it => ({
        product_name: it.product_name,
        spec: it.spec,
        quantity: it.quantity,
        unit: it.unit || '件',
        unit_price: it.unit_price,
        amount: it.amount,
        remark: it.remark,
      }))
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!dealAmount) { alert('请填写成交金额'); return }
    setSaving(true)
    const supabase = createClient()

    const validItems = items.filter(it => it.product_name && (Number(it.amount) > 0 || Number(it.quantity) > 0))

    let dealId: string | null = null

    if (editingId) {
      const { error } = await supabase.from('deals').update({
        quotation_id: quotationId || null,
        deal_date: dealDate,
        deal_amount: Number(dealAmount),
        currency,
        payment_method: paymentMethod || null,
        notes: notes || null,
        shipping_date: shippingDate || null,
      }).eq('id', editingId)

      if (error) {
        alert('保存失败: ' + error.message)
        setSaving(false)
        return
      }
      dealId = editingId

      // Replace items
      const { error: delErr } = await supabase
        .from('deal_items')
        .delete()
        .eq('deal_id', editingId)
      if (delErr) {
        alert('明细更新失败: ' + delErr.message)
        setSaving(false)
        return
      }
    } else {
      const isReorder = deals.length > 0
      const { data: newDeal, error } = await supabase.from('deals').insert({
        customer_id: customerId,
        quotation_id: quotationId || null,
        deal_date: dealDate,
        deal_amount: Number(dealAmount),
        currency,
        payment_method: paymentMethod || null,
        status: 'pending',
        is_reorder: isReorder,
        notes: notes || null,
        shipping_date: shippingDate || null,
        created_by: profile!.id,
      }).select().single()

      if (error || !newDeal) {
        alert('保存失败: ' + (error?.message || '未知错误'))
        setSaving(false)
        return
      }
      dealId = newDeal.id
    }

    if (dealId && validItems.length > 0) {
      const lineItems = validItems.map(it => ({
        deal_id: dealId,
        product_name: it.product_name,
        spec: it.spec || null,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || '件',
        unit_price: Number(it.unit_price) || 0,
        amount: Number(it.amount) || 0,
        remark: it.remark || null,
      }))
      await supabase.from('deal_items').insert(lineItems)
    }

    setSaving(false)
    setShowForm(false)
    resetForm()
    onRefresh()
  }

  async function toggleField(dealId: string, field: 'deposit_received' | 'balance_received', current: boolean) {
    const supabase = createClient()
    await supabase.from('deals').update({ [field]: !current }).eq('id', dealId)
    onRefresh()
  }

  async function updateStatus(dealId: string, status: string) {
    const supabase = createClient()
    await supabase.from('deals').update({ status }).eq('id', dealId)
    onRefresh()
  }

  async function deleteDeal(d: Deal) {
    if (!confirm(`确定删除成交记录 ${d.deal_no}（${d.currency} ${d.deal_amount?.toFixed(2)}）？\n此操作不可恢复，客户累计成交数据会同步更新。`)) return
    const supabase = createClient()
    const { error } = await supabase.from('deals').delete().eq('id', d.id)
    if (error) {
      alert('删除失败: ' + error.message)
      return
    }
    onRefresh()
  }

  const totalByCurrency = deals.reduce<Record<string, number>>((acc, d) => {
    const cur = d.currency || 'USD'
    acc[cur] = (acc[cur] || 0) + (d.deal_amount || 0)
    return acc
  }, {})
  const totalSummary = Object.entries(totalByCurrency)
    .map(([cur, amt]) => `${cur} ${amt.toFixed(2)}`)
    .join(' · ')

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">成交记录</h2>
          {deals.length > 0 && (
            <span className="text-xs text-gray-400">
              {deals.length} 单 · 累计 {totalSummary}
            </span>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => { resetForm(); setShowForm(!showForm) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 transition-colors cursor-pointer"
          >
            <Plus size={14} />
            录入成交
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <h3 className="text-sm font-medium text-gray-800">
            {editingId ? '编辑成交记录' : '新增成交记录'}
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">成交日期 *</label>
              <input type="date" value={dealDate} onChange={e => setDealDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">成交金额 *</label>
              <input type="number" min="0" step="0.01" value={dealAmount} onChange={e => setDealAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                placeholder="0.00" required />
              {items.length > 0 && Math.abs(itemsTotal - (Number(dealAmount) || 0)) > 0.01 && (
                <p className="text-[10px] text-amber-600 mt-0.5">明细合计 {itemsTotal.toFixed(2)}，与上方金额不一致</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">货币</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">付款方式</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
                <option value="">选择...</option>
                {PAYMENT_PREFERENCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">关联报价</label>
              <select value={quotationId} onChange={e => setQuotationId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
                <option value="">不关联</option>
                {quotations.filter(q => q.status !== 'rejected').map(q => (
                  <option key={q.id} value={q.id}>{q.quote_no} (V{q.version})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">预计发货日</label>
              <input type="date" value={shippingDate} onChange={e => setShippingDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500" />
            </div>
          </div>

          {/* Line items (optional) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500 font-medium">
                成交明细 <span className="text-gray-400">（可选）</span>
              </label>
              <div className="flex items-center gap-2">
                {items.length > 0 && (
                  <button type="button"
                    onClick={() => setDealAmount(itemsTotal.toFixed(2))}
                    className="text-xs text-gray-500 hover:text-gold-700 cursor-pointer"
                    title="把明细合计填入上方金额">
                    用明细金额回填总额
                  </button>
                )}
                <button type="button" onClick={() => setItems(prev => [...prev, emptyItem()])}
                  className="text-xs text-gold-600 hover:text-gold-700 cursor-pointer">+ 添加明细</button>
              </div>
            </div>
            {items.length > 0 && (
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
                          <input list="deal-product-list" value={item.product_name || ''} onChange={e => updateItem(idx, 'product_name', e.target.value)}
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
                          <button type="button" onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 cursor-pointer">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td colSpan={5} className="py-2 px-1 text-right text-xs text-gray-500 font-medium">明细合计</td>
                      <td className="py-2 px-1 text-right font-bold text-gray-900">
                        {currency} {itemsTotal.toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
                <datalist id="deal-product-list">
                  {PRODUCT_CATEGORIES.map(p => <option key={p} value={p} />)}
                </datalist>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">备注</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
              placeholder="补充说明..." />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-gold-600 text-white rounded-lg text-sm hover:bg-gold-700 disabled:opacity-50 cursor-pointer">
              {saving ? '保存中...' : (editingId ? '保存修改' : '保存')}
            </button>
            <button type="button" onClick={() => { setShowForm(false); resetForm() }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">取消</button>
          </div>
        </form>
      )}

      {deals.length === 0 ? (
        <p className="text-sm text-gray-400">暂无成交记录</p>
      ) : (
        <div className="space-y-2">
          {deals.map(d => {
            const expanded = expandedId === d.id
            return (
              <div key={d.id} className="border border-gray-100 rounded-lg">
                <div className="p-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : d.id)}
                      className="text-gray-400 hover:text-gray-600 cursor-pointer"
                      title={expanded ? '收起' : '展开明细'}
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <Package size={14} className="text-gold-600" />
                    <span className="text-sm font-medium text-gray-900">{d.deal_no}</span>
                    <DealStatusBadge status={d.status} />
                    {d.is_reorder && <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">返单</span>}
                    {canEdit && (
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(d)}
                          className="p-1 text-gray-400 hover:text-gold-600 cursor-pointer"
                          title="编辑"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteDeal(d)}
                          className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                          title="删除"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap ml-6">
                    <span>{d.deal_date}</span>
                    <span className="font-medium text-gray-800">{d.currency} {d.deal_amount?.toFixed(2)}</span>
                    {d.payment_method && <span>{d.payment_method}</span>}
                    {d.shipping_date && <span>发货 {d.shipping_date}</span>}
                    {d.creator && <span>{d.creator.full_name}</span>}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-3 mt-2 flex-wrap ml-6">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <button type="button" onClick={() => toggleField(d.id, 'deposit_received', d.deposit_received)}
                          className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${d.deposit_received ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                          {d.deposit_received && <Check size={10} />}
                        </button>
                        <span className={d.deposit_received ? 'text-green-600' : 'text-gray-500'}>定金已收</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <button type="button" onClick={() => toggleField(d.id, 'balance_received', d.balance_received)}
                          className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${d.balance_received ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                          {d.balance_received && <Check size={10} />}
                        </button>
                        <span className={d.balance_received ? 'text-green-600' : 'text-gray-500'}>尾款已收</span>
                      </label>

                      <select
                        value={d.status}
                        onChange={e => updateStatus(d.id, e.target.value)}
                        className="ml-auto px-2 py-1 border border-gray-200 rounded text-xs text-gray-600 focus:outline-none cursor-pointer"
                      >
                        {DEAL_STATUSES.map(s => <option key={s} value={s}>{DEAL_STATUS_LABELS[s]}</option>)}
                      </select>
                    </div>
                  )}

                  {d.notes && <p className="text-xs text-gray-500 mt-1 ml-6">{d.notes}</p>}
                </div>

                {expanded && (
                  <DealItemsView dealId={d.id} currency={d.currency} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DealItemsView({ dealId, currency }: { dealId: string; currency: string }) {
  const [items, setItems] = useState<DealItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('deal_items')
        .select('*')
        .eq('deal_id', dealId)
        .order('id')
      if (!cancelled) setItems((data as DealItem[]) || [])
    })()
    return () => { cancelled = true }
  }, [dealId])

  if (items === null) return <div className="px-3 pb-3 text-xs text-gray-400">加载明细...</div>
  if (items.length === 0) {
    return <div className="px-3 pb-3 text-xs text-gray-400">此成交未录入明细</div>
  }

  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0)

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
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
            <td colSpan={4} className="py-1 text-right">明细合计</td>
            <td className="py-1 text-right">{currency} {total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function DealStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    in_production: 'bg-blue-100 text-blue-700',
    shipped: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {DEAL_STATUS_LABELS[status] || status}
    </span>
  )
}
