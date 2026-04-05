import type { CartLine, Product, Promotion } from '../types/pos'

/** $0 lines for staff-applied FREE_PRODUCT / FREE_ITEMS (uses normal product stock). */
export function buildManualFreeProductLines(
  promotions: readonly Promotion[],
  manualIds: readonly string[],
  productsById: ReadonlyMap<string, Product>,
): CartLine[] {
  const out: CartLine[] = []
  for (const id of manualIds) {
    const p = promotions.find((x) => x.id === id)
    if (!p || !p.active || p.applyMode !== 'MANUAL') continue
    if (p.kind !== 'FREE_PRODUCT' && p.kind !== 'FREE_ITEMS') continue
    const pid = p.productIds[0]
    if (!pid) continue
    const qty = Math.max(1, Math.trunc(p.freeQty ?? 1))
    const prod = productsById.get(pid)
    if (!prod || prod.stock < qty) continue
    out.push({
      lineId: `manualfree:${p.id}`,
      product: { ...prod, price: 0 },
      quantity: qty,
      isManualFree: true,
      manualPromotionId: p.id,
    })
  }
  return out
}

export function manualFreeLinesSignature(lines: readonly CartLine[]): string {
  return JSON.stringify(
    lines
      .filter((l) => l.isManualFree)
      .map((l) => ({ lineId: l.lineId, q: l.quantity, pid: l.product.id })),
  )
}
