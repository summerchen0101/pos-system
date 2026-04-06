export type Category = {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
}

export const PRODUCT_KINDS = ['STANDARD', 'CUSTOM_BUNDLE'] as const
export type ProductKind = (typeof PRODUCT_KINDS)[number]

/** One selectable pool inside a `CUSTOM_BUNDLE`; buyer must pick exactly `requiredQty` units from `productIds`. */
export type ProductBundleGroup = {
  id: string
  name: string
  requiredQty: number
  sortOrder: number
  productIds: string[]
}

/** `price` is in TWD minor units (1 = NT$0.01). */
export type Product = {
  id: string
  name: string
  nameEn: string | null
  description: string | null
  size: string | null
  sku: string
  price: number
  /** On-hand quantity (non-negative). */
  stock: number
  isActive: boolean
  categoryId: string | null
  categoryName: string | null
  kind: ProductKind
  /** `CUSTOM_BUNDLE` only — ordered groups; each group has its own pool and required total qty. */
  bundleGroups: ProductBundleGroup[]
}

export type CartLine = {
  /** Stable row key: `product.id` for regular lines; `gift:${promotionId}` for threshold gifts. */
  lineId: string
  product: Product
  quantity: number
  /** Auto-added 滿額贈 line (checkout deducts `gift_inventory`, not product stock). */
  isGift?: boolean
  giftId?: string
  promotionId?: string
  /** Snapshot from promotion payload; used for stock checks and sync. */
  giftStock?: number
  /** Staff-applied FREE_ITEMS (normal product stock at checkout). */
  isManualFree?: boolean
  manualPromotionId?: string
  /** Paid bundle header line (`CUSTOM_BUNDLE` product). */
  isBundleRoot?: boolean
  /** Component lines for a bundle (unit price 0 in UI; stock from component SKU). */
  isBundleComponent?: boolean
  /** Groups root + components from one “add bundle” action. */
  bundleInstanceId?: string
  /** `CUSTOM_BUNDLE` product id (set on component lines). */
  bundleRootProductId?: string
  /** `bundle_groups.id` for component lines (per-group qty cap). */
  bundleGroupId?: string
}

export const PROMOTION_KINDS = [
  'BUY_X_GET_Y',
  'BULK_DISCOUNT',
  'SINGLE_DISCOUNT',
  'TIERED',
  'TIERED_QUANTITY_DISCOUNT',
  'GIFT_WITH_THRESHOLD',
  'FIXED_DISCOUNT',
  'FREE_ITEMS',
  'FREE_SELECTION',
] as const
export type PromotionKind = (typeof PROMOTION_KINDS)[number]

export const PROMOTION_APPLY_MODES = ['AUTO', 'MANUAL'] as const
export type PromotionApplyMode = (typeof PROMOTION_APPLY_MODES)[number]

export function isPromotionKindString(value: string): value is PromotionKind {
  return (PROMOTION_KINDS as readonly string[]).includes(value)
}

/** Row from `promotion_rules` (tiers). */
export type PromotionTierRule = {
  id: string
  minQty: number
  freeQty: number | null
  discountPercent: number | null
  sortOrder: number
}

/** Row from `promotion_tiers` (`TIERED_QUANTITY_DISCOUNT`). */
export type PromotionQuantityDiscountTier = {
  id: string
  minQty: number
  discountPercent: number
  sortOrder: number
}

/** Resolved gift row for POS / mappers (`GIFT_WITH_THRESHOLD`). */
export type PromotionGiftDetail = {
  giftId: string
  displayName: string
  stock: number
  isActive: boolean
}

export type Promotion = {
  id: string
  /** Booths this promotion applies to (from `promotion_booths`). */
  boothIds: string[]
  /** Display names aligned with `boothIds` after sort. */
  boothNames: string[]
  code: string | null
  name: string
  kind: PromotionKind
  buyQty: number | null
  freeQty: number | null
  /**
   * `BUY_X_GET_Y` only — when true, at most one free bundle applies (no multi-stack).
   * Other kinds: always false in UI/API.
   */
  bogoSingleDealOnly: boolean
  discountPercent: number | null
  active: boolean
  applyMode: PromotionApplyMode
  /** `FIXED_DISCOUNT` — amount off in minor units. */
  fixedDiscountCents: number | null
  productIds: string[]
  /** Populated when `kind === 'TIERED'`. */
  rules: PromotionTierRule[]
  /** Populated when `kind === 'TIERED_QUANTITY_DISCOUNT'`; sorted by `minQty` ascending for display. */
  quantityDiscountTiers: PromotionQuantityDiscountTier[]
  /** DB `gift_id`; only set for `GIFT_WITH_THRESHOLD`. */
  giftId: string | null
  /** Threshold in minor units; only for `GIFT_WITH_THRESHOLD`. */
  thresholdAmountCents: number | null
  /** Joined gift + inventory when `gift_id` is set (no catalog product). */
  gift: PromotionGiftDetail | null
  /**
   * `FREE_ITEMS` only — from `promotion_products.quantity` (each product’s gift count).
   * Always `[]` for other kinds.
   */
  freeItems: { productId: string; quantity: number }[]
  /**
   * `FREE_SELECTION` only — products the cashier may pick (qty capped by `maxSelectionQty` total).
   */
  selectableProductIds: string[]
  /** `FREE_SELECTION` only — max total units across chosen pool products. */
  maxSelectionQty: number | null
}
