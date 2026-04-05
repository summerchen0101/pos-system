import type { OrderSnapshotPromotionEntry } from '../types/order'
import type { CartLine, Product, Promotion } from '../types/pos'

export function freeSelectionLineId(promotionId: string, productId: string): string {
  return `freeselection:${promotionId}:${productId}`
}

export function isFreeSelectionLineId(lineId: string): boolean {
  return lineId.startsWith('freeselection:')
}

export function isFreeSelectionCartLine(line: CartLine, promotions: readonly Promotion[]): boolean {
  if (!line.isManualFree || !line.manualPromotionId) return false
  const p = promotions.find((x) => x.id === line.manualPromotionId)
  return p?.kind === 'FREE_SELECTION'
}

/**
 * Rebuild FREE_SELECTION lines from current cart, enforcing pool membership, max total qty, and stock.
 */
export function collectFreeSelectionLines(
  p: Promotion,
  existingManualLines: readonly CartLine[],
  productsById: ReadonlyMap<string, Product>,
): CartLine[] {
  if (p.kind !== 'FREE_SELECTION') return []
  const pool = new Set(p.selectableProductIds)
  const max = p.maxSelectionQty ?? 0
  if (!pool.size || max < 1) return []

  const relevant = existingManualLines.filter(
    (l) => l.isManualFree && l.manualPromotionId === p.id && pool.has(l.product.id),
  )

  const qtyByPid = new Map<string, number>()
  for (const l of relevant) {
    qtyByPid.set(l.product.id, (qtyByPid.get(l.product.id) ?? 0) + l.quantity)
  }

  let remaining = max
  const out: CartLine[] = []
  for (const pid of p.selectableProductIds) {
    if (remaining <= 0) break
    const want = qtyByPid.get(pid) ?? 0
    if (want < 1) continue
    const prod = productsById.get(pid)
    if (!prod) continue
    const q = Math.min(want, prod.stock, remaining)
    if (q < 1) continue
    out.push({
      lineId: freeSelectionLineId(p.id, pid),
      product: { ...prod, price: 0 },
      quantity: q,
      isManualFree: true,
      manualPromotionId: p.id,
    })
    remaining -= q
  }
  return out
}

/** Snapshot rows for `orders.promotion_snapshot.promotions` (FREE_SELECTION). */
export function buildFreeSelectionPromotionsSnapshot(
  lines: readonly CartLine[],
  promotions: readonly Promotion[],
  manualPromotionIds: readonly string[],
): OrderSnapshotPromotionEntry[] {
  const out: OrderSnapshotPromotionEntry[] = []
  for (const mid of manualPromotionIds) {
    const p = promotions.find((x) => x.id === mid)
    if (!p || p.kind !== 'FREE_SELECTION') continue
    const max = p.maxSelectionQty ?? 0
    const prefix = `freeselection:${p.id}:`
    const sel = lines.filter(
      (l) => l.manualPromotionId === p.id && l.lineId.startsWith(prefix),
    )
    if (sel.length === 0) continue
    const parts = [...sel]
      .sort((a, b) => a.product.name.localeCompare(b.product.name, 'zh-Hant'))
      .map((l) => `${l.product.name}×${l.quantity}`)
    out.push({
      type: 'FREE_SELECTION',
      promotionId: p.id,
      name: p.name,
      description: `${p.name}（${max}件）`,
      selectedItemsSummary: parts.join('、'),
    })
  }
  return out
}
