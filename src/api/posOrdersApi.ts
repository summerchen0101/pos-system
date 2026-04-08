import { supabase } from '../supabase'
import type { BuyerAgeGroup, BuyerGender, BuyerMotivation } from '../types/order'

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
  buyer_gender: BuyerGender | null
  buyer_age_group: BuyerAgeGroup | null
  buyer_motivation: BuyerMotivation | null
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
  return (raw as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ''),
    created_at: String(r.created_at ?? ''),
    final_amount: Number(r.final_amount ?? 0),
    discount_amount: Number(r.discount_amount ?? 0),
    total_amount: Number(r.total_amount ?? 0),
    buyer_gender: (r.buyer_gender as BuyerGender | null) ?? null,
    buyer_age_group: (r.buyer_age_group as BuyerAgeGroup | null) ?? null,
    buyer_motivation: (r.buyer_motivation as BuyerMotivation | null) ?? null,
    items: (Array.isArray(r.items) ? r.items : []) as PosOrderLineJson[],
  }))
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
