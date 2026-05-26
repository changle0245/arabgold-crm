// 币种工具（fix #11 多币种）
// 老板大屏 / 个人大屏 此前直接 reduce(deal_amount) 跨币种累加，混 USD/EUR/AED → 数字错误。
// 修法：引入 system_settings.main_currency（默认 USD），大屏只统计主货币的成交额，
// 其他币种单独显示为"其他币种"小字提示，避免误导经营决策。

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', RMB: '¥',
  AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ', QAR: 'QAR ',
  OMR: 'OMR ', BHD: 'BHD ', EGP: 'EGP ', JOD: 'JOD ', LBP: 'LBP ',
}

export function currencySymbol(c?: string | null): string {
  const k = (c || 'USD').toUpperCase()
  return CURRENCY_SYMBOLS[k] || (k + ' ')
}

// 旧的 formatAmount 在 boss page 里是 (v) => v>=10000?`${(v/10000).toFixed(1)}w`:v.toLocaleString()
// 这里提供一个通用版本，所有大屏都用它。
export function formatAmount(v: number): string {
  if (!v && v !== 0) return '0'
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}w`
  return v.toLocaleString()
}

// 带货币符号格式化：例如 "$22.2w" / "AED 8,000"
export function formatMoney(amount: number, currency?: string | null): string {
  return `${currencySymbol(currency)}${formatAmount(amount)}`
}

type AmountRow = { deal_amount?: number | null; currency?: string | null }

// 按币种 group sum：返回 { USD: 222179, EUR: 1000, AED: 8000 }
export function groupByCurrency(rows: AmountRow[]): Map<string, number> {
  const m = new Map<string, number>()
  rows.forEach(r => {
    if (!r.deal_amount) return
    const c = (r.currency || 'USD').toUpperCase()
    m.set(c, (m.get(c) || 0) + r.deal_amount)
  })
  return m
}

// 只 sum 指定主货币的成交额（大屏主数字用）
export function sumInMainCurrency(rows: AmountRow[], mainCurrency: string): number {
  const main = (mainCurrency || 'USD').toUpperCase()
  return rows.reduce((s, r) => {
    if (!r.deal_amount) return s
    const c = (r.currency || 'USD').toUpperCase()
    return c === main ? s + r.deal_amount : s
  }, 0)
}

// 计数指定主货币的笔数（大屏成交笔数用）
export function countInMainCurrency(rows: AmountRow[], mainCurrency: string): number {
  const main = (mainCurrency || 'USD').toUpperCase()
  return rows.filter(r => ((r.currency || 'USD').toUpperCase()) === main).length
}

// 返回各非主货币的 { currency, amount, count }，用于"另有 X 笔 EUR + Y 笔 AED"提示
export function otherCurrenciesSummary(rows: AmountRow[], mainCurrency: string): { currency: string; amount: number; count: number }[] {
  const main = (mainCurrency || 'USD').toUpperCase()
  const m = new Map<string, { amount: number; count: number }>()
  rows.forEach(r => {
    const c = (r.currency || 'USD').toUpperCase()
    if (c === main || !r.deal_amount) return
    const cur = m.get(c) || { amount: 0, count: 0 }
    cur.amount += r.deal_amount
    cur.count += 1
    m.set(c, cur)
  })
  return [...m.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([currency, v]) => ({ currency, ...v }))
}

// 格式化"另有"提示文本
export function formatOtherCurrencies(others: { currency: string; amount: number; count: number }[]): string {
  if (others.length === 0) return ''
  return '另有 ' + others.map(o => `${o.count} 笔 ${formatMoney(o.amount, o.currency)}`).join(' · ')
}
