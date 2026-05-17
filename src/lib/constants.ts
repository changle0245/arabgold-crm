export const SILENT_DAYS_THRESHOLD = 30
export const OVERDUE_DAYS_THRESHOLD = 7

// 国家列表（外贸常见目的国/客源国，按地区分组）
export const COUNTRIES = [
  // 中东（核心市场，排最前）
  '阿联酋', '沙特阿拉伯', '科威特', '卡塔尔', '巴林', '阿曼',
  '约旦', '伊拉克', '黎巴嫩', '也门', '叙利亚',
  // 北非
  '埃及', '摩洛哥', '阿尔及利亚', '突尼斯', '利比亚', '苏丹',
  // 东非/南部非洲
  '埃塞俄比亚', '肯尼亚', '坦桑尼亚', '尼日利亚', '南非',
  // 东南亚
  '马来西亚', '印度尼西亚', '菲律宾', '新加坡', '泰国', '越南',
  // 南亚
  '印度', '巴基斯坦', '孟加拉国',
  // 其他中东外围
  '土耳其', '伊朗', '阿富汗',
  // 欧洲
  '英国', '德国', '法国', '意大利', '西班牙', '荷兰', '俄罗斯',
  // 美洲
  '美国', '加拿大', '墨西哥', '巴西', '阿根廷',
  // 其他
  '澳大利亚', '中国', '其他',
]

export const LEVELS = ['L1', 'L2', 'L3', '待定'] as const
export const STAGES = ['待定', '新接触', '报价中', '已寄样', '已成交', '沉默'] as const
// 客户来源（外贸常见渠道，业务员可在 datalist 之外自由输入）
export const SOURCES = [
  // B2B 平台
  '阿里巴巴', 'Made-in-China', '环球资源', '中国制造网',
  // 社媒
  'TikTok', 'Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'WhatsApp Group',
  // 短视频/国内
  '抖音', '小红书', '视频号',
  // 搜索/广告
  'Google SEO', 'Google Ads', 'Bing 搜索',
  // 线下
  '展会', '客户拜访', '老客户介绍', '同行介绍',
  // 主动开发
  '海关数据', '主动开发邮件', '电话开发',
  // 官网/询盘
  '网站询盘', '邮件营销',
  // 其他
  '海外代理', '老客户复购', '其他',
] as const
export const PRODUCT_CATEGORIES = ['香炉', '镀金托盘', '礼品套装', '其他'] as const
export const PAYMENT_PREFERENCES = ['TT', '信用证LC', '部分预付', 'D/P', 'D/A', '其他'] as const
export const CONTACT_TAGS = ['已报价', '已寄样', '客户砍价', '暂无回应', '已成交', '其他'] as const
export const JOB_TITLES = ['业务员', '客服', '跟单'] as const

// ── 新增：客户画像 / 商务偏好相关 ──
export const GENDERS = ['男', '女', '不便提供'] as const
export const CURRENCIES = ['USD', 'EUR', 'AED', 'SAR', 'CNY', 'GBP', 'JPY', 'AUD', '其他'] as const
export const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'DAP', 'DDP', 'FAS', 'CIP', 'CPT', '其他'] as const
export const PURCHASE_FREQUENCIES = ['每周', '每月', '每季度', '每半年', '每年', '不定期', '一次性'] as const
export const DECISION_ROLES = ['决策人', '影响者', '使用者', '采购员', '中间商', '不确定'] as const
export const INDUSTRIES = ['零售', '批发', '电商', '酒店餐饮', '装修家居', '礼品分销', '宗教用品', '工艺品店', '免税店', '其他'] as const
export const COMPANY_SIZES = ['1-10人', '11-50人', '51-200人', '201-500人', '500+', '不确定'] as const

// 常见职位（datalist 建议项，业务员可自由输入）
export const CONTACT_TITLES = [
  'CEO/总经理', 'Owner/老板', '采购经理', '采购专员', '总监', '业务经理',
  '财务', '物流', '设计师', '中间商', '代理',
] as const

// ── Phase 2 常量 ──
export const QUOTATION_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const
export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  draft: '草稿', sent: '已发送', accepted: '已接受', rejected: '已拒绝', expired: '已过期',
}
export const DEAL_STATUSES = ['pending', 'in_production', 'shipped', 'completed', 'cancelled'] as const
export const DEAL_STATUS_LABELS: Record<string, string> = {
  pending: '待执行', in_production: '生产中', shipped: '已发货', completed: '已完成', cancelled: '已取消',
}
export const SAMPLE_STATUSES = ['pending', 'sent', 'received', 'feedback_received'] as const
export const SAMPLE_STATUS_LABELS: Record<string, string> = {
  pending: '待寄出', sent: '已寄出', received: '已签收', feedback_received: '已反馈',
}
export const CARRIERS = ['DHL', 'FedEx', 'UPS', 'TNT', 'EMS', '顺丰', '圆通', '中通', '其他'] as const

// ── Phase 3 常量 ──
export const REMINDER_TYPES = [
  'follow_up', 'payment', 'quotation', 'sample_feedback',
  'birthday', 'festival', 'shipping', 'custom',
  'silent_customer', 'reorder_cycle',
] as const
export const REMINDER_TYPE_LABELS: Record<string, string> = {
  follow_up: '回访',
  payment: '催款',
  quotation: '跟进报价',
  sample_feedback: '样品反馈',
  birthday: '客户生日',
  festival: '节日问候',
  shipping: '发货跟进',
  custom: '自定义',
  silent_customer: '沉默客户',
  reorder_cycle: '返单周期',
}
export const REMINDER_STATUSES = ['pending', 'completed', 'cancelled'] as const
export const REMINDER_STATUS_LABELS: Record<string, string> = {
  pending: '待办', completed: '已完成', cancelled: '已取消',
}

// 预置客户标签（业务员可在此外自由创建）
export const PRESET_TAGS = [
  'VIP', '大客户', '战略客户',
  '高潜力', '待孵化', '沉睡客户',
  '中间商', '终端用户', '经销商',
  '价格敏感', '品质优先', '速度优先',
  '节日大单', '月度返单', '一次性',
  '信用好', '难搞', '沟通顺畅',
] as const
