import { quantizeToYuanCents } from '../lib/money'
import type { PromotionContext, PromotionRule } from './types'
import { evaluateBuyXGetYFree } from './evaluators/buyXGetYFree'
import { evaluateBulkDiscount } from './evaluators/bulkDiscount'
import { evaluateSingleProductDiscount } from './evaluators/singleProductDiscount'
import { evaluateSingleProductFixedDiscount } from './evaluators/singleProductFixedDiscount'
import { evaluateTieredPromotion } from './evaluators/tieredPromotion'
import { evaluateTieredQuantityDiscount } from './evaluators/tieredQuantityDiscount'
import { evaluateTieredQuantityFixedDiscount } from './evaluators/tieredQuantityFixedDiscount'
import { evaluateCartPercentDiscount } from './evaluators/cartPercentDiscount'

export type RuleEvaluation = {
  discountCents: number
  /** Identifier for receipts / UI (may be composite, e.g. `promoId~t~tierRowId`). */
  appliedRuleId: string
}

function quantized(ev: RuleEvaluation): RuleEvaluation {
  return {
    discountCents: quantizeToYuanCents(ev.discountCents),
    appliedRuleId: ev.appliedRuleId,
  }
}

/** Discount in cents if the rule applies in isolation (no stacking). */
export function evaluatePromotionRule(rule: PromotionRule, ctx: PromotionContext): RuleEvaluation {
  switch (rule.kind) {
    case 'buy_x_get_y_free':
      return quantized({
        discountCents: evaluateBuyXGetYFree(rule, ctx),
        appliedRuleId: rule.id,
      })
    case 'bulk_discount':
      return quantized({
        discountCents: evaluateBulkDiscount(rule, ctx),
        appliedRuleId: rule.id,
      })
    case 'single_product_discount':
      return quantized({
        discountCents: evaluateSingleProductDiscount(rule, ctx),
        appliedRuleId: rule.id,
      })
    case 'single_product_fixed_discount':
      return quantized({
        discountCents: evaluateSingleProductFixedDiscount(rule, ctx),
        appliedRuleId: rule.id,
      })
    case 'tiered_promotion':
      return quantized(evaluateTieredPromotion(rule, ctx))
    case 'tiered_quantity_discount':
      return quantized(evaluateTieredQuantityDiscount(rule, ctx))
    case 'tiered_quantity_fixed_discount':
      return quantized(evaluateTieredQuantityFixedDiscount(rule, ctx))
    case 'cart_percent_discount':
      return quantized({
        discountCents: evaluateCartPercentDiscount(rule, ctx),
        appliedRuleId: rule.id,
      })
    default: {
      const _exhaustive: never = rule
      return _exhaustive
    }
  }
}
