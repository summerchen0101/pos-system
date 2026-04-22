import type { SingleProductFixedDiscountRule, PromotionContext } from '../types'

export function evaluateSingleProductFixedDiscount(
  rule: SingleProductFixedDiscountRule,
  ctx: PromotionContext,
): number {
  const amount = Math.max(0, Math.trunc(rule.amountOffCents))
  if (amount < 1) return 0

  const line = ctx.linesByProductId.get(rule.productId)
  if (!line || line.quantity <= 0) return 0

  const subtotal = line.quantity * line.unitPriceCents
  return Math.min(amount, subtotal)
}
