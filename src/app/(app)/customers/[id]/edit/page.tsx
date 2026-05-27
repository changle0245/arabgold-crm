'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { CustomerForm } from '@/components/customer-form'
import type { Customer, Profile } from '@/lib/types'

// Server response shape — single customer with owner JOIN + hydrated tags.
interface CustomerDetailResponse {
  ok: boolean
  data?: Customer & { owner?: Profile; tags?: string[] }
  error?: string
}

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>()
  const { profile, isAdmin } = useAuth()
  const router = useRouter()
  const [customer, setCustomer] = useState<(Customer & { tags?: string[] }) | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Wait until profile is loaded before doing the permission check
    if (!profile) return

    let cancelled = false
    fetch(`/api/customers/${id}`)
      .then((res) => res.json() as Promise<CustomerDetailResponse>)
      .then((body) => {
        if (cancelled) return
        if (!body.ok || !body.data) {
          // 404 / 403 / 500 — bounce to list (server already enforced ACL)
          router.push('/customers')
          return
        }
        const data = body.data
        if (!isAdmin && data.owner_id !== profile.id) {
          router.push(`/customers/${id}`)
          return
        }
        setCustomer(data)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        router.push('/customers')
      })
    return () => { cancelled = true }
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
