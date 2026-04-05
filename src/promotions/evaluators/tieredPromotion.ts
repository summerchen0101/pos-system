import { computeBestTieredDiscount } from '../tiered/computeBestTieredDiscount'
import type { PromotionContext } from '../types'
import type { TieredPromotionRule } from '../types'

export type TieredRuleEvaluation = {
  discountCents: number
  appliedRuleId: string
}

export function evaluateTieredPromotion(
  rule: TieredPromotionRule,
  ctx: PromotionContext,
): TieredRuleEvaluation {
  const set = new Set(rule.productIds)
  const eligible = ctx.lines.filter((l) => set.has(l.productId))

  const result = computeBestTieredDiscount(
    eligible.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
    })),
    rule.tiers.map((t) => ({
      id: t.id,
      minQty: t.minQty,
      freeQty: t.freeQty,
      discountPercent: t.discountPercent,
      sortOrder: t.sortOrder,
    })),
  )

  const appliedRuleId =
    result.appliedTierRuleId != null
      ? `${rule.promotionId}~t~${result.appliedTierRuleId}`
      : rule.id

  return { discountCents: result.discountCents, appliedRuleId }
}
