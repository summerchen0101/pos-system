import type { CartPercentDiscountRule, PromotionContext } from '../types'

export function evaluateCartPercentDiscount(rule: CartPercentDiscountRule, ctx: PromotionContext): number {
  const percentOff = Math.min(100, Math.max(0, rule.percentOff))
  if (percentOff <= 0) return 0
  return Math.round((ctx.originalTotalCents * percentOff) / 100)
}
