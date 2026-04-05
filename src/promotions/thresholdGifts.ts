import { evaluatePromotionEngine } from './engine'
import { mapDbPromotionsToEngineRules } from './mapDbPromotionsToRules'
import { cartLineInputsFromPos } from './posAdapter'
import { formatMoney } from '../lib/money'
import type { CartLine, Promotion } from '../types/pos'

/**
 * Payable merchandise total after the best auto discount (BOGO, bulk, single, tiered).
 * Excludes gift lines; `GIFT_WITH_THRESHOLD` is not in engine rules — evaluated after this.
 */
export function merchandiseFinalAfterAutoPromotionsCents(
  lines: readonly CartLine[],
  promotions: readonly Promotion[],
): number {
  const rules = mapDbPromotionsToEngineRules(promotions)
  const cart = cartLineInputsFromPos(lines)
  return evaluatePromotionEngine(cart, rules).finalTotalCents
}

/** Auto gift lines to merge into the cart when threshold + stock allow. */
export function buildThresholdGiftLines(
  allLines: readonly CartLine[],
  promotions: readonly Promotion[],
): CartLine[] {
  const basisCents = merchandiseFinalAfterAutoPromotionsCents(allLines, promotions)
  const desired: CartLine[] = []

  for (const pr of promotions) {
    if (!pr.active || pr.kind !== 'GIFT_WITH_THRESHOLD' || !pr.gift) continue
    const g = pr.gift
    if (!g.isActive || g.stock < 1) continue
    const threshold = pr.thresholdAmountCents ?? 0
    if (threshold < 1 || basisCents < threshold) continue
    const prod = g.product
    if (!prod) continue

    desired.push({
      lineId: `gift:${pr.id}`,
      product: { ...prod, price: 0 },
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
): boolean {
  const desired = buildThresholdGiftLines(allLines, promotions)
  const current = allLines.filter((l) => l.isGift)
  return giftLinesSignature(desired) === giftLinesSignature(current)
}

/** Banner lines like「滿 NT$500 贈送 xxx」for eligible threshold promos. */
export function thresholdGiftSummaryLines(
  lines: readonly CartLine[],
  promotions: readonly Promotion[],
  template: (amountFormatted: string, giftName: string) => string,
): string[] {
  const basisCents = merchandiseFinalAfterAutoPromotionsCents(lines, promotions)
  const out: string[] = []

  for (const pr of promotions) {
    if (!pr.active || pr.kind !== 'GIFT_WITH_THRESHOLD' || !pr.gift) continue
    const g = pr.gift
    if (!g.isActive || g.stock < 1 || !g.product) continue
    const threshold = pr.thresholdAmountCents ?? 0
    if (threshold < 1 || basisCents < threshold) continue
    out.push(template(formatMoney(threshold), g.displayName))
  }

  return out
}
