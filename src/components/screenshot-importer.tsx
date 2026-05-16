'use client'

import { useState, useEffect, useRef } from 'react'
import { Image as ImageIcon, Upload, X, Loader2, Check, Crop } from 'lucide-react'
import { parseContactFromOCR, summarizeParsedContact, type ParsedContact } from '@/lib/parse-contact'

interface Props {
  onClose: () => void
  onApply: (parsed: ParsedContact) => void
  onCropAvatar?: (imageSrc: string) => void
}

export function ScreenshotImporter({ onClose, onApply, onCropAvatar }: Props) {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [stage, setStage] = useState<'idle' | 'ocr' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState<ParsedContact | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 支持粘贴
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) handleFile(file)
          break
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件（PNG/JPG）')
      return
    }
    setError('')
    setRawText('')
    setParsed(null)
    setProgress(0)

    // 显示预览
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setStage('ocr')

    try {
      // 动态 import 避免 SSR 问题
      const Tesseract = (await import('tesseract.js')).default
      const worker = await Tesseract.createWorker(['eng', 'chi_sim'], 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            setProgress(Math.round(m.progress * 100))
          }
        },
      })
      const { data } = await worker.recognize(file)
      await worker.terminate()

      const text = data.text || ''
      setRawText(text)
      const result = parseContactFromOCR(text)
      setParsed(result)
      setStage('done')
    } catch (e: any) {
      setError(e.message || '识别失败')
      setStage('error')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function reset() {
    setImageUrl('')
    setStage('idle')
    setRawText('')
    setParsed(null)
    setError('')
    setProgress(0)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <ImageIcon size={18} className="text-gold-600" />
            截图智能录入
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {stage === 'idle' && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-gold-400 hover:bg-gold-50/30 transition-colors"
            >
              <Upload size={28} className="mx-auto text-gray-400 mb-3" />
              <p className="text-sm text-gray-700 mb-1">点击选择 / 拖拽 / 粘贴 (Ctrl+V) 截图</p>
              <p className="text-xs text-gray-400">支持 微信 · WhatsApp · 领英 · 名片照片等</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </div>
          )}

          {stage === 'ocr' && (
            <div className="text-center py-8">
              {imageUrl && (
                <img src={imageUrl} alt="" className="max-h-48 mx-auto rounded-lg border border-gray-200 mb-4" />
              )}
              <div className="flex items-center justify-center gap-2 text-gray-700">
                <Loader2 size={16} className="animate-spin text-gold-600" />
                <span className="text-sm">识别中... {progress}%</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">首次使用需要下载中英文识别模型（约 10MB），之后会缓存</p>
              <div className="w-full bg-gray-100 rounded-full h-1 mt-3 max-w-xs mx-auto">
                <div className="bg-gold-500 h-1 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="text-center py-6">
              <p className="text-red-600 text-sm mb-3">{error}</p>
              <button onClick={reset} className="px-4 py-2 text-sm text-gold-600 hover:bg-gold-50 rounded-lg cursor-pointer">
                重试
              </button>
            </div>
          )}

          {stage === 'done' && parsed && (
            <div className="space-y-4">
              {/* 缩略图 + 提取结果 */}
              <div className="flex gap-4">
                {imageUrl && (
                  <img src={imageUrl} alt="" className="w-24 h-32 object-cover rounded-lg border border-gray-200 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 mb-2">识别结果</p>
                  <div className="space-y-1.5 text-sm">
                    <ResultRow label="姓名" value={parsed.contact_name} />
                    <ResultRow label="WhatsApp" value={parsed.whatsapp} />
                    <ResultRow label="国家" value={parsed.country} />
                    <ResultRow label="邮箱" value={parsed.email} />
                    {parsed.detected.wechat_id && (
                      <ResultRow label="微信ID" value={parsed.detected.wechat_id} hint="（将写入备注）" />
                    )}
                  </div>
                </div>
              </div>

              {/* 备注预览 */}
              {parsed.notes && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">将写入备注</p>
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap">{parsed.notes}</pre>
                </div>
              )}

              {/* 原始 OCR 文本（可展开） */}
              <details className="bg-gray-50 rounded-lg">
                <summary className="cursor-pointer text-xs text-gray-500 px-3 py-2">查看原始 OCR 文本</summary>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap px-3 pb-3 max-h-40 overflow-y-auto">{rawText}</pre>
              </details>

              {/* 操作按钮 */}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => onApply(parsed)}
                  className="flex-1 min-w-[150px] flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 transition-colors cursor-pointer"
                >
                  <Check size={16} />
                  应用到表单
                </button>
                {onCropAvatar && imageUrl && (
                  <button
                    onClick={() => onCropAvatar(imageUrl)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gold-300 text-gold-700 bg-gold-50 rounded-lg text-sm font-medium hover:bg-gold-100 transition-colors cursor-pointer"
                    title="从这张截图框选客户头像"
                  >
                    <Crop size={14} />
                    框选头像
                  </button>
                )}
                <button
                  onClick={reset}
                  className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  换一张
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultRow({ label, value, hint }: { label: string; value?: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-gray-400 w-16 shrink-0">{label}</span>
      {value ? (
        <span className="text-gray-800 break-all">
          {value}
          {hint && <span className="text-xs text-gray-400 ml-1">{hint}</span>}
        </span>
      ) : (
        <span className="text-xs text-gray-300">未识别</span>
      )}
    </div>
  )
}
