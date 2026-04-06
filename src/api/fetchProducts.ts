import { supabase } from '../supabase'
import { mapProductRow, productSelectWithCategory, type ProductRowWithCategory } from './productMapper'
import type { Product } from '../types/pos'

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(productSelectWithCategory)
    .eq('is_active', true)
    .in('kind', ['STANDARD', 'CUSTOM_BUNDLE'])
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapProductRow(row as ProductRowWithCategory))
}

/** POS: merge per-booth warehouse stock (or legacy products.stock). */
export async function fetchProductsForPosBooth(boothId: string): Promise<Product[]> {
  const [{ data, error }, stockRes] = await Promise.all([
    supabase
      .from('products')
      .select(productSelectWithCategory)
      .eq('is_active', true)
      .in('kind', ['STANDARD', 'CUSTOM_BUNDLE'])
      .order('name', { ascending: true }),
    supabase.rpc('pos_inventory_stocks_for_booth', { p_booth_id: boothId }),
  ])
  if (error) throw error
  if (stockRes.error) throw stockRes.error
  const stockMap = new Map<string, number>()
  const rows = stockRes.data as { product_id: string; stock: number }[] | null
  for (const r of rows ?? []) {
    stockMap.set(r.product_id, r.stock)
  }
  return (data ?? []).map((row) => {
    const p = mapProductRow(row as ProductRowWithCategory)
    const st = stockMap.get(p.id)
    if (st !== undefined) return { ...p, stock: st }
    return p
  })
}
