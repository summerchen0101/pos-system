import type { Promotion } from '../types/pos'
import { isPromotionKindString } from '../types/pos'
import type { PromotionRule } from './types'

/**
 * Expands DB promotions into engine rules. Composite rule ids:
 * - Bulk: `promotionId`
 * - Per product: `${promotionId}~p~${productId}`
 */
export function mapDbPromotionsToEngineRules(promotions: Promotion[]): PromotionRule[] {
  const rules: PromotionRule[] = []

  for (const p of promotions) {
    if (!p.active || !isPromotionKindString(p.kind)) continue
    const ids = p.productIds
    if (ids.length === 0) continue

    switch (p.kind) {
      case 'BUY_X_GET_Y': {
        const x = p.buyQty ?? 0
        const y = p.freeQty ?? 0
        if (x <= 0 || y <= 0) break
        for (const pid of ids) {
          rules.push({
            id: `${p.id}~p~${pid}`,
            kind: 'buy_x_get_y_free',
            triggerProductId: pid,
            buyQuantity: x,
            freeQuantity: y,
          })
        }
        break
      }
      case 'BULK_DISCOUNT': {
        const minUnits = p.buyQty ?? 1
        const pct = p.discountPercent ?? 0
        if (minUnits < 1 || pct <= 0) break
        rules.push({
          id: p.id,
          kind: 'bulk_discount',
          minUnits,
          percentOff: pct,
          productIds: ids,
        })
        break
      }
      case 'SINGLE_DISCOUNT': {
        const pct = p.discountPercent ?? 0
        if (pct <= 0) break
        for (const pid of ids) {
          rules.push({
            id: `${p.id}~p~${pid}`,
            kind: 'single_product_discount',
            productId: pid,
            percentOff: pct,
          })
        }
        break
      }
      case 'TIERED': {
        const tierRows = p.rules ?? []
        if (tierRows.length === 0) break
        rules.push({
          id: p.id,
          kind: 'tiered_promotion',
          promotionId: p.id,
          productIds: ids,
          tiers: tierRows.map((r) => ({
            id: r.id,
            minQty: r.minQty,
            freeQty: r.freeQty,
            discountPercent: r.discountPercent,
            sortOrder: r.sortOrder,
          })),
        })
        break
      }
      default:
        break
    }
  }

  return rules
}
