import { supabase } from '../supabase'

export type PosOrderLineJson = {
  id: string
  product_id: string | null
  product_name: string
  size: string | null
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  is_gift: boolean
  is_manual_free: boolean
  gift_id: string | null
  source: string | null
}

export type PosOrderSummaryJson = {
  id: string
  created_at: string
  final_amount: number
  discount_amount: number
  total_amount: number
  items: PosOrderLineJson[]
}

export async function fetchPosOrdersForBoothDay(
  boothId: string,
  day: string | null,
): Promise<PosOrderSummaryJson[]> {
  const { data, error } = await supabase.rpc('pos_list_orders_for_booth_day', {
    p_booth_id: boothId,
    p_day: day,
  })
  if (error) throw error
  const raw = data as unknown
  if (raw == null) return []
  if (!Array.isArray(raw)) return []
  return raw as PosOrderSummaryJson[]
}

export async function deleteOrderRestoreInventoryPos(orderId: string, boothId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_order_restore_inventory', {
    p_order_id: orderId,
    p_booth_id: boothId,
  })
  if (error) throw error
}

/** Admin / manager: any order; STAFF must not call (RPC will reject). */
export async function deleteOrderRestoreInventoryAdmin(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_order_restore_inventory', {
    p_order_id: orderId,
    p_booth_id: null,
  })
  if (error) throw error
}
