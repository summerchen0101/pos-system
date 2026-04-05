import type { Product } from '../types/pos'
import type { ProductRow } from '../types/supabase'

export type ProductRowWithCategory = ProductRow & {
  categories?: { name: string } | null
}

export function mapProductRow(row: ProductRowWithCategory): Product {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    description: row.description,
    size: row.size,
    sku: row.sku,
    price: row.price,
    stock: row.stock,
    isActive: row.is_active,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
  }
}

export const productSelectWithCategory = `
  id,
  category_id,
  name,
  name_en,
  description,
  size,
  sku,
  price,
  stock,
  is_active,
  categories ( name )
`
