/**
 * Central TWD display for amounts stored as minor units (1 = NT$0.01).
 * Output shape: NT$1,234 or NT$1,234.50 (comma thousands separator, up to 2 decimals when needed).
 */
const numberPart = new Intl.NumberFormat('zh-TW', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatMoney(cents: number): string {
  const dollars = cents / 100
  const negative = dollars < 0
  const body = numberPart.format(Math.abs(dollars))
  return `${negative ? '−' : ''}NT$${body}`
}
