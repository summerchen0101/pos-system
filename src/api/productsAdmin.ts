import { supabase } from '../supabase'
import { mapProductRow, productSelectWithCategory, type ProductRowWithCategory } from './productMapper'
import type { Product } from '../types/pos'

export type ProductInput = {
  categoryId: string | null
  name: string
  nameEn: string | null
  description: string | null
  size: string | null
  sku: string
  priceCents: number
  isActive: boolean
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
    is_active: input.isActive,
  }
}

export async function listProductsAdmin(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(productSelectWithCategory)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapProductRow(row as ProductRowWithCategory))
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert(rowPayload(input))
    .select('id')
    .single()

  if (error) throw error
  if (!data?.id) throw new Error('No id returned')

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
}

function mergedProductInput(p: Product, patch: ProductBulkPatch): ProductInput {
  return {
    categoryId: patch.categoryId !== undefined ? patch.categoryId : p.categoryId,
    name: p.name,
    nameEn: p.nameEn,
    description: p.description,
    size: patch.size !== undefined ? patch.size : p.size,
    sku: p.sku,
    priceCents: patch.priceCents !== undefined ? patch.priceCents : p.price,
    isActive: p.isActive,
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
