import type { Promotion, PromotionKind } from '../types/pos'
import { isPromotionKindString } from '../types/pos'
import type { PromotionRow } from '../types/supabase'

export type PromotionRowWithProducts = PromotionRow & {
  promotion_products?: { product_id: string }[] | null
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
  }
}
