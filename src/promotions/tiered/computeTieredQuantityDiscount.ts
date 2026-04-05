/**
 * `TIERED_QUANTITY_DISCOUNT`: among tiers with `minQty <= totalEligibleQty`, pick the one
 * with the **largest** `minQty`, then apply its `discountPercent` to the eligible subtotal.
 * (Not “largest discount” — unlike legacy `TIERED` percent tiers.)
 */

export type QuantityDiscountTierLine = {
  id: string
  minQty: number
  discountPercent: number
  sortOrder: number
}

export type TieredQuantityDiscountResult = {
  discountCents: number
  appliedTierId: string | null
}

export function pickQuantityDiscountTier(
  totalQty: number,
  tiers: readonly QuantityDiscountTierLine[],
): QuantityDiscountTierLine | null {
  if (totalQty < 1 || tiers.length === 0) return null
  const qualifying = tiers.filter((t) => totalQty >= t.minQty)
  if (qualifying.length === 0) return null
  qualifying.sort((a, b) => {
    if (b.minQty !== a.minQty) return b.minQty - a.minQty
    if (b.sortOrder !== a.sortOrder) return b.sortOrder - a.sortOrder
    return a.id.localeCompare(b.id)
  })
  return qualifying[0] ?? null
}

export function computeTieredQuantityDiscount(
  eligibleLines: readonly { quantity: number; unitPriceCents: number }[],
  tiers: readonly QuantityDiscountTierLine[],
): TieredQuantityDiscountResult {
  const totalQty = eligibleLines.reduce((s, l) => s + l.quantity, 0)
  const subtotalCents = eligibleLines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0)

  if (totalQty < 1 || subtotalCents <= 0 || tiers.length === 0) {
    return { discountCents: 0, appliedTierId: null }
  }

  const tier = pickQuantityDiscountTier(totalQty, tiers)
  if (!tier || tier.discountPercent < 1) {
    return { discountCents: 0, appliedTierId: null }
  }

  const discountCents = Math.round((subtotalCents * tier.discountPercent) / 100)
  return {
    discountCents,
    appliedTierId: tier.id,
  }
}
