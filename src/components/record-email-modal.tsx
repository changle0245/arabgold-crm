'use client'

import { useState } from 'react'
import { X, Mail } from 'lucide-react'

interface Props {
  customerId: string
  customerName: string
  onClose: () => void
  onSuccess: (result: { attachmentCount: number }) => void
}

function nowLocalDatetime(): string {
  // 用 input[type=datetime-local] 期望的格式 YYYY-MM-DDTHH:MM
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function RecordEmailModal({ customerId, customerName, onClose, onSuccess }: Props) {
  const [direction, setDirection] = useState<'outgoing' | 'incoming'>('outgoing')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [sentAt, setSentAt] = useState(nowLocalDatetime())
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!content.trim()) { setError('邮件正文必填'); return }
    if (!sentAt) { setError('邮件时间必填'); return }
    setError(null)
    setSaving(true)
    const form = new FormData()
    form.append('direction', direction)
    form.append('subject', subject)
    form.append('content', content)
    // datetime-local 是本地时间无时区，转 ISO
    form.append('sentAt', new Date(sentAt).toISOString())
    for (const f of files) form.append('attachments', f)
    try {
      const res = await fetch(`/api/customers/${customerId}/record-email`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      setSaving(false)
      if (!res.ok) {
        setError(data?.error || '保存失败')
        return
      }
      onSuccess(data)
    } catch {
      setSaving(false)
      setError('网络错误，请重试')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => { if (!saving) onClose() }}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Mail size={18} className="text-indigo-600" />
          <h3 className="text-base font-semibold text-gray-900 flex-1 min-w-0 truncate">
            记录邮件往来 ·「{customerName}」
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">邮件方向</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection('outgoing')}
                disabled={saving}
                className={`px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${
                  direction === 'outgoing'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-medium'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                我发给客户
              </button>
              <button
                type="button"
                onClick={() => setDirection('incoming')}
                disabled={saving}
                className={`px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${
                  direction === 'incoming'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                客户发给我
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">主题（可选）</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              disabled={saving}
              placeholder="例如：RE: Product Catalog"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">正文 *</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              disabled={saving}
              rows={8}
              placeholder="粘贴邮件正文..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-50 font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">发送/接收时间 *</label>
            <input
              type="datetime-local"
              value={sentAt}
              onChange={e => setSentAt(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">附件（可多选）</label>
            <input
              type="file"
              multiple
              onChange={e => setFiles(Array.from(e.target.files || []))}
              disabled={saving}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gold-50 file:text-gold-700 file:text-sm file:cursor-pointer"
            />
            {files.length > 0 && (
              <p className="text-xs text-gray-400 mt-1.5">
                已选 {files.length} 个：{files.map(f => f.name).join(', ')}
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 cursor-pointer disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !content.trim()}
              className="px-4 py-2 bg-gold-600 text-white text-sm rounded-lg hover:bg-gold-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving ? '保存中…' : '保存邮件'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
