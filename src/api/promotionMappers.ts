import type { Promotion, PromotionKind, PromotionTierRule } from '../types/pos'
import { isPromotionKindString } from '../types/pos'
import type { PromotionRow, PromotionRuleRow } from '../types/supabase'

export type PromotionRowWithProducts = PromotionRow & {
  promotion_products?: { product_id: string }[] | null
  promotion_rules?: PromotionRuleRow[] | null
}

function mapTierRows(rows: PromotionRuleRow[] | null | undefined): PromotionTierRule[] {
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

export function mapPromotionFromRow(row: PromotionRowWithProducts): Promotion {
  const productIds = (row.promotion_products ?? []).map((x) => x.product_id)
  if (!isPromotionKindString(row.kind)) {
    throw new Error(`Invalid promotion kind: ${row.kind}`)
  }
  const kind: PromotionKind = row.kind
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind,
    buyQty: row.buy_qty,
    freeQty: row.free_qty,
    discountPercent: row.discount_percent,
    active: row.active,
    productIds,
    rules: mapTierRows(row.promotion_rules ?? undefined),
  }
}
