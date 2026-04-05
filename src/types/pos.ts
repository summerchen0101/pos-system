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

export type Promotion = {
  id: string
  code: string | null
  name: string
  discountPercent: number
  active: boolean
}
