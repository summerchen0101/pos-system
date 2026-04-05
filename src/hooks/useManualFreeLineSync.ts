import { useEffect, useMemo } from 'react'
import { buildManualFreeProductLines, manualFreeLinesSignature } from '../promotions/manualFreeLines'
import { useCartStore } from '../store/cartStore'
import type { Product, Promotion } from '../types/pos'

/** Syncs FREE_PRODUCT / FREE_ITEMS manual promos into $0 cart lines (before threshold gift sync). */
export function useManualFreeLineSync(promotions: Promotion[], products: Product[]) {
  const lines = useCartStore((s) => s.lines)
  const manualIds = useCartStore((s) => s.manualPromotionIds)
  const replaceManualFreeLines = useCartStore((s) => s.replaceManualFreeLines)

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  useEffect(() => {
    const desired = buildManualFreeProductLines(promotions, manualIds, productsById)
    const current = lines.filter((l) => l.isManualFree)
    if (manualFreeLinesSignature(desired) === manualFreeLinesSignature(current)) return
    replaceManualFreeLines(desired)
  }, [lines, promotions, manualIds, productsById, replaceManualFreeLines])
}
