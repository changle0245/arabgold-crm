'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import { CustomerAvatar } from '@/components/customer-avatar'
import { TagBadge } from '@/components/tags-editor'
import { QuotationPanel } from '@/components/quotation-panel'
import { DealPanel } from '@/components/deal-panel'
import { SamplePanel } from '@/components/sample-panel'
import { ReminderPanel } from '@/components/reminder-panel'
import { ConfirmModal } from '@/components/confirm-modal'
import { ChatImportModal } from '@/components/chat-import-modal'
import { RecordEmailModal } from '@/components/record-email-modal'
import { TranslationEditModal } from '@/components/translation-edit-modal'
import type { Customer, ContactLog, CustomerAttachment, Profile, Quotation, Deal, Sample, Reminder, TimelineEvent, CommunicationLog } from '@/lib/types'
import { CONTACT_TAGS, QUOTATION_STATUS_LABELS, DEAL_STATUS_LABELS, SAMPLE_STATUS_LABELS, REMINDER_TYPE_LABELS } from '@/lib/constants'
import { Pencil, Trash2, Upload, Plus, ArrowLeft, FileText, Image as ImageIcon, Phone, Package, Truck, TrendingUp, Check, UserCog, MessageSquare, Mail } from 'lucide-react'
import { todayLocalISO } from '@/lib/dates'

const typeMeta: Record<TimelineEvent['type'], {
  icon: typeof Phone
  label: string
  chipClass: string
  iconClass: string
}> = {
  contact:          { icon: Phone,         label: '联系',     chipClass: 'bg-gold-50 text-gold-700',         iconClass: 'text-gold-500' },
  quotation:        { icon: FileText,      label: '报价',     chipClass: 'bg-blue-50 text-blue-700',         iconClass: 'text-blue-500' },
  deal:             { icon: Package,       label: '成交',     chipClass: 'bg-green-50 text-green-700',       iconClass: 'text-green-500' },
  sample:           { icon: Truck,         label: '样品',     chipClass: 'bg-purple-50 text-purple-700',     iconClass: 'text-purple-500' },
  stage_change:     { icon: TrendingUp,    label: '阶段',     chipClass: 'bg-amber-50 text-amber-700',       iconClass: 'text-amber-500' },
  reminder:         { icon: Check,         label: '提醒',     chipClass: 'bg-gray-100 text-gray-600',        iconClass: 'text-gray-400' },
  ownership_change: { icon: UserCog,       label: '转单',     chipClass: 'bg-pink-50 text-pink-700',         iconClass: 'text-pink-500' },
  whatsapp:         { icon: MessageSquare, label: 'WhatsApp', chipClass: 'bg-emerald-50 text-emerald-700',   iconClass: 'text-emerald-500' },
  wechat:           { icon: MessageSquare, label: '微信',     chipClass: 'bg-green-50 text-green-700',       iconClass: 'text-green-500' },
  email:            { icon: Mail,          label: '邮件',     chipClass: 'bg-indigo-50 text-indigo-700',     iconClass: 'text-indigo-500' },
}

