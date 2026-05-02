import { quantizeToYuanCents } from '../lib/money'
import type { CartPromotionBreakdown } from './computeCartPromotionBreakdown'

/**
 * Ensures payable `finalBeforeGiftsCents` is whole TWD and total discount splits still sum to identity.
 * Disperses rounding delta onto manual promo rows last-first, then auto allocations last-first.
 */
export function normalizeCartBreakdownToYuan(b: CartPromotionBreakdown): CartPromotionBreakdown {
  const allocations = b.appliedAutoAllocations.map((a) => ({ ...a }))
  const manualDetails = b.manualDetails.map((m) => ({ ...m }))

  const autoDiscountSum = (): number =>
    allocations.reduce((s, a) => s + a.discountCents, 0)
  const manualDiscountSum = (): number =>
    manualDetails.reduce((s, m) => s + m.discountCents, 0)

  const currentTotalDiscount = autoDiscountSum() + manualDiscountSum()
  const subtotal = b.subtotalCents
  const rawFinal = Math.max(0, b.finalBeforeGiftsCents)

  const hasPositiveDiscountAllocation =
    allocations.some((a) => a.discountCents > 0) ||
    manualDetails.some((m) => m.discountCents > 0)

  const adjustedFinal = hasPositiveDiscountAllocation
    ? Math.max(0, quantizeToYuanCents(rawFinal))
    : rawFinal
  const targetTotalDiscount = Math.max(0, subtotal - adjustedFinal)

  let delta = targetTotalDiscount - currentTotalDiscount

  if (delta < 0) {
    for (let i = manualDetails.length - 1; i >= 0 && delta < 0; i--) {
      const row = manualDetails[i]!
      const take = Math.min(row.discountCents, -delta)
      row.discountCents -= take
      delta += take
    }
    for (let i = allocations.length - 1; i >= 0 && delta < 0; i--) {
      const row = allocations[i]!
      const take = Math.min(row.discountCents, -delta)
      row.discountCents -= take
      delta += take
    }
  }

  for (let i = manualDetails.length - 1; i >= 0 && delta > 0; i--) {
    manualDetails[i]!.discountCents += delta
    delta = 0
  }
  if (delta > 0) {
    for (let i = allocations.length - 1; i >= 0 && delta > 0; i--) {
      allocations[i]!.discountCents += delta
      delta = 0
    }
  }

  if (delta !== 0) {
    if (manualDetails.length > 0) {
      manualDetails[manualDetails.length - 1]!.discountCents += delta
    } else if (allocations.length > 0) {
      allocations[allocations.length - 1]!.discountCents += delta
    }
  }

  const autoDiscountAfter = autoDiscountSum()
  const manualAfter = manualDiscountSum()
  const appliedAutoRuleId =
    allocations.find((a) => a.discountCents > 0)?.ruleId ?? null

  return {
    ...b,
    appliedAutoAllocations: allocations,
    manualDetails,
    autoDiscountCents: autoDiscountAfter,
    manualDiscountCents: manualAfter,
    autoFinalCents: subtotal - autoDiscountAfter,
    appliedAutoRuleId,
    finalBeforeGiftsCents: adjustedFinal,
  }
}
