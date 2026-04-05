import type { CartLine, Product, Promotion } from '../types/pos'

export function isManualPromotionSelectableKind(p: Promotion): boolean {
  return (
    p.kind === 'BUY_X_GET_Y' ||
    p.kind === 'FIXED_DISCOUNT' ||
    p.kind === 'FREE_ITEMS' ||
    p.kind === 'FREE_PRODUCT'
  )
}

/** Whether this manual promo can be applied from the POS modal (cart / stock checks). */
export function isManualPromotionEligible(
  p: Promotion,
  lines: readonly CartLine[],
  products: readonly Product[],
): boolean {
  if (!p.active || p.applyMode !== 'MANUAL' || !isManualPromotionSelectableKind(p)) return false

  const paid = lines.filter((l) => !l.isGift && !l.isManualFree)
  if (paid.length === 0) return false

  if (p.kind === 'FIXED_DISCOUNT') return (p.fixedDiscountCents ?? 0) >= 1

  if (p.kind === 'BUY_X_GET_Y') {
    return p.productIds.some((pid) => paid.some((l) => l.product.id === pid))
  }

  if (p.kind === 'FREE_PRODUCT' || p.kind === 'FREE_ITEMS') {
    const pid = p.productIds[0]
    if (!pid) return false
    const qty = Math.max(1, Math.trunc(p.freeQty ?? 1))
    const prod = products.find((x) => x.id === pid)
    return !!prod && prod.stock >= qty
  }

  return false
}
