import { supabase } from '../supabase'
import { mapPromotionFromRow } from './promotionMappers'
import { PROMOTION_LIST_SELECT } from './promotionSelect'
import type { Promotion } from '../types/pos'

/** Active promotions for the register (with product scope). */
export async function fetchPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select(PROMOTION_LIST_SELECT)
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapPromotionFromRow(row))
}
