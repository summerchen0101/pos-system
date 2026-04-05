import { supabase } from '../supabase'
import { mapPromotionFromRow } from './promotionMappers'
import type { Promotion } from '../types/pos'

const promotionSelect = `
  id,
  code,
  name,
  kind,
  buy_qty,
  free_qty,
  discount_percent,
  active,
  promotion_products ( product_id )
`

/** Active promotions for the register (with product scope). */
export async function fetchPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select(promotionSelect)
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapPromotionFromRow(row))
}
