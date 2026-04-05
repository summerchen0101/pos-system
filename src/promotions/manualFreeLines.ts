import type { CartLine, Product, Promotion } from '../types/pos'
import { collectFreeSelectionLines } from './freeSelectionLines'

/** $0 lines for staff-applied FREE_ITEMS + FREE_SELECTION (uses normal product stock). */
export function buildManualFreeProductLines(
  promotions: readonly Promotion[],
  manualIds: readonly string[],
  productsById: ReadonlyMap<string, Product>,
  existingManualLines: readonly CartLine[],
): CartLine[] {
  const out: CartLine[] = []
  for (const id of manualIds) {
    const p = promotions.find((x) => x.id === id)
    if (!p || !p.active || p.applyMode !== 'MANUAL') continue
    if (p.kind === 'FREE_ITEMS') {
      for (const fi of p.freeItems) {
        const prod = productsById.get(fi.productId)
        const qty = Math.max(1, Math.trunc(fi.quantity))
        if (!prod || prod.stock < qty) continue
        out.push({
          lineId: `manualfree:${p.id}:${fi.productId}`,
          product: { ...prod, price: 0 },
          quantity: qty,
          isManualFree: true,
          manualPromotionId: p.id,
        })
      }
    } else if (p.kind === 'FREE_SELECTION') {
      out.push(...collectFreeSelectionLines(p, existingManualLines, productsById))
    }
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
