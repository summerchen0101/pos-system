import { supabase } from '../supabase'
import { mapPromotionFromRow, type PromotionRowWithProducts } from './promotionMappers'
import { PROMOTION_LIST_SELECT } from './promotionSelect'
import type { Promotion } from '../types/pos'

/** Active promotions for the register (with product scope), scoped to one booth. */
export async function fetchPromotions(boothId: string): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select(PROMOTION_LIST_SELECT)
    .eq('active', true)
    .eq('booth_id', boothId)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapPromotionFromRow(row as PromotionRowWithProducts))
}
