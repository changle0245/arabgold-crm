import { CustomerForm } from '@/components/customer-form'

export default function NewCustomerPage() {
  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">新增客户</h1>
      <CustomerForm />
    </div>
  )
}
