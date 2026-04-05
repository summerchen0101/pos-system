/** Row shapes for `public` tables — align migrations with these columns. */
export type CategoryRow = {
  id: string
  name: string
  sort_order: number
  is_active: boolean
}

export type ProductRow = {
  id: string
  category_id: string | null
  name: string
  name_en: string | null
  description: string | null
  size: string | null
  sku: string
  /** TWD minor units (1 = NT$0.01). */
  price: number
  stock: number
  is_active: boolean
  kind: string
}

export type BundleGroupRow = {
  id: string
  bundle_product_id: string
  name: string
  required_qty: number
  sort_order: number
}

export type BundleGroupItemRow = {
  group_id: string
  product_id: string
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
  apply_mode?: string
  fixed_discount_cents: number | null
  gift_id: string | null
  threshold_amount: number | null
  /** `FREE_SELECTION` only. */
  max_selection_qty: number | null
}

export type PromotionSelectableItemRow = {
  promotion_id: string
  product_id: string
}

export type GiftRow = {
  id: string
  name: string
  is_active: boolean
}

export type GiftInventoryRow = {
  gift_id: string
  stock: number
}

export type PromotionProductRow = {
  promotion_id: string
  product_id: string
  /** Gift qty per product for `FREE_ITEMS`; other kinds use 1. */
  quantity: number
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
  promotion_snapshot: unknown | null
}

export type OrderItemRow = {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  size: string | null
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  is_gift: boolean
  is_manual_free: boolean
  gift_id: string | null
  sort_order: number
  source: string | null
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
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      bundle_groups: {
        Row: BundleGroupRow
        Insert: Omit<BundleGroupRow, 'id'> & { id?: string }
        Update: Partial<BundleGroupRow>
        Relationships: [
          {
            foreignKeyName: 'bundle_groups_bundle_product_id_fkey'
            columns: ['bundle_product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      bundle_group_items: {
        Row: BundleGroupItemRow
        Insert: BundleGroupItemRow
        Update: Partial<BundleGroupItemRow>
        Relationships: [
          {
            foreignKeyName: 'bundle_group_items_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'bundle_groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'bundle_group_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      promotions: {
        Row: PromotionRow
        Insert: Omit<PromotionRow, 'id'> & { id?: string }
        Update: Partial<PromotionRow>
        Relationships: [
          {
            foreignKeyName: 'promotions_gift_id_fkey'
            columns: ['gift_id']
            isOneToOne: false
            referencedRelation: 'gifts'
            referencedColumns: ['id']
          },
        ]
      }
      gifts: {
        Row: GiftRow
        Insert: Omit<GiftRow, 'id'> & { id?: string }
        Update: Partial<GiftRow>
        Relationships: []
      }
      gift_inventory: {
        Row: GiftInventoryRow
        Insert: GiftInventoryRow
        Update: Partial<GiftInventoryRow>
        Relationships: [
          {
            foreignKeyName: 'gift_inventory_gift_id_fkey'
            columns: ['gift_id']
            isOneToOne: true
            referencedRelation: 'gifts'
            referencedColumns: ['id']
          },
        ]
      }
      promotion_products: {
        Row: PromotionProductRow
        Insert: PromotionProductRow
        Update: Partial<PromotionProductRow>
        Relationships: [
          {
            foreignKeyName: 'promotion_products_promotion_id_fkey'
            columns: ['promotion_id']
            isOneToOne: false
            referencedRelation: 'promotions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'promotion_products_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      promotion_selectable_items: {
        Row: PromotionSelectableItemRow
        Insert: PromotionSelectableItemRow
        Update: Partial<PromotionSelectableItemRow>
        Relationships: [
          {
            foreignKeyName: 'promotion_selectable_items_promotion_id_fkey'
            columns: ['promotion_id']
            isOneToOne: false
            referencedRelation: 'promotions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'promotion_selectable_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      promotion_rules: {
        Row: PromotionRuleRow
        Insert: Omit<PromotionRuleRow, 'id'> & { id?: string }
        Update: Partial<PromotionRuleRow>
        Relationships: [
          {
            foreignKeyName: 'promotion_rules_promotion_id_fkey'
            columns: ['promotion_id']
            isOneToOne: false
            referencedRelation: 'promotions'
            referencedColumns: ['id']
          },
        ]
      }
      orders: {
        Row: OrderRow
        Insert: Omit<OrderRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<OrderRow>
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey'
            columns: ['id']
            isOneToOne: false
            referencedRelation: 'order_items'
            referencedColumns: ['order_id']
          },
        ]
      }
      order_items: {
        Row: OrderItemRow
        Insert: Omit<OrderItemRow, 'id'> & { id?: string }
        Update: Partial<OrderItemRow>
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      checkout_order_deduct_stock: {
        Args: {
          p_total_amount: number
          p_discount_amount: number
          p_final_amount: number
          p_lines: Record<string, unknown>[]
          p_promotion_snapshot?: unknown | null
        }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
