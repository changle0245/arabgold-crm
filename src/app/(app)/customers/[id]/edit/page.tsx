'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import { CustomerForm } from '@/components/customer-form'
import type { Customer } from '@/lib/types'

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>()
  const { profile, isAdmin } = useAuth()
  const router = useRouter()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Wait until profile is loaded before doing the permission check
    if (!profile) return

    const supabase = createClient()
    supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) {
          router.push('/customers')
          return
        }
        if (!isAdmin && data.owner_id !== profile.id) {
          router.push(`/customers/${id}`)
          return
        }
        setCustomer(data)
        setLoading(false)
      })
  }, [id, profile, isAdmin, router])

  if (loading) return <div className="p-6 text-gray-400">加载中...</div>
  if (!customer) return null

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">编辑客户</h1>
      <CustomerForm customer={customer} />
    </div>
  )
}
