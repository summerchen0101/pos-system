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

export type PromotionRuleRow = {
  id: string
  promotion_id: string
  min_qty: number
  free_qty: number | null
  discount_percent: number | null
  sort_order: number
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
      promotion_rules: {
        Row: PromotionRuleRow
        Insert: Omit<PromotionRuleRow, 'id'> & { id?: string }
        Update: Partial<PromotionRuleRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
