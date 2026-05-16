'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import type { Quotation, Profile } from '@/lib/types'
import { QUOTATION_STATUSES, QUOTATION_STATUS_LABELS } from '@/lib/constants'
import { FileText, Search } from 'lucide-react'

type Row = Quotation & {
  customer?: { id: string; contact_name: string; company_name: string | null; owner_id: string; owner?: Profile }
}

export default function QuotationsPage() {
  const { profile, isAdmin } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<Profile[]>([])

  const [scopeOverride, setScope] = useState<'mine' | 'all' | null>(null)
  const scope: 'mine' | 'all' = scopeOverride ?? (isAdmin ? 'all' : 'mine')
  const [status, setStatus] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [search, setSearch] = useState<string>('')

  const load = useCallback(async () => {
    if (!profile?.id) return
    const supabase = createClient()
    let query = supabase
      .from('quotations')
      .select(`
        *,
        creator:profiles!quotations_created_by_fkey(*),
        customer:customers!quotations_customer_id_fkey(
          id, contact_name, company_name, owner_id,
          owner:profiles!customers_owner_id_fkey(*)
        )
      `)
      .order('created_at', { ascending: false })

    if (status !== 'all') query = query.eq('status', status)
    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', to + 'T23:59:59')

    const { data } = await query
    setRows((data as Row[]) || [])
    setLoading(false)
  }, [profile?.id, status, from, to])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    async function loadMembers() {
      const supabase = createClient()
      const { data } = await supabase.from('profiles').select('*').eq('is_active', true)
      setMembers((data as Profile[]) || [])
    }
    loadMembers()
  }, [])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (scope === 'mine' && r.customer?.owner_id !== profile?.id) return false
      if (ownerFilter !== 'all' && r.customer?.owner_id !== ownerFilter) return false
      if (search.trim()) {
        const s = search.trim().toLowerCase()
        const hay = [
          r.quote_no, r.customer?.contact_name, r.customer?.company_name,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [rows, scope, ownerFilter, search, profile?.id])

  // Aggregate totals (multi-currency)
  const totalsByCurrency = useMemo(() => {
    return filtered.reduce<Record<string, number>>((acc, r) => {
      if (!r.total_amount) return acc
      const cur = r.currency || 'USD'
      acc[cur] = (acc[cur] || 0) + r.total_amount
      return acc
    }, {})
  }, [filtered])

  if (loading) return <div className="p-6 text-gray-400">加载中...</div>

  return (
    <div className="p-4 lg:p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <FileText size={22} className="text-gold-600" />
          {scope === 'mine' ? '我的报价' : '全部报价'}
        </h1>
        {isAdmin && (
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setScope('mine')}
              className={`px-3 py-1.5 text-sm cursor-pointer ${scope === 'mine' ? 'bg-gold-50 text-gold-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >仅我的</button>
            <button
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 text-sm cursor-pointer ${scope === 'all' ? 'bg-gold-50 text-gold-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >全部</button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="col-span-2 lg:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">搜索</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="报价号 / 客户名 / 公司名..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">状态</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
            <option value="all">全部</option>
            {QUOTATION_STATUSES.map(s => <option key={s} value={s}>{QUOTATION_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        {isAdmin && scope === 'all' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">业务员</label>
            <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
              <option value="all">全部</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">起始日期</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">截止日期</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500" />
        </div>
      </div>

      {/* Summary */}
      <div className="mb-3 text-sm text-gray-500 flex items-center gap-4 flex-wrap">
        <span>共 <span className="font-medium text-gray-800">{filtered.length}</span> 条</span>
        {Object.entries(totalsByCurrency).map(([cur, amt]) => (
          <span key={cur}>{cur} <span className="font-medium text-gray-800">{amt.toFixed(2)}</span></span>
        ))}
      </div>

      {/* Table (desktop) */}
      <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium">报价号</th>
              <th className="text-left py-2.5 px-4 font-medium">客户</th>
              <th className="text-left py-2.5 px-4 font-medium">版本</th>
              <th className="text-right py-2.5 px-4 font-medium">金额</th>
              <th className="text-left py-2.5 px-4 font-medium">状态</th>
              <th className="text-left py-2.5 px-4 font-medium">条款</th>
              <th className="text-left py-2.5 px-4 font-medium">有效期</th>
              <th className="text-left py-2.5 px-4 font-medium">业务员</th>
              <th className="text-left py-2.5 px-4 font-medium">创建日期</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="py-2.5 px-4 font-medium text-gray-900">
                  {r.customer ? (
                    <Link href={`/customers/${r.customer.id}`} className="hover:text-gold-700">
                      {r.quote_no}
                    </Link>
                  ) : r.quote_no}
                </td>
                <td className="py-2.5 px-4 text-gray-700">
                  {r.customer ? (
                    <Link href={`/customers/${r.customer.id}`} className="hover:text-gold-700">
                      {r.customer.contact_name}
                      {r.customer.company_name && <span className="text-gray-400"> · {r.customer.company_name}</span>}
                    </Link>
                  ) : <span className="text-gray-400">-</span>}
                </td>
                <td className="py-2.5 px-4 text-gray-500">V{r.version}</td>
                <td className="py-2.5 px-4 text-right font-medium text-gray-800">
                  {r.currency} {r.total_amount?.toFixed(2) || '0.00'}
                </td>
                <td className="py-2.5 px-4">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-2.5 px-4 text-gray-500">{r.trade_terms || '-'}</td>
                <td className="py-2.5 px-4 text-gray-500">{r.valid_until || '-'}</td>
                <td className="py-2.5 px-4 text-gray-500">{r.customer?.owner?.full_name || '-'}</td>
                <td className="py-2.5 px-4 text-gray-500">{r.created_at.split('T')[0]}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-gray-400">没有符合条件的报价</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Cards (mobile) */}
      <div className="lg:hidden space-y-2">
        {filtered.map(r => (
          <Link
            key={r.id}
            href={r.customer ? `/customers/${r.customer.id}` : '#'}
            className="block bg-white rounded-xl border border-gray-200 p-3"
          >
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-medium text-gray-900">{r.quote_no}</span>
              <span className="text-xs text-gray-400">V{r.version}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="text-sm text-gray-700">{r.customer?.contact_name}{r.customer?.company_name ? ` · ${r.customer.company_name}` : ''}</div>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
              <span className="font-medium text-gray-800">{r.currency} {r.total_amount?.toFixed(2) || '0.00'}</span>
              {r.trade_terms && <span>{r.trade_terms}</span>}
              {r.customer?.owner?.full_name && <span>{r.customer.owner.full_name}</span>}
              <span>{r.created_at.split('T')[0]}</span>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="py-10 text-center text-gray-400 text-sm">没有符合条件的报价</div>
        )}
      </div>
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
