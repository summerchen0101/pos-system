import type { PromotionContext, PromotionRule } from './types'
import { evaluateBuyXGetYFree } from './evaluators/buyXGetYFree'
import { evaluateBulkDiscount } from './evaluators/bulkDiscount'
import { evaluateSingleProductDiscount } from './evaluators/singleProductDiscount'

/** Discount in cents if the rule applies in isolation (no stacking). */
export function evaluatePromotionRule(rule: PromotionRule, ctx: PromotionContext): number {
  switch (rule.kind) {
    case 'buy_x_get_y_free':
      return evaluateBuyXGetYFree(rule, ctx)
    case 'bulk_discount':
      return evaluateBulkDiscount(rule, ctx)
    case 'single_product_discount':
      return evaluateSingleProductDiscount(rule, ctx)
    default: {
      const _exhaustive: never = rule
      return _exhaustive
    }
  }
}
