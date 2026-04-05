import { computeTieredQuantityDiscount } from '../tiered/computeTieredQuantityDiscount'
import type { PromotionContext } from '../types'
import type { TieredQuantityDiscountRule } from '../types'

export type TieredQuantityDiscountEvaluation = {
  discountCents: number
  appliedRuleId: string
}

export function evaluateTieredQuantityDiscount(
  rule: TieredQuantityDiscountRule,
  ctx: PromotionContext,
): TieredQuantityDiscountEvaluation {
  const set = new Set(rule.productIds)
  const eligible = ctx.lines.filter((l) => set.has(l.productId))

  const result = computeTieredQuantityDiscount(
    eligible.map((l) => ({
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
    })),
    rule.tiers,
  )

  const appliedRuleId =
    result.appliedTierId != null ? `${rule.promotionId}~qt~${result.appliedTierId}` : rule.id

  return { discountCents: result.discountCents, appliedRuleId }
}
