import { supabase } from '../supabase'
import type {
  Order,
  OrderDetail,
  OrderItem,
  OrderListEntry,
  OrderPromotionSnapshot,
} from '../types/order'
import type { OrderItemRow, OrderRow } from '../types/supabase'

function mapOrderRow(row: OrderRow): Order {
  return {
    id: row.id,
    createdAt: row.created_at,
    totalAmountCents: row.total_amount,
    discountAmountCents: row.discount_amount,
    finalAmountCents: row.final_amount,
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

/** List orders whose `created_at` falls in `[dayStart, dayEnd]` (inclusive). */
export async function fetchOrdersForDateRange(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<OrderListEntry[]> {
  const startIso = rangeStart.toISOString()
  const endIso = rangeEnd.toISOString()

  const { data, error } = await supabase
    .from('orders')
    .select(
      `
      id,
      created_at,
      total_amount,
      discount_amount,
      final_amount,
      order_items ( product_name, quantity, sort_order )
    `,
    )
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('created_at', { ascending: false })
    .order('sort_order', { referencedTable: 'order_items', ascending: true })

  if (error) throw error

  type ListRow = {
    id: string
    created_at: string
    total_amount: number
    discount_amount: number
    final_amount: number
    order_items: Pick<OrderItemRow, 'product_name' | 'quantity' | 'sort_order'>[] | null
  }

  return ((data as unknown as ListRow[] | null) ?? []).map((row) => {
    const base = mapOrderRow({
      id: row.id,
      created_at: row.created_at,
      total_amount: row.total_amount,
      discount_amount: row.discount_amount,
      final_amount: row.final_amount,
      promotion_snapshot: null,
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
      )
    `,
    )
    .eq('id', orderId)
    .order('sort_order', { referencedTable: 'order_items', ascending: true })
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  type DetailRow = OrderRow & { order_items: OrderItemRow[] | null }
  const row = data as unknown as DetailRow
  const items = (row.order_items ?? []).map(mapOrderItemRow)
  return {
    ...mapOrderRow(row),
    promotionSnapshot: parsePromotionSnapshot(row.promotion_snapshot),
    items,
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
): Promise<void> {
  if (lines.length === 0) throw new Error('empty_cart')
  const p_lines = lines.map(lineToRpcJson)
  const { error } = await supabase.rpc('checkout_order_deduct_stock', {
    p_total_amount: input.totalAmountCents,
    p_discount_amount: input.discountAmountCents,
    p_final_amount: input.finalAmountCents,
    p_lines,
    p_promotion_snapshot: promotionSnapshot,
  })
  if (error) throw error
}
