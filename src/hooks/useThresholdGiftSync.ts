import { useEffect } from 'react'
import { buildThresholdGiftLines, thresholdGiftLinesInSync } from '../promotions/thresholdGifts'
import { useCartStore } from '../store/cartStore'
import type { Promotion } from '../types/pos'

/** Keeps auto-added threshold gift lines aligned with post-discount payable amount (excl. gifts), stock, and promotions. */
export function useThresholdGiftSync(promotions: Promotion[]) {
  const lines = useCartStore((s) => s.lines)
  const manualPromotionIds = useCartStore((s) => s.manualPromotionIds)
  const mergeGiftLines = useCartStore((s) => s.mergeGiftLines)

  useEffect(() => {
    if (thresholdGiftLinesInSync(lines, promotions, manualPromotionIds)) return
    mergeGiftLines(buildThresholdGiftLines(lines, promotions, manualPromotionIds))
  }, [lines, promotions, manualPromotionIds, mergeGiftLines])
}
