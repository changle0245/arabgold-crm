'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Quotation, QuotationItem, Customer, Profile } from '@/lib/types'
import { QUOTATION_STATUS_LABELS } from '@/lib/constants'
import { Printer } from 'lucide-react'

type Loaded = {
  quotation: Quotation & { creator?: Profile }
  items: QuotationItem[]
  customer: Pick<Customer, 'contact_name' | 'company_name' | 'company_address' | 'country' | 'email' | 'phone' | 'whatsapp'> & {
    owner?: Profile
  }
}

export default function QuotationPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: q, error: qErr }, { data: itemRows }] = await Promise.all([
        supabase
          .from('quotations')
          .select(`
            *,
            creator:profiles!quotations_created_by_fkey(*),
            customer:customers!quotations_customer_id_fkey(
              contact_name, company_name, company_address, country, email, phone, whatsapp,
              owner:profiles!customers_owner_id_fkey(*)
            )
          `)
          .eq('id', id)
          .single(),
        supabase.from('quotation_items').select('*').eq('quotation_id', id).order('id'),
      ])

      if (qErr || !q) {
        setError(qErr?.message || '报价不存在')
        return
      }

      // q.customer is joined; lift it out and set top-level
      const customer = (q as Quotation & { customer?: Loaded['customer'] }).customer
      if (!customer) {
        setError('找不到关联客户信息')
        return
      }

      setData({
        quotation: q as Quotation & { creator?: Profile },
        items: (itemRows as QuotationItem[]) || [],
        customer,
      })
    }
    load()
  }, [id])

  if (error) return <div className="p-6 text-red-600">{error}</div>
  if (!data) return <div className="p-6 text-gray-400">加载中...</div>

  const { quotation: q, items, customer } = data
  const subtotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0)

  return (
    <>
      {/* Print-only styles */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
        }
        body { background: #f5f5f5; }
      `}</style>

      {/* Action bar (screen only) */}
      <div className="no-print sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          预览模式 · 浏览器打印对话框中选「保存为 PDF」即可导出
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-gold-600 text-white rounded-lg text-sm font-medium hover:bg-gold-700 transition-colors cursor-pointer"
        >
          <Printer size={16} />
          打印 / 保存为 PDF
        </button>
      </div>

      {/* Printable sheet */}
      <div className="max-w-[210mm] mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none p-8 text-gray-900 text-sm leading-relaxed">
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-gold-600 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gold-700">ArabGold</h1>
            <p className="text-xs text-gray-500 mt-1">Premium Gilded Brassware · Made in China</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-semibold tracking-wide">QUOTATION 报价单</h2>
            <p className="text-sm text-gray-600 mt-1 font-mono">{q.quote_no} · V{q.version}</p>
            <p className="text-xs text-gray-400 mt-0.5">{QUOTATION_STATUS_LABELS[q.status] || q.status}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">TO 客户</div>
            <div className="font-medium">{customer.contact_name}</div>
            {customer.company_name && <div className="text-gray-700">{customer.company_name}</div>}
            {customer.company_address && <div className="text-gray-500 text-xs">{customer.company_address}</div>}
            {customer.country && <div className="text-gray-500 text-xs">{customer.country}</div>}
            <div className="text-gray-500 text-xs mt-1">
              {customer.email && <div>Email: {customer.email}</div>}
              {customer.whatsapp && <div>WhatsApp: {customer.whatsapp}</div>}
              {customer.phone && <div>Tel: {customer.phone}</div>}
            </div>
          </div>
          <div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <span className="text-gray-500">报价日期 Date</span>
              <span className="font-medium">{q.created_at.split('T')[0]}</span>
              <span className="text-gray-500">有效期至 Valid Until</span>
              <span className="font-medium">{q.valid_until || '—'}</span>
              <span className="text-gray-500">贸易条款 Terms</span>
              <span className="font-medium">{q.trade_terms || '—'}</span>
              <span className="text-gray-500">货币 Currency</span>
              <span className="font-medium">{q.currency}</span>
              <span className="text-gray-500">业务员 Sales</span>
              <span className="font-medium">{q.creator?.full_name || customer.owner?.full_name || '—'}</span>
            </div>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="bg-gold-50 text-gray-700 text-xs uppercase tracking-wider">
              <th className="text-left py-2 px-2 border border-gray-300 w-10">#</th>
              <th className="text-left py-2 px-2 border border-gray-300">产品 Product</th>
              <th className="text-left py-2 px-2 border border-gray-300">规格 Spec</th>
              <th className="text-right py-2 px-2 border border-gray-300 w-20">数量 Qty</th>
              <th className="text-right py-2 px-2 border border-gray-300 w-28">单价 Unit Price</th>
              <th className="text-right py-2 px-2 border border-gray-300 w-28">金额 Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id} className="align-top">
                <td className="py-1.5 px-2 border border-gray-300 text-gray-500">{idx + 1}</td>
                <td className="py-1.5 px-2 border border-gray-300">{it.product_name}</td>
                <td className="py-1.5 px-2 border border-gray-300 text-gray-600">{it.spec || '-'}</td>
                <td className="py-1.5 px-2 border border-gray-300 text-right">{it.quantity} {it.unit}</td>
                <td className="py-1.5 px-2 border border-gray-300 text-right">{it.unit_price?.toFixed(2)}</td>
                <td className="py-1.5 px-2 border border-gray-300 text-right">{it.amount?.toFixed(2)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-gray-400 border border-gray-300">无明细</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={5} className="py-2 px-2 text-right border border-gray-300 bg-gray-50">合计 TOTAL</td>
              <td className="py-2 px-2 text-right border border-gray-300 bg-gray-50">
                {q.currency} {subtotal.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Notes */}
        {q.notes && (
          <div className="mb-6">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">备注 Remarks</div>
            <p className="text-gray-700 whitespace-pre-wrap">{q.notes}</p>
          </div>
        )}

        {/* Terms */}
        <div className="text-xs text-gray-600 space-y-1 border-t border-gray-200 pt-4 mb-10">
          <p>1. 本报价单有效期至上方所示日期，过期后价格以最新报价为准。</p>
          <p>2. 价格基于上述贸易条款，不含其他附加费用。</p>
          <p>3. 付款条件、交货期与包装方式另行确认。</p>
          <p>1. This quotation is valid until the date shown above; prices subject to revision thereafter.</p>
          <p>2. Prices are based on the trade terms above and exclude other surcharges.</p>
          <p>3. Payment terms, lead time and packing to be confirmed separately.</p>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-12 mt-10">
          <div>
            <div className="text-xs text-gray-500 mb-12">卖方签字 Seller Signature</div>
            <div className="border-t border-gray-400 pt-1 text-xs text-gray-500">ArabGold</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-12">买方确认 Buyer Confirmation</div>
            <div className="border-t border-gray-400 pt-1 text-xs text-gray-500">{customer.company_name || customer.contact_name}</div>
          </div>
        </div>
      </div>
    </>
  )
}
