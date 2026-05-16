'use client'

import type { TimelineEvent } from '@/lib/types'
import { MessageSquare, FileText, Package, PackageCheck, ArrowRightLeft, Bell, Mail } from 'lucide-react'

interface Props {
  events: TimelineEvent[]
}

const typeConfig: Record<string, { icon: typeof MessageSquare; color: string; bg: string }> = {
  contact: { icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50' },
  quotation: { icon: FileText, color: 'text-amber-500', bg: 'bg-amber-50' },
  deal: { icon: Package, color: 'text-green-600', bg: 'bg-green-50' },
  sample: { icon: PackageCheck, color: 'text-purple-500', bg: 'bg-purple-50' },
  stage_change: { icon: ArrowRightLeft, color: 'text-gray-500', bg: 'bg-gray-50' },
  reminder: { icon: Bell, color: 'text-pink-500', bg: 'bg-pink-50' },
  whatsapp: { icon: MessageSquare, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  email: { icon: Mail, color: 'text-indigo-600', bg: 'bg-indigo-50' },
}

export function LifecycleTimeline({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400">暂无生命周期事件</p>
  }

  // Group by month
  const grouped = new Map<string, TimelineEvent[]>()
  events.forEach(ev => {
    const month = ev.date.slice(0, 7) // YYYY-MM
    if (!grouped.has(month)) grouped.set(month, [])
    grouped.get(month)!.push(ev)
  })

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([month, monthEvents]) => (
        <div key={month}>
          <div className="text-xs text-gray-400 font-medium mb-2 sticky top-0 bg-white py-1">{month}</div>
          <div className="space-y-0">
            {monthEvents.map(ev => {
              const config = typeConfig[ev.type] || typeConfig.contact
              const Icon = config.icon
              return (
                <div key={ev.id} className="flex gap-3 py-2 border-t border-gray-50 first:border-t-0">
                  <div className={`w-7 h-7 rounded-full ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon size={14} className={config.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm text-gray-900 font-medium">{ev.title}</span>
                      {ev.user && <span className="text-xs text-gray-400">{ev.user}</span>}
                    </div>
                    {ev.detail && <p className="text-xs text-gray-500 mt-0.5">{ev.detail}</p>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{ev.date}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
