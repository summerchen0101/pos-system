import { supabase } from '../supabase'
import {
  enrichPromotionWithGroupFallback,
  loadPromotionGroupsMap,
} from './promotionGroupEnrichment'
import { mapPromotionFromRow, type PromotionRowWithProducts } from './promotionMappers'
import { PROMOTION_LIST_SELECT } from './promotionSelect'
import type { Promotion } from '../types/pos'

/** Active promotions for the register (with product scope), scoped to one booth via `promotion_booths`. */
export async function fetchPromotions(boothId: string): Promise<Promotion[]> {
  const [{ data, error }, groupsById] = await Promise.all([
    supabase
      .from('promotions')
      .select(PROMOTION_LIST_SELECT)
      .eq('active', true)
      .eq('promotion_booths.booth_id', boothId)
      .order('name', { ascending: true }),
    loadPromotionGroupsMap(),
  ])

  if (error) throw error
  return (data ?? []).map((row) =>
    enrichPromotionWithGroupFallback(
      mapPromotionFromRow(row as PromotionRowWithProducts),
      groupsById,
    ),
  )
}
