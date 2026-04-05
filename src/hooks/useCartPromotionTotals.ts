import { useMemo } from 'react'
import { computeCartPromotionBreakdown } from '../promotions/computeCartPromotionBreakdown'
import { resolveAppliedPromotionName } from '../promotions/resolveAppliedPromotion'
import { thresholdGiftSummaryLines } from '../promotions/thresholdGifts'
import { useCartStore } from '../store/cartStore'
import type { CartTotals } from '../store/cartStore'
import type { ManualPromotionDetail } from '../promotions/computeCartPromotionBreakdown'
import type { Promotion } from '../types/pos'
import { zhtw } from '../locales/zhTW'

export type CartPromotionTotals = CartTotals & {
  appliedPromotionId: string | null
  appliedPromotionName: string | null
  manualPromotionDetails: ManualPromotionDetail[]
  thresholdGiftSummaries: string[]
}

/** Recalculates subtotal, discount, and final whenever cart lines or promotions change. */
export function useCartPromotionTotals(promotions: Promotion[]): CartPromotionTotals {
  const lines = useCartStore((s) => s.lines)
  const manualPromotionIds = useCartStore((s) => s.manualPromotionIds)

  return useMemo(() => {
    const b = computeCartPromotionBreakdown(lines, promotions, manualPromotionIds)
    const totalDiscount = b.autoDiscountCents + b.manualDiscountCents

    return {
      subtotalCents: b.subtotalCents,
      discountCents: totalDiscount,
      finalCents: b.finalBeforeGiftsCents,
      appliedPromotionId: b.appliedAutoRuleId,
      appliedPromotionName: resolveAppliedPromotionName(b.appliedAutoRuleId, promotions),
      manualPromotionDetails: b.manualDetails,
      thresholdGiftSummaries: thresholdGiftSummaryLines(
        lines,
        promotions,
        manualPromotionIds,
        zhtw.pos.thresholdGiftLine,
      ),
    }
  }, [lines, promotions, manualPromotionIds])
}
