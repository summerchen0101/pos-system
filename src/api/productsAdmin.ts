import { supabase } from '../supabase'
import { mapProductRow, productSelectWithCategory, type ProductRowWithCategory } from './productMapper'
import type { Product, ProductBundleOption, ProductKind } from '../types/pos'

export type ProductInput = {
  categoryId: string | null
  name: string
  nameEn: string | null
  description: string | null
  size: string | null
  sku: string
  priceCents: number
  stock: number
  isActive: boolean
  kind: ProductKind
  bundleTotalQty: number | null
  bundleOptions: ProductBundleOption[]
}

function rowPayload(input: ProductInput) {
  const isBundle = input.kind === 'CUSTOM_BUNDLE'
  return {
    category_id: input.categoryId,
    name: input.name.trim(),
    name_en: input.nameEn?.trim() ? input.nameEn.trim() : null,
    description: input.description?.trim() ? input.description.trim() : null,
    size: input.size?.trim() ? input.size.trim() : null,
    sku: input.sku.trim(),
    price: input.priceCents,
    stock: input.stock,
    is_active: input.isActive,
    kind: input.kind,
    bundle_total_qty: isBundle ? input.bundleTotalQty : null,
  }
}

async function replaceProductBundleOptions(
  bundleProductId: string,
  rows: ProductBundleOption[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from('product_bundle_options')
    .delete()
    .eq('bundle_product_id', bundleProductId)
  if (delErr) throw delErr
  if (rows.length === 0) return
  const { error } = await supabase.from('product_bundle_options').insert(
    rows.map((r) => ({
      bundle_product_id: bundleProductId,
      component_product_id: r.productId,
      quantity: Math.max(1, Math.trunc(r.quantity)),
    })),
  )
  if (error) throw error
}

/** Strip LIKE wildcards and commas (PostgREST `or()` is comma-separated). */
function sanitizeLikeInput(raw: string): string {
  return raw.replace(/[%_\\,]/g, '').trim()
}

export type ProductListFilters = {
  name?: string
  sku?: string
  size?: string
  categoryId?: string
}

export async function listProductsAdmin(filters?: ProductListFilters): Promise<Product[]> {
  let q = supabase.from('products').select(productSelectWithCategory)

  const f = filters ?? {}
  const nameQ = f.name ? sanitizeLikeInput(f.name) : ''
  if (nameQ) {
    const pat = `%${nameQ}%`
    q = q.or(`name.ilike.${pat},name_en.ilike.${pat}`)
  }

  const skuQ = f.sku ? sanitizeLikeInput(f.sku) : ''
  if (skuQ) {
    q = q.ilike('sku', `%${skuQ}%`)
  }

  if (f.size?.trim()) {
    q = q.eq('size', f.size.trim())
  }

  if (f.categoryId) {
    q = q.eq('category_id', f.categoryId)
  }

  const { data, error } = await q.order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapProductRow(row as ProductRowWithCategory))
}

/** Distinct non-empty sizes for admin filter / bulk autocomplete options. */
export async function listDistinctProductSizes(): Promise<string[]> {
  const { data, error } = await supabase.from('products').select('size')
  if (error) throw error
  const set = new Set<string>()
  for (const row of data ?? []) {
    const s = (row as { size: string | null }).size?.trim()
    if (s) set.add(s)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert(rowPayload(input))
    .select('id')
    .single()

  if (error) throw error
  if (!data?.id) throw new Error('No id returned')

  if (input.kind === 'CUSTOM_BUNDLE') {
    await replaceProductBundleOptions(data.id, input.bundleOptions)
  }

  const { data: full, error: fetchErr } = await supabase
    .from('products')
    .select(productSelectWithCategory)
    .eq('id', data.id)
    .single()

  if (fetchErr) throw fetchErr
  return mapProductRow(full as ProductRowWithCategory)
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  const { error } = await supabase.from('products').update(rowPayload(input)).eq('id', id)
  if (error) throw error

  if (input.kind === 'CUSTOM_BUNDLE') {
    await replaceProductBundleOptions(id, input.bundleOptions)
  } else {
    await replaceProductBundleOptions(id, [])
  }

  const { data: full, error: fetchErr } = await supabase
    .from('products')
    .select(productSelectWithCategory)
    .eq('id', id)
    .single()

  if (fetchErr) throw fetchErr
  return mapProductRow(full as ProductRowWithCategory)
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
}

/** Only include fields the admin chose to change; omitted fields keep each product’s current value. */
export type ProductBulkPatch = {
  categoryId?: string | null
  size?: string | null
  priceCents?: number
  /** Absolute stock (>= 0). Mutually exclusive with `stockAdjust` in normal use. */
  stockSet?: number
  /** Added to current stock; result clamped to >= 0. */
  stockAdjust?: number
}

function mergedProductInput(p: Product, patch: ProductBulkPatch): ProductInput {
  let stock = p.stock
  if (patch.stockSet !== undefined) {
    stock = Math.max(0, Math.trunc(patch.stockSet))
  } else if (patch.stockAdjust !== undefined) {
    stock = Math.max(0, p.stock + Math.trunc(patch.stockAdjust))
  }
  return {
    categoryId: patch.categoryId !== undefined ? patch.categoryId : p.categoryId,
    name: p.name,
    nameEn: p.nameEn,
    description: p.description,
    size: patch.size !== undefined ? patch.size : p.size,
    sku: p.sku,
    priceCents: patch.priceCents !== undefined ? patch.priceCents : p.price,
    stock,
    isActive: p.isActive,
    kind: p.kind,
    bundleTotalQty: p.bundleTotalQty,
    bundleOptions: [...p.bundleOptions],
  }
}

export async function bulkPatchProducts(
  productIds: string[],
  currentProducts: Product[],
  patch: ProductBulkPatch,
): Promise<void> {
  const byId = new Map(currentProducts.map((x) => [x.id, x]))
  for (const id of productIds) {
    const p = byId.get(id)
    if (!p) continue
    await updateProduct(id, mergedProductInput(p, patch))
  }
}
