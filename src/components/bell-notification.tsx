'use client'

import { Bell, AlertCircle, Clock, TrendingUp } from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './auth-provider'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Reminder = {
  id: string
  customer_id: string
  type: 'manual' | 'silent_customer' | 'reorder_cycle'
  note: string
  due_date: string
  customers: {
    id: string
    contact_name: string
  }
}

const typeIcons = {
  manual: Clock,
  silent_customer: AlertCircle,
  reorder_cycle: TrendingUp,
}

const typeLabels = {
  manual: '手动提醒',
  silent_customer: '沉默客户',
  reorder_cycle: '返单周期',
}

export function BellNotification() {
  const { profile } = useAuth()
  const router = useRouter()
  const [pendingCount, setPendingCount] = useState(0)
  const [latestReminders, setLatestReminders] = useState<Reminder[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadReminders = useCallback(async () => {
    if (!profile?.id) return

    const supabase = createClient()

    // Get pending count
    const { count } = await supabase
      .from('reminders')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', profile.id)
      .eq('status', 'pending')

    setPendingCount(count || 0)

    // Get latest 5 reminders
    const { data } = await supabase
      .from('reminders')
      .select(`
        id,
        customer_id,
        type,
        note,
        due_date,
        customers (
          id,
          contact_name
        )
      `)
      .eq('assigned_to', profile.id)
      .eq('status', 'pending')
      .order('due_date', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(5)

    setLatestReminders(data || [])
  }, [profile?.id])

  useEffect(() => {
    loadReminders()
    const interval = setInterval(loadReminders, 60000) // Refresh every 60 seconds
    return () => clearInterval(interval)
  }, [loadReminders])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleReminderClick = (reminder: Reminder) => {
    setIsOpen(false)
    router.push(`/customers/${reminder.customer_id}`)
  }

  const handleViewAll = () => {
    setIsOpen(false)
    router.push('/reminders')
  }

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }

  const formatDueDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dueDate = new Date(date)
    dueDate.setHours(0, 0, 0, 0)

    const diffTime = dueDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return `逾期 ${Math.abs(diffDays)} 天`
    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '明天'
    return `${diffDays} 天后`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
      >
        <Bell size={20} />
        {pendingCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-medium bg-red-500 text-white rounded-full">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-900">
              待办提醒
              {pendingCount > 0 && (
                <span className="ml-2 text-xs text-gray-500">({pendingCount} 条)</span>
              )}
            </h3>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {latestReminders.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                暂无待办提醒
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {latestReminders.map(reminder => {
                  const TypeIcon = typeIcons[reminder.type]
                  const customerName = reminder.customers?.contact_name || '未知客户'

                  return (
                    <div
                      key={reminder.id}
                      onClick={() => handleReminderClick(reminder)}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-gold-600">
                          <TypeIcon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-500">
                              {typeLabels[reminder.type]}
                            </span>
                            <span className="text-xs font-medium text-gray-900">
                              {customerName}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">
                            {truncateText(reminder.note, 30)}
                          </p>
                          <div className="text-xs text-gray-400">
                            到期: {formatDueDate(reminder.due_date)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {latestReminders.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100">
              <button
                onClick={handleViewAll}
                className="w-full text-sm text-gold-600 hover:text-gold-700 font-medium cursor-pointer"
              >
                查看全部
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
