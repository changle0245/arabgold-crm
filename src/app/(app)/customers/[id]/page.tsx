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
import { LifecycleTimeline } from '@/components/lifecycle-timeline'
import type { Customer, ContactLog, CustomerAttachment, Profile, Quotation, Deal, Sample, Reminder, TimelineEvent, CommunicationLog } from '@/lib/types'
import { CONTACT_TAGS, QUOTATION_STATUS_LABELS, DEAL_STATUS_LABELS, SAMPLE_STATUS_LABELS, REMINDER_TYPE_LABELS } from '@/lib/constants'
import { Pencil, Trash2, Upload, Plus, ArrowLeft, FileText, Image as ImageIcon, MessageSquare, Mail } from 'lucide-react'

type Tab = 'overview' | 'quotations' | 'deals' | 'samples' | 'timeline'

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
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showLogForm, setShowLogForm] = useState(false)
  const [logTag, setLogTag] = useState<string>(CONTACT_TAGS[0])
  const [logNote, setLogNote] = useState('')
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0])
  const [savingLog, setSavingLog] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dealPrefill, setDealPrefill] = useState<Quotation | null>(null)
  const [communicationLogs, setCommunicationLogs] = useState<CommunicationLog[]>([])
  const [showWhatsAppImport, setShowWhatsAppImport] = useState(false)
  const [importingWhatsApp, setImportingWhatsApp] = useState(false)
  const [whatsappFile, setWhatsappFile] = useState<File | null>(null)
  const [companyKeywords, setCompanyKeywords] = useState('')
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailDirection, setEmailDirection] = useState<'outgoing' | 'incoming'>('outgoing')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailContent, setEmailContent] = useState('')
  const [emailSentAt, setEmailSentAt] = useState(new Date().toISOString().slice(0, 16))
  const [emailAttachments, setEmailAttachments] = useState<FileList | null>(null)

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
      { data: reminderRows },
      { data: memberRows },
      { data: commLogRows },
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
        .from('reminders')
        .select('*, assignee:profiles!reminders_assigned_to_fkey(*)')
        .eq('customer_id', id)
        .order('due_date', { ascending: true }),
            supabase
        .from('communication_logs')
        .select('*')
        .eq('customer_id', id)
        .order('sent_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true),
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
    setReminders((reminderRows as Reminder[]) || [])
    setMembers((memberRows as Profile[]) || [])
    setCommunicationLogs((commLogRows as CommunicationLog[]) || [])
    setLoading(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])

    async function handleWhatsAppImport(e: React.FormEvent) {
    e.preventDefault()
    if (!whatsappFile) return

    setImportingWhatsApp(true)
    const supabase = createClient()
    const formData = new FormData()
    formData.append('file', whatsappFile)
    formData.append('myCompanyKeywords', companyKeywords)

    try {
      const response = await fetch(`/api/customers/${id}/import-whatsapp`, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        alert('导入失败: ' + (result.error || '未知错误'))
      } else {
        alert(`成功导入 ${result.messageCount} 条消息！`)
        setShowWhatsAppImport(false)
        setWhatsappFile(null)
        setCompanyKeywords('')
        loadData()
      }
    } catch (error) {
      console.error('Import error:', error)
      alert('导入失败: ' + error)
    } finally {
      setImportingWhatsApp(false)
    }
  }
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSavingEmail(true)

    const formData = new FormData()
    formData.append('direction', emailDirection)
    formData.append('subject', emailSubject.trim())
    formData.append('content', emailContent.trim())
    formData.append('sentAt', emailSentAt)

    if (emailAttachments) {
      for (let i = 0; i < emailAttachments.length; i++) {
        formData.append('attachments', emailAttachments[i])
      }
    }

    try {
      const response = await fetch(`/api/customers/${id}/record-email`, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        alert('保存失败: ' + (result.error || '未知错误'))
      } else {
        alert(`邮件记录已保存！${result.attachmentCount > 0 ? ` (包含 ${result.attachmentCount} 个附件)` : ''}`)
        setShowEmailForm(false)
        setEmailSubject('')
        setEmailContent('')
        setEmailSentAt(new Date().toISOString().slice(0, 16))
        setEmailAttachments(null)
        setEmailDirection('outgoing')
        loadData()
      }
    } catch (error) {
      console.error('Email submit error:', error)
      alert('保存失败: ' + error)
    } finally {
      setSavingEmail(false)
    }
  }


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
    setLogDate(new Date().toISOString().split('T')[0])
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

  async function handleDeleteAttachment(attId: string) {
    if (!confirm('确定删除此附件？')) return
    const supabase = createClient()
    await supabase.from('customer_attachments').delete().eq('id', attId)
    loadData()
  }

  async function handleDeleteCustomer() {
    if (!confirm('确定删除此客户？所有关联的联系记录和附件都将被删除。此操作不可撤销。')) return
    const supabase = createClient()
    await supabase.from('customers').delete().eq('id', id)
    router.push('/customers')
  }

  if (loading) return <div className="p-6 text-gray-400">加载中...</div>
  if (!customer) return <div className="p-6 text-gray-400">客户不存在</div>

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
        ...communicationLogs.map(cl => ({
      id: `comm-${cl.id}`,
      date: cl.sent_at.split('T')[0],
      type: cl.channel === 'whatsapp' ? 'whatsapp' as const : 'email' as const,
      title: `${cl.channel === 'whatsapp' ? 'WhatsApp' : '邮件'} · ${cl.direction === 'outgoing' ? '我方发出' : '客户发来'}`,
      detail: cl.content && cl.content.length > 100 ? cl.content.substring(0, 100) + '...' : cl.content,
      user: cl.direction === 'outgoing' ? '我方' : customer.contact_name || '客户',
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
  ].sort((a, b) => b.date.localeCompare(a.date))

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: '概览' },
    { key: 'quotations', label: '报价', count: quotations.length },
    { key: 'deals', label: '成交', count: deals.length },
    { key: 'samples', label: '样品', count: samples.length },
    { key: 'timeline', label: '时间线', count: timelineEvents.length },
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
              onClick={handleDeleteCustomer}
              className="flex items-center gap-1.5 px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
              删除
            </button>
          )}
        </div>
      </div>

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
                        onClick={() => handleDeleteAttachment(att.id)}
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

          
          {/* WhatsApp Communication */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">WhatsApp 聊天记录</h2>
              {canEdit && (
                <button
                  onClick={() => setShowWhatsAppImport(!showWhatsAppImport)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <MessageSquare size={14} />
                  导入记录
                </button>
              )}
            </div>

          {/* Email Communication */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">邮件往来记录</h2>
              {canEdit && (
                <button
                  onClick={() => setShowEmailForm(!showEmailForm)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <Mail size={14} />
                  记录邮件
                </button>
              )}
            </div>

            {showEmailForm && (
              <form onSubmit={handleEmailSubmit} className="mb-4 p-3 bg-gray-50 rounded-lg space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">邮件方向 *</label>
                  <select
                    value={emailDirection}
                    onChange={e => setEmailDirection(e.target.value as 'outgoing' | 'incoming')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                  >
                    <option value="outgoing">我发给客户</option>
                    <option value="incoming">客户发给我</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">邮件主题（选填）</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    placeholder="例如: RE: Product Inquiry"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">邮件正文 *</label>
                  <textarea
                    value={emailContent}
                    onChange={e => setEmailContent(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    rows={6}
                    placeholder="输入邮件内容..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">发送/接收时间 *</label>
                  <input
                    type="datetime-local"
                    value={emailSentAt}
                    onChange={e => setEmailSentAt(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">附件（选填，支持多文件）</label>
                  <input
                    type="file"
                    multiple
                    onChange={e => setEmailAttachments(e.target.files)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    可上传 PDF、Word、Excel、图片等邮件附件
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingEmail || !emailContent.trim()}
                    className="px-4 py-2 bg-gold-600 text-white rounded-lg text-sm hover:bg-gold-700 disabled:opacity-50 cursor-pointer"
                  >
                    {savingEmail ? '保存中...' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmailForm(false)
                      setEmailSubject('')
                      setEmailContent('')
                      setEmailSentAt(new Date().toISOString().slice(0, 16))
                      setEmailAttachments(null)
                    }}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </form>
            )}

            {communicationLogs.filter(log => log.channel === 'email').length === 0 ? (
              <p className="text-sm text-gray-400">暂无邮件记录</p>
            ) : (
              <div className="space-y-0 max-h-96 overflow-y-auto">
                {communicationLogs
                  .filter(log => log.channel === 'email')
                  .slice(0, 30)
                  .map(log => (
                    <div key={log.id} className="flex gap-3 py-3 border-t border-gray-100 first:border-t-0">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${log.direction === 'outgoing' ? 'bg-green-400' : 'bg-purple-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-xs text-gray-500">
                            {new Date(log.sent_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${log.direction === 'outgoing' ? 'bg-green-50 text-green-700' : 'bg-purple-50 text-purple-700'}`}>
                            {log.direction === 'outgoing' ? '我方发出' : '客户发来'}
                          </span>
                        </div>
                        {log.content && (
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-words">
                            {log.content}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                {communicationLogs.filter(log => log.channel === 'email').length > 30 && (
                  <p className="text-xs text-gray-400 text-center pt-2">
                    显示最近 30 条，共 {communicationLogs.filter(log => log.channel === 'email').length} 条记录
                  </p>
                )}
              </div>
            )}
          </div>

            {showWhatsAppImport && (
              <form onSubmit={handleWhatsAppImport} className="mb-4 p-3 bg-gray-50 rounded-lg space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    上传 WhatsApp 导出的 .txt 文件 *
                  </label>
                  <input
                    type="file"
                    accept=".txt"
                    onChange={e => setWhatsappFile(e.target.files?.[0] || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    在 WhatsApp 中打开聊天，点击"更多" → "导出聊天" → "不含媒体文件"
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    公司关键词（选填，用于识别我方发送的消息）
                  </label>
                  <input
                    type="text"
                    value={companyKeywords}
                    onChange={e => setCompanyKeywords(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    placeholder="例如: 公司名,我的名字,同事名字（用英文逗号分隔）"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    如果消息发送者名称包含这些关键词，将被识别为"我方发出"
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={importingWhatsApp || !whatsappFile}
                    className="px-4 py-2 bg-gold-600 text-white rounded-lg text-sm hover:bg-gold-700 disabled:opacity-50 cursor-pointer"
                  >
                    {importingWhatsApp ? '导入中...' : '开始导入'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowWhatsAppImport(false)
                      setWhatsappFile(null)
                      setCompanyKeywords('')
                    }}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </form>
            )}

            {communicationLogs.length === 0 ? (
              <p className="text-sm text-gray-400">暂无聊天记录</p>
            ) : (
              <div className="space-y-0 max-h-96 overflow-y-auto">
                {communicationLogs.slice(0, 50).map(log => (
                  <div key={log.id} className="flex gap-3 py-3 border-t border-gray-100 first:border-t-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${log.direction === 'outgoing' ? 'bg-green-400' : 'bg-blue-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs text-gray-500">
                          {new Date(log.sent_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-xs font-medium text-gray-600">{log.sender_name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${log.direction === 'outgoing' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                          {log.direction === 'outgoing' ? '我方发出' : '客户发来'}
                        </span>
                      </div>
                      {log.content && (
                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-words">
                          {log.content}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {communicationLogs.length > 50 && (
                  <p className="text-xs text-gray-400 text-center pt-2">
                    显示最近 50 条，共 {communicationLogs.length} 条记录
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Contact Log */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">联系记录</h2>
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

            {logs.length === 0 ? (
              <p className="text-sm text-gray-400">暂无联系记录</p>
            ) : (
              <div className="space-y-0">
                {logs.map(log => (
                  <div key={log.id} className="flex gap-3 py-3 border-t border-gray-100 first:border-t-0">
                    <div className="w-2 h-2 rounded-full bg-gold-400 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm text-gray-900 font-medium">{log.log_date}</span>
                        <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-600">{log.tag}</span>
                        <span className="text-xs text-gray-400">{log.logger?.full_name}</span>
                      </div>
                      {log.note && <p className="text-sm text-gray-600 mt-0.5">{log.note}</p>}
                    </div>
                  </div>
                ))}
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

      {activeTab === 'timeline' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">客户生命周期</h2>
          <LifecycleTimeline events={timelineEvents} />
        </div>
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
