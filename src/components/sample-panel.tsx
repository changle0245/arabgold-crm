'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './auth-provider'
import type { Sample } from '@/lib/types'
import {
  SAMPLE_STATUS_LABELS, SAMPLE_STATUSES, CARRIERS, PRODUCT_CATEGORIES,
} from '@/lib/constants'
import { Plus, PackageCheck, Pencil, Trash2 } from 'lucide-react'
import { todayLocalISO } from '@/lib/dates'

interface Props {
  customerId: string
  samples: Sample[]
  canEdit: boolean
  onRefresh: () => void
}

export function SamplePanel({ customerId, samples, canEdit, onRefresh }: Props) {
  const { profile } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [sampleDesc, setSampleDesc] = useState('')
  const [sentDate, setSentDate] = useState(todayLocalISO())
  const [trackingNo, setTrackingNo] = useState('')
  const [carrier, setCarrier] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [cost, setCost] = useState('')

  // feedback form
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')

  function resetForm() {
    setSampleDesc('')
    setSentDate(todayLocalISO())
    setTrackingNo('')
    setCarrier('')
    setQuantity('1')
    setCost('')
    setEditingId(null)
  }

  function startEdit(s: Sample) {
    resetForm()
    setEditingId(s.id)
    setSampleDesc(s.sample_desc || '')
    setSentDate(s.sent_date || todayLocalISO())
    setTrackingNo(s.tracking_no || '')
    setCarrier(s.carrier || '')
    setQuantity(String(s.quantity ?? 1))
    setCost(s.cost != null ? String(s.cost) : '')
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!sampleDesc) { alert('请填写样品描述'); return }
    setSaving(true)
    const supabase = createClient()

    if (editingId) {
      const { error } = await supabase.from('samples').update({
        sample_desc: sampleDesc,
        sent_date: sentDate || null,
        tracking_no: trackingNo || null,
        carrier: carrier || null,
        quantity: Number(quantity) || 1,
        cost: cost ? Number(cost) : null,
      }).eq('id', editingId)

      if (error) {
        alert('保存失败: ' + error.message)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from('samples').insert({
        customer_id: customerId,
        sample_desc: sampleDesc,
        sent_date: sentDate || null,
        tracking_no: trackingNo || null,
        carrier: carrier || null,
        status: trackingNo ? 'sent' : 'pending',
        quantity: Number(quantity) || 1,
        cost: cost ? Number(cost) : null,
        created_by: profile!.id,
      })

      if (error) {
        alert('保存失败: ' + error.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setShowForm(false)
    resetForm()
    onRefresh()
  }

  async function updateStatus(sampleId: string, status: string) {
    const supabase = createClient()
    await supabase.from('samples').update({ status }).eq('id', sampleId)
    onRefresh()
  }

  async function saveFeedback(sampleId: string) {
    if (!feedbackText.trim()) return
    const supabase = createClient()
    await supabase.from('samples').update({
      feedback: feedbackText.trim(),
      feedback_date: todayLocalISO(),
      status: 'feedback_received',
    }).eq('id', sampleId)
    setFeedbackId(null)
    setFeedbackText('')
    onRefresh()
  }

  async function deleteSample(s: Sample) {
    if (!confirm(`确定删除寄样记录"${s.sample_desc}"？此操作不可恢复。`)) return
    const supabase = createClient()
    const { error } = await supabase.from('samples').delete().eq('id', s.id)
    if (error) {
      alert('删除失败: ' + error.message)
      return
    }
    onRefresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">样品管理</h2>
        {canEdit && (
          <button
            onClick={() => { resetForm(); setShowForm(!showForm) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 transition-colors cursor-pointer"
          >
            <Plus size={14} />
            登记寄样
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <h3 className="text-sm font-medium text-gray-800">
            {editingId ? '编辑寄样记录' : '新增寄样记录'}
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="col-span-2 lg:col-span-1">
              <label className="block text-xs text-gray-500 mb-1">样品描述 *</label>
              <input list="product-list-sample" value={sampleDesc} onChange={e => setSampleDesc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                placeholder="产品名称 / 规格..." required />
              <datalist id="product-list-sample">
                {PRODUCT_CATEGORIES.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">数量</label>
              <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">费用 (USD)</label>
              <input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                placeholder="免费则留空" />
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">寄出日期</label>
              <input type="date" value={sentDate} onChange={e => setSentDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">物流商</label>
              <select value={carrier} onChange={e => setCarrier(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
                <option value="">选择...</option>
                {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">物流单号</label>
              <input type="text" value={trackingNo} onChange={e => setTrackingNo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                placeholder="快递单号..." />
            </div>
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

      {samples.length === 0 ? (
        <p className="text-sm text-gray-400">暂无寄样记录</p>
      ) : (
        <div className="space-y-2">
          {samples.map(s => (
            <div key={s.id} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <PackageCheck size={14} className="text-gold-600" />
                <span className="text-sm font-medium text-gray-900">{s.sample_desc}</span>
                <SampleStatusBadge status={s.status} />
                {s.quantity > 1 && <span className="text-xs text-gray-400">x{s.quantity}</span>}
                {canEdit && (
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(s)}
                      className="p-1 text-gray-400 hover:text-gold-600 cursor-pointer"
                      title="编辑"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSample(s)}
                      className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                      title="删除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                {s.sent_date && <span>寄出 {s.sent_date}</span>}
                {s.carrier && <span>{s.carrier}</span>}
                {s.tracking_no && <span className="font-mono">{s.tracking_no}</span>}
                {s.cost != null && s.cost > 0 && <span>费用 ${s.cost}</span>}
                {s.creator && <span>{s.creator.full_name}</span>}
              </div>

              {/* Feedback */}
              {s.feedback && (
                <div className="mt-2 p-2 bg-green-50 rounded text-xs text-green-800">
                  <span className="font-medium">客户反馈</span> ({s.feedback_date}): {s.feedback}
                </div>
              )}

              {canEdit && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {!s.feedback && (
                    feedbackId === s.id ? (
                      <div className="flex gap-2 flex-1">
                        <input
                          type="text"
                          value={feedbackText}
                          onChange={e => setFeedbackText(e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gold-500"
                          placeholder="输入客户反馈..."
                          autoFocus
                        />
                        <button onClick={() => saveFeedback(s.id)}
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 cursor-pointer">保存</button>
                        <button onClick={() => { setFeedbackId(null); setFeedbackText('') }}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">取消</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setFeedbackId(s.id); setFeedbackText(s.feedback || '') }}
                        className="text-xs text-gold-600 hover:text-gold-700 cursor-pointer"
                      >
                        + 记录反馈
                      </button>
                    )
                  )}

                  <select
                    value={s.status}
                    onChange={e => updateStatus(s.id, e.target.value)}
                    className="ml-auto px-2 py-1 border border-gray-200 rounded text-xs text-gray-600 focus:outline-none cursor-pointer"
                  >
                    {SAMPLE_STATUSES.map(st => <option key={st} value={st}>{SAMPLE_STATUS_LABELS[st]}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SampleStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    received: 'bg-indigo-100 text-indigo-700',
    feedback_received: 'bg-green-100 text-green-700',
  }
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {SAMPLE_STATUS_LABELS[status] || status}
    </span>
  )
}
