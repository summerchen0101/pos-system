import type { SingleProductDiscountRule, PromotionContext } from '../types'

export function evaluateSingleProductDiscount(
  rule: SingleProductDiscountRule,
  ctx: PromotionContext,
): number {
  const percentOff = Math.min(100, Math.max(0, rule.percentOff))
  if (percentOff <= 0) return 0

  const line = ctx.linesByProductId.get(rule.productId)
  if (!line || line.quantity <= 0) return 0

  const subtotal = line.quantity * line.unitPriceCents
  return Math.round((subtotal * percentOff) / 100)
}
