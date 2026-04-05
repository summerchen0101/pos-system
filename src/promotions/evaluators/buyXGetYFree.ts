import type { BuyXGetYFreeRule, PromotionContext } from '../types'

/**
 * Same SKU: customer pays for ceil(q × X / (X+Y)) units (classic “buy X get Y free” bundle).
 * Cross SKU: floor(triggerQty / X) deals × Y free units applied to reward line (capped by reward qty).
 */
export function evaluateBuyXGetYFree(rule: BuyXGetYFreeRule, ctx: PromotionContext): number {
  const { buyQuantity: x, freeQuantity: y } = rule
  if (x <= 0 || y <= 0) return 0

  const trigger = ctx.linesByProductId.get(rule.triggerProductId)
  if (!trigger || trigger.quantity <= 0) return 0

  const rewardId = rule.rewardProductId ?? rule.triggerProductId
  const reward = ctx.linesByProductId.get(rewardId)
  if (!reward || reward.quantity <= 0) return 0

  if (rewardId === rule.triggerProductId) {
    const q = trigger.quantity
    const original = q * trigger.unitPriceCents
    const paidQty = Math.ceil((q * x) / (x + y))
    const discounted = paidQty * trigger.unitPriceCents
    return Math.max(0, original - discounted)
  }

  const deals = Math.floor(trigger.quantity / x)
  const freeEarned = deals * y
  const freeApplied = Math.min(freeEarned, reward.quantity)
  return freeApplied * reward.unitPriceCents
}
