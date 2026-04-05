/** Row shapes for `public` tables — align migrations with these columns. */
export type ProductRow = {
  id: string
  name: string
  name_en: string | null
  description: string | null
  size: string | null
  sku: string
  /** Minor units (e.g. cents). */
  price: number
  is_active: boolean
}

export type PromotionRow = {
  id: string
  code: string | null
  name: string
  discount_percent: number
  active: boolean
}

export type Database = {
  public: {
    Tables: {
      products: {
        Row: ProductRow
        Insert: Omit<ProductRow, 'id'> & { id?: string }
        Update: Partial<ProductRow>
      }
      promotions: {
        Row: PromotionRow
        Insert: Omit<PromotionRow, 'id'> & { id?: string }
        Update: Partial<PromotionRow>
      }
    }
  }
}
