'use client'

import { useState, useRef, useCallback } from 'react'
import ReactCrop, { type Crop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { X, Check } from 'lucide-react'

interface Props {
  imageSrc: string  // 图片 URL（来自 ObjectURL 或 远程 URL）
  onClose: () => void
  onCrop: (blob: Blob) => void
}

/**
 * 计算默认裁剪框位置（基于图片几何尺寸，不分析图像内容）
 * - 手机竖屏截图（高/宽 > 1.5）：默认放在水平居中 + 纵向 18% 处（多数 App 头像在顶部）
 * - 横图/方图：完全居中
 */
function getInitialCrop(width: number, height: number): Crop {
  const isPortrait = height / width > 1.5

  if (isPortrait) {
    // 手机截图：crop 边长 = 宽度的 50%
    const cropSize = width * 0.5
    return {
      unit: 'px',
      x: (width - cropSize) / 2,
      y: height * 0.12,  // 纵向偏上
      width: cropSize,
      height: cropSize,
    }
  }

  // 横图/方图：min 边 * 0.5，居中
  const cropSize = Math.min(width, height) * 0.5
  return {
    unit: 'px',
    x: (width - cropSize) / 2,
    y: (height - cropSize) / 2,
    width: cropSize,
    height: cropSize,
  }
}

export function AvatarCropper({ imageSrc, onClose, onCrop }: Props) {
  const [crop, setCrop] = useState<Crop>()
  const imgRef = useRef<HTMLImageElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [processing, setProcessing] = useState(false)

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    const initial = getInitialCrop(width, height)
    setCrop(initial)

    // 如果图片太长（手机截图），自动滚动到默认 crop 框位置
    if (scrollContainerRef.current) {
      requestAnimationFrame(() => {
        // 滚动到 crop 框中心位置（让用户立刻看到）
        const scrollTo = Math.max(0, initial.y - 40)
        scrollContainerRef.current?.scrollTo({ top: scrollTo, behavior: 'auto' })
      })
    }
  }

  const handleConfirm = useCallback(async () => {
    if (!crop || !imgRef.current) return
    setProcessing(true)

    const img = imgRef.current
    // 用 naturalWidth / displayed width 计算缩放比
    const scaleX = img.naturalWidth / img.width
    const scaleY = img.naturalHeight / img.height

    const cropX = crop.x * scaleX
    const cropY = crop.y * scaleY
    const cropWidth = crop.width * scaleX
    const cropHeight = crop.height * scaleY

    // 输出固定 256x256 PNG（足够头像清晰）
    const OUTPUT_SIZE = 256
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setProcessing(false)
      return
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      img,
      cropX, cropY, cropWidth, cropHeight,
      0, 0, OUTPUT_SIZE, OUTPUT_SIZE
    )

    canvas.toBlob(
      (blob) => {
        if (blob) onCrop(blob)
        setProcessing(false)
      },
      'image/jpeg',
      0.9
    )
  }, [crop, onCrop])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">框选客户头像</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* Image with crop UI */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto p-5 bg-gray-50 flex items-start justify-center min-h-0">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            aspect={1}
            circularCrop
            keepSelection
            minWidth={40}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              onLoad={onImageLoad}
              alt="待裁剪"
              style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block' }}
            />
          </ReactCrop>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-500">拖动框选区域 · 拖角缩放</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!crop || processing}
              className="flex items-center gap-1.5 px-4 py-2 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 disabled:opacity-50 cursor-pointer"
            >
              <Check size={14} />
              {processing ? '处理中...' : '确认头像'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
