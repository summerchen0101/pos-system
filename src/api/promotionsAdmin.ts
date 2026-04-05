import { supabase } from '../supabase'
import { mapPromotionFromRow } from './promotionMappers'
import type { Promotion } from '../types/pos'
import type { PromotionKind } from '../types/pos'

const promotionSelect = `
  id,
  code,
  name,
  kind,
  buy_qty,
  free_qty,
  discount_percent,
  active,
  promotion_products ( product_id )
`

export type PromotionInput = {
  code: string | null
  name: string
  kind: PromotionKind
  buyQty: number | null
  freeQty: number | null
  discountPercent: number | null
  active: boolean
  productIds: string[]
}

function rowPayload(input: PromotionInput) {
  return {
    code: input.code || null,
    name: input.name,
    kind: input.kind,
    buy_qty: input.buyQty,
    free_qty: input.freeQty,
    discount_percent: input.discountPercent,
    active: input.active,
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

  await replacePromotionProducts(data.id, input.productIds)

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

  await replacePromotionProducts(id, input.productIds)

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
