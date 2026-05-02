import { supabase } from '../supabase'
import { fetchBoothVisibilityForPos } from './boothVisibilityAdmin'
import { mapProductRow, productSelectWithCategory, sortCatalogProducts, type ProductRowWithCategory } from './productMapper'
import type { Product } from '../types/pos'

/** Whether an out-of-stock row should remain in the POS catalog for this booth. */
function includeOutOfStockInCatalog(
  stock: number,
  categoryId: string | null | undefined,
  showOutOfStock: boolean,
  overrideCategoryIds: Set<string>,
): boolean {
  if (stock > 0) return true
  const inOverride =
    categoryId != null && categoryId !== '' && overrideCategoryIds.has(categoryId)
  if (showOutOfStock) return !inOverride
  return inOverride
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(productSelectWithCategory)
    .eq('is_active', true)
    .in('kind', ['STANDARD', 'CUSTOM_BUNDLE'])
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return sortCatalogProducts((data ?? []).map((row) => mapProductRow(row as ProductRowWithCategory)))
}

/** POS: merge per-booth warehouse stock (or legacy products.stock). */
export async function fetchProductsForPosBooth(boothId: string): Promise<Product[]> {
  const [{ data, error }, stockRes, vis] = await Promise.all([
    supabase
      .from('products')
      .select(productSelectWithCategory)
      .eq('is_active', true)
      .in('kind', ['STANDARD', 'CUSTOM_BUNDLE'])
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase.rpc('pos_inventory_stocks_for_booth', { p_booth_id: boothId }),
    fetchBoothVisibilityForPos(boothId),
  ])
  if (error) throw error
  if (stockRes.error) throw stockRes.error
  const stockMap = new Map<string, number>()
  const rows = stockRes.data as { product_id: string; stock: number }[] | null
  for (const r of rows ?? []) {
    stockMap.set(r.product_id, r.stock)
  }
  const { hiddenCategoryIds, hiddenProductIds, showOutOfStock, outOfStockCategoryOverrideIds } = vis
  const mapped = (data ?? []).map((row) => {
    const p = mapProductRow(row as ProductRowWithCategory)
    const st = stockMap.get(p.id)
    if (st !== undefined) return { ...p, stock: st }
    return p
  })
  return sortCatalogProducts(
    mapped.filter((p) => {
      if (p.categoryId && hiddenCategoryIds.has(p.categoryId)) return false
      if (hiddenProductIds.has(p.id)) return false
      if (
        !includeOutOfStockInCatalog(
          p.stock ?? 0,
          p.categoryId ?? null,
          showOutOfStock,
          outOfStockCategoryOverrideIds,
        )
      ) {
        return false
      }
      return true
    }),
  )
}
