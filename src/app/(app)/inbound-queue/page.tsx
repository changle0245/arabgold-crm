'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import { Inbox, Search, Check, X, Filter, ExternalLink } from 'lucide-react'

interface QueueItem {
  id: string
  received_at: string
  to_alias: string | null
  to_email: string | null
  recipient_member: string | null
  from_email: string
  from_name: string | null
  subject: string | null
  content: string | null
  raw_meta: Record<string, unknown> | null
  attachments: { name: string; url: string }[] | null
  status: string
}

interface CustomerMatch {
  id: string
  contact_name: string
  company_name: string | null
  email: string | null
}

export default function InboundQueuePage() {
  const { profile, isAdmin, loading: authLoading } = useAuth()
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [scopeFilter, setScopeFilter] = useState<'mine' | 'all'>('mine')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'matched' | 'discarded' | 'all'>('pending')
  const [mergingId, setMergingId] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin) setScopeFilter('all')
  }, [isAdmin])

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    const supabase = createClient()
    let q = supabase
      .from('inbound_email_queue')
      .select('*')
      .order('received_at', { ascending: false })
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    if (scopeFilter === 'mine') q = q.eq('recipient_member', profile.id)
    const { data } = await q.limit(100)
    setItems((data as QueueItem[]) || [])
    setLoading(false)
  }, [profile?.id, statusFilter, scopeFilter])

  useEffect(() => { load() }, [load])

  async function handleDiscard(id: string) {
    if (!confirm('确定丢弃这封邮件？操作不可撤销（仅标记状态，记录保留供审计）')) return
    const res = await fetch(`/api/inbound-email-queue/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'discard' }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      alert('丢弃失败: ' + (data?.error || res.statusText))
      return
    }
    load()
  }

  if (authLoading) return <div className="p-6 text-gray-400">加载中...</div>
  if (loading && items.length === 0) return <div className="p-6 text-gray-400">加载中...</div>

  const mergingItem = items.find(i => i.id === mergingId)

  return (
    <div className="p-4 lg:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Inbox size={22} className="text-gold-600" />
          待归档邮件
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-gray-400" />
          {isAdmin && (
            <select
              value={scopeFilter}
              onChange={e => setScopeFilter(e.target.value as 'mine' | 'all')}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-gold-500 cursor-pointer"
            >
              <option value="mine">仅我的</option>
              <option value="all">全员</option>
            </select>
          )}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-gold-500 cursor-pointer"
          >
            <option value="pending">待处理</option>
            <option value="matched">已归并</option>
            <option value="discarded">已丢弃</option>
            <option value="all">全部</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3">
        webhook 解析后无法按发件邮箱自动匹配到客户的邮件会落到这里。点「归并」选择一个客户归档；
        或「丢弃」忽略（标记不删除）。
      </p>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
          {statusFilter === 'pending' ? '✓ 待处理队列已清空' : '无匹配记录'}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(it => (
            <div key={it.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {it.from_name ? `${it.from_name} <${it.from_email}>` : it.from_email}
                    </span>
                    <span className="text-xs text-gray-400">→ {it.to_email}</span>
                  </div>
                  {it.subject && (
                    <p className="text-sm text-gray-700 mt-0.5 font-medium">{it.subject}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(it.received_at).toLocaleString('zh-CN')}
                </span>
              </div>
              {it.content && (
                <p className="text-sm text-gray-600 mb-2 whitespace-pre-wrap line-clamp-3">
                  {it.content.slice(0, 300)}
                  {it.content.length > 300 && '...'}
                </p>
              )}
              {it.attachments && it.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2 text-xs">
                  {it.attachments.map(a => (
                    <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline">📎 {a.name}</a>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {it.status === 'pending' ? (
                  <>
                    <button
                      onClick={() => setMergingId(it.id)}
                      className="px-3 py-1.5 bg-gold-600 text-white text-xs rounded-lg hover:bg-gold-700 cursor-pointer flex items-center gap-1"
                    >
                      <Check size={12} /> 归并到客户
                    </button>
                    <button
                      onClick={() => handleDiscard(it.id)}
                      className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50 cursor-pointer flex items-center gap-1"
                    >
                      <X size={12} /> 丢弃
                    </button>
                  </>
                ) : (
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    it.status === 'matched' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {it.status === 'matched' ? '已归并' : '已丢弃'}
                  </span>
                )}
                <a
                  href={`/customers/new?prefill_email=${encodeURIComponent(it.from_email)}&prefill_name=${encodeURIComponent(it.from_name || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-gold-600 flex items-center gap-1"
                >
                  <ExternalLink size={12} /> 新建客户后再回来归并
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {mergingItem && (
        <MergeModal
          queueId={mergingItem.id}
          fromEmail={mergingItem.from_email}
          onClose={() => setMergingId(null)}
          onSuccess={() => {
            setMergingId(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function MergeModal({ queueId, fromEmail, onClose, onSuccess }: {
  queueId: string
  fromEmail: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<CustomerMatch[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // debounce search
  useEffect(() => {
    if (!query.trim()) { setCandidates([]); return }
    const handle = setTimeout(async () => {
      setSearching(true)
      const supabase = createClient()
      const s = `%${query.trim()}%`
      const { data } = await supabase
        .from('customers')
        .select('id, contact_name, company_name, email')
        .or(`contact_name.ilike.${s},company_name.ilike.${s},email.ilike.${s}`)
        .limit(10)
      setCandidates((data as CustomerMatch[]) || [])
      setSearching(false)
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  async function handleMerge() {
    if (!selectedId) { setError('请选择一个客户'); return }
    setError(null)
    setMerging(true)
    const res = await fetch(`/api/inbound-email-queue/${queueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'merge', customer_id: selectedId }),
    })
    setMerging(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error || '归并失败')
      return
    }
    onSuccess()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => { if (!merging) onClose() }}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <Inbox size={18} className="text-gold-600" />
          <h3 className="text-base font-semibold text-gray-900 flex-1">归并邮件到客户</h3>
          <button onClick={onClose} disabled={merging} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-3">
          发件人 <span className="font-mono text-gray-600">{fromEmail}</span> 没有匹配到客户。
          选择一个现有客户归并；归并后该邮件作为收件记录加入客户时间线，且客户的 email 字段不会自动更新（如需更新请去客户编辑页）。
        </p>

        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索客户名 / 公司名 / 邮箱..."
            autoFocus
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>

        {searching ? (
          <p className="text-xs text-gray-400 py-4 text-center">搜索中...</p>
        ) : candidates.length > 0 ? (
          <div className="space-y-1 mb-3 max-h-64 overflow-y-auto">
            {candidates.map(c => (
              <label
                key={c.id}
                className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border ${
                  selectedId === c.id ? 'bg-gold-50 border-gold-300' : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  checked={selectedId === c.id}
                  onChange={() => setSelectedId(c.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{c.contact_name}</p>
                  <p className="text-xs text-gray-500">
                    {c.company_name || '-'}
                    {c.email && <span className="ml-2 font-mono">{c.email}</span>}
                  </p>
                </div>
              </label>
            ))}
          </div>
        ) : query.trim() ? (
          <p className="text-xs text-gray-400 py-4 text-center">无匹配客户</p>
        ) : (
          <p className="text-xs text-gray-400 py-4 text-center">输入客户名 / 公司名 / 邮箱搜索</p>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={merging} className="px-4 py-2 text-sm text-gray-600 cursor-pointer">
            取消
          </button>
          <button
            onClick={handleMerge}
            disabled={merging || !selectedId}
            className="px-4 py-2 bg-gold-600 text-white text-sm rounded-lg hover:bg-gold-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {merging ? '归并中...' : '确认归并'}
          </button>
        </div>
      </div>
    </div>
  )
}