type Tab = 'overview' | 'quotations' | 'deals' | 'samples'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile, isAdmin } = useAuth()
  const router = useRouter()
  const [customer, setCustomer] = useState<Customer & { owner?: Profile } | null>(null)
  const [logs, setLogs] = useState<(ContactLog & { logger?: Profile })[]>([])
  const [attachments, setAttachments] = useState<(CustomerAttachment & { uploader?: Profile })[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [samples, setSamples] = useState<Sample[]>([])
  const [stageChanges, setStageChanges] = useState<{ id: string; from_stage: string | null; to_stage: string; changed_at: string; changed_by_name: string }[]>([])
  const [ownershipChanges, setOwnershipChanges] = useState<{ id: string; from_owner_name: string | null; to_owner_name: string; changed_at: string; changed_by_name: string }[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [communicationLogs, setCommunicationLogs] = useState<(CommunicationLog & { editor?: Profile })[]>([])
  const [commTotal, setCommTotal] = useState(0)
  const [showOriginalIds, setShowOriginalIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showLogForm, setShowLogForm] = useState(false)
  const [logTag, setLogTag] = useState<string>(CONTACT_TAGS[0])
  const [logNote, setLogNote] = useState('')
  const [logDate, setLogDate] = useState(todayLocalISO())
  const [savingLog, setSavingLog] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dealPrefill, setDealPrefill] = useState<Quotation | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // ⑭ 删除附件确认 modal（替代 window.confirm，统一设计语言）
  const [pendingDeleteAttachment, setPendingDeleteAttachment] = useState<CustomerAttachment | null>(null)
  const [deletingAttachment, setDeletingAttachment] = useState(false)
  const [showImportChat, setShowImportChat] = useState(false)
  const [showRecordEmail, setShowRecordEmail] = useState(false)
  const [editingTranslation, setEditingTranslation] = useState<{ logId: string; original: string | null; translated: string | null } | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const [
      { data: cust },
      { data: contactLogs },
      { data: atts },
      { data: tagRows },
      { data: quots },
      { data: dealRows },
      { data: sampleRows },
      { data: stageRows },
      { data: ownershipRows },
      { data: reminderRows },
      { data: memberRows },
      { data: commLogs, count: commCount },
    ] = await Promise.all([
      supabase
        .from('customers')
        .select('*, owner:profiles!customers_owner_id_fkey(*)')
        .eq('id', id)
        .single(),
      supabase
        .from('contact_logs')
        .select('*, logger:profiles!contact_logs_logged_by_fkey(*)')
        .eq('customer_id', id)
        .order('log_date', { ascending: false }),
      supabase
        .from('customer_attachments')
        .select('*, uploader:profiles!customer_attachments_uploaded_by_fkey(*)')
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('customer_tags').select('tag').eq('customer_id', id),
      supabase
        .from('quotations')
        .select('*, creator:profiles!quotations_created_by_fkey(*)')
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('deals')
        .select('*, creator:profiles!deals_created_by_fkey(*)')
        .eq('customer_id', id)
        .order('deal_date', { ascending: false }),
      supabase
        .from('samples')
        .select('*, creator:profiles!samples_created_by_fkey(*)')
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('stage_changes')
        .select('*, changer:profiles!stage_changes_changed_by_fkey(full_name)')
        .eq('customer_id', id)
        .order('changed_at', { ascending: false }),
      supabase
        .from('customer_ownership_changes')
        .select('*, changer:profiles!customer_ownership_changes_changed_by_fkey(full_name), from_profile:profiles!customer_ownership_changes_from_owner_fkey(full_name), to_profile:profiles!customer_ownership_changes_to_owner_fkey(full_name)')
        .eq('customer_id', id)
        .order('changed_at', { ascending: false }),
      supabase
        .from('reminders')
        .select('*, assignee:profiles!reminders_assigned_to_fkey(*)')
        .eq('customer_id', id)
        .order('due_date', { ascending: true }),
      supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true),
      supabase
        .from('communication_logs')
        .select('*, editor:profiles!communication_logs_translation_edited_by_fkey(full_name)', { count: 'exact' })
        .eq('customer_id', id)
        .order('sent_at', { ascending: false })
        .limit(200),
    ])
    setCustomer(cust)
    setLogs(contactLogs || [])
    setAttachments(atts || [])
    setTags((tagRows || []).map(r => r.tag))
    setQuotations(quots || [])
    setDeals(dealRows || [])
    setSamples(sampleRows || [])
    setStageChanges((stageRows || []).map((s: any) => ({
      id: s.id,
      from_stage: s.from_stage,
      to_stage: s.to_stage,
      changed_at: s.changed_at,
      changed_by_name: s.changer?.full_name || '',
    })))
    setOwnershipChanges((ownershipRows || []).map((o: any) => ({
      id: o.id,
      from_owner_name: o.from_profile?.full_name || null,
      to_owner_name: o.to_profile?.full_name || '',
      changed_at: o.changed_at,
      changed_by_name: o.changer?.full_name || '',
    })))
    setReminders((reminderRows as Reminder[]) || [])
    setMembers((memberRows as Profile[]) || [])
    setCommunicationLogs((commLogs as (CommunicationLog & { editor?: Profile })[]) || [])
    setCommTotal(commCount || 0)
    setLoading(false)
  }, [id])

  function toggleShowOriginal(eventId: string) {
    setShowOriginalIds(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  useEffect(() => { loadData() }, [loadData])

  async function handleAddLog(e: React.FormEvent) {
    e.preventDefault()
    setSavingLog(true)
    const supabase = createClient()
    await supabase.from('contact_logs').insert({
      customer_id: id,
      logged_by: profile!.id,
      log_date: logDate,
      tag: logTag,
      note: logNote.trim() || null,
    })
    setShowLogForm(false)
    setLogNote('')
    setLogDate(todayLocalISO())
    setSavingLog(false)
    loadData()
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const supabase = createClient()

    const ext = file.name.split('.').pop()
    const path = `${id}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('customer-attachments')
      .upload(path, file)

    if (uploadError) {
      alert('上传失败: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('customer-attachments')
      .getPublicUrl(path)

    await supabase.from('customer_attachments').insert({
      customer_id: id,
      uploaded_by: profile!.id,
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_type: file.type.startsWith('image/') ? 'image' : 'document',
      file_size: file.size,
    })

    setUploading(false)
    e.target.value = ''
    loadData()
  }

  async function confirmDeleteAttachment() {
    if (!pendingDeleteAttachment) return
    setDeletingAttachment(true)
    const supabase = createClient()
    await supabase.from('customer_attachments').delete().eq('id', pendingDeleteAttachment.id)
    setDeletingAttachment(false)
    setPendingDeleteAttachment(null)
    loadData()
  }

  async function doDeleteCustomer() {
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) {
      alert('删除失败: ' + error.message)
      setDeleting(false)
      return
    }
    router.push('/customers')
  }

  if (loading) return <div className="p-6 text-gray-400">加载中...</div>
  if (!customer) return (
    <div className="p-6 space-y-2">
      <p className="text-gray-500">客户不存在或您无权限查看</p>
      <Link href="/customers" className="inline-block text-sm text-gold-600 hover:text-gold-700">← 返回客户列表</Link>
    </div>
  )

  const canEdit = isAdmin || customer.owner_id === profile?.id

  // Build timeline events
  const timelineEvents: TimelineEvent[] = [
    ...logs.map(l => ({
      id: `log-${l.id}`,
      date: l.log_date,
      type: 'contact' as const,
      title: l.tag,
      detail: l.note,
      user: l.logger?.full_name || null,
    })),
    ...quotations.map(q => ({
      id: `quote-${q.id}`,
      date: q.created_at.split('T')[0],
      type: 'quotation' as const,
      title: `${q.quote_no || '报价'} V${q.version}`,
      detail: `${q.currency} ${q.total_amount?.toFixed(2) || '0'} · ${QUOTATION_STATUS_LABELS[q.status] || q.status}`,
      user: q.creator?.full_name || null,
    })),
    ...deals.map(d => ({
      id: `deal-${d.id}`,
      date: d.deal_date || d.created_at.split('T')[0],
      type: 'deal' as const,
      title: `${d.deal_no || '成交'}${d.is_reorder ? ' (返单)' : ''}`,
      detail: `${d.currency} ${d.deal_amount?.toFixed(2) || '0'} · ${DEAL_STATUS_LABELS[d.status] || d.status}`,
      user: d.creator?.full_name || null,
    })),
    ...samples.map(s => ({
      id: `sample-${s.id}`,
      date: s.sent_date || s.created_at.split('T')[0],
      type: 'sample' as const,
      title: s.sample_desc || '样品',
      detail: `${SAMPLE_STATUS_LABELS[s.status] || s.status}${s.tracking_no ? ' · ' + s.tracking_no : ''}`,
      user: s.creator?.full_name || null,
    })),
    ...stageChanges.map(sc => ({
      id: `stage-${sc.id}`,
      date: sc.changed_at.split('T')[0],
      type: 'stage_change' as const,
      title: `${sc.from_stage || '无'} → ${sc.to_stage}`,
      detail: null,
      user: sc.changed_by_name || null,
    })),
    ...ownershipChanges.map(oc => ({
      id: `ownership-${oc.id}`,
      date: oc.changed_at.split('T')[0],
      type: 'ownership_change' as const,
      title: `${oc.from_owner_name || '无'} → ${oc.to_owner_name}`,
      detail: null,
      user: oc.changed_by_name || null,
    })),
    ...reminders
      .filter(r => r.status === 'completed' && r.completed_at)
      .map(r => ({
        id: `rem-${r.id}`,
        date: r.completed_at!.split('T')[0],
        type: 'reminder' as const,
        title: `已完成提醒：${REMINDER_TYPE_LABELS[r.type] || r.type}`,
        detail: r.note,
        user: r.assignee?.full_name || null,
      })),
    ...communicationLogs.map(c => {
      const meta = (c.raw_meta as Record<string, unknown> | null) || {}
      const subject = meta.subject as string | undefined
      const attachments = meta.attachments as { name: string; url: string }[] | undefined
      return {
        id: `comm-${c.id}`,
        date: c.sent_at.split('T')[0],
        type: c.channel,
        title: `${c.direction === 'outgoing' ? '我方发出' : '客户发来'}${subject ? ' · ' + subject : ''}${c.sender_name ? ' · ' + c.sender_name : ''}`,
        detail: c.translated_content || c.content || null,
        user: c.direction === 'outgoing' ? '我方' : (customer.contact_name || null),
        original: c.content,
        translated: c.translated_content,
        translatedEditedBy: c.editor?.full_name || null,
        attachments,
      } as TimelineEvent
    }),
  ].sort((a, b) => b.date.localeCompare(a.date))

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: '概览' },
    { key: 'quotations', label: '报价', count: quotations.length },
    { key: 'deals', label: '成交', count: deals.length },
    { key: 'samples', label: '样品', count: samples.length },
  ]

  // Sum deals by currency for accurate multi-currency display
  const dealTotalsByCurrency = deals.reduce<Record<string, number>>((acc, d) => {
    const cur = d.currency || 'USD'
    acc[cur] = (acc[cur] || 0) + (d.deal_amount || 0)
    return acc
  }, {})
  const dealSummaryText = Object.entries(dealTotalsByCurrency)
    .map(([cur, amt]) => `${cur} ${amt.toFixed(0)}`)
    .join(' · ')

  return (
    <div className="p-4 lg:p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/customers" className="text-gray-400 hover:text-gray-600 shrink-0">
          <ArrowLeft size={20} />
        </Link>
        <CustomerAvatar url={customer.avatar_url} name={customer.contact_name} size={56} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{customer.contact_name}</h1>
          {customer.company_name && (
            <p className="text-sm text-gray-500 truncate">{customer.company_name}</p>
          )}
          {/* Quick stats */}
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
            <span>{customer.stage}</span>
            {customer.level !== '待定' && <span>{customer.level}</span>}
            {deals.length > 0 && <span className="text-green-600 font-medium">{deals.length}单 · {dealSummaryText}</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {canEdit && (
            <button
              onClick={() => setShowImportChat(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
            >
              <MessageSquare size={14} />
              导入聊天
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setShowRecordEmail(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-indigo-200 rounded-lg text-sm text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
            >
              <Mail size={14} />
              记录邮件
            </button>
          )}
          {canEdit && (
            <Link
              href={`/customers/${id}/edit`}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Pencil size={14} />
              编辑
            </Link>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
              删除
            </button>
          )}
        </div>
      </div>

      {showImportChat && (
        <ChatImportModal
          customerId={id}
          customerName={customer.contact_name}
          onClose={() => setShowImportChat(false)}
          onSuccess={(r) => {
            setShowImportChat(false)
            alert(`成功导入 ${r.imported} 条 ${r.channel === 'whatsapp' ? 'WhatsApp' : '微信'} 消息${r.skipped > 0 ? `（跳过 ${r.skipped} 行无法解析）` : ''}`)
            loadData()
          }}
        />
      )}

      {showRecordEmail && (
        <RecordEmailModal
          customerId={id}
          customerName={customer.contact_name}
          onClose={() => setShowRecordEmail(false)}
          onSuccess={(r) => {
            setShowRecordEmail(false)
            alert(`邮件已记录${r.attachmentCount > 0 ? `（含 ${r.attachmentCount} 个附件）` : ''}`)
            loadData()
          }}
        />
      )}

      {editingTranslation && (
        <TranslationEditModal
          logId={editingTranslation.logId}
          original={editingTranslation.original}
          currentTranslated={editingTranslation.translated}
          onClose={() => setEditingTranslation(null)}
          onSuccess={() => {
            setEditingTranslation(null)
            loadData()
          }}
        />
      )}

      <ConfirmModal
        open={!!pendingDeleteAttachment}
        onClose={() => setPendingDeleteAttachment(null)}
        onConfirm={confirmDeleteAttachment}
        title={pendingDeleteAttachment ? `删除附件"${pendingDeleteAttachment.file_name}"？` : ''}
        description={<p className="text-red-600 font-medium">此操作不可撤销。</p>}
        dangerLevel="medium"
        confirmLabel="删除"
        loading={deletingAttachment}
      />

      <ConfirmModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={doDeleteCustomer}
        title={`删除客户「${customer.contact_name}」？`}
        description={
          <>
            <p>将永久删除以下全部关联数据：</p>
            <ul className="list-disc pl-5 space-y-0.5 text-gray-700">
              <li>{quotations.length} 个报价（含所有版本历史）</li>
              <li>
                {deals.length} 个成交单
                {deals.length > 0 && (() => {
                  const totals = deals.reduce<Record<string, number>>((acc, d) => {
                    const cur = d.currency || 'USD'
                    acc[cur] = (acc[cur] || 0) + Number(d.deal_amount || 0)
                    return acc
                  }, {})
                  const summary = Object.entries(totals)
                    .map(([cur, amt]) => `${cur} ${amt.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
                    .join(' + ')
                  return `（累计 ${summary}）`
                })()}
              </li>
              <li>{samples.length} 个样品记录</li>
              <li>{reminders.length} 个待办提醒</li>
              <li>{attachments.length} 个附件</li>
              <li>{logs.length} 条联系记录与全部阶段变更历史</li>
            </ul>
            <p className="text-red-600 font-medium pt-1">此操作不可撤销！</p>
          </>
        }
        dangerLevel="high"
        confirmPhrase={customer.contact_name}
        confirmLabel="永久删除"
        loading={deleting}
      />

      {/* Tags */}
      {tags.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 mr-1">标签:</span>
          {tags.map(t => <TagBadge key={t} tag={t} />)}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-gold-600 text-gold-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="ml-1.5 text-xs text-gray-400">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Info Cards */}
          <InfoSection title="客户身份">
            <InfoRow label="公司" value={customer.company_name} />
            <InfoRow label="职位" value={customer.contact_title} />
            <InfoRow label="性别" value={customer.gender} />
            <InfoRow label="国家" value={customer.country} />
            <InfoRow label="公司网站" value={customer.company_website} link />
            <InfoRow label="公司地址" value={customer.company_address} />
          </InfoSection>

          <InfoSection title="联系方式">
            <InfoRow label="WhatsApp" value={customer.whatsapp} />
            <InfoRow label="手机号" value={customer.phone} />
            <InfoRow label="邮箱" value={customer.email} />
            <InfoRow label="微信号" value={customer.wechat_id} />
            <InfoRow label="Telegram" value={customer.telegram} />
            <InfoRow label="LinkedIn" value={customer.linkedin} link />
            <InfoRow label="Skype" value={customer.skype} />
            <InfoRow label="Instagram" value={customer.instagram} />
            <InfoRow label="Facebook" value={customer.facebook} link />
            <InfoRow label="阿里巴巴" value={customer.alibaba_id} />
          </InfoSection>

          <InfoSection title="归属 / 进展">
            <InfoRow label="所属业务员" value={customer.owner?.full_name} />
            <InfoRow label="客户分级" value={customer.level} />
            <InfoRow label="当前阶段" value={customer.stage} />
            <InfoRow label="客户来源" value={customer.source} />
            <InfoRow label="首次接触" value={customer.first_contact_date} />
            <InfoRow label="最近联系" value={customer.last_contact_date} />
            <InfoRow label="产品品类" value={customer.product_category} />
            <InfoRow label="采购频率" value={customer.purchase_frequency} />
            <InfoRow label="决策角色" value={customer.decision_role} />
          </InfoSection>

          <InfoSection title="公司画像 / 商务偏好">
            <InfoRow label="行业" value={customer.industry} />
            <InfoRow label="公司规模" value={customer.company_size} />
            <InfoRow label="付款偏好" value={customer.payment_preference} />
            <InfoRow label="货币偏好" value={customer.currency_preference} />
            <InfoRow label="贸易条款" value={customer.incoterms} />
          </InfoSection>

          {/* Deal summary */}
          {deals.length > 0 && (
            <InfoSection title="成交概况">
              <InfoRow label="成交次数" value={String(customer.total_deal_count)} />
              <InfoRow label="累计金额" value={dealSummaryText || '-'} />
              <InfoRow label="首次成交" value={customer.first_deal_date} />
            </InfoSection>
          )}

          {/* Reminders */}
          <ReminderPanel
            customerId={id}
            reminders={reminders}
            members={members}
            canEdit={canEdit}
            onRefresh={loadData}
          />

          {customer.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">重要备注</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}

          {/* Attachments */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">客户附件</h2>
              {canEdit && (
                <label className={`flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Upload size={14} />
                  {uploading ? '上传中...' : '上传附件'}
                  <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              )}
            </div>
            {attachments.length === 0 ? (
              <p className="text-sm text-gray-400">暂无附件</p>
            ) : (
              <div className="space-y-2">
                {attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 group">
                    {att.file_type === 'image' ? <ImageIcon size={16} className="text-blue-500" /> : <FileText size={16} className="text-gray-400" />}
                    <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm text-gray-700 hover:text-gold-700 truncate">
                      {att.file_name}
                    </a>
                    <span className="text-xs text-gray-400">{att.uploader?.full_name}</span>
                    {(isAdmin || att.uploaded_by === profile?.id) && (
                      <button
                        onClick={() => setPendingDeleteAttachment(att)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contact Log */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">客户事件</h2>
              {canEdit && (
                <button
                  onClick={() => setShowLogForm(!showLogForm)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  记录联系
                </button>
              )}
            </div>

            {showLogForm && (
              <form onSubmit={handleAddLog} className="mb-4 p-3 bg-gray-50 rounded-lg space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">日期</label>
                    <input
                      type="date"
                      value={logDate}
                      onChange={e => setLogDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">标签 *</label>
                    <select
                      value={logTag}
                      onChange={e => setLogTag(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    >
                      {CONTACT_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">一句话备注（选填）</label>
                  <input
                    type="text"
                    value={logNote}
                    onChange={e => setLogNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    placeholder="简要说明本次跟进情况..."
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={savingLog} className="px-4 py-2 bg-gold-600 text-white rounded-lg text-sm hover:bg-gold-700 disabled:opacity-50 cursor-pointer">
                    {savingLog ? '保存中...' : '保存'}
                  </button>
                  <button type="button" onClick={() => setShowLogForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
                    取消
                  </button>
                </div>
              </form>
            )}

            {timelineEvents.length === 0 ? (
              <p className="text-sm text-gray-400">暂无事件</p>
            ) : (
              <div className="space-y-0">
                {commTotal > communicationLogs.length && (
                  <p className="text-xs text-gray-400 py-2">
                    共 {commTotal} 条沟通记录，时间线仅显示最近 {communicationLogs.length} 条
                  </p>
                )}
                {timelineEvents.map(ev => {
                  const meta = typeMeta[ev.type]
                  const Icon = meta.icon
                  const isComm = ev.type === 'whatsapp' || ev.type === 'wechat' || ev.type === 'email'
                  const hasTranslation = !!(ev.translated && ev.original && ev.translated !== ev.original)
                  const showOriginal = showOriginalIds.has(ev.id)
                  const displayText = isComm
                    ? (showOriginal ? ev.original : (ev.translated || ev.original))
                    : ev.detail
                  return (
                    <div key={ev.id} className="flex gap-3 py-3 border-t border-gray-100 first:border-t-0">
                      <Icon size={14} className={`${meta.iconClass} mt-1 shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm text-gray-900 font-medium">{ev.date}</span>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${meta.chipClass}`}>{meta.label}</span>
                          <span className="text-sm text-gray-700">{ev.title}</span>
                          {ev.user && <span className="text-xs text-gray-400 ml-auto">{ev.user}</span>}
                        </div>
                        {displayText && (
                          <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap break-words">{displayText}</p>
                        )}
                        {isComm && (
                          <div className="flex items-center gap-3 mt-1 text-xs flex-wrap">
                            {hasTranslation && (
                              <button
                                onClick={() => toggleShowOriginal(ev.id)}
                                className="text-gray-400 hover:text-gold-600 cursor-pointer"
                              >
                                {showOriginal ? '看译文' : '看原文'}
                              </button>
                            )}
                            {!ev.translated && ev.original && (
                              <span className="text-gray-300">(尚未翻译)</span>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => {
                                  const logId = ev.id.replace(/^comm-/, '')
                                  const log = communicationLogs.find(c => c.id === logId)
                                  if (log) {
                                    setEditingTranslation({
                                      logId: log.id,
                                      original: log.content,
                                      translated: log.translated_content,
                                    })
                                  }
                                }}
                                className="text-gray-400 hover:text-gold-600 cursor-pointer inline-flex items-center gap-1"
                                title={ev.translated ? '修订译文' : '添加译文'}
                              >
                                <Pencil size={11} />
                                {ev.translated ? '修订译文' : '添加译文'}
                              </button>
                            )}
                            {ev.translatedEditedBy && (
                              <span className="text-gray-300">已由 {ev.translatedEditedBy} 修订</span>
                            )}
                            {ev.attachments && ev.attachments.length > 0 && (
                              <span className="flex flex-wrap gap-2">
                                {ev.attachments.map(a => (
                                  <a key={a.url} href={`/api/communication-files?path=${encodeURIComponent(a.url)}`} target="_blank" rel="noopener noreferrer"
                                    className="text-indigo-600 hover:underline">📎 {a.name}</a>
                                ))}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'quotations' && (
        <QuotationPanel
          customerId={id}
          quotations={quotations}
          canEdit={canEdit}
          onRefresh={loadData}
          onConvertToDeal={q => { setDealPrefill(q); setActiveTab('deals') }}
        />
      )}

      {activeTab === 'deals' && (
        <DealPanel
          customerId={id}
          deals={deals}
          quotations={quotations}
          canEdit={canEdit}
          onRefresh={loadData}
          prefillQuotation={dealPrefill}
          onPrefillConsumed={() => setDealPrefill(null)}
        />
      )}

      {activeTab === 'samples' && (
        <SamplePanel
          customerId={id}
          samples={samples}
          canEdit={canEdit}
          onRefresh={loadData}
        />
      )}
    </div>
  )
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value, link }: { label: string; value: string | null | undefined; link?: boolean }) {
  const empty = !value
  return (
    <div>
      <span className="text-gray-400 text-xs">{label}</span>
      {empty ? (
        <p className="text-gray-300">-</p>
      ) : link ? (
        <a href={value!.startsWith('http') ? value! : `https://${value}`} target="_blank" rel="noopener noreferrer"
          className="text-gold-700 hover:underline break-all">{value}</a>
      ) : (
        <p className="text-gray-800 break-all">{value}</p>
      )}
    </div>
  )
}
