import { supabase } from '../supabase'
import type { Category } from '../types/pos'
import type { CategoryRow } from '../types/supabase'

function mapCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }
}

/** Active categories for POS / product form dropdowns (ordered by sort_order). */
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapCategoryRow)
}
