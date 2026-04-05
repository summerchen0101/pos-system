import type { AggregatedLine, CartLineInput } from './types'

/**
 * Merges duplicate `productId` rows using a single weighted average unit price.
 * Stable ordering: first-seen productId order preserved.
 */
export function aggregateCartLines(lines: readonly CartLineInput[]): AggregatedLine[] {
  const map = new Map<string, { qty: number; cents: number }>()

  for (const line of lines) {
    if (line.quantity <= 0) continue
    const prev = map.get(line.productId)
    const addCents = line.unitPriceCents * line.quantity
    if (prev) {
      map.set(line.productId, {
        qty: prev.qty + line.quantity,
        cents: prev.cents + addCents,
      })
    } else {
      map.set(line.productId, { qty: line.quantity, cents: addCents })
    }
  }

  const out: AggregatedLine[] = []
  for (const [productId, { qty, cents }] of map) {
    if (qty <= 0) continue
    out.push({
      productId,
      quantity: qty,
      unitPriceCents: Math.round(cents / qty),
    })
  }
  return out
}

export function sumCartSubtotalCents(lines: readonly AggregatedLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0)
}

export function linesByProductId(lines: readonly AggregatedLine[]): Map<string, AggregatedLine> {
  return new Map(lines.map((l) => [l.productId, l]))
}
