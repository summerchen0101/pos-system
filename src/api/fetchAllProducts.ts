import { supabase } from '../supabase'
import { mapProductRow, productSelectWithCategory, sortCatalogProducts, type ProductRowWithCategory } from './productMapper'
import type { Product, ProductKind } from '../types/pos'

export type FetchAllProductsOptions = {
  /** Defaults to `['STANDARD']` only. */
  kinds?: readonly ProductKind[]
}

/** All products (including inactive) for admin pickers. */
export async function fetchAllProducts(options?: FetchAllProductsOptions): Promise<Product[]> {
  const kinds: ProductKind[] =
    options?.kinds?.length ? [...options.kinds] : ['STANDARD']
  const { data, error } = await supabase
    .from('products')
    .select(productSelectWithCategory)
    .in('kind', kinds)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return sortCatalogProducts((data ?? []).map((row) => mapProductRow(row as ProductRowWithCategory)))
}
