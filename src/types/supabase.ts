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
  /** Display order within the same `category_id` (global across booths). */
  sort_order: number
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
  image_url: string | null
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

export type BoothRow = {
  id: string
  name: string
  location: string | null
  start_date: string | null
  end_date: string | null
  warehouse_id: string | null
  pin: string | null
}

export type BoothHiddenCategoryRow = {
  booth_id: string
  category_id: string
}

export type BoothHiddenProductRow = {
  booth_id: string
  product_id: string
}

export type WarehouseRow = {
  id: string
  name: string
  type: 'warehouse' | 'booth'
  booth_id: string | null
  note: string | null
  created_at: string
}

export type InventoryRow = {
  id: string
  warehouse_id: string
  product_id: string
  stock: number
}

export type InventoryLogRow = {
  id: string
  warehouse_id: string | null
  product_id: string | null
  type: 'in' | 'out' | 'transfer_in' | 'transfer_out' | 'adjust'
  quantity: number
  note: string | null
  related_order_id: string | null
  created_by: string | null
  created_at: string
}

export type StocktakeRow = {
  id: string
  warehouse_id: string
  status: 'draft' | 'completed'
  note: string | null
  created_by: string | null
  completed_at: string | null
  created_at: string
}

export type StocktakeItemRow = {
  id: string
  stocktake_id: string
  product_id: string
  system_stock: number
  actual_stock: number | null
  difference: number | null
  reason: string | null
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
  /** BUY_X_GET_Y: limit to one (X+Y) group; no stacked bundles. */
  bogo_single_deal_only: boolean
}

