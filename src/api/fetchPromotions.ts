import { supabase } from '../supabase'
import type { Promotion } from '../types/pos'
import type { PromotionRow } from '../types/supabase'

function mapPromotionRow(row: PromotionRow): Promotion {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    discountPercent: row.discount_percent,
    active: row.active,
  }
}

/** Returns promotions where `active` is true, ordered by name. */
export async function fetchPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('id, code, name, discount_percent, active')
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapPromotionRow)
}
