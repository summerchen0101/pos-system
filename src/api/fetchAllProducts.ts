import { supabase } from '../supabase'
import { mapProductRow, productSelectWithCategory, type ProductRowWithCategory } from './productMapper'
import type { Product } from '../types/pos'

/** All products (including inactive) for admin pickers. */
export async function fetchAllProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(productSelectWithCategory)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapProductRow(row as ProductRowWithCategory))
}
