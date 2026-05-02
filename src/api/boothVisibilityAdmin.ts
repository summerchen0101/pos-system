import { supabase } from '../supabase'

export type BoothVisibilitySets = {
  hiddenCategoryIds: Set<string>
  hiddenProductIds: Set<string>
  /** When true, out-of-stock products appear in POS (disabled); false removes them unless category is in overrides. */
  showOutOfStock: boolean
  /** Categories where OOS visibility is inverted vs global (see plan). */
  outOfStockCategoryOverrideIds: Set<string>
}

export async function fetchBoothVisibilityForPos(boothId: string): Promise<BoothVisibilitySets> {
  const [boothRes, catRes, prodRes, oosRes] = await Promise.all([
    supabase.from('booths').select('show_out_of_stock').eq('id', boothId).single(),
    supabase.from('booth_hidden_categories').select('category_id').eq('booth_id', boothId),
    supabase.from('booth_hidden_products').select('product_id').eq('booth_id', boothId),
    supabase
      .from('booth_out_of_stock_category_overrides')
      .select('category_id')
      .eq('booth_id', boothId),
  ])
  if (boothRes.error) throw boothRes.error
  if (catRes.error) throw catRes.error
  if (prodRes.error) throw prodRes.error
  if (oosRes.error) throw oosRes.error
  const b = boothRes.data as { show_out_of_stock?: boolean } | null
  return {
    hiddenCategoryIds: new Set((catRes.data ?? []).map((r) => r.category_id as string)),
    hiddenProductIds: new Set((prodRes.data ?? []).map((r) => r.product_id as string)),
    showOutOfStock: b?.show_out_of_stock !== false,
    outOfStockCategoryOverrideIds: new Set((oosRes.data ?? []).map((r) => r.category_id as string)),
  }
}

export type ReplaceBoothVisibilityInput = {
  hiddenCategoryIds: string[]
  hiddenProductIds: string[]
  showOutOfStock: boolean
  outOfStockCategoryOverrideIds: string[]
}

export async function replaceBoothVisibilityAdmin(
  boothId: string,
  input: ReplaceBoothVisibilityInput,
): Promise<void> {
  const { error: bu } = await supabase
    .from('booths')
    .update({ show_out_of_stock: input.showOutOfStock })
    .eq('id', boothId)
  if (bu) throw bu

  const { error: d1 } = await supabase.from('booth_hidden_categories').delete().eq('booth_id', boothId)
  if (d1) throw d1
  const { error: d2 } = await supabase.from('booth_hidden_products').delete().eq('booth_id', boothId)
  if (d2) throw d2
  const { error: d3 } = await supabase
    .from('booth_out_of_stock_category_overrides')
    .delete()
    .eq('booth_id', boothId)
  if (d3) throw d3

  const uCat = [...new Set(input.hiddenCategoryIds)].filter(Boolean)
  const uProd = [...new Set(input.hiddenProductIds)].filter(Boolean)
  const uOos = [...new Set(input.outOfStockCategoryOverrideIds)].filter(Boolean)

  if (uCat.length > 0) {
    const { error: i1 } = await supabase
      .from('booth_hidden_categories')
      .insert(uCat.map((category_id) => ({ booth_id: boothId, category_id })))
    if (i1) throw i1
  }
  if (uProd.length > 0) {
    const { error: i2 } = await supabase
      .from('booth_hidden_products')
      .insert(uProd.map((product_id) => ({ booth_id: boothId, product_id })))
    if (i2) throw i2
  }
  if (uOos.length > 0) {
    const { error: i3 } = await supabase
      .from('booth_out_of_stock_category_overrides')
      .insert(uOos.map((category_id) => ({ booth_id: boothId, category_id })))
    if (i3) throw i3
  }
}
