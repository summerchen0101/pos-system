/** Order row from `public.orders` (amounts in TWD minor units). */
export type Order = {
  id: string
  createdAt: string
  totalAmountCents: number
  discountAmountCents: number
  finalAmountCents: number
}

/** Stored with checkout for admin history (JSON on `orders.promotion_snapshot`). */
export type OrderPromotionSnapshot = {
  autoPromotionName: string | null
  manualPromotionDetails: { promotionId?: string; name: string; discountCents: number }[]
  thresholdGiftSummaries: string[]
}

export type OrderItem = {
  id: string
  productId: string
  productName: string
  size: string | null
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
  isGift: boolean
  isManualFree: boolean
  giftId: string | null
}

/** List row with short text for the first lines. */
export type OrderListEntry = Order & {
  itemsPreview: string
}

export type OrderDetail = Order & {
  promotionSnapshot: OrderPromotionSnapshot | null
  items: OrderItem[]
}
