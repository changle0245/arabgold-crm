export interface Profile {
  id: string
  full_name: string
  role: 'admin' | 'member'
  job_title: string
  is_active: boolean
  must_change_password: boolean
  created_at: string
}

export interface Customer {
  id: string
  // 客户身份
  contact_name: string
  contact_title: string | null     // 职位（采购/CEO等）
  gender: string | null            // 性别
  company_name: string | null
  company_website: string | null
  company_address: string | null
  country: string | null
  avatar_url: string | null
  // 联系方式（whatsapp 也是可选）
  whatsapp: string | null
  phone: string | null
  email: string | null
  wechat_id: string | null
  telegram: string | null
  linkedin: string | null
  skype: string | null
  instagram: string | null
  facebook: string | null
  alibaba_id: string | null
  // 归属
  owner_id: string
  // 进展
  level: string
  stage: string
  last_contact_date: string | null
  first_contact_date: string | null
  source: string | null
  product_category: string | null
  purchase_frequency: string | null
  decision_role: string | null
  // 公司画像
  industry: string | null
  company_size: string | null
  // 商务偏好
  payment_preference: string | null
  currency_preference: string | null
  incoterms: string | null
  // 备注
  notes: string | null
  // 第二期预留
  first_deal_date: string | null
  total_deal_count: number
  total_deal_amount: number
  // 系统字段
  created_by: string | null
  created_at: string
  updated_at: string
  // 联表
  owner?: Profile
}

export interface ContactLog {
  id: string
  customer_id: string
  logged_by: string
  log_date: string
  tag: string
  note: string | null
  created_at: string
  logger?: Profile
}

export interface CustomerTag {
  id: string
  customer_id: string
  tag: string
  created_by: string | null
  created_at: string
}

export interface CustomerAttachment {
  id: string
  customer_id: string
  uploaded_by: string
  file_name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  note: string | null
  created_at: string
  uploader?: Profile
}

// ── Phase 2 ──

export interface Quotation {
  id: string
  customer_id: string
  quote_no: string | null
  version: number
  trade_terms: string | null
  currency: string
  total_amount: number | null
  valid_until: string | null
  status: string
  notes: string | null
  parent_id: string | null
  created_by: string | null
  created_at: string
  creator?: Profile
  items?: QuotationItem[]
}

export interface QuotationItem {
  id: string
  quotation_id: string
  product_name: string | null
  spec: string | null
  quantity: number | null
  unit: string
  unit_price: number | null
  amount: number | null
  remark: string | null
}

export interface Deal {
  id: string
  customer_id: string
  quotation_id: string | null
  deal_no: string | null
  deal_date: string | null
  deal_amount: number | null
  currency: string
  payment_method: string | null
  deposit_received: boolean
  balance_received: boolean
  status: string
  is_reorder: boolean
  notes: string | null
  shipping_date: string | null
  created_by: string | null
  created_at: string
  creator?: Profile
  quotation?: Quotation
  items?: DealItem[]
}

export interface DealItem {
  id: string
  deal_id: string
  product_name: string | null
  spec: string | null
  quantity: number | null
  unit: string
  unit_price: number | null
  amount: number | null
  remark: string | null
}

export interface Sample {
  id: string
  customer_id: string
  sample_desc: string | null
  sent_date: string | null
  tracking_no: string | null
  carrier: string | null
  feedback: string | null
  feedback_date: string | null
  status: string
  quantity: number
  cost: number | null
  created_by: string | null
  created_at: string
  creator?: Profile
}

export type TimelineEvent = {
  id: string
  date: string
  type: 'contact' | 'quotation' | 'deal' | 'sample' | 'stage_change' | 'reminder' | 'ownership_change' | 'whatsapp' | 'wechat' | 'email'
  title: string
  detail: string | null
  user: string | null
  // 仅 whatsapp/wechat/email 事件填：原文 + 译文（用于切换显示和修订）
  original?: string | null
  translated?: string | null
  translatedEditedBy?: string | null     // 修订人名（非 uuid）
  attachments?: { name: string; url: string }[]
}

// ── Phase 2 阶段 2：沟通归档 ──

export interface CommunicationLog {
  id: string
  customer_id: string
  channel: 'whatsapp' | 'wechat' | 'email'
  direction: 'outgoing' | 'incoming'
  sender_name: string | null
  content: string | null
  translated_content: string | null
  translation_edited_by: string | null
  translation_edited_at: string | null
  sent_at: string
  raw_meta: Record<string, unknown> | null
  original_file_url: string | null
  created_by: string | null
  created_at: string
  // 联表
  editor?: Profile
  creator?: Profile
}

// ── Phase 3 ──

export interface Reminder {
  id: string
  customer_id: string | null
  assigned_to: string | null
  type: 'follow_up' | 'payment' | 'quotation' | 'sample_feedback' | 'birthday' | 'festival' | 'shipping' | 'custom' | 'silent_customer' | 'reorder_cycle'
  due_date: string | null
  status: string
  note: string | null
  created_by: string | null
  completed_at: string | null
  created_at: string
  customer?: Pick<Customer, 'id' | 'contact_name' | 'company_name'>
  assignee?: Profile
}
