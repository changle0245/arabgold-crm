'use client'

import { useState } from 'react'
import { X, Edit3 } from 'lucide-react'

interface Props {
  logId: string
  original: string | null
  currentTranslated: string | null
  onClose: () => void
  onSuccess: () => void
}

export function TranslationEditModal({ logId, original, currentTranslated, onClose, onSuccess }: Props) {
  const [text, setText] = useState(currentTranslated || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!text.trim()) { setError('译文不能为空'); return }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/communication-logs/${logId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ translated_content: text }),
      })
      const data = await res.json()
      setSaving(false)
      if (!res.ok) {
        setError(data?.error || '保存失败')
        return
      }
      onSuccess()
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
          <Edit3 size={18} className="text-gold-600" />
          <h3 className="text-base font-semibold text-gray-900 flex-1">修订译文</h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {original && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">原文（只读）</label>
              <div className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {original}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">中文译文 *</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={saving}
              rows={6}
              placeholder="输入或修订中文译文..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-50"
            />
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
              onClick={handleSave}
              disabled={saving || !text.trim()}
              className="px-4 py-2 bg-gold-600 text-white text-sm rounded-lg hover:bg-gold-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving ? '保存中…' : '保存译文'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
