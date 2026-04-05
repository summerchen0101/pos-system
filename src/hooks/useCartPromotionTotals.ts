import { useMemo } from 'react'
import { evaluatePromotionEngine } from '../promotions/engine'
import { mapDbPromotionsToEngineRules } from '../promotions/mapDbPromotionsToRules'
import { resolveAppliedPromotionName } from '../promotions/resolveAppliedPromotion'
import { cartLineInputsFromPos } from '../promotions/posAdapter'
import { useCartStore } from '../store/cartStore'
import type { CartTotals } from '../store/cartStore'
import type { Promotion } from '../types/pos'

export type CartPromotionTotals = CartTotals & {
  appliedPromotionId: string | null
  appliedPromotionName: string | null
}

/** Recalculates subtotal, discount, and final whenever cart lines or promotions change. */
export function useCartPromotionTotals(promotions: Promotion[]): CartPromotionTotals {
  const lines = useCartStore((s) => s.lines)

  return useMemo(() => {
    const rules = mapDbPromotionsToEngineRules(promotions)
    const cart = cartLineInputsFromPos(lines)
    const engine = evaluatePromotionEngine(cart, rules)

    return {
      subtotalCents: engine.originalTotalCents,
      discountCents: engine.discountCents,
      finalCents: engine.finalTotalCents,
      appliedPromotionId: engine.appliedPromotionId,
      appliedPromotionName: resolveAppliedPromotionName(engine.appliedPromotionId, promotions),
    }
  }, [lines, promotions])
}
