import { supabase } from '../supabase'
import type { Product } from '../types/pos'
import type { ProductRow } from '../types/supabase'

function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    description: row.description,
    size: row.size,
    sku: row.sku,
    price: row.price,
    isActive: row.is_active,
  }
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, name_en, description, size, sku, price, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapProductRow)
}
