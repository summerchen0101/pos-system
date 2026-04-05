import { supabase } from '../supabase'
import type { Category } from '../types/pos'
import type { CategoryRow } from '../types/supabase'

export type CategoryInput = {
  name: string
  sortOrder: number
  isActive: boolean
}

function mapRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }
}

function rowPayload(input: CategoryInput) {
  return {
    name: input.name.trim(),
    sort_order: input.sortOrder,
    is_active: input.isActive,
  }
}

/** All categories for admin (sorted by sort_order, then name). */
export async function listCategoriesAdmin(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, sort_order, is_active')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as CategoryRow))
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert(rowPayload(input))
    .select('id, name, sort_order, is_active')
    .single()

  if (error) throw error
  return mapRow(data as CategoryRow)
}

export async function updateCategory(id: string, input: CategoryInput): Promise<Category> {
  const { error } = await supabase.from('categories').update(rowPayload(input)).eq('id', id)
  if (error) throw error

  const { data, error: fetchErr } = await supabase
    .from('categories')
    .select('id, name, sort_order, is_active')
    .eq('id', id)
    .single()

  if (fetchErr) throw fetchErr
  return mapRow(data as CategoryRow)
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}
