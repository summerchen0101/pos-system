import { supabase } from '../supabase'
import { mapProductRow, productSelectWithCategory, sortCatalogProducts, type ProductRowWithCategory } from './productMapper'
import type { Product, ProductBundleGroup, ProductKind } from '../types/pos'

export type BundleGroupInput = {
  name: string
  requiredQty: number
  sortOrder: number
  productIds: string[]
}

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
  bundleGroups: BundleGroupInput[]
}

async function nextProductSortOrder(categoryId: string | null): Promise<number> {
  let q = supabase.from('products').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  if (categoryId) q = q.eq('category_id', categoryId)
  else q = q.is('category_id', null)
  const { data } = await q.maybeSingle()
  return Math.trunc(Number((data as { sort_order?: number } | null)?.sort_order) || 0) + 1
}

function rowPayload(input: ProductInput) {
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
  }
}

/** Batch-assign `sort_order` from array index (`1..n`) for the given product ids. */
export async function updateProductsOrder(ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].filter(Boolean)
  for (let i = 0; i < unique.length; i++) {
    const { error } = await supabase.from('products').update({ sort_order: i + 1 }).eq('id', unique[i])
    if (error) throw error
  }
}

async function clearBundleGroups(bundleProductId: string): Promise<void> {
  const { error } = await supabase.from('bundle_groups').delete().eq('bundle_product_id', bundleProductId)
  if (error) throw error
}

async function replaceBundleGroups(bundleProductId: string, groups: BundleGroupInput[]): Promise<void> {
  await clearBundleGroups(bundleProductId)
  const ordered = [...groups].sort((a, b) => a.sortOrder - b.sortOrder)
  for (const g of ordered) {
    const name = g.name.trim() || '選配'
    const requiredQty = Math.max(1, Math.trunc(g.requiredQty))
    const sortOrder = Math.trunc(g.sortOrder)
    const { data, error } = await supabase
      .from('bundle_groups')
      .insert({
        bundle_product_id: bundleProductId,
        name,
        required_qty: requiredQty,
        sort_order: sortOrder,
      })
      .select('id')
      .single()
    if (error) throw error
    const gid = data?.id
    if (!gid) throw new Error('bundle_groups insert returned no id')
    const ids = [...new Set(g.productIds.filter((id) => id && id !== bundleProductId))]
    if (ids.length > 0) {
      const { error: insErr } = await supabase.from('bundle_group_items').insert(
        ids.map((product_id) => ({ group_id: gid, product_id })),
      )
      if (insErr) throw insErr
    }
  }
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

  const { data, error } = await q
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  const list = (data ?? []).map((row) => mapProductRow(row as ProductRowWithCategory))
  return sortCatalogProducts(list)
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
  const sortOrder = await nextProductSortOrder(input.categoryId)
  const { data, error } = await supabase
    .from('products')
    .insert({ ...rowPayload(input), sort_order: sortOrder })
    .select('id')
    .single()

  if (error) throw error
  if (!data?.id) throw new Error('No id returned')

  if (input.kind === 'CUSTOM_BUNDLE') {
    await replaceBundleGroups(data.id, input.bundleGroups)
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
  const { data: cur, error: curErr } = await supabase
    .from('products')
    .select('category_id')
    .eq('id', id)
    .single()
  if (curErr) throw curErr

  const payload: Record<string, unknown> = rowPayload(input)
  if ((cur as { category_id: string | null }).category_id !== input.categoryId) {
    payload.sort_order = await nextProductSortOrder(input.categoryId)
  }

  const { error } = await supabase.from('products').update(payload).eq('id', id)
  if (error) throw error

  if (input.kind === 'CUSTOM_BUNDLE') {
    await replaceBundleGroups(id, input.bundleGroups)
  } else {
    await clearBundleGroups(id)
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

function bundleGroupsToInput(groups: ProductBundleGroup[]): BundleGroupInput[] {
  return [...groups]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((g, i) => ({
      name: g.name,
      requiredQty: g.requiredQty,
      sortOrder: i,
      productIds: [...g.productIds],
    }))
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
    bundleGroups: p.kind === 'CUSTOM_BUNDLE' ? bundleGroupsToInput(p.bundleGroups) : [],
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
