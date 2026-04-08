import { supabase } from '../supabase'
import type {
  BuyerAgeGroup,
  BuyerGender,
  BuyerMotivation,
  OrderAppliedPromotion,
  Order,
  OrderDetail,
  OrderGiftItem,
  OrderItem,
  OrderListEntry,
  OrderPromotionSnapshot,
} from '../types/order'
import type {
  OrderGiftItemRow,
  OrderItemRow,
  OrderPromotionRow,
  OrderRow,
} from '../types/supabase'

type BoothNameNested = { name: string } | { name: string }[] | null | undefined
type PromotionNested =
  | {
      kind?: string | null
      buy_qty?: number | null
      free_qty?: number | null
      threshold_amount?: number | null
      fixed_discount_cents?: number | null
      discount_percent?: number | null
      apply_mode?: string | null
    }
  | {
      kind?: string | null
      buy_qty?: number | null
      free_qty?: number | null
      threshold_amount?: number | null
      fixed_discount_cents?: number | null
      discount_percent?: number | null
      apply_mode?: string | null
    }[]
  | null
  | undefined

function unwrapBoothName(booths: BoothNameNested): string | null {
  if (booths == null) return null
  const b = Array.isArray(booths) ? booths[0] : booths
  return b?.name ?? null
}

function normalizeNameArray(raw: string[] | null | undefined): string[] {
  if (raw == null || !Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string')
}

function unwrapPromotionMeta(raw: PromotionNested) {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

function mapOrderRow(row: OrderRow & { booths?: BoothNameNested }): Order {
  return {
    id: row.id,
    createdAt: row.created_at,
    totalAmountCents: row.total_amount,
    discountAmountCents: row.discount_amount,
    finalAmountCents: row.final_amount,
    boothId: row.booth_id,
    boothName: unwrapBoothName(row.booths),
    scheduledStaffNames: normalizeNameArray(row.scheduled_staff),
    clockedInStaffNames: normalizeNameArray(row.clocked_in_staff),
    buyerGender: (row.buyer_gender as BuyerGender | null) ?? null,
    buyerAgeGroup: (row.buyer_age_group as BuyerAgeGroup | null) ?? null,
    buyerMotivation: (row.buyer_motivation as BuyerMotivation | null) ?? null,
  }
}

function mapOrderItemRow(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    size: row.size,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    lineTotalCents: row.line_total_cents,
    isGift: row.is_gift,
    isManualFree: row.is_manual_free,
    giftId: row.gift_id,
    source: row.source ?? null,
  }
}

export function parsePromotionSnapshot(raw: unknown): OrderPromotionSnapshot | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  return {
    autoPromotionId: typeof o.autoPromotionId === 'string' ? o.autoPromotionId : null,
    autoPromotionName: typeof o.autoPromotionName === 'string' ? o.autoPromotionName : null,
    manualPromotionDetails: Array.isArray(o.manualPromotionDetails)
      ? o.manualPromotionDetails
          .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
          .map((x) => ({
            promotionId: typeof x.promotionId === 'string' ? x.promotionId : undefined,
            name: typeof x.name === 'string' ? x.name : '—',
            discountCents:
              typeof x.discountCents === 'number' && Number.isFinite(x.discountCents)
                ? x.discountCents
                : 0,
          }))
      : [],
    thresholdGiftSummaries: Array.isArray(o.thresholdGiftSummaries)
      ? o.thresholdGiftSummaries.filter((x): x is string => typeof x === 'string')
      : [],
    promotions: Array.isArray(o.promotions)
      ? o.promotions
          .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
          .map((x) => ({
            type: typeof x.type === 'string' ? x.type : 'UNKNOWN',
            promotionId: typeof x.promotionId === 'string' ? x.promotionId : undefined,
            name: typeof x.name === 'string' ? x.name : '—',
            description: typeof x.description === 'string' ? x.description : '',
            selectedItemsSummary:
              typeof x.selectedItemsSummary === 'string' ? x.selectedItemsSummary : '',
          }))
      : [],
    appliedDiscounts: Array.isArray(o.appliedDiscounts)
      ? o.appliedDiscounts
          .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
          .map((x) => ({
            promotionId: typeof x.promotionId === 'string' ? x.promotionId : '',
            name: typeof x.name === 'string' ? x.name : '—',
            discountCents:
              typeof x.discountCents === 'number' && Number.isFinite(x.discountCents)
                ? x.discountCents
                : 0,
            matchedTier:
              x.matchedTier && typeof x.matchedTier === 'object'
                ? (x.matchedTier as {
                    buy_quantity?: number
                    get_quantity?: number
                    nth?: number
                    discount_type?: 'percent' | 'fixed'
                    discount_value?: number
                  })
                : null,
          }))
      : [],
  }
}

