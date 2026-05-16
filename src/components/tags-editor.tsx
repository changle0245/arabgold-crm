'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PRESET_TAGS } from '@/lib/constants'
import { X, Plus } from 'lucide-react'

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
}

/**
 * 根据标签文本生成稳定的彩色样式（同一标签每次显示一致颜色）
 */
export function tagColor(tag: string): string {
  const palette = [
    'bg-gold-100 text-gold-800 border-gold-200',
    'bg-blue-100 text-blue-800 border-blue-200',
    'bg-emerald-100 text-emerald-800 border-emerald-200',
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-pink-100 text-pink-800 border-pink-200',
    'bg-orange-100 text-orange-800 border-orange-200',
    'bg-teal-100 text-teal-800 border-teal-200',
    'bg-indigo-100 text-indigo-800 border-indigo-200',
  ]
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash << 5) - hash + tag.charCodeAt(i)
  return palette[Math.abs(hash) % palette.length]
}

export function TagsEditor({ tags, onChange }: Props) {
  const [input, setInput] = useState('')
  const [allUsedTags, setAllUsedTags] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // 加载库里已有的所有标签（去重）作为输入提示
  useEffect(() => {
    const supabase = createClient()
    supabase.from('customer_tags').select('tag').then(({ data }) => {
      if (data) {
        const distinct = Array.from(new Set(data.map(d => d.tag)))
        setAllUsedTags(distinct)
      }
    })
  }, [])

  function addTag(raw: string) {
    const tag = raw.trim()
    if (!tag) return
    if (tags.includes(tag)) return
    onChange([...tags, tag])
    setInput('')
  }

  function removeTag(tag: string) {
    onChange(tags.filter(t => t !== tag))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // 回车 / 逗号 → 添加
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    }
    // Backspace 且输入框空 → 删除最后一个 tag
    if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  // 合并：预置 + 库里已有 → 去重 → 去掉已选
  const suggestions = Array.from(new Set([...PRESET_TAGS, ...allUsedTags]))
    .filter(t => !tags.includes(t))

  return (
    <div className="space-y-2">
      {/* 已选标签 + 输入框（同一行） */}
      <div className="flex flex-wrap items-center gap-1.5 p-2 border border-gray-300 rounded-lg focus-within:border-transparent focus-within:ring-2 focus-within:ring-gold-500 min-h-[42px]">
        {tags.map(tag => (
          <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tagColor(tag)}`}>
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="hover:opacity-70 cursor-pointer">
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          list="tag-suggestions"
          value={input}
          onChange={e => {
            const v = e.target.value
            // 检测 datalist 选择（onChange 直接到完整值且不是逐字符输入）
            if (v && PRESET_TAGS.includes(v as any) || allUsedTags.includes(v)) {
              addTag(v)
              return
            }
            setInput(v)
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) addTag(input) }}
          className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
          placeholder={tags.length === 0 ? '输入标签后回车 / 从下拉选 / 用逗号分隔...' : ''}
        />
        <datalist id="tag-suggestions">
          {suggestions.map(s => <option key={s} value={s} />)}
        </datalist>
      </div>

      {/* 快捷预置标签按钮 */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-gray-400 self-center mr-1">快捷标签:</span>
        {PRESET_TAGS.filter(t => !tags.includes(t)).slice(0, 12).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => addTag(t)}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border border-gray-200 text-gray-600 hover:bg-gold-50 hover:text-gold-700 hover:border-gold-300 transition-colors cursor-pointer"
          >
            <Plus size={10} />
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}

// 仅显示用（详情页 / 列表）
export function TagBadge({ tag }: { tag: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${tagColor(tag)}`}>
      {tag}
    </span>
  )
}
