'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/lib/types'
import { JOB_TITLES } from '@/lib/constants'
import { Plus, UserCog } from 'lucide-react'

export default function MembersPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'member', job_title: '业务员' })
  const [editForm, setEditForm] = useState({ full_name: '', role: 'member', job_title: '业务员', is_active: true })
  const [saving, setSaving] = useState(false)
  const [resetPwId, setResetPwId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/customers')
    }
  }, [authLoading, isAdmin, router])

  useEffect(() => { loadMembers() }, [])

  async function loadMembers() {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setMembers(data || [])
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    // 修 #7: 前端拦截弱密码，给即时反馈
    if (form.password.length < 6) {
      alert('密码至少 6 位')
      return
    }
    setSaving(true)
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      alert('创建失败: ' + data.error)
    } else {
      setShowAdd(false)
      setForm({ email: '', password: '', full_name: '', role: 'member', job_title: '业务员' })
      loadMembers()
    }
    setSaving(false)
  }

  function startEdit(m: Profile) {
    setEditId(m.id)
    setEditForm({ full_name: m.full_name, role: m.role, job_title: m.job_title, is_active: m.is_active })
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch(`/api/members/${editId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const data = await res.json()
    if (!res.ok) {
      alert('保存失败: ' + data.error)
    } else {
      setEditId(null)
      loadMembers()
    }
    setSaving(false)
  }

  async function handleResetPassword() {
    if (!resetPwId) return
    if (newPassword.length < 6) { alert('新密码至少 6 位'); return }
    setResetting(true)
    const res = await fetch(`/api/members/${resetPwId}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert('重置失败: ' + data.error)
      setResetting(false)
      return
    }
    alert('密码已重置。该成员下次登录后会被强制修改密码。')
    setResetPwId(null)
    setNewPassword('')
    setResetting(false)
  }

  if (!isAdmin) return null
  if (loading) return <div className="p-6 text-gray-400">加载中...</div>

  return (
    <div className="p-4 lg:p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">成员管理</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-4 py-2 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 transition-colors cursor-pointer"
        >
          <Plus size={16} />
          新增成员
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">创建新成员</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">姓名 *</label>
              <input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">邮箱 *</label>
              <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">初始密码 *</label>
              <input required type="text" minLength={6} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input" placeholder="至少6位（后端强制）" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">角色</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="input">
                <option value="member">普通成员</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">职位标签</label>
              <select value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} className="input">
                {JOB_TITLES.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-gold-600 text-white rounded-lg text-sm hover:bg-gold-700 disabled:opacity-50 cursor-pointer">
              {saving ? '创建中...' : '创建'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-500 cursor-pointer">取消</button>
          </div>
        </form>
      )}

      {resetPwId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { if (!resetting) { setResetPwId(null); setNewPassword('') } }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              重置「{members.find(m => m.id === resetPwId)?.full_name}」的密码
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              请输入新的初始密码（至少 6 位）。设置后该成员下次登录将被强制修改密码。
            </p>
            <input
              type="text"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoFocus
              disabled={resetting}
              placeholder="新密码"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setResetPwId(null); setNewPassword('') }}
                disabled={resetting}
                className="px-4 py-2 text-sm text-gray-600 cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetting || newPassword.length < 6}
                className="px-4 py-2 bg-gold-600 text-white text-sm rounded-lg hover:bg-gold-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {resetting ? '重置中…' : '确认重置'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left">
              <th className="py-3 px-4 font-medium">姓名</th>
              <th className="py-3 px-4 font-medium">角色</th>
              <th className="py-3 px-4 font-medium">职位</th>
              <th className="py-3 px-4 font-medium">状态</th>
              <th className="py-3 px-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map(m => (
              <tr key={m.id}>
                {editId === m.id ? (
                  <td colSpan={5} className="p-4">
                    <form onSubmit={handleEdit} className="flex flex-wrap gap-3 items-end">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">姓名</label>
                        <input value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} className="input w-32" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">角色</label>
                        <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} className="input w-28">
                          <option value="member">成员</option>
                          <option value="admin">管理员</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">职位</label>
                        <select value={editForm.job_title} onChange={e => setEditForm({ ...editForm, job_title: e.target.value })} className="input w-24">
                          {JOB_TITLES.map(j => <option key={j} value={j}>{j}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500">
                          <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} />
                          在职
                          <span className="text-[10px] text-gray-400">（取消勾选 = 离职，账号停用但数据保留）</span>
                        </label>
                      </div>
                      <button type="submit" disabled={saving} className="px-3 py-2 bg-gold-600 text-white rounded-lg text-xs hover:bg-gold-700 disabled:opacity-50 cursor-pointer">保存</button>
                      <button type="button" onClick={() => setEditId(null)} className="px-3 py-2 text-xs text-gray-500 cursor-pointer">取消</button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="py-3 px-4 font-medium text-gray-900">{m.full_name}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.role === 'admin' ? 'bg-gold-100 text-gold-700' : 'bg-gray-100 text-gray-600'}`}>
                        {m.role === 'admin' ? '管理员' : '成员'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{m.job_title}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                        {m.is_active ? '在职' : '离职'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-3">
                        <button onClick={() => startEdit(m)} className="text-sm text-gold-600 hover:text-gold-700 cursor-pointer">编辑</button>
                        <button
                          onClick={() => { setResetPwId(m.id); setNewPassword('') }}
                          className="text-sm text-gray-500 hover:text-orange-600 cursor-pointer"
                        >
                          重置密码
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
