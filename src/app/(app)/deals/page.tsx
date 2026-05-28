'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth-provider'
import { Pagination } from '@/components/pagination'
import type { Deal, Profile } from '@/lib/types'
import { DEAL_STATUSES, DEAL_STATUS_LABELS } from '@/lib/constants'
import { Package, Search, Check } from 'lucide-react'

type Row = Deal & {
  customer?: { id: string; contact_name: string; company_name: string | null; owner_id: string; owner?: Profile }
}

type ExtraFilter = 'all' | 'reorder' | 'pending_deposit' | 'pending_balance'

interface DealsResponse {
  ok: boolean
  items?: Row[]
  total?: number
  page_totals_by_currency?: Record<string, number>
  page_reorder_count?: number
  error?: string
}

interface CustomerMetaResponse {
  ok: boolean
  data?: { profiles: Profile[]; countries: string[]; tags: string[] }
  error?: string
}

const PAGE_SIZE = 30

export default function DealsPage() {
  const { profile, isAdmin } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<Profile[]>([])
  const [pageTotalsByCurrency, setPageTotalsByCurrency] = useState<Record<string, number>>({})
  const [pageReorderCount, setPageReorderCount] = useState(0)

  const [scopeOverride, setScope] = useState<'mine' | 'all' | null>(null)
  const scope: 'mine' | 'all' = scopeOverride ?? (isAdmin ? 'all' : 'mine')
  const [status, setStatus] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [extra, setExtra] = useState<ExtraFilter>('all')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [search, setSearch] = useState<string>('')

  // Members for the owner filter — reuse customer-meta which already returns
  // active profiles.
  useEffect(() => {
    fetch('/api/customer-meta')
      .then((res) => res.json() as Promise<CustomerMetaResponse>)
      .then((body) => {
        if (body.ok && body.data) setMembers(body.data.profiles)
      })
      .catch(() => { /* leave members empty on network errors */ })
  }, [])

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('scope', scope)
    if (status !== 'all') params.set('status', status)
    if (ownerFilter !== 'all') params.set('owner_id', ownerFilter)
    if (extra !== 'all') params.set('extra', extra)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (search.trim()) params.set('search', search.trim())

    try {
      const res = await fetch('/api/deals?' + params.toString())
      const body = (await res.json()) as DealsResponse
      if (!body.ok) {
        setRows([])
        setTotal(0)
        setPageTotalsByCurrency({})
        setPageReorderCount(0)
      } else {
        setRows(body.items || [])
        setTotal(body.total || 0)
        setPageTotalsByCurrency(body.page_totals_by_currency || {})
        setPageReorderCount(body.page_reorder_count || 0)
      }
    } catch {
      setRows([])
      setTotal(0)
      setPageTotalsByCurrency({})
      setPageReorderCount(0)
    } finally {
      setLoading(false)
    }
  }, [profile?.id, status, from, to, extra, scope, ownerFilter, search, page])

  useEffect(() => { load() }, [load])

  if (loading && rows.length === 0 && total === 0) return <div className="p-6 text-gray-400">加载中...</div>

  return (
    <div className="p-4 lg:p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Package size={22} className="text-gold-600" />
          {scope === 'mine' ? '我的成交' : '全部成交'}
        </h1>
        {isAdmin && (
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => { setScope('mine'); setPage(1) }}
              className={`px-3 py-1.5 text-sm cursor-pointer ${scope === 'mine' ? 'bg-gold-50 text-gold-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >仅我的</button>
            <button
              onClick={() => { setScope('all'); setPage(1) }}
              className={`px-3 py-1.5 text-sm cursor-pointer ${scope === 'all' ? 'bg-gold-50 text-gold-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >全部</button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="col-span-2 lg:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">搜索</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="成交号 / 客户名 / 公司名 / 付款方式..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">状态</label>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
            <option value="all">全部</option>
            {DEAL_STATUSES.map(s => <option key={s} value={s}>{DEAL_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">类型/收款</label>
          <select value={extra} onChange={e => { setExtra(e.target.value as ExtraFilter); setPage(1) }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
            <option value="all">不限</option>
            <option value="reorder">仅返单</option>
            <option value="pending_deposit">定金未收</option>
            <option value="pending_balance">尾款未收</option>
          </select>
        </div>
        {isAdmin && scope === 'all' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">业务员</label>
            <select value={ownerFilter} onChange={e => { setOwnerFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500">
              <option value="all">全部</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">起始日期</label>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">截止日期</label>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500" />
        </div>
      </div>

      <div className="mb-3 text-sm text-gray-500 flex items-center gap-4 flex-wrap">
        <span>共 <span className="font-medium text-gray-800">{total}</span> 单</span>
        {pageReorderCount > 0 && <span className="text-xs text-gray-400">本页返单 <span className="font-medium text-purple-700">{pageReorderCount}</span></span>}
        {Object.keys(pageTotalsByCurrency).length > 0 && (
          <span className="text-xs text-gray-400">本页:</span>
        )}
        {Object.entries(pageTotalsByCurrency).map(([cur, amt]) => (
          <span key={cur}>{cur} <span className="font-medium text-gray-800">{amt.toFixed(2)}</span></span>
        ))}
      </div>

      {/* Table (desktop) */}
      <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium">成交号</th>
              <th className="text-left py-2.5 px-4 font-medium">客户</th>
              <th className="text-left py-2.5 px-4 font-medium">成交日</th>
              <th className="text-right py-2.5 px-4 font-medium">金额</th>
              <th className="text-left py-2.5 px-4 font-medium">付款</th>
              <th className="text-center py-2.5 px-4 font-medium">定金</th>
              <th className="text-center py-2.5 px-4 font-medium">尾款</th>
              <th className="text-left py-2.5 px-4 font-medium">状态</th>
              <th className="text-left py-2.5 px-4 font-medium">业务员</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="py-2.5 px-4 font-medium text-gray-900">
                  <div className="flex items-center gap-1.5">
                    {r.customer ? (
                      <Link href={`/customers/${r.customer.id}`} className="hover:text-gold-700">
                        {r.deal_no}
                      </Link>
                    ) : r.deal_no}
                    {r.is_reorder && <span className="text-xs px-1 py-0.5 bg-purple-50 text-purple-600 rounded">返</span>}
                  </div>
                </td>
                <td className="py-2.5 px-4 text-gray-700">
                  {r.customer ? (
                    <Link href={`/customers/${r.customer.id}`} className="hover:text-gold-700">
                      {r.customer.contact_name}
                      {r.customer.company_name && <span className="text-gray-400"> · {r.customer.company_name}</span>}
                    </Link>
                  ) : <span className="text-gray-400">-</span>}
                </td>
                <td className="py-2.5 px-4 text-gray-500">{r.deal_date || '-'}</td>
                <td className="py-2.5 px-4 text-right font-medium text-gray-800">
                  {r.currency} {r.deal_amount?.toFixed(2) || '0.00'}
                </td>
                <td className="py-2.5 px-4 text-gray-500">{r.payment_method || '-'}</td>
                <td className="py-2.5 px-4 text-center">
                  {r.deposit_received ? <Check size={14} className="inline text-green-600" /> : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2.5 px-4 text-center">
                  {r.balance_received ? <Check size={14} className="inline text-green-600" /> : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2.5 px-4">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-2.5 px-4 text-gray-500">{r.customer?.owner?.full_name || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={9} className="py-10 text-center text-gray-400">没有符合条件的成交记录</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Cards (mobile) */}
      <div className="lg:hidden space-y-2">
        {rows.map(r => (
          <Link
            key={r.id}
            href={r.customer ? `/customers/${r.customer.id}` : '#'}
            className="block bg-white rounded-xl border border-gray-200 p-3"
          >
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-medium text-gray-900">{r.deal_no}</span>
              <StatusBadge status={r.status} />
              {r.is_reorder && <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">返单</span>}
            </div>
            <div className="text-sm text-gray-700">{r.customer?.contact_name}{r.customer?.company_name ? ` · ${r.customer.company_name}` : ''}</div>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
              <span className="font-medium text-gray-800">{r.currency} {r.deal_amount?.toFixed(2) || '0.00'}</span>
              {r.payment_method && <span>{r.payment_method}</span>}
              {r.deposit_received ? <span className="text-green-600">定金✓</span> : <span className="text-amber-600">定金未收</span>}
              {r.balance_received ? <span className="text-green-600">尾款✓</span> : <span className="text-amber-600">尾款未收</span>}
              <span>{r.deal_date || '-'}</span>
              {r.customer?.owner?.full_name && <span>{r.customer.owner.full_name}</span>}
            </div>
          </Link>
        ))}
        {rows.length === 0 && !loading && (
          <div className="py-10 text-center text-gray-400 text-sm">没有符合条件的成交记录</div>
        )}
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
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
