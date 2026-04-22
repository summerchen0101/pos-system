import { supabase } from '../supabase'
import {
  enrichPromotionWithGroupFallback,
  loadPromotionGroupsMap,
} from './promotionGroupEnrichment'
import { mapPromotionFromRow, type PromotionRowWithProducts } from './promotionMappers'
import { PROMOTION_LIST_SELECT } from './promotionSelect'
import type { Promotion, PromotionApplyMode, PromotionKind } from '../types/pos'

export type PromotionTierInput = {
  minQty: number
  freeQty: number | null
  discountPercent: number | null
  sortOrder: number
}

export type PromotionQuantityTierInput = {
  minQty: number
  /** Set for `TIERED_QUANTITY_DISCOUNT`; otherwise null. */
  discountPercent: number | null
  /** Set for `TIERED_QUANTITY_FIXED_DISCOUNT`; otherwise null. */
  discountAmountCents: number | null
  sortOrder: number
}

export type PromotionProductQtyInput = {
  productId: string
  quantity: number
}

export type PromotionInput = {
  boothIds: string[]
  /** `promotion_groups.id`; omit or null = ungrouped. */
  groupId: string | null
  code: string | null
  name: string
  kind: PromotionKind
  buyQty: number | null
  freeQty: number | null
  discountPercent: number | null
  active: boolean
  applyMode: PromotionApplyMode
  fixedDiscountCents: number | null
  productIds: string[]
  /** Populated for `FREE_ITEMS` — per-product gift quantities. */
  freeItems: PromotionProductQtyInput[]
  /** `FREE_SELECTION` — product pool (no per-row qty here). */
  selectableProductIds: string[]
  /** `FREE_SELECTION` — max total units across chosen lines. */
  maxSelectionQty: number | null
  tiers: PromotionTierInput[]
  /** Quantity ladder tiers — percent or fixed amount per `kind`. */
  quantityTiers: PromotionQuantityTierInput[]
  giftId: string | null
  thresholdAmountCents: number | null
  /** `BUY_X_GET_Y` only — one bundle, no stacked repeats. */
  bogoSingleDealOnly?: boolean
}

function resolvedApplyMode(input: PromotionInput): PromotionApplyMode {
  if (input.kind === 'GIFT_WITH_THRESHOLD') return 'AUTO'
  if (input.kind === 'FREE_ITEMS' || input.kind === 'FREE_SELECTION') return 'MANUAL'
  return input.applyMode
}

function maxSelectionColumn(input: PromotionInput): number | null {
  if (input.kind !== 'FREE_SELECTION' || input.maxSelectionQty == null) return null
  return Math.max(1, Math.trunc(input.maxSelectionQty))
}

function rowPayload(input: PromotionInput) {
  const apply_mode = resolvedApplyMode(input)
  const max_selection_qty = maxSelectionColumn(input)
  const bogo_single_deal_only =
    input.kind === 'BUY_X_GET_Y' ? !!input.bogoSingleDealOnly : false
  const base = {
    code: input.code || null,
    name: input.name,
    kind: input.kind,
    active: input.active,
    apply_mode,
    max_selection_qty,
    bogo_single_deal_only,
    group_id: input.groupId ?? null,
  }

  if (input.kind === 'GIFT_WITH_THRESHOLD') {
    return {
      ...base,
      buy_qty: null,
      free_qty: null,
      discount_percent: null,
      fixed_discount_cents: null,
      gift_id: input.giftId,
      threshold_amount: input.thresholdAmountCents,
    }
  }
  if (
    input.kind === 'TIERED' ||
    input.kind === 'TIERED_QUANTITY_DISCOUNT' ||
    input.kind === 'TIERED_QUANTITY_FIXED_DISCOUNT'
  ) {
    return {
      ...base,
      buy_qty: null,
      free_qty: null,
      discount_percent: null,
      fixed_discount_cents: null,
      gift_id: null,
      threshold_amount: null,
    }
  }
  if (input.kind === 'FIXED_DISCOUNT') {
    return {
      ...base,
      buy_qty: null,
      free_qty: null,
      discount_percent: null,
      fixed_discount_cents: input.fixedDiscountCents,
      gift_id: null,
      threshold_amount: null,
    }
  }
  if (input.kind === 'FREE_ITEMS') {
    return {
      ...base,
      buy_qty: null,
      free_qty: null,
      discount_percent: null,
      fixed_discount_cents: null,
      gift_id: null,
      threshold_amount: null,
    }
  }
  if (input.kind === 'FREE_SELECTION') {
    return {
      ...base,
      buy_qty: null,
      free_qty: null,
      discount_percent: null,
      fixed_discount_cents: null,
      gift_id: null,
      threshold_amount: null,
    }
  }
  return {
    ...base,
    buy_qty: input.buyQty,
    free_qty: input.freeQty,
    discount_percent: input.discountPercent,
    fixed_discount_cents: null,
    gift_id: null,
    threshold_amount: null,
  }
}

