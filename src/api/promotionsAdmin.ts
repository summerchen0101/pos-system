import { supabase } from '../supabase'
import { mapPromotionFromRow } from './promotionMappers'
import type { Promotion, PromotionKind } from '../types/pos'

const promotionSelect = `
  id,
  code,
  name,
  kind,
  buy_qty,
  free_qty,
  discount_percent,
  active,
  promotion_products ( product_id ),
  promotion_rules ( id, min_qty, free_qty, discount_percent, sort_order )
`

export type PromotionTierInput = {
  minQty: number
  freeQty: number | null
  discountPercent: number | null
  sortOrder: number
}

export type PromotionInput = {
  code: string | null
  name: string
  kind: PromotionKind
  buyQty: number | null
  freeQty: number | null
  discountPercent: number | null
  active: boolean
  productIds: string[]
  /** Required when kind is TIERED (at least one row). */
  tiers: PromotionTierInput[]
}

function rowPayload(input: PromotionInput) {
  const base = {
    code: input.code || null,
    name: input.name,
    kind: input.kind,
    active: input.active,
  }
  if (input.kind === 'TIERED') {
    return {
      ...base,
      buy_qty: null,
      free_qty: null,
      discount_percent: null,
    }
  }
  return {
    ...base,
    buy_qty: input.buyQty,
    free_qty: input.freeQty,
    discount_percent: input.discountPercent,
  }
}

async function replacePromotionProducts(promotionId: string, productIds: string[]) {
  const { error: delErr } = await supabase
    .from('promotion_products')
    .delete()
    .eq('promotion_id', promotionId)
  if (delErr) throw delErr

  if (productIds.length === 0) return
  const { error: insErr } = await supabase.from('promotion_products').insert(
    productIds.map((product_id) => ({ promotion_id: promotionId, product_id })),
  )
  if (insErr) throw insErr
}

async function replacePromotionRules(promotionId: string, tiers: PromotionTierInput[]) {
  const { error: delErr } = await supabase.from('promotion_rules').delete().eq('promotion_id', promotionId)
  if (delErr) throw delErr

  if (tiers.length === 0) return
  const { error: insErr } = await supabase.from('promotion_rules').insert(
    tiers.map((t) => ({
      promotion_id: promotionId,
      min_qty: t.minQty,
      free_qty: t.freeQty,
      discount_percent: t.discountPercent,
      sort_order: t.sortOrder,
    })),
  )
  if (insErr) throw insErr
}

async function syncPromotionRelations(id: string, input: PromotionInput) {
  await replacePromotionProducts(id, input.productIds)
  if (input.kind === 'TIERED') {
    await replacePromotionRules(id, input.tiers)
  } else {
    await replacePromotionRules(id, [])
  }
}

export async function listPromotionsAdmin(): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select(promotionSelect)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapPromotionFromRow(row))
}

export async function createPromotion(input: PromotionInput): Promise<Promotion> {
  const { data, error } = await supabase
    .from('promotions')
    .insert(rowPayload(input))
    .select('id')
    .single()

  if (error) throw error
  if (!data?.id) throw new Error('No id returned')

  await syncPromotionRelations(data.id, input)

  const { data: full, error: fetchErr } = await supabase
    .from('promotions')
    .select(promotionSelect)
    .eq('id', data.id)
    .single()

  if (fetchErr) throw fetchErr
  return mapPromotionFromRow(full)
}

export async function updatePromotion(id: string, input: PromotionInput): Promise<Promotion> {
  const { error } = await supabase.from('promotions').update(rowPayload(input)).eq('id', id)
  if (error) throw error

  await syncPromotionRelations(id, input)

  const { data: full, error: fetchErr } = await supabase
    .from('promotions')
    .select(promotionSelect)
    .eq('id', id)
    .single()

  if (fetchErr) throw fetchErr
  return mapPromotionFromRow(full)
}

export async function deletePromotion(id: string): Promise<void> {
  const { error } = await supabase.from('promotions').delete().eq('id', id)
  if (error) throw error
}

export async function setPromotionActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('promotions').update({ active }).eq('id', id)
  if (error) throw error
}
