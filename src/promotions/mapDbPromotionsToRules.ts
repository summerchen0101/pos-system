import type { Promotion } from '../types/pos'
import { isPromotionKindString } from '../types/pos'
import type { PromotionRule } from './types'

/**
 * Expands DB promotions into engine rules. Composite rule ids:
 * - Bulk: `promotionId`
 * - Per product (percent): `${promotionId}~p~${productId}`; (fixed): `${promotionId}~pf~${productId}`
 */
export function mapDbPromotionsToEngineRules(promotions: readonly Promotion[]): PromotionRule[] {
  const rules: PromotionRule[] = []

  for (const p of promotions) {
    if (!p.active || !isPromotionKindString(p.kind)) continue
    if (p.applyMode === 'MANUAL') continue
    if (p.kind === 'GIFT_WITH_THRESHOLD') continue
    if (p.kind === 'FIXED_PERCENT_DISCOUNT') {
      const pct = p.discountPercent ?? 0
      if (pct >= 1 && pct <= 100) {
        rules.push({
          id: `${p.id}~cartpct`,
          kind: 'cart_percent_discount',
          percentOff: pct,
        })
      }
      continue
    }
    if (p.kind === 'FIXED_DISCOUNT' || p.kind === 'FREE_ITEMS' || p.kind === 'FREE_SELECTION') continue

    const ids = p.productIds
    if (ids.length === 0) continue

    switch (p.kind) {
      case 'BUY_X_GET_Y': {
        const x = p.buyQty ?? 0
        const y = p.freeQty ?? 0
        if (x <= 0 || y <= 0) break
        rules.push({
          id: `${p.id}~bogo`,
          kind: 'buy_x_get_y_free',
          triggerProductId: ids[0]!,
          buyQuantity: x,
          freeQuantity: y,
          poolProductIds: [...ids],
          singleDealOnly: p.bogoSingleDealOnly,
        })
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
      case 'SINGLE_FIXED_DISCOUNT': {
        const cents = p.fixedDiscountCents ?? 0
        if (cents < 1) break
        for (const pid of ids) {
          rules.push({
            id: `${p.id}~pf~${pid}`,
            kind: 'single_product_fixed_discount',
            productId: pid,
            amountOffCents: cents,
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
      case 'TIERED_QUANTITY_DISCOUNT': {
        const tierRows = (p.quantityDiscountTiers ?? []).filter(
          (r) => r.discountPercent != null && r.discountPercent >= 1,
        )
        if (tierRows.length === 0) break
        rules.push({
          id: p.id,
          kind: 'tiered_quantity_discount',
          promotionId: p.id,
          productIds: ids,
          tiers: tierRows.map((r) => ({
            id: r.id,
            minQty: r.minQty,
            discountPercent: r.discountPercent!,
            sortOrder: r.sortOrder,
          })),
        })
        break
      }
      case 'TIERED_QUANTITY_FIXED_DISCOUNT': {
        const tierRows = (p.quantityDiscountTiers ?? []).filter(
          (r) => r.discountAmountCents != null && r.discountAmountCents >= 1,
        )
        if (tierRows.length === 0) break
        rules.push({
          id: p.id,
          kind: 'tiered_quantity_fixed_discount',
          promotionId: p.id,
          productIds: ids,
          tiers: tierRows.map((r) => ({
            id: r.id,
            minQty: r.minQty,
            discountAmountCents: r.discountAmountCents!,
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
