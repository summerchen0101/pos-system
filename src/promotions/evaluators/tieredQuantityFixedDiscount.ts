import { computeTieredQuantityFixedDiscount } from '../tiered/computeTieredQuantityFixedDiscount'
import type { PromotionContext } from '../types'
import type { TieredQuantityFixedDiscountRule } from '../types'

export type TieredQuantityFixedDiscountEvaluation = {
  discountCents: number
  appliedRuleId: string
}

export function evaluateTieredQuantityFixedDiscount(
  rule: TieredQuantityFixedDiscountRule,
  ctx: PromotionContext,
): TieredQuantityFixedDiscountEvaluation {
  const set = new Set(rule.productIds)
  const eligible = ctx.lines.filter((l) => set.has(l.productId))

  const result = computeTieredQuantityFixedDiscount(
    eligible.map((l) => ({
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
    })),
    rule.tiers,
  )

  const appliedRuleId =
    result.appliedTierId != null ? `${rule.promotionId}~qtf~${result.appliedTierId}` : rule.id

  return { discountCents: result.discountCents, appliedRuleId }
}
