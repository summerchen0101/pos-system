import type {
  Promotion,
  PromotionApplyMode,
  PromotionGiftDetail,
  PromotionKind,
  PromotionQuantityDiscountTier,
  PromotionTierRule,
} from '../types/pos'
import { isPromotionKindString } from '../types/pos'
import type { PromotionQuantityTierRow, PromotionRow, PromotionRuleRow } from '../types/supabase'

/** Nested `promotion_rules` from PostgREST omit parent `promotion_id`. */
export type PromotionRuleNestedRow = Pick<
  PromotionRuleRow,
  'id' | 'min_qty' | 'free_qty' | 'discount_percent' | 'sort_order'
>

type GiftInventoryNestedRow = { stock: number }

type GiftNestedRow = {
  id: string
  name: string
  is_active: boolean
  /** PostgREST may return one object or a single-element array. */
  gift_inventory?: GiftInventoryNestedRow | GiftInventoryNestedRow[] | null
}

export type PromotionQuantityTierNestedRow = Pick<
  PromotionQuantityTierRow,
  'id' | 'min_qty' | 'discount_percent' | 'sort_order'
>

type BoothNestedRow = { id: string; name: string; location: string | null }

type PromotionBoothJoinRow = {
  booth_id: string
  booths?: BoothNestedRow | BoothNestedRow[] | null
}

export type PromotionRowWithProducts = PromotionRow & {
  promotion_booths?: PromotionBoothJoinRow[] | null
  promotion_products?: { product_id: string; quantity?: number }[] | null
  promotion_selectable_items?: { product_id: string }[] | null
  promotion_rules?: PromotionRuleNestedRow[] | null
  promotion_tiers?: PromotionQuantityTierNestedRow[] | null
  gifts?: GiftNestedRow | GiftNestedRow[] | null
}

function unwrapOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? x[0] ?? null : x
}

function firstInventory(
  x: GiftInventoryNestedRow | GiftInventoryNestedRow[] | null | undefined,
): GiftInventoryNestedRow | null {
  if (x == null) return null
  return Array.isArray(x) ? x[0] ?? null : x
}

function mapGiftDetail(row: GiftNestedRow | null): PromotionGiftDetail | null {
  if (!row) return null
  const inv = firstInventory(row.gift_inventory)
  const stock = inv?.stock ?? 0
  return {
    giftId: row.id,
    displayName: row.name,
    stock,
    isActive: row.is_active,
  }
}

function mapTierRows(rows: PromotionRuleNestedRow[] | null | undefined): PromotionTierRule[] {
  if (!rows?.length) return []
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order || a.min_qty - b.min_qty)
    .map((r) => ({
      id: r.id,
      minQty: r.min_qty,
      freeQty: r.free_qty,
      discountPercent: r.discount_percent,
      sortOrder: r.sort_order,
    }))
}

function mapQuantityDiscountTierRows(
  rows: PromotionQuantityTierNestedRow[] | null | undefined,
): PromotionQuantityDiscountTier[] {
  if (!rows?.length) return []
  return [...rows]
    .sort((a, b) => a.min_qty - b.min_qty || a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((r) => ({
      id: r.id,
      minQty: r.min_qty,
      discountPercent: r.discount_percent,
      sortOrder: r.sort_order,
    }))
}

export function mapPromotionFromRow(row: PromotionRowWithProducts): Promotion {
  const ppRows = row.promotion_products ?? []
  const productIds = ppRows.map((x) => x.product_id)
  if (!isPromotionKindString(row.kind)) {
    throw new Error(`Invalid promotion kind: ${row.kind}`)
  }
  const kind: PromotionKind = row.kind
  const giftNested = unwrapOne(row.gifts)
  const gift = mapGiftDetail(giftNested)
  const applyMode: PromotionApplyMode = row.apply_mode === 'MANUAL' ? 'MANUAL' : 'AUTO'

  const freeItems =
    kind === 'FREE_ITEMS'
      ? ppRows.map((x) => ({
          productId: x.product_id,
          quantity: Math.max(1, Math.trunc(x.quantity ?? 1)),
        }))
      : []

  const selectableRows = row.promotion_selectable_items ?? []
  const selectableProductIds = selectableRows.map((x) => x.product_id)
  const pbRows = row.promotion_booths ?? []
  const pairs = pbRows
    .map((pb) => {
      const b = unwrapOne(pb.booths as BoothNestedRow | BoothNestedRow[] | null | undefined)
      const label = b?.name?.trim()
        ? b.location?.trim()
          ? `${b.name}（${b.location}）`
          : b.name
        : b?.location?.trim() ?? ''
      return { boothId: pb.booth_id, label: label.trim() ? label : '—' }
    })
    .filter((x) => x.boothId)
  pairs.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
  const boothIds = pairs.map((x) => x.boothId)
  const boothNames = pairs.map((x) => x.label)

  return {
    id: row.id,
    boothIds,
    boothNames,
    code: row.code,
    name: row.name,
    kind,
    buyQty: row.buy_qty,
    freeQty: row.free_qty,
    bogoSingleDealOnly: row.bogo_single_deal_only ?? false,
    discountPercent: row.discount_percent,
    active: row.active,
    applyMode,
    fixedDiscountCents: row.fixed_discount_cents ?? null,
    productIds,
    rules: mapTierRows(row.promotion_rules ?? undefined),
    quantityDiscountTiers: mapQuantityDiscountTierRows(row.promotion_tiers ?? undefined),
    giftId: row.gift_id ?? null,
    thresholdAmountCents: row.threshold_amount ?? null,
    gift,
    freeItems,
    selectableProductIds: kind === 'FREE_SELECTION' ? selectableProductIds : [],
    maxSelectionQty:
      kind === 'FREE_SELECTION' && row.max_selection_qty != null
        ? Math.max(1, Math.trunc(row.max_selection_qty))
        : null,
  }
}
