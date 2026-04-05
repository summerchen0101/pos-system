/** `price` is in minor units (e.g. cents). */
export type Product = {
  id: string
  name: string
  nameEn: string | null
  description: string | null
  size: string | null
  sku: string
  price: number
  isActive: boolean
}

export type CartLine = {
  product: Product
  quantity: number
}

export const PROMOTION_KINDS = ['BUY_X_GET_Y', 'BULK_DISCOUNT', 'SINGLE_DISCOUNT'] as const
export type PromotionKind = (typeof PROMOTION_KINDS)[number]

export function isPromotionKindString(value: string): value is PromotionKind {
  return (PROMOTION_KINDS as readonly string[]).includes(value)
}

export type Promotion = {
  id: string
  code: string | null
  name: string
  kind: PromotionKind
  buyQty: number | null
  freeQty: number | null
  discountPercent: number | null
  active: boolean
  productIds: string[]
}
