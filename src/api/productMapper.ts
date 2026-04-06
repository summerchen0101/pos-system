import type { Product, ProductBundleGroup, ProductKind } from '../types/pos'

/** POS / admin: category order first, then product order within category. */
export function sortCatalogProducts(products: readonly Product[]): Product[] {
  return [...products].sort((a, b) => {
    if (a.categorySortOrder !== b.categorySortOrder) return a.categorySortOrder - b.categorySortOrder
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name, 'zh-Hant')
  })
}
import { PRODUCT_KINDS } from '../types/pos'
import type { ProductRow } from '../types/supabase'

export type BundleGroupItemNested = {
  product_id: string
}

export type BundleGroupNested = {
  id: string
  name: string
  required_qty: number
  sort_order: number
  bundle_group_items?: BundleGroupItemNested[] | null
}

export type ProductRowWithCategory = ProductRow & {
  categories?: { name: string; sort_order: number } | null
  bundle_groups?: BundleGroupNested[] | null
}

function parseProductKind(raw: string | undefined | null): ProductKind {
  if (raw && (PRODUCT_KINDS as readonly string[]).includes(raw)) return raw as ProductKind
  return 'STANDARD'
}

function mapBundleGroups(raw: BundleGroupNested[] | null | undefined): ProductBundleGroup[] {
  const list = raw ?? []
  const sorted = [...list].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      String(a.id).localeCompare(String(b.id)),
  )
  return sorted.map((g) => {
    const items = g.bundle_group_items ?? []
    const productIds = [...items]
      .map((x) => x.product_id)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
    return {
      id: g.id,
      name: (g.name ?? '').trim() || '選配',
      requiredQty: Math.max(1, Math.trunc(Number(g.required_qty) || 1)),
      sortOrder: Math.trunc(Number(g.sort_order) || 0),
      productIds,
    }
  })
}

export function mapProductRow(row: ProductRowWithCategory): Product {
  const catSo = row.categories?.sort_order
  return {
    id: row.id,
    sortOrder: Math.trunc(Number(row.sort_order) || 0),
    categorySortOrder:
      catSo !== undefined && catSo !== null ? Math.trunc(Number(catSo) || 0) : 999999,
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
    bundleGroups: mapBundleGroups(row.bundle_groups ?? []),
  }
}

export const productSelectWithCategory = `
  id,
  category_id,
  sort_order,
  name,
  name_en,
  description,
  size,
  sku,
  price,
  stock,
  is_active,
  kind,
  categories ( name, sort_order ),
  bundle_groups!bundle_groups_bundle_product_id_fkey (
    id,
    name,
    required_qty,
    sort_order,
    bundle_group_items!bundle_group_items_group_id_fkey ( product_id )
  )
`
