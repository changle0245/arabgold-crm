/**
 * Date helpers — all app date columns (last_contact_date / log_date / due_date /
 * deal_date / sent_date / feedback_date / valid_until) represent CN local dates
 * (Asia/Shanghai).
 *
 * Why this exists: `new Date().toISOString().split('T')[0]` gives the UTC date,
 * which is yesterday's date during CN local 00:00–08:00. That mismatch caused
 * the same record to appear as "today" on one page and "逾期 1 天" on another.
 * Don't reintroduce that pattern.
 *
 * DB triggers that compute dates must match this convention: use
 * `(now() at time zone 'Asia/Shanghai')::date` instead of bare `current_date`.
 */

const TZ = 'Asia/Shanghai'

/**
 * Today's calendar date as `YYYY-MM-DD` in Asia/Shanghai, regardless of the
 * browser's or server's own timezone (uses Intl, not the machine clock's TZ).
 */
export function todayLocalISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Parse a `YYYY-MM-DD` string into a Date at the browser's local midnight.
 * Intended for display / day-of-week extraction; for date arithmetic use
 * `daysSince` / `daysFromNow` (those don't depend on the browser TZ).
 * Assumes the user's browser is in Asia/Shanghai (our team is in 广州).
 */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Whole days from `dateStr` (interpreted as a CN local date) to today (CN local).
 * Past dates return positive, future dates return negative.
 * Null returns 9999 — callers treat "never recorded" as overdue forever
 * (matches the legacy behavior of every removed `daysSince` copy).
 *
 * Implementation note: we compare two `Date.UTC(...)` midnights so the result
 * is always an exact integer number of days, immune to DST and TZ drift.
 */
export function daysSince(dateStr: string | null): number {
  if (!dateStr) return 9999
  const [y, m, d] = dateStr.split('-').map(Number)
  const target = Date.UTC(y, m - 1, d)
  const [ty, tm, td] = todayLocalISO().split('-').map(Number)
  const today = Date.UTC(ty, tm - 1, td)
  return Math.round((today - target) / 86400000)
}

/**
 * Whole days from today (CN local) to `dateStr` (interpreted as a CN local date).
 * Future dates return positive, past dates return negative.
 * Null returns 0 (matches the legacy `daysFromNow` copies).
 */
export function daysFromNow(dateStr: string | null): number {
  if (!dateStr) return 0
  return -daysSince(dateStr)
}

/**
 * "YYYY-MM-DD" + n days → "YYYY-MM-DD". Negative n moves the date backwards.
 *
 * Uses Date.UTC as the integer pivot so the calculation is timezone-free and
 * matches the rest of this module. JS Date.UTC handles month/year overflow
 * automatically: Date.UTC(2026, 4, 32) → June 1; Date.UTC(2026, 0, 0) →
 * Dec 31 of the previous year. Leap years are handled correctly because
 * Date.UTC consults the real Gregorian calendar.
 */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  const ry = t.getUTCFullYear()
  const rm = String(t.getUTCMonth() + 1).padStart(2, '0')
  const rd = String(t.getUTCDate()).padStart(2, '0')
  return `${ry}-${rm}-${rd}`
}
