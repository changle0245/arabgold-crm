'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './auth-provider'
import type { Reminder, Profile } from '@/lib/types'
import { REMINDER_TYPES, REMINDER_TYPE_LABELS } from '@/lib/constants'
import { Bell, Check, X, Plus, Clock } from 'lucide-react'

interface Props {
  customerId: string
  reminders: Reminder[]
  members: Profile[]
  canEdit: boolean
  onRefresh: () => void
}

function daysFromNow(dateStr: string | null): number {
  if (!dateStr) return 0
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export function ReminderPanel({ customerId, reminders, members, canEdit, onRefresh }: Props) {
  const { profile } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const [type, setType] = useState('follow_up')
  const [dueDate, setDueDate] = useState(today)
  const [note, setNote] = useState('')
  const [assignedTo, setAssignedTo] = useState(profile?.id || '')

  const pending = reminders.filter(r => r.status === 'pending')
  const overdue = pending.filter(r => daysFromNow(r.due_date) < 0)
  const done = reminders.filter(r => r.status !== 'pending')

  function resetForm() {
    setType('follow_up')
    setDueDate(today)
    setNote('')
    setAssignedTo(profile?.id || '')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!dueDate) { alert('请选择到期日'); return }
    if (dueDate < today) {
      alert('到期日不能早于今天')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('reminders').insert({
      customer_id: customerId,
      assigned_to: assignedTo || profile!.id,
      type,
      due_date: dueDate,
      status: 'pending',
      note: note || null,
      created_by: profile!.id,
    })
    setSaving(false)
    if (error) { alert('保存失败: ' + error.message); return }
    setShowForm(false)
    resetForm()
    onRefresh()
  }

  async function markStatus(id: string, status: string) {
    const supabase = createClient()
    await supabase.from('reminders').update({ status }).eq('id', id)
    onRefresh()
  }

  async function postpone(id: string, days: number) {
    const supabase = createClient()
    const r = reminders.find(x => x.id === id)
    if (!r?.due_date) return
    const next = new Date(r.due_date)
    next.setDate(next.getDate() + days)
    await supabase.from('reminders').update({ due_date: next.toISOString().split('T')[0] }).eq('id', id)
    onRefresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">待办提醒</h2>
          {pending.length > 0 && (
            <span className="text-xs text-gray-400">
              {pending.length} 待办
              {overdue.length > 0 && (
                <span className="ml-1 text-red-500 font-medium">· {overdue.length} 逾期</span>
              )}
            </span>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => { resetForm(); setShowForm(!showForm) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 cursor-pointer"
          >
            <Plus size={14} />
            新建提醒
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">类型</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
                {REMINDER_TYPES.map(t => <option key={t} value={t}>{REMINDER_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">到期日 *</label>
              <input type="date" value={dueDate} min={today} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500" required />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">指派给</label>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">备注</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
              placeholder="提醒事项..." />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-gold-600 text-white rounded-lg text-sm hover:bg-gold-700 disabled:opacity-50 cursor-pointer">
              {saving ? '保存中...' : '保存'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); resetForm() }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">取消</button>
          </div>
        </form>
      )}

      {pending.length === 0 && done.length === 0 ? (
        <p className="text-sm text-gray-400">暂无提醒</p>
      ) : (
        <div className="space-y-2">
          {pending.map(r => {
            const days = daysFromNow(r.due_date)
            const isOverdue = days < 0
            const isToday = days === 0
            return (
              <div key={r.id} className={`flex items-start gap-2 p-3 rounded-lg border ${isOverdue ? 'border-red-200 bg-red-50' : isToday ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'}`}>
                <Bell size={14} className={`mt-0.5 shrink-0 ${isOverdue ? 'text-red-500' : isToday ? 'text-amber-500' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{REMINDER_TYPE_LABELS[r.type] || r.type}</span>
                    <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : isToday ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                      {r.due_date} {isOverdue ? `(逾期 ${-days} 天)` : isToday ? '(今天)' : `(${days} 天后)`}
                    </span>
                    {r.assignee && <span className="text-xs text-gray-400">{r.assignee.full_name}</span>}
                  </div>
                  {r.note && <p className="text-xs text-gray-600 mt-1">{r.note}</p>}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => postpone(r.id, 1)} title="推迟1天"
                      className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                      <Clock size={14} />
                    </button>
                    <button onClick={() => markStatus(r.id, 'completed')} title="标记完成"
                      className="p-1 text-green-500 hover:text-green-700 cursor-pointer">
                      <Check size={14} />
                    </button>
                    <button onClick={() => markStatus(r.id, 'cancelled')} title="取消"
                      className="p-1 text-gray-400 hover:text-red-500 cursor-pointer">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {done.length > 0 && (
            <details className="text-xs">
              <summary className="text-gray-400 cursor-pointer hover:text-gray-600 py-2">已完成/已取消 ({done.length})</summary>
              <div className="space-y-1 mt-1">
                {done.map(r => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400">
                    <span className={r.status === 'completed' ? 'line-through' : ''}>
                      {REMINDER_TYPE_LABELS[r.type] || r.type} · {r.due_date}
                    </span>
                    {r.note && <span className="line-through">— {r.note}</span>}
                    <span className="ml-auto">{r.status === 'completed' ? '已完成' : '已取消'}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
