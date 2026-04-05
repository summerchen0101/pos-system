/** One tier row (matches `promotion_rules`). */
export type TieredRuleLine = {
  id: string
  minQty: number
  freeQty: number | null
  discountPercent: number | null
  /** Lower sorts first for display; used as tie-breaker (higher wins after discount). */
  sortOrder: number
}

export type TieredEligibleLine = {
  productId: string
  quantity: number
  unitPriceCents: number
}

export type TieredDiscountResult = {
  discountCents: number
  /** `promotion_rules.id` of the winning tier, or null if none apply. */
  appliedTierRuleId: string | null
}
