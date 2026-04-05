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

export type PromotionRule =
  | BuyXGetYFreeRule
  | BulkDiscountRule
  | SingleProductDiscountRule

export type PromotionKind = PromotionRule['kind']

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