export type PromotionBoothRow = {
  promotion_id: string
  booth_id: string
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

export type PromotionQuantityTierRow = {
  id: string
  promotion_id: string
  min_qty: number
  discount_percent: number
  sort_order: number
}

export type OrderRow = {
  id: string
  created_at: string
  total_amount: number
  discount_amount: number
  final_amount: number
  promotion_snapshot: unknown | null
  booth_id: string
  /** Cashier (auth / public.users); null on legacy rows. */
  user_id: string | null
  /** Snapshot at checkout: scheduled staff display names. */
  scheduled_staff: string[] | null
  /** Snapshot at checkout: clocked-in staff display names. */
  clocked_in_staff: string[] | null
  buyer_gender: 'male' | 'female' | 'other' | null
  buyer_age_group: 'under_18' | '18_24' | '25_34' | '35_44' | '45_54' | '55_above' | null
  buyer_motivation: 'self_use' | 'gift' | 'trial' | 'repurchase' | 'other' | null
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

/** App profile (`public.users`), linked to `auth.users`. */
export type AppUserRow = {
  id: string
  name: string
  role: 'ADMIN' | 'MANAGER' | 'STAFF'
  username: string
  phone: string | null
}

export type UserBoothRow = {
  user_id: string
  booth_id: string
}

export type ShiftRow = {
  id: string
  user_id: string
  booth_id: string
  shift_date: string
  start_time: string
  end_time: string
  note: string | null
  created_at: string
}

export type ShiftSwapRequestRow = {
  id: string
  requester_id: string
  target_id: string
  requester_shift_id: string
  target_shift_id: string
  status: 'pending' | 'accepted' | 'approved' | 'rejected' | 'cancelled'
  created_at: string
}

export type ShiftClockLogRow = {
  id: string
  /** Null for tablet ad-hoc clock-in (臨時人員). */
  shift_id: string | null
  user_id: string
  booth_id: string | null
  work_date: string | null
  clock_in_at: string | null
  clock_out_at: string | null
}

export type Database = {
  public: {
    Tables: {
      users: {
        Row: AppUserRow
        Insert: Omit<AppUserRow, 'phone'> & { phone?: string | null }
        Update: Partial<Pick<AppUserRow, 'name' | 'role' | 'username' | 'phone'>>
        Relationships: []
      }
      user_booths: {
        Row: UserBoothRow
        Insert: UserBoothRow
        Update: Partial<UserBoothRow>
        Relationships: [
          {
            foreignKeyName: 'user_booths_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_booths_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'booths'
            referencedColumns: ['id']
          },
        ]
      }
      booths: {
        Row: BoothRow
        Insert: Omit<BoothRow, 'id' | 'pin'> & { id?: string; pin?: string | null }
        Update: Partial<BoothRow>
        Relationships: []
      }
      booth_hidden_categories: {
        Row: BoothHiddenCategoryRow
        Insert: BoothHiddenCategoryRow
        Update: Partial<BoothHiddenCategoryRow>
        Relationships: []
      }
      booth_hidden_products: {
        Row: BoothHiddenProductRow
        Insert: BoothHiddenProductRow
        Update: Partial<BoothHiddenProductRow>
        Relationships: []
      }
      warehouses: {
        Row: WarehouseRow
        Insert: Omit<WarehouseRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<WarehouseRow, 'id'>>
        Relationships: []
      }
      inventory: {
        Row: InventoryRow
        Insert: Omit<InventoryRow, 'id'> & { id?: string }
        Update: Partial<Omit<InventoryRow, 'id'>>
        Relationships: []
      }
      inventory_logs: {
        Row: InventoryLogRow
        Insert: Omit<InventoryLogRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<InventoryLogRow, 'id'>>
        Relationships: []
      }
      stocktakes: {
        Row: StocktakeRow
        Insert: Omit<StocktakeRow, 'id' | 'created_at' | 'completed_at'> & {
          id?: string
          created_at?: string
          completed_at?: string | null
        }
        Update: Partial<Omit<StocktakeRow, 'id'>>
        Relationships: []
      }
      stocktake_items: {
        Row: StocktakeItemRow
        Insert: Omit<StocktakeItemRow, 'id'> & { id?: string }
        Update: Partial<Omit<StocktakeItemRow, 'id'>>
        Relationships: []
      }
      categories: {
        Row: CategoryRow
        Insert: Omit<CategoryRow, 'id'> & { id?: string }
        Update: Partial<CategoryRow>
        Relationships: []
      }
      products: {
        Row: ProductRow
        Insert: Omit<ProductRow, 'id' | 'sort_order' | 'image_url'> & {
          id?: string
          sort_order?: number
          image_url?: string | null
        }
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
      promotion_booths: {
        Row: PromotionBoothRow
        Insert: PromotionBoothRow
        Update: Partial<PromotionBoothRow>
        Relationships: [
          {
            foreignKeyName: 'promotion_booths_promotion_id_fkey'
            columns: ['promotion_id']
            isOneToOne: false
            referencedRelation: 'promotions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'promotion_booths_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'booths'
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
      promotion_tiers: {
        Row: PromotionQuantityTierRow
        Insert: Omit<PromotionQuantityTierRow, 'id'> & { id?: string }
        Update: Partial<PromotionQuantityTierRow>
        Relationships: [
          {
            foreignKeyName: 'promotion_tiers_promotion_id_fkey'
            columns: ['promotion_id']
            isOneToOne: false
            referencedRelation: 'promotions'
            referencedColumns: ['id']
          },
        ]
      }
      orders: {
        Row: OrderRow
        Insert: Omit<OrderRow, 'id' | 'created_at' | 'user_id'> & {
          id?: string
          created_at?: string
          user_id?: string | null
        }
        Update: Partial<OrderRow>
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey'
            columns: ['id']
            isOneToOne: false
            referencedRelation: 'order_items'
            referencedColumns: ['order_id']
          },
          {
            foreignKeyName: 'orders_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'booths'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orders_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
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
      shifts: {
        Row: ShiftRow
        Insert: Omit<ShiftRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<ShiftRow, 'id'>>
        Relationships: [
          {
            foreignKeyName: 'shifts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'shifts_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'booths'
            referencedColumns: ['id']
          },
        ]
      }
      shift_swap_requests: {
        Row: ShiftSwapRequestRow
        Insert: Omit<ShiftSwapRequestRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Pick<ShiftSwapRequestRow, 'status'>>
        Relationships: []
      }
      shift_clock_logs: {
        Row: ShiftClockLogRow
        Insert: Omit<ShiftClockLogRow, 'id'> & { id?: string }
        Update: Partial<Omit<ShiftClockLogRow, 'id'>>
        Relationships: []
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
          p_booth_id?: string
          p_user_id?: string | null
          p_scheduled_staff?: string[]
          p_clocked_in_staff?: string[]
        }
        Returns: string
      }
      pos_update_order_buyer_profile: {
        Args: {
          p_order_id: string
          p_buyer_gender?: string | null
          p_buyer_age_group?: string | null
          p_buyer_motivation?: string | null
        }
        Returns: undefined
      }
      pos_list_scheduled_staff_names: {
        Args: { p_booth_id: string }
        Returns: string[]
      }
      pos_adhoc_clock_in: {
        Args: { p_booth_id: string }
        Returns: undefined
      }
      pos_tablet_clock_out: {
        Args: { p_booth_id: string }
        Returns: undefined
      }
      pos_list_active_staff_names: {
        Args: { p_booth_id: string }
        Returns: string[]
      }
      pos_inventory_stocks_for_booth: {
        Args: { p_booth_id: string }
        Returns: { product_id: string; stock: number }[]
      }
      inventory_apply_adjustment: {
        Args: {
          p_warehouse_id: string
          p_product_id: string
          p_delta: number
          p_log_type: string
          p_note?: string | null
        }
        Returns: number
      }
      inventory_transfer: {
        Args: {
          p_from_warehouse_id: string
          p_to_warehouse_id: string
          p_product_id: string
          p_quantity: number
          p_note?: string | null
        }
        Returns: undefined
      }
      create_stocktake: {
        Args: { p_warehouse_id: string; p_note?: string | null }
        Returns: string
      }
      complete_stocktake: {
        Args: { p_stocktake_id: string; p_items?: unknown }
        Returns: Record<string, unknown>
      }
      pos_list_orders_for_booth_day: {
        Args: { p_booth_id: string; p_day?: string | null }
        Returns: unknown
      }
      delete_order_restore_inventory: {
        Args: { p_order_id: string; p_booth_id?: string | null }
        Returns: undefined
      }
      clock_shift: {
        Args: { p_shift_id: string; p_action: string }
        Returns: undefined
      }
      create_shift_swap_request: {
        Args: { p_requester_shift_id: string; p_target_shift_id: string }
        Returns: string
      }
      shift_swap_target_respond: {
        Args: { p_request_id: string; p_accept: boolean }
        Returns: undefined
      }
      cancel_shift_swap_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      admin_approve_shift_swap: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      admin_reject_shift_swap: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      list_colleague_shifts_for_swap: {
        Args: { p_booth_id: string; p_from: string; p_to: string }
        Returns: ShiftRow[]
      }
      list_pos_public_shifts_for_day: {
        Args: { p_booth_id: string; p_date: string }
        Returns: unknown
      }
      get_auth_email_by_username: {
        Args: { p_username: string }
        Returns: string | null
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
