/** One sellable row after merging duplicate SKUs (see aggregateCartLines). */
export type AggregatedLine = {
  productId: string
  quantity: number
  unitPriceCents: number
}

export type CartLineInput = {
  productId: string
  quantity: number
  unitPriceCents: number
}

/** Same-SKU bundle: pay for X in every group of (X + Y) units. */
export type BuyXGetYFreeRule = {
  id: string
  kind: 'buy_x_get_y_free'
  triggerProductId: string
  /** Units customer must purchase per “deal” (X). */
  buyQuantity: number
  /** Free units granted per deal (Y). */
  freeQuantity: number
  /**
   * SKU that receives free units. Defaults to `triggerProductId` (bundle pricing on one SKU).
   * When different, free units apply to `rewardProductId` up to its cart quantity.
   */
  rewardProductId?: string
  /**
   * When set, X/Y applies to the **combined** quantity across these SKUs; free units are
   * valued at the cheapest unit prices in the pool (sorted ascending).
   */
  poolProductIds?: string[]
}

/**
 * When total quantity across matching lines reaches `minUnits`, apply `percentOff` to those lines’ subtotal.
 * Example: minUnits 2, percentOff 15 → “2+ items → 15% off” on eligible lines.
 */
export type BulkDiscountRule = {
  id: string
  kind: 'bulk_discount'
  minUnits: number
  percentOff: number
  /** If omitted, every line qualifies. If set, only these SKUs count and receive the discount. */
  productIds?: string[]
}

export type SingleProductDiscountRule = {
  id: string
  kind: 'single_product_discount'
  productId: string
  percentOff: number
}

/** One promotion row with multiple DB tiers; `id` is the promotion id for engine scoring. */
export type TieredPromotionRule = {
  id: string
  kind: 'tiered_promotion'
  promotionId: string
  productIds: string[]
  tiers: {
    id: string
    minQty: number
    freeQty: number | null
    discountPercent: number | null
    sortOrder: number
  }[]
}

/** `TIERED_QUANTITY_DISCOUNT` — ladder on total eligible qty; one percent off eligible subtotal. */
export type TieredQuantityDiscountRule = {
  id: string
  kind: 'tiered_quantity_discount'
  promotionId: string
  productIds: string[]
  tiers: {
    id: string
    minQty: number
    discountPercent: number
    sortOrder: number
  }[]
}

export type PromotionRule =
  | BuyXGetYFreeRule
  | BulkDiscountRule
  | SingleProductDiscountRule
  | TieredPromotionRule
  | TieredQuantityDiscountRule

export type PromotionRuleKind = PromotionRule['kind']

export type PromotionContext = {
  originalTotalCents: number
  lines: readonly AggregatedLine[]
  linesByProductId: ReadonlyMap<string, AggregatedLine>
}

export type PromotionEngineResult = {
  originalTotalCents: number
  discountCents: number
  finalTotalCents: number
  /** Winning rule when discount is positive; otherwise null (no stacking — only one rule applies). */
  appliedPromotionId: string | null
}

export type PromotionEvaluation = {
  promotionId: string
  discountCents: number
}
