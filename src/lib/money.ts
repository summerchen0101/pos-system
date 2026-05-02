/**
 * Central TWD display for amounts stored as minor units (1 = NT$0.01).
 * Output shape: NT$1,234 (comma thousands separator, integer dollars — no fractional display).
 */

const numberPart = new Intl.NumberFormat('zh-TW', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Round minor units to the nearest whole TWD (nearest 100 cents). Symmetric for negatives. */
export function quantizeToYuanCents(cents: number): number {
  return Math.round(cents / 100) * 100
}

export function formatMoney(cents: number): string {
  const dollars = cents / 100
  const negative = dollars < 0
  const body = numberPart.format(Math.abs(dollars))
  return `${negative ? '−' : ''}NT$${body}`
}
