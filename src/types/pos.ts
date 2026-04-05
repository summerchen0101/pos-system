export type Product = {
  id: string
  name: string
  priceCents: number
  category?: string
}

export type CartLine = {
  product: Product
  quantity: number
}
