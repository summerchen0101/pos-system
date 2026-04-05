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

export async function insertOrder(input: OrderInsert): Promise<void> {
  const { error } = await supabase.from('orders').insert({
    total_amount: input.totalAmountCents,
    discount_amount: input.discountAmountCents,
    final_amount: input.finalAmountCents,
  })
  if (error) throw error
}
