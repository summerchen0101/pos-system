const fmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
})

export function formatMoney(cents: number): string {
  return fmt.format(cents / 100)
}
