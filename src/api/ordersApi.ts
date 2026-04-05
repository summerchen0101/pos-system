import { supabase } from '../supabase'
import type { Order } from '../types/order'
import type { OrderRow } from '../types/supabase'

function mapOrderRow(row: OrderRow): Order {
  return {
    id: row.id,
    createdAt: row.created_at,
    totalAmountCents: row.total_amount,
    discountAmountCents: row.discount_amount,
    finalAmountCents: row.final_amount,
  }
}

export type OrderInsert = {
  totalAmountCents: number
  discountAmountCents: number
  finalAmountCents: number
}

export type CheckoutLine = {
  productId: string
  quantity: number
  /** When set, `gift_inventory` is decremented instead of `products.stock`. */
  giftId?: string | null
}

/** List orders whose `created_at` falls in `[dayStart, dayEnd]` (inclusive), local day boundaries as ISO strings. */
export async function fetchOrdersForDateRange(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Order[]> {
  const startIso = rangeStart.toISOString()
  const endIso = rangeEnd.toISOString()

  const { data, error } = await supabase
    .from('orders')
    .select('id, created_at, total_amount, discount_amount, final_amount')
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapOrderRow)
}

/**
 * Insert order and deduct product stock atomically (DB function).
 * Throws if any line exceeds available stock.
 */
export async function checkoutOrder(input: OrderInsert, lines: CheckoutLine[]): Promise<void> {
  if (lines.length === 0) throw new Error('empty_cart')
  const p_lines = lines.map((l) => {
    const row: { product_id: string; quantity: number; gift_id?: string } = {
      product_id: l.productId,
      quantity: l.quantity,
    }
    if (l.giftId) row.gift_id = l.giftId
    return row
  })
  const { error } = await supabase.rpc('checkout_order_deduct_stock', {
    p_total_amount: input.totalAmountCents,
    p_discount_amount: input.discountAmountCents,
    p_final_amount: input.finalAmountCents,
    p_lines,
  })
  if (error) throw error
}
