import { supabase } from '../supabase'

export type BoothVisibilitySets = {
  hiddenCategoryIds: Set<string>
  hiddenProductIds: Set<string>
}

export async function fetchBoothVisibilityForPos(boothId: string): Promise<BoothVisibilitySets> {
  const [catRes, prodRes] = await Promise.all([
    supabase.from('booth_hidden_categories').select('category_id').eq('booth_id', boothId),
    supabase.from('booth_hidden_products').select('product_id').eq('booth_id', boothId),
  ])
  if (catRes.error) throw catRes.error
  if (prodRes.error) throw prodRes.error
  return {
    hiddenCategoryIds: new Set((catRes.data ?? []).map((r) => r.category_id as string)),
    hiddenProductIds: new Set((prodRes.data ?? []).map((r) => r.product_id as string)),
  }
}

export async function replaceBoothVisibilityAdmin(
  boothId: string,
  hiddenCategoryIds: string[],
  hiddenProductIds: string[],
): Promise<void> {
  const { error: d1 } = await supabase.from('booth_hidden_categories').delete().eq('booth_id', boothId)
  if (d1) throw d1
  const { error: d2 } = await supabase.from('booth_hidden_products').delete().eq('booth_id', boothId)
  if (d2) throw d2

  const uCat = [...new Set(hiddenCategoryIds)].filter(Boolean)
  const uProd = [...new Set(hiddenProductIds)].filter(Boolean)

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
}
