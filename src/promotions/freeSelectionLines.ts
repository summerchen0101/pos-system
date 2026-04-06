import type { OrderSnapshotPromotionEntry } from '../types/order'
import type { CartLine, Product, Promotion } from '../types/pos'

export function freeSelectionLineId(promotionId: string, productId: string): string {
  return `freeselection:${promotionId}:${productId}`
}

export function isFreeSelectionLineId(lineId: string): boolean {
  return lineId.startsWith('freeselection:')
}

export function isFreeSelectionCartLine(line: CartLine, promotions: readonly Promotion[]): boolean {
  if (!line.isManualFree || !line.manualPromotionId || line.isBundleComponent) return false
  const p = promotions.find((x) => x.id === line.manualPromotionId)
  return p?.kind === 'FREE_SELECTION'
}

/**
 * Rebuild FREE_SELECTION lines from current cart, enforcing pool membership, max total qty, and stock.
 */
function validateManualFreeBundleComponents(
  bundleProduct: Product,
  comps: readonly CartLine[],
  productsById: ReadonlyMap<string, Product>,
): boolean {
  const groups = bundleProduct.bundleGroups ?? []
  for (const g of groups) {
    const sum = comps
      .filter((c) => c.bundleGroupId === g.id)
      .reduce((a, c) => a + c.quantity, 0)
    if (sum !== g.requiredQty) return false
  }
  for (const c of comps) {
    const cp = productsById.get(c.product.id)
    if (!cp || c.quantity > cp.stock) return false
  }
  return true
}

function pushValidatedManualFreeBundle(
  p: Promotion,
  bundleProduct: Product,
  root: CartLine,
  comps: CartLine[],
  productsById: ReadonlyMap<string, Product>,
  out: CartLine[],
): boolean {
  if (!root.bundleInstanceId || !validateManualFreeBundleComponents(bundleProduct, comps, productsById)) {
    return false
  }
  const rq = Math.max(1, Math.trunc(root.quantity))
  if (rq !== 1) return false
  out.push({
    ...root,
    product: { ...bundleProduct, price: 0 },
    quantity: 1,
    isManualFree: true,
    manualPromotionId: p.id,
  })
  for (const c of comps) {
    const cp = productsById.get(c.product.id)
    if (!cp) return false
    out.push({
      ...c,
      product: { ...cp, price: 0 },
      isManualFree: true,
      manualPromotionId: p.id,
    })
  }
  return true
}

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
    (l) =>
      l.isManualFree &&
      l.manualPromotionId === p.id &&
      !l.isBundleComponent &&
      pool.has(l.product.id),
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

    if (prod.kind === 'CUSTOM_BUNDLE') {
      const roots = existingManualLines.filter(
        (l) =>
          l.isManualFree &&
          l.manualPromotionId === p.id &&
          l.isBundleRoot &&
          l.product.id === pid &&
          l.bundleInstanceId,
      )
      const sortedRoots = [...roots].sort((a, b) =>
        (a.bundleInstanceId ?? '').localeCompare(b.bundleInstanceId ?? ''),
      )
      let take = Math.min(want, sortedRoots.length, remaining)
      for (let i = 0; i < take; i++) {
        const root = sortedRoots[i]
        const bid = root.bundleInstanceId
        const comps = existingManualLines.filter(
          (l) =>
            l.bundleInstanceId === bid && l.isBundleComponent && l.manualPromotionId === p.id,
        )
        if (!pushValidatedManualFreeBundle(p, prod, root, comps, productsById, out)) {
          take = i
          break
        }
        remaining -= 1
        if (remaining <= 0) break
      }
      continue
    }

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
      (l) =>
        l.manualPromotionId === p.id &&
        !l.isBundleComponent &&
        (l.lineId.startsWith(prefix) || !!l.isBundleRoot),
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
