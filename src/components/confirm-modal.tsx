'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'

type DangerLevel = 'low' | 'medium' | 'high'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description?: ReactNode
  /** high 级要求用户输入下方 confirmPhrase 字符串后才能点确认 */
  dangerLevel?: DangerLevel
  /** 当 dangerLevel='high' 时，用户必须输入这个字符串才能点确认 */
  confirmPhrase?: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
}

const dangerStyles: Record<DangerLevel, { icon: string; button: string }> = {
  low: {
    icon: 'text-gray-400 bg-gray-100',
    button: 'bg-gold-600 hover:bg-gold-700',
  },
  medium: {
    icon: 'text-amber-500 bg-amber-50',
    button: 'bg-amber-600 hover:bg-amber-700',
  },
  high: {
    icon: 'text-red-500 bg-red-50',
    button: 'bg-red-600 hover:bg-red-700',
  },
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  dangerLevel = 'medium',
  confirmPhrase,
  confirmLabel = '确认',
  cancelLabel = '取消',
  loading = false,
}: Props) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) return
    setTyped('')
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onClose])

  if (!open) return null

  const styles = dangerStyles[dangerLevel]
  const needsPhrase = dangerLevel === 'high' && !!confirmPhrase
  const canConfirm = !loading && (!needsPhrase || typed === confirmPhrase)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => { if (!loading && dangerLevel !== 'high') onClose() }}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className={`p-2 rounded-lg shrink-0 ${styles.icon}`}>
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          </div>
          {!loading && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 cursor-pointer shrink-0"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {description && (
          <div className="text-sm text-gray-600 mb-4 space-y-2">
            {description}
          </div>
        )}

        {needsPhrase && (
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1.5">
              请输入 <span className="font-mono font-medium text-gray-900">{confirmPhrase}</span> 以确认
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              autoFocus
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder={confirmPhrase}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => { if (canConfirm) onConfirm() }}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${styles.button}`}
          >
            {loading ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
