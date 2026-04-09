import { useEffect, useMemo } from 'react'
import { filterManualPromotionIdsByGroups } from '../promotions/filterManualPromotionIdsByGroups'
import { promotionContextFromPaidMerch } from '../promotions/computeCartPromotionBreakdown'
import { cartLineInputsFromPos } from '../promotions/posAdapter'
import { selectAutoPromotionStack } from '../promotions/selectAutoPromotionStack'
import { useCartStore } from '../store/cartStore'
import type { Product, Promotion } from '../types/pos'

/**
 * Drops manual promotion picks that violate exclusive / best_only group rules so FREE_* lines
 * and tags stay aligned with checkout math.
 */
export function usePruneManualPromotionGroups(promotions: Promotion[], products: Product[]) {
  const lines = useCartStore((s) => s.lines)
  const manualPromotionIds = useCartStore((s) => s.manualPromotionIds)
  const removeManualPromotion = useCartStore((s) => s.removeManualPromotion)

  const effectiveIds = useMemo(() => {
    if (manualPromotionIds.length === 0) return manualPromotionIds
    const cart = cartLineInputsFromPos(lines)
    const stack = selectAutoPromotionStack(cart, promotions)
    const bogoCtx = promotionContextFromPaidMerch(lines)
    const appliedAutoRuleIds = stack.allocations.map((a) => a.ruleId)
    return filterManualPromotionIdsByGroups(
      manualPromotionIds,
      promotions,
      bogoCtx,
      appliedAutoRuleIds,
    )
  }, [lines, promotions, manualPromotionIds, products])

  useEffect(() => {
    const toRemove = manualPromotionIds.filter((id) => !effectiveIds.includes(id))
    if (toRemove.length === 0) return
    for (const id of toRemove) {
      removeManualPromotion(id)
    }
  }, [effectiveIds, manualPromotionIds, removeManualPromotion])
}
