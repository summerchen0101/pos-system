import type { AggregatedLine, BulkDiscountRule, PromotionContext } from '../types'

function eligibleLines(
  lines: readonly AggregatedLine[],
  productIds: BulkDiscountRule['productIds'],
): AggregatedLine[] {
  if (productIds === undefined) return [...lines]
  const set = new Set(productIds)
  return lines.filter((l) => set.has(l.productId))
}

export function evaluateBulkDiscount(rule: BulkDiscountRule, ctx: PromotionContext): number {
  const { minUnits } = rule
  const percentOff = Math.min(100, Math.max(0, rule.percentOff))
  if (minUnits <= 0 || percentOff <= 0) return 0

  const eligible = eligibleLines(ctx.lines, rule.productIds)
  const units = eligible.reduce((s, l) => s + l.quantity, 0)
  if (units < minUnits) return 0

  const subtotal = eligible.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0)
  return Math.round((subtotal * percentOff) / 100)
}
