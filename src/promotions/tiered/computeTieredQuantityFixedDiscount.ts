/**
 * `TIERED_QUANTITY_FIXED_DISCOUNT`: same tier selection as quantity percent discount,
 * but discount is a fixed amount (capped at eligible subtotal).
 */

import { pickQuantityTierByTotalQty } from './computeTieredQuantityDiscount'

export type QuantityFixedDiscountTierLine = {
  id: string
  minQty: number
  discountAmountCents: number
  sortOrder: number
}

export type TieredQuantityFixedDiscountResult = {
  discountCents: number
  appliedTierId: string | null
}

export function computeTieredQuantityFixedDiscount(
  eligibleLines: readonly { quantity: number; unitPriceCents: number }[],
  tiers: readonly QuantityFixedDiscountTierLine[],
): TieredQuantityFixedDiscountResult {
  const totalQty = eligibleLines.reduce((s, l) => s + l.quantity, 0)
  const subtotalCents = eligibleLines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0)

  if (totalQty < 1 || subtotalCents <= 0 || tiers.length === 0) {
    return { discountCents: 0, appliedTierId: null }
  }

  const tier = pickQuantityTierByTotalQty(totalQty, tiers)
  if (!tier || tier.discountAmountCents < 1) {
    return { discountCents: 0, appliedTierId: null }
  }

  const discountCents = Math.min(tier.discountAmountCents, subtotalCents)
  return {
    discountCents,
    appliedTierId: tier.id,
  }
}
