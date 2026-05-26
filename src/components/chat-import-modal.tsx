'use client'

import { useState } from 'react'
import { X, MessageSquare } from 'lucide-react'

interface Props {
  customerId: string
  customerName: string
  onClose: () => void
  onSuccess: (result: { imported: number; skipped: number; channel: string }) => void
}

export function ChatImportModal({ customerId, customerName, onClose, onSuccess }: Props) {
  const [channel, setChannel] = useState<'whatsapp' | 'wechat'>('whatsapp')
  const [file, setFile] = useState<File | null>(null)
  const [keywords, setKeywords] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleImport() {
    if (!file) { setError('请选择 .txt 文件'); return }
    setError(null)
    setImporting(true)
    const form = new FormData()
    form.append('file', file)
    form.append('channel', channel)
    form.append('ourKeywords', keywords)
    try {
      const res = await fetch(`/api/customers/${customerId}/import-chat`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      setImporting(false)
      if (!res.ok) {
        setError(data?.error || '导入失败')
        return
      }
      onSuccess(data)
    } catch (e) {
      setImporting(false)
      setError('网络错误，请重试')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => { if (!importing) onClose() }}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare size={18} className="text-gold-600" />
          <h3 className="text-base font-semibold text-gray-900 flex-1 min-w-0 truncate">
            导入聊天记录到「{customerName}」
          </h3>
          <button
            onClick={onClose}
            disabled={importing}
            className="text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">渠道</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setChannel('whatsapp')}
                disabled={importing}
                className={`px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${
                  channel === 'whatsapp'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-medium'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setChannel('wechat')}
                disabled={importing}
                className={`px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${
                  channel === 'wechat'
                    ? 'bg-green-50 border-green-300 text-green-700 font-medium'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                微信
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">.txt 文件 *</label>
            <input
              type="file"
              accept=".txt,text/plain"
              onChange={e => setFile(e.target.files?.[0] || null)}
              disabled={importing}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gold-50 file:text-gold-700 file:text-sm file:cursor-pointer"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              {channel === 'whatsapp'
                ? '在 WhatsApp 打开与该客户的聊天 → 三点菜单 → 更多 → 导出聊天 → 选「不含媒体」→ 保存 .txt'
                : '微信 PC 端备份导出，或自行整理成「YYYY-MM-DD HH:MM 发送者: 内容」格式'}
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">我方关键词</label>
            <input
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              disabled={importing}
              placeholder="例如：ArabGold,Sarah,张三"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-50"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              逗号分隔。发送者姓名包含任一关键词 → 标记为「我方发出」，否则「客户发来」。
              <br />留空：所有消息都视为客户发来
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 text-sm text-gray-600 cursor-pointer disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={importing || !file}
              className="px-4 py-2 bg-gold-600 text-white text-sm rounded-lg hover:bg-gold-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {importing ? '导入中…' : '开始导入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
