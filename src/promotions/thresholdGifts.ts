import { formatMoney } from '../lib/money'
import { syntheticProductForThresholdGift } from '../lib/giftCartProduct'
import type { CartLine, Promotion } from '../types/pos'
import { payableAmountBeforeGiftsCents } from './computeCartPromotionBreakdown'

/** Auto gift lines to merge into the cart when threshold + stock allow. */
export function buildThresholdGiftLines(
  allLines: readonly CartLine[],
  promotions: readonly Promotion[],
  manualPromotionIds: readonly string[],
): CartLine[] {
  const basisCents = payableAmountBeforeGiftsCents(allLines, promotions, manualPromotionIds)
  const desired: CartLine[] = []

  for (const pr of promotions) {
    if (!pr.active || pr.kind !== 'GIFT_WITH_THRESHOLD' || !pr.gift) continue
    const g = pr.gift
    if (!g.isActive || g.stock < 1) continue
    const threshold = pr.thresholdAmountCents ?? 0
    if (threshold < 1 || basisCents < threshold) continue

    desired.push({
      lineId: `gift:${pr.id}`,
      product: syntheticProductForThresholdGift(g),
      quantity: 1,
      isGift: true,
      giftId: g.giftId,
      promotionId: pr.id,
      giftStock: g.stock,
    })
  }

  return desired
}

function giftLinesSignature(lines: readonly CartLine[]): string {
  return JSON.stringify(
    lines
      .filter((l) => l.isGift)
      .map((l) => ({ lineId: l.lineId, giftId: l.giftId, giftStock: l.giftStock })),
  )
}

export function thresholdGiftLinesInSync(
  allLines: readonly CartLine[],
  promotions: readonly Promotion[],
  manualPromotionIds: readonly string[],
): boolean {
  const desired = buildThresholdGiftLines(allLines, promotions, manualPromotionIds)
  const current = allLines.filter((l) => l.isGift)
  return giftLinesSignature(desired) === giftLinesSignature(current)
}

/** Banner lines like「滿 NT$500 贈送 xxx」for eligible threshold promos. */
export function thresholdGiftSummaryLines(
  lines: readonly CartLine[],
  promotions: readonly Promotion[],
  manualPromotionIds: readonly string[],
  template: (amountFormatted: string, giftName: string) => string,
): string[] {
  const basisCents = payableAmountBeforeGiftsCents(lines, promotions, manualPromotionIds)
  const out: string[] = []

  for (const pr of promotions) {
    if (!pr.active || pr.kind !== 'GIFT_WITH_THRESHOLD' || !pr.gift) continue
    const g = pr.gift
    if (!g.isActive || g.stock < 1) continue
    const threshold = pr.thresholdAmountCents ?? 0
    if (threshold < 1 || basisCents < threshold) continue
    out.push(template(formatMoney(threshold), g.displayName))
  }

  return out
}
