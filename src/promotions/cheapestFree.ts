/**
 * Buy-X-get-Y-free bundle math: how many units are “free” in the repeating bundle.
 * paidQty = ceil(Q × X / (X+Y)), freeUnits = Q − paidQty.
 */
export function bundleFreeUnitCount(totalQty: number, buyX: number, freeY: number): number {
  if (buyX <= 0 || freeY <= 0 || totalQty <= 0) return 0
  const paidQty = Math.ceil((totalQty * buyX) / (buyX + freeY))
  return Math.max(0, totalQty - paidQty)
}

export type LineForCheapestFree = {
  quantity: number
  unitPriceCents: number
}

/**
 * Expands lines into one entry per physical unit, sorts prices ascending (cheapest first).
 */
export function expandLinesToSortedUnitPrices(lines: readonly LineForCheapestFree[]): number[] {
  const unitPrices: number[] = []
  for (const line of lines) {
    if (line.quantity <= 0) continue
    for (let i = 0; i < line.quantity; i++) {
      unitPrices.push(line.unitPriceCents)
    }
  }
  unitPrices.sort((a, b) => a - b)
  return unitPrices
}

/**
 * Buy-X-get-Y-free discount when free units are always the **cheapest** units in the pool
 * (multi-SKU eligible cart).
 */
export function discountBuyXGetYCheapestFromLines(
  lines: readonly LineForCheapestFree[],
  buyX: number,
  freeY: number,
): number {
  if (buyX <= 0 || freeY <= 0) return 0
  const sorted = expandLinesToSortedUnitPrices(lines)
  const Q = sorted.length
  if (Q === 0) return 0

  const freeUnits = bundleFreeUnitCount(Q, buyX, freeY)
  if (freeUnits <= 0) return 0

  let discountCents = 0
  for (let i = 0; i < freeUnits; i++) {
    discountCents += sorted[i]!
  }
  return discountCents
}
