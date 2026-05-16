'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import { CustomerAvatar } from '@/components/customer-avatar'
import { TagBadge } from '@/components/tags-editor'
import type { Customer, Profile } from '@/lib/types'
import { LEVELS, STAGES, SOURCES } from '@/lib/constants'
import { OVERDUE_DAYS_THRESHOLD } from '@/lib/constants'
import { Plus, Search } from 'lucide-react'

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 9999
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export default function CustomersPage() {
  const { profile, isAdmin } = useAuth()
  const [customers, setCustomers] = useState<(Customer & { owner?: Profile })[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [tagsByCustomer, setTagsByCustomer] = useState<Record<string, string[]>>({})
  // Members default to "mine only"; admins default to "all"
  const [scopeMine, setScopeMine] = useState(true)

  // For admins, default scope = all
  useEffect(() => {
    if (isAdmin) setScopeMine(false)
  }, [isAdmin])

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const [{ data: custs }, { data: mems }, { data: allTags }] = await Promise.all([
        supabase
          .from('customers')
          .select('*, owner:profiles!customers_owner_id_fkey(*)')
          .order('last_contact_date', { ascending: true, nullsFirst: true }),
        supabase.from('profiles').select('*').eq('is_active', true),
        supabase.from('customer_tags').select('customer_id, tag'),
      ])
      setCustomers(custs || [])
      setMembers(mems || [])
      // 把标签按 customer_id 分组
      const tagMap: Record<string, string[]> = {}
      for (const row of allTags || []) {
        if (!tagMap[row.customer_id]) tagMap[row.customer_id] = []
        tagMap[row.customer_id].push(row.tag)
      }
      setTagsByCustomer(tagMap)
      setLoading(false)
    }
    load()
  }, [])

  // 从实际客户数据里抽取所有用过的国家（按出现频次排序）
  const distinctCountries = useMemo(() => {
    const count: Record<string, number> = {}
    for (const c of customers) {
      if (c.country) count[c.country] = (count[c.country] || 0) + 1
    }
    return Object.keys(count).sort((a, b) => count[b] - count[a])
  }, [customers])

  // 库里所有用过的标签（按频次排序）
  const distinctTags = useMemo(() => {
    const count: Record<string, number> = {}
    for (const tags of Object.values(tagsByCustomer)) {
      for (const t of tags) count[t] = (count[t] || 0) + 1
    }
    return Object.keys(count).sort((a, b) => count[b] - count[a])
  }, [tagsByCustomer])

  const filtered = useMemo(() => {
    let result = customers
    if (scopeMine && profile?.id) {
      result = result.filter(c => c.owner_id === profile.id)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.contact_name.toLowerCase().includes(q) ||
        c.company_name?.toLowerCase().includes(q) ||
        c.whatsapp?.includes(q) ||
        c.phone?.includes(q) ||
        c.wechat_id?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      )
    }
    if (filterCountry) result = result.filter(c => c.country === filterCountry)
    if (filterOwner) result = result.filter(c => c.owner_id === filterOwner)
    if (filterLevel) result = result.filter(c => c.level === filterLevel)
    if (filterStage) result = result.filter(c => c.stage === filterStage)
    if (filterSource) result = result.filter(c => c.source === filterSource)
    if (filterTag) result = result.filter(c => (tagsByCustomer[c.id] || []).includes(filterTag))
    return result
  }, [customers, search, filterCountry, filterOwner, filterLevel, filterStage, filterSource, filterTag, tagsByCustomer, scopeMine, profile?.id])

  if (loading) {
    return <div className="p-6 text-gray-400">加载中...</div>
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1400px]">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">客户列表</h1>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
            <button
              onClick={() => setScopeMine(true)}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${scopeMine ? 'bg-gold-100 text-gold-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              仅我的
            </button>
            <button
              onClick={() => setScopeMine(false)}
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
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect value={filterOwner} onChange={setFilterOwner} placeholder="所属业务员">
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </FilterSelect>
          <FilterSelect value={filterCountry} onChange={setFilterCountry} placeholder="国家">
            {distinctCountries.map(c => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
          <FilterSelect value={filterLevel} onChange={setFilterLevel} placeholder="分级">
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </FilterSelect>
          <FilterSelect value={filterStage} onChange={setFilterStage} placeholder="阶段">
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
          <FilterSelect value={filterSource} onChange={setFilterSource} placeholder="来源">
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
          {distinctTags.length > 0 && (
            <FilterSelect value={filterTag} onChange={setFilterTag} placeholder="标签">
              {distinctTags.map(t => <option key={t} value={t}>{t}</option>)}
            </FilterSelect>
          )}
        </div>
      </div>

      {/* Customer count */}
      <p className="text-xs text-gray-400 mb-2">共 {filtered.length} 个客户</p>

      {/* Table (desktop) / Cards (mobile) */}
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
            {filtered.map(c => {
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
        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-400">暂无客户数据</div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {filtered.map(c => {
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
        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-400">暂无客户数据</div>
        )}
      </div>
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
