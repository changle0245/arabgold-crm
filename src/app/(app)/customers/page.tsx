'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import { CustomerAvatar } from '@/components/customer-avatar'
import { TagBadge } from '@/components/tags-editor'
import { Pagination } from '@/components/pagination'
import type { Customer, Profile } from '@/lib/types'
import { LEVELS, STAGES, SOURCES, OVERDUE_DAYS_THRESHOLD } from '@/lib/constants'
import { Plus, Search } from 'lucide-react'
import { daysSince } from '@/lib/dates'

const PAGE_SIZE = 30

export default function CustomersPage() {
  const { profile, isAdmin } = useAuth()
  const [customers, setCustomers] = useState<(Customer & { owner?: Profile })[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [tagsByCustomer, setTagsByCustomer] = useState<Record<string, string[]>>({})
  const [distinctCountries, setDistinctCountries] = useState<string[]>([])
  const [distinctTags, setDistinctTags] = useState<string[]>([])
  // Members default to "mine only"; admins default to "all"
  const [scopeMine, setScopeMine] = useState(true)

  useEffect(() => {
    if (isAdmin) setScopeMine(false)
  }, [isAdmin])

  // 一次性加载：members + distinct lists（全表统计，不分页）
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('profiles').select('*').eq('is_active', true),
      supabase.from('customers').select('country'),
      supabase.from('customer_tags').select('tag'),
    ]).then(([{ data: mems }, { data: ctry }, { data: tg }]) => {
      setMembers(mems || [])
      const cf: Record<string, number> = {}
      for (const r of ctry || []) {
        if (r.country) cf[r.country] = (cf[r.country] || 0) + 1
      }
      setDistinctCountries(Object.keys(cf).sort((a, b) => cf[b] - cf[a]))
      const tf: Record<string, number> = {}
      for (const r of tg || []) {
        if (r.tag) tf[r.tag] = (tf[r.tag] || 0) + 1
      }
      setDistinctTags(Object.keys(tf).sort((a, b) => tf[b] - tf[a]))
    })
  }, [])

  // 主查询：分页 + 服务端过滤
  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    let q = supabase
      .from('customers')
      .select('*, owner:profiles!customers_owner_id_fkey(*)', { count: 'exact' })

    if (scopeMine && profile?.id) q = q.eq('owner_id', profile.id)
    if (filterCountry) q = q.eq('country', filterCountry)
    if (filterOwner) q = q.eq('owner_id', filterOwner)
    if (filterLevel) q = q.eq('level', filterLevel)
    if (filterStage) q = q.eq('stage', filterStage)
    if (filterSource) q = q.eq('source', filterSource)
    if (search) {
      const s = `%${search}%`
      q = q.or(
        `contact_name.ilike.${s},company_name.ilike.${s},whatsapp.ilike.${s},phone.ilike.${s},wechat_id.ilike.${s},email.ilike.${s}`
      )
    }
    if (filterTag) {
      const { data: tagRows } = await supabase
        .from('customer_tags')
        .select('customer_id')
        .eq('tag', filterTag)
      const ids = (tagRows || []).map(r => r.customer_id)
      if (ids.length === 0) {
        setCustomers([])
        setTotal(0)
        setLoading(false)
        return
      }
      q = q.in('id', ids)
    }

    const start = (page - 1) * PAGE_SIZE
    const { data, count } = await q
      .order('last_contact_date', { ascending: true, nullsFirst: true })
      .range(start, start + PAGE_SIZE - 1)

    setCustomers((data as (Customer & { owner?: Profile })[]) || [])
    setTotal(count || 0)
    setLoading(false)
  }, [
    page, search,
    filterCountry, filterOwner, filterLevel, filterStage, filterSource, filterTag,
    scopeMine, profile?.id,
  ])

  useEffect(() => { load() }, [load])

  // 当前页客户的 tags
  useEffect(() => {
    if (customers.length === 0) {
      setTagsByCustomer({})
      return
    }
    const supabase = createClient()
    supabase
      .from('customer_tags')
      .select('customer_id, tag')
      .in('customer_id', customers.map(c => c.id))
      .then(({ data }) => {
        const map: Record<string, string[]> = {}
        for (const row of data || []) {
          if (!map[row.customer_id]) map[row.customer_id] = []
          map[row.customer_id].push(row.tag)
        }
        setTagsByCustomer(map)
      })
  }, [customers])

  // 过滤器变化时回到第 1 页（包装 setter）
  function withReset<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1) }
  }

  if (loading && customers.length === 0 && total === 0) {
    return <div className="p-6 text-gray-400">加载中...</div>
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1400px]">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">客户列表</h1>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
            <button
              onClick={() => { setScopeMine(true); setPage(1) }}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${scopeMine ? 'bg-gold-100 text-gold-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              仅我的
            </button>
            <button
              onClick={() => { setScopeMine(false); setPage(1) }}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${!scopeMine ? 'bg-gold-100 text-gold-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              全部
            </button>
          </div>
        </div>
        <Link
          href="/customers/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 transition-colors"
        >
          <Plus size={16} />
          新增客户
        </Link>
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索客户名 / 公司 / WhatsApp / 手机 / 微信 / 邮箱..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect value={filterOwner} onChange={withReset(setFilterOwner)} placeholder="所属业务员">
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </FilterSelect>
          <FilterSelect value={filterCountry} onChange={withReset(setFilterCountry)} placeholder="国家">
            {distinctCountries.map(c => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
          <FilterSelect value={filterLevel} onChange={withReset(setFilterLevel)} placeholder="分级">
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </FilterSelect>
          <FilterSelect value={filterStage} onChange={withReset(setFilterStage)} placeholder="阶段">
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
          <FilterSelect value={filterSource} onChange={withReset(setFilterSource)} placeholder="来源">
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
          {distinctTags.length > 0 && (
            <FilterSelect value={filterTag} onChange={withReset(setFilterTag)} placeholder="标签">
              {distinctTags.map(t => <option key={t} value={t}>{t}</option>)}
            </FilterSelect>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-2">
        共 {total} 个客户{loading && customers.length > 0 ? '（刷新中…）' : ''}
      </p>

      {/* Table (desktop) */}
      <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left">
              <th className="py-3 px-4 font-medium">客户名</th>
              <th className="py-3 px-4 font-medium">公司</th>
              <th className="py-3 px-4 font-medium">国家</th>
              <th className="py-3 px-4 font-medium">业务员</th>
              <th className="py-3 px-4 font-medium">分级</th>
              <th className="py-3 px-4 font-medium">阶段</th>
              <th className="py-3 px-4 font-medium">最近联系</th>
              <th className="py-3 px-4 font-medium">距今</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.map(c => {
              const days = daysSince(c.last_contact_date)
              const overdue = c.last_contact_date != null && days >= OVERDUE_DAYS_THRESHOLD
              return (
                <tr key={c.id} className="hover:bg-gray-50 relative">
                  {overdue && (
                    <td className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-r" />
                  )}
                  <td className="py-3 px-4">
                    <Link href={`/customers/${c.id}`} className="flex items-center gap-2.5 hover:opacity-80">
                      <CustomerAvatar url={c.avatar_url} name={c.contact_name} size={32} />
                      <div className="min-w-0">
                        <span className="text-gold-700 font-medium hover:underline block">{c.contact_name}</span>
                        {(tagsByCustomer[c.id] || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(tagsByCustomer[c.id] || []).slice(0, 3).map(t => <TagBadge key={t} tag={t} />)}
                            {(tagsByCustomer[c.id] || []).length > 3 && (
                              <span className="text-xs text-gray-400">+{(tagsByCustomer[c.id]).length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{c.company_name || '-'}</td>
                  <td className="py-3 px-4 text-gray-600">{c.country || '-'}</td>
                  <td className="py-3 px-4 text-gray-600">{c.owner?.full_name || '-'}</td>
                  <td className="py-3 px-4">
                    <LevelBadge level={c.level} />
                  </td>
                  <td className="py-3 px-4">
                    <StageBadge stage={c.stage} />
                  </td>
                  <td className="py-3 px-4 text-gray-600">{c.last_contact_date || '-'}</td>
                  <td className={`py-3 px-4 font-medium ${overdue ? 'text-red-600' : 'text-gray-600'}`}>
                    {c.last_contact_date ? `${days}天` : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {customers.length === 0 && !loading && (
          <div className="py-12 text-center text-gray-400">暂无客户数据</div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {customers.map(c => {
          const days = daysSince(c.last_contact_date)
          const overdue = c.last_contact_date != null && days >= OVERDUE_DAYS_THRESHOLD
          return (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className={`block bg-white rounded-xl border p-4 relative ${overdue ? 'border-red-200' : 'border-gray-200'}`}
            >
              {overdue && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-xl" />}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CustomerAvatar url={c.avatar_url} name={c.contact_name} size={36} />
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{c.contact_name}</p>
                    {c.company_name && <p className="text-gray-400 text-xs truncate">{c.company_name}</p>}
                  </div>
                </div>
                <LevelBadge level={c.level} />
              </div>
              {(tagsByCustomer[c.id] || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {(tagsByCustomer[c.id] || []).map(t => <TagBadge key={t} tag={t} />)}
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                {c.country && <span>{c.country}</span>}
                <span>{c.owner?.full_name}</span>
                <StageBadge stage={c.stage} />
                <span className={overdue ? 'text-red-600 font-medium' : ''}>
                  {c.last_contact_date ? `${days}天前联系` : '未记录联系'}
                </span>
              </div>
            </Link>
          )
        })}
        {customers.length === 0 && !loading && (
          <div className="py-12 text-center text-gray-400">暂无客户数据</div>
        )}
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  )
}

function FilterSelect({ value, onChange, placeholder, children }: {
  value: string; onChange: (v: string) => void; placeholder: string; children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-gold-500"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  )
}

function LevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    L1: 'bg-gold-100 text-gold-700',
    L2: 'bg-blue-50 text-blue-700',
    L3: 'bg-gray-100 text-gray-600',
    '待定': 'bg-gray-50 text-gray-400',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[level] || colors['待定']}`}>
      {level}
    </span>
  )
}

function StageBadge({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    '待定': 'bg-gray-50 text-gray-400',
    '新接触': 'bg-green-50 text-green-700',
    '报价中': 'bg-blue-50 text-blue-700',
    '已寄样': 'bg-purple-50 text-purple-700',
    '已成交': 'bg-gold-100 text-gold-700',
    '沉默': 'bg-red-50 text-red-600',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[stage] || colors['待定']}`}>
      {stage}
    </span>
  )
}
