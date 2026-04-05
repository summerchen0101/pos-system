import { discountBuyXGetYCheapestFromLines } from '../cheapestFree'
import type { BuyXGetYFreeRule, PromotionContext } from '../types'

/**
 * Pooled BOGO (typical DB `BUY_X_GET_Y` with multiple `promotion_products`): one bundle
 * across all eligible lines; free units are always the cheapest units in the cart.
 *
 * Legacy cross-SKU (trigger ≠ reward, no pool): deals from trigger qty, free value from reward line.
 */
export function evaluateBuyXGetYFree(rule: BuyXGetYFreeRule, ctx: PromotionContext): number {
  const { buyQuantity: x, freeQuantity: y } = rule
  if (x <= 0 || y <= 0) return 0

  if (rule.poolProductIds && rule.poolProductIds.length > 0) {
    const lines = []
    for (const pid of rule.poolProductIds) {
      const line = ctx.linesByProductId.get(pid)
      if (line && line.quantity > 0) {
        lines.push({ quantity: line.quantity, unitPriceCents: line.unitPriceCents })
      }
    }
    return discountBuyXGetYCheapestFromLines(lines, x, y)
  }

  const trigger = ctx.linesByProductId.get(rule.triggerProductId)
  if (!trigger || trigger.quantity <= 0) return 0

  const rewardId = rule.rewardProductId ?? rule.triggerProductId
  const reward = ctx.linesByProductId.get(rewardId)
  if (!reward || reward.quantity <= 0) return 0

  if (rewardId === rule.triggerProductId) {
    return discountBuyXGetYCheapestFromLines(
      [{ quantity: trigger.quantity, unitPriceCents: trigger.unitPriceCents }],
      x,
      y,
    )
  }

  const deals = Math.floor(trigger.quantity / x)
  const freeEarned = deals * y
  const freeApplied = Math.min(freeEarned, reward.quantity)
  return freeApplied * reward.unitPriceCents
}
