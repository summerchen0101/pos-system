/** Order row from `public.orders` (amounts in TWD minor units). */
export type Order = {
  id: string
  createdAt: string
  totalAmountCents: number
  discountAmountCents: number
  finalAmountCents: number
  boothId: string
  /** Present when list/detail query embeds `booths`. */
  boothName?: string | null
  /** Snapshot at checkout: names on shift roster for that booth/day. */
  scheduledStaffNames: string[]
  /** Snapshot at checkout: names clocked in (incl. ad-hoc). */
  clockedInStaffNames: string[]
  buyerGender: BuyerGender | null
  buyerAgeGroup: BuyerAgeGroup | null
  buyerMotivation: BuyerMotivation | null
}

export type BuyerGender = "male" | "female" | "other"
export type BuyerAgeGroup = "under_18" | "18_24" | "25_34" | "35_44" | "45_54" | "55_above"
export type BuyerMotivation = "self_use" | "gift" | "trial" | "repurchase" | "other"

/** Stored with checkout for admin history (JSON on `orders.promotion_snapshot`). */
export type OrderSnapshotPromotionEntry = {
  type: string
  promotionId?: string
  name: string
  description: string
  selectedItemsSummary: string
}

export type OrderPromotionSnapshot = {
  /** Base promotion UUID for auto-applied discount (engine id may use `~` suffix). */
  autoPromotionId?: string | null
  autoPromotionName: string | null
  manualPromotionDetails: { promotionId?: string; name: string; discountCents: number }[]
  thresholdGiftSummaries: string[]
  /** Structured manual promos (e.g. FREE_SELECTION) for order detail UI. */
  promotions: OrderSnapshotPromotionEntry[]
}

export type OrderItem = {
  id: string
  /** Null for threshold gift lines (catalog gift only). */
  productId: string | null
  productName: string
  size: string | null
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
  isGift: boolean
  isManualFree: boolean
  giftId: string | null
  /** e.g. `FREE_SELECTION` for 任選贈品 lines; threshold gifts use `gift_id` only. */
  source: string | null
}

export type OrderAppliedPromotion = {
  id: string
  promotionId: string | null
  promotionName: string
  promotionType: string
  discountAmount: number
}

export type OrderGiftItem = {
  id: string
  giftId: string | null
  giftName: string
  quantity: number
}

/** List row with short text for the first lines. */
export type OrderListEntry = Order & {
  itemsPreview: string
}

export type OrderDetail = Order & {
  promotionSnapshot: OrderPromotionSnapshot | null
  items: OrderItem[]
  appliedPromotions: OrderAppliedPromotion[]
  giftItems: OrderGiftItem[]
}
