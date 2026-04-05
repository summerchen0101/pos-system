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
  kind: string
  buy_qty: number | null
  free_qty: number | null
  discount_percent: number | null
  active: boolean
}

export type PromotionProductRow = {
  promotion_id: string
  product_id: string
}

export type Database = {
  public: {
    Tables: {
      products: {
        Row: ProductRow
        Insert: Omit<ProductRow, 'id'> & { id?: string }
        Update: Partial<ProductRow>
        Relationships: []
      }
      promotions: {
        Row: PromotionRow
        Insert: Omit<PromotionRow, 'id'> & { id?: string }
        Update: Partial<PromotionRow>
        Relationships: []
      }
      promotion_products: {
        Row: PromotionProductRow
        Insert: PromotionProductRow
        Update: Partial<PromotionProductRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
