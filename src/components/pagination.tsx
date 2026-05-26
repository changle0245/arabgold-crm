'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between gap-3 mt-3 px-1 text-sm text-gray-500 flex-wrap">
      <span>
        {start}–{end} / 共 {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          aria-label="上一页"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="px-3 text-gray-700">
          第 {page} / {totalPages} 页
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          aria-label="下一页"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