function buildItemsPreview(
  items: Pick<OrderItemRow, 'product_name' | 'quantity' | 'sort_order'>[],
  maxFirst = 2,
): string {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)
  if (sorted.length === 0) return '—'
  const parts = sorted.slice(0, maxFirst).map((r) => `${r.product_name}×${r.quantity}`)
  const suffix = sorted.length > maxFirst ? '…' : ''
  return `${parts.join('、')}${suffix}`
}

export type OrderInsert = {
  totalAmountCents: number
  discountAmountCents: number
  finalAmountCents: number
  boothId: string
  /** POS: optional cashier id stored on row; not shown in admin (staff snapshots used). */
  cashierUserId?: string | null
  /** Snapshot at checkout (display names). */
  scheduledStaff: string[]
  clockedInStaff: string[]
}

export type BuyerProfilePatch = {
  buyerGender?: BuyerGender | null
  buyerAgeGroup?: BuyerAgeGroup | null
  buyerMotivation?: BuyerMotivation | null
}

/** Payload for `checkout_order_deduct_stock` line objects (DB snake_case). */
export type CheckoutLinePayload = {
  /** Omit or null when `gift_id` is set (threshold gift). */
  productId: string | null
  quantity: number
  unitPriceCents: number
  productName: string
  size: string | null
  isGift: boolean
  isManualFree: boolean
  giftId?: string | null
  source?: string | null
}

function lineToRpcJson(l: CheckoutLinePayload): Record<string, unknown> {
  const row: Record<string, unknown> = {
    quantity: l.quantity,
    unit_price_cents: l.unitPriceCents,
    product_name: l.productName,
    size: l.size ?? '',
    is_gift: l.isGift,
    is_manual_free: l.isManualFree,
  }
  if (l.productId) row.product_id = l.productId
  if (l.giftId) row.gift_id = l.giftId
  if (l.source) row.source = l.source
  return row
}

export type OrdersDateFilter = {
  /** When set, only orders for this booth. Omit = all booths. */
  boothId?: string | null
}

/** List orders whose `created_at` falls in `[rangeStart, rangeEnd]` (inclusive). */
export async function fetchOrdersForDateRange(
  rangeStart: Date,
  rangeEnd: Date,
  filters?: OrdersDateFilter,
): Promise<OrderListEntry[]> {
  const startIso = rangeStart.toISOString()
  const endIso = rangeEnd.toISOString()

  let q = supabase
    .from('orders')
    .select(
      `
      id,
      created_at,
      total_amount,
      discount_amount,
      final_amount,
      booth_id,
      user_id,
      buyer_gender,
      buyer_age_group,
      buyer_motivation,
      scheduled_staff,
      clocked_in_staff,
      booths ( name ),
      order_items ( product_name, quantity, sort_order ),
      order_promotions (
        id,
        promotion_id,
        promotion_name,
        promotion_type,
        discount_amount,
        matched_tier,
        promotions (
          kind,
          buy_qty,
          free_qty,
          threshold_amount,
          fixed_discount_cents,
          discount_percent,
          apply_mode
        )
      ),
      order_gift_items ( id, gift_id, gift_name, quantity )
    `,
    )
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('created_at', { ascending: false })
    .order('sort_order', { referencedTable: 'order_items', ascending: true })

  if (filters?.boothId) {
    q = q.eq('booth_id', filters.boothId)
  }

  const { data, error } = await q

  if (error) throw error

  type ListRow = {
    id: string
    created_at: string
    total_amount: number
    discount_amount: number
    final_amount: number
    booth_id: string
    user_id: string | null
    buyer_gender: BuyerGender | null
    buyer_age_group: BuyerAgeGroup | null
    buyer_motivation: BuyerMotivation | null
    scheduled_staff: string[] | null
    clocked_in_staff: string[] | null
    booths: BoothNameNested
    order_items: Pick<OrderItemRow, 'product_name' | 'quantity' | 'sort_order'>[] | null
    order_promotions:
      | (Pick<
          OrderPromotionRow,
          'id' | 'promotion_id' | 'promotion_name' | 'promotion_type' | 'discount_amount' | 'matched_tier'
        > & {
          promotions?: PromotionNested
        })[]
      | null
    order_gift_items: Pick<OrderGiftItemRow, 'id' | 'gift_id' | 'gift_name' | 'quantity'>[] | null
  }

  return ((data as unknown as ListRow[] | null) ?? []).map((row) => {
    const base = mapOrderRow({
      id: row.id,
      created_at: row.created_at,
      total_amount: row.total_amount,
      discount_amount: row.discount_amount,
      final_amount: row.final_amount,
      promotion_snapshot: null,
      booth_id: row.booth_id,
      user_id: row.user_id,
      buyer_gender: row.buyer_gender,
      buyer_age_group: row.buyer_age_group,
      buyer_motivation: row.buyer_motivation,
      scheduled_staff: row.scheduled_staff,
      clocked_in_staff: row.clocked_in_staff,
      booths: row.booths,
    })
    const itemsPreview = buildItemsPreview(row.order_items ?? [])
    return { ...base, itemsPreview }
  })
}

