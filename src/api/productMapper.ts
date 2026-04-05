import type { Product, ProductKind } from '../types/pos'
import { PRODUCT_KINDS } from '../types/pos'
import type { ProductRow } from '../types/supabase'

export type ProductBundleOptionNested = {
  component_product_id: string
  quantity: number
}

export type ProductRowWithCategory = ProductRow & {
  categories?: { name: string } | null
  product_bundle_options?: ProductBundleOptionNested[] | null
}

function parseProductKind(raw: string | undefined | null): ProductKind {
  if (raw && (PRODUCT_KINDS as readonly string[]).includes(raw)) return raw as ProductKind
  return 'STANDARD'
}

export function mapProductRow(row: ProductRowWithCategory): Product {
  const opts = row.product_bundle_options ?? []
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
    kind: parseProductKind(row.kind),
    bundleTotalQty: row.bundle_total_qty ?? null,
    bundleOptions: opts.map((o) => ({
      productId: o.component_product_id,
      quantity: Math.max(1, Math.trunc(Number(o.quantity) || 1)),
    })),
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
  kind,
  bundle_total_qty,
  categories ( name ),
  product_bundle_options ( component_product_id, quantity )
`
