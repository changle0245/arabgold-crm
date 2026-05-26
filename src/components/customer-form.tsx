'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './auth-provider'
import { ScreenshotImporter } from './screenshot-importer'
import { AvatarCropper } from './avatar-cropper'
import { CustomerAvatar } from './customer-avatar'
import { TagsEditor } from './tags-editor'
import type { Customer, Profile } from '@/lib/types'
import { Camera, Upload, Trash2 } from 'lucide-react'
import { todayLocalISO } from '@/lib/dates'
import {
  COUNTRIES, LEVELS, STAGES, SOURCES, PRODUCT_CATEGORIES, PAYMENT_PREFERENCES,
  GENDERS, CURRENCIES, INCOTERMS, PURCHASE_FREQUENCIES, DECISION_ROLES,
  INDUSTRIES, COMPANY_SIZES, CONTACT_TITLES,
} from '@/lib/constants'

interface Props {
  customer?: Customer
}

const EMPTY_FORM = {
  // 客户身份
  contact_name: '', contact_title: '', gender: '',
  company_name: '', company_website: '', company_address: '',
  country: '',
  // 联系方式
  whatsapp: '', phone: '', email: '',
  wechat_id: '', telegram: '', linkedin: '',
  skype: '', instagram: '', facebook: '', alibaba_id: '',
  // 归属
  owner_id: '',
  // 进展
  level: '待定', stage: '待定',
  first_contact_date: '',
  source: '', product_category: '',
  purchase_frequency: '', decision_role: '',
  // 公司画像
  industry: '', company_size: '',
  // 商务偏好
  payment_preference: '', currency_preference: '', incoterms: '',
  // 备注
  notes: '',
}