async function replacePromotionProductEntries(
  promotionId: string,
  entries: PromotionProductQtyInput[],
) {
  const { error: delErr } = await supabase
    .from('promotion_products')
    .delete()
    .eq('promotion_id', promotionId)
  if (delErr) throw delErr

  if (entries.length === 0) return
  const { error: insErr } = await supabase.from('promotion_products').insert(
    entries.map((e) => ({
      promotion_id: promotionId,
      product_id: e.productId,
      quantity: Math.max(1, Math.trunc(e.quantity)),
    })),
  )
  if (insErr) throw insErr
}

async function replacePromotionSelectableItems(promotionId: string, productIds: string[]) {
  const { error: delErr } = await supabase
    .from('promotion_selectable_items')
    .delete()
    .eq('promotion_id', promotionId)
  if (delErr) throw delErr

  if (productIds.length === 0) return
  const { error: insErr } = await supabase.from('promotion_selectable_items').insert(
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

async function replacePromotionTiers(promotionId: string, tiers: PromotionQuantityTierInput[]) {
  const { error: delErr } = await supabase.from('promotion_tiers').delete().eq('promotion_id', promotionId)
  if (delErr) throw delErr

  if (tiers.length === 0) return
  const { error: insErr } = await supabase.from('promotion_tiers').insert(
    tiers.map((t) => ({
      promotion_id: promotionId,
      min_qty: t.minQty,
      discount_percent: t.discountPercent,
      discount_amount_cents: t.discountAmountCents,
      sort_order: t.sortOrder,
    })),
  )
  if (insErr) throw insErr
}

async function replacePromotionBooths(promotionId: string, boothIds: string[]) {
  const unique = [...new Set(boothIds.filter(Boolean))]
  const { error: delErr } = await supabase.from('promotion_booths').delete().eq('promotion_id', promotionId)
  if (delErr) throw delErr
  if (unique.length === 0) return
  const { error: insErr } = await supabase.from('promotion_booths').insert(
    unique.map((booth_id) => ({ promotion_id: promotionId, booth_id })),
  )
  if (insErr) throw insErr
}

async function syncPromotionRelations(id: string, input: PromotionInput) {
  if (input.kind === 'FREE_SELECTION') {
    await replacePromotionProductEntries(id, [])
    await replacePromotionSelectableItems(id, input.selectableProductIds)
  } else {
    await replacePromotionSelectableItems(id, [])
    if (input.kind === 'GIFT_WITH_THRESHOLD' || input.kind === 'FIXED_DISCOUNT') {
      await replacePromotionProductEntries(id, [])
    } else if (input.kind === 'FREE_ITEMS') {
      await replacePromotionProductEntries(id, input.freeItems)
    } else {
      await replacePromotionProductEntries(
        id,
        input.productIds.map((productId) => ({ productId, quantity: 1 })),
      )
    }
  }
  if (input.kind === 'TIERED') {
    await replacePromotionRules(id, input.tiers)
  } else {
    await replacePromotionRules(id, [])
  }
  if (
    input.kind === 'TIERED_QUANTITY_DISCOUNT' ||
    input.kind === 'TIERED_QUANTITY_FIXED_DISCOUNT'
  ) {
    await replacePromotionTiers(id, input.quantityTiers)
  } else {
    await replacePromotionTiers(id, [])
  }
}

export type PromotionListFilters = {
  /** When set, only promotions that include this booth. */
  boothId?: string | null
}

export async function listPromotionsAdmin(filters?: PromotionListFilters): Promise<Promotion[]> {
  let q = supabase.from('promotions').select(PROMOTION_LIST_SELECT).order('name', { ascending: true })
  if (filters?.boothId) {
    q = q.eq('promotion_booths.booth_id', filters.boothId)
  }

  const [{ data, error }, groupsById] = await Promise.all([q, loadPromotionGroupsMap()])

  if (error) throw error
  return (data ?? []).map((row) =>
    enrichPromotionWithGroupFallback(
      mapPromotionFromRow(row as PromotionRowWithProducts),
      groupsById,
    ),
  )
}

export async function createPromotion(input: PromotionInput): Promise<Promotion> {
  if (!input.boothIds?.length) throw new Error('PROMOTION_NEEDS_BOOTH')

  const { data, error } = await supabase
    .from('promotions')
    .insert(rowPayload(input))
    .select('id')
    .single()

  if (error) throw error
  if (!data?.id) throw new Error('No id returned')

  await syncPromotionRelations(data.id, input)
  await replacePromotionBooths(data.id, input.boothIds)

  const [{ data: full, error: fetchErr }, groupsById] = await Promise.all([
    supabase.from('promotions').select(PROMOTION_LIST_SELECT).eq('id', data.id).single(),
    loadPromotionGroupsMap(),
  ])

  if (fetchErr) throw fetchErr
  return enrichPromotionWithGroupFallback(
    mapPromotionFromRow(full as PromotionRowWithProducts),
    groupsById,
  )
}

export async function updatePromotion(id: string, input: PromotionInput): Promise<Promotion> {
  if (!input.boothIds?.length) throw new Error('PROMOTION_NEEDS_BOOTH')

  const { error } = await supabase.from('promotions').update(rowPayload(input)).eq('id', id)
  if (error) throw error

  await syncPromotionRelations(id, input)
  await replacePromotionBooths(id, input.boothIds)

  const [{ data: full, error: fetchErr }, groupsById] = await Promise.all([
    supabase.from('promotions').select(PROMOTION_LIST_SELECT).eq('id', id).single(),
    loadPromotionGroupsMap(),
  ])

  if (fetchErr) throw fetchErr
  return enrichPromotionWithGroupFallback(
    mapPromotionFromRow(full as PromotionRowWithProducts),
    groupsById,
  )
}

export async function deletePromotion(id: string): Promise<void> {
  const { error } = await supabase.from('promotions').delete().eq('id', id)
  if (error) throw error
}

export async function setPromotionActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('promotions').update({ active }).eq('id', id)
  if (error) throw error
}

/** Remove promotions with no `promotion_booths` rows (e.g. after a booth is deleted). */
export async function deletePromotionsNotLinkedToAnyBooth(): Promise<void> {
  const { data: promos, error: e1 } = await supabase.from('promotions').select('id')
  if (e1) throw e1
  const { data: pb, error: e2 } = await supabase.from('promotion_booths').select('promotion_id')
  if (e2) throw e2
  const linked = new Set((pb ?? []).map((r) => r.promotion_id))
  const orphans = (promos ?? []).map((p) => p.id).filter((pid) => !linked.has(pid))
  if (orphans.length === 0) return
  const { error: e3 } = await supabase.from('promotions').delete().in('id', orphans)
  if (e3) throw e3
}