export async function fetchOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      `
      id,
      created_at,
      total_amount,
      discount_amount,
      final_amount,
      promotion_snapshot,
      booth_id,
      user_id,
      buyer_gender,
      buyer_age_group,
      buyer_motivation,
      scheduled_staff,
      clocked_in_staff,
      booths ( name ),
      order_items (
        id,
        order_id,
        product_id,
        product_name,
        size,
        quantity,
        unit_price_cents,
        line_total_cents,
        is_gift,
        is_manual_free,
        gift_id,
        sort_order,
        source
      ),
      order_promotions (
        id,
        promotion_id,
        promotion_name,
        promotion_type,
        discount_amount,
        matched_tier,
        promotions (
          kind,
          buy_qty,
          free_qty,
          threshold_amount,
          fixed_discount_cents,
          discount_percent,
          apply_mode
        )
      ),
      order_gift_items ( id, gift_id, gift_name, quantity )
    `,
    )
    .eq('id', orderId)
    .order('sort_order', { referencedTable: 'order_items', ascending: true })
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  type DetailRow = OrderRow & {
    booths?: BoothNameNested
    order_items: OrderItemRow[] | null
    order_promotions: (OrderPromotionRow & { promotions?: PromotionNested })[] | null
    order_gift_items: OrderGiftItemRow[] | null
  }
  const row = data as unknown as DetailRow
  const items = (row.order_items ?? []).map(mapOrderItemRow)
  const appliedPromotions: OrderAppliedPromotion[] = (row.order_promotions ?? []).map((x) => ({
    id: x.id,
    promotionId: x.promotion_id,
    promotionName: x.promotion_name,
    promotionType: x.promotion_type,
    discountAmount: x.discount_amount,
    matchedTier:
      x.matched_tier && typeof x.matched_tier === 'object'
        ? (x.matched_tier as {
            buy_quantity?: number
            get_quantity?: number
            nth?: number
            discount_type?: 'percent' | 'fixed'
            discount_value?: number
          })
        : null,
    promotionMeta: unwrapPromotionMeta(x.promotions),
  }))
  const giftItems: OrderGiftItem[] = (row.order_gift_items ?? []).map((x) => ({
    id: x.id,
    giftId: x.gift_id,
    giftName: x.gift_name,
    quantity: x.quantity,
  }))
  return {
    ...mapOrderRow(row),
    promotionSnapshot: parsePromotionSnapshot(row.promotion_snapshot),
    items,
    appliedPromotions,
    giftItems,
  }
}

/**
 * Insert order, line snapshots, and deduct stock atomically (DB function).
 * Throws if any line exceeds available stock.
 */
export async function checkoutOrder(
  input: OrderInsert,
  lines: CheckoutLinePayload[],
  promotionSnapshot: OrderPromotionSnapshot | null,
): Promise<string> {
  if (lines.length === 0) throw new Error('empty_cart')
  const p_lines = lines.map(lineToRpcJson)
  const { data, error } = await supabase.rpc('checkout_order_deduct_stock', {
    p_total_amount: input.totalAmountCents,
    p_discount_amount: input.discountAmountCents,
    p_final_amount: input.finalAmountCents,
    p_lines,
    p_promotion_snapshot: promotionSnapshot,
    p_booth_id: input.boothId,
    p_user_id: input.cashierUserId ?? null,
    p_scheduled_staff: input.scheduledStaff,
    p_clocked_in_staff: input.clockedInStaff,
  })
  if (error) throw error
  return String(data)
}

export async function updateOrderBuyerProfile(
  orderId: string,
  patch: BuyerProfilePatch,
): Promise<void> {
  const { error } = await supabase.rpc('pos_update_order_buyer_profile', {
    p_order_id: orderId,
    p_buyer_gender: patch.buyerGender ?? null,
    p_buyer_age_group: patch.buyerAgeGroup ?? null,
    p_buyer_motivation: patch.buyerMotivation ?? null,
  })
  if (error) throw error
}
