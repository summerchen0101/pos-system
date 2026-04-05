/** Row shapes for `public` tables — align migrations with these columns. */
export type CategoryRow = {
  id: string
  name: string
  sort_order: number
}

export type ProductRow = {
  id: string
  category_id: string | null
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

export type OrderRow = {
  id: string
  created_at: string
  total_amount: number
  discount_amount: number
  final_amount: number
}

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: CategoryRow
        Insert: Omit<CategoryRow, 'id'> & { id?: string }
        Update: Partial<CategoryRow>
        Relationships: []
      }
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
      orders: {
        Row: OrderRow
        Insert: Omit<OrderRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<OrderRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