export function CustomerForm({ customer }: Props) {
  const isEdit = !!customer
  const router = useRouter()
  const { profile, isAdmin } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [saving, setSaving] = useState(false)
  const [conflictWarnings, setConflictWarnings] = useState<Record<string, string>>({})
  const [showImporter, setShowImporter] = useState(false)
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set())
  const [avatarUrl, setAvatarUrl] = useState<string | null>(customer?.avatar_url || null)
  const [cropperImage, setCropperImage] = useState<string | null>(null)
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // 编辑模式：加载该客户已有标签
  useEffect(() => {
    if (!customer?.id) return
    const supabase = createClient()
    supabase.from('customer_tags').select('tag').eq('customer_id', customer.id).then(({ data }) => {
      if (data) setTags(data.map(d => d.tag))
    })
  }, [customer?.id])

  const [form, setForm] = useState(() => {
    if (!customer) return { ...EMPTY_FORM, owner_id: profile?.id || '' }
    return {
      ...EMPTY_FORM,
      ...Object.fromEntries(
        Object.keys(EMPTY_FORM).map(k => [k, (customer as any)[k] ?? ''])
      ),
    }
  })

  function handleAvatarFile(file: File) {
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }
    setCropperImage(URL.createObjectURL(file))
  }

  function handleCropped(blob: Blob) {
    setCropperImage(null)
    // L7: 不在裁剪时上传 —— 仅暂存 blob + 本地预览,提交时才真正上传到存储桶。
    setPendingAvatarBlob(blob)
    setAvatarUrl(URL.createObjectURL(blob))
  }

  function removeAvatar() {
    setPendingAvatarBlob(null)
    setAvatarUrl(null)
  }

  useEffect(() => {
    if (!form.owner_id && profile?.id) {
      setForm(f => ({ ...f, owner_id: profile!.id }))
    }
  }, [profile, form.owner_id])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('*').eq('is_active', true).then(({ data }) => {
      setMembers(data || [])
    })
  }, [])

  const FIELD_LABELS: Record<string, string> = {
    whatsapp: 'WhatsApp 号',
    phone: '手机号',
    wechat_id: '微信号',
    email: '邮箱',
  }

  const checkContact = useCallback(async (field: string, val: string) => {
    if (!val || val.trim().length < 3) {
      setConflictWarnings(s => { const n = { ...s }; delete n[field]; return n })
      return
    }
    const params = new URLSearchParams({ field, value: val })
    if (customer?.id) params.set('exclude', customer.id)
    try {
      const res = await fetch(`/api/check-contact?${params}`)
      const data = await res.json()
      if (data.exists) {
        const label = FIELD_LABELS[field] || field
        setConflictWarnings(s => ({
          ...s,
          [field]: `⚠️ 此${label}已被 ${data.owner_name} 录入为客户 ${data.customer_name}，仍可继续保存`,
        }))
      } else {
        setConflictWarnings(s => { const n = { ...s }; delete n[field]; return n })
      }
    } catch { /* 静默：联网失败不打断录入 */ }
  }, [customer?.id])

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    if (aiFilled.has(field)) {
      setAiFilled(s => { const n = new Set(s); n.delete(field); return n })
    }
  }

  function inputCls(field: string) {
    return aiFilled.has(field) ? 'input ai-filled' : 'input'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()

    // L7: 头像在提交时才上传(裁剪时只暂存 blob)。放弃表单不会留下存储孤儿;
    // 保存失败会删掉本次刚传的文件;替换/移除头像成功后会删掉旧文件。
    const avatarStoragePath = (url: string | null | undefined): string | null => {
      const marker = '/customer-attachments/'
      const i = url ? url.indexOf(marker) : -1
      return i >= 0 ? url!.slice(i + marker.length) : null
    }
    let finalAvatarUrl = avatarUrl
    let newAvatarPath: string | null = null
    if (pendingAvatarBlob) {
      const path = `avatars/${profile!.id}/${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage
        .from('customer-attachments')
        .upload(path, pendingAvatarBlob, { contentType: 'image/jpeg', upsert: false })
      if (upErr) { alert('头像上传失败: ' + upErr.message); setSaving(false); return }
      newAvatarPath = path
      finalAvatarUrl = supabase.storage.from('customer-attachments').getPublicUrl(path).data.publicUrl
    }

    // 把所有空字符串转为 null（数据库友好）
    const payload: any = { avatar_url: finalAvatarUrl }
    for (const key of Object.keys(form)) {
      const v = (form as any)[key]
      if (typeof v === 'string') {
        payload[key] = v.trim() === '' ? null : v.trim()
      } else {
        payload[key] = v
      }
    }
    // 必填字段不允许 null（whatsapp 已改为可选）
    payload.contact_name = form.contact_name.trim()
    payload.owner_id = form.owner_id
    payload.level = form.level || '待定'
    payload.stage = form.stage || '待定'

    // 保存标签的辅助函数：先删除该 customer 所有标签，再 insert 当前的
    async function syncTags(customerId: string) {
      await supabase.from('customer_tags').delete().eq('customer_id', customerId)
      if (tags.length > 0) {
        await supabase.from('customer_tags').insert(
          tags.map(tag => ({ customer_id: customerId, tag, created_by: profile!.id }))
        )
      }
    }

    if (isEdit) {
      const oldOwnerId = customer!.owner_id
      const { error } = await supabase.from('customers').update(payload).eq('id', customer!.id)
      if (error) {
        if (newAvatarPath) await supabase.storage.from('customer-attachments').remove([newAvatarPath])
        alert('保存失败: ' + error.message); setSaving(false); return
      }
      // stage_changes 由 trg_record_stage_change 触发器自动写入。
      // ⑰ 修:update 成功后,3 个 side-effect 互不依赖,并行执行(原本 ~4s 串行 → 单次往返)
      const sideEffects: PromiseLike<unknown>[] = [syncTags(customer!.id)]
      if (payload.owner_id !== oldOwnerId) {
        sideEffects.push(
          supabase.from('customer_ownership_changes').insert({
            customer_id: customer!.id, changed_by: profile!.id, from_owner: oldOwnerId, to_owner: payload.owner_id,
          })
        )
      }
      // L7: 头像被替换或移除 → 删掉旧文件,避免存储孤儿
      const oldPath = avatarStoragePath(customer!.avatar_url)
      if (oldPath && customer!.avatar_url !== finalAvatarUrl) {
        sideEffects.push(supabase.storage.from('customer-attachments').remove([oldPath]))
      }
      await Promise.all(sideEffects)
      router.push(`/customers/${customer!.id}`)
    } else {
      const insertData = {
        ...payload,
        created_by: profile!.id,
        last_contact_date: todayLocalISO(),
      }
      const { data, error } = await supabase.from('customers').insert(insertData).select('id').single()
      if (error) {
        if (newAvatarPath) await supabase.storage.from('customer-attachments').remove([newAvatarPath])
        alert('保存失败: ' + error.message); setSaving(false); return
      }
      // stage_changes 由 trg_record_stage_change 触发器自动写入。
      await syncTags(data.id)
      router.push(`/customers/${data.id}`)
    }
  }

  function handleApplyImported(parsed: any) {
    const filled: Set<string> = new Set()
    setForm(f => {
      const next = { ...f }
      const set = (k: string, v: string | undefined) => {
        if (v && !(f as any)[k]) { (next as any)[k] = v; filled.add(k) }
      }
      set('contact_name', parsed.contact_name)
      set('whatsapp', parsed.whatsapp)
      set('email', parsed.email)
      set('country', parsed.country)
      set('source', parsed.source)
      // 微信 ID 现在写入独立字段
      set('wechat_id', parsed.detected?.wechat_id)
      if (parsed.notes) {
        next.notes = f.notes ? `${f.notes}\n${parsed.notes}` : parsed.notes
        filled.add('notes')
      }
      return next
    })
    setAiFilled(filled)
    setShowImporter(false)
    // AI 预填后立刻检查重号
    if (filled.has('whatsapp') && parsed.whatsapp) checkContact('whatsapp', parsed.whatsapp)
    if (filled.has('email') && parsed.email) checkContact('email', parsed.email)
    if (filled.has('wechat_id') && parsed.detected?.wechat_id) checkContact('wechat_id', parsed.detected.wechat_id)
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      {/* 截图智能录入入口（仅新建时显示） */}
      {!isEdit && (
        <div className="bg-gradient-to-r from-gold-50 to-amber-50 border border-gold-200 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Camera size={18} className="text-gold-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gold-800">截图智能录入</p>
              <p className="text-xs text-gold-700/70 truncate">上传微信 / WhatsApp / 名片截图，自动填充表单</p>
            </div>
          </div>
          <button type="button" onClick={() => setShowImporter(true)}
            className="shrink-0 px-3 py-1.5 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 cursor-pointer">
            上传截图
          </button>
        </div>
      )}

      {showImporter && (
        <ScreenshotImporter
          onClose={() => setShowImporter(false)}
          onApply={handleApplyImported}
          onCropAvatar={(s) => setCropperImage(s)}
        />
      )}

      {cropperImage && (
        <AvatarCropper imageSrc={cropperImage} onClose={() => setCropperImage(null)} onCrop={handleCropped} />
      )}

      {/* 头像上传区（整块可拖拽） */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) handleAvatarFile(f)
        }}
        className={`bg-white rounded-xl border-2 border-dashed transition-all p-4 lg:p-5 ${
          dragOver ? 'border-gold-500 bg-gold-50' : 'border-gray-200 hover:border-gold-300'
        }`}
      >
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => avatarInputRef.current?.click()}
            disabled={saving}
            className="shrink-0 relative group cursor-pointer disabled:cursor-not-allowed" title="点击或拖入图片">
            <CustomerAvatar url={avatarUrl} name={form.contact_name} size={72} />
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Camera size={20} className="text-white" />
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-700 mb-1">客户头像</p>
            <p className="text-xs text-gray-500 mb-2.5">
              {dragOver ? '松开鼠标即可上传' : '点击头像、拖拽图片到此处，或用下方按钮 — 都会进入裁剪'}
            </p>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer">
                <Upload size={14} />
                {avatarUrl ? '更换头像' : '选择图片'}
              </button>
              {avatarUrl && (
                <button type="button" onClick={removeAvatar}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 cursor-pointer">
                  <Trash2 size={14} /> 移除
                </button>
              )}
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = '' }} />
            </div>
          </div>
        </div>
      </div>

      {/* ─── 客户身份 ─── */}
      <Section title="客户身份">
        <Row>
          <Field label="联系人 / 客户名" required aiFilled={aiFilled.has('contact_name')}>
            <input required value={form.contact_name} onChange={e => update('contact_name', e.target.value)}
              className={inputCls('contact_name')} placeholder="客户姓名" />
          </Field>
          <Field label="职位">
            <input list="contact-title-suggestions" value={form.contact_title}
              onChange={e => update('contact_title', e.target.value)}
              className={inputCls('contact_title')} placeholder="如：采购经理 / Owner" />
            <datalist id="contact-title-suggestions">
              {CONTACT_TITLES.map(t => <option key={t} value={t} />)}
            </datalist>
          </Field>
        </Row>
        <Row>
          <Field label="性别">
            <select value={form.gender} onChange={e => update('gender', e.target.value)} className={inputCls('gender')}>
              <option value="">未填</option>
              {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="国家" aiFilled={aiFilled.has('country')}>
            <input list="country-suggestions" value={form.country}
              onChange={e => update('country', e.target.value)} className={inputCls('country')}
              placeholder="可下拉选择，也可直接输入" />
            <datalist id="country-suggestions">
              {COUNTRIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </Field>
        </Row>
        <Field label="公司名">
          <input value={form.company_name} onChange={e => update('company_name', e.target.value)}
            className={inputCls('company_name')} placeholder="可留空（个人买家）" />
        </Field>
        <Row>
          <Field label="公司网站">
            <input type="url" value={form.company_website} onChange={e => update('company_website', e.target.value)}
              className={inputCls('company_website')} placeholder="https://..." />
          </Field>
          <Field label="公司地址">
            <input value={form.company_address} onChange={e => update('company_address', e.target.value)}
              className={inputCls('company_address')} placeholder="完整地址（用于 PI）" />
          </Field>
        </Row>
      </Section>

      {/* ─── 联系方式 ─── */}
      <Section title="联系方式" subtitle="独立栏目，方便筛选与查询">
        <Row>
          <Field label="WhatsApp" aiFilled={aiFilled.has('whatsapp')}>
            <input value={form.whatsapp} onChange={e => update('whatsapp', e.target.value)}
              onBlur={e => checkContact('whatsapp', e.target.value)}
              className={inputCls('whatsapp')} placeholder="+971..." />
            {conflictWarnings.whatsapp && (
              <p className="text-xs text-amber-600 mt-1 bg-amber-50 px-2 py-1 rounded">{conflictWarnings.whatsapp}</p>
            )}
          </Field>
          <Field label="手机号">
            <input value={form.phone} onChange={e => update('phone', e.target.value)}
              onBlur={e => checkContact('phone', e.target.value)}
              className={inputCls('phone')} placeholder="可能与 WhatsApp 不同" />
            {conflictWarnings.phone && (
              <p className="text-xs text-amber-600 mt-1 bg-amber-50 px-2 py-1 rounded">{conflictWarnings.phone}</p>
            )}
          </Field>
        </Row>
        <Row>
          <Field label="邮箱" aiFilled={aiFilled.has('email')}>
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)}
              onBlur={e => checkContact('email', e.target.value)}
              className={inputCls('email')} placeholder="选填" />
            {conflictWarnings.email && (
              <p className="text-xs text-amber-600 mt-1 bg-amber-50 px-2 py-1 rounded">{conflictWarnings.email}</p>
            )}
          </Field>
          <Field label="微信号" aiFilled={aiFilled.has('wechat_id')}>
            <input value={form.wechat_id} onChange={e => update('wechat_id', e.target.value)}
              onBlur={e => checkContact('wechat_id', e.target.value)}
              className={inputCls('wechat_id')} placeholder="微信号 / wxid_..." />
            {conflictWarnings.wechat_id && (
              <p className="text-xs text-amber-600 mt-1 bg-amber-50 px-2 py-1 rounded">{conflictWarnings.wechat_id}</p>
            )}
          </Field>
        </Row>
        <Row>
          <Field label="Telegram">
            <input value={form.telegram} onChange={e => update('telegram', e.target.value)}
              className={inputCls('telegram')} placeholder="@用户名 或 链接" />
          </Field>
          <Field label="LinkedIn">
            <input value={form.linkedin} onChange={e => update('linkedin', e.target.value)}
              className={inputCls('linkedin')} placeholder="linkedin.com/in/..." />
          </Field>
        </Row>
        <Row>
          <Field label="Skype">
            <input value={form.skype} onChange={e => update('skype', e.target.value)}
              className={inputCls('skype')} placeholder="Skype 用户名" />
          </Field>
          <Field label="Instagram">
            <input value={form.instagram} onChange={e => update('instagram', e.target.value)}
              className={inputCls('instagram')} placeholder="@用户名" />
          </Field>
        </Row>
        <Row>
          <Field label="Facebook">
            <input value={form.facebook} onChange={e => update('facebook', e.target.value)}
              className={inputCls('facebook')} placeholder="个人主页链接" />
          </Field>
          <Field label="阿里巴巴账号">
            <input value={form.alibaba_id} onChange={e => update('alibaba_id', e.target.value)}
              className={inputCls('alibaba_id')} placeholder="客户的阿里旺旺/账号" />
          </Field>
        </Row>
      </Section>

      {/* ─── 归属 ─── */}
      <Section title="归属">
        <Row>
          {isAdmin ? (
            <Field label="所属业务员" required>
              <select required value={form.owner_id} onChange={e => update('owner_id', e.target.value)} className="input">
                <option value="">请选择</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="所属业务员">
              <div className="px-3 py-2 text-sm text-gray-600 bg-gray-50 rounded-lg border border-gray-200">
                {members.find(m => m.id === form.owner_id)?.full_name || profile?.full_name || '-'}
                <span className="ml-2 text-xs text-gray-400">（仅管理员可转移）</span>
              </div>
            </Field>
          )}
          <Field label="首次接触日期">
            <input type="date" value={form.first_contact_date}
              onChange={e => update('first_contact_date', e.target.value)} className={inputCls('first_contact_date')} />
          </Field>
        </Row>
        <Field label="客户来源" aiFilled={aiFilled.has('source')}>
          <input list="source-suggestions" value={form.source}
            onChange={e => update('source', e.target.value)}
            className={inputCls('source')} placeholder="可下拉选择，也可直接输入新来源" />
          <datalist id="source-suggestions">
            {SOURCES.map(s => <option key={s} value={s} />)}
          </datalist>
        </Field>
      </Section>

      {/* ─── 进展 ─── */}
      <Section title="进展">
        <Row>
          <Field label="客户分级">
            <select value={form.level} onChange={e => update('level', e.target.value)} className="input">
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="当前阶段">
            <select value={form.stage} onChange={e => update('stage', e.target.value)} className="input">
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="产品/需求品类">
            <select value={form.product_category} onChange={e => update('product_category', e.target.value)} className="input">
              <option value="">选填</option>
              {PRODUCT_CATEGORIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="采购频率">
            <select value={form.purchase_frequency} onChange={e => update('purchase_frequency', e.target.value)} className="input">
              <option value="">选填</option>
              {PURCHASE_FREQUENCIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </Row>
        <Field label="决策角色">
          <select value={form.decision_role} onChange={e => update('decision_role', e.target.value)} className="input">
            <option value="">选填</option>
            {DECISION_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
      </Section>

      {/* ─── 公司画像 ─── */}
      <Section title="公司画像" subtitle="选填，但填了对判断订单潜力很有帮助">
        <Row>
          <Field label="行业">
            <select value={form.industry} onChange={e => update('industry', e.target.value)} className="input">
              <option value="">选填</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="公司规模">
            <select value={form.company_size} onChange={e => update('company_size', e.target.value)} className="input">
              <option value="">选填</option>
              {COMPANY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </Row>
      </Section>

      {/* ─── 商务偏好 ─── */}
      <Section title="商务偏好">
        <Row>
          <Field label="付款偏好">
            <select value={form.payment_preference} onChange={e => update('payment_preference', e.target.value)} className="input">
              <option value="">选填</option>
              {PAYMENT_PREFERENCES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="货币偏好">
            <select value={form.currency_preference} onChange={e => update('currency_preference', e.target.value)} className="input">
              <option value="">选填</option>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </Row>
        <Field label="贸易条款（Incoterms）">
          <select value={form.incoterms} onChange={e => update('incoterms', e.target.value)} className="input">
            <option value="">选填</option>
            {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
      </Section>

      {/* ─── 标签 ─── */}
      <Section title="客户标签" subtitle="点击预置标签快速添加，也可输入自定义标签">
        <TagsEditor tags={tags} onChange={setTags} />
      </Section>

      {/* ─── 备注 ─── */}
      <Section title="打交道要知道的事">
        <Field label="重要备注" aiFilled={aiFilled.has('notes')}>
          <textarea value={form.notes} onChange={e => update('notes', e.target.value)}
            className={`${inputCls('notes')} min-h-[100px]`}
            placeholder="砍价习惯、宗教节日节奏、决策人、家庭情况、爱好等..." />
        </Field>
      </Section>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving}
          className="px-6 py-2.5 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 disabled:opacity-50 cursor-pointer">
          {saving ? '保存中...' : isEdit ? '保存修改' : '创建客户'}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-6 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer">
          取消
        </button>
      </div>
    </form>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
}

function Field({ label, required, aiFilled, children }: { label: string; required?: boolean; aiFilled?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm text-gray-600 mb-1 flex items-center gap-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {aiFilled && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">AI 预填</span>
        )}
      </label>
      {children}
    </div>
  )
}
