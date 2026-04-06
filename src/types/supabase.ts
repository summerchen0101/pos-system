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

export type BoothRow = {
  id: string
  name: string
  location: string | null
  start_date: string | null
  end_date: string | null
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
        Insert: Omit<BoothRow, 'id'> & { id?: string }
        Update: Partial<BoothRow>
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
      get_auth_email_by_username: {
        Args: { p_username: string }
        Returns: string | null
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
